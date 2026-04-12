import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { supabase } from '../config/supabase';
import TrackingPaymentDetails from '../components/TrackingPaymentDetails';
import DeliveryDestinationsSummary from '../components/DeliveryDestinationsSummary';
import TrackingDeliveryStops from '../components/TrackingDeliveryStops';
import InfoModal from '../components/InfoModal';
import CustomOrderQuoteBreakdown from '../components/CustomOrderQuoteBreakdown';
import CustomOrderQuotePaymentModal from '../components/CustomOrderQuotePaymentModal';
import { buildTimelineTimestampMap, formatTimelineTimestamp } from '../utils/timelineTimestamps';
import { formatCustomOrderV4Currency, getSelectedEstimateFromItem, isCustomOrderV4Item } from '../utils/customOrderV4';
import { summarizeCustomOrderQuoteBreakdown } from '../utils/customOrderQuoteBreakdown';
import {
    applyRequestItemCancellation,
    getCancellationItemDisplayLabel,
    normalizeCancellationItem,
    summarizeCancellationItems,
} from '../utils/orderCancellation';
import {
    areAllDeliveryStopsConfirmed,
    confirmDeliveryStop,
    hasStopConfirmationFlow,
} from '../utils/deliveryDestinations';
import {
    canRequestRefund,
    createRefundRequest,
    getRefundRequestForEntity,
    getRefundStatusLabel,
    isActiveRefundRequest,
    maskGcashNumber,
    requiresRefundReviewBeforeCancellation,
    submitRefundGcashDetails,
} from '../utils/refundWorkflows';
import {
    createAdditionalReceiptEntry,
    normalizeGcashReferenceNumber,
    writeWithOptionalColumns,
} from '../utils/gcashPayments';
import '../styles/Shop.css';

// Timeline steps for Delivery Requests
const requestDeliverySteps = [
    { id: 1, status: 'pending', title: 'Request Submitted', description: 'Your booking request has been received', icon: 'fa-clipboard-check' },
    { id: 2, status: 'quoted', title: 'Quote Provided', description: 'We have provided a quote for your request', icon: 'fa-file-invoice-dollar' },
    { id: 3, status: 'accepted', title: 'Quote Paid and Accepted', description: 'You have paid and accepted the quote, and processing has begun', icon: 'fa-check-circle' },
    { id: 4, status: 'processing', title: 'Processing', description: 'Our florists are preparing your request', icon: 'fa-seedling' },
    { id: 5, status: 'ready_for_delivery', title: 'Ready for Delivery', description: 'Your request is ready to be shipped', icon: 'fa-box' },
    { id: 6, status: 'out_for_delivery', title: 'Out for Delivery', description: 'Your request is on its way', icon: 'fa-truck' },
    { id: 7, status: 'completed', title: 'Delivered', description: 'Your request has been delivered successfully', icon: 'fa-check-circle' },
];

// Timeline steps for Pickup Requests
const requestPickupSteps = [
    { id: 1, status: 'pending', title: 'Request Submitted', description: 'Your booking request has been received', icon: 'fa-clipboard-check' },
    { id: 2, status: 'quoted', title: 'Quote Provided', description: 'We have provided a quote for your request', icon: 'fa-file-invoice-dollar' },
    { id: 3, status: 'accepted', title: 'Quote Paid and Accepted', description: 'You have paid and accepted the quote, and processing has begun', icon: 'fa-check-circle' },
    { id: 4, status: 'processing', title: 'Processing', description: 'Our florists are preparing your request', icon: 'fa-seedling' },
    { id: 5, status: 'ready_for_pickup', title: 'Ready for Pickup', description: 'Your request is ready for pickup', icon: 'fa-store' },
    { id: 6, status: 'completed', title: 'Picked up', description: 'Your request has been picked up', icon: 'fa-check-circle' },
];

const getBookingItems = (requestData = {}) => {
    if (!requestData || typeof requestData !== 'object') {
        return [];
    }

    const items = Array.isArray(requestData.items) && requestData.items.length
        ? requestData.items
        : [requestData];

    return summarizeCancellationItems(
        items.filter((item) => item && typeof item === 'object' && Object.keys(item).length),
    ).items;
};

const normalizeFreeTextList = (value) => {
    if (!value || typeof value !== 'string') return [];
    return value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
};

const normalizeFlowerNames = (value, otherFlowersText = '') => {
    if (!value) return [];

    const otherFlowerNames = normalizeFreeTextList(otherFlowersText);
    const finalNames = [];

    const pushName = (name) => {
        const trimmed = String(name || '').trim();
        if (!trimmed) return;

        if (/^others?$/i.test(trimmed) && otherFlowerNames.length > 0) {
            otherFlowerNames.forEach((entry) => {
                if (!finalNames.includes(entry)) finalNames.push(entry);
            });
            return;
        }

        const cleanedName = trimmed.replace(/\s*\([^)]*\)\s*$/, '').trim();
        if (cleanedName && !finalNames.includes(cleanedName)) {
            finalNames.push(cleanedName);
        }
    };

    if (Array.isArray(value)) {
        value.forEach((entry) => {
            if (!entry) return;
            if (typeof entry === 'string') {
                pushName(entry);
            } else {
                pushName(entry.label || entry.name || entry.value || '');
            }
        });
        return finalNames;
    }

    if (typeof value === 'string') {
        value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .forEach(pushName);
        return finalNames;
    }

    return finalNames;
};

const getBookingPreferredFlowerNames = (item = {}) => normalizeFlowerNames(
    item.customerPreferredFlowers
    ?? item.customer_preferred_flowers
    ?? item.preferredFlowers
    ?? item.preferred_flowers
    ?? item.requestedFlowers
    ?? item.requested_flowers
    ?? item.selectedFlowers
    ?? item.flowers
    ?? null,
    item.otherFlowersText || item.other_flowers_text || ''
);

const getArrangementSelectionPreferredFlowerNames = (selection = {}, fallbackOtherFlowersText = '') => normalizeFlowerNames(
    selection.preferredFlowers
    ?? selection.preferred_flowers
    ?? selection.customerPreferredFlowers
    ?? selection.customer_preferred_flowers
    ?? selection.selectedFlowers
    ?? selection.flowers
    ?? null,
    selection.otherFlowersText || selection.other_flowers_text || fallbackOtherFlowersText || ''
);

const formatBookingArrangement = (item = {}) => {
    const unitLabel = String(item?.unit_label || item?.unitLabel || '').trim();
    if (unitLabel && String(item?.name || '').trim()) {
        return String(item.name).trim();
    }

    const arrangementSelections = Array.isArray(item.arrangementSelections) ? item.arrangementSelections : [];
    if (arrangementSelections.length) {
        return arrangementSelections
            .map((selection) => {
                const label = selection?.arrangement_label || selection?.arrangementLabel || selection?.arrangement_type || selection?.arrangementType;
                const quantity = Number(selection?.quantity || selection?.arrangement_quantity || 1);
                if (!label) return null;
                return quantity > 1 ? `${label} x${quantity}` : label;
            })
            .filter(Boolean)
            .join(', ');
    }

    if (item.arrangementType === 'Other') {
        return item.otherArrangementType || null;
    }

    return item.arrangementSummary || item.arrangementType || (Array.isArray(item.arrangementTypes) ? item.arrangementTypes.join(', ') : null);
};

const formatBookingFlowers = (item = {}) => {
    const arrangementSelections = Array.isArray(item.arrangementSelections) ? item.arrangementSelections : [];
    if (arrangementSelections.length) {
        const perArrangementFlowers = arrangementSelections
            .map((selection) => {
                const names = getArrangementSelectionPreferredFlowerNames(
                    selection,
                    item.otherFlowersText || item.other_flowers_text || ''
                );
                const label = selection?.arrangement_label || selection?.arrangementLabel || selection?.arrangement_type || selection?.arrangementType;
                if (!label || !names.length) return null;
                return `${label}: ${names.join(', ')}`;
            })
            .filter(Boolean);

        if (perArrangementFlowers.length) {
            return perArrangementFlowers.join(' | ');
        }
    }

    return getBookingPreferredFlowerNames(item).join(', ');
};

const formatBookingColors = (item = {}) => {
    const arrangementSelections = Array.isArray(item.arrangementSelections) ? item.arrangementSelections : [];
    if (arrangementSelections.length) {
        const perArrangementColors = arrangementSelections
            .map((selection) => {
                const label = selection?.arrangement_label || selection?.arrangementLabel || selection?.arrangement_type || selection?.arrangementType;
                const colorValue = selection?.colorPreference || selection?.color_preference || selection?.rawColorPreference || selection?.raw_color_preference;
                if (!label || !colorValue) return null;
                return `${label}: ${colorValue}`;
            })
            .filter(Boolean);

        if (perArrangementColors.length) {
            return perArrangementColors.join(' | ');
        }
    }

    return item.colorPreference === 'Others' ? item.otherColorPreference : item.colorPreference;
};

const formatBookingEventTime = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';

    const timeMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!timeMatch) {
        return trimmed;
    }

    let hours = Number(timeMatch[1]);
    const minutes = timeMatch[2];
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;

    return `${hours}:${minutes} ${period}`;
};

const roundCurrency = (value) => Math.round((Number.parseFloat(String(value ?? 0)) || 0) * 100) / 100;

const parseJsonObject = (value) => {
    if (!value) return {};
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch (error) {
            return {};
        }
    }
    return typeof value === 'object' ? value : {};
};

const buildStatusTimestamps = (existingValue, status, reason = '') => {
    const next = {
        ...parseJsonObject(existingValue),
        [status]: new Date().toISOString(),
    };

    if (status === 'cancelled' && reason) {
        next.cancellation_reason = reason;
        next.cancel_reason = reason;
    }

    return next;
};

const buildBookingOverview = (requestData = {}) => {
    const items = getBookingItems(requestData);
    const uniqueValues = (values = []) => Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));

    return {
        items,
        itemCount: items.reduce((sum, item) => sum + (item.remainingQuantity || item.quantity || item.qty || 0), 0),
        occasionText: uniqueValues(requestData.combined_occasions || items.map((item) => item.occasion)).join(', '),
        eventDateText: uniqueValues(requestData.combined_dates || items.map((item) => item.eventDate || item.event_date)).join(', '),
        eventTimeText: uniqueValues(items.map((item) => formatBookingEventTime(item.eventTime || item.event_time))).join(', '),
        recipientText: uniqueValues(items.map((item) => item.recipientName || item.recipient_name)).join(', '),
        venueText: uniqueValues(items.map((item) => item.venue || item.deliveryAddress)).join(', '),
    };
};

const OrderBookingTracking = () => {
    const navigate = useNavigate();
    const { requestNumber } = useParams();
    const [request, setRequest] = useState(null);
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(true);
    const [additionalFile, setAdditionalFile] = useState(null);
    const [uploadReferenceNumber, setUploadReferenceNumber] = useState('');
    const [uploadingReceipt, setUploadingReceipt] = useState(false);
    const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '' });
    const [quotePaymentRequest, setQuotePaymentRequest] = useState(null);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelTargetItemKey, setCancelTargetItemKey] = useState('');
    const [cancelQuantity, setCancelQuantity] = useState(1);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelReasonError, setCancelReasonError] = useState('');
    const [refundRequest, setRefundRequest] = useState(null);
    const [refundReason, setRefundReason] = useState('');
    const [submittingRefundRequest, setSubmittingRefundRequest] = useState(false);
    const [gcashName, setGcashName] = useState('');
    const [gcashNumber, setGcashNumber] = useState('');
    const [submittingRefundDetails, setSubmittingRefundDetails] = useState(false);
    const [feedbackMessage, setFeedbackMessage] = useState('');
    const [submittingFeedback, setSubmittingFeedback] = useState(false);
    const [confirmingStopKey, setConfirmingStopKey] = useState(null);

    const loadRequest = async (showLoader = true) => {
        if (!requestNumber) {
            setLoading(false);
            return;
        }

        if (showLoader) {
            setLoading(true);
        }

        const { data: foundRequest, error: dbError } = await supabase
            .from('requests')
            .select('*')
            .eq('request_number', requestNumber)
            .single();

        if (dbError || !foundRequest) {
            console.error('Error fetching request:', dbError);
            setRequest(null);
            setLoading(false);
            return;
        }

        let normalizedRequestData = foundRequest.data;
        if (typeof normalizedRequestData === 'string') {
            try {
                normalizedRequestData = JSON.parse(normalizedRequestData);
            } catch {
                normalizedRequestData = {};
            }
        }

        let finalAddress = null;
        if (normalizedRequestData?.address_id) {
            const { data: foundAddress, error: addressError } = await supabase
                .from('addresses')
                .select('*')
                .eq('id', normalizedRequestData.address_id)
                .single();

            if (addressError) {
                console.error('Error fetching address:', addressError);
            } else {
                finalAddress = foundAddress;
            }
        }

        let riderDetails = null;
        if (foundRequest.assigned_rider && ['processing', 'ready_for_delivery', 'out_for_delivery', 'completed', 'claimed'].includes(foundRequest.status)) {
            const { data: rider, error: riderError } = await supabase
                .from('users')
                .select('name, phone')
                .eq('id', foundRequest.assigned_rider)
                .single();
            if (riderError) {
                console.error('Error fetching rider for request:', riderError);
            } else {
                riderDetails = rider;
            }
        } else if (foundRequest.third_party_rider_name) {
            riderDetails = {
                name: foundRequest.third_party_rider_name,
                phone: foundRequest.third_party_rider_info || null,
            };
        }

        const bookingItems = getBookingItems(normalizedRequestData);
        const bookingSummary = summarizeCancellationItems(bookingItems);
        const primaryBookingItem = bookingItems[0] || null;
        const quoteBreakdown = normalizedRequestData?.quote_breakdown || null;
        const quoteSummary = quoteBreakdown
            ? summarizeCustomOrderQuoteBreakdown(quoteBreakdown, foundRequest.shipping_fee || normalizedRequestData?.shipping_fee || 0)
            : null;
        const nextShippingFee = bookingSummary.allCancelled
            ? 0
            : (
                quoteSummary
                    ? Number(quoteSummary.shipping || 0)
                    : Number(foundRequest.shipping_fee || normalizedRequestData?.shipping_fee || 0)
            );
        const nextFinalPrice = quoteSummary
            ? roundCurrency(quoteSummary.total)
            : (
                Number(foundRequest.final_price || 0) > 0
                    ? Number(foundRequest.final_price || 0)
                    : (
                        bookingSummary.hasItems
                            ? (bookingSummary.allCancelled ? 0 : roundCurrency(bookingSummary.remainingSubtotal + nextShippingFee))
                            : Number(foundRequest.final_price || 0)
                    )
            );

        const transformedRequest = {
            ...foundRequest,
            rider: riderDetails,
            date: foundRequest.created_at,
            deliveryMethod: foundRequest.delivery_method,
            pickupTime: foundRequest.pickup_time,
            address: finalAddress,
            type: foundRequest.type,
            requestData: {
                ...(normalizedRequestData && typeof normalizedRequestData === 'object' ? normalizedRequestData : {}),
                items: bookingItems,
            },
            imageUrl: foundRequest.image_url || primaryBookingItem?.image_url || null,
            finalPrice: nextFinalPrice,
            shipping_fee: nextShippingFee,
            status: bookingSummary.allCancelled ? 'cancelled' : foundRequest.status,
            gcash_reference_number: foundRequest.gcash_reference_number || normalizedRequestData?.gcash_reference_number || null,
        };
        setRequest(transformedRequest);

        try {
            const existingRefund = await getRefundRequestForEntity({
                entityType: 'request',
                entityId: foundRequest.id,
            });
            setRefundRequest(existingRefund);
            setGcashName(existingRefund?.gcash_name || '');
            setGcashNumber(existingRefund?.gcash_number || '');
        } catch (refundError) {
            console.error('Error fetching refund request:', refundError);
            setRefundRequest(null);
        }

        const steps = transformedRequest.deliveryMethod === 'pickup' ? requestPickupSteps : requestDeliverySteps;
        const finalRequestStatuses = ['completed', 'claimed', 'declined', 'cancelled'];

        if (finalRequestStatuses.includes(transformedRequest.status)) {
            if (transformedRequest.status === 'completed' || transformedRequest.status === 'claimed') {
                setCurrentStep(steps.length + 1);
            } else {
                setCurrentStep(-1);
            }
        } else {
            const statusMap = {
                pending: 'pending',
                quoted: 'quoted',
                accepted: 'processing',
                processing: 'processing',
                ready_for_delivery: 'ready_for_delivery',
                out_for_delivery: 'out_for_delivery',
                ready_for_pickup: 'ready_for_pickup',
            };

            const currentTimelineStatus = statusMap[transformedRequest.status] || 'pending';
            let stepIndex = steps.findIndex((step) => step.status === currentTimelineStatus);

            if (stepIndex === -1) {
                stepIndex = 0;
            }

            setCurrentStep(stepIndex + 1);
        }

        setLoading(false);
    };

    useEffect(() => {
        loadRequest();

        const channel = supabase
            .channel(`requests:${requestNumber}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'requests',
                },
                (payload) => {
                    if (payload.new && payload.new.request_number === requestNumber) {
                        loadRequest(false);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [requestNumber]);

    useEffect(() => {
        if (!request?.id) {
            return undefined;
        }

        const refundChannel = supabase
            .channel(`refund_requests:request:${request.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'refund_requests',
                    filter: `request_id=eq.${request.id}`,
                },
                async () => {
                    try {
                        const latestRefund = await getRefundRequestForEntity({
                            entityType: 'request',
                            entityId: request.id,
                        });
                        setRefundRequest(latestRefund);
                        setGcashName(latestRefund?.gcash_name || '');
                        setGcashNumber(latestRefund?.gcash_number || '');
                    } catch (error) {
                        console.error('Error refreshing refund request:', error);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(refundChannel);
        };
    }, [request?.id]);

    const handleUploadReceipt = async () => {
        const normalizedReference = normalizeGcashReferenceNumber(uploadReferenceNumber);
        if (!additionalFile || !request) return;
        if (!normalizedReference) {
            setInfoModal({ show: true, title: 'Transaction Number Required', message: 'Please enter the GCash transaction number before uploading your receipt.' });
            return;
        }

        setUploadingReceipt(true);
        try {
            const fileExt = additionalFile.name.split('.').pop();
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `additional/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('receipts')
                .upload(filePath, additionalFile);

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('receipts')
                .getPublicUrl(filePath);

            if (!urlData.publicUrl) throw new Error('Failed to get public URL');

            let updatePayload = {};
            if (!request.receipt_url) {
                const nextRequestData = {
                    ...(request.requestData || {}),
                    payment_status: 'waiting_for_confirmation',
                    receipt_url: urlData.publicUrl,
                    gcash_reference_number: normalizedReference,
                };
                updatePayload = {
                    receipt_url: urlData.publicUrl,
                    gcash_reference_number: normalizedReference,
                    payment_status: 'waiting_for_confirmation',
                    data: nextRequestData,
                };
            } else {
                const newReceipt = createAdditionalReceiptEntry({
                    url: urlData.publicUrl,
                    referenceNumber: normalizedReference,
                });
                const currentReceipts = request.additional_receipts || [];
                const nextRequestData = {
                    ...(request.requestData || {}),
                    additional_receipts: [...currentReceipts, newReceipt],
                    payment_status: 'waiting_for_confirmation',
                };
                updatePayload = {
                    additional_receipts: [...currentReceipts, newReceipt],
                    payment_status: 'waiting_for_confirmation',
                    data: nextRequestData,
                };
            }

            const { error: updateError } = await writeWithOptionalColumns({
                tableName: 'requests',
                initialPayload: updatePayload,
                optionalColumns: ['gcash_reference_number'],
                execute: (payload) => (
                    supabase
                        .from('requests')
                        .update(payload)
                        .eq('id', request.id)
                ),
            });

            if (updateError) throw updateError;

            setInfoModal({ show: true, title: 'Success', message: 'Receipt uploaded successfully!' });
            setAdditionalFile(null);
            setUploadReferenceNumber('');
            await loadRequest(false);
        } catch (error) {
            console.error('Error uploading receipt:', error);
            setInfoModal({ show: true, title: 'Upload Failed', message: error.message || 'Failed to upload receipt. Please try again.' });
        } finally {
            setUploadingReceipt(false);
        }
    };

    const getTrackingSteps = () => {
        if (!request) return requestDeliverySteps;
        return request.deliveryMethod === 'pickup' ? requestPickupSteps : requestDeliverySteps;
    };

    const getTimelineDate = (stepId) => {
        if (!request) return '';
        const step = trackingSteps.find((s) => s.id === stepId);
        if (!step) return '';

        if (currentStep === -1) return 'N/A';
        if (stepId > currentStep) return 'Pending';

        const resolvedTimestamp = timelineTimestampMap[stepId] || request.date || request.updated_at;
        return formatTimelineTimestamp(resolvedTimestamp, 'en-PH');
    };

    const getExpectedResolutionDate = () => {
        if (!request) return '';
        const requestDate = new Date(request.date);
        const expectedDate = new Date(requestDate.getTime() + 48 * 60 * 60 * 1000); // 48 hours for resolution
        return expectedDate.toLocaleDateString('en-PH', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        });
    };

    const getCancellableItems = (currentRequest) => {
        const sourceItems = Array.isArray(currentRequest?.requestData?.items)
            ? currentRequest.requestData.items
            : [];

        return sourceItems
            .map((item, index) => normalizeCancellationItem(item, index))
            .filter((item) => item.remainingQuantity > 0);
    };

    const getPaidCancellationRefundAmount = (currentRequest) => {
        const requestData = parseJsonObject(currentRequest?.requestData || currentRequest?.data);
        const amountReceived = Number(currentRequest?.amount_received || requestData?.amount_received || 0);
        if (amountReceived > 0) {
            return amountReceived;
        }

        return Number(
            currentRequest?.final_price
            || currentRequest?.totalAmount
            || requestData?.final_price
            || requestData?.estimated_total
            || 0
        );
    };

    const shouldRouteCancellationToRefund = (currentRequest) => {
        const requestData = parseJsonObject(currentRequest?.requestData || currentRequest?.data);
        return requiresRefundReviewBeforeCancellation({
            paymentStatus: currentRequest?.payment_status || requestData?.payment_status,
            amountPaid: currentRequest?.amount_received || requestData?.amount_received || 0,
            fallbackAmount: getPaidCancellationRefundAmount(currentRequest),
            receiptUrl: currentRequest?.receipt_url || requestData?.receipt_url || '',
            additionalReceipts: currentRequest?.additional_receipts || requestData?.additional_receipts || [],
        });
    };

    const createCancellationRefundReview = async ({ selectedItem, quantityToCancel, reason }) => {
        if (!request?.id) {
            throw new Error('This request could not be found.');
        }

        const { data: sessionData } = await supabase.auth.getSession();
        const customerId = sessionData?.session?.user?.id || null;
        if (!customerId) {
            throw new Error('Please sign in again before requesting this cancellation.');
        }

        const existingRefund = await getRefundRequestForEntity({
            entityType: 'request',
            entityId: request.id,
        });
        if (isActiveRefundRequest(existingRefund)) {
            return { refundRequest: existingRefund, reused: true };
        }

        const itemLabel = getCancellationItemDisplayLabel(selectedItem);
        const detailedReason = [
            `Cancellation request for ${itemLabel}`,
            `Quantity: ${quantityToCancel}`,
            `Customer reason: ${reason}`,
        ].join('\n');

        const result = await createRefundRequest({
            entityType: 'request',
            entityId: request.id,
            customerId,
            reason: detailedReason,
            refundAmount: getPaidCancellationRefundAmount(request),
        });

        return {
            refundRequest: result?.refundRequest || null,
            reused: false,
        };
    };

    const closeCancelModal = () => {
        setShowCancelModal(false);
        setCancelTargetItemKey('');
        setCancelQuantity(1);
        setCancelReason('');
        setCancelReasonError('');
    };

    const handleCancelClick = () => {
        const cancellableItems = getCancellableItems(request);
        if (!cancellableItems.length) {
            return;
        }

        setCancelTargetItemKey(cancellableItems[0].cancellationKey || '');
        setCancelQuantity(1);
        setCancelReason('');
        setCancelReasonError('');
        setShowCancelModal(true);
    };

    const updateRequestCancellation = async (itemKey, quantityToCancel, reason) => {
        if (!request?.id) {
            throw new Error('This request could not be found.');
        }

        const { data: currentRequest, error: requestFetchError } = await supabase
            .from('requests')
            .select('*')
            .eq('id', request.id)
            .single();

        if (requestFetchError) {
            throw requestFetchError;
        }

        const requestData = parseJsonObject(currentRequest?.data);
        const requestItems = Array.isArray(requestData?.items) && requestData.items.length
            ? requestData.items
            : [requestData].filter((item) => item && typeof item === 'object' && Object.keys(item).length > 0);
        const normalizedItems = requestItems.map((item, index) => normalizeCancellationItem(item, index));
        const selectedItem = normalizedItems.find((item) => item.cancellationKey === String(itemKey));

        if (!selectedItem || selectedItem.remainingQuantity < quantityToCancel) {
            throw new Error('That quantity is no longer available to cancel.');
        }

        const updatedItems = requestItems.map((item, index) => {
            const normalizedItem = normalizedItems[index];
            return normalizedItem?.cancellationKey === String(itemKey)
                ? applyRequestItemCancellation(item, quantityToCancel, reason)
                : item;
        });

        const summary = summarizeCancellationItems(updatedItems);
        const nextShippingFee = summary.allCancelled ? 0 : Number(currentRequest.shipping_fee || requestData?.shipping_fee || 0);
        const nextSubtotal = summary.remainingSubtotal;
        const nextTotal = summary.allCancelled ? 0 : roundCurrency(nextSubtotal + nextShippingFee);
        const nextStatus = summary.allCancelled ? 'cancelled' : currentRequest.status;
        const nextItemCount = summary.remainingQuantityTotal || summary.activeItems.length;
        const nextCancellationReason = summary.allCancelled
            ? reason
            : (requestData?.cancellation_reason || currentRequest?.cancellation_reason || null);
        const nextData = {
            ...(requestData && typeof requestData === 'object' ? requestData : {}),
            items: updatedItems,
            item_count: nextItemCount,
            itemCount: nextItemCount,
            subtotal: nextSubtotal,
            shipping_fee: nextShippingFee,
            shippingFee: nextShippingFee,
            estimated_total: nextTotal,
            estimatedTotal: nextTotal,
            final_price: nextTotal,
            finalPrice: nextTotal,
            cancellation_reason: nextCancellationReason,
            last_cancellation: {
                item_key: String(itemKey),
                quantity: quantityToCancel,
                reason,
                cancelled_at: new Date().toISOString(),
            },
        };

        const updatePayload = {
            data: nextData,
            shipping_fee: nextShippingFee,
            status: nextStatus,
            status_timestamps: summary.allCancelled
                ? buildStatusTimestamps(currentRequest?.status_timestamps, 'cancelled', reason)
                : currentRequest?.status_timestamps,
            cancellation_reason: summary.allCancelled
                ? (reason || currentRequest?.cancellation_reason || null)
                : currentRequest?.cancellation_reason || null,
        };

        if (Object.prototype.hasOwnProperty.call(currentRequest || {}, 'final_price')) {
            updatePayload.final_price = nextTotal;
        }

        const { error: updateRequestError } = await supabase
            .from('requests')
            .update(updatePayload)
            .eq('id', request.id);

        if (updateRequestError) {
            throw updateRequestError;
        }

        const { data: linkedOrder, error: linkedOrderFetchError } = await supabase
            .from('orders')
            .select('id, status_timestamps, cancellation_reason')
            .eq('request_id', request.id)
            .maybeSingle();

        if (!linkedOrderFetchError && linkedOrder) {
            const { error: updateLinkedOrderError } = await supabase
                .from('orders')
                .update({
                    request_data: nextData,
                    subtotal: nextSubtotal,
                    shipping_fee: nextShippingFee,
                    total: nextTotal,
                    status: nextStatus,
                    cancellation_reason: summary.allCancelled
                        ? (reason || linkedOrder.cancellation_reason || null)
                        : linkedOrder.cancellation_reason || null,
                    status_timestamps: summary.allCancelled
                        ? buildStatusTimestamps(linkedOrder.status_timestamps, 'cancelled', reason)
                        : linkedOrder.status_timestamps,
                })
                .eq('id', linkedOrder.id);

            if (updateLinkedOrderError) {
                throw updateLinkedOrderError;
            }
        }
    };

    const handleConfirmCancel = async () => {
        const trimmedCancelReason = cancelReason.trim();
        if (!trimmedCancelReason) {
            setCancelReasonError('Please tell us why you want to cancel this item.');
            return;
        }

        const selectedItem = getCancellableItems(request).find(
            (item) => item.cancellationKey === String(cancelTargetItemKey),
        );

        if (!selectedItem) {
            setCancelReasonError('Please select the item you want to cancel.');
            return;
        }

        const quantityToCancel = Math.min(
            selectedItem.remainingQuantity,
            Math.max(1, Number.parseInt(String(cancelQuantity || 1), 10) || 1),
        );

        try {
            if (shouldRouteCancellationToRefund(request)) {
                const refundResult = await createCancellationRefundReview({
                    selectedItem,
                    quantityToCancel,
                    reason: trimmedCancelReason,
                });

                await loadRequest(false);
                closeCancelModal();
                setInfoModal({
                    show: true,
                    title: refundResult.reused ? 'Refund Review Already Pending' : 'Cancellation Request Submitted',
                    message: refundResult.reused
                        ? 'This paid request already has a refund review in progress. Please wait for the admin decision before cancelling again.'
                        : 'Because payment was already submitted or received, we sent your cancellation through refund review first. We will finalize the cancellation after that review is resolved.',
                });
                return;
            }

            await updateRequestCancellation(cancelTargetItemKey, quantityToCancel, trimmedCancelReason);
            await loadRequest(false);
            closeCancelModal();
            setInfoModal({
                show: true,
                title: 'Request Updated',
                message: 'The selected quantity was cancelled successfully.',
            });
        } catch (error) {
            console.error('Error cancelling request item:', error);
            setInfoModal({
                show: true,
                title: 'Error',
                message: error.message || 'Failed to cancel the selected quantity. Please try again.',
            });
        }
    };

    const handleAcceptQuote = () => {
        setQuotePaymentRequest(request);
    };

    const handleRequestAdjustment = () => {
        setInfoModal({
            show: true,
            title: 'Request Price Adjustment',
            message: `To request an adjustment for request #${request?.request_number}, please proceed to Messages to chat with our staff.`,
            linkTo: '/profile?menu=messages',
            linkText: 'Go to Messages',
        });
    };

    const handleQuotePaymentSuccess = async () => {
        await loadRequest(false);
        setInfoModal({
            show: true,
            title: 'Payment Submitted',
            message: 'Your payment is now being confirmed. Thank you!',
        });
    };

    const handleQuotePaymentError = (error) => {
        setInfoModal({
            show: true,
            title: 'Error',
            message: error?.message || 'There was an error submitting your payment. Please try again.',
        });
    };

    const handleSendFeedback = async (event) => {
        event.preventDefault();

        const trimmedMessage = feedbackMessage.trim();
        if (!trimmedMessage || !request?.id) {
            return;
        }

        setSubmittingFeedback(true);
        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw sessionError;

            const senderId = session?.user?.id;
            if (!senderId) {
                throw new Error('You must be logged in to send feedback.');
            }

            const { data: staffUsers, error: staffError } = await supabase
                .from('users')
                .select('id')
                .in('role', ['admin', 'employee'])
                .order('role', { ascending: true })
                .limit(1);

            if (staffError) throw staffError;

            const receiverId = staffUsers?.[0]?.id;
            if (!receiverId) {
                throw new Error('No admin or employee account is available to receive feedback right now.');
            }

            const requestLabel = request.request_number || request.id;
            const formattedMessage = `[Custom Order #${requestLabel}] ${trimmedMessage}`;

            const { error: insertError } = await supabase.from('messages').insert([{
                sender_id: senderId,
                receiver_id: receiverId,
                message: formattedMessage,
            }]);

            if (insertError) throw insertError;

            setFeedbackMessage('');
            setInfoModal({
                show: true,
                title: 'Feedback Sent',
                message: 'Your feedback was sent successfully. The admin can now see it in the Messages tab.',
            });
        } catch (error) {
            console.error('Error sending custom order feedback:', error);
            setInfoModal({
                show: true,
                title: 'Feedback Not Sent',
                message: error.message || 'We could not send your feedback right now. Please try again.',
            });
        } finally {
            setSubmittingFeedback(false);
        }
    };

    const getRequestTypeLabel = () => {
        if (!request) return '';
        const typeMap = {
            'booking': 'Custom Order',
            'special_order': 'Special Order',
      'customized': 'Customizer Studio',
        };
        return typeMap[request.type] || 'Request';
    };

    const handleRequestReceived = async () => {
        if (!request) return;

        const { error } = await supabase
            .from('requests')
            .update({ status: 'completed' })
            .eq('id', request.id);

        if (error) {
            console.error('Error updating request status:', error);
            setInfoModal({ show: true, title: 'Error', message: 'There was an error confirming your request. Please try again.' });
        } else {
            setInfoModal({ show: true, title: 'Request Confirmed', message: 'Thank you for confirming! Your request is now marked as completed.' });
        }
    };

    const handleConfirmDeliveryStop = async (stop) => {
        if (!request || !stop?.unit_key) {
            return;
        }

        setConfirmingStopKey(stop.unit_key);

        try {
            const confirmedAt = new Date().toISOString();
            const updatedDestinations = confirmDeliveryStop(
                request?.requestData?.multi_delivery_destinations || [],
                stop.unit_key,
                {
                    actorType: 'customer',
                    actorUserId: request.user_id || null,
                    confirmedAt,
                }
            );
            const allConfirmed = areAllDeliveryStopsConfirmed(updatedDestinations);
            const updatePayload = {
                data: {
                    ...(request.data || request.requestData || {}),
                    multi_delivery_destinations: updatedDestinations,
                },
            };

            if (allConfirmed) {
                updatePayload.status = 'completed';
                updatePayload.status_timestamps = {
                    ...(request.status_timestamps || {}),
                    completed: confirmedAt,
                };

                if (String(request.payment_method || '').trim().toLowerCase() === 'cod') {
                    updatePayload.payment_status = 'paid';
                }
            }

            const { error } = await supabase
                .from('requests')
                .update(updatePayload)
                .eq('id', request.id);

            if (error) {
                throw error;
            }

            await loadRequest(false);
            setInfoModal({
                show: true,
                title: allConfirmed ? 'Request Confirmed' : 'Delivery Stop Confirmed',
                message: allConfirmed
                    ? 'Thank you for confirming the final delivery stop. Your request is now completed.'
                    : 'This delivery stop was confirmed successfully.',
            });
        } catch (error) {
            console.error('Error confirming request delivery stop:', error);
            setInfoModal({
                show: true,
                title: 'Confirmation Failed',
                message: error.message || 'We could not confirm this delivery stop right now. Please try again.',
            });
        } finally {
            setConfirmingStopKey(null);
        }
    };

    const handleRequestRefund = async () => {
        if (!request) {
            setInfoModal({ show: true, title: 'Request Not Ready', message: 'This request is not ready for refund processing yet.' });
            return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) {
            setInfoModal({ show: true, title: 'Login Required', message: 'Please sign in to request a refund.' });
            return;
        }

        const trimmedReason = refundReason.trim();
        if (!trimmedReason) {
            setInfoModal({ show: true, title: 'Refund Reason Needed', message: 'Please tell us why you are requesting a refund.' });
            return;
        }

        setSubmittingRefundRequest(true);
        try {
            const result = await createRefundRequest({
                entityType: 'request',
                entityId: request.id,
                customerId: session.user.id,
                reason: trimmedReason,
                refundAmount: Number(request.amount_received || 0) > 0
                    ? Number(request.amount_received || 0)
                    : Number(request.finalPrice || 0),
            });

            setRefundRequest(result.refundRequest);
            setRefundReason('');
            setInfoModal({
                show: true,
                title: 'Refund Request Sent',
                message: 'Your refund request was submitted. An admin will review it before any GCash details are collected.',
            });
        } catch (error) {
            console.error('Error creating refund request:', error);
            setInfoModal({
                show: true,
                title: 'Refund Request Failed',
                message: error.message || 'We could not submit your refund request right now.',
            });
        } finally {
            setSubmittingRefundRequest(false);
        }
    };

    const handleSubmitRefundDetails = async () => {
        if (!refundRequest?.id) {
            return;
        }

        const trimmedName = gcashName.trim();
        const normalizedNumber = gcashNumber.replace(/\D/g, '');

        if (!trimmedName || normalizedNumber.length < 10) {
            setInfoModal({
                show: true,
                title: 'GCash Details Required',
                message: 'Please provide the GCash account name and a valid GCash number.',
            });
            return;
        }

        setSubmittingRefundDetails(true);
        try {
            const result = await submitRefundGcashDetails({
                refundId: refundRequest.id,
                gcashName: trimmedName,
                gcashNumber: normalizedNumber,
            });

            setRefundRequest(result.refundRequest);
            setInfoModal({
                show: true,
                title: 'GCash Details Sent',
                message: 'Your GCash details were submitted. A staff member can now process the refund.',
            });
        } catch (error) {
            console.error('Error submitting refund GCash details:', error);
            setInfoModal({
                show: true,
                title: 'Submission Failed',
                message: error.message || 'We could not submit your GCash details right now.',
            });
        } finally {
            setSubmittingRefundDetails(false);
        }
    };

    const trackingSteps = getTrackingSteps();
    const timelineTimestampMap = buildTimelineTimestampMap({
        steps: trackingSteps,
        currentStep,
        statusTimestamps: request?.status_timestamps || {},
        createdAt: request?.date,
        updatedAt: request?.updated_at
    });
    const cancellationReason = request?.cancellation_reason
        || request?.status_timestamps?.cancellation_reason
        || request?.status_timestamps?.cancel_reason
        || request?.requestData?.cancellation_reason
        || request?.requestData?.decline_feedback
        || request?.requestData?.declineFeedback
        || null;
    const isPickup = request?.deliveryMethod === 'pickup';
    const isFinalStep = currentStep >= trackingSteps.length && currentStep !== -1;
    const isDeclinedOrCancelled = currentStep === -1;
    const bookingOverview = useMemo(
        () => buildBookingOverview(request?.requestData || {}),
        [request]
    );
    const bookingDestinations = Array.isArray(request?.requestData?.multi_delivery_destinations)
        ? request.requestData.multi_delivery_destinations
        : [];
    const usesStopConfirmationFlow = hasStopConfirmationFlow(bookingDestinations);
    const canShowRefundRequest = Boolean(request) && canRequestRefund({
        paymentStatus: request?.payment_status,
        amountPaid: request?.amount_received,
        fallbackAmount: request?.finalPrice,
        refundRequest,
    }) && ['completed', 'cancelled'].includes(String(request?.status || '').toLowerCase());
    const showRefundGcashForm = String(refundRequest?.status || '').toLowerCase() === 'approved';
    const shouldShowFinalPrice = Boolean(request)
        && String(request?.status || '').toLowerCase() !== 'pending'
        && Number(request?.finalPrice || 0) > 0;
    const cancellableItems = getCancellableItems(request);
    const selectedCancelItem = cancellableItems.find((item) => item.cancellationKey === String(cancelTargetItemKey))
        || cancellableItems[0]
        || null;

    if (loading) {
        return (
            <div className="tracking-container">
                <div className="container text-center py-5">
                    <div className="spinner-border text-primary" role="status">
                        <span className="visually-hidden">Loading...</span>
                    </div>
                    <p className="mt-2">Finding your request...</p>
                </div>
            </div>
        );
    }
    if (!request) {
        return (
            <div className="tracking-container">
                <div className="container">
                    <div className="empty-state">
                        <div className="empty-state-icon">
                            <i className="fas fa-search"></i>
                        </div>
                        <h3>Request Not Found</h3>
                        <p>We couldn't find a request with number: {requestNumber}</p>
                        <Link to="/profile" className="btn-shop-now">View My Requests</Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="tracking-container">
            <div className="container">
                <nav aria-label="breadcrumb" className="mb-3">
                    <ol className="breadcrumb">
                        <li className="breadcrumb-item"><Link to="/">Home</Link></li>
                        <li className="breadcrumb-item"><Link to="/profile">My Requests</Link></li>
                        <li className="breadcrumb-item active">Track Request</li>
                    </ol>
                </nav>

                <div className="tracking-header">
                    <div className="tracking-order-info">
                        <div className="tracking-order-id">
                            <h2>Request #{request.request_number}</h2>
                            <div className="tracking-order-date">
                                Submitted on {new Date(request.date).toLocaleDateString('en-PH', {
                                    weekday: 'long',
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                })}
                            </div>
                            <span className="badge mt-2" style={{ background: 'rgba(255,255,255,0.2)', fontSize: '0.8rem' }}>
                                {getRequestTypeLabel()}
                            </span>
                        </div>
                        <div className="tracking-current-status">
                            {request.status === 'out_for_delivery' && !usesStopConfirmationFlow && (
                                <button
                                    style={{
                                        display: 'inline-block',
                                        padding: '8px 20px',
                                        backgroundColor: 'var(--shop-success)',
                                        color: 'white',
                                        borderRadius: '6px',
                                        fontWeight: '600',
                                        border: 'none',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                        marginBottom: '8px',
                                        marginRight: '0.5rem',
                                        transition: 'all 0.2s ease'
                                    }}
                                    onClick={handleRequestReceived}
                                    onMouseOver={(e) => {
                                        e.currentTarget.style.transform = 'scale(1.02)';
                                        e.currentTarget.style.opacity = '0.85';
                                    }}
                                    onMouseOut={(e) => {
                                        e.currentTarget.style.transform = 'scale(1)';
                                        e.currentTarget.style.opacity = '1';
                                    }}
                                >
                                    <i className="fas fa-check-circle me-2"></i>Order Received
                                </button>
                            )}

                            {isDeclinedOrCancelled ? (
                                <div className="current-status-badge" style={{ backgroundColor: '#f44336', color: '#fff' }}>
                                    Request {request.status === 'declined' ? 'Declined' : 'Cancelled'}
                                </div>
                            ) : (
                                <div
                                    className="current-status-badge"
                                >
                                    {trackingSteps[Math.min(currentStep, trackingSteps.length) - 1]?.title}
                                </div>
                            )}
                            <div className="expected-delivery">
                                {!isFinalStep && !isDeclinedOrCancelled && (
                                    request.status === 'quoted' ? `Please review quote by: ${getExpectedResolutionDate()}` :
                                        `Expected resolution by: ${getExpectedResolutionDate()}`
                                )}

                                {isDeclinedOrCancelled && (cancellationReason
                                    ? `${request.status === 'declined' ? 'Declined' : 'Cancelled'}: ${cancellationReason}`
                                    : (request.status === 'declined' ? 'Request not fulfilled.' : 'Request cancelled by user.'))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="row">
                    <div className="col-lg-8">
                        {/* Only show payment section once the price has been accepted by the customer */}
                        {!['pending', 'quoted'].includes(request.status) && (
                            <TrackingPaymentDetails
                                paymentMethod={request.payment_method || request.requestData?.payment_method || 'gcash'}
                                paymentStatus={request.payment_status}
                                totalAmount={request.finalPrice}
                                amountPaid={request.amount_received}
                                receiptUrl={request.receipt_url}
                                gcashReferenceNumber={request.gcash_reference_number}
                                additionalReceipts={request.additional_receipts}
                                onUploadReceipt={handleUploadReceipt}
                                uploadingReceipt={uploadingReceipt}
                                additionalFile={additionalFile}
                                setAdditionalFile={setAdditionalFile}
                                uploadReferenceNumber={uploadReferenceNumber}
                                setUploadReferenceNumber={setUploadReferenceNumber}
                                shippingFee={request.shipping_fee}
                            />
                        )}

                        {(refundRequest || canShowRefundRequest) && (
                            <div className="tracking-items p-4 rounded-4 shadow-sm bg-white mb-4">
                                <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
                                    <div>
                                        <h5 className="fw-bold mb-1">
                                            <i className="fas fa-rotate-left me-2" style={{ color: 'var(--shop-pink)' }}></i>
                                            Refund Request
                                        </h5>
                                        <p className="text-muted mb-0">
                                            Admin approval is required first. Once approved, you can submit your GCash details here for the refund.
                                        </p>
                                    </div>
                                    {refundRequest && (
                                        <span className="badge rounded-pill px-3 py-2" style={{ backgroundColor: '#FCE7F3', color: '#BE185D' }}>
                                            {getRefundStatusLabel(refundRequest.status)}
                                        </span>
                                    )}
                                </div>

                                {refundRequest ? (
                                    <>
                                        <div className="row g-3 mb-3">
                                            <div className="col-md-6">
                                                <div className="small text-muted">Requested Amount</div>
                                                <div className="fw-semibold">PHP {Number(refundRequest.refund_amount || 0).toLocaleString()}</div>
                                            </div>
                                            <div className="col-md-6">
                                                <div className="small text-muted">Reason</div>
                                                <div className="fw-semibold">{refundRequest.customer_reason}</div>
                                            </div>
                                            {refundRequest.admin_note && (
                                                <div className="col-12">
                                                    <div className="small text-muted">Admin Note</div>
                                                    <div className="fw-semibold">{refundRequest.admin_note}</div>
                                                </div>
                                            )}
                                            {refundRequest.rejection_reason && (
                                                <div className="col-12">
                                                    <div className="small text-muted">Decision</div>
                                                    <div className="text-danger fw-semibold">{refundRequest.rejection_reason}</div>
                                                </div>
                                            )}
                                            {(refundRequest.gcash_name || refundRequest.gcash_number) && (
                                                <>
                                                    <div className="col-md-6">
                                                        <div className="small text-muted">GCash Account Name</div>
                                                        <div className="fw-semibold">{refundRequest.gcash_name || 'Not submitted'}</div>
                                                    </div>
                                                    <div className="col-md-6">
                                                        <div className="small text-muted">GCash Number</div>
                                                        <div className="fw-semibold">{maskGcashNumber(refundRequest.gcash_number)}</div>
                                                    </div>
                                                </>
                                            )}
                                            {refundRequest.refund_reference && (
                                                <div className="col-12">
                                                    <div className="small text-muted">Refund Reference</div>
                                                    <div className="fw-semibold">{refundRequest.refund_reference}</div>
                                                </div>
                                            )}
                                        </div>

                                        {showRefundGcashForm && (
                                            <div className="border rounded-4 p-3" style={{ backgroundColor: '#FFF7FB', borderColor: '#FBCFE8' }}>
                                                <h6 className="fw-bold mb-2">Submit Your GCash Details</h6>
                                                <p className="text-muted small mb-3">
                                                    Your refund was approved. Submit the account details where you want the refund sent.
                                                </p>
                                                <div className="mb-3">
                                                    <label className="form-label">GCash Account Name</label>
                                                    <input
                                                        type="text"
                                                        className="form-control"
                                                        value={gcashName}
                                                        onChange={(event) => setGcashName(event.target.value)}
                                                        placeholder="Enter your full GCash account name"
                                                    />
                                                </div>
                                                <div className="mb-3">
                                                    <label className="form-label">GCash Number</label>
                                                    <input
                                                        type="tel"
                                                        className="form-control"
                                                        value={gcashNumber}
                                                        onChange={(event) => setGcashNumber(event.target.value)}
                                                        placeholder="09XXXXXXXXX"
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    className="btn"
                                                    style={{ background: 'var(--shop-pink)', color: '#fff' }}
                                                    onClick={handleSubmitRefundDetails}
                                                    disabled={submittingRefundDetails}
                                                >
                                                    {submittingRefundDetails ? 'Submitting...' : 'Submit GCash Details'}
                                                </button>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div>
                                        <div className="mb-3">
                                            <label className="form-label">Why are you requesting a refund?</label>
                                            <textarea
                                                className="form-control"
                                                rows="4"
                                                value={refundReason}
                                                onChange={(event) => setRefundReason(event.target.value)}
                                                placeholder="Tell us what happened so the admin can review your request."
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            className="btn"
                                            style={{ background: 'var(--shop-pink)', color: '#fff' }}
                                            onClick={handleRequestRefund}
                                            disabled={submittingRefundRequest}
                                        >
                                            {submittingRefundRequest ? 'Submitting...' : 'Request Refund'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="tracking-timeline">

                            <h5 className="fw-bold mb-4">
                                <i className="fas fa-route me-2" style={{ color: 'var(--shop-pink)' }}></i>
                                Request Timeline
                            </h5>

                            {request.status === 'pending' ? (
                                /* ── Waiting for admin to provide a price ── */
                                <div className="text-center py-4" style={{ background: '#fdf6ff', borderRadius: '12px', border: '2px dashed #e9b3f7', padding: '32px' }}>
                                    <i className="fas fa-clock-rotate-left fa-2x mb-3" style={{ color: 'var(--shop-pink)' }}></i>
                                    <h6 className="fw-bold mt-2">Awaiting Price Quote</h6>
                                    <p className="text-muted mb-0" style={{ fontSize: '0.9rem' }}>
                                        Our team is reviewing your request. We'll send you a price quote soon!<br />
                                        Once you receive it, you can accept and proceed with payment.
                                    </p>
                                </div>
                            ) : (
                                <div className="timeline">
                                    {trackingSteps.map((step) => (
                                        <div
                                            key={step.id}
                                            className={`timeline-item ${step.id < currentStep ? 'completed' :
                                                step.id === currentStep ? 'current' : ''
                                                }`}
                                        >
                                            <div className="timeline-marker">
                                                <i className={`fas ${step.icon}`}></i>
                                            </div>
                                            <div className="timeline-content">
                                                <h5>{step.title}</h5>
                                                <div className="timeline-info-container">
                                                    {step.description}
                                                    {step.status === 'accepted' && (request.payment_status === 'partial' || (request.payment_status !== 'paid' && request.amount_received > 0)) && request.finalPrice > 0 && (
                                                        <div className="mt-2 p-2 rounded shadow-sm border-start border-4 border-warning" style={{ backgroundColor: '#fffbeb', fontSize: '0.85rem' }}>
                                                            <div className="d-flex align-items-center text-warning-emphasis fw-bold mb-1">
                                                                <i className="fas fa-info-circle me-2"></i>
                                                                Partial Payment Received
                                                            </div>
                                                            <div className="d-flex justify-content-between">
                                                                <span>Paid:</span>
                                                                <span className="text-success">₱{(request.amount_received || 0).toLocaleString()}</span>
                                                            </div>
                                                            <div className="d-flex justify-content-between border-top mt-1 pt-1 fw-bold">
                                                                <span>Remaining Balance:</span>
                                                                <span className="text-danger">₱{((request.finalPrice || 0) - (request.amount_received || 0)).toLocaleString()}</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {step.status === 'out_for_delivery' && ['out_for_delivery', 'delivered', 'completed', 'claimed'].includes(request.status) && request.rider && (
                                                        <>
                                                            <br />
                                                            <span className="fw-bold">Rider:</span> {request.rider.name}
                                                            {request.rider.phone && ` (${request.rider.phone})`}
                                                        </>
                                                    )}
                                                </div>
                                                <div className="timeline-date">{getTimelineDate(step.id)}</div>
                                            </div>
                                        </div>
                                    ))}
                                    {isDeclinedOrCancelled && (
                                        <div
                                            className="timeline-item current"
                                        >
                                            <div className="timeline-marker" style={{ backgroundColor: '#f44336', borderColor: '#f44336', color: '#fff' }}>
                                                <i className="fas fa-times-circle"></i>
                                            </div>
                                            <div className="timeline-content">
                                                <h5>Request {request.status === 'declined' ? 'Declined' : 'Cancelled'}</h5>
                                                <p>{request.status === 'declined' ? 'Your request could not be fulfilled.' : 'You have cancelled this request.'}</p>
                                                <p className="mb-1"><strong>Reason:</strong> {cancellationReason || (request.status === 'cancelled' ? 'No cancellation reason provided.' : 'No decline feedback provided.')}</p>
                                                <div className="timeline-date">{new Date(request.date).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="delivery-details">
                            <h5 className="fw-bold mb-4">
                                <i className={`fas ${isPickup ? 'fa-store' : 'fa-map-marker-alt'} me-2`} style={{ color: 'var(--shop-pink)' }}></i>
                                {isPickup ? 'Pickup Details' : 'Delivery Details'}
                            </h5>

                            {isPickup ? (
                                <>
                                    <div className="delivery-info-row">
                                        <div className="delivery-label">Pickup Location</div>
                                        <div className="delivery-value">Jocerry's Flower Shop, 63 San Jose Road, Zamboanga City</div>
                                    </div>
                                    {request.pickupTime && (
                                        <div className="delivery-info-row">
                                            <div className="delivery-label">Pickup Time</div>
                                            <div className="delivery-value">{request.pickupTime}</div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <div className="delivery-info-row">
                                        <div className="delivery-label">Occasion</div>
                                        <div className="delivery-value">{bookingOverview.occasionText || request.requestData?.occasion || 'N/A'}</div>
                                    </div>
                                    {bookingOverview.itemCount > 1 && (
                                        <div className="delivery-info-row">
                                            <div className="delivery-label">Custom Order Items</div>
                                            <div className="delivery-value">{bookingOverview.itemCount}</div>
                                        </div>
                                    )}
                                    {bookingOverview.eventDateText && (
                                        <div className="delivery-info-row">
                                            <div className="delivery-label">Event Date</div>
                                            <div className="delivery-value">{bookingOverview.eventDateText}</div>
                                        </div>
                                    )}
                                    {bookingOverview.eventTimeText && (
                                        <div className="delivery-info-row">
                                            <div className="delivery-label">Preferred Time</div>
                                            <div className="delivery-value">{bookingOverview.eventTimeText}</div>
                                        </div>
                                    )}
                                    {bookingOverview.venueText && (
                                        <div className="delivery-info-row">
                                            <div className="delivery-label">Venue</div>
                                            <div className="delivery-value">{bookingOverview.venueText}</div>
                                        </div>
                                    )}
                                    {usesStopConfirmationFlow ? (
                                        <div className="mt-4">
                                            <TrackingDeliveryStops
                                                destinations={bookingDestinations}
                                                title="Delivery Stop Status"
                                                fallbackRider={request.rider}
                                                confirmingUnitKey={confirmingStopKey}
                                                onConfirmStop={handleConfirmDeliveryStop}
                                            />
                                        </div>
                                    ) : bookingDestinations.length > 0 && (
                                        <div className="mt-4">
                                            <DeliveryDestinationsSummary destinations={bookingDestinations} title="Assigned Delivery Stops" fallbackRider={request.rider} />
                                        </div>
                                    )}
                                    <div className="delivery-info-row">
                                        <div className="delivery-label">Recipient</div>
                                        <div className="delivery-value">{request.address?.name || bookingOverview.recipientText || request.requestData?.recipient_name || request.requestData?.fullName}</div>
                                    </div>
                                    <div className="delivery-info-row">
                                        <div className="delivery-label">Phone</div>
                                        <div className="delivery-value">{request.contact_number || request.requestData?.contactNumber || request.requestData?.contact_number || 'N/A'}</div>
                                    </div>
                                    <div className="delivery-info-row">
                                        <div className="delivery-label">Address</div>
                                        <div className="delivery-value">
                                            {request.address ?
                                                `${request.address.street}, ${request.address.barangay}, ${request.address.city}, ${request.address.province}` :
                                                (request.requestData?.deliveryAddress || request.requestData?.venue || 'N/A')
                                            }
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                    </div>


                    <div className="col-lg-4">
                        <div className="tracking-items p-4 rounded-4 shadow-sm bg-white">
                            <h5 className="fw-bold mb-4 pb-3 border-bottom d-flex align-items-center">
                                <i className="fas fa-info-circle fs-5 me-2" style={{ color: 'var(--shop-pink)' }}></i>
                                Request Details
                            </h5>

                            <div className="d-flex align-items-center mb-4">
                                {request.imageUrl && (
                                    <img
                                        src={request.imageUrl}
                                        alt={getRequestTypeLabel()}
                                        className="rounded-3 shadow-sm me-3"
                                        style={{ width: '56px', height: '56px', objectFit: 'cover' }}
                                    />
                                )}
                                <div>
                                    <div className="text-muted small text-uppercase fw-bold letter-spacing-1 mb-1">Type</div>
                                    <h6 className="mb-0 fw-bold fs-5">{getRequestTypeLabel()}</h6>
                                </div>
                            </div>

                            <div className="d-flex flex-column gap-3 mb-4">
                                {request.type === 'booking' && (() => {
                                    let reqData = request.requestData || {};
                                    if (typeof reqData === 'string') {
                                        try { reqData = JSON.parse(reqData); } catch { reqData = {}; }
                                    }
                                    const items = getBookingItems(reqData);

                                    return (
                                        <>
                                            {items.length > 1 && <div className="d-flex flex-column"><span className="text-muted small fw-medium">Custom Order Items</span><span className="fw-bold text-dark">{items.length}</span></div>}
                                            {request.delivery_method === 'pickup' && <div className="d-flex flex-column"><span className="text-muted small fw-medium">Pickup Location</span><span className="fw-bold text-dark">Jocerry's Flower Shop, 63 San Jose Road, Zamboanga City</span></div>}
                                            {request.delivery_method === 'pickup' && request.pickupTime && <div className="d-flex flex-column"><span className="text-muted small fw-medium">Pickup Time</span><span className="fw-bold text-dark">{request.pickupTime}</span></div>}
                                            {items.map((item, index) => {
                                                const arrangement = formatBookingArrangement(item);
                                                const flowers = formatBookingFlowers(item);
                                                const colorTheme = formatBookingColors(item);
                                                const arrangementSelections = Array.isArray(item.arrangementSelections) ? item.arrangementSelections : [];
                                                const totalArrangementQuantity = item.arrangementQuantity || (
                                                    arrangementSelections.length
                                                        ? arrangementSelections.reduce((sum, selection) => sum + Number(selection?.quantity || 1), 0)
                                                        : null
                                                );
                                                const displayQuantity = item.remainingQuantity || totalArrangementQuantity || null;
                                                const selectedEstimate = getSelectedEstimateFromItem(item);

                                                return (
                                                    <div key={item.id || `booking-item-${index}`} className="p-3 rounded-3 border" style={{ background: '#f8f9fa', borderColor: '#f0d7e1' }}>
                                                        {items.length > 1 && (
                                                            <div className="text-muted small text-uppercase fw-bold mb-2">
                                                                Item {index + 1}
                                                            </div>
                                                        )}
                                                        {(item.recipientName || item.recipient_name) && <div className="d-flex flex-column mb-2"><span className="text-muted small fw-medium">Recipient</span><span className="fw-bold text-dark">{item.recipientName || item.recipient_name}</span></div>}
                                                        {item.occasion && <div className="d-flex flex-column mb-2"><span className="text-muted small fw-medium">Occasion</span><span className="fw-bold text-dark">{item.occasion === 'Other' ? item.otherOccasion : item.occasion}</span></div>}
                                                        {request.delivery_method !== 'pickup' && (item.eventDate || item.event_date) && <div className="d-flex flex-column mb-2"><span className="text-muted small fw-medium">Event Date</span><span className="fw-bold text-dark">{item.eventDate || item.event_date}</span></div>}
                                                        {request.delivery_method !== 'pickup' && (item.eventTime || item.event_time) && <div className="d-flex flex-column mb-2"><span className="text-muted small fw-medium">Event Time</span><span className="fw-bold text-dark">{formatBookingEventTime(item.eventTime || item.event_time)}</span></div>}
                                                        {request.delivery_method !== 'pickup' && (item.venue || item.deliveryAddress || item.delivery_address) && <div className="d-flex flex-column mb-2"><span className="text-muted small fw-medium">Venue</span><span className="fw-bold text-dark">{item.venue || item.deliveryAddress || item.delivery_address}</span></div>}
                                                        {arrangement && <div className="d-flex flex-column mb-2"><span className="text-muted small fw-medium">Arrangement</span><span className="fw-bold text-dark">{arrangement}</span></div>}
                                                        {totalArrangementQuantity && (
                                                            <div className="d-flex flex-column mb-2">
                                                                <span className="text-muted small fw-medium">Quantity</span>
                                                                <span className="fw-bold text-dark">
                                                                    {item.remainingQuantity > 0 ? displayQuantity : 'Cancelled'}
                                                                </span>
                                                                {item.cancelledQuantity > 0 && (
                                                                    <span className="text-danger small">Cancelled: {item.cancelledQuantity}</span>
                                                                )}
                                                            </div>
                                                        )}
                                                        {flowers && <div className="d-flex flex-column mb-2"><span className="text-muted small fw-medium">Preferred Flowers</span><span className="fw-bold text-dark">{flowers}</span></div>}
                                                        {isCustomOrderV4Item(item) && (
                                                            <>
                                                                <div className="d-flex flex-column mb-2"><span className="text-muted small fw-medium">Original Target Price</span><span className="fw-bold text-dark">{formatCustomOrderV4Currency(item.originalEstimatedPrice || 0)}</span></div>
                                                                <div className="d-flex flex-column mb-2"><span className="text-muted small fw-medium">Customer Budget</span><span className="fw-bold text-dark">{formatCustomOrderV4Currency(item.customerBudget || 0)}</span></div>
                                                                <div className="d-flex flex-column mb-2"><span className="text-muted small fw-medium">Preferred Version</span><span className="fw-bold text-dark">{item.selectedOptionLabel || 'Original target design'}</span></div>
                                                                <div className="d-flex flex-column mb-2"><span className="text-muted small fw-medium">Rough Estimate</span><span className="fw-bold text-dark">{formatCustomOrderV4Currency(selectedEstimate?.estimatedPrice || item.estimatedPrice || 0)}</span></div>
                                                                {Array.isArray(item.suggestedAlternatives) && item.suggestedAlternatives.length > 0 && (
                                                                    <div className="d-flex flex-column mb-2">
                                                                        <span className="text-muted small fw-medium">What Changed From the Original</span>
                                                                        <div className="text-dark bg-white p-3 rounded-3 mt-1 fs-6">
                                                                            <ul className="mb-0 ps-3">
                                                                                {(item.suggestedAlternatives.find((alternative) => alternative.id === item.selectedAlternativeId)?.changes || []).map((change) => (
                                                                                    <li key={change.key}>{change.explanation}</li>
                                                                                ))}
                                                                            </ul>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                        {colorTheme && <div className="d-flex flex-column mb-2"><span className="text-muted small fw-medium">Color Theme</span><span className="fw-bold text-dark">{colorTheme}</span></div>}
                                                        {item.specialInstructions && <div className="d-flex flex-column mt-2"><span className="text-muted small fw-medium">Special Instructions</span><span className="text-dark bg-white p-3 rounded-3 mt-1 fs-6">{item.specialInstructions}</span></div>}
                                                    </div>
                                                );
                                            })}
                                            {!items.some((item) => item?.specialInstructions) && request.notes && (
                                                <div className="d-flex flex-column mt-2">
                                                    <span className="text-muted small fw-medium">Special Instructions</span>
                                                    <span className="text-dark bg-light p-3 rounded-3 mt-1 fs-6">{request.notes}</span>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                                {request.type === 'special_order' && (
                                    <>
                                        <div className="d-flex flex-column"><span className="text-muted small fw-medium">Recipient</span><span className="fw-bold text-dark">{request.requestData?.recipient_name}</span></div>
                                        <div className="d-flex flex-column"><span className="text-muted small fw-medium">Occasion</span><span className="fw-bold text-dark">{request.requestData?.occasion}</span></div>
                                        {request.requestData?.contact_number && <div className="d-flex flex-column"><span className="text-muted small fw-medium">Contact Number</span><span className="fw-bold text-dark">{request.requestData?.contact_number}</span></div>}
                                        {request.requestData?.deliveryAddress && <div className="d-flex flex-column"><span className="text-muted small fw-medium">Delivery Address</span><span className="fw-bold text-dark">{request.requestData?.deliveryAddress}</span></div>}
                                        {request.requestData?.notes && <div className="d-flex flex-column"><span className="text-muted small fw-medium">Preferences</span><span className="fw-bold text-dark">{request.requestData.notes}</span></div>}
                                        {request.requestData?.addon && request.requestData.addon !== 'None' && <div className="d-flex flex-column"><span className="text-muted small fw-medium">Add-on</span><span className="fw-bold text-dark">{request.requestData.addon}</span></div>}
                                        {request.requestData?.message && <div className="d-flex flex-column"><span className="text-muted small fw-medium">Message</span><span className="fw-bold text-dark">{request.requestData.message}</span></div>}
                                        {request.notes && <div className="d-flex flex-column mt-2"><span className="text-muted small fw-medium">Additional Notes</span><span className="text-dark bg-light p-3 rounded-3 mt-1 fs-6">{request.notes}</span></div>}
                                    </>
                                )}
                                {request.type === 'customized' && (
                                    <>
                                        <div className="d-flex flex-column"><span className="text-muted small fw-medium">Flower</span><span className="fw-bold text-dark">{request.requestData?.flower}</span></div>
                                        <div className="d-flex flex-column"><span className="text-muted small fw-medium">Bundle Size</span><span className="fw-bold text-dark">{request.requestData?.bundleSize}</span></div>
                                        {request.notes && <div className="d-flex flex-column mt-2"><span className="text-muted small fw-medium">Notes</span><span className="text-dark bg-light p-3 rounded-3 mt-1 fs-6">{request.notes}</span></div>}
                                    </>
                                )}
                            </div>

                            {request.status === 'quoted' && request.requestData?.quote_breakdown && (() => {
                                const breakdown = request.requestData.quote_breakdown;
                                const { lineItems } = summarizeCustomOrderQuoteBreakdown(breakdown, request.shipping_fee);

                                return (
                                    <>
                                        <CustomOrderQuoteBreakdown
                                            breakdown={breakdown}
                                            shippingFee={request.shipping_fee}
                                            title={lineItems.length ? 'Quote Price Breakdown' : 'Quote Breakdown'}
                                            className="mt-2 mb-3"
                                        />
                                        {/*
                                        {lineItems.length > 0 ? lineItems.map((item) => (
                                            <div key={item.key} className="d-flex justify-content-between small mb-1">
                                                <span>
                                                    {item.label}
                                                    {item.showQuantity ? ` (${item.quantity} x ₱${item.unitPrice.toLocaleString()})` : ''}
                                                </span>
                                                <span className="fw-semibold">₱{item.total.toLocaleString()}</span>
                                            </div>
                                        )) : (
                                            <div className="small text-muted mb-1">No line-item breakdown available.</div>
                                        )}
                                        <div className="d-flex justify-content-between small border-top pt-2 mt-2">
                                            <span>Subtotal</span>
                                            <span className="fw-semibold">₱{subtotal.toLocaleString()}</span>
                                        </div>
                                        <div className="d-flex justify-content-between small">
                                        <span>Delivery Fee</span>
                                            <span className="fw-semibold">₱{shipping.toLocaleString()}</span>
                                        </div>
                                        <div className="d-flex justify-content-between fw-bold mt-1" style={{ color: 'var(--shop-pink)' }}>
                                            <span>Total</span>
                                            <span>₱{total.toLocaleString()}</span>
                                        </div>
                                    </div>
                                        */}
                                    </>
                                );
                            })()}

                            <div className="mt-4 pt-4 border-top">
                                <div className="d-flex justify-content-between align-items-center">
                                    <span className="text-muted fw-bold">Final Price</span>
                                    <span className="fs-5 fw-bold" style={{ color: 'var(--shop-pink)' }}>
                                        {shouldShowFinalPrice ? `₱${request.finalPrice.toLocaleString()}` : 'For Discussion'}
                                    </span>
                                </div>
                            </div>
                            {request.type === 'booking' && request.status === 'quoted' && (
                                <div className="mt-4 pt-4 border-top">
                                    <div className="d-flex flex-wrap gap-2">
                                        <button
                                            className="btn"
                                            style={{ background: 'var(--shop-pink)', color: 'white' }}
                                            onClick={handleAcceptQuote}
                                        >
                                            Accept & Pay
                                        </button>
                                        <button
                                            className="btn"
                                            style={{ background: 'transparent', color: 'var(--shop-pink)', border: '1px solid var(--shop-pink)' }}
                                            onClick={handleRequestAdjustment}
                                        >
                                            Request Adjustment
                                        </button>
                                        {cancellableItems.length > 0 && (
                                            <button
                                                className="btn"
                                                style={{ background: '#dc3545', color: 'white' }}
                                                onClick={handleCancelClick}
                                            >
                                                Cancel
                                            </button>
                                        )}
                                    </div>
                                    <div className="small text-muted mt-2">
                                        You can review, accept, adjust, or cancel your quoted request right here without leaving tracking.
                                    </div>
                                </div>
                            )}
                            <div className="mt-4 pt-4 border-top">
                                <div className="d-flex align-items-start gap-2 mb-2">
                                    <i className="fas fa-comment-dots mt-1" style={{ color: 'var(--shop-pink)' }}></i>
                                    <div>
                                        <h6 className="fw-bold mb-1">Send Feedback</h6>
                                        <p className="text-muted small mb-0">
                                            Share a note, concern, or appreciation about this custom order. It will be sent to the admin Messages conversation for your account.
                                        </p>
                                    </div>
                                </div>

                                <form onSubmit={handleSendFeedback}>
                                    <textarea
                                        className="form-control"
                                        rows="4"
                                        value={feedbackMessage}
                                        onChange={(event) => setFeedbackMessage(event.target.value)}
                                        placeholder="Tell us what you think about this custom order..."
                                    />
                                    <button
                                        type="submit"
                                        className="btn w-100 mt-3"
                                        style={{ background: 'var(--shop-pink)', color: 'white' }}
                                        disabled={submittingFeedback || !feedbackMessage.trim()}
                                    >
                                        {submittingFeedback ? 'Sending...' : 'Send Feedback'}
                                    </button>
                                </form>
                            </div>
                        </div>

                        <button
                            className="btn w-100 py-2 mt-3"
                            style={{ background: 'var(--shop-pink)', color: 'white' }}
                            onClick={() => navigate('/profile', { state: { activeMenu: 'orders' } })}
                        >
                            <i className="fas fa-clipboard-list me-2"></i>View My Order
                        </button>



                        <div className="mt-3">
                            <Link to="/profile" className="btn w-100 py-2" style={{ background: 'var(--shop-pink-light)', color: 'var(--shop-pink)' }}>
                                <i className="fas fa-arrow-left me-2"></i>Back to My Requests
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {showCancelModal && (
                <div
                    className="modal-overlay"
                    onClick={closeCancelModal}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 1000,
                    }}
                >
                    <div
                        className="modal-content-custom"
                        onClick={(event) => event.stopPropagation()}
                        style={{
                            backgroundColor: 'white',
                            padding: '2rem',
                            borderRadius: '1rem',
                            textAlign: 'center',
                            maxWidth: '400px',
                            width: '90%',
                            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                        }}
                    >
                        <div style={{ fontSize: '3rem', color: '#dc3545', marginBottom: '1rem' }}>
                            <i className="fas fa-exclamation-triangle"></i>
                        </div>
                        <h3 style={{ marginBottom: '1rem', color: '#333' }}>Cancel item from this request?</h3>
                        <p style={{ marginBottom: '1.5rem', color: '#4b5563' }}>
                            Choose the item and quantity you want to cancel. We will keep the rest of your request active.
                        </p>
                        <div style={{ marginBottom: '1rem', textAlign: 'left' }}>
                            <label htmlFor="cancelItemTracking" style={{ display: 'block', fontWeight: '600', color: '#333', marginBottom: '0.5rem' }}>
                                Item to cancel
                            </label>
                            <select
                                id="cancelItemTracking"
                                value={selectedCancelItem?.cancellationKey || ''}
                                onChange={(event) => {
                                    const nextItem = cancellableItems.find((item) => item.cancellationKey === event.target.value);
                                    setCancelTargetItemKey(event.target.value);
                                    setCancelQuantity(1);
                                    if (!nextItem && cancelReasonError) setCancelReasonError('');
                                }}
                                style={{
                                    width: '100%',
                                    borderRadius: '0.75rem',
                                    border: '1px solid #d1d5db',
                                    padding: '0.75rem 0.9rem',
                                    color: '#111827',
                                    backgroundColor: 'white',
                                }}
                            >
                                {cancellableItems.map((item) => (
                                    <option key={item.cancellationKey} value={item.cancellationKey}>
                                        {getCancellationItemDisplayLabel(item)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {selectedCancelItem && (
                            <div style={{ marginBottom: '1rem', textAlign: 'left' }}>
                                <label htmlFor="cancelQuantityTracking" style={{ display: 'block', fontWeight: '600', color: '#333', marginBottom: '0.5rem' }}>
                                    Quantity to cancel
                                </label>
                                <select
                                    id="cancelQuantityTracking"
                                    value={String(cancelQuantity)}
                                    onChange={(event) => setCancelQuantity(Number.parseInt(event.target.value, 10) || 1)}
                                    style={{
                                        width: '100%',
                                        borderRadius: '0.75rem',
                                        border: '1px solid #d1d5db',
                                        padding: '0.75rem 0.9rem',
                                        color: '#111827',
                                        backgroundColor: 'white',
                                    }}
                                >
                                    {Array.from({ length: selectedCancelItem.remainingQuantity }, (_, index) => index + 1).map((quantity) => (
                                        <option key={quantity} value={quantity}>
                                            {quantity}
                                        </option>
                                    ))}
                                </select>
                                <div style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '0.9rem' }}>
                                    Remaining after this cancellation: {Math.max(0, selectedCancelItem.remainingQuantity - cancelQuantity)} of {selectedCancelItem.originalQuantity}
                                </div>
                            </div>
                        )}
                        <div style={{ marginBottom: '1rem', textAlign: 'left' }}>
                            <label htmlFor="cancelReasonTracking" style={{ display: 'block', fontWeight: '600', color: '#333', marginBottom: '0.5rem' }}>
                                Reason for cancellation
                            </label>
                            <textarea
                                id="cancelReasonTracking"
                                value={cancelReason}
                                onChange={(event) => {
                                    setCancelReason(event.target.value);
                                    if (cancelReasonError) setCancelReasonError('');
                                }}
                                placeholder="Tell us why you want to cancel."
                                rows={4}
                                style={{
                                    width: '100%',
                                    borderRadius: '0.75rem',
                                    border: `1px solid ${cancelReasonError ? '#dc3545' : '#d1d5db'}`,
                                    padding: '0.75rem 0.9rem',
                                    resize: 'vertical',
                                    outline: 'none',
                                    color: '#111827',
                                }}
                            />
                            {cancelReasonError && (
                                <div style={{ marginTop: '0.5rem', color: '#dc3545', fontSize: '0.9rem' }}>
                                    {cancelReasonError}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                            <button
                                onClick={closeCancelModal}
                                style={{
                                    backgroundColor: 'transparent',
                                    color: '#4b5563',
                                    border: '1px solid #d1d5db',
                                    padding: '0.5rem 1.5rem',
                                    borderRadius: '9999px',
                                    cursor: 'pointer',
                                    fontWeight: '600',
                                }}
                            >
                                Keep Request
                            </button>
                            <button
                                onClick={handleConfirmCancel}
                                style={{
                                    backgroundColor: '#dc3545',
                                    color: 'white',
                                    border: 'none',
                                    padding: '0.5rem 1.5rem',
                                    borderRadius: '9999px',
                                    cursor: 'pointer',
                                    fontWeight: '600',
                                }}
                            >
                                Cancel Selected Quantity
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <CustomOrderQuotePaymentModal
                visible={Boolean(quotePaymentRequest)}
                order={quotePaymentRequest}
                onClose={() => setQuotePaymentRequest(null)}
                onSuccess={handleQuotePaymentSuccess}
                onError={handleQuotePaymentError}
            />

            <InfoModal
                show={infoModal.show}
                onClose={() => setInfoModal({ ...infoModal, show: false })}
                title={infoModal.title}
                message={infoModal.message}
                linkTo={infoModal.linkTo}
                linkText={infoModal.linkText}
            />
        </div>
    );
};

export default OrderBookingTracking;




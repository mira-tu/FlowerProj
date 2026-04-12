import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import TrackingPaymentDetails from '../components/TrackingPaymentDetails';
import DeliveryDestinationsSummary from '../components/DeliveryDestinationsSummary';
import TrackingDeliveryStops from '../components/TrackingDeliveryStops';
import InfoModal from '../components/InfoModal';
import CustomizedBouquetPreview from '../components/CustomizedBouquetPreview';
import { insertStaffNotifications } from '../utils/notificationApi';
import { buildTimelineTimestampMap, formatTimelineTimestamp } from '../utils/timelineTimestamps';
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
    maskGcashNumber,
    submitRefundGcashDetails,
} from '../utils/refundWorkflows';
import {
    createAdditionalReceiptEntry,
    normalizeGcashReferenceNumber,
    writeWithOptionalColumns,
} from '../utils/gcashPayments';
import { summarizeCancellationItems } from '../utils/orderCancellation';
import '../styles/Shop.css';

// Timeline steps for Delivery Requests
const requestDeliverySteps = [
    { id: 1, key: 'submitted', title: 'Request Submitted', description: 'Your request has been received.', icon: 'fa-clipboard-check' },
    { id: 2, key: 'payment', title: 'Payment', description: 'We are confirming your GCash payment.', icon: 'fa-credit-card' },
    { id: 3, key: 'processing', title: 'Processing', description: 'Your payment is confirmed and our florists are preparing your request.', icon: 'fa-seedling' },
    { id: 4, key: 'ready_for_delivery', title: 'Ready for Delivery', description: 'Your request is ready to be shipped.', icon: 'fa-box' },
    { id: 5, key: 'out_for_delivery', title: 'Out for Delivery', description: 'Your request is on its way.', icon: 'fa-truck' },
    { id: 6, key: 'completed', title: 'Delivered', description: 'Your request has been delivered successfully.', icon: 'fa-check-circle' },
];

// Timeline steps for Pickup Requests
const requestPickupSteps = [
    { id: 1, key: 'submitted', title: 'Request Submitted', description: 'Your request has been received.', icon: 'fa-clipboard-check' },
    { id: 2, key: 'payment', title: 'Payment', description: 'We are confirming your GCash payment.', icon: 'fa-credit-card' },
    { id: 3, key: 'processing', title: 'Processing', description: 'Your payment is confirmed and our florists are preparing your request.', icon: 'fa-seedling' },
    { id: 4, key: 'ready_for_pickup', title: 'Ready for Pickup', description: 'Your request is ready for pickup.', icon: 'fa-store' },
    { id: 5, key: 'completed', title: 'Picked up', description: 'Your request has been picked up.', icon: 'fa-check-circle' },
];

const getCustomizedTrackingItems = (request) => {
    const sourceItems = Array.isArray(request?.requestData?.items)
        ? request.requestData.items.filter(Boolean)
        : [];

    if (sourceItems.length) {
        return summarizeCancellationItems(sourceItems).items.map((item, index) => ({
            ...item,
            key: item.id || item.listId || `${request?.id || 'customized'}-${index}`,
            name: item.name || (item.bundleSize ? `Customizer Studio (${item.bundleSize} stems)` : `Customizer Studio ${index + 1}`),
            image: item.image_url || item.image || request?.imageUrl || null,
            previewComposition: item.previewComposition || item.preview_composition || null,
            quantity: item.remainingQuantity,
            price: item.unitPrice,
        }));
    }

    if (!(request?.imageUrl || request?.requestData?.bundleSize || request?.requestData?.flower)) {
        return [];
    }

    return [{
        key: `${request?.id || 'customized'}-legacy`,
        name: request?.requestData?.bundleSize
            ? `Customizer Studio (${request.requestData.bundleSize} stems)`
            : 'Customizer Studio',
        image: request?.imageUrl || null,
        previewComposition: request?.requestData?.previewComposition || request?.requestData?.preview_composition || null,
        quantity: 1,
        price: Number(request?.finalPrice || 0),
    }];
};

const getCustomOrderMessageThreadId = (requestId) => (requestId ? `request-${requestId}` : null);

const OrderCustomizedTracking = ({ user }) => {
    const navigate = useNavigate();
    const { requestNumber } = useParams();
    const [request, setRequest] = useState(null);
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(true);
    const [additionalFile, setAdditionalFile] = useState(null);
    const [uploadReferenceNumber, setUploadReferenceNumber] = useState('');
    const [uploadingReceipt, setUploadingReceipt] = useState(false);
    const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '' });
    const [refundRequest, setRefundRequest] = useState(null);
    const [refundReason, setRefundReason] = useState('');
    const [submittingRefundRequest, setSubmittingRefundRequest] = useState(false);
    const [gcashName, setGcashName] = useState('');
    const [gcashNumber, setGcashNumber] = useState('');
    const [submittingRefundDetails, setSubmittingRefundDetails] = useState(false);
    const [feedbackMessage, setFeedbackMessage] = useState('');
    const [submittingFeedback, setSubmittingFeedback] = useState(false);
    const [confirmingStopKey, setConfirmingStopKey] = useState(null);

    useEffect(() => {
        const generateTrackingSteps = (requestObj) => {
            if (!requestObj) return requestDeliverySteps;
            let baseSteps = requestObj.deliveryMethod === 'pickup' ? [...requestPickupSteps] : [...requestDeliverySteps];
            baseSteps = baseSteps.map(step => ({ ...step }));

            if (requestObj.payment_method === 'cod') {
                const paymentStepIndex = baseSteps.findIndex(s => s.key === 'payment');
                if (paymentStepIndex !== -1) {
                    const [paymentStep] = baseSteps.splice(paymentStepIndex, 1);
                    paymentStep.description = requestObj.deliveryMethod === 'pickup'
                        ? 'Payment to be collected upon pickup.'
                        : 'Payment to be collected upon delivery.';
                    baseSteps.splice(baseSteps.length - 1, 0, paymentStep);
                    baseSteps.forEach((step, index) => {
                        step.id = index + 1;
                    });
                }
            }
            return baseSteps;
        };

        const fetchRequest = async () => {
            if (!requestNumber) {
                setLoading(false);
                return;
            }

            setLoading(true);
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

            let finalAddress = null;
            if (foundRequest.data?.address_id) {
                const { data: foundAddress, error: addressError } = await supabase
                    .from('addresses')
                    .select('*')
                    .eq('id', foundRequest.data.address_id)
                    .single();

                if (addressError) {
                    console.error('Error fetching address:', addressError);
                } else {
                    finalAddress = foundAddress;
                }
            } else if (foundRequest.data?.address) {
                finalAddress = foundRequest.data.address;
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
                // Third-party rider assigned by admin
                riderDetails = {
                    name: foundRequest.third_party_rider_name,
                    phone: foundRequest.third_party_rider_info || null
                };
            }

            const trackingStatus = foundRequest.status === 'accepted' && foundRequest.payment_status === 'paid'
                ? 'processing'
                : foundRequest.status;

            const transformedRequest = {
                ...foundRequest,
                rider: riderDetails,
                date: foundRequest.created_at,
                deliveryMethod: foundRequest.data?.delivery_method,
                pickupTime: foundRequest.data?.pickup_time,
                address: finalAddress,
                multiDeliveryDestinations: Array.isArray(foundRequest.data?.multi_delivery_destinations)
                    ? foundRequest.data.multi_delivery_destinations
                    : [],
                type: foundRequest.type,
                requestData: foundRequest.data,
                imageUrl: foundRequest.data?.items?.[0]?.image_url || foundRequest.image_url,
                finalPrice: (() => {
                    const summary = summarizeCancellationItems(foundRequest.data?.items || []);
                    if (!summary.hasItems) {
                        return foundRequest.final_price;
                    }

                    const shippingFee = summary.allCancelled ? 0 : Number(foundRequest.shipping_fee || foundRequest.data?.shipping_fee || 0);
                    return summary.allCancelled ? 0 : summary.remainingSubtotal + shippingFee;
                })(),
                trackingStatus,
                gcash_reference_number: foundRequest.gcash_reference_number || foundRequest.data?.gcash_reference_number || null,
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

            // Determine current step
            const steps = generateTrackingSteps(transformedRequest);
            const finalRequestStatuses = ['completed', 'claimed', 'declined', 'cancelled'];

            if (finalRequestStatuses.includes(transformedRequest.trackingStatus)) {
                if (transformedRequest.trackingStatus === 'completed' || transformedRequest.trackingStatus === 'claimed') {
                    setCurrentStep(steps.length + 1);
                } else {
                    setCurrentStep(-1);
                }
            } else {
                let currentStepKey;
                if (transformedRequest.trackingStatus === 'pending') {
                    currentStepKey = 'submitted';
                } else if (transformedRequest.trackingStatus === 'accepted') {
                    currentStepKey = 'payment';
                } else {
                    currentStepKey = transformedRequest.trackingStatus;
                }

                let stepIndex = steps.findIndex(step => step.key === currentStepKey);

                if (stepIndex === -1) {
                    stepIndex = 0; // Default to first step if no match
                }

                setCurrentStep(stepIndex + 1);
            }

            setLoading(false);
        };

        fetchRequest();

        const channel = supabase
            .channel(`requests:${requestNumber}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'requests'
                },
                (payload) => {
                    if (payload.new && payload.new.request_number === requestNumber) {
                        fetchRequest();
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
            // Refresh request data manually
            const { data: updatedRequest } = await supabase
                .from('requests')
                .select('*')
                .eq('id', request.id)
                .single();

            if (updatedRequest) {
                setRequest(prev => ({
                    ...prev,
                    receipt_url: updatedRequest.receipt_url,
                    gcash_reference_number: updatedRequest.gcash_reference_number || updatedRequest.data?.gcash_reference_number || prev?.gcash_reference_number || null,
                    payment_status: updatedRequest.payment_status,
                    additional_receipts: updatedRequest.additional_receipts || []
                }));
            }
        } catch (error) {
            console.error('Error uploading receipt:', error);
            setInfoModal({ show: true, title: 'Upload Failed', message: error.message || 'Failed to upload receipt. Please try again.' });
        } finally {
            setUploadingReceipt(false);
        }
    };

    const getTrackingSteps = () => {
        if (!request) return requestDeliverySteps;
        let baseSteps = request.deliveryMethod === 'pickup' ? [...requestPickupSteps] : [...requestDeliverySteps];
        baseSteps = baseSteps.map(step => ({ ...step }));

        if (request.payment_method === 'cod') {
            const paymentStepIndex = baseSteps.findIndex(s => s.key === 'payment');
            if (paymentStepIndex !== -1) {
                const [paymentStep] = baseSteps.splice(paymentStepIndex, 1);
                paymentStep.description = request.deliveryMethod === 'pickup'
                    ? 'Payment to be collected upon pickup.'
                    : 'Payment to be collected upon delivery.';
                baseSteps.splice(baseSteps.length - 1, 0, paymentStep);
                baseSteps.forEach((step, index) => {
                    step.id = index + 1;
                });
            }
        }
        return baseSteps;
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
        const expectedDate = new Date(requestDate.getTime() + 48 * 60 * 60 * 1000);
        return expectedDate.toLocaleDateString('en-PH', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        });
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
            const updatedDestinations = confirmDeliveryStop(request.multiDeliveryDestinations, stop.unit_key, {
                actorType: 'customer',
                actorUserId: user?.id || request.user_id || null,
                confirmedAt,
            });
            const allConfirmed = areAllDeliveryStopsConfirmed(updatedDestinations);
            const nextStatusTimestamps = {
                ...(request.status_timestamps || {}),
                ...(allConfirmed ? { completed: confirmedAt } : {}),
            };
            const nextRequestData = {
                ...(request.requestData || {}),
                multi_delivery_destinations: updatedDestinations,
            };
            const updatePayload = {
                data: nextRequestData,
                status_timestamps: nextStatusTimestamps,
            };

            if (allConfirmed) {
                updatePayload.status = 'completed';

                if (String(request.payment_method || '').trim().toLowerCase() === 'cod') {
                    updatePayload.payment_status = 'paid';
                }
            }

            const { data, error } = await supabase
                .from('requests')
                .update(updatePayload)
                .eq('id', request.id)
                .select('*')
                .single();

            if (error) {
                throw error;
            }

            setRequest((prevRequest) => prevRequest ? ({
                ...prevRequest,
                ...data,
                status: data.status,
                payment_status: data.payment_status,
                status_timestamps: data.status_timestamps || nextStatusTimestamps,
                requestData: {
                    ...(prevRequest.requestData || {}),
                    ...(typeof data.data === 'object' && data.data ? data.data : {}),
                    multi_delivery_destinations: updatedDestinations,
                },
                multiDeliveryDestinations: updatedDestinations,
            }) : prevRequest);

            if (allConfirmed) {
                setCurrentStep(trackingSteps.length + 1);
                setInfoModal({
                    show: true,
                    title: 'Delivery Confirmed',
                    message: 'Thank you for confirming the final delivery stop. Your request is now marked as completed.',
                });
            } else {
                setInfoModal({
                    show: true,
                    title: 'Stop Confirmed',
                    message: 'This delivery stop has been confirmed.',
                });
            }
        } catch (error) {
            console.error('Error confirming customized delivery stop:', error);
            setInfoModal({
                show: true,
                title: 'Confirmation Failed',
                message: error.message || 'We could not confirm this delivery stop right now.',
            });
        } finally {
            setConfirmingStopKey(null);
        }
    };

    const handleRequestRefund = async () => {
        if (!request || !user) {
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
                customerId: user.id,
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

    const handleSendFeedback = (event) => {
        event.preventDefault();

        const trimmedMessage = feedbackMessage.trim();
        if (!trimmedMessage || !request?.id || !customOrderMessageThreadId) {
            return;
        }

        setSubmittingFeedback(true);
        try {
            const message = {
                id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                orderId: customOrderMessageThreadId,
                sender: 'user',
                senderName: user?.name || 'You',
                message: trimmedMessage,
                timestamp: new Date().toISOString(),
                readByAdmin: false,
                context: 'custom_order_feedback',
            };

            const allMessages = JSON.parse(localStorage.getItem('messages') || '[]');
            localStorage.setItem('messages', JSON.stringify([...allMessages, message]));
            window.dispatchEvent(new Event('messageUpdated'));

            insertStaffNotifications({
                type: 'message',
                title: 'New Custom Order Feedback',
                message: `A customer sent feedback for custom order #${request.request_number || request.id}.`,
                icon: 'fa-comments',
                link: '/admin/dashboard',
            }).catch((notificationError) => {
                console.error('Error notifying staff about custom order feedback:', notificationError);
            });

            setFeedbackMessage('');
            setInfoModal({
                show: true,
                title: 'Feedback Sent',
                message: 'Your feedback was sent successfully. Our team can review it from the existing order conversation.',
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

    const trackingSteps = getTrackingSteps();
    const timelineTimestampMap = buildTimelineTimestampMap({
        steps: trackingSteps,
        currentStep,
        statusTimestamps: request?.status_timestamps || {},
        createdAt: request?.date,
        updatedAt: request?.updated_at
    });
    const customizedTrackingItems = getCustomizedTrackingItems(request);
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
    const usesStopConfirmationFlow = hasStopConfirmationFlow(request?.multiDeliveryDestinations || []);
    const canShowRefundRequest = Boolean(request) && canRequestRefund({
        paymentStatus: request?.payment_status,
        amountPaid: request?.amount_received,
        fallbackAmount: request?.finalPrice,
        refundRequest,
    }) && ['completed', 'cancelled'].includes(String(request?.status || '').toLowerCase());
    const showRefundGcashForm = String(refundRequest?.status || '').toLowerCase() === 'approved';
    const customOrderMessageThreadId = getCustomOrderMessageThreadId(request?.id);

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
                Customizer Studio
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
                                <div className="current-status-badge">
                                    {trackingSteps[Math.min(currentStep, trackingSteps.length) - 1]?.title}
                                </div>
                            )}
                            <div className="expected-delivery">
                                {!isFinalStep && !isDeclinedOrCancelled && `Expected resolution by: ${getExpectedResolutionDate()}`}

                                {isDeclinedOrCancelled && (
                                    cancellationReason
                                        ? `${request.status === 'declined' ? 'Declined' : 'Cancelled'}: ${cancellationReason}`
                                        : (request.status === 'declined' ? 'Request not fulfilled.' : 'Request cancelled by user.')
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="row">
                    <div className="col-lg-8">
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

                        {request.deliveryMethod === 'delivery' && (
                            usesStopConfirmationFlow ? (
                                <TrackingDeliveryStops
                                    destinations={request.multiDeliveryDestinations}
                                    title="Delivery Stops"
                                    fallbackRider={request.rider}
                                    confirmingUnitKey={confirmingStopKey}
                                    onConfirmStop={handleConfirmDeliveryStop}
                                />
                            ) : (
                                <DeliveryDestinationsSummary
                                    destinations={request.multiDeliveryDestinations}
                                    title="Delivery Stops"
                                    fallbackRider={request.rider}
                                />
                            )
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
                                                {step.key === 'payment' && (request.payment_status === 'partial' || (request.payment_status !== 'paid' && request.amount_received > 0)) && (
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
                                                {step.key === 'out_for_delivery' && ['out_for_delivery', 'delivered', 'completed', 'claimed'].includes(request.status) && request.rider && (
                                                    <><br /><span className="fw-bold">Rider:</span> {request.rider.name} {request.rider.phone && `(${request.rider.phone})`}</>
                                                )}
                                            </div>
                                            <div className="timeline-date">{getTimelineDate(step.id)}</div>
                                        </div>
                                    </div>
                                ))}
                                {isDeclinedOrCancelled && (
                                    <div className="timeline-item current">
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
                                    {request.requestData?.payment_method && (
                                        <div className="delivery-info-row">
                                            <div className="delivery-label">Payment</div>
                                            <div className="delivery-value">{request.requestData.payment_method === 'gcash' ? 'GCash' : request.requestData.payment_method}</div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <div className="delivery-info-row">
                                        <div className="delivery-label">Recipient</div>
                                        <div className="delivery-value">{request.address?.name}</div>
                                    </div>
                                    <div className="delivery-info-row">
                                        <div className="delivery-label">Phone</div>
                                        <div className="delivery-value">{request.contact_number}</div>
                                    </div>
                                    <div className="delivery-info-row">
                                        <div className="delivery-label">Address</div>
                                        <div className="delivery-value">
                                            {request.address ?
                                                `${request.address.street}, ${request.address.barangay}, ${request.address.city}, ${request.address.province}` :
                                                (request.requestData?.deliveryAddress || 'N/A')
                                            }
                                        </div>
                                    </div>
                                    {request.requestData?.payment_method && (
                                        <div className="delivery-info-row">
                                            <div className="delivery-label">Payment</div>
                                            <div className="delivery-value">{request.requestData.payment_method === 'gcash' ? 'GCash' : request.requestData.payment_method}</div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                    </div>


                    <div className="col-lg-4">
                        <div className="tracking-items p-4 rounded-4 shadow-sm bg-white">
                            <h5 className="fw-bold mb-4 pb-3 border-bottom d-flex align-items-center">
                                <i className="fas fa-box fs-5 me-2" style={{ color: 'var(--shop-pink)' }}></i>
                                Order Items
                            </h5>

                            {customizedTrackingItems.slice(0, 2).map((item) => (
                                <div key={item.key} className="d-flex align-items-center mb-3 pb-3 border-bottom">
                                    <div className="me-3">
                                        <CustomizedBouquetPreview item={item} size={56} zoomable />
                                    </div>
                                    <div className="flex-grow-1">
                                        <div className="fw-bold">{item.name}</div>
                                                    <div className="text-muted small">
                                                        {item.remainingQuantity > 0 ? `Qty: ${item.quantity}` : 'Cancelled'}
                                                    </div>
                                                    {item.cancelledQuantity > 0 && (
                                                        <div className="text-danger small">Cancelled: {item.cancelledQuantity}</div>
                                                    )}
                                    </div>
                                    {item.price > 0 && (
                                        <div className="fw-bold" style={{ color: 'var(--shop-pink)' }}>
                                            ₱{(item.price * item.quantity).toLocaleString()}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {customizedTrackingItems.length > 2 && (
                                <div className="text-muted small mb-3">
                                    + {customizedTrackingItems.length - 2} more item(s)
                                </div>
                            )}

                            <div className="mt-4 pt-3 border-top">
                                <div className="d-flex align-items-start gap-2 mb-2">
                                    <i className="fas fa-comment-dots mt-1" style={{ color: 'var(--shop-pink)' }}></i>
                                    <div>
                                        <h6 className="fw-bold mb-1">Send Feedback</h6>
                                        <p className="text-muted small mb-0">
                                            Share a note, concern, or appreciation about this custom order. It will be sent to the same order conversation used by My Orders.
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
                                        disabled={submittingFeedback || !feedbackMessage.trim() || !customOrderMessageThreadId}
                                    >
                                        {submittingFeedback ? 'Sending...' : 'Send Feedback'}
                                    </button>
                                </form>
                            </div>

                            <div className="mt-4 pt-3 border-top">
                                <div className="d-flex justify-content-between mb-2 small text-muted">
                                    <span>Subtotal</span>
                                    <span>{request.requestData.subtotal ? `₱${request.requestData.subtotal.toLocaleString()}` : 'N/A'}</span>
                                </div>
                                <div className="d-flex justify-content-between mb-3 small text-muted">
                                    <span>Delivery Fee</span>
                                    <span>
                                        {request.deliveryMethod === 'pickup'
                                            ? 'FREE'
                                            : (request.requestData.shipping_fee ? `₱${request.requestData.shipping_fee.toLocaleString()}` : 'N/A')}
                                    </span>
                                </div>

                                <div className="d-flex justify-content-between align-items-center pt-3 border-top">
                                    <span className="text-muted fw-bold">Final Price</span>
                                    <span className="fs-5 fw-bold" style={{ color: 'var(--shop-pink)' }}>{request.finalPrice ? `₱${request.finalPrice.toLocaleString()}` : 'For Discussion'}</span>
                                </div>
                            </div>
                        </div>

                        <button
                            className="btn w-100 py-2 mt-3"
                            style={{ background: 'var(--shop-pink)', color: 'white' }}
                            onClick={() => navigate('/profile', { state: { activeMenu: 'orders' } })}
                        >
                            <i className="fas fa-clipboard-list me-2"></i>View My Requests
                        </button>

                        <div className="mt-3">
                            <Link to="/profile" className="btn w-100 py-2" style={{ background: 'var(--shop-pink-light)', color: 'var(--shop-pink)' }}>
                                <i className="fas fa-arrow-left me-2"></i>Back to My Requests
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            <InfoModal
                show={infoModal.show}
                onClose={() => setInfoModal({ ...infoModal, show: false })}
                title={infoModal.title}
                message={infoModal.message}
            />
        </div>
    );
};

export default OrderCustomizedTracking;

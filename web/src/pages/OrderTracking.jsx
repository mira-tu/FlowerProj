import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import TrackingPaymentDetails from '../components/TrackingPaymentDetails';
import DeliveryDestinationsSummary from '../components/DeliveryDestinationsSummary';
import TrackingDeliveryStops from '../components/TrackingDeliveryStops';
import InfoModal from '../components/InfoModal';
import RefundRequestModal from '../components/RefundRequestModal';
import RefundRequestPanel from '../components/RefundRequestPanel';
import { buildTimelineTimestampMap, formatTimelineTimestamp } from '../utils/timelineTimestamps';
import {
    areAllDeliveryStopsConfirmed,
    confirmDeliveryStop,
    hasStopConfirmationFlow,
    parseMultiDeliveryNotes,
    reconcileDeliveryDestinationsWithItems,
    serializeMultiDeliveryNotes,
} from '../utils/deliveryDestinations';
import {
    createRefundRequest,
    getRefundRequestForEntity,
    submitRefundGcashDetails,
} from '../utils/refundWorkflows';
import {
    createAdditionalReceiptEntry,
    getOrderAdditionalReceiptsFromNotes,
    getOrderGcashReferenceFromNotes,
    mergeOrderPaymentMetadataIntoNotes,
    normalizeGcashReferenceNumber,
    normalizeAdditionalReceiptEntries,
    resolveOrderTrackingPaymentMetadata,
    writeWithOptionalColumns,
} from '../utils/gcashPayments';
import { summarizeCancellationItems } from '../utils/orderCancellation';
import {
    DELIVERY_FAILED_ATTEMPT_STATUS,
    getDeliveryFailureReason,
    withDeliveryFailedAttemptStep,
} from '../utils/deliveryFailure';
import {
    buildRefundReasonFromCancelledEntity,
    canRequestRefundAfterCancellation,
    getCancellationRefundContext,
} from '../utils/customerRefunds';
import '../styles/Shop.css';

// Timeline steps for Delivery Orders
const deliverySteps = [
    { id: 1, key: 'pending', title: 'Order Placed', description: 'Your order has been placed and is awaiting confirmation.', icon: 'fa-clipboard-check' },
    { id: 2, key: 'payment', title: 'Payment', description: 'We are confirming your payment.', icon: 'fa-credit-card' },
    { id: 3, key: 'processing', title: 'Processing', description: 'Your payment is confirmed and our team is preparing your order.', icon: 'fa-seedling' },
    { id: 4, key: 'ready_for_delivery', title: 'Ready for Delivery', description: 'Your order is packed and ready to be shipped.', icon: 'fa-box' },
    { id: 5, key: 'out_for_delivery', title: 'Out for Delivery', description: 'Your order is on its way to you.', icon: 'fa-truck' },
    { id: 6, key: 'completed', title: 'Delivered', description: 'Your order has been delivered successfully.', icon: 'fa-check-circle' },
];

// Timeline steps for Pickup Orders
const pickupSteps = [
    { id: 1, key: 'pending', title: 'Order Placed', description: 'Your order has been placed and is awaiting confirmation.', icon: 'fa-clipboard-check' },
    { id: 2, key: 'payment', title: 'Payment', description: 'We are confirming your payment.', icon: 'fa-credit-card' },
    { id: 3, key: 'processing', title: 'Processing', description: 'Your payment is confirmed and our team is preparing your order.', icon: 'fa-seedling' },
    { id: 4, key: 'ready_for_pickup', title: 'Ready for Pickup', description: 'Your order is ready for pickup at our store.', icon: 'fa-store' },
    { id: 5, key: 'completed', title: 'Picked Up', description: 'Your order has been picked up.', icon: 'fa-check-circle' },
];

const OrderTracking = ({ user }) => {
    const navigate = useNavigate();
    const { orderNumber } = useParams();
    const [order, setOrder] = useState(null);
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(true);
    const [additionalFile, setAdditionalFile] = useState(null);
    const [uploadReferenceNumber, setUploadReferenceNumber] = useState('');
    const [uploadingReceipt, setUploadingReceipt] = useState(false);
    const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '' });
    const [refundRequest, setRefundRequest] = useState(null);
    const [refundReason, setRefundReason] = useState('');
    const [showRefundModal, setShowRefundModal] = useState(false);
    const [submittingRefundRequest, setSubmittingRefundRequest] = useState(false);
    const [gcashName, setGcashName] = useState('');
    const [gcashNumber, setGcashNumber] = useState('');
    const [submittingRefundDetails, setSubmittingRefundDetails] = useState(false);
    const [confirmingStopKey, setConfirmingStopKey] = useState(null);

    useEffect(() => {
        const generateTrackingSteps = (orderObj) => {
            if (!orderObj) return deliverySteps;
            let baseSteps = orderObj.deliveryMethod === 'pickup' ? [...pickupSteps] : [...deliverySteps];
            baseSteps = baseSteps.map(step => ({ ...step }));

            if (orderObj.payment_method === 'cod') {
                const paymentStepIndex = baseSteps.findIndex(s => s.key === 'payment');
                if (paymentStepIndex !== -1) {
                    const [paymentStep] = baseSteps.splice(paymentStepIndex, 1);
                    paymentStep.description = orderObj.deliveryMethod === 'pickup'
                        ? 'Payment to be collected upon pickup.'
                        : 'Payment to be collected upon delivery.';
                    baseSteps.splice(baseSteps.length - 1, 0, paymentStep);
                    baseSteps.forEach((step, index) => {
                        step.id = index + 1;
                    });
                }
            }
            return orderObj.deliveryMethod === 'pickup'
                ? baseSteps
                : withDeliveryFailedAttemptStep(baseSteps, orderObj);
        };

        const fetchOrder = async () => {
            if (!orderNumber) {
                setLoading(false);
                return;
            }

            setLoading(true);

            const { data: foundOrder, error: dbError } = await supabase
                .from('orders')
                .select('*, order_items(*), addresses(*)')
                .eq('order_number', orderNumber)
                .single();

            if (dbError || !foundOrder) {
                console.error('Error fetching order:', dbError);
                setOrder(null);
                setLoading(false);
                return;
            }

            // Fetch rider details if assigned
            let riderDetails = null;
            if (foundOrder.assigned_rider && ['processing', 'ready_for_delivery', 'out_for_delivery', DELIVERY_FAILED_ATTEMPT_STATUS, 'completed', 'claimed'].includes(foundOrder.status)) {
                const { data: rider, error: riderError } = await supabase
                    .from('users')
                    .select('name, phone')
                    .eq('id', foundOrder.assigned_rider)
                    .single();
                if (!riderError && rider) {
                    riderDetails = rider;
                }
            } else if (foundOrder.third_party_rider_name) {
                // Third-party rider assigned by admin
                riderDetails = {
                    name: foundOrder.third_party_rider_name,
                    phone: foundOrder.third_party_rider_info || null
                };
            }

            const parsedOrderNotes = parseMultiDeliveryNotes(foundOrder.notes);
            const orderNotesGcashReference = getOrderGcashReferenceFromNotes(foundOrder.notes);
            const orderNotesAdditionalReceipts = getOrderAdditionalReceiptsFromNotes(foundOrder.notes);
            const normalizedAdditionalReceipts = normalizeAdditionalReceiptEntries(
                Array.isArray(foundOrder.additional_receipts) && foundOrder.additional_receipts.length
                    ? foundOrder.additional_receipts
                    : orderNotesAdditionalReceipts
            );
            const sortedOrderItems = Array.isArray(foundOrder.order_items)
                ? [...foundOrder.order_items].sort((left, right) => Number(left?.id || 0) - Number(right?.id || 0))
                : [];
            const itemSummary = summarizeCancellationItems(sortedOrderItems);
            const displayItems = itemSummary.items.map((item) => ({
                ...item,
                quantity: item.remainingQuantity,
                qty: item.remainingQuantity,
                price: item.unitPrice,
            }));
            const transformedOrder = {
                ...foundOrder,
                rider: riderDetails,
                date: foundOrder.created_at,
                items: displayItems,
                address: foundOrder.addresses,
                deliveryMethod: foundOrder.delivery_method,
                pickupTime: foundOrder.pickup_time,
                notesMetadata: parsedOrderNotes.metadata || null,
                multiDeliveryDestinations: reconcileDeliveryDestinationsWithItems(
                    parsedOrderNotes.destinations,
                    sortedOrderItems
                ),
                subtotal: itemSummary.hasItems ? itemSummary.remainingSubtotal : foundOrder.subtotal,
                shipping_fee: itemSummary.allCancelled ? 0 : foundOrder.shipping_fee,
                total: itemSummary.hasItems
                    ? (itemSummary.allCancelled ? 0 : (itemSummary.remainingSubtotal + Number(foundOrder.shipping_fee || 0)))
                    : foundOrder.total,
                refund_snapshot: parsedOrderNotes.metadata?.refund_snapshot || null,
                gcash_reference_number: foundOrder.gcash_reference_number || orderNotesGcashReference || null,
                additional_receipts: normalizedAdditionalReceipts,
            };
            setOrder(transformedOrder);

            try {
                const existingRefund = await getRefundRequestForEntity({
                    entityType: 'order',
                    entityId: foundOrder.id,
                });
                setRefundRequest(existingRefund);
                setGcashName(existingRefund?.gcash_name || '');
                setGcashNumber(existingRefund?.gcash_number || '');
            } catch (refundError) {
                console.error('Error fetching refund request:', refundError);
                setRefundRequest(null);
            }

            // Determine current step
            const steps = generateTrackingSteps(transformedOrder);
            const finalStatuses = ['completed', 'claimed', 'declined', 'cancelled'];

            if (finalStatuses.includes(transformedOrder.status)) {
                if (transformedOrder.status === 'completed' || transformedOrder.status === 'claimed') {
                    setCurrentStep(steps.length + 1);
                } else {
                    setCurrentStep(-1);
                }
            } else {
                let currentStepKey;
                const status = transformedOrder.status;

                if (status === 'pending') {
                    // If payment is COD or already confirmed, skip payment step
                    if (transformedOrder.payment_method === 'cod' || transformedOrder.payment_status === 'paid') {
                        currentStepKey = 'pending';
                    } else {
                        currentStepKey = 'payment';
                    }
                } else if (status === 'to_receive') {
                    currentStepKey = 'out_for_delivery';
                } else if (status === DELIVERY_FAILED_ATTEMPT_STATUS) {
                    currentStepKey = DELIVERY_FAILED_ATTEMPT_STATUS;
                } else {
                    currentStepKey = status;
                }

                let stepIndex = steps.findIndex(step => step.key === currentStepKey);
                if (stepIndex === -1) stepIndex = 0;
                setCurrentStep(stepIndex + 1);
            }

            setLoading(false);
        };

        fetchOrder();

        // Real-time subscription for order updates
        const channel = supabase
            .channel(`orders:${orderNumber}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'orders' },
                (payload) => {
                    if (payload.new && payload.new.order_number === orderNumber) {
                        fetchOrder();
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [orderNumber]);

    useEffect(() => {
        if (!order?.id) {
            return undefined;
        }

        const refundChannel = supabase
            .channel(`refund_requests:order:${order.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'refund_requests',
                    filter: `order_id=eq.${order.id}`,
                },
                async () => {
                    try {
                        const latestRefund = await getRefundRequestForEntity({
                            entityType: 'order',
                            entityId: order.id,
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
    }, [order?.id]);

    const handleUploadReceipt = async () => {
        const normalizedReference = normalizeGcashReferenceNumber(uploadReferenceNumber);
        if (!additionalFile || !order) return;
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
            if (!order.receipt_url) {
                updatePayload = {
                    receipt_url: urlData.publicUrl,
                    gcash_reference_number: normalizedReference,
                    payment_status: 'waiting_for_confirmation',
                    notes: mergeOrderPaymentMetadataIntoNotes(order.notes, {
                        gcash_reference_number: normalizedReference,
                        additional_receipts: order.additional_receipts || [],
                    }),
                };
            } else {
                const newReceipt = createAdditionalReceiptEntry({
                    url: urlData.publicUrl,
                    referenceNumber: normalizedReference,
                });
                const currentReceipts = normalizeAdditionalReceiptEntries(
                    Array.isArray(order.additional_receipts) ? order.additional_receipts : []
                );
                const nextAdditionalReceipts = [...currentReceipts, newReceipt];
                updatePayload = {
                    additional_receipts: nextAdditionalReceipts,
                    payment_status: 'waiting_for_confirmation',
                    notes: mergeOrderPaymentMetadataIntoNotes(order.notes, {
                        gcash_reference_number: order.gcash_reference_number || normalizedReference,
                        additional_receipts: nextAdditionalReceipts,
                    }),
                };
            }

            const { error: updateError } = await writeWithOptionalColumns({
                tableName: 'orders',
                initialPayload: updatePayload,
                optionalColumns: ['gcash_reference_number', 'notes'],
                execute: (payload) => (
                    supabase
                        .from('orders')
                        .update(payload)
                        .eq('id', order.id)
                ),
            });

            if (updateError) throw updateError;

            setInfoModal({ show: true, title: 'Success', message: 'Receipt uploaded successfully!' });
            setAdditionalFile(null);
            setUploadReferenceNumber('');

            // Refresh order data
            const { data: updatedOrder } = await supabase
                .from('orders')
                .select('*')
                .eq('id', order.id)
                .single();

            if (updatedOrder) {
                const fallbackReceipts = getOrderAdditionalReceiptsFromNotes(updatedOrder.notes);
                setOrder(prev => ({
                    ...prev,
                    receipt_url: updatedOrder.receipt_url,
                    gcash_reference_number: updatedOrder.gcash_reference_number
                        || getOrderGcashReferenceFromNotes(updatedOrder.notes)
                        || prev?.gcash_reference_number
                        || null,
                    payment_status: updatedOrder.payment_status,
                    notes: updatedOrder.notes,
                    additional_receipts: normalizeAdditionalReceiptEntries(
                        Array.isArray(updatedOrder.additional_receipts) && updatedOrder.additional_receipts.length
                            ? updatedOrder.additional_receipts
                            : fallbackReceipts
                    ),
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
        if (!order) return deliverySteps;
        let baseSteps = order.deliveryMethod === 'pickup' ? [...pickupSteps] : [...deliverySteps];
        baseSteps = baseSteps.map(step => ({ ...step }));

        if (order.payment_method === 'cod') {
            const paymentStepIndex = baseSteps.findIndex(s => s.key === 'payment');
            if (paymentStepIndex !== -1) {
                const [paymentStep] = baseSteps.splice(paymentStepIndex, 1);
                paymentStep.description = order.deliveryMethod === 'pickup'
                    ? 'Payment to be collected upon pickup.'
                    : 'Payment to be collected upon delivery.';
                baseSteps.splice(baseSteps.length - 1, 0, paymentStep);
                baseSteps.forEach((step, index) => {
                    step.id = index + 1;
                });
            }
        }
        return order.deliveryMethod === 'pickup'
            ? baseSteps
            : withDeliveryFailedAttemptStep(baseSteps, order);
    };

    const getTimelineDate = (stepId) => {
        if (!order) return '';
        const step = trackingSteps.find((s) => s.id === stepId);
        if (!step) return '';

        if (currentStep === -1) return 'N/A';
        if (stepId > currentStep) return 'Pending';

        const resolvedTimestamp = timelineTimestampMap[stepId] || order.date || order.updated_at;
        return formatTimelineTimestamp(resolvedTimestamp, 'en-PH');
    };

    const getExpectedDeliveryDate = () => {
        if (!order) return '';
        const orderDate = new Date(order.date);
        const expectedDate = new Date(orderDate.getTime() + 48 * 60 * 60 * 1000);
        return expectedDate.toLocaleDateString('en-PH', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        });
    };

    const handleOrderReceived = async () => {
        if (!order) return;

        const { error } = await supabase
            .from('orders')
            .update({ status: 'completed' })
            .eq('id', order.id);

        if (error) {
            console.error('Error updating order status:', error);
            setInfoModal({ show: true, title: 'Error', message: 'There was an error confirming delivery. Please try again.' });
        } else {
            setInfoModal({ show: true, title: 'Order Confirmed', message: 'Thank you for confirming! Your order is now marked as completed.' });
        }
    };

    const handleConfirmDeliveryStop = async (stop) => {
        if (!order || !stop?.unit_key) {
            return;
        }

        setConfirmingStopKey(stop.unit_key);

        try {
            const confirmedAt = new Date().toISOString();
            const parsedNotes = parseMultiDeliveryNotes(order.notes);
            const reconciledDestinations = reconcileDeliveryDestinationsWithItems(
                parsedNotes.destinations,
                order?.items || []
            );
            const updatedDestinations = confirmDeliveryStop(reconciledDestinations, stop.unit_key, {
                actorType: 'customer',
                actorUserId: user?.id || order.user_id || null,
                confirmedAt,
            });
            const allConfirmed = areAllDeliveryStopsConfirmed(updatedDestinations);
            const updatePayload = {
                notes: serializeMultiDeliveryNotes({
                    destinations: updatedDestinations,
                    note: parsedNotes.note,
                    metadata: parsedNotes.metadata,
                }),
            };

            if (allConfirmed) {
                updatePayload.status = 'completed';
                updatePayload.status_timestamps = {
                    ...(order.status_timestamps || {}),
                    completed: confirmedAt,
                };

                if (String(order.payment_method || '').trim().toLowerCase() === 'cod') {
                    updatePayload.payment_status = 'paid';
                    updatePayload.amount_received = Math.max(
                        Number(order.amount_received || 0),
                        Number(order.total || 0)
                    );
                }
            }

            const { data, error } = await supabase
                .from('orders')
                .update(updatePayload)
                .eq('id', order.id)
                .select('notes, status, status_timestamps, payment_status, amount_received')
                .single();

            if (error) {
                throw error;
            }

            const nextDestinations = parseMultiDeliveryNotes(data.notes).destinations;
            setOrder((prevOrder) => prevOrder ? ({
                ...prevOrder,
                ...data,
                multiDeliveryDestinations: nextDestinations,
            }) : prevOrder);

            if (data.status === 'completed') {
                setCurrentStep(trackingSteps.length + 1);
            }

            setInfoModal({
                show: true,
                title: allConfirmed ? 'Order Confirmed' : 'Delivery Stop Confirmed',
                message: allConfirmed
                    ? 'Thank you for confirming the final delivery stop. Your order is now completed.'
                    : 'This delivery stop was confirmed successfully.',
            });
        } catch (error) {
            console.error('Error confirming delivery stop:', error);
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
        if (!order || !user) {
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
            const refundContext = getCancellationRefundContext(order);
            const result = await createRefundRequest({
                entityType: 'order',
                entityId: order.id,
                reason: buildRefundReasonFromCancelledEntity(order, trimmedReason),
                refundAmount: refundContext.refundAmount,
            });

            setRefundRequest(result.refundRequest);
            setRefundReason('');
            setShowRefundModal(false);
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
        statusTimestamps: order?.status_timestamps || {},
        createdAt: order?.date,
        updatedAt: order?.updated_at
    });
    const cancellationReason = order?.cancellation_reason || order?.status_timestamps?.cancellation_reason || order?.status_timestamps?.cancel_reason || null;
    const isPickup = order?.deliveryMethod === 'pickup';
    const isFinalStep = currentStep >= trackingSteps.length && currentStep !== -1;
    const isDeclinedOrCancelled = currentStep === -1;
    const paymentMetadata = resolveOrderTrackingPaymentMetadata(order || {});
    const refundContext = getCancellationRefundContext(order || {});
    const canShowRefundRequest = Boolean(order) && canRequestRefundAfterCancellation({
        entity: order,
        refundRequest,
    });
    const usesStopConfirmationFlow = hasStopConfirmationFlow(order?.multiDeliveryDestinations || []);
    const deliveryFailureReason = getDeliveryFailureReason(order || {});
    const isFailedDeliveryAttempt = order?.status === DELIVERY_FAILED_ATTEMPT_STATUS;

    if (loading) {
        return (
            <div className="tracking-container">
                <div className="container text-center py-5">
                    <div className="spinner-border text-primary" role="status">
                        <span className="visually-hidden">Loading...</span>
                    </div>
                    <p className="mt-2">Finding your order...</p>
                </div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="tracking-container">
                <div className="container">
                    <div className="empty-state">
                        <div className="empty-state-icon">
                            <i className="fas fa-search"></i>
                        </div>
                        <h3>Order Not Found</h3>
                        <p>We couldn't find an order with number: {orderNumber}</p>
                        <Link to="/profile" state={{ activeMenu: 'orders' }} className="btn-shop-now">View My Orders</Link>
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
                        <li className="breadcrumb-item"><Link to="/profile" state={{ activeMenu: 'orders' }}>My Orders</Link></li>
                        <li className="breadcrumb-item active">Track Order</li>
                    </ol>
                </nav>

                <div className="tracking-header">
                    <div className="tracking-order-info">
                        <div className="tracking-order-id">
                            <h2>Order #{order.order_number}</h2>
                            <div className="tracking-order-date">
                                Placed on {new Date(order.date).toLocaleDateString('en-PH', {
                                    weekday: 'long',
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                })}
                            </div>
                            <span className="badge mt-2" style={{ background: 'rgba(255,255,255,0.2)', fontSize: '0.8rem' }}>
                                Product Order
                            </span>
                        </div>
                        <div className="tracking-current-status">
                            {order.status === 'out_for_delivery' && !usesStopConfirmationFlow && (
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
                                    onClick={handleOrderReceived}
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

                            {isFailedDeliveryAttempt ? (
                                <div className="current-status-badge" style={{ backgroundColor: '#fef3c7', border: '1px solid #facc15', color: '#92400e' }}>
                                    Failed Delivery Attempt
                                </div>
                            ) : isDeclinedOrCancelled ? (
                                <div className="current-status-badge" style={{ backgroundColor: '#f44336', color: '#fff' }}>
                                    Order {order.status === 'declined' ? 'Declined' : 'Cancelled'}
                                </div>
                            ) : (
                                <div className="current-status-badge">
                                    {trackingSteps[Math.min(currentStep, trackingSteps.length) - 1]?.title}
                                </div>
                            )}
                            <div className="expected-delivery">
                                {isFailedDeliveryAttempt
                                    ? 'Delivery was attempted but could not be completed. Please wait for our team to contact you or retry delivery.'
                                    : (!isFinalStep && !isDeclinedOrCancelled && `Expected delivery by: ${getExpectedDeliveryDate()}`)}

                                {isDeclinedOrCancelled && (
                                    cancellationReason
                                        ? `${order.status === 'declined' ? 'Declined' : 'Cancelled'}: ${cancellationReason}`
                                        : (order.status === 'declined' ? 'Order not fulfilled.' : 'Order cancelled.')
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="row">
                    <div className="col-lg-8">
                        <TrackingPaymentDetails
                            paymentMethod={order.payment_method}
                            paymentStatus={order.payment_status}
                            totalAmount={order.total}
                            amountPaid={order.amount_received}
                            receiptUrl={paymentMetadata.receiptUrl}
                            gcashReferenceNumber={paymentMetadata.gcashReferenceNumber}
                            additionalReceipts={paymentMetadata.additionalReceipts}
                            onUploadReceipt={handleUploadReceipt}
                            uploadingReceipt={uploadingReceipt}
                            additionalFile={additionalFile}
                            setAdditionalFile={setAdditionalFile}
                            uploadReferenceNumber={uploadReferenceNumber}
                            setUploadReferenceNumber={setUploadReferenceNumber}
                            shippingFee={order.shipping_fee}
                        />

                        {!isPickup && usesStopConfirmationFlow ? (
                            <TrackingDeliveryStops
                                destinations={order.multiDeliveryDestinations}
                                title="Delivery Stop Status"
                                fallbackRider={order.rider}
                                confirmingUnitKey={confirmingStopKey}
                                onConfirmStop={handleConfirmDeliveryStop}
                                currentDeliveryStatus={order.status}
                            />
                        ) : (!isPickup && (
                            <DeliveryDestinationsSummary
                                destinations={order.multiDeliveryDestinations}
                                title="Delivery Stops"
                                fallbackRider={order.rider}
                            />
                        ))}

                        {(refundRequest || canShowRefundRequest) && (
                            <RefundRequestPanel
                                refundRequest={refundRequest}
                                canRequestRefund={canShowRefundRequest}
                                eligibleRefundAmount={refundContext.refundAmount}
                                onOpenRequestModal={() => setShowRefundModal(true)}
                                gcashName={gcashName}
                                onGcashNameChange={setGcashName}
                                gcashNumber={gcashNumber}
                                onGcashNumberChange={setGcashNumber}
                                onSubmitRefundDetails={handleSubmitRefundDetails}
                                submittingRefundDetails={submittingRefundDetails}
                            />
                        )}

                        <div className="tracking-timeline">
                            <h5 className="fw-bold mb-4">
                                <i className="fas fa-route me-2" style={{ color: 'var(--shop-pink)' }}></i>
                                Order Timeline
                            </h5>
                            <div className="timeline">
                                {trackingSteps.map((step) => (
                                    <div
                                        key={step.id}
                                        className={`timeline-item ${step.id < currentStep ? 'completed' :
                                            step.id === currentStep ? 'current' : ''
                                            }`}
                                    >
                                        <div
                                            className="timeline-marker"
                                            style={step.key === DELIVERY_FAILED_ATTEMPT_STATUS ? { backgroundColor: '#fef3c7', borderColor: '#facc15', color: '#92400e' } : undefined}
                                        >
                                            <i className={`fas ${step.icon}`}></i>
                                        </div>
                                        <div className="timeline-content">
                                            <h5>{step.title}</h5>
                                            <div className="timeline-info-container">
                                                {step.description}
                                                {step.key === 'payment' && (order.payment_status === 'partial' || (order.payment_status !== 'paid' && order.amount_received > 0)) && (
                                                    <div className="mt-2 p-2 rounded shadow-sm border-start border-4 border-warning" style={{ backgroundColor: '#fffbeb', fontSize: '0.85rem' }}>
                                                        <div className="d-flex align-items-center text-warning-emphasis fw-bold mb-1">
                                                            <i className="fas fa-info-circle me-2"></i>
                                                            Partial Payment Received
                                                        </div>
                                                        <div className="d-flex justify-content-between">
                                                            <span>Paid:</span>
                                                            <span className="text-success">₱{(order.amount_received || 0).toLocaleString()}</span>
                                                        </div>
                                                        <div className="d-flex justify-content-between border-top mt-1 pt-1 fw-bold">
                                                            <span>Remaining Balance:</span>
                                                            <span className="text-danger">₱{((order.total || 0) - (order.amount_received || 0)).toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                )}
                                                {step.key === 'out_for_delivery' && ['out_for_delivery', DELIVERY_FAILED_ATTEMPT_STATUS, 'delivered', 'completed', 'claimed'].includes(order.status) && order.rider && (
                                                    <><br /><span className="fw-bold">Rider:</span> {order.rider.name} {order.rider.phone && `(${order.rider.phone})`}</>
                                                )}
                                                {step.key === DELIVERY_FAILED_ATTEMPT_STATUS && deliveryFailureReason && (
                                                    <div className="mt-2 p-2 rounded shadow-sm border-start border-4 border-warning" style={{ backgroundColor: '#fefce8', fontSize: '0.85rem' }}>
                                                        <div className="fw-bold" style={{ color: '#92400e' }}>
                                                            <i className="fas fa-triangle-exclamation me-2"></i>
                                                            Reason
                                                        </div>
                                                        <div>{deliveryFailureReason}</div>
                                                    </div>
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
                                            <h5>Order {order.status === 'declined' ? 'Declined' : 'Cancelled'}</h5>
                                            <p>{order.status === 'declined' ? 'Your order could not be fulfilled.' : 'You have cancelled this order.'}</p>
                                            <p className="mb-1"><strong>Reason:</strong> {cancellationReason || 'No cancellation reason provided.'}</p>
                                            <div className="timeline-date">{new Date(order.date).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
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
                                    {order.pickupTime && (
                                        <div className="delivery-info-row">
                                            <div className="delivery-label">Pickup Time</div>
                                            <div className="delivery-value">{order.pickupTime}</div>
                                        </div>
                                    )}
                                    <div className="delivery-info-row">
                                        <div className="delivery-label">Payment</div>
                                        <div className="delivery-value">{order.payment_method === 'gcash' ? 'GCash' : order.payment_method === 'cod' ? 'Cash on Delivery' : order.payment_method}</div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="delivery-info-row">
                                        <div className="delivery-label">Recipient</div>
                                        <div className="delivery-value">{order.address?.name || 'N/A'}</div>
                                    </div>
                                    <div className="delivery-info-row">
                                        <div className="delivery-label">Phone</div>
                                        <div className="delivery-value">{order.address?.phone || 'N/A'}</div>
                                    </div>
                                    <div className="delivery-info-row">
                                        <div className="delivery-label">Address</div>
                                        <div className="delivery-value">
                                            {order.address
                                                ? `${order.address.street}, ${order.address.barangay}, ${order.address.city}, ${order.address.province}`
                                                : 'N/A'
                                            }
                                        </div>
                                    </div>
                                    <div className="delivery-info-row">
                                        <div className="delivery-label">Payment</div>
                                        <div className="delivery-value">{order.payment_method === 'gcash' ? 'GCash' : order.payment_method === 'cod' ? 'Cash on Delivery' : order.payment_method}</div>
                                    </div>
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

                            {order.items && order.items.map((item, index) => (
                                <div key={item.id || index} className="d-flex align-items-center mb-3 pb-3 border-bottom">
                                    <img
                                        src={item.image_url || item.image || item.photo || 'https://via.placeholder.com/56'}
                                        alt={item.name}
                                        className="rounded-3 shadow-sm me-3"
                                        style={{ width: '56px', height: '56px', objectFit: 'cover' }}
                                        onError={(e) => e.target.src = 'https://via.placeholder.com/56'}
                                    />
                                    <div className="flex-grow-1">
                                        <div className="fw-bold">{item.name}</div>
                                        <div className="text-muted small">
                                            {item.remainingQuantity > 0 ? `Qty: ${item.quantity || item.qty || 1}` : 'Cancelled'}
                                        </div>
                                        {item.cancelledQuantity > 0 && (
                                            <div className="text-danger small">Cancelled: {item.cancelledQuantity}</div>
                                        )}
                                    </div>
                                    <div className="fw-bold" style={{ color: 'var(--shop-pink)' }}>
                                        ₱{((item.price || 0) * (item.quantity || item.qty || 1)).toLocaleString()}
                                    </div>
                                </div>
                            ))}

                            <div className="mt-3 pt-3 border-top">
                                <div className="d-flex justify-content-between mb-2 small text-muted">
                                    <span>Subtotal</span>
                                    <span>₱{(order.subtotal || 0).toLocaleString()}</span>
                                </div>
                                <div className="d-flex justify-content-between mb-3 small text-muted">
                                        <span>{isPickup ? 'Pickup' : 'Delivery Fee'}</span>
                                    <span>{order.shipping_fee === 0 ? 'FREE' : `₱${(order.shipping_fee || 0).toLocaleString()}`}</span>
                                </div>
                                <div className="d-flex justify-content-between align-items-center pt-3 border-top">
                                    <span className="text-muted fw-bold">Total</span>
                                    <span className="fs-5 fw-bold" style={{ color: 'var(--shop-pink)' }}>₱{(order.total || 0).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        <button
                            className="btn w-100 py-2 mt-3"
                            style={{ background: 'var(--shop-pink)', color: 'white' }}
                            onClick={() => navigate('/profile', { state: { activeMenu: 'orders' } })}
                        >
                            <i className="fas fa-clipboard-list me-2"></i>View My Orders
                        </button>

                        <div className="mt-3">
                            <Link to="/" className="btn w-100 py-2" style={{ background: 'var(--shop-pink-light)', color: 'var(--shop-pink)' }}>
                                <i className="fas fa-arrow-left me-2"></i>Back to Home
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
            <RefundRequestModal
                show={showRefundModal}
                orderLabel="order"
                refundAmount={refundContext.refundAmount}
                refundReason={refundReason}
                onRefundReasonChange={setRefundReason}
                onClose={() => setShowRefundModal(false)}
                onSubmit={handleRequestRefund}
                submitting={submittingRefundRequest}
            />
        </div>
    );
};

export default OrderTracking;


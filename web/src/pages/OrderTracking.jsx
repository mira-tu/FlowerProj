import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import TrackingPaymentDetails from '../components/TrackingPaymentDetails';
import DeliveryDestinationsSummary from '../components/DeliveryDestinationsSummary';
import InfoModal from '../components/InfoModal';
import { buildTimelineTimestampMap, formatTimelineTimestamp } from '../utils/timelineTimestamps';
import { parseOrderDeliveryDestinations } from '../utils/deliveryDestinations';
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
    const [uploadingReceipt, setUploadingReceipt] = useState(false);
    const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '' });

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
            return baseSteps;
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
            if (foundOrder.assigned_rider && ['processing', 'ready_for_delivery', 'out_for_delivery', 'completed', 'claimed'].includes(foundOrder.status)) {
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

            const transformedOrder = {
                ...foundOrder,
                rider: riderDetails,
                date: foundOrder.created_at,
                items: foundOrder.order_items || [],
                address: foundOrder.addresses,
                deliveryMethod: foundOrder.delivery_method,
                pickupTime: foundOrder.pickup_time,
                multiDeliveryDestinations: parseOrderDeliveryDestinations(foundOrder),
            };
            setOrder(transformedOrder);

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

    const handleUploadReceipt = async () => {
        if (!additionalFile || !order) return;

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
                    payment_status: 'waiting_for_confirmation'
                };
            } else {
                const newReceipt = {
                    url: urlData.publicUrl,
                    uploaded_at: new Date().toISOString()
                };
                const currentReceipts = order.additional_receipts || [];
                updatePayload = {
                    additional_receipts: [...currentReceipts, newReceipt],
                    payment_status: 'waiting_for_confirmation'
                };
            }

            const { error: updateError } = await supabase
                .from('orders')
                .update(updatePayload)
                .eq('id', order.id);

            if (updateError) throw updateError;

            setInfoModal({ show: true, title: 'Success', message: 'Receipt uploaded successfully!' });
            setAdditionalFile(null);

            // Refresh order data
            const { data: updatedOrder } = await supabase
                .from('orders')
                .select('*')
                .eq('id', order.id)
                .single();

            if (updatedOrder) {
                setOrder(prev => ({
                    ...prev,
                    receipt_url: updatedOrder.receipt_url,
                    payment_status: updatedOrder.payment_status,
                    additional_receipts: updatedOrder.additional_receipts || []
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
        return baseSteps;
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
                            {order.status === 'out_for_delivery' && (
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

                            {isDeclinedOrCancelled ? (
                                <div className="current-status-badge" style={{ backgroundColor: '#f44336', color: '#fff' }}>
                                    Order {order.status === 'declined' ? 'Declined' : 'Cancelled'}
                                </div>
                            ) : (
                                <div className="current-status-badge">
                                    {trackingSteps[Math.min(currentStep, trackingSteps.length) - 1]?.title}
                                </div>
                            )}
                            <div className="expected-delivery">
                                {!isFinalStep && !isDeclinedOrCancelled && `Expected delivery by: ${getExpectedDeliveryDate()}`}

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
                            receiptUrl={order.receipt_url}
                            additionalReceipts={order.additional_receipts}
                            onUploadReceipt={handleUploadReceipt}
                            uploadingReceipt={uploadingReceipt}
                            additionalFile={additionalFile}
                            setAdditionalFile={setAdditionalFile}
                            shippingFee={order.shipping_fee}
                        />

                        {!isPickup && (
                            <DeliveryDestinationsSummary
                                destinations={order.multiDeliveryDestinations}
                                title="Delivery Stops"
                                fallbackRider={order.rider}
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
                                        <div className="timeline-marker">
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
                                                {step.key === 'out_for_delivery' && ['out_for_delivery', 'delivered', 'completed', 'claimed'].includes(order.status) && order.rider && (
                                                    <><br /><span className="fw-bold">Rider:</span> {order.rider.name} {order.rider.phone && `(${order.rider.phone})`}</>
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
                                        <div className="text-muted small">Qty: {item.quantity || item.qty || 1}</div>
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
        </div>
    );
};

export default OrderTracking;


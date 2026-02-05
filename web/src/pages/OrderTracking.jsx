import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../config/supabase';
import '../styles/Shop.css';

const paymentStep = { status: 'payment', title: 'Payment', description: 'Payment confirmed', icon: 'fa-credit-card' };

// Timeline steps for Delivery orders
const baseDeliverySteps = [
    { id: 1, status: 'order_received', title: 'Order Received', description: 'Your order has been received', icon: 'fa-clipboard-check' },
    { id: 2, status: 'processing', title: 'Processing', description: 'Our florists are preparing your order', icon: 'fa-seedling' },
    { id: 3, status: 'ready_for_delivery', title: 'Ready for Delivery', description: 'Your order is ready to be shipped', icon: 'fa-box' },
    { id: 4, status: 'out_for_delivery', title: 'Out for Delivery', description: 'Your order is on its way', icon: 'fa-truck' },
    { id: 5, status: 'delivered', title: 'Delivered', description: 'Order has been delivered successfully', icon: 'fa-check-circle' },
];

// Timeline steps for Pickup orders
const basePickupSteps = [
    { id: 1, status: 'order_received', title: 'Order Received', description: 'Your order has been received', icon: 'fa-clipboard-check' },
    { id: 2, status: 'processing', title: 'Processing', description: 'Our florists are preparing your order', icon: 'fa-seedling' },
    { id: 3, status: 'ready_for_pickup', title: 'Ready for Pickup', description: 'Your order is ready for pickup', icon: 'fa-store' },
    { id: 4, status: 'claimed', title: 'Picked up', description: 'Order has been picked up', icon: 'fa-check-circle' },
];

const OrderTracking = () => {
    const { orderNumber } = useParams();
    const [order, setOrder] = useState(null);
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(true);

    const getTrackingSteps = (orderData) => {
        if (!orderData) return baseDeliverySteps;

        let steps;
        if (orderData.deliveryMethod === 'pickup') {
            if (orderData.payment_method === 'cod') {
                // COD: Payment is just before claimed
                steps = [
                    basePickupSteps[0], // order_received
                    basePickupSteps[1], // processing
                    basePickupSteps[2], // ready_for_pickup
                    paymentStep,
                    basePickupSteps[3], // claimed
                ];
            } else {
                // Pre-paid: Payment is after order_received
                steps = [
                    basePickupSteps[0], // order_received
                    paymentStep,
                    basePickupSteps[1], // processing
                    basePickupSteps[2], // ready_for_pickup
                    basePickupSteps[3], // claimed
                ];
            }
        } else { // Delivery
            if (orderData.payment_method === 'gcash') {
                // GCash payment for delivery: Payment step after order_received
                steps = [
                    baseDeliverySteps[0], // Order Received
                    paymentStep,
                    baseDeliverySteps[1], // Processing
                    baseDeliverySteps[2], // Ready for Delivery
                    baseDeliverySteps[3], // Out for Delivery
                    baseDeliverySteps[4], // Delivered
                ];
            } else {
                // Other payment methods for delivery: Payment step before delivered
                steps = [
                    baseDeliverySteps[0], // Order Received
                    baseDeliverySteps[1], // Processing
                    baseDeliverySteps[2], // Ready for Delivery
                    baseDeliverySteps[3], // Out for Delivery
                    paymentStep, 
                    baseDeliverySteps[4], // Delivered
                ];
            }
        }

        // Reassign IDs to ensure they are sequential and unique for mapping
        return steps.map((step, index) => ({ ...step, id: index + 1 }));
    };
    const getTimelineDate = (stepId) => {
        if (!order) return '';
        const orderDate = new Date(order.date);
        const stepDate = new Date(orderDate.getTime() + (stepId - 1) * 2 * 60 * 60 * 1000);
        
        if (stepId <= currentStep) {
            return stepDate.toLocaleString('en-PH', { 
                month: 'short', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        }
        return 'Pending';
    };

    const getExpectedDate = () => {
        if (!order) return '';
        const orderDate = new Date(order.date);
        const expectedDate = new Date(orderDate.getTime() + 24 * 60 * 60 * 1000); // 24 hours from order date
        return expectedDate.toLocaleDateString('en-PH', { 
            weekday: 'long',
            month: 'long', 
            day: 'numeric'
        });
    };

    const getOrderTypeLabel = () => {
        if (!order) return '';
        const isCustom = order.type; // Use order.type instead of order.orderType
        const isPickup = order.deliveryMethod === 'pickup';
        
        if (isCustom) {
            return isPickup ? 'Custom/Event Arrangement - Pick Up' : 'Custom/Event Arrangement - Delivery';
        }
        return isPickup ? 'E-commerce - Pick Up' : 'E-commerce - Delivery';
    };

    const handleOrderReceived = async () => {
        if (!order) return;

        const { error } = await supabase
            .from('orders')
            .update({ status: 'completed' })
            .eq('id', order.id);

        if (error) {
            console.error('Error updating order status:', error);
            alert('There was an error confirming your order. Please try again.');
        } else {
            alert('Thank you for confirming! Your order is now marked as completed.');
        }
    };

    const trackingSteps = getTrackingSteps(order);
    const isPickup = order?.deliveryMethod === 'pickup';
    const isFinalStep = currentStep >= trackingSteps.length;

    useEffect(() => {
        const fetchOrder = async () => {
            if (!orderNumber) {
                setLoading(false);
                return;
            }

            setLoading(true);
            const { data: foundOrder, error: dbError } = await supabase
                .from('orders')
                .select('*, order_items(*, products(image_url)), addresses(*)')
                .eq('order_number', orderNumber)
                .single();

            if (dbError || !foundOrder) {
                console.error('Error fetching order:', dbError);
                setOrder(null);
            } else {
                let riderDetails = null;
                if (foundOrder.assigned_rider && ['processing', 'ready_for_delivery', 'out_for_delivery', 'completed', 'claimed'].includes(foundOrder.status)) {
                    const { data: rider, error: riderError } = await supabase
                        .from('users')
                        .select('name, phone')
                        .eq('id', foundOrder.assigned_rider)
                        .single();
                    if (riderError) {
                        console.error('Error fetching rider details:', riderError);
                    } else {
                        riderDetails = rider;
                    }
                }

                const transformedOrder = {
                    ...foundOrder,
                    rider: riderDetails,
                    date: foundOrder.created_at,
                    deliveryMethod: foundOrder.delivery_method,
                    payment_method: foundOrder.payment_method,
                    payment_status: foundOrder.payment_status,
                    amount_paid: parseFloat(foundOrder.amount_paid || 0),
                    shippingFee: foundOrder.shipping_fee,
                    pickupTime: foundOrder.pickup_time,
                    address: foundOrder.addresses,
                    type: foundOrder.request_type || null,
                    items: foundOrder.order_items.map(item => ({
                        ...item,
                        image: item.products?.image_url || item.image_url,
                        qty: item.quantity,
                    })),
                };
                setOrder(transformedOrder);

                const steps = getTrackingSteps(transformedOrder);
                const finalStatuses = ['delivered', 'completed', 'claimed'];
                if (finalStatuses.includes(transformedOrder.status)) {
                    setCurrentStep(steps.length + 1);
                } else {
                    const statusMap = {
                        'pending': 'order_received',
                        'cancelled': 'cancelled',
                        'accepted': 'processing',
                        'processing': 'processing',
                        'ready_for_delivery': 'ready_for_delivery',
                        'out_for_delivery': 'out_for_delivery',
                        'ready_for_pickup': 'ready_for_pickup',
                    };
                    let currentTimelineStatus = statusMap[transformedOrder.status] || 'order_received';

                    // GCash: if payment not fully confirmed, payment step stays current until paid
                    const isGcash = transformedOrder.payment_method?.toLowerCase() === 'gcash';
                    const paymentComplete = transformedOrder.payment_status === 'paid';
                    if (isGcash && !paymentComplete && steps.some(s => s.status === 'payment')) {
                        currentTimelineStatus = 'payment';
                    } else if (transformedOrder.status === 'accepted' && transformedOrder.payment_method !== 'cod' && paymentComplete) {
                        currentTimelineStatus = 'processing';
                    } else if (transformedOrder.status === 'accepted' && transformedOrder.payment_method !== 'cod') {
                        currentTimelineStatus = 'payment';
                    }
                    let stepIndex = steps.findIndex(step => step.status === currentTimelineStatus);
                    if (stepIndex === -1) stepIndex = 0;
                    setCurrentStep(stepIndex + 1);
                }
            }
            setLoading(false);
        };

        fetchOrder();

        const channel = supabase
            .channel(`orders:${orderNumber}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'orders',
                    filter: `order_number=eq.${orderNumber}`,
                },
                (payload) => {
                    fetchOrder();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [orderNumber]);

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
                        <Link to="/profile" className="btn-shop-now">View My Orders</Link>
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
                        <li className="breadcrumb-item"><Link to="/profile">My Orders</Link></li>
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
                                {getOrderTypeLabel()}
                            </span>
                        </div>
                        <div className="tracking-current-status">
                            {(order.status === 'out_for_delivery' || order.status === 'ready_for_pickup') && (
                                <button 
                                    style={{
                                        padding: '8px 20px',
                                        backgroundColor: '#e8f5e9', // Light green
                                        color: '#2e7d32', // Darker green text
                                        borderRadius: '25px', // Rounded pill shape
                                        fontWeight: '600',
                                        border: 'none',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                        marginBottom: '8px',
                                        marginRight: '0.5rem', // Replicate gap
                                    }}
                                    onClick={handleOrderReceived}
                                >
                                    Order Received
                                </button>
                            )}

                            <div 
                                className="current-status-badge"
                                style={order.status === 'cancelled' ? { backgroundColor: '#f44336', color: '#fff' } : {}}
                            >
                                {order.status === 'cancelled'
                                    ? 'Order Cancelled'
                                    : trackingSteps[Math.min(currentStep, trackingSteps.length) - 1]?.title
                                }
                            </div>
                            <div className="expected-delivery">
                                {!isFinalStep && (
                                    isPickup 
                                        ? `Expected pickup: ${getExpectedDate()}` 
                                        : `Expected delivery: ${getExpectedDate()}`
                                )}
                                {isFinalStep && (isPickup ? 'Picked up successfully!' : 'Delivered successfully!')}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="row">
                    <div className="col-lg-8">
                        <div className="tracking-timeline">
                            <h5 className="fw-bold mb-4">
                                <i className="fas fa-route me-2" style={{ color: 'var(--shop-pink)' }}></i>
                                Tracking Timeline
                            </h5>
                            
                            <div className="timeline">
                                {trackingSteps.map((step) => {
                                    const isPaymentStep = step.status === 'payment';
                                    const isGcash = order.payment_method?.toLowerCase() === 'gcash';
                                    const paymentPaid = order.payment_status === 'paid';
                                    const amountPaidByAdmin = parseFloat(order.amount_paid) || 0;
                                    const remaining = isPaymentStep && isGcash ? Math.max(0, (parseFloat(order.total) || 0) - amountPaidByAdmin) : 0;
                                    const showRemainingAndPayLink = isPaymentStep && isGcash && !paymentPaid && remaining > 0 && amountPaidByAdmin > 0;
                                    return (
                                    <div 
                                        key={step.id}
                                        className={`timeline-item ${
                                            step.id < currentStep ? 'completed' : 
                                            step.id === currentStep ? 'current' : ''
                                        }`}
                                    >
                                        <div className="timeline-marker">
                                            <i className={`fas ${step.icon}`}></i>
                                        </div>
                                        <div className="timeline-content">
                                            <h5>{step.title}</h5>
                                            <p>
                                                {step.description}
                                                {isPaymentStep && isGcash && paymentPaid && ' Payment confirmed.'}
                                                {showRemainingAndPayLink && (
                                                    <>
                                                        <br />
                                                        <span className="text-warning fw-bold">Remaining balance: ₱{remaining.toLocaleString()}</span>
                                                        <br />
                                                        <Link to="/profile" state={{ activeMenu: 'orders' }} className="btn btn-sm mt-2" style={{ background: 'var(--shop-pink)', color: 'white' }}>
                                                            Pay remaining & upload receipt
                                                        </Link>
                                                    </>
                                                )}
                                                {step.status === 'out_for_delivery' && ['out_for_delivery', 'delivered', 'completed', 'claimed'].includes(order.status) && order.rider && (
                                                    <>
                                                        <br />
                                                        <span className="fw-bold">Rider:</span> {order.rider.name}
                                                        {order.rider.phone && ` (${order.rider.phone})`}
                                                    </>
                                                )}
                                            </p>
                                            <div className="timeline-date">{getTimelineDate(step.id)}</div>
                                        </div>
                                    </div>
                                    );
                                })}
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
                                        <div className="delivery-value">Jocery's Flower Shop, 123 Flower St., Quezon City</div>
                                    </div>
                                    {order.pickupTime && (
                                        <div className="delivery-info-row">
                                            <div className="delivery-label">Pickup Time</div>
                                            <div className="delivery-value">{order.pickupTime}</div>
                                        </div>
                                    )}
                                    <div className="delivery-info-row">
                                        <div className="delivery-label">Payment</div>
                                        <div className="delivery-value">
                                            {order.payment_method === 'cod' ? 'Cash on Delivery' :
                                             order.payment_method === 'gcash' ? 'GCash' :
                                             order.payment_method}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="delivery-info-row">
                                        <div className="delivery-label">Recipient</div>
                                        <div className="delivery-value">{order.address?.name}</div>
                                    </div>
                                    <div className="delivery-info-row">
                                        <div className="delivery-label">Phone</div>
                                        <div className="delivery-value">{order.address?.phone}</div>
                                    </div>
                                    <div className="delivery-info-row">
                                        <div className="delivery-label">Address</div>
                                        <div className="delivery-value">
                                            {order.address?.street}, {order.address?.city}, {order.address?.province} {order.address?.zip}
                                        </div>
                                    </div>
                                    <div className="delivery-info-row">
                                        <div className="delivery-label">Payment</div>
                                        <div className="delivery-value">
                                            {order.payment_method === 'cod' ? 'Cash on Delivery' :
                                             order.payment_method === 'gcash' ? 'GCash' :
                                             order.payment_method}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="col-lg-4">
                        <div className="tracking-items">
                            <h5 className="fw-bold mb-4">
                                <i className="fas fa-box me-2" style={{ color: 'var(--shop-pink)' }}></i>
                                Order Items
                            </h5>
                            
                            {order.items?.map((item, index) => (
                                <div key={index} className="order-item">
                                    <img 
                                        src={item.image} 
                                        alt={item.name}
                                        className="order-item-img"
                                        onError={(e) => e.target.src = 'https://via.placeholder.com/70'}
                                    />
                                    <div>
                                        <div className="order-item-name">{item.name}</div>
                                        <div className="order-item-qty">x{item.qty || 1}</div>
                                    </div>
                                    <div className="order-item-price">
                                        ₱{(item.price * (item.qty || 1)).toLocaleString()}
                                    </div>
                                </div>
                            ))}

                            <hr />

                            <div className="d-flex justify-content-between mb-2">
                                <span>Subtotal</span>
                                <span>₱{order.subtotal?.toLocaleString()}</span>
                            </div>
                            <div className="d-flex justify-content-between mb-2">
                                <span>{isPickup ? 'Pickup' : 'Shipping'}</span>
                                <span>{order.shippingFee === 0 ? 'FREE' : `₱${order.shippingFee}`}</span>
                            </div>
                            <div className="d-flex justify-content-between fw-bold fs-5 mt-3" style={{ color: 'var(--shop-pink)' }}>
                                <span>Total</span>
                                <span>₱{order.total?.toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="mt-3">
                            <Link to="/profile" className="btn w-100 py-2" style={{ background: 'var(--shop-pink-light)', color: 'var(--shop-pink)' }}>
                                <i className="fas fa-arrow-left me-2"></i>Back to My Orders
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderTracking;

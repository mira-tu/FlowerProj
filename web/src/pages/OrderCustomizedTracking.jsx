import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import '../styles/Shop.css';

// Timeline steps for Delivery Requests
const requestDeliverySteps = [
    { id: 1, key: 'submitted', title: 'Request Submitted', description: 'Your request has been received.', icon: 'fa-clipboard-check' },
    { id: 2, key: 'payment', title: 'Payment', description: 'We are confirming your GCash payment.', icon: 'fa-credit-card' },
    { id: 3, key: 'processing', title: 'Processing', description: 'Your payment is confirmed and our florists are preparing your request.', icon: 'fa-seedling' },
    { id: 4, key: 'ready_for_delivery', title: 'Ready for Delivery', description: 'Your request is ready to be shipped.', icon: 'fa-box' },
    { id: 5, key: 'out_for_delivery', title: 'Out for Delivery', description: 'Your request is on its way.', icon: 'fa-truck' },
    { id: 6, key: 'completed', title: 'Delivered', description: 'Your request has been delivered successfully.', icon: 'fa-truck' },
];

// Timeline steps for Pickup Requests
const requestPickupSteps = [
    { id: 1, key: 'submitted', title: 'Request Submitted', description: 'Your request has been received.', icon: 'fa-clipboard-check' },
    { id: 2, key: 'payment', title: 'Payment', description: 'We are confirming your GCash payment.', icon: 'fa-credit-card' },
    { id: 3, key: 'processing', title: 'Processing', description: 'Your payment is confirmed and our florists are preparing your request.', icon: 'fa-seedling' },
    { id: 4, key: 'ready_for_pickup', title: 'Ready for Pickup', description: 'Your request is ready for pickup.', icon: 'fa-store' },
    { id: 5, key: 'completed', title: 'Picked up', description: 'Your request has been picked up.', icon: 'fa-check-circle' },
];

const OrderCustomizedTracking = () => {
    const navigate = useNavigate();
    const { requestNumber } = useParams();
    const [request, setRequest] = useState(null);
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
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
            }

            const requestData = typeof foundRequest.data === 'string' ? JSON.parse(foundRequest.data || '{}') : (foundRequest.data || {});
            const paymentStatus = foundRequest.payment_status ?? requestData?.payment_status ?? 'to_pay';
            const amountPaid = parseFloat(requestData?.amount_paid ?? foundRequest.amount_paid ?? 0);
            const totalPrice = parseFloat(foundRequest.final_price || 0);

            const transformedRequest = {
                ...foundRequest,
                rider: riderDetails,
                date: foundRequest.created_at,
                deliveryMethod: foundRequest.data?.delivery_method,
                pickupTime: foundRequest.data?.pickup_time,
                address: finalAddress,
                type: foundRequest.type,
                requestData: foundRequest.data,
                imageUrl: foundRequest.data?.items?.[0]?.image_url || foundRequest.image_url,
                finalPrice: foundRequest.final_price,
                payment_status: paymentStatus,
                amount_paid: amountPaid,
                total: totalPrice,
            };
            setRequest(transformedRequest);

            const steps = transformedRequest.deliveryMethod === 'pickup' ? requestPickupSteps : requestDeliverySteps;
            const finalRequestStatuses = ['completed', 'claimed', 'declined', 'cancelled'];
            
            if (finalRequestStatuses.includes(transformedRequest.status)) {
                if (transformedRequest.status === 'completed' || transformedRequest.status === 'claimed') {
                    setCurrentStep(steps.length + 1);
                } else {
                    setCurrentStep(-1);
                }
            } else {
                let currentStepKey;
                if (transformedRequest.status === 'pending') {
                    currentStepKey = 'payment';
                } else if (transformedRequest.status === 'accepted' && paymentStatus !== 'paid') {
                    currentStepKey = 'payment'; // Show Payment as current until paid
                } else if (transformedRequest.status === 'accepted') {
                    currentStepKey = 'processing';
                } else {
                    currentStepKey = transformedRequest.status;
                }

                let stepIndex = steps.findIndex(step => step.key === currentStepKey);
                if (stepIndex === -1) stepIndex = 0;
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
                    table: 'requests',
                    filter: `request_number=eq.${requestNumber}`,
                },
                (payload) => {
                    fetchRequest();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [requestNumber]);

    const getTrackingSteps = () => {
        if (!request) return requestDeliverySteps;
        return request.deliveryMethod === 'pickup' ? requestPickupSteps : requestDeliverySteps;
    };

    const getTimelineDate = (stepId) => {
        if (!request) return '';
        const requestDate = new Date(request.date);
        const stepDate = new Date(requestDate.getTime() + (stepId - 1) * 6 * 60 * 60 * 1000);
        
        if (stepId <= currentStep && currentStep !== -1) {
            return stepDate.toLocaleString('en-PH', { 
                month: 'short', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        }
        return currentStep === -1 ? 'N/A' : 'Pending';
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
            alert('There was an error confirming your request. Please try again.');
        } else {
            alert('Thank you for confirming! Your request is now marked as completed.');
        }
    };

    const trackingSteps = getTrackingSteps();
    const isPickup = request?.deliveryMethod === 'pickup';
    const isFinalStep = currentStep >= trackingSteps.length && currentStep !== -1;
    const isDeclinedOrCancelled = currentStep === -1;

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
                                Customized Bouquet
                            </span>
                        </div>
                        <div className="tracking-current-status">
                            {request.status === 'out_for_delivery' && (
                                <button 
                                    style={{
                                        padding: '8px 20px',
                                        backgroundColor: '#e8f5e9',
                                        color: '#2e7d32',
                                        borderRadius: '25px',
                                        fontWeight: '600',
                                        border: 'none',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                        marginBottom: '8px',
                                        marginRight: '0.5rem',
                                    }}
                                    onClick={handleRequestReceived}
                                >
                                    Order Received
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
                                {isFinalStep && (isPickup ? 'Picked up successfully!' : 'Request fulfilled!')}
                                {isDeclinedOrCancelled && (request.status === 'declined' ? 'Request not fulfilled.' : 'Request cancelled by user.')}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="row">
                    <div className="col-lg-8">
                        <div className="tracking-timeline">
                            <h5 className="fw-bold mb-4">
                                <i className="fas fa-route me-2" style={{ color: 'var(--shop-pink)' }}></i>
                                Request Timeline
                            </h5>
                            <div className="timeline">
                                {trackingSteps.map((step) => {
                                    const isPaymentStep = step.key === 'payment';
                                    const amountPaidByAdmin = parseFloat(request.amount_paid) || 0;
                                    const remaining = Math.max(0, (request.total || request.finalPrice || 0) - amountPaidByAdmin);
                                    const showRemainingAndPayLink = isPaymentStep && request.payment_status !== 'paid' && remaining > 0 && amountPaidByAdmin > 0;
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
                                                {isPaymentStep && request.payment_status === 'paid' && ' Payment confirmed.'}
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
                                                {step.key === 'out_for_delivery' && ['out_for_delivery', 'delivered', 'completed', 'claimed'].includes(request.status) && request.rider && (
                                                    <><br /><span className="fw-bold">Rider:</span> {request.rider.name} {request.rider.phone && `(${request.rider.phone})`}</>
                                                )}
                                            </p>
                                            <div className="timeline-date">{getTimelineDate(step.id)}</div>
                                        </div>
                                    </div>
                                    );
                                })}
                                {isDeclinedOrCancelled && (
                                     <div className="timeline-item current">
                                        <div className="timeline-marker" style={{backgroundColor: '#f44336', borderColor: '#f44336', color: '#fff'}}>
                                            <i className="fas fa-times-circle"></i>
                                        </div>
                                        <div className="timeline-content">
                                            <h5>Request {request.status === 'declined' ? 'Declined' : 'Cancelled'}</h5>
                                            <p>{request.status === 'declined' ? 'Your request could not be fulfilled.' : 'You have cancelled this request.'}</p>
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
                                        <div className="delivery-value">Jocery's Flower Shop, 123 Flower St., Quezon City</div>
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
                                                'N/A'
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
                        <div className="tracking-items">
                            <h5 className="fw-bold mb-4">
                                <i className="fas fa-info-circle me-2" style={{ color: 'var(--shop-pink)' }}></i>
                                Request Details
                            </h5>
                            
                            {request.requestData && request.requestData.items && request.requestData.items.map((item, index) => (
                                <div key={item.id || index} className="mb-4">
                                    <div className="d-flex align-items-center mb-3">
                                        {item.image_url && (
                                            <img
                                                src={item.image_url}
                                                alt={item.name}
                                                className="rounded me-3"
                                                style={{ width: '60px', height: '60px', objectFit: 'cover' }}
                                            />
                                        )}
                                        <div>
                                            <h6 className="mb-0 fw-bold">{item.name} #{index + 1}</h6>
                                        </div>
                                    </div>
                                    <p className="mb-1 small"><strong>Flowers:</strong> {item.flowers.map(f => f.name).join(', ')}</p>
                                    <p className="mb-1 small"><strong>Bundle Size:</strong> {item.bundleSize} stems</p>
                                    {item.wrapper && <p className="mb-1 small"><strong>Wrapper:</strong> {item.wrapper.name}</p>}
                                    {item.ribbon && <p className="mb-1 small"><strong>Ribbon:</strong> {item.ribbon.name}</p>}
                                </div>
                            ))}

                            <hr />

                            <div className="d-flex justify-content-between">
                                <span>Subtotal</span>
                                <span>{request.requestData.subtotal ? `₱${request.requestData.subtotal.toLocaleString()}` : 'N/A'}</span>
                            </div>
                            <div className="d-flex justify-content-between">
                                <span>Shipping Fee</span>
                                <span>
                                    {request.deliveryMethod === 'pickup'
                                        ? 'FREE'
                                        : (request.requestData.shipping_fee ? `₱${request.requestData.shipping_fee.toLocaleString()}` : 'N/A')}
                                </span>
                            </div>

                            <hr />

                            <div className="d-flex justify-content-between fw-bold fs-5 mt-3" style={{ color: 'var(--shop-pink)' }}>
                                <span>Final Price</span>
                                <span>{request.finalPrice ? `₱${request.finalPrice.toLocaleString()}` : 'For Discussion'}</span>
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
        </div>
    );
};

export default OrderCustomizedTracking;

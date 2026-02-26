import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { supabase } from '../config/supabase';
import TrackingPaymentDetails from '../components/TrackingPaymentDetails';
import InfoModal from '../components/InfoModal';
import '../styles/Shop.css';

// Timeline steps for Delivery Requests
const requestDeliverySteps = [
    { id: 1, status: 'pending', title: 'Request Submitted', description: 'Your booking request has been received', icon: 'fa-clipboard-check' },
    { id: 2, status: 'quoted', title: 'Quote Provided', description: 'We have provided a quote for your request', icon: 'fa-file-invoice-dollar' },
    { id: 3, status: 'accepted', title: 'Quote Paid and Accepted', description: 'You have paid and accepted the quote, and processing has begun', icon: 'fa-check-circle' },
    { id: 4, status: 'processing', title: 'Processing', description: 'Our florists are preparing your request', icon: 'fa-seedling' },
    { id: 5, status: 'ready_for_delivery', title: 'Ready for Delivery', description: 'Your request is ready to be shipped', icon: 'fa-box' },
    { id: 6, status: 'out_for_delivery', title: 'Out for Delivery', description: 'Your request is on its way', icon: 'fa-truck' },
    { id: 7, status: 'completed', title: 'Delivered', description: 'Your request has been delivered successfully', icon: 'fa-truck' },
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

const OrderBookingTracking = () => {
    const navigate = useNavigate();
    const { requestNumber } = useParams();
    const [request, setRequest] = useState(null);
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(true);
    const [additionalFile, setAdditionalFile] = useState(null);
    const [uploadingReceipt, setUploadingReceipt] = useState(false);
    const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '' });

    useEffect(() => {
        const fetchRequest = async () => {
            if (!requestNumber) {
                setLoading(false);
                return;
            }

            setLoading(true);
            // Step 1: Fetch the request from the 'requests' table
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
            // Step 2: If the request has an address_id, fetch the address
            if (foundRequest.data?.address_id) {
                const { data: foundAddress, error: addressError } = await supabase
                    .from('addresses')
                    .select('*')
                    .eq('id', foundRequest.data.address_id)
                    .single();

                if (addressError) {
                    console.error('Error fetching address:', addressError);
                    // Continue without address if it fails to load
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
            }

            // Step 3: Combine data and set state
            const transformedRequest = {
                ...foundRequest,
                rider: riderDetails,
                date: foundRequest.created_at,
                deliveryMethod: foundRequest.delivery_method, // Changed from foundRequest.data?.delivery_method
                pickupTime: foundRequest.pickup_time,         // Changed from foundRequest.data?.pickup_time
                address: finalAddress, // Attach the fetched address
                type: foundRequest.type,
                requestData: foundRequest.data,
                imageUrl: foundRequest.image_url,
                finalPrice: foundRequest.final_price,
            };
            setRequest(transformedRequest);

            const steps = transformedRequest.deliveryMethod === 'pickup' ? requestPickupSteps : requestDeliverySteps;
            const finalRequestStatuses = ['completed', 'claimed', 'declined', 'cancelled'];

            if (finalRequestStatuses.includes(transformedRequest.status)) {
                if (transformedRequest.status === 'completed' || transformedRequest.status === 'claimed') {
                    setCurrentStep(steps.length + 1);
                } else {
                    setCurrentStep(-1); // Special indicator for declined/cancelled
                }
            } else {
                const statusMap = {
                    'pending': 'pending',
                    'quoted': 'quoted',
                    'accepted': 'accepted',
                    'processing': 'processing',
                    'out_for_delivery': 'out_for_delivery',
                    'ready_for_pickup': 'ready_for_pickup',
                };

                const currentTimelineStatus = statusMap[transformedRequest.status] || 'pending';
                let stepIndex = steps.findIndex(step => step.status === currentTimelineStatus);

                if (stepIndex === -1) {
                    stepIndex = 0;
                }

                setCurrentStep(stepIndex + 1);
            }

            setLoading(false);
        };

        fetchRequest();

        // Real-time subscription for request updates
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
                    // Check if the updated record matches our request
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

    const handleUploadReceipt = async () => {
        if (!additionalFile || !request) return;

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
                // If there's no main receipt yet, set this as the main receipt
                updatePayload = {
                    receipt_url: urlData.publicUrl,
                    payment_status: 'waiting_for_confirmation' // Optional: indicate it's waiting
                };
            } else {
                // Otherwise add to additional receipts
                const newReceipt = {
                    url: urlData.publicUrl,
                    uploaded_at: new Date().toISOString()
                };
                const currentReceipts = request.additional_receipts || [];
                updatePayload = {
                    additional_receipts: [...currentReceipts, newReceipt]
                };
            }

            const { error: updateError } = await supabase
                .from('requests')
                .update(updatePayload)
                .eq('id', request.id);

            if (updateError) throw updateError;

            setInfoModal({ show: true, title: 'Success', message: 'Receipt uploaded successfully!' });
            setAdditionalFile(null);
            // Refresh request data manually since realtime might have delay
            const { data: updatedRequest } = await supabase
                .from('requests')
                .select('*')
                .eq('id', request.id)
                .single();

            if (updatedRequest) {
                setRequest(prev => ({
                    ...prev,
                    receipt_url: updatedRequest.receipt_url,
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
        return request.deliveryMethod === 'pickup' ? requestPickupSteps : requestDeliverySteps;
    };

    const getTimelineDate = (stepId) => {
        if (!request) return '';
        const requestDate = new Date(request.date);
        // This is a placeholder for actual dates based on status changes
        // For a real app, you'd store timestamps for each status change
        const stepDate = new Date(requestDate.getTime() + (stepId - 1) * 6 * 60 * 60 * 1000); // e.g., 6 hours apart

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
        const expectedDate = new Date(requestDate.getTime() + 48 * 60 * 60 * 1000); // 48 hours for resolution
        return expectedDate.toLocaleDateString('en-PH', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        });
    };

    const getRequestTypeLabel = () => {
        if (!request) return '';
        const typeMap = {
            'booking': 'Event Booking',
            'special_order': 'Special Order',
            'customized': 'Customized Bouquet',
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
                                {getRequestTypeLabel()}
                            </span>
                        </div>
                        <div className="tracking-current-status">
                            {request.status === 'out_for_delivery' && (
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
                                {isFinalStep && (isPickup ? 'Picked up successfully!' : 'Request fulfilled!')}
                                {isDeclinedOrCancelled && (request.status === 'declined' ? 'Request not fulfilled.' : 'Request cancelled by user.')}
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
                                additionalReceipts={request.additional_receipts}
                                onUploadReceipt={handleUploadReceipt}
                                uploadingReceipt={uploadingReceipt}
                                additionalFile={additionalFile}
                                setAdditionalFile={setAdditionalFile}
                                shippingFee={request.shipping_fee}
                            />
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
                                        <div className="delivery-value">Jocery's Flower Shop, 123 Flower St., Quezon City</div>
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
                                        <div className="delivery-label">Recipient</div>
                                        <div className="delivery-value">{request.address?.name || request.requestData?.recipient_name || request.requestData?.fullName}</div>
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
                                                (request.requestData?.deliveryAddress || request.requestData?.venue || 'N/A')
                                            }
                                        </div>
                                    </div>
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

                            <div className="d-flex align-items-center mb-3">
                                {request.imageUrl && (
                                    <img
                                        src={request.imageUrl}
                                        alt={getRequestTypeLabel()}
                                        className="rounded me-3"
                                        style={{ width: '60px', height: '60px', objectFit: 'cover' }}
                                    />
                                )}
                                <div>
                                    <h6 className="mb-0 fw-bold">{getRequestTypeLabel()}</h6>
                                </div>
                            </div>

                            {request.type === 'booking' && (
                                <>
                                    <p className="mb-1"><strong>Recipient:</strong> {request.requestData?.recipient_name}</p>
                                    <p className="mb-1"><strong>Occasion:</strong> {request.requestData?.occasion}</p>
                                    <p className="mb-1"><strong>Event Date:</strong> {request.requestData?.event_date}</p>
                                    <p className="mb-1"><strong>Venue:</strong> {request.requestData?.venue}</p>
                                    {request.notes && <p className="mb-1"><strong>Notes:</strong> {request.notes}</p>}
                                </>
                            )}
                            {request.type === 'special_order' && (
                                <>
                                    <p className="mb-1"><strong>Recipient:</strong> {request.requestData?.recipient_name}</p>
                                    <p className="mb-1"><strong>Occasion:</strong> {request.requestData?.occasion}</p>
                                    {request.requestData?.contact_number && <p className="mb-1"><strong>Contact Number:</strong> {request.requestData?.contact_number}</p>}
                                    {request.requestData?.deliveryAddress && <p className="mb-1"><strong>Delivery Address:</strong> {request.requestData?.deliveryAddress}</p>}
                                    {request.requestData?.notes && <p className="mb-1"><strong>Preferences:</strong> {request.requestData.notes}</p>}
                                    {request.requestData?.addon && request.requestData.addon !== 'None' && <p className="mb-1"><strong>Add-on:</strong> {request.requestData.addon}</p>}
                                    {request.requestData?.message && <p className="mb-1"><strong>Message:</strong> {request.requestData.message}</p>}
                                    {request.notes && <p className="mb-1"><strong>Additional Notes:</strong> {request.notes}</p>}
                                </>
                            )}
                            {request.type === 'customized' && (
                                <>
                                    <p className="mb-1"><strong>Flower:</strong> {request.requestData?.flower}</p>
                                    <p className="mb-1"><strong>Bundle Size:</strong> {request.requestData?.bundleSize}</p>
                                    {request.notes && <p className="mb-1"><strong>Notes:</strong> {request.notes}</p>}
                                </>
                            )}

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

            <InfoModal
                show={infoModal.show}
                onClose={() => setInfoModal({ ...infoModal, show: false })}
                title={infoModal.title}
                message={infoModal.message}
            />
        </div>
    );
};

export default OrderBookingTracking;
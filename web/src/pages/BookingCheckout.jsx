import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import InfoModal from '../components/InfoModal';
import '../styles/Shop.css';
import { supabase } from '../config/supabase';

const pickupTimes = ['9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'];

const BookingCheckout = ({ user }) => {
    const navigate = useNavigate();
    const [inquiryItem, setInquiryItem] = useState(null);
    const [deliveryMethod, setDeliveryMethod] = useState('delivery');
    const [selectedPickupDate, setSelectedPickupDate] = useState('');
    const [selectedPickupTime, setSelectedPickupTime] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isAddressReady, setIsAddressReady] = useState(false);
    const [dynamicShippingFee, setDynamicShippingFee] = useState(100);
    const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '', linkTo: '', linkText: '' });

    // Unified state for the inquiry's address
    const [inquiryAddress, setInquiryAddress] = useState({
        label: '', name: '', phone: '', street: '', barangay: '', city: '', province: ''
    });

    // Helper to parse an address string
    const parseAddress = useCallback((addressString) => {
        if (!addressString) return {};
        const parts = addressString.split(',').map(p => p.trim());
        let street = '', barangay = '', city = '', province = '';

        if (parts.length >= 4) {
            province = parts[3];
            city = parts[2];
            barangay = parts[1];
            street = parts[0];
        } else {
            street = addressString; // Fallback for incomplete addresses
        }
        return { street, barangay, city, province };
    }, []);

    useEffect(() => {
        const savedInquiry = localStorage.getItem('bookingInquiry');
        if (savedInquiry) {
            const parsedInquiry = JSON.parse(savedInquiry);
            setInquiryItem(parsedInquiry);

            const { requestData } = parsedInquiry;
            const addressString = requestData?.venue || requestData?.deliveryAddress;

            if (user && addressString) {
                const parsedAddress = parseAddress(addressString);
                setInquiryAddress({
                    label: requestData.type === 'booking' ? 'Event Venue' : 'Delivery Address',
                    name: user.user_metadata?.name || '',
                    phone: requestData.contact_number || user.user_metadata?.phone || '', // Use contact_number from requestData
                    ...parsedAddress
                });
                setIsAddressReady(true);
            }
        } else {
            navigate('/'); // No inquiry, go home
        }
    }, [navigate, user, parseAddress]);

    useEffect(() => {
        const fetchFee = async () => {
            if (deliveryMethod === 'delivery' && inquiryAddress.barangay) {
                const { data, error } = await supabase
                    .from('barangay_fee')
                    .select('delivery_fee')
                    .ilike('barangay_name', `%${inquiryAddress.barangay}%`);

                if (error) {
                    console.error('Error fetching fee for barangay:', inquiryAddress.barangay, error);
                    setDynamicShippingFee(100); // Fallback on error
                } else if (data && data.length > 0) {
                    setDynamicShippingFee(data[0].delivery_fee); // Use the first match
                } else {
                    console.warn(`No fee found for barangay: ${inquiryAddress.barangay}. Using default fee.`);
                    setDynamicShippingFee(100); // Fallback if no match found
                }
            } else if (deliveryMethod === 'pickup') {
                setDynamicShippingFee(0);
            }
        };

        fetchFee();
    }, [inquiryAddress.barangay, deliveryMethod]);

    const handleSaveInquiryAddress = async () => {
        if (!inquiryAddress.street || !inquiryAddress.city || !inquiryAddress.province) {
            setInfoModal({ show: true, title: 'Incomplete Address', message: 'The address is incomplete and cannot be saved.' });
            throw new Error("Incomplete address");
        }

        const { data, error } = await supabase.from('addresses').insert([{
            user_id: user.id,
            ...inquiryAddress
        }]).select().single();

        if (error) {
            console.error('Error saving inquiry address:', error);
            setInfoModal({ show: true, title: 'Error', message: 'Failed to save address: ' + error.message });
            throw error;
        }

        return data.id; // Return the ID of the newly created address
    };

    const handleSubmitInquiry = async () => {
        if (!user) {
            setInfoModal({ show: true, title: 'Login Required', message: 'You must be logged in to submit an inquiry.', linkTo: '/login', linkText: 'Log In' });
            return;
        }
        if (deliveryMethod === 'pickup' && (!selectedPickupDate || !selectedPickupTime)) {
            setInfoModal({ show: true, title: 'Missing Information', message: 'Please select a pickup date and time.' });
            return;
        }

        let finalAddressId = null;
        setIsProcessing(true);

        try {
            if (deliveryMethod === 'delivery') {
                if (!isAddressReady) {
                    setInfoModal({ show: true, title: 'Missing Address', message: 'An address for delivery is not available for this inquiry.' });
                    throw new Error('Address not ready');
                }
                finalAddressId = await handleSaveInquiryAddress();
            }

            const request_number = `REQ-${user.id.substring(0, 4)}-${Date.now()}`;

            // Exclude contact_number from the JSONB data
            const { contact_number, ...restOfRequestData } = inquiryItem.requestData;

            const inquiryDetails = {
                ...restOfRequestData,
                address_id: finalAddressId,
            };

            const submissionData = {
                request_number,
                user_id: user.id,
                type: inquiryItem.requestData.type,
                contact_number: contact_number, // Add as a top-level field
                status: 'pending',
                delivery_method: deliveryMethod,
                pickup_time: deliveryMethod === 'pickup' ? `${selectedPickupDate} - ${selectedPickupTime}` : null,
                shipping_fee: deliveryMethod === 'pickup' ? 0 : dynamicShippingFee,
                data: inquiryDetails,
                image_url: inquiryItem.requestData.image_url,
                notes: inquiryItem.requestData.notes,
            };

            const { error } = await supabase.from('requests').insert([submissionData]);
            if (error) throw error;

            localStorage.removeItem('bookingInquiry');

            // Add notification for inquiry submission
            const notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
            const newNotification = {
                id: `notif-${Date.now()}`,
                type: 'request',
                title: 'Inquiry Submitted Successfully!',
                message: `Your inquiry #${request_number} has been submitted and is pending review.`,
                icon: 'fa-file-alt',
                timestamp: new Date().toISOString(),
                read: false,
                link: `/request-tracking/${request_number}`
            };
            localStorage.setItem('notifications', JSON.stringify([newNotification, ...notifications]));

            navigate(`/request-tracking/${request_number}`);
        } catch (error) {
            console.error('Error submitting inquiry:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    if (!inquiryItem) {
        return (
            <div className="checkout-container"><div className="container text-center py-5"><div className="spinner-border text-primary"></div></div></div>
        );
    }

    return (
        <div className="checkout-container">
            <div className="container">
                <div className="checkout-header"><i className="fas fa-file-invoice fa-lg"></i><h1>Confirm Inquiry</h1></div>
                <div className="row g-4">
                    <div className="col-lg-8">
                        <div className="checkout-section">
                            <h5 className="section-title"><i className="fas fa-truck"></i> Delivery / Pickup Preference</h5>
                            <div className="d-flex gap-3 mb-3">
                                <div className={`payment-option flex-grow-1 ${deliveryMethod === 'delivery' ? 'selected' : ''}`} onClick={() => setDeliveryMethod('delivery')} style={{ cursor: 'pointer' }}>
                                    <div className="payment-icon"><i className="fas fa-truck"></i></div>
                                    <div className="payment-info"><h6>Delivery</h6><p>Deliver to an address</p></div>
                                    <div className="form-check ms-auto"><input type="radio" className="form-check-input" checked={deliveryMethod === 'delivery'} readOnly /></div>
                                </div>
                                <div className={`payment-option flex-grow-1 ${deliveryMethod === 'pickup' ? 'selected' : ''}`} onClick={() => setDeliveryMethod('pickup')} style={{ cursor: 'pointer' }}>
                                    <div className="payment-icon"><i className="fas fa-store"></i></div>
                                    <div className="payment-info"><h6>Pick Up</h6><p>Pick up at our store</p></div>
                                    <div className="form-check ms-auto"><input type="radio" className="form-check-input" checked={deliveryMethod === 'pickup'} readOnly /></div>
                                </div>
                            </div>
                            {deliveryMethod === 'pickup' && (
                                <div className="mt-3 p-3 rounded" style={{ background: '#f8f9fa' }}>
                                    <label className="form-label fw-bold"><i className="fas fa-clock me-2" style={{ color: 'var(--shop-pink)' }}></i> Select Pickup Date & Time</label>
                                    <input
                                        type="date"
                                        className="form-control mb-3"
                                        value={selectedPickupDate}
                                        min={new Date().toISOString().split('T')[0]}
                                        onChange={(e) => setSelectedPickupDate(e.target.value)}
                                    />
                                    <div className="d-flex flex-wrap gap-2">
                                        {pickupTimes.map(time => (<button key={time} type="button" className={`btn btn-sm rounded-pill px-3 ${selectedPickupTime === time ? 'btn-primary' : 'btn-outline-secondary'}`} style={selectedPickupTime === time ? { background: 'var(--shop-pink)', border: 'none' } : {}} onClick={() => setSelectedPickupTime(time)}>{time}</button>))}
                                    </div>
                                    <small className="text-muted mt-2 d-block"><i className="fas fa-map-marker-alt me-1"></i>Pickup Location: Jocery's Flower Shop, 123 Flower St., Quezon City</small>
                                </div>
                            )}
                        </div>

                        {deliveryMethod === 'delivery' && (
                            <div className="checkout-section">
                                <h5 className="section-title mb-3"><i className="fas fa-map-marker-alt"></i> Delivery Address</h5>
                                {user ? (
                                    isAddressReady ? (
                                        <div className="p-3 rounded" style={{ background: '#f8f9fa' }}>
                                            <p className='mb-1'><strong>Customer Name:</strong> {inquiryAddress.name}</p>
                                            <p className='mb-1'><strong>Phone:</strong> {inquiryAddress.phone}</p>
                                            <p className='mb-0'><strong>Address:</strong> {`${inquiryAddress.street}, ${inquiryAddress.barangay}, ${inquiryAddress.city}, ${inquiryAddress.province}`}</p>
                                        </div>
                                    ) : (
                                        <div className="alert alert-warning">
                                            An address was not provided for this inquiry. Please go back and add an address to use the delivery option.
                                        </div>
                                    )
                                ) : (
                                    <div className="alert alert-danger">
                                        <i className="fas fa-exclamation-triangle me-2"></i>
                                        Please <Link to="/login" style={{ color: 'var(--shop-pink)' }}>log in</Link> to use the delivery option.
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="checkout-section">
                            <h5 className="section-title"><i className="fas fa-info-circle"></i> Inquiry Details</h5>
                            <div className="p-3 rounded" style={{ backgroundColor: '#f8f9fa' }}>
                                <div className="d-flex align-items-center mb-3">
                                    <img
                                        src={inquiryItem.image || 'https://via.placeholder.com/80'}
                                        alt={inquiryItem.name}
                                        className="rounded me-3"
                                        style={{ width: '60px', height: '60px', objectFit: 'cover' }}
                                    />
                                    <div>
                                        <h6 className="mb-0 fw-bold">{inquiryItem.name}</h6>
                                        <small className="text-muted">
                                            {inquiryItem.requestData.type === 'booking' ? 'Event Booking' : 'Special Order'}
                                        </small>
                                    </div>
                                </div>

                                {inquiryItem.requestData.type === 'booking' ? (
                                    <>
                                        <p className="mb-1"><strong>Recipient:</strong> {inquiryItem.requestData.recipient_name}</p>
                                        <p className="mb-1"><strong>Occasion:</strong> {inquiryItem.requestData.occasion}</p>
                                        <p className="mb-1"><strong>Event Date:</strong> {inquiryItem.requestData.event_date}</p>
                                        {inquiryItem.requestData.addon && <p className="mb-1"><strong>Add-on:</strong> {inquiryItem.requestData.addon}</p>}
                                        {inquiryItem.requestData.message && <p className="mb-1"><strong>Message:</strong> {inquiryItem.requestData.message}</p>}
                                        <p className="mb-1"><strong>Venue:</strong> {inquiryItem.requestData.venue}</p>
                                        {inquiryItem.requestData.notes && <p className="mb-1"><strong>Details:</strong> {inquiryItem.requestData.notes}</p>}
                                    </>
                                ) : ( // Special Order
                                    <>
                                        <p className="mb-1"><strong>Recipient:</strong> {inquiryItem.requestData.recipient_name}</p>
                                        <p className="mb-1"><strong>Occasion:</strong> {inquiryItem.requestData.occasion}</p>
                                        {inquiryItem.requestData.event_date && <p className="mb-1"><strong>Event Date:</strong> {inquiryItem.requestData.event_date}</p>}
                                        {inquiryItem.requestData.addon && <p className="mb-1"><strong>Add-on:</strong> {inquiryItem.requestData.addon}</p>}
                                        {inquiryItem.requestData.notes && <p className="mb-1"><strong>Preferences:</strong> {inquiryItem.requestData.notes}</p>}
                                        {inquiryItem.requestData.message && <p className="mb-1"><strong>Message:</strong> {inquiryItem.requestData.message}</p>}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="col-lg-4">
                        <div className="order-summary-card">
                            <h5 className="fw-bold mb-4">Summary</h5>
                            <div className="summary-row">
                                <span>Inquiry Item</span>
                                <span>1</span>
                            </div>
                            <div className="summary-row">
                                <span>{deliveryMethod === 'pickup' ? 'Pickup' : 'Shipping Fee'}</span>
                                <span>{deliveryMethod === 'pickup' ? 'FREE' : `₱${dynamicShippingFee.toLocaleString()}`}</span>
                            </div>
                            <hr />
                            <div className="summary-row total">
                                <span>Total</span>
                                <span className="fw-bold fs-5">For Discussion</span>
                            </div>
                            <button
                                className="btn-place-order"
                                onClick={handleSubmitInquiry}
                                disabled={isProcessing || (deliveryMethod === 'delivery' && !isAddressReady)}
                            >
                                {isProcessing ? 'Submitting...' : 'Submit Inquiry'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

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

export default BookingCheckout;
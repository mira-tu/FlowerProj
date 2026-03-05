import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import InfoModal from '../components/InfoModal';
import '../styles/Shop.css';
import { supabase } from '../config/supabase';

const pickupTimes = ['9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'];

const BookingCheckout = ({ user }) => {
    const navigate = useNavigate();
    const [inquiryItems, setInquiryItems] = useState([]);
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

        if (parts.length >= 3) {
            province = parts[3] || '';
            city = parts[2];
            barangay = parts[1];
            street = parts[0];
        } else {
            street = addressString; // Fallback for incomplete addresses
        }
        return { street, barangay, city, province };
    }, []);

    useEffect(() => {
        const savedInquiry = localStorage.getItem('bookingCart');
        if (savedInquiry) {
            const parsedItems = JSON.parse(savedInquiry);

            if (parsedItems.length === 0) {
                navigate('/');
                return;
            }

            setInquiryItems(parsedItems);

            // Use the first item's venue for delivery estimates if available
            const firstItem = parsedItems[0];
            const addressString = firstItem?.venue || '';

            if (user && addressString) {
                const parsedAddress = parseAddress(addressString);
                setInquiryAddress({
                    label: 'Delivery Address',
                    name: user.user_metadata?.name || '',
                    phone: firstItem.contactNumber || user.user_metadata?.phone || '',
                    ...parsedAddress
                });
                setIsAddressReady(true);
            }
        } else {
            navigate('/');
        }
    }, [navigate, user, parseAddress]);

    useEffect(() => {
        const fetchFee = async () => {
            if (deliveryMethod === 'delivery' && inquiryAddress.barangay) {
                const { data, error } = await supabase
                    .from('barangay_fee')
                    .select('barangay_name, delivery_fee')
                    .ilike('barangay_name', `%${inquiryAddress.barangay}%`);

                if (error) {
                    console.error('Error fetching fee for barangay:', inquiryAddress.barangay, error);
                    setDynamicShippingFee(100); // Fallback on error
                } else if (data && data.length > 0) {
                    // Try to find an exact match first (case-insensitive)
                    const exactMatch = data.find(
                        item => item.barangay_name.toLowerCase() === inquiryAddress.barangay.toLowerCase()
                    );

                    if (exactMatch) {
                        setDynamicShippingFee(exactMatch.delivery_fee);
                    } else {
                        // Fallback to the first partial match
                        setDynamicShippingFee(data[0].delivery_fee);
                    }
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
    const handleSubmitInquiry = async () => {
        if (!user) {
            setInfoModal({ show: true, title: 'Login Required', message: 'You must be logged in to submit an inquiry.', linkTo: '/login', linkText: 'Log In' });
            return;
        }
        if (deliveryMethod === 'pickup' && (!selectedPickupDate || !selectedPickupTime)) {
            setInfoModal({ show: true, title: 'Missing Information', message: 'Please select a pickup date and time.' });
            return;
        }

        setIsProcessing(true);

        try {
            if (deliveryMethod === 'delivery') {
                if (!isAddressReady) {
                    setInfoModal({ show: true, title: 'Missing Address', message: 'An address for delivery is not available for this inquiry.' });
                    throw new Error('Address not ready');
                }
            }

            const request_number = `REQ-${user.id.substring(0, 4)}-${Date.now()}`;

            // Create submissions for every item in the cart
            const submissions = [];
            for (let index = 0; index < inquiryItems.length; index++) {
                const item = inquiryItems[index];

                // Upload inspiration image to Supabase Storage if it exists (base64)
                let uploadedImageUrl = null;
                if (item.inspirationImageBase64) {
                    try {
                        // Convert base64 to blob
                        const base64Data = item.inspirationImageBase64;
                        const response = await fetch(base64Data);
                        const blob = await response.blob();
                        const fileExt = blob.type.split('/')[1] || 'png';
                        const fileName = `inquiries/${user.id}-${Date.now()}-${index}.${fileExt}`;

                        const { error: uploadError } = await supabase.storage
                            .from('receipts')
                            .upload(fileName, blob);

                        if (!uploadError) {
                            const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(fileName);
                            uploadedImageUrl = urlData.publicUrl;
                        } else {
                            console.error('Error uploading inspiration image:', uploadError);
                        }
                    } catch (imgErr) {
                        console.error('Error processing inspiration image:', imgErr);
                    }
                }

                // Strip the large base64 from data to keep payload small
                const { inspirationImageBase64, ...cleanDetails } = item;

                submissions.push({
                    request_number: `${request_number}-${index + 1}`,
                    user_id: user.id,
                    type: item.serviceType === "Event/Special Request" ? "booking" : item.serviceType,
                    contact_number: item.contactNumber,
                    status: 'pending',
                    delivery_method: deliveryMethod,
                    pickup_time: deliveryMethod === 'pickup' ? `${selectedPickupDate} - ${selectedPickupTime}` : null,
                    shipping_fee: deliveryMethod === 'pickup' ? 0 : dynamicShippingFee,
                    data: { ...cleanDetails, image_url: uploadedImageUrl },
                    image_url: uploadedImageUrl,
                    notes: item.specialInstructions || null,
                });
            }

            const { error } = await supabase.from('requests').insert(submissions);
            if (error) throw error;

            localStorage.removeItem('bookingCart');
            localStorage.removeItem(`bookingCart_${user.id}`);

            // Add notification for inquiry submission
            const notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
            const newNotification = {
                id: `notif-${Date.now()}`,
                type: 'request',
                title: 'Inquiry Submitted Successfully!',
                message: `You successfully submitted ${inquiryItems.length} Custom Order(s). Your inquiry has been submitted and is pending review.`,
                icon: 'fa-file-alt',
                timestamp: new Date().toISOString(),
                read: false,
                link: `/profile?menu=orders`
            };
            localStorage.setItem('notifications', JSON.stringify([newNotification, ...notifications]));

            navigate(`/profile?menu=orders`);
        } catch (error) {
            console.error('Error submitting inquiry:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    if (inquiryItems.length === 0) {
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
                                    <small className="text-muted mt-2 d-block"><i className="fas fa-map-marker-alt me-1"></i>Pickup Location: Jocery's Flower Shop, 63 San Jose Road, Zamboanga City</small>
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
                                            <p className='mb-0'><strong>Address:</strong> {`${inquiryAddress.street}, ${inquiryAddress.barangay}, ${inquiryAddress.city}`}</p>
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
                                {inquiryItems.map((item, idx) => (
                                    <div key={item.id || idx} className="mb-4 pb-3 border-bottom">
                                        <div className="d-flex align-items-center mb-3">
                                            <img
                                                src={item.inspirationImageBase64 || 'https://via.placeholder.com/80?text=No+Ref'}
                                                alt={item.serviceType}
                                                className="rounded me-3"
                                                style={{ width: '60px', height: '60px', objectFit: 'cover' }}
                                            />
                                            <div>
                                                <h6 className="mb-0 fw-bold">{item.occasion} - {item.arrangementType}</h6>
                                                <small className="text-muted d-block">
                                                    {item.serviceType}
                                                </small>
                                            </div>
                                        </div>

                                        <p className="mb-1"><strong>Customer:</strong> {item.customerName}</p>
                                        <p className="mb-1"><strong>Event Date:</strong> {item.eventDate}</p>
                                        <p className="mb-1"><strong>Location:</strong> {item.venue}</p>
                                        {item.flowers && <p className="mb-1"><strong>Flowers:</strong> {item.flowers}</p>}
                                        {item.specialInstructions && <p className="mb-1"><strong>Details:</strong> {item.specialInstructions}</p>}
                                    </div>
                                ))}
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
        </div >
    );
};

export default BookingCheckout;
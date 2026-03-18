import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import InfoModal from '../components/InfoModal';
import CheckoutAddressSelection from '../components/CheckoutAddressSelection';
import MultiAddressDeliverySection from '../components/MultiAddressDeliverySection';
import '../styles/Shop.css';
import { supabase } from '../config/supabase';
import {
    buildAddressFeeMap,
    buildMultiDeliveryDestinations,
    calculateDeliveryFee,
    createDeliveryAssignments,
    syncDeliveryAssignments,
} from '../utils/deliveryDestinations';

const pickupTimes = ['9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'];
const DEFAULT_SHIPPING_FEE = 100;

const getBookingItemTitle = (item = {}) => (
    item.name
    || item.arrangementSummary
    || item.arrangementType
    || (Array.isArray(item.arrangementTypes) ? item.arrangementTypes.join(', ') : '')
    || `${item.occasion || 'Custom Order'} Arrangement`
);

const normalizeInquiryItems = (items = []) => (
    (Array.isArray(items) ? items : []).map((item, index) => ({
        ...item,
        id: item?.id || `booking-${index + 1}`,
        qty: 1,
        name: getBookingItemTitle(item),
    }))
);

const buildBookingAssignments = (items = [], fallbackAddressId = null) => (
    createDeliveryAssignments(items, fallbackAddressId).map((assignment) => ({
        ...assignment,
        addressId: items?.[assignment.itemIndex]?.address_id ?? assignment.addressId ?? fallbackAddressId ?? '',
    }))
);

const syncBookingAssignments = (items = [], existingAssignments = [], fallbackAddressId = null) => {
    const syncedAssignments = syncDeliveryAssignments(items, existingAssignments, fallbackAddressId);
    const existingByKey = new Map((existingAssignments || []).map((assignment) => [assignment.unitKey, assignment]));

    return syncedAssignments.map((assignment) => ({
        ...assignment,
        addressId:
            existingByKey.get(assignment.unitKey)?.addressId
            ?? items?.[assignment.itemIndex]?.address_id
            ?? assignment.addressId
            ?? fallbackAddressId
            ?? '',
    }));
};

const buildBookingSummary = (items = []) => {
    const normalizedItems = Array.isArray(items) ? items : [];
    const combinedOccasions = Array.from(
        new Set(
            normalizedItems
                .map((item) => String(item?.occasion || '').trim())
                .filter(Boolean)
        )
    );
    const combinedDates = Array.from(
        new Set(
            normalizedItems
                .map((item) => String(item?.eventDate || '').trim())
                .filter(Boolean)
        )
    );

    return {
        itemCount: normalizedItems.length,
        combinedOccasions,
        combinedDates,
        summaryLabel: normalizedItems.length > 1
            ? `${normalizedItems.length} custom order items`
            : (normalizedItems[0]?.occasion || 'Custom Order'),
    };
};

const BookingCheckout = ({ user }) => {
    const navigate = useNavigate();
    const [inquiryItems, setInquiryItems] = useState([]);
    const [deliveryMethod, setDeliveryMethod] = useState('delivery');
    const [selectedPickupDate, setSelectedPickupDate] = useState('');
    const [selectedPickupTime, setSelectedPickupTime] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '', linkTo: '', linkText: '' });
    const [address, setAddress] = useState({
        name: '',
        phone: '',
        street: '',
        barangay: '',
        city: '',
        province: ''
    });
    const [selectedAddressId, setSelectedAddressId] = useState(null);
    const [savedAddresses, setSavedAddresses] = useState([]);
    const [barangayFees, setBarangayFees] = useState([]);
    const [multiAddressEnabled, setMultiAddressEnabled] = useState(false);
    const [deliveryAssignments, setDeliveryAssignments] = useState([]);

    const showInfoModal = (title, message, linkTo = '', linkText = '') => {
        setInfoModal({ show: true, title, message, linkTo, linkText });
    };

    useEffect(() => {
        const cartKey = `bookingCart_${user?.id || 'guest'}`;
        const savedInquiry = localStorage.getItem('bookingCart') || localStorage.getItem(cartKey);

        if (!savedInquiry) {
            navigate('/');
            return;
        }

        try {
            const parsedItems = JSON.parse(savedInquiry);
            const normalizedItems = normalizeInquiryItems(parsedItems);

            if (!normalizedItems.length) {
                navigate('/');
                return;
            }

            setInquiryItems(normalizedItems);
        } catch (error) {
            console.error('Error parsing booking checkout items:', error);
            navigate('/');
        }
    }, [navigate, user]);

    useEffect(() => {
        const fetchBarangayFees = async () => {
            try {
                const { data, error } = await supabase
                    .from('barangay_fee')
                    .select('barangay_name, delivery_fee');

                if (error) throw error;
                setBarangayFees(data || []);
            } catch (error) {
                console.error('Error fetching barangay fees:', error);
                setBarangayFees([]);
            }
        };

        fetchBarangayFees();
    }, []);

    useEffect(() => {
        if (deliveryMethod !== 'delivery') {
            setMultiAddressEnabled(false);
            return;
        }

        setDeliveryAssignments((prevAssignments) => {
            if (!prevAssignments.length) {
                return buildBookingAssignments(inquiryItems, selectedAddressId);
            }

            return syncBookingAssignments(inquiryItems, prevAssignments, selectedAddressId);
        });
    }, [deliveryMethod, inquiryItems, selectedAddressId]);

    useEffect(() => {
        if (deliveryMethod !== 'delivery') {
            return;
        }

        const presetAddressIds = Array.from(
            new Set(
                inquiryItems
                    .map((item) => String(item?.address_id || '').trim())
                    .filter(Boolean)
            )
        );

        if (presetAddressIds.length > 1) {
            setMultiAddressEnabled(true);
        }
    }, [deliveryMethod, inquiryItems]);

    const addressFeeMap = useMemo(
        () => buildAddressFeeMap(savedAddresses, barangayFees),
        [savedAddresses, barangayFees]
    );

    const dynamicShippingFee = useMemo(() => {
        if (!selectedAddressId) {
            return DEFAULT_SHIPPING_FEE;
        }

        return addressFeeMap[String(selectedAddressId)] ?? DEFAULT_SHIPPING_FEE;
    }, [addressFeeMap, selectedAddressId]);

    const shippingFee = useMemo(() => calculateDeliveryFee({
        deliveryMethod,
        subtotal: 0,
        freeShippingThreshold: Number.POSITIVE_INFINITY,
        selectedAddressId,
        multiAddressEnabled,
        assignments: deliveryAssignments,
        addressFeeMap: Object.keys(addressFeeMap).length
            ? addressFeeMap
            : (selectedAddressId ? { [selectedAddressId]: dynamicShippingFee } : {}),
    }), [addressFeeMap, deliveryAssignments, deliveryMethod, dynamicShippingFee, multiAddressEnabled, selectedAddressId]);

    const inquirySummary = useMemo(() => buildBookingSummary(inquiryItems), [inquiryItems]);

    const handleSubmitInquiry = async () => {
        if (!user) {
            showInfoModal('Login Required', 'You must be logged in to submit a custom order.', '/login', 'Log In');
            return;
        }

        if (deliveryMethod === 'pickup' && (!selectedPickupDate || !selectedPickupTime)) {
            showInfoModal('Missing Information', 'Please select a pickup date and time.');
            return;
        }

        if (deliveryMethod === 'delivery' && !selectedAddressId) {
            showInfoModal('Missing Address', 'Please select a saved address before submitting your custom order.');
            return;
        }

        if (deliveryMethod === 'delivery' && multiAddressEnabled) {
            const hasIncompleteAssignment = deliveryAssignments.some((assignment) => !assignment.addressId);
            if (hasIncompleteAssignment) {
                showInfoModal('Incomplete Delivery Stops', 'Please assign an address to every custom order item before submitting.');
                return;
            }
        }

        setIsProcessing(true);

        try {
            const multiDeliveryDestinations = deliveryMethod === 'delivery' && multiAddressEnabled
                ? buildMultiDeliveryDestinations({
                    assignments: deliveryAssignments,
                    addresses: savedAddresses,
                    addressFeeMap: Object.keys(addressFeeMap).length
                        ? addressFeeMap
                        : (selectedAddressId ? { [selectedAddressId]: dynamicShippingFee } : {}),
                })
                : [];

            const uploadedItems = await Promise.all(inquiryItems.map(async (item, index) => {
                let uploadedImageUrl = item.image_url || null;

                if (item.inspirationImageBase64?.startsWith?.('data:image')) {
                    try {
                        const response = await fetch(item.inspirationImageBase64);
                        const blob = await response.blob();
                        const fileExt = blob.type.split('/')[1] || 'png';
                        const fileName = `booking-inspirations/${user.id}-${Date.now()}-${index}.${fileExt}`;

                        const { error: uploadError } = await supabase.storage
                            .from('request-images')
                            .upload(fileName, blob, { contentType: blob.type || 'image/png' });

                        if (uploadError) {
                            console.error('Error uploading booking inspiration image:', uploadError);
                        } else {
                            const { data: urlData } = supabase.storage.from('request-images').getPublicUrl(fileName);
                            uploadedImageUrl = urlData?.publicUrl || null;
                        }
                    } catch (imageError) {
                        console.error('Error preparing booking inspiration image:', imageError);
                    }
                }

                const { inspirationImageBase64, deliveryAddress, ...cleanItem } = item;

                return {
                    ...cleanItem,
                    image_url: uploadedImageUrl,
                    deliveryAddress: deliveryAddress || null,
                };
            }));

            const requestNumber = `REQ-${user.id.substring(0, 4)}-${Date.now()}`;
            const primaryDestination = multiDeliveryDestinations[0] || null;
            const firstItem = uploadedItems[0] || {};
            const pickupDateTime = deliveryMethod === 'pickup'
                ? `${selectedPickupDate} - ${selectedPickupTime}`
                : null;
            const commonNotes = uploadedItems
                .map((item) => String(item?.specialInstructions || '').trim())
                .filter(Boolean)
                .join('\n\n');

            const newRequest = {
                request_number: requestNumber,
                user_id: user.id,
                type: 'booking',
                status: 'pending',
                contact_number: primaryDestination?.recipient_phone || firstItem.contactNumber || address.phone || null,
                delivery_method: deliveryMethod,
                pickup_time: pickupDateTime,
                shipping_fee: shippingFee,
                image_url: firstItem.image_url || null,
                notes: commonNotes || null,
                data: {
                    items: uploadedItems,
                    item_count: uploadedItems.length,
                    summary_label: inquirySummary.summaryLabel,
                    combined_occasions: inquirySummary.combinedOccasions,
                    combined_dates: inquirySummary.combinedDates,
                    recipientName: firstItem.recipientName || null,
                    occasion: firstItem.occasion || null,
                    eventDate: firstItem.eventDate || null,
                    eventTime: firstItem.eventTime || null,
                    venue: firstItem.venue || null,
                    arrangementSummary: firstItem.arrangementSummary || firstItem.arrangementType || null,
                    arrangementSelections: Array.isArray(firstItem.arrangementSelections) ? firstItem.arrangementSelections : [],
                    selectedFlowers: firstItem.selectedFlowers || [],
                    flowers: firstItem.flowers || null,
                    colorPreference: firstItem.colorPreference || null,
                    specialInstructions: firstItem.specialInstructions || null,
                    address: deliveryMethod === 'delivery' ? address : null,
                    address_id: deliveryMethod === 'delivery' ? (primaryDestination?.address_id || selectedAddressId) : null,
                    multi_delivery_destinations: multiDeliveryDestinations,
                    delivery_method: deliveryMethod,
                    pickup_time: pickupDateTime,
                    shipping_fee: shippingFee,
                },
            };

            const { error } = await supabase.from('requests').insert([newRequest]);
            if (error) throw error;

            try {
                await supabase
                    .from('notifications')
                    .insert([{
                        user_id: user.id,
                        type: 'request',
                        title: 'Custom Order Submitted',
                        message: `Your custom order request #${requestNumber} has been submitted and is waiting for review.`,
                        link: `/request-tracking/${requestNumber}`,
                    }]);
            } catch (notificationError) {
                console.error('Error creating booking notification:', notificationError);
            }

            const notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
            const newNotification = {
                id: `notif-${Date.now()}`,
                type: 'request',
                title: 'Custom Order Submitted',
                message: `Your request #${requestNumber} has been submitted and is pending review.`,
                icon: 'fa-file-alt',
                timestamp: new Date().toISOString(),
                read: false,
                link: `/request-tracking/${requestNumber}`
            };
            localStorage.setItem('notifications', JSON.stringify([newNotification, ...notifications]));

            localStorage.removeItem('bookingCart');
            localStorage.removeItem(`bookingCart_${user.id}`);
            localStorage.removeItem(`bookSelection_${user.id}`);

            navigate(`/request-tracking/${requestNumber}`);
        } catch (error) {
            console.error('Error submitting custom order:', error);
            showInfoModal('Submission Failed', error.message || 'There was an error submitting your custom order. Please try again.');
        } finally {
            setIsProcessing(false);
        }
    };

    if (inquiryItems.length === 0 && !isProcessing) {
        return (
            <div className="checkout-container">
                <div className="container">
                    <div className="empty-state">
                        <div className="empty-state-icon">
                            <i className="fas fa-file-invoice"></i>
                        </div>
                        <h3>No custom orders selected</h3>
                        <p>Please add custom orders to your cart first.</p>
                        <Link to="/book-event" className="btn-shop-now">Create a Custom Order</Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="checkout-container">
            <div className="container">
                <div className="checkout-header">
                    <i className="fas fa-file-invoice fa-lg"></i>
                    <h1>Confirm Custom Order</h1>
                </div>

                <div className="row g-4">
                    <div className="col-lg-8">
                        <div className="checkout-section">
                            <h5 className="section-title">
                                <i className="fas fa-truck"></i> Delivery / Pickup Preference
                            </h5>

                            <div className="d-flex gap-3 mb-3">
                                <div
                                    className={`payment-option flex-grow-1 ${deliveryMethod === 'delivery' ? 'selected' : ''}`}
                                    onClick={() => setDeliveryMethod('delivery')}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="payment-icon"><i className="fas fa-truck"></i></div>
                                    <div className="payment-info"><h6>Delivery</h6><p>Deliver to an address</p></div>
                                    <div className="form-check ms-auto"><input type="radio" className="form-check-input" checked={deliveryMethod === 'delivery'} readOnly /></div>
                                </div>
                                <div
                                    className={`payment-option flex-grow-1 ${deliveryMethod === 'pickup' ? 'selected' : ''}`}
                                    onClick={() => setDeliveryMethod('pickup')}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="payment-icon"><i className="fas fa-store"></i></div>
                                    <div className="payment-info"><h6>Pick Up</h6><p>Pick up at our store</p></div>
                                    <div className="form-check ms-auto"><input type="radio" className="form-check-input" checked={deliveryMethod === 'pickup'} readOnly /></div>
                                </div>
                            </div>

                            {deliveryMethod === 'pickup' && (
                                <div className="mt-3 p-3 rounded" style={{ background: '#f8f9fa' }}>
                                    <label className="form-label fw-bold">
                                        <i className="fas fa-clock me-2" style={{ color: 'var(--shop-pink)' }}></i>
                                        Select Pickup Date & Time
                                    </label>
                                    <input
                                        type="date"
                                        className="form-control mb-3"
                                        value={selectedPickupDate}
                                        min={new Date().toISOString().split('T')[0]}
                                        onKeyDown={(event) => event.preventDefault()}
                                        onChange={(event) => {
                                            const selected = event.target.value;
                                            const date = new Date(selected);
                                            const day = date.getUTCDay();
                                            if (day === 0 || day === 6) {
                                                showInfoModal('Invalid Date', 'Pickup is only available on weekdays (Monday to Friday).');
                                                setSelectedPickupDate('');
                                            } else {
                                                setSelectedPickupDate(selected);
                                            }
                                        }}
                                    />
                                    <div className="d-flex flex-wrap gap-2">
                                        {pickupTimes.map((time) => (
                                            <button
                                                key={time}
                                                type="button"
                                                className={`btn btn-sm rounded-pill px-3 ${selectedPickupTime === time ? 'btn-primary' : 'btn-outline-secondary'}`}
                                                style={selectedPickupTime === time ? { background: 'var(--shop-pink)', border: 'none' } : {}}
                                                onClick={() => setSelectedPickupTime(time)}
                                            >
                                                {time}
                                            </button>
                                        ))}
                                    </div>
                                    <small className="text-muted mt-2 d-block">
                                        <i className="fas fa-map-marker-alt me-1"></i>
                                        Pickup Location: Jocerry&apos;s Flower Shop, 63 San Jose Road, Zamboanga City
                                    </small>
                                </div>
                            )}
                        </div>

                        {deliveryMethod === 'delivery' && (
                            <>
                                <CheckoutAddressSelection
                                    user={user}
                                    address={address}
                                    setAddress={setAddress}
                                    selectedAddressId={selectedAddressId}
                                    setSelectedAddressId={setSelectedAddressId}
                                    showInfoModal={showInfoModal}
                                    onAddressesLoaded={setSavedAddresses}
                                />

                                <MultiAddressDeliverySection
                                    checkoutItems={inquiryItems}
                                    savedAddresses={savedAddresses}
                                    selectedAddressId={selectedAddressId}
                                    enabled={multiAddressEnabled}
                                    setEnabled={setMultiAddressEnabled}
                                    assignments={deliveryAssignments}
                                    setAssignments={setDeliveryAssignments}
                                />
                            </>
                        )}

                        <div className="checkout-section">
                            <h5 className="section-title"><i className="fas fa-info-circle"></i> Inquiry Details</h5>
                            <div className="p-3 rounded" style={{ backgroundColor: '#f8f9fa' }}>
                                {inquiryItems.map((item, idx) => (
                                    <div key={item.id || idx} className="mb-4 pb-3 border-bottom">
                                        <div className="d-flex align-items-center mb-3">
                                            <img
                                                src={item.inspirationImageBase64 || item.image_url || 'https://via.placeholder.com/80?text=No+Ref'}
                                                alt={item.serviceType}
                                                className="rounded me-3"
                                                style={{ width: '60px', height: '60px', objectFit: 'cover' }}
                                            />
                                            <div>
                                                <h6 className="mb-0 fw-bold">
                                                    {item.occasion} - {item.arrangementSummary || item.arrangementType || (Array.isArray(item.arrangementTypes) ? item.arrangementTypes.join(', ') : 'Custom Arrangement')}
                                                </h6>
                                                <small className="text-muted d-block">{item.serviceType}</small>
                                            </div>
                                        </div>

                                        <p className="mb-1"><strong>Customer:</strong> {item.customerName}</p>
                                        {item.recipientName && <p className="mb-1"><strong>Recipient:</strong> {item.recipientName}</p>}
                                        <p className="mb-1">
                                            <strong>Event Date:</strong> {item.eventDate}
                                            {item.eventTime && ` at ${item.eventTime}`}
                                        </p>
                                        <p className="mb-1"><strong>Event Venue / Location:</strong> {item.venue}</p>
                                        <p className="mb-1"><strong>Total Quantity:</strong> {item.arrangementQuantity || 1}</p>
                                        {item.flowerQuantity && <p className="mb-1"><strong>No. of Flower Pieces:</strong> {item.flowerQuantity}</p>}
                                        {item.flowers && <p className="mb-1"><strong>Preferred Flowers:</strong> {item.flowers}</p>}
                                        {item.colorPreference && <p className="mb-1"><strong>Color Theme:</strong> {item.colorPreference}</p>}
                                        {item.specialInstructions && <p className="mb-1 mt-2"><strong>Details:</strong> {item.specialInstructions}</p>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="col-lg-4">
                        <div className="order-summary-card">
                            <h5 className="fw-bold mb-4">Summary</h5>
                            <div className="summary-row">
                                <span>Inquiry Items</span>
                                <span>{inquiryItems.length}</span>
                            </div>
                            <div className="summary-row">
                                <span>{deliveryMethod === 'pickup' ? 'Pickup' : 'Delivery Fee'}</span>
                                <span>{deliveryMethod === 'pickup' ? 'FREE' : `PHP ${shippingFee.toLocaleString()}`}</span>
                            </div>
                            <hr />
                            <div className="summary-row total">
                                <span>Total</span>
                                <span className="fw-bold fs-5">For Discussion</span>
                            </div>
                            <button
                                className="btn-place-order"
                                onClick={handleSubmitInquiry}
                                disabled={isProcessing || (deliveryMethod === 'delivery' && !selectedAddressId)}
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

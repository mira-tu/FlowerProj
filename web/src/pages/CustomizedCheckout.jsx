import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import '../styles/Shop.css';
import { supabase } from '../config/supabase';
import qrCodeImage from '../assets/qr-code-1.jpg';

const paymentMethods = [
    { id: 'gcash', name: 'GCash', description: 'Pay via GCash e-wallet', icon: 'fa-wallet' },
];

const pickupTimes = ['9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'];

const CustomizedCheckout = ({ user }) => {
    const navigate = useNavigate();
    const [checkoutItems, setCheckoutItems] = useState([]);
    const [selectedPayment, setSelectedPayment] = useState('gcash');
    const [deliveryMethod, setDeliveryMethod] = useState('delivery');
    const [selectedPickupTime, setSelectedPickupTime] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [showQRModal, setShowQRModal] = useState(false);
    const [receiptFile, setReceiptFile] = useState(null);
    const [receiptPreview, setReceiptPreview] = useState(null);

    const [address, setAddress] = useState({
        name: '',
        phone: '',
        street: '',
        barangay: '',
        city: '',
        province: ''
    });
    const [savedAddresses, setSavedAddresses] = useState([]);
    const [selectedAddressId, setSelectedAddressId] = useState(null);
    const [dynamicShippingFee, setDynamicShippingFee] = useState(100);

    const handleAddressSelect = useCallback((addressId, addresses) => {
        if (!addresses) return;
        const selectedAddr = addresses.find(addr => String(addr.id) === String(addressId));
        if (selectedAddr) {
            setAddress({
                name: selectedAddr.name || '',
                phone: selectedAddr.phone || '',
                street: selectedAddr.street || '',
                barangay: selectedAddr.barangay || '',
                city: selectedAddr.city || '',
                province: selectedAddr.province || '',
            });
            setSelectedAddressId(selectedAddr.id);
        }
    }, []);

    useEffect(() => {
        const fetchAddresses = async () => {
            if (user) {
                const { data, error } = await supabase
                    .from('addresses')
                    .select('*')
                    .eq('user_id', user.id);

                if (error) {
                    console.error('Error fetching addresses:', error);
                    return;
                }
                
                setSavedAddresses(data);

                if (data && data.length > 0) {
                    const defaultAddress = data.find(addr => addr.is_default) || data[0];
                    if (defaultAddress) {
                        handleAddressSelect(defaultAddress.id, data);
                    }
                } else {
                    setAddress({
                        name: user?.user_metadata?.name || user?.email || '',
                        phone: user?.user_metadata?.phone || '',
                        street: '',
                        barangay: '',
                        city: '',
                        province: '',
                    });
                    setSelectedAddressId(null);
                }
            } else {
                setSavedAddresses([]);
                setAddress({ name: '', phone: '', street: '', barangay: '', city: '', province: '' });
                setSelectedAddressId(null);
            }
        };

        fetchAddresses();
    }, [user, handleAddressSelect]);
    
    useEffect(() => {
        const fetchFee = async () => {
            if (deliveryMethod === 'delivery' && address.barangay) {
                const { data, error } = await supabase
                    .from('barangay_fee')
                    .select('delivery_fee')
                    .ilike('barangay_name', `%${address.barangay}%`);

                if (error) {
                    console.error('Error fetching fee for barangay:', address.barangay, error);
                    setDynamicShippingFee(100); // Fallback on error
                } else if (data && data.length > 0) {
                    setDynamicShippingFee(data[0].delivery_fee); // Use the first match
                } else {
                    console.warn(`No fee found for barangay: ${address.barangay}. Using default fee.`);
                    setDynamicShippingFee(100); // Fallback if no match found
                }
            }
        };

        fetchFee();
    }, [address.barangay, deliveryMethod]);

    useEffect(() => {
        const savedCheckoutItems = localStorage.getItem('checkoutItems');
        if (savedCheckoutItems) {
            setCheckoutItems(JSON.parse(savedCheckoutItems));
        }
    }, []);

    const subtotal = checkoutItems.reduce((acc, item) => acc + (item.price * (item.qty || 1)), 0);
    const shippingFee = deliveryMethod === 'pickup' ? 0 : (subtotal >= 2000 ? 0 : dynamicShippingFee);
    const total = subtotal + shippingFee;

    const handlePaymentChange = (paymentId) => {
        setSelectedPayment(paymentId);
        if (paymentId === 'gcash') {
            setShowQRModal(true);
        }
    };

    const handleReceiptUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            setReceiptFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setReceiptPreview(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handlePlaceOrder = async () => {
        if (!user) {
            alert('You must be logged in to place an order. Please log in or sign up.');
            navigate('/login');
            return;
        }
    
        if (deliveryMethod === 'pickup' && !selectedPickupTime) {
            alert('Please select a pickup time');
            return;
        }
        
        if (deliveryMethod === 'delivery' && !selectedAddressId) {
            alert('Please select a saved address for delivery.');
            return;
        }
    
        if (selectedPayment === 'gcash' && !receiptFile) {
            alert('Please upload your GCash payment receipt');
            return;
        }
    
        setIsProcessing(true);
    
        // 1. Upload receipt if GCash
        let uploadedReceiptUrl = null;
        if (receiptFile && selectedPayment === 'gcash') {
            const fileExt = receiptFile.name.split('.').pop();
            const fileName = `receipts/${user.id}-${Date.now()}.${fileExt}`;
    
            const { error: uploadError } = await supabase.storage
                .from('receipts')
                .upload(fileName, receiptFile);
    
            if (uploadError) {
                console.error('Error uploading receipt:', uploadError);
                alert('There was an error uploading your receipt. Please try again.');
                setIsProcessing(false);
                return;
            }
            const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(fileName);
            uploadedReceiptUrl = urlData.publicUrl;
        }

        // 2. Upload all images from the cart
        const uploadedItems = await Promise.all(checkoutItems.map(async (item) => {
            if (item.image && item.image.startsWith('data:image')) {
                const base64WithoutPrefix = item.image.split(',')[1];
                const imageBuffer = Uint8Array.from(atob(base64WithoutPrefix), (c) => c.charCodeAt(0));
                const imgFileName = `customized-bouquets/${user.id}-${Date.now()}-${Math.random()}.png`;

                const { error } = await supabase.storage
                    .from('request-images')
                    .upload(imgFileName, imageBuffer, { contentType: 'image/png', upsert: false });

                if (error) {
                    console.error('Error uploading bouquet image:', error);
                    return { ...item, image_url: null, image: undefined }; 
                }
                
                const { data: publicUrlData } = supabase.storage.from('request-images').getPublicUrl(imgFileName);
                return { ...item, image_url: publicUrlData.publicUrl, image: undefined };
            }
            return item;
        }));
    
        // 3. Prepare the request data
        const request_number = `CUS-${user.id.substring(0, 4)}-${Date.now()}`;
        const payment_status = selectedPayment === 'gcash' ? 'waiting_for_confirmation' : 'to_pay';

        const newRequest = {
            request_number: request_number,
            user_id: user.id,
            type: 'customized',
            status: 'pending',
            contact_number: address.phone,
            final_price: total,
            data: {
                items: uploadedItems,
                address: deliveryMethod === 'delivery' ? address : null,
                address_id: deliveryMethod === 'delivery' ? selectedAddressId : null,
                delivery_method: deliveryMethod,
                pickup_time: deliveryMethod === 'pickup' ? selectedPickupTime : null,
                payment_method: selectedPayment,
                payment_status: payment_status,
                subtotal: subtotal,
                shipping_fee: shippingFee,
                receipt_url: uploadedReceiptUrl,
            },
        };
    
        // 4. Insert into `requests` table
        const { data, error } = await supabase
            .from('requests')
            .insert([newRequest])
            .select()
            .single();
    
        if (error) {
            console.error('Error creating request:', error);
            alert('There was an error placing your request. Please try again.');
            setIsProcessing(false);
            return;
        }

        // 5. Create notification
        const { error: notificationError } = await supabase
            .from('notifications')
            .insert([{
                user_id: user.id,
                type: 'request',
                title: 'Custom Bouquet Order Placed!',
                message: `Your request #${request_number} has been placed. We will review it shortly.`,
                link: `/customized-request-tracking/${request_number}`,
            }]);

        if (notificationError) {
            console.error('Error creating notification:', notificationError);
        }
    
        // 6. Clean up local storage
        localStorage.removeItem('customizedCart');
        localStorage.removeItem('checkoutItems');
    
        // 7. Navigate to tracking page
        navigate(`/customized-request-tracking/${request_number}`);
    };

    if (checkoutItems.length === 0 && !isProcessing) {
        return (
            <div className="checkout-container">
                <div className="container">
                    <div className="empty-state">
                        <div className="empty-state-icon">
                            <i className="fas fa-shopping-cart"></i>
                        </div>
                        <h3>No items to checkout</h3>
                        <p>Please add custom bouquets to your cart first.</p>
                        <Link to="/customized" className="btn-shop-now">Create a Bouquet</Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="checkout-container">
            <div className="container">
                <div className="checkout-header">
                    <i className="fas fa-lock fa-lg"></i>
                    <h1>Custom Bouquet Checkout</h1>
                </div>

                <div className="row">
                    <div className="col-lg-8">
                        <div className="checkout-section">
                            <h5 className="section-title">
                                <i className="fas fa-truck"></i>
                                Delivery Method
                            </h5>

                            <div className="d-flex gap-3 mb-3">
                                <div
                                    className={`payment-option flex-grow-1 ${deliveryMethod === 'delivery' ? 'selected' : ''}`}
                                    onClick={() => setDeliveryMethod('delivery')}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="payment-icon">
                                        <i className="fas fa-truck"></i>
                                    </div>
                                    <div className="payment-info">
                                        <h6>Delivery</h6>
                                        <p>We'll deliver to your address</p>
                                    </div>
                                    <div className="form-check ms-auto">
                                        <input
                                            type="radio"
                                            className="form-check-input"
                                            checked={deliveryMethod === 'delivery'}
                                            readOnly
                                        />
                                    </div>
                                </div>
                                <div
                                    className={`payment-option flex-grow-1 ${deliveryMethod === 'pickup' ? 'selected' : ''}`}
                                    onClick={() => setDeliveryMethod('pickup')}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="payment-icon">
                                        <i className="fas fa-store"></i>
                                    </div>
                                    <div className="payment-info">
                                        <h6>Pick Up</h6>
                                        <p>Pick up at our store</p>
                                    </div>
                                    <div className="form-check ms-auto">
                                        <input
                                            type="radio"
                                            className="form-check-input"
                                            checked={deliveryMethod === 'pickup'}
                                            readOnly
                                        />
                                    </div>
                                </div>
                            </div>

                            {deliveryMethod === 'pickup' && (
                                <div className="mt-3 p-3 rounded" style={{ background: '#f8f9fa' }}>
                                    <label className="form-label fw-bold">
                                        <i className="fas fa-clock me-2" style={{ color: 'var(--shop-pink)' }}></i>
                                        Select Pickup Time
                                    </label>
                                    <div className="d-flex flex-wrap gap-2">
                                        {pickupTimes.map(time => (
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
                                        Pickup Location: Jocery's Flower Shop, 123 Flower St., Quezon City
                                    </small>
                                </div>
                            )}
                        </div>

                        {deliveryMethod === 'delivery' && (
                            <div className="checkout-section">
                                <h5 className="section-title mb-3">
                                    <i className="fas fa-map-marker-alt"></i>
                                    Delivery Address
                                </h5>

                                {user ? (
                                    savedAddresses.length > 0 ? (
                                        <div className="mb-3">
                                            <label className="form-label small text-muted fw-bold">Select from your saved addresses</label>
                                            <select
                                                className="form-select"
                                                value={selectedAddressId || ''}
                                                onChange={(e) => handleAddressSelect(e.target.value, savedAddresses)}
                                            >
                                                {savedAddresses.map(addr => (
                                                    <option key={addr.id} value={addr.id}>
                                                        {addr.label} {addr.is_default && '(Default)'} - {`${addr.street}, ${addr.barangay}, ${addr.city}`}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : (
                                        <div className="alert alert-warning">
                                            <i className="fas fa-info-circle me-2"></i>
                                            You have no saved addresses. Please <Link to="/profile" state={{ activeMenu: 'addresses' }} style={{color: 'var(--shop-pink)'}}>add an address in your profile</Link> before proceeding.
                                        </div>
                                    )
                                ) : (
                                    <div className="alert alert-danger">
                                        <i className="fas fa-exclamation-triangle me-2"></i>
                                        Please <Link to="/login" style={{color: 'var(--shop-pink)'}}>log in</Link> to use the delivery option.
                                    </div>
                                )}
                                
                                {selectedAddressId && (
                                     <div className="p-3 rounded" style={{ background: '#f8f9fa' }}>
                                        <p className='mb-1'><strong>Recipient:</strong> {address.name}</p>
                                        <p className='mb-1'><strong>Phone:</strong> {address.phone}</p>
                                        <p className='mb-0'><strong>Address:</strong> {`${address.street}, ${address.barangay}, ${address.city}, ${address.province}`}</p>
                                     </div>
                                )}
                            </div>
                        )}

                        <div className="checkout-section">
                            <h5 className="section-title">
                                <i className="fas fa-box"></i>
                                Order Items ({checkoutItems.length})
                            </h5>

                            {checkoutItems.map((item, index) => (
                                <div key={index} className="checkout-item">
                                    <img
                                        src={item.image}
                                        alt={item.name}
                                        className="checkout-item-img"
                                        onError={(e) => e.target.src = 'https://via.placeholder.com/80'}
                                    />
                                    <div className="checkout-item-info">
                                        <div className="checkout-item-name">{item.name}</div>
                                        <div className="checkout-item-qty">Qty: {item.qty || 1}</div>
                                    </div>
                                    <div className="checkout-item-price">
                                        ₱{((item.price) * (item.qty || 1)).toLocaleString()}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="checkout-section">
                            <h5 className="section-title">
                                <i className="fas fa-credit-card"></i>
                                Payment Method
                            </h5>

                            <div className="payment-option selected">
                                <div className="payment-icon">
                                    <i className="fas fa-wallet"></i>
                                </div>
                                <div className="payment-info">
                                    <h6>GCash</h6>
                                    <p>Pay via GCash e-wallet</p>
                                </div>
                            </div>

                            <div className="mt-3 p-3 rounded" style={{ background: '#f8f9fa', border: '2px dashed var(--shop-pink)' }}>
                                <div className="text-center mb-3">
                                    <h6 className="fw-bold mb-2">
                                        <i className="fas fa-qrcode me-2" style={{ color: 'var(--shop-pink)' }}></i>
                                        Scan to Pay via GCash
                                    </h6>
                                    <button
                                        className="btn btn-sm btn-outline-primary"
                                        onClick={() => setShowQRModal(true)}
                                    >
                                        <i className="fas fa-eye me-2"></i>View QR Code
                                    </button>
                                </div>

                                <div className="mt-3">
                                    <label className="form-label fw-bold small">
                                        <i className="fas fa-receipt me-2" style={{ color: 'var(--shop-pink)' }}></i>
                                        Upload Payment Receipt (Screenshot)
                                    </label>
                                    <input
                                        type="file"
                                        className="form-control form-control-sm"
                                        accept="image/*"
                                        onChange={handleReceiptUpload}
                                        required
                                    />
                                    {receiptFile && (
                                        <div className="text-muted small mt-1">
                                            <i className="fas fa-check-circle text-success me-1"></i>
                                            File selected: {receiptFile.name}
                                        </div>
                                    )}
                                    {receiptPreview && (
                                        <div className="mt-2">
                                            <img
                                                src={receiptPreview}
                                                alt="Receipt Preview"
                                                style={{
                                                    maxWidth: '100%',
                                                    maxHeight: '200px',
                                                    borderRadius: '8px',
                                                    border: '1px solid #ddd'
                                                }}
                                            />
                                            <button
                                                className="btn btn-sm btn-link text-danger mt-1 p-0"
                                                onClick={() => {
                                                    setReceiptFile(null);
                                                    setReceiptPreview(null);
                                                }}
                                            >
                                                <i className="fas fa-times me-1"></i>Remove
                                            </button>
                                        </div>
                                    )}
                                    <small className="text-muted d-block mt-2">
                                        <i className="fas fa-info-circle me-1"></i>
                                        Please upload a screenshot of your GCash payment confirmation
                                    </small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="col-lg-4">
                        <div className="order-summary-card">
                            <h5 className="fw-bold mb-4">Order Summary</h5>

                            <div className="summary-row">
                                <span>Subtotal ({checkoutItems.reduce((acc, item) => acc + (item.qty || 1), 0)} items)</span>
                                <span>₱{subtotal.toLocaleString()}</span>
                            </div>
                            <div className="summary-row">
                                <span>{deliveryMethod === 'pickup' ? 'Pickup' : 'Shipping Fee'}</span>
                                <span>{shippingFee === 0 ? 'FREE' : `₱${shippingFee}`}</span>
                            </div>
                            {deliveryMethod === 'pickup' && selectedPickupTime && (
                                <div className="small mb-2" style={{ color: 'var(--shop-pink)' }}>
                                    <i className="fas fa-clock me-1"></i>
                                    Pickup: {selectedPickupTime}
                                </div>
                            )}
                            {shippingFee === 0 && deliveryMethod === 'delivery' && (
                                <div className="text-success small mb-2">
                                    <i className="fas fa-check-circle me-1"></i>
                                    Free shipping for orders ₱2,000+
                                </div>
                            )}

                            <div className="summary-row total">
                                <span>Total</span>
                                <span>₱{total.toLocaleString()}</span>
                            </div>

                            <button
                                className="btn-place-order"
                                onClick={handlePlaceOrder}
                                disabled={isProcessing || (deliveryMethod === 'delivery' && !selectedAddressId)}
                            >
                                {isProcessing ? (
                                    <>
                                        <span className="spinner-border spinner-border-sm me-2"></span>
                                        Processing...
                                    </>
                                ) : (
                                    <>Place Request</>
                                )}
                            </button>

                            <div className="text-center mt-3">
                                <small className="text-muted">
                                    <i className="fas fa-shield-alt me-1"></i>
                                    Your payment information is secure
                                </small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showQRModal && (
                <div className="modal-overlay" onClick={() => setShowQRModal(false)}>
                    <div className="modal-content-custom" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header-custom">
                            <h4>GCash Payment QR Code</h4>
                            <button className="modal-close" onClick={() => setShowQRModal(false)}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="modal-body-custom text-center">
                            <div className="mb-3">
                                <div
                                    style={{
                                        width: '250px',
                                        height: '250px',
                                        margin: '0 auto',
                                        background: '#fff',
                                        border: '2px solid #e0e0e0',
                                        borderRadius: '12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        position: 'relative'
                                    }}
                                >
                                    <img 
                                        src={qrCodeImage} 
                                        alt="GCash QR Code" 
                                        style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '10px' }} 
                                    />
                                </div>
                            </div>
                            <div className="p-3 rounded mb-3" style={{ background: '#f8f9fa' }}>
                                <h6 className="fw-bold mb-2">Payment Instructions:</h6>
                                <ol className="text-start small" style={{ paddingLeft: '20px' }}>
                                    <li>Open your GCash app</li>
                                    <li>Tap "Scan QR"</li>
                                    <li>Scan this QR code</li>
                                    <li>Enter the amount: <strong>₱{total.toLocaleString()}</strong></li>
                                    <li>Complete the payment</li>
                                    <li>Take a screenshot of the payment confirmation</li>
                                    <li>Upload the screenshot below</li>
                                </ol>
                            </div>
                            <div className="mb-3">
                                <label className="form-label fw-bold small">
                                    <i className="fas fa-receipt me-2" style={{ color: 'var(--shop-pink)' }}></i>
                                    Upload Payment Receipt
                                </label>
                                <input
                                    type="file"
                                    className="form-control form-control-sm"
                                    accept="image/*"
                                    onChange={handleReceiptUpload}
                                />
                                {receiptFile && (
                                    <div className="text-muted small mt-1">
                                        <i className="fas fa-check-circle text-success me-1"></i>
                                        File selected: {receiptFile.name}
                                    </div>
                                )}
                                {receiptPreview && (
                                    <div className="mt-2">
                                        <img
                                            src={receiptPreview}
                                            alt="Receipt Preview"
                                            style={{
                                                maxWidth: '100%',
                                                maxHeight: '150px',
                                                borderRadius: '8px',
                                                border: '1px solid #ddd'
                                            }}
                                        />
                                        <button
                                            className="btn btn-sm btn-link text-danger mt-1 p-0"
                                            onClick={() => {
                                                setReceiptFile(null);
                                                setReceiptPreview(null);
                                            }}
                                        >
                                            <i className="fas fa-times me-1"></i>Remove
                                        </button>
                                    </div>
                                )}
                            </div>
                            <button
                                className="btn w-100"
                                style={{ background: 'var(--shop-pink)', color: 'white' }}
                                onClick={() => setShowQRModal(false)}
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomizedCheckout;
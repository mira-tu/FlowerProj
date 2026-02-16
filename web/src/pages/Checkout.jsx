import React, { useState, useEffect, useCallback } from 'react';
import Select from 'react-select';
import { useNavigate, Link } from 'react-router-dom';
import '../styles/Shop.css';
import { supabase } from '../config/supabase';
import { formatPhoneNumber } from '../utils/format';
import InfoModal from '../components/InfoModal';
import qrCodeImage from '../assets/qr-code-1.jpg';

const paymentMethods = [
    { id: 'cod', name: 'Cash on Delivery', description: 'Pay when you receive', icon: 'fa-money-bill-wave' },
    { id: 'gcash', name: 'GCash', description: 'Pay via GCash e-wallet', icon: 'fa-wallet' },
];

const pickupTimes = ['9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'];

const Checkout = ({ setCart, user }) => {
    const navigate = useNavigate();
    const [checkoutItems, setCheckoutItems] = useState([]);
    const [orderType, setOrderType] = useState('ecommerce');
    const [selectedPayment, setSelectedPayment] = useState('cod');
    const [deliveryMethod, setDeliveryMethod] = useState('delivery');
    const [selectedPickupDate, setSelectedPickupDate] = useState('');
    const [selectedPickupTime, setSelectedPickupTime] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [showQRModal, setShowQRModal] = useState(false);
    const [receiptFile, setReceiptFile] = useState(null);
    const [receiptPreview, setReceiptPreview] = useState(null);
    const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '', linkTo: null, linkText: '', linkState: null });

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

    // Address Editing State
    const [showAddressModal, setShowAddressModal] = useState(false);
    const [isEditingAddress, setIsEditingAddress] = useState(false);
    const [addressForm, setAddressForm] = useState({
        id: null,
        label: 'Home',
        name: '',
        phone: '',
        street: '',
        barangay: '',
        city: '',
        province: '',
        zip: '',
        is_default: false
    });

    const [formErrors, setFormErrors] = useState({});

    const [barangays, setBarangays] = useState([]);
    const [selectedBarangay, setSelectedBarangay] = useState(null);
    const [addressLoading, setAddressLoading] = useState(false);

    const openAddressModal = (addressToEdit = null) => {
        if (addressToEdit) {
            setIsEditingAddress(true);
            setAddressForm({ ...addressToEdit });
        } else {
            setIsEditingAddress(false);
            setAddressForm({
                id: null,
                label: 'Home',
                name: user?.user_metadata?.name || user?.email || '',
                phone: user?.user_metadata?.phone || '',
                street: '',
                barangay: '',
                city: 'Zamboanga City',
                province: 'Zamboanga del Sur',
                zip: '7000',
                is_default: false
            });
            setSelectedBarangay(null);
        }
        setFormErrors({});
        setShowAddressModal(true);
    };

    // Fetch barangays for Zamboanga City when modal opens
    useEffect(() => {
        if (showAddressModal) {
            setAddressLoading(true);
            fetch(`https://psgc.gitlab.io/api/cities-municipalities/097332000/barangays/`)
                .then(response => response.json())
                .then(data => {
                    const barangayOptions = data.map(b => ({ value: b.code, label: b.name }));
                    setBarangays(barangayOptions);

                    // Pre-select barangay if editing
                    if (isEditingAddress && addressForm.barangay) {
                        const existingOption = barangayOptions.find(b => b.label === addressForm.barangay);
                        if (existingOption) {
                            setSelectedBarangay(existingOption);
                        }
                    }
                })
                .catch(error => console.error('Error fetching barangays:', error))
                .finally(() => setAddressLoading(false));
        } else {
            // setBarangays([]); // Keep loaded for better UX across adds
            // setSelectedBarangay(null); // Handled in openAddressModal
        }
    }, [showAddressModal, isEditingAddress]); // Removed addressForm.barangay to prevent loop, logic is better in openAddressModal or here once

    const selectStyles = {
        control: (provided) => ({
            ...provided,
            borderColor: '#dee2e6', // Bootstrap border color
            borderRadius: '0.375rem', // Bootstrap rounded
            padding: '2px', // Slight padding adjustment
            minHeight: '38px', // Match standard input height
            fontSize: '1rem',
        }),
        menu: (provided) => ({
            ...provided,
            zIndex: 1050, // Ensure dropdown appears above modal
        }),
    };


    const handleAddressFormChange = (e) => {
        const { name, value, type, checked } = e.target;
        setAddressForm(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSaveAddress = async (e) => {
        e.preventDefault();

        // Basic Validation
        if (!addressForm.street || !addressForm.barangay || !addressForm.city || !addressForm.province || !addressForm.phone || !addressForm.name) {
            alert('Please fill in all required fields.');
            return;
        }

        // Validate phone number (strip non-digits first)
        const cleanPhone = addressForm.phone.replace(/\D/g, '');
        const phoneRegex = /^09\d{9}$/;

        if (!phoneRegex.test(cleanPhone)) {
            setFormErrors({ phone: 'Please enter a valid mobile number (11 digits starting with 09)' });
            return;
        }

        setIsProcessing(true);

        // Destructure zip out to exclude it from payload, as it causes schema errors
        // eslint-disable-next-line no-unused-vars
        const { id, zip, ...addressData } = addressForm;

        const payload = {
            ...addressData,
            user_id: user.id
        };

        try {
            // If setting as default, first unset all other defaults for this user
            if (payload.is_default) {
                const { error: resetError } = await supabase
                    .from('addresses')
                    .update({ is_default: false })
                    .eq('user_id', user.id);

                if (resetError) throw resetError;
            }

            let error;
            let data;

            if (isEditingAddress && id) {
                // Update
                const { data: updatedData, error: updateError } = await supabase
                    .from('addresses')
                    .update(payload)
                    .eq('id', id)
                    .select();
                error = updateError;
                data = updatedData;
            } else {
                // Insert
                const { data: insertedData, error: insertError } = await supabase
                    .from('addresses')
                    .insert([payload])
                    .select();
                error = insertError;
                data = insertedData;
            }

            if (error) throw error;

            // Refresh addresses
            const { data: newAddresses, error: fetchError } = await supabase
                .from('addresses')
                .select('*')
                .eq('user_id', user.id);

            if (fetchError) throw fetchError;

            // Filter out soft-deleted addresses
            const activeAddresses = newAddresses.filter(addr => !addr.label.startsWith('[DEL]'));
            setSavedAddresses(activeAddresses);

            // Select the saved address
            if (data && data.length > 0) {
                handleAddressSelect(data[0].id, newAddresses);
            }

            setShowAddressModal(false);
            // alert(isEditingAddress ? 'Address updated successfully!' : 'Address added successfully!');

        } catch (err) {
            console.error('Error saving address:', err);
            alert('Failed to save address. ' + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

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

                // Filter out soft-deleted addresses (those starting with [DEL])
                const activeAddresses = data.filter(addr => !addr.label.startsWith('[DEL]'));
                setSavedAddresses(activeAddresses);

                if (activeAddresses && activeAddresses.length > 0) {
                    const defaultAddress = activeAddresses.find(addr => addr.is_default) || activeAddresses[0];
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
        const savedOrderType = localStorage.getItem('orderType');
        if (savedCheckoutItems) {
            setCheckoutItems(JSON.parse(savedCheckoutItems));
        }
        if (savedOrderType) {
            setOrderType(savedOrderType);
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
            setInfoModal({
                show: true,
                title: 'Login Required',
                message: 'You must be logged in to place an order.',
                linkTo: '/login',
                linkText: 'Log In'
            });
            return;
        }

        if (deliveryMethod === 'pickup' && (!selectedPickupDate || !selectedPickupTime)) {
            alert('Please select a pickup date and time');
            return;
        }

        if (deliveryMethod === 'delivery' && !selectedAddressId) {
            alert('Please select a saved address for delivery.');
            setIsProcessing(false);
            return;
        }

        if (selectedPayment === 'gcash' && !receiptFile) {
            alert('Please upload your GCash payment receipt');
            return;
        }

        setIsProcessing(true);

        let finalAddressId = selectedAddressId;

        let uploadedReceiptUrl = null;
        if (receiptFile && selectedPayment === 'gcash') {
            const fileExt = receiptFile.name.split('.').pop();
            const fileName = `${user.id}-${Date.now()}.${fileExt}`;
            const filePath = `public/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('receipts')
                .upload(filePath, receiptFile);

            if (uploadError) {
                console.error('Error uploading receipt:', uploadError);
                alert('There was an error uploading your receipt. Please try again.');
                setIsProcessing(false);
                return;
            }

            const { data: urlData } = supabase.storage
                .from('receipts')
                .getPublicUrl(filePath);

            if (!urlData || !urlData.publicUrl) {
                console.error('Error getting public URL for receipt');
                alert('Could not retrieve receipt URL. Please try again.');
                setIsProcessing(false);
                return;
            }

            uploadedReceiptUrl = urlData.publicUrl;
        }

        const order_number = `JFS-${user.id.substring(0, 8)}-${Date.now()}`;

        const newOrder = {
            created_at: new Date().toISOString(),
            order_number: order_number,
            user_id: user.id,
            address_id: deliveryMethod === 'delivery' ? finalAddressId : null,
            payment_method: selectedPayment,
            payment_status: selectedPayment === 'cod' ? 'to_pay' : 'waiting_for_confirmation',
            subtotal: subtotal,
            shipping_fee: shippingFee,
            total: total,
            status: 'pending',
            delivery_method: deliveryMethod,
            pickup_time: deliveryMethod === 'pickup' ? `${selectedPickupDate} - ${selectedPickupTime}` : null,
            receipt_url: uploadedReceiptUrl,
        };

        const { data, error } = await supabase
            .from('orders')
            .insert([newOrder])
            .select()
            .single();

        if (error) {
            console.error('Error creating order:', error);
            alert('There was an error placing your order. Please try again.');
            setIsProcessing(false);
            return;
        }
        const newOrderId = data.id; // Correct: Use data.id for the internal ID
        const newOrderNumber = data.order_number; // Correct: Use data.order_number for the human-readable number

        const orderItems = checkoutItems.map(item => ({
            order_id: newOrderId, // Correct: Link items using the internal ID
            product_id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.qty || 1,
            image_url: item.image_url || item.image || item.photo,
        }));

        const { error: itemsError } = await supabase
            .from('order_items')
            .insert(orderItems);

        if (itemsError) {
            console.error('Error inserting order items:', itemsError);
            alert('There was an error saving your order items. Please contact support and provide your order number.');
            return;
        }

        const notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
        const newNotification = {
            id: `notif-${Date.now()}`,
            type: 'order',
            title: 'Order Placed Successfully!',
            message: `Your order #${order_number} has been placed. ${selectedPayment === 'cod' ? 'Payment will be collected on delivery.' : 'Waiting for payment confirmation.'}`,
            icon: 'fa-shopping-bag',
            timestamp: new Date().toISOString(),
            read: false,
            link: `/order-tracking/${newOrderNumber}`
        };
        localStorage.setItem('notifications', JSON.stringify([newNotification, ...notifications]));

        const currentCart = JSON.parse(localStorage.getItem('cart') || '[]');
        const checkoutItemIds = checkoutItems.map(item => item.id);
        const remainingCart = currentCart.filter(item => !checkoutItemIds.includes(item.id));

        localStorage.setItem('cart', JSON.stringify(remainingCart));
        localStorage.removeItem('checkoutItems');
        localStorage.removeItem('orderType');

        if (setCart) setCart(remainingCart);

        // --- Send Order Confirmation Email via Gmail ---
        try {
            const { error: functionError } = await supabase.functions.invoke('send-gmail-email', {
                body: {
                    order_number: newOrderNumber,
                    order_items: checkoutItems,
                    total: total,
                    user_email: user.email,
                    delivery_method: deliveryMethod,
                    address: deliveryMethod === 'delivery' ? address : null,
                    pickup_time: deliveryMethod === 'pickup' ? `${selectedPickupDate} - ${selectedPickupTime}` : null,
                },
            });
            if (functionError) {
                // Non-blocking error, log it to the console
                console.error("Error sending Gmail confirmation email:", functionError.message);
            } else {
                console.log("Order confirmation email function (Gmail) invoked successfully.");
            }
        } catch (e) {
            console.error("Failed to invoke email function:", e.message);
        }
        // ---------------------------------------------

        navigate(`/order-success/${newOrderNumber}`);
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
                        <p>Please select items from your cart first</p>
                        <Link to="/cart" className="btn-shop-now">Go to Cart</Link>
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
                    <h1>Secure Checkout</h1>
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
                                        Select Pickup Date & Time
                                    </label>
                                    <input
                                        type="date"
                                        className="form-control mb-3"
                                        value={selectedPickupDate}
                                        min={new Date().toISOString().split('T')[0]}
                                        onChange={(e) => setSelectedPickupDate(e.target.value)}
                                    />
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
                                            <div className="d-flex justify-content-between align-items-center mb-2">
                                                <label className="form-label small text-muted fw-bold mb-0">Select from your saved addresses</label>
                                                <button
                                                    className="btn btn-sm btn-link text-decoration-none p-0"
                                                    onClick={() => openAddressModal()}
                                                    style={{ color: 'var(--shop-pink)' }}
                                                >
                                                    <i className="fas fa-plus-circle me-1"></i> Add New
                                                </button>
                                            </div>
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
                                            <div className="d-flex justify-content-between align-items-center">
                                                <div>
                                                    <i className="fas fa-info-circle me-2"></i>
                                                    You have no saved addresses.
                                                </div>
                                                <button
                                                    className="btn btn-sm btn-primary"
                                                    onClick={() => openAddressModal()}
                                                >
                                                    Add Address
                                                </button>
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    <div className="alert alert-danger">
                                        <i className="fas fa-exclamation-triangle me-2"></i>
                                        Please <Link to="/login" style={{ color: 'var(--shop-pink)' }}>log in</Link> to use the delivery option.
                                    </div>
                                )}

                                {selectedAddressId && (
                                    <div className="p-3 rounded position-relative" style={{ background: '#f8f9fa' }}>
                                        <button
                                            className="btn btn-sm btn-link position-absolute top-0 end-0 mt-2 me-2"
                                            onClick={() => {
                                                const addr = savedAddresses.find(a => String(a.id) === String(selectedAddressId));
                                                openAddressModal(addr);
                                            }}
                                            style={{ color: 'var(--shop-pink)' }}
                                        >
                                            <i className="fas fa-edit"></i> Edit
                                        </button>
                                        <p className='mb-1'><strong>Recipient:</strong> {address.name}</p>
                                        <p className='mb-1'><strong>Phone:</strong> {address.phone}</p>
                                        <p className='mb-0'><strong>Address:</strong> {`${address.street}, ${address.barangay}, ${address.city}`}</p>
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
                                        src={item.image_url || item.image || item.photo}
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

                            {paymentMethods.map(method => (
                                <div
                                    key={method.id}
                                    className={`payment-option ${selectedPayment === method.id ? 'selected' : ''}`}
                                    onClick={() => handlePaymentChange(method.id)}
                                >
                                    <div className="payment-icon">
                                        <i className={`fas ${method.icon}`}></i>
                                    </div>
                                    <div className="payment-info">
                                        <h6>{method.name}</h6>
                                        <p>{method.description}</p>
                                    </div>
                                    <div className="form-check ms-auto">
                                        <input
                                            type="radio"
                                            className="form-check-input"
                                            checked={selectedPayment === method.id}
                                            readOnly
                                        />
                                    </div>
                                </div>
                            ))}

                            {selectedPayment === 'gcash' && (
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
                            )}
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
                                    Pickup: {selectedPickupDate} - {selectedPickupTime}
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
                                    <>Place Order</>
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

            {
                showQRModal && (
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
                )
            }

            {
                showAddressModal && (
                    <div className="modal-overlay" onClick={() => !isProcessing && setShowAddressModal(false)}>
                        <div className="modal-content-custom" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                            <div className="modal-header-custom">
                                <h4>{isEditingAddress ? 'Edit Address' : 'Add New Address'}</h4>
                                <button className="modal-close" onClick={() => !isProcessing && setShowAddressModal(false)} disabled={isProcessing}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            <div className="modal-body-custom">
                                <form onSubmit={handleSaveAddress}>
                                    <div className="row g-3">
                                        <div className="col-md-6">
                                            <label className="form-label">Location Label (Optional)</label>
                                            <input
                                                type="text"
                                                className="form-control"
                                                name="label"
                                                placeholder="e.g. Home, Office"
                                                value={addressForm.label}
                                                onChange={handleAddressFormChange}
                                            />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label">Full Name <span className="text-danger">*</span></label>
                                            <input
                                                type="text"
                                                className="form-control"
                                                name="name"
                                                required
                                                value={addressForm.name}
                                                onChange={handleAddressFormChange}
                                            />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label">Phone Number <span className="text-danger">*</span></label>
                                            <input
                                                type="tel"
                                                className={`form-control ${formErrors.phone ? 'is-invalid' : ''}`}
                                                name="phone"
                                                required
                                                value={addressForm.phone}
                                                onChange={(e) => {
                                                    // Format phone number on change
                                                    const formatted = formatPhoneNumber(e.target.value);
                                                    setAddressForm(prev => ({ ...prev, phone: formatted }));

                                                    // Clear error if valid
                                                    const clean = formatted.replace(/\D/g, '');
                                                    if (/^09\d{9}$/.test(clean)) {
                                                        if (formErrors.phone) setFormErrors({ ...formErrors, phone: null });
                                                    }
                                                }}
                                            />
                                            {formErrors.phone && <div className="invalid-feedback">{formErrors.phone}</div>}
                                        </div>
                                        <div className="col-md-12">
                                            <label className="form-label">Street Address <span className="text-danger">*</span></label>
                                            <input
                                                type="text"
                                                className="form-control"
                                                name="street"
                                                placeholder="House No., Street Name, Subdivision"
                                                required
                                                value={addressForm.street}
                                                onChange={handleAddressFormChange}
                                            />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label">Barangay <span className="text-danger">*</span></label>
                                            <Select
                                                styles={selectStyles}
                                                options={barangays}
                                                isLoading={addressLoading}
                                                placeholder="Select Barangay"
                                                onChange={option => {
                                                    setSelectedBarangay(option);
                                                    // Update addressForm.barangay directly as string
                                                    setAddressForm(prev => ({ ...prev, barangay: option ? option.label : '' }));
                                                }}
                                                value={selectedBarangay}
                                                isClearable
                                                required
                                            />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label">City/Municipality <span className="text-danger">*</span></label>
                                            <input
                                                type="text"
                                                className="form-control"
                                                name="city"
                                                readOnly
                                                disabled
                                                style={{ backgroundColor: '#e9ecef' }}
                                                value={addressForm.city}
                                                onChange={handleAddressFormChange}
                                            />
                                        </div>
                                        <div className="col-md-6 d-none">
                                            <label className="form-label">Province <span className="text-danger">*</span></label>
                                            <input
                                                type="text"
                                                className="form-control"
                                                name="province"
                                                readOnly
                                                disabled
                                                style={{ backgroundColor: '#e9ecef' }}
                                                value={addressForm.province}
                                                onChange={handleAddressFormChange}
                                            />
                                        </div>
                                        <div className="col-md-6 d-none">
                                            <label className="form-label">Zip Code</label>
                                            <input
                                                type="text"
                                                className="form-control"
                                                name="zip"
                                                value={addressForm.zip}
                                                onChange={handleAddressFormChange}
                                            />
                                        </div>

                                    </div>
                                    <div className="mt-4 d-flex justify-content-end gap-2">
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={() => setShowAddressModal(false)}
                                            disabled={isProcessing}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="btn btn-primary"
                                            disabled={isProcessing}
                                            style={{ background: 'var(--shop-pink)', border: 'none' }}
                                        >
                                            {isProcessing ? 'Saving...' : 'Save Address'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )
            }


            <InfoModal
                show={infoModal.show}
                onClose={() => setInfoModal({ show: false, title: '', message: '' })}
                title={infoModal.title}
                message={infoModal.message}
                linkTo={infoModal.linkTo}
                linkText={infoModal.linkText}
                linkState={infoModal.linkState}
            />
        </div >
    );
};

export default Checkout;
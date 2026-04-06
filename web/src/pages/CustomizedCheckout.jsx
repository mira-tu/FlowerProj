import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import '../styles/Shop.css';
import { supabase } from '../config/supabase';
import { stockAPI } from '../config/api';
import InfoModal from '../components/InfoModal';
import CheckoutAddressSelection from '../components/CheckoutAddressSelection';
import CustomizedBouquetPreview from '../components/CustomizedBouquetPreview';
import MultiAddressDeliverySection from '../components/MultiAddressDeliverySection';
import qrCodeImage from '../assets/qr-code-1.jpg';
import {
    buildAddressFeeMap,
    buildMultiDeliveryDestinations,
    calculateDeliveryFee,
    createDeliveryAssignments,
    syncDeliveryAssignments,
} from '../utils/deliveryDestinations';
import {
    evaluateStandaloneFreeShippingPromo,
    fetchCustomizedStudioPromoSettings,
} from '../utils/freeShipping';
import { PICKUP_TIME_OPTIONS } from '../utils/businessHours';
import { hydrateCustomizedBouquetItems } from '../utils/customizedBouquetPreview';
import { reserveRequestStockAllocations } from '../utils/requestSubmission';

const paymentMethods = [
    { id: 'gcash', name: 'GCash', description: 'Pay via GCash e-wallet', icon: 'fa-wallet' },
];

const pickupTimes = PICKUP_TIME_OPTIONS;

const buildRoundRobinFlowerAllocations = (flowers = [], bundleSize = 0) => {
    const safeFlowers = Array.isArray(flowers) ? flowers.filter((flower) => flower?.id) : [];
    if (!safeFlowers.length || !bundleSize) {
        return [];
    }

    const allocations = safeFlowers.map((flower) => ({
        stock_product_id: flower.id,
        quantity: 0,
    }));

    for (let index = 0; index < bundleSize; index += 1) {
        allocations[index % allocations.length].quantity += 1;
    }

    return allocations.filter((allocation) => allocation.quantity > 0);
};

const buildCustomizedRequestStockAllocations = (items = []) => {
    const totals = new Map();

    const pushAllocation = (stockProductId, quantity) => {
        const normalizedId = Number.parseInt(stockProductId, 10);
        const normalizedQuantity = Number.parseInt(quantity, 10);
        if (!Number.isFinite(normalizedId) || normalizedId <= 0 || !Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
            return;
        }

        totals.set(normalizedId, (totals.get(normalizedId) || 0) + normalizedQuantity);
    };

    (Array.isArray(items) ? items : []).forEach((item) => {
        pushAllocation(item?.wrapper?.id, 1);
        pushAllocation(item?.ribbon?.id, 1);

        const flowerAllocations = Array.isArray(item?.flowerAllocations) && item.flowerAllocations.length > 0
            ? item.flowerAllocations.map((allocation) => ({
                stock_product_id: allocation?.id,
                quantity: allocation?.quantity,
            }))
            : buildRoundRobinFlowerAllocations(item?.flowers, item?.bundleSize);

        flowerAllocations.forEach((allocation) => {
            pushAllocation(allocation?.stock_product_id, allocation?.quantity);
        });
    });

    return Array.from(totals.entries()).map(([stock_product_id, quantity]) => ({
        stock_product_id,
        quantity,
    }));
};

const hasNumericStockId = (value) => /^[0-9]+$/.test(String(value ?? '').trim());

const sanitizeStockSelection = (selectionItem, validStockIds) => {
    if (!selectionItem || typeof selectionItem !== 'object') {
        return { item: selectionItem, missing: false };
    }

    const rawId = selectionItem.id;
    if (!hasNumericStockId(rawId)) {
        return { item: selectionItem, missing: false };
    }

    if (validStockIds.has(String(rawId))) {
        return { item: selectionItem, missing: false };
    }

    const { id: _removedId, ...rest } = selectionItem;
    return {
        item: {
            ...rest,
            stock_missing: true,
        },
        missing: true,
    };
};

const sanitizeCustomizedRequestItems = (items = [], stockItems = []) => {
    const validStockIds = new Set(
        (Array.isArray(stockItems) ? stockItems : [])
            .map((item) => String(item?.id || '').trim())
            .filter(Boolean)
    );

    let hasMissingStockReferences = false;

    const sanitizedItems = (Array.isArray(items) ? items : []).map((item) => {
        const sanitizedFlowers = (Array.isArray(item?.flowers) ? item.flowers : []).map((flower) => {
            const result = sanitizeStockSelection(flower, validStockIds);
            hasMissingStockReferences = hasMissingStockReferences || result.missing;
            return result.item;
        });

        const sanitizedWrapperResult = sanitizeStockSelection(item?.wrapper, validStockIds);
        const sanitizedRibbonResult = sanitizeStockSelection(item?.ribbon, validStockIds);
        hasMissingStockReferences = hasMissingStockReferences || sanitizedWrapperResult.missing || sanitizedRibbonResult.missing;

        const sanitizedFlowerAllocations = (Array.isArray(item?.flowerAllocations) ? item.flowerAllocations : [])
            .filter((allocation) => {
                const stockId = allocation?.stock_product_id ?? allocation?.id ?? allocation?.flowerId;
                const isValid = hasNumericStockId(stockId) && validStockIds.has(String(stockId));
                if (!isValid && hasNumericStockId(stockId)) {
                    hasMissingStockReferences = true;
                }
                return isValid;
            });

        return {
            ...item,
            flowers: sanitizedFlowers,
            wrapper: sanitizedWrapperResult.item,
            ribbon: sanitizedRibbonResult.item,
            flowerAllocations: sanitizedFlowerAllocations,
        };
    });

    return {
        items: sanitizedItems,
        hasMissingStockReferences,
    };
};

const buildCustomizedRequestErrorMessage = (error) => {
    const message = String(error?.message || '').toLowerCase();
    const details = String(error?.details || '').toLowerCase();
    const combined = `${message} ${details}`;

    if (
        combined.includes('stock_reservations')
        || combined.includes('stock_products')
        || combined.includes('foreign key')
        || combined.includes('violates foreign key')
    ) {
        return 'Some flower, wrapper, or ribbon stock changed while you were checking out. Please review your Customizer Studio cart and try again.';
    }

    if (combined.includes('schema cache') || combined.includes('column')) {
        return 'The customized request form is temporarily out of sync. Please refresh the page and try again.';
    }

    return 'There was an error placing your request. Please try again.';
};

const insertCustomizedRequestWithFallbacks = async (requestPayload) => {
    const fallbackColumns = [
        ['requests.image_url', 'image_url'],
        ['requests.notes', 'notes'],
        ['requests.delivery_method', 'delivery_method'],
        ['requests.pickup_time', 'pickup_time'],
        ['requests.shipping_fee', 'shipping_fee'],
        ['requests.payment_status', 'payment_status'],
        ['requests.contact_number', 'contact_number'],
    ];

    let payload = { ...requestPayload };

    while (true) {
        const result = await supabase
            .from('requests')
            .insert([payload])
            .select('id')
            .single();

        if (!result.error) {
            return result;
        }

        const errorMessage = String(result.error.message || '');
        const matchingFallback = fallbackColumns.find(([needle, column]) => (
            errorMessage.includes(needle)
            || errorMessage.includes(`'${column}' column of 'requests'`)
        ));

        if (!matchingFallback) {
            return result;
        }

        const [, column] = matchingFallback;
        if (!(column in payload)) {
            return result;
        }

        const nextPayload = { ...payload };
        delete nextPayload[column];
        payload = nextPayload;
    }
};

const CustomizedCheckout = ({ user }) => {
    const navigate = useNavigate();
    const [checkoutItems, setCheckoutItems] = useState([]);
    const [selectedPayment, setSelectedPayment] = useState('gcash');
    const [deliveryMethod, setDeliveryMethod] = useState('delivery');
    const [selectedPickupDate, setSelectedPickupDate] = useState('');
    const [selectedPickupTime, setSelectedPickupTime] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [showQRModal, setShowQRModal] = useState(false);
    const [receiptFile, setReceiptFile] = useState(null);
    const [receiptPreview, setReceiptPreview] = useState(null);
    const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '' });

    const [address, setAddress] = useState({
        name: '',
        phone: '',
        street: '',
        barangay: '',
        city: '',
        province: ''
    });
    const [selectedAddressId, setSelectedAddressId] = useState(null);
    const [dynamicShippingFee, setDynamicShippingFee] = useState(100);
    const [savedAddresses, setSavedAddresses] = useState([]);
    const [barangayFees, setBarangayFees] = useState([]);
    const [multiAddressEnabled, setMultiAddressEnabled] = useState(false);
    const [deliveryAssignments, setDeliveryAssignments] = useState([]);
    const [customizedStudioPromoSettings, setCustomizedStudioPromoSettings] = useState({
        enabled: false,
        minimumOrderAmount: 0,
        isConfigured: false,
    });
    const [customizedPreviewStock, setCustomizedPreviewStock] = useState([]);

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
        let isMounted = true;

        const loadCustomizedStudioPromo = async () => {
            try {
                const promoSettings = await fetchCustomizedStudioPromoSettings(supabase);
                if (isMounted) {
                    setCustomizedStudioPromoSettings(promoSettings);
                }
            } catch (error) {
                console.error('Error loading Customizer Studio free shipping promo:', error);
            }
        };

        loadCustomizedStudioPromo();

        const channel = supabase
            .channel('public:app_content:customized-studio-promo-checkout')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'app_content' },
                () => {
                    loadCustomizedStudioPromo();
                }
            )
            .subscribe();

        return () => {
            isMounted = false;
            supabase.removeChannel(channel);
        };
    }, []);

    const showInfoModal = (title, message) => setInfoModal({ show: true, title, message });

    useEffect(() => {
        const fetchFee = async () => {
            if (deliveryMethod === 'delivery' && address.barangay) {
                const { data, error } = await supabase
                    .from('barangay_fee')
                    .select('barangay_name, delivery_fee')
                    .ilike('barangay_name', `%${address.barangay}%`);

                if (error) {
                    console.error('Error fetching fee for barangay:', address.barangay, error);
                    setDynamicShippingFee(100); // Fallback on error
                } else if (data && data.length > 0) {
                    // Try to find an exact match first (case-insensitive)
                    const exactMatch = data.find(
                        item => item.barangay_name.toLowerCase() === address.barangay.toLowerCase()
                    );

                    if (exactMatch) {
                        setDynamicShippingFee(exactMatch.delivery_fee);
                    } else {
                        // Fallback to the first partial match
                        setDynamicShippingFee(data[0].delivery_fee);
                    }
                } else {
                    console.warn(`No fee found for barangay: ${address.barangay}. Using default fee.`);
                    setDynamicShippingFee(100); // Fallback if no match found
                }
            }
        };

        fetchFee();
    }, [address.barangay, deliveryMethod]);

    useEffect(() => {
        const userScopedKey = user?.id ? `customizedCheckoutIds_${user.id}` : null;
        const savedSelectedIds = userScopedKey ? localStorage.getItem(userScopedKey) : null;
        const savedCartKey = `customizedCart_${user?.id || 'guest'}`;
        const savedCart = localStorage.getItem(savedCartKey) || localStorage.getItem('customizedCart');

        if (savedSelectedIds && savedCart) {
            try {
                const selectedIds = JSON.parse(savedSelectedIds);
                const allCustomizedItems = JSON.parse(savedCart);
                const selectedItems = Array.isArray(allCustomizedItems)
                    ? allCustomizedItems.filter((item) => selectedIds.includes(item.id)).map((item) => ({
                        ...item,
                        name: `Customizer Studio (${item.bundleSize || '?'} stems)`,
                        qty: 1,
                    }))
                    : [];

                setCheckoutItems(selectedItems);
                return;
            } catch (error) {
                console.error('Error restoring customized checkout items:', error);
            }
        }

        const savedCheckoutItems = localStorage.getItem('checkoutItems');
        if (savedCheckoutItems) {
            setCheckoutItems(JSON.parse(savedCheckoutItems));
        }
    }, [user?.id]);

    useEffect(() => {
        let isMounted = true;

        const loadPreviewStock = async () => {
            try {
                const { data } = await stockAPI.getAll();
                if (isMounted) {
                    setCustomizedPreviewStock(Array.isArray(data) ? data : []);
                }
            } catch (error) {
                console.error('Error loading Customizer Studio preview stock:', error);
            }
        };

        loadPreviewStock();

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        if (deliveryMethod !== 'delivery') {
            setMultiAddressEnabled(false);
            return;
        }

        setDeliveryAssignments((prevAssignments) => {
            if (!prevAssignments.length) {
                return createDeliveryAssignments(checkoutItems, selectedAddressId);
            }

            return syncDeliveryAssignments(checkoutItems, prevAssignments, selectedAddressId);
        });
    }, [checkoutItems, deliveryMethod, selectedAddressId]);

    const addressFeeMap = useMemo(
        () => buildAddressFeeMap(savedAddresses, barangayFees),
        [savedAddresses, barangayFees]
    );

    const displayCheckoutItems = useMemo(
        () => hydrateCustomizedBouquetItems(checkoutItems, customizedPreviewStock),
        [checkoutItems, customizedPreviewStock]
    );

    const subtotal = checkoutItems.reduce((acc, item) => acc + (item.price * (item.qty || 1)), 0);
    const customizedStudioFreeShippingPromo = useMemo(
        () => evaluateStandaloneFreeShippingPromo(subtotal, customizedStudioPromoSettings),
        [subtotal, customizedStudioPromoSettings]
    );
    const shippingFee = deliveryMethod === 'pickup'
        ? 0
        : calculateDeliveryFee({
            deliveryMethod,
            hasFreeShipping: customizedStudioFreeShippingPromo.qualifies,
            selectedAddressId,
            multiAddressEnabled,
            assignments: deliveryAssignments,
            addressFeeMap: Object.keys(addressFeeMap).length
                ? addressFeeMap
                : { [selectedAddressId]: dynamicShippingFee },
        });
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
            setInfoModal({ show: true, title: 'Notice', message: 'You must be logged in to place an order. Please log in or sign up.', linkTo: '/login', linkText: 'Go to Login' });
            return;
        }

        if (deliveryMethod === 'pickup' && (!selectedPickupDate || !selectedPickupTime)) {
            setInfoModal({ show: true, title: 'Notice', message: 'Please select a pickup date and time' });
            return;
        }

        if (deliveryMethod === 'delivery' && !selectedAddressId) {
            setInfoModal({ show: true, title: 'Notice', message: 'Please select a saved address for delivery.' });
            return;
        }

        if (deliveryMethod === 'delivery' && multiAddressEnabled) {
            const hasIncompleteAssignment = deliveryAssignments.some((assignment) => !assignment.addressId);
            if (hasIncompleteAssignment) {
                setInfoModal({ show: true, title: 'Notice', message: 'Please assign an address to every bouquet before placing your request.' });
                return;
            }
        }

        if (selectedPayment === 'gcash' && !receiptFile) {
            setInfoModal({ show: true, title: 'Notice', message: 'Please upload your GCash payment receipt' });
            return;
        }

        setIsProcessing(true);

        const multiDeliveryDestinations = deliveryMethod === 'delivery' && multiAddressEnabled
            ? buildMultiDeliveryDestinations({
                assignments: deliveryAssignments,
                addresses: savedAddresses,
                addressFeeMap: Object.keys(addressFeeMap).length
                    ? addressFeeMap
                    : { [selectedAddressId]: dynamicShippingFee },
            })
            : [];

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
                setInfoModal({ show: true, title: 'Error', message: 'There was an error uploading your receipt. Please try again.' });
                setIsProcessing(false);
                return;
            }
            const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(fileName);
            uploadedReceiptUrl = urlData.publicUrl;
        }

        const {
            items: sanitizedCheckoutItems,
            hasMissingStockReferences,
        } = sanitizeCustomizedRequestItems(displayCheckoutItems, customizedPreviewStock);

        if (hasMissingStockReferences) {
            setInfoModal({
                show: true,
                title: 'Stock Changed',
                message: 'Some flower, wrapper, or ribbon stock changed while you were checking out. Please review your Customizer Studio cart and try again.',
            });
            setIsProcessing(false);
            return;
        }

        // 2. Upload all images from the cart
        const uploadedItems = await Promise.all(sanitizedCheckoutItems.map(async (item) => {
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

        const stockAllocations = buildCustomizedRequestStockAllocations(uploadedItems);

        // 3. Prepare the request data
        const request_number = `CUS-${user.id.substring(0, 4)}-${Date.now()}`;
        const payment_status = selectedPayment === 'gcash' ? 'waiting_for_confirmation' : 'to_pay';
        const primaryDestination = multiDeliveryDestinations[0] || null;
        const firstItem = uploadedItems[0] || {};
        const pickupDateTime = deliveryMethod === 'pickup'
            ? `${selectedPickupDate} - ${selectedPickupTime}`
            : null;

        const newRequest = {
            request_number,
            user_id: user.id,
            type: 'customized',
            status: 'pending',
            contact_number: primaryDestination?.recipient_phone || address.phone || null,
            delivery_method: deliveryMethod,
            pickup_time: pickupDateTime,
            shipping_fee: shippingFee,
            payment_status,
            image_url: firstItem.image_url || null,
            notes: null,
            data: {
                items: uploadedItems,
                address: deliveryMethod === 'delivery' ? address : null,
                address_id: deliveryMethod === 'delivery' ? (primaryDestination?.address_id || selectedAddressId) : null,
                multi_delivery_destinations: multiDeliveryDestinations,
                delivery_method: deliveryMethod,
                pickup_time: pickupDateTime,
                payment_method: selectedPayment,
                payment_status,
                subtotal,
                final_price: total,
                shipping_fee: shippingFee,
                receipt_url: uploadedReceiptUrl,
                image_url: firstItem.image_url || null,
                stock_allocations: stockAllocations,
            },
        };

        // 4. Insert into `requests` table
        const { data, error } = await insertCustomizedRequestWithFallbacks(newRequest);

        if (error) {
            console.error('Error creating request:', error);
            setInfoModal({
                show: true,
                title: 'Error',
                message: buildCustomizedRequestErrorMessage(error),
            });
            setIsProcessing(false);
            return;
        }

        if (stockAllocations.length > 0) {
            const reservationResult = await reserveRequestStockAllocations({
                supabase,
                requestId: data.id,
                allocations: stockAllocations,
            });

            if (!reservationResult.success) {
                console.error('Error reserving customized request stock:', reservationResult.error);
                await supabase.from('requests').delete().eq('id', data.id);
                setInfoModal({
                    show: true,
                    title: 'Stock Changed',
                    message: 'Some wrapper, ribbon, or flower stock changed while you were checking out. Please review your Customizer Studio cart and try again.',
                });
                setIsProcessing(false);
                return;
            }
        }

        // 5. Create notification
        const { error: notificationError } = await supabase
            .from('notifications')
            .insert([{
                user_id: user.id,
                type: 'request',
                title: 'Customizer Studio Request Placed!',
                message: `Your request #${request_number} has been placed. We will review it shortly.`,
                link: `/customized-request-tracking/${request_number}`,
            }]);

        if (notificationError) {
            console.error('Error creating notification:', notificationError);
        }

        // 6. Clean up local storage (both scoped and non-scoped keys)
        localStorage.removeItem('customizedCart');
        localStorage.removeItem(`customizedCart_${user.id}`);
        localStorage.removeItem('checkoutItems');
        localStorage.removeItem(`customizedCheckoutIds_${user.id}`);

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
                        <h1>Customizer Studio Checkout</h1>
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
                                        onKeyDown={(e) => e.preventDefault()}
                                        onChange={(e) => {
                                            const selected = e.target.value;
                                            const date = new Date(selected);
                                            const day = date.getUTCDay();
                                            if (day === 0 || day === 6) {
                                                setInfoModal({ show: true, title: 'Invalid Date', message: 'Pickup is only available on weekdays (Monday to Friday).' });
                                                setSelectedPickupDate('');
                                            } else {
                                                setSelectedPickupDate(selected);
                                            }
                                        }}
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
                                        Pickup Location: Jocerry's Flower Shop, 63 San Jose Road, Zamboanga City
                                    </small>
                                </div>
                            )}
                        </div>

                        {deliveryMethod === 'delivery' && (
                            <CheckoutAddressSelection
                                user={user}
                                address={address}
                                setAddress={setAddress}
                                selectedAddressId={selectedAddressId}
                                setSelectedAddressId={setSelectedAddressId}
                                showInfoModal={showInfoModal}
                                onAddressesLoaded={setSavedAddresses}
                            />
                        )}

                        {deliveryMethod === 'delivery' && (
                            <MultiAddressDeliverySection
                                checkoutItems={checkoutItems}
                                savedAddresses={savedAddresses}
                                selectedAddressId={selectedAddressId}
                                enabled={multiAddressEnabled}
                                setEnabled={setMultiAddressEnabled}
                                assignments={deliveryAssignments}
                                setAssignments={setDeliveryAssignments}
                            />
                        )}

                        <div className="checkout-section">
                            <h5 className="section-title">
                                <i className="fas fa-box"></i>
                                Order Items ({checkoutItems.length})
                            </h5>

                            {displayCheckoutItems.map((item, index) => (
                                <div key={index} className="checkout-item">
                                    <CustomizedBouquetPreview item={item} size={80} zoomable />
                                    <div className="checkout-item-info">
                                        <div className="checkout-item-name">{item.name}</div>
                                        <div className="checkout-item-qty">Qty: {item.qty || 1}</div>
                                        <div className="small text-muted">
                                            {(item.flowers || []).map((flower) => flower.name).join(', ')}
                                            {item.wrapper?.name ? ` • ${item.wrapper.name}` : ''}
                                            {item.ribbon?.name ? ` • ${item.ribbon.name}` : ''}
                                        </div>
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
                                    <span>{deliveryMethod === 'pickup' ? 'Pickup' : 'Delivery Fee'}</span>
                                <span>{shippingFee === 0 ? 'FREE' : `₱${shippingFee}`}</span>
                            </div>
                            {deliveryMethod === 'delivery' && customizedStudioFreeShippingPromo.qualifies && (
                                <div className="shop-promo-note shop-promo-note-success">
                                    Free shipping promo applied to this custom bouquet order.
                                </div>
                            )}
                            {false && deliveryMethod === 'delivery' && !customizedStudioFreeShippingPromo.qualifies && customizedStudioFreeShippingPromo.isConfigured && customizedStudioFreeShippingPromo.amountRemaining > 0 && (
                                <div className="shop-promo-note">
                                    Spend another â‚±{customizedStudioFreeShippingPromo.amountRemaining.toLocaleString()} to unlock free shipping for this custom bouquet order.
                                </div>
                            )}
                            {deliveryMethod === 'delivery' && !customizedStudioFreeShippingPromo.qualifies && customizedStudioFreeShippingPromo.isConfigured && customizedStudioFreeShippingPromo.amountRemaining > 0 && (
                                <div className="shop-promo-note">
                                    {`Spend another \u20b1${customizedStudioFreeShippingPromo.amountRemaining.toLocaleString()} to unlock free shipping for this custom bouquet order.`}
                                </div>
                            )}
                            {deliveryMethod === 'delivery' && multiAddressEnabled && (
                                <div className="small mb-2" style={{ color: 'var(--shop-pink)' }}>
                                    <i className="fas fa-route me-1"></i>
                                    {new Set(deliveryAssignments.map((assignment) => String(assignment.addressId || '')).filter(Boolean)).size} delivery stop(s) in one transaction
                                </div>
                            )}
                            {deliveryMethod === 'pickup' && selectedPickupDate && selectedPickupTime && (
                                <div className="small mb-2" style={{ color: 'var(--shop-pink)' }}>
                                    <i className="fas fa-clock me-1"></i>
                                    Pickup: {selectedPickupDate} - {selectedPickupTime}
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

            <InfoModal
                show={infoModal.show}
                onClose={() => setInfoModal({ show: false, title: '', message: '' })}
                title={infoModal.title}
                message={infoModal.message}
                linkTo={infoModal.linkTo}
                linkText={infoModal.linkText}
                linkState={infoModal.linkState}
            />
        </div>
    );
};

export default CustomizedCheckout;

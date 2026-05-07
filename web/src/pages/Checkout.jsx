import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import '../styles/Shop.css';
import { supabase } from '../config/supabase';
import InfoModal from '../components/InfoModal';
import CheckoutAddressSelection from '../components/CheckoutAddressSelection';
import GCashConfirmationSection from '../components/GCashConfirmationSection';
import GCashQrModal from '../components/GCashQrModal';
import MultiAddressDeliverySection from '../components/MultiAddressDeliverySection';
import { insertUserNotification } from '../utils/notificationApi';
import {
    mergeOrderPaymentMetadataIntoNotes,
    normalizeGcashReferenceNumber,
    writeWithOptionalColumns,
} from '../utils/gcashPayments';
import {
    buildAddressFeeMap,
    buildMultiDeliveryDestinations,
    calculateDeliveryFee,
    createDeliveryAssignments,
    serializeMultiDeliveryNotes,
    syncDeliveryAssignments,
} from '../utils/deliveryDestinations';
import { buildFreeShippingLookup, evaluateFreeShippingPromo } from '../utils/freeShipping';
import { PICKUP_TIME_OPTIONS, getEarliestPickupDate, isPickupDateSelectable } from '../utils/businessHours';
import {
    PROMO_CHANNELS,
    buildDiscountFields,
    calculatePromoPricing,
    fetchDiscountPromos,
    getPromoValidationMessage,
    normalizePromoCode,
    recordDiscountRedemption,
    roundCurrency,
} from '../utils/promoEngine';

const paymentMethods = [
    { id: 'cod', name: 'Cash on Delivery', description: 'Pay when you receive', icon: 'fa-money-bill-wave' },
    { id: 'gcash', name: 'GCash', description: 'Pay via GCash e-wallet', icon: 'fa-wallet' },
];

const pickupTimes = PICKUP_TIME_OPTIONS;

const insertOrderWithNotesFallback = async (orderPayload) => {
    const retryResult = await writeWithOptionalColumns({
        tableName: 'orders',
        initialPayload: orderPayload,
        optionalColumns: ['notes', 'gcash_reference_number', 'discount_total', 'discount_snapshot', 'applied_promo_code'],
        execute: (payload) => (
            supabase
                .from('orders')
                .insert([payload])
                .select()
                .single()
        ),
    });
    return {
        ...retryResult,
        usedNotesFallback: retryResult.removedColumns.includes('notes'),
        usedGcashReferenceFallback: retryResult.removedColumns.includes('gcash_reference_number'),
    };
};

const Checkout = ({ setCart, user, products = [] }) => {
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
    const [gcashReferenceNumber, setGcashReferenceNumber] = useState('');
    const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '', linkTo: null, linkText: '', linkState: null });
    const showInfoModal = (title, message) => setInfoModal({ show: true, title, message, linkTo: null, linkText: '', linkState: null });

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
    const [barangayFees, setBarangayFees] = useState([]);
    const [multiAddressEnabled, setMultiAddressEnabled] = useState(false);
    const [deliveryAssignments, setDeliveryAssignments] = useState([]);
    const [addressValidationMessage, setAddressValidationMessage] = useState('');
    const [promoCodeInput, setPromoCodeInput] = useState('');
    const [appliedPromoCode, setAppliedPromoCode] = useState('');
    const [promoState, setPromoState] = useState({
        promos: [],
        loading: false,
        unavailable: false,
        message: '',
        type: '',
    });
    const addressSectionRef = useRef(null);

    const scrollToAddressSection = () => {
        if (!addressSectionRef.current) return;

        addressSectionRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
    };

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
        const savedCheckoutItems = localStorage.getItem('checkoutItems');
        const savedOrderType = localStorage.getItem('orderType');
        if (savedCheckoutItems) {
            setCheckoutItems(JSON.parse(savedCheckoutItems));
        }
        if (savedOrderType) {
            setOrderType(savedOrderType);
        }
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

    useEffect(() => {
        if (deliveryMethod !== 'delivery' || selectedAddressId) {
            setAddressValidationMessage('');
        }
    }, [deliveryMethod, selectedAddressId]);

    const addressFeeMap = useMemo(
        () => buildAddressFeeMap(savedAddresses, barangayFees),
        [savedAddresses, barangayFees]
    );
    const freeShippingLookup = useMemo(
        () => buildFreeShippingLookup(products),
        [products]
    );
    const freeShippingPromo = useMemo(
        () => evaluateFreeShippingPromo(checkoutItems, freeShippingLookup),
        [checkoutItems, freeShippingLookup]
    );
    const productById = useMemo(() => {
        const lookup = new Map();
        (Array.isArray(products) ? products : []).forEach((product) => {
            if (product?.id !== undefined && product?.id !== null) {
                lookup.set(String(product.id), product);
            }
        });
        return lookup;
    }, [products]);
    const promoLines = useMemo(() => checkoutItems.map((item, index) => {
        const productId = item.productId || item.product_id || item.id;
        const product = productById.get(String(productId)) || {};
        return {
            key: `catalog-${productId || index}-${index}`,
            id: productId,
            productId,
            categoryId: product.category_id || item.category_id || null,
            name: item.name,
            quantity: item.qty || 1,
            unitPrice: item.price,
            originalUnitPrice: product.original_price ?? product.originalPrice ?? item.original_price ?? item.originalPrice ?? item.price,
            builtInDiscountPercent: product.discount_percentage ?? product.discountPercentage ?? item.discount_percentage ?? item.discountPercentage ?? 0,
            targetKeys: [
                productId,
                item.name,
                product.category_name,
                product.category_id,
            ].filter(Boolean),
        };
    }), [checkoutItems, productById]);
    const knownOutOfStockItems = useMemo(
        () => checkoutItems.filter((item) => {
            const stockQuantity = Number(item.stockQuantity);
            return Number.isFinite(stockQuantity) && stockQuantity <= 0;
        }),
        [checkoutItems]
    );

    useEffect(() => {
        let isMounted = true;

        const loadPromos = async () => {
            setPromoState((current) => ({ ...current, loading: true }));
            try {
                const result = await fetchDiscountPromos(supabase, {
                    channelScope: PROMO_CHANNELS.CATALOG,
                });
                if (isMounted) {
                    setPromoState({
                        promos: result.promos,
                        loading: false,
                        unavailable: result.unavailable,
                        message: result.unavailable ? 'Discount promos are not available until the database migration is applied.' : '',
                        type: result.unavailable ? 'warning' : '',
                    });
                }
            } catch (error) {
                console.error('Error loading discount promos:', error);
                if (isMounted) {
                    setPromoState({
                        promos: [],
                        loading: false,
                        unavailable: false,
                        message: 'Discount promos could not be loaded right now.',
                        type: 'error',
                    });
                }
            }
        };

        loadPromos();
        return () => {
            isMounted = false;
        };
    }, [user?.id]);

    const currentItemSubtotal = checkoutItems.reduce((acc, item) => acc + (item.price * (item.qty || 1)), 0);
    const shippingFee = deliveryMethod === 'pickup'
        ? 0
        : calculateDeliveryFee({
            deliveryMethod,
            hasFreeShipping: freeShippingPromo.qualifies,
            selectedAddressId,
            multiAddressEnabled,
            assignments: deliveryAssignments,
            addressFeeMap: Object.keys(addressFeeMap).length
                ? addressFeeMap
                : { [selectedAddressId]: dynamicShippingFee },
        });
    const promoPricing = useMemo(() => calculatePromoPricing({
        lines: promoLines,
        promos: promoState.promos,
        channelScope: PROMO_CHANNELS.CATALOG,
        enteredCode: appliedPromoCode,
        shippingFee,
    }), [appliedPromoCode, promoLines, promoState.promos, shippingFee]);
    const subtotal = promoPricing.subtotalBeforeDiscount || currentItemSubtotal;
    const discountTotal = promoPricing.discountTotal;
    const subtotalAfterDiscount = promoPricing.subtotalAfterDiscount;
    const total = promoPricing.finalTotal;
    const promoLineBreakdownByKey = useMemo(() => new Map(
        (promoPricing.lineBreakdown || []).map((line) => [String(line.key), line])
    ), [promoPricing.lineBreakdown]);
    const promoFeedbackMessage = appliedPromoCode
        ? getPromoValidationMessage(promoPricing.validation)
        : (
            promoPricing.chosenPromo
                ? `${promoPricing.chosenPromo.name || promoPricing.chosenPromo.code} applied automatically.`
                : ''
        );
    const promoFeedbackType = appliedPromoCode && promoPricing.validation?.status !== 'applied'
        ? 'error'
        : (promoFeedbackMessage ? 'success' : '');

    const handleApplyPromo = () => {
        const normalizedCode = normalizePromoCode(promoCodeInput);
        if (!normalizedCode) {
            setPromoState((current) => ({
                ...current,
                message: 'Enter a discount code first.',
                type: 'error',
            }));
            return;
        }
        setAppliedPromoCode(normalizedCode);
        setPromoCodeInput(normalizedCode);
    };

    const handleRemovePromo = () => {
        setAppliedPromoCode('');
        setPromoCodeInput('');
        setPromoState((current) => ({ ...current, message: '', type: '' }));
    };

    const handlePaymentChange = (paymentId) => {
        setSelectedPayment(paymentId);
        if (paymentId !== 'gcash') {
            setShowQRModal(false);
        }
    };

    const handleReceiptUpload = (e) => {
        const file = e.target.files[0];
        if (!file) {
            setReceiptFile(null);
            setReceiptPreview(null);
            return;
        }

        setReceiptFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
            setReceiptPreview(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const clearReceiptSelection = () => {
        setReceiptFile(null);
        setReceiptPreview(null);
    };

    const handlePlaceOrder = async () => {
        const normalizedGcashReference = normalizeGcashReferenceNumber(gcashReferenceNumber);

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
            showInfoModal('Pickup Time Required', 'Please select a pickup date and time before placing your order.');
            return;
        }

        if (deliveryMethod === 'pickup' && !isPickupDateSelectable(selectedPickupDate)) {
            showInfoModal('Invalid Pickup Date', 'Pickup must be scheduled on a weekday starting tomorrow.');
            return;
        }

        if (deliveryMethod === 'delivery' && !selectedAddressId) {
            setAddressValidationMessage('Please set or select a delivery address before placing your order.');
            scrollToAddressSection();
            return;
        }

        if (deliveryMethod === 'delivery' && multiAddressEnabled) {
            const hasIncompleteAssignment = deliveryAssignments.some((assignment) => !assignment.addressId);
            if (hasIncompleteAssignment) {
                showInfoModal('Address Assignment Required', 'Please assign an address to every bouquet before placing your order.');
                return;
            }
        }

        if (selectedPayment === 'gcash' && !receiptFile) {
            showInfoModal('Receipt Required', 'Please upload your GCash payment receipt screenshot before placing your order.');
            return;
        }

        if (selectedPayment === 'gcash' && !normalizedGcashReference) {
            showInfoModal('Transaction Number Required', 'Please enter your GCash transaction number before placing your order.');
            return;
        }

        if (knownOutOfStockItems.length > 0) {
            const outOfStockItemNames = knownOutOfStockItems.map((item) => item.name).join(', ');
            showInfoModal('Out of Stock', `The following items are out of stock and cannot be ordered: ${outOfStockItemNames}. Please review your cart first.`);
            return;
        }

        setIsProcessing(true);

        const productIds = Array.from(new Set(
            checkoutItems
                .map((item) => item.productId || item.id)
                .filter((productId) => productId !== undefined && productId !== null)
        ));

        if (productIds.length > 0) {
            const requestedQuantities = checkoutItems.reduce((accumulator, item) => {
                const productId = item.productId || item.id;
                if (productId === undefined || productId === null) {
                    return accumulator;
                }

                accumulator[productId] = (accumulator[productId] || 0) + (item.qty || 1);
                return accumulator;
            }, {});

            const { data: liveProducts, error: liveProductsError } = await supabase
                .from('products')
                .select('id, name, stock_quantity, is_active')
                .in('id', productIds);

            if (liveProductsError) {
                console.error('Error validating live product stock:', liveProductsError);
                showInfoModal('Order Error', 'We could not verify live product stock right now. Please try again.');
                setIsProcessing(false);
                return;
            }

            const liveProductMap = new Map((liveProducts || []).map((product) => [product.id, product]));
            const invalidCheckoutItems = checkoutItems.filter((item) => {
                const productId = item.productId || item.id;
                const liveProduct = liveProductMap.get(productId);

                if (!liveProduct || liveProduct.is_active === false) {
                    return true;
                }

                const liveStockQuantity = Number(liveProduct.stock_quantity);
                const requestedQuantity = requestedQuantities[productId] || 0;
                return !Number.isFinite(liveStockQuantity) || liveStockQuantity < requestedQuantity;
            });

            if (invalidCheckoutItems.length > 0) {
                const invalidItemNames = Array.from(new Set(invalidCheckoutItems.map((item) => item.name))).join(', ');
                showInfoModal(
                    'Stock Changed',
                    `Some items are no longer available in the requested quantity: ${invalidItemNames}. Please review your cart and try again.`
                );
                setIsProcessing(false);
                return;
            }
        }

        let finalAddressId = selectedAddressId;

        const multiDeliveryDestinations = deliveryMethod === 'delivery' && multiAddressEnabled
            ? buildMultiDeliveryDestinations({
                assignments: deliveryAssignments,
                addresses: savedAddresses,
                addressFeeMap: Object.keys(addressFeeMap).length
                    ? addressFeeMap
                    : { [selectedAddressId]: dynamicShippingFee },
            })
            : [];

        if (multiDeliveryDestinations.length > 0) {
            finalAddressId = multiDeliveryDestinations[0]?.address_id || selectedAddressId;
        }

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
                showInfoModal('Upload Error', 'There was an error uploading your receipt. Please try again.');
                setIsProcessing(false);
                return;
            }

            const { data: urlData } = supabase.storage
                .from('receipts')
                .getPublicUrl(filePath);

            if (!urlData || !urlData.publicUrl) {
                console.error('Error getting public URL for receipt');
                showInfoModal('Upload Error', 'Could not retrieve receipt URL. Please try again.');
                setIsProcessing(false);
                return;
            }

            uploadedReceiptUrl = urlData.publicUrl;
        }

        const order_number = `JFS-${user.id.substring(0, 8)}-${Date.now()}`;
        const serializedOrderNotes = mergeOrderPaymentMetadataIntoNotes(
            serializeMultiDeliveryNotes({
                destinations: multiDeliveryDestinations,
            }),
            selectedPayment === 'gcash'
                ? { gcash_reference_number: normalizedGcashReference }
                : {}
        );

        const newOrder = {
            created_at: new Date().toISOString(),
            order_number: order_number,
            user_id: user.id,
            address_id: deliveryMethod === 'delivery' ? finalAddressId : null,
            payment_method: selectedPayment,
            payment_status: selectedPayment === 'cod' ? 'to_pay' : 'waiting_for_confirmation',
            subtotal: subtotalAfterDiscount,
            shipping_fee: shippingFee,
            total: total,
            status: 'pending',
            delivery_method: deliveryMethod,
            pickup_time: deliveryMethod === 'pickup' ? `${selectedPickupDate} - ${selectedPickupTime}` : null,
            receipt_url: uploadedReceiptUrl,
            gcash_reference_number: selectedPayment === 'gcash' ? normalizedGcashReference : null,
            notes: serializedOrderNotes,
            ...buildDiscountFields(promoPricing),
        };

        const { data, error, usedNotesFallback, usedGcashReferenceFallback } = await insertOrderWithNotesFallback(newOrder);

        if (error) {
            console.error('Error creating order:', error);
            showInfoModal('Order Error', 'There was an error placing your order. Please try again.');
            setIsProcessing(false);
            return;
        }

        if (usedNotesFallback && multiDeliveryDestinations.length > 0) {
            console.warn('Multi-address delivery details were not saved on the order because orders.notes is not available yet.');
        }
        if (usedGcashReferenceFallback && selectedPayment === 'gcash' && usedNotesFallback) {
            console.warn('GCash transaction number could not be stored on the order because both orders.gcash_reference_number and orders.notes are not available yet.');
        }

        const newOrderId = data.id; // Correct: Use data.id for the internal ID
        const newOrderNumber = data.order_number; // Correct: Use data.order_number for the human-readable number

        const orderItems = checkoutItems.map((item, index) => {
            const productId = item.productId || item.product_id || item.id;
            const lineKey = `catalog-${productId || index}-${index}`;
            const promoLine = promoLineBreakdownByKey.get(String(lineKey));
            const normalizedLine = promoPricing.lines.find((line) => String(line.key) === String(lineKey));
            const finalUnitPrice = promoLine
                ? roundCurrency(promoLine.final_subtotal / Math.max(1, promoLine.quantity || 1))
                : roundCurrency(normalizedLine?.originalUnitPrice ?? item.price);

            return {
                order_id: newOrderId, // Correct: Link items using the internal ID
                product_id: productId,
                name: item.name,
                price: finalUnitPrice,
                quantity: item.qty || 1,
                image_url: item.image_url || item.image || item.photo,
            };
        });

        const { error: itemsError } = await supabase
            .from('order_items')
            .insert(orderItems);

        if (itemsError) {
            console.error('Error inserting order items:', itemsError);
            showInfoModal('Order Error', 'There was an error saving your order items. Please contact support and provide your order number.');
            return;
        }

        try {
            await recordDiscountRedemption(supabase, {
                pricing: promoPricing,
                userId: user.id,
                orderId: newOrderId,
                channelScope: PROMO_CHANNELS.CATALOG,
                status: 'applied',
            });
        } catch (redemptionError) {
            console.error('Error recording discount redemption:', redemptionError);
        }

        // Deduct stock for each purchased item
        for (const item of checkoutItems) {
            try {
                const productId = item.productId || item.product_id || item.id;
                // Fetch current stock to avoid overwriting with stale frontend data
                const { data: productData, error: fetchError } = await supabase
                    .from('products')
                    .select('stock_quantity')
                    .eq('id', productId)
                    .single();

                if (!fetchError && productData) {
                    const newStock = Math.max(0, (productData.stock_quantity || 0) - (item.qty || 1));
                    await supabase
                        .from('products')
                        .update({ stock_quantity: newStock })
                        .eq('id', productId);
                }
            } catch (err) {
                console.error(`Failed to update stock for product ${item.id}`, err);
            }
        }

        try {
            await insertUserNotification({
                userId: user.id,
                type: 'order',
                title: 'Order Placed Successfully!',
                message: `Your order #${order_number} has been placed. ${selectedPayment === 'cod' ? 'Payment will be collected on delivery.' : 'Waiting for payment confirmation.'}`,
                icon: 'fa-shopping-bag',
                link: `/order-tracking/${newOrderNumber}`,
            });
        } catch (notifError) {
            console.error('Error creating notification:', notifError);
        }

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
                    multi_delivery_destinations: multiDeliveryDestinations,
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
                                        min={getEarliestPickupDate()}
                                        onKeyDown={(e) => e.preventDefault()}
                                        onChange={(e) => {
                                            const selected = e.target.value;
                                            if (!isPickupDateSelectable(selected)) {
                                                showInfoModal('Invalid Date', 'Pickup is only available on weekdays starting tomorrow.');
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
                            <div ref={addressSectionRef}>
                                {addressValidationMessage && (
                                    <div
                                        className="alert alert-danger"
                                        role="alert"
                                        style={{ borderRadius: '1rem', marginBottom: '1rem' }}
                                    >
                                        <i className="fas fa-exclamation-circle me-2"></i>
                                        {addressValidationMessage}
                                    </div>
                                )}

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
                                    checkoutItems={checkoutItems}
                                    savedAddresses={savedAddresses}
                                    selectedAddressId={selectedAddressId}
                                    enabled={multiAddressEnabled}
                                    setEnabled={setMultiAddressEnabled}
                                    assignments={deliveryAssignments}
                                    setAssignments={setDeliveryAssignments}
                                />
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
                                <div className="mt-3">
                                    <GCashConfirmationSection
                                        title="Confirm Your GCash Payment"
                                        amount={total}
                                        onViewQr={() => setShowQRModal(true)}
                                        referenceNumber={gcashReferenceNumber}
                                        onReferenceNumberChange={setGcashReferenceNumber}
                                        receiptFile={receiptFile}
                                        receiptPreview={receiptPreview}
                                        onReceiptUpload={handleReceiptUpload}
                                        onRemoveReceipt={clearReceiptSelection}
                                        receiptInputId="checkout-gcash-receipt"
                                        helperText="We manually verify GCash payments, so please upload a clear receipt and the exact transaction number before placing your order."
                                        disabled={isProcessing}
                                    />
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
                            <div className="mb-3">
                                <label className="form-label small fw-bold mb-2">Discount Code</label>
                                <div className="d-flex gap-2">
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={promoCodeInput}
                                        onChange={(event) => setPromoCodeInput(normalizePromoCode(event.target.value))}
                                        placeholder="Enter code"
                                        disabled={isProcessing || promoState.loading}
                                    />
                                    {appliedPromoCode ? (
                                        <button
                                            type="button"
                                            className="btn btn-outline-secondary"
                                            onClick={handleRemovePromo}
                                            disabled={isProcessing}
                                        >
                                            Remove
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            className="btn btn-outline-primary"
                                            onClick={handleApplyPromo}
                                            disabled={isProcessing || promoState.loading}
                                        >
                                            Apply
                                        </button>
                                    )}
                                </div>
                                {(promoFeedbackMessage || promoState.message) && (
                                    <div className={`small mt-2 ${promoFeedbackType === 'error' || promoState.type === 'error' ? 'text-danger' : promoState.type === 'warning' ? 'text-muted' : 'text-success'}`}>
                                        <i className={`fas ${promoFeedbackType === 'error' || promoState.type === 'error' ? 'fa-exclamation-circle' : 'fa-tag'} me-1`}></i>
                                        {promoFeedbackMessage || promoState.message}
                                    </div>
                                )}
                            </div>
                            {discountTotal > 0 && (
                                <div className="summary-row text-success">
                                    <span>Discount{promoPricing.chosenPromo?.code ? ` (${promoPricing.chosenPromo.code})` : ''}</span>
                                    <span>-₱{discountTotal.toLocaleString()}</span>
                                </div>
                            )}
                            {discountTotal > 0 && (
                                <div className="summary-row">
                                    <span>Discounted Subtotal</span>
                                    <span>₱{subtotalAfterDiscount.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="summary-row">
                                    <span>{deliveryMethod === 'pickup' ? 'Pickup' : 'Delivery Fee'}</span>
                                <span>{shippingFee === 0 ? 'FREE' : `₱${shippingFee}`}</span>
                            </div>
                            {deliveryMethod === 'delivery' && multiAddressEnabled && (
                                <div className="small mb-2" style={{ color: 'var(--shop-pink)' }}>
                                    <i className="fas fa-route me-1"></i>
                                    {new Set(deliveryAssignments.map((assignment) => String(assignment.addressId || '')).filter(Boolean)).size} delivery stop(s) in one transaction
                                </div>
                            )}
                            {deliveryMethod === 'pickup' && selectedPickupTime && (
                                <div className="small mb-2" style={{ color: 'var(--shop-pink)' }}>
                                    <i className="fas fa-clock me-1"></i>
                                    Pickup: {selectedPickupDate} - {selectedPickupTime}
                                </div>
                            )}
                            {shippingFee === 0 && deliveryMethod === 'delivery' && freeShippingPromo.qualifies && (
                                <div className="text-success small mb-2">
                                    <i className="fas fa-check-circle me-1"></i>
                                    Free shipping promo applied to this order.
                                </div>
                            )}
                            {false && deliveryMethod === 'delivery' && !freeShippingPromo.qualifies && freeShippingPromo.allProductsEligible && freeShippingPromo.amountRemaining > 0 && (
                                <div className="small mb-2" style={{ color: 'var(--shop-pink)' }}>
                                    <i className="fas fa-tag me-1"></i>
                                    Spend another â‚±{freeShippingPromo.amountRemaining.toLocaleString()} to unlock the free shipping promo.
                                </div>
                            )}
                            {deliveryMethod === 'delivery' && !freeShippingPromo.qualifies && freeShippingPromo.hasPromoProducts && !freeShippingPromo.allProductsEligible && (
                                <div className="small mb-2 text-muted">
                                    <i className="fas fa-info-circle me-1"></i>
                                    Free shipping promo only works when every catalogue item in this order is promo-eligible.
                                </div>
                            )}
                            {deliveryMethod === 'delivery' && !freeShippingPromo.qualifies && freeShippingPromo.allProductsEligible && freeShippingPromo.amountRemaining > 0 && (
                                <div className="small mb-2" style={{ color: 'var(--shop-pink)' }}>
                                    <i className="fas fa-tag me-1"></i>
                                    {`Spend another \u20b1${freeShippingPromo.amountRemaining.toLocaleString()} to unlock the free shipping promo.`}
                                </div>
                            )}

                            <div className="summary-row total">
                                <span>Total</span>
                                <span>₱{total.toLocaleString()}</span>
                            </div>

                            <button
                                className="btn-place-order"
                                onClick={handlePlaceOrder}
                                disabled={isProcessing || knownOutOfStockItems.length > 0}
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
                            {deliveryMethod === 'delivery' && addressValidationMessage && (
                                <div className="small text-danger text-center mt-2">
                                    <i className="fas fa-map-marker-alt me-1"></i>
                                    {addressValidationMessage}
                                </div>
                            )}
                            {knownOutOfStockItems.length > 0 && (
                                <div className="small text-danger text-center mt-2">
                                    <i className="fas fa-exclamation-circle me-1"></i>
                                    One or more items in this checkout are out of stock. Please update your cart before ordering.
                                </div>
                            )}

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

            <GCashQrModal
                visible={showQRModal}
                onClose={() => setShowQRModal(false)}
                amount={total}
            />




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

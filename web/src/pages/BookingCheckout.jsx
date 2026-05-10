import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import InfoModal from '../components/InfoModal';
import CheckoutAddressSelection from '../components/CheckoutAddressSelection';
import MultiAddressDeliverySection from '../components/MultiAddressDeliverySection';
import '../styles/Shop.css';
import { supabase } from '../config/supabase';
import { formatCustomOrderV4Currency, getSelectedEstimateFromItem, isCustomOrderV4Item } from '../utils/customOrderV4';
import {
    buildAddressFeeMap,
    buildMultiDeliveryDestinations,
    createDeliveryAssignments,
    syncDeliveryAssignments,
} from '../utils/deliveryDestinations';
import { uploadBookingRequestImages } from '../utils/requestImageUploads';
import { insertUserNotification } from '../utils/notificationApi';
import { reserveRequestStockAllocations, resolveBookingRequestStockReservations } from '../utils/requestSubmission';
import { PICKUP_TIME_OPTIONS, getEarliestPickupDate, isPickupDateSelectable } from '../utils/businessHours';
import { buildTentativePricingSummary, getTentativeBreakdownFromItem } from '../utils/customOrderTentativePricing';
import { fetchCustomOrderCatalog } from '../utils/customOrderCatalog';
import {
    PROMO_CHANNELS,
    buildDiscountFields,
    buildDiscountSnapshot,
    calculatePromoPricing,
    fetchDiscountPromos,
    getPromoValidationMessage,
    normalizePromoCode,
    recordDiscountRedemption,
} from '../utils/promoEngine';

const pickupTimes = PICKUP_TIME_OPTIONS;
const DEFAULT_SHIPPING_FEE = 100;
const getBookingCheckoutStorageKey = (userId) => `bookingCheckoutItems_${userId || 'guest'}`;

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
        serviceType: String(item?.serviceType || 'Custom Order').replace(/\s*v\d+$/i, '').trim() || 'Custom Order',
    }))
);

const getBookingCheckoutItemKey = (item = {}) => (
    String(
        item?.id
        || [
            item?.occasion,
            item?.eventDate,
            item?.eventTime,
            item?.venue,
            item?.arrangementSummary,
            item?.arrangementType,
            item?.customerName,
            item?.recipientName,
        ].filter(Boolean).join('|')
    ).trim()
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

const summarizeUploadedArrangementSelections = (items = []) => {
    const groupedSelections = new Map();

    (Array.isArray(items) ? items : []).forEach((item) => {
        const arrangementSelections = Array.isArray(item?.arrangementSelections) ? item.arrangementSelections : [];
        arrangementSelections.forEach((selection) => {
            const label = String(
                selection?.arrangement_label
                || selection?.arrangementLabel
                || selection?.arrangement_type
                || selection?.arrangementType
                || ''
            ).trim();
            if (!label) {
                return;
            }

            if (!groupedSelections.has(label)) {
                groupedSelections.set(label, {
                    ...selection,
                    arrangement_label: label,
                    arrangementLabel: label,
                    quantity: 0,
                    arrangement_quantity: 0,
                    total_flowers: 0,
                    totalFlowers: 0,
                    preferred_flowers: [],
                    preferredFlowers: [],
                });
            }

            const current = groupedSelections.get(label);
            const selectionQuantity = Number(selection?.quantity || selection?.arrangement_quantity || 1) || 1;
            const totalFlowers = Number(selection?.total_flowers || selection?.totalFlowers || 0) || 0;
            const preferredFlowers = Array.isArray(selection?.preferred_flowers)
                ? selection.preferred_flowers
                : (Array.isArray(selection?.preferredFlowers) ? selection.preferredFlowers : []);

            current.quantity += selectionQuantity;
            current.arrangement_quantity += selectionQuantity;
            current.total_flowers += totalFlowers;
            current.totalFlowers += totalFlowers;
            current.preferred_flowers = Array.from(new Set([...(current.preferred_flowers || []), ...preferredFlowers]));
            current.preferredFlowers = current.preferred_flowers;
        });
    });

    return Array.from(groupedSelections.values());
};

const buildBookingArrangementSummary = (arrangementSelections = []) => (
    (Array.isArray(arrangementSelections) ? arrangementSelections : [])
        .map((selection) => {
            const label = String(
                selection?.arrangement_label
                || selection?.arrangementLabel
                || selection?.arrangement_type
                || selection?.arrangementType
                || ''
            ).trim();
            const quantity = Number(selection?.quantity || selection?.arrangement_quantity || 1) || 1;
            if (!label) {
                return null;
            }
            return quantity > 1 ? `${label} x${quantity}` : label;
        })
        .filter(Boolean)
        .join(', ')
);

const parseStoredBookingItems = (value) => {
    if (!value) return [];

    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('Error parsing stored booking items:', error);
        return [];
    }
};

const parseStoredSelectionMap = (value) => {
    if (!value) return {};

    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        console.error('Error parsing stored booking selection map:', error);
        return {};
    }
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
    const [catalogArrangements, setCatalogArrangements] = useState([]);
    const [promoCodeInput, setPromoCodeInput] = useState('');
    const [appliedPromoCode, setAppliedPromoCode] = useState('');
    const [promoState, setPromoState] = useState({
        promos: [],
        loading: false,
        unavailable: false,
        message: '',
        type: '',
    });

    const showInfoModal = (title, message, linkTo = '', linkText = '') => {
        setInfoModal({ show: true, title, message, linkTo, linkText });
    };

    useEffect(() => {
        const cartKey = `bookingCart_${user?.id || 'guest'}`;
        const checkoutKey = getBookingCheckoutStorageKey(user?.id);
        const checkoutStorageValue = localStorage.getItem(checkoutKey);
        const hasScopedCheckoutSelection = checkoutStorageValue !== null;
        const checkoutSelectionItems = parseStoredBookingItems(checkoutStorageValue);
        const legacySelectionItems = parseStoredBookingItems(localStorage.getItem('bookingCart'));
        const scopedCartItems = parseStoredBookingItems(localStorage.getItem(cartKey));
        const scopedSelectionMap = parseStoredSelectionMap(localStorage.getItem(`bookSelection_${user?.id || 'guest'}`));
        const selectedScopedCartItems = scopedCartItems.filter((item, index) => (
            scopedSelectionMap[`book-${index}`] === true
        ));
        const sourceItems = hasScopedCheckoutSelection
            ? checkoutSelectionItems
            : selectedScopedCartItems.length
                ? selectedScopedCartItems
                : legacySelectionItems.length
                ? legacySelectionItems
                : scopedCartItems;

        if (!sourceItems.length) {
            navigate('/booking-cart');
            return;
        }

        try {
            const normalizedItems = normalizeInquiryItems(sourceItems);
            if (!normalizedItems.length) {
                navigate('/');
                return;
            }
            setInquiryItems(normalizedItems);
        } catch (error) {
            console.error('Error preparing booking checkout items:', error);
            navigate('/');
        }
    }, [navigate, user]);

    useEffect(() => {
        let isMounted = true;

        const loadCatalog = async () => {
            const catalog = await fetchCustomOrderCatalog();
            if (isMounted) {
                setCatalogArrangements(Array.isArray(catalog?.arrangements) ? catalog.arrangements : []);
            }
        };

        loadCatalog();
        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        let isMounted = true;

        const loadPromos = async () => {
            setPromoState((current) => ({ ...current, loading: true }));
            try {
                const result = await fetchDiscountPromos(supabase, {
                    channelScope: PROMO_CHANNELS.CUSTOM_ORDER,
                    customerId: user?.id,
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
                console.error('Error loading custom order discount promos:', error);
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

    const inquirySummary = useMemo(() => buildBookingSummary(inquiryItems), [inquiryItems]);
    const estimatedInquiryTotal = useMemo(() => (
        inquiryItems.reduce((sum, item) => sum + (getSelectedEstimateFromItem(item)?.estimatedPrice || item.estimatedPrice || 0), 0)
    ), [inquiryItems]);
    const hasEstimatedInquiryTotal = useMemo(() => (
        inquiryItems.some((item) => !!(getSelectedEstimateFromItem(item)?.estimatedPrice || item.estimatedPrice))
    ), [inquiryItems]);
    const tentativeInquiryBreakdowns = useMemo(
        () => inquiryItems.map((item) => getTentativeBreakdownFromItem(item, catalogArrangements)),
        [catalogArrangements, inquiryItems]
    );
    const combinedPricingSummary = useMemo(
        () => buildTentativePricingSummary({
            fixedAmount: estimatedInquiryTotal,
            tentativeBreakdowns: tentativeInquiryBreakdowns,
        }),
        [estimatedInquiryTotal, tentativeInquiryBreakdowns]
    );
    const customOrderReviewShippingFee = 0;
    const customOrderArrangementTargets = useMemo(() => Array.from(new Set(
        inquiryItems.flatMap((item) => [
            item.arrangementSummary,
            item.arrangementType,
            ...(Array.isArray(item.arrangementTypes) ? item.arrangementTypes : []),
            ...(Array.isArray(item.arrangementSelections)
                ? item.arrangementSelections.flatMap((selection) => [
                    selection?.arrangement_label,
                    selection?.arrangementLabel,
                    selection?.arrangement_type,
                    selection?.arrangementType,
                    selection?.label,
                    selection?.value,
                ])
                : []),
        ].filter(Boolean))
    )), [inquiryItems]);
    const estimatedDiscountSubtotal = hasEstimatedInquiryTotal
        ? estimatedInquiryTotal
        : (
            combinedPricingSummary.subtotalMax
            || combinedPricingSummary.subtotalMin
            || 0
        );
    const promoLines = useMemo(() => {
        const lines = inquiryItems.map((item, index) => {
            const tentativeBreakdown = tentativeInquiryBreakdowns[index];
            const estimate = getSelectedEstimateFromItem(item)?.estimatedPrice
                || item.estimatedPrice
                || tentativeBreakdown?.subtotalMax
                || tentativeBreakdown?.subtotalMin
                || 0;
            const arrangementTargets = [
                item.arrangementSummary,
                item.arrangementType,
                ...(Array.isArray(item.arrangementTypes) ? item.arrangementTypes : []),
                ...(Array.isArray(item.arrangementSelections)
                    ? item.arrangementSelections.flatMap((selection) => [
                        selection?.arrangement_label,
                        selection?.arrangementLabel,
                        selection?.arrangement_type,
                        selection?.arrangementType,
                        selection?.label,
                        selection?.value,
                    ])
                    : []),
            ].filter(Boolean);

            return {
                key: `custom-order-${item.id || index}-${index}`,
                id: item.id || index,
                name: item.name || item.occasion || `Custom Order ${index + 1}`,
                quantity: 1,
                unitPrice: estimate,
                originalUnitPrice: estimate,
                targetKeys: [
                    item.id,
                    item.occasion,
                    item.name,
                    ...arrangementTargets,
                ].filter(Boolean),
                occasionTargets: [item.occasion].filter(Boolean),
                arrangementTargets,
            };
        });

        if (!lines.some((line) => Number(line.unitPrice || 0) > 0) && estimatedDiscountSubtotal > 0) {
            return [{
                key: 'custom-order-estimate',
                id: 'custom-order-estimate',
                name: inquirySummary.summaryLabel,
                quantity: 1,
                unitPrice: estimatedDiscountSubtotal,
                originalUnitPrice: estimatedDiscountSubtotal,
                targetKeys: [inquirySummary.summaryLabel, ...customOrderArrangementTargets],
                occasionTargets: inquirySummary.combinedOccasions,
                arrangementTargets: customOrderArrangementTargets,
            }];
        }

        return lines;
    }, [customOrderArrangementTargets, estimatedDiscountSubtotal, inquiryItems, inquirySummary, tentativeInquiryBreakdowns]);
    const promoPricing = useMemo(() => calculatePromoPricing({
        lines: promoLines,
        promos: promoState.promos,
        channelScope: PROMO_CHANNELS.CUSTOM_ORDER,
        customerId: user?.id,
        enteredCode: appliedPromoCode,
        shippingFee: customOrderReviewShippingFee,
        occasions: inquirySummary.combinedOccasions,
        arrangementTargets: customOrderArrangementTargets,
    }), [appliedPromoCode, customOrderArrangementTargets, inquirySummary.combinedOccasions, promoLines, promoState.promos, user?.id]);
    const estimatedDiscountTotal = promoPricing.discountTotal;
    const estimatedSubtotalAfterDiscount = promoPricing.subtotalAfterDiscount;
    const promoFeedbackMessage = appliedPromoCode
        ? getPromoValidationMessage(promoPricing.validation)
        : (
            promoPricing.chosenPromo
                ? `${promoPricing.chosenPromo.name || promoPricing.chosenPromo.code} estimated automatically.`
                : ''
        );
    const promoFeedbackType = appliedPromoCode && promoPricing.validation?.status !== 'applied'
        ? 'error'
        : (promoFeedbackMessage ? 'success' : '');
    const estimatedDiscountSnapshot = useMemo(() => {
        const snapshot = buildDiscountSnapshot(promoPricing);
        return snapshot
            ? {
                ...snapshot,
                is_estimate: true,
                final_quote_recomputed: false,
            }
            : null;
    }, [promoPricing]);
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

    const handleSubmitInquiry = async () => {
        if (!user) {
            showInfoModal('Login Required', 'You must be logged in to submit a custom order.', '/login', 'Log In');
            return;
        }

        if (deliveryMethod === 'pickup' && (!selectedPickupDate || !selectedPickupTime)) {
            showInfoModal('Missing Information', 'Please select a pickup date and time.');
            return;
        }

        if (deliveryMethod === 'pickup' && !isPickupDateSelectable(selectedPickupDate)) {
            showInfoModal('Invalid Pickup Date', 'Pickup must be scheduled on a weekday starting tomorrow.');
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
                }).map((destination) => ({
                    ...destination,
                    shipping_fee: customOrderReviewShippingFee,
                }))
                : [];

            const uploadedItems = await uploadBookingRequestImages(inquiryItems, user.id);
            const stockAllocations = await resolveBookingRequestStockReservations({
                supabase,
                items: uploadedItems,
            });

            const requestNumber = `REQ-${user.id.substring(0, 4)}-${Date.now()}`;
            const primaryDestination = multiDeliveryDestinations[0] || null;
            const firstItem = uploadedItems[0] || {};
            const pickupDateTime = deliveryMethod === 'pickup'
                ? `${selectedPickupDate} - ${selectedPickupTime}`
                : null;
            const commonNotes = Array.from(
                new Set(
                    uploadedItems
                        .map((item) => String(item?.specialInstructions || '').trim())
                        .filter(Boolean)
                )
            ).join('\n\n');
            const combinedArrangementSelections = summarizeUploadedArrangementSelections(uploadedItems);
            const combinedSelectedFlowers = Array.from(
                new Set(
                    uploadedItems.flatMap((item) => (
                        Array.isArray(item?.selectedFlowers)
                            ? item.selectedFlowers
                            : Array.isArray(item?.preferredFlowers)
                                ? item.preferredFlowers
                                : (Array.isArray(item?.customerPreferredFlowers) ? item.customerPreferredFlowers : [])
                    ))
                        .map((flowerName) => String(flowerName || '').trim())
                        .filter(Boolean)
                )
            );
            const combinedColorPreference = Array.from(
                new Set(
                    uploadedItems
                        .map((item) => String(item?.colorPreference || '').trim())
                        .filter(Boolean)
                )
            ).join(' | ');
            const combinedArrangementSummary = buildBookingArrangementSummary(combinedArrangementSelections);
            const firstItemImage = uploadedItems.find((item) => item?.image_url)?.image_url || uploadedItems[0]?.image || null;

            const newRequest = {
                request_number: requestNumber,
                user_id: user.id,
                type: 'booking',
                status: 'pending',
                contact_number: primaryDestination?.recipient_phone || firstItem.contactNumber || address.phone || null,
                delivery_method: deliveryMethod,
                pickup_time: pickupDateTime,
                shipping_fee: customOrderReviewShippingFee,
                payment_status: 'to_pay',
                image_url: firstItemImage,
                notes: commonNotes || null,
                ...buildDiscountFields(promoPricing),
                discount_snapshot: estimatedDiscountSnapshot,
                data: {
                    items: uploadedItems,
                    requestVariant: uploadedItems.some((item) => item.custom_order_version === 4)
                        ? 'custom_order_v4'
                        : uploadedItems.some((item) => item.custom_order_version === 2)
                            ? 'custom_order_v2'
                            : null,
                    custom_order_version: uploadedItems.some((item) => item.custom_order_version === 4)
                        ? 4
                        : uploadedItems.some((item) => item.custom_order_version === 2)
                            ? 2
                            : null,
                    item_count: uploadedItems.length,
                    summary_label: inquirySummary.summaryLabel,
                    combined_occasions: inquirySummary.combinedOccasions,
                    combined_dates: inquirySummary.combinedDates,
                    recipientName: firstItem.recipientName || null,
                    occasion: firstItem.occasion || null,
                    eventDate: firstItem.eventDate || null,
                    eventTime: firstItem.eventTime || null,
                    venue: firstItem.venue || null,
                    arrangementSummary: combinedArrangementSummary || firstItem.arrangementSummary || firstItem.arrangementType || null,
                    arrangementSelections: combinedArrangementSelections,
                    selectedFlowers: combinedSelectedFlowers,
                    flowers: combinedSelectedFlowers.join(', ') || null,
                    estimated_total: hasEstimatedInquiryTotal ? estimatedInquiryTotal : null,
                    estimated_discount_total: estimatedDiscountTotal,
                    discount_total: estimatedDiscountTotal,
                    discount_snapshot: estimatedDiscountSnapshot,
                    applied_promo_code: promoPricing.appliedPromoCode,
                    subtotal_before_discount: promoPricing.subtotalBeforeDiscount,
                    subtotal_after_discount: estimatedSubtotalAfterDiscount,
                    tentative_pricing: combinedPricingSummary.hasAnyEstimate ? {
                        has_complete_estimate: combinedPricingSummary.hasCompleteEstimate,
                        subtotal_min: combinedPricingSummary.subtotalMin,
                        subtotal_max: combinedPricingSummary.subtotalMax,
                        discount_total: estimatedDiscountTotal,
                        subtotal_after_discount: estimatedSubtotalAfterDiscount,
                    } : null,
                    colorPreference: combinedColorPreference || firstItem.colorPreference || null,
                    specialInstructions: commonNotes || firstItem.specialInstructions || null,
                    address: deliveryMethod === 'delivery' ? address : null,
                    address_id: deliveryMethod === 'delivery' ? (primaryDestination?.address_id || selectedAddressId) : null,
                    multi_delivery_destinations: multiDeliveryDestinations,
                    delivery_method: deliveryMethod,
                    pickup_time: pickupDateTime,
                    shipping_fee: customOrderReviewShippingFee,
                    image_url: firstItemImage,
                    image: uploadedItems[0]?.image || null,
                    preview_image_url: uploadedItems[0]?.preview_image_url || firstItemImage || null,
                    previewComposition: uploadedItems[0]?.previewComposition || uploadedItems[0]?.preview_composition || null,
                    stock_allocation_status: 'pending',
                    stock_allocations: stockAllocations,
                },
            };

            const { data: insertedRequest, error } = await supabase
                .from('requests')
                .insert([newRequest])
                .select('id')
                .single();
            if (error) throw error;

            try {
                await recordDiscountRedemption(supabase, {
                    pricing: promoPricing,
                    userId: user.id,
                    requestId: insertedRequest.id,
                    channelScope: PROMO_CHANNELS.CUSTOM_ORDER,
                    status: 'reserved',
                });
            } catch (redemptionError) {
                console.error('Error reserving custom order discount redemption:', redemptionError);
            }

            if (stockAllocations.length > 0 && insertedRequest?.id) {
                const reservationResult = await reserveRequestStockAllocations({
                    supabase,
                    requestId: insertedRequest.id,
                    allocations: stockAllocations,
                });

                if (!reservationResult.success) {
                    console.error('Error reserving booking request stock:', reservationResult.error);
                    await supabase.from('requests').delete().eq('id', insertedRequest.id);
                    showInfoModal(
                        'Stock Changed',
                        'Some preferred flower stock changed while you were checking out. Please review your custom order cart and try again.'
                    );
                    setIsProcessing(false);
                    return;
                }
            }

            try {
                await insertUserNotification({
                    userId: user.id,
                    type: 'request',
                    title: 'Custom Order Submitted',
                    message: `Your custom order request #${requestNumber} has been submitted and is waiting for review.`,
                    icon: 'fa-file-alt',
                    link: `/request-tracking/${requestNumber}`,
                });
            } catch (notificationError) {
                console.error('Error creating booking notification:', notificationError);
            }

            localStorage.removeItem('bookingCart');
            localStorage.removeItem(getBookingCheckoutStorageKey(user.id));

            const scopedCartKey = `bookingCart_${user.id}`;
            const submittedItemKeys = new Set(uploadedItems.map((item) => getBookingCheckoutItemKey(item)).filter(Boolean));

            try {
                const persistedCart = JSON.parse(localStorage.getItem(scopedCartKey) || '[]');
                const remainingItems = persistedCart.filter((item) => !submittedItemKeys.has(getBookingCheckoutItemKey(item)));

                if (remainingItems.length > 0) {
                    localStorage.setItem(scopedCartKey, JSON.stringify(remainingItems));
                } else {
                    localStorage.removeItem(scopedCartKey);
                }
            } catch (storageError) {
                console.error('Error updating booking cart after request submission:', storageError);
                localStorage.removeItem(scopedCartKey);
            }

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
                        <Link to="/custom-order" className="btn-shop-now">Create a Custom Order</Link>
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
                                        min={getEarliestPickupDate()}
                                        onKeyDown={(event) => event.preventDefault()}
                                        onChange={(event) => {
                                            const selected = event.target.value;
                                            if (!isPickupDateSelectable(selected)) {
                                                showInfoModal('Invalid Date', 'Pickup is only available on weekdays starting tomorrow.');
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
                                {inquiryItems.map((item, idx) => {
                                    const tentativeBreakdown = tentativeInquiryBreakdowns[idx];

                                    return (
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
                                        {tentativeBreakdown?.lineItems?.length ? (
                                            <div className="mt-3">
                                                <p className="mb-2"><strong>Tentative Breakdown:</strong></p>
                                                <div className="border rounded-3 bg-white p-3">
                                                    {tentativeBreakdown.lineItems.map((lineItem) => (
                                                        <div key={lineItem.key} className="d-flex justify-content-between gap-3 small mb-2">
                                                            <div>
                                                                <div className="fw-semibold text-dark">{lineItem.label} x{lineItem.quantity}</div>
                                                                <div className="text-muted">Each: {lineItem.formattedUnitRange}</div>
                                                            </div>
                                                            <div className="fw-semibold text-end">{lineItem.formattedLineRange}</div>
                                                        </div>
                                                    ))}
                                                    <div className="d-flex justify-content-between pt-2 mt-2 border-top">
                                                        <span className="text-muted">Tentative Subtotal</span>
                                                        <span className="fw-semibold">
                                                            {tentativeBreakdown.hasCompleteEstimate ? tentativeBreakdown.formattedSubtotalRange : 'To be quoted'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : null}
                                        {item.flowers && <p className="mb-1"><strong>Preferred Flowers:</strong> {item.flowers}</p>}
                                        {isCustomOrderV4Item(item) && (
                                            <>
                                                <p className="mb-1"><strong>Original Target Price:</strong> {formatCustomOrderV4Currency(item.originalEstimatedPrice || 0)}</p>
                                                <p className="mb-1"><strong>Customer Budget:</strong> {formatCustomOrderV4Currency(item.customerBudget || 0)}</p>
                                                <p className="mb-1"><strong>Preferred Version:</strong> {item.selectedOptionLabel || 'Original target design'}</p>
                                                <p className="mb-1"><strong>Rough Estimate:</strong> {formatCustomOrderV4Currency(getSelectedEstimateFromItem(item)?.estimatedPrice || item.estimatedPrice || 0)}</p>
                                            </>
                                        )}
                                        {item.colorPreference && <p className="mb-1"><strong>Color Theme:</strong> {item.colorPreference}</p>}
                                        {item.specialInstructions && <p className="mb-1 mt-2"><strong>Details:</strong> {item.specialInstructions}</p>}
                                    </div>
                                )})}
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
                            {hasEstimatedInquiryTotal && (
                                <div className="summary-row">
                                    <span>Current rough estimate</span>
                                    <span>{formatCustomOrderV4Currency(estimatedInquiryTotal)}</span>
                                </div>
                            )}
                            {tentativeInquiryBreakdowns.some((breakdown) => breakdown.hasAnyEstimate) && (
                                <div className="summary-row">
                                    <span>Tentative subtotal</span>
                                    <span>{combinedPricingSummary.hasCompleteEstimate ? combinedPricingSummary.formattedSubtotalRange : 'To be quoted'}</span>
                                </div>
                            )}
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
                            {estimatedDiscountTotal > 0 && (
                                <>
                                    <div className="summary-row text-success">
                                        <span>Estimated discount{promoPricing.chosenPromo?.code ? ` (${promoPricing.chosenPromo.code})` : ''}</span>
                                        <span>-{formatCustomOrderV4Currency(estimatedDiscountTotal)}</span>
                                    </div>
                                    <div className="small text-muted mb-2">
                                        This is a tentative discount. The final discount will be recomputed from the admin quote.
                                    </div>
                                </>
                            )}
                            <div className="summary-row">
                                <span>{deliveryMethod === 'pickup' ? 'Pickup' : 'Delivery Fee'}</span>
                                <span>{deliveryMethod === 'pickup' ? 'FREE' : 'Set after review'}</span>
                            </div>
                            <hr />
                            <div className="summary-row total">
                                <span>Tentative Total</span>
                                <span className="fw-bold fs-5">
                                    {estimatedDiscountTotal > 0 && promoPricing.finalTotal > 0
                                        ? `Estimate: ${formatCustomOrderV4Currency(promoPricing.finalTotal)}`
                                        : combinedPricingSummary.hasCompleteEstimate
                                        ? combinedPricingSummary.formattedTotalRange
                                        : hasEstimatedInquiryTotal
                                            ? `Guide: ${formatCustomOrderV4Currency(estimatedInquiryTotal)}`
                                            : 'To be quoted'}
                                </span>
                            </div>
                            {(hasEstimatedInquiryTotal || tentativeInquiryBreakdowns.some((breakdown) => breakdown.hasAnyEstimate)) && (
                                <div className="small text-muted mb-3">
                                    Final pricing will still be confirmed after our team reviews your request.
                                </div>
                            )}
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

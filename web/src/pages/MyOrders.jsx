import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import InfoModal from '../components/InfoModal';
import CustomOrderQuotePaymentModal from '../components/CustomOrderQuotePaymentModal';
import CustomizedBouquetPreview from '../components/CustomizedBouquetPreview';
import { insertStaffNotifications, insertUserNotification } from '../utils/notificationApi';
import {
    applyRequestItemCancellation,
    getCancellationItemDisplayLabel,
    normalizeCancellationItem,
    summarizeCancellationItems,
} from '../utils/orderCancellation';
import {
    createRefundRequest,
    getRefundRequestForEntity,
    isActiveRefundRequest,
    requiresRefundReviewBeforeCancellation,
} from '../utils/refundWorkflows';
import { parseMultiDeliveryNotes } from '../utils/deliveryDestinations';
import '../styles/Shop.css';

const orderTabs = [
    { id: 'all', label: 'All Orders' },
    { id: 'pending', label: 'Pending' },
    { id: 'processing', label: 'Processing' },
    { id: 'ready_for_pickup', label: 'Ready for Pickup' },
    { id: 'to_receive', label: 'Out for Delivery' },
    { id: 'claimed', label: 'Claimed' },
    { id: 'completed', label: 'Completed' },
    { id: 'cancelled', label: 'Cancelled' },
];

const getCustomizedPreviewItems = (order) => {
    const sourceItems = Array.isArray(order?.data?.items) ? order.data.items.filter(Boolean) : [];

    if (sourceItems.length) {
        return sourceItems.map((item, index) => ({
            key: item.id || item.listId || `${order?.id || 'customized'}-${index}`,
            name: item.name || (item.bundleSize ? `Customizer Studio (${item.bundleSize} stems)` : `Customizer Studio ${index + 1}`),
            image: item.image_url || item.image || item.photo || order?.image_url || order?.photo || order?.photo_url || null,
            previewComposition: item.previewComposition || item.preview_composition || null,
            quantity: item.qty || item.quantity || 1,
            price: Number(item.price || 0),
            variant: item.bundleSize ? `${item.bundleSize} stems` : null,
        }));
    }

    if (!(order?.flower || order?.bundleSize || order?.wrapper || order?.ribbon || order?.image_url || order?.photo || order?.photo_url)) {
        return [];
    }

    return [{
        key: `${order?.id || 'customized'}-legacy`,
        name: order?.bundleSize ? `Customizer Studio (${order.bundleSize} stems)` : 'Customizer Studio',
        image: order?.image_url || order?.photo || order?.photo_url || null,
        previewComposition: order?.previewComposition || order?.preview_composition || order?.data?.previewComposition || order?.data?.preview_composition || null,
        quantity: 1,
        price: 0,
        variant: order?.bundleSize ? `${order.bundleSize} stems` : null,
    }];
};

const parseJsonObject = (value) => {
    if (!value) return {};
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch (error) {
            return {};
        }
    }
    return typeof value === 'object' ? value : {};
};

const buildStatusTimestamps = (existingValue, status, reason = '') => {
    const next = {
        ...parseJsonObject(existingValue),
        [status]: new Date().toISOString(),
    };

    if (status === 'cancelled' && reason) {
        next.cancellation_reason = reason;
        next.cancel_reason = reason;
    }

    return next;
};

const roundCurrency = (value) => Math.round((Number.parseFloat(String(value ?? 0)) || 0) * 100) / 100;

const getRequestIdFromOrder = (order) => (
    order?.request_id
    || (order?.isRequest && typeof order?.id === 'string' ? order.id.replace(/^request-/, '') : null)
    || null
);

const MyOrders = () => {
    const navigate = useNavigate();
    const [activeOrderTab, setActiveOrderTab] = useState('all');
    const [orders, setOrders] = useState([]);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [orderToCancel, setOrderToCancel] = useState(null);
    const [cancelTargetItemKey, setCancelTargetItemKey] = useState('');
    const [cancelQuantity, setCancelQuantity] = useState(1);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelReasonError, setCancelReasonError] = useState('');
    const [showWaitingModal, setShowWaitingModal] = useState(false);
    const [showChatModal, setShowChatModal] = useState(false);
    const [selectedOrderForChat, setSelectedOrderForChat] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);
    const [newChatMessage, setNewChatMessage] = useState('');
    const chatMessagesEndRef = useRef(null);
    const [receiptFile, setReceiptFile] = useState(null);
    const [receiptPreview, setReceiptPreview] = useState(null);
    const [uploadingReceiptFor, setUploadingReceiptFor] = useState(null);
    const [orderMessages, setOrderMessages] = useState({}); // Store message info for each order
    const [totalUnreadMessages, setTotalUnreadMessages] = useState(0);
    const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '', linkTo: null, linkText: '', linkState: null });
    const [currentUserId, setCurrentUserId] = useState(null);
    const [quotePaymentOrder, setQuotePaymentOrder] = useState(null);

    useEffect(() => {
        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                navigate('/login');
                return;
            }
            setCurrentUserId(session.user.id);
            loadOrders(session.user.id); // Pass user ID to loadOrders
        };
        checkUser();
    }, [navigate]);

    const loadOrders = async (currentUserId) => {
        try {
            // Fetch orders from Supabase with order_items and address details
            const { data: apiOrders, error: ordersError } = await supabase
                .from('orders')
                .select('*, order_items(*), addresses(*)') // Assuming 'order_items' is the table for items and 'addresses' for addresses
                .eq('user_id', currentUserId)
                .order('created_at', { ascending: false })
                .limit(100);

            if (ordersError) {
                console.error('Error fetching orders:', ordersError);
                throw ordersError;
            }

            // Fetch requests from Supabase
            const { data: apiRequests, error: requestsError } = await supabase
                .from('requests')
                .select('*')
                .eq('user_id', currentUserId)
                .order('created_at', { ascending: false })
                .limit(100);

            if (requestsError) {
                console.error('Error fetching requests:', requestsError);
                throw requestsError;
            }

            console.log('--- Supabase Orders API Response (apiOrders) ---', apiOrders);
            console.log('--- Supabase Requests API Response (apiRequests) ---', apiRequests);

            console.log(`Loaded ${apiOrders.length} orders and ${apiRequests.length} requests for current user`);

            // Transform API orders to match the expected format
            const transformedOrders = (apiOrders || []).map((order) => {
                const requestData = parseJsonObject(order.request_data);
                const parsedOrderNotes = parseMultiDeliveryNotes(order.notes);
                const orderItemSummary = summarizeCancellationItems(order.order_items || []);
                const requestItemSummary = summarizeCancellationItems(requestData?.items || []);
                const preferredSummary = orderItemSummary.hasItems ? orderItemSummary : requestItemSummary;
                const displayItems = preferredSummary.items.map((item) => ({
                    ...item,
                    price: item.unitPrice,
                    qty: item.remainingQuantity,
                    quantity: item.remainingQuantity,
                }));
                const shippingFee = parseFloat(order.shipping_fee || 0);
                const computedSubtotal = preferredSummary.hasItems
                    ? preferredSummary.remainingSubtotal
                    : parseFloat(order.subtotal || 0);
                const computedTotal = preferredSummary.hasItems
                    ? (preferredSummary.allCancelled ? 0 : roundCurrency(computedSubtotal + shippingFee))
                    : parseFloat(order.total || 0);

                return {
                    id: order.id,
                    order_number: order.order_number,
                    date: order.created_at,
                    status: preferredSummary.allCancelled ? 'cancelled' : order.status,
                    payment_status: order.payment_status,
                    payment_method: order.payment_method,
                    delivery_method: order.delivery_method,
                    total: computedTotal,
                    subtotal: computedSubtotal,
                    shipping_fee: shippingFee,
                    notes: parsedOrderNotes.note,
                    items: displayItems,
                    activeItems: preferredSummary.activeItems,
                    hasPartialCancellation: preferredSummary.hasCancellations,
                    address_id: order.address_id,
                    address: order.addresses,
                    request_id: order.request_id,
                    isFromRequest: !!order.request_id,
                    type: order.request_type || null,
                    data: requestData || null,
                    image_url: order.request_image_url || order.request_photo_url || null,
                    photo_url: order.request_photo_url || order.request_image_url || null,
                    eventType: order.event_type || (requestData?.eventType || requestData?.event_type),
                    eventDate: order.event_date || requestData?.eventDate,
                    venue: requestData?.venue,
                    details: requestData?.details,
                    fullName: requestData?.fullName,
                    otherEventType: requestData?.otherEventType,
                    recipientName: requestData?.recipientName,
                    occasion: requestData?.occasion,
                    preferences: requestData?.preferences,
                    flower: requestData?.flower,
                    bundleSize: order.bundleSize,
                    wrapper: order.wrapper,
                    ribbon: order.ribbon,
                    subject: requestData?.subject,
                    message: requestData?.message,
                    email: requestData?.email,
                    phone: requestData?.phone,
                    photo: order.request_photo_url || order.request_image_url,
                };
            });
            console.log('--- Transformed Orders (Status & Items) ---', transformedOrders.map(o => ({ id: o.id, status: o.status, items: o.items })));

            // Transform API requests to match the expected format
            const transformedRequests = (apiRequests || []).map((request) => {
                const requestData = typeof request.data === 'string' ? JSON.parse(request.data) : request.data;
                const requestItemSummary = summarizeCancellationItems(requestData?.items || []);
                const displayItems = requestItemSummary.items.map((item) => ({
                    ...item,
                    price: item.unitPrice,
                    qty: item.remainingQuantity,
                    quantity: item.remainingQuantity,
                }));
                const shippingFee = parseFloat(request.shipping_fee || requestData?.shipping_fee || 0);
                const fallbackTotal = parseFloat(
                    request.final_price
                    || request.estimated_price
                    || requestData?.estimated_total
                    || 0
                );
                const computedTotal = requestItemSummary.hasItems
                    ? (requestItemSummary.allCancelled ? 0 : roundCurrency(requestItemSummary.remainingSubtotal + shippingFee))
                    : fallbackTotal;
                return {
                    id: `request-${request.id}`, // Prefix to avoid conflicts
                    request_id: request.id,
                    request_number: request.request_number,
                    date: request.created_at,
                    status: requestItemSummary.allCancelled
                        ? 'cancelled'
                        : (request.status === 'accepted' ? 'processing' : request.status),
                    type: request.type, // booking, customized, special_order
                    payment_status: request.payment_status ?? requestData?.payment_status ?? null,
                    total: computedTotal,
                    subtotal: requestItemSummary.hasItems ? requestItemSummary.remainingSubtotal : fallbackTotal,
                    shipping_fee: shippingFee,
                    notes: request.notes,
                    data: requestData,
                    image_url: request.image_url || request.photo_url || null,
                    photo_url: request.photo_url || request.image_url || null,
                    isRequest: true,
                    items: displayItems,
                    activeItems: requestItemSummary.activeItems,
                    hasPartialCancellation: requestItemSummary.hasCancellations,
                    // Extract specific fields for easier access
                    eventType: requestData?.eventType || requestData?.event_type,
                    eventDate: requestData?.eventDate || requestData?.event_date,
                    venue: requestData?.venue,
                    recipientName: requestData?.recipientName,
                    occasion: requestData?.occasion,
                    preferences: requestData?.preferences,
                    flower: requestData?.flower,
                    bundleSize: requestData?.bundleSize,
                    wrapper: requestData?.wrapper,
                    ribbon: requestData?.ribbon,
                    // Inquiry fields
                    subject: requestData?.subject,
                    message: requestData?.message,
                    email: requestData?.email,
                    phone: requestData?.phone
                };
            });
            console.log('--- Transformed Requests (Status) ---', transformedRequests.map(r => ({ id: r.id, status: r.status })));

            // Combine orders and requests
            // If an order has a request_id, prefer the order (it's the actual order created from booking)
            const allOrders = [...transformedOrders];

            // Add requests that don't have corresponding orders
            transformedRequests.forEach(request => {
                const hasOrder = allOrders.some(order => order.request_id === request.request_id);
                if (!hasOrder) {
                    allOrders.push(request);
                }
            });

            // Sort by date (newest first)
            allOrders.sort((a, b) => {
                const dateA = new Date(a.date || 0);
                const dateB = new Date(b.date || 0);
                return dateB - dateA;
            });

            console.log('--- Final All Orders before setOrders (Status) ---', allOrders.map(o => ({ id: o.id, status: o.status })));
            setOrders(allOrders);
            loadOrderMessages(allOrders);
        } catch (error) {
            console.error('Error loading orders:', error);
            setOrders([]);
            loadOrderMessages([]);

            if (error.message?.includes('Authentication')) {
                navigate('/login');
            } else {
                console.error('Failed to load orders. Please refresh the page.');
            }
        }
    };

    const loadOrderMessages = (ordersList) => {
        const allMessages = JSON.parse(localStorage.getItem('messages') || '[]');
        const messagesByOrder = {};
        let totalUnread = 0;

        ordersList.forEach(order => {
            if (order.id) {
                const orderMsgs = allMessages.filter(msg =>
                    msg.orderId && msg.orderId.toString() === order.id.toString()
                );

                const unreadCount = orderMsgs.filter(msg =>
                    msg.sender === 'admin' && !msg.readByUser
                ).length;

                const lastMessage = orderMsgs.length > 0
                    ? orderMsgs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
                    : null;

                messagesByOrder[order.id] = {
                    count: orderMsgs.length,
                    unreadCount: unreadCount,
                    lastMessage: lastMessage
                };

                totalUnread += unreadCount;
            }
        });

        setOrderMessages(messagesByOrder);
        setTotalUnreadMessages(totalUnread);
    };

    useEffect(() => {
        // Refresh message counts periodically
        const interval = setInterval(() => {
            loadOrderMessages(orders);
        }, 2000);

        // Listen for message updates
        const handleMessageUpdate = () => {
            loadOrderMessages(orders); // orders is the state variable, already updated by loadOrders
        };

        window.addEventListener('messageUpdated', handleMessageUpdate);
        const handleStorageChange = (e) => {
            if (e.key === 'messages') {
                loadOrderMessages(orders);
            }
        };

        window.addEventListener('storage', handleStorageChange);

        return () => {
            clearInterval(interval);
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('messageUpdated', handleMessageUpdate);
        };
    }, [orders]);

    const filteredOrders = activeOrderTab === 'all'
        ? orders
        : orders.filter(o => {
            const status = o.status?.toLowerCase();
            const tab = activeOrderTab.toLowerCase();
            console.log(`Filtering: Order ID: ${o.id}, Status: ${status}, Active Tab: ${tab}`);

            // Map statuses to tabs
            if (tab === 'pending') {
                return status === 'pending';
            } else if (tab === 'processing') {
                // Processing tab should show both 'accepted' and 'processing' statuses
                return status === 'processing' || status === 'accepted';
            } else {
                return status === tab;
            }
        });

    const getStatusBadgeClass = (status) => {
        const classes = {
            pending: 'pending',
            processing: 'processing',
            to_pay: 'pending',
            ready_for_pickup: 'processing',
            to_receive: 'shipped',
            claimed: 'shipped',
            completed: 'delivered',
            cancelled: 'cancelled'
        };
        return classes[status] || 'pending';
    };

    const getStatusLabel = (status) => {
        const labels = {
            pending: 'Pending',
            processing: 'Processing',
            to_pay: 'To Pay',
            ready_for_pickup: 'Ready for Pickup',
            to_receive: 'Out for Delivery',
            claimed: 'Claimed',
            completed: 'Completed',
            cancelled: 'Cancelled'
        };
        return labels[status] || status;
    };

    const handleTrackOrder = (orderNum) => {
        navigate(`/order-tracking/${orderNum}`);
    };

    const handleTrackRequest = (order) => {
        if (!order?.type) return;

        const id = order.request_number
            || order.request_id
            || (typeof order.id === 'string' && order.id.startsWith('request-') ? order.id.replace(/^request-/, '') : order.id);

        if (!id) return;

        if (order.type === 'customized') {
            navigate(`/customized-request-tracking/${id}`);
            return;
        }

        navigate(`/request-tracking/${id}`);
    };

    const handleTrackStatus = (order) => {
        // Show waiting for approval modal for pending requests
        if (order.status === 'pending' && order.type) {
            setShowWaitingModal(true);
        } else {
            if (order.type) {
                handleTrackRequest(order);
                return;
            }

            const id = order.order_number || order.id;
            navigate(`/order-tracking/${id}`);
        }
    };

    const handleAcceptQuote = (order) => {
        setQuotePaymentOrder(order);
    };

    const handleRequestAdjustment = (order) => {
        const requestLabel = order?.request_number
            || order?.request_id
            || (typeof order?.id === 'string' && order.id.startsWith('request-') ? order.id.replace(/^request-/, '') : order?.id)
            || '';

        setInfoModal({
            show: true,
            title: 'Request Price Adjustment',
            message: `To request an adjustment for request #${requestLabel}, please proceed to Messages to chat with our staff.`,
            linkTo: '/profile?menu=messages',
            linkText: 'Go to Messages',
        });
    };

    const handleQuotePaymentSuccess = async () => {
        let nextUserId = currentUserId;
        if (!nextUserId) {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw sessionError;
            nextUserId = session?.user?.id || null;
        }

        if (nextUserId) {
            await loadOrders(nextUserId);
        }

        setInfoModal({
            show: true,
            title: 'Payment Submitted',
            message: 'Your payment is now being confirmed. Thank you!',
        });
    };

    const handleQuotePaymentError = (error) => {
        setInfoModal({
            show: true,
            title: 'Error',
            message: error?.message || 'There was an error submitting your payment. Please try again.',
        });
    };

    const closeCancelModal = () => {
        setShowCancelModal(false);
        setOrderToCancel(null);
        setCancelTargetItemKey('');
        setCancelQuantity(1);
        setCancelReason('');
        setCancelReasonError('');
    };

    const handleCancelClick = (order) => {
        const cancellableItems = (order?.items || []).filter((item) => item.remainingQuantity > 0);

        setOrderToCancel(order);
        setCancelTargetItemKey(cancellableItems[0]?.cancellationKey || '');
        setCancelQuantity(1);
        setCancelReason('');
        setCancelReasonError('');
        setShowCancelModal(true);
    };

    const getCancellableItems = (order) => (order?.items || []).filter((item) => item.remainingQuantity > 0);

    const getPaidCancellationRefundAmount = (order) => {
        const requestData = parseJsonObject(order?.data);
        const amountReceived = Number(order?.amount_received || requestData?.amount_received || 0);
        if (amountReceived > 0) {
            return amountReceived;
        }

        return Number(
            order?.total
            || order?.final_price
            || requestData?.final_price
            || requestData?.estimated_total
            || 0
        );
    };

    const shouldRouteCancellationToRefund = (order) => {
        const requestData = parseJsonObject(order?.data);
        return requiresRefundReviewBeforeCancellation({
            paymentStatus: order?.payment_status || requestData?.payment_status,
            amountPaid: order?.amount_received || requestData?.amount_received || 0,
            fallbackAmount: getPaidCancellationRefundAmount(order),
            receiptUrl: order?.receipt_url || requestData?.receipt_url || '',
            additionalReceipts: order?.additional_receipts || requestData?.additional_receipts || [],
        });
    };

    const createCancellationRefundReview = async ({ order, selectedItem, quantityToCancel, reason }) => {
        const entityType = order?.type ? 'request' : 'order';
        const entityId = entityType === 'request' ? getRequestIdFromOrder(order) : order?.id;
        if (!entityId || !currentUserId) {
            throw new Error('We could not prepare your cancellation review right now. Please sign in again and try once more.');
        }

        const existingRefund = await getRefundRequestForEntity({ entityType, entityId });
        if (isActiveRefundRequest(existingRefund)) {
            return { refundRequest: existingRefund, reused: true };
        }

        const itemLabel = getCancellationItemDisplayLabel(selectedItem);
        const detailedReason = [
            `Cancellation request for ${itemLabel}`,
            `Quantity: ${quantityToCancel}`,
            `Customer reason: ${reason}`,
        ].join('\n');

        const result = await createRefundRequest({
            entityType,
            entityId,
            customerId: currentUserId,
            reason: detailedReason,
            refundAmount: getPaidCancellationRefundAmount(order),
        });

        return {
            refundRequest: result?.refundRequest || null,
            reused: false,
        };
    };

    const updateRegularOrderCancellation = async (order, itemKey, quantityToCancel, reason) => {
        const { data: currentOrder, error: orderFetchError } = await supabase
            .from('orders')
            .select('id, status, status_timestamps, cancellation_reason, subtotal, shipping_fee, total')
            .eq('id', order.id)
            .single();

        if (orderFetchError) {
            throw orderFetchError;
        }

        const { data: currentItems, error: itemsFetchError } = await supabase
            .from('order_items')
            .select('*')
            .eq('order_id', order.id)
            .order('id', { ascending: true });

        if (itemsFetchError) {
            throw itemsFetchError;
        }

        const normalizedItems = (currentItems || []).map((item, index) => normalizeCancellationItem(item, index));
        const selectedItem = normalizedItems.find((item) => String(item.id) === String(itemKey) || item.cancellationKey === String(itemKey));

        if (!selectedItem || selectedItem.remainingQuantity < quantityToCancel) {
            throw new Error('That quantity is no longer available to cancel.');
        }

        const nextCancelledQuantity = selectedItem.cancelledQuantity + quantityToCancel;
        const nextHistory = Array.isArray(selectedItem.cancellation_history)
            ? selectedItem.cancellation_history
            : [];

        const { error: updateItemError } = await supabase
            .from('order_items')
            .update({
                cancelled_quantity: nextCancelledQuantity,
                cancellation_history: [
                    ...nextHistory,
                    {
                        quantity: quantityToCancel,
                        reason,
                        cancelled_at: new Date().toISOString(),
                    },
                ],
            })
            .eq('id', selectedItem.id);

        if (updateItemError) {
            throw updateItemError;
        }

        if (selectedItem.product_id) {
            const { data: product, error: productFetchError } = await supabase
                .from('products')
                .select('stock_quantity')
                .eq('id', selectedItem.product_id)
                .single();

            if (!productFetchError && product) {
                await supabase
                    .from('products')
                    .update({ stock_quantity: Number(product.stock_quantity || 0) + quantityToCancel })
                    .eq('id', selectedItem.product_id);
            }
        }

        const nextItems = normalizedItems.map((item) => (
            item.id === selectedItem.id
                ? normalizeCancellationItem({
                    ...item,
                    cancelled_quantity: nextCancelledQuantity,
                })
                : item
        ));
        const summary = summarizeCancellationItems(nextItems);
        const nextSubtotal = summary.remainingSubtotal;
        const nextShippingFee = summary.allCancelled ? 0 : Number(currentOrder.shipping_fee || 0);
        const nextStatus = summary.allCancelled ? 'cancelled' : currentOrder.status;

        const { error: updateOrderError } = await supabase
            .from('orders')
            .update({
                subtotal: nextSubtotal,
                shipping_fee: nextShippingFee,
                total: summary.allCancelled ? 0 : roundCurrency(nextSubtotal + nextShippingFee),
                status: nextStatus,
                cancellation_reason: summary.allCancelled
                    ? (reason || currentOrder.cancellation_reason || null)
                    : currentOrder.cancellation_reason || null,
                status_timestamps: summary.allCancelled
                    ? buildStatusTimestamps(currentOrder.status_timestamps, 'cancelled', reason)
                    : currentOrder.status_timestamps,
            })
            .eq('id', order.id);

        if (updateOrderError) {
            throw updateOrderError;
        }
    };

    const updateRequestCancellation = async (order, itemKey, quantityToCancel, reason) => {
        const requestId = getRequestIdFromOrder(order);
        if (!requestId) {
            throw new Error('This request could not be found.');
        }

        const { data: currentRequest, error: requestFetchError } = await supabase
            .from('requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (requestFetchError) {
            throw requestFetchError;
        }

        const requestData = parseJsonObject(currentRequest?.data);
        const requestItems = Array.isArray(requestData?.items) ? requestData.items : [];
        const normalizedItems = requestItems.map((item, index) => normalizeCancellationItem(item, index));
        const selectedItem = normalizedItems.find((item) => item.cancellationKey === String(itemKey));

        if (!selectedItem || selectedItem.remainingQuantity < quantityToCancel) {
            throw new Error('That quantity is no longer available to cancel.');
        }

        const updatedItems = requestItems.map((item, index) => {
            const normalizedItem = normalizedItems[index];
            return normalizedItem?.cancellationKey === String(itemKey)
                ? applyRequestItemCancellation(item, quantityToCancel, reason)
                : item;
        });

        const summary = summarizeCancellationItems(updatedItems);
        const nextShippingFee = summary.allCancelled ? 0 : Number(currentRequest.shipping_fee || requestData?.shipping_fee || 0);
        const nextSubtotal = summary.remainingSubtotal;
        const nextTotal = summary.allCancelled ? 0 : roundCurrency(nextSubtotal + nextShippingFee);
        const nextStatus = summary.allCancelled ? 'cancelled' : currentRequest.status;
        const nextItemCount = summary.remainingQuantityTotal || summary.activeItems.length;
        const nextCancellationReason = summary.allCancelled
            ? reason
            : (requestData?.cancellation_reason || currentRequest?.cancellation_reason || null);
        const nextData = {
            ...(requestData && typeof requestData === 'object' ? requestData : {}),
            items: updatedItems,
            item_count: nextItemCount,
            itemCount: nextItemCount,
            subtotal: nextSubtotal,
            shipping_fee: nextShippingFee,
            shippingFee: nextShippingFee,
            estimated_total: nextTotal,
            estimatedTotal: nextTotal,
            final_price: nextTotal,
            finalPrice: nextTotal,
            cancellation_reason: nextCancellationReason,
            last_cancellation: {
                item_key: String(itemKey),
                quantity: quantityToCancel,
                reason,
                cancelled_at: new Date().toISOString(),
            },
        };

        const updatePayload = {
            data: nextData,
            shipping_fee: nextShippingFee,
            status: nextStatus,
            status_timestamps: summary.allCancelled
                ? buildStatusTimestamps(currentRequest?.status_timestamps, 'cancelled', reason)
                : currentRequest?.status_timestamps,
            cancellation_reason: summary.allCancelled
                ? (reason || currentRequest?.cancellation_reason || null)
                : currentRequest?.cancellation_reason || null,
        };

        if (Object.prototype.hasOwnProperty.call(currentRequest || {}, 'final_price')) {
            updatePayload.final_price = nextTotal;
        }

        const { error: updateRequestError } = await supabase
            .from('requests')
            .update(updatePayload)
            .eq('id', requestId);

        if (updateRequestError) {
            throw updateRequestError;
        }

        if (!order.isRequest && order.id) {
            const { data: linkedOrder, error: linkedOrderFetchError } = await supabase
                .from('orders')
                .select('status_timestamps, cancellation_reason, shipping_fee')
                .eq('id', order.id)
                .single();

            if (!linkedOrderFetchError && linkedOrder) {
                await supabase
                    .from('orders')
                    .update({
                        request_data: nextData,
                        subtotal: nextSubtotal,
                        shipping_fee: nextShippingFee,
                        total: nextTotal,
                        status: nextStatus,
                        cancellation_reason: summary.allCancelled
                            ? (reason || linkedOrder.cancellation_reason || null)
                            : linkedOrder.cancellation_reason || null,
                        status_timestamps: summary.allCancelled
                            ? buildStatusTimestamps(linkedOrder.status_timestamps, 'cancelled', reason)
                            : linkedOrder.status_timestamps,
                    })
                    .eq('id', order.id);
            }
        }
    };

    const handleConfirmCancel = async () => {
        if (!orderToCancel) return;

        const trimmedCancelReason = cancelReason.trim();
        if (!trimmedCancelReason) {
            setCancelReasonError('Please tell us why you want to cancel this item.');
            return;
        }

        const selectedItem = getCancellableItems(orderToCancel).find(
            (item) => item.cancellationKey === String(cancelTargetItemKey),
        );

        if (!selectedItem) {
            setCancelReasonError('Please select the item you want to cancel.');
            return;
        }

        const quantityToCancel = Math.min(
            selectedItem.remainingQuantity,
            Math.max(1, Number.parseInt(String(cancelQuantity || 1), 10) || 1),
        );

        try {
            if (shouldRouteCancellationToRefund(orderToCancel)) {
                const refundResult = await createCancellationRefundReview({
                    order: orderToCancel,
                    selectedItem,
                    quantityToCancel,
                    reason: trimmedCancelReason,
                });

                closeCancelModal();
                setInfoModal({
                    show: true,
                    title: refundResult.reused ? 'Refund Review Already Pending' : 'Cancellation Request Submitted',
                    message: refundResult.reused
                        ? 'This paid order already has a refund review in progress. Please wait for the admin decision before cancelling again.'
                        : 'Because payment was already submitted or received, we sent your cancellation through refund review first. We will finalize the cancellation after that review is resolved.',
                    linkTo: '/my-orders',
                    linkText: 'View My Orders',
                });
                await loadOrders(currentUserId);
                return;
            }

            if (orderToCancel.type) {
                await updateRequestCancellation(orderToCancel, cancelTargetItemKey, quantityToCancel, trimmedCancelReason);
            } else {
                await updateRegularOrderCancellation(orderToCancel, cancelTargetItemKey, quantityToCancel, trimmedCancelReason);
            }

            // Create cancellation notification
            const orderTypeLabel = orderToCancel.isFromBooking ? 'Custom Order' :
                orderToCancel.type
                    ? (orderToCancel.type === 'booking' ? 'Custom Order'
                        : orderToCancel.type === 'special_order' ? 'Special Order'
                : orderToCancel.type === 'customized' ? 'Customizer Studio'
                                : 'Request')
                    : 'Order';
            const orderId = orderToCancel.order_number || orderToCancel.request_number || orderToCancel.id
                ? `#${orderToCancel.order_number || orderToCancel.request_number || orderToCancel.id}`
                : '';

            const { data: { session } } = await supabase.auth.getSession();

            try {
                await insertUserNotification({
                    userId: session?.user?.id,
                    type: 'cancellation',
                    title: `${orderTypeLabel} Updated`,
                    message: `${quantityToCancel} item${quantityToCancel > 1 ? 's were' : ' was'} cancelled from your ${orderTypeLabel.toLowerCase()} ${orderId}.`,
                    icon: 'fa-times-circle',
                    link: '/my-orders',
                });
            } catch (notificationError) {
                console.warn('Cancellation completed but notification could not be created:', notificationError);
            }

            // Reload orders from Supabase
            await loadOrders(session?.user?.id);
            closeCancelModal();
        } catch (error) {
            console.error('Error cancelling order:', error);
            setInfoModal({ show: true, title: 'Error', message: error.message || 'Failed to cancel order. Please try again.' });
        }
    };

    const getOrderTypeLabel = (type) => {
        const labels = {
            booking: 'Custom Order',
            special_order: 'Special Order',
    customized: 'Customizer Studio',
            regular: 'Regular Order'
        };
        return labels[type] || 'Order';
    };

    const formatMessageTime = (timestamp) => {
        if (!timestamp) return '';
        try {
            const date = new Date(timestamp);
            const now = new Date();

            const isToday = now.toDateString() === date.toDateString();
            if (isToday) {
                return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            }

            // not today, calculate days ago
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const startOfMessageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            const diffTime = startOfToday.getTime() - startOfMessageDate.getTime();
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                return '1 day ago';
            }

            if (diffDays > 1) {
                return `${diffDays} days ago`;
            }

            // Fallback for dates that are somehow in the future or same day but `isToday` is false (edge case)
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        } catch (e) {
            return timestamp;
        }
    };

    const groupMessagesByDate = (messages) => {
        const grouped = [];
        let currentDate = null;

        messages.forEach((msg, index) => {
            const msgDate = new Date(msg.timestamp).toDateString();
            const prevMsgDate = index > 0 ? new Date(messages[index - 1].timestamp).toDateString() : null;

            if (msgDate !== prevMsgDate) {
                const date = new Date(msg.timestamp);
                const today = new Date();
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);

                let dateLabel;
                if (date.toDateString() === today.toDateString()) {
                    dateLabel = 'Today';
                } else if (date.toDateString() === yesterday.toDateString()) {
                    dateLabel = 'Yesterday';
                } else {
                    dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
                }

                grouped.push({ type: 'date', label: dateLabel });
                currentDate = msgDate;
            }

            grouped.push({ type: 'message', ...msg });
        });

        return grouped;
    };

    const loadChatMessages = (orderId) => {
        if (!orderId) {
            setChatMessages([]);
            return;
        }

        const allMessages = JSON.parse(localStorage.getItem('messages') || '[]');
        const orderMessages = allMessages
            .filter(msg => msg.orderId && msg.orderId.toString() === orderId.toString())
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        setChatMessages(orderMessages);

        // Mark admin messages as read by user
        let hasUnread = false;
        const updatedMessages = allMessages.map(msg => {
            if (msg.orderId && msg.orderId.toString() === orderId.toString() && msg.sender === 'admin' && !msg.readByUser) {
                hasUnread = true;
                return { ...msg, readByUser: true };
            }
            return msg;
        });

        if (hasUnread) {
            localStorage.setItem('messages', JSON.stringify(updatedMessages));
        }

        // Scroll to bottom
        setTimeout(() => {
            chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    const handleSendChatMessage = (e) => {
        e.preventDefault();
        if (!newChatMessage.trim() || !selectedOrderForChat) return;

        const orderId = selectedOrderForChat.id;
        if (!orderId) {
            console.error('Order ID is missing');
            return;
        }

        const message = {
            id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            orderId: orderId,
            sender: 'user',
            senderName: 'You',
            message: newChatMessage.trim(),
            timestamp: new Date().toISOString(),
            readByAdmin: false
        };

        const allMessages = JSON.parse(localStorage.getItem('messages') || '[]');
        const updatedMessages = [...allMessages, message];
        localStorage.setItem('messages', JSON.stringify(updatedMessages));

        // Dispatch custom event to notify other components
        window.dispatchEvent(new Event('messageUpdated'));

        // Create notification for admin
        const orderType = selectedOrderForChat.type
            ? (selectedOrderForChat.type === 'booking' ? 'Custom Order'
                : selectedOrderForChat.type === 'special_order' ? 'Special Order'
                : selectedOrderForChat.type === 'customized' ? 'Customizer Studio'
                        : 'Request')
            : 'Order';
        insertStaffNotifications({
            type: 'message',
            title: 'New Message from Customer',
            message: `You have a new message about ${orderType.toLowerCase()} ${orderId}.`,
            icon: 'fa-comments',
            link: '/admin/dashboard',
        }).catch((notificationError) => {
            console.error('Error notifying staff about a new customer message:', notificationError);
        });

        setNewChatMessage('');
        // Reload messages immediately and force update
        loadChatMessages(orderId);
        loadOrderMessages(orders);

        // Also reload after a short delay to ensure sync
        setTimeout(() => {
            loadChatMessages(orderId);
            loadOrderMessages(orders);
        }, 200);
    };

    const handleReceiptUpload = (e, paymentRequestId) => {
        const file = e.target.files[0];
        if (file) {
            setReceiptFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setReceiptPreview(reader.result);
                handleSubmitReceipt(paymentRequestId, reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmitReceipt = (paymentRequestId, receiptBase64) => {
        const allMessages = JSON.parse(localStorage.getItem('messages') || '[]');
        const updatedMessages = allMessages.map(msg =>
            msg.id === paymentRequestId
                ? { ...msg, receipt: receiptBase64, status: 'pending', receiptUploadedAt: new Date().toISOString() }
                : msg
        );
        localStorage.setItem('messages', JSON.stringify(updatedMessages));

        // Dispatch custom event
        window.dispatchEvent(new Event('messageUpdated'));

        // Create notification for admin
        insertStaffNotifications({
            type: 'payment',
            title: 'Receipt Uploaded',
            message: 'A customer has uploaded a payment receipt. Please review and confirm.',
            icon: 'fa-receipt',
            link: '/admin/dashboard',
        }).catch((notificationError) => {
            console.error('Error notifying staff about an uploaded receipt:', notificationError);
        });

        setReceiptFile(null);
        setReceiptPreview(null);
        setUploadingReceiptFor(null);
        loadChatMessages(selectedOrderForChat.id);
    };

    useEffect(() => {
        if (showChatModal && selectedOrderForChat) {
            loadChatMessages(selectedOrderForChat.id);

            // Listen for storage changes (when messages are added from another tab/window)
            const handleStorageChange = (e) => {
                if (e.key === 'messages' && selectedOrderForChat && selectedOrderForChat.id) {
                    loadChatMessages(selectedOrderForChat.id);
                }
            };

            window.addEventListener('storage', handleStorageChange);

            // Also listen for custom events (same tab updates)
            const handleMessageUpdate = () => {
                if (selectedOrderForChat && selectedOrderForChat.id) {
                    loadChatMessages(selectedOrderForChat.id);
                }
            };

            window.addEventListener('messageUpdated', handleMessageUpdate);

            // Auto-refresh messages every 1 second for real-time feel
            const interval = setInterval(() => {
                if (selectedOrderForChat && selectedOrderForChat.id) {
                    loadChatMessages(selectedOrderForChat.id);
                }
            }, 1000);

            return () => {
                clearInterval(interval);
                window.removeEventListener('storage', handleStorageChange);
                window.removeEventListener('messageUpdated', handleMessageUpdate);
            };
        }
    }, [showChatModal, selectedOrderForChat]);

    const cancellableItems = getCancellableItems(orderToCancel);
    const selectedCancelItem = cancellableItems.find((item) => item.cancellationKey === String(cancelTargetItemKey))
        || cancellableItems[0]
        || null;

    return (
        <div className="profile-container">
            <div className="container py-5">
                <div className="d-flex justify-content-between align-items-center mb-4">
                    <div>
                        <h2 className="fw-bold mb-0">My Orders</h2>
                        {totalUnreadMessages > 0 && (
                            <small className="text-muted">
                                <i className="fas fa-comments me-1" style={{ color: 'var(--shop-pink)' }}></i>
                                {totalUnreadMessages} unread message{totalUnreadMessages !== 1 ? 's' : ''}
                            </small>
                        )}
                    </div>
                    <Link to="/profile" className="btn btn-outline-secondary">
                        <i className="fas fa-user me-2"></i>Back to Profile
                    </Link>
                </div>

                <div className="order-tabs" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {orderTabs.map(tab => {
                        const orderCount = tab.id !== 'all'
                            ? orders.filter(o => o.status === tab.id).length
                            : orders.length;

                        return (
                            <button
                                key={tab.id}
                                className={`order-tab ${activeOrderTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveOrderTab(tab.id)}
                                style={{ flexShrink: 0 }}
                            >
                                {tab.label}
                                {tab.id !== 'all' && orderCount > 0 && (
                                    <span className="badge">{orderCount}</span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {filteredOrders.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">
                            <i className="fas fa-box-open"></i>
                        </div>
                        <h3>No orders yet</h3>
                        <p>Start shopping to see your orders here!</p>
                        <Link to="/" className="btn-shop-now">Shop Now</Link>
                    </div>
                ) : (
                    <div className="orders-list">
                        {filteredOrders.map((order, index) => (
                            <div key={order.id || `order-${index}`} className="order-card">
                                <div className="order-card-header">
                                    <div className="d-flex align-items-center gap-3">
                                        <div className="order-id">
                                            {order.isFromRequest && order.order_number && `Order #${order.order_number}`}
                                            {order.isFromRequest && !order.order_number && (order.type === 'inquiry' ? 'Inquiry' : order.type === 'booking' ? 'Custom Order' : 'Request')}
                                            {order.type === 'booking' && !order.isFromRequest && 'Custom Order'}
                                            {order.type === 'special_order' && 'Special Order'}
                                  {order.type === 'customized' && 'Customizer Studio'}
                                            {order.type === 'inquiry' && 'Inquiry'}
                                            {!order.type && !order.isFromRequest && `Order #${order.order_number || order.id || index + 1}`}
                                        </div>
                                        {order.type && (
                                            <span className="badge bg-info text-white">
                                                {getOrderTypeLabel(order.type)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="d-flex align-items-center gap-3 flex-wrap">
                                        <small className="text-muted">
                                            {new Date(order.date || order.requestDate).toLocaleDateString('en-PH', {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </small>
                                        <span className={`order-status ${getStatusBadgeClass(order.status)}`}>
                                            {getStatusLabel(order.status)}
                                        </span>
                                        {order.paymentStatus && (
                                            <span className={`badge ${order.paymentStatus === 'paid'
                                                ? 'bg-success'
                                                : order.paymentStatus === 'waiting_for_confirmation'
                                                    ? 'bg-info'
                                                    : 'bg-warning'
                                                }`}>
                                                <i className={`fas ${order.paymentStatus === 'paid'
                                                    ? 'fa-check-circle'
                                                    : order.paymentStatus === 'waiting_for_confirmation'
                                                        ? 'fa-hourglass-half'
                                                        : 'fa-clock'
                                                    } me-1`}></i>
                                                {order.paymentStatus === 'paid'
                                                    ? 'Paid'
                                                    : order.paymentStatus === 'waiting_for_confirmation'
                                                        ? 'Waiting for Confirmation'
                                                        : 'To Pay'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="order-card-body">
                                    {/* Display order items or request details */}
                                    {order.items && order.items.length > 0 ? (
                                        <>
                                            {order.items.slice(0, 3).map((item, idx) => (
                                                <div key={idx} className="order-item">
                                                    {order.type === 'customized' ? (
                                                        <div className="me-3 flex-shrink-0">
                                                            <CustomizedBouquetPreview item={item} size={70} zoomable />
                                                        </div>
                                                    ) : (
                                                        <img
                                                            src={item.image_url || item.image || item.photo}
                                                            alt={item.name || 'Item'}
                                                            className="order-item-img"
                                                            onError={(e) => e.target.src = 'https://via.placeholder.com/70'}
                                                        />
                                                    )}
                                                    <div>
                                                        <div className="order-item-name">{item.name || 'Custom Item'}</div>
                                                        {item.variant && (
                                                            <div className="order-item-variant">{item.variant}</div>
                                                        )}
                                                        <div className="order-item-qty">
                                                            {item.remainingQuantity > 0 ? `x${item.remainingQuantity}` : 'Cancelled'}
                                                        </div>
                                                        {item.cancelledQuantity > 0 && (
                                                            <div className="order-item-variant text-danger">
                                                                Cancelled: x{item.cancelledQuantity}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="order-item-price">
                                                        ₱{((item.price || order.price || 0) * (item.qty || 1)).toLocaleString()}
                                                    </div>
                                                </div>
                                            ))}
                                            {order.items.length > 3 && (
                                                <div className="text-muted small mt-2">
                                                    + {order.items.length - 3} more item(s)
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        // Display request details for bookings, special orders, and customized
                                        <div className="order-item">
                                            {(order.photo || order.photo_url) && (
                                                <img
                                                    src={order.photo || order.photo_url}
                                                    alt="Request preview"
                                                    className="order-item-img"
                                                    style={{ objectFit: 'cover' }}
                                                    onError={(e) => e.target.src = 'https://via.placeholder.com/70'}
                                                />
                                            )}
                                            <div className="flex-grow-1">
                                                <div className="order-item-name">
                                                    {order.type === 'booking' && (order.data?.eventType || order.eventType || order.data?.otherEventType) && (
                                                        <>{(order.data?.eventType || order.eventType || order.data?.otherEventType)} Event</>
                                                    )}
                                                    {order.type === 'booking' && !order.data?.eventType && !order.eventType && !order.data?.otherEventType && (
                                                        <>Custom Order</>
                                                    )}
                                                    {order.type === 'special_order' && (
                                                        <>Special Order Request</>
                                                    )}
                                                    {order.type === 'customized' && (
                                                        <>Customizer Studio Request</>
                                                    )}
                                                    {order.type === 'inquiry' && (
                                                        <>Inquiry: {order.data?.subject || order.data?.message || 'General Inquiry'}</>
                                                    )}
                                                    {!order.type && !order.isFromRequest && 'Order Item'}
                                                </div>
                                                {order.type === 'booking' && (order.data?.venue || order.venue) && (
                                                    <div className="order-item-variant">
                                                        <i className="fas fa-map-marker-alt me-1"></i>
                                                        {order.data?.venue || order.venue}
                                                    </div>
                                                )}
                                                {order.type === 'booking' && (order.data?.eventDate || order.eventDate) && (
                                                    <div className="order-item-variant">
                                                        <i className="fas fa-calendar me-1"></i>
                                                        {new Date(order.data?.eventDate || order.eventDate).toLocaleDateString()}
                                                    </div>
                                                )}
                                                {order.type === 'booking' && (order.data?.eventTime || order.eventTime) && (
                                                    <div className="order-item-variant">
                                                        <i className="fas fa-clock me-1"></i>
                                                        {(() => {
                                                            try {
                                                                const t = order.data?.eventTime || order.eventTime;
                                                                const [hStr, mStr] = t.split(':');
                                                                let h = parseInt(hStr, 10);
                                                                const ampm = h >= 12 ? 'PM' : 'AM';
                                                                h = h % 12 || 12;
                                                                return `${h}:${mStr} ${ampm}`;
                                                            } catch (e) { return order.data?.eventTime || order.eventTime; }
                                                        })()}
                                                    </div>
                                                )}
                                                {order.type === 'booking' && (order.data?.details || order.notes) && (
                                                    <div className="order-item-variant" style={{ fontSize: '0.85rem', color: '#666' }}>
                                                        <i className="fas fa-info-circle me-1"></i>
                                                        {(order.data?.details || order.notes || '').length > 80
                                                            ? `${(order.data?.details || order.notes || '').substring(0, 80)}...`
                                                            : (order.data?.details || order.notes || '')}
                                                    </div>
                                                )}
                                                {order.type === 'inquiry' && order.data?.message && (
                                                    <div className="order-item-variant">
                                                        <i className="fas fa-comment me-1"></i>
                                                        {order.data.message.length > 100 ? `${order.data.message.substring(0, 100)}...` : order.data.message}
                                                    </div>
                                                )}
                                                {order.type === 'special_order' && (order.recipientName || order.data?.recipientName) && (
                                                    <div className="order-item-variant">
                                                        <i className="fas fa-user me-1"></i>
                                                        For: {order.recipientName || order.data?.recipientName}
                                                    </div>
                                                )}
                                                {order.type === 'special_order' && (order.occasion || order.data?.occasion) && (
                                                    <div className="order-item-variant">
                                                        <i className="fas fa-calendar-alt me-1"></i>
                                                        Occasion: {order.occasion || order.data?.occasion}
                                                    </div>
                                                )}
                                                {order.type === 'customized' && (order.flower || order.data?.flower) && (
                                                    <div className="order-item-variant">
                                                        <i className="fas fa-seedling me-1"></i>
                                                        {(order.flower || order.data?.flower)?.name || 'Custom Bouquet'} - {order.bundleSize || order.data?.bundleSize || 'N/A'} stems
                                                    </div>
                                                )}
                                            </div>
                                            <div className="order-item-price">
                                                {order.total > 0 ? `₱${order.total.toLocaleString()}` : <span className="text-muted small">Price to be determined</span>}
                                            </div>
                                        </div>
                                    )}

                                    {/* Show additional booking information */}
                                    {order.type === 'booking' && order.data?.fullName && (
                                        <div className="mt-3 pt-3 border-top">
                                            <div className="small text-muted">
                                                <i className="fas fa-user me-2"></i>
                                                <strong>Contact:</strong> {order.data.fullName}
                                            </div>
                                        </div>
                                    )}

                                    {/* Payment Method Information */}
                                    {order.payment && (
                                        <div className="mt-3 pt-3 border-top">
                                            <div className="d-flex align-items-start gap-2">
                                                <i className={`fas ${order.payment.icon || 'fa-credit-card'} mt-1`} style={{ color: 'var(--shop-pink)', fontSize: '0.9rem' }}></i>
                                                <div className="flex-grow-1">
                                                    <div className="small fw-bold mb-1">Payment Method</div>
                                                    <div className="small text-muted">
                                                        {order.payment.name || 'Cash on Delivery'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Delivery/Pickup Information */}
                                    {(order.deliveryMethod || order.address) && (
                                        <div className="mt-3 pt-3 border-top">
                                            {order.deliveryMethod === 'pickup' ? (
                                                <div className="d-flex align-items-start gap-2">
                                                    <i className="fas fa-store mt-1" style={{ color: 'var(--shop-pink)', fontSize: '0.9rem' }}></i>
                                                    <div className="flex-grow-1">
                                                        <div className="small fw-bold mb-1">Pickup Order</div>
                                                        {order.pickupTime && (
                                                            <div className="small text-muted mb-1">
                                                                <i className="fas fa-clock me-1"></i>
                                                                Pickup Time: {order.pickupTime}
                                                            </div>
                                                        )}
                                                        <div className="small text-muted">
                                                            <i className="fas fa-map-marker-alt me-1"></i>
                                                            Jocerry's Flower Shop, 63 San Jose Road, Zamboanga City
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                order.address && (
                                                    <div className="d-flex align-items-start gap-2">
                                                        <i className="fas fa-truck mt-1" style={{ color: 'var(--shop-pink)', fontSize: '0.9rem' }}></i>
                                                        <div className="flex-grow-1">
                                                            <div className="small fw-bold mb-1">Delivery Address</div>
                                                            <div className="small text-muted">
                                                                {typeof order.address === 'string'
                                                                    ? order.address
                                                                    : `${order.address.street}, ${order.address.city}, ${order.address.province} ${order.address.zip}`
                                                                }
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    )}

                                    {/* Message Preview */}
                                    {orderMessages[order.id] && orderMessages[order.id].lastMessage && (
                                        <div className="mt-3 pt-3 border-top">
                                            <div className="d-flex align-items-start gap-2">
                                                <i className="fas fa-comments mt-1" style={{ color: 'var(--shop-pink)', fontSize: '0.9rem' }}></i>
                                                <div className="flex-grow-1">
                                                    <div className="small fw-bold mb-1 d-flex align-items-center gap-2">
                                                        Messages
                                                        {orderMessages[order.id].unreadCount > 0 && (
                                                            <span className="badge" style={{
                                                                background: 'var(--shop-pink)',
                                                                color: 'white',
                                                                fontSize: '0.7rem',
                                                                padding: '2px 6px'
                                                            }}>
                                                                {orderMessages[order.id].unreadCount} new
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="small text-muted" style={{
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                        fontStyle: orderMessages[order.id].unreadCount > 0 ? 'normal' : 'normal'
                                                    }}>
                                                        {orderMessages[order.id].lastMessage.sender === 'admin' ? 'Admin: ' : 'You: '}
                                                        {orderMessages[order.id].lastMessage.message}
                                                    </div>
                                                    <div className="small text-muted" style={{ fontSize: '0.7rem', marginTop: '2px' }}>
                                                        {new Date(orderMessages[order.id].lastMessage.timestamp).toLocaleString('en-US', {
                                                            month: 'short',
                                                            day: 'numeric',
                                                            hour: 'numeric',
                                                            minute: '2-digit'
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="order-card-footer">
                                    <div className="order-total">
                                        {order.type ? 'Request Total' : 'Order Total'}: <span>₱{(order.total || order.price || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="order-actions">
                                        {order.status === 'completed' && order.items && (
                                            <button
                                                className="btn-order-action secondary"
                                                onClick={() => {
                                                    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
                                                    order.items.forEach(item => {
                                                        const existingItem = cart.find(i => i.name === item.name);
                                                        if (existingItem) {
                                                            existingItem.qty += item.qty || 1;
                                                        } else {
                                                            cart.push({ ...item });
                                                        }
                                                    });
                                                    localStorage.setItem('cart', JSON.stringify(cart));
                                                    navigate('/cart');
                                                }}
                                            >
                                                Buy Again
                                            </button>
                                        )}
                                        {order.type === 'booking' && order.status === 'quoted' ? (
                                            <div className="d-flex gap-2 flex-wrap">
                                                <button
                                                    className="btn-order-action primary"
                                                    onClick={() => handleTrackRequest(order)}
                                                >
                                                    Track Request
                                                </button>
                                                <button
                                                    className="btn-order-action"
                                                    style={{ backgroundColor: 'var(--shop-pink)', color: 'white', border: 'none' }}
                                                    onClick={() => handleAcceptQuote(order)}
                                                >
                                                    Accept
                                                </button>
                                                <button
                                                    className="btn-order-action"
                                                    style={{ backgroundColor: 'transparent', color: 'var(--shop-pink)', border: '1px solid var(--shop-pink)' }}
                                                    onClick={() => handleRequestAdjustment(order)}
                                                >
                                                    Adjust
                                                </button>
                                                {getCancellableItems(order).length > 0 && (
                                                    <button
                                                        className="btn-order-action"
                                                        style={{ backgroundColor: '#dc3545', color: 'white', border: '1px solid #dc3545' }}
                                                        onClick={() => handleCancelClick(order)}
                                                    >
                                                        Cancel
                                                    </button>
                                                )}
                                            </div>
                                        ) : order.status === 'pending' && order.type ? (
                                            <button
                                                className="btn-order-action primary"
                                                onClick={() => handleTrackStatus(order)}
                                            >
                                                Track Status
                                            </button>
                                        ) : order.status !== 'cancelled' && order.status !== 'completed' && !(order.status === 'pending' && order.type) ? (
                                            <button
                                                className="btn-order-action primary"
                                                onClick={() => (order.type ? handleTrackRequest(order) : handleTrackOrder(order.order_number || order.id))}
                                            >
                                                {order.type ? 'Track Request' : 'Track Order'}
                                            </button>
                                        ) : null}
                                        <button
                                            className="btn-order-action primary"
                                            onClick={() => {
                                                setSelectedOrderForChat(order);
                                                setShowChatModal(true);
                                                loadChatMessages(order.id);
                                            }}
                                            style={{
                                                background: 'var(--shop-pink)',
                                                color: 'white',
                                                border: 'none',
                                                position: 'relative'
                                            }}
                                        >
                                            <i className="fas fa-comments me-2"></i>Message
                                            {orderMessages[order.id] && orderMessages[order.id].unreadCount > 0 && (
                                                <span style={{
                                                    position: 'absolute',
                                                    top: '-5px',
                                                    right: '-5px',
                                                    background: '#dc3545',
                                                    color: 'white',
                                                    borderRadius: '50%',
                                                    width: '20px',
                                                    height: '20px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 'bold',
                                                    border: '2px solid white'
                                                }}>
                                                    {orderMessages[order.id].unreadCount > 9 ? '9+' : orderMessages[order.id].unreadCount}
                                                </span>
                                            )}
                                        </button>
                                        {order.status !== 'cancelled' && order.status !== 'completed' && getCancellableItems(order).length > 0 && (
                                            <button
                                                className="btn-order-action danger"
                                                onClick={() => handleCancelClick(order)}
                                                style={{
                                                    background: '#dc3545',
                                                    color: 'white',
                                                    border: 'none'
                                                }}
                                            >
                                                Cancel
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Cancellation Confirmation Modal */}
            {showCancelModal && (
                <div
                    className="modal-overlay"
                    onClick={closeCancelModal}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 1000
                    }}
                >
                    <div
                        className="modal-content-custom"
                        onClick={e => e.stopPropagation()}
                        style={{
                            backgroundColor: 'white',
                            padding: '2rem',
                            borderRadius: '1rem',
                            textAlign: 'center',
                            maxWidth: '400px',
                            width: '90%',
                            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                        }}
                    >
                        <div style={{ fontSize: '3rem', color: '#dc3545', marginBottom: '1rem' }}>
                            <i className="fas fa-exclamation-triangle"></i>
                        </div>
                        <h3 style={{ marginBottom: '1rem', color: '#333' }}>Cancel item from this {orderToCancel?.type ? 'request' : 'order'}?</h3>
                        <p style={{ marginBottom: '1.5rem', color: '#4b5563' }}>
                            Choose the item and quantity you want to cancel. We will keep the rest of your order active.
                        </p>
                        <div style={{ marginBottom: '1rem', textAlign: 'left' }}>
                            <label htmlFor="cancelItemMyOrders" style={{ display: 'block', fontWeight: '600', color: '#333', marginBottom: '0.5rem' }}>
                                Item to cancel
                            </label>
                            <select
                                id="cancelItemMyOrders"
                                value={selectedCancelItem?.cancellationKey || ''}
                                onChange={(e) => {
                                    const nextItem = cancellableItems.find((item) => item.cancellationKey === e.target.value);
                                    setCancelTargetItemKey(e.target.value);
                                    setCancelQuantity(1);
                                    if (!nextItem && cancelReasonError) setCancelReasonError('');
                                }}
                                style={{
                                    width: '100%',
                                    borderRadius: '0.75rem',
                                    border: '1px solid #d1d5db',
                                    padding: '0.75rem 0.9rem',
                                    color: '#111827',
                                    backgroundColor: 'white',
                                }}
                            >
                                {cancellableItems.map((item) => (
                                    <option key={item.cancellationKey} value={item.cancellationKey}>
                                        {getCancellationItemDisplayLabel(item)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {selectedCancelItem && (
                            <div style={{ marginBottom: '1rem', textAlign: 'left' }}>
                                <label htmlFor="cancelQuantityMyOrders" style={{ display: 'block', fontWeight: '600', color: '#333', marginBottom: '0.5rem' }}>
                                    Quantity to cancel
                                </label>
                                <select
                                    id="cancelQuantityMyOrders"
                                    value={String(cancelQuantity)}
                                    onChange={(e) => setCancelQuantity(Number.parseInt(e.target.value, 10) || 1)}
                                    style={{
                                        width: '100%',
                                        borderRadius: '0.75rem',
                                        border: '1px solid #d1d5db',
                                        padding: '0.75rem 0.9rem',
                                        color: '#111827',
                                        backgroundColor: 'white',
                                    }}
                                >
                                    {Array.from({ length: selectedCancelItem.remainingQuantity }, (_, index) => index + 1).map((quantity) => (
                                        <option key={quantity} value={quantity}>
                                            {quantity}
                                        </option>
                                    ))}
                                </select>
                                <div style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '0.9rem' }}>
                                    Remaining after this cancellation: {Math.max(0, selectedCancelItem.remainingQuantity - cancelQuantity)} of {selectedCancelItem.originalQuantity}
                                </div>
                            </div>
                        )}
                        <div style={{ marginBottom: '1rem', textAlign: 'left' }}>
                            <label htmlFor="cancelReasonMyOrders" style={{ display: 'block', fontWeight: '600', color: '#333', marginBottom: '0.5rem' }}>
                                Reason for cancellation
                            </label>
                            <textarea
                                id="cancelReasonMyOrders"
                                value={cancelReason}
                                onChange={(e) => {
                                    setCancelReason(e.target.value);
                                    if (cancelReasonError) setCancelReasonError('');
                                }}
                                placeholder="Tell us why you want to cancel."
                                rows={4}
                                style={{
                                    width: '100%',
                                    borderRadius: '0.75rem',
                                    border: `1px solid ${cancelReasonError ? '#dc3545' : '#d1d5db'}`,
                                    padding: '0.75rem 0.9rem',
                                    resize: 'vertical',
                                    outline: 'none',
                                    color: '#111827'
                                }}
                            />
                            {cancelReasonError && (
                                <div style={{ marginTop: '0.5rem', color: '#dc3545', fontSize: '0.9rem' }}>
                                    {cancelReasonError}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                            <button
                                onClick={closeCancelModal}
                                style={{
                                    backgroundColor: 'transparent',
                                    color: '#4b5563',
                                    border: '1px solid #d1d5db',
                                    padding: '0.5rem 1.5rem',
                                    borderRadius: '9999px',
                                    cursor: 'pointer',
                                    fontWeight: '600'
                                }}
                            >
                                Keep {orderToCancel?.type ? 'Request' : 'Order'}
                            </button>
                            <button
                                onClick={handleConfirmCancel}
                                style={{
                                    backgroundColor: '#dc3545',
                                    color: 'white',
                                    border: 'none',
                                    padding: '0.5rem 1.5rem',
                                    borderRadius: '9999px',
                                    cursor: 'pointer',
                                    fontWeight: '600'
                                }}
                            >
                                Cancel Selected Quantity
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Waiting for Approval Modal */}
            {showWaitingModal && (
                <div
                    className="modal-overlay"
                    onClick={() => setShowWaitingModal(false)}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 1000
                    }}
                >
                    <div
                        className="modal-content-custom"
                        onClick={e => e.stopPropagation()}
                        style={{
                            backgroundColor: 'white',
                            padding: '2rem',
                            borderRadius: '1rem',
                            textAlign: 'center',
                            maxWidth: '400px',
                            width: '90%',
                            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                        }}
                    >
                        <div style={{ fontSize: '3rem', color: '#ff9800', marginBottom: '1rem' }}>
                            <i className="fas fa-hourglass-half"></i>
                        </div>
                        <h3 style={{ marginBottom: '1rem', color: '#333' }}>Waiting for Approval</h3>
                        <p style={{ marginBottom: '1.5rem', color: '#4b5563' }}>
                            Your request is currently pending approval from our team. We will review it and get back to you soon.
                        </p>
                        <p style={{ marginBottom: '1.5rem', color: '#4b5563', fontSize: '0.9rem' }}>
                            You will be notified once your request has been processed.
                        </p>
                        <button
                            onClick={() => setShowWaitingModal(false)}
                            style={{
                                backgroundColor: 'var(--shop-pink)',
                                color: 'white',
                                border: 'none',
                                padding: '0.5rem 1.5rem',
                                borderRadius: '9999px',
                                cursor: 'pointer',
                                fontWeight: '600'
                            }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            {/* Chat Modal */}
            {showChatModal && selectedOrderForChat && (
                <div
                    className="modal-overlay"
                    onClick={() => {
                        setShowChatModal(false);
                        setSelectedOrderForChat(null);
                        setChatMessages([]);
                        setNewChatMessage('');
                        setReceiptFile(null);
                        setReceiptPreview(null);
                        setUploadingReceiptFor(null);
                        loadOrderMessages(orders); // Refresh message counts when closing
                    }}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 1000
                    }}
                >
                    <div
                        className="modal-content-custom"
                        onClick={e => e.stopPropagation()}
                        style={{
                            backgroundColor: 'white',
                            borderRadius: '1rem',
                            maxWidth: '600px',
                            width: '90%',
                            maxHeight: '80vh',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                        }}
                    >
                        <div style={{
                            padding: '1.5rem',
                            borderBottom: '1px solid #e3e6f0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div>
                                <h5 className="mb-0">Chat about your order</h5>
                                <small className="text-muted">
                                    {selectedOrderForChat.type === 'booking' && 'Custom Order'}
                                    {selectedOrderForChat.type === 'special_order' && 'Special Order'}
                  {selectedOrderForChat.type === 'customized' && 'Customizer Studio'}
                                    {!selectedOrderForChat.type && `Order #${selectedOrderForChat.id}`}
                                </small>
                            </div>
                            <button
                                onClick={() => {
                                    setShowChatModal(false);
                                    setSelectedOrderForChat(null);
                                    setChatMessages([]);
                                    setNewChatMessage('');
                                    setReceiptFile(null);
                                    setReceiptPreview(null);
                                    setUploadingReceiptFor(null);
                                    loadOrderMessages(orders); // Refresh message counts when closing
                                }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    fontSize: '1.5rem',
                                    cursor: 'pointer',
                                    color: '#6c757d'
                                }}
                            >
                                ×
                            </button>
                        </div>
                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: '20px',
                            background: '#f0f2f5',
                            minHeight: '300px',
                            maxHeight: '400px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                        }}>
                            {chatMessages.length === 0 ? (
                                <div className="chat-empty-state" style={{ height: '100%' }}>
                                    <i className="fas fa-comments"></i>
                                    <p>No messages yet. Start the conversation!</p>
                                </div>
                            ) : (
                                <>
                                    {groupMessagesByDate(chatMessages).map((item, index) => {
                                        if (item.type === 'date') {
                                            return (
                                                <div key={`date-${index}`} className="date-divider">
                                                    <span>{item.label}</span>
                                                </div>
                                            );
                                        }

                                        // Payment Request Message
                                        if (item.type === 'payment_request') {
                                            return (
                                                <div
                                                    key={item.id}
                                                    style={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'flex-start',
                                                        marginBottom: '8px',
                                                        animation: 'messageSlideIn 0.3s ease-out',
                                                        width: '100%'
                                                    }}
                                                >
                                                    <div style={{
                                                        width: '100%',
                                                        padding: '16px',
                                                        borderRadius: '12px',
                                                        background: 'linear-gradient(135deg, #f8f9fa, #e9ecef)',
                                                        border: '2px solid var(--shop-pink)',
                                                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                                                    }}>
                                                        <div className="d-flex align-items-center gap-2 mb-3">
                                                            <i className="fas fa-money-bill-wave" style={{ color: 'var(--shop-pink)', fontSize: '1.2rem' }}></i>
                                                            <strong style={{ fontSize: '1rem' }}>Payment Request</strong>
                                                        </div>

                                                        <div style={{
                                                            fontSize: '1.5rem',
                                                            fontWeight: 'bold',
                                                            color: 'var(--shop-pink)',
                                                            marginBottom: '16px'
                                                        }}>
                                                            ₱{item.amount.toLocaleString()}
                                                        </div>

                                                        {/* GCash QR Code */}
                                                        <div style={{
                                                            background: 'white',
                                                            padding: '16px',
                                                            borderRadius: '8px',
                                                            textAlign: 'center',
                                                            marginBottom: '16px',
                                                            border: '1px solid #ddd'
                                                        }}>
                                                            <h6 className="mb-3">
                                                                <i className="fas fa-qrcode me-2" style={{ color: 'var(--shop-pink)' }}></i>
                                                                Scan to Pay via GCash
                                                            </h6>
                                                            <div style={{
                                                                width: '200px',
                                                                height: '200px',
                                                                margin: '0 auto',
                                                                background: '#f8f9fa',
                                                                border: '2px dashed #ddd',
                                                                borderRadius: '8px',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                color: '#6c757d'
                                                            }}>
                                                                <i className="fas fa-qrcode" style={{ fontSize: '80px', opacity: 0.3, marginBottom: '10px' }}></i>
                                                                <small>GCash QR Code</small>
                                                            </div>
                                                            <div className="mt-3">
                                                                <small className="text-muted">
                                                                    <i className="fas fa-info-circle me-1"></i>
                                                                    Scan this QR code with your GCash app
                                                                </small>
                                                            </div>
                                                        </div>

                                                        {/* Receipt Upload */}
                                                        {item.status === 'pending' && !item.receipt && (
                                                            <div>
                                                                <label className="form-label fw-bold small">
                                                                    <i className="fas fa-receipt me-2" style={{ color: 'var(--shop-pink)' }}></i>
                                                                    Upload Payment Receipt
                                                                </label>
                                                                <input
                                                                    type="file"
                                                                    className="form-control form-control-sm"
                                                                    accept="image/*"
                                                                    onChange={(e) => handleReceiptUpload(e, item.id)}
                                                                />
                                                                <small className="text-muted d-block mt-2">
                                                                    <i className="fas fa-info-circle me-1"></i>
                                                                    Please upload a screenshot of your GCash payment confirmation
                                                                </small>
                                                            </div>
                                                        )}

                                                        {item.receipt && (
                                                            <div className="mt-3">
                                                                <div className="d-flex align-items-center gap-2 mb-2">
                                                                    <i className="fas fa-check-circle text-success"></i>
                                                                    <strong>Receipt Uploaded</strong>
                                                                </div>
                                                                <img
                                                                    src={item.receipt}
                                                                    alt="Receipt"
                                                                    style={{
                                                                        maxWidth: '100%',
                                                                        maxHeight: '200px',
                                                                        borderRadius: '8px',
                                                                        border: '1px solid #ddd'
                                                                    }}
                                                                />
                                                                {item.status === 'pending' && (
                                                                    <div className="mt-2">
                                                                        <small className="text-muted">
                                                                            <i className="fas fa-clock me-1"></i>
                                                                            Waiting for admin confirmation
                                                                        </small>
                                                                    </div>
                                                                )}
                                                                {item.status === 'confirmed' && (
                                                                    <div className="mt-2">
                                                                        <small className="text-success">
                                                                            <i className="fas fa-check-circle me-1"></i>
                                                                            Payment Confirmed
                                                                        </small>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        <div style={{
                                                            fontSize: '0.7rem',
                                                            opacity: 0.7,
                                                            marginTop: '12px',
                                                            textAlign: 'right'
                                                        }}>
                                                            {formatMessageTime(item.timestamp)}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        // Regular Message
                                        return (
                                            <div
                                                key={item.id}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: item.sender === 'user' ? 'flex-end' : 'flex-start',
                                                    marginBottom: '8px',
                                                    animation: 'messageSlideIn 0.3s ease-out'
                                                }}
                                            >
                                                <div style={{
                                                    maxWidth: '65%',
                                                    padding: '10px 14px',
                                                    borderRadius: '18px',
                                                    background: item.sender === 'user'
                                                        ? 'linear-gradient(135deg, var(--shop-pink), #d65d7a)'
                                                        : 'white',
                                                    color: item.sender === 'user' ? 'white' : '#1a1a1a',
                                                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                                                    borderBottomLeftRadius: item.sender === 'user' ? '18px' : '4px',
                                                    borderBottomRightRadius: item.sender === 'user' ? '4px' : '18px'
                                                }}>
                                                    <div style={{
                                                        margin: 0,
                                                        lineHeight: '1.4',
                                                        fontSize: '0.95rem',
                                                        marginBottom: '4px'
                                                    }}>
                                                        {item.message}
                                                    </div>
                                                    <div style={{
                                                        fontSize: '0.7rem',
                                                        opacity: 0.7,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}>
                                                        {formatMessageTime(item.timestamp)}
                                                        {item.sender === 'user' && (
                                                            <span>
                                                                {item.readByAdmin ? '✓✓' : '✓'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <div ref={chatMessagesEndRef} />
                                </>
                            )}
                        </div>
                        <div style={{
                            padding: '12px 20px',
                            borderTop: '1px solid #e3e6f0',
                            background: 'white'
                        }}>
                            <form onSubmit={handleSendChatMessage} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <input
                                    type="text"
                                    style={{
                                        flex: 1,
                                        border: '1px solid #e3e6f0',
                                        borderRadius: '24px',
                                        padding: '10px 18px',
                                        fontSize: '0.95rem',
                                        outline: 'none',
                                        transition: 'all 0.2s'
                                    }}
                                    placeholder="Type a message..."
                                    value={newChatMessage}
                                    onChange={(e) => setNewChatMessage(e.target.value)}
                                    onFocus={(e) => e.target.style.borderColor = 'var(--shop-pink)'}
                                    onBlur={(e) => e.target.style.borderColor = '#e3e6f0'}
                                />
                                <button
                                    type="submit"
                                    style={{
                                        width: '44px',
                                        height: '44px',
                                        borderRadius: '50%',
                                        background: 'linear-gradient(135deg, var(--shop-pink), #d65d7a)',
                                        border: 'none',
                                        color: 'white',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        flexShrink: 0
                                    }}
                                    disabled={!newChatMessage.trim()}
                                    onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                                    onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                                >
                                    <i className="fas fa-paper-plane"></i>
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            <CustomOrderQuotePaymentModal
                visible={Boolean(quotePaymentOrder)}
                order={quotePaymentOrder}
                userId={currentUserId}
                onClose={() => setQuotePaymentOrder(null)}
                onSuccess={handleQuotePaymentSuccess}
                onError={handleQuotePaymentError}
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
        </div>
    );
};

export default MyOrders;


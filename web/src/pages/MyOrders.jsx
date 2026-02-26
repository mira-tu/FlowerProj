import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import InfoModal from '../components/InfoModal';
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

const MyOrders = () => {
    const navigate = useNavigate();
    const [activeOrderTab, setActiveOrderTab] = useState('all');
    const [orders, setOrders] = useState([]);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [orderToCancel, setOrderToCancel] = useState(null);
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

    useEffect(() => {
        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                navigate('/login');
                return;
            }
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
                .order('created_at', { ascending: false });

            if (ordersError) {
                console.error('Error fetching orders:', ordersError);
                throw ordersError;
            }

            // Fetch requests from Supabase
            const { data: apiRequests, error: requestsError } = await supabase
                .from('requests')
                .select('*')
                .eq('user_id', currentUserId)
                .order('created_at', { ascending: false });

            if (requestsError) {
                console.error('Error fetching requests:', requestsError);
                throw requestsError;
            }

            console.log('--- Supabase Orders API Response (apiOrders) ---', apiOrders);
            console.log('--- Supabase Requests API Response (apiRequests) ---', apiRequests);

            console.log(`Loaded ${apiOrders.length} orders and ${apiRequests.length} requests for current user`);

            // Transform API orders to match the expected format
            const transformedOrders = (apiOrders || []).map(order => ({
                id: order.id,
                order_number: order.order_number,
                date: order.created_at,
                status: order.status, // pending, accepted, processing, etc.
                payment_status: order.payment_status,
                payment_method: order.payment_method,
                delivery_method: order.delivery_method,
                total: parseFloat(order.total || 0),
                subtotal: parseFloat(order.subtotal || 0),
                delivery_fee: parseFloat(order.delivery_fee || 0),
                notes: order.notes,
                items: order.order_items || [], // Use order.order_items for the items
                address_id: order.address_id,
                address: order.addresses, // Use order.addresses for the address
                request_id: order.request_id, // Link to booking request if exists
                isFromRequest: !!order.request_id, // Flag to identify orders from requests (booking, inquiry, etc.)
                // Include request data for all request types
                type: order.request_type || null,
                data: order.request_data || null,
                photo_url: order.request_photo_url || null,
                // Booking data
                eventType: order.event_type || (order.request_data?.eventType || order.request_data?.event_type),
                eventDate: order.event_date || order.request_data?.eventDate,
                venue: order.request_data?.venue,
                details: order.request_data?.details,
                fullName: order.request_data?.fullName,
                otherEventType: order.request_data?.otherEventType,
                // Special order data
                recipientName: order.request_data?.recipientName,
                occasion: order.request_data?.occasion,
                preferences: order.request_data?.preferences,
                // Customized data
                flower: order.request_data?.flower,
                bundleSize: order.bundleSize,
                wrapper: order.wrapper,
                ribbon: order.ribbon,
                // Inquiry data
                subject: order.request_data?.subject,
                message: order.request_data?.message,
                email: order.request_data?.email,
                phone: order.request_data?.phone,
                photo: order.request_photo_url
            }));
            console.log('--- Transformed Orders (Status & Items) ---', transformedOrders.map(o => ({ id: o.id, status: o.status, items: o.items })));

            // Transform API requests to match the expected format
            const transformedRequests = (apiRequests || []).map(request => {
                const requestData = typeof request.data === 'string' ? JSON.parse(request.data) : request.data;
                return {
                    id: `request-${request.id}`, // Prefix to avoid conflicts
                    request_id: request.id,
                    request_number: request.request_number,
                    date: request.created_at,
                    status: request.status === 'accepted' ? 'processing' : request.status, // Map accepted to processing for display
                    type: request.type, // booking, customized, special_order
                    payment_status: 'to_pay', // Assuming requests start with 'to_pay'
                    total: parseFloat(request.final_price || request.estimated_price || 0),
                    notes: request.notes,
                    data: requestData,
                    photo_url: request.photo_url,
                    isRequest: true,
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

    const handleTrackStatus = (order) => {
        // Show waiting for approval modal for pending requests
        if (order.status === 'pending' && order.type) {
            setShowWaitingModal(true);
        } else {
            const id = order.order_number || order.request_number || (typeof order.id === 'string' && order.id.startsWith('request-') ? order.id.replace('request-', '') : order.id);

            if (order.type === 'customized') {
                navigate(`/customized-request-tracking/${id}`);
            } else if (order.type === 'booking' || order.type === 'special_order') {
                navigate(`/request-tracking/${id}`);
            } else {
                navigate(`/order-tracking/${id}`);
            }
        }
    };

    const handleCancelClick = (order) => {
        setOrderToCancel(order);
        setShowCancelModal(true);
    };

    const handleConfirmCancel = async () => {
        if (!orderToCancel) return;

        try {
            if (orderToCancel.isRequest) {
                // Cancel request via Supabase
                const { error } = await supabase
                    .from('requests')
                    .update({ status: 'cancelled' })
                    .eq('id', orderToCancel.request_id);

                if (error) {
                    console.error('Error cancelling request:', error);
                    setInfoModal({ show: true, title: 'Error', message: 'Failed to cancel request. Please try again.' });
                    return;
                }
            } else {
                // Cancel order via Supabase
                const { error } = await supabase
                    .from('orders')
                    .update({ status: 'cancelled' })
                    .eq('id', orderToCancel.id);

                if (error) {
                    console.error('Error cancelling order:', error);
                    setInfoModal({ show: true, title: 'Error', message: 'Failed to cancel order. Please try again.' });
                    return;
                }
            }

            // Create cancellation notification
            const notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
            const orderTypeLabel = orderToCancel.isFromBooking ? 'Event Booking' :
                orderToCancel.type
                    ? (orderToCancel.type === 'booking' ? 'Event Booking'
                        : orderToCancel.type === 'special_order' ? 'Special Order'
                            : orderToCancel.type === 'customized' ? 'Customized Bouquet'
                                : 'Request')
                    : 'Order';
            const orderId = orderToCancel.order_number || orderToCancel.request_number || orderToCancel.id
                ? `#${orderToCancel.order_number || orderToCancel.request_number || orderToCancel.id}`
                : '';

            const newNotification = {
                id: `notif-${Date.now()}`,
                type: 'cancellation',
                title: `${orderTypeLabel} Cancelled`,
                message: `Your ${orderTypeLabel.toLowerCase()} ${orderId} has been cancelled successfully.`,
                icon: 'fa-times-circle',
                timestamp: new Date().toISOString(),
                read: false,
                link: '/my-orders'
            };
            localStorage.setItem('notifications', JSON.stringify([newNotification, ...notifications]));

            // Reload orders from Supabase
            const { data: { session } } = await supabase.auth.getSession();
            loadOrders(session.user.id);
            setShowCancelModal(false);
            setOrderToCancel(null);
        } catch (error) {
            console.error('Error cancelling order:', error);
            setInfoModal({ show: true, title: 'Error', message: 'Failed to cancel order. Please try again.' });
        }
    };

    const getOrderTypeLabel = (type) => {
        const labels = {
            booking: 'Event Booking',
            special_order: 'Special Order',
            customized: 'Customized Bouquet',
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
        const notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
        const orderType = selectedOrderForChat.type
            ? (selectedOrderForChat.type === 'booking' ? 'Event Booking'
                : selectedOrderForChat.type === 'special_order' ? 'Special Order'
                    : selectedOrderForChat.type === 'customized' ? 'Customized Bouquet'
                        : 'Request')
            : 'Order';

        const notification = {
            id: `notif-${Date.now()}`,
            type: 'message',
            title: 'New Message from Customer',
            message: `You have a new message about ${orderType.toLowerCase()} ${orderId}.`,
            icon: 'fa-comments',
            timestamp: new Date().toISOString(),
            read: false,
            link: '/admin/dashboard'
        };
        localStorage.setItem('notifications', JSON.stringify([notification, ...notifications]));

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
        const notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
        const notification = {
            id: `notif-${Date.now()}`,
            type: 'payment',
            title: 'Receipt Uploaded',
            message: 'A customer has uploaded a payment receipt. Please review and confirm.',
            icon: 'fa-receipt',
            timestamp: new Date().toISOString(),
            read: false,
            link: '/admin/dashboard'
        };
        localStorage.setItem('notifications', JSON.stringify([notification, ...notifications]));

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
                                            {order.isFromRequest && !order.order_number && (order.type === 'inquiry' ? 'Inquiry' : order.type === 'booking' ? 'Event Booking' : 'Request')}
                                            {order.type === 'booking' && !order.isFromRequest && 'Event Booking'}
                                            {order.type === 'special_order' && 'Special Order'}
                                            {order.type === 'customized' && 'Customized Bouquet'}
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
                                    {order.items && order.items.length > 0 && !order.isFromRequest ? (
                                        <>
                                            {order.items.slice(0, 2).map((item, idx) => (
                                                <div key={idx} className="order-item">
                                                    <img
                                                        src={item.image || item.photo}
                                                        alt={item.name || 'Item'}
                                                        className="order-item-img"
                                                        onError={(e) => e.target.src = 'https://via.placeholder.com/70'}
                                                    />
                                                    <div>
                                                        <div className="order-item-name">{item.name || 'Custom Item'}</div>
                                                        {item.variant && (
                                                            <div className="order-item-variant">{item.variant}</div>
                                                        )}
                                                        <div className="order-item-qty">x{item.qty || 1}</div>
                                                    </div>
                                                    <div className="order-item-price">
                                                        ₱{((item.price || order.price || 0) * (item.qty || 1)).toLocaleString()}
                                                    </div>
                                                </div>
                                            ))}
                                            {order.items.length > 2 && (
                                                <div className="text-muted small mt-2">
                                                    + {order.items.length - 2} more item(s)
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
                                                        <>Event Booking</>
                                                    )}
                                                    {order.type === 'special_order' && (
                                                        <>Special Order Request</>
                                                    )}
                                                    {order.type === 'customized' && (
                                                        <>Customized Bouquet Request</>
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
                                                            Jocery's Flower Shop, 123 Flower St., Quezon City
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
                                        {order.status === 'pending' && order.type && (
                                            <button
                                                className="btn-order-action primary"
                                                onClick={() => handleTrackStatus(order)}
                                            >
                                                Track Status
                                            </button>
                                        )}
                                        {order.status !== 'cancelled' && order.status !== 'completed' && !(order.status === 'pending' && order.type) && (
                                            <button
                                                className="btn-order-action primary"
                                                onClick={() => handleTrackOrder(order.order_number || order.request_number || order.id)}
                                            >
                                                Track Order
                                            </button>
                                        )}
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
                                        {order.status !== 'cancelled' && order.status !== 'completed' && (
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
                    onClick={() => {
                        setShowCancelModal(false);
                        setOrderToCancel(null);
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
                        <h3 style={{ marginBottom: '1rem', color: '#333' }}>Cancel {orderToCancel?.type ? 'Request' : 'Order'}?</h3>
                        <p style={{ marginBottom: '1.5rem', color: '#4b5563' }}>
                            Are you sure you want to cancel this {orderToCancel?.type ? 'request' : 'order'}? This action cannot be undone.
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                            <button
                                onClick={() => {
                                    setShowCancelModal(false);
                                    setOrderToCancel(null);
                                }}
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
                                Yes, Cancel
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
                                    {selectedOrderForChat.type === 'booking' && 'Event Booking'}
                                    {selectedOrderForChat.type === 'special_order' && 'Special Order'}
                                    {selectedOrderForChat.type === 'customized' && 'Customized Bouquet'}
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


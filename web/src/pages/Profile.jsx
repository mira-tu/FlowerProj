import React, { useState, useEffect } from 'react';
import Select from 'react-select';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import '../styles/Shop.css';
import { supabase } from '../config/supabase';
import { formatPhoneNumber } from '../utils/format';
import {
    buildCustomerMetadata,
    buildCustomerProfileFormState,
    buildCustomerProfilePayload,
    GENDER_OPTIONS,
    getUserContactNumber,
    getUserFullName,
} from '../utils/customerProfile';
import InfoModal from '../components/InfoModal';
import CustomOrderQuoteBreakdown from '../components/CustomOrderQuoteBreakdown';
import CustomOrderQuotePaymentModal from '../components/CustomOrderQuotePaymentModal';
import { insertUserNotification } from '../utils/notificationApi';
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
import { summarizeCustomOrderQuoteBreakdown } from '../utils/customOrderQuoteBreakdown';

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

const PROFILE_MENUS = ['orders', 'messages', 'addresses', 'settings'];

const isValidProfileMenu = (menu) => PROFILE_MENUS.includes(menu);

const buildProfileMenuPath = (menu = 'orders') => (
    menu === 'orders' ? '/profile' : `/profile?menu=${menu}`
);

const Profile = ({ user, logout }) => {
    const navigate = useNavigate();
    const location = useLocation();

    const [activeMenu, setActiveMenu] = useState('orders');
    const [orders, setOrders] = useState([]);
    const [activeOrderTab, setActiveOrderTab] = useState('all');
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [adminId, setAdminId] = useState(null);
    const [addresses, setAddresses] = useState([]);
    const [showAddressModal, setShowAddressModal] = useState(false);
    const [addressForm, setAddressForm] = useState({
        label: '',
        name: '',
        phone: '',
        street: '',
        barangay: ''
    });
    const [editingAddress, setEditingAddress] = useState(null);
    const [barangays, setBarangays] = useState([]);
    const [selectedBarangay, setSelectedBarangay] = useState(null);
    const [addressLoading, setAddressLoading] = useState(false);
    const [formErrors, setFormErrors] = useState({});
    const [infoModal, setInfoModal] = useState({ show: false, title: '', message: '' });
    const [zoomedImage, setZoomedImage] = useState(null);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const menuFromQuery = params.get('menu');
        const menuFromState = location.state?.activeMenu;

        if (isValidProfileMenu(menuFromQuery)) {
            setActiveMenu(menuFromQuery);
            return;
        }

        if (location.pathname === '/profile' && isValidProfileMenu(menuFromState)) {
            navigate(buildProfileMenuPath(menuFromState), { replace: true, state: null });
            return;
        }

        setActiveMenu('orders');
    }, [location.pathname, location.search, location.state, navigate]);

    const openProfileMenu = (menuId) => {
        if (!isValidProfileMenu(menuId)) return;

        setActiveMenu(menuId);
        navigate(buildProfileMenuPath(menuId), { replace: true });
    };

    const menuItems = [
        { id: 'orders', label: 'My Orders', icon: 'fa-box' },
        { id: 'messages', label: 'Messages', icon: 'fa-comments' },
        { id: 'addresses', label: 'My Addresses', icon: 'fa-map-marker-alt' },
        { id: 'settings', label: 'Account Settings', icon: 'fa-cog' },
    ];

    const orderTabs = [
        { id: 'all', label: 'All Orders' },
        { id: 'pending', label: 'Pending' },
        { id: 'processing', label: 'Processing' },
        { id: 'to_pay', label: 'To Pay' },
        { id: 'ready_for_pickup', label: 'For Pickup' },
        { id: 'out_for_delivery', label: 'Out for Delivery' },
        { id: 'claimed', label: 'Claimed' },
        { id: 'completed', label: 'Completed' },
        { id: 'cancelled', label: 'Cancelled' },
    ];

    const formatMessageTime = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    useEffect(() => {
        if (!user) return;

        let staffIds = [];

        const setupMessaging = async () => {
            // 1. Get all staff members (admins and employees)
            const { data: staffUsers, error: staffError } = await supabase
                .from('users')
                .select('id')
                .in('role', ['admin', 'employee']);

            if (staffError) {
                console.error('Error fetching staff IDs:', staffError);
                // As a fallback, we might still want to fetch messages from the primary admin if one exists
                const { data: adminUser, error: adminError } = await supabase.from('users').select('id').eq('role', 'admin').limit(1).single();
                if (adminUser) {
                    staffIds = [adminUser.id];
                }
            } else {
                staffIds = staffUsers.map(u => u.id);
            }

            if (staffIds.length === 0) {
                console.warn("No staff users found to fetch messages from.");
                return;
            }

            // 2. Fetch initial messages between current user and ANY staff member
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .or(`and(sender_id.eq.${user.id},receiver_id.in.(${staffIds.join(',')})),and(receiver_id.eq.${user.id},sender_id.in.(${staffIds.join(',')}))`)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('Error fetching messages:', error);
            } else {
                setMessages(data || []);
            }

            // 3. Mark messages from any staff as read
            if (activeMenu === 'messages') {
                await supabase
                    .from('messages')
                    .update({ is_read: true })
                    .eq('receiver_id', user.id)
                    .in('sender_id', staffIds);
            }
        };

        setupMessaging();

        // 4. Set up real-time subscription
        const subscription = supabase
            .channel('public:messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                const newMessage = payload.new;
                // A message is relevant if it's TO me from ANY staff, or FROM me to ANY staff.
                const isRelevant = (staffIds.includes(newMessage.sender_id) && newMessage.receiver_id === user.id) ||
                    (newMessage.sender_id === user.id && staffIds.includes(newMessage.receiver_id));

                if (isRelevant) {
                    setMessages((prevMessages) => {
                        if (prevMessages.some(msg => msg.id === newMessage.id)) return prevMessages;
                        return [...prevMessages, newMessage]
                    });
                    // Also mark as read if the messages tab is active
                    if (activeMenu === 'messages' && newMessage.receiver_id === user.id) {
                        supabase
                            .from('messages')
                            .update({ is_read: true })
                            .eq('id', newMessage.id)
                            .then();
                    }
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [user, activeMenu]);

    // This useEffect is to find a primary admin to send messages TO.
    useEffect(() => {
        const fetchAdminId = async () => {
            const { data, error } = await supabase.from('users').select('id').eq('role', 'admin').limit(1).single();
            if (error) console.error('Error fetching admin ID for sending:', error);
            else if (data) setAdminId(data.id);
            else console.warn('No admin user found to send messages to.');
        };
        fetchAdminId();
    }, []);

    const [showCancelModal, setShowCancelModal] = useState(false);
    const [orderToCancel, setOrderToCancel] = useState(null);
    const [cancelTargetItemKey, setCancelTargetItemKey] = useState('');
    const [cancelQuantity, setCancelQuantity] = useState(1);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelReasonError, setCancelReasonError] = useState('');
    const [showWaitingModal, setShowWaitingModal] = useState(false);
    const [modalContent, setModalContent] = useState(null);
    const [profileForm, setProfileForm] = useState(() => buildCustomerProfileFormState({}, user));
    const [profileData, setProfileData] = useState(null); // New state for fetched profile data
    const [status, setStatus] = useState(null);
    const [quotePaymentOrder, setQuotePaymentOrder] = useState(null);
    const fallbackProfileName = getUserFullName(profileData || {}, user) || user?.email || '';
    const fallbackProfilePhone = getUserContactNumber(profileData || {}, user);

    useEffect(() => {
        const fetchProfile = async () => {
            if (user) {
                const { data, error } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', user.id)
                    .maybeSingle();

                if (error) {
                    console.error('Error fetching profile:', error);
                } else {
                    setProfileData(data);
                }
            }
        };
        fetchProfile();
    }, [user]); // Re-run when user changes

    useEffect(() => {
        setProfileForm(buildCustomerProfileFormState(profileData || {}, user));
    }, [profileData, user]); // Re-run when profileData or auth user changes

    // Load orders and requests from Supabase
    const loadOrders = async (currentUserId) => {
        if (!currentUserId) return;

        try {
            // Fetch orders from Supabase with order_items and address details
            const { data: apiOrders, error: ordersError } = await supabase
                .from('orders')
                .select('*, order_items(*, products(image_url)), addresses(*)') // Fetch product image_url
                .eq('user_id', currentUserId)
                .order('created_at', { ascending: false });

            if (ordersError) {
                console.error('Error fetching orders:', ordersError);
                throw ordersError;
            }

            // Fetch requests from Supabase, joining with the users table to get the phone number
            const { data: apiRequests, error: requestsError } = await supabase
                .from('requests')
                .select('*, users(phone)') // Select all request fields and the phone from the related user
                .eq('user_id', currentUserId)
                .order('created_at', { ascending: false });

            if (requestsError) {
                console.error('Error fetching requests:', requestsError);
                throw requestsError;
            }

            // Fetch all addresses needed for the requests
            const addressIds = (apiRequests || [])
                .map(req => req.data?.address_id)
                .filter(id => id); // Filter out null/undefined IDs

            let addressesData = [];
            if (addressIds.length > 0) {
                const { data: fetchedAddresses, error: addressesError } = await supabase
                    .from('addresses')
                    .select('*')
                    .in('id', addressIds);
                if (addressesError) {
                    console.error('Error fetching request addresses:', addressesError);
                } else {
                    addressesData = fetchedAddresses;
                }
            }

            // Transform API orders to match the expected format
            const transformedOrders = (apiOrders || []).map((order) => {
                const requestData = parseJsonObject(order.request_data);
                const parsedOrderNotes = parseMultiDeliveryNotes(order.notes);
                const orderItemSummary = summarizeCancellationItems(order.order_items || []);
                const requestItemSummary = summarizeCancellationItems(requestData?.items || []);
                const preferredSummary = orderItemSummary.hasItems ? orderItemSummary : requestItemSummary;
                const shippingFee = parseFloat(order.shipping_fee || order.delivery_fee || 0);
                const computedSubtotal = preferredSummary.hasItems
                    ? preferredSummary.remainingSubtotal
                    : parseFloat(order.subtotal || 0);
                const computedTotal = preferredSummary.hasItems
                    ? (preferredSummary.allCancelled ? 0 : roundCurrency(computedSubtotal + shippingFee))
                    : parseFloat(order.total || 0);
                const displayItems = preferredSummary.items.map((item) => ({
                    ...item,
                    price: item.unitPrice,
                    qty: item.remainingQuantity,
                    quantity: item.remainingQuantity,
                }));

                return {
                    id: order.id,
                    order_number: order.order_number,
                    date: order.created_at,
                    status: preferredSummary.allCancelled ? 'cancelled' : order.status,
                    cancellationReason: order.cancellation_reason || order.status_timestamps?.cancellation_reason || order.status_timestamps?.cancel_reason || null,
                    payment_status: order.payment_status,
                    payment_method: order.payment_method,
                    delivery_method: order.delivery_method,
                    total: computedTotal,
                    subtotal: computedSubtotal,
                    shipping_fee: shippingFee,
                    delivery_fee: shippingFee,
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
                    image_url: order.request_image_url || null,
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
                    photo: order.request_image_url
                };
            });

            // Transform API requests to match the expected format
            const transformedRequests = (apiRequests || []).map(request => {
                const requestData = parseJsonObject(request.data);
                const address = addressesData.find(addr => addr.id === requestData?.address_id) || null;
                const requestItemSummary = summarizeCancellationItems(requestData?.items || []);
                const displayItems = requestItemSummary.items.map((item) => ({
                    ...item,
                    price: item.unitPrice,
                    qty: item.remainingQuantity,
                    quantity: item.remainingQuantity,
                }));
                const quoteBreakdown = requestData?.quote_breakdown || null;
                const quoteSummary = quoteBreakdown
                    ? summarizeCustomOrderQuoteBreakdown(quoteBreakdown, request.shipping_fee || 0)
                    : null;
                const shippingFee = quoteSummary
                    ? quoteSummary.shipping
                    : parseFloat(request.shipping_fee || requestData?.quote_breakdown?.shipping_fee || 0);
                const fallbackTotal = parseFloat(
                    request.final_price
                    || request.estimated_price
                    || requestData?.estimated_total
                    || 0
                );
                const computedTotal = quoteSummary
                    ? roundCurrency(quoteSummary.total)
                    : (
                        requestItemSummary.hasItems
                            ? (requestItemSummary.allCancelled ? 0 : roundCurrency(requestItemSummary.remainingSubtotal + shippingFee))
                            : fallbackTotal
                    );
                const computedSubtotal = quoteSummary
                    ? roundCurrency(quoteSummary.subtotal)
                    : (requestItemSummary.hasItems ? requestItemSummary.remainingSubtotal : fallbackTotal);

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
                    subtotal: computedSubtotal,
                    notes: request.notes || requestData.notes,
                    data: requestData,
                    quoteBreakdown,
                    cancellationReason: request.cancellation_reason || requestData?.cancellation_reason || requestData?.decline_feedback || requestData?.declineFeedback || null,
                    declineFeedback: requestData?.decline_feedback || requestData?.declineFeedback || null,
                    shipping_fee: shippingFee,
                    image_url: request.image_url,
                    isRequest: true,
                    items: displayItems,
                    activeItems: requestItemSummary.activeItems,
                    hasPartialCancellation: requestItemSummary.hasCancellations,
                    address: address, // Attach the fetched address
                    // Extract specific fields for easier access
                    eventType: requestData?.eventType || requestData?.event_type || requestData?.occasion,
                    eventDate: requestData?.eventDate || requestData?.event_date,
                    venue: requestData?.venue,
                    recipientName: requestData?.recipientName || requestData?.recipient_name,
                    occasion: requestData?.occasion,
                    preferences: requestData?.preferences || requestData?.notes,
                    flower: requestData?.items?.[0]?.flower?.name || requestData?.items?.[0]?.flower || requestData?.flower,
                    bundleSize: requestData?.items?.[0]?.bundleSize || requestData?.bundleSize,
                    wrapper: requestData?.items?.[0]?.wrapper?.name || requestData?.items?.[0]?.wrapper || requestData?.wrapper,
                    ribbon: requestData?.items?.[0]?.ribbon?.name || requestData?.items?.[0]?.ribbon || requestData?.ribbon,
                    addon: requestData?.addon,
                    // Inquiry fields
                    subject: requestData?.subject,
                    message: requestData?.message,
                    email: requestData?.email,
                    phone: requestData?.phone || requestData?.contact_number
                };
            });

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

            setOrders(allOrders);
        } catch (error) {
            console.error('Error loading orders:', error);
            setOrders([]);

            if (error.message?.includes('Authentication')) {
                navigate('/login');
            } else {
                console.error('Failed to load orders. Please refresh the page.');
            }
        }
    };

    // Load orders when user is available
    useEffect(() => {
        if (user) {
            loadOrders(user.id);
        }
    }, [user]); // Only re-run if user changes

    // Fetch addresses from Supabase
    useEffect(() => {
        const fetchAddresses = async () => {
            if (user) {
                const { data, error } = await supabase
                    .from('addresses')
                    .select('*')
                    .eq('user_id', user.id);

                if (error) {
                    console.error('Error fetching addresses:', error);
                } else {
                    // Filter out soft-deleted addresses
                    setAddresses(data.filter(addr => !addr.label.startsWith('[DEL]')));
                }
            }
        };
        fetchAddresses();
    }, [user]);

    // Fetch barangays for Zamboanga City when modal opens
    useEffect(() => {
        if (showAddressModal) {
            setAddressLoading(true);
            fetch(`https://psgc.gitlab.io/api/cities-municipalities/097332000/barangays/`)
                .then(response => response.json())
                .then(data => {
                    const barangayOptions = data.map(b => ({ value: b.code, label: b.name }));
                    setBarangays(barangayOptions);
                })
                .catch(error => console.error('Error fetching barangays:', error))
                .finally(() => setAddressLoading(false));
        } else {
            setBarangays([]); // Clear barangays when modal closes
            setSelectedBarangay(null); // Clear selected barangay
        }
    }, [showAddressModal]);

    const handleSaveAddress = async () => {
        if (!addressForm.label || !addressForm.name || !addressForm.phone || !addressForm.street || !addressForm.barangay) {
            setInfoModal({ show: true, title: 'Notice', message: 'Please fill in all required fields (Label, Name, Phone, Street, Barangay)' });
            return;
        }

        // Validate phone number (strip non-digits first)
        const cleanPhone = addressForm.phone.replace(/\D/g, '');
        const phoneRegex = /^09\d{9}$/;

        if (!phoneRegex.test(cleanPhone)) {
            setFormErrors({ phone: 'Please enter a valid mobile number (11 digits starting with 09)' });
            return;
        }

        const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();

        if (userError || !currentUser) {
            setInfoModal({ show: true, title: 'Error', message: 'You must be logged in to save an address.' });
            console.error('Error fetching user for saving address:', userError);
            return;
        }

        const addressData = {
            user_id: currentUser.id,
            label: addressForm.label,
            name: addressForm.name,
            phone: addressForm.phone,
            street: addressForm.street,
            barangay: addressForm.barangay,
            city: 'Zamboanga City',
            province: '',
            is_default: addresses.length === 0 && !editingAddress // If no existing addresses and not editing, set as default
        };

        if (editingAddress) {
            const { data, error } = await supabase
                .from('addresses')
                .update(addressData)
                .eq('id', editingAddress.id)
                .select()
                .single();

            if (error) {
                console.error('Error updating address:', error);
                setInfoModal({ show: true, title: 'Error', message: 'Failed to update address: ' + error.message });
                return;
            }
            setAddresses(addresses.map(addr => (addr.id === editingAddress.id ? data : addr)));
        } else {
            const { data, error } = await supabase
                .from('addresses')
                .insert([addressData])
                .select()
                .single();

            if (error) {
                console.error('Error adding address:', error);
                setInfoModal({ show: true, title: 'Error', message: 'Failed to add address: ' + error.message });
                return;
            }
            setAddresses([...addresses, data]);
        }

        setShowAddressModal(false);
        setAddressForm({ label: '', name: fallbackProfileName, phone: fallbackProfilePhone, street: '', barangay: '' });
        setEditingAddress(null);
    };
    const handleDeleteAddress = (id) => {
        setModalContent({
            type: 'confirm',
            title: 'Delete Address',
            message: 'Are you sure you want to delete this address?',
            confirmText: 'Delete',
            onConfirm: async () => {
                // Try hard delete first
                const { error } = await supabase
                    .from('addresses')
                    .delete()
                    .eq('id', id);

                if (error) {
                    // Soft delete fallback: Update label with [DEL] prefix
                    const addrToDelete = addresses.find(a => a.id === id);
                    if (addrToDelete) {
                        const newLabel = `[DEL] ${addrToDelete.label}`.substring(0, 50);

                        const { error: updateError } = await supabase
                            .from('addresses')
                            .update({
                                label: newLabel,
                                is_default: false
                            })
                            .eq('id', id);

                        if (updateError) {
                            console.error('Error soft-deleting address:', updateError);
                            setInfoModal({ show: true, title: 'Error', message: 'Failed to delete address. It may be in use.' });
                            return;
                        }
                    }
                }

                // Update local state to remove the address (whether hard or soft deleted)
                setAddresses(addresses.filter(addr => addr.id !== id));
                setModalContent(null);
            }
        });
    };

    const handleSetDefaultAddress = async (id) => {
        // First, set all other addresses to not default
        const { error: updateError } = await supabase
            .from('addresses')
            .update({ is_default: false })
            .eq('user_id', user.id)
            .neq('id', id);

        if (updateError) {
            console.error('Error updating other addresses default status:', updateError);
            setInfoModal({ show: true, title: 'Error', message: 'Failed to set default address: ' + updateError.message });
            return;
        }

        // Then, set the selected address as default
        const { data, error } = await supabase
            .from('addresses')
            .update({ is_default: true })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error setting default address:', error);
            setInfoModal({ show: true, title: 'Error', message: 'Failed to set default address: ' + error.message });
            return;
        }

        setAddresses(addresses.map(addr => (
            addr.id === id ? data : { ...addr, is_default: false }
        )));
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

    const filteredOrders = activeOrderTab === 'all'
        ? orders
        : orders.filter(o => activeOrderTab === 'cancelled' ? ['cancelled', 'declined'].includes(o.status) : o.status === activeOrderTab);

    const getStatusBadgeClass = (status) => {
        const classes = {
            pending: 'pending',
            processing: 'processing',
            to_pay: 'pending',
            ready_for_pickup: 'processing',
            out_for_delivery: 'shipped',
            claimed: 'shipped',
            completed: 'delivered',
            cancelled: 'cancelled',
            declined: 'cancelled'
        };
        return classes[status] || 'pending';
    };

    const getStatusLabel = (status) => {
        const labels = {
            pending: 'Pending',
            processing: 'Processing',
            to_pay: 'To Pay',
            ready_for_pickup: 'Ready for Pickup',
            out_for_delivery: 'Out for Delivery',
            claimed: 'Claimed',
            completed: 'Completed',
            cancelled: 'Cancelled',
            declined: 'Declined'
        };
        return labels[status] || status;
    };

    const handleTrackOrder = (orderNumber) => {
        navigate(`/order-tracking/${orderNumber}`);
    };

    const handleTrackStatus = (order) => {
        // Show waiting for approval modal for pending requests
        if (order.status === 'pending' && order.type) {
            setShowWaitingModal(true);
        } else {
            handleTrackOrder(order.order_number || order.id);
        }
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
        if (!entityId || !user?.id) {
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
            customerId: user.id,
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

        try {
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
                });
                await loadOrders(user?.id);
                return;
            }

            if (orderToCancel.type) {
                await updateRequestCancellation(orderToCancel, cancelTargetItemKey, quantityToCancel, trimmedCancelReason);
            } else {
                await updateRegularOrderCancellation(orderToCancel, cancelTargetItemKey, quantityToCancel, trimmedCancelReason);
            }

            // Create cancellation notification
            const orderTypeLabel = orderToCancel.type
                ? (orderToCancel.type === 'booking' ? 'Custom Order'
                    : orderToCancel.type === 'special_order' ? 'Special Order'
                : orderToCancel.type === 'customized' ? 'Customizer Studio'
                            : 'Request')
                : 'Order';
            const orderNumber = orderToCancel.order_number ? `#${orderToCancel.order_number}` : '';
            try {
                await insertUserNotification({
                    userId: user.id,
                    type: 'cancellation',
                    title: `${orderTypeLabel} Updated`,
                    message: `${quantityToCancel} item${quantityToCancel > 1 ? 's were' : ' was'} cancelled from your ${orderTypeLabel.toLowerCase()} ${orderNumber}.`,
                    icon: 'fa-times-circle',
                    link: '/profile',
                });
            } catch (notificationError) {
                console.warn('Cancellation completed but notification could not be created:', notificationError);
            }

            // Reload orders from Supabase
            await loadOrders(user.id);
            closeCancelModal();
        } catch (error) {
            console.error('Error during cancellation:', error);
            setInfoModal({ show: true, title: 'Error', message: error.message || 'Failed to cancel. Please try again.' });
        }
    };

    const handleTrackRequest = (order) => {
        if (!order?.type) return;

        const requestIdentifier = order.request_number
            || order.request_id
            || (typeof order.id === 'string' && order.id.startsWith('request-') ? order.id.replace(/^request-/, '') : order.id);

        if (!requestIdentifier) return;

        navigate(
            order.type === 'customized'
                ? `/customized-request-tracking/${requestIdentifier}`
                : `/request-tracking/${requestIdentifier}`,
        );
    };

    const handleQuotePaymentSuccess = async () => {
        await loadOrders(user?.id);
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

    const handleAcceptQuote = (order) => {
        setModalContent({
            type: 'confirm',
            title: 'Accept Quote',
            message: `You are about to accept a quote of ₱${(order.total || 0).toLocaleString()}. You will be directed to payment after confirming.`,
            confirmText: 'Accept & Pay',
            onConfirm: () => {
                setQuotePaymentOrder(order);
                setModalContent(null);
            }
        });
    };

    const handleRequestAdjustment = (order) => {
        const requestLabel = order?.request_number
            || order?.request_id
            || (typeof order?.id === 'string' && order.id.startsWith('request-') ? order.id.replace(/^request-/, '') : order?.id)
            || '';

        setInfoModal({
            show: true,
            title: 'Request Price Adjustment',
            message: `To request an adjustment for request #${requestLabel}, please proceed to the "Messages" tab to chat with our staff.`,
            linkTo: buildProfileMenuPath('messages'),
            linkText: 'Go to Messages',
        });
    };

    const handleReorder = (order) => {
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
    };

    const sendMessage = async () => {
        if (!newMessage.trim() || !user || !adminId) return;

        const message = {
            sender_id: user.id,
            receiver_id: adminId, // Admin user ID
            message: newMessage.trim(),
        };

        const { error } = await supabase.from('messages').insert([message]);

        if (error) {
            console.error('Error sending message:', error);
        } else {
            setNewMessage('');
        }
    };

    const renderOrdersContent = () => (
        <>
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
                                        {order.type === 'booking' && 'Custom Order'}
                                        {order.type === 'special_order' && 'Special Order'}
                                  {order.type === 'customized' && 'Customizer Studio'}
                                        {!order.type && `Order #${order.order_number || order.id}`}
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
                                        {order.items.slice(0, 2).map((item, idx) => (
                                            <div key={idx} className="order-item">
                                                <img
                                                    src={item.products?.image_url || item.image_url || item.image || item.photo} // Prioritize product image_url
                                                    alt={item.name || 'Item'}
                                                    className="order-item-img"
                                                    onError={(e) => e.target.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'} // Replaced external URL with data URI
                                                />
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
                                                {!order.type && (
                                                    <div className="order-item-price">
                                                        ₱{((item.price || order.price || 0) * (item.qty || 1)).toLocaleString()}
                                                    </div>
                                                )}
                                            </div>
                                        ))}                                        {order.items.length > 2 && (
                                            <div className="text-muted small mt-2">
                                                + {order.items.length - 2} more item(s)
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    // Display request details for bookings, special orders, and customized
                                    <div
                                        className="order-item"
                                    >
                                        {(order.image_url || order.data?.items?.[0]?.image_url || order.data?.items?.[0]?.image) && (
                                            <img
                                                src={order.image_url || order.data?.items?.[0]?.image_url || order.data?.items?.[0]?.image}
                                                alt="Request preview"
                                                className="order-item-img customized-bouquet-img"
                                                style={{ cursor: 'pointer' }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setZoomedImage(order.image_url || order.data?.items?.[0]?.image_url || order.data?.items?.[0]?.image);
                                                }}
                                                onError={(e) => e.target.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}
                                            />
                                        )}
                                        <div className="flex-grow-1 order-request-details">
                                            {order.type === 'booking' && (
                                                <>
                                                    <div className="order-item-name">{order.eventType} Event</div>
                                                    {order.recipientName && <div className="order-item-variant"><strong>Recipient:</strong> {order.recipientName}</div>}
                                                    {order.eventDate && <div className="order-item-variant"><strong>Event Date:</strong> {new Date(order.eventDate).toLocaleDateString()}</div>}
                                                    {(order.eventTime || order.data?.eventTime) && <div className="order-item-variant"><strong>Event Time:</strong> {(() => {
                                                        try {
                                                            const t = order.eventTime || order.data?.eventTime;
                                                            const [hStr, mStr] = t.split(':');
                                                            let h = parseInt(hStr, 10);
                                                            const ampm = h >= 12 ? 'PM' : 'AM';
                                                            h = h % 12 || 12;
                                                            return `${h}:${mStr} ${ampm}`;
                                                        } catch (e) { return order.eventTime || order.data?.eventTime; }
                                                    })()}</div>}
                                                </>
                                            )}
                                            {order.type === 'special_order' && (
                                                <>
                                                    <div className="order-item-name">Special Order</div>
                                                    {order.recipientName && <div className="order-item-variant"><strong>Recipient:</strong> {order.recipientName}</div>}
                                                    {order.occasion && <div className="order-item-variant"><strong>Occasion:</strong> {order.occasion}</div>}
                                                    {order.preferences && <div className="order-item-variant"><strong>Preferences:</strong> {order.preferences}</div>}
                                                    {order.addon && order.addon !== 'None' && <div className="order-item-variant"><strong>Add-on:</strong> {order.addon}</div>}
                                                    {order.message && <div className="order-item-variant"><strong>Message:</strong> {order.message}</div>}
                                                </>
                                            )}
                                            {order.type === 'customized' && (
                                                <>
                                                    <div className="order-item-name">Customizer Studio {order.data?.items?.length > 1 ? `(${order.data.items.length} items)` : ''}</div>
                                                    {order.flower && <div className="order-item-variant"><strong>Flower:</strong> {typeof order.flower === 'object' ? order.flower.name : order.flower}</div>}
                                                    {order.bundleSize && <div className="order-item-variant"><strong>Bundle Size:</strong> {order.bundleSize}</div>}
                                                    {order.wrapper && <div className="order-item-variant"><strong>Wrapper:</strong> {typeof order.wrapper === 'object' ? order.wrapper.name : order.wrapper}</div>}
                                                    {order.ribbon && <div className="order-item-variant"><strong>Ribbon:</strong> {typeof order.ribbon === 'object' ? order.ribbon.name : order.ribbon}</div>}
                                                    {order.notes && <div className="order-item-variant"><strong>Notes:</strong> {order.notes}</div>}
                                                </>
                                            )}
                                            {order.phone && (
                                                <div className="order-item-variant">
                                                    <strong>Contact:</strong> {order.phone}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {['cancelled', 'declined'].includes(order.status) && (
                                    <div className="mt-3 p-3 rounded" style={{ background: '#fff1f2', border: '1px solid #fecdd3' }}>
                                        <div className="small fw-bold text-danger mb-1">{order.status === 'cancelled' ? 'Cancellation Reason' : 'Decline Feedback'}</div>
                                        <div className="small text-dark">
                                            {order.cancellationReason || order.declineFeedback || order.data?.cancellation_reason || order.data?.decline_feedback || order.data?.declineFeedback || (order.status === 'cancelled' ? 'No cancellation reason provided.' : 'No decline feedback provided.')}
                                        </div>
                                    </div>
                                )}

                                {order.type === 'booking' && order.status === 'quoted' && (order.quoteBreakdown || order.data?.quote_breakdown) && (() => {
                                    const breakdown = order.quoteBreakdown || order.data?.quote_breakdown;
                                    return (
                                        <>
                                            <CustomOrderQuoteBreakdown
                                            breakdown={breakdown}
                                            shippingFee={order.shipping_fee}
                                            title="Price Breakdown"
                                                className="mt-3 pt-3 border-top"
                                            />
                                            {/*
                                                            {item.showQuantity ? ` (${item.quantity} x ₱${item.unitPrice.toLocaleString()})` : ''}
                                                        </span>
                                                        <span className="fw-semibold">₱{item.total.toLocaleString()}</span>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="small text-muted mb-1">No line-item breakdown available.</div>
                                            )}
                                            <div className="d-flex justify-content-between small border-top pt-2 mt-2">
                                                <span>Subtotal</span>
                                                <span className="fw-semibold">₱{subtotal.toLocaleString()}</span>
                                            </div>
                                            <div className="d-flex justify-content-between small">
                                                <span>Delivery Fee</span>
                                                <span className="fw-semibold">₱{shipping.toLocaleString()}</span>
                                            </div>
                                            <div className="d-flex justify-content-between small fw-bold mt-1" style={{ color: 'var(--shop-pink)' }}>
                                                <span>Total</span>
                                                <span>₱{total.toLocaleString()}</span>
                                            </div>
                                        </div>
                                            */}
                                        </>
                                    );
                                })()}

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
                                                                : `${order.address.street}, ${order.address.barangay}, ${order.address.city}, ${order.address.province}`
                                                            }
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="order-card-footer">
                                <div className="order-total">
                                    {order.type ? (
                                        order.type === 'customized' ? ( // Special handling for customized bouquets
                                            <>Request Total: <span>₱{(order.total || 0).toLocaleString()}</span></>
                                        ) : ( // Existing logic for other request types
                                            (order.status === 'pending' || order.total === 0) ? (
                                                <>Request Total: <span style={{ color: 'var(--shop-pink)' }}>To be discuss further</span></>
                                            ) : (
                                                <>{order.status === 'quoted' ? 'Quoted Price' : 'Request Total'}: <span>₱{(order.total || 0).toLocaleString()}</span></>
                                            )
                                        )
                                    ) : ( // It's a regular order
                                        <>Order Total: <span>₱{(order.total || order.price || 0).toLocaleString()}</span></>
                                    )}                                </div>
                                <div className="order-actions">
                                    {order.type === 'booking' && order.status === 'quoted' ? (
                                        <div className="d-flex gap-2 flex-wrap">
                                            <button
                                                className="btn-order-action primary"
                                                onClick={() => handleTrackRequest(order)}
                                            >
                                                Track Request
                                            </button>
                                            <button className="btn-order-action" style={{ backgroundColor: 'var(--shop-pink)', color: 'white', border: 'none' }} onClick={() => handleAcceptQuote(order)}>Accept</button>
                                            <button className="btn-order-action" style={{ backgroundColor: 'transparent', color: 'var(--shop-pink)', border: '1px solid var(--shop-pink)' }} onClick={() => handleRequestAdjustment(order)}>Adjust</button>
                                            {getCancellableItems(order).length > 0 && (
                                                <button className="btn-order-action" style={{ backgroundColor: '#dc3545', color: 'white', border: '1px solid #dc3545' }} onClick={() => handleCancelClick(order)}>Cancel</button>
                                            )}
                                        </div>
                                    ) : (
                                        <>
                                            {order.status === 'completed' && order.items && (
                                                <button
                                                    className="btn-order-action secondary"
                                                    onClick={() => handleReorder(order)}
                                                >
                                                    Buy Again
                                                </button>
                                            )}

                                            {/* TRACK BUTTONS */}
                                            {order.status !== 'declined' && order.type && (
                                                <button
                                                    className="btn-order-action primary"
                                                    onClick={() => handleTrackRequest(order)}
                                                >
                                                    Track Request
                                                </button>
                                            )}
                                            {order.status !== 'declined' && !order.type && (
                                                <button
                                                    className="btn-order-action primary"
                                                    onClick={() => navigate(`/order-tracking/${order.order_number}`)}
                                                >
                                                    Track Order
                                                </button>
                                            )}

                                            {/* CANCEL BUTTON */}
                                            {['pending', 'processing'].includes(order.status) && getCancellableItems(order).length > 0 && (
                                                <button
                                                    className="btn-order-action danger"
                                                    onClick={() => handleCancelClick(order)}
                                                    style={{ background: '#dc3545', color: 'white', border: 'none' }}
                                                >
                                                    Cancel
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
    );

    const renderAddressesContent = () => (
        <>
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h5 className="fw-bold mb-0">My Addresses</h5>
                <button
                    className="btn btn-sm"
                    style={{ background: 'var(--shop-pink)', color: 'white' }}
                    onClick={() => {
                        setEditingAddress(null);
                        setSelectedBarangay(null);
                        setAddressForm({
                            label: '',
                            name: fallbackProfileName,
                            phone: fallbackProfilePhone,
                            street: '',
                            barangay: ''
                        });
                        setShowAddressModal(true);
                    }}
                >
                    <i className="fas fa-plus me-2"></i>Add Address
                </button>
            </div>

            {addresses.map(addr => (
                <div key={addr.id} className="address-card mb-3" style={{ cursor: 'default' }}>
                    <div className="d-flex justify-content-between align-items-start">
                        <div>
                            {addr.is_default && <span className="address-label">Default</span>}
                            <span className="badge bg-secondary ms-2">{addr.label}</span>
                        </div>
                        <div>
                            <button
                                className="btn btn-link btn-sm text-primary"
                                onClick={() => {
                                    setEditingAddress(addr);
                                    setAddressForm({
                                        label: addr.label || '',
                                        name: addr.name || '',
                                        phone: formatPhoneNumber(addr.phone || ''),
                                        street: addr.street,
                                        barangay: addr.barangay || '',
                                    });
                                    setShowAddressModal(true);
                                }}
                            >
                                Edit
                            </button>
                            {!addr.is_default && (
                                <button
                                    className="btn btn-link btn-sm text-danger"
                                    onClick={() => handleDeleteAddress(addr.id)}
                                >
                                    Delete
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="address-name mt-2">{addr.name}</div>
                    <div className="address-phone">{addr.phone}</div>
                    <div className="address-detail mt-2">{`${addr.street}, ${addr.barangay}, Zamboanga City`}</div>
                    {!addr.is_default && (
                        <button
                            className="btn btn-outline-secondary btn-sm mt-3"
                            onClick={() => handleSetDefaultAddress(addr.id)}
                        >
                            Set as Default
                        </button>
                    )}
                </div>
            ))}
        </>
    );

    const handleProfileUpdate = async (e) => {
        e.preventDefault();
        setStatus(null);

        if (!user) {
            setStatus({ type: 'error', message: 'You must be logged in to update your profile.' });
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        if (!profileForm.firstName.trim() || !profileForm.lastName.trim() || !profileForm.phone.trim() || !profileForm.dateOfBirth || !profileForm.gender) {
            setStatus({ type: 'error', message: 'First name, last name, contact number, birthday, and gender are required.' });
            return;
        }

        if (!/^09\d{9}$/.test(profileForm.phone.replace(/\D/g, ''))) {
            setStatus({ type: 'error', message: 'Please enter a valid mobile number (11 digits starting with 09).' });
            return;
        }

        if (profileForm.dateOfBirth > today) {
            setStatus({ type: 'error', message: 'Birthday cannot be in the future.' });
            return;
        }

        const profilePayload = buildCustomerProfilePayload({
            firstName: profileForm.firstName,
            middleName: profileForm.middleName,
            lastName: profileForm.lastName,
            email: user.email,
            contactNumber: profileForm.phone,
            birthday: profileForm.dateOfBirth,
            gender: profileForm.gender,
        });
        delete profilePayload.role;

        try {
            const { error: profileError } = await supabase
                .from('users')
                .update(profilePayload)
                .eq('id', user.id);

            if (profileError) {
                throw profileError;
            }

            const { error: authError } = await supabase.auth.updateUser({
                data: buildCustomerMetadata({
                    firstName: profileForm.firstName,
                    middleName: profileForm.middleName,
                    lastName: profileForm.lastName,
                    contactNumber: profileForm.phone,
                    birthday: profileForm.dateOfBirth,
                    gender: profileForm.gender,
                }),
            });

            if (authError) {
                throw authError;
            }

            // Update password if a new one is provided
            if (profileForm.newPassword) {
                const { error: passwordError } = await supabase.auth.updateUser({
                    password: profileForm.newPassword
                });
                if (passwordError) {
                    throw passwordError;
                }

                setProfileForm(prev => ({
                    ...prev,
                    currentPassword: '',
                    newPassword: ''
                }));
            }

            setProfileData((prev) => ({
                ...(prev || {}),
                ...profilePayload,
            }));
            setStatus({ type: 'success', message: 'Profile updated successfully!' });

        } catch (error) {
            setStatus({ type: 'error', message: 'Failed to update profile: ' + error.message });
        }
    };

    const handleProfileFormChange = (e) => {
        const { name, value } = e.target;
        if (name === 'phone') {
            setProfileForm(prev => ({ ...prev, [name]: formatPhoneNumber(value) }));
        } else {
            setProfileForm(prev => ({ ...prev, [name]: value }));
        }
    };

    const renderSettingsContent = () => {
        const defaultAddress = addresses.find((item) => item.is_default) || addresses[0] || null;
        const defaultAddressSummary = defaultAddress
            ? `${defaultAddress.street}, ${defaultAddress.barangay}, ${defaultAddress.city}`
            : 'Manage from My Addresses';

        return (
        <>
            <h5 className="fw-bold mb-4">Account Settings</h5>
            {status && (
                <div className={`alert ${status.type === 'success' ? 'alert-success' : 'alert-danger'}`}>
                    {status.message}
                </div>
            )}
            <form onSubmit={handleProfileUpdate}>
                <div className="row">
                    <div className="col-md-4 mb-3">
                        <label className="form-label">First Name</label>
                        <input
                            type="text"
                            className="form-control"
                            name="firstName"
                            value={profileForm.firstName}
                            onChange={handleProfileFormChange}
                        />
                    </div>
                    <div className="col-md-4 mb-3">
                        <label className="form-label">Middle Name</label>
                        <input
                            type="text"
                            className="form-control"
                            name="middleName"
                            value={profileForm.middleName}
                            onChange={handleProfileFormChange}
                            placeholder="Optional"
                        />
                    </div>
                    <div className="col-md-4 mb-3">
                        <label className="form-label">Last Name</label>
                        <input
                            type="text"
                            className="form-control"
                            name="lastName"
                            value={profileForm.lastName}
                            onChange={handleProfileFormChange}
                        />
                    </div>
                    <div className="col-md-6 mb-3">
                        <label className="form-label">Email Address</label>
                        <input
                            type="email"
                            className="form-control"
                            defaultValue={user.email}
                            disabled
                        />
                    </div>
                    <div className="col-md-6 mb-3">
                        <label className="form-label">Phone Number</label>
                        <input
                            type="tel"
                            className="form-control"
                            name="phone"
                            value={profileForm.phone}
                            onChange={handleProfileFormChange}
                            placeholder="+639171234567 or 09171234567"
                        />
                    </div>
                    <div className="col-md-6 mb-3">
                        <label className="form-label">Birthday</label>
                        <input
                            type="date"
                            className="form-control"
                            name="dateOfBirth"
                            value={profileForm.dateOfBirth}
                            onChange={handleProfileFormChange}
                            max={new Date().toISOString().split('T')[0]}
                        />
                    </div>
                    <div className="col-md-6 mb-3">
                        <label className="form-label">Gender</label>
                        <select
                            className="form-select"
                            name="gender"
                            value={profileForm.gender}
                            onChange={handleProfileFormChange}
                        >
                            <option value="">Select Gender</option>
                            {GENDER_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="col-md-6 mb-3">
                        <label className="form-label">Saved Address</label>
                        <input
                            type="text"
                            className="form-control"
                            value={defaultAddressSummary}
                            disabled
                        />
                    </div>
                </div>

                <hr className="my-4" />

                <h6 className="fw-bold mb-3">Change Password</h6>
                <div className="row">
                    <div className="col-md-6 mb-3">
                        <label className="form-label">Current Password</label>
                        <input
                            type="password"
                            className="form-control"
                            name="currentPassword"
                            value={profileForm.currentPassword}
                            onChange={handleProfileFormChange}
                            placeholder="Leave blank to keep current"
                        />
                    </div>
                    <div className="col-md-6 mb-3">
                        <label className="form-label">New Password</label>
                        <input
                            type="password"
                            className="form-control"
                            name="newPassword"
                            value={profileForm.newPassword}
                            onChange={handleProfileFormChange}
                            placeholder="Enter new password"
                        />
                    </div>
                </div>

                <button type="submit" className="btn mt-3" style={{ background: 'var(--shop-pink)', color: 'white' }}>
                    Save Changes
                </button>
            </form>
        </>
        );
    };

    const renderMessagesContent = () => {
        return (
            <>
                <div className="d-flex justify-content-between align-items-center mb-4">
                    <h5 className="fw-bold mb-0">
                        <i className="fas fa-comments me-2" style={{ color: 'var(--shop-pink)' }}></i>
                        Chat with Us
                    </h5>
                    <span className="badge" style={{ background: 'var(--shop-pink-light)', color: 'var(--shop-pink)' }}>
                        <i className="fas fa-circle me-1" style={{ fontSize: '0.5rem' }}></i>
                        Online
                    </span>
                </div>

                <div className="messages-container">
                    {messages.map((msg, index) => {
                        const isSent = msg.sender_id === user.id;
                        return (
                            <div key={index} className={`message-wrapper ${isSent ? 'sent' : 'received'}`}>
                                {!isSent && (
                                    <div className="message-avatar">
                                        <i className="fas fa-store"></i>
                                    </div>
                                )}
                                <div className={`message-bubble ${isSent ? 'sent' : 'received'}`}>
                                    <p className="message-text">{msg.message}</p>
                                    <div className={`message-time ${isSent ? 'sent' : 'received'}`}>
                                        {formatMessageTime(msg.created_at)}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="chat-input-container">
                    <input
                        type="text"
                        className="chat-input"
                        placeholder="Type your message..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    />
                    <button
                        className="chat-send-button"
                        onClick={sendMessage}
                    >
                        <i className="fas fa-paper-plane"></i>
                    </button>
                </div>
            </>
        );
    };

    const renderContent = () => {
        switch (activeMenu) {
            case 'orders': return renderOrdersContent();
            case 'messages': return renderMessagesContent();
            case 'addresses': return renderAddressesContent();
            case 'settings': return renderSettingsContent();
            default: return renderOrdersContent();
        }
    };

    const selectStyles = {
        control: (provided) => ({
            ...provided,
            borderColor: '#ddd',
            borderRadius: '8px',
            padding: '4px',
            fontSize: '16px',
        }),
        menu: (provided) => ({
            ...provided,
            zIndex: 1050, // Ensure dropdown appears above other content
        }),
    };

    const cancellableItems = getCancellableItems(orderToCancel);
    const selectedCancelItem = cancellableItems.find((item) => item.cancellationKey === String(cancelTargetItemKey))
        || cancellableItems[0]
        || null;

    return (
        <div className="profile-container">
            <div className="container">
                <div className="row">
                    <div className="col-lg-3 mb-4">
                        <div className="profile-sidebar">
                            <div className="text-center pb-3 mb-3" style={{ borderBottom: '1px solid #eee' }}>
                                <h5 className="fw-bold mb-1" style={{ color: '#333' }}>{user?.name}</h5>
                                <small className="text-muted">{user?.email}</small>
                            </div>

                            <ul className="profile-menu" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                {menuItems.map(item => (
                                    <li
                                        key={item.id}
                                        className={`profile-menu-item ${activeMenu === item.id ? 'active' : ''}`}
                                        onClick={() => {
                                            if (item.link) {
                                                navigate(item.link);
                                            } else {
                                                openProfileMenu(item.id);
                                            }
                                        }}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <i className={`fas ${item.icon}`}></i>
                                        <span>{item.label}</span>
                                    </li>
                                ))}
                            </ul>

                            <hr />

                            <div
                                className="profile-menu-item text-danger"
                                onClick={logout}
                                style={{ cursor: 'pointer' }}
                            >
                                <i className="fas fa-sign-out-alt"></i>
                                <span>Logout</span>
                            </div>
                        </div>
                    </div>

                    <div className="col-lg-9">
                        <div className="profile-content">
                            {renderContent()}
                        </div>
                    </div>
                </div>
            </div>

            {showAddressModal && (
                <div className="modal-overlay" onClick={() => setShowAddressModal(false)}>
                    <div className="modal-content-custom" onClick={e => e.stopPropagation()}>
                        <div className="modal-header-custom">
                            <h4>{editingAddress ? 'Edit Address' : 'Add New Address'}</h4>
                            <button className="modal-close" onClick={() => setShowAddressModal(false)}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="modal-body-custom">
                            <div className="form-group">
                                <label className="form-label">Label</label>
                                <input
                                    type="text"
                                    className="form-control-custom"
                                    value={addressForm.label}
                                    onChange={e => setAddressForm({ ...addressForm, label: e.target.value })}
                                    placeholder="e.g., Home, Office"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Full Name</label>
                                <input
                                    type="text"
                                    className="form-control-custom"
                                    value={addressForm.name}
                                    onChange={e => setAddressForm({ ...addressForm, name: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Phone Number</label>
                                <input
                                    type="tel"
                                    className={`form-control-custom ${formErrors.phone ? 'is-invalid' : ''}`}
                                    value={addressForm.phone}
                                    onChange={e => {
                                        const formatted = formatPhoneNumber(e.target.value);
                                        setAddressForm({ ...addressForm, phone: formatted });

                                        // Check if valid to clear error
                                        const clean = formatted.replace(/\D/g, '');
                                        if (/^09\d{9}$/.test(clean)) {
                                            if (formErrors.phone) setFormErrors({ ...formErrors, phone: null });
                                        }
                                    }}
                                />
                                {formErrors.phone && <div className="invalid-feedback d-block">{formErrors.phone}</div>}
                            </div>


                            <div className="form-group">
                                <label className="form-label">Barangay</label>
                                <Select
                                    styles={selectStyles}
                                    options={barangays}
                                    isLoading={addressLoading === 'barangays'}
                                    placeholder="Select Barangay"
                                    onChange={option => {
                                        setSelectedBarangay(option);
                                        setAddressForm({ ...addressForm, barangay: option ? option.label : '' });
                                    }}
                                    value={selectedBarangay}

                                    isClearable
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Street Address</label>
                                <input
                                    type="text"
                                    className="form-control-custom"
                                    value={addressForm.street}
                                    onChange={e => setAddressForm({ ...addressForm, street: e.target.value })}
                                    placeholder="e.g., House No., Street Name, Subdivision"
                                />
                            </div>

                            <button
                                className="btn"
                                style={{ background: 'var(--shop-pink)', color: 'white' }}
                                onClick={handleSaveAddress}
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                            <label htmlFor="cancelItemProfile" style={{ display: 'block', fontWeight: '600', color: '#333', marginBottom: '0.5rem' }}>
                                Item to cancel
                            </label>
                            <select
                                id="cancelItemProfile"
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
                                <label htmlFor="cancelQuantityProfile" style={{ display: 'block', fontWeight: '600', color: '#333', marginBottom: '0.5rem' }}>
                                    Quantity to cancel
                                </label>
                                <select
                                    id="cancelQuantityProfile"
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
                            <label htmlFor="cancelReasonProfile" style={{ display: 'block', fontWeight: '600', color: '#333', marginBottom: '0.5rem' }}>
                                Reason for cancellation
                            </label>
                            <textarea
                                id="cancelReasonProfile"
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

            {modalContent && (
                <div className="modal-overlay" onClick={() => setModalContent(null)}>
                    <div className="modal-content-custom" onClick={e => e.stopPropagation()}>
                        <div className="modal-header-custom">
                            <h4>{modalContent.title}</h4>
                            <button className="modal-close" onClick={() => setModalContent(null)}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="modal-body-custom">
                            <p style={{ whiteSpace: 'pre-wrap' }}>{modalContent.message}</p>
                        </div>
                        <div className="modal-footer-custom" style={{ justifyContent: 'flex-end' }}>
                            {modalContent.type === 'confirm' && (
                                <button className="btn btn-secondary me-2" onClick={() => {
                                    if (modalContent.onCancel) modalContent.onCancel();
                                    setModalContent(null);
                                }}>
                                    Cancel
                                </button>
                            )}
                            <button className="btn" style={{ background: 'var(--shop-pink)', color: 'white' }} onClick={() => {
                                if (modalContent.onConfirm) modalContent.onConfirm();
                                // For info modals, the onConfirm should handle dismissal if needed
                                if (modalContent.type !== 'info') {
                                    setModalContent(null);
                                }
                            }}>
                                {modalContent.confirmText || 'OK'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <CustomOrderQuotePaymentModal
                visible={Boolean(quotePaymentOrder)}
                order={quotePaymentOrder}
                userId={user?.id}
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
            />



            {/* Image Zoom Modal */}
            {zoomedImage && (
                <div
                    className="modal-overlay d-flex justify-content-center align-items-center"
                    onClick={() => setZoomedImage(null)}
                    style={{ zIndex: 3000, background: 'rgba(0,0,0,0.85)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, padding: '20px' }}
                >
                    <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
                        <button
                            onClick={() => setZoomedImage(null)}
                            style={{
                                position: 'absolute', top: '-15px', right: '-15px',
                                background: '#fff', color: '#333', border: 'none',
                                width: '30px', height: '30px', borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.2)', zIndex: 3001
                            }}
                        >
                            <i className="fas fa-times"></i>
                        </button>
                        <img
                            src={zoomedImage}
                            alt="Zoomed Request"
                            style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px' }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default Profile;


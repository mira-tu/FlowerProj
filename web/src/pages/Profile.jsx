import React, { useState, useEffect } from 'react';
import Select from 'react-select';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import '../styles/Shop.css';
import { supabase } from '../config/supabase';
import { formatPhoneNumber } from '../utils/format';
import qrCodeImage from '../assets/qr-code-1.jpg';

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
    
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const menu = params.get('menu');
        if (menu && ['orders', 'messages', 'addresses', 'settings'].includes(menu)) {
            setActiveMenu(menu);
        }
    }, [location.search]);

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
    const [showWaitingModal, setShowWaitingModal] = useState(false);
    const [modalContent, setModalContent] = useState(null);
    const [profileForm, setProfileForm] = useState({
        fullName: '',
        phone: '',
        dateOfBirth: '',
    });
    const [profileData, setProfileData] = useState(null); // New state for fetched profile data
    const [status, setStatus] = useState(null);
    const [showQRModal, setShowQRModal] = useState(false);
    const [orderForPayment, setOrderForPayment] = useState(null);
    const [receiptFile, setReceiptFile] = useState(null);
    const [receiptPreview, setReceiptPreview] = useState(null);
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);
    const [amountPaidForCurrentPayment, setAmountPaidForCurrentPayment] = useState(null); // amount being paid in this submission

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

    const handleConfirmPayment = async () => {
        if (!receiptFile) {
            alert('Please upload your payment receipt before confirming.');
            return;
        }
        if (!orderForPayment) return;
        const amountToRecord = amountPaidForCurrentPayment != null
            ? amountPaidForCurrentPayment
            : parseFloat(orderForPayment.total || 0);

        setIsProcessingPayment(true);

        let uploadedReceiptUrl = null;
        try {
            const fileExt = receiptFile.name.split('.').pop();
            const identifier = orderForPayment.isRequest
                ? `request-${orderForPayment.request_id}`
                : `order-${orderForPayment.id}`;
            const fileName = `${user.id}-${identifier}-${Date.now()}.${fileExt}`;
            const filePath = `public/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('receipts')
                .upload(filePath, receiptFile);

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('receipts')
                .getPublicUrl(filePath);
            
            if (!urlData || !urlData.publicUrl) throw new Error('Could not retrieve receipt URL.');
            
            uploadedReceiptUrl = urlData.publicUrl;

            let total = parseFloat(orderForPayment.total || 0);
            let newAmountPaid = amountToRecord;
            let remaining = 0;

            if (orderForPayment.isRequest) {
                // Existing behaviour for requests: store amount_paid in request.data
                const { data: currentRequest, error: fetchErr } = await supabase
                    .from('requests')
                    .select('data, final_price')
                    .eq('id', orderForPayment.request_id)
                    .single();
                if (fetchErr) throw fetchErr;

                const existingData = typeof currentRequest?.data === 'string'
                    ? JSON.parse(currentRequest.data || '{}')
                    : (currentRequest?.data || {});
                const previousAmountPaid = parseFloat(existingData.amount_paid || 0);
                total = parseFloat(currentRequest?.final_price || orderForPayment.total || 0);
                newAmountPaid = previousAmountPaid + amountToRecord;
                remaining = total - newAmountPaid;

                const updatedData = { ...existingData, amount_paid: newAmountPaid };

                const { error: updateError } = await supabase
                    .from('requests')
                    .update({
                        status: 'accepted',
                        payment_status: 'waiting_for_confirmation',
                        receipt_url: uploadedReceiptUrl,
                        data: updatedData,
                    })
                    .eq('id', orderForPayment.request_id);

                if (updateError) throw updateError;
            } else {
                // New behaviour for regular ecommerce orders paid via GCash
                const { data: currentOrder, error: fetchErr } = await supabase
                    .from('orders')
                    .select('amount_paid, total')
                    .eq('id', orderForPayment.id)
                    .single();
                if (fetchErr) throw fetchErr;

                const previousAmountPaid = parseFloat(currentOrder?.amount_paid || 0);
                total = parseFloat(currentOrder?.total || orderForPayment.total || 0);
                newAmountPaid = previousAmountPaid + amountToRecord;
                remaining = total - newAmountPaid;

                const { error: updateError } = await supabase
                    .from('orders')
                    .update({
                        amount_paid: newAmountPaid,
                        payment_status: 'waiting_for_confirmation',
                        receipt_url: uploadedReceiptUrl,
                    })
                    .eq('id', orderForPayment.id);

                if (updateError) throw updateError;
            }

            const isFullyPaid = remaining <= 0;
            
            setShowQRModal(false);
            setOrderForPayment(null);
            setReceiptFile(null);
            setReceiptPreview(null);
            setAmountPaidForCurrentPayment(null);
            
            setModalContent({
                type: 'info',
                title: 'Payment Submitted',
                message: isFullyPaid
                    ? 'Your payment is now being confirmed. Thank you!'
                    : `We received ₱${amountToRecord.toLocaleString()}. Remaining balance: ₱${remaining.toLocaleString()}. You may pay the remaining amount from My Orders.`,
                confirmText: 'OK',
                onConfirm: () => {
                    loadOrders(user.id);
                    setModalContent(null);
                }
            });

        } catch (error) {
            console.error('Error confirming payment:', error);
            alert('There was an error submitting your payment. Please try again. ' + error.message);
        } finally {
            setIsProcessingPayment(false);
        }
    };

    useEffect(() => {
        const fetchProfile = async () => {
            if (user) {
                const { data, error } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', user.id)
                    .single();

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
        if (profileData) {
            setProfileForm({
                fullName: profileData.name || '',
                phone: formatPhoneNumber(profileData.phone || ''),
                dateOfBirth: profileData.birthdate || '',
            });
        }
    }, [profileData]); // Re-run when profileData changes

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
            const transformedOrders = (apiOrders || []).map(order => ({
                id: order.id,
                order_number: order.order_number,
                date: order.created_at,
                status: order.status, // pending, accepted, processing, etc.
                payment_status: order.payment_status,
                payment_method: order.payment_method,
                delivery_method: order.delivery_method,
                total: parseFloat(order.total || 0),
                amount_paid: parseFloat(order.amount_paid || 0),
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
                image_url: order.request_image_url || null,
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
                photo: order.request_image_url
            }));
            
            // Transform API requests to match the expected format
            const transformedRequests = (apiRequests || []).map(request => {
                const requestData = typeof request.data === 'string' ? JSON.parse(request.data) : (request.data || {});
                const address = addressesData.find(addr => addr.id === requestData?.address_id) || null;
                const paymentStatus = request.payment_status ?? requestData?.payment_status ?? 'to_pay';
                const amountPaid = parseFloat(requestData?.amount_paid ?? request.amount_paid ?? 0);
                const total = parseFloat(request.final_price || request.estimated_price || 0);
                return {
                    id: `request-${request.id}`, // Prefix to avoid conflicts
                    request_id: request.id,
                    request_number: request.request_number,
                    date: request.created_at,
                    status: request.status === 'accepted' ? 'processing' : request.status, // Map accepted to processing for display
                    type: request.type, // booking, customized, special_order
                    payment_status: paymentStatus,
                    payment_method: requestData?.payment_method || request.payment_method,
                    amount_paid: amountPaid,
                    total,
                    notes: request.notes || requestData.notes,
                    data: requestData,
                    image_url: request.image_url,
                    isRequest: true,
                    address: address, // Attach the fetched address
                    // Extract specific fields for easier access
                    eventType: requestData?.eventType || requestData?.event_type || requestData?.occasion,
                    eventDate: requestData?.eventDate || requestData?.event_date,
                    venue: requestData?.venue,
                    recipientName: requestData?.recipientName || requestData?.recipient_name,
                    occasion: requestData?.occasion,
                    preferences: requestData?.preferences || requestData?.notes,
                    flower: requestData?.flower,
                    bundleSize: requestData?.bundleSize,
                    wrapper: requestData?.wrapper,
                    ribbon: requestData?.ribbon,
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
                    setAddresses(data);
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
                alert('Please fill in all required fields (Label, Name, Phone, Street, Barangay)');
                return;
            }
    
            const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
    
            if (userError || !currentUser) {
                alert('You must be logged in to save an address.');
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
                province: 'Zamboanga Del Sur',
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
                    alert('Failed to update address: ' + error.message);
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
                    alert('Failed to add address: ' + error.message);
                    return;
                    }
                setAddresses([...addresses, data]);
            }
    
            setShowAddressModal(false);
            setAddressForm({ label: '', name: user?.user_metadata?.name || user?.email || '', phone: user?.user_metadata?.phone || '', street: '', barangay: '' });
            setEditingAddress(null);
        };
    const handleDeleteAddress = async (id) => {
        if (!window.confirm('Are you sure you want to delete this address?')) return;

        const { error } = await supabase
            .from('addresses')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting address:', error);
            alert('Failed to delete address: ' + error.message);
            return;
        }
        setAddresses(addresses.filter(addr => addr.id !== id));
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
            alert('Failed to set default address: ' + updateError.message);
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
            alert('Failed to set default address: ' + error.message);
            return;
        }

        setAddresses(addresses.map(addr => (
            addr.id === id ? data : { ...addr, is_default: false }
        )));
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

    const filteredOrders = activeOrderTab === 'all'
        ? orders
        : orders.filter(o => o.status === activeOrderTab);

    const getStatusBadgeClass = (status) => {
        const classes = {
            pending: 'pending',
            processing: 'processing',
            to_pay: 'pending',
            ready_for_pickup: 'processing',
            out_for_delivery: 'shipped',
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
            out_for_delivery: 'Out for Delivery',
            claimed: 'Claimed',
            completed: 'Completed',
            cancelled: 'Cancelled'
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

    const handleCancelClick = (order) => {
        setOrderToCancel(order);
        setShowCancelModal(true);
    };

    const handleConfirmCancel = async () => {
        if (!orderToCancel) return;

        try {
            if (orderToCancel.type) { // It's a request (booking, special_order, customized)
                const { error } = await supabase
                    .from('requests')
                    .update({ status: 'cancelled' })
                    .eq('id', orderToCancel.request_id || orderToCancel.id); // Use request_id if available, else id

                if (error) {
                    console.error('Error cancelling request:', error);
                    alert('Failed to cancel request: ' + error.message);
                    return;
                }
            } else { // It's a regular order
                const { error } = await supabase
                    .from('orders')
                    .update({ status: 'cancelled' })
                    .eq('id', orderToCancel.id);

                if (error) {
                    console.error('Error cancelling order:', error);
                    alert('Failed to cancel order: ' + error.message);
                    return;
                }
            }

            // Create cancellation notification (this still uses localStorage for now, as per original code)
            const notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
            const orderTypeLabel = orderToCancel.type
                ? (orderToCancel.type === 'booking' ? 'Event Booking'
                    : orderToCancel.type === 'special_order' ? 'Special Order'
                        : orderToCancel.type === 'customized' ? 'Customized Bouquet'
                            : 'Request')
                : 'Order';
            const orderNumber = orderToCancel.order_number ? `#${orderToCancel.order_number}` : '';

            const newNotification = {
                id: `notif-${Date.now()}`,
                type: 'cancellation',
                title: `${orderTypeLabel} Cancelled`,
                message: `Your ${orderTypeLabel.toLowerCase()} ${orderNumber} has been cancelled successfully.`,
                icon: 'fa-times-circle',
                timestamp: new Date().toISOString(),
                read: false,
                link: '/profile'
            };
            localStorage.setItem('notifications', JSON.stringify([newNotification, ...notifications]));

            // Reload orders from Supabase
            loadOrders(user.id);
            setShowCancelModal(false);
            setOrderToCancel(null);
        } catch (error) {
            console.error('Error during cancellation:', error);
            alert('Failed to cancel. Please try again.');
        }
    };

    const getAmountDue = (order) => {
        const total = parseFloat(order?.total || 0);
        const paid = parseFloat(order?.amount_paid || 0);
        return Math.max(0, total - paid);
    };

    const getPayAmountForQRModal = () => {
        if (amountPaidForCurrentPayment != null) return amountPaidForCurrentPayment;
        return getAmountDue(orderForPayment);
    };

    const handleAcceptQuote = (order) => {
        setOrderForPayment(order);
        setAmountPaidForCurrentPayment(parseFloat(order?.total || 0));
        setShowQRModal(true);
        setModalContent(null);
    };

    const handlePayRemaining = (order) => {
        setOrderForPayment(order);
        setAmountPaidForCurrentPayment(getAmountDue(order));
        setShowQRModal(true);
    };

    const handleRequestAdjustment = (order) => {
        setModalContent({
            type: 'info',
            title: 'Request Price Adjustment',
            message: `To request an adjustment for request #${order.request_number}, please proceed to the "Messages" tab to chat with our staff.`,
            confirmText: 'Go to Messages',
            onConfirm: () => {
                setActiveMenu('messages');
                setModalContent(null);
            }
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
                                        {order.type === 'booking' && 'Event Booking'}
                                        {order.type === 'special_order' && 'Special Order'}
                                        {order.type === 'customized' && 'Customized Bouquet'}
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
                                                                                                    <div className="order-item-qty">x{item.qty || 1}</div>
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
                                    <div className="order-item">
                                        {order.image_url && (
                                            <img
                                                src={order.image_url}
                                                alt="Request preview"
                                                className="order-item-img customized-bouquet-img"
                                                onError={(e) => e.target.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}
                                            />
                                        )}
                                        <div className="flex-grow-1 order-request-details">
                                            {order.type === 'booking' && (
                                                <>
                                                    <div className="order-item-name">{order.eventType} Event</div>
                                                    {order.recipientName && <div className="order-item-variant"><strong>Recipient:</strong> {order.recipientName}</div>}
                                                    {order.eventDate && <div className="order-item-variant"><strong>Event Date:</strong> {new Date(order.eventDate).toLocaleDateString()}</div>}
                                                    {order.venue && <div className="order-item-variant"><strong>Venue:</strong> {order.venue}</div>}
                                                    {order.notes && <div className="order-item-variant"><strong>Notes:</strong> {order.notes}</div>}
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
                                                    <div className="order-item-name">Customized Bouquet</div>
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
                                    {order.status === 'quoted' ? (
                                        <div className="d-flex gap-2">
                                            <button className="btn-order-action" style={{backgroundColor: 'var(--shop-pink)', color: 'white', border: 'none'}} onClick={() => handleAcceptQuote(order)}>Accept</button>
                                            <button className="btn-order-action" style={{backgroundColor: 'transparent', color: 'var(--shop-pink)', border: '1px solid var(--shop-pink)'}} onClick={() => handleRequestAdjustment(order)}>Adjust</button>
                                            <button className="btn-order-action" style={{backgroundColor: '#dc3545', color: 'white', border: '1px solid #dc3545'}} onClick={() => handleCancelClick(order)}>Cancel</button>
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
                                            
                                            {/* Pay remaining: only after admin has verified GCash and entered an insufficient amount (amount_paid > 0) */}
                                            {(
                                                (order.isRequest && order.type && ['processing'].includes(order.status)) ||
                                                (!order.isRequest && order.payment_method === 'gcash' && ['pending', 'processing'].includes(order.status))
                                            ) && order.payment_status !== 'paid' && getAmountDue(order) > 0 && (parseFloat(order.amount_paid) || 0) > 0 && (
                                                <button
                                                    className="btn-order-action"
                                                    style={{ backgroundColor: 'var(--shop-pink)', color: 'white', border: 'none' }}
                                                    onClick={() => handlePayRemaining(order)}
                                                >
                                                    Pay remaining ₱{getAmountDue(order).toLocaleString()}
                                                </button>
                                            )}
                                            {/* TRACK BUTTONS */}
                                            {['pending', 'processing', 'out_for_delivery', 'ready_for_pickup'].includes(order.status) && (
                                                order.type ? ( // It's a Request
                                                    <button
                                                        className="btn-order-action primary"
                                                        onClick={() => navigate(
                                                            order.type === 'customized'
                                                                ? `/customized-request-tracking/${order.request_number}`
                                                                : `/request-tracking/${order.request_number}`
                                                        )}
                                                    >
                                                        Track Request
                                                    </button>
                                                ) : ( // It's a regular Order
                                                    <button
                                                        className="btn-order-action primary"
                                                        onClick={() => navigate(`/order-tracking/${order.order_number}`)}
                                                    >
                                                        Track Order
                                                    </button>
                                                )
                                            )}

                                            {/* CANCEL BUTTON */}
                                            {order.status === 'pending' && (
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
                            name: user?.user_metadata?.name || '', // Use user_metadata
                            phone: formatPhoneNumber(user?.user_metadata?.phone || ''), // Use user_metadata
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
                    <div className="address-detail mt-2">{`${addr.street}, ${addr.barangay}, ${addr.city}, ${addr.province}`}</div>
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

        try {
            // Update the public 'users' table
            const { error: profileError } = await supabase
                .from('users')
                .update({ 
                    name: profileForm.fullName, 
                    phone: profileForm.phone,
                    birthdate: profileForm.dateOfBirth,
                })
                .eq('id', user.id);

            if (profileError) {
                throw profileError;
            }

            // Also update the user_metadata in auth.users to keep it in sync
            // This is what the rest of the app seems to use
            const { error: authError } = await supabase.auth.updateUser({
                data: {
                    name: profileForm.fullName,
                    phone: profileForm.phone,
                },
            });

            if (authError) {
                throw authError;
            }

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

    const renderSettingsContent = () => (
        <>
            <h5 className="fw-bold mb-4">Account Settings</h5>
            {status && (
                <div className={`alert ${status.type === 'success' ? 'alert-success' : 'alert-danger'}`}>
                    {status.message}
                </div>
            )}
            <form onSubmit={handleProfileUpdate}>
                <div className="row">
                    <div className="col-md-6 mb-3">
                        <label className="form-label">Full Name</label>
                        <input 
                            type="text" 
                            className="form-control" 
                            name="fullName"
                            value={profileForm.fullName}
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
                            placeholder="09171234567"
                        />
                        <div className="form-text">Use format +639171234567 or 09171234567.</div>
                    </div>
                    <div className="col-md-6 mb-3">
                        <label className="form-label">Date of Birth</label>
                        <input 
                            type="date" 
                            className="form-control" 
                            name="dateOfBirth"
                            value={profileForm.dateOfBirth}
                            onChange={handleProfileFormChange} 
                        />
                    </div>
                </div>

                <hr className="my-4" />

                <h6 className="fw-bold mb-3">Change Password</h6>
                <div className="row">
                    <div className="col-md-6 mb-3">
                        <label className="form-label">Current Password</label>
                        <input type="password" className="form-control" />
                    </div>
                    <div className="col-md-6 mb-3">
                        <label className="form-label">New Password</label>
                        <input type="password" className="form-control" />
                    </div>
                </div>

                <button type="submit" className="btn mt-3" style={{ background: 'var(--shop-pink)', color: 'white' }}>
                    Save Changes
                </button>
            </form>
        </>
    );

    const renderMessagesContent = () => {
        // Check for complete profile from the fetched profile data
        const isProfileComplete = profileData && profileData.name && profileData.phone;
    
        if (!isProfileComplete) {
            return (
                <div className="text-center p-5">
                    <i className="fas fa-user-edit fa-3x text-muted mb-3"></i>
                    <h5 className="fw-bold">Complete Your Profile</h5>
                    <p className="text-muted">Please complete your profile setup in the "Account Settings" tab before you can send messages.</p>
                    <button
                        className="btn mt-3"
                        style={{ background: 'var(--shop-pink)', color: 'white' }}
                        onClick={() => setActiveMenu('settings')}
                    >
                        Go to Account Settings
                    </button>
                </div>
            );
        }
    
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
                                                setActiveMenu(item.id);
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
                                    className="form-control-custom"
                                    value={addressForm.phone}
                                    onChange={e => setAddressForm({ ...addressForm, phone: formatPhoneNumber(e.target.value) })}
                                />
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
                            <p style={{whiteSpace: 'pre-wrap'}}>{modalContent.message}</p>
                        </div>
                        <div className="modal-footer-custom" style={{justifyContent: 'flex-end'}}>
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

            {showQRModal && orderForPayment && (
                <div className="modal-overlay" onClick={() => !isProcessingPayment && setShowQRModal(false)}>
                    <div className="modal-content-custom" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header-custom">
                            <h4>GCash Payment</h4>
                            <button className="modal-close" disabled={isProcessingPayment} onClick={() => setShowQRModal(false)}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="modal-body-custom text-center">
                            <p>Please scan the QR code to pay for request #{orderForPayment.request_number}.</p>
                            <div className="mb-3">
                                <img 
                                    src={qrCodeImage} 
                                    alt="GCash QR Code" 
                                    style={{ width: '100%', height: 'auto', maxWidth: '250px', margin: '0 auto', borderRadius: '10px' }} 
                                />
                            </div>
                            <div className="p-3 rounded mb-3" style={{ background: '#f8f9fa' }}>
                                <h6 className="fw-bold mb-2">Payment Instructions:</h6>
                                <ol className="text-start small" style={{ paddingLeft: '20px' }}>
                                    <li>Open your GCash app and tap "Scan QR".</li>
                                    <li>Scan this QR code.</li>
                                    <li>Enter the amount: <strong>₱{getPayAmountForQRModal().toLocaleString()}</strong></li>
                                    <li>Complete the payment and take a screenshot.</li>
                                    <li>Upload the screenshot below for confirmation.</li>
                                </ol>
                            </div>

                            <div className="mt-3">
                                <label className="form-label fw-bold small">
                                    <i className="fas fa-receipt me-2" style={{ color: 'var(--shop-pink)' }}></i>
                                    Upload Payment Receipt
                                </label>
                                <input
                                    type="file"
                                    className="form-control form-control-sm"
                                    accept="image/*"
                                    onChange={handleReceiptUpload}
                                    disabled={isProcessingPayment}
                                />
                                {receiptPreview && (
                                    <div className="mt-2">
                                        <img src={receiptPreview} alt="Receipt Preview" style={{ maxWidth: '100px', maxHeight: '100px', borderRadius: '8px' }} />
                                    </div>
                                )}
                            </div>

                            <button
                                className="btn w-100 mt-3"
                                style={{ background: 'var(--shop-pink)', color: 'white' }}
                                onClick={handleConfirmPayment}
                                disabled={isProcessingPayment || !receiptFile}
                            >
                                {isProcessingPayment ? (
                                    <>
                                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                        Submitting...
                                    </>
                                ) : 'Submit for Confirmation'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Profile;

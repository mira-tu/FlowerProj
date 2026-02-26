import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Switch,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { adminAPI, BASE_URL } from '../../../config/api';
import { supabase } from '../../../config/supabase';
import styles from '../../AdminDashboard.styles';
import { formatTimestamp, getPaymentStatusDisplay, getStatusLabel } from '../adminHelpers';
import PaymentDetailsSection from '../components/PaymentDetailsSection';
import { generateAndShareReceipt } from '../../../utils/receiptGenerator';

const OrdersTab = ({ setActiveTab, handleSelectCustomerForMessage }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('All');

  // State for Modals
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [orderToUpdate, setOrderToUpdate] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [selectedReceiptUrl, setSelectedReceiptUrl] = useState(null);
  const [declineModalVisible, setDeclineModalVisible] = useState(false);
  const [orderToDecline, setOrderToDecline] = useState(null);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [orderToRecordPayment, setOrderToRecordPayment] = useState(null);
  const [isEditPaymentMode, setIsEditPaymentMode] = useState(false);

  // New state for rider assignment
  const [riders, setRiders] = useState([]);
  const [assignRiderModalVisible, setAssignRiderModalVisible] = useState(false);
  const [selectedRider, setSelectedRider] = useState(null);
  const [orderToAssignRider, setOrderToAssignRider] = useState(null);
  const [riderSearchQuery, setRiderSearchQuery] = useState('');
  const [riderSortOption, setRiderSortOption] = useState('name_asc');

  // Third party rider state
  const [isThirdParty, setIsThirdParty] = useState(false);
  const [thirdPartyName, setThirdPartyName] = useState('');
  const [thirdPartyInfo, setThirdPartyInfo] = useState('');

  const filteredAndSortedRiders = React.useMemo(() => {
    let result = riders;

    // Filtering
    if (riderSearchQuery) {
      result = result.filter(rider =>
        rider.name.toLowerCase().includes(riderSearchQuery.toLowerCase()) ||
        rider.email.toLowerCase().includes(riderSearchQuery.toLowerCase())
      );
    }

    // Sorting
    if (riderSortOption === 'name_asc') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (riderSortOption === 'name_desc') {
      result.sort((a, b) => b.name.localeCompare(a.name));
    }

    return result;
  }, [riders, riderSearchQuery, riderSortOption]);

  const ordersWithRiderDetails = React.useMemo(() => {
    if (!orders.length || !riders.length) {
      return orders;
    }
    return orders.map(order => {
      if (order.assigned_rider) {
        const riderDetails = riders.find(r => r.id === order.assigned_rider);
        return { ...order, rider: riderDetails || null };
      }
      return order;
    });
  }, [orders, riders]);

  // Filter wrapper
  const filteredOrders = React.useMemo(() => {
    let result = ordersWithRiderDetails;
    if (statusFilter !== 'All') {
      result = result.filter(order => {
        const status = order.status;
        switch (statusFilter) {
          case 'Pending': return status === 'pending';
          case 'Processing': return status === 'processing' || status === 'accepted' || status === 'partial';
          case 'To Deliver': return status === 'out_for_delivery';
          case 'To Pick Up': return status === 'ready_for_pickup';
          case 'Completed': return status === 'completed' || status === 'claimed';
          case 'Cancelled': return status === 'cancelled';
          default: return true;
        }
      });
    }
    return result;
  }, [ordersWithRiderDetails, statusFilter]);

  const orderStatusFilters = ['All', 'Pending', 'Processing', 'To Deliver', 'To Pick Up', 'Completed', 'Cancelled'];

  const statusOptions = ['pending', 'processing', 'out_for_delivery', 'ready_for_pickup', 'claimed', 'completed', 'cancelled'];

  const deliveryStepperStatuses = [
    { id: 'pending', label: 'Pending', description: 'Order received' },
    { id: 'processing', label: 'Processing', description: 'Being prepared' },
    { id: 'out_for_delivery', label: 'Out for Delivery', description: 'On the way' },
    { id: 'completed', label: 'Completed', description: 'Delivered successfully' }
  ];

  const pickupStepperStatuses = [
    { id: 'pending', label: 'Pending', description: 'Order received' },
    { id: 'processing', label: 'Processing', description: 'Being prepared' },
    { id: 'ready_for_pickup', label: 'Ready for Pick Up', description: 'Ready for customer' },
    { id: 'claimed', label: 'Claimed', description: 'Customer picked up the order' }
  ];

  const openReceiptModal = (url) => {
    const finalUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
    setSelectedReceiptUrl(finalUrl);
    setReceiptModalVisible(true);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadOrders();
      loadRiders();

      const channel = supabase
        .channel('public:orders')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders' },
          (payload) => {
            loadOrders();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }, [])
  );

  const loadOrders = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getAllOrders();
      const sortedOrders = (response.data || []).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      setOrders(sortedOrders);
    } catch (error) {
      console.error('Error loading orders:', error);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const sendStatusEmail = async (order, status) => {
    try {
      const { error } = await supabase.functions.invoke('send-status-email', {
        body: {
          order_number: order.order_number,
          user_email: order.customer_email || order.users?.email, // Fallback to user relation if needed
          status: status,
          customer_name: order.customer_name,
        },
      });
      if (error) console.error('Error sending email:', error);
    } catch (e) {
      console.error('Failed to invoke email function:', e);
    }
  };

  const loadRiders = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'employee');
      if (error) throw error;
      setRiders(data || []);
    } catch (error) {
      console.error('Error loading riders:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  const handleAccept = async (orderId) => {
    // Find the order in the current state
    const orderToAccept = orders.find(order => order.id === orderId);
    if (!orderToAccept) {
      Alert.alert('Error', 'Order not found.');
      return;
    }

    processAccept(orderToAccept);
  };

  const processAccept = async (orderToAccept) => {
    try {
      const orderId = orderToAccept.id;
      await adminAPI.acceptOrder(orderId, 'processing');

      // Update payment status appropriately
      let paymentStatus = orderToAccept.payment_status;
      if (orderToAccept.payment_method === 'cod') {
        paymentStatus = 'to_pay';
      } else if (orderToAccept.payment_method === 'gcash') {
        // If it's already 'paid', keep it. If not, make sure it's waiting for confirmation.
        if (paymentStatus !== 'paid' && paymentStatus !== 'partial') {
          paymentStatus = 'waiting_for_confirmation';
        }
      }

      await adminAPI.updateOrderPaymentStatus(orderId, paymentStatus);

      Toast.show({
        type: 'success',
        text1: 'Order Accepted',
        text2: 'Use "Change Status → Proceed" to start processing.',
      });

      // Send email notification
      await sendStatusEmail(orderToAccept, 'processing');

      await loadOrders();
    } catch (error) {
      console.error('Error accepting order or updating payment status:', error);
      Alert.alert('Error', 'Failed to accept order or update payment status');
    }
  };

  const handleDecline = (order) => {
    setOrderToDecline(order);
    setDeclineModalVisible(true);
  };

  const confirmDecline = async () => {
    if (!orderToDecline) return;
    try {
      await adminAPI.declineOrder(orderToDecline.id, 'cancelled');
      Toast.show({ type: 'success', text1: 'Order Declined' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Decline Failed' });
    } finally {
      setDeclineModalVisible(false);
      setOrderToDecline(null);
      await loadOrders();
    }
  };


  const openStatusModal = (order) => {
    setOrderToUpdate(order);
    const nextStatus = getNextStatus(order.status, order.delivery_method);
    if (nextStatus) {
      setSelectedStatus(nextStatus);
    } else {
      setSelectedStatus(order.status);
    }
    setStatusModalVisible(true);
  };

  const getNextStatus = (currentStatus, deliveryMethod) => {
    switch (currentStatus) {
      case 'accepted':
        return 'processing';
      case 'processing':
        return deliveryMethod === 'delivery' ? 'out_for_delivery' : 'ready_for_pickup';
      case 'out_for_delivery':
        return 'completed';
      case 'ready_for_pick_up':
      case 'ready_for_pickup':
        return 'claimed';
      default:
        return null;
    }
  };

  const handleProceedStatus = async (order) => {
    const nextStatus = getNextStatus(order.status, order.delivery_method);
    if (!nextStatus) return;

    try {
      await adminAPI.updateOrderStatus(order.id, nextStatus);

      // New logic: If order is completed and payment method is COD and payment is 'to_pay', mark as 'paid'
      if (nextStatus === 'completed' && order.payment_method === 'cod' && order.payment_status === 'to_pay') {
        await adminAPI.updateOrderPaymentStatus(order.id, 'paid');
        Toast.show({ type: 'success', text1: 'Order Completed & Paid' });
      } else if (nextStatus === 'claimed' && order.payment_method === 'cod' && order.payment_status === 'to_pay') {
        await adminAPI.updateOrderPaymentStatus(order.id, 'paid');
        Toast.show({ type: 'success', text1: 'Order Claimed & Paid' });
      } else {
        Toast.show({ type: 'success', text1: `Status Updated to ${getStatusLabel(nextStatus)}` });
      }

      // Send email if status is completed or claimed
      if (nextStatus === 'completed' || nextStatus === 'claimed') {
        await sendStatusEmail(order, nextStatus);
      }

      await loadOrders();
    } catch (error) {
      console.error('Error proceeding status:', error);
      Toast.show({ type: 'error', text1: 'Update Failed' });
    }
  };

  const confirmStatusChange = async () => {
    if (!orderToUpdate || !selectedStatus) return;
    const orderId = orderToUpdate.id;

    try {
      // Payment enforcement: If moving to Out for Delivery or Ready for Pickup, status must be paid if not COD
      const isMovingToDelivery = ['out_for_delivery', 'ready_for_pick_up', 'ready_for_pickup', 'completed', 'claimed'].includes(selectedStatus);
      const isNotPaid = orderToUpdate.payment_status !== 'paid';
      const isNotCOD = orderToUpdate.payment_method?.toLowerCase() !== 'cod';

      if (isMovingToDelivery && isNotPaid && isNotCOD) {
        Alert.alert(
          "Payment Required",
          "You cannot move this order to delivery/pickup until the payment is confirmed (except for COD orders)."
        );
        return;
      }

      await adminAPI.updateOrderStatus(orderId, selectedStatus);

      // COD: Auto-mark payment as paid on completion
      if (selectedStatus === 'completed' && orderToUpdate.payment_method === 'cod' && orderToUpdate.payment_status === 'to_pay') {
        await adminAPI.updateOrderPaymentStatus(orderId, 'paid');
        Toast.show({ type: 'success', text1: 'Order Completed and Payment Marked as Paid' });
      } else if (selectedStatus === 'claimed' && orderToUpdate.payment_method === 'cod' && orderToUpdate.payment_status === 'to_pay') {
        await adminAPI.updateOrderPaymentStatus(orderId, 'paid');
        Toast.show({ type: 'success', text1: 'Order Claimed & Paid' });
      } else if (selectedStatus === 'processing') {
        Toast.show({ type: 'success', text1: 'Now Processing', text2: 'You can now assign a rider for delivery.' });
      } else {
        Toast.show({ type: 'success', text1: `Status Updated to ${getStatusLabel(selectedStatus)}` });
      }

      // Send email on key milestones
      if (['processing', 'completed', 'claimed', 'out_for_delivery'].includes(selectedStatus)) {
        await sendStatusEmail(orderToUpdate, selectedStatus);
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Update Failed' });
    } finally {
      // Close modal FIRST, then refresh — prevents the loading flash reopening the modal
      setStatusModalVisible(false);
      setOrderToUpdate(null);
      setSelectedStatus(null);
      loadOrders();
    }
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'completed': return { backgroundColor: '#22C55E' };
      case 'claimed': return { backgroundColor: '#22C55E' };
      case 'ready_for_pickup': return { backgroundColor: '#6366F1' };
      case 'out_for_delivery': return { backgroundColor: '#8B5CF6' };
      case 'processing': return { backgroundColor: '#3B82F6' };
      case 'accepted': return { backgroundColor: '#0891B2' };
      case 'cancelled': return { backgroundColor: '#EF4444' };
      case 'pending': return { backgroundColor: '#F97316' };
      case 'partial': return { backgroundColor: '#F59E0B' };
      default: return { backgroundColor: '#6B7280' };
    }
  };

  const getProgressWidth = (status) => {
    const progress = {
      completed: '100%',
      claimed: '100%',
      ready_for_pickup: '75%',
      out_for_delivery: '75%',
      processing: '50%',
      accepted: '30%',
      pending: '15%',
      cancelled: '0%'
    };
    return progress[status] || '10%';
  };

  const getCustomerInitials = (name) => {
    if (!name) return '??';
    const names = name.trim().split(' ');
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const EnhancedOrderCard = ({ item, onMessageCustomer, onPhoneCall, onAssignRider, onUpdateStatus, openReceiptModal, onPrintReceipt }) => {
    return (
      <View style={styles.eoCard}>
        {/* Header */}
        <View style={styles.eoCardHeader}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.eoLabel}>Order ID</Text>
            <Text style={styles.eoOrderId}>#{item.order_number}</Text>
            <View style={[styles.eoDeliveryTypeBadge, { backgroundColor: item.delivery_method === 'delivery' ? '#3B82F6' : '#10B981' }]}>
              <Ionicons name={item.delivery_method === 'delivery' ? 'rocket-outline' : 'storefront-outline'} size={12} color="#fff" />
              <Text style={styles.eoDeliveryTypeBadgeText}>
                {item.delivery_method === 'delivery' ? 'Delivery' : 'Pick-up'}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={styles.eoDateBadge}>
              <Text style={styles.eoDateText}>{formatTimestamp(item.created_at)}</Text>
            </View>
            <View style={[styles.eoStatusBadge, getStatusStyle(item.status)]}>
              <Ionicons name="time-outline" size={14} color="#fff" />
              <Text style={styles.eoStatusText}>{getStatusLabel(item.status)}</Text>
            </View>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.eoProgressSection}>
          <View style={styles.eoProgressMeta}>
            <Text style={styles.eoProgressLabel}>Order Progress</Text>
            <Text style={styles.eoProgressLabel}>{getProgressWidth(item.status)}</Text>
          </View>
          <View style={styles.eoProgressBarBg}>
            <View style={[styles.eoProgressBarFill, getStatusStyle(item.status), { width: getProgressWidth(item.status) }]} />
          </View>
        </View>

        {/* Customer Info */}
        <View style={styles.eoSection}>
          <View style={styles.eoCustomerHeader}>
            <View style={styles.eoAvatarContainer}>
              <View style={styles.eoAvatar}>
                <Text style={styles.eoAvatarText}>{getCustomerInitials(item.customer_name)}</Text>
              </View>
              <View>
                <Text style={styles.eoLabel}>Customer</Text>
                <Text style={styles.eoCustomerName}>{item.customer_name}</Text>
              </View>
            </View>
            <View style={styles.eoActionButtons}>
              <TouchableOpacity
                style={{ backgroundColor: '#6B7280', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => onPrintReceipt(item)}
              >
                <Ionicons name="print" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.eoIconBtnGreen} onPress={() => onPhoneCall(item.customer_phone)}>
                <Ionicons name="call" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.eoIconBtnBlue}
                onPress={() => onMessageCustomer(item.users.id, item.users.name, item.users.email)}
              >
                <Ionicons name="chatbubble" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.eoContactInfo}>
            {item.customer_email && (
              <View style={styles.eoInfoRow}>
                <Ionicons name="mail" size={16} color="#9CA3AF" />
                <Text style={styles.eoInfoLabel}>Email:</Text>
                <Text style={styles.eoInfoTextBold}>{item.customer_email}</Text>
              </View>
            )}
            {item.customer_phone && item.customer_phone !== 'N/A' && (
              <View style={styles.eoInfoRow}>
                <Ionicons name="call" size={16} color="#9CA3AF" />
                <Text style={styles.eoInfoLabel}>Phone:</Text>
                <Text style={styles.eoInfoTextBold}>{item.customer_phone}</Text>
              </View>
            )}
            {item.delivery_method === 'pickup' && item.pickup_time && (
              <View style={styles.eoInfoRow}>
                <Ionicons name="time" size={16} color="#9CA3AF" />
                <Text style={styles.eoInfoLabel}>Pickup Time:</Text>
                <Text style={styles.eoInfoTextBold}>{item.pickup_time}</Text>
              </View>
            )}
            {item.shipping_address?.description && (
              <View style={styles.eoInfoRow}>
                <Ionicons name="location" size={16} color="#9CA3AF" />
                <Text style={styles.eoInfoLabel}>Address:</Text>
                <Text style={styles.eoInfoTextBold}>{item.shipping_address.description}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Items */}
        {item.items?.length > 0 && (
          <View style={styles.eoSection}>
            <View style={styles.eoSectionHeader}>
              <Ionicons name="archive" size={16} color="#6B7280" />
              <Text style={styles.eoSectionTitle}>Items ({item.items.length})</Text>
            </View>
            {item.items.map((orderItem, index) => (
              <View key={index} style={[styles.eoItemCard, index > 0 && { marginTop: 8 }]}>
                <View style={styles.eoItemImage}>
                  {orderItem.image_url ? (
                    <Image
                      source={{ uri: orderItem.image_url }}
                      style={{ width: '100%', height: '100%', resizeMode: 'contain' }}
                    />
                  ) : (
                    <Ionicons name="image-outline" size={24} color="#666" />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eoItemName}>{orderItem.name}</Text>
                  <Text style={styles.eoItemQuantity}>Quantity: {orderItem.quantity}</Text>
                  <Text style={styles.eoItemPrice}>₱{orderItem.price.toFixed(2)}</Text>
                </View>
              </View>
            ))}
            {item.special_instructions && (
              <View style={styles.eoInstructions}>
                <Text style={styles.eoInstructionsTitle}>Special Instructions:</Text>
                <Text style={styles.eoInstructionsText}>{item.special_instructions}</Text>
              </View>
            )}
          </View>
        )}

        {/* Assigned Rider Info */}
        {item.rider ? (
          <View style={styles.eoSection}>
            <View style={styles.eoSectionHeader}>
              <Ionicons name="bicycle-outline" size={16} color="#6B7280" />
              <Text style={styles.eoSectionTitle}>Assigned Rider</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <View style={[styles.eoPaymentStatus, { backgroundColor: '#3B82F6' }]}>
                <Text style={styles.eoPaymentStatusText}>{item.rider.name}</Text>
              </View>
            </View>
          </View>
        ) : item.third_party_rider_name ? (
          <View style={styles.eoSection}>
            <View style={styles.eoSectionHeader}>
              <Ionicons name="bicycle-outline" size={16} color="#6B7280" />
              <Text style={styles.eoSectionTitle}>Assigned Rider (Third Party)</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <View style={[styles.eoPaymentStatus, { backgroundColor: '#3B82F6' }]}>
                <Text style={styles.eoPaymentStatusText}>{item.third_party_rider_name}</Text>
              </View>
              {item.third_party_rider_info ? (
                <View style={[styles.eoPaymentStatus, { backgroundColor: '#6B7280' }]}>
                  <Text style={styles.eoPaymentStatusText}>{item.third_party_rider_info}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        <PaymentDetailsSection
          item={item}
          styles={styles}
          onRecordPay={() => {
            setOrderToRecordPayment(item);
            setPaymentAmount('');
            setIsEditPaymentMode(false);
            setPaymentModalVisible(true);
          }}
          onEditAmount={() => {
            setOrderToRecordPayment(item);
            setPaymentAmount(String(item.amount_received || ''));
            setIsEditPaymentMode(true);
            setPaymentModalVisible(true);
          }}
          onViewReceipt={(url) => openReceiptModal(url)}
          requireReceipt={false}
        />

        {/* Actions */}
        <View style={styles.eoFooter}>
          {item.status === 'pending' ? (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={[styles.eoMainBtn, { backgroundColor: '#22C55E', flex: 1 }]} onPress={() => handleAccept(item.id)}>
                <Text style={styles.eoMainBtnText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.eoMainBtn, { backgroundColor: '#EF4444', flex: 1 }]} onPress={() => handleDecline(item)}>
                <Text style={styles.eoMainBtnText}>Decline</Text>
              </TouchableOpacity>
            </View>
          ) : !['completed', 'cancelled'].includes(item.status) ? (
            <View>
              <TouchableOpacity
                style={[
                  styles.eoMainBtn,
                  { backgroundColor: item.payment_method?.toLowerCase() === 'gcash' && item.payment_status !== 'paid' ? '#9CA3AF' : '#3B82F6' }
                ]}
                disabled={item.payment_method?.toLowerCase() === 'gcash' && item.payment_status !== 'paid'}
                onPress={() => onUpdateStatus(item)}
              >
                <Ionicons name="git-network-outline" size={18} color="#fff" />
                <Text style={styles.eoMainBtnText}>Change Status</Text>
              </TouchableOpacity>
              {item.delivery_method === 'delivery' && item.status === 'processing' && (
                <TouchableOpacity style={[styles.eoMainBtn, { backgroundColor: '#10B981', marginTop: 10 }]} onPress={() => onAssignRider(item)}>
                  <Ionicons name="person-add-outline" size={18} color="#fff" />
                  <Text style={styles.eoMainBtnText}>Assign Rider</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  const handlePhoneCall = (phoneNumber) => {
    if (phoneNumber && phoneNumber !== 'N/A') {
      Linking.openURL(`tel:${phoneNumber}`);
    } else {
      Alert.alert('No Phone Number', 'This customer does not have a phone number on file.');
    }
  };

  const handleAssignRider = (order) => {
    setOrderToAssignRider(order);
    setSelectedRider(order.rider); // pre-select if already assigned
    // Reset third party state
    setIsThirdParty(!!order.third_party_rider_name);
    setThirdPartyName(order.third_party_rider_name || '');
    setThirdPartyInfo(order.third_party_rider_info || '');
    setAssignRiderModalVisible(true);
  };

  const handleMessageCustomer = (customerId, customerName, customerEmail) => {
    handleSelectCustomerForMessage({ id: customerId, name: customerName, email: customerEmail });
  };

  const handleConfirmAssignRider = async () => {
    if (!orderToAssignRider) return;
    if (!isThirdParty && !selectedRider) return;
    if (isThirdParty && !thirdPartyName) {
      Alert.alert('Error', 'Please enter rider name');
      return;
    }

    try {
      if (isThirdParty) {
        await adminAPI.assignRider(orderToAssignRider.id, null, thirdPartyName, thirdPartyInfo);
      } else {
        await adminAPI.assignRider(orderToAssignRider.id, selectedRider.id);
      }
      Toast.show({ type: 'success', text1: 'Rider Assigned' });
      setAssignRiderModalVisible(false);
      loadOrders();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Assignment Failed' });
    }
  };

  const handleConfirmPayment = async () => {
    if (!orderToRecordPayment || !paymentAmount) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount < 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid number');
      return;
    }

    try {
      // In edit mode: replace the existing amount. In add mode: accumulate.
      const newTotalReceived = isEditPaymentMode
        ? amount
        : (orderToRecordPayment.amount_received || 0) + amount;
      const newStatus = newTotalReceived >= orderToRecordPayment.total ? 'paid' : 'partial';

      const { error } = await supabase
        .from('orders')
        .update({
          amount_received: newTotalReceived,
          payment_status: newStatus
        })
        .eq('id', orderToRecordPayment.id);

      if (error) throw error;

      Toast.show({ type: 'success', text1: isEditPaymentMode ? 'Amount Updated' : 'Payment Recorded' });
      setPaymentModalVisible(false);
      setOrderToRecordPayment(null);
      setIsEditPaymentMode(false);
      loadOrders();
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to record payment' });
    }
  };

  const handleRejectBalanceReceipt = async (order) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ additional_receipts: [] })
        .eq('id', order.id);

      if (error) throw error;

      Toast.show({
        type: 'info',
        text1: 'Receipt Rejected',
        text2: 'Customer will be prompted to re-upload.',
      });
      loadOrders();
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to reject receipt' });
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
      </View>
    );
  }

  return (
    <View style={styles.eoContainer}>
      <Text style={styles.eoTitle}>Orders Management</Text>

      {/* Scrollable Status Filters */}
      <View style={{ marginBottom: 15 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
          {orderStatusFilters.map((filter) => (
            <TouchableOpacity
              key={filter}
              onPress={() => setStatusFilter(filter)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 20,
                backgroundColor: statusFilter === filter ? '#ec4899' : '#f9a8d4',
                borderWidth: statusFilter === filter ? 0 : 1,
                borderColor: '#ec4899',
              }}
            >
              <Text style={{
                color: statusFilter === filter ? '#fff' : '#be185d',
                fontWeight: '600',
                fontSize: 14,
              }}>
                {filter}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filteredOrders}
        renderItem={({ item }) => <EnhancedOrderCard
          item={item}
          onMessageCustomer={handleSelectCustomerForMessage}
          onPhoneCall={handlePhoneCall}
          onAssignRider={handleAssignRider}
          onUpdateStatus={openStatusModal}
          openReceiptModal={(url) => { setSelectedReceiptUrl(url); setReceiptModalVisible(true); }}
          onPrintReceipt={(item) => generateAndShareReceipt(item, false)}
        />}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ec4899']} />
        }
        ListEmptyComponent={
          <View style={{ marginTop: 50, alignItems: 'center' }}>
            <Text style={styles.emptyText}>No orders found</Text>
          </View>
        }
      />

      {/* Decline Confirmation Modal */}
      <Modal visible={declineModalVisible} animationType="fade" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm Decline</Text>
            <Text style={styles.modalText}>
              Are you sure you want to decline Order #{orderToDecline?.order_number}?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setDeclineModalVisible(false)}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.deleteButton]} onPress={confirmDecline}>
                <Text style={styles.buttonText}>Confirm Decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Assign Rider Modal */}
      <Modal visible={assignRiderModalVisible} animationType="fade" transparent>
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { maxHeight: '70%' }]}>
            <Text style={styles.modalTitle}>Assign Rider</Text>


            {/* Clean Search Bar */}
            {!isThirdParty && (
              <View style={styles.riderSearchContainer}>
                <Ionicons name="search" size={20} color="#999" style={styles.riderSearchIcon} />
                <TextInput
                  style={styles.riderSearchInput}
                  placeholder="Search riders..."
                  placeholderTextColor="#999"
                  value={riderSearchQuery}
                  onChangeText={setRiderSearchQuery}
                />
              </View>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '500' }}>Third Party Rider?</Text>
              <Switch
                trackColor={{ false: "#767577", true: "#81b0ff" }}
                thumbColor={isThirdParty ? "#f5dd4b" : "#f4f3f4"}
                ios_backgroundColor="#3e3e3e"
                onValueChange={setIsThirdParty}
                value={isThirdParty}
              />
            </View>

            {isThirdParty ? (
              <View style={{ gap: 10, marginVertical: 10 }}>
                <View>
                  <Text style={{ marginBottom: 5, fontWeight: '500' }}>Rider Name *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter rider name"
                    value={thirdPartyName}
                    onChangeText={setThirdPartyName}
                  />
                </View>
                <View>
                  <Text style={{ marginBottom: 5, fontWeight: '500' }}>Rider Info (Optional)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Plate number, contact, etc."
                    value={thirdPartyInfo}
                    onChangeText={setThirdPartyInfo}
                    multiline
                  />
                </View>
              </View>
            ) : (
              <FlatList
                data={filteredAndSortedRiders}
                renderItem={({ item: rider }) => (
                  <TouchableOpacity
                    style={styles.radioButtonContainer}
                    onPress={() => setSelectedRider(rider)}
                  >
                    <View style={[styles.radioButton, selectedRider?.id === rider.id && styles.radioButtonSelected]}>
                      {selectedRider?.id === rider.id && <View style={styles.radioButtonInner} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.riderName}>{rider.name}</Text>
                      <Text style={styles.riderEmail}>{rider.phone}</Text>
                    </View>
                  </TouchableOpacity>
                )}
                keyExtractor={(item) => item.id.toString()}
                ListEmptyComponent={<Text style={styles.emptyText}>No riders found.</Text>}
                style={{ marginVertical: 10 }}
              />
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => { setAssignRiderModalVisible(false); setRiderSearchQuery(''); }}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleConfirmAssignRider} disabled={(!isThirdParty && !selectedRider) || (isThirdParty && !thirdPartyName)}>
                <Text style={styles.buttonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Status Modal (Timeline UI) */}
      <Modal visible={statusModalVisible} transparent animationType="fade" onRequestClose={() => setStatusModalVisible(false)}>
        <View style={styles.statusModalBackdrop}>
          <View style={styles.timelineModalContainer}>
            <View style={styles.statusModalHeader}>
              <Text style={styles.statusModalTitle}>Change Order Status</Text>
            </View>

            <ScrollView contentContainerStyle={styles.timelineScrollView}>
              {orderToUpdate && <Text style={styles.timelineOrderNumber}>Order #{orderToUpdate.order_number}</Text>}
              {(() => {
                if (!orderToUpdate) return null;
                const isDelivery = orderToUpdate.delivery_method === 'delivery';
                const stepperStatuses = isDelivery ? deliveryStepperStatuses : pickupStepperStatuses;
                const getStepperIndex = (status) => stepperStatuses.findIndex(s => s.id === status);
                const selectedIndex = getStepperIndex(selectedStatus);
                const currentStatusIndex = getStepperIndex(orderToUpdate.status);

                return (
                  <>
                    {stepperStatuses.map((status, index) => {
                      const isSelected = selectedIndex === index;
                      const isPast = selectedIndex > index;
                      const isLast = index === stepperStatuses.length - 1;

                      return (
                        <View key={status.id} style={styles.timelineStepContainer}>
                          {/* Line */}
                          {!isLast && (
                            <View style={[
                              styles.timelineLine,
                              (isPast || isSelected) && styles.timelineLineActive
                            ]} />
                          )}
                          {/* Content */}
                          <TouchableOpacity
                            style={styles.timelineStep}
                            disabled={true}
                          >
                            <View style={styles.timelineIconContainer}>
                              <View style={[
                                styles.timelineCircle,
                                isPast && styles.timelineCirclePast,
                                isSelected && styles.timelineCircleSelected
                              ]}>
                                {isPast ? (
                                  <Ionicons name="checkmark" size={18} color="#fff" />
                                ) : (
                                  <Text style={[styles.timelineCircleText, isSelected && { color: '#fff' }]}>{index + 1}</Text>
                                )}
                              </View>
                            </View>
                            <View style={styles.timelineTextContainer}>
                              <Text style={[
                                styles.timelineLabel,
                                isPast && styles.timelineLabelPast,
                                isSelected && styles.timelineLabelSelected
                              ]}>
                                {status.label}
                              </Text>
                              <Text style={[
                                styles.timelineDescription,
                                isSelected && styles.timelineDescriptionSelected
                              ]}>
                                {status.description}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                    {/* Special Status Buttons */}
                    <View style={styles.timelineActions}>
                      <TouchableOpacity
                        onPress={() => setSelectedStatus('cancelled')}
                        style={[
                          styles.timelineCancelButton,
                          selectedStatus === 'cancelled' && styles.timelineCancelButtonSelected
                        ]}
                      >
                        <Ionicons name="close-circle-outline" size={16} color={selectedStatus === 'cancelled' ? '#fff' : '#EF4444'} />
                        <Text style={[
                          styles.timelineCancelButtonText,
                          selectedStatus === 'cancelled' && { color: '#fff' }
                        ]}>
                          Cancel Order
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                );
              })()}
            </ScrollView>

            <View style={styles.statusModalFooter}>
              <TouchableOpacity onPress={confirmStatusChange} style={styles.statusConfirmButton}>
                <Text style={styles.statusConfirmButtonText}>Proceed</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStatusModalVisible(false)} style={styles.statusCloseButton}>
                <Text style={styles.statusCloseButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Payment Recording Modal */}
      <Modal visible={paymentModalVisible} animationType="fade" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{isEditPaymentMode ? 'Edit Amount Received' : 'Record GCash Payment'}</Text>
            <View style={{ marginBottom: 15 }}>
              <Text style={{ marginBottom: 5 }}>Currently Received: ₱{orderToRecordPayment?.amount_received || 0}</Text>
              <Text style={{ marginBottom: 5 }}>Total Amount: ₱{orderToRecordPayment?.total || 0}</Text>
              <Text style={{ marginBottom: 10, fontWeight: 'bold', color: '#EF4444' }}>
                Balance: ₱{(orderToRecordPayment?.total || 0) - (orderToRecordPayment?.amount_received || 0)}
              </Text>
            </View>
            <Text style={{ marginBottom: 5, fontWeight: '500' }}>
              {isEditPaymentMode ? 'Correct Amount Received' : 'Enter Amount Received (New)'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              keyboardType="numeric"
              value={paymentAmount}
              onChangeText={setPaymentAmount}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setPaymentModalVisible(false)}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleConfirmPayment}>
                <Text style={styles.buttonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Receipt View Modal */}
      <Modal visible={receiptModalVisible} animationType="fade" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Payment Receipt</Text>
              <TouchableOpacity onPress={() => setReceiptModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <Image
              source={{ uri: selectedReceiptUrl }}
              style={styles.receiptImage}
              resizeMode="contain"
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};



export default OrdersTab;

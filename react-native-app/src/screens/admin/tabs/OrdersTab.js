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
import { groupDeliveryDestinations } from '../../../utils/deliveryDestinations';

const getNormalizedPaymentMethod = (paymentMethod) => String(paymentMethod || '').trim().toLowerCase();

const resolveAcceptedOrderPaymentStatus = (order) => {
  const paymentMethod = getNormalizedPaymentMethod(order?.payment_method);

  if (paymentMethod === 'cod') {
    return 'to_pay';
  }

  if (paymentMethod === 'gcash') {
    if (order?.payment_status === 'paid' || order?.payment_status === 'partial') {
      return order.payment_status;
    }
    return 'waiting_for_confirmation';
  }

  return order?.payment_status || null;
};

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
  const [selectedStopGroupKey, setSelectedStopGroupKey] = useState(null);
  const [stopRiderAssignments, setStopRiderAssignments] = useState({});

  const filteredAndSortedRiders = React.useMemo(() => {
    let result = [...riders];
    if (riderSearchQuery) {
      result = result.filter(rider =>
        rider.name.toLowerCase().includes(riderSearchQuery.toLowerCase()) ||
        rider.email.toLowerCase().includes(riderSearchQuery.toLowerCase())
      );
    }
    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [riders, riderSearchQuery]);

  const riderLookup = React.useMemo(
    () => Object.fromEntries(riders.map((rider) => [String(rider.id), rider])),
    [riders]
  );

  const getGroupedDestinations = React.useCallback(
    (order) => groupDeliveryDestinations(order?.multi_delivery_destinations || []),
    []
  );

  const getInitialStopRiderAssignments = React.useCallback((order) => {
    const groupedDestinations = getGroupedDestinations(order);
    const fallbackRiderId = order?.assigned_rider ? String(order.assigned_rider) : '';

    return Object.fromEntries(
      groupedDestinations.map((group) => [
        group.groupKey,
        group.assignedRiderIds?.[0] || fallbackRiderId || '',
      ])
    );
  }, [getGroupedDestinations]);

  const getAssignedRiderNamesForGroup = React.useCallback((group, order) => {
    const explicitRiderIds = Array.isArray(group?.assignedRiderIds) ? group.assignedRiderIds : [];
    const fallbackRiderId = explicitRiderIds.length
      ? null
      : (order?.assigned_rider ? String(order.assigned_rider) : null);
    const riderIds = explicitRiderIds.length ? explicitRiderIds : (fallbackRiderId ? [fallbackRiderId] : []);

    return riderIds
      .map((riderId) => riderLookup[String(riderId)]?.name)
      .filter(Boolean);
  }, [riderLookup]);

  const hasRequiredRiderAssignments = React.useCallback((order) => {
    const groupedDestinations = getGroupedDestinations(order);

    if (!groupedDestinations.length) {
      return Boolean(order?.rider || order?.assigned_rider);
    }

    return groupedDestinations.every((group) => {
      const assignedNames = getAssignedRiderNamesForGroup(group, order);
      return assignedNames.length > 0;
    });
  }, [getAssignedRiderNamesForGroup, getGroupedDestinations]);

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

    await processAccept(orderToAccept);
  };

  const processAccept = async (orderToAccept) => {
    try {
      const orderId = orderToAccept.id;
      await adminAPI.acceptOrder(orderId, 'processing');
      const paymentStatus = resolveAcceptedOrderPaymentStatus(orderToAccept);
      if (paymentStatus) {
        await adminAPI.updateOrderPaymentStatus(orderId, paymentStatus);
      }

      Toast.show({
        type: 'success',
        text1: 'Order Accepted',
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

    // Rider enforcement: If moving to out_for_delivery, must have a rider assigned
    if (nextStatus === 'out_for_delivery') {
      const hasRider = hasRequiredRiderAssignments(order);
      if (!hasRider) {
        Alert.alert(
          "Rider Required",
          "Please assign a rider to every delivery stop before moving this order to Out for Delivery."
        );
        return;
      }
    }

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
      // Rider enforcement: If moving to out_for_delivery, must have a rider assigned
      if (selectedStatus === 'out_for_delivery') {
        const hasRider = hasRequiredRiderAssignments(orderToUpdate);
        if (!hasRider) {
          Alert.alert(
            "Rider Required",
            "Please assign a rider to every delivery stop before moving this order to Out for Delivery."
          );
          return;
        }
      }

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
    const groupedDestinations = getGroupedDestinations(item);

    return (
      <View style={styles.eoCard}>
        {/* Header */}
        <View style={styles.eoCardHeader}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.eoLabel}>Order ID</Text>
            <Text style={styles.eoOrderId}>#{item.order_number}</Text>
            <View style={[styles.eoDeliveryTypeBadge, { backgroundColor: item.delivery_method === 'delivery' ? '#3B82F6' : '#10B981' }]}>
              <Ionicons name={item.delivery_method === 'delivery' ? 'rocket-outline' : 'business-outline'} size={12} color="#fff" />
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
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.eoLabel}>Customer</Text>
              <Text style={styles.eoCustomerName} numberOfLines={1}>{item.customer_name}</Text>
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
                onPress={() => onMessageCustomer(item.users?.id, item.users?.name, item.users?.email)}
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

        {groupedDestinations.length > 0 && (
          <View style={styles.eoSection}>
            <View style={styles.eoSectionHeader}>
              <Ionicons name="navigate-outline" size={16} color="#6B7280" />
              <Text style={styles.eoSectionTitle}>Delivery Stops ({groupedDestinations.length})</Text>
            </View>
            {groupedDestinations.map((destination, index) => {
              const assignedRiderNames = getAssignedRiderNamesForGroup(destination, item);

              return (
              <View key={destination.groupKey || `${destination.recipientName}-${index}`} style={[styles.eoItemCard, index > 0 && { marginTop: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eoItemName}>{destination.recipientName || `Stop ${index + 1}`}</Text>
                  {destination.recipientPhone ? (
                    <Text style={styles.eoItemQuantity}>Phone: {destination.recipientPhone}</Text>
                  ) : null}
                  {destination.addressText ? (
                    <Text style={styles.eoInfoTextBold}>{destination.addressText}</Text>
                  ) : null}
                  <Text style={[styles.eoItemQuantity, { marginTop: 6 }]}>
                    {destination.items.map((stopItem) => `${stopItem.itemName} #${stopItem.unitNumber}`).join(', ')}
                  </Text>
                  <View style={styles.eoStopAssignmentRow}>
                    <Ionicons name="bicycle-outline" size={14} color={assignedRiderNames.length ? '#2563EB' : '#F97316'} />
                    <Text style={[styles.eoStopAssignmentText, !assignedRiderNames.length && styles.eoStopAssignmentTextPending]}>
                      {assignedRiderNames.length ? assignedRiderNames.join(', ') : 'Rider not assigned yet'}
                    </Text>
                  </View>
                </View>
              </View>
            )})}
          </View>
        )}

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
        {item.rider && groupedDestinations.length === 0 ? (
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
                  <Text style={styles.eoMainBtnText}>{groupedDestinations.length > 0 ? 'Assign Stop Riders' : 'Assign Rider'}</Text>
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

  const closeAssignRiderModal = () => {
    setAssignRiderModalVisible(false);
    setOrderToAssignRider(null);
    setSelectedRider(null);
    setSelectedStopGroupKey(null);
    setStopRiderAssignments({});
    setRiderSearchQuery('');
  };

  const handleAssignRider = (order) => {
    const groupedDestinations = getGroupedDestinations(order);
    setOrderToAssignRider(order);
    setRiderSearchQuery('');
    if (groupedDestinations.length > 0) {
      const initialAssignments = getInitialStopRiderAssignments(order);
      const firstGroup = groupedDestinations[0] || null;
      const initialRiderId = firstGroup ? initialAssignments[firstGroup.groupKey] : '';

      setStopRiderAssignments(initialAssignments);
      setSelectedStopGroupKey(firstGroup?.groupKey || null);
      setSelectedRider(initialRiderId ? riderLookup[String(initialRiderId)] || null : null);
    } else {
      setStopRiderAssignments({});
      setSelectedStopGroupKey(null);
      setSelectedRider(order.rider || null);
    }
    setAssignRiderModalVisible(true);
  };

  const handleSelectStopGroup = (group) => {
    const riderId = stopRiderAssignments[group.groupKey] || '';
    setSelectedStopGroupKey(group.groupKey);
    setSelectedRider(riderId ? riderLookup[String(riderId)] || null : null);
  };

  const handleSelectRider = (rider) => {
    if (orderToAssignRider && getGroupedDestinations(orderToAssignRider).length > 0) {
      if (!selectedStopGroupKey) {
        return;
      }

      setStopRiderAssignments((currentAssignments) => ({
        ...currentAssignments,
        [selectedStopGroupKey]: rider.id,
      }));
    }

    setSelectedRider(rider);
  };

  const handleClearStopRider = () => {
    if (!selectedStopGroupKey) {
      return;
    }

    setStopRiderAssignments((currentAssignments) => ({
      ...currentAssignments,
      [selectedStopGroupKey]: '',
    }));
    setSelectedRider(null);
  };

  const handleMessageCustomer = (customerId, customerName, customerEmail) => {
    handleSelectCustomerForMessage({ id: customerId, name: customerName, email: customerEmail });
  };

  const handleConfirmAssignRider = async () => {
    if (!orderToAssignRider) return;

    try {
      const groupedDestinations = getGroupedDestinations(orderToAssignRider);

      if (groupedDestinations.length > 0) {
        const stopAssignments = groupedDestinations.map((group) => ({
          unitKeys: group.unitKeys,
          riderId: stopRiderAssignments[group.groupKey] || null,
        }));

        await adminAPI.assignOrderStopRiders(orderToAssignRider.id, stopAssignments);
        Toast.show({ type: 'success', text1: 'Delivery stop riders updated' });
      } else {
        if (!selectedRider) {
          Alert.alert('Error', 'Please select an employee rider.');
          return;
        }

        await adminAPI.assignRider(orderToAssignRider.id, selectedRider.id);
        Toast.show({ type: 'success', text1: 'Rider Assigned' });
      }

      closeAssignRiderModal();
      loadOrders();
    } catch (error) {
      console.error('Error assigning rider:', error);
      const errorMessage = error?.message || 'Failed to assign rider.';
      Toast.show({ type: 'error', text1: 'Assignment Failed', text2: errorMessage });
      Alert.alert('Assignment Failed', errorMessage);
    }
  };

  const sendReceiptEmail = async (order, amount_received) => {
    try {
      const { error } = await supabase.functions.invoke('send-receipt-email', {
        body: {
          order_number: order.order_number,
          user_email: order.customer_email || order.users?.email,
          customer_name: order.customer_name || order.users?.name,
          total: order.total || order.final_price,
          amount_received: amount_received,
          items: order.items || [],
          delivery_method: order.delivery_method,
          payment_method: order.payment_method,
          date: new Date().toISOString()
        },
      });
      if (error) console.error('Error sending receipt email:', error);
    } catch (e) {
      console.error('Failed to invoke receipt email function:', e);
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

      if (newStatus === 'paid' && orderToRecordPayment.payment_method?.toLowerCase() === 'gcash') {
        await sendReceiptEmail(orderToRecordPayment, newTotalReceived);
      }

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

  const assignableStopGroups = React.useMemo(
    () => (orderToAssignRider ? getGroupedDestinations(orderToAssignRider) : []),
    [getGroupedDestinations, orderToAssignRider]
  );

  const selectedStopGroup = React.useMemo(
    () => assignableStopGroups.find((group) => group.groupKey === selectedStopGroupKey) || assignableStopGroups[0] || null,
    [assignableStopGroups, selectedStopGroupKey]
  );

  const isStopAssignmentMode = assignableStopGroups.length > 0;

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>Loading orders...</Text>
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
          <View style={[styles.modalContent, styles.assignRiderModalContent]}>
            <Text style={styles.modalTitle}>{isStopAssignmentMode ? 'Assign Delivery Stop Riders' : 'Assign Rider'}</Text>
            <View style={styles.assignRiderModalBody}>
              {isStopAssignmentMode && (
                <>
                  <Text style={styles.stopAssignmentHelpText}>
                    Choose a delivery stop first, then select the employee rider for that stop.
                  </Text>

                  <ScrollView
                    style={styles.stopAssignmentList}
                    contentContainerStyle={styles.stopAssignmentListContent}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={assignableStopGroups.length > 3}
                  >
                    {assignableStopGroups.map((group, index) => {
                      const assignedNames = getAssignedRiderNamesForGroup({
                        ...group,
                        assignedRiderIds: stopRiderAssignments[group.groupKey]
                          ? [String(stopRiderAssignments[group.groupKey])]
                          : group.assignedRiderIds,
                      }, orderToAssignRider);
                      const isActive = selectedStopGroup?.groupKey === group.groupKey;

                      return (
                        <TouchableOpacity
                          key={group.groupKey || `${group.recipientName}-${index}`}
                          style={[styles.stopAssignmentRow, isActive && styles.stopAssignmentRowActive]}
                          onPress={() => handleSelectStopGroup(group)}
                          activeOpacity={0.9}
                        >
                          <View style={[styles.stopAssignmentIndicator, isActive && styles.stopAssignmentIndicatorActive]}>
                            {isActive ? <View style={styles.stopAssignmentIndicatorInner} /> : null}
                          </View>
                          <View style={styles.stopAssignmentRowContent}>
                            <Text style={styles.stopAssignmentRowTitle} numberOfLines={1}>
                              {`Stop ${index + 1} - ${group.recipientName || `Delivery stop ${index + 1}`}`}
                            </Text>
                            {group.addressText ? (
                              <Text style={styles.stopAssignmentRowSubtitle} numberOfLines={1}>
                                {group.addressText}
                              </Text>
                            ) : null}
                            <Text style={[styles.stopAssignmentRowMeta, !assignedNames.length && styles.stopAssignmentRowMetaPending]}>
                              {assignedNames.length ? `Rider: ${assignedNames.join(', ')}` : 'Rider: Not assigned'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              )}

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

              {isStopAssignmentMode && selectedStopGroup ? (
                <View style={styles.stopAssignmentSummary}>
                  <View style={styles.stopAssignmentSummaryHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.stopAssignmentSelectionLabel}>Selected stop</Text>
                      <Text style={styles.stopAssignmentSelectionTitle} numberOfLines={1}>
                        {selectedStopGroup.recipientName || 'Delivery stop'}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={handleClearStopRider}>
                      <Text style={styles.stopAssignmentClearText}>Clear</Text>
                    </TouchableOpacity>
                  </View>
                  {selectedStopGroup.addressText ? (
                    <Text style={styles.stopAssignmentSelectionAddress} numberOfLines={1}>
                      {selectedStopGroup.addressText}
                    </Text>
                  ) : null}
                  <Text
                    style={[
                      styles.stopAssignmentSummaryStatus,
                      !selectedRider && styles.stopAssignmentSummaryStatusPending,
                    ]}
                  >
                    {selectedRider
                      ? `Selected rider: ${selectedRider.name}`
                      : 'No rider selected'}
                  </Text>
                </View>
              ) : null}

              <FlatList
                data={filteredAndSortedRiders}
                renderItem={({ item: rider }) => (
                  <TouchableOpacity
                    style={styles.radioButtonContainer}
                    onPress={() => handleSelectRider(rider)}
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
                ListEmptyComponent={<Text style={styles.assignRiderEmptyText}>No riders found.</Text>}
                style={styles.assignRiderList}
                contentContainerStyle={styles.assignRiderListContent}
                keyboardShouldPersistTaps="handled"
              />
            </View>
            <View style={[styles.modalButtons, styles.assignRiderFooter]}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={closeAssignRiderModal}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleConfirmAssignRider}
                disabled={!selectedRider && !isStopAssignmentMode}
              >
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

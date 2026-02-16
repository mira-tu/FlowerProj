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

const OrdersTab = ({ setActiveTab, handleSelectCustomerForMessage }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // State for Modals
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [orderToUpdate, setOrderToUpdate] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [selectedReceiptUrl, setSelectedReceiptUrl] = useState(null);
  const [declineModalVisible, setDeclineModalVisible] = useState(false);
  const [orderToDecline, setOrderToDecline] = useState(null);

  // New state for rider assignment
  const [riders, setRiders] = useState([]);
  const [assignRiderModalVisible, setAssignRiderModalVisible] = useState(false);
  const [selectedRider, setSelectedRider] = useState(null);
  const [orderToAssignRider, setOrderToAssignRider] = useState(null);
  const [riderSearchQuery, setRiderSearchQuery] = useState('');
  const [riderSortOption, setRiderSortOption] = useState('name_asc');

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

  const statusOptions = ['pending', 'processing', 'out_for_delivery', 'ready_for_pick_up', 'claimed', 'completed', 'cancelled'];

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
      { id: 'completed', label: 'Completed', description: 'Picked up by customer' }
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
    try {
      // Find the order in the current state
      const orderToAccept = orders.find(order => order.id === orderId);
      if (!orderToAccept) {
        Alert.alert('Error', 'Order not found.');
        return;
      }

      await adminAPI.acceptOrder(orderId, 'processing');

      let paymentStatus = 'paid';
      if (orderToAccept.payment_method === 'cod') {
        paymentStatus = 'to_pay';
      }
      await adminAPI.updateOrderPaymentStatus(orderId, paymentStatus);

      Toast.show({ type: 'success', text1: `Order Accepted and Payment Marked as ${paymentStatus.replace('_', ' ')}` });
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
    setSelectedStatus(order.status);
    setStatusModalVisible(true);
  };

  const confirmStatusChange = async () => {
    if (!orderToUpdate || !selectedStatus) return;
    const orderId = orderToUpdate.id;
    
    try {
      await adminAPI.updateOrderStatus(orderId, selectedStatus);

      // New logic: If order is completed and payment method is COD and payment is 'to_pay', mark as 'paid'
      if (selectedStatus === 'completed' && orderToUpdate.payment_method === 'cod' && orderToUpdate.payment_status === 'to_pay') {
        await adminAPI.updateOrderPaymentStatus(orderId, 'paid');
        Toast.show({ type: 'success', text1: 'Order Completed and Payment Marked as Paid' });
      } else {
        Toast.show({ type: 'success', text1: 'Status Updated' });
      }

      await loadOrders();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Update Failed' });
    } finally {
      setStatusModalVisible(false);
      setOrderToUpdate(null);
      setSelectedStatus(null);
    }
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'completed': return { backgroundColor: '#22C55E' };
      case 'claimed': return { backgroundColor: '#22C55E' };
      case 'ready_for_pick_up': return { backgroundColor: '#6366F1' };
      case 'out_for_delivery': return { backgroundColor: '#8B5CF6' };
      case 'processing': return { backgroundColor: '#3B82F6' };
      case 'cancelled': return { backgroundColor: '#EF4444' };
      case 'pending': return { backgroundColor: '#F97316' };
      default: return { backgroundColor: '#6B7280' };
    }
  };
  
  const getProgressWidth = (status) => {
    const progress = {
      completed: '100%',
      ready_for_pickup: '75%',
      out_for_delivery: '75%',
      processing: '50%',
      pending: '25%',
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

  const EnhancedOrderCard = ({ item, onMessageCustomer, onPhoneCall, onAssignRider }) => (
    <View style={styles.eoCard}>
      {/* Header */}
      <View style={styles.eoCardHeader}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.eoLabel}>Order ID</Text>
          <Text style={styles.eoOrderId}>#{item.order_number}</Text>
          <View style={[styles.eoDeliveryTypeBadge, {backgroundColor: item.delivery_method === 'delivery' ? '#3B82F6' : '#10B981'}]}>
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
            <Ionicons name="time-outline" size={12} color="#fff" />
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
                <TouchableOpacity style={styles.eoIconBtnGreen} onPress={() => onPhoneCall(item.customer_phone)}>
                    <Ionicons name="call" size={16} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.eoIconBtnBlue}
                    onPress={() => onMessageCustomer(item.users.id, item.users.name, item.users.email)}
                >
                    <Ionicons name="chatbubble" size={16} color="#fff" />
                </TouchableOpacity>
            </View>
        </View>
        <View style={styles.eoContactInfo}>
            {item.customer_email && (<View style={styles.eoInfoRow}>
              <Ionicons name="mail" size={14} color="#9CA3AF" />
              <Text style={styles.eoInfoText}>{item.customer_email}</Text>
          </View>)}
          {item.delivery_method === 'pickup' && item.pickup_time && (
            <View style={styles.eoInfoRow}>
              <Ionicons name="time" size={14} color="#9CA3AF" />
              <Text style={styles.eoInfoText}>Pickup Time: {item.pickup_time}</Text>
            </View>
          )}
          {item.shipping_address?.description && (
            <View style={styles.eoInfoRow}>
                <Ionicons name="location" size={14} color="#9CA3AF" />
                <Text style={styles.eoInfoText}>{item.shipping_address.description}</Text>
            </View>
            )}
        </View>
      </View>

      {/* Items */}
      {item.items?.length > 0 && (
        <View style={styles.eoSection}>
            <View style={styles.eoSectionHeader}>
              <Ionicons name="archive" size={16} color="#6B7280"/>
              <Text style={styles.eoSectionTitle}>Items ({item.items.length})</Text>
            </View>
            {item.items.map((orderItem, index) => (
              <View key={index} style={[styles.eoItemCard, index > 0 && {marginTop: 8}]}>
                <View style={styles.eoItemImage}>
                  {orderItem.image_url ? (
                    <Image
                      source={{ uri: orderItem.image_url }}
                      style={{ width: '100%', height: '100%', resizeMode: 'contain' }}
                    />
                  ) : (
                    <Ionicons name="image-outline" size={24} color="#666" /> // Placeholder icon
                  )}
                </View>
                <View style={{flex: 1}}>
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
      {item.rider && (
        <View style={styles.eoSection}>
            <View style={styles.eoSectionHeader}>
              <Ionicons name="bicycle-outline" size={16} color="#6B7280"/>
              <Text style={styles.eoSectionTitle}>Assigned Rider</Text>
            </View>
            <View style={styles.eoFlexBetween}>
                <Text style={styles.eoDetailText}>Name:</Text>
                <Text style={styles.eoInfoTextBold}>{item.rider.name}</Text>
            </View>
        </View>
      )}
      
      {/* Payment */}
      <View style={styles.eoSection}>
        <View style={styles.eoSectionHeader}>
            <Ionicons name="card" size={16} color="#6B7280"/>
            <Text style={styles.eoSectionTitle}>Payment Details</Text>
        </View>
        <View style={{gap: 8}}>
            <View style={styles.eoFlexBetween}>
                <Text style={styles.eoDetailText}>Method</Text>
                <Text style={styles.eoInfoTextBold}>
                  {item.payment_method?.toLowerCase() === 'cod' ? 'Cash On Delivery' : getStatusLabel(item.payment_method) || 'Not specified'}
                </Text>
            </View>
            <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}>
                                            <View style={[styles.eoPaymentStatus, {backgroundColor: item.payment_status === 'paid' ? '#22C55E' : '#FFA726'}]}>
                                                <Text style={styles.eoPaymentStatusText}>{getPaymentStatusDisplay(item.payment_status, item.payment_method)}</Text>
                                            </View>                {item.payment_method?.toLowerCase() === 'gcash' && item.receipt_url && (
                    <TouchableOpacity onPress={() => openReceiptModal(item.receipt_url)}>
                        <Text style={styles.eoViewReceipt}>View Receipt</Text>
                    </TouchableOpacity>
                )}
            </View>
            <View style={styles.eoDivider}>
              <View style={styles.eoPriceRow}>
                <Text style={styles.eoDetailText}>Subtotal:</Text>
                <Text style={styles.eoDetailText}>₱{item.subtotal?.toFixed(2) || '0.00'}</Text>
              </View>
              {item.shipping_fee > 0 && (
                <View style={styles.eoPriceRow}>
                  <Text style={styles.eoDetailText}>Delivery Fee:</Text>
                  <Text style={styles.eoDetailText}>₱{item.shipping_fee.toFixed(2)}</Text>
                </View>
              )}
              <View style={[styles.eoPriceRow, {marginTop: 8}]}>
                <Text style={styles.eoTotalLabel}>Total:</Text>
                <Text style={styles.eoTotalValue}>₱{item.total}</Text>
              </View>
            </View>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.eoFooter}>
        {item.status === 'pending' ? (
            <View style={{flexDirection: 'row', gap: 12}}>
                <TouchableOpacity style={[styles.eoMainBtn, {backgroundColor: '#22C55E', flex: 1}]} onPress={() => handleAccept(item.id)}>
                    <Text style={styles.eoMainBtnText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.eoMainBtn, {backgroundColor: '#EF4444', flex: 1}]} onPress={() => handleDecline(item)}>
                    <Text style={styles.eoMainBtnText}>Decline</Text>
                </TouchableOpacity>
            </View>
        ) : (!['completed', 'cancelled'].includes(item.status) &&
          <View>
            <TouchableOpacity style={[styles.eoMainBtn, {backgroundColor: '#3B82F6'}]} onPress={() => openStatusModal(item)}>
                <Ionicons name="time" size={18} color="#fff" />
                <Text style={styles.eoMainBtnText}>Change Status</Text>
            </TouchableOpacity>
            {item.delivery_method === 'delivery' && item.status === 'processing' && (
              <TouchableOpacity style={[styles.eoMainBtn, {backgroundColor: '#10B981', marginTop: 10}]} onPress={() => onAssignRider(item)}>
                <Ionicons name="person-add-outline" size={18} color="#fff" />
                <Text style={styles.eoMainBtnText}>Assign Rider</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );

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
    setAssignRiderModalVisible(true);
  };

  const handleMessageCustomer = (customerId, customerName, customerEmail) => {
    handleSelectCustomerForMessage({ id: customerId, name: customerName, email: customerEmail });
  };

  const handleConfirmAssignRider = async () => {
    if (!orderToAssignRider || !selectedRider) return;
    try {
      await adminAPI.assignRider(orderToAssignRider.id, selectedRider.id);
      Toast.show({ type: 'success', text1: 'Rider Assigned' });
      setAssignRiderModalVisible(false);
      loadOrders();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Assignment Failed' });
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
      <FlatList
        data={ordersWithRiderDetails}
        renderItem={({item}) => <EnhancedOrderCard item={item} onMessageCustomer={handleMessageCustomer} onPhoneCall={handlePhoneCall} onAssignRider={handleAssignRider} />}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ec4899']} />
        }
        ListEmptyComponent={
          <View style={{marginTop: 50, alignItems: 'center'}}>
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
          <View style={[styles.modalContent, {maxHeight: '70%'}]}>
            <Text style={styles.modalTitle}>Assign Rider</Text>


            {/* Clean Search Bar */}
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
                  <View style={{flex: 1}}>
                    <Text style={styles.riderName}>{rider.name}</Text>
                    <Text style={styles.riderEmail}>{rider.phone}</Text>
                  </View>
                </TouchableOpacity>
              )}
              keyExtractor={(item) => item.id.toString()}
              ListEmptyComponent={<Text style={styles.emptyText}>No riders found.</Text>}
              style={{ marginVertical: 10 }}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => { setAssignRiderModalVisible(false); setRiderSearchQuery(''); }}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleConfirmAssignRider} disabled={!selectedRider}>
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
                                                  ]}/>
                                              )}
                                              {/* Content */}
                                              <TouchableOpacity
                                                onPress={() => setSelectedStatus(status.id)}
                                                style={styles.timelineStep}
                                                disabled={isPast}
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
                                                              <Text style={[styles.timelineCircleText, isSelected && {color: '#fff'}]}>{index + 1}</Text>
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
                          <Text style={styles.statusConfirmButtonText}>Confirm</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setStatusModalVisible(false)} style={styles.statusCloseButton}>
                          <Text style={styles.statusCloseButtonText}>Cancel</Text>
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

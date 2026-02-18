import React, { useState, useEffect } from 'react';
import {
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
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { adminAPI, BASE_URL } from '../../../config/api';
import { supabase } from '../../../config/supabase';
import styles from '../../AdminDashboard.styles';
import { formatTimestamp, getPaymentStatusDisplay, getStatusColor, getStatusLabel } from '../adminHelpers';

const DetailSection = ({ label, value }) => {
  if (!value) return null;
  return (
    <View style={styles.detailSection}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
};

const RequestsTab = ({ setActiveTab, handleSelectCustomerForMessage }) => {
  const getCustomerInitials = (name) => {
    if (!name) return '??';
    const names = name.trim().split(' ');
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const handlePhoneCall = (phoneNumber) => {
    if (phoneNumber && phoneNumber !== 'N/A' && phoneNumber.trim() !== '') {
      Linking.openURL(`tel:${phoneNumber}`);
    } else {
      Alert.alert('No Phone Number', 'This customer does not have a valid phone number on file.');
    }
  };

  const handleMessageCustomer = (user, customerName, customerEmail) => {
    if (!user || !user.id) {
      Alert.alert('Cannot message user', 'User information is incomplete.');
      return;
    }
    handleSelectCustomerForMessage({ id: user.id, name: customerName, email: customerEmail });
  };
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [requestStatusModalVisible, setRequestStatusModalVisible] = useState(false);
  const [requestToUpdate, setRequestToUpdate] = useState(null);
  const [selectedRequestStatus, setSelectedRequestStatus] = useState(null);
  const [deliveryOrPickup, setDeliveryOrPickup] = useState('delivery');
  const [quoteModalVisible, setQuoteModalVisible] = useState(false);
  const [requestToQuote, setRequestToQuote] = useState(null);
  const [quoteAmount, setQuoteAmount] = useState('');
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [selectedReceiptUrl, setSelectedReceiptUrl] = useState(null);

  // Payment Recording State
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [requestToRecordPayment, setRequestToRecordPayment] = useState(null);

  // New state for rider assignment
  const [riders, setRiders] = useState([]);
  const [assignRiderModalVisible, setAssignRiderModalVisible] = useState(false);
  const [selectedRider, setSelectedRider] = useState(null);
  const [requestToAssignRider, setRequestToAssignRider] = useState(null);
  const [riderSearchQuery, setRiderSearchQuery] = useState('');

  // Third party rider state
  const [isThirdParty, setIsThirdParty] = useState(false);
  const [thirdPartyName, setThirdPartyName] = useState('');
  const [thirdPartyInfo, setThirdPartyInfo] = useState('');

  const filteredAndSortedRiders = React.useMemo(() => {
    let result = riders;
    if (riderSearchQuery) {
      result = result.filter(rider =>
        rider.name.toLowerCase().includes(riderSearchQuery.toLowerCase()) ||
        (rider.email && rider.email.toLowerCase().includes(riderSearchQuery.toLowerCase()))
      );
    }
    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [riders, riderSearchQuery]);

  const loadRiders = async () => {
    try {
      const { data, error } = await supabase.from('users').select('*').eq('role', 'employee');
      if (error) throw error;
      setRiders(data || []);
    } catch (error) {
      console.error('Error loading riders:', error);
    }
  };

  const requestsWithRiderDetails = React.useMemo(() => {
    if (!requests.length || !riders.length) return requests;
    return requests.map(request => {
      if (request.assigned_rider) {
        const riderDetails = riders.find(r => r.id === request.assigned_rider);
        return { ...request, rider: riderDetails || null };
      }
      return request;
    });
  }, [requests, riders]);

  const requestDeliveryStepperStatuses = [
    { id: 'pending', label: 'Pending', description: 'Request received' },
    { id: 'processing', label: 'Processing', description: 'Being prepared' },
    { id: 'out_for_delivery', label: 'Out for Delivery', description: 'On the way' },
    { id: 'completed', label: 'Completed', description: 'Delivered successfully' }
  ];

  const requestPickupStepperStatuses = [
    { id: 'pending', label: 'Pending', description: 'Request received' },
    { id: 'processing', label: 'Processing', description: 'Being prepared' },
    { id: 'ready_for_pickup', label: 'Ready for Pick Up', description: 'Ready for customer' },
    { id: 'completed', label: 'Completed', description: 'Request has been picked up' }
  ];

  useFocusEffect(
    React.useCallback(() => {
      loadRequests();
      loadRiders();

      const channel = supabase
        .channel('public:requests')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'requests' },
          (payload) => {
            loadRequests();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }, [])
  );

  const openReceiptModal = (url) => {
    const finalUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
    setSelectedReceiptUrl(finalUrl);
    setReceiptModalVisible(true);
  };


  const renderPickupTimeSection = (request) => {
    if (request.delivery_method !== 'pickup' || !request.pickup_time) return null;
    return <DetailSection label="Pickup Time:" value={request.pickup_time} />;
  };

  const renderBookingDetails = (request) => (
    <>
      <DetailSection label="Request Number:" value={request.request_number} />
      <DetailSection label="Customer Name:" value={request.user_name} />
      <DetailSection label="Customer Email:" value={request.user_email} />
      <DetailSection label="Contact Number:" value={request.contact_number} />
      <DetailSection label="Occasion:" value={request.data?.occasion} />
      <DetailSection label="Event Date:" value={request.data?.event_date} />
      <DetailSection label="Venue:" value={request.data?.venue} />
      <DetailSection label="Additional Notes:" value={request.notes} />
      {renderPickupTimeSection(request)}
    </>
  );

  const renderSpecialOrderDetails = (request) => (
    <>
      <DetailSection label="Request Number:" value={request.request_number} />
      <DetailSection label="Customer Name:" value={request.user_name} />
      <DetailSection label="Customer Email:" value={request.user_email} />
      <DetailSection label="Contact Number:" value={request.contact_number} />
      <DetailSection label="Recipient Name:" value={request.data?.recipient_name} />
      <DetailSection label="Occasion:" value={request.data?.occasion} />
      <DetailSection label="Event Date:" value={request.data?.event_date} />
      <DetailSection label="Delivery Address:" value={request.data?.deliveryAddress} />
      <DetailSection label="Preferences:" value={request.notes} />
      <DetailSection label="Message for Card:" value={request.data?.message} />
      <DetailSection
        label="Add-ons:"
        value={
          request.data?.addons && request.data.addons.length
            ? request.data.addons.join(', ')
            : 'None'
        }
      />
      {renderPickupTimeSection(request)}
    </>
  );

  const renderCustomizedDetails = (request) => {
    // Attempt to parse data if it's a string
    let requestData = request.data;
    if (typeof requestData === 'string') {
      try {
        requestData = JSON.parse(requestData);
      } catch (e) {
        console.error("Failed to parse request.data:", e);
        requestData = {}; // Default to empty object on parse error
      }
    }

    const item = requestData?.items?.[0]; // Get the first item from the items array
    const flowersString = item?.flowers?.map(f => f.name).join(', ') || '';

    return (
      <>
        <Text style={styles.inputLabel}>Customer Email</Text>
        <TextInput style={styles.input} value={request.user_email} editable={false} />

        <Text style={styles.inputLabel}>Contact Number</Text>
        <TextInput style={styles.input} value={request.contact_number || request.user_phone} editable={false} />

        {item ? (
          <>
            <Text style={styles.inputLabel}>Quantity (Stems)</Text>
            <TextInput style={styles.input} value={item.bundleSize?.toString() || ''} editable={false} />

            <Text style={styles.inputLabel}>Flowers</Text>
            <TextInput style={styles.input} value={flowersString} editable={false} multiline />

            <Text style={styles.inputLabel}>Wrapper</Text>
            <TextInput style={styles.input} value={item.wrapper?.name || ''} editable={false} />

            <Text style={styles.inputLabel}>Ribbon</Text>
            <TextInput style={styles.input} value={item.ribbon?.name || ''} editable={false} />

            {item.image_url && (
              <>
                <Text style={styles.inputLabel}>Customized Bouquet Image</Text>
                <Image
                  source={{ uri: item.image_url }}
                  style={styles.fullImage}
                  resizeMode="contain"
                />
              </>
            )}
          </>
        ) : (
          // Fallback for old data structure or if items is empty
          <>
            <Text style={styles.inputLabel}>Quantity (Stems)</Text>
            <TextInput style={styles.input} value={requestData?.bundleSize?.toString()} editable={false} />
            <Text style={styles.inputLabel}>Flower Type</Text>
            <TextInput style={styles.input} value={requestData?.flower?.name} editable={false} />
            <Text style={styles.inputLabel}>Wrapper</Text>
            <TextInput style={styles.input} value={requestData?.wrapper?.name} editable={false} />
            <Text style={styles.inputLabel}>Ribbon</Text>
            <TextInput style={styles.input} value={requestData?.ribbon?.name} editable={false} />
          </>
        )}

        {request.final_price && (
          <>
            <Text style={styles.inputLabel}>Final Price</Text>
            <TextInput style={styles.input} value={`₱${request.final_price.toFixed(2)}`} editable={false} />
          </>
        )}
        {renderPickupTimeSection(request)}
      </>
    );
  };

  const loadRequests = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getAllRequests();
      const requests = (response.data.requests || []).map(req => {
        return {
          ...req,
          status: req.status === 'accepted' ? 'processing' : req.status, // Keep this transformation
        }
      });
      setRequests(requests);
    } catch (error) {
      console.error('Error loading requests:', error);
      Alert.alert('Error', 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };


  const onRefresh = async () => {
    setRefreshing(true);
    await loadRequests();
    setRefreshing(false);
  };

  const getNextRequestStatus = (currentStatus, deliveryMethod, type) => {
    // In this component, 'accepted' is often transformed to 'processing'
    const status = currentStatus === 'accepted' ? 'processing' : currentStatus;

    switch (status) {
      case 'pending':
        if (type === 'customized') return 'processing';
        return null; // booking/special need quote
      case 'processing':
        return deliveryMethod === 'pickup' ? 'ready_for_pickup' : 'out_for_delivery';
      case 'out_for_delivery':
      case 'ready_for_pickup':
        return 'completed';
      default:
        return null;
    }
  };

  const handleProceedRequestStatus = async (request) => {
    const nextStatus = getNextRequestStatus(request.status, request.delivery_method, request.type);
    if (!nextStatus) return;

    try {
      await adminAPI.updateRequestStatus(request.id, nextStatus);

      // New logic: If request is completed and payment method is COD and payment is 'to_pay', mark as 'paid'
      if (nextStatus === 'completed' && request.payment_method?.toLowerCase() === 'cod' && request.payment_status === 'to_pay') {
        await adminAPI.updateRequestPaymentStatus(request, 'paid');
        Toast.show({ type: 'success', text1: 'Request Completed & Paid' });
      } else {
        Toast.show({
          type: 'success',
          text1: 'Status Updated',
          text2: `Request #${request.request_number} is now ${getStatusLabel(nextStatus)}.`
        });
      }

      loadRequests();
    } catch (error) {
      console.error('Error proceeding request status:', error);
      Toast.show({ type: 'error', text1: 'Update Failed' });
    }
  };

  const handleDeclineRequest = async (request) => {
    Alert.alert(
      "Decline Request",
      `Are you sure you want to decline Request #${request.request_number}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: async () => {
            try {
              await adminAPI.updateRequestStatus(request.id, 'cancelled');
              Toast.show({ type: 'success', text1: 'Request Declined' });
              loadRequests();
            } catch (error) {
              Toast.show({ type: 'error', text1: 'Decline Failed' });
            }
          }
        }
      ]
    );
  };

  const openRequestStatusModal = (request) => {
    setRequestToUpdate(request);
    setSelectedRequestStatus(request.status); // Pre-select current status
    setDeliveryOrPickup(request.delivery_method || 'delivery'); // Initialize deliveryOrPickup
    setRequestStatusModalVisible(true);
  };

  const confirmRequestStatusChange = async () => {
    if (!requestToUpdate || !selectedRequestStatus) return;
    const requestId = requestToUpdate.id;
    setRequestStatusModalVisible(false); // Close modal immediately

    try {
      // Payment enforcement: If moving to Out for Delivery or Ready for Pickup/Completed, status must be paid if not COD
      const isMovingToDelivery = ['out_for_delivery', 'ready_for_pickup', 'ready_for_pick_up', 'completed'].includes(selectedRequestStatus);
      const isNotPaid = requestToUpdate.payment_status !== 'paid';
      const isNotCOD = requestToUpdate.payment_method?.toLowerCase() !== 'cod';

      if (isMovingToDelivery && isNotPaid && isNotCOD) {
        Alert.alert(
          "Payment Required",
          "You cannot move this request to delivery/pickup until the payment is confirmed (except for COD)."
        );
        return;
      }

      await adminAPI.updateRequestStatus(requestId, selectedRequestStatus);

      // New logic: If request is completed and payment method is COD and payment is 'to_pay', mark as 'paid'
      if (selectedRequestStatus === 'completed' && requestToUpdate.payment_method?.toLowerCase() === 'cod' && requestToUpdate.payment_status === 'to_pay') {
        await adminAPI.updateRequestPaymentStatus(requestToUpdate, 'paid');
        Toast.show({ type: 'success', text1: 'Request Completed and Payment Marked as Paid' });
      } else {
        Toast.show({
          type: 'success',
          text1: 'Status Updated',
          text2: `Request #${requestToUpdate.request_number} is now ${selectedRequestStatus.replace(/_/g, ' ')}.`
        });
      }
      setModalVisible(false);
      loadRequests();
    } catch (error) {
      console.error('Update request status error:', error);
      Toast.show({
        type: 'error',
        text1: 'Update Failed',
        text2: error.response?.data?.message || 'Failed to update request status'
      });
    } finally {
      setRequestToUpdate(null);
      setSelectedRequestStatus(null);
    }
  };

  const openQuoteModal = (request) => {
    setRequestToQuote(request);
    setQuoteAmount(request.final_price ? String(request.final_price) : '');
    setQuoteModalVisible(true);
  };

  const handleProvideQuote = async () => {
    if (!requestToQuote || !quoteAmount || isNaN(parseFloat(quoteAmount))) {
      Alert.alert('Invalid Input', 'Please enter a valid price.');
      return;
    }

    try {
      const { data: { request: updatedRequest } } = await adminAPI.provideQuote(requestToQuote.id, parseFloat(quoteAmount));

      // Create notification for the user
      if (updatedRequest) {
        const notificationData = {
          user_id: updatedRequest.user_id,
          type: 'quote',
          title: `Price Quote for Your Request`,
          message: `We've provided a quote of ₱${updatedRequest.final_price.toFixed(2)} for your request #${updatedRequest.request_number}. Please review and take action.`,
          link: `/profile` // Link to profile where they can see the request
        };
        await supabase.from('notifications').insert([notificationData]);
      }

      Toast.show({
        type: 'success',
        text1: 'Quote Provided',
        text2: `A quote of ₱${quoteAmount} has been sent for request #${requestToQuote.request_number}.`
      });
      setQuoteModalVisible(false);
      setModalVisible(false); // Close the main details modal too
      loadRequests(); // Refresh the list
    } catch (error) {
      console.error('Error providing quote:', error);
      Alert.alert('Error', 'Failed to provide quote.');
    }
  };

  const handleUpdatePaymentStatus = async (requestId, status) => {
    try {
      await adminAPI.updateRequestPaymentStatus(requestId, status);
      Toast.show({ type: 'success', text1: `Payment marked as ${status}` });
      loadRequests();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Payment status update failed' });
    }
  };

  const handleConfirmPayment = async () => {
    if (!requestToRecordPayment || !paymentAmount) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount < 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid number');
      return;
    }

    try {
      const currentReceived = requestToRecordPayment.amount_received || 0;
      const newTotalReceived = currentReceived + amount;
      const total = requestToRecordPayment.final_price || 0;
      const newStatus = newTotalReceived >= total ? 'paid' : 'partial';

      const { error } = await supabase
        .from('requests')
        .update({
          amount_received: newTotalReceived,
          payment_status: newStatus
        })
        .eq('id', requestToRecordPayment.id);

      if (error) throw error;

      Toast.show({ type: 'success', text1: 'Payment Recorded' });
      setPaymentModalVisible(false);

      // Update selectedRequest if it matches the updated request to reflect changes in the UI immediately
      if (selectedRequest && selectedRequest.id === requestToRecordPayment.id) {
        setSelectedRequest({
          ...selectedRequest,
          amount_received: newTotalReceived,
          payment_status: newStatus
        });
      }

      setRequestToRecordPayment(null);
      loadRequests();
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to record payment' });
    }
  };

  const openDetailsModal = (item) => {
    setSelectedRequest(item);
    setModalVisible(true);
  };

  const handleAssignRider = (request) => {
    setRequestToAssignRider(request);
    setSelectedRider(request.rider); // pre-select if already assigned
    // Reset third party state
    setIsThirdParty(!!request.third_party_rider_name);
    setThirdPartyName(request.third_party_rider_name || '');
    setThirdPartyInfo(request.third_party_rider_info || '');
    setAssignRiderModalVisible(true);
  };

  const handleConfirmAssignRider = async () => {
    if (!requestToAssignRider) return;
    if (!isThirdParty && !selectedRider) {
      Alert.alert('Error', 'Please select a rider or choose Third Party');
      return;
    }
    if (isThirdParty && !thirdPartyName) {
      Alert.alert('Error', 'Please enter rider name');
      return;
    }

    try {
      if (isThirdParty) {
        await adminAPI.assignRiderToRequest(requestToAssignRider.id, null, thirdPartyName, thirdPartyInfo);
      } else {
        await adminAPI.assignRiderToRequest(requestToAssignRider.id, selectedRider.id);
      }

      Toast.show({ type: 'success', text1: 'Rider Assigned' });
      setAssignRiderModalVisible(false);
      loadRequests(); // Refresh the list
    } catch (err) {
      console.error('Error assigning rider to request:', err);
      Toast.show({ type: 'error', text1: 'Assignment Failed', text2: err.message });
    }
  };

  const EnhancedRequestCard = ({ item, onMessageCustomer, onPhoneCall, openDetailsModal, openReceiptModal, handleUpdatePaymentStatus, onAssignRider, onUpdateStatus, onDecline }) => {
    return (
      <View style={styles.eoCard}>
        {/* Header */}
        <View style={styles.eoCardHeader}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.eoLabel}>Request Type</Text>
            <Text style={styles.eoOrderId}>{getStatusLabel(item.type)}</Text>
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
            <View style={[styles.eoStatusBadge, { backgroundColor: getStatusColor(item.status) }]}>
              <Ionicons name="time-outline" size={12} color="#fff" />
              <Text style={styles.eoStatusText}>{getStatusLabel(item.status)}</Text>
            </View>
          </View>
        </View>

        {/* Customer Info */}
        <View style={styles.eoSection}>
          <View style={styles.eoCustomerHeader}>
            <View style={styles.eoAvatarContainer}>
              <View style={styles.eoAvatar}>
                <Text style={styles.eoAvatarText}>{getCustomerInitials(item.user_name)}</Text>
              </View>
              <View>
                <Text style={styles.eoLabel}>Customer</Text>
                <Text style={styles.eoCustomerName}>{item.user_name}</Text>
              </View>
            </View>
            <View style={styles.eoActionButtons}>
              <TouchableOpacity style={styles.eoIconBtnGreen} onPress={(e) => { e.stopPropagation(); onPhoneCall(item.contact_number || item.user_phone); }}>
                <Ionicons name="call" size={16} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.eoIconBtnBlue}
                onPress={(e) => { e.stopPropagation(); onMessageCustomer(item.users, item.user_name, item.user_email); }}
              >
                <Ionicons name="chatbubble" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.eoContactInfo}>
            {item.user_email && (<View style={styles.eoInfoRow}>
              <Ionicons name="mail" size={14} color="#9CA3AF" />
              <Text style={styles.eoInfoText}>{item.user_email}</Text>
            </View>)}
            {item.contact_number && (
              <View style={styles.eoInfoRow}>
                <Ionicons name="call" size={14} color="#9CA3AF" />
                <Text style={styles.eoInfoText} numberOfLines={1}>{item.contact_number}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Request Number / Other details */}
        <View style={styles.eoSection}>
          <View style={styles.eoFlexBetween}>
            <Text style={styles.eoDetailText}>Request Number:</Text>
            <Text style={styles.eoInfoTextBold}>#{item.request_number}</Text>
          </View>
          {item.notes && (
            <View style={styles.eoInstructions}>
              <Text style={styles.eoInstructionsTitle}>Notes:</Text>
              <Text style={styles.eoInstructionsText}>{item.notes}</Text>
            </View>
          )}
        </View>

        {/* Request Image Preview */}
        {item.image_url && (
          <View style={styles.eoSection}>
            <Text style={styles.eoSectionTitle}>Attachment</Text>
            <Image
              source={{ uri: item.image_url.startsWith('http') ? item.image_url : `${BASE_URL}${item.image_url} ` }}
              style={{ width: '100%', height: 200, borderRadius: 8, marginTop: 10 }}
              resizeMode="contain"
            />
          </View>
        )}

        {/* Assigned Rider Info */}
        {item.rider ? (
          <View style={styles.eoSection}>
            <View style={styles.eoSectionHeader}>
              <Ionicons name="bicycle-outline" size={16} color="#6B7280" />
              <Text style={styles.eoSectionTitle}>Assigned Rider</Text>
            </View>
            <View style={styles.eoFlexBetween}>
              <Text style={styles.eoDetailText}>Name:</Text>
              <Text style={styles.eoInfoTextBold}>{item.rider.name}</Text>
            </View>
          </View>
        ) : item.third_party_rider_name ? (
          <View style={styles.eoSection}>
            <View style={styles.eoSectionHeader}>
              <Ionicons name="bicycle-outline" size={16} color="#6B7280" />
              <Text style={styles.eoSectionTitle}>Assigned Rider (Third Party)</Text>
            </View>
            <View style={styles.eoFlexBetween}>
              <Text style={styles.eoDetailText}>Name:</Text>
              <Text style={styles.eoInfoTextBold}>{item.third_party_rider_name}</Text>
            </View>
            {item.third_party_rider_info ? (
              <View style={styles.eoFlexBetween}>
                <Text style={styles.eoDetailText}>Info:</Text>
                <Text style={styles.eoInfoTextBold}>{item.third_party_rider_info}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Payment Details */}
        {(item.payment_status || item.final_price) && (
          <View style={styles.eoSection}>
            <View style={styles.eoSectionHeader}>
              <Ionicons name="card" size={16} color="#6B7280" />
              <Text style={styles.eoSectionTitle}>Payment Details</Text>
            </View>
            <View style={{ gap: 8 }}>
              <View style={styles.eoFlexBetween}>
                <Text style={styles.eoDetailText}>Method:</Text>
                <Text style={styles.eoInfoTextBold}>{getStatusLabel(item.payment_method || 'gcash')}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <View style={[styles.eoPaymentStatus, { backgroundColor: item.payment_status === 'paid' ? '#22C55E' : '#FFA726' }]}>
                  <Text style={styles.eoPaymentStatusText}>{getPaymentStatusDisplay(item.payment_status, item.payment_method)}</Text>
                </View>
                {(item.payment_method?.toLowerCase() === 'gcash' || !item.payment_method) && (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {item.receipt_url && (
                      <TouchableOpacity onPress={() => openReceiptModal(item.receipt_url)}>
                        <Text style={styles.eoViewReceipt}>Receipt 1</Text>
                      </TouchableOpacity>
                    )}
                    {item.additional_receipts && item.additional_receipts.map((receipt, idx) => (
                      <TouchableOpacity key={idx} onPress={() => openReceiptModal(receipt.url)}>
                        <Text style={styles.eoViewReceipt}>Receipt {idx + 2}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {(item.payment_method?.toLowerCase() === 'gcash' || !item.payment_method) && item.payment_status !== 'paid' && (
                  <TouchableOpacity
                    onPress={() => {
                      setRequestToRecordPayment(item);
                      setPaymentAmount('');
                      setPaymentModalVisible(true);
                    }}
                    style={{ marginLeft: 8, backgroundColor: '#3B82F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}
                  >
                    <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>Record Pay</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Pricing Summary */}
        {item.final_price && (
          <View style={styles.eoSection}>
            <View style={{ gap: 8 }}>
              <View style={styles.eoPriceRow}>
                <Text style={styles.eoDetailText}>Sub Total:</Text>
                <Text style={styles.eoDetailText}>₱{(item.data?.subtotal || (item.final_price - (item.shipping_fee || 0))).toFixed(2)}</Text>
              </View>
              {(item.amount_received > 0 || item.payment_method?.toLowerCase() === 'gcash' || !item.payment_method) && (
                <>
                  <View style={styles.eoPriceRow}>
                    <Text style={styles.eoDetailText}>Amount Received:</Text>
                    <Text style={[styles.eoDetailText, { color: '#22C55E' }]}>₱{(item.amount_received || 0).toLocaleString()}</Text>
                  </View>
                  <View style={styles.eoPriceRow}>
                    <Text style={styles.eoDetailText}>Balance:</Text>
                    <Text style={[styles.eoDetailText, { color: (item.final_price - (item.amount_received || 0)) > 0 ? '#EF4444' : '#6B7280' }]}>
                      ₱{(item.final_price - (item.amount_received || 0)).toLocaleString()}
                    </Text>
                  </View>
                </>
              )}
              <View style={styles.eoPriceRow}>
                <Text style={styles.eoDetailText}>Delivery Fee:</Text>
                <Text style={styles.eoDetailText}>₱{(item.shipping_fee || 0).toFixed(2)}</Text>
              </View>
              <View style={[styles.eoPriceRow, { marginTop: 8 }]}>
                <Text style={styles.eoTotalLabel}>Total:</Text>
                <Text style={styles.eoTotalValue}>₱{item.final_price.toFixed(2)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Action to open full details */}
        <View style={styles.eoFooter}>
          <TouchableOpacity style={[styles.eoMainBtn, { backgroundColor: '#8B5CF6' }]} onPress={() => openDetailsModal(item)}>
            <Ionicons name="eye" size={18} color="#fff" />
            <Text style={styles.eoMainBtnText}>View Details</Text>
          </TouchableOpacity>

          {item.status === 'pending' && item.type === 'customized' ? (
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
              <TouchableOpacity
                style={[styles.eoMainBtn, { backgroundColor: '#22C55E', flex: 1 }]}
                onPress={() => onUpdateStatus(item)}
              >
                <Text style={styles.eoMainBtnText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.eoMainBtn, { backgroundColor: '#EF4444', flex: 1 }]}
                onPress={() => onDecline(item)}
              >
                <Text style={styles.eoMainBtnText}>Decline</Text>
              </TouchableOpacity>
            </View>
          ) : !['completed', 'cancelled', 'declined'].includes(item.status) ? (
            <TouchableOpacity
              style={[styles.eoMainBtn, { backgroundColor: '#3B82F6', marginTop: 10 }]}
              onPress={() => onUpdateStatus(item)}
            >
              <Ionicons name="git-network-outline" size={18} color="#fff" />
              <Text style={styles.eoMainBtnText}>Change Status</Text>
            </TouchableOpacity>
          ) : null}

          {item.delivery_method === 'delivery' && !['completed', 'cancelled', 'declined'].includes(item.status) && (
            <TouchableOpacity style={[styles.eoMainBtn, { backgroundColor: '#10B981', marginTop: 10 }]} onPress={() => onAssignRider(item)}>
              <Ionicons name="person-add-outline" size={18} color="#fff" />
              <Text style={styles.eoMainBtnText}>Assign Rider</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.tabContent}>
      <Text style={styles.tabTitle}>Booking & Custom Requests</Text>

      <FlatList
        data={requestsWithRiderDetails}
        renderItem={({ item }) => <EnhancedRequestCard
          item={item}
          onMessageCustomer={handleMessageCustomer}
          onPhoneCall={handlePhoneCall}
          openDetailsModal={openDetailsModal}
          openReceiptModal={openReceiptModal}
          handleUpdatePaymentStatus={handleUpdatePaymentStatus}
          onAssignRider={handleAssignRider}
          onUpdateStatus={openRequestStatusModal}
          onDecline={handleDeclineRequest}
        />}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ec4899']} />}
        ListEmptyComponent={<Text style={styles.emptyText}>No requests found</Text>}
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request Details</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            {selectedRequest && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Type:</Text>
                  <Text style={styles.detailValue}>{getStatusLabel(selectedRequest.type)}</Text>
                </View>
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Submitted:</Text>
                  <Text style={styles.detailValue}>{formatTimestamp(selectedRequest.created_at)}</Text>
                </View>

                {/* Use helper functions to render details based on type */}
                {selectedRequest.type === 'booking' && renderBookingDetails(selectedRequest)}
                {selectedRequest.type === 'special_order' && renderSpecialOrderDetails(selectedRequest)}
                {selectedRequest.type === 'customized' && renderCustomizedDetails(selectedRequest)}


                {selectedRequest.image_url && (
                  <View style={styles.imageSection}>
                    <Text style={styles.detailLabel}>Inspiration Photo:</Text>
                    <Image
                      source={{ uri: selectedRequest.image_url.startsWith('http') ? selectedRequest.image_url : `http://192.168.111.94:5000${selectedRequest.image_url}` }}
                      style={styles.fullImage}
                      resizeMode="contain"
                    />
                  </View >
                )}

                {
                  (selectedRequest.payment_status || selectedRequest.amount_received > 0) && (
                    <View style={[styles.detailSection, { borderLeftWidth: 4, borderLeftColor: '#3B82F6', backgroundColor: '#F3F4F6' }]}>
                      <Text style={styles.detailLabel}>Payment Information:</Text>
                      <View style={{ marginTop: 5 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: 13, color: '#4B5563' }}>Status:</Text>
                          <Text style={{ fontSize: 13, fontWeight: 'bold', color: selectedRequest.payment_status === 'paid' ? '#22C55E' : '#D97706' }}>
                            {selectedRequest.payment_status === 'partial' ? 'Partial Payment' : (selectedRequest.payment_status?.toUpperCase() || 'WAITING')}
                          </Text>
                        </View>

                        {selectedRequest.final_price > 0 && (
                          <>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ fontSize: 13, color: '#4B5563' }}>Total Price:</Text>
                              <Text style={{ fontSize: 13, fontWeight: '500' }}>₱{selectedRequest.final_price.toLocaleString()}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ fontSize: 13, color: '#4B5563' }}>Amount Received:</Text>
                              <Text style={{ fontSize: 13, fontWeight: '500', color: '#22C55E' }}>₱{(selectedRequest.amount_received || 0).toLocaleString()}</Text>
                            </View>
                            {selectedRequest.final_price - (selectedRequest.amount_received || 0) > 0 && (
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={{ fontSize: 13, color: '#4B5563' }}>Remaining Balance:</Text>
                                <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#EF4444' }}>₱{(selectedRequest.final_price - (selectedRequest.amount_received || 0)).toLocaleString()}</Text>
                              </View>
                            )}
                          </>
                        )}
                      </View>

                      {selectedRequest.payment_status !== 'paid' && (selectedRequest.payment_method?.toLowerCase() === 'gcash' || !selectedRequest.payment_method) && (
                        <TouchableOpacity
                          style={{
                            marginTop: 10,
                            backgroundColor: '#3B82F6',
                            paddingVertical: 8,
                            borderRadius: 6,
                            alignItems: 'center'
                          }}
                          onPress={() => {
                            setRequestToRecordPayment(selectedRequest);
                            setPaymentAmount('');
                            setPaymentModalVisible(true);
                          }}
                        >
                          <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>Record New Payment</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )
                }

                <View style={styles.actionButtons}>
                  {/* For Special Order and Booking: Provide Quote */}
                  {(selectedRequest.status === 'pending' || selectedRequest.status === 'quoted') && (selectedRequest.type === 'special_order' || selectedRequest.type === 'booking') && (
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: '#2196F3', flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }]} // Blue color, added flex direction
                      onPress={() => {
                        setModalVisible(false);
                        openQuoteModal(selectedRequest);
                      }}
                    >
                      <Ionicons name="pricetag-outline" size={16} color="#fff" />
                      <Text style={styles.buttonText}> Provide Price</Text> {/* Changed text */}
                    </TouchableOpacity>
                  )}

                  {/* Accept and Decline for Pending Customized Requests */}
                  {selectedRequest.status === 'pending' && selectedRequest.type === 'customized' && (
                    <>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.acceptButton]}
                        onPress={() => handleStatusChange(selectedRequest.id, 'processing')}
                      >
                        <Text style={styles.buttonText}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.rejectButton]}
                        onPress={() => handleStatusChange(selectedRequest.id, 'cancelled')}
                      >
                        <Text style={styles.buttonText}>Decline</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {/* Assign Rider in Modal */}
                  {selectedRequest.delivery_method === 'delivery' && !['completed', 'cancelled', 'declined'].includes(selectedRequest.status) && (
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: '#10B981', flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }]}
                      onPress={() => {
                        setModalVisible(false);
                        handleAssignRider(selectedRequest);
                      }}
                    >
                      <Ionicons name="person-add-outline" size={16} color="#fff" />
                      <Text style={styles.buttonText}> Assign Rider</Text>
                    </TouchableOpacity>
                  )}

                  {/* Change Status for requests not in a final state */}
                  {['processing', 'ready_for_pickup', 'out_for_delivery'].includes(selectedRequest.status) && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.changeStatusButton]}
                      onPress={() => openRequestStatusModal(selectedRequest)}
                    >
                      <Text style={styles.buttonText}>Change Status</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView >
            )}
          </View >
        </View >
      </Modal >

      {/* Request Change Status Modal (Timeline UI) */}
      < Modal visible={requestStatusModalVisible} transparent animationType="fade" onRequestClose={() => setRequestStatusModalVisible(false)}>
        <View style={styles.statusModalBackdrop}>
          <View style={styles.timelineModalContainer}>
            <View style={styles.statusModalHeader}>
              <Text style={styles.statusModalTitle}>Change Request Status</Text>
            </View>

            <ScrollView contentContainerStyle={styles.timelineScrollView}>

              {/* Delivery/Pickup Toggle */}
              <View style={styles.timelinePathSelector}>
                <TouchableOpacity
                  style={[styles.timelinePathButton, deliveryOrPickup === 'delivery' && styles.timelinePathButtonActive]}
                  onPress={() => setDeliveryOrPickup('delivery')}
                >
                  <Ionicons name="rocket-outline" size={16} color={deliveryOrPickup === 'delivery' ? '#fff' : '#3B82F6'} />
                  <Text style={[styles.timelinePathText, deliveryOrPickup === 'delivery' && styles.timelinePathTextActive]}>Delivery</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.timelinePathButton, deliveryOrPickup === 'pickup' && [styles.timelinePathButtonActive, { backgroundColor: '#10B981' }]]}
                  onPress={() => setDeliveryOrPickup('pickup')}
                >
                  <Ionicons name="storefront-outline" size={16} color={deliveryOrPickup === 'pickup' ? '#fff' : '#10B981'} />
                  <Text style={[styles.timelinePathText, deliveryOrPickup === 'pickup' && styles.timelinePathTextActive]}>Pick-up</Text>
                </TouchableOpacity>
              </View>

              {(() => {
                if (!requestToUpdate) return null;
                const stepperStatuses = deliveryOrPickup === 'delivery' ? requestDeliveryStepperStatuses : requestPickupStepperStatuses;
                const getStepperIndex = (status) => stepperStatuses.findIndex(s => s.id === status);
                const selectedIndex = getStepperIndex(selectedRequestStatus);
                const currentStatusIndex = getStepperIndex(requestToUpdate.status);

                return (
                  <>
                    {stepperStatuses.map((status, index) => {
                      const isSelected = selectedIndex === index;
                      const isPast = selectedIndex > index;
                      const isLast = index === stepperStatuses.length - 1;

                      return (
                        <View key={status.id} style={styles.timelineStepContainer}>
                          {!isLast && (
                            <View style={[
                              styles.timelineLine,
                              (isPast || isSelected) && styles.timelineLineActive
                            ]} />
                          )}
                          <TouchableOpacity
                            onPress={() => setSelectedRequestStatus(status.id)}
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
                    <View style={styles.timelineActions}>
                      <TouchableOpacity
                        onPress={() => setSelectedRequestStatus('cancelled')}
                        style={[
                          styles.timelineCancelButton,
                          selectedRequestStatus === 'cancelled' && styles.timelineCancelButtonSelected
                        ]}
                      >
                        <Ionicons name="close-circle-outline" size={16} color={selectedRequestStatus === 'cancelled' ? '#fff' : '#EF4444'} />
                        <Text style={[
                          styles.timelineCancelButtonText,
                          selectedRequestStatus === 'cancelled' && { color: '#fff' }
                        ]}>
                          Cancel Request
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                );
              })()}
            </ScrollView>

            <View style={styles.statusModalFooter}>
              <TouchableOpacity onPress={confirmRequestStatusChange} style={styles.statusConfirmButton}>
                <Text style={styles.statusConfirmButtonText}>Confirm</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setRequestStatusModalVisible(false)} style={styles.statusCloseButton}>
                <Text style={styles.statusCloseButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal >

      {/* Provide Quote Modal */}
      < Modal visible={quoteModalVisible} animationType="fade" transparent >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Provide Price</Text>
              <TouchableOpacity onPress={() => setQuoteModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSubtitle, { textAlign: 'left', paddingHorizontal: 20 }]}>Request #{requestToQuote?.request_number}</Text>

            <Text style={styles.inputLabel}>Price Amount (₱)</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter total price for the request"
              keyboardType="numeric"
              value={quoteAmount}
              onChangeText={setQuoteAmount}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setQuoteModalVisible(false)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleProvideQuote}
              >
                <Text style={styles.buttonText}>Submit Price</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal >

      {/* Receipt View Modal */}
      < Modal visible={receiptModalVisible} animationType="fade" transparent >
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
      </Modal >

      {/* Assign Rider Modal */}
      < Modal visible={assignRiderModalVisible} animationType="fade" transparent >
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
      </Modal >

      {/* Payment Recording Modal */}
      <Modal visible={paymentModalVisible} animationType="fade" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Record GCash Payment</Text>
            <View style={{ marginBottom: 15 }}>
              <Text style={{ marginBottom: 5 }}>Currently Received: ₱{requestToRecordPayment?.amount_received || 0}</Text>
              <Text style={{ marginBottom: 5 }}>Total Amount: ₱{requestToRecordPayment?.final_price || 0}</Text>
              <Text style={{ marginBottom: 10, fontWeight: 'bold', color: '#EF4444' }}>
                Balance: ₱{(requestToRecordPayment?.final_price || 0) - (requestToRecordPayment?.amount_received || 0)}
              </Text>
            </View>
            <Text style={{ marginBottom: 5, fontWeight: '500' }}>Enter Amount Received (New)</Text>
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

    </View>
  );
};

export default RequestsTab;

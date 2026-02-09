import React, { useState, useEffect } from 'react';
import {
  Alert,
  FlatList,
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

  // New state for rider assignment
  const [riders, setRiders] = useState([]);
  const [assignRiderModalVisible, setAssignRiderModalVisible] = useState(false);
  const [selectedRider, setSelectedRider] = useState(null);
  const [requestToAssignRider, setRequestToAssignRider] = useState(null);
  const [riderSearchQuery, setRiderSearchQuery] = useState('');

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
            <TextInput style={styles.input} value={flowersString} editable={false} multiline/>

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

  const handleStatusChange = async (id, status) => {
    try {
      await adminAPI.updateRequestStatus(id, status);
      Alert.alert('Success', `Request ${status}`);
      setModalVisible(false);
      loadRequests();
    } catch (error) {
      Alert.alert('Error', 'Failed to update status');
    }
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
      await adminAPI.updateRequestStatus(requestId, selectedRequestStatus);

      let toastMessage = `Request Status Updated: Request #${requestToUpdate.request_number} is now ${selectedRequestStatus}.`;

      // New logic for requests: if status changes to 'processing', 'out_for_delivery', or 'ready_for_pickup'
      // and payment method is not COD and payment is 'waiting_for_confirmation', update payment to 'paid'.
      if (
        (selectedRequestStatus === 'processing' || selectedRequestStatus === 'out_for_delivery' || selectedRequestStatus === 'ready_for_pickup' || selectedRequestStatus === 'completed') &&
        requestToUpdate.payment_method?.toLowerCase() !== 'cod' &&
        (requestToUpdate.payment_status !== 'paid' && requestToUpdate.payment_status !== 'cancelled') // Check if it's not already paid or cancelled
      ) {
        await adminAPI.updateRequestPaymentStatus(requestToUpdate, 'paid');
        toastMessage = `Request Status Updated and Payment Marked as Paid for Request #${requestToUpdate.request_number}.`;
      }

      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: toastMessage
      });
      setModalVisible(false); // Close the main details modal too
      loadRequests(); // Reload requests to reflect changes
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

  const openDetailsModal = (item) => {
    setSelectedRequest(item);
    setModalVisible(true);
  };

  const handleAssignRider = (request) => {
    setRequestToAssignRider(request);
    setSelectedRider(request.rider); // pre-select if already assigned
    setAssignRiderModalVisible(true);
  };

  const handleConfirmAssignRider = async () => {
    if (!requestToAssignRider || !selectedRider) return;
    try {
      const { error } = await supabase
        .from('requests')
        .update({ assigned_rider: selectedRider.id })
        .eq('id', requestToAssignRider.id);

      if (error) throw error;

      Toast.show({ type: 'success', text1: 'Rider Assigned' });
      setAssignRiderModalVisible(false);
      loadRequests(); // To refresh the list with the new rider
    } catch (error) {
      console.error('Error assigning rider to request:', error);
      Toast.show({ type: 'error', text1: 'Assignment Failed' });
    }
  };

  const EnhancedRequestCard = ({ item, onMessageCustomer, onPhoneCall, openDetailsModal, openReceiptModal, handleUpdatePaymentStatus, onAssignRider }) => (
    <View style={styles.eoCard}>
      {/* Header */}
      <View style={styles.eoCardHeader}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.eoLabel}>Request Type</Text>
          <Text style={styles.eoOrderId}>{getStatusLabel(item.type)}</Text>
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
          <View style={[styles.eoStatusBadge, {backgroundColor: getStatusColor(item.status)}]}>
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
            source={{ uri: item.image_url.startsWith('http') ? item.image_url : `${BASE_URL}${item.image_url}` }}
            style={{ width: '100%', height: 200, borderRadius: 8, marginTop: 10 }}
            resizeMode="contain"
          />
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

                  {/* Payment Details */}

                  {(item.payment_status || item.final_price) && (

                    <View style={styles.eoSection}>

                      <View style={styles.eoSectionHeader}>

                          <Ionicons name="card" size={16} color="#6B7280"/>

                          <Text style={styles.eoSectionTitle}>Payment Details</Text>

                      </View>

                      <View style={{gap: 8}}>

                        <View style={styles.eoFlexBetween}>

                            <Text style={styles.eoDetailText}>Method:</Text>

                            <Text style={styles.eoInfoTextBold}>

                              {getStatusLabel(item.payment_method || 'gcash')}

                            </Text>

                        </View>

                        <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}>

                                                                        <View style={[styles.eoPaymentStatus, {backgroundColor: item.payment_status === 'paid' ? '#22C55E' : '#FFA726'}]}>

                                                                            <Text style={styles.eoPaymentStatusText}>{getPaymentStatusDisplay(item.payment_status, item.payment_method)}</Text>

                                                                        </View>

                            {(item.payment_method?.toLowerCase() === 'gcash' || !item.payment_method) && item.receipt_url && (

                                <TouchableOpacity onPress={() => openReceiptModal(item.receipt_url)}>

                                    <Text style={styles.eoViewReceipt}>View Receipt</Text>

                                </TouchableOpacity>

                            )}

                        </View>

                      </View>

                    </View>

                  )}

            

                  {/* Pricing Summary */}

                  {item.final_price && (

                    <View style={styles.eoSection}>

                      <View style={{gap: 8}}>

                        <View style={styles.eoPriceRow}>

                          <Text style={styles.eoDetailText}>Sub Total:</Text>

                          <Text style={styles.eoDetailText}>₱{(item.data?.subtotal || (item.final_price - (item.shipping_fee || 0))).toFixed(2)}</Text>

                        </View>

                        <View style={styles.eoPriceRow}>

                          <Text style={styles.eoDetailText}>Delivery Fee:</Text>

                          <Text style={styles.eoDetailText}>₱{(item.shipping_fee || 0).toFixed(2)}</Text>

                        </View>

                        <View style={[styles.eoPriceRow, {marginTop: 8}]}>

                          <Text style={styles.eoTotalLabel}>Total:</Text>

                          <Text style={styles.eoTotalValue}>₱{item.final_price.toFixed(2)}</Text>

                        </View>

                      </View>

                    </View>

                  )}

      

            {/* Action to open full details */}
      <View style={styles.eoFooter}>
        <TouchableOpacity style={[styles.eoMainBtn, {backgroundColor: '#8B5CF6'}]} onPress={() => openDetailsModal(item)}>
            <Ionicons name="eye" size={18} color="#fff" />
            <Text style={styles.eoMainBtnText}>View Details</Text>
        </TouchableOpacity>
        {item.delivery_method === 'delivery' && item.status === 'processing' && (
          <TouchableOpacity style={[styles.eoMainBtn, {backgroundColor: '#10B981', marginTop: 10}]} onPress={() => onAssignRider(item)}>
            <Ionicons name="person-add-outline" size={18} color="#fff" />
            <Text style={styles.eoMainBtnText}>Assign Rider</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.tabContent}>
      <Text style={styles.tabTitle}>Booking & Custom Requests</Text>
      
      <FlatList
        data={requestsWithRiderDetails}
        renderItem={({item}) => <EnhancedRequestCard 
                                    item={item} 
                                    onMessageCustomer={handleMessageCustomer} 
                                    onPhoneCall={handlePhoneCall} 
                                    openDetailsModal={openDetailsModal} 
                                    openReceiptModal={openReceiptModal}
                                    handleUpdatePaymentStatus={handleUpdatePaymentStatus}
                                    onAssignRider={handleAssignRider}
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
                  </View>
                )}

                <View style={styles.actionButtons}>
                  {/* For Special Order and Booking: Provide Quote */}
                  {(selectedRequest.status === 'pending' || selectedRequest.status === 'quoted') && (selectedRequest.type === 'special_order' || selectedRequest.type === 'booking') && (
                    <TouchableOpacity
                      style={[styles.actionButton, {backgroundColor: '#2196F3', flexDirection: 'row', justifyContent: 'center', alignItems: 'center'}]} // Blue color, added flex direction
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
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Request Change Status Modal (Timeline UI) */}
      <Modal visible={requestStatusModalVisible} transparent animationType="fade" onRequestClose={() => setRequestStatusModalVisible(false)}>
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
                                                  ]}/>
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
      </Modal>

      {/* Provide Quote Modal */}
      <Modal visible={quoteModalVisible} animationType="fade" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Provide Price</Text>
              <TouchableOpacity onPress={() => setQuoteModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSubtitle, {textAlign: 'left', paddingHorizontal: 20}]}>Request #{requestToQuote?.request_number}</Text>
            
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

    </View>
  );
};


export default RequestsTab;

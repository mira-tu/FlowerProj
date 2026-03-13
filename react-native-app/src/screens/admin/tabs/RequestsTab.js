import React, { useState, useEffect } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { adminAPI, BASE_URL } from '../../../config/api';
import { supabase } from '../../../config/supabase';
import styles from '../../AdminDashboard.styles';
import { formatTimestamp, getPaymentStatusDisplay, getStatusColor, getStatusLabel } from '../adminHelpers';
import PaymentDetailsSection from '../components/PaymentDetailsSection';
import { generateAndShareReceipt } from '../../../utils/receiptGenerator';

const DetailSection = ({ label, value }) => {
  if (!value) return null;
  return (
    <View style={styles.detailSection}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
};

const parseCurrencyNumber = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getArrangementFlowerCount = (arrangementType = '') => {
  if (!arrangementType) return 0;
  const match = arrangementType.match(/(\d+)\s*flowers?/i);
  if (!match) return 0;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toPositiveInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeFreeTextList = (value) => {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const normalizeFlowerNames = (value, otherFlowersText = '') => {
  if (!value) return [];

  const otherFlowerNames = normalizeFreeTextList(otherFlowersText);
  const finalNames = [];

  const pushName = (name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;

    if (/^others?$/i.test(trimmed) && otherFlowerNames.length > 0) {
      otherFlowerNames.forEach((entry) => {
        if (!finalNames.includes(entry)) finalNames.push(entry);
      });
      return;
    }

    const cleanedName = trimmed.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (cleanedName && !finalNames.includes(cleanedName)) {
      finalNames.push(cleanedName);
    }
  };

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry) return;
      if (typeof entry === 'string') {
        pushName(entry);
      } else {
        pushName(entry.label || entry.name || entry.value || '');
      }
    });
    return finalNames;
  }

  if (typeof value === 'string') {
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach(pushName);
    return finalNames;
  }

  return finalNames;
};

const normalizeArrangementSelections = (requestData = {}) => {
  const source = Array.isArray(requestData.arrangementSelections)
    ? requestData.arrangementSelections
    : [];

  return source
    .map((selection) => {
      const arrangementLabel =
        (selection?.arrangement_label || selection?.arrangementLabel || selection?.label || selection?.arrangement_type || selection?.arrangementType || '').trim();

      if (!arrangementLabel) return null;

      const quantity = toPositiveInt(selection?.quantity || selection?.arrangement_quantity, 1);
      const flowersPerArrangement = toPositiveInt(
        selection?.flowers_per_arrangement || selection?.flowersPerArrangement,
        getArrangementFlowerCount(arrangementLabel)
      );

      let totalFlowers = toPositiveInt(selection?.total_flowers || selection?.totalFlowers, 0);
      if (!totalFlowers && flowersPerArrangement) {
        totalFlowers = flowersPerArrangement * quantity;
      }

      return {
        arrangementLabel,
        quantity,
        flowersPerArrangement,
        totalFlowers,
      };
    })
    .filter(Boolean);
};

const buildFlowerPricingContext = (request) => {
  let requestData = request?.data || {};
  if (typeof requestData === 'string') {
    try {
      requestData = JSON.parse(requestData);
    } catch (error) {
      requestData = {};
    }
  }

  const arrangementSelections = normalizeArrangementSelections(requestData);

  const fallbackArrangementType =
    requestData.arrangementSummary ||
    requestData.arrangementType ||
    requestData.arrangement_type ||
    requestData.arrangement ||
    (Array.isArray(requestData.arrangementTypes) ? requestData.arrangementTypes.join(', ') : 'N/A');

  const arrangementType = arrangementSelections.length
    ? arrangementSelections.map((selection) => `${selection.arrangementLabel} x${selection.quantity}`).join(', ')
    : fallbackArrangementType;

  const arrangementQuantity = arrangementSelections.length
    ? arrangementSelections.reduce((sum, selection) => sum + selection.quantity, 0)
    : toPositiveInt(requestData.arrangementQuantity || requestData.arrangement_quantity, 1);

  let totalFlowers = toPositiveInt(
    requestData.totalFlowers ||
    requestData.total_flower_count ||
    requestData.flowerQuantity ||
    requestData.flower_quantity,
    0
  );

  if (!totalFlowers && arrangementSelections.length) {
    totalFlowers = arrangementSelections.reduce((sum, selection) => sum + (selection.totalFlowers || 0), 0);
  }

  if (!totalFlowers) {
    const flowersPerArrangement = getArrangementFlowerCount(fallbackArrangementType);
    if (flowersPerArrangement) {
      totalFlowers = flowersPerArrangement * arrangementQuantity;
    }
  }

  const flowerTypes = normalizeFlowerNames(
    requestData.selectedFlowers?.length ? requestData.selectedFlowers : requestData.flowers,
    requestData.otherFlowersText
  );

  const explicitFlowerQuantities = {};
  const quantitySources = [requestData.flowerQuantities, requestData.flower_quantities, requestData.flowerBreakdown];

  quantitySources.forEach((source) => {
    if (source && typeof source === 'object' && !Array.isArray(source)) {
      Object.entries(source).forEach(([name, qty]) => {
        const trimmedName = String(name || '').trim();
        if (!trimmedName) return;
        explicitFlowerQuantities[trimmedName] = toPositiveInt(qty, 0);
      });
    }
  });

  const normalizedFlowerTypes = flowerTypes.length
    ? flowerTypes
    : Object.keys(explicitFlowerQuantities);

  if (!normalizedFlowerTypes.length && requestData.flower?.name) {
    normalizedFlowerTypes.push(requestData.flower.name);
  }

  const flowerQuantities = {};
  normalizedFlowerTypes.forEach((flowerName) => {
    flowerQuantities[flowerName] = explicitFlowerQuantities[flowerName] || 0;
  });

  const explicitQuantityTotal = normalizedFlowerTypes.reduce(
    (sum, flowerName) => sum + (flowerQuantities[flowerName] || 0),
    0
  );

  if (!totalFlowers && explicitQuantityTotal > 0) {
    totalFlowers = explicitQuantityTotal;
  }

  if (totalFlowers === 0 && explicitQuantityTotal === 0 && normalizedFlowerTypes.length > 0) {
    normalizedFlowerTypes.forEach((flowerName) => {
      flowerQuantities[flowerName] = 1;
    });
    totalFlowers = normalizedFlowerTypes.length;
  }

  if (totalFlowers > 0 && explicitQuantityTotal === 0 && normalizedFlowerTypes.length > 0) {
    const base = Math.floor(totalFlowers / normalizedFlowerTypes.length);
    let remainder = totalFlowers % normalizedFlowerTypes.length;

    normalizedFlowerTypes.forEach((flowerName) => {
      flowerQuantities[flowerName] = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
    });
  }

  return {
    arrangementType,
    arrangementQuantity,
    totalFlowers,
    arrangementSelections,
    flowerTypes: normalizedFlowerTypes,
    flowerQuantities,
  };
};
const formatCurrency = (value) => {
  const amount = Number.isFinite(value) ? value : 0;
  return `PHP ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const quoteStyles = StyleSheet.create({
  quoteScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  quoteHeroCard: {
    marginTop: 10,
    padding: 14,
    backgroundColor: '#fff7ed',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#fdba74',
  },
  quoteBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffedd5',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
  },
  quoteBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9a3412',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  quoteHeroTitle: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    color: '#7c2d12',
    marginBottom: 14,
  },
  quoteMetricsRow: {
    flexDirection: 'row',
    marginHorizontal: -4,
  },
  quoteMetricCard: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  quoteMetricValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#9a3412',
  },
  quoteMetricLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#c2410c',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  quoteBreakdownSection: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#fdba74',
  },
  quoteSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9a3412',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  quoteBreakdownRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  quoteBreakdownIndex: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fb923c',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  quoteBreakdownIndexText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  quoteBreakdownTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7c2d12',
    lineHeight: 20,
  },
  quoteBreakdownMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#c2410c',
    lineHeight: 16,
  },
  quoteSectionHeader: {
    marginTop: 18,
    marginBottom: 12,
  },
  quoteSectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  quoteSectionHint: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#6b7280',
  },
  quoteInputCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fbcfe8',
    marginBottom: 12,
  },
  quoteInputHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  quoteInputTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  quoteInputHint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    color: '#6b7280',
  },
  quoteInputLineTotal: {
    marginLeft: 12,
    fontSize: 15,
    fontWeight: '700',
    color: '#be185d',
  },
  quoteCurrencyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fbcfe8',
    backgroundColor: '#fff7fb',
    borderRadius: 14,
    paddingHorizontal: 10,
  },
  quoteCurrencyPrefix: {
    backgroundColor: '#fce7f3',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 10,
  },
  quoteCurrencyPrefixText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#be185d',
  },
  quoteCurrencyInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  quoteCurrencySuffix: {
    marginLeft: 10,
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
  },
  quoteAlertText: {
    color: '#7f1d1d',
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
  },
  quoteInfoCard: {
    backgroundColor: '#fffaf8',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fed7aa',
    marginBottom: 12,
  },
  quoteInfoLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#c2410c',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  quoteInfoValue: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: '700',
    color: '#7c2d12',
  },
  quoteInfoHint: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    color: '#9a3412',
  },
  quoteTotalCard: {
    marginTop: 6,
    padding: 16,
    backgroundColor: '#fdf2f8',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#fbcfe8',
  },
  quoteTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  quoteTotalLabel: {
    fontSize: 14,
    color: '#831843',
    fontWeight: '600',
  },
  quoteTotalMeta: {
    marginTop: 2,
    fontSize: 12,
    color: '#9d174d',
  },
  quoteTotalValue: {
    marginLeft: 12,
    fontSize: 14,
    color: '#831843',
    fontWeight: '700',
  },
  quoteTotalDivider: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f9a8d4',
  },
  quoteGrandTotalLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#be185d',
  },
  quoteGrandTotalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#be185d',
  },
});
const normalizeRequestData = (request) => {
  const rawData = request?.data;
  if (!rawData) return {};
  if (typeof rawData === 'string') {
    try {
      const parsed = JSON.parse(rawData);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }
  return typeof rawData === 'object' ? rawData : {};
};

const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return value;
  }
  return null;
};

const getNormalizedRequestPaymentMethod = (request) => {
  const paymentMethod = request?.payment_method || request?.data?.payment_method || '';
  return String(paymentMethod).trim().toLowerCase();
};

const resolveAcceptedRequestStatus = (request) => {
  if (!request) return 'accepted';

  const paymentMethod = getNormalizedRequestPaymentMethod(request);
  const paymentStatus = String(request.payment_status || '').trim().toLowerCase();
  const isCustomized = request.type === 'customized';

  if (isCustomized && (paymentMethod === 'cod' || paymentStatus === 'paid')) {
    return 'processing';
  }

  return 'accepted';
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
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [requestStatusModalVisible, setRequestStatusModalVisible] = useState(false);
  const [requestToUpdate, setRequestToUpdate] = useState(null);
  const [selectedRequestStatus, setSelectedRequestStatus] = useState(null);
  const [deliveryOrPickup, setDeliveryOrPickup] = useState('delivery');
  const [quoteModalVisible, setQuoteModalVisible] = useState(false);
  const [requestToQuote, setRequestToQuote] = useState(null);
  const [quoteAmount, setQuoteAmount] = useState('');
  const [quoteFlowerContext, setQuoteFlowerContext] = useState(null);
  const [quoteFlowerPrices, setQuoteFlowerPrices] = useState({});
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [selectedReceiptUrl, setSelectedReceiptUrl] = useState(null);
  const [declineModalVisible, setDeclineModalVisible] = useState(false);
  const [requestToDecline, setRequestToDecline] = useState(null);
  const [declineFeedback, setDeclineFeedback] = useState('');
  const [isDeclining, setIsDeclining] = useState(false);

  // Payment Recording State
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [requestToRecordPayment, setRequestToRecordPayment] = useState(null);
  const [isEditPaymentMode, setIsEditPaymentMode] = useState(false);

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

  // Filter wrapper
  const filteredRequests = React.useMemo(() => {
    let result = requestsWithRiderDetails;
    if (statusFilter !== 'All') {
      result = result.filter(req => {
        const status = req.status;
        switch (statusFilter) {
          case 'Pending': return status === 'pending';
          case 'Quoted / Acc': return status === 'quoted' || status === 'accepted';
          case 'Processing': return status === 'processing' || status === 'partial';
          case 'Delivery/Pickup': return status === 'out_for_delivery' || status === 'ready_for_pickup';
          case 'Completed': return status === 'completed' || status === 'claimed';
          case 'Cancelled': return status === 'cancelled' || status === 'declined';
          default: return true;
        }
      });
    }
    return result;
  }, [requestsWithRiderDetails, statusFilter]);

  const requestStatusFilters = ['All', 'Pending', 'Quoted / Acc', 'Processing', 'Delivery/Pickup', 'Completed', 'Cancelled'];

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
    if (request.delivery_method !== 'pickup') return null;
    return (
      <>
        <DetailSection label="Pickup Location:" value="Jocerry's Flower Shop, 63 San Jose Road, Zamboanga City" />
        {request.pickup_time && <DetailSection label="Pickup Time:" value={request.pickup_time} />}
      </>
    );
  };

  const renderBookingDetails = (request) => {
    const requestData = normalizeRequestData(request);

    const recipientName = firstNonEmpty(requestData.recipientName, requestData.recipient_name);
    const occasion = firstNonEmpty(requestData.occasion, requestData.otherOccasion);
    const venue = firstNonEmpty(
      requestData.venue,
      typeof requestData.deliveryAddress === 'string' ? requestData.deliveryAddress : null,
      requestData.delivery_address
    );
    const eventDate = firstNonEmpty(requestData.eventDate, requestData.event_date);
    const eventTime = firstNonEmpty(requestData.eventTime, requestData.event_time);
    const arrangementSelections = Array.isArray(requestData.arrangementSelections) ? requestData.arrangementSelections : [];
    const arrangementType = firstNonEmpty(
      requestData.arrangementSummary,
      arrangementSelections.length
        ? arrangementSelections.map((selection) => {
          const label = selection?.arrangement_label || selection?.arrangementLabel || selection?.arrangement_type || selection?.arrangementType;
          const quantity = toPositiveInt(selection?.quantity || selection?.arrangement_quantity, 1);
          return label ? `${label} x${quantity}` : null;
        }).filter(Boolean).join(', ')
        : null,
      requestData.arrangementType,
      requestData.arrangement_type,
      (Array.isArray(requestData.arrangementTypes) ? requestData.arrangementTypes.join(', ') : null)
    );
    const arrangementQuantity = firstNonEmpty(
      requestData.arrangementQuantity,
      arrangementSelections.length ? arrangementSelections.reduce((sum, selection) => sum + toPositiveInt(selection?.quantity, 1), 0) : null,
      requestData.arrangement_quantity
    );
    const colorTheme = firstNonEmpty(requestData.colorPreference, requestData.color_preference);
    const specialInstructions = firstNonEmpty(requestData.specialInstructions, request.notes);
    const declineFeedback = firstNonEmpty(requestData.decline_feedback, requestData.declineFeedback);

    const preferredFlowers = firstNonEmpty(
      Array.isArray(requestData.selectedFlowers)
        ? requestData.selectedFlowers
          .map((flower) => flower?.label || flower?.name || flower?.value || flower)
          .filter(Boolean)
          .join(', ')
        : null,
      requestData.flowers
    );

    return (
      <>
        <DetailSection label="Occasion:" value={occasion} />
        <DetailSection label="Venue:" value={venue} />
        <DetailSection label="Type:" value={getStatusLabel(request.type)} />
        <DetailSection label="Submitted:" value={formatTimestamp(request.created_at)} />
        <DetailSection label="Request Number:" value={request.request_number} />
        <DetailSection label="Customer Name:" value={request.user_name} />
        <DetailSection label="Customer Email:" value={request.user_email} />
        <DetailSection label="Contact Number:" value={request.contact_number} />
        <DetailSection label="Recipient:" value={recipientName} />
        <DetailSection label="Event Date:" value={eventDate} />
        <DetailSection label="Event Time:" value={eventTime} />
        <DetailSection label="Arrangement:" value={arrangementType} />
        <DetailSection label="Quantity:" value={arrangementQuantity ? String(arrangementQuantity) : null} />
        <DetailSection label="Preferred Flowers:" value={preferredFlowers} />
        <DetailSection label="Color Theme:" value={colorTheme} />
        <DetailSection label="Special Instructions:" value={specialInstructions} />
        <DetailSection label="Decline Feedback:" value={declineFeedback} />
        {renderPickupTimeSection(request)}
      </>
    );
  };

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
            <TextInput style={styles.input} value={`PHP ${request.final_price.toFixed(2)}`} editable={false} />
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
      setRequests(response.data.requests || []);
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
    const status = currentStatus;

    switch (status) {
      case 'pending':
        if (type === 'customized') return 'processing';
        return null; // booking/special need quote
      case 'accepted':
        return 'processing';
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

    // Rider enforcement: If moving to out_for_delivery, must have a rider assigned
    if (nextStatus === 'out_for_delivery') {
      const hasRider = request.rider || request.assigned_rider;
      if (!hasRider) {
        Alert.alert(
          "Rider Required",
          "Please assign a rider before moving this request to Out for Delivery."
        );
        return;
      }
    }

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

  const handleDeclineRequest = (request) => {
    setRequestToDecline(request);
    setDeclineFeedback('');
    setDeclineModalVisible(true);
  };

  const submitDeclineRequest = async () => {
    if (!requestToDecline) return;

    const feedback = declineFeedback.trim();
    if (!feedback) {
      Alert.alert('Feedback Required', 'Please provide a short reason before declining this request.');
      return;
    }

    setIsDeclining(true);

    try {
      await adminAPI.updateRequestStatus(requestToDecline.id, 'declined', {
        dataPatch: {
          decline_feedback: feedback,
          declined_at: new Date().toISOString(),
        },
        notification: {
          title: 'Custom order declined',
          message: `Your request #${requestToDecline.request_number} was declined. Reason: ${feedback}`,
          link: '/profile',
          type: 'request_update',
        },
      });

      Toast.show({ type: 'success', text1: 'Request Declined' });
      setDeclineModalVisible(false);
      setRequestToDecline(null);
      setDeclineFeedback('');
      setModalVisible(false);
      loadRequests();
    } catch (error) {
      console.error('Decline request error:', error);
      Toast.show({ type: 'error', text1: 'Decline Failed' });
    } finally {
      setIsDeclining(false);
    }
  };

  const openRequestStatusModal = (request) => {
    setRequestToUpdate(request);
    const nextStatus = getNextRequestStatus(request.status, request.delivery_method, request.type);
    if (nextStatus) {
      setSelectedRequestStatus(nextStatus);
    } else {
      setSelectedRequestStatus(request.status);
    }
    setDeliveryOrPickup(request.delivery_method || 'delivery');
    setRequestStatusModalVisible(true);
  };

  const handleAcceptPendingRequest = async (request) => {
    if (!request) return;

    const nextStatus = resolveAcceptedRequestStatus(request);
    const acceptedMessage = nextStatus === 'processing'
      ? 'Your request #' + request.request_number + ' has been accepted and is now being prepared.'
      : 'Your request #' + request.request_number + " has been accepted. We'll confirm the payment details and begin processing shortly.";

    try {
      await adminAPI.updateRequestStatus(request.id, nextStatus, {
        notification: {
          title: 'Request accepted',
          message: acceptedMessage,
          link: '/profile',
          type: 'request_update',
        },
      });

      Toast.show({
        type: 'success',
        text1: nextStatus === 'processing' ? 'Request Accepted and Processing' : 'Request Accepted',
      });

      setModalVisible(false);
      setSelectedRequest(null);
      await loadRequests();
    } catch (error) {
      console.error('Error accepting request:', error);
      Toast.show({ type: 'error', text1: 'Failed to accept request' });
    }
  };

  const confirmRequestStatusChange = async () => {
    if (!requestToUpdate || !selectedRequestStatus) return;
    const requestId = requestToUpdate.id;

    try {
      // Rider enforcement: If moving to out_for_delivery, must have a rider assigned
      if (selectedRequestStatus === 'out_for_delivery') {
        const hasRider = requestToUpdate.rider || requestToUpdate.assigned_rider;
        if (!hasRider) {
          Alert.alert(
            "Rider Required",
            "Please assign a rider before moving this request to Out for Delivery."
          );
          return;
        }
      }

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

      setRequestStatusModalVisible(false); // Close modal after validation passes

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

  const isCustomOrderQuote = requestToQuote?.type === 'booking';

  const quoteBreakdownRows = React.useMemo(() => {
    if (!quoteFlowerContext?.flowerTypes?.length) return [];

    return quoteFlowerContext.flowerTypes.map((flowerName) => {
      const quantity = quoteFlowerContext.flowerQuantities[flowerName] || 0;
      const unitPrice = parseCurrencyNumber(quoteFlowerPrices[flowerName]);

      return {
        flowerName,
        quantity,
        unitPrice,
        lineTotal: quantity * unitPrice,
      };
    });
  }, [quoteFlowerContext, quoteFlowerPrices]);

  const quoteFlowerSubtotal = React.useMemo(
    () => quoteBreakdownRows.reduce((sum, row) => sum + row.lineTotal, 0),
    [quoteBreakdownRows]
  );

  const quoteShippingValue = requestToQuote?.shipping_fee !== null && requestToQuote?.shipping_fee !== undefined
    ? parseCurrencyNumber(requestToQuote.shipping_fee)
    : 0;
  const quoteTotalToPay = quoteFlowerSubtotal + quoteShippingValue;
  const quoteArrangementSelections = quoteFlowerContext?.arrangementSelections || [];
  const quoteFlowerTypes = quoteFlowerContext?.flowerTypes || [];
  const quoteBreakdownLookup = React.useMemo(() => {
    return quoteBreakdownRows.reduce((accumulator, row) => {
      accumulator[row.flowerName] = row;
      return accumulator;
    }, {});
  }, [quoteBreakdownRows]);

  const closeQuoteModal = () => {
    setQuoteModalVisible(false);
    setRequestToQuote(null);
    setQuoteFlowerContext(null);
    setQuoteFlowerPrices({});
  };

  const updateQuoteFlowerPrice = (flowerName, value) => {
    const sanitized = value.replace(/[^0-9.]/g, '');
    setQuoteFlowerPrices((prev) => ({
      ...prev,
      [flowerName]: sanitized,
    }));
  };

  const openQuoteModal = (request) => {
    setRequestToQuote(request);

    const initialShipping = request.shipping_fee !== null && request.shipping_fee !== undefined
      ? parseCurrencyNumber(request.shipping_fee)
      : 0;

    const initialPrice = request.final_price !== null && request.final_price !== undefined
      ? String(parseCurrencyNumber(request.final_price) - initialShipping)
      : '';

    const flowerContext = buildFlowerPricingContext(request);
    const storedQuoteBreakdown = request.data?.quote_breakdown;
    const storedPriceMap = storedQuoteBreakdown?.price_per_flower || {};

    const initialFlowerPrices = {};
    flowerContext.flowerTypes.forEach((flowerName) => {
      const existingPrice = storedPriceMap[flowerName];
      initialFlowerPrices[flowerName] = existingPrice !== undefined && existingPrice !== null
        ? String(existingPrice)
        : '';
    });

    setQuoteAmount(initialPrice);
    setQuoteFlowerContext(flowerContext);
    setQuoteFlowerPrices(initialFlowerPrices);
    setQuoteModalVisible(true);
  };

  const handleProvideQuote = async () => {
    if (!requestToQuote) return;

    const parsedShippingFee = requestToQuote?.shipping_fee !== null && requestToQuote?.shipping_fee !== undefined
      ? parseCurrencyNumber(requestToQuote.shipping_fee)
      : 0;

    let parsedItemPrice = 0;
    let quoteBreakdownPayload = null;

    if (isCustomOrderQuote) {
      if (!quoteFlowerContext?.flowerTypes?.length) {
        Alert.alert('Missing Details', 'No flower types were found in this custom order.');
        return;
      }

      const hasInvalidFlowerPrice = quoteFlowerContext.flowerTypes.some((flowerName) => {
        const value = quoteFlowerPrices[flowerName];
        const parsed = Number.parseFloat(value);
        return value === '' || !Number.isFinite(parsed) || parsed < 0;
      });

      if (hasInvalidFlowerPrice) {
        Alert.alert('Invalid Input', 'Please enter a valid price per flower for all selected flower types.');
        return;
      }

      const quantityPerFlower = {};
      const pricePerFlower = {};

      quoteBreakdownRows.forEach((row) => {
        quantityPerFlower[row.flowerName] = row.quantity;
        pricePerFlower[row.flowerName] = row.unitPrice;
      });

      parsedItemPrice = quoteFlowerSubtotal;
      quoteBreakdownPayload = {
        arrangement_type: quoteFlowerContext.arrangementType,
        arrangement_quantity: quoteFlowerContext.arrangementQuantity,
        arrangement_selections: quoteFlowerContext.arrangementSelections || [],
        total_flowers: quoteFlowerContext.totalFlowers,
        quantity_per_flower: quantityPerFlower,
        price_per_flower: pricePerFlower,
        computed_subtotal: quoteFlowerSubtotal,
        shipping_fee: parsedShippingFee,
        computed_total: quoteFlowerSubtotal + parsedShippingFee,
      };
    } else {
      if (!quoteAmount || isNaN(parseFloat(quoteAmount))) {
        Alert.alert('Invalid Input', 'Please enter a valid item price.');
        return;
      }
      parsedItemPrice = parseFloat(quoteAmount);
    }

    try {
      const { data: { request: updatedRequest } } = await adminAPI.provideQuote(
        requestToQuote.id,
        parsedItemPrice,
        parsedShippingFee,
        quoteBreakdownPayload
      );

      // Create notification for the user
      if (updatedRequest) {
        const notificationData = {
          user_id: updatedRequest.user_id,
          type: 'quote',
          title: `Price Quote for Your Request`,
          message: `We've provided a quote of PHP ${updatedRequest.final_price.toFixed(2)} for your request #${updatedRequest.request_number}. Please review and take action.`,
          link: `/profile` // Link to profile where they can see the request
        };
        await supabase.from('notifications').insert([notificationData]);
      }

      Toast.show({
        type: 'success',
        text1: 'Quote Provided',
        text2: `A quote of PHP ${(parsedItemPrice + parsedShippingFee).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} has been sent for request #${requestToQuote.request_number}.`
      });
      closeQuoteModal();
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
      const total = requestToRecordPayment.final_price || 0;
      // In edit mode: replace the existing amount. In add mode: accumulate.
      const newTotalReceived = isEditPaymentMode
        ? amount
        : (requestToRecordPayment.amount_received || 0) + amount;
      const newStatus = newTotalReceived >= total ? 'paid' : 'partial';
      const shouldAdvanceToProcessing = newStatus === 'paid' && requestToRecordPayment.status === 'accepted';

      const { error } = await supabase
        .from('requests')
        .update({
          amount_received: newTotalReceived,
          payment_status: newStatus,
        })
        .eq('id', requestToRecordPayment.id);

      if (error) throw error;

      await adminAPI.updateRequestPaymentStatus(requestToRecordPayment, newStatus);

      Toast.show({ type: 'success', text1: isEditPaymentMode ? 'Amount Updated' : 'Payment Recorded' });
      setPaymentModalVisible(false);

      if (selectedRequest && selectedRequest.id === requestToRecordPayment.id) {
        setSelectedRequest({
          ...selectedRequest,
          amount_received: newTotalReceived,
          payment_status: newStatus,
          status: shouldAdvanceToProcessing ? 'processing' : selectedRequest.status,
        });
      }

      setRequestToRecordPayment(null);
      setIsEditPaymentMode(false);
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
    setRiderSearchQuery('');
    setAssignRiderModalVisible(true);
  };

  const handleConfirmAssignRider = async () => {
    if (!requestToAssignRider) return;
    if (!selectedRider) {
      Alert.alert('Error', 'Please select an employee rider.');
      return;
    }

    try {
      await adminAPI.assignRiderToRequest(requestToAssignRider.id, selectedRider.id);

      Toast.show({ type: 'success', text1: 'Rider Assigned' });
      setAssignRiderModalVisible(false);
      loadRequests(); // Refresh the list
    } catch (err) {
      console.error('Error assigning rider to request:', err);
      Toast.show({ type: 'error', text1: 'Assignment Failed', text2: err.message });
    }
  };

  const EnhancedRequestCard = ({ item, onMessageCustomer, onPhoneCall, openDetailsModal, openReceiptModal, handleUpdatePaymentStatus, onAssignRider, onUpdateStatus, onProvidePrice, onDecline, onPrintReceipt }) => {
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
              <Ionicons name="time-outline" size={14} color="#fff" />
              <Text style={styles.eoStatusText}>{getStatusLabel(item.status)}</Text>
            </View>
          </View>
        </View>

        {/* Customer Info */}
        <View style={styles.eoSection}>
          <View style={styles.eoCustomerHeader}>
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.eoLabel}>Customer</Text>
              <Text style={styles.eoCustomerName} numberOfLines={1}>{item.user_name}</Text>
            </View>
            <View style={styles.eoActionButtons}>
              <TouchableOpacity
                style={{ backgroundColor: '#6B7280', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}
                onPress={(e) => { e.stopPropagation(); onPrintReceipt(item); }}
              >
                <Ionicons name="print" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.eoIconBtnGreen} onPress={(e) => { e.stopPropagation(); onPhoneCall(item.contact_number || item.user_phone); }}>
                <Ionicons name="call" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.eoIconBtnBlue}
                onPress={(e) => { e.stopPropagation(); onMessageCustomer(item.users, item.user_name, item.user_email); }}
              >
                <Ionicons name="chatbubble" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.eoContactInfo}>
            {item.user_email && (<View style={styles.eoInfoRow}>
              <Ionicons name="mail" size={16} color="#9CA3AF" />
              <Text style={styles.eoInfoLabel}>Email:</Text>
              <Text style={styles.eoInfoTextBold}>{item.user_email}</Text>
            </View>)}
            {item.contact_number && (
              <View style={styles.eoInfoRow}>
                <Ionicons name="call" size={16} color="#9CA3AF" />
                <Text style={styles.eoInfoLabel}>Phone:</Text>
                <Text style={styles.eoInfoTextBold} numberOfLines={1}>{item.contact_number}</Text>
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
          {false && (
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
        ) : null}

        {/* Payment Details - Only shown after customer accepted (i.e. status != pending) */}
        {item.status !== 'pending' && (item.payment_status || item.final_price) && (
          <PaymentDetailsSection
            item={item}
            styles={styles}
            onRecordPay={() => {
              setRequestToRecordPayment(item);
              setPaymentAmount('');
              setIsEditPaymentMode(false);
              setPaymentModalVisible(true);
            }}
            onEditAmount={() => {
              setRequestToRecordPayment(item);
              setPaymentAmount(String(item.amount_received || ''));
              setIsEditPaymentMode(true);
              setPaymentModalVisible(true);
            }}
            onViewReceipt={(url) => openReceiptModal(url)}
            requireReceipt={true}
          />
        )}


        {/* Action to open full details */}
        <View style={styles.eoFooter}>
          <TouchableOpacity style={[styles.eoMainBtn, { backgroundColor: '#8B5CF6' }]} onPress={() => openDetailsModal(item)}>
            <Ionicons name="eye" size={18} color="#fff" />
            <Text style={styles.eoMainBtnText}>View Details</Text>
          </TouchableOpacity>

          {/* Phase 1: Pending - admin is yet to provide price */}
          {item.status === 'pending' && (item.type === 'booking' || item.type === 'special_order') && (
            <>
              <TouchableOpacity
                style={[styles.eoMainBtn, { backgroundColor: '#F59E0B', marginTop: 10 }]}
                onPress={() => onProvidePrice(item)}
              >
                <Text style={styles.eoMainBtnText}>Provide Price</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.eoMainBtn, { backgroundColor: '#EF4444', marginTop: 10 }]}
                onPress={() => onDecline(item)}
              >
                <Ionicons name="close-circle-outline" size={18} color="#fff" />
                <Text style={styles.eoMainBtnText}>Decline</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Phase 2+: Accepted or beyond - customer has agreed to price */}
          {!['pending', 'completed', 'cancelled', 'declined'].includes(item.status) && (
            <TouchableOpacity
              style={[
                styles.eoMainBtn,
                { marginTop: 10, backgroundColor: (item.payment_method?.toLowerCase() === 'gcash' || !item.payment_method) && item.payment_status !== 'paid' ? '#9CA3AF' : '#3B82F6' }
              ]}
              disabled={(item.payment_method?.toLowerCase() === 'gcash' || !item.payment_method) && item.payment_status !== 'paid'}
              onPress={() => onUpdateStatus(item)}
            >
              <Ionicons name="git-network-outline" size={18} color="#fff" />
              <Text style={styles.eoMainBtnText}>Change Status</Text>
            </TouchableOpacity>
          )}

          {/* Assign Rider: only when processing + delivery */}
          {item.delivery_method === 'delivery' && item.status === 'processing' && (
            <TouchableOpacity style={[styles.eoMainBtn, { backgroundColor: '#10B981', marginTop: 10 }]} onPress={() => onAssignRider(item)}>
              <Ionicons name="person-add-outline" size={18} color="#fff" />
              <Text style={styles.eoMainBtnText}>Assign Rider</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>Loading requests...</Text>
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      <Text style={styles.tabTitle}>Custom Order Requests</Text>

      {/* Scrollable Status Filters */}
      <View style={{ marginBottom: 15 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
          {requestStatusFilters.map((filter) => (
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
        data={filteredRequests}
        renderItem={({ item }) => <EnhancedRequestCard
          item={item}
          onMessageCustomer={handleMessageCustomer}
          onPhoneCall={handlePhoneCall}
          openDetailsModal={openDetailsModal}
          openReceiptModal={openReceiptModal}
          handleUpdatePaymentStatus={handleUpdatePaymentStatus}
          onAssignRider={handleAssignRider}
          onUpdateStatus={openRequestStatusModal}
          onProvidePrice={(req) => { setModalVisible(false); openQuoteModal(req); }}
          onDecline={handleDeclineRequest}
          onPrintReceipt={(item) => generateAndShareReceipt(item, true)}
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
                {selectedRequest.type !== 'booking' && (
                  <>
                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Type:</Text>
                      <Text style={styles.detailValue}>{getStatusLabel(selectedRequest.type)}</Text>
                    </View>
                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Submitted:</Text>
                      <Text style={styles.detailValue}>{formatTimestamp(selectedRequest.created_at)}</Text>
                    </View>
                  </>
                )}

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



                <View style={styles.actionButtons}>


                  {/* Accept and Decline for Pending Customized Requests */}
                  {selectedRequest.status === 'pending' && selectedRequest.type === 'customized' && (
                    <>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.acceptButton]}
                        onPress={() => handleAcceptPendingRequest(selectedRequest)}
                      >
                        <Text style={styles.buttonText}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.rejectButton]}
                        onPress={() => handleDeclineRequest(selectedRequest)}
                      >
                        <Text style={styles.buttonText}>Decline</Text>
                      </TouchableOpacity>
                    </>
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

              {(() => {
                if (!requestToUpdate) return null;
                const stepperStatuses = requestToUpdate.delivery_method === 'pickup' ? requestPickupStepperStatuses : requestDeliveryStepperStatuses;
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
                <Text style={styles.statusConfirmButtonText}>Proceed</Text>
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
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Provide Price</Text>
              <TouchableOpacity onPress={closeQuoteModal}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSubtitle, { textAlign: 'left', paddingHorizontal: 20 }]}>Request #{requestToQuote?.request_number}</Text>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={quoteStyles.quoteScrollContent}>
              {isCustomOrderQuote ? (
                <>
                  <View style={quoteStyles.quoteHeroCard}>
                    <View style={quoteStyles.quoteBadge}>
                      <Text style={quoteStyles.quoteBadgeText}>Custom Order</Text>
                    </View>
                    <Text style={quoteStyles.quoteHeroTitle}>{quoteFlowerContext?.arrangementType || 'Arrangement details unavailable'}</Text>

                    <View style={quoteStyles.quoteMetricsRow}>
                      <View style={quoteStyles.quoteMetricCard}>
                        <Text style={quoteStyles.quoteMetricValue}>{quoteFlowerContext?.arrangementQuantity || 1}</Text>
                        <Text style={quoteStyles.quoteMetricLabel}>Pieces</Text>
                      </View>
                      <View style={quoteStyles.quoteMetricCard}>
                        <Text style={quoteStyles.quoteMetricValue}>{quoteFlowerTypes.length}</Text>
                        <Text style={quoteStyles.quoteMetricLabel}>Flower Types</Text>
                      </View>
                      <View style={quoteStyles.quoteMetricCard}>
                        <Text style={quoteStyles.quoteMetricValue}>{quoteFlowerContext?.totalFlowers || 0}</Text>
                        <Text style={quoteStyles.quoteMetricLabel}>Stems</Text>
                      </View>
                    </View>

                    {quoteArrangementSelections.length ? (
                      <View style={quoteStyles.quoteBreakdownSection}>
                        <Text style={quoteStyles.quoteSectionLabel}>Arrangement Breakdown</Text>
                        {quoteArrangementSelections.map((selection, index) => (
                          <View key={`${selection.arrangementLabel}-${index}`} style={quoteStyles.quoteBreakdownRow}>
                            <View style={quoteStyles.quoteBreakdownIndex}>
                              <Text style={quoteStyles.quoteBreakdownIndexText}>{index + 1}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={quoteStyles.quoteBreakdownTitle}>{selection.arrangementLabel}</Text>
                              <Text style={quoteStyles.quoteBreakdownMeta}>
                                {selection.quantity} arrangement{selection.quantity > 1 ? 's' : ''}
                                {selection.flowersPerArrangement > 0 ? ' ? ' + selection.flowersPerArrangement + ' flowers each' : ''}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>

                  <View style={quoteStyles.quoteSectionHeader}>
                    <Text style={quoteStyles.quoteSectionTitle}>Flower Pricing</Text>
                    <Text style={quoteStyles.quoteSectionHint}>Set the unit price for each flower type, then review the live quote below.</Text>
                  </View>

                  {quoteFlowerTypes.length ? (
                    quoteFlowerTypes.map((flowerName) => {
                      const row = quoteBreakdownLookup[flowerName] || {
                        quantity: quoteFlowerContext?.flowerQuantities?.[flowerName] || 0,
                        unitPrice: parseCurrencyNumber(quoteFlowerPrices[flowerName]),
                        lineTotal: 0,
                      };

                      return (
                        <View key={flowerName} style={quoteStyles.quoteInputCard}>
                          <View style={quoteStyles.quoteInputHeader}>
                            <View style={{ flex: 1 }}>
                              <Text style={quoteStyles.quoteInputTitle}>{flowerName}</Text>
                              <Text style={quoteStyles.quoteInputHint}>{row.quantity} flowers allocated to this request</Text>
                            </View>
                            <Text style={quoteStyles.quoteInputLineTotal}>{formatCurrency(row.lineTotal)}</Text>
                          </View>

                          <View style={quoteStyles.quoteCurrencyInputRow}>
                            <View style={quoteStyles.quoteCurrencyPrefix}>
                              <Text style={quoteStyles.quoteCurrencyPrefixText}>PHP</Text>
                            </View>
                            <TextInput
                              style={quoteStyles.quoteCurrencyInput}
                              placeholder="0.00"
                              keyboardType="decimal-pad"
                              value={quoteFlowerPrices[flowerName] || ''}
                              onChangeText={(value) => updateQuoteFlowerPrice(flowerName, value)}
                            />
                            <Text style={quoteStyles.quoteCurrencySuffix}>/ flower</Text>
                          </View>
                        </View>
                      );
                    })
                  ) : (
                    <Text style={quoteStyles.quoteAlertText}>No flower types found in this request.</Text>
                  )}

                  <View style={quoteStyles.quoteInfoCard}>
                    <Text style={quoteStyles.quoteInfoLabel}>Applied Delivery Fee</Text>
                    <Text style={quoteStyles.quoteInfoValue}>{formatCurrency(quoteShippingValue)}</Text>
                    <Text style={quoteStyles.quoteInfoHint}>This comes from the saved barangay delivery fee or pickup selection.</Text>
                  </View>

                  <View style={quoteStyles.quoteTotalCard}>
                    <Text style={quoteStyles.quoteSectionLabel}>Live Quote</Text>

                    {quoteBreakdownRows.map((row) => (
                      <View key={row.flowerName} style={quoteStyles.quoteTotalRow}>
                        <View style={{ flex: 1, paddingRight: 12 }}>
                          <Text style={quoteStyles.quoteTotalLabel}>{row.flowerName}</Text>
                          <Text style={quoteStyles.quoteTotalMeta}>{row.quantity} x {formatCurrency(row.unitPrice)}</Text>
                        </View>
                        <Text style={quoteStyles.quoteTotalValue}>{formatCurrency(row.lineTotal)}</Text>
                      </View>
                    ))}

                    <View style={[quoteStyles.quoteTotalRow, quoteStyles.quoteTotalDivider]}>
                      <Text style={quoteStyles.quoteTotalLabel}>Flower Subtotal</Text>
                      <Text style={quoteStyles.quoteTotalValue}>{formatCurrency(quoteFlowerSubtotal)}</Text>
                    </View>

                    <View style={quoteStyles.quoteTotalRow}>
                      <Text style={quoteStyles.quoteTotalLabel}>Shipping Fee</Text>
                      <Text style={quoteStyles.quoteTotalValue}>{formatCurrency(quoteShippingValue)}</Text>
                    </View>

                    <View style={[quoteStyles.quoteTotalRow, quoteStyles.quoteTotalDivider]}>
                      <Text style={quoteStyles.quoteGrandTotalLabel}>Total Price to Pay</Text>
                      <Text style={quoteStyles.quoteGrandTotalValue}>{formatCurrency(quoteTotalToPay)}</Text>
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <View style={quoteStyles.quoteSectionHeader}>
                    <Text style={quoteStyles.quoteSectionTitle}>Quote Details</Text>
                    <Text style={quoteStyles.quoteSectionHint}>Enter the item price. Delivery fee is taken from the saved request fee setup.</Text>
                  </View>

                  <View style={quoteStyles.quoteInputCard}>
                    <View style={quoteStyles.quoteInputHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={quoteStyles.quoteInputTitle}>Item Price</Text>
                        <Text style={quoteStyles.quoteInputHint}>Base price for the requested item or service.</Text>
                      </View>
                      <Text style={quoteStyles.quoteInputLineTotal}>{formatCurrency(parseCurrencyNumber(quoteAmount))}</Text>
                    </View>

                    <View style={quoteStyles.quoteCurrencyInputRow}>
                      <View style={quoteStyles.quoteCurrencyPrefix}>
                        <Text style={quoteStyles.quoteCurrencyPrefixText}>PHP</Text>
                      </View>
                      <TextInput
                        style={quoteStyles.quoteCurrencyInput}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        value={quoteAmount}
                        onChangeText={(value) => setQuoteAmount(value.replace(/[^0-9.]/g, ''))}
                      />
                      <Text style={quoteStyles.quoteCurrencySuffix}>/ order</Text>
                    </View>
                  </View>

                  <View style={quoteStyles.quoteInfoCard}>
                    <Text style={quoteStyles.quoteInfoLabel}>Applied Delivery Fee</Text>
                    <Text style={quoteStyles.quoteInfoValue}>{formatCurrency(quoteShippingValue)}</Text>
                    <Text style={quoteStyles.quoteInfoHint}>This comes from the saved barangay delivery fee or pickup selection.</Text>
                  </View>

                  <View style={quoteStyles.quoteTotalCard}>
                    <Text style={quoteStyles.quoteSectionLabel}>Quote Summary</Text>

                    <View style={quoteStyles.quoteTotalRow}>
                      <Text style={quoteStyles.quoteTotalLabel}>Item Price</Text>
                      <Text style={quoteStyles.quoteTotalValue}>{formatCurrency(parseCurrencyNumber(quoteAmount))}</Text>
                    </View>

                    <View style={quoteStyles.quoteTotalRow}>
                      <Text style={quoteStyles.quoteTotalLabel}>Shipping Fee</Text>
                      <Text style={quoteStyles.quoteTotalValue}>{formatCurrency(quoteShippingValue)}</Text>
                    </View>

                    <View style={[quoteStyles.quoteTotalRow, quoteStyles.quoteTotalDivider]}>
                      <Text style={quoteStyles.quoteGrandTotalLabel}>Total Price to Pay</Text>
                      <Text style={quoteStyles.quoteGrandTotalValue}>{formatCurrency(parseCurrencyNumber(quoteAmount) + quoteShippingValue)}</Text>
                    </View>
                  </View>
                </>
              )}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={closeQuoteModal}
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

      {/* Decline Request Modal */}
      <Modal visible={declineModalVisible} animationType="fade" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Decline Request</Text>
              <TouchableOpacity disabled={isDeclining} onPress={() => { setDeclineModalVisible(false); setRequestToDecline(null); setDeclineFeedback(''); }}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSubtitle, { textAlign: 'left', paddingHorizontal: 20 }]}>Request #{requestToDecline?.request_number}</Text>
            <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
              <Text style={[styles.inputLabel, { marginBottom: 6 }]}>Feedback to customer</Text>
              <TextInput
                style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
                placeholder="Explain why this request is being declined"
                multiline
                value={declineFeedback}
                onChangeText={setDeclineFeedback}
                editable={!isDeclining}
              />
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => { setDeclineModalVisible(false); setRequestToDecline(null); setDeclineFeedback(''); }}
                disabled={isDeclining}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#EF4444' }]}
                onPress={submitDeclineRequest}
                disabled={isDeclining}
              >
                <Text style={styles.buttonText}>{isDeclining ? 'Declining...' : 'Decline Request'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => { setAssignRiderModalVisible(false); setRiderSearchQuery(''); setSelectedRider(null); }}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleConfirmAssignRider} disabled={!selectedRider}>
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
            <Text style={styles.modalTitle}>{isEditPaymentMode ? 'Edit Amount Received' : 'Record GCash Payment'}</Text>
            <View style={{ marginBottom: 15 }}>
              <Text style={{ marginBottom: 5 }}>Currently Received: PHP {requestToRecordPayment?.amount_received || 0}</Text>
              <Text style={{ marginBottom: 5 }}>Total Amount: PHP {requestToRecordPayment?.final_price || 0}</Text>
              <Text style={{ marginBottom: 10, fontWeight: 'bold', color: '#EF4444' }}>
                Balance: PHP {(requestToRecordPayment?.final_price || 0) - (requestToRecordPayment?.amount_received || 0)}
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

    </View >
  );
};

export default RequestsTab;











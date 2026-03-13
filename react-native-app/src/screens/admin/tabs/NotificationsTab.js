import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BASE_URL } from '../../../config/api';
import { supabase } from '../../../config/supabase';
import RiderAssignmentPreview from '../components/RiderAssignmentPreview';
import styles from '../../AdminDashboard.styles';
import { formatTimestamp, getPaymentStatusDisplay, getStatusColor, getStatusLabel } from '../adminHelpers';

const ORDER_DETAIL_SELECT = `
  id,
  created_at,
  order_number,
  status,
  payment_status,
  payment_method,
  pickup_time,
  total,
  subtotal,
  shipping_fee,
  delivery_method,
  amount_received,
  shipping_address: addresses!address_id(*),
  users (
    id,
    name,
    email,
    phone
  ),
  order_items (
    product_id,
    quantity,
    price,
    products (
      name,
      image_url
    )
  )
`;

const REQUEST_DETAIL_SELECT = `
  id,
  request_number,
  type,
  status,
  contact_number,
  image_url,
  notes,
  data,
  created_at,
  delivery_method,
  pickup_time,
  final_price,
  shipping_fee,
  payment_status,
  amount_received,
  users (
    id,
    name,
    email,
    phone
  )
`;

const resolveNotificationTarget = (link) => {
  const normalizedLink = String(link || '').trim().toLowerCase().replace(/^\/+/, '');
  const directEntityMatch = normalizedLink.match(/^(orders|requests)\/(\d+)/);

  if (directEntityMatch) {
    const [, entityPath, entityId] = directEntityMatch;
    return {
      tab: entityPath === 'orders' ? 'orders' : 'requests',
      entityType: entityPath === 'orders' ? 'order' : 'request',
      entityId: Number(entityId),
    };
  }

  if (normalizedLink.includes('request')) {
    return { tab: 'requests', entityType: 'request', entityId: null };
  }

  if (normalizedLink.includes('order')) {
    return { tab: 'orders', entityType: 'order', entityId: null };
  }

  if (normalizedLink.includes('message')) {
    return { tab: 'messaging', entityType: null, entityId: null };
  }

  if (normalizedLink.includes('stock')) {
    return { tab: 'stock', entityType: null, entityId: null };
  }

  if (normalizedLink.includes('fee')) {
    return { tab: 'fees', entityType: null, entityId: null };
  }

  return { tab: null, entityType: null, entityId: null };
};

const formatCurrency = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

const formatDeliveryMethod = (deliveryMethod) => {
  if (deliveryMethod === 'pickup') return 'Pick-up';
  if (deliveryMethod === 'delivery') return 'Delivery';
  return getStatusLabel(deliveryMethod || 'order');
};

const toAbsoluteImageUrl = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return normalized.startsWith('http') ? normalized : `${BASE_URL}${normalized}`;
};

const parseMaybeJson = (value) => {
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

const pickFirstValue = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (value !== undefined && value !== null && value !== '') {
      return String(value);
    }
  }
  return null;
};

const compactRows = (rows) =>
  rows.filter((row) => row.value !== null && row.value !== undefined && row.value !== '');

const formatRequestTypeLabel = (requestType) => {
  if (requestType === 'booking') return 'Custom Order';
  if (requestType === 'customized') return 'Customized Bouquet';
  if (requestType === 'special_order') return 'Special Order';
  return getStatusLabel(requestType);
};

const buildOrderPreview = (order) => {
  const items = (order.order_items || []).map((item) => ({
    label: `${item.quantity} x ${item.products?.name || 'Unknown Product'}`,
    secondary: formatCurrency(item.price),
    imageUri: toAbsoluteImageUrl(item.products?.image_url),
  }));

  let shippingAddressDescription = null;
  if (order.shipping_address) {
    const { street, barangay, city, zip } = order.shipping_address;
    shippingAddressDescription = [street, barangay, city, zip].filter(Boolean).join(', ');
  }

  return {
    eyebrow: 'Assigned order',
    title: `Order #${order.order_number}`,
    statusLabel: getStatusLabel(order.status),
    statusColor: getStatusColor(order.status),
    metaPills: [
      {
        icon: order.delivery_method === 'delivery' ? 'rocket-outline' : 'business-outline',
        label: formatDeliveryMethod(order.delivery_method),
      },
      {
        icon: 'person-outline',
        label: 'Assigned to you',
      },
    ],
    sections: [
      {
        title: 'Customer',
        rows: compactRows([
          { label: 'Name', value: order.users?.name || 'N/A' },
          { label: 'Phone', value: order.users?.phone || null },
          { label: 'Email', value: order.users?.email || null },
        ]),
      },
      {
        title: 'Fulfillment',
        rows: compactRows([
          { label: 'Created', value: formatTimestamp(order.created_at) },
          {
            label: order.delivery_method === 'delivery' ? 'Address' : 'Pickup time',
            value: order.delivery_method === 'delivery'
              ? shippingAddressDescription
              : order.pickup_time,
          },
        ]),
      },
    ],
    itemsTitle: 'Items',
    items,
    totalsTitle: 'Payment',
    totals: compactRows([
      { label: 'Method', value: getStatusLabel(order.payment_method) },
      {
        label: 'Status',
        value: getPaymentStatusDisplay(order.payment_status, order.payment_method),
      },
      { label: 'Subtotal', value: formatCurrency(order.subtotal) },
      { label: 'Shipping', value: formatCurrency(order.shipping_fee) },
      { label: 'Total', value: formatCurrency(order.total), emphasis: true },
    ]),
  };
};

const buildRequestPreview = (request) => {
  const requestData = parseMaybeJson(request.data);
  const deliveryMethod = requestData.delivery_method || request.delivery_method;
  const requestTypeLabel = formatRequestTypeLabel(request.type);
  const paymentMethod = requestData.payment_method || 'gcash';
  const arrangements = Array.isArray(requestData.arrangementSelections)
    ? requestData.arrangementSelections
        .map((selection) => {
          const label =
            selection?.arrangement_label ||
            selection?.arrangementLabel ||
            selection?.arrangement_type ||
            selection?.arrangementType;
          const quantity = selection?.quantity || selection?.arrangement_quantity || 1;
          if (!label) return null;
          return {
            label: `${quantity} x ${label}`,
            secondary: 'Arrangement',
            imageUri: null,
          };
        })
        .filter(Boolean)
    : [];
  const customizedItems = Array.isArray(requestData.items)
    ? requestData.items.map((item, index) => {
        const flowers = Array.isArray(item?.flowers)
          ? item.flowers
              .map((flower) => flower?.name || flower?.label || flower?.value || flower)
              .filter(Boolean)
              .join(', ')
          : null;
        const wrapper = item?.wrapper?.name || null;
        const ribbon = item?.ribbon?.name || null;
        const summaryParts = [
          flowers ? `Flowers: ${flowers}` : null,
          wrapper ? `Wrapper: ${wrapper}` : null,
          ribbon ? `Ribbon: ${ribbon}` : null,
        ].filter(Boolean);

        return {
          label: item?.bundleSize ? `${item.bundleSize} stems` : `Customized bouquet ${index + 1}`,
          secondary: summaryParts.join(' | '),
          imageUri: toAbsoluteImageUrl(item?.image_url),
        };
      })
    : [];
  const attachments = [];
  const seenAttachmentUris = new Set();

  const pushAttachment = (uri, label) => {
    const absoluteUri = toAbsoluteImageUrl(uri);
    if (!absoluteUri || seenAttachmentUris.has(absoluteUri)) return;
    seenAttachmentUris.add(absoluteUri);
    attachments.push({ uri: absoluteUri, label });
  };

  pushAttachment(request.image_url, `${requestTypeLabel} attachment`);
  customizedItems.forEach((item, index) => {
    pushAttachment(item.imageUri, item.label || `Image ${index + 1}`);
  });

  const requestSpecificRows = [];
  if (request.type === 'booking') {
    requestSpecificRows.push(
      { label: 'Occasion', value: pickFirstValue(requestData.occasion, requestData.otherOccasion) },
      { label: 'Recipient', value: pickFirstValue(requestData.recipientName, requestData.recipient_name) },
      { label: 'Event date', value: pickFirstValue(requestData.eventDate, requestData.event_date) },
      { label: 'Venue', value: pickFirstValue(requestData.venue, requestData.deliveryAddress, requestData.delivery_address) }
    );
  } else if (request.type === 'customized') {
    requestSpecificRows.push(
      {
        label: 'Flowers',
        value: pickFirstValue(
          customizedItems.map((item) => item.secondary).filter(Boolean).join(' | '),
          requestData?.flower?.name
        ),
      },
      {
        label: 'Bouquet size',
        value: pickFirstValue(
          customizedItems.map((item) => item.label).join(', '),
          requestData?.bundleSize
        ),
      }
    );
  } else {
    requestSpecificRows.push(
      { label: 'Occasion', value: pickFirstValue(requestData.occasion) },
      { label: 'Recipient', value: pickFirstValue(requestData.recipient_name, requestData.recipientName) },
      { label: 'Card message', value: pickFirstValue(requestData.message) }
    );
  }

  if (request.notes) {
    requestSpecificRows.push({ label: 'Notes', value: request.notes });
  }

  const previewItems =
    request.type === 'customized'
      ? customizedItems
      : arrangements;

  return {
    eyebrow: 'Assigned request',
    title: `${requestTypeLabel} #${request.request_number}`,
    statusLabel: getStatusLabel(request.status),
    statusColor: getStatusColor(request.status),
    metaPills: [
      {
        icon: deliveryMethod === 'delivery' ? 'rocket-outline' : 'business-outline',
        label: formatDeliveryMethod(deliveryMethod),
      },
      {
        icon: 'person-outline',
        label: 'Assigned to you',
      },
      {
        icon: 'pricetag-outline',
        label: requestTypeLabel,
      },
    ],
    attachmentsTitle: 'Photos',
    attachments,
    sections: [
      {
        title: 'Customer',
        rows: compactRows([
          { label: 'Name', value: request.users?.name || 'N/A' },
          { label: 'Phone', value: pickFirstValue(request.contact_number, request.users?.phone) },
          { label: 'Email', value: request.users?.email || null },
        ]),
      },
      {
        title: 'Request details',
        rows: compactRows([
          { label: 'Created', value: formatTimestamp(request.created_at) },
          { label: 'Type', value: requestTypeLabel },
          ...requestSpecificRows,
        ]),
      },
      {
        title: 'Fulfillment',
        rows: compactRows([
          {
            label: deliveryMethod === 'delivery' ? 'Address' : 'Pickup time',
            value: deliveryMethod === 'delivery'
              ? pickFirstValue(requestData.deliveryAddress, requestData.delivery_address, requestData.venue)
              : pickFirstValue(requestData.pickup_time, request.pickup_time),
          },
        ]),
      },
    ],
    itemsTitle: request.type === 'customized' ? 'Bouquet summary' : 'Request summary',
    items: previewItems,
    totalsTitle: 'Payment',
    totals: compactRows([
      { label: 'Method', value: getStatusLabel(paymentMethod) },
      { label: 'Status', value: getPaymentStatusDisplay(request.payment_status, paymentMethod) },
      request.shipping_fee !== undefined && request.shipping_fee !== null
        ? { label: 'Shipping', value: formatCurrency(request.shipping_fee) }
        : null,
      request.final_price !== undefined && request.final_price !== null
        ? { label: 'Total', value: formatCurrency(request.final_price), emphasis: true }
        : null,
    ].filter(Boolean)),
  };
};

const NotificationsTab = ({ currentUser, setActiveTab, refreshUnreadCount }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedNotificationId, setExpandedNotificationId] = useState(null);
  const [loadingPreviewNotificationId, setLoadingPreviewNotificationId] = useState(null);
  const [previewByNotificationId, setPreviewByNotificationId] = useState({});
  const [previewErrorsByNotificationId, setPreviewErrorsByNotificationId] = useState({});

  const loadNotifications = async ({ silent = false } = {}) => {
    if (!currentUser?.id) return;
    if (!silent) setLoading(true);

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications(data || []);
      refreshUnreadCount?.();
    } catch (error) {
      console.error('Error loading notifications:', error);
      if (!silent) {
        Alert.alert('Error', 'Failed to load notifications.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    setExpandedNotificationId(null);
    setLoadingPreviewNotificationId(null);
    setPreviewByNotificationId({});
    setPreviewErrorsByNotificationId({});
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return undefined;

    loadNotifications();

    const channel = supabase
      .channel(`notifications:${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUser.id}`,
        },
        () => {
          loadNotifications({ silent: true });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id]);

  const markAsRead = async (notificationId) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) {
      throw error;
    }

    setNotifications((currentNotifications) =>
      currentNotifications.map((notification) =>
        notification.id === notificationId
          ? { ...notification, is_read: true }
          : notification
      )
    );
    refreshUnreadCount?.();
  };

  const loadPreviewForNotification = async (notificationId, target) => {
    setLoadingPreviewNotificationId(notificationId);
    setPreviewErrorsByNotificationId((currentErrors) => ({
      ...currentErrors,
      [notificationId]: null,
    }));

    try {
      if (target.entityType === 'order') {
        const { data, error } = await supabase
          .from('orders')
          .select(ORDER_DETAIL_SELECT)
          .eq('id', target.entityId)
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('Assigned order was not found.');

        setPreviewByNotificationId((currentPreviews) => ({
          ...currentPreviews,
          [notificationId]: buildOrderPreview(data),
        }));
      } else if (target.entityType === 'request') {
        const { data, error } = await supabase
          .from('requests')
          .select(REQUEST_DETAIL_SELECT)
          .eq('id', target.entityId)
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('Assigned request was not found.');

        setPreviewByNotificationId((currentPreviews) => ({
          ...currentPreviews,
          [notificationId]: buildRequestPreview(data),
        }));
      }
    } catch (error) {
      console.error('Error loading assignment preview:', error);
      setPreviewErrorsByNotificationId((currentErrors) => ({
        ...currentErrors,
        [notificationId]: 'Could not load the assigned details.',
      }));
    } finally {
      setLoadingPreviewNotificationId((currentLoadingId) =>
        currentLoadingId === notificationId ? null : currentLoadingId
      );
    }
  };

  const handleNotificationPress = async (notification) => {
    try {
      if (!notification.is_read) {
        await markAsRead(notification.id);
      }

      const target = resolveNotificationTarget(notification.link);
      const isExpandableAssignment =
        notification.type === 'rider_assignment' &&
        Boolean(target.entityId) &&
        (target.entityType === 'order' || target.entityType === 'request');

      if (isExpandableAssignment) {
        const isCollapsing = expandedNotificationId === notification.id;
        setExpandedNotificationId(isCollapsing ? null : notification.id);

        if (!isCollapsing && !previewByNotificationId[notification.id]) {
          await loadPreviewForNotification(notification.id, target);
        }
        return;
      }

      if (target.tab) {
        setActiveTab?.(target.tab);
      } else {
        await loadNotifications({ silent: true });
      }
    } catch (error) {
      console.error('Error opening notification:', error);
      Alert.alert('Error', 'Failed to open notification.');
    }
  };

  const handleDelete = async (notificationId) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;

      if (expandedNotificationId === notificationId) {
        setExpandedNotificationId(null);
      }

      setPreviewByNotificationId((currentPreviews) => {
        const nextPreviews = { ...currentPreviews };
        delete nextPreviews[notificationId];
        return nextPreviews;
      });
      setPreviewErrorsByNotificationId((currentErrors) => {
        const nextErrors = { ...currentErrors };
        delete nextErrors[notificationId];
        return nextErrors;
      });

      await loadNotifications({ silent: true });
    } catch (error) {
      console.error('Error deleting notification:', error);
      Alert.alert('Error', 'Failed to delete notification.');
    }
  };

  const renderExpandedContent = (notificationId) => {
    if (loadingPreviewNotificationId === notificationId) {
      return (
        <View style={styles.notificationExpandedPanel}>
          <View style={styles.notificationDetailLoadingRow}>
            <ActivityIndicator size="small" color="#ec4899" />
            <Text style={styles.notificationDetailLoadingText}>Loading assigned details...</Text>
          </View>
        </View>
      );
    }

    const errorMessage = previewErrorsByNotificationId[notificationId];
    if (errorMessage) {
      return (
        <View style={styles.notificationExpandedPanel}>
          <View style={styles.notificationDetailErrorRow}>
            <Ionicons name="alert-circle-outline" size={16} color="#dc2626" />
            <Text style={styles.notificationDetailErrorText}>{errorMessage}</Text>
          </View>
        </View>
      );
    }

    return <RiderAssignmentPreview preview={previewByNotificationId[notificationId]} />;
  };

  if (loading && !notifications.length) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>Loading notifications...</Text>
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      <Text style={styles.tabTitle}>Notifications</Text>

      <FlatList
        data={notifications}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => {
          const target = resolveNotificationTarget(item.link);
          const canExpandAssignment =
            item.type === 'rider_assignment' &&
            Boolean(target.entityId) &&
            (target.entityType === 'order' || target.entityType === 'request');
          const isExpanded = expandedNotificationId === item.id;

          return (
            <View
              style={[
                styles.notificationCard,
                !item.is_read && { borderWidth: 1, borderColor: '#f9a8d4' },
                isExpanded && styles.notificationCardExpanded,
              ]}
            >
              <TouchableOpacity
                style={styles.notificationContent}
                onPress={() => handleNotificationPress(item)}
                activeOpacity={0.88}
              >
                <View style={styles.notificationHeadingRow}>
                  <View style={styles.notificationTitleRow}>
                    <Ionicons
                      name={item.is_read ? 'notifications-outline' : 'notifications'}
                      size={18}
                      color={item.is_read ? '#9ca3af' : '#ec4899'}
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.notificationTitle}>{item.title}</Text>
                  </View>

                  {canExpandAssignment ? (
                    <View style={styles.notificationExpandHint}>
                      <Text style={styles.notificationExpandHintText}>
                        {isExpanded ? 'Hide details' : 'View details'}
                      </Text>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color="#ec4899"
                      />
                    </View>
                  ) : null}
                </View>

                <Text style={styles.notificationMessage}>{item.message}</Text>
                <Text style={styles.notificationDate}>{formatTimestamp(item.created_at)}</Text>

                {isExpanded ? renderExpandedContent(item.id) : null}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteIconButton}
                onPress={() => handleDelete(item.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={18} color="#f44336" />
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No notifications yet</Text>
        }
      />
    </View>
  );
};

export default NotificationsTab;

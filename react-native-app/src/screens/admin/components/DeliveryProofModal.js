import React, { useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import styles from '../../AdminDashboard.styles';
import {
  canCurrentUserCompleteRiderStop,
  DELIVERY_CONFIRMATION_OWNER,
  DELIVERY_CONFIRMATION_STATUS,
  getDeliveryStopAssignedRiderId,
  getDeliveryStopDisplayLabel,
} from '../../../utils/deliveryDestinations';

const getAssignedRiderName = (stop, riderLookup = {}, fallbackAssignedRiderId = null) => {
  const assignedRiderId = getDeliveryStopAssignedRiderId(stop, fallbackAssignedRiderId);
  if (!assignedRiderId) {
    return '';
  }

  return riderLookup?.[String(assignedRiderId)]?.name || '';
};

const getSelectedStopMessage = ({
  stop,
  currentUserId,
  currentRecordStatus,
  fallbackAssignedRiderId,
  riderLookup,
}) => {
  if (!stop) {
    return '';
  }

  if (!stop.confirmation_owner) {
    return 'Delivery confirmation is not configured for this stop yet.';
  }

  if (stop.confirmation_owner === DELIVERY_CONFIRMATION_OWNER.CUSTOMER) {
    return 'This stop will stay open until the ordering customer confirms it on tracking.';
  }

  if (stop.confirmation_status === DELIVERY_CONFIRMATION_STATUS.CONFIRMED) {
    return 'This stop is already confirmed.';
  }

  if (String(currentRecordStatus || '').trim().toLowerCase() !== 'out_for_delivery') {
    return 'Proof can only be uploaded once this delivery is marked out for delivery.';
  }

  const assignedRiderId = getDeliveryStopAssignedRiderId(stop, fallbackAssignedRiderId);
  if (!assignedRiderId) {
    return 'Assign an employee rider to this stop before proof can be uploaded.';
  }

  if (String(currentUserId || '').trim() !== assignedRiderId) {
    const assignedRiderName = getAssignedRiderName(stop, riderLookup, fallbackAssignedRiderId);
    return assignedRiderName
      ? `Only ${assignedRiderName} can upload proof for this stop.`
      : 'Only the assigned rider can upload proof for this stop.';
  }

  return '';
};

const getNormalizedSelectedProof = (asset = {}) => {
  const normalizedUri = String(asset?.uri || '').trim();
  const uriFileName = normalizedUri.split(/[\\/]/).pop()?.split('?')[0] || '';
  const fileName = String(asset?.fileName || asset?.name || uriFileName || `delivery-proof-${Date.now()}.jpg`).trim();
  const mimeType = String(asset?.mimeType || asset?.type || '').trim().toLowerCase() || 'image/jpeg';
  const base64 = String(asset?.base64 || '').trim();

  return {
    ...asset,
    uri: normalizedUri,
    fileName,
    name: fileName,
    mimeType,
    type: mimeType,
    base64,
  };
};

const DeliveryProofModal = ({
  visible,
  onClose,
  recordLabel,
  stops = [],
  selectedStopKey,
  onSelectStop,
  selectedProof,
  onChangeProof,
  proofNote,
  onChangeProofNote,
  onSubmit,
  isSubmitting = false,
  currentUserId = null,
  currentRecordStatus = '',
  fallbackAssignedRiderId = null,
  riderLookup = {},
  confirmButtonLabel = 'Complete Stop',
}) => {
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const modalMaxHeight = Math.max(460, Math.min(screenHeight - 36, 780));
  const isCompactFooter = screenWidth <= 480;
  const [expandedProofVisible, setExpandedProofVisible] = useState(false);
  const effectiveFallbackAssignedRiderId = stops.length <= 1 ? fallbackAssignedRiderId : null;

  const closeModal = () => {
    setExpandedProofVisible(false);
    onClose?.();
  };

  const openProofViewer = () => {
    if (previewUri) {
      setExpandedProofVisible(true);
    }
  };

  const closeProofViewer = () => {
    setExpandedProofVisible(false);
  };

  const selectedStop = useMemo(
    () => stops.find((stop) => stop.unit_key === selectedStopKey) || stops[0] || null,
    [selectedStopKey, stops]
  );

  const canCompleteSelectedStop = useMemo(
    () => canCurrentUserCompleteRiderStop(
      selectedStop,
      currentUserId,
      currentRecordStatus,
      effectiveFallbackAssignedRiderId
    ),
    [currentRecordStatus, currentUserId, effectiveFallbackAssignedRiderId, selectedStop]
  );

  const selectedStopMessage = useMemo(
    () => getSelectedStopMessage({
      stop: selectedStop,
      currentUserId,
      currentRecordStatus,
      fallbackAssignedRiderId: effectiveFallbackAssignedRiderId,
      riderLookup,
    }),
    [currentRecordStatus, currentUserId, effectiveFallbackAssignedRiderId, riderLookup, selectedStop]
  );

  const previewUri = selectedProof?.uri || selectedStop?.proof_image_url || null;
  const hasSelectedProof = Boolean(String(selectedProof?.uri || '').trim() || String(selectedProof?.base64 || '').trim());

  useEffect(() => {
    if (!visible) {
      setExpandedProofVisible(false);
    }
  }, [visible]);

  const pickDeliveryProofImage = async () => {
    if (!canCompleteSelectedStop || isSubmitting) {
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission?.granted) {
        Alert.alert(
          'Photo Access Needed',
          'Please allow photo library access so the rider can upload a delivery proof.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const normalizedProof = getNormalizedSelectedProof(result.assets[0]);
      console.log('[admin-perf] delivery proof picker selected', {
        uriScheme: normalizedProof.uri?.split(':')[0] || 'unknown',
        hasBase64: Boolean(normalizedProof.base64),
        fileName: normalizedProof.fileName,
        mimeType: normalizedProof.mimeType,
      });
      onChangeProof?.(normalizedProof);
    } catch (error) {
      console.error('Error picking delivery proof image:', error);
      Alert.alert(
        'Proof Photo Error',
        'We could not open or read the selected photo. Please try again.'
      );
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={closeModal}
    >
      <View style={styles.statusModalBackdrop}>
        <View style={[styles.timelineModalContainer, { maxHeight: modalMaxHeight, height: modalMaxHeight }]}>
          <View style={styles.statusModalHeader}>
            <Text style={styles.statusModalTitle}>Complete Delivery Stop</Text>
          </View>

          <View style={{ flex: 1, minHeight: 0 }}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
            >
              {recordLabel ? (
                <Text style={styles.timelineOrderNumber}>{recordLabel}</Text>
              ) : null}

              {!stops.length ? (
                <View style={{
                  borderRadius: 14,
                  backgroundColor: '#F9FAFB',
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  padding: 16,
                }}>
                  <Text style={{ fontSize: 13, lineHeight: 20, color: '#6B7280' }}>
                    No delivery stops are ready for proof yet.
                  </Text>
                </View>
              ) : null}

              {stops.map((stop, index) => {
                const isSelected = selectedStopKey === stop.unit_key;
                const isConfirmed = stop.confirmation_status === DELIVERY_CONFIRMATION_STATUS.CONFIRMED;
                const isCustomerOwned = stop.confirmation_owner === DELIVERY_CONFIRMATION_OWNER.CUSTOMER;
                const assignedRiderName = getAssignedRiderName(stop, riderLookup, effectiveFallbackAssignedRiderId);

                return (
                  <TouchableOpacity
                    key={stop.unit_key || `delivery-stop-${index + 1}`}
                    activeOpacity={0.88}
                    onPress={() => onSelectStop?.(stop.unit_key)}
                    style={{
                      borderWidth: 1,
                      borderColor: isSelected ? '#EC4899' : '#E5E7EB',
                      backgroundColor: isSelected ? '#FFF1F7' : '#FFFFFF',
                      borderRadius: 16,
                      padding: 14,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>
                          {getDeliveryStopDisplayLabel(stop, index)}
                        </Text>
                        <Text style={{ marginTop: 4, fontSize: 12, color: '#6B7280' }}>
                          {stop.recipient_name || `Stop ${index + 1}`}
                          {stop.recipient_phone ? ` - ${stop.recipient_phone}` : ''}
                        </Text>
                        {stop.addressText ? (
                          <Text style={{ marginTop: 4, fontSize: 12, color: '#6B7280' }}>
                            {stop.addressText}
                          </Text>
                        ) : null}
                        {assignedRiderName ? (
                          <Text style={{ marginTop: 8, fontSize: 12, color: '#2563EB', fontWeight: '600' }}>
                            Assigned rider: {assignedRiderName}
                          </Text>
                        ) : null}
                      </View>

                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        <View style={{
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 999,
                          backgroundColor: isCustomerOwned ? '#FCE7F3' : '#EDE9FE',
                        }}>
                          <Text style={{
                            fontSize: 11,
                            fontWeight: '700',
                            color: isCustomerOwned ? '#BE185D' : '#6D28D9',
                          }}>
                            {isCustomerOwned ? 'Customer confirms' : 'Rider proof'}
                          </Text>
                        </View>
                        <View style={{
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 999,
                          backgroundColor: isConfirmed ? '#DCFCE7' : '#FEF3C7',
                        }}>
                          <Text style={{
                            fontSize: 11,
                            fontWeight: '700',
                            color: isConfirmed ? '#166534' : '#92400E',
                          }}>
                            {isConfirmed ? 'Confirmed' : (isCustomerOwned ? 'Awaiting customer' : 'Pending proof')}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {stop.proof_image_url ? (
                      <Text style={{ marginTop: 10, fontSize: 12, color: '#059669', fontWeight: '600' }}>
                        Proof uploaded
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
              {selectedStop && canCompleteSelectedStop ? (
                <View style={{ gap: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151' }}>
                    Proof for {getDeliveryStopDisplayLabel(selectedStop)}
                  </Text>

                  <TouchableOpacity
                    style={{
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: '#F9A8D4',
                      borderStyle: 'dashed',
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      alignItems: 'center',
                      backgroundColor: '#FFF7FB',
                    }}
                    onPress={pickDeliveryProofImage}
                    disabled={isSubmitting}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#BE185D' }}>
                      {selectedProof ? 'Change Proof Photo' : 'Upload Proof Photo'}
                    </Text>
                  </TouchableOpacity>

                  {previewUri ? (
                    <TouchableOpacity activeOpacity={0.9} onPress={openProofViewer}>
                      <Image
                        source={{ uri: previewUri }}
                        style={{ width: '100%', height: 200, borderRadius: 16, backgroundColor: '#F3F4F6' }}
                        resizeMode="contain"
                      />
                    </TouchableOpacity>
                  ) : null}

                  <TextInput
                    value={proofNote}
                    onChangeText={onChangeProofNote}
                    placeholder="Optional note about the delivery proof"
                    multiline
                    editable={!isSubmitting}
                    style={[
                      styles.input,
                      {
                        minHeight: 92,
                        textAlignVertical: 'top',
                      },
                    ]}
                  />
                </View>
              ) : selectedStop ? (
                <View style={{
                  borderRadius: 14,
                  backgroundColor: '#F9FAFB',
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  padding: 14,
                  gap: 10,
                }}>
                  <Text style={{ fontSize: 13, lineHeight: 20, color: '#6B7280' }}>
                    {selectedStopMessage}
                  </Text>

                  {previewUri ? (
                    <TouchableOpacity activeOpacity={0.9} onPress={openProofViewer}>
                      <Image
                        source={{ uri: previewUri }}
                        style={{ width: '100%', height: 200, borderRadius: 16, backgroundColor: '#F3F4F6' }}
                        resizeMode="contain"
                      />
                    </TouchableOpacity>
                  ) : null}

                  {selectedStop?.proof_note ? (
                    <Text style={{ fontSize: 12, lineHeight: 18, color: '#4B5563' }}>
                      {selectedStop.proof_note}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>

            <View style={{ paddingHorizontal: 20, paddingBottom: 20, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#F3F4F6', backgroundColor: '#fff' }}>
              <View style={[
                styles.modalButtons,
                {
                  marginTop: 0,
                  flexDirection: isCompactFooter ? 'column' : 'row',
                  gap: isCompactFooter ? 12 : 10,
                },
              ]}>
                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    styles.cancelButton,
                    {
                      minHeight: 54,
                      borderRadius: 16,
                      flex: isCompactFooter ? 0 : 1,
                      width: isCompactFooter ? '100%' : undefined,
                    },
                  ]}
                  onPress={closeModal}
                  disabled={isSubmitting}
                >
                  <Text style={[styles.buttonText, { fontSize: 15 }]}>Close</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    styles.saveButton,
                    {
                      minHeight: 54,
                      borderRadius: 16,
                      flex: isCompactFooter ? 0 : 1,
                      width: isCompactFooter ? '100%' : undefined,
                    },
                  ]}
                  onPress={onSubmit}
                  disabled={isSubmitting || !canCompleteSelectedStop || !hasSelectedProof}
                >
                  <Text style={[styles.buttonText, { fontSize: 15 }]}>
                    {isSubmitting ? 'Saving...' : confirmButtonLabel}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </View>

      <Modal
        visible={Boolean(expandedProofVisible && previewUri)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeProofViewer}
      >
        <TouchableOpacity
          style={styles.assignmentImageModalBackdrop}
          activeOpacity={1}
          onPress={closeProofViewer}
        >
          <View style={styles.assignmentImageModalCard}>
            {previewUri ? (
              <Image
                source={{ uri: previewUri }}
                style={[styles.assignmentImageModalImage, { height: Math.min(Math.max(screenHeight * 0.68, 280), 520) }]}
                resizeMode="contain"
              />
            ) : null}

            <Text style={styles.assignmentImageModalLabel}>
              Delivery proof preview
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
};

export default DeliveryProofModal;

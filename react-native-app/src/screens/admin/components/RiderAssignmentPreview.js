import React, { useState } from 'react';
import {
  Image,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from '../../AdminDashboard.styles';

const RiderAssignmentPreview = ({ preview }) => {
  const [expandedImage, setExpandedImage] = useState(null);

  if (!preview) {
    return null;
  }

  return (
    <>
      <View style={styles.notificationExpandedPanel}>
        <View style={styles.notificationDetailHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.notificationDetailEyebrow}>{preview.eyebrow}</Text>
            <Text style={styles.notificationDetailOrderNumber}>{preview.title}</Text>
          </View>

          <View
            style={[
              styles.notificationStatusBadge,
              { backgroundColor: preview.statusColor },
            ]}
          >
            <Text style={styles.notificationStatusBadgeText}>{preview.statusLabel}</Text>
          </View>
        </View>

        {preview.metaPills?.length ? (
          <View style={styles.notificationMetaPills}>
            {preview.metaPills.map((pill) => (
              <View key={`${pill.icon}-${pill.label}`} style={styles.notificationMetaPill}>
                <Ionicons name={pill.icon} size={14} color="#ec4899" />
                <Text style={styles.notificationMetaPillText}>{pill.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {preview.attachments?.length ? (
          <View style={styles.notificationDetailSection}>
            <Text style={styles.notificationDetailSectionTitle}>
              {preview.attachmentsTitle || 'Photos'}
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.assignmentAttachmentScroll}
            >
              {preview.attachments.map((attachment, index) => (
                <TouchableOpacity
                  key={`${attachment.uri}-${index}`}
                  style={styles.assignmentAttachmentCard}
                  onPress={() => setExpandedImage(attachment)}
                  activeOpacity={0.85}
                >
                  <Image
                    source={{ uri: attachment.uri }}
                    style={styles.assignmentAttachmentImage}
                    resizeMode="cover"
                  />
                  <Text style={styles.assignmentAttachmentLabel} numberOfLines={1}>
                    {attachment.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {preview.sections?.map((section) => (
          <View key={section.title} style={styles.notificationDetailSection}>
            <Text style={styles.notificationDetailSectionTitle}>{section.title}</Text>

            {section.rows.map((row) => (
              <View key={`${section.title}-${row.label}`} style={styles.notificationDetailRow}>
                <Text style={styles.notificationDetailLabel}>{row.label}</Text>
                <Text style={styles.notificationDetailValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        ))}

        {preview.items?.length ? (
          <View style={styles.notificationDetailSection}>
            <Text style={styles.notificationDetailSectionTitle}>
              {preview.itemsTitle || 'Items'}
            </Text>

            {preview.items.map((item, index) => (
              <TouchableOpacity
                key={`${item.label}-${index}`}
                style={styles.assignmentItemRow}
                onPress={() => item.imageUri && setExpandedImage({ uri: item.imageUri, label: item.label })}
                activeOpacity={item.imageUri ? 0.85 : 1}
                disabled={!item.imageUri}
              >
                {item.imageUri ? (
                  <Image
                    source={{ uri: item.imageUri }}
                    style={styles.assignmentItemImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.assignmentItemImagePlaceholder}>
                    <Ionicons name="image-outline" size={18} color="#9ca3af" />
                  </View>
                )}

                <View style={styles.notificationItemInfo}>
                  <Text style={styles.notificationItemName}>{item.label}</Text>
                  {item.secondary ? (
                    <Text style={styles.notificationItemPrice}>{item.secondary}</Text>
                  ) : null}
                </View>

                {item.imageUri ? (
                  <Ionicons name="expand-outline" size={16} color="#9ca3af" />
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {preview.totals?.length ? (
          <View style={styles.notificationDetailSection}>
            <Text style={styles.notificationDetailSectionTitle}>
              {preview.totalsTitle || 'Payment'}
            </Text>

            {preview.totals.map((row) => (
              <View
                key={row.label}
                style={[
                  styles.notificationDetailRow,
                  row.emphasis && styles.notificationDetailRowStrong,
                ]}
              >
                <Text
                  style={
                    row.emphasis
                      ? styles.notificationDetailLabelStrong
                      : styles.notificationDetailLabel
                  }
                >
                  {row.label}
                </Text>
                <Text
                  style={
                    row.emphasis
                      ? styles.notificationDetailValueStrong
                      : styles.notificationDetailValue
                  }
                >
                  {row.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <Modal
        visible={Boolean(expandedImage)}
        transparent
        animationType="fade"
        onRequestClose={() => setExpandedImage(null)}
      >
        <TouchableOpacity
          style={styles.assignmentImageModalBackdrop}
          activeOpacity={1}
          onPress={() => setExpandedImage(null)}
        >
          <View style={styles.assignmentImageModalCard}>
            {expandedImage?.uri ? (
              <Image
                source={{ uri: expandedImage.uri }}
                style={styles.assignmentImageModalImage}
                resizeMode="contain"
              />
            ) : null}

            {expandedImage?.label ? (
              <Text style={styles.assignmentImageModalLabel}>{expandedImage.label}</Text>
            ) : null}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

export default RiderAssignmentPreview;

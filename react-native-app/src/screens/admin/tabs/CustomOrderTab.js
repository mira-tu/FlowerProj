import { decode } from 'base64-arraybuffer';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Modal,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../config/supabase';
import styles from '../../AdminDashboard.styles';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import {
  buildCustomOrderItemId,
  buildCustomOrderOptionValue,
  createEmptyCustomOrderItem,
  CUSTOM_ORDER_CATALOG_KEY,
  DEFAULT_CUSTOM_ORDER_ADMIN_CATALOG,
  formatCustomOrderArrangementPriceRange,
  normalizeCustomOrderAdminCatalog,
  parseColorSwatchText,
} from './customOrderAdminConfig';

const STORAGE_BUCKET = 'product-images';
const STORAGE_FOLDER = 'custom-order-catalog';
const IMAGE_EXTENSION_TO_MIME_TYPE = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
};
const IMAGE_MIME_TYPE_TO_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const SECTION_CONFIG = [
  {
    key: 'arrangements',
    type: 'arrangement',
    title: 'Arrangement Types',
    emptyText: 'No arrangement types yet.',
    addLabel: 'Add Arrangement',
  },
  {
    key: 'flowers',
    type: 'flower',
    title: 'Flower Options',
    emptyText: 'No flower options yet.',
    addLabel: 'Add Flower',
  },
  {
    key: 'colors',
    type: 'color',
    title: 'Color Palettes',
    emptyText: 'No color palettes yet.',
    addLabel: 'Add Color',
  },
];

const trimText = (value) => String(value || '').trim();
const sanitizePriceInput = (value) => (
  String(value || '')
    .replace(/[^0-9.]/g, '')
    .replace(/(\..*)\./g, '$1')
);

const normalizeFileExtension = (value) => {
  const sanitized = trimText(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!sanitized) return '';
  return sanitized === 'jpeg' ? 'jpg' : sanitized;
};

const extractImageDataUrlParts = (value) => {
  const match = trimText(value).match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) return null;

  return {
    mimeType: match[1].toLowerCase(),
    base64: match[2],
  };
};

const getFileExtensionFromPath = (value) => {
  const normalizedValue = trimText(value);
  if (!normalizedValue || normalizedValue.startsWith('data:')) return '';

  const cleanValue = normalizedValue.split('?')[0].split('#')[0];
  const fileName = cleanValue.split('/').pop() || cleanValue;
  if (!fileName.includes('.')) return '';

  return normalizeFileExtension(fileName.split('.').pop());
};

const sanitizeStoragePathSegment = (value, fallback) => {
  const sanitized = trimText(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || fallback;
};

const getCatalogImageUploadPayload = (image) => {
  if (!image) {
    return { kind: 'empty' };
  }

  if (typeof image === 'string') {
    const stringDataUrl = extractImageDataUrlParts(image);
    if (stringDataUrl) {
      return {
        kind: 'upload',
        base64: stringDataUrl.base64,
        mimeType: stringDataUrl.mimeType,
        extension: IMAGE_MIME_TYPE_TO_EXTENSION[stringDataUrl.mimeType] || 'jpg',
      };
    }

    return {
      kind: 'existing',
      uri: image,
    };
  }

  const uriDataUrl = extractImageDataUrlParts(image.uri);
  const base64DataUrl = extractImageDataUrlParts(image.base64);
  const base64Payload = trimText(base64DataUrl?.base64 || image.base64 || uriDataUrl?.base64);

  if (!base64Payload) {
    return {
      kind: 'existing',
      uri: image.uri || '',
    };
  }

  const mimeType = trimText(image.mimeType).toLowerCase()
    || base64DataUrl?.mimeType
    || uriDataUrl?.mimeType
    || IMAGE_EXTENSION_TO_MIME_TYPE[
      getFileExtensionFromPath(image.fileName) || getFileExtensionFromPath(image.uri)
    ]
    || 'image/jpeg';
  const extension = IMAGE_MIME_TYPE_TO_EXTENSION[mimeType]
    || getFileExtensionFromPath(image.fileName)
    || getFileExtensionFromPath(image.uri)
    || 'jpg';

  return {
    kind: 'upload',
    base64: base64Payload,
    mimeType,
    extension,
  };
};

const getImageUri = (image) => {
  if (!image) return '';
  return typeof image === 'string' ? image : image.uri || '';
};

const pickImageAsset = async () => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.9,
    base64: true,
  });

  if (result.canceled) {
    return null;
  }

  return result.assets?.[0] || null;
};

const buildDuplicateMessage = (type) => {
  if (type === 'arrangement') return 'Another arrangement already uses that internal value.';
  if (type === 'flower') return 'Another flower already uses that internal value.';
  return 'Another color palette already uses that internal value.';
};

const CustomOrderTab = () => {
  const [catalog, setCatalog] = useState(() => normalizeCustomOrderAdminCatalog(DEFAULT_CUSTOM_ORDER_ADMIN_CATALOG));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorType, setEditorType] = useState('arrangement');
  const [editorMode, setEditorMode] = useState('create');
  const [editorForm, setEditorForm] = useState(() => createEmptyCustomOrderItem('arrangement'));
  const [deleteTarget, setDeleteTarget] = useState(null);

  const totalActiveItems = useMemo(
    () => (
      catalog.arrangements.filter((item) => item.isActive !== false).length
      + catalog.flowers.filter((item) => item.isActive !== false).length
      + catalog.colors.filter((item) => item.isActive !== false).length
    ),
    [catalog]
  );

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_content')
        .select('value')
        .eq('key', CUSTOM_ORDER_CATALOG_KEY)
        .maybeSingle();

      if (error) throw error;

      if (!data?.value) {
        setCatalog(normalizeCustomOrderAdminCatalog(DEFAULT_CUSTOM_ORDER_ADMIN_CATALOG));
        return;
      }

      setCatalog(normalizeCustomOrderAdminCatalog(JSON.parse(data.value)));
    } catch (error) {
      console.error('Error loading custom order catalog:', error);
      Alert.alert('Error', error.message || 'Failed to load custom order settings.');
      setCatalog(normalizeCustomOrderAdminCatalog(DEFAULT_CUSTOM_ORDER_ADMIN_CATALOG));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
    const channel = supabase
      .channel('custom-order-admin-catalog-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_content',
          filter: `key=eq.${CUSTOM_ORDER_CATALOG_KEY}`,
        },
        () => {
          loadCatalog();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const closeEditorModal = () => {
    Keyboard.dismiss();
    setEditorVisible(false);
    setEditorMode('create');
    setEditorType('arrangement');
    setEditorForm(createEmptyCustomOrderItem('arrangement'));
  };

  const openCreateEditor = (type) => {
    setEditorType(type);
    setEditorMode('create');
    setEditorForm(createEmptyCustomOrderItem(type));
    setEditorVisible(true);
  };

  const openEditEditor = (type, item) => {
    setEditorType(type);
    setEditorMode('edit');
    setEditorForm({
      ...createEmptyCustomOrderItem(type),
      ...item,
      flowersPerArrangement: type === 'arrangement'
        ? String(item?.flowersPerArrangement ?? '0')
        : undefined,
      estimatedPriceMin: type === 'arrangement'
        ? String(item?.estimatedPriceMin ?? '')
        : undefined,
      estimatedPriceMax: type === 'arrangement'
        ? String(item?.estimatedPriceMax ?? '')
        : undefined,
      estimatedPriceNote: type === 'arrangement'
        ? String(item?.estimatedPriceNote ?? '')
        : undefined,
      colorsText: type === 'color'
        ? (Array.isArray(item?.colors) ? item.colors.join(', ') : '')
        : undefined,
    });
    setEditorVisible(true);
  };

  const getNextCatalogSnapshot = (sectionKey, updater, sourceCatalog = catalog) => ({
    ...sourceCatalog,
    [sectionKey]: updater(sourceCatalog[sectionKey] || []),
  });

  const handlePickEditorImage = async () => {
    try {
      const asset = await pickImageAsset();
      if (!asset) return;

      setEditorForm((currentForm) => ({
        ...currentForm,
        img: asset,
      }));
    } catch (error) {
      console.error('Error picking custom order image:', error);
      Alert.alert('Error', 'Failed to open image library.');
    }
  };

  const validateEditorForm = () => {
    const label = trimText(editorForm.label);
    if (!label) {
      Alert.alert('Validation', 'Label is required.');
      return null;
    }

    if (editorType === 'arrangement' && !trimText(editorForm.groupLabel)) {
      Alert.alert('Validation', 'Group name is required for arrangements.');
      return null;
    }

    const sectionKey = editorType === 'arrangement'
      ? 'arrangements'
      : editorType === 'flower'
        ? 'flowers'
        : 'colors';
    const sectionItems = catalog[sectionKey] || [];
    const fallbackPrefix = editorType === 'arrangement'
      ? 'arrangement'
      : editorType === 'flower'
        ? 'flower'
        : 'color';
    const nextValue = trimText(editorForm.value) || buildCustomOrderOptionValue(label, fallbackPrefix);
    const hasDuplicate = sectionItems.some((item) => (
      item.id !== editorForm.id
      && trimText(item.value).toLowerCase() === nextValue.toLowerCase()
    ));

    if (hasDuplicate) {
      Alert.alert('Validation', buildDuplicateMessage(editorType));
      return null;
    }

    if (editorType === 'color') {
      return {
        id: trimText(editorForm.id) || buildCustomOrderItemId(nextValue, 'color'),
        value: nextValue,
        label,
        colors: parseColorSwatchText(editorForm.colorsText),
        isActive: editorForm.isActive !== false,
      };
    }

    if (editorType === 'flower') {
      return {
        id: trimText(editorForm.id) || buildCustomOrderItemId(nextValue, 'flower'),
        value: nextValue,
        label,
        img: editorForm.img || '',
        isActive: editorForm.isActive !== false,
      };
    }

    return {
      id: trimText(editorForm.id) || buildCustomOrderItemId(nextValue, 'arrangement'),
      value: nextValue,
      label,
      groupLabel: trimText(editorForm.groupLabel) || 'General',
      description: trimText(editorForm.description),
      img: editorForm.img || '',
      flowersPerArrangement: trimText(editorForm.flowersPerArrangement),
      estimatedPriceMin: trimText(editorForm.estimatedPriceMin),
      estimatedPriceMax: trimText(editorForm.estimatedPriceMax),
      estimatedPriceNote: trimText(editorForm.estimatedPriceNote),
      isActive: editorForm.isActive !== false,
    };
  };

  const uploadCatalogImage = async (image, sectionType, itemId) => {
    const uploadPayload = getCatalogImageUploadPayload(image);

    if (uploadPayload.kind === 'empty') return '';
    if (uploadPayload.kind === 'existing') return uploadPayload.uri;

    const normalizedSection = sanitizeStoragePathSegment(sectionType, 'custom-order');
    const normalizedItemId = sanitizeStoragePathSegment(itemId, `${normalizedSection}-item`);
    const fileExtension = normalizeFileExtension(uploadPayload.extension) || 'jpg';
    const contentType = uploadPayload.mimeType || IMAGE_EXTENSION_TO_MIME_TYPE[fileExtension] || 'image/jpeg';
    const filePath = `${STORAGE_FOLDER}/${normalizedSection}/${normalizedItemId}-${Date.now()}.${fileExtension}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, decode(uploadPayload.base64), {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicUrlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    return publicUrlData?.publicUrl
      ? `${publicUrlData.publicUrl}?t=${Date.now()}`
      : '';
  };

  const buildCatalogForSave = async (sourceCatalog) => {
    const workingCatalog = normalizeCustomOrderAdminCatalog(sourceCatalog);
    const arrangements = await Promise.all((workingCatalog.arrangements || []).map(async (item, index) => ({
      ...item,
      id: trimText(item.id) || buildCustomOrderItemId(item.value || item.label || `arrangement-${index + 1}`, 'arrangement'),
      flowersPerArrangement: Number.parseInt(item.flowersPerArrangement, 10) || 0,
      estimatedPriceMin: Number.parseFloat(item.estimatedPriceMin) || 0,
      estimatedPriceMax: Number.parseFloat(item.estimatedPriceMax) || Number.parseFloat(item.estimatedPriceMin) || 0,
      estimatedPriceNote: trimText(item.estimatedPriceNote),
      img: await uploadCatalogImage(item.img, 'arrangements', trimText(item.id) || `arrangement-${index + 1}`),
    })));

    const flowers = await Promise.all((workingCatalog.flowers || []).map(async (item, index) => ({
      ...item,
      id: trimText(item.id) || buildCustomOrderItemId(item.value || item.label || `flower-${index + 1}`, 'flower'),
      img: await uploadCatalogImage(item.img, 'flowers', trimText(item.id) || `flower-${index + 1}`),
    })));

    const colors = (workingCatalog.colors || []).map((item, index) => ({
      ...item,
      id: trimText(item.id) || buildCustomOrderItemId(item.value || item.label || `color-${index + 1}`, 'color'),
      colors: Array.isArray(item.colors) ? item.colors.filter(Boolean) : [],
    }));

    return normalizeCustomOrderAdminCatalog({
      version: Number(workingCatalog.version || 1) + 1,
      arrangements,
      flowers,
      colors,
    });
  };

  const persistCatalogSnapshot = async (nextCatalog, successMessage = '', { closeEditorOnSuccess = false, showSuccessAlert = true } = {}) => {
    setSaving(true);
    try {
      const persistedCatalog = await buildCatalogForSave(nextCatalog);
      const nowIso = new Date().toISOString();

      const { error } = await supabase
        .from('app_content')
        .upsert([
          {
            key: CUSTOM_ORDER_CATALOG_KEY,
            value: JSON.stringify(persistedCatalog),
            updated_at: nowIso,
          },
        ], { onConflict: 'key' });

      if (error) throw error;

      setCatalog(persistedCatalog);
      if (closeEditorOnSuccess) {
        closeEditorModal();
      }
      if (successMessage && showSuccessAlert) {
        Alert.alert('Success', successMessage);
      }
      return true;
    } catch (error) {
      console.error('Error saving custom order catalog:', error);
      Alert.alert('Error', error.message || 'Failed to save custom order settings.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAvailability = async (sectionKey, itemId, nextValue) => {
    const nextCatalog = getNextCatalogSnapshot(sectionKey, (items) => items.map((item) => (
      item.id === itemId
        ? { ...item, isActive: nextValue }
        : item
    )));
    await persistCatalogSnapshot(nextCatalog, '', { showSuccessAlert: false });
  };

  const handleSaveEditor = async () => {
    const normalizedItem = validateEditorForm();
    if (!normalizedItem) {
      return;
    }

    const sectionKey = editorType === 'arrangement'
      ? 'arrangements'
      : editorType === 'flower'
        ? 'flowers'
        : 'colors';

    const nextCatalog = getNextCatalogSnapshot(sectionKey, (items) => {
      if (editorMode === 'edit') {
        return items.map((item) => (
          item.id === normalizedItem.id
            ? normalizedItem
            : item
        ));
      }

      return [normalizedItem, ...items];
    });

    await persistCatalogSnapshot(
      nextCatalog,
      editorMode === 'edit' ? 'Custom order item updated.' : 'Custom order item added.',
      { closeEditorOnSuccess: true }
    );
  };

  const renderSectionMeta = (type, item) => {
    if (type === 'arrangement') {
      return `${item.groupLabel || 'General'} - ${Number(item.flowersPerArrangement || 0)} flowers`;
    }

    if (type === 'color') {
      return item.colors?.length
        ? item.colors.join(', ')
        : 'No swatches set';
    }

    return item.value || '';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>Loading custom order settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.tabContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.tabTitle}>Custom Order Settings</Text>
      <Text style={styles.customOrderAdminIntro}>
        Manage the floral specifications shown on the web custom order form. Add, edit, hide, or remove arrangement types, flower options, and color palettes.
      </Text>

      <View style={styles.customOrderAdminSummaryCard}>
        <View style={styles.customOrderAdminSummaryBlock}>
          <Text style={styles.customOrderAdminSummaryValue}>{totalActiveItems}</Text>
          <Text style={styles.customOrderAdminSummaryLabel}>Active choices</Text>
        </View>
        <View style={styles.customOrderAdminSummaryBlock}>
          <Text style={styles.customOrderAdminSummaryValue}>{catalog.arrangements.length}</Text>
          <Text style={styles.customOrderAdminSummaryLabel}>Arrangement types</Text>
        </View>
        <View style={styles.customOrderAdminSummaryBlock}>
          <Text style={styles.customOrderAdminSummaryValue}>{catalog.flowers.length}</Text>
          <Text style={styles.customOrderAdminSummaryLabel}>Flower options</Text>
        </View>
      </View>

      {SECTION_CONFIG.map((section) => (
        <View key={section.key} style={styles.customOrderAdminSection}>
          <View style={styles.customOrderAdminSectionHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.customOrderAdminSectionTitle}>{section.title}</Text>
              <Text style={styles.customOrderAdminSectionCount}>{catalog[section.key]?.length || 0} item(s)</Text>
            </View>
            <TouchableOpacity
              style={styles.customOrderAdminAddButton}
              onPress={() => openCreateEditor(section.type)}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.customOrderAdminAddButtonText}>{section.addLabel}</Text>
            </TouchableOpacity>
          </View>

          {(catalog[section.key] || []).length === 0 ? (
            <View style={styles.customOrderAdminEmptyState}>
              <Text style={styles.customOrderAdminEmptyStateText}>{section.emptyText}</Text>
            </View>
          ) : (
            (catalog[section.key] || []).map((item) => (
              <View key={item.id} style={styles.customOrderAdminItemCard}>
                <View style={styles.customOrderAdminItemRow}>
                  <View style={styles.customOrderAdminItemPreview}>
                    {getImageUri(item.img) ? (
                      <Image source={{ uri: getImageUri(item.img) }} style={styles.customOrderAdminItemImage} />
                    ) : (
                      <View style={styles.customOrderAdminItemImagePlaceholder}>
                        <Ionicons name="image-outline" size={22} color="#ec4899" />
                      </View>
                    )}
                  </View>

                  <View style={styles.customOrderAdminItemContent}>
                    <View style={styles.customOrderAdminItemHeadingRow}>
                      <Text style={styles.customOrderAdminItemTitle}>{item.label}</Text>
                      <View style={[
                        styles.customOrderAdminStatusBadge,
                        item.isActive !== false ? styles.customOrderAdminStatusBadgeActive : styles.customOrderAdminStatusBadgeInactive,
                      ]}>
                        <Text style={styles.customOrderAdminStatusBadgeText}>
                          {item.isActive !== false ? 'Available' : 'Hidden'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.customOrderAdminItemMeta}>{renderSectionMeta(section.type, item)}</Text>
                    {section.type === 'arrangement' && formatCustomOrderArrangementPriceRange(item) ? (
                      <Text style={styles.customOrderAdminPriceText}>
                        Estimated Price: {formatCustomOrderArrangementPriceRange(item)}
                      </Text>
                    ) : null}
                    {section.type === 'arrangement' && item.description ? (
                      <Text style={styles.customOrderAdminItemDescription}>{item.description}</Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.customOrderAdminItemFooter}>
                  <View style={styles.customOrderAdminToggleRow}>
                    <Text style={styles.customOrderAdminToggleLabel}>Show to customers</Text>
                    <Switch
                      value={item.isActive !== false}
                      onValueChange={(nextValue) => handleToggleAvailability(section.key, item.id, nextValue)}
                      trackColor={{ false: '#f3d4dd', true: '#f5a6c1' }}
                      thumbColor={item.isActive !== false ? '#ec4899' : '#9ca3af'}
                    />
                  </View>

                  <View style={styles.customOrderAdminFooterActions}>
                    <TouchableOpacity
                      style={styles.customOrderAdminInlineButton}
                      onPress={() => openEditEditor(section.type, item)}
                    >
                      <Ionicons name="create-outline" size={16} color="#ec4899" />
                      <Text style={styles.customOrderAdminInlineButtonText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.customOrderAdminInlineDeleteButton}
                      onPress={() => setDeleteTarget({ sectionKey: section.key, type: section.type, item })}
                    >
                      <Ionicons name="trash-outline" size={16} color="#dc2626" />
                      <Text style={styles.customOrderAdminInlineDeleteText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      ))}

      <Modal
        visible={editorVisible}
        animationType="slide"
        transparent
        onRequestClose={closeEditorModal}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, styles.customOrderAdminEditorModal]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editorMode === 'edit' ? 'Edit Item' : 'Add Item'}
              </Text>
              <TouchableOpacity onPress={closeEditorModal}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.customOrderAdminEditorScroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>Label</Text>
              <TextInput
                style={styles.input}
                value={editorForm.label}
                onChangeText={(text) => setEditorForm((currentForm) => ({ ...currentForm, label: text }))}
                placeholder="Customer-facing label"
              />

              <Text style={styles.inputLabel}>Internal Value</Text>
              <TextInput
                style={styles.input}
                value={editorForm.value}
                onChangeText={(text) => setEditorForm((currentForm) => ({ ...currentForm, value: text }))}
                placeholder="Optional. Auto-generated if blank."
              />

              {editorType === 'arrangement' ? (
                <>
                  <Text style={styles.inputLabel}>Group</Text>
                  <TextInput
                    style={styles.input}
                    value={editorForm.groupLabel}
                    onChangeText={(text) => setEditorForm((currentForm) => ({ ...currentForm, groupLabel: text }))}
                    placeholder="Example: Funeral"
                  />

                  <Text style={styles.inputLabel}>Description</Text>
                  <TextInput
                    style={[styles.input, styles.customOrderAdminMultilineInput]}
                    value={editorForm.description}
                    onChangeText={(text) => setEditorForm((currentForm) => ({ ...currentForm, description: text }))}
                    placeholder="Short arrangement description"
                    multiline
                  />

                  <Text style={styles.inputLabel}>Flowers Per Arrangement</Text>
                  <TextInput
                    style={styles.input}
                    value={editorForm.flowersPerArrangement}
                    onChangeText={(text) => setEditorForm((currentForm) => ({
                      ...currentForm,
                      flowersPerArrangement: text.replace(/[^0-9]/g, ''),
                    }))}
                    keyboardType="number-pad"
                    placeholder="0 for customer-specified"
                  />

                  <Text style={styles.inputLabel}>Estimated Price Range</Text>
                  <View style={styles.customOrderAdminPriceRow}>
                    <View style={styles.customOrderAdminPriceField}>
                      <Text style={styles.customOrderAdminPriceLabel}>From</Text>
                      <TextInput
                        style={styles.input}
                        value={editorForm.estimatedPriceMin}
                        onChangeText={(text) => setEditorForm((currentForm) => ({
                          ...currentForm,
                          estimatedPriceMin: sanitizePriceInput(text),
                        }))}
                        keyboardType="decimal-pad"
                        placeholder="5000"
                      />
                    </View>
                    <View style={styles.customOrderAdminPriceField}>
                      <Text style={styles.customOrderAdminPriceLabel}>To</Text>
                      <TextInput
                        style={styles.input}
                        value={editorForm.estimatedPriceMax}
                        onChangeText={(text) => setEditorForm((currentForm) => ({
                          ...currentForm,
                          estimatedPriceMax: sanitizePriceInput(text),
                        }))}
                        keyboardType="decimal-pad"
                        placeholder="10000"
                      />
                    </View>
                  </View>

                  <Text style={styles.inputLabel}>Price Note</Text>
                  <TextInput
                    style={styles.input}
                    value={editorForm.estimatedPriceNote}
                    onChangeText={(text) => setEditorForm((currentForm) => ({ ...currentForm, estimatedPriceNote: text }))}
                    placeholder="Optional, e.g. per piece"
                  />
                  <Text style={styles.customOrderAdminHelperText}>
                    Leave blank if the range is a standard total price.
                  </Text>
                </>
              ) : null}

              {editorType === 'color' ? (
                <>
                  <Text style={styles.inputLabel}>Color Swatches</Text>
                  <TextInput
                    style={styles.input}
                    value={editorForm.colorsText}
                    onChangeText={(text) => setEditorForm((currentForm) => ({ ...currentForm, colorsText: text }))}
                    placeholder="#ffc0cb, #ffffff"
                  />
                  <Text style={styles.customOrderAdminHelperText}>
                    Separate each color with a comma. This can stay blank for the custom "other color" option.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.inputLabel}>Picture</Text>
                  <TouchableOpacity style={styles.imageUploadBox} onPress={handlePickEditorImage}>
                    {getImageUri(editorForm.img) ? (
                      <Image source={{ uri: getImageUri(editorForm.img) }} style={styles.uploadedImage} />
                    ) : (
                      <View style={styles.imageUploadPlaceholder}>
                        <Ionicons name="camera" size={40} color="#ec4899" />
                        <Text style={styles.imageUploadText}>Tap to Upload Photo</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {getImageUri(editorForm.img) ? (
                    <TouchableOpacity
                      style={styles.customOrderAdminRemoveImageButton}
                      onPress={() => setEditorForm((currentForm) => ({ ...currentForm, img: '' }))}
                    >
                      <Text style={styles.customOrderAdminRemoveImageText}>Remove Picture</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              )}

              <View style={styles.customOrderAdminSwitchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.customOrderAdminSwitchTitle}>Available to customers</Text>
                  <Text style={styles.customOrderAdminSwitchHint}>Turn this off to hide it from the web form.</Text>
                </View>
                <Switch
                  value={editorForm.isActive !== false}
                  onValueChange={(nextValue) => setEditorForm((currentForm) => ({ ...currentForm, isActive: nextValue }))}
                  trackColor={{ false: '#f3d4dd', true: '#f5a6c1' }}
                  thumbColor={editorForm.isActive !== false ? '#ec4899' : '#9ca3af'}
                />
              </View>

            </ScrollView>

            <View style={[styles.modalButtons, styles.customOrderAdminEditorFooter]}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={closeEditorModal}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton, saving && styles.customOrderAdminButtonDisabled]}
                onPress={handleSaveEditor}
                disabled={saving}
              >
                <Text style={styles.buttonText}>
                  {saving ? (editorMode === 'edit' ? 'Updating...' : 'Adding...') : (editorMode === 'edit' ? 'Update' : 'Add')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDeleteModal
        visible={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const nextCatalog = getNextCatalogSnapshot(
            deleteTarget.sectionKey,
            (items) => items.filter((item) => item.id !== deleteTarget.item.id),
          );
          const didPersist = await persistCatalogSnapshot(nextCatalog, 'Custom order item deleted.');
          if (didPersist) {
            setDeleteTarget(null);
          }
        }}
        title="Delete Item"
        message={`Remove "${deleteTarget?.item?.label || 'this item'}" from the custom order form?`}
        confirmText="Delete"
      />
    </ScrollView>
  );
};

export default CustomOrderTab;

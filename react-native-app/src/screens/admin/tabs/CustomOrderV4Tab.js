import { decode } from 'base64-arraybuffer';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../config/supabase';
import styles from '../../AdminDashboard.styles';

const STORAGE_KEY = 'custom_order_v4_catalog';

const PAGE_COPY_DEFAULTS = {
  title: 'Custom Order v4',
  subtitle: 'Browse arrangement concepts first, then compare visual budget-fit alternatives before sending a request.',
  budgetHelper: 'Enter a budget and we will suggest lighter visual versions of the same concept when needed.',
  comparisonTitle: 'Compare original and budget-fit versions',
  comparisonSubtitle: 'Show the original arrangement beside practical lower-budget alternatives with preview images and change explanations.',
  reviewNote: 'These previews are rough visual guides. Final pricing is confirmed after florist review.',
};

const createId = (value, fallback) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
};

const coerceNumber = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const createImageItem = () => ({
  id: `image-${Date.now()}`,
  url: '',
  alt: '',
});

const createVisualVariant = () => ({
  id: `variant-${Date.now()}`,
  label: '',
  imageUrl: '',
  alt: '',
  caption: '',
  strategyId: '',
  packageTierId: '',
  wrapperId: '',
  budgetBand: '',
  budgetRatioMax: '',
  isOriginal: false,
});

const createTier = () => ({
  id: `tier-${Date.now()}`,
  name: '',
  description: '',
  price: '',
  sizeLabel: '',
  isDefault: false,
});

const createWrapper = () => ({
  id: `wrapper-${Date.now()}`,
  name: '',
  description: '',
  price: '',
  isDefault: false,
});

const createComponent = () => ({
  id: `component-${Date.now()}`,
  label: '',
  role: 'main',
  quantity: '1',
  minQuantity: '0',
  unitPrice: '',
  cheaperLabel: '',
  cheaperUnitPrice: '',
});

const createAccessory = () => ({
  id: `accessory-${Date.now()}`,
  name: '',
  description: '',
  price: '',
  defaultSelected: true,
  removable: true,
});

const createAddOn = () => ({
  id: `addon-${Date.now()}`,
  name: '',
  description: '',
  price: '',
});

const createDesign = () => ({
  id: `design-${Date.now()}`,
  title: '',
  category: '',
  description: '',
  roughDescription: '',
  notes: '',
  priceRangeLabel: '',
  sortOrder: '',
  isActive: true,
  referenceImages: [createImageItem()],
  visualVariants: [createVisualVariant()],
  packageTiers: [createTier()],
  wrappers: [createWrapper()],
  components: [createComponent()],
  accessories: [createAccessory()],
  addOns: [createAddOn()],
});

const createEmptyCatalog = () => ({
  version: 4,
  pageCopy: { ...PAGE_COPY_DEFAULTS },
  designs: [],
});

const sanitizeCatalog = (catalog) => {
  const safeCatalog = catalog && typeof catalog === 'object' ? catalog : createEmptyCatalog();
  const pageCopy = { ...PAGE_COPY_DEFAULTS, ...(safeCatalog.pageCopy || {}) };

  return {
    version: 4,
    pageCopy,
    designs: (Array.isArray(safeCatalog.designs) ? safeCatalog.designs : [])
      .map((design, designIndex) => ({
        id: createId(design.id || design.title, `design-${designIndex + 1}`),
        title: String(design.title || '').trim(),
        category: String(design.category || '').trim(),
        description: String(design.description || '').trim(),
        roughDescription: String(design.roughDescription || '').trim(),
        notes: String(design.notes || '').trim(),
        priceRangeLabel: String(design.priceRangeLabel || '').trim(),
        sortOrder: Math.max(0, Math.round(coerceNumber(design.sortOrder || ((designIndex + 1) * 10)))),
        isActive: design.isActive !== false,
        referenceImages: (Array.isArray(design.referenceImages) ? design.referenceImages : [])
          .map((image, imageIndex) => ({
            id: createId(image.id || image.alt, `image-${imageIndex + 1}`),
            url: String(image.url || '').trim(),
            alt: String(image.alt || '').trim(),
          }))
          .filter((image) => image.url),
        visualVariants: (Array.isArray(design.visualVariants) ? design.visualVariants : [])
          .map((variant, variantIndex) => ({
            id: createId(variant.id || variant.label, `variant-${variantIndex + 1}`),
            label: String(variant.label || '').trim(),
            imageUrl: String(variant.imageUrl || variant.url || '').trim(),
            alt: String(variant.alt || '').trim(),
            caption: String(variant.caption || '').trim(),
            strategyId: String(variant.strategyId || '').trim(),
            packageTierId: String(variant.packageTierId || '').trim(),
            wrapperId: String(variant.wrapperId || '').trim(),
            budgetBand: String(variant.budgetBand || '').trim(),
            budgetRatioMax: coerceNumber(variant.budgetRatioMax),
            isOriginal: Boolean(variant.isOriginal),
          }))
          .filter((variant) => variant.label || variant.imageUrl),
        packageTiers: (Array.isArray(design.packageTiers) ? design.packageTiers : [])
          .map((tier, tierIndex) => ({
            id: createId(tier.id || tier.name, `tier-${tierIndex + 1}`),
            name: String(tier.name || '').trim(),
            description: String(tier.description || '').trim(),
            price: coerceNumber(tier.price),
            sizeLabel: String(tier.sizeLabel || '').trim(),
            isDefault: Boolean(tier.isDefault),
          }))
          .filter((tier) => tier.name),
        wrappers: (Array.isArray(design.wrappers) ? design.wrappers : [])
          .map((wrapper, wrapperIndex) => ({
            id: createId(wrapper.id || wrapper.name, `wrapper-${wrapperIndex + 1}`),
            name: String(wrapper.name || '').trim(),
            description: String(wrapper.description || '').trim(),
            price: coerceNumber(wrapper.price),
            isDefault: Boolean(wrapper.isDefault),
          }))
          .filter((wrapper) => wrapper.name),
        components: (Array.isArray(design.components) ? design.components : [])
          .map((component, componentIndex) => ({
            id: createId(component.id || component.label, `component-${componentIndex + 1}`),
            label: String(component.label || '').trim(),
            role: String(component.role || 'accent').trim() || 'accent',
            quantity: Math.max(1, Math.round(coerceNumber(component.quantity || 1))),
            minQuantity: Math.max(0, Math.round(coerceNumber(component.minQuantity || 0))),
            unitPrice: coerceNumber(component.unitPrice),
            cheaperLabel: String(component.cheaperLabel || '').trim(),
            cheaperUnitPrice: coerceNumber(component.cheaperUnitPrice),
          }))
          .filter((component) => component.label),
        accessories: (Array.isArray(design.accessories) ? design.accessories : [])
          .map((accessory, accessoryIndex) => ({
            id: createId(accessory.id || accessory.name, `accessory-${accessoryIndex + 1}`),
            name: String(accessory.name || '').trim(),
            description: String(accessory.description || '').trim(),
            price: coerceNumber(accessory.price),
            defaultSelected: accessory.defaultSelected !== false,
            removable: accessory.removable !== false,
          }))
          .filter((accessory) => accessory.name),
        addOns: (Array.isArray(design.addOns) ? design.addOns : [])
          .map((addOn, addOnIndex) => ({
            id: createId(addOn.id || addOn.name, `addon-${addOnIndex + 1}`),
            name: String(addOn.name || '').trim(),
            description: String(addOn.description || '').trim(),
            price: coerceNumber(addOn.price),
          }))
          .filter((addOn) => addOn.name),
      }))
      .filter((design) => design.title)
      .sort((left, right) => (left.sortOrder - right.sortOrder) || left.title.localeCompare(right.title)),
  };
};

const sectionCardStyle = {
  borderWidth: 1,
  borderColor: '#f1c3d1',
  borderRadius: 18,
  padding: 16,
  marginBottom: 16,
  backgroundColor: '#fff',
};

const inlineRowStyle = {
  flexDirection: 'row',
  gap: 10,
  alignItems: 'center',
  marginBottom: 10,
};

const compactButton = {
  borderRadius: 999,
  paddingHorizontal: 14,
  paddingVertical: 10,
  alignItems: 'center',
  justifyContent: 'center',
};

const longTextFields = new Set(['description', 'roughDescription', 'notes', 'caption']);

const CustomOrderV4Tab = () => {
  const [catalog, setCatalog] = useState(createEmptyCatalog());
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_content')
        .select('value')
        .eq('key', STORAGE_KEY)
        .maybeSingle();

      if (error) throw error;

      if (data?.value) {
        setCatalog(sanitizeCatalog(JSON.parse(data.value)));
      } else {
        setCatalog(createEmptyCatalog());
      }
    } catch (error) {
      console.error('Error loading Custom Order v4 catalog:', error);
      Alert.alert('Error', 'Failed to load the Custom Order v4 catalog.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  const updatePageCopy = (field, value) => {
    setCatalog((current) => ({
      ...current,
      pageCopy: {
        ...current.pageCopy,
        [field]: value,
      },
    }));
  };

  const updateDesign = (designIndex, field, value) => {
    setCatalog((current) => ({
      ...current,
      designs: current.designs.map((design, index) => (
        index === designIndex ? { ...design, [field]: value } : design
      )),
    }));
  };

  const updateNestedItem = (designIndex, listKey, itemIndex, field, value) => {
    setCatalog((current) => ({
      ...current,
      designs: current.designs.map((design, index) => {
        if (index !== designIndex) return design;
        return {
          ...design,
          [listKey]: design[listKey].map((item, nestedIndex) => (
            nestedIndex === itemIndex ? { ...item, [field]: value } : item
          )),
        };
      }),
    }));
  };

  const addNestedItem = (designIndex, listKey, factory) => {
    setCatalog((current) => ({
      ...current,
      designs: current.designs.map((design, index) => (
        index === designIndex
          ? { ...design, [listKey]: [...design[listKey], factory()] }
          : design
      )),
    }));
  };

  const removeNestedItem = (designIndex, listKey, itemIndex) => {
    setCatalog((current) => ({
      ...current,
      designs: current.designs.map((design, index) => (
        index === designIndex
          ? { ...design, [listKey]: design[listKey].filter((_, nestedIndex) => nestedIndex !== itemIndex) }
          : design
      )),
    }));
  };

  const addDesign = () => {
    setCatalog((current) => ({
      ...current,
      designs: [...current.designs, createDesign()],
    }));
  };

  const removeDesign = (designIndex) => {
    setCatalog((current) => ({
      ...current,
      designs: current.designs.filter((_, index) => index !== designIndex),
    }));
  };

  const uploadImageToList = async (designIndex, listKey, builder) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.82,
        base64: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      const fileName = `custom-order-v4/${Date.now()}-${designIndex}-${listKey}.jpg`;
      const arrayBuffer = decode(asset.base64);
      const contentType = asset.mimeType || 'image/jpeg';

      const { error: uploadError } = await supabase.storage
        .from('about-images')
        .upload(fileName, arrayBuffer, { contentType, upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('about-images').getPublicUrl(fileName);
      const url = `${publicUrlData.publicUrl}?t=${Date.now()}`;

      setCatalog((current) => ({
        ...current,
        designs: current.designs.map((design, index) => (
          index === designIndex
            ? {
              ...design,
              [listKey]: [...(Array.isArray(design[listKey]) ? design[listKey] : []), builder(url)],
            }
            : design
        )),
      }));
    } catch (error) {
      console.error(`Error uploading Custom Order v4 ${listKey} image:`, error);
      Alert.alert('Upload Failed', error.message || 'Failed to upload the image.');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const sanitizedCatalog = sanitizeCatalog(catalog);

      if (!sanitizedCatalog.designs.length) {
        Alert.alert('Add a Design', 'Please add at least one design before saving.');
        setIsSaving(false);
        return;
      }

      const { error } = await supabase
        .from('app_content')
        .upsert([
          {
            key: STORAGE_KEY,
            value: JSON.stringify(sanitizedCatalog),
          },
        ], { onConflict: 'key' });

      if (error) throw error;

      setCatalog(sanitizedCatalog);
      Alert.alert('Saved', 'Custom Order v4 catalog updated successfully.');
    } catch (error) {
      console.error('Error saving Custom Order v4 catalog:', error);
      Alert.alert('Save Failed', error.message || 'Failed to save the Custom Order v4 catalog.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>Loading Custom Order v4...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.tabContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.tabTitle}>Custom Order v4 Catalog</Text>
      <Text style={{ color: '#6b7280', marginBottom: 18, lineHeight: 20 }}>
        Manage the catalogue cards, original previews, budget-fit variant visuals, and the pricing inputs that power the web Custom Order v4 experience.
      </Text>
      <Text style={{ color: '#6b7280', marginBottom: 18, lineHeight: 20 }}>
        If this catalog is empty, the web app still shows built-in default offerings until you save your own v4 catalog here.
      </Text>

      <View style={sectionCardStyle}>
        <Text style={styles.sectionTitle}>Page Copy</Text>
        {Object.entries(catalog.pageCopy || {}).map(([field, value]) => (
          <View key={field}>
            <Text style={styles.inputLabel}>{field}</Text>
            <TextInput
              style={[styles.input, { minHeight: field === 'title' || field === 'comparisonTitle' ? undefined : 88, textAlignVertical: 'top' }]}
              value={String(value || '')}
              multiline={field !== 'title' && field !== 'comparisonTitle'}
              onChangeText={(text) => updatePageCopy(field, text)}
            />
          </View>
        ))}
      </View>

      <View style={[inlineRowStyle, { justifyContent: 'space-between', marginBottom: 12 }]}>
        <Text style={styles.sectionTitle}>Arrangement Offerings ({catalog.designs.length})</Text>
        <TouchableOpacity style={[compactButton, { backgroundColor: '#ec4899' }]} onPress={addDesign}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Add Offering</Text>
        </TouchableOpacity>
      </View>

      {catalog.designs.map((design, designIndex) => {
        const previewImage = design.visualVariants.find((item) => item.isOriginal)?.imageUrl || design.referenceImages[0]?.url || '';

        return (
          <View key={design.id || `design-${designIndex}`} style={sectionCardStyle}>
            <View style={[inlineRowStyle, { justifyContent: 'space-between', marginBottom: 12 }]}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.sectionTitle, { marginBottom: 4 }]}>Offering {designIndex + 1}</Text>
                <Text style={{ color: '#6b7280', lineHeight: 18 }}>
                  This entry powers the catalogue card, form selection, pricing logic, and visual comparison previews.
                </Text>
              </View>
              <TouchableOpacity style={[compactButton, { backgroundColor: '#fee2e2' }]} onPress={() => removeDesign(designIndex)}>
                <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Remove</Text>
              </TouchableOpacity>
            </View>

            {previewImage ? (
              <Image source={{ uri: previewImage }} style={{ width: '100%', height: 200, borderRadius: 16, marginBottom: 14 }} resizeMode="cover" />
            ) : null}

            <Text style={styles.inputLabel}>Title</Text>
            <TextInput style={styles.input} value={design.title} onChangeText={(text) => updateDesign(designIndex, 'title', text)} />

            <Text style={styles.inputLabel}>Arrangement Type / Category</Text>
            <TextInput style={styles.input} value={design.category} onChangeText={(text) => updateDesign(designIndex, 'category', text)} />

            <Text style={styles.inputLabel}>Description</Text>
            <TextInput style={[styles.input, { minHeight: 88, textAlignVertical: 'top' }]} multiline value={design.description} onChangeText={(text) => updateDesign(designIndex, 'description', text)} />

            <Text style={styles.inputLabel}>Rough Description</Text>
            <TextInput style={[styles.input, { minHeight: 88, textAlignVertical: 'top' }]} multiline value={design.roughDescription} onChangeText={(text) => updateDesign(designIndex, 'roughDescription', text)} />

            <Text style={styles.inputLabel}>Notes / Inclusions</Text>
            <TextInput style={[styles.input, { minHeight: 88, textAlignVertical: 'top' }]} multiline value={design.notes} onChangeText={(text) => updateDesign(designIndex, 'notes', text)} />

            <Text style={styles.inputLabel}>Price Range Label</Text>
            <TextInput style={styles.input} value={design.priceRangeLabel} onChangeText={(text) => updateDesign(designIndex, 'priceRangeLabel', text)} placeholder="e.g. Usually around PHP 3,800 to PHP 5,000" />

            <Text style={styles.inputLabel}>Sort Order</Text>
            <TextInput style={styles.input} value={String(design.sortOrder ?? '')} keyboardType="numeric" onChangeText={(text) => updateDesign(designIndex, 'sortOrder', text)} />

            <Text style={styles.inputLabel}>Visibility</Text>
            <TouchableOpacity
              style={[compactButton, { alignSelf: 'flex-start', backgroundColor: design.isActive ? '#ecfdf3' : '#f3f4f6', marginBottom: 16 }]}
              onPress={() => updateDesign(designIndex, 'isActive', !design.isActive)}
            >
              <Text style={{ color: design.isActive ? '#047857' : '#4b5563', fontWeight: '700' }}>{design.isActive ? 'Active' : 'Inactive'}</Text>
            </TouchableOpacity>

            <View style={[inlineRowStyle, { justifyContent: 'space-between', marginTop: 8, marginBottom: 8 }]}>
              <Text style={styles.sectionTitle}>Reference Images</Text>
              <TouchableOpacity style={[compactButton, { backgroundColor: '#fff1f5' }]} onPress={() => uploadImageToList(designIndex, 'referenceImages', (url) => ({ id: `image-${Date.now()}`, url, alt: '' }))}>
                <Text style={{ color: '#be185d', fontWeight: '700' }}>Upload Image</Text>
              </TouchableOpacity>
            </View>

            {(design.referenceImages || []).map((imageItem, imageIndex) => (
              <View key={imageItem.id || `image-${imageIndex}`} style={[sectionCardStyle, { marginBottom: 12, padding: 12 }]}>
                {imageItem.url ? (
                  <Image source={{ uri: imageItem.url }} style={{ width: '100%', height: 180, borderRadius: 14, marginBottom: 10 }} resizeMode="cover" />
                ) : null}
                <Text style={styles.inputLabel}>Image URL</Text>
                <TextInput style={styles.input} value={imageItem.url} onChangeText={(text) => updateNestedItem(designIndex, 'referenceImages', imageIndex, 'url', text)} />
                <Text style={styles.inputLabel}>Alt Text</Text>
                <TextInput style={styles.input} value={imageItem.alt} onChangeText={(text) => updateNestedItem(designIndex, 'referenceImages', imageIndex, 'alt', text)} />
                <TouchableOpacity style={[compactButton, { backgroundColor: '#fee2e2', alignSelf: 'flex-start' }]} onPress={() => removeNestedItem(designIndex, 'referenceImages', imageIndex)}>
                  <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Remove Image</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={[compactButton, { backgroundColor: '#fdf2f8', alignSelf: 'flex-start', marginBottom: 16 }]} onPress={() => addNestedItem(designIndex, 'referenceImages', createImageItem)}>
              <Text style={{ color: '#be185d', fontWeight: '700' }}>Add Image Row</Text>
            </TouchableOpacity>

            <View style={[inlineRowStyle, { justifyContent: 'space-between', marginBottom: 8 }]}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.sectionTitle}>Visual Variants</Text>
                <Text style={{ color: '#6b7280', lineHeight: 18 }}>
                  Use strategy IDs like `closest-match`, `balanced-changes`, or `essentials-only` so the web form can match the right preview.
                </Text>
              </View>
              <View style={{ gap: 8 }}>
                <TouchableOpacity style={[compactButton, { backgroundColor: '#fff1f5', marginBottom: 8 }]} onPress={() => uploadImageToList(designIndex, 'visualVariants', (url) => ({ ...createVisualVariant(), imageUrl: url, label: 'Uploaded preview' }))}>
                  <Text style={{ color: '#be185d', fontWeight: '700' }}>Upload Variant</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[compactButton, { backgroundColor: '#fdf2f8' }]} onPress={() => addNestedItem(designIndex, 'visualVariants', createVisualVariant)}>
                  <Text style={{ color: '#be185d', fontWeight: '700' }}>Add Row</Text>
                </TouchableOpacity>
              </View>
            </View>

            {(design.visualVariants || []).map((variant, variantIndex) => (
              <View key={variant.id || `variant-${variantIndex}`} style={[sectionCardStyle, { marginBottom: 12, padding: 12 }]}>
                {variant.imageUrl ? (
                  <Image source={{ uri: variant.imageUrl }} style={{ width: '100%', height: 180, borderRadius: 14, marginBottom: 10 }} resizeMode="cover" />
                ) : null}
                {Object.keys(variant).map((field) => {
                  const value = variant[field];
                  const isBoolean = typeof value === 'boolean';

                  return (
                    <View key={field}>
                      <Text style={styles.inputLabel}>{field}</Text>
                      {isBoolean ? (
                        <TouchableOpacity
                          style={[
                            compactButton,
                            { alignSelf: 'flex-start', backgroundColor: value ? '#ecfdf3' : '#f3f4f6', marginBottom: 10 },
                          ]}
                          onPress={() => updateNestedItem(designIndex, 'visualVariants', variantIndex, field, !value)}
                        >
                          <Text style={{ color: value ? '#047857' : '#4b5563', fontWeight: '700' }}>{value ? 'Yes' : 'No'}</Text>
                        </TouchableOpacity>
                      ) : (
                        <TextInput
                          style={[styles.input, { minHeight: longTextFields.has(field) ? 88 : undefined, textAlignVertical: longTextFields.has(field) ? 'top' : 'center' }]}
                          value={String(value ?? '')}
                          multiline={longTextFields.has(field)}
                          onChangeText={(text) => updateNestedItem(designIndex, 'visualVariants', variantIndex, field, text)}
                        />
                      )}
                    </View>
                  );
                })}
                <TouchableOpacity style={[compactButton, { backgroundColor: '#fee2e2', alignSelf: 'flex-start' }]} onPress={() => removeNestedItem(designIndex, 'visualVariants', variantIndex)}>
                  <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Remove Variant</Text>
                </TouchableOpacity>
              </View>
            ))}

            {[
              ['packageTiers', 'Package Tiers', createTier],
              ['wrappers', 'Wrapper Options', createWrapper],
              ['components', 'Components', createComponent],
              ['accessories', 'Accessories', createAccessory],
              ['addOns', 'Add-ons', createAddOn],
            ].map(([listKey, title, factory]) => (
              <View key={listKey}>
                <View style={[inlineRowStyle, { justifyContent: 'space-between', marginBottom: 8 }]}>
                  <Text style={styles.sectionTitle}>{title}</Text>
                  <TouchableOpacity style={[compactButton, { backgroundColor: '#fff1f5' }]} onPress={() => addNestedItem(designIndex, listKey, factory)}>
                    <Text style={{ color: '#be185d', fontWeight: '700' }}>Add</Text>
                  </TouchableOpacity>
                </View>

                {(design[listKey] || []).map((item, itemIndex) => (
                  <View key={item.id || `${listKey}-${itemIndex}`} style={[sectionCardStyle, { marginBottom: 12, padding: 12 }]}>
                    {Object.keys(item).map((field) => {
                      const value = item[field];
                      const isBoolean = typeof value === 'boolean';

                      return (
                        <View key={field}>
                          <Text style={styles.inputLabel}>{field}</Text>
                          {isBoolean ? (
                            <TouchableOpacity
                              style={[
                                compactButton,
                                { alignSelf: 'flex-start', backgroundColor: value ? '#ecfdf3' : '#f3f4f6', marginBottom: 10 },
                              ]}
                              onPress={() => updateNestedItem(designIndex, listKey, itemIndex, field, !value)}
                            >
                              <Text style={{ color: value ? '#047857' : '#4b5563', fontWeight: '700' }}>{value ? 'Yes' : 'No'}</Text>
                            </TouchableOpacity>
                          ) : (
                            <TextInput
                              style={[styles.input, { minHeight: longTextFields.has(field) ? 88 : undefined, textAlignVertical: longTextFields.has(field) ? 'top' : 'center' }]}
                              value={String(value ?? '')}
                              multiline={longTextFields.has(field)}
                              onChangeText={(text) => updateNestedItem(designIndex, listKey, itemIndex, field, text)}
                            />
                          )}
                        </View>
                      );
                    })}

                    <TouchableOpacity style={[compactButton, { backgroundColor: '#fee2e2', alignSelf: 'flex-start' }]} onPress={() => removeNestedItem(designIndex, listKey, itemIndex)}>
                      <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Remove {String(title).slice(0, -1)}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ))}
          </View>
        );
      })}

      <TouchableOpacity style={[styles.addButton, { alignSelf: 'center', marginTop: 8, marginBottom: 40, opacity: isSaving ? 0.8 : 1 }]} onPress={handleSave} disabled={isSaving}>
        <Text style={styles.addButtonText}>{isSaving ? 'Saving...' : 'Save Custom Order v4 Catalog'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

export default CustomOrderV4Tab;

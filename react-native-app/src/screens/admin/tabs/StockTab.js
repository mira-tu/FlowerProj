import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { adminAPI, BASE_URL } from '../../../config/api';
import { supabase } from '../../../config/supabase';
import styles from '../../AdminDashboard.styles';
import PromoManager from '../components/PromoManager';
import ProductCard from '../components/ProductCard';

const STOCK_CATEGORY_TABS = [
  { key: 'Wrappers', label: 'Wrappers', icon: 'gift' },
  { key: 'Ribbons', label: 'Ribbons', icon: 'ribbon' },
  { key: 'Flowers', label: 'Flowers', icon: 'flower' },
];

const normalizeStockCategory = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'wrapper' || normalized === 'wrappers') return 'Wrappers';
  if (normalized === 'ribbon' || normalized === 'ribbons') return 'Ribbons';
  if (normalized === 'flower' || normalized === 'flowers') return 'Flowers';
  return String(value || '').trim();
};
const RIBBON_SCOPE_OPTIONS = [
  { value: 'classic_bouquet', label: 'Classic Bouquet' },
  { value: 'palm_halo_wrap', label: 'Palm Halo Wrap' },
];
const PALM_HALO_RIBBON_NAME_PREFIX = 'Palm Halo Ribbon - ';
const normalizeRibbonScope = (value) => {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

  if (!normalized || normalized === 'classic' || normalized === 'classic_wrap' || normalized === 'classic_bouquet') {
    return 'classic_bouquet';
  }

  if (normalized === 'palm_halo' || normalized === 'palm_halo_wrap' || normalized === 'palmhalo') {
    return 'palm_halo_wrap';
  }

  return normalized;
};
const ADMIN_PLACEHOLDER_TEXT_COLOR = '#9ca3af';
const getRibbonScopeLabel = (value) => (
  normalizeRibbonScope(value) === 'palm_halo_wrap'
    ? 'Palm Halo Wrap'
    : 'Classic Bouquet'
);
const isWrapperStockItem = (item) => normalizeStockCategory(item?.category) === 'Wrappers';
const isRibbonStockItem = (item) => normalizeStockCategory(item?.category) === 'Ribbons';
const getWrapperDesignName = (item) => {
  const explicitGroupName = String(item?.wrapper_group_name || '').trim();
  if (explicitGroupName) return explicitGroupName;
  return String(item?.name || '').trim();
};
const getWrapperColorName = (item) => String(item?.wrapper_color || '').trim();
const stripPalmHaloRibbonNamePrefix = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed.toLowerCase().startsWith(PALM_HALO_RIBBON_NAME_PREFIX.toLowerCase())) {
    return trimmed.slice(PALM_HALO_RIBBON_NAME_PREFIX.length).trim();
  }
  return trimmed;
};
const buildRibbonStockName = (name, scope) => {
  const normalizedName = stripPalmHaloRibbonNamePrefix(name);
  if (!normalizedName) return '';
  return normalizeRibbonScope(scope) === 'palm_halo_wrap'
    ? `${PALM_HALO_RIBBON_NAME_PREFIX}${normalizedName}`
    : normalizedName;
};
const getStockDisplayName = (item) => {
  if (isRibbonStockItem(item)) {
    return stripPalmHaloRibbonNamePrefix(item?.name || '');
  }
  if (!isWrapperStockItem(item)) return item?.name || '';
  return getWrapperDesignName(item) || item?.name || '';
};
const getStockDescription = (item) => {
  if (!isWrapperStockItem(item)) return '';
  const colorName = getWrapperColorName(item);
  return colorName ? `Color variation: ${colorName}` : 'Single wrapper design';
};
const getStockMetadataDescription = (item) => {
  if (isWrapperStockItem(item)) return getStockDescription(item);
  if (isRibbonStockItem(item)) return `Applies to: ${getRibbonScopeLabel(resolveRibbonScopeForStockItem(item))}`;
  return '';
};
const parseStockCustomizationConfig = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
};
const resolveRibbonScopeForStockItem = (item) => {
  const explicitScope = String(item?.ribbon_scope || '').trim();
  if (explicitScope) {
    return normalizeRibbonScope(explicitScope);
  }

  const customizationConfig = parseStockCustomizationConfig(
    item?.customization_config
    || item?.customizer_metadata
    || item?.wrapper_behavior
  );
  const configScope = String(
    customizationConfig?.ribbon_scope
    || customizationConfig?.ribbonScope
    || customizationConfig?.scope
    || ''
  ).trim();

  if (configScope) {
    return normalizeRibbonScope(configScope);
  }

  const searchableText = [
    item?.name,
    customizationConfig?.stockLabel,
    customizationConfig?.scopeLabel,
    customizationConfig?.wrapperMode,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (searchableText.includes('palm halo')) {
    return 'palm_halo_wrap';
  }

  return 'classic_bouquet';
};
const getStockImageUrl = (item) => {
  const rawImageUrl = item?.image_url || item?.preview_image_url || item?.layer_image_url || '';
  if (!rawImageUrl) return null;
  if (rawImageUrl.startsWith('http') || rawImageUrl.startsWith('data:')) {
    return rawImageUrl;
  }
  return `${BASE_URL}${rawImageUrl}`;
};
const CUSTOMIZED_PROMO_KEYS = [
  'customized_free_shipping_enabled',
  'customized_free_shipping_min_order_amount',
];
const parseAppContentBoolean = (value) => ['true', '1', 'yes'].includes(String(value || '').trim().toLowerCase());
const STOCK_RETRY_DELAYS_MS = [350, 700];
const isTransientStockFetchError = (error) => {
  const haystack = `${String(error?.message || '')} ${String(error?.details || '')} ${String(error?.hint || '')}`.toLowerCase();
  return [
    'failed to fetch',
    'network request failed',
    'network error',
    'load failed',
    'connection closed',
    'err_connection_closed',
  ].some((token) => haystack.includes(token));
};
const waitForStockRetry = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const withStockRetry = async (task) => {
  let lastError = null;

  for (let attempt = 0; attempt <= STOCK_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;

      if (attempt >= STOCK_RETRY_DELAYS_MS.length || !isTransientStockFetchError(error)) {
        throw error;
      }

      await waitForStockRetry(STOCK_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError || new Error('Failed to fetch stock data.');
};

const StockTab = ({ handleSelectCustomerForMessage } = {}) => {
  const [activeStockTab, setActiveStockTab] = useState('Ribbons');
  const [ribbonScopeFilter, setRibbonScopeFilter] = useState('classic_bouquet');
  const [searchQuery, setSearchQuery] = useState('');
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingPromo, setSavingPromo] = useState(false);
  const [stockLoadError, setStockLoadError] = useState('');
  const [promoLoadError, setPromoLoadError] = useState('');
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [stockToDelete, setStockToDelete] = useState(null);
  const [customizedPromo, setCustomizedPromo] = useState({
    enabled: false,
    minimumOrderAmount: '',
  });

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStock, setEditingStock] = useState(null);
  const [stockFormData, setStockFormData] = useState({
    name: '',
    price: '',
    quantity: '',
    unit: '',
    is_available: true, // Boolean status field
    wrapper_color: '',
    ribbon_scope: 'classic_bouquet',
    image: null,
  });

  const loadStock = useCallback(async ({ silent = false } = {}) => {

    setLoading(true);
    setStockLoadError('');

    try {

      const response = await withStockRetry(() => adminAPI.getAllStock());
      setStockItems(response.data || []);

    } catch (error) {

      console.error('Error loading stock:', error);
      setStockLoadError('Unable to connect to stock data right now. Pull to refresh or tap Retry.');
      if (!silent) {
        Toast.show({
          type: 'error',
          text1: 'Stock connection issue',
          text2: 'The stock list could not be refreshed right now.',
        });
      }

    } finally {

      setLoading(false);

    }

  }, []);

  const loadCustomizedStudioPromo = useCallback(async () => {
    setPromoLoadError('');

    try {
      const data = await withStockRetry(async () => {
        const { data: promoData, error } = await supabase
          .from('app_content')
          .select('key, value')
          .in('key', CUSTOMIZED_PROMO_KEYS);

        if (error) {
          throw error;
        }

        return promoData;
      });

      const getValue = (key) => data?.find((entry) => entry.key === key)?.value ?? '';

      setCustomizedPromo({
        enabled: parseAppContentBoolean(getValue('customized_free_shipping_enabled')),
        minimumOrderAmount: String(getValue('customized_free_shipping_min_order_amount') || '').trim(),
      });
    } catch (error) {
      console.error('Error loading customized free shipping promo:', error);
      setPromoLoadError('Customizer Studio promo settings could not be refreshed right now.');
    }
  }, []);

  useEffect(() => {
    loadStock({ silent: true }).finally(() => {
      loadCustomizedStudioPromo();
    });

    const channel = supabase
      .channel('admin-stock-products')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stock_products',
        },
        () => {
          loadStock();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_content',
        },
        () => {
          loadCustomizedStudioPromo();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadStock, loadCustomizedStudioPromo]);



  const onRefresh = async () => {

    setRefreshing(true);

    await loadStock({ silent: true });
    await loadCustomizedStudioPromo();

    setRefreshing(false);

  };

  const handleSaveCustomizedPromo = async () => {
    const trimmedAmount = customizedPromo.minimumOrderAmount.trim();

    if (customizedPromo.enabled) {
      if (!trimmedAmount) {
        Alert.alert('Error', 'Promo minimum order amount is required when the customizer promo is enabled.');
        return;
      }

      if (!/^\d+(\.\d{1,2})?$/.test(trimmedAmount) || parseFloat(trimmedAmount) <= 0) {
        Alert.alert('Error', 'Promo minimum order amount must be a valid number greater than 0.');
        return;
      }
    }

    setSavingPromo(true);
    try {
      const updates = [
        { key: 'customized_free_shipping_enabled', value: customizedPromo.enabled ? 'true' : 'false' },
        { key: 'customized_free_shipping_min_order_amount', value: customizedPromo.enabled ? trimmedAmount : '0' },
      ];

      const { data: existingKeysData, error: fetchError } = await supabase
        .from('app_content')
        .select('key')
        .in('key', CUSTOMIZED_PROMO_KEYS);

      if (fetchError) {
        throw fetchError;
      }

      const existingKeys = new Set((existingKeysData || []).map((item) => item.key));

      for (const item of updates) {
        if (existingKeys.has(item.key)) {
          const { error } = await supabase
            .from('app_content')
            .update({ value: item.value, updated_at: new Date().toISOString() })
            .eq('key', item.key);

          if (error) {
            throw error;
          }
        } else {
          const { error } = await supabase
            .from('app_content')
            .insert([{ key: item.key, value: item.value }]);

          if (error) {
            throw error;
          }
        }
      }

      Toast.show({ type: 'success', text1: 'Customizer promo saved' });
      await loadCustomizedStudioPromo();
    } catch (error) {
      console.error('Error saving customized free shipping promo:', error);
      Alert.alert('Error', error.message || 'Failed to save customized free shipping promo.');
    } finally {
      setSavingPromo(false);
    }
  };



  const resetForm = () => {

    setStockFormData({

      name: '',

      price: '',

      quantity: '',

      unit: '',

      is_available: true, // Boolean status field

      wrapper_color: '',

      ribbon_scope: normalizeStockCategory(activeStockTab) === 'Ribbons' ? 'classic_bouquet' : '',

      image: null,

    });

    setEditingStock(null);

  };



  const pickImage = async () => {

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission?.granted) {
        Alert.alert('Permission needed', 'Photo library access is required to select images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({

        mediaTypes: ImagePicker.MediaTypeOptions.Images,

        allowsEditing: true,

        aspect: [4, 3],

        quality: 1,

        base64: true,

      });



      if (!result.canceled) {

        setStockFormData((prev) => ({ ...prev, image: result.assets[0] }));

      }

    } catch (error) {

      console.error('Error launching image library:', error);

      Alert.alert('Error', 'Failed to open image library. Please try again.');

    }

  };



  const takePhoto = async () => {

    try {

      const { status } = await ImagePicker.requestCameraPermissionsAsync();

      if (status !== 'granted') {

        Alert.alert('Permission needed', 'Camera permission is required to take photos');

        return;

      }



      const result = await ImagePicker.launchCameraAsync({

        allowsEditing: true,

        aspect: [4, 3],

        quality: 1,

        base64: true,

      });



      if (!result.canceled) {

        setStockFormData((prev) => ({ ...prev, image: result.assets[0] }));

      }

    } catch (error) {

      console.error('Error launching camera:', error);

      Alert.alert('Error', 'Failed to open camera. Please try again.');

    }

  };



  const handleEditStock = (item) => {
    const imageUrl = getStockImageUrl(item);

    setEditingStock(item);

    setStockFormData({

      name: getStockDisplayName(item),

      price: item.price ? item.price.toString() : '',

      quantity: item.quantity ? item.quantity.toString() : '',

      unit: item.unit || '',

      is_available: item.is_available, // Corrected: use item.is_available from API

      wrapper_color: getWrapperColorName(item),

      ribbon_scope: isRibbonStockItem(item) ? resolveRibbonScopeForStockItem(item) : '',

      image: imageUrl ? { uri: imageUrl } : null,

    });

    setModalVisible(true);

  };



  const handleDeleteStock = (item) => {
    setStockToDelete(item);
    setDeleteConfirmVisible(true);
  };

  const performDeleteStock = async () => {
    if (!stockToDelete) return;
    try {
      await adminAPI.deleteStock(stockToDelete.id);
      Toast.show({ type: 'success', text1: 'Item deleted' });
      setDeleteConfirmVisible(false);
      setStockToDelete(null);
      await loadStock();
    } catch (error) {
      console.error('Delete stock failed:', error);
      Toast.show({ type: 'error', text1: 'Failed to delete item' });
    }
  };



  const handleSaveStock = async () => {

    const normalizedCategory = normalizeStockCategory(activeStockTab);
    const trimmedName = stockFormData.name.trim();
    const trimmedWrapperColor = stockFormData.wrapper_color.trim();
    const normalizedRibbonScope = normalizedCategory === 'Ribbons'
      ? normalizeRibbonScope(stockFormData.ribbon_scope)
      : null;

    if (!trimmedName || !stockFormData.quantity) {

      Alert.alert('Error', 'Please fill in Name and Quantity');

      return;

    }



    setLoading(true);

    try {

      const data = {

        ...stockFormData,

        name: normalizedCategory === 'Ribbons'
          ? buildRibbonStockName(trimmedName, normalizedRibbonScope)
          : trimmedName,
        category: normalizedCategory,

        price: parseFloat(stockFormData.price) || 0,

        quantity: parseInt(stockFormData.quantity) || 0,

        is_available: stockFormData.is_available, // Corrected: send is_available

        wrapper_group_name: normalizedCategory === 'Wrappers' ? trimmedName : null,
        wrapper_color: normalizedCategory === 'Wrappers' && trimmedWrapperColor ? trimmedWrapperColor : null,
        ribbon_scope: normalizedRibbonScope,

        image: stockFormData.image,

      };

      console.log('DEBUG: Saving stock with data:', {
        name: data.name,
        category: data.category,
        ribbon_scope: data.ribbon_scope,
        stockFormData_ribbon_scope: stockFormData.ribbon_scope,
      });



      if (editingStock) {

        await adminAPI.updateStock(editingStock.id, { ...data, old_image_url: editingStock.image_url });

        Alert.alert('Success', 'Item updated successfully');

      } else {
        await adminAPI.createStock(data);
        Alert.alert('Success', 'Item added successfully');
        if (normalizedCategory === 'Ribbons' && data.ribbon_scope) {
          setRibbonScopeFilter(data.ribbon_scope);
        }
      }
      setModalVisible(false);
      resetForm();
      await loadStock();
    } catch (error) {
      console.error('Error saving stock:', error);
      Alert.alert('Error', error.message || 'Failed to save item');
    } finally {
      setLoading(false);
    }
  };

  const filteredStock = useMemo(() => {
    const items = stockItems.filter((item) => normalizeStockCategory(item.category) === activeStockTab);
    const scopedItems = activeStockTab !== 'Ribbons'
      ? items
      : items.filter((item) => resolveRibbonScopeForStockItem(item) === ribbonScopeFilter);
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const searchedItems = normalizedSearch
      ? scopedItems.filter((item) => [
        getStockDisplayName(item),
        getStockMetadataDescription(item),
        item?.unit,
        item?.quantity,
        item?.price,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch))
      : scopedItems;

    return searchedItems.sort((left, right) => getStockDisplayName(left).localeCompare(getStockDisplayName(right)));
  }, [activeStockTab, ribbonScopeFilter, searchQuery, stockItems]);
  const modalStockCategory = normalizeStockCategory(editingStock?.category || activeStockTab);
  const isWrapperForm = modalStockCategory === 'Wrappers';
  const isRibbonForm = modalStockCategory === 'Ribbons';

  const renderStockItem = ({ item }) => {
    const imageUrl = getStockImageUrl(item);

    return (
      <ProductCard
        imageUrl={imageUrl}
        name={getStockDisplayName(item)}
        category={item.category || 'Uncategorized'}
        description={getStockMetadataDescription(item)}
        showDescription={Boolean(getStockMetadataDescription(item))}
        priceText={`₱${item.price || '0'} / ${item.unit || 'unit'}`}
        stockText={`Qty: ${item.quantity}`}
        showActions
        onEdit={() => handleEditStock(item)}
        onDelete={() => handleDeleteStock(item)}
      >
        <View style={styles.stockAvailability}>
          <View style={[styles.availabilityDot, { backgroundColor: item.is_available ? '#4CAF50' : '#f44336' }]} />
          <Text style={styles.stockAvailabilityText}>
            {item.is_available ? 'Available' : 'Unavailable'}
          </Text>
        </View>
      </ProductCard>
    );
  };

  if (loading && !refreshing && !modalVisible) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>Loading stock...</Text>
      </View>
    );
  }

  const stockListHeader = (
    <>
      {stockLoadError ? (
        <View style={[styles.catalogueDiscountPreview, { marginBottom: 14, backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
          <Text style={[styles.catalogueDiscountPreviewLabel, { color: '#b91c1c', textAlign: 'center' }]}>
            Stock Connection Issue
          </Text>
          <Text style={[styles.catalogueDiscountHint, { color: '#991b1b', marginBottom: 12, textAlign: 'center' }]}>
            {stockLoadError}
          </Text>
          <TouchableOpacity
            style={[styles.addButton, { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 18 }]}
            onPress={() => loadStock()}
          >
            <Text style={styles.addButtonText}>Retry Stock Load</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={[styles.catalogueDiscountPreview, { marginTop: 14, marginBottom: 14, backgroundColor: '#ecfdf5' }]}>
        <Text style={[styles.catalogueDiscountPreviewLabel, { color: '#166534', textAlign: 'center' }]}>
          Customizer Studio Free Delivery
        </Text>
        <Text style={[styles.catalogueDiscountHint, { color: '#166534', marginBottom: 12, textAlign: 'center' }]}>
          This applies only to Customizer Studio bouquet checkouts on the web app.
        </Text>

        {promoLoadError ? (
          <Text style={[styles.catalogueDiscountHint, { color: '#b91c1c', marginBottom: 12, textAlign: 'center' }]}>
            {promoLoadError}
          </Text>
        ) : null}

        <View style={styles.toggleRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.inputLabel}>Enable Promo</Text>
            <Text style={styles.inputHelperText}>
              Let customers unlock free delivery once their customized bouquet subtotal reaches the promo amount.
            </Text>
          </View>
          <Switch
            value={customizedPromo.enabled}
            onValueChange={(value) => setCustomizedPromo((previous) => ({ ...previous, enabled: value }))}
            trackColor={{ false: '#d1d5db', true: '#bbf7d0' }}
            thumbColor={customizedPromo.enabled ? '#16a34a' : '#9ca3af'}
          />
        </View>

        {customizedPromo.enabled ? (
          <>
            <Text style={styles.inputLabel}>Promo Minimum Order Amount *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter minimum order amount"
              placeholderTextColor={ADMIN_PLACEHOLDER_TEXT_COLOR}
              keyboardType="numeric"
              value={customizedPromo.minimumOrderAmount}
              onChangeText={(text) => setCustomizedPromo((previous) => ({
                ...previous,
                minimumOrderAmount: text.replace(/[^0-9.]/g, ''),
              }))}
            />
          </>
        ) : null}

        <TouchableOpacity
          style={[styles.addButton, { alignSelf: 'center', marginTop: 8, paddingVertical: 12, paddingHorizontal: 18 }]}
          onPress={handleSaveCustomizedPromo}
          disabled={savingPromo}
        >
          <Text style={styles.addButtonText}>{savingPromo ? 'Saving...' : 'Save Studio Promo'}</Text>
        </TouchableOpacity>
      </View>

      <PromoManager
        channelScope="customized"
        title="Customizer Studio Promos"
        customizedTargetOptions={stockItems.map((item) => ({
          id: String(item.id),
          label: `${getStockDisplayName(item)}${item.category ? ` - ${item.category}` : ''}`,
        }))}
        onMessageCustomer={handleSelectCustomerForMessage}
      />

      <TouchableOpacity style={styles.addButton} onPress={() => { resetForm(); setModalVisible(true); }}>
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.addButtonText}>Add {activeStockTab.slice(0, -1)}</Text>
      </TouchableOpacity>

      <View style={styles.stockTabs}>
        {STOCK_CATEGORY_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.stockTab, activeStockTab === tab.key && styles.stockTabActive]}
            onPress={() => setActiveStockTab(tab.key)}
          >
            <Ionicons
              name={tab.icon}
              size={20}
              color={activeStockTab === tab.key ? '#ec4899' : '#666'}
            />
            <Text style={[styles.stockTabText, activeStockTab === tab.key && styles.stockTabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeStockTab === 'Ribbons' ? (
        <View style={{ marginTop: 14, marginBottom: 8 }}>
          <Text style={[styles.inputLabel, { textAlign: 'center', marginBottom: 10 }]}>Ribbon Scope</Text>
          <View style={styles.categoryGrid}>
            {RIBBON_SCOPE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.modalCategoryChip,
                  ribbonScopeFilter === option.value && styles.modalCategoryChipActive,
                ]}
                onPress={() => setRibbonScopeFilter(option.value)}
              >
                <Text
                  style={[
                    styles.modalCategoryChipText,
                    ribbonScopeFilter === option.value && styles.modalCategoryChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      <View style={[styles.riderSearchContainer, { marginTop: 6, marginBottom: 10 }]}>
        <Ionicons name="search" size={20} color="#999" style={styles.riderSearchIcon} />
        <TextInput
          style={styles.riderSearchInput}
          placeholder={`Search ${activeStockTab.toLowerCase()}...`}
          placeholderTextColor={ADMIN_PLACEHOLDER_TEXT_COLOR}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="#9ca3af" />
          </TouchableOpacity>
        ) : null}
      </View>
    </>
  );

  return (
    <View style={styles.tabContent}>
      <FlatList
        data={filteredStock}
        renderItem={renderStockItem}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ec4899']} />
        }
        ListHeaderComponent={stockListHeader}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {activeStockTab === 'Ribbons'
              ? `No ${getRibbonScopeLabel(ribbonScopeFilter).toLowerCase()} ribbons found`
              : `No ${activeStockTab.toLowerCase()} found`}
          </Text>
        }
      />

      {/* Delete Confirmation Modal */}
      <Modal visible={deleteConfirmVisible} animationType="fade" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Delete Item</Text>
            <Text style={styles.modalText}>Are you sure you want to delete this item?</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => { setDeleteConfirmVisible(false); setStockToDelete(null); }}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.deleteButton]} onPress={performDeleteStock}>
                <Text style={styles.buttonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add/Edit Stock Modal */}

      <Modal visible={modalVisible} animationType="slide" transparent>

        <View style={styles.modalContainer}>

          <View style={styles.modalContent}>

            <View style={styles.modalHeader}>

              <Text style={styles.modalTitle}>

                {editingStock ? 'Edit Stock Item' : 'Add Stock Item'}

              </Text>

              <TouchableOpacity onPress={() => setModalVisible(false)}>

                <Ionicons name="close" size={24} color="#333" />

              </TouchableOpacity>

            </View>

            <ScrollView showsVerticalScrollIndicator={false}>

              <Text style={styles.inputLabel}>{isWrapperForm ? 'Wrapper Design Name *' : 'Item Name *'}</Text>

              <TextInput
                style={styles.input}
                placeholder={isWrapperForm ? 'e.g. Classic Wrap' : 'Enter item name'}
                placeholderTextColor={ADMIN_PLACEHOLDER_TEXT_COLOR}
                value={stockFormData.name}

                onChangeText={(text) => setStockFormData((prev) => ({ ...prev, name: text }))}

              />

              {isWrapperForm && (
                <Text style={styles.inputHelperText}>
                  Use the same design name on multiple wrapper entries, then give each entry its own color variation.
                </Text>
              )}

              {isRibbonForm && (
                <>
                  <Text style={styles.inputLabel}>Ribbon Scope</Text>

                  <View style={styles.categoryGrid}>
                    {RIBBON_SCOPE_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.modalCategoryChip,
                          normalizeRibbonScope(stockFormData.ribbon_scope) === option.value && styles.modalCategoryChipActive
                        ]}
                        onPress={() => {
                          console.log('DEBUG: Ribbon scope button pressed:', option.value);
                          setStockFormData((prev) => {
                            console.log('DEBUG: Previous ribbon_scope:', prev.ribbon_scope);
                            const next = { ...prev, ribbon_scope: option.value };
                            console.log('DEBUG: Next ribbon_scope:', next.ribbon_scope);
                            return next;
                          });
                        }}
                      >
                        <Text
                          style={[
                            styles.modalCategoryChipText,
                            normalizeRibbonScope(stockFormData.ribbon_scope) === option.value && styles.modalCategoryChipTextActive
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.inputHelperText}>
                    Use Classic Bouquet for the normal bouquet ribbons, and Palm Halo Wrap for the stand-flower ribbon.
                  </Text>
                </>
              )}

              <View style={styles.rowInputs}>

                <View style={styles.halfInput}>

                  <Text style={styles.inputLabel}>Price</Text>

                  <TextInput
                    style={styles.input}
                    placeholder="0.00"
                    placeholderTextColor={ADMIN_PLACEHOLDER_TEXT_COLOR}
                    keyboardType="numeric"

                    value={stockFormData.price}

                    onChangeText={(text) => setStockFormData((prev) => ({ ...prev, price: text }))}

                  />

                </View>

                <View style={styles.halfInput}>

                  <Text style={styles.inputLabel}>Quantity *</Text>

                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    placeholderTextColor={ADMIN_PLACEHOLDER_TEXT_COLOR}
                    keyboardType="numeric"

                    value={stockFormData.quantity}

                    onChangeText={(text) => setStockFormData((prev) => ({ ...prev, quantity: text }))}

                  />

                </View>

              </View>

              <View style={styles.rowInputs}>

                <View style={styles.halfInput}>

                  <Text style={styles.inputLabel}>Unit</Text>

                  <TextInput
                    style={styles.input}
                    placeholder="e.g. meters"
                    placeholderTextColor={ADMIN_PLACEHOLDER_TEXT_COLOR}
                    value={stockFormData.unit}

                    onChangeText={(text) => setStockFormData((prev) => ({ ...prev, unit: text }))}

                  />

                </View>

              </View>

              {isWrapperForm && (
                <>
                  <Text style={styles.inputLabel}>Color Variation</Text>

                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Dark Blue"
                    placeholderTextColor={ADMIN_PLACEHOLDER_TEXT_COLOR}
                    value={stockFormData.wrapper_color}

                    onChangeText={(text) => setStockFormData((prev) => ({ ...prev, wrapper_color: text }))}

                  />

                  <Text style={styles.inputHelperText}>
                    Leave this empty when the wrapper is a single design with no color choices.
                  </Text>
                </>
              )}

              <Text style={styles.inputLabel}>Status</Text>

              <View style={styles.categoryGrid}>

                {[{ label: 'Available', value: true }, { label: 'Unavailable', value: false }].map((option) => (

                  <TouchableOpacity

                    key={option.label}

                    style={[

                      styles.modalCategoryChip,

                      stockFormData.is_available === option.value && styles.modalCategoryChipActive

                    ]}

                    onPress={() => setStockFormData((prev) => ({ ...prev, is_available: option.value }))}

                  >

                    <Text style={[

                      styles.modalCategoryChipText,

                      stockFormData.is_available === option.value && styles.modalCategoryChipTextActive

                    ]}>

                      {option.label}

                    </Text>

                  </TouchableOpacity>

                ))}

              </View>

              <Text style={styles.inputLabel}>Stock Image</Text>

              <TouchableOpacity style={styles.imageUploadBox} onPress={pickImage}>

                {stockFormData.image ? (

                  <Image source={{ uri: stockFormData.image.uri }} style={styles.uploadedImage} />

                ) : (

                  <View style={styles.imageUploadPlaceholder}>

                    <Ionicons name="camera" size={40} color="#ec4899" />

                    <Text style={styles.imageUploadText}>Tap to Upload Photo</Text>

                    <Text style={styles.imageUploadSubtext}>or take a picture</Text>

                  </View>

                )}

              </TouchableOpacity>

              <TouchableOpacity style={styles.takePhotoButton} onPress={takePhoto}>

                <Ionicons name="camera-outline" size={20} color="#ec4899" />

                <Text style={styles.takePhotoText}>Take Photo</Text>

              </TouchableOpacity>

            </ScrollView>

            <View style={styles.modalButtons}>

              <TouchableOpacity

                style={[styles.modalButton, styles.cancelButton]}

                onPress={() => setModalVisible(false)}

              >

                <Text style={styles.buttonText}>Cancel</Text>

              </TouchableOpacity>

              <TouchableOpacity

                style={[styles.modalButton, styles.saveButton]}

                onPress={handleSaveStock}

                disabled={loading}

              >

                <Text style={styles.buttonText}>

                  {loading ? 'Saving...' : 'Save Item'}

                </Text>

              </TouchableOpacity>

            </View>

          </View>

        </View>

      </Modal>

    </View>

  );
};

// Helper component for consistent detail display

export default StockTab;

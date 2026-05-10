import React, { useMemo, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { productAPI, categoryAPI, BASE_URL } from '../../../config/api';
import styles from '../../AdminDashboard.styles';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import PromoManager from '../components/PromoManager';
import ProductCard from '../components/ProductCard';
const ADMIN_PLACEHOLDER_TEXT_COLOR = '#9ca3af';

const clampDiscountPercentage = (value) => {
  const numericValue = parseFloat(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) return 0;
  if (numericValue >= 100) return 100;

  return Math.round(numericValue * 100) / 100;
};

const roundCurrencyValue = (value) => Math.round(((parseFloat(value) || 0) + Number.EPSILON) * 100) / 100;

const computeDiscountedPrice = (originalPrice, discountPercentage) => {
  const safeOriginalPrice = Math.max(0, roundCurrencyValue(originalPrice));
  const safeDiscountPercentage = clampDiscountPercentage(discountPercentage);

  if (safeDiscountPercentage <= 0) {
    return safeOriginalPrice;
  }

  return roundCurrencyValue(safeOriginalPrice * (1 - safeDiscountPercentage / 100));
};

const formatCurrency = (value) => `\u20b1${roundCurrencyValue(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDiscountLabel = (value) => {
  const safeDiscountPercentage = clampDiscountPercentage(value);
  const formattedValue = Number.isInteger(safeDiscountPercentage)
    ? String(safeDiscountPercentage)
    : safeDiscountPercentage.toFixed(2).replace(/\.?0+$/, '');

  return `${formattedValue}% OFF`;
};

const CatalogueTab = ({ handleSelectCustomerForMessage } = {}) => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cataloguePromosExpanded, setCataloguePromosExpanded] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false); // For Products
  const [productToDeleteId, setProductToDeleteId] = useState(null);   // For Products

  const [categoryDeleteModalVisible, setCategoryDeleteModalVisible] = useState(false); // For Categories
  const [categoryToDeleteId, setCategoryToDeleteId] = useState(null); // For Categories

  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [manageCategoriesVisible, setManageCategoriesVisible] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    discount_percentage: '0',
    category_id: '',
    stock_quantity: '',
    description: '',
    image: null,
    is_free_shipping: false,
    free_shipping_min_order_amount: '',
    is_active: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        productAPI.getAll({ includeInactive: true }),
        categoryAPI.getAll(),
      ]);

      const activeCategories = categoriesRes.data.categories || [];
      const categoriesWithAll = [{ id: 0, name: 'All' }, ...activeCategories];
      setCategories(categoriesWithAll);

      const productsWithCategoryNames = (productsRes.data.products || []).map(product => {
        const category = activeCategories.find(c => c.id == product.category_id);
        return {
          ...product,
          category_name: category ? category.name : 'Uncategorized'
        };
      }).sort((a, b) => b.id - a.id);

      setProducts(productsWithCategoryNames);

    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const getCategoryName = (categoryId) => {
    const category = categories.find(c => c.id == categoryId);
    return category ? category.name : 'Select a category';
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
        setFormData({ ...formData, image: result.assets[0] });
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
        setFormData({ ...formData, image: result.assets[0] });
      }
    } catch (error) {
      console.error('Error launching camera:', error);
      Alert.alert('Error', 'Failed to open camera. Please try again.');
    }
  };

  const filteredProducts = products.filter((product) => {
    if (selectedCategory !== 'All' && product.category_name !== selectedCategory) {
      return false;
    }

    const normalizedSearch = searchQuery.trim().toLowerCase();
    if (!normalizedSearch) {
      return true;
    }

    return [
      product.name,
      product.category_name,
      product.description,
      product.price,
      product.stock_quantity,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch);
  });

  const handleNumericInput = (field, text) => {
    const numericText = text.replace(/[^0-9.]/g, '');
    setFormData({ ...formData, [field]: numericText });
  };

  const handleIntegerInput = (field, text) => {
    const numericText = text.replace(/[^0-9]/g, '');
    setFormData({ ...formData, [field]: numericText });
  };

  const handleSubmit = async () => {
    const { name, price, discount_percentage, stock_quantity, category_id, is_free_shipping, free_shipping_min_order_amount } = formData;
    const errors = [];

    if (!name.trim()) {
      errors.push('• Product Name is required.');
    }
    if (!price) {
      errors.push('• Price is required.');
    } else if (!/^\d+(\.\d{1,2})?$/.test(price)) {
      errors.push('• Price must be a valid number (e.g., 100 or 100.99).');
    }
    if (!stock_quantity) {
      errors.push('• Quantity is required.');
    } else if (!/^\d+$/.test(stock_quantity)) {
      errors.push('• Quantity must be a whole number.');
    }
    if (!category_id) {
      errors.push('• Category is required.');
    }

    if (discount_percentage && !/^\d+(\.\d{1,2})?$/.test(discount_percentage)) {
      errors.push('Discount must be a valid percentage (e.g., 5 or 10.5).');
    } else if (parseFloat(discount_percentage || '0') > 100) {
      errors.push('Discount cannot be greater than 100%.');
    }

    if (is_free_shipping) {
      if (!free_shipping_min_order_amount) {
        errors.push('Free shipping promo minimum order amount is required.');
      } else if (!/^\d+(\.\d{1,2})?$/.test(free_shipping_min_order_amount)) {
        errors.push('Free shipping promo minimum order amount must be a valid number.');
      } else if (parseFloat(free_shipping_min_order_amount) <= 0) {
        errors.push('Free shipping promo minimum order amount must be greater than 0.');
      }

    }

    if (errors.length > 0) {
      Alert.alert('Please fix the following issues:', errors.join('\n'));
      return;
    }

    setLoading(true);
    try {
      const productData = {
        name: formData.name,
        price: formData.price,
        discount_percentage: formData.discount_percentage || '0',
        stock_quantity: formData.stock_quantity || '0',
        description: formData.description || '',
        category_id: formData.category_id || '1',
        image: formData.image, // Pass the image object from the state
        is_free_shipping: formData.is_free_shipping === true,
        free_shipping_min_order_amount: formData.free_shipping_min_order_amount || '0',
        is_active: formData.is_active,
      };

      if (editingProduct) {
        if (editingProduct.image_url) {
          productData.image_url_hidden = editingProduct.image_url;
        }
        await productAPI.update(editingProduct.id, productData);
        Alert.alert('Success', 'Product updated successfully');
      } else {
        await productAPI.create(productData);
        Alert.alert('Success', 'Product added successfully');
      }

      setModalVisible(false);
      resetForm();
      await loadData();
    } catch (error) {
      console.error('Error saving product:', error);
      Alert.alert('Error', error.message || 'Failed to save product');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      price: product.price.toString(),
      discount_percentage: product.discount_percentage?.toString() || '0',
      category_id: product.category_id?.toString() || '1',
      stock_quantity: product.stock_quantity?.toString() || '0',
      description: product.description || '',
      image: product.image_url ? { uri: product.image_url.startsWith('http') ? product.image_url : `${BASE_URL}${product.image_url}` } : null,
      is_free_shipping: product.is_free_shipping === true,
      free_shipping_min_order_amount: product.free_shipping_min_order_amount ? product.free_shipping_min_order_amount.toString() : '',
      is_active: product.is_active !== false,
    });
    setModalVisible(true);
  };

  const handleDelete = (productId) => {
    setProductToDeleteId(productId);
    setDeleteModalVisible(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      price: '',
      discount_percentage: '0',
      category_id: '',
      stock_quantity: '',
      description: '',
      image: null,
      is_free_shipping: false,
      free_shipping_min_order_amount: '',
      is_active: true,
    });
    setEditingProduct(null);
  };


  const startCategoryEdit = (category) => {
    setNewCategoryName(category.name);
    setEditingCategoryId(category.id);
  };

  const cancelCategoryEdit = () => {
    setNewCategoryName('');
    setEditingCategoryId(null);
  };

  const addCategory = async () => {
    if (!newCategoryName.trim()) {
      Alert.alert('Validation', 'Category name is required');
      return;
    }

    try {
      if (editingCategoryId) {
        await categoryAPI.updateCategory(editingCategoryId, newCategoryName.trim());
        Toast.show({ type: 'success', text1: 'Category updated' });
        setEditingCategoryId(null);
      } else {
        await categoryAPI.createCategory(newCategoryName.trim());
        Toast.show({ type: 'success', text1: 'Category added' });
      }
      setNewCategoryName('');
      await loadData();
    } catch (error) {
      console.error('Category Action Error:', JSON.stringify(error, null, 2));
      const action = editingCategoryId ? 'update' : 'add';
      if (error.code === '42501' || error.message?.includes('permission denied') || error.status === 403) {
        Alert.alert('Permission Error', `Database permissions (RLS) are blocking this action.\nPlease check permissions for '${action}' on 'categories' table.`);
      } else {
        Alert.alert('Error', error.message || `Failed to ${action} category`);
      }
    }
  };

  const promptDeleteCategory = (id) => {
    setCategoryToDeleteId(id);
    setCategoryDeleteModalVisible(true);
  };

  const renderProduct = ({ item }) => {
    const imageUrl = item.image_url
      ? item.image_url.startsWith('http')
        ? item.image_url
        : `${BASE_URL}${item.image_url}`
      : null;
    const originalPrice = roundCurrencyValue(item.original_price ?? item.price ?? 0);
    const discountPercentage = clampDiscountPercentage(item.discount_percentage);
    const discountedPrice = computeDiscountedPrice(originalPrice, discountPercentage);
    const hasDiscount = discountPercentage > 0 && discountedPrice < originalPrice;
    const freeShippingPromoAmount = roundCurrencyValue(item.free_shipping_min_order_amount || 0);
    const hasFreeShippingPromo = item.is_free_shipping === true && freeShippingPromoAmount > 0;
    const hasIncompleteFreeShippingPromo = item.is_free_shipping === true && freeShippingPromoAmount <= 0;
    return (
      <ProductCard
        imageUrl={imageUrl}
        name={item.name}
        category={item.category_name || 'Uncategorized'}
        description={item.description}
        priceText={`₱${item.price}`}
        stockText={`Qty: ${item.stock_quantity || 0}`}
        discountedPriceText={hasDiscount ? formatCurrency(discountedPrice) : formatCurrency(originalPrice)}
        originalPriceText={hasDiscount ? formatCurrency(originalPrice) : null}
        discountBadgeText={hasDiscount ? formatDiscountLabel(discountPercentage) : null}
        showDescription
        showActions
        statusBadge={item.is_active === false ? 'Unavailable' : null}
        onEdit={() => handleEdit(item)}
        onDelete={() => handleDelete(item.id)}
      >
        {hasFreeShippingPromo ? (
          <Text style={[styles.unavailableBadge, { backgroundColor: '#ecfdf5', color: '#047857', marginTop: 10 }]}>
            Free delivery from {formatCurrency(freeShippingPromoAmount)}
          </Text>
        ) : null}
        {hasIncompleteFreeShippingPromo ? (
          <Text style={[styles.unavailableBadge, { backgroundColor: '#fff7ed', color: '#c2410c', marginTop: 10 }]}>
            Promo needs a minimum amount
          </Text>
        ) : null}
      </ProductCard>
    );
  };

  const cataloguePromoProductOptions = useMemo(() => products.map((product) => ({
    id: String(product.id),
    label: product.name,
  })), [products]);
  const cataloguePromoCategoryOptions = useMemo(() => categories
    .filter((category) => category.id !== 0)
    .map((category) => ({
      id: String(category.id),
      label: category.name,
    })), [categories]);

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>Loading catalogue...</Text>
      </View>
    );
  }

  const originalPricePreview = roundCurrencyValue(formData.price);
  const discountPercentagePreview = clampDiscountPercentage(formData.discount_percentage);
  const discountedPricePreview = computeDiscountedPrice(originalPricePreview, discountPercentagePreview);
  const hasDiscountPreview = discountPercentagePreview > 0 && discountedPricePreview < originalPricePreview;
  const freeShippingPromoAmountPreview = roundCurrencyValue(formData.free_shipping_min_order_amount);
  const hasFreeShippingPromoPreview = formData.is_free_shipping === true && freeShippingPromoAmountPreview > 0;

  return (
    <View style={styles.tabContent}>
      <TouchableOpacity
        style={{
          alignItems: 'center',
          backgroundColor: '#fdf2f8',
          borderColor: '#f9a8d4',
          borderRadius: 8,
          borderWidth: 1,
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginBottom: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
        onPress={() => setCataloguePromosExpanded((expanded) => !expanded)}
        activeOpacity={0.85}
      >
        <View style={{ alignItems: 'center', flexDirection: 'row', flex: 1 }}>
          <Ionicons name="pricetags-outline" size={19} color="#be185d" />
          <Text style={{ color: '#be185d', fontSize: 15, fontWeight: '800', marginLeft: 8 }}>
            Discount Promos
          </Text>
        </View>
        <Ionicons
          name={cataloguePromosExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#be185d"
        />
      </TouchableOpacity>

      {cataloguePromosExpanded ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.listContent, { paddingTop: 0, paddingBottom: 32 }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            <PromoManager
              channelScope="catalog"
              title="Catalogue Promos"
              productOptions={cataloguePromoProductOptions}
              categoryOptions={cataloguePromoCategoryOptions}
              onMessageCustomer={handleSelectCustomerForMessage}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <>
          <View style={styles.catalogueActionRow}>
            <TouchableOpacity
              style={[styles.addButton, styles.catalogueActionButton]}
              onPress={() => {
                resetForm();
                setModalVisible(true);
              }}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={[styles.addButtonText, styles.catalogueActionButtonText]}>Add Product</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.addButton, styles.catalogueActionButton, styles.catalogueManageButton]}
              onPress={() => setManageCategoriesVisible(true)}
            >
              <Ionicons name="list" size={18} color="#fff" />
              <Text style={[styles.addButtonText, styles.catalogueActionButtonText]}>Manage Categories</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.catalogueSearchContainer}>
            <Ionicons name="search" size={18} color="#999" style={styles.catalogueSearchIcon} />
            <TextInput
              style={styles.catalogueSearchInput}
              placeholder="Search catalogue..."
              placeholderTextColor={ADMIN_PLACEHOLDER_TEXT_COLOR}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <Ionicons name="close-circle" size={18} color="#9ca3af" />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.catalogueFilterContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.catalogueCategoryScroll}
              contentContainerStyle={styles.catalogueCategoryScrollContent}
            >
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.catalogueCategoryChip,
                    selectedCategory === cat.name && styles.catalogueCategoryChipActive
                  ]}
                  onPress={() => setSelectedCategory(cat.name)}
                >
                  <Text style={[
                    styles.catalogueCategoryChipText,
                    selectedCategory === cat.name && styles.catalogueCategoryChipTextActive
                  ]} numberOfLines={1}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <FlatList
            data={filteredProducts}
            renderItem={renderProduct}
            keyExtractor={(item) => item.id.toString()}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="none"
            removeClippedSubviews={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ec4899']} />
            }
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No products found</Text>
            }
          />
        </>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingProduct ? 'Edit Product' : 'Add Product'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Product Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter product name"
                placeholderTextColor={ADMIN_PLACEHOLDER_TEXT_COLOR}
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
              />

              <Text style={styles.inputLabel}>Price *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter price"
                placeholderTextColor={ADMIN_PLACEHOLDER_TEXT_COLOR}
                keyboardType="numeric"
                value={formData.price}
                onChangeText={(text) => handleNumericInput('price', text)}
              />

              <Text style={styles.inputLabel}>Discount Percentage</Text>
              <Text style={styles.inputHelperText}>Use 0 if there is no discount.</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter discount percentage"
                placeholderTextColor={ADMIN_PLACEHOLDER_TEXT_COLOR}
                keyboardType="numeric"
                value={formData.discount_percentage}
                onChangeText={(text) => handleNumericInput('discount_percentage', text)}
              />

              <View style={styles.catalogueDiscountPreview}>
                <Text style={styles.catalogueDiscountPreviewLabel}>Selling Price</Text>
                <Text style={styles.catalogueDiscountPreviewValue}>{formatCurrency(discountedPricePreview)}</Text>
                {hasDiscountPreview ? (
                  <View style={styles.catalogueDiscountMetaRow}>
                    <Text style={styles.catalogueDiscountOriginalPrice}>{formatCurrency(originalPricePreview)}</Text>
                    <Text style={styles.catalogueDiscountBadge}>{formatDiscountLabel(discountPercentagePreview)}</Text>
                  </View>
                ) : (
                  <Text style={styles.catalogueDiscountHint}>No discount applied. Customers will only see the original price.</Text>
                )}
              </View>

              <Text style={styles.inputLabel}>Quantity *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter quantity"
                placeholderTextColor={ADMIN_PLACEHOLDER_TEXT_COLOR}
                keyboardType="numeric"
                value={formData.stock_quantity}
                onChangeText={(text) => handleIntegerInput('stock_quantity', text)}
              />

              <Text style={styles.inputLabel}>Category *</Text>
              <TouchableOpacity
                style={styles.dropdownInput}
                onPress={() => setCategoryModalVisible(true)}
              >
                <Text style={styles.dropdownInputText}>
                  {getCategoryName(formData.category_id)}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#666" />
              </TouchableOpacity>

              <View style={styles.toggleRow}>
                <Text style={styles.inputLabel}>Available to Customers</Text>
                <Switch
                  value={formData.is_active}
                  onValueChange={(value) => setFormData({ ...formData, is_active: value })}
                  trackColor={{ false: '#d1d5db', true: '#f9a8d4' }}
                  thumbColor={formData.is_active ? '#ec4899' : '#9ca3af'}
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.inputLabel}>Free Shipping Promo</Text>
                  <Text style={styles.inputHelperText}>
                    Set a product-specific promo that unlocks free delivery once the minimum order amount is reached.
                  </Text>
                </View>
                <Switch
                  value={formData.is_free_shipping}
                  onValueChange={(value) => setFormData({ ...formData, is_free_shipping: value })}
                  trackColor={{ false: '#d1d5db', true: '#bbf7d0' }}
                  thumbColor={formData.is_free_shipping ? '#16a34a' : '#9ca3af'}
                />
              </View>
              {formData.is_free_shipping && (
                <>
                  <Text style={styles.inputLabel}>Promo Minimum Order Amount *</Text>
                  <Text style={styles.inputHelperText}>
                    Free delivery will unlock only when the checkout subtotal reaches this amount and all catalogue items are promo-eligible.
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter minimum order amount"
                    placeholderTextColor={ADMIN_PLACEHOLDER_TEXT_COLOR}
                    keyboardType="numeric"
                    value={formData.free_shipping_min_order_amount}
                    onChangeText={(text) => handleNumericInput('free_shipping_min_order_amount', text)}
                  />
                  <View style={styles.catalogueDiscountPreview}>
                    <Text style={styles.catalogueDiscountPreviewLabel}>Promo Unlock Amount</Text>
                    <Text style={styles.catalogueDiscountPreviewValue}>
                      {hasFreeShippingPromoPreview ? formatCurrency(freeShippingPromoAmountPreview) : 'Set a minimum amount'}
                    </Text>
                    <Text style={styles.catalogueDiscountHint}>
                      {hasFreeShippingPromoPreview
                        ? 'Checkout will show the free shipping promo once this subtotal is reached.'
                        : 'Enter an amount greater than 0 to finish setting up this promo.'}
                    </Text>
                  </View>
                </>
              )}

              <Text style={styles.inputLabel}>Description</Text>
              <Text style={styles.inputHelperText}>Max 20 words</Text>
              <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                placeholder="Enter product description"
                placeholderTextColor={ADMIN_PLACEHOLDER_TEXT_COLOR}
                value={formData.description}
                onChangeText={(text) => setFormData({ ...formData, description: text })}
                multiline
                maxLength={20 * 5} // Approximate max length for 20 words
              />

              <Text style={styles.inputLabel}>Product Image</Text>
              <TouchableOpacity style={styles.imageUploadBox} onPress={pickImage}>
                {formData.image ? (
                  <Image source={{ uri: formData.image.uri }} style={styles.uploadedImage} />
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
                onPress={() => {
                  setModalVisible(false);
                  resetForm();
                }}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSubmit}
                disabled={loading}
              >
                <Text style={styles.buttonText}>
                  {loading ? 'Saving...' : (editingProduct ? 'Update Product' : 'Add Product')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Category Picker Modal */}
      <Modal visible={categoryModalVisible} animationType="fade" transparent>
        <TouchableOpacity style={styles.modalContainer} onPress={() => setCategoryModalVisible(false)} activeOpacity={1}>
          <View style={[styles.modalContent, { maxHeight: '50%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Category</Text>
              <TouchableOpacity onPress={() => setCategoryModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={categories.filter(c => c.id !== 0)}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.categoryPickerItem}
                  onPress={() => {
                    setFormData({ ...formData, category_id: item.id });
                    setCategoryModalVisible(false);
                  }}
                >
                  <Text style={styles.categoryPickerItemText}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>


      <Modal visible={manageCategoriesVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manage Categories</Text>
              <TouchableOpacity onPress={() => setManageCategoriesVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.categoryManageRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder={editingCategoryId ? "Update name" : "New category"}
                placeholderTextColor={ADMIN_PLACEHOLDER_TEXT_COLOR}
                value={newCategoryName}
                onChangeText={setNewCategoryName}
              />
              <TouchableOpacity style={styles.categoryAddBtn} onPress={addCategory}>
                <Text style={styles.buttonText}>{editingCategoryId ? 'Save' : 'Add'}</Text>
              </TouchableOpacity>
              {editingCategoryId && (
                <TouchableOpacity
                  style={[styles.categoryAddBtn, { backgroundColor: '#ef4444', marginLeft: 8 }]}
                  onPress={cancelCategoryEdit}
                >
                  <Ionicons name="close" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={categories.filter(c => c.id !== 0)}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <View style={styles.categoryManageItem}>
                  <Text style={styles.categoryPickerItemText}>{item.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => startCategoryEdit(item)} style={{ padding: 8 }}>
                      <Ionicons name="pencil" size={20} color="#3b82f6" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => promptDeleteCategory(item.id)} style={{ padding: 8 }}>
                      <Ionicons name="trash-outline" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        visible={deleteModalVisible}
        onClose={() => setDeleteModalVisible(false)}
        onConfirm={async () => {
          setDeleteModalVisible(false);
          if (productToDeleteId) {
            try {
              await productAPI.deleteProduct(productToDeleteId);
              Alert.alert('Success', 'Product deleted');
              await loadData();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete product');
            }
          }
        }}
        title="Confirm Deletion"
        message="Are you sure you want to delete this product?"
      />

      {/* Category Delete Confirmation Modal */}
      <ConfirmDeleteModal
        visible={categoryDeleteModalVisible}
        onClose={() => setCategoryDeleteModalVisible(false)}
        onConfirm={async () => {
          setCategoryDeleteModalVisible(false);
          if (categoryToDeleteId) {
            try {
              await categoryAPI.deleteCategory(categoryToDeleteId);
              Toast.show({ type: 'success', text1: 'Category deleted' });
              await loadData();
            } catch (error) {
              console.error('Delete Category Error:', JSON.stringify(error, null, 2));
              if (error.code === '23503') { // Foreign Key Constraint
                Alert.alert('Cannot Delete', 'This category cannot be deleted because it contains products. Please delete or move the products first.');
              } else if (error.code === '42501' || error.message?.includes('permission denied')) { // RLS
                Alert.alert('Permission Error', 'Database permissions (RLS) are blocking this action. Ensure you have a DELETE policy enabled.');
              } else {
                Alert.alert('Error', error.message || 'Failed to delete category');
              }
            }
          }
        }}
        title="Delete Category"
        message="Are you sure you want to delete this category? This action cannot be undone."
      />
    </View>
  );
};


export default CatalogueTab;

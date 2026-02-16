import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
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
import ProductCard from '../components/ProductCard';

const CatalogueTab = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
    category_id: '',
    stock_quantity: '',
    description: '',
    image: null,
    is_active: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    console.log('Loading data (CatalogueTab)...');
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

  const filteredProducts = selectedCategory === 'All'
    ? products
    : products.filter(p => p.category_name === selectedCategory);

  const handleNumericInput = (field, text) => {
    const numericText = text.replace(/[^0-9.]/g, '');
    setFormData({ ...formData, [field]: numericText });
  };

  const handleIntegerInput = (field, text) => {
    const numericText = text.replace(/[^0-9]/g, '');
    setFormData({ ...formData, [field]: numericText });
  };

  const handleSubmit = async () => {
    const { name, price, stock_quantity, category_id } = formData;
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

    if (errors.length > 0) {
      Alert.alert('Please fix the following issues:', errors.join('\n'));
      return;
    }

    setLoading(true);
    try {
      const productData = {
        name: formData.name,
        price: formData.price,
        stock_quantity: formData.stock_quantity || '0',
        description: formData.description || '',
        category_id: formData.category_id || '1',
        image: formData.image, // Pass the image object from the state
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
      category_id: product.category_id?.toString() || '1',
      stock_quantity: product.stock_quantity?.toString() || '0',
      description: product.description || '',
      image: product.image_url ? { uri: product.image_url.startsWith('http') ? product.image_url : `${BASE_URL}${product.image_url}` } : null,
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
      category_id: '',
      stock_quantity: '',
      description: '',
      image: null,
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
        console.log('Updating category:', editingCategoryId, 'to', newCategoryName.trim());
        await categoryAPI.updateCategory(editingCategoryId, newCategoryName.trim());
        console.log('Category updated successfully');
        Toast.show({ type: 'success', text1: 'Category updated' });
        setEditingCategoryId(null);
      } else {
        console.log('Adding category with name:', newCategoryName.trim());
        await categoryAPI.createCategory(newCategoryName.trim());
        console.log('Category added successfully');
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

  // const deleteCategory = (id) => { ... OLD ... }

  const renderProduct = ({ item }) => {
    const imageUrl = item.image_url
      ? item.image_url.startsWith('http')
        ? item.image_url
        : `${BASE_URL}${item.image_url}`
      : null;

    return (
      <ProductCard
        imageUrl={imageUrl}
        name={item.name}
        category={item.category_name || 'Uncategorized'}
        description={item.description}
        priceText={`₱${item.price}`}
        stockText={`Qty: ${item.stock_quantity || 0}`}
        showDescription
        showActions
        statusBadge={item.is_active === false ? 'Unavailable' : null}
        onEdit={() => handleEdit(item)}
        onDelete={() => handleDelete(item.id)}
      />
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => {
          resetForm();
          setModalVisible(true);
        }}
      >
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.addButtonText}>Add Product</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: '#6b7280', marginTop: -5 }]}
        onPress={() => setManageCategoriesVisible(true)}
      >
        <Ionicons name="list" size={20} color="#fff" />
        <Text style={styles.addButtonText}>Manage Categories</Text>
      </TouchableOpacity>

      {/* Category Filter Container */}
      <View style={styles.filterContainer}>
        <Text style={styles.filterLabel}>Filter by Category:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.categoryChip,
                selectedCategory === cat.name && styles.categoryChipActive
              ]}
              onPress={() => setSelectedCategory(cat.name)}
            >
              <Text style={[
                styles.categoryChipText,
                selectedCategory === cat.name && styles.categoryChipTextActive
              ]}>
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ec4899']} />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No products found</Text>
        }
      />

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
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
              />

              <Text style={styles.inputLabel}>Price *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter price"
                keyboardType="numeric"
                value={formData.price}
                onChangeText={(text) => handleNumericInput('price', text)}
              />

              <Text style={styles.inputLabel}>Quantity *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter quantity"
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

              <Text style={styles.inputLabel}>Description</Text>
              <Text style={styles.inputHelperText}>Max 20 words</Text>
              <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                placeholder="Enter product description"
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
                  {loading ? 'Saving...' : 'Add Product'}
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
              console.log('Deleting category:', categoryToDeleteId);
              await categoryAPI.deleteCategory(categoryToDeleteId);
              console.log('Category deleted successfully');
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

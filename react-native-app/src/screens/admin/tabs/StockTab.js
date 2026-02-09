import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { adminAPI, BASE_URL } from '../../../config/api';
import styles from '../../AdminDashboard.styles';
import ProductCard from '../components/ProductCard';

const StockTab = () => {
  const [activeStockTab, setActiveStockTab] = useState('Ribbons');
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [stockToDelete, setStockToDelete] = useState(null);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStock, setEditingStock] = useState(null);
  const [stockFormData, setStockFormData] = useState({
    name: '',
    price: '',
    quantity: '',
    unit: '',
    is_available: true, // Boolean status field
    image: null,
  });

    useEffect(() => {
      loadStock();
    }, []);
  
        const loadStock = async () => {
  
          setLoading(true);
  
          try {
  
            const response = await adminAPI.getAllStock();
  
            setStockItems(response.data || []);
  
          } catch (error) {
  
            console.error('Error loading stock:', error);
  
            Alert.alert('Error', 'Failed to load stock');
  
          } finally {
  
            setLoading(false);
  
          }
  
        };
  
      
  
        const onRefresh = async () => {
  
          setRefreshing(true);
  
          await loadStock();
  
          setRefreshing(false);
  
        };
  
      
  
        const resetForm = () => {
  
          setStockFormData({
  
            name: '',
  
            price: '',
  
            quantity: '',
  
                        unit: '',
  
                        is_available: true, // Boolean status field
  
                        image: null,
  
                      });
  
          setEditingStock(null);
  
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
  
              setStockFormData({ ...stockFormData, image: result.assets[0] });
  
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
  
              setStockFormData({ ...stockFormData, image: result.assets[0] });
  
            }
  
          } catch (error) {
  
            console.error('Error launching camera:', error);
  
            Alert.alert('Error', 'Failed to open camera. Please try again.');
  
          }
  
        };
  
      
  
        const handleEditStock = (item) => {
  
          setEditingStock(item);
  
          setStockFormData({
  
            name: item.name,
  
            price: item.price ? item.price.toString() : '',
  
                        quantity: item.quantity ? item.quantity.toString() : '',
  
                        unit: item.unit || '',
  
                        is_available: item.is_available, // Corrected: use item.is_available from API
  
                        image: item.image_url ? { uri: item.image_url.startsWith('http') ? item.image_url : `${BASE_URL}${item.image_url}` } : null,
  
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
  
          if (!stockFormData.name || !stockFormData.quantity) {
  
            Alert.alert('Error', 'Please fill in Name and Quantity');
  
            return;
  
          }
  
      
  
          setLoading(true);
  
          try {
  
            const data = {
  
              ...stockFormData,
  
              category: activeStockTab, // Add this line to include the category from activeStockTab
  
                            price: parseFloat(stockFormData.price) || 0,
  
                            quantity: parseInt(stockFormData.quantity) || 0,
  
                            is_available: stockFormData.is_available, // Corrected: send is_available
  
                            image: stockFormData.image,
  
                          };
  
      
  
            if (editingStock) {
  
              await adminAPI.updateStock(editingStock.id, { ...data, old_image_url: editingStock.image_url });
  
              Alert.alert('Success', 'Item updated successfully');
  
            } else {
  
              await adminAPI.createStock(data);
  
              Alert.alert('Success', 'Item added successfully');
  
            }          setModalVisible(false);
          resetForm();
          await loadStock();
        } catch (error) {
          console.error('Error saving stock:', error);
          Alert.alert('Error', error.message || 'Failed to save item');
        } finally {
          setLoading(false);
        }
      };
    
      const filteredStock = stockItems.filter(item =>
        item.category === activeStockTab
      );
    
          const renderStockItem = ({ item }) => {
            const imageUrl = item.image_url
              ? item.image_url.startsWith('http')
                ? item.image_url
                : `${BASE_URL}${item.image_url}`
              : null;

            return (
              <ProductCard
                imageUrl={imageUrl}
                name={item.name}
                category={item.category || 'Uncategorized'}
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
            </View>
          );
        }
      
                return (
      
                  <View style={styles.tabContent}>
      
                    <TouchableOpacity style={styles.addButton} onPress={() => { resetForm(); setModalVisible(true); }}>
      
                      <Ionicons name="add" size={20} color="#fff" />
      
                      <Text style={styles.addButtonText}>Add {activeStockTab.slice(0, -1)}</Text>
      
                    </TouchableOpacity>
      
                    {/* Stock Category Tabs */}
      
                    <View style={styles.stockTabs}>
      
                      {['Wrappers', 'Ribbons', 'Flowers'].map((tab) => (
      
                        <TouchableOpacity
      
                          key={tab}
      
                          style={[styles.stockTab, activeStockTab === tab && styles.stockTabActive]}
      
                          onPress={() => setActiveStockTab(tab)}
      
                        >
      
                          <Ionicons
      
                            name={tab === 'Wrappers' ? 'gift' : tab === 'Ribbons' ? 'ribbon' : 'flower'}
      
                            size={20}
      
                            color={activeStockTab === tab ? '#ec4899' : '#666'}
      
                          />
      
                          <Text style={[styles.stockTabText, activeStockTab === tab && styles.stockTabTextActive]}>
      
                            {tab}
      
                          </Text>
      
                        </TouchableOpacity>
      
                      ))}
      
                    </View>
      
                    <FlatList
      
                      data={filteredStock}
      
                      renderItem={renderStockItem}
      
                      keyExtractor={(item) => item.id.toString()}
      
                      refreshControl={
      
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ec4899']} />
      
                      }
      
                      ListEmptyComponent={
      
                        <Text style={styles.emptyText}>No {activeStockTab.toLowerCase()} found</Text>
      
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
      
                            <Text style={styles.inputLabel}>Item Name *</Text>
      
                            <TextInput
      
                              style={styles.input}
      
                              placeholder="Enter item name"
      
                              value={stockFormData.name}
      
                              onChangeText={(text) => setStockFormData({ ...stockFormData, name: text })}
      
                            />
      
                            <View style={styles.rowInputs}>
      
                              <View style={styles.halfInput}>
      
                                <Text style={styles.inputLabel}>Price</Text>
      
                                <TextInput
      
                                  style={styles.input}
      
                                  placeholder="0.00"
      
                                  keyboardType="numeric"
      
                                  value={stockFormData.price}
      
                                  onChangeText={(text) => setStockFormData({ ...stockFormData, price: text })}
      
                                />
      
                              </View>
      
                              <View style={styles.halfInput}>
      
                                <Text style={styles.inputLabel}>Quantity *</Text>
      
                                <TextInput
      
                                  style={styles.input}
      
                                  placeholder="0"
      
                                  keyboardType="numeric"
      
                                  value={stockFormData.quantity}
      
                                  onChangeText={(text) => setStockFormData({ ...stockFormData, quantity: text })}
      
                                />
      
                              </View>
      
                            </View>
      
                            <View style={styles.rowInputs}>
      
                              <View style={styles.halfInput}>
      
                                <Text style={styles.inputLabel}>Unit</Text>
      
                                <TextInput
      
                                  style={styles.input}
      
                                  placeholder="e.g. meters"
      
                                  value={stockFormData.unit}
      
                                  onChangeText={(text) => setStockFormData({ ...stockFormData, unit: text })}
      
                                />
      
                              </View>
      
                            </View>
      
                            <Text style={styles.inputLabel}>Status</Text>
      
                            <View style={styles.categoryGrid}>
      
                              {[{ label: 'Available', value: true }, { label: 'Unavailable', value: false }].map((option) => (
      
                                <TouchableOpacity
      
                                  key={option.label}
      
                                  style={[
      
                                    styles.modalCategoryChip,
      
                                    stockFormData.is_available === option.value && styles.modalCategoryChipActive
      
                                  ]}
      
                                  onPress={() => setStockFormData({ ...stockFormData, is_available: option.value })}
      
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

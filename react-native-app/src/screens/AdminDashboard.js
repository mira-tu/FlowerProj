// AdminDashboard.js - Complete Version with Full UI + API Integration
// Restored all features from original design

import { decode } from 'base64-arraybuffer';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  FlatList,
  Image,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  Platform,
  StatusBar,
  Linking,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { productAPI, adminAPI, categoryAPI, authAPI, BASE_URL } from '../config/api';
import { supabase } from '../config/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { LineChart } from 'react-native-chart-kit';

// Helper function to format timestamp with date and time
const formatTimestamp = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // The hour '0' should be '12'
    hours = String(hours).padStart(2, '0'); // Pad with leading zero

    return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
  } catch (e) {
    return dateString;
  }
};

const formatMessageTimestamp = (dateString) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    const now = new Date();
    
    const isToday = now.toDateString() === date.toDateString();
    if (isToday) {
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    
    // not today, calculate days ago
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMessageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffTime = startOfToday.getTime() - startOfMessageDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      return '1 day ago';
    }
    
    return `${diffDays} days ago`;

  } catch (e) {
    return dateString;
  }
};

const getStatusLabel = (status) => {
  if (!status) return '';
  return status.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
};

const getStatusColor = (status) => {
  switch (status) {
    case 'completed': return '#4CAF50';
    case 'claimed': return '#4CAF50';
    case 'ready_for_pick_up': return '#6366F1'; // Blue, matching OrdersTab
    case 'out_for_delivery': return '#8B5CF6'; // Purple, matching OrdersTab
    case 'processing': return '#2196F3';
    case 'cancelled': return '#f44336';
    case 'pending': return '#FFA726';
    default: return '#999';
  }
};

const getPaymentStatusDisplay = (paymentStatus, paymentMethod) => {
  if (paymentStatus === 'to_pay' && paymentMethod?.toLowerCase() === 'gcash') {
    return 'Waiting for Confirmation';
  }
  return getStatusLabel(paymentStatus);
};

const AdminDashboard = () => {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState('catalogue');
  const [menuVisible, setMenuVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [customerToMessage, setCustomerToMessage] = useState(null); // New state for customer to message

  useEffect(() => {
    const checkUserAndSubscribe = async () => {
      setLoading(true);
      try {
        const currentUserJson = await AsyncStorage.getItem('currentUser');
        if (!currentUserJson) {
          navigation.navigate('Login');
          return;
        }

        const user = JSON.parse(currentUserJson);
        if (user.role !== 'admin' && user.role !== 'employee') {
          Alert.alert('Access Denied', 'You do not have permission to access this page');
          navigation.navigate('Login');
          return;
        }

        setCurrentUser(user);
      } catch (error) {
        console.error('Error checking user:', error);
        navigation.navigate('Login');
      } finally {
        setLoading(false);
      }
    };

    checkUserAndSubscribe();
  }, [navigation]);

  // Effect for real-time message count
  useEffect(() => {
    if (!currentUser) return;

    const fetchUnreadCount = async () => {
      try {
        const { data, error } = await supabase.rpc('get_shared_conversations');
        if (error) throw error;
        
        const totalUnread = (data || []).reduce((sum, convo) => sum + (convo.unreadCount || 0), 0);
        setUnreadMessageCount(totalUnread);
      } catch (error) {
        console.error("Error fetching unread message count:", error);
      }
    };
    
    // Fetch initial count
    fetchUnreadCount();

    // Set up real-time subscription for new messages
    const channel = supabase.channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        // When a new message comes in, refetch the count
        fetchUnreadCount();
      })
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);


  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          onPress: async () => {
            await authAPI.logout(); // Sign out from Supabase
            await AsyncStorage.removeItem('currentUser');
            await AsyncStorage.removeItem('token');
            navigation.navigate('Login');
          }
        }
      ]
    );
  };

  const renderTabContent = () => {
    // Prevent employees from accessing admin-only tabs
    if (currentUser?.role === 'employee' && (activeTab === 'sales' || activeTab === 'about' || activeTab === 'contact' || activeTab === 'employees')) {
      return <CatalogueTab />;
    }

    switch (activeTab) {
      case 'catalogue':
        return <CatalogueTab />;
      case 'orders':
        return <OrdersTab setActiveTab={setActiveTab} handleSelectCustomerForMessage={handleSelectCustomerForMessage} />;
      case 'stock':
        return <StockTab />;
      case 'requests':
        return <RequestsTab setActiveTab={setActiveTab} handleSelectCustomerForMessage={handleSelectCustomerForMessage} />;
      case 'notifications':
        return <NotificationsTab />;
      case 'messaging':
        return <MessagingTab customerToMessage={customerToMessage} setCustomerToMessage={setCustomerToMessage} />;
      case 'sales':
        return <SalesTab />;
      case 'about':
        return <AboutTab />;
      case 'contact':
        return <ContactTab />;
      case 'employees':
        return <EmployeesTab />;
      default:
        return <CatalogueTab />;
    }
  };

  const handleSelectCustomerForMessage = (customer) => {
    setCustomerToMessage(customer);
    setActiveTab('messaging');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setMenuVisible(true)}>
          <Ionicons name="menu" size={28} color="#fff" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Joccery's Flower Shop</Text>
          <Text style={styles.headerSubtitle}>Admin Dashboard</Text>
        </View>

        <TouchableOpacity onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {renderTabContent()}
      </View>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('catalogue')}
        >
          <Ionicons
            name="flower"
            size={24}
            color={activeTab === 'catalogue' ? '#ec4899' : '#999'}
          />
          <Text style={[styles.navText, activeTab === 'catalogue' && styles.navTextActive]}>
            Catalog..
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('orders')}
        >
          <Ionicons
            name="cart"
            size={24}
            color={activeTab === 'orders' ? '#ec4899' : '#999'}
          />
          <Text style={[styles.navText, activeTab === 'orders' && styles.navTextActive]}>
            Orders
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('stock')}
        >
          <Ionicons
            name="cube"
            size={24}
            color={activeTab === 'stock' ? '#ec4899' : '#999'}
          />
          <Text style={[styles.navText, activeTab === 'stock' && styles.navTextActive]}>
            Stock
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('notifications')}
        >
          <Ionicons
            name="notifications"
            size={24}
            color={activeTab === 'notifications' ? '#ec4899' : '#999'}
          />
          <Text style={[styles.navText, activeTab === 'notifications' && styles.navTextActive]}>
            Notific..
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => {
            setActiveTab('messaging');
            setUnreadMessageCount(0);
          }}
        >
          <Ionicons
            name="chatbubbles"
            size={24}
            color={activeTab === 'messaging' ? '#ec4899' : '#999'}
          />
            {unreadMessageCount > 0 && (
                <View style={styles.navBadge}>
                    <Text style={styles.navBadgeText}>{unreadMessageCount}</Text>
                </View>
            )}
          <Text style={[styles.navText, activeTab === 'messaging' && styles.navTextActive]}>
            Messagi..
          </Text>
        </TouchableOpacity>
      </View>

      {/* Menu Modal */}
      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.menuContainer}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Menu</Text>
              <TouchableOpacity onPress={() => setMenuVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setActiveTab('catalogue'); setMenuVisible(false); }}>
                <Ionicons name="flower-outline" size={20} color="#ec4899" />
                <Text style={styles.menuItemText}>Catalogue</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={() => { setActiveTab('orders'); setMenuVisible(false); }}>
                <Ionicons name="cart-outline" size={20} color="#333" />
                <Text style={styles.menuItemText}>Orders</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={() => { setActiveTab('requests'); setMenuVisible(false); }}>
                <Ionicons name="calendar-outline" size={20} color="#333" />
                <Text style={styles.menuItemText}>Requests & Bookings</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={() => { setActiveTab('stock'); setMenuVisible(false); }}>
                <Ionicons name="cube-outline" size={20} color="#333" />
                <Text style={styles.menuItemText}>Stock</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={() => { setActiveTab('notifications'); setMenuVisible(false); }}>
                <Ionicons name="notifications-outline" size={20} color="#333" />
                <Text style={styles.menuItemText}>Notifications</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={() => { setActiveTab('messaging'); setMenuVisible(false); }}>
                <Ionicons name="chatbubbles-outline" size={20} color="#333" />
                <Text style={styles.menuItemText}>Messaging</Text>
              </TouchableOpacity>

              {currentUser?.role === 'admin' && (
                <TouchableOpacity style={styles.menuItem} onPress={() => { setActiveTab('sales'); setMenuVisible(false); }}>
                  <Ionicons name="cash-outline" size={20} color="#333" />
                  <Text style={styles.menuItemText}>Sales</Text>
                </TouchableOpacity>
              )}

              {currentUser?.role === 'admin' && (
                <>
                  <View style={styles.menuDivider} />

                  <TouchableOpacity style={styles.menuItem} onPress={() => { setActiveTab('about'); setMenuVisible(false); }}>
                    <Ionicons name="information-circle-outline" size={20} color="#333" />
                    <Text style={styles.menuItemText}>About</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.menuItem} onPress={() => { setActiveTab('contact'); setMenuVisible(false); }}>
                    <Ionicons name="call-outline" size={20} color="#333" />
                    <Text style={styles.menuItemText}>Contact</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.menuItem} onPress={() => { setActiveTab('employees'); setMenuVisible(false); }}>
                    <Ionicons name="people-outline" size={20} color="#333" />
                    <Text style={styles.menuItemText}>Employees</Text>
                  </TouchableOpacity>
                </>
              )}

              <View style={styles.menuDivider} />

              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); handleLogout(); }}>
                <Ionicons name="log-out-outline" size={20} color="#f44336" />
                <Text style={[styles.menuItemText, { color: '#f44336' }]}>Logout</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

// ==================== CATALOGUE TAB ====================
const CatalogueTab = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false); // New state
  const [productToDeleteId, setProductToDeleteId] = useState(null);   // New state
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    category_id: '',
    stock_quantity: '',
    description: '',
    image: null,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const productsRes = await productAPI.getAll();

      const staticCategories = [
        { id: 1, name: 'Sympathy' },
        { id: 2, name: 'Graduation' },
        { id: 3, name: 'All Souls Day' },
        { id: 4, name: 'Valentines' },
        { id: 5, name: 'Get Well Soon' },
        { id: 6, name: 'Mothers Day' },
      ];
      const categoriesWithAll = [{ id: 0, name: 'All' }, ...staticCategories];
      setCategories(categoriesWithAll);

      const productsWithCategoryNames = (productsRes.data.products || []).map(product => {
        const category = staticCategories.find(c => c.id == product.category_id);
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
    });
    setEditingProduct(null);
  };

  const renderProduct = ({ item }) => (
    <View style={styles.productCard}>
      {/* Image Section - Always visible (Image or Placeholder) */}
      <View style={styles.imageContainer}>
        {item.image_url ? (
          <Image
            source={{ uri: item.image_url.startsWith('http') ? item.image_url : `${BASE_URL}${item.image_url}` }}
            style={styles.productImage}
          />
        ) : (
          <View style={styles.productImagePlaceholder}>
            <Ionicons name="image-outline" size={40} color="#ccc" />
            <Text style={styles.placeholderText}>No Image</Text>
          </View>
        )}
      </View>

      {/* Content Section */}
      <View style={styles.productInfo}>
        <Text style={styles.productName}>{item.name}</Text>
        <Text style={styles.productCategory}>{item.category_name || 'Uncategorized'}</Text>
        {item.description && <Text style={styles.productDescription}>{item.description}</Text>}

        <View style={styles.priceRow}>
          <Text style={styles.productPrice}>₱{item.price}</Text>
          <Text style={styles.productStock}>Qty: {item.stock_quantity || 0}</Text>
        </View>
      </View>

      {/* Actions Section */}
      <View style={styles.productActions}>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => handleEdit(item)}
        >
          <Ionicons name="create-outline" size={18} color="#fff" />
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDelete(item.id)}
        >
          <Ionicons name="trash-outline" size={18} color="#fff" />
          <Text style={styles.buttonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

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

      {/* Delete Confirmation Modal */}
      <Modal visible={deleteModalVisible} animationType="fade" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Confirm Deletion</Text>
              <TouchableOpacity onPress={() => setDeleteModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalText}>Are you sure you want to delete this product?</Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setDeleteModalVisible(false)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.deleteButton]}
                onPress={async () => {
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
              >
                <Text style={styles.buttonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ==================== ORDERS TAB ====================
const OrdersTab = ({ setActiveTab, handleSelectCustomerForMessage }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // State for Modals
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [orderToUpdate, setOrderToUpdate] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [selectedReceiptUrl, setSelectedReceiptUrl] = useState(null);
  const [declineModalVisible, setDeclineModalVisible] = useState(false);
  const [orderToDecline, setOrderToDecline] = useState(null);

  // New state for rider assignment
  const [riders, setRiders] = useState([]);
  const [assignRiderModalVisible, setAssignRiderModalVisible] = useState(false);
  const [selectedRider, setSelectedRider] = useState(null);
  const [orderToAssignRider, setOrderToAssignRider] = useState(null);
  const [riderSearchQuery, setRiderSearchQuery] = useState('');
  const [riderSortOption, setRiderSortOption] = useState('name_asc');

  const filteredAndSortedRiders = React.useMemo(() => {
    let result = riders;

    // Filtering
    if (riderSearchQuery) {
      result = result.filter(rider =>
        rider.name.toLowerCase().includes(riderSearchQuery.toLowerCase()) ||
        rider.email.toLowerCase().includes(riderSearchQuery.toLowerCase())
      );
    }

    // Sorting
    if (riderSortOption === 'name_asc') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (riderSortOption === 'name_desc') {
      result.sort((a, b) => b.name.localeCompare(a.name));
    }

    return result;
  }, [riders, riderSearchQuery, riderSortOption]);

  const ordersWithRiderDetails = React.useMemo(() => {
    if (!orders.length || !riders.length) {
      return orders;
    }
    return orders.map(order => {
      if (order.assigned_rider) {
        const riderDetails = riders.find(r => r.id === order.assigned_rider);
        return { ...order, rider: riderDetails || null };
      }
      return order;
    });
  }, [orders, riders]);

  const statusOptions = ['pending', 'processing', 'out_for_delivery', 'ready_for_pick_up', 'claimed', 'completed', 'cancelled'];

  const deliveryStepperStatuses = [
    { id: 'pending', label: 'Pending', description: 'Order received' },
    { id: 'processing', label: 'Processing', description: 'Being prepared' },
    { id: 'out_for_delivery', label: 'Out for Delivery', description: 'On the way' },
    { id: 'completed', label: 'Completed', description: 'Delivered successfully' }
  ];

  const pickupStepperStatuses = [
      { id: 'pending', label: 'Pending', description: 'Order received' },
      { id: 'processing', label: 'Processing', description: 'Being prepared' },
      { id: 'ready_for_pickup', label: 'Ready for Pick Up', description: 'Ready for customer' },
      { id: 'completed', label: 'Completed', description: 'Picked up by customer' }
  ];

  const openReceiptModal = (url) => {
    const finalUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
    setSelectedReceiptUrl(finalUrl);
    setReceiptModalVisible(true);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadOrders();
      loadRiders();

      const channel = supabase
        .channel('public:orders')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders' },
          (payload) => {
            loadOrders();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }, [])
  );

  const loadOrders = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getAllOrders();
      const sortedOrders = (response.data || []).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      setOrders(sortedOrders);
    } catch (error) {
      console.error('Error loading orders:', error);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const loadRiders = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'employee');
      if (error) throw error;
      setRiders(data || []);
    } catch (error) {
      console.error('Error loading riders:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  const handleAccept = async (orderId) => {
    try {
      // Find the order in the current state
      const orderToAccept = orders.find(order => order.id === orderId);
      if (!orderToAccept) {
        Alert.alert('Error', 'Order not found.');
        return;
      }

      await adminAPI.acceptOrder(orderId, 'processing');

      let paymentStatus = 'paid';
      if (orderToAccept.payment_method === 'cod') {
        paymentStatus = 'to_pay';
      }
      await adminAPI.updateOrderPaymentStatus(orderId, paymentStatus);

      Toast.show({ type: 'success', text1: `Order Accepted and Payment Marked as ${paymentStatus.replace('_', ' ')}` });
      await loadOrders();
    } catch (error) {
      console.error('Error accepting order or updating payment status:', error);
      Alert.alert('Error', 'Failed to accept order or update payment status');
    }
  };

  const handleDecline = (order) => {
    setOrderToDecline(order);
    setDeclineModalVisible(true);
  };

  const confirmDecline = async () => {
    if (!orderToDecline) return;
    try {
      await adminAPI.declineOrder(orderToDecline.id, 'cancelled');
      Toast.show({ type: 'success', text1: 'Order Declined' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Decline Failed' });
    } finally {
      setDeclineModalVisible(false);
      setOrderToDecline(null);
      await loadOrders();
    }
  };

  const openStatusModal = (order) => {
    setOrderToUpdate(order);
    setSelectedStatus(order.status);
    setStatusModalVisible(true);
  };

  const confirmStatusChange = async () => {
    if (!orderToUpdate || !selectedStatus) return;
    const orderId = orderToUpdate.id;
    
    try {
      await adminAPI.updateOrderStatus(orderId, selectedStatus);

      // New logic: If order is completed and payment method is COD and payment is 'to_pay', mark as 'paid'
      if (selectedStatus === 'completed' && orderToUpdate.payment_method === 'cod' && orderToUpdate.payment_status === 'to_pay') {
        await adminAPI.updateOrderPaymentStatus(orderId, 'paid');
        Toast.show({ type: 'success', text1: 'Order Completed and Payment Marked as Paid' });
      } else {
        Toast.show({ type: 'success', text1: 'Status Updated' });
      }

      await loadOrders();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Update Failed' });
    } finally {
      setStatusModalVisible(false);
      setOrderToUpdate(null);
      setSelectedStatus(null);
    }
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'completed': return { backgroundColor: '#22C55E' };
      case 'claimed': return { backgroundColor: '#22C55E' };
      case 'ready_for_pick_up': return { backgroundColor: '#6366F1' };
      case 'out_for_delivery': return { backgroundColor: '#8B5CF6' };
      case 'processing': return { backgroundColor: '#3B82F6' };
      case 'cancelled': return { backgroundColor: '#EF4444' };
      case 'pending': return { backgroundColor: '#F97316' };
      default: return { backgroundColor: '#6B7280' };
    }
  };
  
  const getProgressWidth = (status) => {
    const progress = {
      completed: '100%',
      ready_for_pickup: '75%',
      out_for_delivery: '75%',
      processing: '50%',
      pending: '25%',
      cancelled: '0%'
    };
    return progress[status] || '10%';
  };

  const getCustomerInitials = (name) => {
    if (!name) return '??';
    const names = name.trim().split(' ');
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const EnhancedOrderCard = ({ item, onMessageCustomer, onPhoneCall, onAssignRider }) => (
    <View style={styles.eoCard}>
      {/* Header */}
      <View style={styles.eoCardHeader}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.eoLabel}>Order ID</Text>
          <Text style={styles.eoOrderId}>#{item.order_number}</Text>
          <View style={[styles.eoDeliveryTypeBadge, {backgroundColor: item.delivery_method === 'delivery' ? '#3B82F6' : '#10B981'}]}>
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
          <View style={[styles.eoStatusBadge, getStatusStyle(item.status)]}>
            <Ionicons name="time-outline" size={12} color="#fff" />
            <Text style={styles.eoStatusText}>{getStatusLabel(item.status)}</Text>
          </View>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.eoProgressSection}>
        <View style={styles.eoProgressMeta}>
            <Text style={styles.eoProgressLabel}>Order Progress</Text>
            <Text style={styles.eoProgressLabel}>{getProgressWidth(item.status)}</Text>
        </View>
        <View style={styles.eoProgressBarBg}>
          <View style={[styles.eoProgressBarFill, getStatusStyle(item.status), { width: getProgressWidth(item.status) }]} />
        </View>
      </View>
      
      {/* Customer Info */}
      <View style={styles.eoSection}>
        <View style={styles.eoCustomerHeader}>
            <View style={styles.eoAvatarContainer}>
                <View style={styles.eoAvatar}>
                    <Text style={styles.eoAvatarText}>{getCustomerInitials(item.customer_name)}</Text>
                </View>
                <View>
                    <Text style={styles.eoLabel}>Customer</Text>
                    <Text style={styles.eoCustomerName}>{item.customer_name}</Text>
                </View>
            </View>
            <View style={styles.eoActionButtons}>
                <TouchableOpacity style={styles.eoIconBtnGreen} onPress={() => onPhoneCall(item.customer_phone)}>
                    <Ionicons name="call" size={16} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.eoIconBtnBlue}
                    onPress={() => onMessageCustomer(item.users.id, item.users.name, item.users.email)}
                >
                    <Ionicons name="chatbubble" size={16} color="#fff" />
                </TouchableOpacity>
            </View>
        </View>
        <View style={styles.eoContactInfo}>
            {item.customer_email && (<View style={styles.eoInfoRow}>
              <Ionicons name="mail" size={14} color="#9CA3AF" />
              <Text style={styles.eoInfoText}>{item.customer_email}</Text>
          </View>)}
          {item.delivery_method === 'pickup' && item.pickup_time && (
            <View style={styles.eoInfoRow}>
              <Ionicons name="time" size={14} color="#9CA3AF" />
              <Text style={styles.eoInfoText}>Pickup Time: {item.pickup_time}</Text>
            </View>
          )}
          {item.shipping_address?.description && (
            <View style={styles.eoInfoRow}>
                <Ionicons name="location" size={14} color="#9CA3AF" />
                <Text style={styles.eoInfoText}>{item.shipping_address.description}</Text>
            </View>
            )}
        </View>
      </View>

      {/* Items */}
      {item.items?.length > 0 && (
        <View style={styles.eoSection}>
            <View style={styles.eoSectionHeader}>
              <Ionicons name="archive" size={16} color="#6B7280"/>
              <Text style={styles.eoSectionTitle}>Items ({item.items.length})</Text>
            </View>
            {item.items.map((orderItem, index) => (
              <View key={index} style={[styles.eoItemCard, index > 0 && {marginTop: 8}]}>
                <View style={styles.eoItemImage}>
                  {orderItem.image_url ? (
                    <Image
                      source={{ uri: orderItem.image_url }}
                      style={{ width: '100%', height: '100%', resizeMode: 'contain' }}
                    />
                  ) : (
                    <Ionicons name="image-outline" size={24} color="#666" /> // Placeholder icon
                  )}
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.eoItemName}>{orderItem.name}</Text>
                  <Text style={styles.eoItemQuantity}>Quantity: {orderItem.quantity}</Text>
                  <Text style={styles.eoItemPrice}>₱{orderItem.price.toFixed(2)}</Text>
                </View>
              </View>
            ))}
            {item.special_instructions && (
                <View style={styles.eoInstructions}>
                    <Text style={styles.eoInstructionsTitle}>Special Instructions:</Text>
                    <Text style={styles.eoInstructionsText}>{item.special_instructions}</Text>
                </View>
            )}
        </View>
      )}

      {/* Assigned Rider Info */}
      {item.rider && (
        <View style={styles.eoSection}>
            <View style={styles.eoSectionHeader}>
              <Ionicons name="bicycle-outline" size={16} color="#6B7280"/>
              <Text style={styles.eoSectionTitle}>Assigned Rider</Text>
            </View>
            <View style={styles.eoFlexBetween}>
                <Text style={styles.eoDetailText}>Name:</Text>
                <Text style={styles.eoInfoTextBold}>{item.rider.name}</Text>
            </View>
        </View>
      )}
      
      {/* Payment */}
      <View style={styles.eoSection}>
        <View style={styles.eoSectionHeader}>
            <Ionicons name="card" size={16} color="#6B7280"/>
            <Text style={styles.eoSectionTitle}>Payment Details</Text>
        </View>
        <View style={{gap: 8}}>
            <View style={styles.eoFlexBetween}>
                <Text style={styles.eoDetailText}>Method</Text>
                <Text style={styles.eoInfoTextBold}>
                  {item.payment_method?.toLowerCase() === 'cod' ? 'Cash On Delivery' : getStatusLabel(item.payment_method) || 'Not specified'}
                </Text>
            </View>
            <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}>
                                            <View style={[styles.eoPaymentStatus, {backgroundColor: item.payment_status === 'paid' ? '#22C55E' : '#FFA726'}]}>
                                                <Text style={styles.eoPaymentStatusText}>{getPaymentStatusDisplay(item.payment_status, item.payment_method)}</Text>
                                            </View>                {item.payment_method?.toLowerCase() === 'gcash' && item.receipt_url && (
                    <TouchableOpacity onPress={() => openReceiptModal(item.receipt_url)}>
                        <Text style={styles.eoViewReceipt}>View Receipt</Text>
                    </TouchableOpacity>
                )}
            </View>
            <View style={styles.eoDivider}>
              <View style={styles.eoPriceRow}>
                <Text style={styles.eoDetailText}>Subtotal:</Text>
                <Text style={styles.eoDetailText}>₱{item.subtotal?.toFixed(2) || '0.00'}</Text>
              </View>
              {item.shipping_fee > 0 && (
                <View style={styles.eoPriceRow}>
                  <Text style={styles.eoDetailText}>Delivery Fee:</Text>
                  <Text style={styles.eoDetailText}>₱{item.shipping_fee.toFixed(2)}</Text>
                </View>
              )}
              <View style={[styles.eoPriceRow, {marginTop: 8}]}>
                <Text style={styles.eoTotalLabel}>Total:</Text>
                <Text style={styles.eoTotalValue}>₱{item.total}</Text>
              </View>
            </View>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.eoFooter}>
        {item.status === 'pending' ? (
            <View style={{flexDirection: 'row', gap: 12}}>
                <TouchableOpacity style={[styles.eoMainBtn, {backgroundColor: '#22C55E', flex: 1}]} onPress={() => handleAccept(item.id)}>
                    <Text style={styles.eoMainBtnText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.eoMainBtn, {backgroundColor: '#EF4444', flex: 1}]} onPress={() => handleDecline(item)}>
                    <Text style={styles.eoMainBtnText}>Decline</Text>
                </TouchableOpacity>
            </View>
        ) : (!['completed', 'cancelled'].includes(item.status) &&
          <View>
            <TouchableOpacity style={[styles.eoMainBtn, {backgroundColor: '#3B82F6'}]} onPress={() => openStatusModal(item)}>
                <Ionicons name="time" size={18} color="#fff" />
                <Text style={styles.eoMainBtnText}>Change Status</Text>
            </TouchableOpacity>
            {item.delivery_method === 'delivery' && item.status === 'processing' && (
              <TouchableOpacity style={[styles.eoMainBtn, {backgroundColor: '#10B981', marginTop: 10}]} onPress={() => onAssignRider(item)}>
                <Ionicons name="person-add-outline" size={18} color="#fff" />
                <Text style={styles.eoMainBtnText}>Assign Rider</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );

  const handlePhoneCall = (phoneNumber) => {
    if (phoneNumber && phoneNumber !== 'N/A') {
      Linking.openURL(`tel:${phoneNumber}`);
    } else {
      Alert.alert('No Phone Number', 'This customer does not have a phone number on file.');
    }
  };

  const handleAssignRider = (order) => {
    setOrderToAssignRider(order);
    setSelectedRider(order.rider); // pre-select if already assigned
    setAssignRiderModalVisible(true);
  };

  const handleMessageCustomer = (customerId, customerName, customerEmail) => {
    handleSelectCustomerForMessage({ id: customerId, name: customerName, email: customerEmail });
  };

  const handleConfirmAssignRider = async () => {
    if (!orderToAssignRider || !selectedRider) return;
    try {
      await adminAPI.assignRider(orderToAssignRider.id, selectedRider.id);
      Toast.show({ type: 'success', text1: 'Rider Assigned' });
      setAssignRiderModalVisible(false);
      loadOrders();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Assignment Failed' });
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
      </View>
    );
  }

  return (
    <View style={styles.eoContainer}>
      <Text style={styles.eoTitle}>Orders Management</Text>
      <FlatList
        data={ordersWithRiderDetails}
        renderItem={({item}) => <EnhancedOrderCard item={item} onMessageCustomer={handleMessageCustomer} onPhoneCall={handlePhoneCall} onAssignRider={handleAssignRider} />}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ec4899']} />
        }
        ListEmptyComponent={
          <View style={{marginTop: 50, alignItems: 'center'}}>
            <Text style={styles.emptyText}>No orders found</Text>
          </View>
        }
      />
      
      {/* Decline Confirmation Modal */}
      <Modal visible={declineModalVisible} animationType="fade" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm Decline</Text>
            <Text style={styles.modalText}>
              Are you sure you want to decline Order #{orderToDecline?.order_number}?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setDeclineModalVisible(false)}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.deleteButton]} onPress={confirmDecline}>
                <Text style={styles.buttonText}>Confirm Decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Assign Rider Modal */}
      <Modal visible={assignRiderModalVisible} animationType="fade" transparent>
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, {maxHeight: '70%'}]}>
            <Text style={styles.modalTitle}>Assign Rider</Text>


            {/* Clean Search Bar */}
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
                  <View style={{flex: 1}}>
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
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => { setAssignRiderModalVisible(false); setRiderSearchQuery(''); }}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleConfirmAssignRider} disabled={!selectedRider}>
                <Text style={styles.buttonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Status Modal (Timeline UI) */}
      <Modal visible={statusModalVisible} transparent animationType="fade" onRequestClose={() => setStatusModalVisible(false)}>
          <View style={styles.statusModalBackdrop}>
              <View style={styles.timelineModalContainer}>
                  <View style={styles.statusModalHeader}>
                      <Text style={styles.statusModalTitle}>Change Order Status</Text>
                  </View>

                  <ScrollView contentContainerStyle={styles.timelineScrollView}>
                      {orderToUpdate && <Text style={styles.timelineOrderNumber}>Order #{orderToUpdate.order_number}</Text>}
                      {(() => {
                          if (!orderToUpdate) return null;
                          const isDelivery = orderToUpdate.delivery_method === 'delivery';
                          const stepperStatuses = isDelivery ? deliveryStepperStatuses : pickupStepperStatuses;
                          const getStepperIndex = (status) => stepperStatuses.findIndex(s => s.id === status);
                          const selectedIndex = getStepperIndex(selectedStatus);
                          const currentStatusIndex = getStepperIndex(orderToUpdate.status);

                          return (
                              <>
                                  {stepperStatuses.map((status, index) => {
                                      const isSelected = selectedIndex === index;
                                      const isPast = selectedIndex > index;
                                      const isLast = index === stepperStatuses.length - 1;

                                      return (
                                          <View key={status.id} style={styles.timelineStepContainer}>
                                              {/* Line */}
                                              {!isLast && (
                                                  <View style={[
                                                      styles.timelineLine,
                                                      (isPast || isSelected) && styles.timelineLineActive
                                                  ]}/>
                                              )}
                                              {/* Content */}
                                              <TouchableOpacity
                                                onPress={() => setSelectedStatus(status.id)}
                                                style={styles.timelineStep}
                                                disabled={isPast}
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
                                                              <Text style={[styles.timelineCircleText, isSelected && {color: '#fff'}]}>{index + 1}</Text>
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
                                  {/* Special Status Buttons */}
                                  <View style={styles.timelineActions}>
                                      <TouchableOpacity
                                          onPress={() => setSelectedStatus('cancelled')}
                                          style={[
                                              styles.timelineCancelButton,
                                              selectedStatus === 'cancelled' && styles.timelineCancelButtonSelected
                                          ]}
                                      >
                                          <Ionicons name="close-circle-outline" size={16} color={selectedStatus === 'cancelled' ? '#fff' : '#EF4444'} />
                                          <Text style={[
                                              styles.timelineCancelButtonText,
                                              selectedStatus === 'cancelled' && { color: '#fff' }
                                          ]}>
                                              Cancel Order
                                          </Text>
                                      </TouchableOpacity>
                                  </View>
                              </>
                          );
                      })()}
                  </ScrollView>

                  <View style={styles.statusModalFooter}>
                      <TouchableOpacity onPress={confirmStatusChange} style={styles.statusConfirmButton}>
                          <Text style={styles.statusConfirmButtonText}>Confirm</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setStatusModalVisible(false)} style={styles.statusCloseButton}>
                          <Text style={styles.statusCloseButtonText}>Cancel</Text>
                      </TouchableOpacity>
                  </View>
              </View>
          </View>
      </Modal>

      {/* Receipt View Modal */}
      <Modal visible={receiptModalVisible} animationType="fade" transparent>
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
      </Modal>
    </View>
  );
};


// ==================== STOCK TAB ====================
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
    
            return (
    
            <View style={styles.productCard}>
    
              <View style={styles.imageContainer}>
    
                {item.image_url ? (
    
                  <Image
    
                    source={{ uri: item.image_url.startsWith('http') ? item.image_url : `${BASE_URL}${item.image_url}` }}
    
                    style={styles.productImage}
    
                  />
    
                ) : (
    
                  <View style={styles.productImagePlaceholder}>
    
                    <Ionicons name="image-outline" size={40} color="#ccc" />
    
                    <Text style={styles.placeholderText}>No Image</Text>
    
                  </View>
    
                )}
    
              </View>
    
              <View style={styles.productInfo}>
    
                                                <Text style={styles.productName}>{item.name}</Text>
    
                                                <Text style={styles.productCategory}>{item.category || 'Uncategorized'}</Text>
    
                                                <View style={styles.priceRow}>
    
                                                  <Text style={styles.productPrice}>₱{item.price || '0'} / {item.unit || 'unit'}</Text>
    
                  <Text style={styles.productStock}>Qty: {item.quantity}</Text>
    
                </View>
    
                <View style={styles.stockAvailability}>
    
                  <View style={[styles.availabilityDot, { backgroundColor: item.is_available ? '#4CAF50' : '#f44336' }]} />
    
                  <Text style={styles.stockAvailabilityText}>
    
                    {item.is_available ? 'Available' : 'Unavailable'}
    
                  </Text>
    
                </View>
    
              </View>
    
              <View style={styles.productActions}>
    
                <TouchableOpacity style={styles.editButton} onPress={() => handleEditStock(item)}>
    
                  <Ionicons name="create-outline" size={18} color="#fff" />
    
                  <Text style={styles.buttonText}>Edit</Text>
    
                </TouchableOpacity>
    
                <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteStock(item)}>
    
                  <Ionicons name="trash-outline" size={18} color="#fff" />
    
                  <Text style={styles.buttonText}>Delete</Text>
    
                </TouchableOpacity>
    
              </View>
    
            </View>
    
          );
    
          };        if (loading && !refreshing && !modalVisible) {
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

// ==================== REQUESTS TAB ====================
// Helper component for consistent detail display
const DetailSection = ({ label, value }) => {
  if (!value) return null;
  return (
    <View style={styles.detailSection}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
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
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [requestStatusModalVisible, setRequestStatusModalVisible] = useState(false);
  const [requestToUpdate, setRequestToUpdate] = useState(null);
  const [selectedRequestStatus, setSelectedRequestStatus] = useState(null);
  const [deliveryOrPickup, setDeliveryOrPickup] = useState('delivery');
  const [quoteModalVisible, setQuoteModalVisible] = useState(false);
  const [requestToQuote, setRequestToQuote] = useState(null);
  const [quoteAmount, setQuoteAmount] = useState('');
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [selectedReceiptUrl, setSelectedReceiptUrl] = useState(null);

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
    if (request.delivery_method !== 'pickup' || !request.pickup_time) return null;
    return <DetailSection label="Pickup Time:" value={request.pickup_time} />;
  };

  const renderBookingDetails = (request) => (
    <>
      <DetailSection label="Request Number:" value={request.request_number} />
      <DetailSection label="Customer Name:" value={request.user_name} />
      <DetailSection label="Customer Email:" value={request.user_email} />
      <DetailSection label="Contact Number:" value={request.contact_number} />
      <DetailSection label="Occasion:" value={request.data?.occasion} />
      <DetailSection label="Event Date:" value={request.data?.event_date} />
      <DetailSection label="Venue:" value={request.data?.venue} />
      <DetailSection label="Additional Notes:" value={request.notes} />
      {renderPickupTimeSection(request)}
    </>
  );

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
            <TextInput style={styles.input} value={flowersString} editable={false} multiline/>

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
            <TextInput style={styles.input} value={`₱${request.final_price.toFixed(2)}`} editable={false} />
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
      const requests = (response.data.requests || []).map(req => {
        return {
            ...req,
            status: req.status === 'accepted' ? 'processing' : req.status, // Keep this transformation
        }
      });
      setRequests(requests);
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

  const handleStatusChange = async (id, status) => {
    try {
      await adminAPI.updateRequestStatus(id, status);
      Alert.alert('Success', `Request ${status}`);
      setModalVisible(false);
      loadRequests();
    } catch (error) {
      Alert.alert('Error', 'Failed to update status');
    }
  };

  const openRequestStatusModal = (request) => {
    setRequestToUpdate(request);
    setSelectedRequestStatus(request.status); // Pre-select current status
    setDeliveryOrPickup(request.delivery_method || 'delivery'); // Initialize deliveryOrPickup
    setRequestStatusModalVisible(true);
  };

  const confirmRequestStatusChange = async () => {
    if (!requestToUpdate || !selectedRequestStatus) return;
    const requestId = requestToUpdate.id;
    setRequestStatusModalVisible(false); // Close modal immediately

    try {
      await adminAPI.updateRequestStatus(requestId, selectedRequestStatus);

      let toastMessage = `Request Status Updated: Request #${requestToUpdate.request_number} is now ${selectedRequestStatus}.`;

      // New logic for requests: if status changes to 'processing', 'out_for_delivery', or 'ready_for_pickup'
      // and payment method is not COD and payment is 'waiting_for_confirmation', update payment to 'paid'.
      if (
        (selectedRequestStatus === 'processing' || selectedRequestStatus === 'out_for_delivery' || selectedRequestStatus === 'ready_for_pickup' || selectedRequestStatus === 'completed') &&
        requestToUpdate.payment_method?.toLowerCase() !== 'cod' &&
        (requestToUpdate.payment_status !== 'paid' && requestToUpdate.payment_status !== 'cancelled') // Check if it's not already paid or cancelled
      ) {
        await adminAPI.updateRequestPaymentStatus(requestToUpdate, 'paid');
        toastMessage = `Request Status Updated and Payment Marked as Paid for Request #${requestToUpdate.request_number}.`;
      }

      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: toastMessage
      });
      setModalVisible(false); // Close the main details modal too
      loadRequests(); // Reload requests to reflect changes
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

  const openQuoteModal = (request) => {
    setRequestToQuote(request);
    setQuoteAmount(request.final_price ? String(request.final_price) : '');
    setQuoteModalVisible(true);
  };

  const handleProvideQuote = async () => {
    if (!requestToQuote || !quoteAmount || isNaN(parseFloat(quoteAmount))) {
      Alert.alert('Invalid Input', 'Please enter a valid price.');
      return;
    }

    try {
      const { data: { request: updatedRequest } } = await adminAPI.provideQuote(requestToQuote.id, parseFloat(quoteAmount));

      // Create notification for the user
      if (updatedRequest) {
        const notificationData = {
          user_id: updatedRequest.user_id,
          type: 'quote',
          title: `Price Quote for Your Request`,
          message: `We've provided a quote of ₱${updatedRequest.final_price.toFixed(2)} for your request #${updatedRequest.request_number}. Please review and take action.`,
          link: `/profile` // Link to profile where they can see the request
        };
        await supabase.from('notifications').insert([notificationData]);
      }

      Toast.show({
        type: 'success',
        text1: 'Quote Provided',
        text2: `A quote of ₱${quoteAmount} has been sent for request #${requestToQuote.request_number}.`
      });
      setQuoteModalVisible(false);
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

  const openDetailsModal = (item) => {
    setSelectedRequest(item);
    setModalVisible(true);
  };

  const handleAssignRider = (request) => {
    setRequestToAssignRider(request);
    setSelectedRider(request.rider); // pre-select if already assigned
    setAssignRiderModalVisible(true);
  };

  const handleConfirmAssignRider = async () => {
    if (!requestToAssignRider || !selectedRider) return;
    try {
      const { error } = await supabase
        .from('requests')
        .update({ assigned_rider: selectedRider.id })
        .eq('id', requestToAssignRider.id);

      if (error) throw error;

      Toast.show({ type: 'success', text1: 'Rider Assigned' });
      setAssignRiderModalVisible(false);
      loadRequests(); // To refresh the list with the new rider
    } catch (error) {
      console.error('Error assigning rider to request:', error);
      Toast.show({ type: 'error', text1: 'Assignment Failed' });
    }
  };

  const EnhancedRequestCard = ({ item, onMessageCustomer, onPhoneCall, openDetailsModal, openReceiptModal, handleUpdatePaymentStatus, onAssignRider }) => (
    <View style={styles.eoCard}>
      {/* Header */}
      <View style={styles.eoCardHeader}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.eoLabel}>Request Type</Text>
          <Text style={styles.eoOrderId}>{getStatusLabel(item.type)}</Text>
          <View style={[styles.eoDeliveryTypeBadge, {backgroundColor: item.delivery_method === 'delivery' ? '#3B82F6' : '#10B981'}]}>
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
          <View style={[styles.eoStatusBadge, {backgroundColor: getStatusColor(item.status)}]}>
            <Ionicons name="time-outline" size={12} color="#fff" />
            <Text style={styles.eoStatusText}>{getStatusLabel(item.status)}</Text>
          </View>
        </View>
      </View>

      {/* Customer Info */}
      <View style={styles.eoSection}>
        <View style={styles.eoCustomerHeader}>
            <View style={styles.eoAvatarContainer}>
                <View style={styles.eoAvatar}>
                    <Text style={styles.eoAvatarText}>{getCustomerInitials(item.user_name)}</Text>
                </View>
                <View>
                    <Text style={styles.eoLabel}>Customer</Text>
                    <Text style={styles.eoCustomerName}>{item.user_name}</Text>
                </View>
            </View>
            <View style={styles.eoActionButtons}>
                <TouchableOpacity style={styles.eoIconBtnGreen} onPress={(e) => { e.stopPropagation(); onPhoneCall(item.contact_number || item.user_phone); }}>
                    <Ionicons name="call" size={16} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.eoIconBtnBlue}
                    onPress={(e) => { e.stopPropagation(); onMessageCustomer(item.users, item.user_name, item.user_email); }}
                >
                    <Ionicons name="chatbubble" size={16} color="#fff" />
                </TouchableOpacity>
            </View>
        </View>
        <View style={styles.eoContactInfo}>
            {item.user_email && (<View style={styles.eoInfoRow}>
                <Ionicons name="mail" size={14} color="#9CA3AF" />
                <Text style={styles.eoInfoText}>{item.user_email}</Text>
            </View>)}
            {item.contact_number && (
              <View style={styles.eoInfoRow}>
                  <Ionicons name="call" size={14} color="#9CA3AF" />
                  <Text style={styles.eoInfoText} numberOfLines={1}>{item.contact_number}</Text>
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
        {item.notes && (
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
            source={{ uri: item.image_url.startsWith('http') ? item.image_url : `${BASE_URL}${item.image_url}` }}
            style={{ width: '100%', height: 200, borderRadius: 8, marginTop: 10 }}
            resizeMode="contain"
          />
        </View>
      )}

      {/* Assigned Rider Info */}
      {item.rider && (
        <View style={styles.eoSection}>
            <View style={styles.eoSectionHeader}>
              <Ionicons name="bicycle-outline" size={16} color="#6B7280"/>
              <Text style={styles.eoSectionTitle}>Assigned Rider</Text>
            </View>
            <View style={styles.eoFlexBetween}>
                <Text style={styles.eoDetailText}>Name:</Text>
                <Text style={styles.eoInfoTextBold}>{item.rider.name}</Text>
            </View>
        </View>
      )}

                  {/* Payment Details */}

                  {(item.payment_status || item.final_price) && (

                    <View style={styles.eoSection}>

                      <View style={styles.eoSectionHeader}>

                          <Ionicons name="card" size={16} color="#6B7280"/>

                          <Text style={styles.eoSectionTitle}>Payment Details</Text>

                      </View>

                      <View style={{gap: 8}}>

                        <View style={styles.eoFlexBetween}>

                            <Text style={styles.eoDetailText}>Method:</Text>

                            <Text style={styles.eoInfoTextBold}>

                              {getStatusLabel(item.payment_method || 'gcash')}

                            </Text>

                        </View>

                        <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}>

                                                                        <View style={[styles.eoPaymentStatus, {backgroundColor: item.payment_status === 'paid' ? '#22C55E' : '#FFA726'}]}>

                                                                            <Text style={styles.eoPaymentStatusText}>{getPaymentStatusDisplay(item.payment_status, item.payment_method)}</Text>

                                                                        </View>

                            {(item.payment_method?.toLowerCase() === 'gcash' || !item.payment_method) && item.receipt_url && (

                                <TouchableOpacity onPress={() => openReceiptModal(item.receipt_url)}>

                                    <Text style={styles.eoViewReceipt}>View Receipt</Text>

                                </TouchableOpacity>

                            )}

                        </View>

                      </View>

                    </View>

                  )}

            

                  {/* Pricing Summary */}

                  {item.final_price && (

                    <View style={styles.eoSection}>

                      <View style={{gap: 8}}>

                        <View style={styles.eoPriceRow}>

                          <Text style={styles.eoDetailText}>Sub Total:</Text>

                          <Text style={styles.eoDetailText}>₱{(item.data?.subtotal || (item.final_price - (item.shipping_fee || 0))).toFixed(2)}</Text>

                        </View>

                        <View style={styles.eoPriceRow}>

                          <Text style={styles.eoDetailText}>Delivery Fee:</Text>

                          <Text style={styles.eoDetailText}>₱{(item.shipping_fee || 0).toFixed(2)}</Text>

                        </View>

                        <View style={[styles.eoPriceRow, {marginTop: 8}]}>

                          <Text style={styles.eoTotalLabel}>Total:</Text>

                          <Text style={styles.eoTotalValue}>₱{item.final_price.toFixed(2)}</Text>

                        </View>

                      </View>

                    </View>

                  )}

      

            {/* Action to open full details */}
      <View style={styles.eoFooter}>
        <TouchableOpacity style={[styles.eoMainBtn, {backgroundColor: '#8B5CF6'}]} onPress={() => openDetailsModal(item)}>
            <Ionicons name="eye" size={18} color="#fff" />
            <Text style={styles.eoMainBtnText}>View Details</Text>
        </TouchableOpacity>
        {item.delivery_method === 'delivery' && item.status === 'processing' && (
          <TouchableOpacity style={[styles.eoMainBtn, {backgroundColor: '#10B981', marginTop: 10}]} onPress={() => onAssignRider(item)}>
            <Ionicons name="person-add-outline" size={18} color="#fff" />
            <Text style={styles.eoMainBtnText}>Assign Rider</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.tabContent}>
      <Text style={styles.tabTitle}>Booking & Custom Requests</Text>
      
      <FlatList
        data={requestsWithRiderDetails}
        renderItem={({item}) => <EnhancedRequestCard 
                                    item={item} 
                                    onMessageCustomer={handleMessageCustomer} 
                                    onPhoneCall={handlePhoneCall} 
                                    openDetailsModal={openDetailsModal} 
                                    openReceiptModal={openReceiptModal}
                                    handleUpdatePaymentStatus={handleUpdatePaymentStatus}
                                    onAssignRider={handleAssignRider}
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
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Type:</Text>
                    <Text style={styles.detailValue}>{getStatusLabel(selectedRequest.type)}</Text>
                  </View>
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Submitted:</Text>
                  <Text style={styles.detailValue}>{formatTimestamp(selectedRequest.created_at)}</Text>
                </View>

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
                  </View>
                )}

                <View style={styles.actionButtons}>
                  {/* For Special Order and Booking: Provide Quote */}
                  {(selectedRequest.status === 'pending' || selectedRequest.status === 'quoted') && (selectedRequest.type === 'special_order' || selectedRequest.type === 'booking') && (
                    <TouchableOpacity
                      style={[styles.actionButton, {backgroundColor: '#2196F3', flexDirection: 'row', justifyContent: 'center', alignItems: 'center'}]} // Blue color, added flex direction
                      onPress={() => {
                        setModalVisible(false);
                        openQuoteModal(selectedRequest);
                      }}
                    >
                      <Ionicons name="pricetag-outline" size={16} color="#fff" />
                      <Text style={styles.buttonText}> Provide Price</Text> {/* Changed text */}
                    </TouchableOpacity>
                  )}

                  {/* Accept and Decline for Pending Customized Requests */}
                  {selectedRequest.status === 'pending' && selectedRequest.type === 'customized' && (
                    <>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.acceptButton]}
                        onPress={() => handleStatusChange(selectedRequest.id, 'processing')}
                      >
                        <Text style={styles.buttonText}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.rejectButton]}
                        onPress={() => handleStatusChange(selectedRequest.id, 'cancelled')}
                      >
                        <Text style={styles.buttonText}>Decline</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {/* Change Status for requests not in a final state */}
                  {['processing', 'ready_for_pickup', 'out_for_delivery'].includes(selectedRequest.status) && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.changeStatusButton]}
                      onPress={() => openRequestStatusModal(selectedRequest)}
                    >
                      <Text style={styles.buttonText}>Change Status</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Request Change Status Modal (Timeline UI) */}
      <Modal visible={requestStatusModalVisible} transparent animationType="fade" onRequestClose={() => setRequestStatusModalVisible(false)}>
          <View style={styles.statusModalBackdrop}>
              <View style={styles.timelineModalContainer}>
                  <View style={styles.statusModalHeader}>
                      <Text style={styles.statusModalTitle}>Change Request Status</Text>
                  </View>

                  <ScrollView contentContainerStyle={styles.timelineScrollView}>
                      
                      {/* Delivery/Pickup Toggle */}
                      <View style={styles.timelinePathSelector}>
                          <TouchableOpacity 
                              style={[styles.timelinePathButton, deliveryOrPickup === 'delivery' && styles.timelinePathButtonActive]}
                              onPress={() => setDeliveryOrPickup('delivery')}
                          >
                              <Ionicons name="rocket-outline" size={16} color={deliveryOrPickup === 'delivery' ? '#fff' : '#3B82F6'} />
                              <Text style={[styles.timelinePathText, deliveryOrPickup === 'delivery' && styles.timelinePathTextActive]}>Delivery</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                              style={[styles.timelinePathButton, deliveryOrPickup === 'pickup' && [styles.timelinePathButtonActive, { backgroundColor: '#10B981' }]]}
                              onPress={() => setDeliveryOrPickup('pickup')}
                          >
                              <Ionicons name="storefront-outline" size={16} color={deliveryOrPickup === 'pickup' ? '#fff' : '#10B981'} />
                              <Text style={[styles.timelinePathText, deliveryOrPickup === 'pickup' && styles.timelinePathTextActive]}>Pick-up</Text>
                          </TouchableOpacity>
                      </View>

                      {(() => {
                          if (!requestToUpdate) return null;
                          const stepperStatuses = deliveryOrPickup === 'delivery' ? requestDeliveryStepperStatuses : requestPickupStepperStatuses;
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
                                                  ]}/>
                                              )}
                                              <TouchableOpacity
                                                onPress={() => setSelectedRequestStatus(status.id)}
                                                style={styles.timelineStep}
                                                disabled={isPast}
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
                                                              <Text style={[styles.timelineCircleText, isSelected && {color: '#fff'}]}>{index + 1}</Text>
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
                          <Text style={styles.statusConfirmButtonText}>Confirm</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setRequestStatusModalVisible(false)} style={styles.statusCloseButton}>
                          <Text style={styles.statusCloseButtonText}>Cancel</Text>
                      </TouchableOpacity>
                  </View>
              </View>
          </View>
      </Modal>

      {/* Provide Quote Modal */}
      <Modal visible={quoteModalVisible} animationType="fade" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Provide Price</Text>
              <TouchableOpacity onPress={() => setQuoteModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSubtitle, {textAlign: 'left', paddingHorizontal: 20}]}>Request #{requestToQuote?.request_number}</Text>
            
            <Text style={styles.inputLabel}>Price Amount (₱)</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter total price for the request"
              keyboardType="numeric"
              value={quoteAmount}
              onChangeText={setQuoteAmount}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setQuoteModalVisible(false)}
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
      </Modal>

      {/* Receipt View Modal */}
      <Modal visible={receiptModalVisible} animationType="fade" transparent>
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
      </Modal>

      {/* Assign Rider Modal */}
      <Modal visible={assignRiderModalVisible} animationType="fade" transparent>
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, {maxHeight: '70%'}]}>
            <Text style={styles.modalTitle}>Assign Rider</Text>

            {/* Clean Search Bar */}
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
                  <View style={{flex: 1}}>
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
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => { setAssignRiderModalVisible(false); setRiderSearchQuery(''); }}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleConfirmAssignRider} disabled={!selectedRider}>
                <Text style={styles.buttonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
};

// ==================== NOTIFICATIONS TAB ====================
const NotificationsTab = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    user_id: ''
  });

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getAllNotifications();
      setNotifications(response.data.notifications || []);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  };

  const handleSendNotification = async () => {
    if (!formData.title || !formData.message) {
      Alert.alert('Error', 'Title and Message are required');
      return;
    }

    setLoading(true);
    try {
      await adminAPI.sendNotification({
        ...formData,
        user_id: formData.user_id || null // If empty, send as system/null
      });
      Alert.alert('Success', 'Notification sent');
      setModalVisible(false);
      setFormData({ title: '', message: '', user_id: '' });
      loadNotifications();
    } catch (error) {
      console.error('Error sending notification:', error);
      Alert.alert('Error', 'Failed to send notification');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNotification = (id) => {
    Alert.alert('Delete', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await adminAPI.deleteNotification(id);
            loadNotifications();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete notification');
          }
        }
      }
    ]);
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
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setModalVisible(true)}
      >
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.addButtonText}>Send Notification</Text>
      </TouchableOpacity>

      <Text style={styles.tabTitle}>System Notifications</Text>

      <FlatList
        data={notifications}
        renderItem={({ item }) => (
          <View style={styles.notificationCard}>
            <View style={styles.notificationContent}>
              <Text style={styles.notificationTitle}>{item.title}</Text>
              <Text style={styles.notificationMessage}>{item.message}</Text>
              <Text style={styles.notificationDate}>
                {new Date(item.created_at).toLocaleDateString()} • {item.user_name || 'System Wide'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.deleteIconButton}
              onPress={() => handleDeleteNotification(item.id)}
            >
              <Ionicons name="trash-outline" size={20} color="#f44336" />
            </TouchableOpacity>
          </View>
        )}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ec4899']} />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No notifications sent</Text>
        }
      />

      {/* Send Notification Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Send Notification</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <Text style={styles.inputLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                placeholder="Notification Title"
                value={formData.title}
                onChangeText={(text) => setFormData({ ...formData, title: text })}
              />

              <Text style={styles.inputLabel}>Message *</Text>
              <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                placeholder="Notification Message"
                multiline
                numberOfLines={4}
                value={formData.message}
                onChangeText={(text) => setFormData({ ...formData, message: text })}
              />

              <Text style={styles.inputLabel}>User ID (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Specific User ID (Leave empty for all)"
                keyboardType="numeric"
                value={formData.user_id}
                onChangeText={(text) => setFormData({ ...formData, user_id: text })}
              />
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
                onPress={handleSendNotification}
                disabled={loading}
              >
                <Text style={styles.buttonText}>{loading ? 'Sending...' : 'Send'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ==================== MESSAGING TAB ====================
const MessagingTab = ({ customerToMessage, setCustomerToMessage }) => {
    const [conversations, setConversations] = useState([]);
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [newMessage, setNewMessage] = useState('');
    const [currentUser, setCurrentUser] = useState(null);
    const flatListRef = React.useRef(null);
    const navigation = useNavigation();

    // Memoized fetchConversations
    const fetchConversations = React.useCallback(async (user) => {
        if (!user || !(user.role === 'admin' || user.role === 'employee')) {
            setConversations([]);
            return;
        }
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('get_shared_conversations');
            if (error) throw error;
            const conversationsData = data || [];
            setConversations(conversationsData);
        } catch (error) {
            console.error("Error fetching shared conversations:", error);
            Alert.alert('Error', 'Could not fetch conversations. Please ensure database functions are installed correctly.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Memoized fetchMessages
    const fetchMessages = React.useCallback(async (conversation, user) => {
        if (!user || !conversation) return;
        const customerId = conversation.user.id;
        setSelectedConversation(conversation);
        setLoading(true);
        try {
            if (conversation.unreadCount > 0) {
                await supabase.from('messages').update({ is_read: true }).eq('sender_id', customerId).eq('is_read', false);
                fetchConversations(user);
            }
            const { data, error } = await supabase.rpc('get_conversation_messages', { p_customer_id: customerId });
            if (error) throw error;
            const messagesWithDetails = await Promise.all((data || []).map(async (msg) => {
                const { data: sender } = await supabase.from('users').select('id, name, role').eq('id', msg.sender_id).single();
                return { ...msg, sender };
            }));
            setMessages(messagesWithDetails);
        } catch (error) {
            console.error("Error fetching messages:", error);
            Alert.alert('Error', 'Could not fetch message history.');
        } finally {
            setLoading(false);
        }
    }, [fetchConversations]);

    // Get current user from AsyncStorage
    useEffect(() => {
        const loadInitialData = async () => {
            const userJson = await AsyncStorage.getItem('currentUser');
            if (userJson) setCurrentUser(JSON.parse(userJson));
            else navigation.navigate('Login');
        };
        loadInitialData();
    }, [navigation]);

    // Fetch conversations when user is loaded
    useFocusEffect(
        React.useCallback(() => {
            if (currentUser) {
                fetchConversations(currentUser);
            }
        }, [currentUser, fetchConversations])
    );

    // Real-time subscription for when the user is actively in a chat
    useEffect(() => {
        if (!currentUser || !selectedConversation) return;

        const channel = supabase.channel(`messaging-tab-realtime-${currentUser.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                const customerInChatId = selectedConversation.user.id;
                const newMessage = payload.new;
                // If the new message belongs to the currently open conversation, refetch messages
                if (newMessage.sender_id === customerInChatId || newMessage.receiver_id === customerInChatId) {
                    fetchMessages(selectedConversation, currentUser);
                }
            }).subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser, selectedConversation, fetchMessages]);

    // Effect to handle customer selected from another tab
    useEffect(() => {
        if (customerToMessage && currentUser) {
            const customerConversation = {
                user: {
                    id: customerToMessage.id,
                    name: customerToMessage.name,
                    email: customerToMessage.email,
                },
            };
            fetchMessages(customerConversation, currentUser);
            setCustomerToMessage(null); // Reset after processing
        }
    }, [customerToMessage, currentUser, fetchMessages, setCustomerToMessage]);

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !selectedConversation || !currentUser) return;
        const receiverId = selectedConversation.user.id;
        const messageText = newMessage.trim();
        setNewMessage('');

        try {
            const { error } = await supabase.rpc('send_message_as_staff', {
                p_receiver_id: receiverId,
                p_message_text: messageText
            });
            if (error) throw error;
            // Optimistically update UI - for simplicity, we just refetch
            fetchMessages(selectedConversation, currentUser);
        } catch (error) {
            console.error("Error sending message:", error);
            Alert.alert('Error', error.message || 'Could not send message.');
            setNewMessage(messageText); 
        }
    };

    const renderConversationItem = ({ item }) => {
        const isUnread = item.unreadCount > 0;
        return (
            <TouchableOpacity style={styles.chatItem} onPress={() => fetchMessages(item, currentUser)}>
                <View style={styles.chatAvatar}>
                     <Text style={styles.chatAvatarText}>{item.user.name ? item.user.name.charAt(0).toUpperCase() : 'U'}</Text>
                </View>
                <View style={styles.chatPreview}>
                    <Text style={[styles.chatName, isUnread && styles.chatNameUnread]}>{item.user.name || 'Unknown User'}</Text>
                    <Text style={[styles.chatMessage, isUnread && styles.chatMessageUnread]} numberOfLines={1}>{item.lastMessage}</Text>
                </View>
                <View style={styles.chatMeta}>
                    <Text style={styles.chatUserTime}>{formatMessageTimestamp(item.timestamp)}</Text>
                    {isUnread && (
                        <View style={styles.unreadBadge}>
                            <Text style={styles.unreadText}>{item.unreadCount}</Text>
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    const renderMessageItem = ({ item }) => {
        const isSentByMe = item.sender_id === currentUser.id;
        return (
            <View style={[styles.messageWrapper, isSentByMe ? styles.messageSentWrapper : styles.messageReceivedWrapper]}>
                {!isSentByMe && (
                    <View style={styles.messageAvatar}>
                        <Text style={styles.chatAvatarText}>{item.sender && item.sender.name ? item.sender.name.charAt(0).toUpperCase() : 'U'}</Text>
                    </View>
                )}
                <View style={[styles.messageBubble, isSentByMe ? styles.messageSentBubble : styles.messageReceivedBubble]}>
                    <Text style={isSentByMe ? styles.messageTextSent : styles.messageTextReceived}>{item.message}</Text>
                    <Text style={[styles.messageTime, isSentByMe ? styles.messageTimeSent : styles.messageTimeReceived]}>{formatMessageTimestamp(item.created_at)}</Text>
                </View>
            </View>
        );
    };

    if (selectedConversation) {
        return (
            <View style={styles.tabContent}>
                <View style={styles.chatHeader}>
                    <TouchableOpacity onPress={() => setSelectedConversation(null)}>
                        <Ionicons name="arrow-back" size={24} color="#333" />
                    </TouchableOpacity>
                    <Text style={styles.chatHeaderTitle}>{selectedConversation.user.name}</Text>
                    <View style={{width: 24}}/>
                </View>
                {loading && messages.length === 0 ? ( <ActivityIndicator style={{ marginTop: 20 }} size="large" color="#ec4899" /> ) : (
                    <FlatList
                        ref={flatListRef} data={messages} renderItem={renderMessageItem} keyExtractor={(item) => item.id.toString()}
                        style={styles.chatMessagesContainer} contentContainerStyle={{ padding: 10 }}
                        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                        onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
                    />
                )}
                <View style={styles.chatInputContainer}>
                    <TextInput style={styles.chatInput} placeholder="Type a message..." value={newMessage} onChangeText={setNewMessage} onSubmitEditing={handleSendMessage} placeholderTextColor="#999" />
                    <TouchableOpacity style={styles.chatSendButton} onPress={handleSendMessage}><Ionicons name="send" size={20} color="#fff" /></TouchableOpacity>
                </View>
            </View>
        )
    }

    return (
        <View style={styles.tabContent}>
            <Text style={styles.tabTitle}>Conversations</Text>
            {loading && !conversations.length ? ( <ActivityIndicator style={{ marginTop: 20 }} size="large" color="#ec4899" /> ) : (
                <FlatList
                    data={conversations} renderItem={renderConversationItem} keyExtractor={(item) => item.user?.id?.toString()}
                    onRefresh={() => fetchConversations(currentUser)} refreshing={loading}
                    ListEmptyComponent={<Text style={styles.emptyText}>No conversations found.</Text>}
                />
            )}
        </View>
    );
};


// ==================== SALES TAB ====================
const SalesTab = () => {
  const { width } = useWindowDimensions();
  const [salesData, setSalesData] = useState({
    totalSales: 0,
    todaySales: 0,
    weekSales: 0,
    monthSales: 0,
    totalOrders: 0,
    completedOrders: 0,
    pendingOrders: 0,
  });
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [{ data: [] }],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('week');

  useEffect(() => {
    loadSalesData();

    const subscription = supabase
      .channel('sales-tab-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' },
        (payload) => {
          loadSalesData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [selectedPeriod]);

  const loadSalesData = async () => {
    setLoading(true);
    try {
      const summaryRes = await adminAPI.getSalesSummary();
      if (summaryRes.error) throw summaryRes.error;
      const summary = summaryRes.data;

      setSalesData({
        totalSales: summary.totalSales,
        todaySales: summary.todaySales,
        weekSales: summary.weekSales,
        monthSales: summary.monthSales,
        totalOrders: summary.totalOrders,
        completedOrders: summary.completedOrders,
        pendingOrders: summary.pendingOrders,
      });

      // Process data for chart
      const chartRes = await adminAPI.getSalesChartData();
      if (chartRes.error) throw chartRes.error;
      const allSales = chartRes.data || [];

      let labels = [];
      let data = [];

      if (selectedPeriod === 'week') {
        const toDateString = (date) => {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }

        const dailyData = new Map();
        labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

        const today = new Date();
        const dayOfWeek = today.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        
        const monday = new Date(today);
        monday.setDate(today.getDate() + diff);
        monday.setHours(0, 0, 0, 0);

        for (let i = 0; i < 7; i++) {
            const day = new Date(monday);
            day.setDate(monday.getDate() + i);
            dailyData.set(toDateString(day), 0);
        }

        allSales.forEach(sale => {
            const saleDate = new Date(sale.sale_date);
            const saleDateString = toDateString(saleDate);
            if (dailyData.has(saleDateString)) {
                dailyData.set(saleDateString, dailyData.get(saleDateString) + parseFloat(sale.total_amount || 0));
            }
        });
        data = Array.from(dailyData.values());

      } else if (selectedPeriod === 'month') {
        labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4']; // Week 1 is most recent
        data = [0, 0, 0, 0];

        const now = new Date();
        
        allSales.forEach(sale => {
            const saleDate = new Date(sale.sale_date);
            const diffDays = Math.floor((now - saleDate) / (1000 * 60 * 60 * 24));
            
            if (diffDays >= 0 && diffDays < 28) {
                const weekIndex = Math.floor(diffDays / 7); // 0 for last 7 days, 1 for 7-13 days ago, etc.
                if (weekIndex >= 0 && weekIndex < 4) {
                    data[weekIndex] += parseFloat(sale.total_amount || 0);
                }
            }
        });

      } else { // 'all'
        labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthTotals = Array(12).fill(0);
        const currentYear = new Date().getFullYear();
        allSales.forEach(sale => {
            const saleDate = new Date(sale.sale_date);
            if (saleDate.getFullYear() === currentYear) {
                const monthIndex = saleDate.getMonth();
                monthTotals[monthIndex] += parseFloat(sale.total_amount || 0);
            }
        });
        data = monthTotals;
      }
      
      const allSame = data.length > 1 && data.every(val => val === data[0]);
      if (allSame) {
        data[data.length - 1] += 0.0001;
      }

      setChartData({
        labels,
        datasets: [{ data: data.length > 0 ? data : [0] }],
      });

    } catch (error) {
      console.error('Error loading sales data:', error);
      setSalesData({
        totalSales: 0, todaySales: 0, weekSales: 0, monthSales: 0,
        totalOrders: 0, completedOrders: 0, pendingOrders: 0,
      });
      setChartData({
        labels: ['N/A'],
        datasets: [{ data: [0] }],
      });
    } finally {
      setLoading(false);
    }
  };
  
  const onRefresh = async () => {
    setRefreshing(true);
    await loadSalesData();
    setRefreshing(false);
  };

  const formatCurrency = (amount) => {
    return `₱${parseFloat(amount).toFixed(2)}`;
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
      </View>
    );
  }

  const currentSales = selectedPeriod === 'today' ? salesData.todaySales :
    selectedPeriod === 'week' ? salesData.weekSales :
    selectedPeriod === 'month' ? salesData.monthSales :
      salesData.totalSales;

  return (
    <ScrollView
      style={styles.tabContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ec4899']} />
      }
    >
      <Text style={styles.tabTitle}>Sales Dashboard</Text>

      {/* Period Filter */}
      <View style={styles.filterContainer}>
        <Text style={styles.filterLabel}>Period:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
          {['week', 'month', 'all'].map((period) => (
            <TouchableOpacity
              key={period}
              style={[
                styles.categoryChip,
                selectedPeriod === period && styles.categoryChipActive
              ]}
              onPress={() => setSelectedPeriod(period)}
            >
              <Text style={[
                styles.categoryChipText,
                selectedPeriod === period && styles.categoryChipTextActive
              ]}>
                {period.charAt(0).toUpperCase() + period.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Sales Chart */}
      <View style={{
        marginVertical: 8,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#eee',
        overflow: 'hidden',
        alignSelf: 'center'
      }}>
        <LineChart
          data={chartData}
          width={width - 32}
          height={220}
          yAxisLabel="₱"
          chartConfig={{
            backgroundColor: "#fff",
            backgroundGradientFrom: "#fff",
            backgroundGradientTo: "#fff",
            decimalPlaces: 2,
            color: (opacity = 1) => `rgba(236, 72, 153, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
            style: {
              borderRadius: 16
            },
            propsForDots: {
              r: "6",
              strokeWidth: "2",
              stroke: "#ec4899"
            },
            formatYLabel: (yLabel) => `₱${parseFloat(yLabel).toFixed(0)}`,
            yLabelsOffset: 40,
          }}
          bezier
        />
      </View>

      {/* Sales Summary Cards */}
      <View style={styles.salesSummaryContainer}>
        <View style={styles.salesCard}>
          <Ionicons name="cash" size={32} color="#4CAF50" />
          <Text style={styles.salesCardValue}>{formatCurrency(currentSales)}</Text>
          <Text style={styles.salesCardLabel}>
            {selectedPeriod === 'all' ? 'Total Sales' : `Sales (${selectedPeriod.charAt(0).toUpperCase() + selectedPeriod.slice(1)})`}
          </Text>
        </View>

        <View style={styles.salesCard}>
          <Ionicons name="cart" size={32} color="#2196F3" />
          <Text style={styles.salesCardValue}>{salesData.totalOrders}</Text>
          <Text style={styles.salesCardLabel}>Total Orders</Text>
        </View>
      </View>

      <View style={styles.salesSummaryContainer}>
        <View style={styles.salesCard}>
          <Ionicons name="checkmark-circle" size={32} color="#4CAF50" />
          <Text style={styles.salesCardValue}>{salesData.completedOrders}</Text>
          <Text style={styles.salesCardLabel}>Completed</Text>
        </View>

        <View style={styles.salesCard}>
          <Ionicons name="time" size={32} color="#FF9800" />
          <Text style={styles.salesCardValue}>{salesData.pendingOrders}</Text>
          <Text style={styles.salesCardLabel}>Pending</Text>
        </View>
      </View>
      <View style={{ height: 50 }} />
    </ScrollView>
  );
};

// ==================== ABOUT TAB ====================
const AboutTab = () => {
    const [aboutData, setAboutData] = useState({
        story: '',
        about_description: '',
        promise: '',
        ownerQuote: '',
        ownerImage: null,
        ourShopImage: null,
        customBouquetsDescription: '',
        customBouquetsImage: null,
        eventDecorationsDescription: '',
        eventDecorationsImage: null,
        specialOrdersDescription: '',
        specialOrdersImage: null,
        promises_responsibly_sourced_description: '',
        promises_responsibly_sourced_image: null,
        promises_crafted_by_experts_description: '',
        promises_crafted_by_experts_image: null,
        promises_caring_for_moments_description: '',
        promises_caring_for_moments_image: null,
    });
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const fetchAboutData = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('app_content')
                .select('key, value')
                .in('key', [
                    'about_story', 'about_description', 'about_promise', 'about_owner_quote', 'about_owner_image', 'about_our_shop_img',
                    'about_custom_bouquets_desc', 'about_custom_bouquets_img',
                    'about_event_decorations_desc', 'about_event_decorations_img',
                    'about_special_orders_desc', 'about_special_orders_img',
                    'promises_responsibly_sourced_description', 'promises_responsibly_sourced_image',
                    'promises_crafted_by_experts_description', 'promises_crafted_by_experts_image',
                    'promises_caring_for_moments_description', 'promises_caring_for_moments_image'
                ]);

            if (error) throw error;

            const info = data.reduce((acc, { key, value }) => {
                if (key === 'about_story') acc.story = value;
                if (key === 'about_description') acc.about_description = value;
                if (key === 'about_promise') acc.promise = value;
                if (key === 'about_owner_quote') acc.ownerQuote = value;
                if (key === 'about_owner_image') acc.ownerImage = value;
                if (key === 'about_our_shop_img') acc.ourShopImage = value;
                if (key === 'about_custom_bouquets_desc') acc.customBouquetsDescription = value;
                if (key === 'about_custom_bouquets_img') acc.customBouquetsImage = value;
                if (key === 'about_event_decorations_desc') acc.eventDecorationsDescription = value;
                if (key === 'about_event_decorations_img') acc.eventDecorationsImage = value;
                if (key === 'about_special_orders_desc') acc.specialOrdersDescription = value;
                if (key === 'about_special_orders_img') acc.specialOrdersImage = value;
                if (key === 'promises_responsibly_sourced_description') acc.promises_responsibly_sourced_description = value;
                if (key === 'promises_responsibly_sourced_image') acc.promises_responsibly_sourced_image = value;
                if (key === 'promises_crafted_by_experts_description') acc.promises_crafted_by_experts_description = value;
                if (key === 'promises_crafted_by_experts_image') acc.promises_crafted_by_experts_image = value;
                if (key === 'promises_caring_for_moments_description') acc.promises_caring_for_moments_description = value;
                if (key === 'promises_caring_for_moments_image') acc.promises_caring_for_moments_image = value;
                return acc;
            }, { 
                story: '', about_description: '', promise: '', ownerQuote: '', ownerImage: null, ourShopImage: null,
                customBouquetsDescription: '', customBouquetsImage: null,
                eventDecorationsDescription: '', eventDecorationsImage: null,
                specialOrdersDescription: '', specialOrdersImage: null,
                promises_responsibly_sourced_description: '', promises_responsibly_sourced_image: null,
                promises_crafted_by_experts_description: '', promises_crafted_by_experts_image: null,
                promises_caring_for_moments_description: '', promises_caring_for_moments_image: null,
            });
            setAboutData(info);
        } catch (error) {
            Alert.alert('Error fetching about data', error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAboutData();
    }, []);

    const pickImage = async (field) => {
        try {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
            base64: true,
          });
    
          if (!result.canceled) {
            setAboutData(prev => ({ ...prev, [field]: result.assets[0] }));
          }
        } catch (error) {
          console.error(`Error launching image library for ${field}:`, error);
          Alert.alert('Error', 'Failed to open image library. Please try again.');
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            let updates = [];
            const textFields = {
                about_story: aboutData.story,
                about_description: aboutData.about_description,
                about_promise: aboutData.promise,
                about_owner_quote: aboutData.ownerQuote,
                about_custom_bouquets_desc: aboutData.customBouquetsDescription,
                about_event_decorations_desc: aboutData.eventDecorationsDescription,
                about_special_orders_desc: aboutData.specialOrdersDescription,
                promises_responsibly_sourced_description: aboutData.promises_responsibly_sourced_description,
                promises_crafted_by_experts_description: aboutData.promises_crafted_by_experts_description,
                promises_caring_for_moments_description: aboutData.promises_caring_for_moments_description,
            };
    
            for (const [key, value] of Object.entries(textFields)) {
                updates.push({ key, value });
            }
    
            const handleImageUpload = async (imageAsset, fileName, keyName) => {
                if (imageAsset && typeof imageAsset === 'object' && imageAsset.base64) {
                    const arrayBuffer = decode(imageAsset.base64);
                    const filePath = `${fileName}.jpg`;
                    const contentType = imageAsset.mimeType || 'image/jpeg';
    
                    const { error: uploadError } = await supabase.storage
                        .from('about-images')
                        .upload(filePath, arrayBuffer, { contentType, upsert: true });
    
                    if (uploadError) throw uploadError;
    
                    const { data: urlData } = supabase.storage.from('about-images').getPublicUrl(filePath);
                    if (!urlData) throw new Error(`Could not get public URL for ${fileName}.`);
                    
                    const imageUrl = `${urlData.publicUrl}?t=${new Date().getTime()}`;
                    updates.push({ key: keyName, value: imageUrl });
                }
            };
    
            await handleImageUpload(aboutData.ownerImage, 'owner', 'about_owner_image');
            await handleImageUpload(aboutData.ourShopImage, 'our_shop', 'about_our_shop_img');
            await handleImageUpload(aboutData.customBouquetsImage, 'custom_bouquets', 'about_custom_bouquets_img');
            await handleImageUpload(aboutData.eventDecorationsImage, 'event_decorations', 'about_event_decorations_img');
            await handleImageUpload(aboutData.specialOrdersImage, 'special_orders', 'about_special_orders_img');
            await handleImageUpload(aboutData.promises_responsibly_sourced_image, 'responsibly_sourced', 'promises_responsibly_sourced_image');
            await handleImageUpload(aboutData.promises_crafted_by_experts_image, 'crafted_by_experts', 'promises_crafted_by_experts_image');
            await handleImageUpload(aboutData.promises_caring_for_moments_image, 'caring_for_moments', 'promises_caring_for_moments_image');

            const { error: upsertError } = await supabase
                .from('app_content')
                .upsert(updates, { onConflict: 'key' });

            if (upsertError) throw upsertError;

            Alert.alert('Success', 'About page content has been updated.');
        } catch (error) {
            console.error('Error saving about content:', error);
            Alert.alert('Error saving about content', error.message);
        } finally {
            setIsSaving(false);
            fetchAboutData();
        }
    };

    if (loading) {
        return <ActivityIndicator style={{ marginTop: 20 }} size="large" color="#ec4899" />;
    }

    const getImageUri = (image) => image ? (typeof image === 'string' ? image : image.uri) : null;

    return (
        <ScrollView style={styles.tabContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.tabTitle}>About Page Content</Text>
            
            <Text style={styles.inputLabel}>Our Story</Text>
            <TextInput
                style={[styles.input, { height: 150, textAlignVertical: 'top' }]}
                value={aboutData.story}
                onChangeText={text => setAboutData(prev => ({ ...prev, story: text }))}
                placeholder="The story of the shop..."
                multiline
            />

            <Text style={styles.inputLabel}>About Description</Text>
            <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                value={aboutData.about_description}
                onChangeText={text => setAboutData(prev => ({ ...prev, about_description: text }))}
                placeholder="A short description for the about page..."
                multiline
            />

            <Text style={styles.inputLabel}>Our Shop Image</Text>
            <TouchableOpacity style={styles.imageUploadBox} onPress={() => pickImage('ourShopImage')}>
                {getImageUri(aboutData.ourShopImage) ? (
                  <Image source={{ uri: getImageUri(aboutData.ourShopImage) }} style={styles.uploadedImage} />
                ) : (
                  <View style={styles.imageUploadPlaceholder}>
                    <Ionicons name="camera" size={40} color="#ec4899" />
                    <Text style={styles.imageUploadText}>Tap to Upload Photo</Text>
                  </View>
                )}
            </TouchableOpacity>
            
            <Text style={styles.inputLabel}>Our Promise</Text>
            <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                value={aboutData.promise}
                onChangeText={text => setAboutData(prev => ({ ...prev, promise: text }))}
                placeholder="The shop's promise to customers..."
                multiline
            />

            <Text style={styles.inputLabel}>Owner's Quote</Text>
            <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                value={aboutData.ownerQuote}
                onChangeText={text => setAboutData(prev => ({ ...prev, ownerQuote: text }))}
                placeholder="A quote from the owner..."
                multiline
            />

            <Text style={styles.inputLabel}>Owner's Picture</Text>
            <TouchableOpacity style={styles.imageUploadBox} onPress={() => pickImage('ownerImage')}>
                {getImageUri(aboutData.ownerImage) ? (
                  <Image source={{ uri: getImageUri(aboutData.ownerImage) }} style={styles.uploadedImage} />
                ) : (
                  <View style={styles.imageUploadPlaceholder}>
                    <Ionicons name="camera" size={40} color="#ec4899" />
                    <Text style={styles.imageUploadText}>Tap to Upload Photo</Text>
                  </View>
                )}
            </TouchableOpacity>

            <View style={styles.menuDivider} />
            <Text style={styles.sectionTitle}>Services</Text>

            <Text style={styles.inputLabel}>Custom Bouquets Description</Text>
            <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                value={aboutData.customBouquetsDescription}
                onChangeText={text => setAboutData(prev => ({ ...prev, customBouquetsDescription: text }))}
                placeholder="Description for custom bouquets service..."
                multiline
            />
            <Text style={styles.inputLabel}>Custom Bouquets Image</Text>
            <TouchableOpacity style={styles.imageUploadBox} onPress={() => pickImage('customBouquetsImage')}>
                {getImageUri(aboutData.customBouquetsImage) ? (
                  <Image source={{ uri: getImageUri(aboutData.customBouquetsImage) }} style={styles.uploadedImage} />
                ) : (
                  <View style={styles.imageUploadPlaceholder}>
                    <Ionicons name="camera" size={40} color="#ec4899" />
                    <Text style={styles.imageUploadText}>Tap to Upload Photo</Text>
                  </View>
                )}
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <Text style={styles.inputLabel}>Event Decorations Description</Text>
            <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                value={aboutData.eventDecorationsDescription}
                onChangeText={text => setAboutData(prev => ({ ...prev, eventDecorationsDescription: text }))}
                placeholder="Description for event decorations service..."
                multiline
            />
            <Text style={styles.inputLabel}>Event Decorations Image</Text>
            <TouchableOpacity style={styles.imageUploadBox} onPress={() => pickImage('eventDecorationsImage')}>
                {getImageUri(aboutData.eventDecorationsImage) ? (
                  <Image source={{ uri: getImageUri(aboutData.eventDecorationsImage) }} style={styles.uploadedImage} />
                ) : (
                  <View style={styles.imageUploadPlaceholder}>
                    <Ionicons name="camera" size={40} color="#ec4899" />
                    <Text style={styles.imageUploadText}>Tap to Upload Photo</Text>
                  </View>
                )}
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <Text style={styles.inputLabel}>Special Orders Description</Text>
            <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                value={aboutData.specialOrdersDescription}
                onChangeText={text => setAboutData(prev => ({ ...prev, specialOrdersDescription: text }))}
                placeholder="Description for special orders service..."
                multiline
            />

            <View style={styles.menuDivider} />
            <Text style={styles.sectionTitle}>Promises</Text>

            <Text style={styles.inputLabel}>Responsibly Sourced Description</Text>
            <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                value={aboutData.promises_responsibly_sourced_description}
                onChangeText={text => setAboutData(prev => ({ ...prev, promises_responsibly_sourced_description: text }))}
                placeholder="Description for responsibly sourced..."
                multiline
            />
            <Text style={styles.inputLabel}>Responsibly Sourced Image</Text>
            <TouchableOpacity style={styles.imageUploadBox} onPress={() => pickImage('promises_responsibly_sourced_image')}>
                {getImageUri(aboutData.promises_responsibly_sourced_image) ? (
                  <Image source={{ uri: getImageUri(aboutData.promises_responsibly_sourced_image) }} style={styles.uploadedImage} />
                ) : (
                  <View style={styles.imageUploadPlaceholder}>
                    <Ionicons name="camera" size={40} color="#ec4899" />
                    <Text style={styles.imageUploadText}>Tap to Upload Photo</Text>
                  </View>
                )}
            </TouchableOpacity>

            <Text style={styles.inputLabel}>Crafted by Experts Description</Text>
            <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                value={aboutData.promises_crafted_by_experts_description}
                onChangeText={text => setAboutData(prev => ({ ...prev, promises_crafted_by_experts_description: text }))}
                placeholder="Description for crafted by experts..."
                multiline
            />
            <Text style={styles.inputLabel}>Crafted by Experts Image</Text>
            <TouchableOpacity style={styles.imageUploadBox} onPress={() => pickImage('promises_crafted_by_experts_image')}>
                {getImageUri(aboutData.promises_crafted_by_experts_image) ? (
                  <Image source={{ uri: getImageUri(aboutData.promises_crafted_by_experts_image) }} style={styles.uploadedImage} />
                ) : (
                  <View style={styles.imageUploadPlaceholder}>
                    <Ionicons name="camera" size={40} color="#ec4899" />
                    <Text style={styles.imageUploadText}>Tap to Upload Photo</Text>
                  </View>
                )}
            </TouchableOpacity>

            <Text style={styles.inputLabel}>Caring for Moments Description</Text>
            <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                value={aboutData.promises_caring_for_moments_description}
                onChangeText={text => setAboutData(prev => ({ ...prev, promises_caring_for_moments_description: text }))}
                placeholder="Description for caring for moments..."
                multiline
            />
            <Text style={styles.inputLabel}>Caring for Moments Image</Text>
            <TouchableOpacity style={styles.imageUploadBox} onPress={() => pickImage('promises_caring_for_moments_image')}>
                {getImageUri(aboutData.promises_caring_for_moments_image) ? (
                  <Image source={{ uri: getImageUri(aboutData.promises_caring_for_moments_image) }} style={styles.uploadedImage} />
                ) : (
                  <View style={styles.imageUploadPlaceholder}>
                    <Ionicons name="camera" size={40} color="#ec4899" />
                    <Text style={styles.imageUploadText}>Tap to Upload Photo</Text>
                  </View>
                )}
            </TouchableOpacity>

            <TouchableOpacity style={[styles.addButton, {alignSelf: 'center', marginTop: 20}]} onPress={handleSave} disabled={isSaving}>
                <Text style={styles.addButtonText}>{isSaving ? 'Saving...' : 'Save Changes'}</Text>
            </TouchableOpacity>
        </ScrollView>
    );
};

// ==================== CONTACT TAB ====================
const ContactTab = () => {
    const [contactInfo, setContactInfo] = useState({
        address: '',
        phone: '',
        email: '',
        mapUrl: ''
    });
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const fetchContactInfo = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('app_content')
                .select('key, value')
                .in('key', ['contact_address', 'contact_phone', 'contact_email', 'contact_map_url']);

            if (error) throw error;

            const info = data.reduce((acc, { key, value }) => {
                if (key === 'contact_address') acc.address = value;
                if (key === 'contact_phone') acc.phone = value;
                if (key === 'contact_email') acc.email = value;
                if (key === 'contact_map_url') acc.mapUrl = value;
                return acc;
            }, { address: '', phone: '', email: '', mapUrl: '' });
            setContactInfo(info);
        } catch (error) {
            Alert.alert('Error fetching contact info', error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchContactInfo();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const updates = [
                { key: 'contact_address', value: contactInfo.address },
                { key: 'contact_phone', value: contactInfo.phone },
                { key: 'contact_email', value: contactInfo.email },
                { key: 'contact_map_url', value: contactInfo.mapUrl },
            ];

            const { data: existingKeysData, error: fetchError } = await supabase
              .from('app_content')
              .select('key')
              .in('key', updates.map(u => u.key));
            
            if(fetchError) throw fetchError;

            const existingKeys = existingKeysData.map(item => item.key);
            const toUpdate = updates.filter(u => existingKeys.includes(u.key));
            const toInsert = updates.filter(u => !existingKeys.includes(u.key) && u.value);

            if (toUpdate.length > 0) {
              for (const item of toUpdate) {
                const { error } = await supabase
                  .from('app_content')
                  .update({ value: item.value, updated_at: new Date().toISOString() })
                  .eq('key', item.key);
                if (error) throw new Error(`Failed to update ${item.key}: ${error.message}`);
              }
            }

            if (toInsert.length > 0) {
              const { error } = await supabase.from('app_content').insert(toInsert);
              if (error) throw new Error(`Failed to insert new keys: ${error.message}`);
            }

            Alert.alert('Success', 'Contact information has been updated.');
        } catch (error) {
            Alert.alert('Error saving contact info', error.message);
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return <ActivityIndicator style={{ marginTop: 20 }} size="large" color="#ec4899" />;
    }

    return (
        <ScrollView style={styles.tabContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.tabTitle}>Contact Page Settings</Text>
            
            <Text style={styles.inputLabel}>Address</Text>
            <TextInput
                style={styles.input}
                value={contactInfo.address}
                onChangeText={text => setContactInfo(prev => ({ ...prev, address: text }))}
                placeholder="Shop Address"
            />
            
            <Text style={styles.inputLabel}>Phone Number</Text>
            <TextInput
                style={styles.input}
                value={contactInfo.phone}
                onChangeText={text => setContactInfo(prev => ({ ...prev, phone: text }))}
                placeholder="Contact Phone"
                keyboardType="phone-pad"
            />

            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
                style={styles.input}
                value={contactInfo.email}
                onChangeText={text => setContactInfo(prev => ({ ...prev, email: text }))}
                placeholder="Contact Email"
                keyboardType="email-address"
                autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Google Maps URL (Embed)</Text>
            <TextInput
                style={[styles.input, { height: 120, textAlignVertical: 'top' }]}
                value={contactInfo.mapUrl}
                onChangeText={text => setContactInfo(prev => ({ ...prev, mapUrl: text }))}
                placeholder="Google Maps Embed URL"
                multiline
            />

            <TouchableOpacity style={[styles.addButton, {alignSelf: 'center', marginTop: 20}]} onPress={handleSave} disabled={isSaving}>
                <Text style={styles.addButtonText}>{isSaving ? 'Saving...' : 'Save Changes'}</Text>
            </TouchableOpacity>
        </ScrollView>
    );
};

// ==================== EMPLOYEES TAB ====================
const EmployeesTab = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('role', 'employee');

        if (error) {
            throw error;
        }
      setEmployees(data || []);
    } catch (error) {
      console.error('Error loading employees:', error);
      Alert.alert('Error', 'Failed to load employees.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!formData.name || !formData.email || !formData.password) {
      Alert.alert('Error', 'All fields are required');
      return;
    }
    if (formData.password.length < 6) {
        Alert.alert('Error', 'Password must be at least 6 characters long.');
        return;
    }

    setLoading(true);
    try {
      // 1. Create the user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            name: formData.name,
            role: 'employee', // Assign role in metadata
            phone: formData.phone,
          },
        },
      });

      if (authError) {
        throw authError;
      }

      if (!authData.user) {
          throw new Error("User was not created in authentication system.");
      }

      // 2. Insert the user into the public.users table
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          name: formData.name,
          email: formData.email,
          role: 'employee', // Explicitly set role in the table
          phone: formData.phone,
        });

      if (insertError) {
          // If insert fails, we should ideally delete the auth user to avoid orphans
          await supabase.auth.admin.deleteUser(authData.user.id);
          throw insertError;
      }

      let successMessage = 'Employee added successfully.';
      if (authData.user && !authData.session) {
        successMessage = 'Employee added successfully! Please check the employee\'s email to confirm their account.';
      }
      Alert.alert('Success', successMessage);
      setModalVisible(false);
      setFormData({ name: '', email: '', password: '', phone: '' });
      loadData();
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to add employee');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (employee) => {
    setEmployeeToDelete(employee);
    setDeleteModalVisible(true);
  };
  
  const confirmDelete = async () => {
    if (!employeeToDelete) return;
    
    setLoading(true);
    setDeleteModalVisible(false);

    try {
        const { error } = await supabase.rpc('delete_user', { user_id: employeeToDelete.id });

        if (error) {
            throw error;
        }

        Alert.alert('Success', 'Employee deleted successfully.');
        loadData();
    } catch (error) {
        Alert.alert('Error', error.message || 'Failed to delete employee.');
    } finally {
        setLoading(false);
        setEmployeeToDelete(null);
    }
  };

  return (
    <View style={styles.tabContent}>
      <Text style={styles.tabTitle}>Employee Management</Text>

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setModalVisible(true)}
      >
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.addButtonText}>Add Employee</Text>
      </TouchableOpacity>

      <FlatList
        data={employees}
        renderItem={({ item }) => (
          <View style={styles.stockCard}>
            <View style={styles.stockInfo}>
              <Text style={styles.stockName}>{item.name}</Text>
              <View style={{marginTop: 4}}>
                <Text style={styles.stockQuantity}>
                  <Text style={{fontWeight: 'bold'}}>Email: </Text>
                  {item.email}
                </Text>
                <Text style={styles.stockQuantity}>
                  <Text style={{fontWeight: 'bold'}}>Phone: </Text>
                  {item.phone}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: '#e0e0e0', alignSelf: 'flex-start', marginTop: 5 }]}>
                <Text style={{ fontSize: 10, color: '#666' }}>EMPLOYEE</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.deleteButtonSmall}
              onPress={() => handleDelete(item)}
            >
              <Ionicons name="trash-outline" size={20} color="#f44336" />
            </TouchableOpacity>
          </View>
        )}
        keyExtractor={(item) => item.id.toString()}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No employees found</Text>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Employee</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={styles.input}
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                placeholder="Employee Name"
              />

              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={formData.email}
                onChangeText={(text) => setFormData({ ...formData, email: text })}
                placeholder="Email Address"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Contact Number</Text>
              <TextInput
                style={styles.input}
                value={formData.phone}
                onChangeText={(text) => setFormData({ ...formData, phone: text })}
                placeholder="Contact Number"
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.input}
                value={formData.password}
                onChangeText={(text) => setFormData({ ...formData, password: text })}
                placeholder="Password"
                secureTextEntry
              />
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
                onPress={handleAdd}
                disabled={loading}
              >
                <Text style={styles.buttonText}>{loading ? 'Adding...' : 'Add Employee'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Delete Confirmation Modal */}
      <Modal visible={deleteModalVisible} animationType="fade" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Confirm Deletion</Text>
              <TouchableOpacity onPress={() => setDeleteModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalText}>Are you sure you want to delete the employee '{employeeToDelete?.name}'? This action is irreversible.</Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setDeleteModalVisible(false)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.deleteButton]}
                onPress={confirmDelete}
                disabled={loading}
              >
                <Text style={styles.buttonText}>{loading ? 'Deleting...' : 'Delete'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ==================== STYLES ====================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 50 : 20,
    backgroundColor: '#ec4899',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.9,
  },
  content: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingVertical: 8,
    paddingBottom: 40,
    height: 100,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 5,
  },
  navText: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  navTextActive: {
    color: '#ec4899',
    fontWeight: '600',
  },
  navBadge: {
    position: 'absolute',
    top: -5,
    right: 20,
    backgroundColor: 'red',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  navBadgeText: {
      color: 'white',
      fontSize: 12,
      fontWeight: 'bold',
  },
  tabContent: {
    flex: 1,
    padding: 15,
  },
  tabTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  addButton: {
    backgroundColor: '#ec4899',
    flexDirection: 'row',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
    marginTop: 5,
    color: '#333',
  },
  categoryScroll: {
    marginBottom: 20,
    maxHeight: 50, // Limit height so they don't grow too tall
  },
  categoryChip: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#e0e0e0',
    marginRight: 10,
    height: 40, // Fixed height for consistency
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryChipActive: {
    backgroundColor: '#ec4899',
  },
  categoryChipText: {
    color: '#666',
    fontSize: 14,
  },
  categoryChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  productCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 15,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden', // Ensures image corners are rounded
  },
  imageContainer: {
    width: '100%',
    height: 180,
    backgroundColor: '#f8f8f8',
  },
  productImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  productImagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  placeholderText: {
    color: '#999',
    marginTop: 5,
    fontSize: 12,
  },
  productInfo: {
    padding: 15,
  },
  productName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  productCategory: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ec4899',
  },
    productStock: {
      fontSize: 14,
      color: '#666',
      fontWeight: '500',
    },
    inputHelperText: {
      fontSize: 12,
      color: '#666',
      marginBottom: 5,
    },
    productDescription: {
      fontSize: 12,
      color: '#777',
      marginTop: 4,
      marginBottom: 5,
    },
  productActions: {
    flexDirection: 'row',
    gap: 10,
    padding: 15,
    paddingTop: 0, // Reduce top padding since info has bottom padding
  },
  editButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#3b82f6', // Blue
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#ef4444', // Red
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  orderHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  orderDateBadge: {
    fontSize: 11,
    color: '#fff',
    backgroundColor: '#ec4899',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    fontWeight: '600',
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  orderDate: {
    fontSize: 12,
    color: '#999',
  },
  orderCustomer: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    fontWeight: '500',
  },
  orderEmail: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  orderPhone: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  orderBadges: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  orderTotal: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  changeStatusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
  },
  changeStatusText: {
    color: '#2196F3',
    fontSize: 14,
    fontWeight: '600',
  },
  stockTabs: {
    flexDirection: 'row',
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  stockTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 5,
  },
  stockTabActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#ec4899',
  },
  stockTabText: {
    fontSize: 14,
    color: '#666',
  },
  stockTabTextActive: {
    color: '#ec4899',
    fontWeight: '600',
  },
  stockCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 1,
  },
  stockInfo: {
    flex: 1,
  },
  stockName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  stockPrice: {
    fontSize: 14,
    color: '#ec4899',
    marginBottom: 5,
  },
  stockAvailability: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  availabilityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stockAvailabilityText: {
    fontSize: 12,
    color: '#666',
  },
  stockActions: {
    flexDirection: 'row',
    gap: 10,
  },
  editButtonSmall: {
    padding: 8,
  },
  deleteButtonSmall: {
    padding: 8,
  },
  notificationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    elevation: 1,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  notificationDate: {
    fontSize: 12,
    color: '#999',
  },
  deleteIconButton: {
    padding: 5,
  },
  conversationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 1,
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#ffe0f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
  },
  conversationContent: {
    flex: 1,
  },
  conversationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  conversationMessage: {
    fontSize: 14,
    color: '#666',
  },
  conversationMeta: {
    alignItems: 'flex-end',
  },
  conversationDate: {
    fontSize: 12,
    color: '#999',
    marginBottom: 5,
  },
  unreadBadge: {
    backgroundColor: '#ec4899',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    marginTop: 50,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    width: '90%',
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  modalCategoryChip: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  modalCategoryChipActive: {
    backgroundColor: '#ec4899',
    borderColor: '#ec4899',
  },
  modalCategoryChipText: {
    fontSize: 14,
    color: '#666',
  },
  modalCategoryChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  imageUploadBox: {
    height: 200,
    borderWidth: 2,
    borderColor: '#ec4899',
    borderStyle: 'dashed',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff0f5',
    marginBottom: 15,
    overflow: 'hidden',
  },
  uploadedImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  imageUploadPlaceholder: {
    alignItems: 'center',
  },
  imageUploadText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ec4899',
    marginTop: 10,
  },
  imageUploadSubtext: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  takePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#ec4899',
    borderRadius: 8,
    marginBottom: 20,
    gap: 8,
  },
  takePhotoText: {
    color: '#ec4899',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  modalButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  notificationDate: {
    fontSize: 12,
    color: '#999',
  },
  deleteIconButton: {
    padding: 5,
  },
  conversationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 1,
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#ffe0f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
  },
  conversationContent: {
    flex: 1,
  },
  conversationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  conversationMessage: {
    fontSize: 14,
    color: '#666',
  },
  conversationMeta: {
    alignItems: 'flex-end',
  },
  conversationDate: {
    fontSize: 12,
    color: '#999',
    marginBottom: 5,
  },
  unreadBadge: {
    backgroundColor: '#ec4899',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    marginTop: 50,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    width: '90%',
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  modalCategoryChip: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  modalCategoryChipActive: {
    backgroundColor: '#ec4899',
    borderColor: '#ec4899',
  },
  modalCategoryChipText: {
    fontSize: 14,
    color: '#666',
  },
  modalCategoryChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  imageUploadBox: {
    height: 200,
    borderWidth: 2,
    borderColor: '#ec4899',
    borderStyle: 'dashed',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff0f5',
    marginBottom: 15,
    overflow: 'hidden',
  },
  uploadedImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  imageUploadPlaceholder: {
    alignItems: 'center',
  },
  imageUploadText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ec4899',
    marginTop: 10,
  },
  imageUploadSubtext: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  takePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#ec4899',
    borderRadius: 8,
    marginBottom: 20,
    gap: 8,
  },
  takePhotoText: {
    color: '#ec4899',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  modalButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
  },
  saveButton: {
    backgroundColor: '#ec4899',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start',
  },
  menuContainer: {
    width: '70%',
    height: '100%',
    backgroundColor: '#fff',
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 50 : 40,
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  menuTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  menuItemText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 15,
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 10,
  },
  dropdownInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  dropdownInputText: {
    fontSize: 16,
    color: '#333',
  },
  categoryPickerItem: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  categoryPickerItemText: {
    fontSize: 16,
    color: '#333',
  },
  // New styles for enhanced order display
  orderTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff0f5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    alignSelf: 'flex-start',
    marginBottom: 12,
    gap: 5,
  },
  orderTypeText: {
    color: '#ec4899',
    fontSize: 13,
    fontWeight: '600',
  },
  orderSection: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    flex: 1,
  },
  orderPhone: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  addressContainer: {
    backgroundColor: '#f8f9fa',
    padding: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  addressRecipient: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  addressPhone: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
  },
  addressText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  pickupText: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
  },
  itemText: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  viewReceiptButton: {
    color: '#2196F3', // A standard blue for links/actions
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 10,
  },
  pricingSection: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  priceLabel: {
    fontSize: 13,
    color: '#666',
  },
  priceValue: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    paddingTop: 8,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ec4899',
  },
  stockQuantity: {
    fontSize: 14,
    color: '#666',
  },
  switchStatusText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 10,
    fontWeight: '600',
  },
  // Sales Tab Styles
  salesSummaryContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 15,
  },
  salesCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  salesCardValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 10,
    marginBottom: 5,
  },
  salesCardLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  quickStatsContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
      sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: '#333',
      marginBottom: 20,
    },  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  statRowTotal: {
    borderBottomWidth: 0,
    borderTopWidth: 2,
    borderTopColor: '#ec4899',
    paddingTop: 12,
    marginTop: 8,
  },
  statLabelTotal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  statValueTotal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ec4899',
  },
  saleCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  saleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  saleOrderNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  saleCustomer: {
    fontSize: 13,
    color: '#666',
  },
  saleRight: {
    alignItems: 'flex-end',
  },
  saleAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 5,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  saleDate: {
    fontSize: 12,
    color: '#999',
  },
  // Requests Tab Styles
  requestCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  requestType: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ec4899',
  },
  requestCustomer: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  requestDate: {
    fontSize: 12,
    color: '#999',
    marginBottom: 10,
  },
  requestPreviewImageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 8,
    borderRadius: 8,
    gap: 10,
  },
  requestPreviewImage: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: '#ddd',
  },
  viewDetailsText: {
    fontSize: 13,
    color: '#2196F3',
    fontWeight: '500',
  },
  // Messaging Tab Styles
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  chatAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#ffe0f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
  },
  chatAvatarText: {
    color: '#ec4899',
    fontSize: 18,
    fontWeight: 'bold',
  },
  chatPreview: {
    flex: 1,
  },
  chatName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  chatMessage: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  chatTime: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
  },
  chatNameUnread: {
    fontWeight: 'bold',
  },
  chatMessageUnread: {
    color: '#333',
    fontWeight: 'bold',
  },
  chatMeta: {
    alignItems: 'flex-end',
  },
  unreadBadge: {
    backgroundColor: '#ec4899',
    borderRadius: 10,
    height: 20,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  chatHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  chatMessagesContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  chatInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  chatInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#f0f2f5',
    borderRadius: 20,
    paddingHorizontal: 15,
    marginRight: 10,
    fontSize: 16,
    color: '#333',
  },
  chatSendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageWrapper: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'flex-end',
  },
  messageSentWrapper: {
    justifyContent: 'flex-end',
  },
  messageReceivedWrapper: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 18,
  },
  messageSentBubble: {
    backgroundColor: '#ec4899',
    borderBottomRightRadius: 4,
  },
  messageReceivedBubble: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  messageTextSent: {
    color: '#fff',
    fontSize: 15,
  },
  messageTextReceived: {
    color: '#333',
    fontSize: 15,
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  messageTimeSent: {
    color: '#fff',
    opacity: 0.7,
  },
  messageTimeReceived: {
    color: '#999',
  },
  messageAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  detailSection: {
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 10,
  },
  detailLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  imageSection: {
    marginBottom: 20,
  },
  fullImage: {
    width: '100%',
    height: 300,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#F44336',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: '600',
  },
  radioGroup: {
    marginBottom: 20,
  },
  radioButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  radioButton: {
    height: 24,
    width: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
  },
  radioButtonSelected: {
    borderColor: '#ec4899',
  },
  radioButtonInner: {
    height: 12,
    width: 12,
    borderRadius: 6,
    backgroundColor: '#ec4899',
  },
  radioLabel: {
    fontSize: 16,
    color: '#333',
  },
  receiptImage: { // Add this style
    width: '100%',
    height: 400, // Adjust height as needed
    backgroundColor: '#eee', // Placeholder background
  },
  riderSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f2f5',
    borderRadius: 12,
    paddingHorizontal: 10,
    marginTop: 15,
    marginBottom: 6,
  },
  riderSearchIcon: {
    marginRight: 8,
  },
  riderSearchInput: {
    flex: 1,
    height: 40,
    fontSize: 16,
    color: '#333',
  },
  riderName: {
    fontSize: 16,
    fontWeight: '600',
  },
  riderEmail: {
    fontSize: 14,
    color: '#666',
  },
  // Re-define changeStatusButton to ensure proper styling
  changeStatusButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 15,
    borderRadius: 8,
    backgroundColor: '#2196F3', // Example blue background
  },
  // Ensure changeStatusText is applied correctly
  changeStatusText: {
    color: '#fff', // White text for the blue background
    fontSize: 14,
    fontWeight: '600',
  },
  // Styles for Enhanced Orders Tab
  eoContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB', // gray-50
  },
  eoTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937', // gray-800
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  eoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginVertical: 8,
    overflow: 'hidden',
    borderLeftWidth: 4,
    borderLeftColor: '#ec4899', // pink-500
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { "width": 0, "height": 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  eoCardHeader: {
    backgroundColor: '#FEF2F7', // Lighter pink/purple mix
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: '#F3F4F6',
  },
  eoLabel: {
    fontSize: 12,
    color: '#6B7280', // gray-500
    marginBottom: 2,
  },
  eoOrderId: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  eoDateBadge: {
    backgroundColor: '#ec4899',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 8,
  },
  eoDateText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  eoStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eoStatusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  eoProgressSection: {
    padding: 16,
    paddingTop: 8,
    backgroundColor: '#FEF2F7',
  },
  eoProgressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  eoProgressLabel: {
    fontSize: 12,
    color: '#4B5567',
  },
  eoProgressBarBg: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  eoProgressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  eoSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#F3F4F6',
  },
  eoCustomerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  eoAvatarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  eoAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#A78BFA', // purple-400
    justifyContent: 'center',
    alignItems: 'center',
  },
  eoAvatarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  eoCustomerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  eoActionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  eoIconBtnGreen: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#22C55E',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  eoIconBtnBlue: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  eoContactInfo: {
    gap: 8,
    marginTop: 4,
  },
  eoInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eoInfoText: {
    fontSize: 14,
    color: '#4B5567',
    flex: 1,
  },
  eoDetailText: {
    fontSize: 14,
    color: '#4B5567',
  },
  eoInfoTextBold: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '600',
  },
  eoSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  eoSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  eoItemCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  eoItemImage: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#FBCFE8', // pink-200
    justifyContent: 'center',
    alignItems: 'center',
  },
  eoItemName: {
    fontWeight: '500',
    color: '#1F2937',
  },
  eoItemQuantity: {
    fontSize: 12,
    color: '#6B7280',
  },
  eoItemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DB2777', // pink-600
    marginTop: 4,
  },
  eoInstructions: {
      marginTop: 12,
      backgroundColor: '#EFF6FF', // blue-50
      borderColor: '#BFDBFE', // blue-200
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
  },
  eoInstructionsTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: '#1E40AF', // blue-800
      marginBottom: 4,
  },
  eoInstructionsText: {
      fontSize: 12,
      color: '#1D4ED8', // blue-700
  },
  eoFlexBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eoPaymentStatus: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  eoPaymentStatusText: {
    color: '#fff', // Changed to white as requested
    fontSize: 12,
    fontWeight: '500',
  },
  eoViewReceipt: {
    color: '#3B82F6', // Matched with delivery badge color
    fontWeight: '600',
    fontSize: 14,
  },
  eoDivider: {
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
    paddingTop: 12,
    marginTop: 12,
  },
  eoPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  eoTotalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  eoTotalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#DB2777', // pink-600
  },
  eoFooter: {
    backgroundColor: '#F9FAFB',
    padding: 16,
  },
  eoMainBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { "width": 0, "height": 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  eoMainBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  
  // New Status Modal Styles
  statusModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  statusModalContainer: {
    backgroundColor: 'white',
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { "width": 0, "height": 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
    width: '100%',
    maxWidth: 400,
    overflow: 'hidden',
  },
  statusModalHeader: {
    backgroundColor: '#8B5CF6', // purple-500
    padding: 16,
  },
  statusModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  timelineOrderNumber: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 24,
  },
  statusModalScrollView: {
    maxHeight: 400,
    padding: 16,
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#F3F4F6',
  },
  statusOptionSelected: {
    backgroundColor: '#ec4899', // pink-500
    elevation: 4,
  },
  statusOptionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  statusModalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    gap: 8,
  },
  statusConfirmButton: {
    backgroundColor: '#ec4899',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    flex: 1,
  },
  statusConfirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusCloseButton: {
    backgroundColor: '#FBCFE8', // Light pink/purple
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    flex: 1,
  },
  statusCloseButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Timeline Modal Styles
  timelineModalContainer: {
    backgroundColor: '#F9FAFB', // gray-50
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
    width: '100%',
    maxWidth: 400,
    overflow: 'hidden',
  },
  timelineScrollView: {
    maxHeight: 500,
    padding: 24,
  },
  timelineStepContainer: {
    position: 'relative',
  },
  timelineStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    paddingBottom: 24,
  },
  timelineIconContainer: {
    position: 'relative',
    zIndex: 10,
    flexShrink: 0,
  },
  timelineCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E5E7EB', // gray-200
  },
  timelineCirclePast: {
    backgroundColor: '#10B981', // emerald-500
  },
  timelineCircleSelected: {
    backgroundColor: '#ec4899', // pink-500
    transform: [{ scale: 1.1 }],
    elevation: 5,
  },
  timelineCircleText: {
    color: '#6B7280',
    fontWeight: '600',
  },
  timelineLine: {
    position: 'absolute',
    left: 19.5,
    top: 40,
    bottom: -16, // Adjust to connect properly
    width: 2,
    backgroundColor: '#E5E7EB', // gray-200
  },
  timelineLineActive: {
    backgroundColor: '#F472B6', // pink-300
  },
  timelineTextContainer: {
    flex: 1,
    paddingTop: 4,
  },
  timelineLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 2,
  },
  timelineLabelPast: {
    color: '#059669', // emerald-600
  },
  timelineLabelSelected: {
    color: '#DB2777', // pink-600
  },
  timelineDescription: {
    fontSize: 14,
    color: '#6B7280',
  },
  timelineDescriptionSelected: {
    color: '#ec4899', // pink-500
  },
  timelineActions: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
  },
  timelineCancelButton: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#FEE2E2', // red-50
  },
  timelineCancelButtonSelected: {
    backgroundColor: '#EF4444', // red-500
  },
  timelineCancelButtonText: {
    color: '#EF4444',
    fontWeight: '600',
  },
  eoDeliveryTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  eoDeliveryTypeBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  timelinePathSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  timelinePathButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  timelinePathButtonActive: {
    backgroundColor: '#3B82F6', // Default to delivery blue
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  timelinePathText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  timelinePathTextActive: {
    color: '#fff',
  },
});

export default AdminDashboard;

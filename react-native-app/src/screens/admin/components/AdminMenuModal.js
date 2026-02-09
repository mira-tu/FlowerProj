import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from '../../AdminDashboard.styles';

const AdminMenuModal = ({ visible, onClose, setActiveTab, currentUser, onLogoutPress }) => (
  <Modal
    visible={visible}
    transparent={true}
    animationType="fade"
    onRequestClose={onClose}
  >
    <TouchableOpacity
      style={styles.menuOverlay}
      activeOpacity={1}
      onPress={onClose}
    >
      <View style={styles.menuContainer}>
        <View style={styles.menuHeader}>
          <Text style={styles.menuTitle}>Menu</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#333" />
          </TouchableOpacity>
        </View>

        <ScrollView>
          <TouchableOpacity style={styles.menuItem} onPress={() => { setActiveTab('catalogue'); onClose(); }}>
            <Ionicons name="flower-outline" size={20} color="#ec4899" />
            <Text style={styles.menuItemText}>Catalogue</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => { setActiveTab('orders'); onClose(); }}>
            <Ionicons name="cart-outline" size={20} color="#333" />
            <Text style={styles.menuItemText}>Orders</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => { setActiveTab('requests'); onClose(); }}>
            <Ionicons name="calendar-outline" size={20} color="#333" />
            <Text style={styles.menuItemText}>Requests & Bookings</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => { setActiveTab('stock'); onClose(); }}>
            <Ionicons name="cube-outline" size={20} color="#333" />
            <Text style={styles.menuItemText}>Stock</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => { setActiveTab('notifications'); onClose(); }}>
            <Ionicons name="notifications-outline" size={20} color="#333" />
            <Text style={styles.menuItemText}>Notifications</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => { setActiveTab('messaging'); onClose(); }}>
            <Ionicons name="chatbubbles-outline" size={20} color="#333" />
            <Text style={styles.menuItemText}>Messaging</Text>
          </TouchableOpacity>

          {currentUser?.role === 'admin' && (
            <TouchableOpacity style={styles.menuItem} onPress={() => { setActiveTab('sales'); onClose(); }}>
              <Ionicons name="cash-outline" size={20} color="#333" />
              <Text style={styles.menuItemText}>Sales</Text>
            </TouchableOpacity>
          )}

          {currentUser?.role === 'admin' && (
            <>
              <View style={styles.menuDivider} />

              <TouchableOpacity style={styles.menuItem} onPress={() => { setActiveTab('about'); onClose(); }}>
                <Ionicons name="information-circle-outline" size={20} color="#333" />
                <Text style={styles.menuItemText}>About</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={() => { setActiveTab('contact'); onClose(); }}>
                <Ionicons name="call-outline" size={20} color="#333" />
                <Text style={styles.menuItemText}>Contact</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={() => { setActiveTab('employees'); onClose(); }}>
                <Ionicons name="people-outline" size={20} color="#333" />
                <Text style={styles.menuItemText}>Employees</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.menuDivider} />

          <TouchableOpacity
            style={styles.menuItem}
            onPress={onLogoutPress}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={20} color="#f44336" />
            <Text style={[styles.menuItemText, { color: '#f44336' }]}>Logout</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </TouchableOpacity>
  </Modal>
);

export default AdminMenuModal;

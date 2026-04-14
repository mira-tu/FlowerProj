import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from '../../AdminDashboard.styles';

const MAIN_MENU_ITEMS = [
  { tab: 'catalogue', icon: 'flower-outline', label: 'Catalogue', color: '#ec4899' },
  { tab: 'orders', icon: 'cart-outline', label: 'Orders' },
  { tab: 'requests', icon: 'calendar-outline', label: 'Requests' },
  { tab: 'stock', icon: 'cube-outline', label: 'Stock' },
  { tab: 'fees', icon: 'cash-outline', label: 'Delivery Fees' },
  { tab: 'messaging', icon: 'chatbubbles-outline', label: 'Messaging' },
  { tab: 'notifications', icon: 'notifications-outline', label: 'Notifications' },
];

const ADMIN_MENU_ITEMS = [
  { tab: 'sales', icon: 'cash-outline', label: 'Sales' },
  { tab: 'about', icon: 'information-circle-outline', label: 'About', groupStart: true },
  { tab: 'customOrder', icon: 'color-wand-outline', label: 'Custom Order' },
  { tab: 'contact', icon: 'call-outline', label: 'Contact' },
  { tab: 'employees', icon: 'people-outline', label: 'Employees' },
];

const MenuItem = ({ icon, label, onPress, color = '#333', textStyle }) => (
  <TouchableOpacity style={styles.menuItem} onPress={onPress}>
    <Ionicons name={icon} size={20} color={color} />
    <Text style={[styles.menuItemText, textStyle]}>{label}</Text>
  </TouchableOpacity>
);

const AdminMenuModal = ({ visible, onClose, setActiveTab, currentUser, onLogoutPress }) => {
  const isAdmin = currentUser?.role === 'admin';
  const displayName = currentUser?.name || 'Staff User';

  const selectTab = (tab) => {
    setActiveTab(tab);
    onClose();
  };

  return (
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
            <View style={styles.menuProfileCard}>
              <View style={styles.menuProfileInfo}>
                <Text style={styles.menuProfileName} numberOfLines={1}>
                  {displayName}
                </Text>
              </View>
            </View>

            <View style={styles.menuDivider} />

            {MAIN_MENU_ITEMS.map((item) => (
              <MenuItem
                key={item.tab}
                icon={item.icon}
                label={item.label}
                color={item.color}
                onPress={() => selectTab(item.tab)}
              />
            ))}

            {isAdmin && ADMIN_MENU_ITEMS.map((item) => (
              <React.Fragment key={item.tab}>
                {item.groupStart && <View style={styles.menuDivider} />}
                <MenuItem
                  icon={item.icon}
                  label={item.label}
                  onPress={() => selectTab(item.tab)}
                />
              </React.Fragment>
            ))}

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
};

export default AdminMenuModal;

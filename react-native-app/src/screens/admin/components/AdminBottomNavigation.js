import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from '../../AdminDashboard.styles';

const AdminBottomNavigation = ({ activeTab, setActiveTab, unreadMessageCount, setUnreadMessageCount }) => (
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
);

export default AdminBottomNavigation;

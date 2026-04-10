import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from '../../AdminDashboard.styles';

const NAV_ITEMS = [
  { tab: 'catalogue', icon: 'flower', label: 'Catalog..' },
  { tab: 'orders', icon: 'cart', label: 'Orders' },
  { tab: 'stock', icon: 'cube', label: 'Stock' },
  { tab: 'messaging', icon: 'chatbubbles', label: 'Messagi..', showsBadge: true },
  { tab: 'fees', icon: 'cash', label: 'Fees' },
];

const AdminBottomNavigation = ({ activeTab, setActiveTab, unreadMessageCount, setUnreadMessageCount }) => {
  const openTab = (tab) => {
    setActiveTab(tab);
    if (tab === 'messaging') {
      setUnreadMessageCount?.(0);
    }
  };

  return (
    <View style={styles.bottomNav}>
      {NAV_ITEMS.map((item) => {
        const isActive = activeTab === item.tab;

        return (
          <TouchableOpacity
            key={item.tab}
            style={styles.navItem}
            onPress={() => openTab(item.tab)}
          >
            <Ionicons
              name={item.icon}
              size={24}
              color={isActive ? '#ec4899' : '#999'}
            />
            {item.showsBadge && unreadMessageCount > 0 && (
              <View style={styles.navBadge}>
                <Text style={styles.navBadgeText}>{unreadMessageCount}</Text>
              </View>
            )}
            <Text style={[styles.navText, isActive && styles.navTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export default AdminBottomNavigation;

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from '../../AdminDashboard.styles';

const AdminHeader = ({ onMenuPress, onNotificationsPress, unreadNotificationCount = 0 }) => {

  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onMenuPress}>
        <Ionicons name="menu" size={28} color="#fff" />
      </TouchableOpacity>

      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle}>Joccery's Flower Shop</Text>
      </View>

      <View style={styles.headerActions}>
        <TouchableOpacity
          style={styles.headerIconButton}
          onPress={onNotificationsPress}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="notifications-outline" size={26} color="#fff" />
          {unreadNotificationCount > 0 && (
            <View style={styles.headerIconBadge}>
              <Text style={styles.headerIconBadgeText}>
                {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default AdminHeader;

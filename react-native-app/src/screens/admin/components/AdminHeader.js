import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from '../../AdminDashboard.styles';

const getRoleLabel = (role) => {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (normalizedRole === 'admin') return 'Admin';
  if (normalizedRole === 'employee') return 'Employee';
  return normalizedRole ? normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1) : '';
};

const AdminHeader = ({ currentUser, onMenuPress, onNotificationsPress, unreadNotificationCount = 0 }) => {
  const role = String(currentUser?.role || '').trim().toLowerCase();
  const isAdmin = role === 'admin';
  const roleLabel = getRoleLabel(role);

  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onMenuPress}>
        <Ionicons name="menu" size={28} color="#fff" />
      </TouchableOpacity>

      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle}>Joccery's Flower Shop</Text>
        {roleLabel ? (
          <View style={[
            styles.headerRoleBadge,
            isAdmin ? styles.headerRoleBadgeAdmin : styles.headerRoleBadgeEmployee,
          ]}>
            <Text style={[
              styles.headerRoleBadgeText,
              isAdmin ? styles.headerRoleBadgeTextAdmin : styles.headerRoleBadgeTextEmployee,
            ]}>
              {roleLabel}
            </Text>
          </View>
        ) : null}
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

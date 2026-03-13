import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from '../../AdminDashboard.styles';

const getRoleLabel = (role) => {
  if (role === 'employee') return 'Employee';
  if (role === 'admin') return 'Admin';
  return 'Staff';
};

const AdminHeader = ({ currentUser, onMenuPress, onNotificationsPress, unreadNotificationCount = 0 }) => {
  const roleLabel = getRoleLabel(currentUser?.role);
  const workspaceLabel = `${roleLabel} Workspace`;
  const displayName = currentUser?.name || currentUser?.email || 'Signed in';
  const isEmployee = currentUser?.role === 'employee';

  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onMenuPress}>
        <Ionicons name="menu" size={28} color="#fff" />
      </TouchableOpacity>

      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle}>Joccery's Flower Shop</Text>
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {`${displayName} - ${workspaceLabel}`}
        </Text>
        <View
          style={[
            styles.headerRoleBadge,
            isEmployee ? styles.headerRoleBadgeEmployee : styles.headerRoleBadgeAdmin,
          ]}
        >
          <Text
            style={[
              styles.headerRoleBadgeText,
              isEmployee ? styles.headerRoleBadgeTextEmployee : styles.headerRoleBadgeTextAdmin,
            ]}
          >
            {roleLabel}
          </Text>
        </View>
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

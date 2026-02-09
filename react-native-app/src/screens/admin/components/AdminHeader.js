import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from '../../AdminDashboard.styles';

const AdminHeader = ({ onMenuPress, onLogoutPress }) => (
  <View style={styles.header}>
    <TouchableOpacity onPress={onMenuPress}>
      <Ionicons name="menu" size={28} color="#fff" />
    </TouchableOpacity>

    <View style={styles.headerCenter}>
      <Text style={styles.headerTitle}>Joccery's Flower Shop</Text>
      <Text style={styles.headerSubtitle}>Admin Dashboard</Text>
    </View>

    <TouchableOpacity onPress={onLogoutPress} activeOpacity={0.7} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
      <Ionicons name="log-out-outline" size={28} color="#fff" />
    </TouchableOpacity>
  </View>
);

export default AdminHeader;

// AdminDashboard.js - Complete Version with Full UI + API Integration
// Restored all features from original design

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { authAPI } from '../config/api';
import { supabase } from '../config/supabase';
import AdminBottomNavigation from './admin/components/AdminBottomNavigation';
import AdminHeader from './admin/components/AdminHeader';
import AdminMenuModal from './admin/components/AdminMenuModal';
import LogoutConfirmModal from './admin/components/LogoutConfirmModal';
import AboutTab from './admin/tabs/AboutTab';
import CatalogueTab from './admin/tabs/CatalogueTab';
import ContactTab from './admin/tabs/ContactTab';
import EmployeesTab from './admin/tabs/EmployeesTab';
import MessagingTab from './admin/tabs/MessagingTab';
import DeliveryFeesTab from './admin/tabs/DeliveryFeesTab';
import OrdersTab from './admin/tabs/OrdersTab';
import RequestsTab from './admin/tabs/RequestsTab';
import SalesTab from './admin/tabs/SalesTab';
import StockTab from './admin/tabs/StockTab';
import styles from './AdminDashboard.styles';

const AdminDashboard = () => {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState('catalogue');
  const [menuVisible, setMenuVisible] = useState(false);
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [customerToMessage, setCustomerToMessage] = useState(null);

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

    fetchUnreadCount();

    const channel = supabase.channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        fetchUnreadCount();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  const performLogout = async () => {
    try {
      await authAPI.logout();
      await AsyncStorage.removeItem('currentUser');
      await AsyncStorage.removeItem('token');
    } catch (e) {
      console.warn('Logout cleanup error:', e);
    }
    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  };

  const showLogoutConfirm = () => setLogoutConfirmVisible(true);

  const renderTabContent = () => {
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
      case 'fees':
        return <DeliveryFeesTab />;
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
      <AdminHeader onMenuPress={() => setMenuVisible(true)} onLogoutPress={showLogoutConfirm} />

      <View style={styles.content}>
        {renderTabContent()}
      </View>

      <AdminBottomNavigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        unreadMessageCount={unreadMessageCount}
        setUnreadMessageCount={setUnreadMessageCount}
      />

      <AdminMenuModal
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onLogoutPress={() => {
          setMenuVisible(false);
          setTimeout(() => setLogoutConfirmVisible(true), 300);
        }}
      />

      <LogoutConfirmModal
        visible={logoutConfirmVisible}
        onClose={() => setLogoutConfirmVisible(false)}
        onConfirm={() => {
          setLogoutConfirmVisible(false);
          performLogout();
        }}
      />
    </SafeAreaView>
  );
};

export default AdminDashboard;

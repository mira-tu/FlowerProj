import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Text,
  View,
} from 'react-native';
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
import CustomOrderTab from './admin/tabs/CustomOrderTab';
import EmployeesTab from './admin/tabs/EmployeesTab';
import MessagingTab from './admin/tabs/MessagingTab';
import NotificationsTab from './admin/tabs/NotificationsTab';
import DeliveryFeesTab from './admin/tabs/DeliveryFeesTab';
import OrdersTab from './admin/tabs/OrdersTab';
import RequestsTab from './admin/tabs/RequestsTab';
import SalesTab from './admin/tabs/SalesTab';
import StockTab from './admin/tabs/StockTab';
import styles from './AdminDashboard.styles';

const EMPLOYEE_RESTRICTED_TABS = new Set(['sales', 'about', 'contact', 'employees', 'customOrder']);

const AdminDashboard = () => {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState('catalogue');
  const [menuVisible, setMenuVisible] = useState(false);
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [customerToMessage, setCustomerToMessage] = useState(null);
  const [focusedEntityTarget, setFocusedEntityTarget] = useState(null);

  const goToLogin = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  };

  const refreshUnreadNotificationCount = async (userId = currentUser?.id) => {
    if (!userId) return;

    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) throw error;
      setUnreadNotificationCount(count || 0);
    } catch (error) {
      console.error('Error fetching unread notification count:', error);
    }
  };

  useEffect(() => {
    let isActive = true;

    const syncCurrentUser = async () => {
      setLoading(true);
      try {
        const response = await authAPI.getMe();
        const user = response?.data ?? null;

        if (!isActive) {
          return;
        }

        if (!user) {
          setCurrentUser(null);
          goToLogin();
          return;
        }

        if (user.role !== 'admin' && user.role !== 'employee') {
          Alert.alert('Access Denied', 'You do not have permission to access this page');
          setCurrentUser(null);
          goToLogin();
          return;
        }

        setCurrentUser(user);
      } catch (error) {
        console.error('Error checking user:', error);
        if (isActive) {
          setCurrentUser(null);
          goToLogin();
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    syncCurrentUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isActive) {
        return;
      }

      if (!session) {
        setCurrentUser(null);
        setLoading(false);
        goToLogin();
        return;
      }

      syncCurrentUser();
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
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

  useEffect(() => {
    if (!currentUser?.id) return;

    refreshUnreadNotificationCount(currentUser.id);

    const channel = supabase.channel(`public:notifications:${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUser.id}`,
        },
        () => {
          refreshUnreadNotificationCount(currentUser.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id]);

  const performLogout = async () => {
    try {
      await authAPI.logout();
    } catch (e) {
      console.warn('Logout cleanup error:', e);
    }
    goToLogin();
  };

  const handleSelectCustomerForMessage = (customer) => {
    setCustomerToMessage(customer);
    setActiveTab('messaging');
  };

  const renderTabContent = () => {
    const isRestrictedEmployeeTab = currentUser?.role === 'employee'
      && EMPLOYEE_RESTRICTED_TABS.has(activeTab);

    if (isRestrictedEmployeeTab) {
      return <CatalogueTab handleSelectCustomerForMessage={handleSelectCustomerForMessage} />;
    }

    switch (activeTab) {
      case 'catalogue':
        return <CatalogueTab handleSelectCustomerForMessage={handleSelectCustomerForMessage} />;
      case 'orders':
        return (
          <OrdersTab
            currentUser={currentUser}
            setActiveTab={setActiveTab}
            handleSelectCustomerForMessage={handleSelectCustomerForMessage}
            focusedEntityTarget={focusedEntityTarget}
            clearFocusedEntityTarget={() => setFocusedEntityTarget(null)}
          />
        );
      case 'stock':
        return <StockTab handleSelectCustomerForMessage={handleSelectCustomerForMessage} />;
      case 'requests':
        return (
          <RequestsTab
            currentUser={currentUser}
            setActiveTab={setActiveTab}
            handleSelectCustomerForMessage={handleSelectCustomerForMessage}
            focusedEntityTarget={focusedEntityTarget}
            clearFocusedEntityTarget={() => setFocusedEntityTarget(null)}
          />
        );
      case 'fees':
        return <DeliveryFeesTab />;
      case 'messaging':
        return (
          <MessagingTab
            currentUser={currentUser}
            customerToMessage={customerToMessage}
            setCustomerToMessage={setCustomerToMessage}
            setActiveTab={setActiveTab}
            setFocusedEntityTarget={setFocusedEntityTarget}
          />
        );
      case 'notifications':
        return (
          <NotificationsTab
            currentUser={currentUser}
            setActiveTab={setActiveTab}
            setFocusedEntityTarget={setFocusedEntityTarget}
            refreshUnreadCount={() => refreshUnreadNotificationCount(currentUser?.id)}
          />
        );
      case 'sales':
        return <SalesTab />;
      case 'about':
        return <AboutTab />;
      case 'customOrder':
        return <CustomOrderTab handleSelectCustomerForMessage={handleSelectCustomerForMessage} />;
      case 'contact':
        return <ContactTab />;
      case 'employees':
        return <EmployeesTab />;
      default:
        return <CatalogueTab handleSelectCustomerForMessage={handleSelectCustomerForMessage} />;
    }
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
      <AdminHeader
        currentUser={currentUser}
        onMenuPress={() => setMenuVisible(true)}
        onNotificationsPress={() => setActiveTab('notifications')}
        unreadNotificationCount={unreadNotificationCount}
      />

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

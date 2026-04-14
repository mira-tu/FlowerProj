import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AdminDashboard from './src/screens/AdminDashboard';
import LoginScreen from './src/screens/LoginScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import { authAPI } from './src/config/api';
import { supabase } from './src/config/supabase';
import { Linking } from 'react-native';
import Toast, { BaseToast, ErrorToast } from 'react-native-toast-message';

const toastConfig = {
  success: (props) => (
    <BaseToast
      {...props}
      style={{ borderLeftColor: '#22C55E', backgroundColor: '#F0FDF4', borderRadius: 12, height: 'auto', paddingVertical: 12, paddingHorizontal: 8, elevation: 4, width: '90%' }}
      contentContainerStyle={{ paddingHorizontal: 15 }}
      text1Style={{
        fontSize: 16,
        fontWeight: '700',
        color: '#166534'
      }}
      text2Style={{
        fontSize: 14,
        color: '#15803D'
      }}
      text1NumberOfLines={2}
      text2NumberOfLines={3}
    />
  ),
  error: (props) => (
    <ErrorToast
      {...props}
      style={{ borderLeftColor: '#EF4444', backgroundColor: '#FEF2F2', borderRadius: 12, height: 'auto', paddingVertical: 12, paddingHorizontal: 8, elevation: 4, width: '90%' }}
      contentContainerStyle={{ paddingHorizontal: 15 }}
      text1Style={{
        fontSize: 16,
        fontWeight: '700',
        color: '#991B1B'
      }}
      text2Style={{
        fontSize: 14,
        color: '#B91C1C'
      }}
      text1NumberOfLines={2}
      text2NumberOfLines={3}
    />
  ),
  info: (props) => (
    <BaseToast
      {...props}
      style={{ borderLeftColor: '#3B82F6', backgroundColor: '#EFF6FF', borderRadius: 12, height: 'auto', paddingVertical: 12, paddingHorizontal: 8, elevation: 4, width: '90%' }}
      contentContainerStyle={{ paddingHorizontal: 15 }}
      text1Style={{
        fontSize: 16,
        fontWeight: '700',
        color: '#1E40AF'
      }}
      text2Style={{
        fontSize: 14,
        color: '#1D4ED8'
      }}
      text1NumberOfLines={2}
      text2NumberOfLines={3}
    />
  )
};

const Stack = createNativeStackNavigator();

const parseDeepLinkTokens = (url) => {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) {
    return null;
  }

  const params = {};
  const hash = url.substring(hashIndex + 1);
  hash.split('&').forEach((pair) => {
    const [key, value] = pair.split('=');
    if (key) {
      params[key] = value;
    }
  });

  return params;
};

const isResetPasswordUrl = (url = '') => url.includes('reset-password');

function App() {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [initialRouteName, setInitialRouteName] = useState('Login');

  useEffect(() => {
    let isActive = true;

    const handleDeepLink = async (event) => {
      const url = event.url;
      if (!url) return false;

      console.log('Deep link received:', url);
      const params = parseDeepLinkTokens(url);

      if (url.includes('access_token') || url.includes('refresh_token')) {
        try {
          if (params?.access_token && params?.refresh_token) {
            const { error } = await supabase.auth.setSession({
              access_token: params.access_token,
              refresh_token: params.refresh_token,
            });

            if (error) throw error;
          }
          return true;
        } catch (error) {
          console.error('Error handling deep link session:', error);
          Toast.show({ type: 'error', text1: 'Link Error', text2: 'Invalid or expired link' });
          return false;
        }
      }

      return isResetPasswordUrl(url);
    };

    const bootstrapApp = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();

        if (initialUrl) {
          const handledResetLink = await handleDeepLink({ url: initialUrl });

          if (isResetPasswordUrl(initialUrl)) {
            const { data: { session } } = await supabase.auth.getSession();
            if (isActive) {
              setInitialRouteName(handledResetLink && session ? 'ResetPassword' : 'Login');
            }
            return;
          }
        }

        const response = await authAPI.getMe();
        if (isActive) {
          setInitialRouteName(response?.data ? 'AdminDashboard' : 'Login');
        }
      } catch (error) {
        console.error('App bootstrap error:', error);
        if (isActive) {
          setInitialRouteName('Login');
        }
      } finally {
        if (isActive) {
          setIsBootstrapping(false);
        }
      }
    };

    const sub = Linking.addEventListener('url', handleDeepLink);
    bootstrapApp();

    return () => {
      isActive = false;
      sub.remove();
    };
  }, []);

  const linking = {
    prefixes: ['flowerforge-admin://', 'https://flowerforge-admin.com'],
    config: {
      screens: {
        Login: 'login',
        AdminDashboard: 'dashboard',
        ResetPassword: 'reset-password', // Path matching the URL path before hash
      },
    },
  };

  return (
    <View style={{ flex: 1 }}>
      {isBootstrapping ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f4f6f9' }}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '600', color: '#374151' }}>
            Loading...
          </Text>
        </View>
      ) : (
        <NavigationContainer linking={linking} fallback={<View />}>
          <Stack.Navigator initialRouteName={initialRouteName}>
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="AdminDashboard"
              component={AdminDashboard}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="ResetPassword"
              component={ResetPasswordScreen}
              options={{ headerShown: false }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      )}
      <Toast config={toastConfig} />
    </View>
  );
}

export default App;


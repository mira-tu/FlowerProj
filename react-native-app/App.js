import React, { useEffect } from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AdminDashboard from './src/screens/AdminDashboard';
import LoginScreen from './src/screens/LoginScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import { initializeAsyncStorage } from './src/utils/mockData';
import { supabase } from './src/config/supabase';
import { Linking } from 'react-native';
import Toast from 'react-native-toast-message';

const Stack = createNativeStackNavigator();

function App() {
  // Initialize AsyncStorage with mock data on app start
  useEffect(() => {
    initializeAsyncStorage();

    // Handle Deep Linking
    const handleDeepLink = async (event) => {
      const url = event.url;
      if (!url) return;

      console.log('Deep link received:', url);

      // Check for Supabase auth tokens in hash
      // Format: flowerforge-admin://reset-password#access_token=...&refresh_token=...
      if (url.includes('access_token') || url.includes('refresh_token')) {
        try {
          // Extract hash part
          const hashIndex = url.indexOf('#');
          if (hashIndex !== -1) {
            const hash = url.substring(hashIndex + 1);
            const params = {};
            hash.split('&').forEach(pair => {
              const [key, value] = pair.split('=');
              params[key] = value;
            });

            if (params.access_token && params.refresh_token) {
              const { error } = await supabase.auth.setSession({
                access_token: params.access_token,
                refresh_token: params.refresh_token,
              });

              if (error) throw error;

              // Navigate to ResetPassword after setting session
              // We need a ref or wait for navigation container to be ready, 
              // but if this runs on mount, the initial route is Login.
              // We can rely on the navigation linking prop or manual navigation if we have ref.
              // However, since we are inside App component, we don't have navigation prop.
              // We'll use linking config for routing but session setting here.
            }
          }
        } catch (error) {
          console.error('Error handling deep link session:', error);
          Toast.show({ type: 'error', text1: 'Link Error', text2: 'Invalid or expired link' });
        }
      }
    };

    const sub = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => sub.remove();
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

      <NavigationContainer linking={linking} fallback={<View />}>
        <Stack.Navigator initialRouteName="Login">
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
            component={ResetPasswordScreen} // Handles the actual password update
            options={{ headerShown: false }}
          />
        </Stack.Navigator>
      </NavigationContainer>
      <Toast />
    </View>
  );
}

export default App;


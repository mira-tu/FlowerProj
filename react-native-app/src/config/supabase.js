import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

import AsyncStorage from '@react-native-async-storage/async-storage';

// Get environment variables from Expo Constants
const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const message = 'Supabase configuration is missing. Define EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY for local Expo and EAS builds.';
  console.error(message, {
    hasExpoConfigUrl: Boolean(Constants.expoConfig?.extra?.supabaseUrl),
    hasExpoConfigAnonKey: Boolean(Constants.expoConfig?.extra?.supabaseAnonKey),
    hasProcessEnvUrl: Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL),
    hasProcessEnvAnonKey: Boolean(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  });

  if (__DEV__) {
    throw new Error(message);
  }
}

console.log('[supabase] config resolved', {
  hasUrl: Boolean(supabaseUrl),
  hasAnonKey: Boolean(supabaseAnonKey),
  source: Constants.expoConfig?.extra?.supabaseUrl ? 'expo-extra' : 'process-env',
});

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { authAPI } from '../config/api';
import AdminHeroGraphic from '../components/AdminHeroGraphic';

const LoginScreen = () => {
  const navigation = useNavigation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorMessage('Please enter email and password');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const response = await authAPI.staffLogin({ email: email.trim(), password });
      if (!response.data?.user) {
        throw new Error('Login failed: No user data returned.');
      }

      // Navigate to dashboard
      navigation.reset({
        index: 0,
        routes: [{ name: 'AdminDashboard' }],
      });
    } catch (error) {
      console.error('Login error:', error?.message || error);

      let errMsg = 'Could not connect to server.';
      const message = error?.message || '';
      const lowerMessage = message.toLowerCase();

      // Check for specific Supabase error messages or custom errors from authAPI
      if (lowerMessage.includes('email not confirmed')) {
        errMsg = 'Please confirm your email address before logging in.';
      } else if (message.includes('AuthApiError')) {
        // Supabase authentication errors
        errMsg = message.replace('AuthApiError: ', '');
      } else if (message.includes('Access Denied')) {
        // Custom error for role-based access denied
        errMsg = message;
      } else if (error.response) {
        // Server responded with error (e.g., from an API call)
        errMsg = error.response.data?.message || 'Invalid email or password.';
      } else if (error.request) {
        // Request made but no response (network error)
        errMsg = 'No response from server. Check your internet connection.';
      } else {
        // Something else happened
        errMsg = error.message || 'Unable to sign in. Please try again.';
      }
      setErrorMessage(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <AdminHeroGraphic />
          <View style={styles.portalBadge}>
            <Text style={styles.portalBadgeText}>Admin Portal</Text>
          </View>
          <Text style={styles.shopName}>Jocerry's Flower Shop</Text>
        </View>
        <Text style={styles.subtitle}>Sign in with an admin or employee account.</Text>

        {errorMessage ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#9ca3af"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#9ca3af"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ActivityIndicator color="#fff" />
              <Text style={[styles.buttonText, { marginLeft: 10 }]}>Please wait...</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6f9',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 18,
  },
  portalBadge: {
    backgroundColor: '#ffe4f0',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: -12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f9a8d4',
  },
  portalBadgeText: {
    color: '#9d174d',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  shopName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#be185d',
    textAlign: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e3e6f0',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
    fontSize: 16,
    color: '#1a1a1a',
  },
  button: {
    backgroundColor: '#ec4899',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  errorContainer: {
    backgroundColor: '#f8d7da',
    borderColor: '#f5c6cb',
    borderWidth: 1,
    borderRadius: 5,
    padding: 10,
    marginBottom: 15,
    width: '100%',
  },
  errorText: {
    color: '#721c24',
    textAlign: 'center',
    fontSize: 14,
  },
});

export default LoginScreen;

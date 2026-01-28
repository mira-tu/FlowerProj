import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { authAPI } from '../config/api';

const LoginScreen = () => {
  const navigation = useNavigation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);

    try {
      console.log('Attempting login...');
      console.log('Email:', email);

      const response = await authAPI.adminLogin({ email, password });
      const { user, token } = response.data;

      console.log('Login successful!', user);

      // Save token and user data
      await AsyncStorage.setItem('token', token);
      await AsyncStorage.setItem('currentUser', JSON.stringify(user));

      // Navigate to dashboard
      navigation.navigate('AdminDashboard');
    } catch (error) {
      console.error('Full error:', error.message);
      console.error('Error response:', error.response);
      console.error('Error message:', error.message);

      let errorMessage = 'Could not connect to server.';

      // Check for specific Supabase error messages or custom errors from authAPI
      if (error.message.includes('AuthApiError')) {
        // Supabase authentication errors
        errorMessage = error.message.replace('AuthApiError: ', '');
        Alert.alert('Login Failed', errorMessage);
      } else if (error.message.includes('Access Denied')) {
        // Custom error for role-based access denied
        Alert.alert('Access Denied', error.message);
      } else if (error.response) {
        // Server responded with error (e.g., from an API call)
        errorMessage = error.response.data?.message || 'Invalid credentials';
        Alert.alert('Login Failed', errorMessage);
      } else if (error.request) {
        // Request made but no response (network error)
        errorMessage = 'No response from server. Check your internet connection.';
        Alert.alert('Login Failed', errorMessage);
      } else {
        // Something else happened
        errorMessage = error.message || 'An unexpected error occurred during login.';
        Alert.alert('Login Failed', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Text style={styles.shopName}>Joccery's Flower Shop</Text>
          <Text style={styles.title}>Login</Text>
        </View>
        <Text style={styles.subtitle}>FlowerForge Admin Dashboard</Text>

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
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Login</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.hint}>Use: admin@flower.com / pa55w0rd</Text>
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
    marginBottom: 20,
  },
  shopName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ec4899',
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
    marginBottom: 40,
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
  hint: {
    marginTop: 20,
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default LoginScreen;

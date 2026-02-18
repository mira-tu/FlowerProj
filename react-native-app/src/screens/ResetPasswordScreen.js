
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '../config/supabase';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';

const ResetPasswordScreen = () => {
    const navigation = useNavigation();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleResetPassword = async () => {
        if (!password || !confirmPassword) {
            Alert.alert('Error', 'Please fill in all fields');
            return;
        }

        if (password !== confirmPassword) {
            Alert.alert('Error', 'Passwords do not match');
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: password });

            if (error) throw error;

            Toast.show({
                type: 'success',
                text1: 'Password Updated',
                text2: 'You can now login with your new password',
            });

            // Sign out just to be safe and redirect to login
            await supabase.auth.signOut();
            navigation.navigate('Login');

        } catch (error) {
            console.error('Password reset error:', error);
            Alert.alert('Error', error.message || 'Failed to update password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>Reset Password</Text>
                <Text style={styles.subtitle}>Enter your new password below</Text>

                <TextInput
                    style={styles.input}
                    placeholder="New Password"
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                />

                <TextInput
                    style={styles.input}
                    placeholder="Confirm Password"
                    secureTextEntry
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                />

                <TouchableOpacity
                    style={[styles.button, loading && styles.disabledButton]}
                    onPress={handleResetPassword}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.buttonText}>Update Password</Text>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.navigate('Login')}
                >
                    <Text style={styles.backButtonText}>Back to Login</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f4f6f9',
        justifyContent: 'center',
        padding: 20,
    },
    content: {
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 5,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#ec4899',
        marginBottom: 10,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        color: '#6c757d',
        marginBottom: 20,
        textAlign: 'center',
    },
    input: {
        borderWidth: 1,
        borderColor: '#e3e6f0',
        borderRadius: 8,
        padding: 12,
        marginBottom: 15,
        backgroundColor: '#f8f9fa',
    },
    button: {
        backgroundColor: '#ec4899',
        padding: 15,
        borderRadius: 8,
        alignItems: 'center',
        marginBottom: 10,
    },
    disabledButton: {
        opacity: 0.7,
    },
    buttonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
    },
    backButton: {
        alignItems: 'center',
        padding: 10,
    },
    backButtonText: {
        color: '#6c757d',
    },
});

export default ResetPasswordScreen;

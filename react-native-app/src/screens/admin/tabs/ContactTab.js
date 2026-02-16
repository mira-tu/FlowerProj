import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { supabase } from '../../../config/supabase';
import styles from '../../AdminDashboard.styles';

const ContactTab = () => {
    const [contactInfo, setContactInfo] = useState({
        address: '',
        phone: '',
        email: '',
        mapUrl: ''
    });
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const fetchContactInfo = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('app_content')
                .select('key, value')
                .in('key', ['contact_address', 'contact_phone', 'contact_email', 'contact_map_url']);

            if (error) throw error;

            const info = data.reduce((acc, { key, value }) => {
                if (key === 'contact_address') acc.address = value;
                if (key === 'contact_phone') acc.phone = value;
                if (key === 'contact_email') acc.email = value;
                if (key === 'contact_map_url') acc.mapUrl = value;
                return acc;
            }, { address: '', phone: '', email: '', mapUrl: '' });
            setContactInfo(info);
        } catch (error) {
            Alert.alert('Error fetching contact info', error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchContactInfo();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const updates = [
                { key: 'contact_address', value: contactInfo.address },
                { key: 'contact_phone', value: contactInfo.phone },
                { key: 'contact_email', value: contactInfo.email },
                { key: 'contact_map_url', value: contactInfo.mapUrl },
            ];

            const { data: existingKeysData, error: fetchError } = await supabase
              .from('app_content')
              .select('key')
              .in('key', updates.map(u => u.key));
            
            if(fetchError) throw fetchError;

            const existingKeys = existingKeysData.map(item => item.key);
            const toUpdate = updates.filter(u => existingKeys.includes(u.key));
            const toInsert = updates.filter(u => !existingKeys.includes(u.key) && u.value);

            if (toUpdate.length > 0) {
              for (const item of toUpdate) {
                const { error } = await supabase
                  .from('app_content')
                  .update({ value: item.value, updated_at: new Date().toISOString() })
                  .eq('key', item.key);
                if (error) throw new Error(`Failed to update ${item.key}: ${error.message}`);
              }
            }

            if (toInsert.length > 0) {
              const { error } = await supabase.from('app_content').insert(toInsert);
              if (error) throw new Error(`Failed to insert new keys: ${error.message}`);
            }

            Alert.alert('Success', 'Contact information has been updated.');
        } catch (error) {
            Alert.alert('Error saving contact info', error.message);
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return <ActivityIndicator style={{ marginTop: 20 }} size="large" color="#ec4899" />;
    }

    return (
        <ScrollView style={styles.tabContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.tabTitle}>Contact Page Settings</Text>
            
            <Text style={styles.inputLabel}>Address</Text>
            <TextInput
                style={styles.input}
                value={contactInfo.address}
                onChangeText={text => setContactInfo(prev => ({ ...prev, address: text }))}
                placeholder="Shop Address"
            />
            
            <Text style={styles.inputLabel}>Phone Number</Text>
            <TextInput
                style={styles.input}
                value={contactInfo.phone}
                onChangeText={text => setContactInfo(prev => ({ ...prev, phone: text }))}
                placeholder="Contact Phone"
                keyboardType="phone-pad"
            />

            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
                style={styles.input}
                value={contactInfo.email}
                onChangeText={text => setContactInfo(prev => ({ ...prev, email: text }))}
                placeholder="Contact Email"
                keyboardType="email-address"
                autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Google Maps URL (Embed)</Text>
            <TextInput
                style={[styles.input, { height: 120, textAlignVertical: 'top' }]}
                value={contactInfo.mapUrl}
                onChangeText={text => setContactInfo(prev => ({ ...prev, mapUrl: text }))}
                placeholder="Google Maps Embed URL"
                multiline
            />

            <TouchableOpacity style={[styles.addButton, {alignSelf: 'center', marginTop: 20}]} onPress={handleSave} disabled={isSaving}>
                <Text style={styles.addButtonText}>{isSaving ? 'Saving...' : 'Save Changes'}</Text>
            </TouchableOpacity>
        </ScrollView>
    );
};


export default ContactTab;

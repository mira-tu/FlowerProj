import { decode } from 'base64-arraybuffer';
import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../config/supabase';
import styles from '../../AdminDashboard.styles';

const AboutTab = () => {
    const [aboutData, setAboutData] = useState({
        story: '',
        about_description: '',
        promise: '',
        ownerQuote: '',
        ownerImage: null,
        ourShopImage: null,
        customBouquetsDescription: '',
        customBouquetsImage: null,
        eventDecorationsDescription: '',
        eventDecorationsImage: null,
        specialOrdersDescription: '',
        specialOrdersImage: null,
        promises_responsibly_sourced_description: '',
        promises_responsibly_sourced_image: null,
        promises_crafted_by_experts_description: '',
        promises_crafted_by_experts_image: null,
        promises_caring_for_moments_description: '',
        promises_caring_for_moments_image: null,
    });
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const fetchAboutData = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('app_content')
                .select('key, value')
                .in('key', [
                    'about_story', 'about_description', 'about_promise', 'about_owner_quote', 'about_owner_image', 'about_our_shop_img',
                    'about_custom_bouquets_desc', 'about_custom_bouquets_img',
                    'about_event_decorations_desc', 'about_event_decorations_img',
                    'about_special_orders_desc', 'about_special_orders_img',
                    'promises_responsibly_sourced_description', 'promises_responsibly_sourced_image',
                    'promises_crafted_by_experts_description', 'promises_crafted_by_experts_image',
                    'promises_caring_for_moments_description', 'promises_caring_for_moments_image'
                ]);

            if (error) throw error;

            const info = data.reduce((acc, { key, value }) => {
                if (key === 'about_story') acc.story = value;
                if (key === 'about_description') acc.about_description = value;
                if (key === 'about_promise') acc.promise = value;
                if (key === 'about_owner_quote') acc.ownerQuote = value;
                if (key === 'about_owner_image') acc.ownerImage = value;
                if (key === 'about_our_shop_img') acc.ourShopImage = value;
                if (key === 'about_custom_bouquets_desc') acc.customBouquetsDescription = value;
                if (key === 'about_custom_bouquets_img') acc.customBouquetsImage = value;
                if (key === 'about_event_decorations_desc') acc.eventDecorationsDescription = value;
                if (key === 'about_event_decorations_img') acc.eventDecorationsImage = value;
                if (key === 'about_special_orders_desc') acc.specialOrdersDescription = value;
                if (key === 'about_special_orders_img') acc.specialOrdersImage = value;
                if (key === 'promises_responsibly_sourced_description') acc.promises_responsibly_sourced_description = value;
                if (key === 'promises_responsibly_sourced_image') acc.promises_responsibly_sourced_image = value;
                if (key === 'promises_crafted_by_experts_description') acc.promises_crafted_by_experts_description = value;
                if (key === 'promises_crafted_by_experts_image') acc.promises_crafted_by_experts_image = value;
                if (key === 'promises_caring_for_moments_description') acc.promises_caring_for_moments_description = value;
                if (key === 'promises_caring_for_moments_image') acc.promises_caring_for_moments_image = value;
                return acc;
            }, { 
                story: '', about_description: '', promise: '', ownerQuote: '', ownerImage: null, ourShopImage: null,
                customBouquetsDescription: '', customBouquetsImage: null,
                eventDecorationsDescription: '', eventDecorationsImage: null,
                specialOrdersDescription: '', specialOrdersImage: null,
                promises_responsibly_sourced_description: '', promises_responsibly_sourced_image: null,
                promises_crafted_by_experts_description: '', promises_crafted_by_experts_image: null,
                promises_caring_for_moments_description: '', promises_caring_for_moments_image: null,
            });
            setAboutData(info);
        } catch (error) {
            Alert.alert('Error fetching about data', error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAboutData();
    }, []);

    const pickImage = async (field) => {
        try {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
            base64: true,
          });
    
          if (!result.canceled) {
            setAboutData(prev => ({ ...prev, [field]: result.assets[0] }));
          }
        } catch (error) {
          console.error(`Error launching image library for ${field}:`, error);
          Alert.alert('Error', 'Failed to open image library. Please try again.');
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            let updates = [];
            const textFields = {
                about_story: aboutData.story,
                about_description: aboutData.about_description,
                about_promise: aboutData.promise,
                about_owner_quote: aboutData.ownerQuote,
                about_custom_bouquets_desc: aboutData.customBouquetsDescription,
                about_event_decorations_desc: aboutData.eventDecorationsDescription,
                about_special_orders_desc: aboutData.specialOrdersDescription,
                promises_responsibly_sourced_description: aboutData.promises_responsibly_sourced_description,
                promises_crafted_by_experts_description: aboutData.promises_crafted_by_experts_description,
                promises_caring_for_moments_description: aboutData.promises_caring_for_moments_description,
            };
    
            for (const [key, value] of Object.entries(textFields)) {
                updates.push({ key, value });
            }
    
            const handleImageUpload = async (imageAsset, fileName, keyName) => {
                if (imageAsset && typeof imageAsset === 'object' && imageAsset.base64) {
                    const arrayBuffer = decode(imageAsset.base64);
                    const filePath = `${fileName}.jpg`;
                    const contentType = imageAsset.mimeType || 'image/jpeg';
    
                    const { error: uploadError } = await supabase.storage
                        .from('about-images')
                        .upload(filePath, arrayBuffer, { contentType, upsert: true });
    
                    if (uploadError) throw uploadError;
    
                    const { data: urlData } = supabase.storage.from('about-images').getPublicUrl(filePath);
                    if (!urlData) throw new Error(`Could not get public URL for ${fileName}.`);
                    
                    const imageUrl = `${urlData.publicUrl}?t=${new Date().getTime()}`;
                    updates.push({ key: keyName, value: imageUrl });
                }
            };
    
            await handleImageUpload(aboutData.ownerImage, 'owner', 'about_owner_image');
            await handleImageUpload(aboutData.ourShopImage, 'our_shop', 'about_our_shop_img');
            await handleImageUpload(aboutData.customBouquetsImage, 'custom_bouquets', 'about_custom_bouquets_img');
            await handleImageUpload(aboutData.eventDecorationsImage, 'event_decorations', 'about_event_decorations_img');
            await handleImageUpload(aboutData.specialOrdersImage, 'special_orders', 'about_special_orders_img');
            await handleImageUpload(aboutData.promises_responsibly_sourced_image, 'responsibly_sourced', 'promises_responsibly_sourced_image');
            await handleImageUpload(aboutData.promises_crafted_by_experts_image, 'crafted_by_experts', 'promises_crafted_by_experts_image');
            await handleImageUpload(aboutData.promises_caring_for_moments_image, 'caring_for_moments', 'promises_caring_for_moments_image');

            const { error: upsertError } = await supabase
                .from('app_content')
                .upsert(updates, { onConflict: 'key' });

            if (upsertError) throw upsertError;

            Alert.alert('Success', 'About page content has been updated.');
        } catch (error) {
            console.error('Error saving about content:', error);
            Alert.alert('Error saving about content', error.message);
        } finally {
            setIsSaving(false);
            fetchAboutData();
        }
    };

    if (loading) {
        return <ActivityIndicator style={{ marginTop: 20 }} size="large" color="#ec4899" />;
    }

    const getImageUri = (image) => image ? (typeof image === 'string' ? image : image.uri) : null;

    return (
        <ScrollView style={styles.tabContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.tabTitle}>About Page Content</Text>
            
            <Text style={styles.inputLabel}>Our Story</Text>
            <TextInput
                style={[styles.input, { height: 150, textAlignVertical: 'top' }]}
                value={aboutData.story}
                onChangeText={text => setAboutData(prev => ({ ...prev, story: text }))}
                placeholder="The story of the shop..."
                multiline
            />

            <Text style={styles.inputLabel}>About Description</Text>
            <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                value={aboutData.about_description}
                onChangeText={text => setAboutData(prev => ({ ...prev, about_description: text }))}
                placeholder="A short description for the about page..."
                multiline
            />

            <Text style={styles.inputLabel}>Our Shop Image</Text>
            <TouchableOpacity style={styles.imageUploadBox} onPress={() => pickImage('ourShopImage')}>
                {getImageUri(aboutData.ourShopImage) ? (
                  <Image source={{ uri: getImageUri(aboutData.ourShopImage) }} style={styles.uploadedImage} />
                ) : (
                  <View style={styles.imageUploadPlaceholder}>
                    <Ionicons name="camera" size={40} color="#ec4899" />
                    <Text style={styles.imageUploadText}>Tap to Upload Photo</Text>
                  </View>
                )}
            </TouchableOpacity>
            
            <Text style={styles.inputLabel}>Our Promise</Text>
            <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                value={aboutData.promise}
                onChangeText={text => setAboutData(prev => ({ ...prev, promise: text }))}
                placeholder="The shop's promise to customers..."
                multiline
            />

            <Text style={styles.inputLabel}>Owner's Quote</Text>
            <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                value={aboutData.ownerQuote}
                onChangeText={text => setAboutData(prev => ({ ...prev, ownerQuote: text }))}
                placeholder="A quote from the owner..."
                multiline
            />

            <Text style={styles.inputLabel}>Owner's Picture</Text>
            <TouchableOpacity style={styles.imageUploadBox} onPress={() => pickImage('ownerImage')}>
                {getImageUri(aboutData.ownerImage) ? (
                  <Image source={{ uri: getImageUri(aboutData.ownerImage) }} style={styles.uploadedImage} />
                ) : (
                  <View style={styles.imageUploadPlaceholder}>
                    <Ionicons name="camera" size={40} color="#ec4899" />
                    <Text style={styles.imageUploadText}>Tap to Upload Photo</Text>
                  </View>
                )}
            </TouchableOpacity>

            <View style={styles.menuDivider} />
            <Text style={styles.sectionTitle}>Services</Text>

            <Text style={styles.inputLabel}>Custom Bouquets Description</Text>
            <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                value={aboutData.customBouquetsDescription}
                onChangeText={text => setAboutData(prev => ({ ...prev, customBouquetsDescription: text }))}
                placeholder="Description for custom bouquets service..."
                multiline
            />
            <Text style={styles.inputLabel}>Custom Bouquets Image</Text>
            <TouchableOpacity style={styles.imageUploadBox} onPress={() => pickImage('customBouquetsImage')}>
                {getImageUri(aboutData.customBouquetsImage) ? (
                  <Image source={{ uri: getImageUri(aboutData.customBouquetsImage) }} style={styles.uploadedImage} />
                ) : (
                  <View style={styles.imageUploadPlaceholder}>
                    <Ionicons name="camera" size={40} color="#ec4899" />
                    <Text style={styles.imageUploadText}>Tap to Upload Photo</Text>
                  </View>
                )}
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <Text style={styles.inputLabel}>Event Decorations Description</Text>
            <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                value={aboutData.eventDecorationsDescription}
                onChangeText={text => setAboutData(prev => ({ ...prev, eventDecorationsDescription: text }))}
                placeholder="Description for event decorations service..."
                multiline
            />
            <Text style={styles.inputLabel}>Event Decorations Image</Text>
            <TouchableOpacity style={styles.imageUploadBox} onPress={() => pickImage('eventDecorationsImage')}>
                {getImageUri(aboutData.eventDecorationsImage) ? (
                  <Image source={{ uri: getImageUri(aboutData.eventDecorationsImage) }} style={styles.uploadedImage} />
                ) : (
                  <View style={styles.imageUploadPlaceholder}>
                    <Ionicons name="camera" size={40} color="#ec4899" />
                    <Text style={styles.imageUploadText}>Tap to Upload Photo</Text>
                  </View>
                )}
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <Text style={styles.inputLabel}>Special Orders Description</Text>
            <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                value={aboutData.specialOrdersDescription}
                onChangeText={text => setAboutData(prev => ({ ...prev, specialOrdersDescription: text }))}
                placeholder="Description for special orders service..."
                multiline
            />

            <View style={styles.menuDivider} />
            <Text style={styles.sectionTitle}>Promises</Text>

            <Text style={styles.inputLabel}>Responsibly Sourced Description</Text>
            <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                value={aboutData.promises_responsibly_sourced_description}
                onChangeText={text => setAboutData(prev => ({ ...prev, promises_responsibly_sourced_description: text }))}
                placeholder="Description for responsibly sourced..."
                multiline
            />
            <Text style={styles.inputLabel}>Responsibly Sourced Image</Text>
            <TouchableOpacity style={styles.imageUploadBox} onPress={() => pickImage('promises_responsibly_sourced_image')}>
                {getImageUri(aboutData.promises_responsibly_sourced_image) ? (
                  <Image source={{ uri: getImageUri(aboutData.promises_responsibly_sourced_image) }} style={styles.uploadedImage} />
                ) : (
                  <View style={styles.imageUploadPlaceholder}>
                    <Ionicons name="camera" size={40} color="#ec4899" />
                    <Text style={styles.imageUploadText}>Tap to Upload Photo</Text>
                  </View>
                )}
            </TouchableOpacity>

            <Text style={styles.inputLabel}>Crafted by Experts Description</Text>
            <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                value={aboutData.promises_crafted_by_experts_description}
                onChangeText={text => setAboutData(prev => ({ ...prev, promises_crafted_by_experts_description: text }))}
                placeholder="Description for crafted by experts..."
                multiline
            />
            <Text style={styles.inputLabel}>Crafted by Experts Image</Text>
            <TouchableOpacity style={styles.imageUploadBox} onPress={() => pickImage('promises_crafted_by_experts_image')}>
                {getImageUri(aboutData.promises_crafted_by_experts_image) ? (
                  <Image source={{ uri: getImageUri(aboutData.promises_crafted_by_experts_image) }} style={styles.uploadedImage} />
                ) : (
                  <View style={styles.imageUploadPlaceholder}>
                    <Ionicons name="camera" size={40} color="#ec4899" />
                    <Text style={styles.imageUploadText}>Tap to Upload Photo</Text>
                  </View>
                )}
            </TouchableOpacity>

            <Text style={styles.inputLabel}>Caring for Moments Description</Text>
            <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                value={aboutData.promises_caring_for_moments_description}
                onChangeText={text => setAboutData(prev => ({ ...prev, promises_caring_for_moments_description: text }))}
                placeholder="Description for caring for moments..."
                multiline
            />
            <Text style={styles.inputLabel}>Caring for Moments Image</Text>
            <TouchableOpacity style={styles.imageUploadBox} onPress={() => pickImage('promises_caring_for_moments_image')}>
                {getImageUri(aboutData.promises_caring_for_moments_image) ? (
                  <Image source={{ uri: getImageUri(aboutData.promises_caring_for_moments_image) }} style={styles.uploadedImage} />
                ) : (
                  <View style={styles.imageUploadPlaceholder}>
                    <Ionicons name="camera" size={40} color="#ec4899" />
                    <Text style={styles.imageUploadText}>Tap to Upload Photo</Text>
                  </View>
                )}
            </TouchableOpacity>

            <TouchableOpacity style={[styles.addButton, {alignSelf: 'center', marginTop: 20}]} onPress={handleSave} disabled={isSaving}>
                <Text style={styles.addButtonText}>{isSaving ? 'Saving...' : 'Save Changes'}</Text>
            </TouchableOpacity>
        </ScrollView>
    );
};


export default AboutTab;

import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
    Modal, Alert, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../config/supabase';
import Toast from 'react-native-toast-message';

const DeliveryFeesTab = () => {
    const [barangays, setBarangays] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);

    // Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentId, setCurrentId] = useState(null);
    const [barangayName, setBarangayName] = useState('');
    const [deliveryFee, setDeliveryFee] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);

    useEffect(() => {
        fetchBarangays();
    }, []);

    const fetchBarangays = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('barangay_fee')
                .select('*')
                .order('barangay_name', { ascending: true });

            if (error) throw error;
            setBarangays(data || []);
        } catch (error) {
            console.error('Error fetching barangays:', error);
            Toast.show({ type: 'error', text1: 'Failed to load delivery fees.' });
        } finally {
            setLoading(false);
        }
    };

    const filteredBarangays = barangays.filter(b =>
        b.barangay_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const openAddModal = () => {
        setIsEditing(false);
        setCurrentId(null);
        setBarangayName('');
        setDeliveryFee('');
        setModalVisible(true);
    };

    const openEditModal = (item) => {
        setIsEditing(true);
        setCurrentId(item.id);
        setBarangayName(item.barangay_name);
        setDeliveryFee(String(item.delivery_fee));
        setConfirmDelete(false);
        setModalVisible(true);
    };

    const handleSave = async () => {
        if (!barangayName.trim() || !deliveryFee.trim()) {
            Alert.alert('Error', 'Please enter both Barangay Name and Delivery Fee.');
            return;
        }

        const feeNum = parseFloat(deliveryFee);
        if (isNaN(feeNum) || feeNum < 0) {
            Alert.alert('Error', 'Please enter a valid numeric delivery fee.');
            return;
        }

        try {
            if (isEditing) {
                const { error } = await supabase
                    .from('barangay_fee')
                    .update({ barangay_name: barangayName.trim(), delivery_fee: feeNum })
                    .eq('id', currentId);

                if (error) throw error;
                Toast.show({ type: 'success', text1: 'Barangay updated successfully.' });
            } else {
                const { error } = await supabase
                    .from('barangay_fee')
                    .insert([{ barangay_name: barangayName.trim(), delivery_fee: feeNum }]);

                if (error) throw error;
                Toast.show({ type: 'success', text1: 'Barangay added successfully.' });
            }

            setModalVisible(false);
            fetchBarangays();
        } catch (error) {
            console.error('Error saving barangay fee:', error);
            Toast.show({ type: 'error', text1: 'Failed to save delivery fee.', text2: error.message });
        }
    };

    const handleDelete = async () => {
        if (!confirmDelete) {
            setConfirmDelete(true);
            return;
        }

        try {
            const { error } = await supabase
                .from('barangay_fee')
                .delete()
                .eq('id', currentId);

            if (error) throw error;

            Toast.show({ type: 'success', text1: 'Barangay deleted.' });
            setModalVisible(false);
            setConfirmDelete(false);
            fetchBarangays();
        } catch (error) {
            console.error('Error deleting barangay:', error);
            Toast.show({ type: 'error', text1: 'Failed to delete.' });
        }
    };

    const renderItem = ({ item }) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => openEditModal(item)}
            activeOpacity={0.7}
        >
            <View style={styles.cardInfo}>
                <Ionicons name="location-outline" size={24} color="#ec4899" />
                <Text style={styles.barangayName}>{item.barangay_name}</Text>
            </View>
            <View style={styles.feeBadge}>
                <Text style={styles.feeText}>₱{item.delivery_fee.toFixed(2)}</Text>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Delivery Fees</Text>
                <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
                    <Ionicons name="add" size={20} color="#fff" />
                    <Text style={styles.addButtonText}>Add Area</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color="#999" />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search barangay..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                        <Ionicons name="close-circle" size={20} color="#ccc" />
                    </TouchableOpacity>
                )}
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#ec4899" style={{ marginTop: 50 }} />
            ) : (
                <FlatList
                    data={filteredBarangays}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContainer}
                    ListEmptyComponent={
                        <Text style={styles.emptyText}>No delivery areas found.</Text>
                    }
                />
            )}

            {/* Add / Edit Modal */}
            <Modal visible={modalVisible} transparent={true} animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>
                                {isEditing ? 'Edit Delivery Area' : 'Add Delivery Area'}
                            </Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#333" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Barangay Name</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. Tetuan"
                                value={barangayName}
                                onChangeText={setBarangayName}
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Delivery Fee (₱)</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. 50"
                                keyboardType="numeric"
                                value={deliveryFee}
                                onChangeText={setDeliveryFee}
                            />
                        </View>

                        <View style={styles.modalActions}>
                            {isEditing ? (
                                <>
                                    <TouchableOpacity
                                        style={[styles.btn, styles.deleteBtn, confirmDelete && { backgroundColor: '#991B1B' }]}
                                        onPress={handleDelete}
                                    >
                                        {confirmDelete ? (
                                            <Text style={styles.btnText}>Confirm?</Text>
                                        ) : (
                                            <Ionicons name="trash-outline" size={20} color="#fff" />
                                        )}
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.btn, styles.saveBtn, { flex: 1 }]} onPress={handleSave}>
                                        <Text style={styles.btnText}>Save Updates</Text>
                                    </TouchableOpacity>
                                </>
                            ) : (
                                <TouchableOpacity style={[styles.btn, styles.saveBtn, { flex: 1 }]} onPress={handleSave}>
                                    <Text style={styles.btnText}>Save Area</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                    </View>
                </View>
            </Modal>

        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#111827',
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ec4899',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
    },
    addButtonText: {
        color: '#fff',
        fontWeight: '600',
        marginLeft: 4,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        margin: 16,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    searchInput: {
        flex: 1,
        marginLeft: 8,
        fontSize: 16,
        color: '#111827',
    },
    listContainer: {
        padding: 16,
        paddingTop: 0,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    cardInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    barangayName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
        marginLeft: 12,
    },
    feeBadge: {
        backgroundColor: '#FCE7F3',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    feeText: {
        color: '#BE185D',
        fontWeight: '700',
        fontSize: 14,
    },
    emptyText: {
        textAlign: 'center',
        color: '#6B7280',
        marginTop: 40,
        fontSize: 16,
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 24,
        paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#111827',
    },
    inputGroup: {
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#D1D5DB',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        color: '#111827',
    },
    modalActions: {
        flexDirection: 'row',
        marginTop: 20,
        gap: 12,
    },
    btn: {
        padding: 14,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveBtn: {
        backgroundColor: '#ec4899',
    },
    deleteBtn: {
        backgroundColor: '#EF4444',
        paddingHorizontal: 20,
    },
    btnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    },
});

export default DeliveryFeesTab;

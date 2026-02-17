import React, { useState, useEffect } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../config/supabase';
import styles from '../../AdminDashboard.styles';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';

const EmployeesTab = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'employee');

      if (error) {
        throw error;
      }
      setEmployees(data || []);
    } catch (error) {
      console.error('Error loading employees:', error);
      Alert.alert('Error', 'Failed to load employees.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!formData.name || !formData.email || !formData.password) {
      Alert.alert('Error', 'All fields are required');
      return;
    }
    if (formData.password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    try {
      // 1. Create the user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            name: formData.name,
            role: 'employee', // Assign role in metadata
            phone: formData.phone,
          },
        },
      });

      if (authError) {
        throw authError;
      }

      if (!authData.user) {
        throw new Error("User was not created in authentication system.");
      }

      // 2. Insert the user into the public.users table
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          name: formData.name,
          email: formData.email,
          role: 'employee', // Explicitly set role in the table
          phone: formData.phone,
        });

      if (insertError) {
        // If insert fails, we should ideally delete the auth user to avoid orphans
        await supabase.auth.admin.deleteUser(authData.user.id);
        throw insertError;
      }

      let successMessage = 'Employee added successfully.';
      if (authData.user && !authData.session) {
        successMessage = 'Employee added successfully! Please check the employee\'s email to confirm their account.';
      }
      Alert.alert('Success', successMessage);
      setModalVisible(false);
      setFormData({ name: '', email: '', password: '', phone: '' });
      loadData();
    } catch (error) {
      console.error('Full error object:', error);
      Alert.alert('Error', error.message || error.error_description || JSON.stringify(error) || 'Failed to add employee');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (employee) => {
    setEmployeeToDelete(employee);
    setDeleteModalVisible(true);
  };

  const confirmDelete = async () => {
    if (!employeeToDelete) return;

    setLoading(true);
    setDeleteModalVisible(false);

    try {
      const { error } = await supabase.rpc('delete_user', { user_id: employeeToDelete.id });

      if (error) {
        throw error;
      }

      Alert.alert('Success', 'Employee deleted successfully.');
      loadData();
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to delete employee.');
    } finally {
      setLoading(false);
      setEmployeeToDelete(null);
    }
  };

  return (
    <View style={styles.tabContent}>
      <Text style={styles.tabTitle}>Employee Management</Text>

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setModalVisible(true)}
      >
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.addButtonText}>Add Employee</Text>
      </TouchableOpacity>

      <FlatList
        data={employees}
        renderItem={({ item }) => (
          <View style={styles.stockCard}>
            <View style={styles.stockInfo}>
              <Text style={styles.stockName}>{item.name}</Text>
              <View style={{ marginTop: 4 }}>
                <Text style={styles.stockQuantity}>
                  <Text style={{ fontWeight: 'bold' }}>Email: </Text>
                  {item.email}
                </Text>
                <Text style={styles.stockQuantity}>
                  <Text style={{ fontWeight: 'bold' }}>Phone: </Text>
                  {item.phone}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: '#e0e0e0', alignSelf: 'flex-start', marginTop: 5 }]}>
                <Text style={{ fontSize: 10, color: '#666' }}>EMPLOYEE</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.deleteButtonSmall}
              onPress={() => handleDelete(item)}
            >
              <Ionicons name="trash-outline" size={20} color="#f44336" />
            </TouchableOpacity>
          </View>
        )}
        keyExtractor={(item) => item.id.toString()}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No employees found</Text>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Employee</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={styles.input}
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                placeholder="Employee Name"
              />

              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={formData.email}
                onChangeText={(text) => setFormData({ ...formData, email: text })}
                placeholder="Email Address"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Contact Number</Text>
              <TextInput
                style={styles.input}
                value={formData.phone}
                onChangeText={(text) => setFormData({ ...formData, phone: text })}
                placeholder="Contact Number"
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.input}
                value={formData.password}
                onChangeText={(text) => setFormData({ ...formData, password: text })}
                placeholder="Password"
                secureTextEntry
              />
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleAdd}
                disabled={loading}
              >
                <Text style={styles.buttonText}>{loading ? 'Adding...' : 'Add Employee'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        visible={deleteModalVisible}
        onClose={() => setDeleteModalVisible(false)}
        onConfirm={confirmDelete}
        title="Confirm Deletion"
        message={`Are you sure you want to delete the employee '${employeeToDelete?.name}'? This action is irreversible.`}
        confirmText={loading ? 'Deleting...' : 'Delete'}
        confirmDisabled={loading}
      />
    </View>
  );
};

export default EmployeesTab;

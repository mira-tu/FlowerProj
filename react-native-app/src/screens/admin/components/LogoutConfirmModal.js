import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import styles from '../../AdminDashboard.styles';

const LogoutConfirmModal = ({ visible, onClose, onConfirm }) => (
  <Modal
    visible={visible}
    transparent={true}
    animationType="fade"
    onRequestClose={onClose}
  >
    <TouchableOpacity
      style={styles.logoutOverlay}
      activeOpacity={1}
      onPress={onClose}
    >
      <View style={styles.logoutConfirmBox} onStartShouldSetResponder={() => true}>
        <Text style={styles.logoutConfirmTitle}>Logout</Text>
        <Text style={styles.logoutConfirmMessage}>Are you sure you want to logout?</Text>
        <View style={styles.logoutConfirmButtons}>
          <TouchableOpacity style={styles.logoutCancelBtn} onPress={onClose}>
            <Text style={styles.logoutCancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.logoutConfirmBtn}
            onPress={onConfirm}
          >
            <Text style={styles.logoutConfirmBtnText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  </Modal>
);

export default LogoutConfirmModal;

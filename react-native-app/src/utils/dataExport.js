// Data Export/Import Utility for React Native
// This allows users to export data from mobile and import into web (or vice versa)

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { StorageHelpers } from './storage';

const DATA_KEYS = [
  'currentUser',
  'catalogueProducts',
  'orders',
  'requests',
  'stock',
  'notifications',
  'messages',
  'employees',
  'aboutData',
  'contactData',
];

export const DataExport = {
  // Export all data as JSON string
  async exportAll() {
    const data = {};
    for (const key of DATA_KEYS) {
      const value = await StorageHelpers.getJSON(key);
      if (value !== null) {
        data[key] = value;
      }
    }
    return JSON.stringify(data, null, 2);
  },

  // Export data as shareable file
  async exportToFile(filename = 'flowerforge-data.json') {
    try {
      const jsonData = await this.exportAll();
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, jsonData);
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      }
      
      return { success: true, fileUri };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Export data as QR code (requires expo-barcode-scanner or similar)
  async exportToQRCode() {
    const jsonData = await this.exportAll();
    // Compress data for QR code
    const compressed = btoa(unescape(encodeURIComponent(jsonData)));
    return compressed;
  },

  // Import data from JSON string
  async importFromJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      for (const [key, value] of Object.entries(data)) {
        if (DATA_KEYS.includes(key)) {
          await StorageHelpers.setJSON(key, value);
        }
      }
      return { success: true, message: 'Data imported successfully' };
    } catch (error) {
      return { success: false, message: 'Invalid JSON data', error };
    }
  },

  // Import data from file
  async importFromFile(fileUri) {
    try {
      const jsonString = await FileSystem.readAsStringAsync(fileUri);
      return await this.importFromJSON(jsonString);
    } catch (error) {
      return { success: false, message: 'Error reading file', error };
    }
  },

  // Import from QR code data
  async importFromQRCode(qrData) {
    try {
      const jsonString = decodeURIComponent(escape(atob(qrData)));
      return await this.importFromJSON(jsonString);
    } catch (error) {
      return { success: false, message: 'Invalid QR code data', error };
    }
  },
};

export default DataExport;


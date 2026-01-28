// Data Export/Import Utility for sharing data between web and mobile
// This allows users to export data from web and import into mobile (or vice versa)

import storage, { StorageHelpers } from './storage';

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

  // Export data as downloadable file
  async exportToFile(filename = 'flowerforge-data.json') {
    const jsonData = await this.exportAll();
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  // Export data as QR code (requires qrcode library)
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
  async importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const result = await this.importFromJSON(e.target.result);
          resolve(result);
        } catch (error) {
          reject({ success: false, message: 'Error reading file', error });
        }
      };
      reader.onerror = () => {
        reject({ success: false, message: 'Error reading file' });
      };
      reader.readAsText(file);
    });
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


// Shared Storage Utility for Web (localStorage) and React Native (AsyncStorage)
// This allows both apps to use the same storage interface

let storage = null;

// Detect platform and initialize appropriate storage
if (typeof window !== 'undefined' && window.localStorage) {
  // Web platform - use localStorage
  storage = {
    async getItem(key) {
      try {
        return localStorage.getItem(key);
      } catch (error) {
        console.error('Error getting item from localStorage:', error);
        return null;
      }
    },
    async setItem(key, value) {
      try {
        localStorage.setItem(key, value);
        // Dispatch custom event for cross-tab sync
        window.dispatchEvent(new CustomEvent('storageChange', { 
          detail: { key, value } 
        }));
      } catch (error) {
        console.error('Error setting item in localStorage:', error);
      }
    },
    async removeItem(key) {
      try {
        localStorage.removeItem(key);
        window.dispatchEvent(new CustomEvent('storageChange', { 
          detail: { key, value: null } 
        }));
      } catch (error) {
        console.error('Error removing item from localStorage:', error);
      }
    },
    async getAllKeys() {
      try {
        return Object.keys(localStorage);
      } catch (error) {
        console.error('Error getting keys from localStorage:', error);
        return [];
      }
    },
  };
} else {
  // React Native platform - use AsyncStorage
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  storage = AsyncStorage;
}

export default storage;

// Helper functions for common operations
export const StorageHelpers = {
  async getJSON(key, defaultValue = null) {
    try {
      const value = await storage.getItem(key);
      return value ? JSON.parse(value) : defaultValue;
    } catch (error) {
      console.error(`Error parsing JSON for key ${key}:`, error);
      return defaultValue;
    }
  },

  async setJSON(key, value) {
    try {
      await storage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error stringifying JSON for key ${key}:`, error);
    }
  },

  async getArray(key, defaultValue = []) {
    const value = await this.getJSON(key, defaultValue);
    return Array.isArray(value) ? value : defaultValue;
  },

  async setArray(key, array) {
    await this.setJSON(key, array);
  },

  async addToArray(key, item) {
    const array = await this.getArray(key);
    array.push(item);
    await this.setArray(key, array);
    return array;
  },

  async removeFromArray(key, predicate) {
    const array = await this.getArray(key);
    const filtered = array.filter(predicate);
    await this.setArray(key, filtered);
    return filtered;
  },

  async updateArrayItem(key, id, updates) {
    const array = await this.getArray(key);
    const index = array.findIndex(item => item.id === id);
    if (index !== -1) {
      array[index] = { ...array[index], ...updates };
      await this.setArray(key, array);
    }
    return array;
  },
};


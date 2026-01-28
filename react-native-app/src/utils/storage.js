// Shared Storage Utility for React Native (AsyncStorage)
// This is the React Native version of the storage utility

import AsyncStorage from '@react-native-async-storage/async-storage';

const storage = AsyncStorage;

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


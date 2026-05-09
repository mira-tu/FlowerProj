const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

module.exports = {
  expo: {
    name: 'FlowerForge Admin',
    slug: 'flowerforge-admin',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    splash: {
      resizeMode: 'contain',
      backgroundColor: '#ec4899',
    },
    assetBundlePatterns: ['assets/**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.flowerforge.admin',
      infoPlist: {
        NSCameraUsageDescription: 'This app needs access to your camera to take photos for products and stock items.',
        NSPhotoLibraryUsageDescription: 'This app needs access to your photo library to select images for products and stock items.',
      },
    },
    android: {
      package: 'com.flowerforge.admin',
      adaptiveIcon: {
        backgroundColor: '#ec4899',
        foregroundImage: './assets/adaptive-icon.png',
      },
      permissions: [
        'android.permission.CAMERA',
        'android.permission.RECORD_AUDIO',
      ],
    },
    web: {},
    plugins: [
      [
        'expo-image-picker',
        {
          photosPermission: 'The app accesses your photos to let you select images for products and stock items.',
          cameraPermission: 'The app accesses your camera to let you take photos for products and stock items.',
        },
      ],
      [
        'expo-build-properties',
        {
          android: {
            compileSdkVersion: 34,
            targetSdkVersion: 34,
            minSdkVersion: 23,
          },
        },
      ],
    ],
    extra: {
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: SUPABASE_ANON_KEY,
      eas: {
        projectId: 'dfb3bfbd-931d-414a-9513-5ddb7fc84750',
      },
    },
    owner: 'neneth',
    icon: './assets/icon.png',
  },
};

import React, { useEffect } from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AdminDashboard from './src/screens/AdminDashboard';
import LoginScreen from './src/screens/LoginScreen';
import { initializeAsyncStorage } from './src/utils/mockData';
import Toast from 'react-native-toast-message';

const Stack = createNativeStackNavigator();

function App() {
  // Initialize AsyncStorage with mock data on app start
  useEffect(() => {
    initializeAsyncStorage();
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Login">
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminDashboard"
            component={AdminDashboard}
            options={{ headerShown: false }}
          />
        </Stack.Navigator>
      </NavigationContainer>
      <Toast />
    </View>
  );
}

export default App;


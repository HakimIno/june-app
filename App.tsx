import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';

// Initialize crypto polyfill for React Native
import './src/utils/cryptoUtils';

// Navigation
import AppNavigator from '@/navigation/AppNavigator';

const App: React.FC = () => {
  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <AppNavigator />
    </NavigationContainer>
  );
};

export default App;

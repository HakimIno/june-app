import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';

// Screensx
import HomeScreen from '@/screens/HomeScreen';
// Constants
import { theme, SCREEN_NAMES } from '@/constants';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Main Stack Navigator
const AppNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >

      <Stack.Screen
        name={SCREEN_NAMES.HOME}
        component={HomeScreen}
        options={{
          title: 'June TV',
          headerShown: false,
        }}
      />
      {/* Add more stack screens here */}
    </Stack.Navigator>
  );
};

export default AppNavigator;

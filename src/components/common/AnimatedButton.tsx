import React, { useRef } from 'react';
import { Animated, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import * as Haptics from 'expo-haptics';

interface AnimatedButtonProps extends TouchableOpacityProps {
  children: React.ReactNode;
  hapticType?: 'light' | 'medium' | 'heavy';
  scaleValue?: number;
  onPress?: () => void;
}

export const AnimatedButton: React.FC<AnimatedButtonProps> = ({
  children,
  style,
  hapticType = 'light',
  scaleValue = 0.95,
  onPress,
  ...props
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    // Haptic feedback
    switch (hapticType) {
      case 'light':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'medium':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'heavy':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
    }

    // Scale animation
    Animated.spring(scaleAnim, {
      toValue: scaleValue,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  return (
    <TouchableOpacity
      {...props}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      activeOpacity={1}
    >
      <Animated.View
        style={[
          style,
          {
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
};

import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

interface SimpleCircleProps {
  delay: number;
  size: number;
  initialX: number;
  initialY: number;
}

const SimpleCircle: React.FC<SimpleCircleProps> = ({ delay, size, initialX, initialY }) => {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withTiming(-100, {
          duration: 3000,
          easing: Easing.linear,
        }),
        -1,
        false
      )
    );

    opacity.value = withDelay(
      delay,
      withRepeat(
        withTiming(0.8, {
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true
      )
    );
  }, [delay, translateY, opacity]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
      opacity: opacity.value,
    };
  });

  return (
    <Animated.View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          left: initialX,
          top: initialY,
        },
        animatedStyle,
      ]}
    />
  );
};

interface SimpleFloatingCirclesProps {
  count?: number;
}

const SimpleFloatingCircles: React.FC<SimpleFloatingCirclesProps> = ({ count = 10 }) => {
  const circles = Array.from({ length: count }, (_, index) => ({
    id: index,
    delay: index * 300,
    size: 15 + Math.random() * 10, // 15-25px
    initialX: Math.random() * (width - 30),
    initialY: height + Math.random() * 200,
  }));

  return (
    <View style={styles.container}>
      {circles.map((circle) => (
        <SimpleCircle
          key={circle.id}
          delay={circle.delay}
          size={circle.size}
          initialX={circle.initialX}
          initialY={circle.initialY}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  circle: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
});

export default SimpleFloatingCircles;

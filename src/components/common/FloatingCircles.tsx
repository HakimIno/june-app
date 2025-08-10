import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
  withDelay,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

interface CircleProps {
  size: number;
  delay: number;
  duration: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  opacity: number;
  color: string;
}

const FloatingCircle: React.FC<CircleProps> = ({
  size,
  delay,
  duration,
  startX,
  startY,
  endX,
  endY,
  opacity,
  color,
}) => {
  const progress = useSharedValue(0);
  const scale = useSharedValue(0.5);
  const rotation = useSharedValue(0);

  useEffect(() => {
    // Animation for movement
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, {
          duration,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true
      )
    );

    // Animation for scaling
    scale.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, {
          duration: duration * 0.8,
          easing: Easing.inOut(Easing.quad),
        }),
        -1,
        true
      )
    );

    // Animation for rotation
    rotation.value = withDelay(
      delay,
      withRepeat(
        withTiming(360, {
          duration: duration * 1.5,
          easing: Easing.linear,
        }),
        -1,
        false
      )
    );
  }, [delay, duration, progress, scale, rotation]);

  const animatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(progress.value, [0, 1], [startX, endX]);
    const translateY = interpolate(progress.value, [0, 1], [startY, endY]);
    const scaleValue = interpolate(scale.value, [0.5, 1], [0.8, 1.2]);

    return {
      transform: [
        { translateX },
        { translateY },
        { scale: scaleValue },
        { rotate: `${rotation.value}deg` },
      ],
      opacity: opacity * interpolate(progress.value, [0, 0.5, 1], [0.3, 1, 0.3]),
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
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
};

interface FloatingCirclesProps {
  count?: number;
}

const FloatingCircles: React.FC<FloatingCirclesProps> = ({ count = 20 }) => {
  const circles = Array.from({ length: count }, (_, index) => {
    const size = Math.random() * 20 + 10; // 10-30px
    const delay = Math.random() * 3000; // 0-3s delay
    const duration = Math.random() * 8000 + 4000; // 4-12s duration
    
    // Random start and end positions
    const startX = Math.random() * width;
    const startY = Math.random() * height;
    const endX = Math.random() * width;
    const endY = Math.random() * height;
    
    const opacity = Math.random() * 0.4 + 0.1; // 0.1-0.5 opacity
    
    // Random colors with transparency
    const colors = [
      'rgba(255, 255, 255, 0.3)',
      'rgba(102, 126, 234, 0.4)',
      'rgba(118, 75, 162, 0.3)',
      'rgba(240, 147, 251, 0.4)',
      'rgba(255, 182, 193, 0.3)',
      'rgba(135, 206, 250, 0.4)',
    ];
    const color = colors[Math.floor(Math.random() * colors.length)];

    return {
      id: index,
      size,
      delay,
      duration,
      startX,
      startY,
      endX,
      endY,
      opacity,
      color,
    };
  });

  return (
    <View style={styles.container}>
      {circles.map((circle) => (
        <FloatingCircle
          key={circle.id}
          size={circle.size}
          delay={circle.delay}
          duration={circle.duration}
          startX={circle.startX}
          startY={circle.startY}
          endX={circle.endX}
          endY={circle.endY}
          opacity={circle.opacity}
          color={circle.color}
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
    pointerEvents: 'none', // Allow touches to pass through
  },
  circle: {
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
});

export { FloatingCircles };
export default FloatingCircles;

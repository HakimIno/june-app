import React, { useEffect, useMemo } from 'react';
import { View, Dimensions, ColorValue } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  withTiming,
  withRepeat,
  Easing,
  cancelAnimation,
  useDerivedValue,
  interpolateColor,
  useAnimatedStyle,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

// Enhanced gradient color palettes for smooth transitions
const GRADIENT_PALETTES = {
  aurora: [
    ['#667eea', '#764ba2', '#f093fb'],
    ['#4facfe', '#00f2fe', '#43e97b'],
    ['#43e97b', '#38f9d7', '#667eea'],
    ['#f093fb', '#f5576c', '#4facfe'],
    ['#764ba2', '#667eea', '#38f9d7'],
  ],
  sunset: [
    ['#ff9a9e', '#fecfef', '#ffecd2'],
    ['#ffecd2', '#fcb69f', '#a8edea'],
    ['#a8edea', '#fed6e3', '#fa709a'],
    ['#fa709a', '#fee140', '#ff9a9e'],
    ['#fed6e3', '#fecfef', '#fcb69f'],
  ],
  ocean: [
    ['#667eea', '#764ba2', '#4facfe'],
    ['#4facfe', '#00f2fe', '#43e97b'],
    ['#43e97b', '#38f9d7', '#667eea'],
    ['#38f9d7', '#4facfe', '#764ba2'],
    ['#00f2fe', '#43e97b', '#667eea'],
  ],
  cosmic: [
    ['#8B5CF6', '#EC4899', '#F59E0B'],
    ['#EC4899', '#EF4444', '#8B5CF6'],
    ['#F59E0B', '#10B981', '#EC4899'],
    ['#10B981', '#3B82F6', '#F59E0B'],
    ['#3B82F6', '#8B5CF6', '#10B981'],
  ],
};

// Gradient direction configurations
const GRADIENT_DIRECTIONS = [
  { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  { start: { x: 0, y: 1 }, end: { x: 1, y: 0 } },
  { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
  { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } },
  { start: { x: 0.2, y: 0 }, end: { x: 0.8, y: 1 } },
];

interface FluidBackgroundProps {
  style?: any;
  children?: React.ReactNode;
  interval?: number;
  intensity?: 'low' | 'medium' | 'high';
  palette?: 'aurora' | 'sunset' | 'ocean' | 'cosmic';
}

export const FluidBackground: React.FC<FluidBackgroundProps> = React.memo(({
  style,
  children,
  interval = 8000,
  intensity = 'medium',
  palette = 'aurora'
}) => {
  // Animation values for gradient transitions
  const colorProgress = useSharedValue(0);
  const directionProgress = useSharedValue(0);
  
  // Get current gradient palette
  const gradientSets = GRADIENT_PALETTES[palette];
  
  // Performance configuration
  const config = useMemo(() => {
    const settings = {
      low: { colorDuration: interval * 2, directionDuration: interval * 3 },
      medium: { colorDuration: interval, directionDuration: interval * 1.5 },
      high: { colorDuration: interval * 0.5, directionDuration: interval * 0.8 }
    };
    return settings[intensity];
  }, [intensity, interval]);

  useEffect(() => {
    // Smooth color transitions
    colorProgress.value = withRepeat(
      withTiming(gradientSets.length - 1, {
        duration: config.colorDuration,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1),
      }),
      -1,
      true
    );

    // Gentle direction changes
    directionProgress.value = withRepeat(
      withTiming(GRADIENT_DIRECTIONS.length - 1, {
        duration: config.directionDuration,
        easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
      }),
      -1,
      true
    );

    return () => {
      cancelAnimation(colorProgress);
      cancelAnimation(directionProgress);
    };
  }, [config.colorDuration, config.directionDuration, gradientSets.length]);



  return (
    <View style={style}>
      {/* Multiple gradient layers for smooth transitions */}
      {gradientSets.map((gradientColors, index) => {
        const gradientDirection = GRADIENT_DIRECTIONS[index % GRADIENT_DIRECTIONS.length];
        
        const animatedStyle = useAnimatedStyle(() => {
          'worklet';
          const currentIndex = Math.floor(colorProgress.value);
          const nextIndex = (currentIndex + 1) % gradientSets.length;
          const interpolationFactor = colorProgress.value - currentIndex;
          
          let opacity = 0;
          
          if (index === currentIndex) {
            opacity = 1 - interpolationFactor;
          } else if (index === nextIndex) {
            opacity = interpolationFactor;
          }
          
          // Add subtle breathing effect
          opacity *= (0.85 + Math.sin(colorProgress.value * Math.PI * 0.3) * 0.15);
          
          return { opacity };
        });
        
        return (
          <Animated.View
            key={index}
            style={[
              {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              },
              animatedStyle,
            ]}
          >
            <LinearGradient
              colors={gradientColors as [ColorValue, ColorValue, ...ColorValue[]]}
              style={{ flex: 1 }}
              start={gradientDirection.start}
              end={gradientDirection.end}
            />
          </Animated.View>
        );
      })}

      {/* Subtle overlay for depth and texture */}
      <Animated.View 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.05)',
            'transparent',
            'rgba(0,0,0,0.05)',
            'transparent',
          ]}
          style={{ flex: 1 }}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>

      {/* Dynamic directional overlay */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          },
          useAnimatedStyle(() => {
            'worklet';
            return {
              opacity: 0.1 + Math.sin(directionProgress.value * Math.PI * 0.5) * 0.05,
            };
          }),
        ]}
      >
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.1)', 'transparent']}
          style={{ flex: 1 }}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
        />
      </Animated.View>

      {/* Content layer */}
      <View style={{ flex: 1, zIndex: 10, position: 'relative' }}>
        {children}
      </View>
    </View>
  );
});

FluidBackground.displayName = 'FluidBackground';

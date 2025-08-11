import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, View, AppState } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { detectDevicePerformance, BatteryOptimization } from '../../utils/performanceUtils';

const { width, height } = Dimensions.get('window');

interface Particle {
  id: number;
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
  color: string;
  size: number;
  animationRef?: any;
}

interface FloatingParticlesProps {
  count?: number;
  colors?: string[];
  isActive?: boolean;
  lowPowerMode?: boolean;
}

export const FloatingParticles: React.FC<FloatingParticlesProps> = ({
  count = 15,
  colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe'],
  isActive = true,
  lowPowerMode = false,
}) => {
  const particlesRef = useRef<Particle[]>([]);
  const [appState, setAppState] = useState<'active' | 'background' | 'inactive' | 'unknown' | 'extension'>(AppState.currentState);
  const animationsRef = useRef<any[]>([]);

  // Detect device performance and optimize accordingly
  const devicePerformance = detectDevicePerformance();
  const shouldUseLowPower = lowPowerMode || devicePerformance.shouldUseLowPowerMode;

  // Optimize particle count based on performance mode and device capabilities
  const optimizedCount = BatteryOptimization.getOptimalParticleCount(
    count,
    shouldUseLowPower,
    false // You can pass isVideoActive from props if needed
  );

  const animationDuration = BatteryOptimization.getOptimalAnimationDuration(
    12000,
    shouldUseLowPower
  );

  useEffect(() => {
    const handleAppStateChange = (nextAppState: 'active' | 'background' | 'inactive' | 'unknown' | 'extension') => {
      setAppState(nextAppState);

      // Pause animations when app goes to background
      if (nextAppState === 'background') {
        animationsRef.current.forEach(animation => animation?.stop());
      } else if (nextAppState === 'active' && isActive) {
        // Animations will be restarted by the main useEffect
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [isActive]);

  useEffect(() => {
    // Clear existing animations
    animationsRef.current.forEach(animation => animation?.stop());
    animationsRef.current = [];

    // Initialize particles with optimized count
    particlesRef.current = Array.from({ length: optimizedCount }, (_, index) => ({
      id: index,
      x: new Animated.Value(Math.random() * width),
      y: new Animated.Value(Math.random() * height),
      opacity: new Animated.Value(Math.random() * 0.4 + 0.2),
      scale: new Animated.Value(Math.random() * 0.4 + 0.4),
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 6 + 8,
    }));

    const animateParticles = () => {
      particlesRef.current.forEach((particle, index) => {
        const baseDuration = animationDuration + (Math.random() * 6000); // More variation
        const delay = Math.random() * 1000;

        const floatingAnimation = Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(particle.y, {
              toValue: -100,
              duration: baseDuration,
              useNativeDriver: true,
            }),
            Animated.timing(particle.y, {
              toValue: height + 100,
              duration: 100,
              useNativeDriver: true,
            }),
          ]),
          { iterations: -1 }
        );

        // Simplified horizontal drift
        const driftAnimation = Animated.loop(
          Animated.timing(particle.x, {
            toValue: Math.random() * width,
            duration: baseDuration / 3,
            useNativeDriver: true,
          }),
          { iterations: -1 }
        );

        // Combined opacity and scale animation (more efficient)
        const pulseAnimation = Animated.loop(
          Animated.sequence([
            Animated.parallel([
              Animated.timing(particle.opacity, {
                toValue: 0.6,
                duration: 4000,
                useNativeDriver: true,
              }),
              Animated.timing(particle.scale, {
                toValue: 0.8,
                duration: 4000,
                useNativeDriver: true,
              }),
            ]),
            Animated.parallel([
              Animated.timing(particle.opacity, {
                toValue: 0.2,
                duration: 4000,
                useNativeDriver: true,
              }),
              Animated.timing(particle.scale, {
                toValue: 0.4,
                duration: 4000,
                useNativeDriver: true,
              }),
            ]),
          ]),
          { iterations: -1 }
        );

        // Store animation references for cleanup
        animationsRef.current.push(floatingAnimation, driftAnimation, pulseAnimation);

        // Start animations
        floatingAnimation.start();
        driftAnimation.start();
        pulseAnimation.start();
      });
    };

    if (isActive && appState === 'active') {
      animateParticles();
    }

    // Cleanup function
    return () => {
      animationsRef.current.forEach(animation => animation?.stop());
      animationsRef.current = [];
    };
  }, [optimizedCount, isActive, shouldUseLowPower, appState, animationDuration]);

  // Don't render if inactive or app is in background
  if (!isActive || appState !== 'active') return null;

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1,
        pointerEvents: 'none' // Prevent interfering with touch events
      }}
    >
      {particlesRef.current.map((particle) => (
        <Animated.View
          key={particle.id}
          style={{
            position: 'absolute',
            width: particle.size,
            height: particle.size,
            borderRadius: particle.size / 2,
            transform: [
              { translateX: particle.x },
              { translateY: particle.y },
              { scale: particle.scale },
            ],
            opacity: particle.opacity,
          }}
        >
          {shouldUseLowPower ? (
            // Simple colored circle for low power mode
            <View
              style={{
                width: '100%',
                height: '100%',
                borderRadius: particle.size / 2,
                backgroundColor: particle.color,
                opacity: 0.6,
              }}
            />
          ) : (
            // Full gradient for normal mode
            <LinearGradient
              colors={[particle.color, `${particle.color}80`]}
              style={{
                width: '100%',
                height: '100%',
                borderRadius: particle.size / 2,
              }}
            />
          )}
        </Animated.View>
      ))}
    </View>
  );
};

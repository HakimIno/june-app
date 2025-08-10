import { useRef } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { screenDimensions } from '../utils/responsiveUtils';

export const useSwipeGesture = (onSwipeComplete: () => void) => {
  // Reanimated shared values
  const translateX = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const rotation = useSharedValue(0);

  // Gesture refs
  const panGestureRef = useRef(null);

  // Gesture handler for smooth swipe gestures
  const panGesture = Gesture.Pan()
    .onStart(() => {
      // Light haptic feedback on gesture start
      runOnJS(Haptics.selectionAsync)();
    })
    .onUpdate((event) => {
      // Only allow right swipes (positive translateX)
      if (event.translationX > 0) {
        translateX.value = event.translationX;

        // Add rotation and scale effects based on swipe distance
        const progress = Math.min(event.translationX / (screenDimensions.width * 0.6), 1);
        rotation.value = interpolate(progress, [0, 1], [0, 15], Extrapolate.CLAMP);
        scale.value = interpolate(progress, [0, 1], [1, 0.95], Extrapolate.CLAMP);
        opacity.value = interpolate(progress, [0, 1], [1, 0.8], Extrapolate.CLAMP);
      }
    })
    .onEnd((event) => {
      const shouldSwipe = event.translationX > screenDimensions.width * 0.25 && event.velocityX > 0;

      if (shouldSwipe) {
        // Complete the swipe animation
        translateX.value = withSpring(screenDimensions.width * 1.2, {
          velocity: event.velocityX,
          stiffness: 60,
          damping: 15,
        }, () => {
          // Reset all values after animation
          translateX.value = 0;
          rotation.value = 0;
          scale.value = 1;
          opacity.value = 1;
          runOnJS(onSwipeComplete)();
        });
      } else {
        // Snap back to original position
        translateX.value = withSpring(0, {
          stiffness: 100,
          damping: 15,
        });
        rotation.value = withSpring(0);
        scale.value = withSpring(1);
        opacity.value = withSpring(1);
      }
    });

  // Animated styles for reanimated
  const animatedCardStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { rotate: `${rotation.value}deg` },
        { scale: scale.value },
      ],
      opacity: opacity.value,
    };
  });

  const triggerProgrammaticSwipe = () => {
    translateX.value = withSpring(screenDimensions.width * 1.2, {
      stiffness: 60,
      damping: 15,
    }, () => {
      translateX.value = 0;
      rotation.value = 0;
      scale.value = 1;
      opacity.value = 1;
      runOnJS(onSwipeComplete)();
    });
  };

  return {
    panGestureRef,
    panGesture,
    animatedCardStyle,
    triggerProgrammaticSwipe,
  };
};

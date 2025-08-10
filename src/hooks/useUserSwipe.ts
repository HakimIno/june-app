import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { SwipeState } from '../types/user';
import { mockUsers } from '../constants/mockData';

export const useUserSwipe = () => {
  const [swipeState, setSwipeState] = useState<SwipeState>({
    currentUserIndex: 0,
    nextUserIndex: 1,
    isSwipeMode: false,
  });

  // Helper function to handle next user selection
  const selectNextUser = () => {
    setSwipeState(prev => {
      const newCurrentIndex = (prev.currentUserIndex + 1) % mockUsers.length;
      const newNextIndex = (newCurrentIndex + 1) % mockUsers.length;

      return {
        currentUserIndex: newCurrentIndex,
        nextUserIndex: newNextIndex,
        isSwipeMode: false,
      };
    });

    // Trigger haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const currentUser = mockUsers[swipeState.currentUserIndex];
  const nextUser = mockUsers[swipeState.nextUserIndex];

  return {
    swipeState,
    currentUser,
    nextUser,
    selectNextUser,
  };
};

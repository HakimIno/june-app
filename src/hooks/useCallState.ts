import { useState, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { CallState } from '../types/user';

export const useCallState = () => {
  const [callState, setCallState] = useState<CallState>({
    duration: 312, // 5:12 in seconds
    isMuted: false,
    isVideoOn: true,
    isActive: true,
  });

  // Timer for call duration
  useEffect(() => {
    const timer = setInterval(() => {
      setCallState(prev => ({ ...prev, duration: prev.duration + 1 }));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleMute = () => {
    setCallState(prev => ({ ...prev, isMuted: !prev.isMuted }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleVideo = () => {
    setCallState(prev => ({ ...prev, isVideoOn: !prev.isVideoOn }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleEndCall = () => {
    setCallState(prev => ({ ...prev, isActive: false }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  return {
    callState,
    handleMute,
    handleVideo,
    handleEndCall,
  };
};

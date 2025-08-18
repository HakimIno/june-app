import { BlurView } from 'expo-blur';
import React, { useMemo } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { RTCView } from 'react-native-webrtc';
import { FloatingParticles, FluidBackground } from '../common';
import { homeScreenStyles } from '../../styles/homeScreenStyles';
import { User } from '../../types/user';
import { detectDevicePerformance } from '../../utils/performanceUtils';



interface MainVideoAreaProps {
  currentUser: User;
  nextUser: User | null;
  isSwipeMode: boolean;
  panGestureRef: React.RefObject<any>;
  panGesture: any;
  animatedCardStyle: any;
  // WebRTC props
  remoteStream?: any;
  isConnected: boolean;
  isConnecting: boolean;
  isSearching: boolean;
  // Video quality props
  getCurrentVideoQuality?: () => 'high' | 'medium' | 'low';
  getNetworkStats?: () => {
    rtt: number;
    packetsLost: number;
    bandwidth: number;
    jitter: number;
  };
  showVideoQualityIndicator?: boolean;
}

export const MainVideoArea: React.FC<MainVideoAreaProps> = ({
  currentUser,
  nextUser,
  isSwipeMode,
  panGestureRef,
  panGesture,
  animatedCardStyle,
  remoteStream,
  isConnected,
  isConnecting,
  isSearching,
  getCurrentVideoQuality,
  getNetworkStats,
  showVideoQualityIndicator = true,
}) => {
  const devicePerformance = detectDevicePerformance();

  // Dynamic configuration based on connection state
  const backgroundConfig = useMemo(() => {
    if (isConnecting || isSearching) {
      return {
        intensity: 'high' as const,
        interval: 30000,
        palette: 'ocean' as const
      };
    }
    
    if (remoteStream) {
      return {
        intensity: devicePerformance.shouldUseLowPowerMode ? 'low' : 'medium' as const,
        interval: 30000, 
        palette: 'aurora' as const
      };
    }
    
    return {
      intensity: devicePerformance.shouldUseLowPowerMode ? 'low' : 'medium' as const,
      interval: 30000,
      palette: 'aurora' as const
    };
  }, [isConnecting, isSearching, remoteStream, devicePerformance.shouldUseLowPowerMode]);

  return (
    <View style={homeScreenStyles.videoContainer}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[homeScreenStyles.mainVideoContainer]}>
          <FluidBackground
            style={homeScreenStyles.mainVideo}
            interval={backgroundConfig.interval}
            intensity={backgroundConfig.intensity as any}
            palette={backgroundConfig.palette as any}
          >
            <View style={homeScreenStyles.videoFrame}>
              {/* Background Effects - reduced when video is active */}
              {/* {(!remoteStream || isSearching || isConnecting) && (
                <FloatingParticles
                  count={devicePerformance.recommendedParticleCount / (remoteStream ? 4 : 2)}
                  colors={['#4facfe', '#00f2fe', '#43e97b', '#38f9d7']}
                  isActive={!remoteStream || isSearching || isConnecting}
                  lowPowerMode={devicePerformance.shouldUseLowPowerMode}
                />
              )} */}

              {/* Remote video stream or placeholder */}
              {remoteStream ? (
                <RTCView
                  key={`remote-${remoteStream._id}`}
                  streamURL={remoteStream.toURL()}
                  style={[homeScreenStyles.videoBackground, {
                    backgroundColor: 'transparent',
                  }]}
                  objectFit="cover"
                  zOrder={2}
                  mirror={false}
                  // Android-friendly configuration
                  {...(Platform.OS === 'android' ? {
                    renderingMode: 'hardware',
                  } : {
                    renderingMode: 'software', // iOS fallback
                  })}
                />
              ) : null}

              {/* Connection status overlay */}
              {(isConnecting || isSearching) && !remoteStream && (
                <View style={homeScreenStyles.connectionOverlay}>
                  <ActivityIndicator size="large" color="#fff" />
                  <Text style={homeScreenStyles.connectionText}>
                    {isSearching ? 'กำลังหาเพื่อนใหม่...' : 'กำลังเชื่อมต่อ...'}
                  </Text>
                </View>
              )}

            </View>
          </FluidBackground>
        </Animated.View>
      </GestureDetector>

      {/* Next User Preview */}
      {nextUser && (
        <View style={homeScreenStyles.nextUserPreview}>
          <BlurView intensity={30} style={homeScreenStyles.nextUserCard}>
            <View style={homeScreenStyles.nextUserAvatar}>
              <Text style={homeScreenStyles.nextUserAvatarText}>{nextUser.avatar}</Text>
            </View>
            <View style={homeScreenStyles.nextUserInfoContainer}>
              <Text style={homeScreenStyles.nextUserName}>{nextUser.name}</Text>
              <Text style={homeScreenStyles.nextUserInfo}>{nextUser.age} • {nextUser.location}</Text>
            </View>
          </BlurView>
        </View>
      )}
    </View>
  );
};
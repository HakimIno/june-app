import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { RTCView } from 'react-native-webrtc';
import { FloatingParticles } from '../common';
import { VideoQualityIndicator } from './VideoQualityIndicator';
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

  return (
    <View style={homeScreenStyles.videoContainer}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[homeScreenStyles.mainVideoContainer, animatedCardStyle]}>
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={homeScreenStyles.mainVideo}
          >
            <View style={homeScreenStyles.videoFrame}>
              {/* Background Effects */}
              <FloatingParticles 
                count={remoteStream ? devicePerformance.recommendedParticleCount / 2 : devicePerformance.recommendedParticleCount}
                colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
                isActive={!remoteStream || isSearching || isConnecting}
                lowPowerMode={devicePerformance.shouldUseLowPowerMode}
              />
              
              {/* Remote video stream or placeholder */}
              {remoteStream ? (
                <RTCView
                  key={`remote-${remoteStream._id}`}
                  streamURL={remoteStream.toURL()}
                  style={[homeScreenStyles.videoBackground, {
                    // Enhanced video quality settings
                    backgroundColor: '#000000',
                    borderRadius: 0,
                  }]}
                  objectFit="cover"
                  zOrder={2}
                  mirror={false}
                  // Enable hardware acceleration if available
                  {...(Platform.OS === 'ios' ? {
                    renderingMode: 'hardware',
                    videoTrackId: remoteStream.getVideoTracks()[0]?.id,
                  } : {})}
                />
              ) : (
                <LinearGradient
                  colors={['#667eea', '#764ba2', '#f093fb']}
                  style={homeScreenStyles.videoBackground}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                />
              )}

              {/* Video Quality Indicator */}
              {showVideoQualityIndicator && remoteStream && getCurrentVideoQuality && getNetworkStats && (
                <VideoQualityIndicator
                  currentQuality={getCurrentVideoQuality()}
                  networkStats={getNetworkStats()}
                  showNetworkStats={__DEV__}
                />
              )}

              {/* Connection status overlay */}
              {(isConnecting || isSearching) && (
                <View style={homeScreenStyles.connectionOverlay}>
                  <ActivityIndicator size="large" color="#fff" />
                  <Text style={homeScreenStyles.connectionText}>
                    {isSearching ? 'กำลังหาเพื่อนใหม่...' : 'กำลังเชื่อมต่อ...'}
                  </Text>
                </View>
              )}

            </View>
          </LinearGradient>
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

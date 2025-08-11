import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { RTCView } from 'react-native-webrtc';
import { FloatingParticles } from '../common';
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
                  style={homeScreenStyles.videoBackground}
                  objectFit="cover"
                  zOrder={2}
                  mirror={false}
                />
              ) : (
                <LinearGradient
                  colors={['#667eea', '#764ba2', '#f093fb']}
                  style={homeScreenStyles.videoBackground}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
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

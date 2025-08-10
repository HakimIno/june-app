import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, AntDesign } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { User } from '../../types/user';
import { homeScreenStyles } from '../../styles/homeScreenStyles';
import { responsiveSize } from '../../utils/responsiveUtils';

interface MainVideoAreaProps {
  currentUser: User;
  nextUser: User | null;
  isSwipeMode: boolean;
  panGestureRef: React.RefObject<any>;
  panGesture: any;
  animatedCardStyle: any;
}

export const MainVideoArea: React.FC<MainVideoAreaProps> = ({
  currentUser,
  nextUser,
  isSwipeMode,
  panGestureRef,
  panGesture,
  animatedCardStyle,
}) => {
  return (
    <View style={homeScreenStyles.videoContainer}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[homeScreenStyles.mainVideoContainer, animatedCardStyle]}>
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={homeScreenStyles.mainVideo}
          >
            <View style={homeScreenStyles.videoFrame}>
              {/* Simulated video background */}
              <LinearGradient
                colors={['#f093fb', '#f5576c']}
                style={homeScreenStyles.videoBackground}
              />

              {/* Interests Tags */}
              <View style={homeScreenStyles.interestsContainer}>
                {currentUser?.interests.map((interest, index) => (
                  <BlurView key={index} intensity={30} style={homeScreenStyles.interestTag}>
                    <Text style={homeScreenStyles.interestText}>{interest}</Text>
                  </BlurView>
                ))}
              </View>

              {/* Audio indicator */}
              <BlurView intensity={80} style={homeScreenStyles.audioIndicator}>
                <Ionicons name="mic" size={responsiveSize(16)} color="#fff" />
                <View style={homeScreenStyles.audioWaves}>
                  <View style={[homeScreenStyles.audioWave, { height: responsiveSize(8) }]} />
                  <View style={[homeScreenStyles.audioWave, { height: responsiveSize(12) }]} />
                  <View style={[homeScreenStyles.audioWave, { height: responsiveSize(6) }]} />
                  <View style={[homeScreenStyles.audioWave, { height: responsiveSize(10) }]} />
                </View>
              </BlurView>

              {/* Swipe Hint */}
              {!isSwipeMode && (
                <View style={homeScreenStyles.swipeHint}>
                  <AntDesign name="arrowright" size={responsiveSize(24)} color="rgba(255,255,255,0.8)" />
                  <Text style={homeScreenStyles.swipeHintText}>ปัดขวาเพื่อหาเพื่อนใหม่</Text>
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

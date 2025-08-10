import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { CallState } from '../../types/user';
import { selfVideoStyles } from '../../styles/selfVideoStyles';
import { responsiveSize } from '../../utils/responsiveUtils';

interface SelfVideoAreaProps {
  callState: CallState;
  onMute: () => void;
  onVideo: () => void;
  onEndCall: () => void;
  onNext: () => void;
}

export const SelfVideoArea: React.FC<SelfVideoAreaProps> = ({
  callState,
  onMute,
  onVideo,
  onEndCall,
  onNext,
}) => {
  return (
    <View style={selfVideoStyles.selfVideoContainer}>
      <View style={selfVideoStyles.selfVideo}>
        <LinearGradient
          colors={['#ffeaa7', '#fab1a0']}
          style={selfVideoStyles.selfVideoBackground}
        />

        <View style={selfVideoStyles.selfUserInfo}>
          <View style={selfVideoStyles.selfAvatar}>
            <Text style={selfVideoStyles.selfAvatarText}>Y</Text>
          </View>
          <Text style={selfVideoStyles.selfUserName}>You</Text>
        </View>

        {/* Control buttons overlay on self video */}
        <View style={selfVideoStyles.controlsOverlay}>
          <TouchableOpacity
            style={[
              selfVideoStyles.controlButton,
              callState.isMuted ? selfVideoStyles.mutedButton : selfVideoStyles.activeButton
            ]}
            onPress={onMute}
          >
            <Ionicons
              name={callState.isMuted ? "mic-off" : "mic"}
              size={responsiveSize(20)}
              color={callState.isMuted ? "#FF4757" : "#2ecc71"}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              selfVideoStyles.controlButton,
              !callState.isVideoOn ? selfVideoStyles.mutedButton : selfVideoStyles.activeButton
            ]}
            onPress={onVideo}
          >
            <Ionicons
              name={callState.isVideoOn ? "videocam" : "videocam-off"}
              size={responsiveSize(20)}
              color={!callState.isVideoOn ? "#FF4757" : "#2ecc71"}
            />
          </TouchableOpacity>

          <TouchableOpacity style={[selfVideoStyles.controlButton, selfVideoStyles.secondaryButton]}>
            <Ionicons name="settings-outline" size={responsiveSize(20)} color="#3498db" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[selfVideoStyles.controlButton, selfVideoStyles.secondaryButton]} 
            onPress={onNext}
          >
            <Ionicons name="arrow-forward" size={responsiveSize(20)} color="#3498db" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[selfVideoStyles.controlButton, selfVideoStyles.endCallButton]}
            onPress={onEndCall}
          >
            <Ionicons name="call" size={responsiveSize(20)} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity style={[selfVideoStyles.controlButton, selfVideoStyles.audioLevelButton]}>
            <MaterialIcons name="graphic-eq" size={responsiveSize(20)} color="#f39c12" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

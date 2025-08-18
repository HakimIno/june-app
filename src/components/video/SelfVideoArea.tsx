import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { selfVideoStyles } from '../../styles/selfVideoStyles';
import { CallState } from '../../types/user';
import { responsiveSize } from '../../utils/responsiveUtils';

interface SelfVideoAreaProps {
  callState: CallState;
  onMute: () => void;
  onVideo: () => void;
  onEndCall: () => void;
  onNext: () => void;
  // WebRTC props
  localStream?: any;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  onSwitchCamera?: () => void;
  onBoostAudio?: () => void;
}

export const SelfVideoArea: React.FC<SelfVideoAreaProps> = ({
  callState,
  onMute,
  onVideo,
  onEndCall,
  onNext,
  localStream,
  isVideoEnabled,
  isAudioEnabled,
  onSwitchCamera,
  onBoostAudio,
}) => {
  // Force re-render when stream changes
  const [forceUpdate, setForceUpdate] = React.useState(0);
  React.useEffect(() => {
    if (localStream) {
      setForceUpdate(prev => prev + 1);
    }
  }, [localStream]);

  return (
    <View style={selfVideoStyles.selfVideoContainer}>
      <View style={selfVideoStyles.selfVideo}>
        {/* Local video stream or placeholder - Force render with key */}
        {localStream && localStream.toURL ? (
          <RTCView
            key={`local-${localStream._id}-${forceUpdate}`}
            streamURL={localStream.toURL()}
            style={selfVideoStyles.selfVideoBackground}
            objectFit="cover"
            mirror={true}
            zOrder={1}
          />
        ) : (
          <LinearGradient
            colors={['#ffeaa7', '#fab1a0']}
            style={selfVideoStyles.selfVideoBackground}
          >
            <View style={{ 
              position: 'absolute', 
              bottom: 10, 
              left: 10, 
              right: 10,
              alignItems: 'center'
            }}>
              <Text style={{ color: '#fff', fontSize: 12, marginBottom: 5 }}>
                {localStream ? 'Stream Error' : 'No Camera'}
              </Text>
              <TouchableOpacity 
                style={{
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 5
                }}
                onPress={() => {
                  console.log('Manual camera refresh requested');
                  setForceUpdate(prev => prev + 1);
                }}
              >
                <Text style={{ color: '#fff', fontSize: 10 }}>Test Camera</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        )}
        
        {/* Video disabled overlay */}
        {localStream && !isVideoEnabled && (
          <View style={[selfVideoStyles.selfVideoBackground, { backgroundColor: 'rgba(0,0,0,1)', position: 'absolute', justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="videocam-off" size={responsiveSize(30)} color="#fff" />
            <Text style={{ color: '#fff', marginTop: 8, fontSize: responsiveSize(12) }}>Video Off</Text>
          </View>
        )}

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
              !isAudioEnabled ? selfVideoStyles.mutedButton : selfVideoStyles.activeButton
            ]}
            onPress={onMute}
          >
            <Ionicons
              name={isAudioEnabled ? "mic" : "mic-off"}
              size={responsiveSize(20)}
              color={isAudioEnabled ? "#2ecc71" : "#FF4757"}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              selfVideoStyles.controlButton,
              !isVideoEnabled ? selfVideoStyles.mutedButton : selfVideoStyles.activeButton
            ]}
            onPress={onVideo}
          >
            <Ionicons
              name={isVideoEnabled ? "videocam" : "videocam-off"}
              size={responsiveSize(20)}
              color={isVideoEnabled ? "#2ecc71" : "#FF4757"}
            />
          </TouchableOpacity>

          {onSwitchCamera && (
            <TouchableOpacity 
              style={[selfVideoStyles.controlButton, selfVideoStyles.secondaryButton]}
              onPress={onSwitchCamera}
            >
              <Ionicons name="camera-reverse-outline" size={responsiveSize(20)} color="#3498db" />
            </TouchableOpacity>
          )}

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

          {onBoostAudio && (
            <TouchableOpacity 
              style={[selfVideoStyles.controlButton, selfVideoStyles.audioLevelButton]}
              onPress={onBoostAudio}
            >
              <MaterialIcons name="volume-up" size={responsiveSize(20)} color="#f39c12" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

import React from 'react';
import { SafeAreaView, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MainVideoArea, SelfVideoArea } from '../components/video';
import { useCallState, useSwipeGesture, useUserSwipe } from '../hooks';
import { useWebRTC } from '../hooks/useWebRTC';
import { homeScreenStyles } from '../styles/homeScreenStyles';

const HomeScreen = () => {
  // Custom hooks
  const { callState, handleMute, handleVideo, handleEndCall } = useCallState();
  const { swipeState, currentUser, nextUser, selectNextUser } = useUserSwipe();
  const { 
    panGestureRef, 
    panGesture, 
    animatedCardStyle, 
    triggerProgrammaticSwipe 
  } = useSwipeGesture(selectNextUser);

  // WebRTC hook
  const {
    localStream,
    remoteStream,
    isConnected,
    isConnecting,
    isSearching,
    isAudioEnabled,
    isVideoEnabled,
    signalingState,
    findMatch,
    nextUser: nextWebRTCUser,
    endCall,
    toggleAudio,
    toggleVideo,
    switchCamera,
    boostAudio,
    // Video quality controls
    getCurrentVideoQuality,
    getNetworkStats,
  } = useWebRTC();

  const handleNext = () => {
    // Use WebRTC next user instead of mock swipe
    nextWebRTCUser();
  };

  const handleMuteWebRTC = () => {
    toggleAudio();
    handleMute(); // Keep the original haptic feedback
  };

  const handleVideoWebRTC = () => {
    toggleVideo();
    handleVideo(); // Keep the original haptic feedback
  };

  const handleEndCallWebRTC = () => {
    endCall();
    handleEndCall(); // Keep the original haptic feedback
  };

  // Debug localStream
  React.useEffect(() => {
    console.log('HomeScreen - LocalStream status:', {
      hasLocalStream: !!localStream,
      streamId: localStream?._id || 'no stream',
      isVideoEnabled,
      isAudioEnabled,
      isConnected,
      isConnecting,
      hasRemoteStream: !!remoteStream,
      remoteStreamId: remoteStream?._id || 'no remote'
    });
  }, [localStream, isVideoEnabled, isAudioEnabled, isConnected, isConnecting, remoteStream]);

  // Auto start searching when signaling server is connected (only once)
  React.useEffect(() => {
    // Check if we're connected to signaling server but not in a call or searching
    const signalingConnected = signalingState?.isConnected;
    const webrtcConnected = isConnected;
    const webrtcConnecting = isConnecting;
    const currentlySearching = isSearching;
    const hasRoom = signalingState?.currentRoomId;
    
    console.log('Connection status check:', {
      signalingConnected,
      webrtcConnected,
      webrtcConnecting,
      currentlySearching,
      hasRoom
    });
    
    // Only search if we're connected to signaling but not connected to WebRTC, not searching, and not in a room
    if (signalingConnected && !webrtcConnected && !webrtcConnecting && !currentlySearching && !hasRoom) {
      console.log('Starting search for match...');
      findMatch();
    }
  }, [signalingState?.isConnected, signalingState?.currentRoomId, isConnected, isConnecting, isSearching, findMatch]);


  console.log('====================================');
  console.log("remoteStream",remoteStream);
  console.log('====================================');

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={homeScreenStyles.container}>

        {/* Main Video Area with Swipe */}
        <MainVideoArea
          currentUser={currentUser}
          nextUser={nextUser}
          isSwipeMode={swipeState.isSwipeMode}
          panGestureRef={panGestureRef}
          panGesture={panGesture}
          animatedCardStyle={animatedCardStyle}
          remoteStream={remoteStream}
          isConnected={isConnected}
          isConnecting={isConnecting}
          isSearching={isSearching}
          getCurrentVideoQuality={getCurrentVideoQuality}
          getNetworkStats={getNetworkStats}
          showVideoQualityIndicator={true}
        />

        {/* Self Video - Picture in Picture */}
        <SelfVideoArea
          callState={callState}
          onMute={handleMuteWebRTC}
          onVideo={handleVideoWebRTC}
          onEndCall={handleEndCallWebRTC}
          onNext={handleNext}
          localStream={localStream}
          isVideoEnabled={isVideoEnabled}
          isAudioEnabled={isAudioEnabled}
          onSwitchCamera={switchCamera}
          onBoostAudio={boostAudio}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
};



export default HomeScreen;
import React from 'react';
import { StatusBar, SafeAreaView } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MainVideoArea, SelfVideoArea } from '../components/video';
import { useCallState, useSwipeGesture, useUserSwipe } from '../hooks';
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

  const handleNext = () => {
    triggerProgrammaticSwipe();
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={homeScreenStyles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />

        {/* Main Video Area with Swipe */}
        <MainVideoArea
          currentUser={currentUser}
          nextUser={nextUser}
          isSwipeMode={swipeState.isSwipeMode}
          panGestureRef={panGestureRef}
          panGesture={panGesture}
          animatedCardStyle={animatedCardStyle}
        />

        {/* Self Video - Picture in Picture */}
        <SelfVideoArea
          callState={callState}
          onMute={handleMute}
          onVideo={handleVideo}
          onEndCall={handleEndCall}
          onNext={handleNext}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
};



export default HomeScreen;
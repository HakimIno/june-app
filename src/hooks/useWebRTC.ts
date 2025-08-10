import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { MediaStream } from 'react-native-webrtc';
import { signalingService } from '../services/signalingService';
import { webRTCService } from '../services/webrtcService';
import { SignalingState, UserSession, WebRTCState } from '../types/webrtc';

export const useWebRTC = () => {
  const [webrtcState, setWebRTCState] = useState<WebRTCState>({
    isConnecting: false,
    isConnected: false,
    hasLocalStream: false,
    hasRemoteStream: false,
  });

  const [signalingState, setSignalingState] = useState<SignalingState>({
    isConnected: false,
    isSearching: false,
  });

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);

  const userSessionRef = useRef<UserSession>({
    userId: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    isReady: false,
    preferences: {
      videoEnabled: true,
      audioEnabled: true,
    },
  });

  // Initialize WebRTC and Signaling services
  const initialize = useCallback(async () => {
    try {
      console.log('Initializing WebRTC services...');
      
      // Initialize WebRTC service first
      await webRTCService.initialize();
      
      // Connect to signaling server
      await signalingService.connect(userSessionRef.current);
      
      console.log('WebRTC services initialized successfully');
    } catch (error) {
      console.error('Failed to initialize WebRTC services:', error);
      Alert.alert(
        'ข้อผิดพลาด',
        'ไม่สามารถเริ่มต้นระบบได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตและสิทธิ์กล้อง/ไมโครโฟน',
        [{ text: 'ตกลง' }]
      );
    }
  }, []);

  // Start searching for a match
  const findMatch = useCallback(() => {
    if (!signalingService.isConnected()) {
      Alert.alert('ข้อผิดพลาด', 'ไม่ได้เชื่อมต่อกับเซิร์ฟเวอร์');
      return;
    }

    signalingService.findMatch(userSessionRef.current.preferences);
  }, []);

  // End current call and find next user
  const nextUser = useCallback(() => {
    webRTCService.endCall();
    signalingService.leaveCurrentMatch();
    
    // Start searching for new match after a brief delay
    setTimeout(() => {
      findMatch();
    }, 1000);
  }, [findMatch]);

  // End call completely
  const endCall = useCallback(() => {
    webRTCService.endCall();
    signalingService.leaveCurrentMatch();
  }, []);

  // Toggle audio
  const toggleAudio = useCallback(() => {
    const newState = webRTCService.toggleAudio();
    setIsAudioEnabled(newState);
    return newState;
  }, []);

  // Toggle video
  const toggleVideo = useCallback(() => {
    const newState = webRTCService.toggleVideo();
    setIsVideoEnabled(newState);
    return newState;
  }, []);

  // Switch camera
  const switchCamera = useCallback(async () => {
    try {
      await webRTCService.switchCamera();
    } catch (error) {
      console.error('Failed to switch camera:', error);
    }
  }, []);

  const boostAudio = useCallback(() => {
    try {
      webRTCService.boostAudioVolume();
    } catch (error) {
      console.error('Failed to boost audio:', error);
    }
  }, []);

  // Cleanup
  const cleanup = useCallback(() => {
    webRTCService.dispose();
    signalingService.disconnect();
  }, []);

  // Setup event listeners
  useEffect(() => {
    // WebRTC service listeners
    const handleLocalStream = (stream: MediaStream) => {
      console.log('Local stream received in hook:', {
        streamId: stream._id,
        hasToURL: typeof stream.toURL === 'function',
        tracks: stream.getTracks?.()?.length || 0
      });
      setLocalStream(stream);
      setWebRTCState(prev => ({ ...prev, hasLocalStream: true, localStream: stream }));
      
      // Set initial audio/video states from actual tracks
      const audioEnabled = webRTCService.getAudioEnabled();
      const videoEnabled = webRTCService.getVideoEnabled();
      setIsAudioEnabled(audioEnabled);
      setIsVideoEnabled(videoEnabled);
      console.log('Initial track states:', { audioEnabled, videoEnabled });
    };

    const handleRemoteStream = (stream: MediaStream) => {
      console.log('Remote stream received in hook');
      
      // Apply audio processing for better quality
      const audioTracks = stream.getAudioTracks();
      audioTracks.forEach(track => {
        console.log('Remote audio track configured:', track.getSettings());
      });
      
      // Auto-boost audio volume when remote stream arrives
      setTimeout(() => {
        console.log('Auto-boosting audio volume...');
        console.log('Remote stream audio tracks:', stream.getAudioTracks().length);
        webRTCService.boostAudioVolume();
      }, 1000);
      
      // Important: Don't override local stream state
      setRemoteStream(stream);
      setWebRTCState(prev => ({ 
        ...prev, 
        hasRemoteStream: true, 
        remoteStream: stream,
        // Preserve local stream state
        hasLocalStream: prev.hasLocalStream,
        localStream: prev.localStream
      }));
    };

    const handleConnected = () => {
      setWebRTCState(prev => ({ ...prev, isConnected: true, isConnecting: false }));
    };

    const handleConnecting = () => {
      setWebRTCState(prev => ({ ...prev, isConnecting: true }));
    };

    const handleDisconnected = () => {
      // Only clear remote stream, preserve local stream
      setRemoteStream(null);
      setWebRTCState(prev => ({ 
        ...prev, 
        isConnected: false, 
        isConnecting: false,
        hasRemoteStream: false,
        remoteStream: undefined,
        // Preserve local stream state
        hasLocalStream: prev.hasLocalStream,
        localStream: prev.localStream
      }));
    };

    const handleReconnecting = () => {
      console.log('Connection is reconnecting...');
      setWebRTCState(prev => ({ ...prev, isConnecting: true, isConnected: false }));
    };

    const handleConnectionError = (error: any) => {
      console.error('Connection error:', error);
      setWebRTCState(prev => ({ ...prev, error: error.message, isConnecting: false, isConnected: false }));
    };

    const handleCallEnded = () => {
      console.log('Call ended, preserving local stream');
      setRemoteStream(null);
      setWebRTCState(prev => ({ 
        ...prev, 
        isConnected: false, 
        isConnecting: false,
        hasRemoteStream: false,
        remoteStream: undefined,
        // Explicitly preserve local stream
        hasLocalStream: prev.hasLocalStream,
        localStream: prev.localStream
      }));
    };

    const handleAudioToggled = (enabled: boolean) => {
      setIsAudioEnabled(enabled);
    };

    const handleVideoToggled = (enabled: boolean) => {
      setIsVideoEnabled(enabled);
    };

    // Signaling service listeners
    const handleSignalingConnected = () => {
      setSignalingState(prev => ({ ...prev, isConnected: true }));
    };

    const handleRegistrationSuccess = (data: any) => {
      console.log('Registration successful, starting search...', data);
      // Auto-start search after successful registration (only once)
      setTimeout(() => {
        const currentSignalingState = signalingService.getState();
        const currentWebRTCState = webRTCService.getState();
        
        if (!currentWebRTCState.isConnected && 
            !currentWebRTCState.isConnecting && 
            !currentSignalingState.isSearching &&
            !currentSignalingState.currentRoomId) {
          console.log('Auto-starting match search after registration...');
          findMatch();
        }
      }, 1000);
    };

    const handleSignalingDisconnected = () => {
      setSignalingState(prev => ({ ...prev, isConnected: false, isSearching: false }));
    };

    const handleSearchStarted = () => {
      setSignalingState(prev => ({ ...prev, isSearching: true }));
    };

    const handleMatchFound = async (data: { roomId: string; peerId: string }) => {
      console.log('Match found:', data);
      setSignalingState(prev => ({ 
        ...prev, 
        isSearching: false, 
        currentRoomId: data.roomId 
      }));
      
      // Use socket ID to determine who should initiate offer (alphabetically smaller ID goes first)
      const mySocketId = signalingService.getSocketId();
      const shouldCreateOffer = mySocketId && mySocketId < data.peerId;
      
      if (shouldCreateOffer) {
        // Add a small delay to prevent race condition
        setTimeout(async () => {
          try {
            const currentState = webRTCService.getState();
            if (!currentState.isConnected && !currentState.isConnecting) {
              console.log('Creating offer for peer:', data.peerId);
              await webRTCService.createOffer(data.peerId);
            }
          } catch (error) {
            console.error('Failed to create offer:', error);
          }
        }, 100);
      } else {
        console.log('Waiting for offer from peer:', data.peerId);
      }
    };

    const handleLeftRoom = () => {
      setSignalingState(prev => ({ ...prev, currentRoomId: undefined, isSearching: false }));
    };

    const handleNoMatch = () => {
      console.log('No match found, continuing search...');
      // Keep searching automatically
    };

    // Register WebRTC listeners
    webRTCService.on('localStream', handleLocalStream);
    webRTCService.on('remoteStream', handleRemoteStream);
    webRTCService.on('connected', handleConnected);
    webRTCService.on('connecting', handleConnecting);
    webRTCService.on('disconnected', handleDisconnected);
    webRTCService.on('reconnecting', handleReconnecting);
    webRTCService.on('connectionError', handleConnectionError);
    webRTCService.on('callEnded', handleCallEnded);
    webRTCService.on('audioToggled', handleAudioToggled);
    webRTCService.on('videoToggled', handleVideoToggled);

    // Register Signaling listeners
    signalingService.on('connected', handleSignalingConnected);
    signalingService.on('registration-success', handleRegistrationSuccess);
    signalingService.on('disconnected', handleSignalingDisconnected);
    signalingService.on('search-started', handleSearchStarted);
    signalingService.on('match-found', handleMatchFound);
    signalingService.on('left-room', handleLeftRoom);
    signalingService.on('no-match', handleNoMatch);

    // Cleanup function
    return () => {
      // Remove WebRTC listeners
      webRTCService.off('localStream', handleLocalStream);
      webRTCService.off('remoteStream', handleRemoteStream);
          webRTCService.off('connected', handleConnected);
    webRTCService.off('connecting', handleConnecting);
    webRTCService.off('disconnected', handleDisconnected);
    webRTCService.off('reconnecting', handleReconnecting);
    webRTCService.off('connectionError', handleConnectionError);
    webRTCService.off('callEnded', handleCallEnded);
      webRTCService.off('audioToggled', handleAudioToggled);
      webRTCService.off('videoToggled', handleVideoToggled);

      // Remove Signaling listeners
      signalingService.off('connected', handleSignalingConnected);
      signalingService.off('registration-success', handleRegistrationSuccess);
      signalingService.off('disconnected', handleSignalingDisconnected);
      signalingService.off('search-started', handleSearchStarted);
      signalingService.off('match-found', handleMatchFound);
      signalingService.off('left-room', handleLeftRoom);
      signalingService.off('no-match', handleNoMatch);
    };
  }, []);

  // Auto-initialize on mount
  useEffect(() => {
    initialize();
    
    // Cleanup on unmount
    return () => {
      cleanup();
    };
  }, [initialize, cleanup]);

  // Manual check if localStream is missing after initialization
  useEffect(() => {
    const checkLocalStream = async () => {
      if (!localStream && webrtcState.hasLocalStream === false) {
        console.log('No local stream detected, attempting manual initialization...');
        try {
          const currentState = webRTCService.getState();
          if (!currentState.hasLocalStream) {
            console.log('WebRTC service also has no local stream, re-initializing...');
            await webRTCService.initialize();
          }
        } catch (error) {
          console.error('Failed to manually initialize local stream:', error);
        }
      }
    };

    // Check after a delay to allow for normal initialization
    const timeoutId = setTimeout(checkLocalStream, 3000);
    return () => clearTimeout(timeoutId);
  }, [localStream, webrtcState.hasLocalStream]);

  return {
    // States
    webrtcState,
    signalingState,
    localStream,
    remoteStream,
    isAudioEnabled,
    isVideoEnabled,
    
    // Actions
    initialize,
    findMatch,
    nextUser,
    endCall,
    toggleAudio,
    toggleVideo,
    switchCamera,
    boostAudio,
    cleanup,
    
    // Status getters
    isConnected: webrtcState.isConnected,
    isConnecting: webrtcState.isConnecting,
    isSearching: signalingState.isSearching,
    hasLocalStream: webrtcState.hasLocalStream,
    hasRemoteStream: webrtcState.hasRemoteStream,
  };
};

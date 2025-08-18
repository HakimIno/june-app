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

  // Video quality controls
  const setVideoQuality = useCallback(async (quality: 'high' | 'medium' | 'low') => {
    try {
      await webRTCService.setVideoQuality(quality);
    } catch (error) {
      console.error('Failed to set video quality:', error);
    }
  }, []);

  const getCurrentVideoQuality = useCallback(() => {
    return webRTCService.getCurrentVideoQuality();
  }, []);

  const getNetworkStats = useCallback(() => {
    return webRTCService.getNetworkStats();
  }, []);

  const getSmartProcessorInfo = useCallback(() => {
    return webRTCService.getSmartProcessorInfo();
  }, []);

  const getQualityRecommendation = useCallback(async () => {
    return await webRTCService.getQualityRecommendation();
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
      console.log('🎥 Remote stream received:', {
        streamId: stream.id,
        audioTracks: stream.getAudioTracks().length,
        videoTracks: stream.getVideoTracks().length,
        hasToURL: typeof stream.toURL === 'function'
      });
    
      // ✅ สร้าง URL สำหรับแสดงผล
      let streamURL = null;
      try {
        if (typeof stream.toURL === 'function') {
          streamURL = stream.toURL();
          console.log('✅ Remote stream URL created:', streamURL);
        } else {
          console.warn('⚠️ stream.toURL() not available');
        }
      } catch (error) {
        console.error('❌ Failed to create stream URL:', error);
      }
    
      // ✅ เปิดใช้งาน remote tracks ทั้งหมด
      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();
      
      audioTracks.forEach((track, index) => {
        track.enabled = true;
        console.log(`🔊 Remote audio track ${index} enabled:`, {
          id: track.id,
          enabled: track.enabled,
          readyState: track.readyState
        });
        
        // Boost volume for remote audio
        if (track._setVolume) track._setVolume(1.0);
        if (track.setVolume) track.setVolume(1.0);
      });
      
      videoTracks.forEach((track, index) => {
        track.enabled = true;
        console.log(`📹 Remote video track ${index} enabled:`, {
          id: track.id,
          enabled: track.enabled,
          readyState: track.readyState,
          muted: track.muted,
          settings: track.getSettings ? track.getSettings() : {}
        });
        
        // Force enable และ unmute
        if (track.setEnabled) track.setEnabled(true);
        if (track.muted && track.unmute) track.unmute();
      });
    
      // ✅ Auto-boost audio volume หลังจาก remote stream พร้อม
      setTimeout(() => {
        webRTCService.boostAudioVolume();
      }, 1000);
      
      // ✅ อัพเดท state พร้อม URL
      setRemoteStream(stream);
      setWebRTCState(prev => ({ 
        ...prev, 
        hasRemoteStream: true, 
        remoteStream: stream,
        remoteStreamURL: streamURL, // ✅ เพิ่ม URL ใน state
        hasLocalStream: prev.hasLocalStream,
        localStream: prev.localStream
      }));
    };

    const handleConnected = () => {
      console.log('🎉 WebRTC connection established, updating UI state');
      setWebRTCState(prev => ({ ...prev, isConnected: true, isConnecting: false }));
      
      // Also ensure signaling state shows not searching when connected
      setSignalingState(prev => ({
        ...prev,
        isSearching: false
      }));
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
      console.log('❗ DEPRECATED: handleMatchFound - should use handleRoomJoined instead');
      // This method is deprecated in favor of handleRoomJoined
      setSignalingState(prev => ({ 
        ...prev, 
        isSearching: false, 
        currentRoomId: data.roomId 
      }));
    };

    const handleRoomJoined = async (data: { 
      roomId: string; 
      partners: any; 
      userCount: number; 
      maxUsers: number; 
      roomType: string 
    }) => {
      console.log('🎉 Room joined:', data);
      console.log('Current WebRTC state before room join:', webRTCService.getState());
      
      setSignalingState(prev => {
        const newState = {
          ...prev, 
          isSearching: false, // 🎯 KEY FIX: Stop showing "กำลังหาเพื่อนใหม่"
          currentRoomId: data.roomId 
        };
        console.log('🔄 SignalingState updated after room-joined:', newState);
        return newState;
      });
      
      // Get partner info from the room data
      const partnerList = Object.values(data.partners || {}) as any[];
      if (partnerList.length === 0) {
        console.error('No partners found in room data');
        return;
      }
      
      const partner = partnerList[0]; // Get first partner
      const peerId = partner.socketId;
      
      // Use consistent logic to determine who should initiate offer
      const mySocketId = signalingService.getSocketId();
      console.log('My Socket ID:', mySocketId, 'Partner Socket ID:', peerId);
      
      if (!mySocketId) {
        console.error('No socket ID available, cannot proceed with room join');
        return;
      }
      
      const shouldCreateOffer = mySocketId < peerId;
      console.log('Should create offer:', shouldCreateOffer);
      
      if (shouldCreateOffer) {
        console.log('🚀 I will create offer for partner:', peerId);
        // Add a delay to ensure both sides are ready
        setTimeout(async () => {
          try {
            const currentState = webRTCService.getState();
            console.log('WebRTC state before creating offer:', currentState);
            
            if (!currentState.isConnected && !currentState.isConnecting) {
              console.log('Creating offer for partner:', peerId);
              await webRTCService.createOffer(peerId);
              console.log('✅ Offer created successfully');
            } else {
              console.log('Already connected or connecting, skipping offer creation');
            }
          } catch (error) {
            console.error('❌ Failed to create offer:', error);
          }
        }, 1000); // 1 second delay for stability
      } else {
        console.log('⏳ Waiting for offer from partner:', peerId);
        // Set a timeout to detect if offer never arrives
        setTimeout(() => {
          const currentState = webRTCService.getState();
          if (!currentState.isConnected && !currentState.isConnecting) {
            console.warn('⚠️ No offer received after 15 seconds, connection may have failed');
          }
        }, 15000);
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
    signalingService.on('room-joined', handleRoomJoined); // 🎯 KEY FIX: Add room-joined handler
    signalingService.on('left-room', handleLeftRoom);
    signalingService.on('no-match', handleNoMatch);
    
    // Register WebRTC signaling listeners
    signalingService.on('offer', (data: any) => {
      console.log('Received offer via signaling:', data);
      webRTCService.handleOffer(data);
    });
    
    signalingService.on('answer', (data: any) => {
      console.log('Received answer via signaling:', data);
      webRTCService.handleAnswer(data);
    });
    
    signalingService.on('ice-candidate', (data: any) => {
      console.log('Received ICE candidate via signaling:', data);
      webRTCService.handleIceCandidate(data);
    });

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
      signalingService.off('room-joined', handleRoomJoined); // 🎯 KEY FIX: Remove room-joined handler
      signalingService.off('left-room', handleLeftRoom);
      signalingService.off('no-match', handleNoMatch);
      
      // Remove WebRTC signaling listeners  
      signalingService.off('offer', () => {});
      signalingService.off('answer', () => {});
      signalingService.off('ice-candidate', () => {});
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
    
    // Video quality controls
    setVideoQuality,
    getCurrentVideoQuality,
    getNetworkStats,
    getSmartProcessorInfo,
    getQualityRecommendation,
    
    // Status getters
    isConnected: webrtcState.isConnected,
    isConnecting: webrtcState.isConnecting,
    isSearching: signalingState.isSearching,
    hasLocalStream: webrtcState.hasLocalStream,
    hasRemoteStream: webrtcState.hasRemoteStream,
  };
};

import { MediaStream } from 'react-native-webrtc';

export interface WebRTCConfig {
  iceServers: RTCIceServer[];
}

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'user-joined' | 'user-left' | 'match-found' | 'next-user';
  data?: any;
  from?: string;
  to?: string;
}

export interface PeerConnection {
  id: string;
  connection: RTCPeerConnection;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
}

export interface CallSession {
  sessionId: string;
  peerId: string;
  isConnected: boolean;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  startTime: Date;
}

export interface WebRTCState {
  isConnecting: boolean;
  isConnected: boolean;
  hasLocalStream: boolean;
  hasRemoteStream: boolean;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  currentSession?: CallSession;
  error?: string;
}

export interface SignalingState {
  isConnected: boolean;
  isSearching: boolean;
  currentRoomId?: string;
  error?: string;
}

export interface MediaConstraints {
  video: boolean | MediaTrackConstraints;
  audio: boolean | MediaTrackConstraints;
}

export interface UserSession {
  userId: string;
  roomId?: string;
  isReady: boolean;
  preferences?: {
    videoEnabled: boolean;
    audioEnabled: boolean;
    location?: string;
    interests?: string[];
  };
}

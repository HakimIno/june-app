import {
    mediaDevices,
    MediaStream,
    RTCIceCandidate,
    RTCPeerConnection,
    RTCSessionDescription
} from 'react-native-webrtc';
import { WebRTCConfig, WebRTCState } from '../types/webrtc';
import { signalingService } from './signalingService';

class WebRTCService {
    private peerConnection: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private remoteStream: MediaStream | null = null;
    private currentPeerId: string = '';
    private state: WebRTCState = {
        isConnecting: false,
        isConnected: false,
        hasLocalStream: false,
        hasRemoteStream: false,
    };
    private listeners: Map<string, Function[]> = new Map();

    // STUN/TURN servers configuration
    private readonly config: WebRTCConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            // เพิ่ม TURN server สำหรับการใช้งานจริง
            // {
            //   urls: 'turn:your-turn-server.com:3478',
            //   username: 'username',
            //   credential: 'password'
            // }
        ],
    };

    async initialize(): Promise<void> {
        try {
            // ขอสิทธิ์เข้าถึงกล้องและไมโครโฟน
            await this.setupLocalStream();

            // Setup signaling service listeners
            this.setupSignalingListeners();

            console.log('WebRTC Service initialized successfully');
        } catch (error) {
            console.error('Failed to initialize WebRTC service:', error);
            this.state.error = error instanceof Error ? error.message : 'Unknown error';
            throw error;
        }
    }

    private async setupLocalStream(): Promise<void> {
        try {
            const constraints = {
                video: {
                    width: { min: 640, ideal: 1280, max: 1920 },
                    height: { min: 480, ideal: 720, max: 1080 },
                    frameRate: { min: 15, ideal: 30, max: 60 },
                    facingMode: 'user', // front camera
                    aspectRatio: 16/9,
                },
                audio: {
                    echoCancellation: false,  // Disable to preserve volume
                    noiseSuppression: false,  // Disable to increase volume
                    autoGainControl: false,   // Disable to allow higher volume
                    sampleRate: 48000,
                    channelCount: 2,          // Stereo for better volume
                    sampleSize: 16,
                    // Remove unsupported volume property
                    googEchoCancellation: false,
                    googNoiseSuppression: false,
                    googAutoGainControl: false,
                    googHighpassFilter: false,
                    googTypingNoiseDetection: false,
                    googAudioMirroring: false,
                    googDAEchoCancellation: false,
                    googNoiseReduction: false,
                },
            };

            this.localStream = await mediaDevices.getUserMedia(constraints as any);
            this.state.hasLocalStream = true;
            this.state.localStream = this.localStream;

            console.log('Local stream obtained:', {
                streamId: this.localStream._id,
                hasToURL: typeof this.localStream.toURL === 'function',
                videoTracks: this.localStream.getVideoTracks().length,
                audioTracks: this.localStream.getAudioTracks().length
            });
            
            console.log('Emitting localStream event...');
            this.emit('localStream', this.localStream);
            
            // Enable audio tracks and set properties
            const audioTracks = this.localStream.getAudioTracks();
            audioTracks.forEach(track => {
                track.enabled = true;
                
                // Use native methods for React Native WebRTC
                if ((track as any)._setVolume) {
                    (track as any)._setVolume(1.0);
                }
                
                // Enable for maximum volume
                if ((track as any).setEnabled) {
                    (track as any).setEnabled(true);
                }
                
                console.log('Audio track enabled:', track.enabled);
                console.log('Audio track settings:', track.getSettings());
            });

            // Emit initial audio/video states
            const audioEnabled = this.getAudioEnabled();
            const videoEnabled = this.getVideoEnabled();
            this.emit('audioToggled', audioEnabled);
            this.emit('videoToggled', videoEnabled);
            console.log('Initial media states:', { audioEnabled, videoEnabled });

        } catch (error) {
            console.error('Failed to get local stream:', error);
            throw new Error('Failed to access camera/microphone');
        }
    }

    private setupSignalingListeners(): void {
        signalingService.on('offer', this.handleOffer.bind(this));
        signalingService.on('answer', this.handleAnswer.bind(this));
        signalingService.on('ice-candidate', this.handleIceCandidate.bind(this));
        signalingService.on('user-left', this.handleUserLeft.bind(this));
    }

    async createPeerConnection(): Promise<RTCPeerConnection> {
        this.peerConnection = new RTCPeerConnection(this.config);

        // Add local stream to peer connection
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection?.addTrack(track, this.localStream!);
            });
        }

        // Handle remote stream
        (this.peerConnection as any).onaddstream = (event: any) => {
            console.log('Remote stream received:', event.stream);
            this.remoteStream = event.stream;
            this.state.hasRemoteStream = true;
            this.state.remoteStream = event.stream;
            this.emit('remoteStream', event.stream);
        };

        // Alternative way to handle remote tracks (more modern)
        (this.peerConnection as any).ontrack = (event: any) => {
            console.log('Remote track received:', event);
            if (event.streams && event.streams[0]) {
                const stream = event.streams[0];
                console.log('Remote stream from ontrack:', stream);
                
                // Enable remote audio tracks
                const audioTracks = stream.getAudioTracks();
                audioTracks.forEach((track: any) => {
                    track.enabled = true;
                    
                    // Use native methods for React Native WebRTC
                    if (track._setVolume) {
                        track._setVolume(1.0);
                    }
                    
                    if (track.setEnabled) {
                        track.setEnabled(true);
                    }
                    
                    console.log('Remote audio track enabled:', track.enabled);
                    console.log('Remote audio track settings:', track.getSettings());
                });
                
                this.remoteStream = stream;
                this.state.hasRemoteStream = true;
                this.state.remoteStream = stream;
                this.emit('remoteStream', stream);
            }
        };

        // Handle ICE candidates
        (this.peerConnection as any).onicecandidate = (event: any) => {
            if (event.candidate) {
                console.log('New ICE candidate:', event.candidate);
                // Send candidate through signaling service
                signalingService.sendIceCandidate(event.candidate, this.getCurrentPeerId());
            }
        };

        // Handle connection state changes
        (this.peerConnection as any).onconnectionstatechange = () => {
            const state = this.peerConnection?.connectionState;
            console.log('Connection state changed:', state);
            
            switch (state) {
                case 'connected':
                    this.state.isConnected = true;
                    this.state.isConnecting = false;
                    this.emit('connected', true);
                    break;
                case 'disconnected':
                    this.state.isConnected = false;
                    this.state.isConnecting = false;
                    this.emit('disconnected', false);
                    break;
                case 'failed':
                    console.warn('Connection failed, attempting restart...');
                    this.state.isConnected = false;
                    this.state.isConnecting = false;
                    this.handleConnectionFailure();
                    break;
                case 'closed':
                    this.state.isConnected = false;
                    this.state.isConnecting = false;
                    this.emit('disconnected', false);
                    break;
                case 'connecting':
                    this.state.isConnecting = true;
                    this.emit('connecting', true);
                    break;
            }
        };

        // ICE connection state change handler
        (this.peerConnection as any).oniceconnectionstatechange = () => {
            const iceState = this.peerConnection?.iceConnectionState;
            console.log('ICE connection state changed:', iceState);
            
            if (iceState === 'failed') {
                console.warn('ICE connection failed, restarting...');
                this.restartIce();
            } else if (iceState === 'connected' || iceState === 'completed') {
                console.log('ICE connection established successfully');
            }
        };

        return this.peerConnection;
    }

    async createOffer(peerId: string): Promise<void> {
        try {
            this.currentPeerId = peerId;
            
            if (!this.peerConnection) {
                await this.createPeerConnection();
            }

            const offer = await this.peerConnection!.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
                voiceActivityDetection: true,
                iceRestart: false,
            });

            await this.peerConnection!.setLocalDescription(offer);

            // Send offer through signaling service
            signalingService.sendOffer(offer, peerId);

            console.log('Offer created and sent to:', peerId);
        } catch (error) {
            console.error('Failed to create offer:', error);
            this.state.error = error instanceof Error ? error.message : 'Failed to create offer';
        }
    }

    private async handleOffer(data: any): Promise<void> {
        try {
            console.log('Handling offer:', data);
            
            // Extract offer and from from data
            const offer = data.offer || data;
            const from = data.from;
            
            if (!offer || !offer.type || !offer.sdp) {
                console.error('Invalid offer data:', data);
                return;
            }
            
            this.currentPeerId = from;
            
            if (!this.peerConnection) {
                await this.createPeerConnection();
            }

            await this.peerConnection!.setRemoteDescription(new RTCSessionDescription({
                type: offer.type,
                sdp: offer.sdp,
            }));

            const answer = await this.peerConnection!.createAnswer();
            await this.peerConnection!.setLocalDescription(answer);

            // Send answer through signaling service
            signalingService.sendAnswer(answer, from);

            console.log('Answer created and sent to:', from);
        } catch (error) {
            console.error('Failed to handle offer:', error);
        }
    }

    private async handleAnswer(data: any): Promise<void> {
        try {
            console.log('Handling answer:', data);
            
            // Extract answer and from from data
            const answer = data.answer || data;
            const from = data.from;
            
            if (!answer || !answer.type || !answer.sdp) {
                console.error('Invalid answer data:', data);
                return;
            }
            
            if (this.peerConnection) {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription({
                    type: answer.type,
                    sdp: answer.sdp,
                }));
                console.log('Answer received and set from:', from);
            }
        } catch (error) {
            console.error('Failed to handle answer:', error);
        }
    }

    private async handleIceCandidate(data: any): Promise<void> {
        try {
            console.log('Handling ICE candidate:', data);
            
            // Extract candidate and from from data
            let candidate;
            const from = data.from;
            
            // Check if data itself is the candidate or if it contains candidate property
            if (data.candidate && typeof data.candidate === 'string') {
                // data contains the candidate string
                candidate = {
                    candidate: data.candidate,
                    sdpMLineIndex: data.sdpMLineIndex,
                    sdpMid: data.sdpMid
                };
            } else if (typeof data.candidate === 'object') {
                // data.candidate is already an object
                candidate = data.candidate;
            } else {
                // data is the candidate object itself
                candidate = data;
            }
            
            if (!candidate || !candidate.candidate) {
                console.error('Invalid ICE candidate data:', data);
                return;
            }
            
            // Validate that at least one of sdpMLineIndex or sdpMid is provided
            if (candidate.sdpMLineIndex === null && candidate.sdpMLineIndex !== 0 && !candidate.sdpMid) {
                console.warn('ICE candidate missing both sdpMLineIndex and sdpMid, skipping:', candidate);
                return;
            }
            
            if (this.peerConnection) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('ICE candidate added successfully from:', from);
            }
        } catch (error) {
            console.error('Failed to add ICE candidate:', error, 'Data:', data);
        }
    }

    private handleUserLeft(): void {
        console.log('Remote user left');
        this.endCall();
    }

    endCall(): void {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        // Only clear remote stream, preserve local stream
        this.remoteStream = null;
        this.currentPeerId = '';
        this.state.isConnected = false;
        this.state.isConnecting = false;
        this.state.hasRemoteStream = false;
        this.state.remoteStream = undefined;
        
        // Keep local stream intact
        console.log('Preserving local stream during call end:', !!this.localStream);

        this.emit('callEnded', true);
        console.log('Call ended');
    }

    // Media controls
    toggleAudio(): boolean {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                console.log('Audio toggled:', audioTrack.enabled);
                this.emit('audioToggled', audioTrack.enabled);
                return audioTrack.enabled;
            }
        }
        return false;
    }

    toggleVideo(): boolean {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                console.log('Video toggled:', videoTrack.enabled);
                this.emit('videoToggled', videoTrack.enabled);
                return videoTrack.enabled;
            }
        }
        return false;
    }

    // Get current media states
    getAudioEnabled(): boolean {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            return audioTrack ? audioTrack.enabled : false;
        }
        return false;
    }

    getVideoEnabled(): boolean {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            return videoTrack ? videoTrack.enabled : false;
        }
        return false;
    }

    // Boost audio volume for both local and remote streams
    boostAudioVolume(): void {
        try {
            console.log('Attempting to boost audio volume...');
            
            // Boost local stream audio
            if (this.localStream) {
                const audioTracks = this.localStream.getAudioTracks();
                console.log(`Local audio tracks found: ${audioTracks.length}`);
                
                audioTracks.forEach((track, index) => {
                    console.log(`Processing local audio track ${index}:`, track.enabled);
                    track.enabled = true;
                    
                    // Try different volume setting methods
                    const trackAny = track as any;
                    
                    // Method 1: _setVolume
                    if (trackAny._setVolume) {
                        trackAny._setVolume(1.0);
                        console.log('Used _setVolume for local track');
                    }
                    
                    // Method 2: setVolume
                    if (trackAny.setVolume) {
                        trackAny.setVolume(1.0);
                        console.log('Used setVolume for local track');
                    }
                    
                    // Method 3: volume property
                    try {
                        trackAny.volume = 1.0;
                        console.log('Set volume property for local track');
                    } catch (e) {
                        console.log('Volume property not available for local track');
                    }
                    
                    console.log('Local track final state:', {
                        enabled: track.enabled,
                        settings: track.getSettings()
                    });
                });
            } else {
                console.log('No local stream available');
            }

            // Boost remote stream audio
            if (this.remoteStream) {
                const audioTracks = this.remoteStream.getAudioTracks();
                console.log(`Remote audio tracks found: ${audioTracks.length}`);
                
                audioTracks.forEach((track, index) => {
                    console.log(`Processing remote audio track ${index}:`, track.enabled);
                    track.enabled = true;
                    
                    // Try different volume setting methods
                    const trackAny = track as any;
                    
                    // Method 1: _setVolume
                    if (trackAny._setVolume) {
                        trackAny._setVolume(1.0);
                        console.log('Used _setVolume for remote track');
                    }
                    
                    // Method 2: setVolume
                    if (trackAny.setVolume) {
                        trackAny.setVolume(1.0);
                        console.log('Used setVolume for remote track');
                    }
                    
                    // Method 3: volume property
                    try {
                        trackAny.volume = 1.0;
                        console.log('Set volume property for remote track');
                    } catch (e) {
                        console.log('Volume property not available for remote track');
                    }
                    
                    console.log('Remote track final state:', {
                        enabled: track.enabled,
                        settings: track.getSettings()
                    });
                });
            } else {
                console.log('No remote stream available');
            }
            
            console.log('Audio boost operation completed');
        } catch (error) {
            console.error('Failed to boost audio volume:', error);
        }
    }

    // Switch camera (front/back)
    async switchCamera(): Promise<void> {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                // @ts-ignore - React Native WebRTC specific method
                videoTrack._switchCamera();
            }
        }
    }

    // Handle connection failure
    private async handleConnectionFailure(): Promise<void> {
        try {
            console.log('Attempting to restart connection...');
            
            // Close current peer connection
            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = null;
            }
            
            // Wait a bit before restart
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Recreate peer connection
            await this.createPeerConnection();
            
            // Notify about reconnection attempt
            this.emit('reconnecting', true);
            
        } catch (error) {
            console.error('Failed to restart connection:', error);
            this.emit('connectionError', error);
        }
    }

    // Restart ICE connection
    private async restartIce(): Promise<void> {
        try {
            if (this.peerConnection && this.currentPeerId) {
                console.log('Restarting ICE...');
                await this.peerConnection.restartIce();
            }
        } catch (error) {
            console.error('Failed to restart ICE:', error);
            // Fallback to full connection restart
            this.handleConnectionFailure();
        }
    }

    // Cleanup
    dispose(): void {
        this.endCall();

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        this.state = {
            isConnecting: false,
            isConnected: false,
            hasLocalStream: false,
            hasRemoteStream: false,
        };

        this.listeners.clear();
        console.log('WebRTC Service disposed');
    }

    // Event management
    on(event: string, callback: Function): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)?.push(callback);
    }

    off(event: string, callback: Function): void {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            const index = eventListeners.indexOf(callback);
            if (index > -1) {
                eventListeners.splice(index, 1);
            }
        }
    }

    private emit(event: string, data: any): void {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            eventListeners.forEach(callback => callback(data));
        }
    }

    // Getters
    getState(): WebRTCState {
        return { ...this.state };
    }

    getLocalStream(): MediaStream | null {
        return this.localStream;
    }

    getRemoteStream(): MediaStream | null {
        return this.remoteStream;
    }

    isConnected(): boolean {
        return this.state.isConnected;
    }

    private getCurrentPeerId(): string {
        return this.currentPeerId;
    }
}

// Singleton instance
export const webRTCService = new WebRTCService();
export default WebRTCService;

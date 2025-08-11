import {
    mediaDevices,
    MediaStream,
    RTCIceCandidate,
    RTCPeerConnection,
    RTCSessionDescription
} from 'react-native-webrtc';
import { WebRTCConfig, WebRTCState } from '../types/webrtc';
import { signalingService } from './signalingService';
import { smartVideoProcessor } from './videoProcessor';

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

    // Video quality configuration based on network conditions
    private videoQualityConfig = {
        high: {
            width: { min: 1280, ideal: 1920, max: 1920 },
            height: { min: 720, ideal: 1080, max: 1080 },
            frameRate: { min: 24, ideal: 30, max: 30 },
            bitrate: 2000000, // 2 Mbps
        },
        medium: {
            width: { min: 854, ideal: 1280, max: 1280 },
            height: { min: 480, ideal: 720, max: 720 },
            frameRate: { min: 20, ideal: 24, max: 24 },
            bitrate: 1000000, // 1 Mbps
        },
        low: {
            width: { min: 640, ideal: 854, max: 854 },
            height: { min: 360, ideal: 480, max: 480 },
            frameRate: { min: 15, ideal: 20, max: 20 },
            bitrate: 500000, // 0.5 Mbps
        }
    };

    private currentVideoQuality: 'high' | 'medium' | 'low' = 'high';
    private networkMonitor: {
        rtt: number;
        packetsLost: number;
        bandwidth: number;
        jitter: number;
    } = {
        rtt: 0,
        packetsLost: 0,
        bandwidth: 0,
        jitter: 0
    };

    // For bandwidth calculation
    private previousStats: { bytesSent?: number; bytesReceived?: number } | null = null;
    private previousStatsTime: number | null = null;

    // Adaptive video quality based on network conditions (enhanced with Rust processing)
    async adaptVideoQuality(): Promise<void> {
        if (!this.peerConnection) return;

        try {
            const stats = await this.peerConnection.getStats();
            let inboundVideoStats: any = null;
            let candidatePairStats: any = null;
            let outboundVideoStats: any = null;
            
            // Collect relevant stats
            stats.forEach((report: any) => {
                if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
                    inboundVideoStats = report;
                } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    candidatePairStats = report;
                } else if (report.type === 'outbound-rtp' && report.mediaType === 'video') {
                    outboundVideoStats = report;
                }
            });

            // Update network monitoring data with improved calculations
            if (inboundVideoStats) {
                this.networkMonitor.packetsLost = inboundVideoStats.packetsLost || 0;
                this.networkMonitor.jitter = (inboundVideoStats.jitter || 0) * 1000; // Convert to ms
            }
            
            if (candidatePairStats) {
                this.networkMonitor.rtt = (candidatePairStats.currentRoundTripTime || 0) * 1000; // Convert to ms
            }
            
            // Calculate bandwidth from actual WebRTC stats
            let estimatedBandwidth = 2_000_000; // Default 2 Mbps
            
            if (outboundVideoStats) {
                // Calculate throughput from bytesSent over time
                const currentTime = Date.now();
                const bytesSent = outboundVideoStats.bytesSent || 0;
                
                if (this.previousStats && this.previousStatsTime) {
                    const timeDiff = (currentTime - this.previousStatsTime) / 1000; // seconds
                    const bytesDiff = bytesSent - (this.previousStats.bytesSent || 0);
                    
                    if (timeDiff > 0 && bytesDiff > 0) {
                        // Calculate actual throughput in bits per second
                        const throughputBps = (bytesDiff * 8) / timeDiff;
                        estimatedBandwidth = Math.min(Math.max(throughputBps, 500_000), 50_000_000); // Cap between 0.5-50 Mbps
                        console.log('Calculated throughput:', {
                            bytesDiff,
                            timeDiff: timeDiff.toFixed(2),
                            throughputMbps: (throughputBps / 1_000_000).toFixed(2)
                        });
                    }
                }
                
                // Store current stats for next calculation
                this.previousStats = { bytesSent };
                this.previousStatsTime = currentTime;
            } else if (inboundVideoStats) {
                // Use inbound stats if outbound not available
                const bytesReceived = inboundVideoStats.bytesReceived || 0;
                const currentTime = Date.now();
                
                if (this.previousStats && this.previousStatsTime) {
                    const timeDiff = (currentTime - this.previousStatsTime) / 1000;
                    const bytesDiff = bytesReceived - (this.previousStats.bytesReceived || 0);
                    
                    if (timeDiff > 0 && bytesDiff > 0) {
                        const throughputBps = (bytesDiff * 8) / timeDiff;
                        estimatedBandwidth = Math.min(Math.max(throughputBps, 500_000), 50_000_000);
                    }
                }
                
                this.previousStats = { bytesReceived };
                this.previousStatsTime = currentTime;
            }
            
            this.networkMonitor.bandwidth = estimatedBandwidth;

            console.log('Network stats:', {
                rtt: this.networkMonitor.rtt,
                packetsLost: this.networkMonitor.packetsLost,
                bandwidth: (this.networkMonitor.bandwidth / 1_000_000).toFixed(2) + ' Mbps',
                jitter: this.networkMonitor.jitter
            });

            // Use smart video processor for intelligent quality adaptation
            const recommendation = smartVideoProcessor.analyzeNetwork({
                rtt: this.networkMonitor.rtt,
                packet_loss: this.networkMonitor.packetsLost,
                bandwidth: this.networkMonitor.bandwidth,
                jitter: this.networkMonitor.jitter,
            });

            console.log('Quality recommendation:', {
                current: this.currentVideoQuality,
                recommended: recommendation.quality_level,
                confidence: recommendation.confidence,
                bandwidth_mbps: (this.networkMonitor.bandwidth / 1_000_000).toFixed(2)
            });

            // Apply recommendation with lower confidence threshold for better responsiveness
            if (recommendation.confidence > 0.3 && recommendation.quality_level !== this.currentVideoQuality) {
                console.log(`Smart video adapter recommending quality change from ${this.currentVideoQuality} to ${recommendation.quality_level}`);
                console.log('Recommendation details:', {
                    bitrate: recommendation.recommended_bitrate,
                    fps: recommendation.recommended_fps,
                    resolution: recommendation.recommended_resolution,
                    confidence: recommendation.confidence,
                });
                
                await this.changeVideoQualityWithRecommendation(recommendation);
            }

        } catch (error) {
            console.error('Failed to adapt video quality:', error);
        }
    }

                // Enhanced quality change method using smart recommendations
    private async changeVideoQualityWithRecommendation(recommendation: any): Promise<void> {
        try {
            this.currentVideoQuality = recommendation.quality_level;
            console.log(`Smart video quality changed to ${this.currentVideoQuality}:`, {
                bitrate: recommendation.recommended_bitrate,
                fps: recommendation.recommended_fps,
                resolution: recommendation.recommended_resolution,
                processorType: smartVideoProcessor.isUsingRustProcessor() ? 'rust' : 'javascript'
            });
            
            // Update video config based on recommendation
            const videoConfig = {
                width: recommendation.recommended_resolution === '1920x1080' ? 
                    { min: 1280, ideal: 1920, max: 1920 } :
                    recommendation.recommended_resolution === '1280x720' ?
                    { min: 854, ideal: 1280, max: 1280 } :
                    { min: 640, ideal: 854, max: 854 },
                height: recommendation.recommended_resolution === '1920x1080' ? 
                    { min: 720, ideal: 1080, max: 1080 } :
                    recommendation.recommended_resolution === '1280x720' ?
                    { min: 480, ideal: 720, max: 720 } :
                    { min: 360, ideal: 480, max: 480 },
                frameRate: { 
                    min: Math.max(15, recommendation.recommended_fps - 10), 
                    ideal: recommendation.recommended_fps, 
                    max: recommendation.recommended_fps 
                },
                bitrate: recommendation.recommended_bitrate,
            };

            if (this.localStream && this.peerConnection) {
                const sender = this.peerConnection.getSenders().find(s => 
                    s.track && s.track.kind === 'video'
                );

                if (sender && sender.track) {
                    // Apply new constraints to video track
                    await sender.track.applyConstraints({
                        width: videoConfig.width,
                        height: videoConfig.height,
                        frameRate: videoConfig.frameRate,
                        facingMode: 'user',
                    });

                    // Update encoding parameters with smart bitrate
                    const params = sender.getParameters();
                    if (params.encodings && params.encodings.length > 0) {
                        params.encodings[0].maxBitrate = recommendation.recommended_bitrate;
                        params.encodings[0].maxFramerate = recommendation.recommended_fps;
                        
                        // Advanced encoding settings based on quality level
                        if (recommendation.quality_level === 'high') {
                            params.encodings[0].scaleResolutionDownBy = 1.0;
                            // Note: priority is not supported in React Native WebRTC
                        } else if (recommendation.quality_level === 'medium') {
                            params.encodings[0].scaleResolutionDownBy = 1.2;
                        } else {
                            params.encodings[0].scaleResolutionDownBy = 1.5;
                        }
                        
                        await sender.setParameters(params);
                    }

                    console.log(`Smart video quality changed to ${recommendation.quality_level}:`, {
                        bitrate: recommendation.recommended_bitrate,
                        fps: recommendation.recommended_fps,
                        resolution: recommendation.recommended_resolution,
                        processorType: smartVideoProcessor.getProcessorInfo().type,
                    });
                    
                    this.emit('videoQualityChanged', { 
                        quality: recommendation.quality_level, 
                        config: videoConfig,
                        recommendation: recommendation,
                        processorInfo: smartVideoProcessor.getProcessorInfo(),
                    });
                }
            }
        } catch (error) {
            console.error('Failed to change video quality with smart recommendation:', error);
        }
    }

    // Change video quality dynamically
    async changeVideoQuality(quality: 'high' | 'medium' | 'low'): Promise<void> {
        try {
            this.currentVideoQuality = quality;
            const videoConfig = this.videoQualityConfig[quality];

            if (this.localStream && this.peerConnection) {
                const sender = this.peerConnection.getSenders().find(s => 
                    s.track && s.track.kind === 'video'
                );

                if (sender && sender.track) {
                    // Apply new constraints to video track
                    await sender.track.applyConstraints({
                        ...videoConfig,
                        facingMode: 'user',
                    });

                    // Update encoding parameters
                    const params = sender.getParameters();
                    if (params.encodings && params.encodings.length > 0) {
                        params.encodings[0].maxBitrate = videoConfig.bitrate;
                        params.encodings[0].maxFramerate = videoConfig.frameRate.ideal;
                        await sender.setParameters(params);
                    }

                    console.log(`Video quality changed to ${quality}:`, videoConfig);
                    this.emit('videoQualityChanged', { quality, config: videoConfig });
                }
            }
        } catch (error) {
            console.error('Failed to change video quality:', error);
        }
    }

    private async setupLocalStream(): Promise<void> {
        try {
            const videoConfig = this.videoQualityConfig[this.currentVideoQuality];
            
            const constraints = {
                video: {
                    ...videoConfig,
                    facingMode: 'user', // front camera
                    aspectRatio: 16/9,
                    // Enhanced video quality settings
                    advanced: [{
                        width: videoConfig.width,
                        height: videoConfig.height,
                        frameRate: videoConfig.frameRate,
                        googNoiseReduction: true,
                        googTemporalLayeredScreencast: true,
                        googCpuOveruseDetection: true,
                        googLeakyBucket: true,
                        googPayloadPadding: true,
                        googScreencastMinBitrate: videoConfig.bitrate / 4,
                        googHighStartBitrate: videoConfig.bitrate,
                        googVeryHighBitrate: videoConfig.bitrate * 1.2,
                    }]
                },
                audio: {
                    echoCancellation: true,   // Enable for better quality
                    noiseSuppression: true,   // Enable for cleaner audio
                    autoGainControl: true,    // Enable for consistent volume
                    sampleRate: 48000,
                    channelCount: 2,          // Stereo for better volume
                    sampleSize: 16,
                    googEchoCancellation: true,
                    googNoiseSuppression: true,
                    googAutoGainControl: true,
                    googHighpassFilter: true,
                    googTypingNoiseDetection: true,
                    googAudioMirroring: false,
                    googDAEchoCancellation: true,
                    googNoiseReduction: true,
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
                    // Start network monitoring when connected
                    this.startNetworkMonitoring();
                    break;
                case 'disconnected':
                    this.state.isConnected = false;
                    this.state.isConnecting = false;
                    this.emit('disconnected', false);
                    this.stopNetworkMonitoring();
                    break;
                case 'failed':
                    console.warn('Connection failed, attempting restart...');
                    this.state.isConnected = false;
                    this.state.isConnecting = false;
                    this.stopNetworkMonitoring();
                    this.handleConnectionFailure();
                    break;
                case 'closed':
                    this.state.isConnected = false;
                    this.state.isConnecting = false;
                    this.emit('disconnected', false);
                    this.stopNetworkMonitoring();
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

    // Network monitoring
    private networkMonitoringInterval: NodeJS.Timeout | null = null;

    private startNetworkMonitoring(): void {
        if (this.networkMonitoringInterval) {
            clearInterval(this.networkMonitoringInterval);
        }

        // Start with optimistic high quality
        this.currentVideoQuality = 'high';

        this.networkMonitoringInterval = setInterval(async () => {
            await this.adaptVideoQuality();
        }, 3000); // Monitor every 3 seconds

        console.log('Network monitoring started');
    }

    private stopNetworkMonitoring(): void {
        if (this.networkMonitoringInterval) {
            clearInterval(this.networkMonitoringInterval);
            this.networkMonitoringInterval = null;
        }
        console.log('Network monitoring stopped');
    }

    // Manual video quality controls
    async setVideoQuality(quality: 'high' | 'medium' | 'low'): Promise<void> {
        await this.changeVideoQuality(quality);
    }

    getCurrentVideoQuality(): 'high' | 'medium' | 'low' {
        return this.currentVideoQuality;
    }

    getNetworkStats(): typeof this.networkMonitor {
        return { ...this.networkMonitor };
    }

    // Get smart video processor information
    getSmartProcessorInfo(): { type: 'rust' | 'javascript'; version: string; isAvailable: boolean } {
        const info = smartVideoProcessor.getProcessorInfo();
        return {
            ...info,
            isAvailable: smartVideoProcessor.isUsingRustProcessor(),
        };
    }

    // Get intelligent quality recommendation without applying it
    async getQualityRecommendation(): Promise<any> {
        try {
            if (!this.peerConnection) return null;

            const stats = await this.peerConnection.getStats();
            
            // Update network monitoring data
            stats.forEach((report: any) => {
                if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
                    this.networkMonitor.packetsLost = report.packetsLost || 0;
                    this.networkMonitor.jitter = report.jitter || 0;
                } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    this.networkMonitor.rtt = report.currentRoundTripTime * 1000 || 0;
                } else if (report.type === 'outbound-rtp' && report.mediaType === 'video') {
                    this.networkMonitor.bandwidth = report.bytesSent || 0;
                }
            });

            // Get recommendation from smart processor
            return smartVideoProcessor.analyzeNetwork({
                rtt: this.networkMonitor.rtt,
                packet_loss: this.networkMonitor.packetsLost,
                bandwidth: this.networkMonitor.bandwidth,
                jitter: this.networkMonitor.jitter,
            });
        } catch (error) {
            console.error('Failed to get quality recommendation:', error);
            return null;
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
        this.stopNetworkMonitoring();
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

        // Reset network monitoring state
        this.networkMonitor = {
            rtt: 0,
            packetsLost: 0,
            bandwidth: 0,
            jitter: 0
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

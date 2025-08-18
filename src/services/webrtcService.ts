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
        connectionRetries: 0,
        lastProcessedAnswerKey: undefined,
    };
    private listeners: Map<string, Function[]> = new Map();
    private offerSent: boolean = false;
    private answerSent: boolean = false;

    // STUN/TURN servers configuration with security
    private readonly config: WebRTCConfig = {
        iceServers: [
            // TURN servers only - no STUN for better connectivity
            {
                urls: 'turn:global.relay.metered.ca:80',
                username: 'a5f0489b0b2f9fe3c17b9c0f',
                credential: 'TBr6GE9/+t4xp1Gz'
            },
            {
                urls: 'turn:global.relay.metered.ca:80?transport=tcp',
                username: 'a5f0489b0b2f9fe3c17b9c0f',
                credential: 'TBr6GE9/+t4xp1Gz'
            },
            {
                urls: 'turn:global.relay.metered.ca:443',
                username: 'a5f0489b0b2f9fe3c17b9c0f',
                credential: 'TBr6GE9/+t4xp1Gz'
            },
            {
                urls: 'turn:global.relay.metered.ca:443?transport=tcp',
                username: 'a5f0489b0b2f9fe3c17b9c0f',
                credential: 'TBr6GE9/+t4xp1Gz'
            },
            // Alternative reliable servers
            {
                urls: 'turn:numb.viagenie.ca',
                username: 'webrtc@live.com',
                credential: 'muazkh'
            },
            {
                urls: 'turn:turn.bistri.com:80',
                username: 'homeo',
                credential: 'homeo'
            },
            // Coturn public servers
            {
                urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
                username: 'webrtc',
                credential: 'webrtc'
            },
            // Xirsys free tier (if you have account)
            {
                urls: 'turns:global.xirsys.com:5349?transport=tcp',
                username: 'free',
                credential: 'free'
            }
        ],
        // Enhanced configuration for better connectivity
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        // Force TURN relay for better NAT traversal
        iceTransportPolicy: 'relay' as const, // Force TURN servers only - no STUN/host candidates
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

    async createPeerConnection(useTurnOnly: boolean = false): Promise<RTCPeerConnection> {
        const config = useTurnOnly ? this.getTurnOnlyConfig() : this.config;
        console.log(`Creating peer connection with${useTurnOnly ? ' TURN-only' : ' TURN-relay'} config`);
        console.log('🌍 Using ICE servers:', config.iceServers.map(server => ({
            url: server.urls,
            hasCredentials: !!(server.username && server.credential)
        })));
        this.peerConnection = new RTCPeerConnection(config);

        // Add local stream to peer connection
        if (this.localStream) {
            console.log('📤 Adding local stream to peer connection:', {
                streamId: this.localStream.id,
                audioTracks: this.localStream.getAudioTracks().length,
                videoTracks: this.localStream.getVideoTracks().length,
                videoTrackStates: this.localStream.getVideoTracks().map((track: any) => ({
                    id: track.id,
                    enabled: track.enabled,
                    readyState: track.readyState,
                    muted: track.muted
                }))
            });
            
            this.localStream.getTracks().forEach(track => {
                console.log(`Adding ${track.kind} track:`, { id: track.id, enabled: track.enabled });
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
            console.log('🎥 Remote track received:', event);
            
            if (event.streams && event.streams[0]) {
              const stream = event.streams[0];
              
              // ✅ ตรวจสอบว่า stream มี tracks หรือไม่
              const audioTracks = stream.getAudioTracks();
              const videoTracks = stream.getVideoTracks();
              
              if (audioTracks.length === 0 && videoTracks.length === 0) {
                console.warn('⚠️ Remote stream has no tracks');
                return;
              }
              
              console.log('📺 Remote stream details:', {
                id: stream.id,
                active: stream.active,
                audioTracks: audioTracks.length,
                videoTracks: videoTracks.length,
                videoTrackStates: videoTracks.map(track => ({
                  id: track.id,
                  enabled: track.enabled,
                  readyState: track.readyState,
                  muted: track.muted
                }))
              });
          
              // ✅ เปิดใช้งาน audio tracks
              audioTracks.forEach(track => {
                track.enabled = true;
                
                // Boost volume
                if (track._setVolume) track._setVolume(1.0);
                if (track.setVolume) track.setVolume(1.0);
                
                console.log('🔊 Audio track enabled:', { 
                  id: track.id, 
                  enabled: track.enabled 
                });
              });
          
              // ✅ เปิดใช้งาน video tracks
              videoTracks.forEach(track => {
                track.enabled = true;
                
                // Force unmute if needed
                if (track.muted && track.unmute) {
                  track.unmute();
                }
                
                console.log('📹 Video track enabled:', { 
                  id: track.id, 
                  enabled: track.enabled, 
                  muted: track.muted, 
                  readyState: track.readyState,
                  settings: track.getSettings ? track.getSettings() : {}
                });
              });
              
              // ✅ สร้าง stream URL สำหรับแสดงผล
              let streamURL = null;
              try {
                if (typeof stream.toURL === 'function') {
                  streamURL = stream.toURL();
                  console.log('✅ Stream URL created:', streamURL);
                }
              } catch (error) {
                console.error('❌ Failed to create stream URL:', error);
              }
              
              this.remoteStream = stream;
              this.state.hasRemoteStream = true;
              this.state.remoteStream = stream;
              this.state.remoteStreamURL = streamURL; // ✅ เก็บ URL ใน state
              
              console.log('🎯 Remote stream set successfully:', {
                streamId: stream.id,
                streamURL: streamURL,
                audioEnabled: audioTracks.length > 0 && audioTracks[0]?.enabled,
                videoEnabled: videoTracks.length > 0 && videoTracks[0]?.enabled
              });
              
              this.emit('remoteStream', stream);
            }
          };

        // Handle ICE candidates
        (this.peerConnection as any).onicecandidate = (event: any) => {
            if (event.candidate) {
                const candidate = event.candidate;
                console.log('🧊 New ICE candidate:', {
                    type: candidate.type || 'unknown',
                    protocol: candidate.protocol,
                    address: candidate.address || candidate.ip,
                    port: candidate.port,
                    priority: candidate.priority,
                    candidateType: candidate.candidateType || 'unknown',
                    foundation: candidate.foundation,
                    component: candidate.component,
                    relatedAddress: candidate.relatedAddress,
                    relatedPort: candidate.relatedPort
                });
                
                // Critical: Check if we're getting TURN candidates
                if (candidate.candidateType === 'relay') {
                    console.log('✅ TURN candidate found!', candidate.address);
                } else if (candidate.candidateType === 'host') {
                    console.warn('⚠️ Host candidate found - should not happen with relay-only policy');
                } else if (candidate.candidateType === 'srflx') {
                    console.warn('⚠️ STUN candidate found - should not happen with relay-only policy');
                }
                
                // Send candidate through signaling service
                signalingService.sendIceCandidate(event.candidate, this.getCurrentPeerId());
            } else {
                console.log('🧊 ICE gathering completed');
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

        // ICE connection state change handler with enhanced debugging
        (this.peerConnection as any).oniceconnectionstatechange = () => {
            const iceState = this.peerConnection?.iceConnectionState;
            console.log('🔄 ICE connection state changed:', iceState);
            
            if (iceState === 'failed') {
                console.error('❌ ICE connection failed!');
                this.state.isConnected = false;
                this.state.isConnecting = false;
                
                // Log ICE candidates for debugging
                this.debugIceCandidates();
                
                // Try restart first, then full reconnection
                console.log('🔄 Attempting ICE restart...');
                this.restartIce();
                
                // If ICE restart fails, try full reconnection after 5 seconds
                setTimeout(() => {
                    if (!this.state.isConnected) {
                        console.log('🔄 ICE restart failed, attempting full reconnection...');
                        this.attemptReconnection();
                    }
                }, 5000);
                
            } else if (iceState === 'connected' || iceState === 'completed') {
                console.log('✅ ICE connection established successfully:', iceState);
                this.state.isConnecting = false;
                this.state.isConnected = true;
                this.state.connectionRetries = 0; // Reset retry count on success
                this.emit('connected', {});
                
                // Ensure UI knows about the connection
                console.log('🎉 WebRTC connection successful! Remote stream ready.');
                
            } else if (iceState === 'disconnected') {
                console.warn('⚠️ ICE connection disconnected');
                this.state.isConnected = false;
                this.emit('disconnected', {});
                
                // Try to recover connection after 3 seconds
                setTimeout(() => {
                    if (!this.state.isConnected) {
                        console.log('🔄 Attempting reconnection after disconnect...');
                        this.attemptReconnection();
                    }
                }, 3000);
                
            } else if (iceState === 'checking') {
                console.log('🔍 ICE connection checking...');
                this.state.isConnecting = true;
                this.emit('connecting', {});
                
                // Set shorter timeout for TURN-only checking (8 seconds)
                setTimeout(() => {
                    const currentState = this.peerConnection?.iceConnectionState;
                    if (currentState === 'checking') {
                        console.error('⏰ ICE checking timeout after 8 seconds');
                        console.log('🔄 TURN servers not responding, forcing restart...');
                        this.handleConnectionFailure();
                    }
                }, 8000); // Reduced to 8 seconds for TURN-only mode
                
            } else if (iceState === 'new') {
                console.log('🆕 ICE connection state: new');
            } else {
                console.log('🔄 ICE connection state:', iceState);
            }
        };

        return this.peerConnection;
    }

    async createOffer(peerId: string): Promise<void> {
        try {
            console.log('Starting createOffer for peer:', peerId);
            
            // Prevent sending offer multiple times
            if (this.offerSent) {
                console.warn('Offer already sent, ignoring duplicate request');
                return;
            }
            
            // Check if we already have a connection
            if (this.state.isConnected) {
                console.log('Already connected, skipping offer creation');
                return;
            }
            
            this.currentPeerId = peerId;
            
            // Update state to connecting
            this.state.isConnecting = true;
            this.state.isConnected = false;
            this.emit('connecting', {});
            
            if (!this.peerConnection) {
                console.log('Creating new peer connection...');
                await this.createPeerConnection();
            }

            console.log('Peer connection state:', this.peerConnection?.connectionState);
            console.log('Local stream available:', !!this.localStream);

            const offer = await this.peerConnection!.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
                voiceActivityDetection: true,
                iceRestart: false,
            });

            console.log('Offer created:', offer.type);
            await this.peerConnection!.setLocalDescription(offer);
            console.log('Local description set');

            // Send offer through signaling service
            console.log('Sending offer to peer:', peerId);
            signalingService.sendOffer(offer, peerId);
            this.offerSent = true;

            console.log('Offer created and sent successfully to:', peerId);
        } catch (error) {
            console.error('Failed to create offer:', error);
            this.state.error = error instanceof Error ? error.message : 'Failed to create offer';
            this.state.isConnecting = false;
            this.emit('connectionError', error);
            throw error; // Re-throw to allow retry logic
        }
    }

    async handleOffer(data: any): Promise<void> {
        try {
          // ✅ เพิ่มการตรวจสอบ state ที่เข้มงวดขึ้น
          if (this.answerSent || this.state.isConnected) {
            console.log('🚫 Skipping offer - already processed or connected');
            return;
          }
          
          if (this.peerConnection && this.peerConnection.signalingState !== 'stable') {
            console.warn('⚠️ Peer connection not in stable state:', this.peerConnection.signalingState);
            return;
          }
          
          const offer = data.offer || data;
          const from = data.from;
          
          if (!offer?.type || !offer?.sdp) {
            console.error('❌ Invalid offer data:', data);
            return;
          }
          
          this.currentPeerId = from;
          
          if (!this.peerConnection) {
            await this.createPeerConnection();
          }
      
          // ✅ ตรวจสอบ signaling state ก่อนตั้งค่า remote description
          console.log('📥 Setting remote description, current state:', this.peerConnection!.signalingState);
          
          await this.peerConnection!.setRemoteDescription(new RTCSessionDescription({
            type: offer.type,
            sdp: offer.sdp,
          }));
          
          console.log('✅ Remote description set, new state:', this.peerConnection!.signalingState);
      
          // ✅ ตรวจสอบว่ายังอยู่ใน state ที่ถูกต้อง
          if (this.peerConnection!.signalingState !== 'have-remote-offer') {
            console.warn('⚠️ Unexpected state after setting remote description');
            return;
          }
      
          if (this.answerSent) {
            console.warn('🚫 Answer already sent, skipping');
            return;
          }
      
          // ✅ สร้าง answer พร้อม constraints ที่เหมาะสม
          const answer = await this.peerConnection!.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
            voiceActivityDetection: true
          });
          
          await this.peerConnection!.setLocalDescription(answer);
          
          // ✅ ส่ง answer ผ่าน signaling service
          signalingService.sendAnswer(answer, from);
          this.answerSent = true;
      
          console.log('✅ Answer created and sent successfully to:', from);
        } catch (error) {
          console.error('❌ Failed to handle offer:', error);
          this.emit('connectionError', error);
        }
      }

    async handleAnswer(data: any): Promise<void> {
        try {
            console.log('Handling answer:', data);
            
            // Skip processing if we're already connected
            if (this.state.isConnected) {
                console.log('🚫 Skipping answer - already connected');
                return;
            }
            
            // Check peer connection state before processing answer
            if (!this.peerConnection) {
                console.warn('⚠️ No peer connection available for answer');
                return;
            }
            
            const currentState = this.peerConnection.signalingState;
            console.log('Current signaling state before processing answer:', currentState);
            
            // Only process answer if we're in the right state
            if (currentState === 'stable') {
                console.warn('🚫 Peer connection already stable, ignoring answer');
                return;
            }
            
            if (currentState !== 'have-local-offer' && currentState !== 'have-remote-pranswer') {
                console.warn(`🚫 Ignoring answer - wrong state: ${currentState}`);
                return;
            }
            
            // Extract answer and from from data
            const answer = data.answer || data;
            const from = data.from;
            
            if (!answer || !answer.type || !answer.sdp) {
                console.error('❌ Invalid answer data:', data);
                return;
            }
            
            // Check for duplicate answer
            const answerKey = `${from}_${answer.sdp.substring(0, 50)}`;
            if (this.state.lastProcessedAnswerKey === answerKey) {
                console.warn('🚫 Duplicate answer detected, ignoring');
                return;
            }
            
            this.state.lastProcessedAnswerKey = answerKey;
            
            if (this.peerConnection) {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription({
                    type: answer.type,
                    sdp: answer.sdp,
                }));
                console.log('✅ Answer received and set from:', from);
            }
        } catch (error) {
            console.error('❌ Failed to handle answer:', error);
        }
    }

    async handleIceCandidate(data: any): Promise<void> {
        try {
            // Check if peer connection is ready
            if (!this.peerConnection) {
                return;
            }
            
            // Check if remote description is set
            if (!this.peerConnection.remoteDescription) {
                // ICE candidate received too early, ignore
                return;
            }
            
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
                console.error('Invalid ICE candidate data');
                return;
            }
            
            // Security: Validate ICE candidate format
            if (!this.isValidIceCandidate(candidate)) {
                console.warn('Invalid ICE candidate format, rejecting');
                return;
            }
            
            // Validate that at least one of sdpMLineIndex or sdpMid is provided
            if (candidate.sdpMLineIndex === null && candidate.sdpMLineIndex !== 0 && !candidate.sdpMid) {
                console.warn('ICE candidate missing both sdpMLineIndex and sdpMid, skipping');
                return;
            }
            
            if (this.peerConnection) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                // ICE candidate added successfully
            }
        } catch (error) {
            console.error('Failed to add ICE candidate:', error);
        }
    }

    // Security: Validate ICE candidate
    private isValidIceCandidate(candidate: any): boolean {
        try {
            // Check required fields
            if (!candidate.candidate || typeof candidate.candidate !== 'string') {
                return false;
            }
            
            // Basic format validation for ICE candidate string
            const candidateString = candidate.candidate;
            
            // Should contain essential ICE candidate parts
            if (!candidateString.includes('candidate:') || 
                !candidateString.includes('typ ')) {
                return false;
            }
            
            // Check for suspicious content
            const suspiciousPatterns = [
                /<script/i,
                /javascript:/i,
                /data:/i,
                /vbscript:/i
            ];
            
            for (const pattern of suspiciousPatterns) {
                if (pattern.test(candidateString)) {
                    console.warn('Suspicious content detected in ICE candidate');
                    return false;
                }
            }
            
            // Validate IP address format (basic check)
            const ipMatch = candidateString.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/);
            if (ipMatch) {
                const ip = ipMatch[1];
                const parts = ip.split('.').map(Number);
                
                // Check for valid IP range
                if (parts.some((part: number) => part > 255 || part < 0)) {
                    return false;
                }
                
                // Block private IP ranges in production for security
                if (!__DEV__) {
                    // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
                    if ((parts[0] === 10) ||
                        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
                        (parts[0] === 192 && parts[1] === 168)) {
                        console.warn('Private IP address detected in production');
                        return false;
                    }
                }
            }
            
            return true;
        } catch (error) {
            console.error('Error validating ICE candidate:', error);
            return false;
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
            // Boost local stream audio
            if (this.localStream) {
                const audioTracks = this.localStream.getAudioTracks();
                
                audioTracks.forEach((track, index) => {
                    track.enabled = true;
                    
                    // Try different volume setting methods
                    const trackAny = track as any;
                    
                    // Method 1: _setVolume
                    if (trackAny._setVolume) {
                        trackAny._setVolume(1.0);
                        // Volume set
                    }
                    
                    // Method 2: setVolume
                    if (trackAny.setVolume) {
                        trackAny.setVolume(1.0);
                        console.log('Used setVolume for local track');
                    }
                    
                    // Method 3: volume property
                    try {
                        trackAny.volume = 1.0;
                        // Volume property set
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
                        // Remote volume set
                    }
                    
                    // Method 2: setVolume
                    if (trackAny.setVolume) {
                        trackAny.setVolume(1.0);
                        console.log('Used setVolume for remote track');
                    }
                    
                    // Method 3: volume property
                    try {
                        trackAny.volume = 1.0;
                        // Remote volume property set
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
            
            // Audio boost completed
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

    // Debug ICE candidates for troubleshooting
    private async debugIceCandidates(): Promise<void> {
        if (!this.peerConnection) return;
        
        try {
            const stats = await this.peerConnection.getStats();
            console.log('🔍 Debug ICE Candidates:');
            
            stats.forEach((report: any) => {
                if (report.type === 'local-candidate') {
                    console.log('📤 Local candidate:', {
                        candidateType: report.candidateType,
                        ip: report.ip,
                        port: report.port,
                        protocol: report.protocol,
                        url: report.url
                    });
                } else if (report.type === 'remote-candidate') {
                    console.log('📥 Remote candidate:', {
                        candidateType: report.candidateType,
                        ip: report.ip,
                        port: report.port,
                        protocol: report.protocol
                    });
                } else if (report.type === 'candidate-pair') {
                    console.log('🔗 Candidate pair:', {
                        state: report.state,
                        nominated: report.nominated,
                        writable: report.writable,
                        readable: report.readable
                    });
                }
            });
        } catch (error) {
            console.error('Failed to debug ICE candidates:', error);
        }
    }

    // Create TURN-only configuration for fallback
    private getTurnOnlyConfig(): WebRTCConfig {
        return {
            ...this.config,
            iceTransportPolicy: 'relay' as const, // Force TURN servers only
            iceServers: [
                // Use only working TURN servers for backup
                {
                    urls: 'turn:global.relay.metered.ca:80',
                    username: 'a5f0489b0b2f9fe3c17b9c0f',
                    credential: 'TBr6GE9/+t4xp1Gz'
                },
                {
                    urls: 'turn:global.relay.metered.ca:443',
                    username: 'a5f0489b0b2f9fe3c17b9c0f',
                    credential: 'TBr6GE9/+t4xp1Gz'
                }
            ]
        };
    }

    // Handle connection failure
    private async handleConnectionFailure(): Promise<void> {
        try {
            // Increment retry count
            this.state.connectionRetries = (this.state.connectionRetries || 0) + 1;
            
            console.log(`Attempting to restart connection (attempt ${this.state.connectionRetries})...`);
            
            // Close current peer connection
            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = null;
            }
            
            // Wait a bit before restart
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Use TURN-only after first failure
            const useTurnOnly = this.state.connectionRetries > 1;
            if (useTurnOnly) {
                console.log('🚀 Using TURN-only configuration due to previous failures');
            }
            
            // Recreate peer connection with potentially TURN-only config
            await this.createPeerConnection(useTurnOnly);
            
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

    // Attempt connection recovery
    private async attemptReconnection(): Promise<void> {
        if (this.state.isConnected || this.state.isConnecting) {
            console.log('Already connected or connecting, skipping reconnection');
            return;
        }

        console.log('Attempting connection recovery...');
        try {
            // Reset connection flags
            this.offerSent = false;
            this.answerSent = false;
            
            // Close existing connection
            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = null;
            }
            
            // Wait a bit before creating new connection
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Create new peer connection
            await this.createPeerConnection();
            
            // Notify that we're ready for new signaling
            this.emit('readyForNewConnection', {});
            
        } catch (error) {
            console.error('Connection recovery failed:', error);
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

    async cleanup(): Promise<void> {
        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        // Stop local stream tracks but keep stream for reuse
        if (this.localStream) {
            // Don't stop tracks, just clear reference
            this.localStream = null;
        }
        
        // Clear remote stream
        this.remoteStream = null;
        
        // Reset state
        this.state = {
            isConnecting: false,
            isConnected: false,
            hasLocalStream: false,
            hasRemoteStream: false,
        };
        
        this.currentPeerId = '';
        this.offerSent = false;
        this.answerSent = false;
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


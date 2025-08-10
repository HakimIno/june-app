import { io, Socket } from 'socket.io-client';
import { SignalingMessage, SignalingState, UserSession } from '../types/webrtc';

class SignalingService {
  private socket: Socket | null = null;
  private socketId: string | null = null;
  private state: SignalingState = {
    isConnected: false,
    isSearching: false,
  };
  private listeners: Map<string, Function[]> = new Map();

  // Production server หรือ development server URL
  private readonly serverUrl = __DEV__ 
    ? 'http://192.168.67.21:3001' 
    : 'wss://your-production-server.com';

  connect(userSession: UserSession): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io(this.serverUrl, {
          transports: ['websocket'],
          forceNew: true,
          timeout: 10000,
        });

        this.socket.on('connect', () => {
          console.log('Signaling server connected');
          this.socketId = this.socket?.id || null;
          this.state.isConnected = true;
          this.emit('connected', { isConnected: true });
          
          // Register user session
          this.socket?.emit('register-user', userSession);
          resolve();
        });

        this.socket.on('registration-success', (data) => {
          console.log('Registration successful:', data);
          this.emit('registration-success', data);
        });

        this.socket.on('disconnect', () => {
          console.log('Signaling server disconnected');
          this.state.isConnected = false;
          this.emit('disconnected', { isConnected: false });
        });

        this.socket.on('connect_error', (error) => {
          console.error('Signaling connection error:', error);
          this.state.error = error.message;
          reject(error);
        });

        // WebRTC signaling events
        this.socket.on('offer', (data) => {
          this.emit('offer', data);
        });

        this.socket.on('answer', (data) => {
          this.emit('answer', data);
        });

        this.socket.on('ice-candidate', (data) => {
          this.emit('ice-candidate', data);
        });

        this.socket.on('user-joined', (data) => {
          this.emit('user-joined', data);
        });

        this.socket.on('user-left', (data) => {
          this.emit('user-left', data);
        });

        this.socket.on('match-found', (data) => {
          console.log('Match found:', data);
          this.state.currentRoomId = data.roomId;
          this.emit('match-found', data);
        });

        this.socket.on('search-started', (data) => {
          console.log('Search started:', data);
          this.emit('search-started', data);
        });

        this.socket.on('no-match', () => {
          console.log('No match found, continuing search...');
          this.emit('no-match', {});
        });

        this.socket.on('room-error', (error) => {
          console.error('Room error:', error);
          this.emit('room-error', error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.socketId = null;
    this.state = {
      isConnected: false,
      isSearching: false,
    };
    this.listeners.clear();
  }

  // หาคู่สนทนาใหม่
  findMatch(preferences?: any): void {
    if (!this.socket || !this.state.isConnected) {
      console.error('Signaling service not connected');
      return;
    }

    this.state.isSearching = true;
    this.socket.emit('find-match', { preferences });
    this.emit('search-started', { isSearching: true });
  }

  // ออกจากการสนทนาปัจจุบัน
  leaveCurrentMatch(): void {
    if (!this.socket || !this.state.currentRoomId) {
      return;
    }

    this.socket.emit('leave-room', { roomId: this.state.currentRoomId });
    this.state.currentRoomId = undefined;
    this.state.isSearching = false;
    this.emit('left-room', {});
  }

  // ส่ง WebRTC signaling messages
  sendOffer(offer: RTCSessionDescriptionInit, to: string): void {
    this.sendMessage({
      type: 'offer',
      data: offer,
      to,
    });
  }

  sendAnswer(answer: RTCSessionDescriptionInit, to: string): void {
    this.sendMessage({
      type: 'answer',
      data: answer,
      to,
    });
  }

  sendIceCandidate(candidate: RTCIceCandidate, to: string): void {
    this.sendMessage({
      type: 'ice-candidate',
      data: candidate,
      to,
    });
  }

  private sendMessage(message: SignalingMessage): void {
    if (!this.socket || !this.state.isConnected) {
      console.error('Cannot send message: not connected');
      return;
    }

    this.socket.emit('signaling-message', message);
  }

  // Event listeners management
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
  getState(): SignalingState {
    return { ...this.state };
  }

  isConnected(): boolean {
    return this.state.isConnected;
  }

  isSearching(): boolean {
    return this.state.isSearching;
  }

  getCurrentRoomId(): string | undefined {
    return this.state.currentRoomId;
  }

  getSocketId(): string | null {
    return this.socketId;
  }
}

// Singleton instance
export const signalingService = new SignalingService();
export default SignalingService;

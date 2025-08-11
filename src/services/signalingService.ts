import { SignalingMessage, SignalingState, UserSession } from '../types/webrtc';

class SignalingService {
  private socket: WebSocket | null = null;
  private socketId: string | null = null;
  private state: SignalingState = {
    isConnected: false,
    isSearching: false,
  };
  private listeners: Map<string, Function[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  // Production server หรือ development server URL
  private readonly serverUrl = __DEV__ 
    ? 'ws://192.168.95.82:3001/ws' 
    : 'wss://your-production-server.com/ws';

  connect(userSession: UserSession): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log('Connecting to WebSocket server:', this.serverUrl);
        
        this.socket = new WebSocket(this.serverUrl);

        this.socket.onopen = () => {
          console.log('WebSocket connection established');
          this.state.isConnected = true;
          this.reconnectAttempts = 0;
          this.emit('connected', { isConnected: true });
          
          // Register user session
          this.sendMessage({
            type: 'register-user',
            data: { userSession }
          });
          
          resolve();
        };

        this.socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleIncomingMessage(message);
          } catch (error) {
            console.error('Failed to parse message:', error);
          }
        };

        this.socket.onclose = (event) => {
          console.log('WebSocket connection closed:', event.code, event.reason);
          this.state.isConnected = false;
          this.emit('disconnected', { isConnected: false });
          
          // Attempt reconnection if not intentionally closed
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect(userSession);
          }
        };

        this.socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.state.error = 'Connection error';
          reject(new Error('WebSocket connection failed'));
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  private handleIncomingMessage(message: any): void {
    const { type, data } = message;
    
    console.log('Received message:', type, data);

    switch (type) {
      case 'connect':
        this.socketId = data?.sid || null;
        console.log('Connected with socket ID:', this.socketId);
        break;
        
      case 'registration-success':
        console.log('Registration successful:', data);
        this.emit('registration-success', data);
        break;
        
      case 'match-found':
        console.log('Match found:', data);
        this.state.currentRoomId = data.roomId;
        this.emit('match-found', data);
        break;
        
      case 'search-started':
        console.log('Search started:', data);
        this.emit('search-started', data);
        break;
        
      case 'no-match':
        console.log('No match found, continuing search...');
        this.emit('no-match', {});
        break;
        
      case 'room-error':
        console.error('Room error:', data);
        this.emit('room-error', data);
        break;
        
      case 'offer':
        this.emit('offer', data);
        break;
        
      case 'answer':
        this.emit('answer', data);
        break;
        
      case 'ice-candidate':
        this.emit('ice-candidate', data);
        break;
        
      case 'user-left':
        this.emit('user-left', data);
        break;
        
      case 'server-stats':
        console.log('Server stats:', data);
        break;
        
      default:
        console.log('Unknown message type:', type);
    }
  }

  private attemptReconnect(userSession: UserSession): void {
    this.reconnectAttempts++;
    console.log(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    
    setTimeout(() => {
      this.connect(userSession).catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close(1000, 'User disconnected');
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
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('Signaling service not connected');
      return;
    }

    this.state.isSearching = true;
    this.sendMessage({
      type: 'find-match',
      data: { preferences }
    });
    this.emit('search-started', { isSearching: true });
  }

  // ออกจากการสนทนาปัจจุบัน
  leaveCurrentMatch(): void {
    if (!this.socket || !this.state.currentRoomId) {
      return;
    }

    this.sendMessage({
      type: 'leave-room',
      data: { roomId: this.state.currentRoomId }
    });
    this.state.currentRoomId = undefined;
    this.state.isSearching = false;
    this.emit('left-room', {});
  }

  // ส่ง WebRTC signaling messages
  sendOffer(offer: RTCSessionDescriptionInit, to: string): void {
    this.sendMessage({
      type: 'offer',
      data: { offer, to }
    });
  }

  sendAnswer(answer: RTCSessionDescriptionInit, to: string): void {
    this.sendMessage({
      type: 'answer',
      data: { answer, to }
    });
  }

  sendIceCandidate(candidate: RTCIceCandidate, to: string): void {
    this.sendMessage({
      type: 'ice-candidate',
      data: { candidate, to }
    });
  }

  private sendMessage(message: any): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('Cannot send message: not connected');
      return;
    }

    try {
      const messageStr = JSON.stringify(message);
      console.log('Sending message:', messageStr);
      this.socket.send(messageStr);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
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
    return this.state.isConnected && this.socket?.readyState === WebSocket.OPEN;
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

import { SignalingMessage, SignalingState, UserSession } from '../types/webrtc';
import { ReactNativeCrypto } from '../utils/cryptoUtils';

class SignalingService {
  private socket: WebSocket | null = null;
  private socketId: string | null = null;
  private sessionToken: string | null = null;
  private encryptionKey: string | null = null;
  private state: SignalingState = {
    isConnected: false,
    isSearching: false,
  };
  private listeners: Map<string, Function[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  
  // Rate limiting
  private lastMessageTime = 0;
  private messageCount = 0;
  private readonly rateLimitWindow = 1000; // 1 second
  private readonly maxMessagesPerWindow = 10;

  // Production server หรือ development server URL - ใช้ WSS สำหรับ production
  private readonly serverUrl = __DEV__ 
    ? 'ws://192.168.214.21:3001/ws' 
    : 'wss://your-production-server.com/ws';

  // Security utilities - React Native compatible
  private generateSessionToken(): string {
    return ReactNativeCrypto.generateSecureToken(32);
  }

  private async generateEncryptionKey(): Promise<string> {
    return ReactNativeCrypto.generateEncryptionKey();
  }

  private async encryptMessage(message: string): Promise<string> {
    // Skip encryption in development mode
    if (__DEV__) {
      return message;
    }
    
    if (!this.encryptionKey) return message;
    
    try {
      return await ReactNativeCrypto.encryptMessage(message, this.encryptionKey);
    } catch (error) {
      console.error('Encryption failed:', error);
      return message; // Fallback to unencrypted
    }
  }

  private async decryptMessage(encryptedMessage: string): Promise<string> {
    // Skip decryption in development mode
    if (__DEV__) {
      return encryptedMessage;
    }
    
    if (!this.encryptionKey) return encryptedMessage;
    
    try {
      return await ReactNativeCrypto.decryptMessage(encryptedMessage, this.encryptionKey);
    } catch (error) {
      console.error('Decryption failed:', error);
      return encryptedMessage; // Fallback to encrypted
    }
  }

  private isRateLimited(): boolean {
    const now = Date.now();
    
    if (now - this.lastMessageTime > this.rateLimitWindow) {
      this.messageCount = 0;
      this.lastMessageTime = now;
    }
    
    this.messageCount++;
    return this.messageCount > this.maxMessagesPerWindow;
  }

  private sanitizeInput(input: any): any {
    if (typeof input === 'string') {
      // Remove potentially dangerous characters
      return input.replace(/[<>\"'&]/g, '');
    }
    if (typeof input === 'object' && input !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(input)) {
        // Only allow safe property names
        if (/^[a-zA-Z0-9_]+$/.test(key)) {
          sanitized[key] = this.sanitizeInput(value);
        }
      }
      return sanitized;
    }
    return input;
  }

  async connect(userSession: UserSession): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        // Generate security tokens
        this.sessionToken = this.generateSessionToken();
        this.encryptionKey = await this.generateEncryptionKey();
        
        // Sanitize user session
        const sanitizedSession = this.sanitizeInput(userSession);
        
        console.log('Connecting to WebSocket server:', this.serverUrl.replace(/:\d+/, ':****')); // Hide port in logs
        
        this.socket = new WebSocket(this.serverUrl);

        this.socket.onopen = () => {
          console.log('WebSocket connection established');
          this.state.isConnected = true;
          this.reconnectAttempts = 0;
          this.emit('connected', { isConnected: true });
          
          // Register user session with security token
          this.sendMessage({
            type: 'register-user',
            data: { 
              userSession: sanitizedSession,
              sessionToken: this.sessionToken,
              timestamp: Date.now()
            }
          });
          
          resolve();
        };

        this.socket.onmessage = async (event) => {
          try {
            // Decrypt message if encryption is enabled
            const decryptedData = await this.decryptMessage(event.data);
            const message = JSON.parse(decryptedData);
            
            // Sanitize incoming message
            const sanitizedMessage = this.sanitizeInput(message);
            this.handleIncomingMessage(sanitizedMessage);
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
    const { type, data, ...messageData } = message;
    
    console.log('Received message:', type, data || messageData);

    switch (type) {
      case 'connect':
        // Handle both nested data format and direct message format
        const connectData = data || messageData;
        this.socketId = connectData?.socketId || connectData?.sid || null;
        console.log('Connected with socket ID:', this.socketId);
        break;
        
      case 'registration-success':
        const regData = data || messageData;
        console.log('Registration successful:', regData);
        // Update socket ID from registration response as backup
        if (regData?.socketId && !this.socketId) {
          this.socketId = regData.socketId;
          console.log('Socket ID updated from registration:', this.socketId);
        }
        this.emit('registration-success', regData);
        break;
        
      case 'match-found':
        const matchData = data || messageData;
        console.log('Match found:', matchData);
        this.state.currentRoomId = matchData.roomId;
        this.emit('match-found', matchData);
        break;

      case 'room-joined':
        const roomData = data || messageData;
        console.log('Room joined:', roomData);
        this.state.currentRoomId = roomData.roomId;
        this.state.currentlySearching = false;
        this.emit('room-joined', roomData);
        break;

      case 'user-left':
        const leftData = data || messageData;
        console.log('User left room:', leftData);
        this.emit('user-left', leftData);
        break;
        
      case 'search-started':
        const searchData = data || messageData;
        console.log('Search started:', searchData);
        this.emit('search-started', searchData);
        break;
        
      case 'no-match':
        console.log('No match found, continuing search...');
        this.emit('no-match', {});
        break;
        
      case 'room-error':
        const errorData = data || messageData;
        console.error('Room error:', errorData);
        this.emit('room-error', errorData);
        break;
        
      case 'offer':
        const offerData = data || messageData;
        this.emit('offer', offerData);
        break;
        
      case 'answer':
        const answerData = data || messageData;
        this.emit('answer', answerData);
        break;
        
      case 'ice-candidate':
        const candidateData = data || messageData;
        this.emit('ice-candidate', candidateData);
        break;
        
      case 'server-stats':
        const statsData = data || messageData;
        console.log('Server stats:', statsData);
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

  private async sendMessage(message: any): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('Cannot send message: WebSocket not connected, state:', this.socket?.readyState);
      return;
    }

    // Check rate limiting
    if (this.isRateLimited()) {
      console.warn('Message rate limited');
      return;
    }

    try {
      // Add security headers
      const secureMessage = {
        ...message,
        sessionToken: this.sessionToken,
        timestamp: Date.now(),
        clientId: this.socketId
      };

      // Sanitize message
      const sanitizedMessage = this.sanitizeInput(secureMessage);
      
      // In development mode, skip encryption for easier debugging
      if (__DEV__) {
        const messageStr = JSON.stringify(sanitizedMessage);
        this.socket.send(messageStr);
      } else {
        // Encrypt message for production
        const messageStr = JSON.stringify(sanitizedMessage);
        const encryptedMessage = await this.encryptMessage(messageStr);
        this.socket.send(encryptedMessage);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
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

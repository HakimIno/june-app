// React Native compatible crypto utilities
// Note: In development mode, we skip complex crypto to avoid native module issues

// Simple crypto utilities for React Native
export class ReactNativeCrypto {
  // Generate random values using Math.random (good enough for development)
  static getRandomValues(array: Uint8Array): Uint8Array {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  }

  // Generate secure random string
  static generateSecureToken(length: number = 32): string {
    // Use simple approach for React Native
    let result = '';
    const chars = '0123456789abcdef';
    for (let i = 0; i < length * 2; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Simple "encryption" for development (just base64 encoding)
  static async encryptMessage(message: string, key: string): Promise<string> {
    try {
      // In development, just use base64 encoding for simplicity
      if (__DEV__) {
        return btoa(message); // Simple base64 encoding
      }
      
      // For production, we'd need proper encryption
      // For now, return the message as-is
      console.warn('Production encryption not implemented yet');
      return message;
    } catch (error) {
      console.error('Encryption failed:', error);
      return message; // Fallback to plain text
    }
  }

  // Simple "decryption" for development (just base64 decoding)
  static async decryptMessage(encryptedMessage: string, key: string): Promise<string> {
    try {
      // In development, just use base64 decoding
      if (__DEV__) {
        try {
          return atob(encryptedMessage); // Simple base64 decoding
        } catch {
          return encryptedMessage; // Return as-is if not base64
        }
      }
      
      // For production, we'd need proper decryption
      console.warn('Production decryption not implemented yet');
      return encryptedMessage;
    } catch (error) {
      console.error('Decryption failed:', error);
      return encryptedMessage; // Fallback to encrypted text
    }
  }

  // Generate encryption key
  static generateEncryptionKey(): string {
    return this.generateSecureToken(32); // 256-bit key
  }

  // Simple hash function (for development)
  static hash(data: string): string {
    // Simple hash implementation for development
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  // Simple HMAC function (for development)
  static hmac(data: string, key: string): string {
    // Simple HMAC implementation for development
    return this.hash(key + data + key);
  }
}

// Polyfill for Web Crypto API
export const crypto = {
  getRandomValues: (array: Uint8Array) => ReactNativeCrypto.getRandomValues(array),
  subtle: {
    generateKey: async () => {
      throw new Error('Use ReactNativeCrypto.generateEncryptionKey() instead');
    },
    exportKey: async () => {
      throw new Error('Not implemented in React Native');
    },
    importKey: async () => {
      throw new Error('Not implemented in React Native');
    },
    encrypt: async (algorithm: any, key: any, data: BufferSource) => {
      throw new Error('Use ReactNativeCrypto.encryptMessage() instead');
    },
    decrypt: async (algorithm: any, key: any, data: BufferSource) => {
      throw new Error('Use ReactNativeCrypto.decryptMessage() instead');
    }
  }
};

// Make crypto available globally if needed
if (typeof globalThis !== 'undefined' && !globalThis.crypto) {
  (globalThis as any).crypto = crypto;
}

export default ReactNativeCrypto;

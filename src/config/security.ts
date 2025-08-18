// Security configuration for JuneTV
import { ReactNativeCrypto } from '../utils/cryptoUtils';

export const SecurityConfig = {
  // Signaling security
  signaling: {
    maxReconnectAttempts: 5,
    reconnectDelay: 1000,
    rateLimitWindow: 1000, // 1 second
    maxMessagesPerWindow: 10,
    sessionTimeout: 30 * 60 * 1000, // 30 minutes
    encryptionEnabled: !__DEV__, // Disable encryption in development
  },

  // WebRTC security
  webrtc: {
    iceCandidateTimeout: 10000, // 10 seconds
    connectionTimeout: 30000, // 30 seconds
    maxBitrate: 5000000, // 5 Mbps
    minBitrate: 100000,  // 100 kbps
    dtlsEnabled: true,
    srtpEnabled: true,
  },

  // Content security
  content: {
    maxMessageLength: 1000,
    allowedMessageTypes: [
      'register-user',
      'find-match',
      'offer',
      'answer',
      'ice-candidate',
      'leave-room',
      'get-stats'
    ],
    sanitizationRules: {
      removeHtmlTags: true,
      removeScriptTags: true,
      maxStringLength: 500,
    }
  },

  // Network security
  network: {
    allowedDomains: __DEV__ 
      ? ['localhost', '192.168.*', '10.*'] 
      : ['your-production-domain.com'],
    blockedIpRanges: __DEV__ 
      ? [] 
      : ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'], // Block private IPs in production
    requireHttps: !__DEV__,
    certificatePinning: !__DEV__,
  },

  // Monitoring and logging
  monitoring: {
    logLevel: __DEV__ ? 'debug' : 'warn',
    enableMetrics: true,
    maxLogEntries: 1000,
    sensitiveDataFields: [
      'password',
      'token',
      'credential',
      'key',
      'secret'
    ]
  }
} as const;

// Security utility functions
export class SecurityUtils {
  // Generate secure random token - React Native compatible
  static generateSecureToken(length: number = 32): string {
    return ReactNativeCrypto.generateSecureToken(length);
  }

  // Validate message type
  static isValidMessageType(type: string): boolean {
    return SecurityConfig.content.allowedMessageTypes.includes(type);
  }

  // Sanitize string input
  static sanitizeString(input: string): string {
    const { sanitizationRules } = SecurityConfig.content;
    let sanitized = input;

    if (sanitizationRules.removeHtmlTags) {
      sanitized = sanitized.replace(/<[^>]*>/g, '');
    }

    if (sanitizationRules.removeScriptTags) {
      sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    }

    if (sanitized.length > sanitizationRules.maxStringLength) {
      sanitized = sanitized.substring(0, sanitizationRules.maxStringLength);
    }

    return sanitized;
  }

  // Validate IP address
  static isValidIpAddress(ip: string): boolean {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) return false;

    const parts = ip.split('.').map(Number);
    return parts.every(part => part >= 0 && part <= 255);
  }

  // Check if IP is in blocked range
  static isBlockedIp(ip: string): boolean {
    if (!this.isValidIpAddress(ip)) return true;

    const { blockedIpRanges } = SecurityConfig.network;
    
    for (const range of blockedIpRanges) {
      if (this.isIpInRange(ip, range)) {
        return true;
      }
    }

    return false;
  }

  // Check if IP is in CIDR range
  private static isIpInRange(ip: string, cidr: string): boolean {
    const [rangeIp, prefixLength] = cidr.split('/');
    const ipNum = this.ipToNumber(ip);
    const rangeIpNum = this.ipToNumber(rangeIp);
    const mask = (0xffffffff << (32 - parseInt(prefixLength))) >>> 0;
    
    return (ipNum & mask) === (rangeIpNum & mask);
  }

  private static ipToNumber(ip: string): number {
    return ip.split('.').reduce((acc, part) => (acc << 8) + parseInt(part), 0) >>> 0;
  }

  // Safe logging (remove sensitive data)
  static safeLog(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void {
    const { logLevel, sensitiveDataFields } = SecurityConfig.monitoring;
    
    if (this.shouldLog(level, logLevel)) {
      let safeData = data;
      
      if (data && typeof data === 'object') {
        safeData = this.removeSensitiveData(data, sensitiveDataFields);
      }
      
      console[level](message, safeData);
    }
  }

  private static shouldLog(level: string, configLevel: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(configLevel);
  }

  private static removeSensitiveData(obj: any, sensitiveFields: string[]): any {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    const safe: any = Array.isArray(obj) ? [] : {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        safe[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        safe[key] = this.removeSensitiveData(value, sensitiveFields);
      } else {
        safe[key] = value;
      }
    }
    
    return safe;
  }
}

export default SecurityConfig;

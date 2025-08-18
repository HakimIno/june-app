// Security monitoring service
import { SecurityConfig, SecurityUtils } from '../config/security';
import { ReactNativeCrypto } from '../utils/cryptoUtils';

interface SecurityEvent {
  id: string;
  type: 'connection' | 'message' | 'rate_limit' | 'validation' | 'encryption';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: number;
  data?: any;
  clientId?: string;
}

interface SecurityMetrics {
  totalConnections: number;
  failedConnections: number;
  rateLimitViolations: number;
  validationFailures: number;
  encryptionFailures: number;
  suspiciousActivities: number;
  lastUpdated: number;
}

class SecurityMonitorService {
  private events: SecurityEvent[] = [];
  private metrics: SecurityMetrics = {
    totalConnections: 0,
    failedConnections: 0,
    rateLimitViolations: 0,
    validationFailures: 0,
    encryptionFailures: 0,
    suspiciousActivities: 0,
    lastUpdated: Date.now(),
  };
  
  private suspiciousClients = new Set<string>();
  private blockedClients = new Set<string>();
  
  // Log security event
  logEvent(
    type: SecurityEvent['type'], 
    severity: SecurityEvent['severity'], 
    message: string, 
    data?: any,
    clientId?: string
  ): void {
    const event: SecurityEvent = {
      id: ReactNativeCrypto.generateSecureToken(16),
      type,
      severity,
      message,
      timestamp: Date.now(),
      data: data ? SecurityUtils.safeLog('debug', 'Security event data', data) : undefined,
      clientId,
    };

    this.events.push(event);
    
    // Keep only recent events
    const maxEvents = SecurityConfig.monitoring.maxLogEntries;
    if (this.events.length > maxEvents) {
      this.events = this.events.slice(-maxEvents);
    }

    // Update metrics
    this.updateMetrics(type);

    // Handle critical events
    if (severity === 'critical') {
      this.handleCriticalEvent(event);
    }

    // Log to console based on severity
    const logLevel = severity === 'low' ? 'info' : severity === 'medium' ? 'warn' : 'error';
    SecurityUtils.safeLog(logLevel, `Security Event [${type}]: ${message}`, { eventId: event.id, clientId });
  }

  // Update security metrics
  private updateMetrics(eventType: SecurityEvent['type']): void {
    switch (eventType) {
      case 'connection':
        this.metrics.totalConnections++;
        break;
      case 'rate_limit':
        this.metrics.rateLimitViolations++;
        break;
      case 'validation':
        this.metrics.validationFailures++;
        break;
      case 'encryption':
        this.metrics.encryptionFailures++;
        break;
    }
    this.metrics.lastUpdated = Date.now();
  }

  // Handle critical security events
  private handleCriticalEvent(event: SecurityEvent): void {
    console.error('🚨 CRITICAL SECURITY EVENT:', event);
    
    if (event.clientId) {
      this.flagSuspiciousClient(event.clientId);
      
      // Auto-block clients with multiple critical events
      const recentCriticalEvents = this.events.filter(e => 
        e.clientId === event.clientId && 
        e.severity === 'critical' && 
        Date.now() - e.timestamp < 60000 // Last minute
      );
      
      if (recentCriticalEvents.length >= 3) {
        this.blockClient(event.clientId, 'Multiple critical security violations');
      }
    }
  }

  // Flag suspicious client
  flagSuspiciousClient(clientId: string, reason?: string): void {
    this.suspiciousClients.add(clientId);
    this.logEvent('validation', 'medium', `Client flagged as suspicious: ${reason || 'Unknown reason'}`, {}, clientId);
  }

  // Block client
  blockClient(clientId: string, reason: string): void {
    this.blockedClients.add(clientId);
    this.logEvent('validation', 'critical', `Client blocked: ${reason}`, {}, clientId);
  }

  // Check if client is blocked
  isClientBlocked(clientId: string): boolean {
    return this.blockedClients.has(clientId);
  }

  // Check if client is suspicious
  isClientSuspicious(clientId: string): boolean {
    return this.suspiciousClients.has(clientId);
  }

  // Validate WebRTC message
  validateWebRTCMessage(message: any, clientId?: string): boolean {
    try {
      // Check message type
      if (!SecurityUtils.isValidMessageType(message.type)) {
        this.logEvent('validation', 'medium', `Invalid message type: ${message.type}`, { type: message.type }, clientId);
        return false;
      }

      // Check message size
      const messageSize = JSON.stringify(message).length;
      if (messageSize > SecurityConfig.content.maxMessageLength) {
        this.logEvent('validation', 'medium', `Message too large: ${messageSize} bytes`, { size: messageSize }, clientId);
        return false;
      }

      // Validate session token
      if (message.sessionToken && typeof message.sessionToken !== 'string') {
        this.logEvent('validation', 'high', 'Invalid session token format', {}, clientId);
        return false;
      }

      // Check timestamp for replay attacks
      if (message.timestamp) {
        const age = Date.now() - message.timestamp;
        if (age > 30000) { // 30 seconds max age
          this.logEvent('validation', 'medium', `Message too old: ${age}ms`, { age }, clientId);
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logEvent('validation', 'high', 'Message validation error', { error: error instanceof Error ? error.message : 'Unknown' }, clientId);
      return false;
    }
  }

  // Validate ICE candidate
  validateIceCandidate(candidate: any, clientId?: string): boolean {
    try {
      // Basic structure validation
      if (!candidate || typeof candidate !== 'object') {
        this.logEvent('validation', 'medium', 'Invalid ICE candidate structure', {}, clientId);
        return false;
      }

      // Required fields
      if (!candidate.candidate || typeof candidate.candidate !== 'string') {
        this.logEvent('validation', 'medium', 'Missing or invalid candidate string', {}, clientId);
        return false;
      }

      // Check for malicious content
      const suspiciousPatterns = [
        /<script/i,
        /javascript:/i,
        /data:/i,
        /file:/i,
        /ftp:/i
      ];

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(candidate.candidate)) {
          this.logEvent('validation', 'critical', 'Malicious content in ICE candidate', { pattern: pattern.source }, clientId);
          return false;
        }
      }

      // IP address validation
      const ipMatch = candidate.candidate.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/);
      if (ipMatch) {
        const ip = ipMatch[1];
        
        if (!SecurityUtils.isValidIpAddress(ip)) {
          this.logEvent('validation', 'medium', 'Invalid IP address in ICE candidate', { ip }, clientId);
          return false;
        }

        if (SecurityUtils.isBlockedIp(ip)) {
          this.logEvent('validation', 'high', 'Blocked IP address in ICE candidate', { ip }, clientId);
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logEvent('validation', 'high', 'ICE candidate validation error', { error: error instanceof Error ? error.message : 'Unknown' }, clientId);
      return false;
    }
  }

  // Monitor connection attempt
  monitorConnection(clientId: string, success: boolean, reason?: string): void {
    if (success) {
      this.logEvent('connection', 'low', 'Connection established', {}, clientId);
    } else {
      this.metrics.failedConnections++;
      this.logEvent('connection', 'medium', `Connection failed: ${reason || 'Unknown'}`, { reason }, clientId);
      
      // Flag multiple failed connections
      const recentFailures = this.events.filter(e => 
        e.clientId === clientId && 
        e.type === 'connection' && 
        e.message.includes('failed') &&
        Date.now() - e.timestamp < 300000 // Last 5 minutes
      );
      
      if (recentFailures.length >= 5) {
        this.flagSuspiciousClient(clientId, 'Multiple connection failures');
      }
    }
  }

  // Monitor rate limiting
  monitorRateLimit(clientId: string, messageType: string): void {
    this.logEvent('rate_limit', 'medium', `Rate limit exceeded for ${messageType}`, { messageType }, clientId);
    
    // Escalate if client hits rate limit frequently
    const recentRateLimits = this.events.filter(e => 
      e.clientId === clientId && 
      e.type === 'rate_limit' && 
      Date.now() - e.timestamp < 60000 // Last minute
    );
    
    if (recentRateLimits.length >= 5) {
      this.flagSuspiciousClient(clientId, 'Frequent rate limit violations');
    }
  }

  // Monitor encryption events
  monitorEncryption(success: boolean, operation: 'encrypt' | 'decrypt', clientId?: string): void {
    if (!success) {
      this.logEvent('encryption', 'high', `${operation} operation failed`, { operation }, clientId);
    }
  }

  // Get security metrics
  getMetrics(): SecurityMetrics {
    return { ...this.metrics };
  }

  // Get recent security events
  getRecentEvents(limit: number = 50): SecurityEvent[] {
    return this.events.slice(-limit).reverse();
  }

  // Get events by severity
  getEventsBySeverity(severity: SecurityEvent['severity']): SecurityEvent[] {
    return this.events.filter(e => e.severity === severity);
  }

  // Generate security report
  generateSecurityReport(): {
    summary: SecurityMetrics;
    criticalEvents: SecurityEvent[];
    suspiciousClients: string[];
    blockedClients: string[];
    recommendations: string[];
  } {
    const criticalEvents = this.getEventsBySeverity('critical');
    const recommendations: string[] = [];

    // Generate recommendations based on metrics
    if (this.metrics.failedConnections > this.metrics.totalConnections * 0.1) {
      recommendations.push('High failure rate detected - investigate connection issues');
    }

    if (this.metrics.rateLimitViolations > 100) {
      recommendations.push('Consider implementing stricter rate limiting');
    }

    if (this.metrics.validationFailures > 50) {
      recommendations.push('Multiple validation failures - review input validation');
    }

    if (criticalEvents.length > 0) {
      recommendations.push('Critical security events detected - immediate investigation required');
    }

    return {
      summary: this.getMetrics(),
      criticalEvents,
      suspiciousClients: Array.from(this.suspiciousClients),
      blockedClients: Array.from(this.blockedClients),
      recommendations,
    };
  }

  // Clear old data
  cleanup(): void {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    this.events = this.events.filter(e => e.timestamp > cutoff);
    
    // Clear old suspicious clients (reset every 24 hours)
    this.suspiciousClients.clear();
    
    this.logEvent('message', 'low', 'Security monitor cleanup completed', { eventsRemaining: this.events.length });
  }
}

// Singleton instance
export const securityMonitor = new SecurityMonitorService();
export default SecurityMonitorService;

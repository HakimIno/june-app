// TypeScript wrapper for Rust video processor
// This would integrate with the compiled Rust module

interface VideoProcessingConfig {
  target_bitrate: number;
  target_fps: number;
  target_width: number;
  target_height: number;
  quality_level: 'high' | 'medium' | 'low';
}

interface NetworkStats {
  rtt: number;
  packet_loss: number;
  bandwidth: number;
  jitter: number;
}

interface VideoQualityRecommendation {
  recommended_bitrate: number;
  recommended_fps: number;
  recommended_resolution: string;
  quality_level: 'high' | 'medium' | 'low';
  confidence: number;
}

export class SmartVideoProcessor {
  private isRustAvailable = false;
  private rustProcessor: any = null;
  private fallbackConfig: VideoProcessingConfig = {
    target_bitrate: 1000000,
    target_fps: 30,
    target_width: 1280,
    target_height: 720,
    quality_level: 'medium',
  };

  constructor() {
    this.initializeRustProcessor();
  }

  private async initializeRustProcessor() {
    try {
      console.log('Attempting to load Rust video processor...');
      
      // For now, we'll use JavaScript fallback
      this.isRustAvailable = false;
      console.log('Using JavaScript fallback for video processing');
    } catch (error) {
      console.warn('Rust video processor not available, using JavaScript fallback:', error);
      this.isRustAvailable = false;
    }
  }

  /**
   * Analyze network conditions and get video quality recommendations
   */
  analyzeNetwork(stats: NetworkStats): VideoQualityRecommendation {
    if (this.isRustAvailable && this.rustProcessor) {
      return this.rustProcessor.analyze_network(stats);
    }
    
    // JavaScript fallback implementation
    return this.analyzeNetworkFallback(stats);
  }

  /**
   * JavaScript fallback for network analysis
   */
  private analyzeNetworkFallback(stats: NetworkStats): VideoQualityRecommendation {
    const { rtt, packet_loss, bandwidth, jitter } = stats;
    
    // Calculate quality score (0.0 to 1.0) - More lenient scoring
    let qualityScore = 1.0;
    
    // RTT penalty - More lenient for typical mobile networks
    if (rtt > 500) qualityScore *= 0.3;
    else if (rtt > 300) qualityScore *= 0.6;
    else if (rtt > 200) qualityScore *= 0.8;
    else if (rtt > 100) qualityScore *= 0.95;
    
    // Packet loss penalty - More realistic thresholds
    if (packet_loss > 10) qualityScore *= 0.3;
    else if (packet_loss > 5) qualityScore *= 0.6;
    else if (packet_loss > 3) qualityScore *= 0.8;
    else if (packet_loss > 1) qualityScore *= 0.9;
    
    // Jitter penalty - More lenient for mobile networks
    if (jitter > 100) qualityScore *= 0.4;
    else if (jitter > 60) qualityScore *= 0.7;
    else if (jitter > 30) qualityScore *= 0.9;
    
    // Bandwidth consideration (in Mbps)
    const bandwidthMbps = bandwidth / 1_000_000;
    
    console.log('Analysis details:', {
      rtt,
      packet_loss,
      jitter,
      bandwidthMbps: bandwidthMbps.toFixed(2),
      qualityScore: qualityScore.toFixed(2)
    });

    // Debug: Force different quality levels for testing (remove in production)
    if (__DEV__) {
      const testMode = false; // Set to true to test different quality levels
      if (testMode) {
        const now = Date.now();
        const cycle = Math.floor(now / 10000) % 3; // Change every 10 seconds
        
        switch (cycle) {
          case 0: // High quality
            console.log('DEBUG: Forcing HIGH quality');
            return {
              recommended_bitrate: 2_500_000,
              recommended_fps: 30,
              recommended_resolution: '1920x1080',
              quality_level: 'high',
              confidence: 1.0,
            };
          case 1: // Medium quality
            console.log('DEBUG: Forcing MEDIUM quality');
            return {
              recommended_bitrate: 1_500_000,
              recommended_fps: 30,
              recommended_resolution: '1280x720',
              quality_level: 'medium',
              confidence: 1.0,
            };
          case 2: // Low quality
            console.log('DEBUG: Forcing LOW quality');
            return {
              recommended_bitrate: 500_000,
              recommended_fps: 20,
              recommended_resolution: '854x480',
              quality_level: 'low',
              confidence: 1.0,
            };
        }
      }
    }
    
    // Generate recommendation based on quality score and bandwidth - More optimistic thresholds
    if (qualityScore > 0.6 && bandwidthMbps > 2.0) {
      return {
        recommended_bitrate: 2_500_000,
        recommended_fps: 30,
        recommended_resolution: '1920x1080',
        quality_level: 'high',
        confidence: qualityScore,
      };
    } else if (qualityScore > 0.4 && bandwidthMbps > 1.0) {
      return {
        recommended_bitrate: 1_500_000,
        recommended_fps: 30,
        recommended_resolution: '1280x720',
        quality_level: 'medium',
        confidence: qualityScore,
      };
    } else if (qualityScore > 0.2 && bandwidthMbps > 0.5) {
      return {
        recommended_bitrate: 800_000,
        recommended_fps: 24,
        recommended_resolution: '1280x720',
        quality_level: 'medium',
        confidence: qualityScore,
      };
    } else {
      return {
        recommended_bitrate: 500_000,
        recommended_fps: 20,
        recommended_resolution: '854x480',
        quality_level: 'low',
        confidence: qualityScore,
      };
    }
  }

  /**
   * Get optimal bitrate for given parameters
   */
  calculateOptimalBitrate(width: number, height: number, fps: number, quality: 'high' | 'medium' | 'low'): number {
    if (this.isRustAvailable && this.rustProcessor) {
      // Would call Rust function: return calculate_optimal_bitrate(width, height, fps, quality);
    }
    
    // JavaScript fallback
    const pixelCount = width * height;
    let baseBitrate: number;
    
    switch (quality) {
      case 'high':
        baseBitrate = pixelCount / 300;
        break;
      case 'medium':
        baseBitrate = pixelCount / 500;
        break;
      case 'low':
        baseBitrate = pixelCount / 800;
        break;
      default:
        baseBitrate = pixelCount / 500;
    }
    
    // Adjust for frame rate
    const fpsFactor = fps / 30;
    return Math.round(baseBitrate * fpsFactor);
  }

  /**
   * Get recommended settings based on available bandwidth
   */
  getRecommendedSettings(bandwidthMbps: number): VideoProcessingConfig {
    if (bandwidthMbps > 3.0) {
      return {
        target_bitrate: 2_500_000,
        target_fps: 30,
        target_width: 1920,
        target_height: 1080,
        quality_level: 'high',
      };
    } else if (bandwidthMbps > 1.5) {
      return {
        target_bitrate: 1_500_000,
        target_fps: 30,
        target_width: 1280,
        target_height: 720,
        quality_level: 'medium',
      };
    } else {
      return {
        target_bitrate: 500_000,
        target_fps: 20,
        target_width: 854,
        target_height: 480,
        quality_level: 'low',
      };
    }
  }

  /**
   * Smart quality adjustment based on multiple factors
   */
  getSmartQualityConfig(networkStats: NetworkStats, deviceCapability: 'high' | 'medium' | 'low'): VideoProcessingConfig {
    const recommendation = this.analyzeNetwork(networkStats);
    const bandwidthMbps = networkStats.bandwidth / 1_000_000;
    
    // Consider device capability
    let adjustedQuality = recommendation.quality_level;
    if (deviceCapability === 'low' && adjustedQuality === 'high') {
      adjustedQuality = 'medium';
    } else if (deviceCapability === 'low' && adjustedQuality === 'medium') {
      adjustedQuality = 'low';
    }
    
    // Get base config
    const baseConfig = this.getRecommendedSettings(bandwidthMbps);
    
    // Apply device capability adjustments
    if (adjustedQuality !== recommendation.quality_level) {
      if (adjustedQuality === 'medium') {
        baseConfig.target_width = Math.min(baseConfig.target_width, 1280);
        baseConfig.target_height = Math.min(baseConfig.target_height, 720);
        baseConfig.target_bitrate = Math.min(baseConfig.target_bitrate, 1_500_000);
      } else if (adjustedQuality === 'low') {
        baseConfig.target_width = Math.min(baseConfig.target_width, 854);
        baseConfig.target_height = Math.min(baseConfig.target_height, 480);
        baseConfig.target_bitrate = Math.min(baseConfig.target_bitrate, 800_000);
        baseConfig.target_fps = Math.min(baseConfig.target_fps, 24);
      }
      baseConfig.quality_level = adjustedQuality;
    }
    
    return baseConfig;
  }

  /**
   * Check if Rust processor is available
   */
  isUsingRustProcessor(): boolean {
    return this.isRustAvailable;
  }

  /**
   * Get current processing capability info
   */
  getProcessorInfo(): { type: 'rust' | 'javascript'; version: string } {
    return {
      type: this.isRustAvailable ? 'rust' : 'javascript',
      version: '0.1.0',
    };
  }
}

// Singleton instance
export const smartVideoProcessor = new SmartVideoProcessor();
export default SmartVideoProcessor;

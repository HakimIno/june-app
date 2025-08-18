import { Dimensions, Platform } from 'react-native';

interface DevicePerformance {
  isLowEnd: boolean;
  recommendedParticleCount: number;
  shouldUseLowPowerMode: boolean;
}

/**
 * Simple device performance detection
 * This is a basic implementation - you might want to use a library like react-native-device-info for more accurate detection
 */
export const detectDevicePerformance = (): DevicePerformance => {
  const { width, height } = Dimensions.get('window');
  const screenSize = width * height;
  
  // Basic heuristics for device performance
  const isSmallScreen = screenSize < 800 * 600; // Roughly iPhone SE size
  const isLargeScreen = screenSize > 1200 * 800; // Roughly iPhone Pro Max size
  
  // iOS generally has better performance, but older devices might struggle
  const isIOS = Platform.OS === 'ios';
  
  // Simple performance scoring
  let performanceScore = 100;
  
  if (isSmallScreen) performanceScore -= 30;
  if (!isIOS) performanceScore -= 20; // Android can vary more
  
  const isLowEnd = performanceScore < 60;
  
  return {
    isLowEnd,
    recommendedParticleCount: isLowEnd ? 15 : isLargeScreen ? 120 : 80, // เพิ่มจำนวนอนุภาค
    shouldUseLowPowerMode: isLowEnd,
  };
};

/**
 * Performance monitoring utility
 */
export class PerformanceMonitor {
  private frameCount = 0;
  private lastTime = Date.now();
  private fpsHistory: number[] = [];
  private maxHistoryLength = 10;

  public measureFPS(): number {
    this.frameCount++;
    const currentTime = Date.now();
    const deltaTime = currentTime - this.lastTime;
    
    if (deltaTime >= 1000) { // Calculate FPS every second
      const fps = (this.frameCount * 1000) / deltaTime;
      this.fpsHistory.push(fps);
      
      if (this.fpsHistory.length > this.maxHistoryLength) {
        this.fpsHistory.shift();
      }
      
      this.frameCount = 0;
      this.lastTime = currentTime;
      
      return fps;
    }
    
    return this.getAverageFPS();
  }

  public getAverageFPS(): number {
    if (this.fpsHistory.length === 0) return 60; // Assume 60fps initially
    
    const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
    return sum / this.fpsHistory.length;
  }

  public shouldReduceEffects(): boolean {
    const avgFPS = this.getAverageFPS();
    return avgFPS < 45; // If FPS drops below 45, consider reducing effects
  }

  public reset(): void {
    this.frameCount = 0;
    this.lastTime = Date.now();
    this.fpsHistory = [];
  }
}

/**
 * Battery optimization utilities
 */
export const BatteryOptimization = {
  // Suggested particle counts based on app state and performance
  getOptimalParticleCount: (baseCount: number, isLowPower: boolean, isVideoActive: boolean): number => {
    let optimizedCount = baseCount;
    
    if (isLowPower) optimizedCount = Math.min(optimizedCount, 30); // เพิ่มจาก 6 เป็น 30
    if (isVideoActive) optimizedCount = Math.floor(optimizedCount * 0.4); // ลดเหลือ 40% เมื่อมีวิดีโอ
    
    return Math.max(optimizedCount, 10); // แสดงอย่างน้อย 10 อนุภาค
  },

  // Suggested animation durations for battery saving
  getOptimalAnimationDuration: (baseDuration: number, isLowPower: boolean): number => {
    return isLowPower ? baseDuration * 1.5 : baseDuration; // Slower animations = less battery usage
  },

  // Check if we should pause animations entirely
  shouldPauseAnimations: (batteryLevel?: number): boolean => {
    return batteryLevel !== undefined && batteryLevel < 0.15; // Pause at 15% battery
  },
};

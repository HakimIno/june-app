import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { homeScreenStyles } from '../../styles/homeScreenStyles';

interface VideoQualityIndicatorProps {
  currentQuality: 'high' | 'medium' | 'low';
  networkStats: {
    rtt: number;
    packetsLost: number;
    bandwidth: number;
    jitter: number;
  };
  showNetworkStats?: boolean;
}

export const VideoQualityIndicator: React.FC<VideoQualityIndicatorProps> = ({
  currentQuality,
  networkStats,
  showNetworkStats = false,
}) => {
 

  const getQualityText = () => {
    switch (currentQuality) {
      case 'high':
        return 'HD';
      case 'medium':
        return 'SD';
      case 'low':
        return 'LD';
      default:
        return 'AUTO';
    }
  };

  const formatBandwidth = (bytes: number) => {
    if (bytes === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <>
      {/* Network Stats (Optional) */}
      {showNetworkStats && (
        <View style={homeScreenStyles.networkStatsContainer}>
          <Text style={homeScreenStyles.networkStatsText}>
            RTT: {networkStats.rtt.toFixed(0)}ms
          </Text>
          <Text style={homeScreenStyles.networkStatsText}>
            Loss: {networkStats.packetsLost}
          </Text>
          <Text style={homeScreenStyles.networkStatsText}>
            Jitter: {networkStats.jitter.toFixed(1)}ms
          </Text>
          <Text style={homeScreenStyles.networkStatsText}>
            BW: {formatBandwidth(networkStats.bandwidth)}
          </Text>
        </View>
      )}
    </>
  );
};

export default VideoQualityIndicator;

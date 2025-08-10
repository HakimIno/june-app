import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

export const screenDimensions = {
  width,
  height,
  isTablet: width >= 768,
  isSmallScreen: width < 375,
};

export const responsiveSize = (size: number): number => {
  if (screenDimensions.isTablet) return size * 1.3;
  if (screenDimensions.isSmallScreen) return size * 0.9;
  return size;
};

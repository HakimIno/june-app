import { Platform, StyleSheet } from 'react-native';
import { responsiveSize, screenDimensions } from '../utils/responsiveUtils';

export const selfVideoStyles = StyleSheet.create({
  selfVideoContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: responsiveSize(screenDimensions.height * 0.5),
  },
  selfVideo: {
    flex: 1,
    borderRadius: responsiveSize(8),
    overflow: 'hidden',
    position: 'relative',
  },
  selfVideoBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  selfUserInfo: {
    position: 'absolute',
    top: 15,
    left: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selfAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  selfAvatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  selfUserName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  controlsOverlay: {
    position: 'absolute',
    bottom: 15,
    left: 15,
    right: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 5,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mutedButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  activeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  endCallButton: {
    backgroundColor: '#FF4757',
  },
  audioLevelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
});

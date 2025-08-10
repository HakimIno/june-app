import { Platform, Alert, Linking } from 'react-native';
import { check, request, PERMISSIONS, RESULTS, openSettings } from 'react-native-permissions';

export type PermissionStatus = 'granted' | 'denied' | 'blocked' | 'unavailable';

export interface PermissionResult {
  camera: PermissionStatus;
  microphone: PermissionStatus;
  allGranted: boolean;
}

export class PermissionManager {
  static async checkAndRequestPermissions(): Promise<PermissionResult> {
    const cameraPermission = Platform.OS === 'ios' 
      ? PERMISSIONS.IOS.CAMERA 
      : PERMISSIONS.ANDROID.CAMERA;
    
    const microphonePermission = Platform.OS === 'ios'
      ? PERMISSIONS.IOS.MICROPHONE
      : PERMISSIONS.ANDROID.RECORD_AUDIO;

    // Check current status
    const cameraStatus = await check(cameraPermission);
    const microphoneStatus = await check(microphonePermission);

    let finalCameraStatus = cameraStatus;
    let finalMicrophoneStatus = microphoneStatus;

    // Request permissions if needed
    if (cameraStatus !== RESULTS.GRANTED) {
      finalCameraStatus = await request(cameraPermission);
    }

    if (microphoneStatus !== RESULTS.GRANTED) {
      finalMicrophoneStatus = await request(microphonePermission);
    }

    const result: PermissionResult = {
      camera: this.mapPermissionResult(finalCameraStatus),
      microphone: this.mapPermissionResult(finalMicrophoneStatus),
      allGranted: finalCameraStatus === RESULTS.GRANTED && finalMicrophoneStatus === RESULTS.GRANTED,
    };

    // Show alert if permissions are denied
    if (!result.allGranted) {
      this.showPermissionAlert(result);
    }

    return result;
  }

  private static mapPermissionResult(result: string): PermissionStatus {
    switch (result) {
      case RESULTS.GRANTED:
        return 'granted';
      case RESULTS.DENIED:
        return 'denied';
      case RESULTS.BLOCKED:
        return 'blocked';
      case RESULTS.UNAVAILABLE:
        return 'unavailable';
      default:
        return 'denied';
    }
  }

  private static showPermissionAlert(result: PermissionResult): void {
    const deniedPermissions = [];
    
    if (result.camera !== 'granted') {
      deniedPermissions.push('กล้อง');
    }
    
    if (result.microphone !== 'granted') {
      deniedPermissions.push('ไมโครโฟน');
    }

    const permissionText = deniedPermissions.join(' และ ');
    const isBlocked = result.camera === 'blocked' || result.microphone === 'blocked';

    Alert.alert(
      'ต้องการสิทธิ์เข้าถึง',
      `แอปต้องการสิทธิ์เข้าถึง${permissionText}เพื่อให้คุณสามารถใช้งานการโทรวิดีโอได้`,
      [
        {
          text: 'ยกเลิก',
          style: 'cancel',
        },
        {
          text: isBlocked ? 'ไปที่การตั้งค่า' : 'ลองอีกครั้ง',
          onPress: () => {
            if (isBlocked) {
              openSettings();
            } else {
              // Retry permission request
              this.checkAndRequestPermissions();
            }
          },
        },
      ]
    );
  }

  static async checkCameraPermission(): Promise<PermissionStatus> {
    const permission = Platform.OS === 'ios' 
      ? PERMISSIONS.IOS.CAMERA 
      : PERMISSIONS.ANDROID.CAMERA;
    
    const result = await check(permission);
    return this.mapPermissionResult(result);
  }

  static async checkMicrophonePermission(): Promise<PermissionStatus> {
    const permission = Platform.OS === 'ios'
      ? PERMISSIONS.IOS.MICROPHONE
      : PERMISSIONS.ANDROID.RECORD_AUDIO;
    
    const result = await check(permission);
    return this.mapPermissionResult(result);
  }

  static async requestCameraPermission(): Promise<PermissionStatus> {
    const permission = Platform.OS === 'ios' 
      ? PERMISSIONS.IOS.CAMERA 
      : PERMISSIONS.ANDROID.CAMERA;
    
    const result = await request(permission);
    return this.mapPermissionResult(result);
  }

  static async requestMicrophonePermission(): Promise<PermissionStatus> {
    const permission = Platform.OS === 'ios'
      ? PERMISSIONS.IOS.MICROPHONE
      : PERMISSIONS.ANDROID.RECORD_AUDIO;
    
    const result = await request(permission);
    return this.mapPermissionResult(result);
  }

  static openAppSettings(): void {
    openSettings().catch(() => {
      Alert.alert(
        'ข้อผิดพลาด',
        'ไม่สามารถเปิดการตั้งค่าได้ กรุณาเปิดการตั้งค่าด้วยตนเองและอนุญาตสิทธิ์กล้องและไมโครโฟน'
      );
    });
  }
}

export default PermissionManager;

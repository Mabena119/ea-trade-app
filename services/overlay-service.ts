import { NativeModules, Platform, Linking, Alert } from 'react-native';

interface OverlayWindowModuleInterface {
  checkOverlayPermission(): Promise<boolean>;
  requestOverlayPermission(): Promise<boolean>;
  showOverlay(x: number, y: number, width: number, height: number): Promise<boolean>;
  updateOverlayPosition(x: number, y: number): Promise<boolean>;
  updateOverlaySize(width: number, height: number): Promise<boolean>;
  hideOverlay(): Promise<boolean>;
  getOverlayViewTag(): Promise<number>;
}

const { OverlayWindowModule } = NativeModules as {
  OverlayWindowModule?: OverlayWindowModuleInterface;
};

interface OverlayService {
  checkOverlayPermission(): Promise<boolean>;
  requestOverlayPermission(): Promise<boolean>;
  showOverlay(x: number, y: number, width: number, height: number): Promise<boolean>;
  updateOverlayPosition(x: number, y: number): Promise<boolean>;
  updateOverlaySize(width: number, height: number): Promise<boolean>;
  hideOverlay(): Promise<boolean>;
  getOverlayViewTag(): Promise<number>;
}

class OverlayService implements OverlayService {
  async checkOverlayPermission(): Promise<boolean> {
    if (Platform.OS !== 'android' || !OverlayWindowModule) {
      return true;
    }
    try {
      return await OverlayWindowModule.checkOverlayPermission();
    } catch (error) {
      console.error('Error checking overlay permission:', error);
      return false;
    }
  }

  async requestOverlayPermission(): Promise<boolean> {
    if (Platform.OS !== 'android' || !OverlayWindowModule) {
      return true;
    }

    const hasPermission = await this.checkOverlayPermission();
    if (hasPermission) {
      return true;
    }

    try {
      Alert.alert(
        'Permission Required',
        'This app needs permission to draw over other apps to show trading controls. Please enable "Display over other apps" in settings.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Open Settings',
            onPress: async () => {
              try {
                await OverlayWindowModule.requestOverlayPermission();
                // Open settings manually if needed
                Linking.openSettings();
              } catch (error) {
                console.error('Error requesting overlay permission:', error);
                Linking.openSettings();
              }
            },
          },
        ]
      );
      return false;
    } catch (error) {
      console.error('Error requesting overlay permission:', error);
      return false;
    }
  }

  async showOverlay(x: number, y: number, width: number, height: number): Promise<boolean> {
    if (Platform.OS !== 'android' || !OverlayWindowModule) {
      return false;
    }

    const hasPermission = await this.checkOverlayPermission();
    if (!hasPermission) {
      await this.requestOverlayPermission();
      return false;
    }

    try {
      return await OverlayWindowModule.showOverlay(x, y, width, height);
    } catch (error) {
      console.error('Error showing overlay:', error);
      return false;
    }
  }

  async updateOverlayPosition(x: number, y: number): Promise<boolean> {
    if (Platform.OS !== 'android' || !OverlayWindowModule) {
      return false;
    }
    try {
      return await OverlayWindowModule.updateOverlayPosition(x, y);
    } catch (error) {
      console.error('Error updating overlay position:', error);
      return false;
    }
  }

  async updateOverlaySize(width: number, height: number): Promise<boolean> {
    if (Platform.OS !== 'android' || !OverlayWindowModule) {
      return false;
    }
    try {
      return await OverlayWindowModule.updateOverlaySize(width, height);
    } catch (error) {
      console.error('Error updating overlay size:', error);
      return false;
    }
  }

  async hideOverlay(): Promise<boolean> {
    if (Platform.OS !== 'android' || !OverlayWindowModule) {
      return false;
    }
    try {
      return await OverlayWindowModule.hideOverlay();
    } catch (error) {
      console.error('Error hiding overlay:', error);
      return false;
    }
  }

  async getOverlayViewTag(): Promise<number> {
    if (Platform.OS !== 'android' || !OverlayWindowModule) {
      return -1;
    }
    try {
      return await OverlayWindowModule.getOverlayViewTag();
    } catch (error) {
      console.error('Error getting overlay view tag:', error);
      return -1;
    }
  }
}

export const overlayService = new OverlayService();


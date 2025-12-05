import { NativeModules, Platform, Linking, Alert } from 'react-native';

interface OverlayWindowModuleInterface {
  checkOverlayPermission(): Promise<boolean>;
  requestOverlayPermission(): Promise<boolean>;
  showOverlay(x: number, y: number, width: number, height: number): Promise<boolean>;
  updateOverlayPosition(x: number, y: number): Promise<boolean>;
  updateOverlaySize(width: number, height: number): Promise<boolean>;
  hideOverlay(): Promise<boolean>;
  getOverlayViewTag(): Promise<number>;
  updateOverlayData(botName: string, isActive: boolean, isPaused: boolean, botImageURL: string | null): Promise<boolean>;
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
  updateOverlayData(botName: string, isActive: boolean, isPaused: boolean, botImageURL: string | null): Promise<boolean>;
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
      // Permission is already requested at app startup, so just open settings directly
      await OverlayWindowModule.requestOverlayPermission();
      // Also open settings as fallback
      Linking.openSettings();
      return false;
    } catch (error) {
      console.error('Error requesting overlay permission:', error);
      // Fallback: open settings directly
      Linking.openSettings();
      return false;
    }
  }

  async showOverlay(x: number, y: number, width: number, height: number): Promise<boolean> {
    if (Platform.OS !== 'android' || !OverlayWindowModule) {
      return false;
    }

    const hasPermission = await this.checkOverlayPermission();
    if (!hasPermission) {
      console.log('[OverlayService] Permission not granted, attempting to request...');
      // Silently request permission (opens settings) but don't block
      this.requestOverlayPermission().catch(err => {
        console.error('[OverlayService] Error requesting permission:', err);
      });
      // Still try to show overlay - it might work if user just granted permission
    }

    try {
      console.log('[OverlayService] Calling native showOverlay with:', { x, y, width, height });
      const result = await OverlayWindowModule.showOverlay(x, y, width, height);
      console.log('[OverlayService] Native showOverlay result:', result);
      return result;
    } catch (error) {
      console.error('[OverlayService] Error showing overlay:', error);
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

  async updateOverlayData(botName: string, isActive: boolean, isPaused: boolean, botImageURL: string | null): Promise<boolean> {
    if (Platform.OS !== 'android' || !OverlayWindowModule) {
      return false;
    }
    try {
      return await OverlayWindowModule.updateOverlayData(botName, isActive, isPaused, botImageURL);
    } catch (error) {
      console.error('Error updating overlay data:', error);
      return false;
    }
  }
}

export const overlayService = new OverlayService();


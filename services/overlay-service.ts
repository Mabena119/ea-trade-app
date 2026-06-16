import { NativeModules, Platform, Linking } from 'react-native';

interface OverlayWindowModuleInterface {
  checkOverlayPermission(): Promise<boolean>;
  requestOverlayPermission(): Promise<boolean>;
  openAppNotificationSettings(): Promise<boolean>;
  showOverlay(x: number, y: number, width: number, height: number): Promise<boolean>;
  updateOverlayPosition(x: number, y: number): Promise<boolean>;
  updateOverlaySize(width: number, height: number): Promise<boolean>;
  hideOverlay(): Promise<boolean>;
  getOverlayViewTag(): Promise<number>;
  updateOverlayData(botName: string, isActive: boolean, isPaused: boolean, botImageURL: string | null): Promise<boolean>;
  startNativeBackgroundPolling(licenseKey: string, apiBaseUrl: string, chartWarmupEnabled?: boolean): Promise<boolean>;
  stopNativeBackgroundPolling(): Promise<boolean>;
  consumePendingForegroundAction(): Promise<{ type: string; payload?: string } | null>;
}

const { OverlayWindowModule } = NativeModules as {
  OverlayWindowModule?: OverlayWindowModuleInterface;
};

interface OverlayService {
  checkOverlayPermission(): Promise<boolean>;
  requestOverlayPermission(): Promise<boolean>;
  openAppNotificationSettings(): Promise<boolean>;
  showOverlay(x: number, y: number, width: number, height: number): Promise<boolean>;
  updateOverlayPosition(x: number, y: number): Promise<boolean>;
  updateOverlaySize(width: number, height: number): Promise<boolean>;
  hideOverlay(): Promise<boolean>;
  getOverlayViewTag(): Promise<number>;
  updateOverlayData(botName: string, isActive: boolean, isPaused: boolean, botImageURL: string | null): Promise<boolean>;
  startNativeBackgroundPolling(licenseKey: string, apiBaseUrl: string, chartWarmupEnabled?: boolean): Promise<boolean>;
  stopNativeBackgroundPolling(): Promise<boolean>;
  consumePendingForegroundAction(): Promise<{ type: string; payload?: string } | null>;
}

class OverlayService implements OverlayService {
  async checkOverlayPermission(): Promise<boolean> {
    // iOS / web: no Android overlay permission
    if (Platform.OS !== 'android') {
      return true;
    }
    // Native module must report Settings.canDrawOverlays; if missing, do not assume granted
    if (!OverlayWindowModule) {
      console.warn('[OverlayService] OverlayWindowModule not linked — treating draw-on-top as denied');
      return false;
    }
    try {
      return await OverlayWindowModule.checkOverlayPermission();
    } catch (error) {
      console.error('Error checking overlay permission:', error);
      return false;
    }
  }

  async requestOverlayPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }
    if (!OverlayWindowModule) {
      Linking.openSettings();
      return false;
    }

    const hasPermission = await this.checkOverlayPermission();
    if (hasPermission) {
      return true;
    }

    try {
      await OverlayWindowModule.requestOverlayPermission();
      return false;
    } catch (error) {
      console.error('Error requesting overlay permission:', error);
      Linking.openSettings();
      return false;
    }
  }

  /**
   * Android: opens Settings on this app's notification page (not the generic app settings list).
   */
  async openAppNotificationSettings(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }
    if (!OverlayWindowModule) {
      Linking.openSettings();
      return false;
    }
    try {
      await OverlayWindowModule.openAppNotificationSettings();
      return true;
    } catch (e) {
      console.error('[OverlayService] openAppNotificationSettings:', e);
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

  /**
   * Android: while the activity is backgrounded, JS timers may not run — native polls the same APIs.
   * Call stop when returning to foreground; then consumePendingForegroundAction().
   */
  async startNativeBackgroundPolling(
    licenseKey: string,
    apiBaseUrl: string,
    chartWarmupEnabled = true
  ): Promise<boolean> {
    if (Platform.OS !== 'android' || !OverlayWindowModule) return false;
    try {
      return await OverlayWindowModule.startNativeBackgroundPolling(
        licenseKey,
        apiBaseUrl,
        chartWarmupEnabled
      );
    } catch (e) {
      console.error('[OverlayService] startNativeBackgroundPolling', e);
      return false;
    }
  }

  async stopNativeBackgroundPolling(): Promise<boolean> {
    if (Platform.OS !== 'android' || !OverlayWindowModule) return false;
    try {
      return await OverlayWindowModule.stopNativeBackgroundPolling();
    } catch (e) {
      console.error('[OverlayService] stopNativeBackgroundPolling', e);
      return false;
    }
  }

  async consumePendingForegroundAction(): Promise<{ type: string; payload?: string } | null> {
    if (Platform.OS !== 'android' || !OverlayWindowModule) return null;
    try {
      const r = await OverlayWindowModule.consumePendingForegroundAction();
      if (!r || typeof r !== 'object') return null;
      const type = (r as { type?: string }).type;
      if (!type) return null;
      const payload = (r as { payload?: string }).payload;
      return { type, ...(payload ? { payload } : {}) };
    } catch (e) {
      console.error('[OverlayService] consumePendingForegroundAction', e);
      return null;
    }
  }
}

export const overlayService = new OverlayService();


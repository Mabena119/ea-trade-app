import { NativeModules, Platform, NativeEventEmitter } from 'react-native';

interface BackgroundMonitoringModuleInterface {
  startMonitoring(licenseKey: string): Promise<boolean>;
  stopMonitoring(): Promise<boolean>;
  isRunning(): Promise<boolean>;
}

// Lazy access to native module to prevent web initialization errors
const getBackgroundMonitoringModule = () => {
  if (Platform.OS !== 'android') {
    return null;
  }
  try {
    return NativeModules.BackgroundMonitoringModule || null;
  } catch (error) {
    return null;
  }
};

class BackgroundMonitoringService {
  private eventEmitter: NativeEventEmitter | null = null;
  private listener: any = null;

  constructor() {
    if (Platform.OS === 'android') {
      const module = getBackgroundMonitoringModule();
      if (module) {
        try {
          this.eventEmitter = new NativeEventEmitter(module);
        } catch (error) {
          console.log('[BackgroundMonitoring] EventEmitter initialization failed (non-critical):', error);
        }
      }
    }
  }

  async startMonitoring(licenseKey: string): Promise<boolean> {
    console.log('[BackgroundMonitoring] 🚀 Attempting to start monitoring...');
    console.log('[BackgroundMonitoring] Platform:', Platform.OS);

    if (Platform.OS !== 'android') {
      console.log('[BackgroundMonitoring] ⚠️ Not Android platform, skipping');
      return false;
    }

    const BackgroundMonitoringModule = getBackgroundMonitoringModule();
    console.log('[BackgroundMonitoring] Module available:', !!BackgroundMonitoringModule);

    if (!BackgroundMonitoringModule) {
      console.error('[BackgroundMonitoring] ❌ BackgroundMonitoringModule not available!');
      console.log('[BackgroundMonitoring] This means the native module is not registered or compiled');
      return false;
    }

    try {
      console.log('[BackgroundMonitoring] 📞 Calling native module startMonitoring with license:', licenseKey);
      const result = await BackgroundMonitoringModule.startMonitoring(licenseKey);
      console.log('[BackgroundMonitoring] ✅ Native module returned:', result);
      if (result) {
        console.log('[BackgroundMonitoring] 🎉 Native background monitoring service started successfully!');
      } else {
        console.warn('[BackgroundMonitoring] ⚠️ Native module returned false');
      }
      return result;
    } catch (error) {
      console.error('[BackgroundMonitoring] ❌ Error starting monitoring:', error);
      console.error('[BackgroundMonitoring] Error details:', JSON.stringify(error));
      return false;
    }
  }

  async stopMonitoring(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }

    const BackgroundMonitoringModule = getBackgroundMonitoringModule();
    if (!BackgroundMonitoringModule) {
      return false;
    }

    try {
      const result = await BackgroundMonitoringModule.stopMonitoring();
      console.log('[BackgroundMonitoring] Stopped native background monitoring service');
      return result;
    } catch (error) {
      console.error('[BackgroundMonitoring] Error stopping monitoring:', error);
      return false;
    }
  }

  async isRunning(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }

    const BackgroundMonitoringModule = getBackgroundMonitoringModule();
    if (!BackgroundMonitoringModule) {
      return false;
    }

    try {
      return await BackgroundMonitoringModule.isRunning();
    } catch (error) {
      console.error('[BackgroundMonitoring] Error checking if running:', error);
      return false;
    }
  }

  addListener(callback: (signal: any) => void) {
    if (this.eventEmitter) {
      this.listener = this.eventEmitter.addListener('backgroundSignalFound', callback);
      return this.listener;
    }
    return null;
  }

  removeListener() {
    if (this.listener) {
      this.listener.remove();
      this.listener = null;
    }
  }
}

export const backgroundMonitoringService = new BackgroundMonitoringService();
export default backgroundMonitoringService;

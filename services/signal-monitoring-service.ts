import { NativeModules, Platform, NativeEventEmitter } from 'react-native';

interface SignalMonitoringModuleInterface {
  startMonitoring(licenseKey: string): Promise<boolean>;
  stopMonitoring(): Promise<boolean>;
}

const { SignalMonitoringModule } = NativeModules;

class SignalMonitoringService {
  private eventEmitter: NativeEventEmitter | null = null;

  constructor() {
    if (Platform.OS === 'android' && SignalMonitoringModule) {
      this.eventEmitter = new NativeEventEmitter(SignalMonitoringModule);
    }
  }

  async startMonitoring(licenseKey: string): Promise<boolean> {
    if (Platform.OS !== 'android') {
      console.log('[SignalMonitoring] Not Android platform, skipping native monitoring');
      return false;
    }

    if (!SignalMonitoringModule) {
      console.log('[SignalMonitoring] Native module not available - using database polling service for background monitoring');
      return false;
    }

    try {
      const result = await SignalMonitoringModule.startMonitoring(licenseKey);
      if (result) {
        console.log('[SignalMonitoring] Started native background monitoring');
      } else {
        console.log('[SignalMonitoring] Native monitoring not started - using database polling service');
      }
      return result;
    } catch (error) {
      console.log('[SignalMonitoring] Native module error - using database polling service for background monitoring:', error);
      return false;
    }
  }

  async stopMonitoring(): Promise<boolean> {
    if (Platform.OS !== 'android' || !SignalMonitoringModule) {
      return false;
    }

    try {
      const result = await SignalMonitoringModule.stopMonitoring();
      console.log('[SignalMonitoring] Stopped native background monitoring');
      return result;
    } catch (error) {
      console.log('[SignalMonitoring] Error stopping monitoring (non-critical):', error);
      return false;
    }
  }

  addListener(callback: (signal: any) => void) {
    if (this.eventEmitter) {
      return this.eventEmitter.addListener('backgroundSignalFound', callback);
    }
    return null;
  }

  removeListener(listener: any) {
    if (listener) {
      listener.remove();
    }
  }
}

export const signalMonitoringService = new SignalMonitoringService();
export default signalMonitoringService;


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
    if (Platform.OS !== 'android' || !SignalMonitoringModule) {
      console.warn('SignalMonitoringModule not available');
      return false;
    }

    try {
      const result = await SignalMonitoringModule.startMonitoring(licenseKey);
      console.log('[SignalMonitoring] Started native background monitoring');
      return result;
    } catch (error) {
      console.error('[SignalMonitoring] Error starting monitoring:', error);
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
      console.error('[SignalMonitoring] Error stopping monitoring:', error);
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


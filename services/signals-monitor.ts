import { apiService, SignalsResponse } from './api';

export interface SignalLog {
  id: string;
  asset: string;
  action: string;
  price: string;
  tp: string;
  sl: string;
  time: string;
  latestupdate: string;
  receivedAt: Date;
}

class SignalsMonitorService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private phoneSecret: string | null = null;
  private isMonitoring: boolean = false;
  private signalLogs: SignalLog[] = [];
  private onSignalReceived?: (signal: SignalLog) => void;
  private onError?: (error: string) => void;

  startMonitoring(phoneSecret: string, onSignalReceived?: (signal: SignalLog) => void, onError?: (error: string) => void) {
    if (this.isMonitoring) {
      console.log('Signals monitoring already running');
      return;
    }

    this.phoneSecret = phoneSecret;
    this.onSignalReceived = onSignalReceived;
    this.onError = onError;
    this.isMonitoring = true;

    console.log('Starting signals monitoring with phone_secret:', phoneSecret);

    // Networking disabled: do not poll or fetch signals
    this.intervalId = null;
  }

  stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isMonitoring = false;
    this.phoneSecret = null;
    console.log('Signals monitoring stopped');
  }

  private async fetchSignals() {
    // Networking disabled: no-op
    return;
  }

  getSignalLogs(): SignalLog[] {
    return [...this.signalLogs];
  }

  clearSignalLogs() {
    this.signalLogs = [];
    console.log('Signal logs cleared');
  }

  isRunning(): boolean {
    return this.isMonitoring;
  }

  getCurrentPhoneSecret(): string | null {
    return this.phoneSecret;
  }
}

export const signalsMonitor = new SignalsMonitorService();
export default signalsMonitor;
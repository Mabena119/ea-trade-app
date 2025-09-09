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

    // Start polling every 5 seconds
    this.intervalId = setInterval(() => {
      this.fetchSignals().catch((err) => {
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.onError?.(message);
      });
    }, 5000);
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
    if (!this.phoneSecret) return;
    const res: SignalsResponse = await apiService.getSignals(this.phoneSecret);
    if (res.message !== 'accept' || !res.data) return;
    const signal = {
      ...res.data,
      receivedAt: new Date(),
    } as const as SignalLog;
    this.signalLogs.unshift(signal);
    // Keep last 100
    this.signalLogs = this.signalLogs.slice(0, 100);
    this.onSignalReceived?.(signal);
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
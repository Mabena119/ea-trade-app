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

    // Poll server for new signals every 5 seconds
    this.intervalId = setInterval(() => {
      this.fetchSignals().catch((e) => {
        console.error('Signals fetch error:', e);
        this.onError?.('Failed to fetch signals');
      });
    }, 5000) as unknown as ReturnType<typeof setInterval>;
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
    const response: SignalsResponse = await apiService.getSignals(this.phoneSecret);
    if (response.message !== 'accept') return;
    if (!response.data) return;

    const incoming = response.data;
    const log: SignalLog = {
      id: String(incoming.id),
      asset: incoming.asset,
      action: incoming.action,
      price: incoming.price,
      tp: incoming.tp,
      sl: incoming.sl,
      time: incoming.time,
      latestupdate: incoming.latestupdate,
      receivedAt: new Date(),
    };

    // Deduplicate by id+latestupdate
    const exists = this.signalLogs.some(s => s.id === log.id && s.latestupdate === log.latestupdate);
    if (!exists) {
      this.signalLogs = [log, ...this.signalLogs].slice(0, 100);
      this.onSignalReceived?.(log);
    }
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
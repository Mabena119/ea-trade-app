/**
 * Keeps the Render server awake so Web Push can deliver background signal notifications.
 * Render free tier spins down after 15 min inactivity - pinging resets the timer.
 */
import Constants from 'expo-constants';

const API_BASE = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL ||
  'https://ea-trade-app.onrender.com'
).replace(/\/$/, '');

const KEEP_ALIVE_INTERVAL_MS = 4 * 60 * 1000; // 4 min (Render sleeps at 15 min)

let keepAliveIntervalId: ReturnType<typeof setInterval> | null = null;

/** Ping server to reset inactivity timer. Use sendBeacon when page is unloading/hidden. */
export function pingKeepAlive(useBeacon = false): void {
  const url = `${API_BASE}/api/keep-alive`;
  if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon(url);
    return;
  }
  fetch(url).catch(() => {});
}

/** Start periodic keep-alive pings (call when app is visible and bot active). */
export function startKeepAlive(): void {
  if (keepAliveIntervalId) return;
  pingKeepAlive();
  keepAliveIntervalId = setInterval(() => pingKeepAlive(), KEEP_ALIVE_INTERVAL_MS);
}

/** Stop periodic pings. */
export function stopKeepAlive(): void {
  if (keepAliveIntervalId) {
    clearInterval(keepAliveIntervalId);
    keepAliveIntervalId = null;
  }
}

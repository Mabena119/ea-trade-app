/**
 * Web Push registration for iOS PWA
 * Enables background signal notifications when app is suspended
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { isIOSPWA } from '@/utils/pwa-detection';

const API_BASE = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL ||
  'https://ea-trade-app.onrender.com'
).replace(/\/$/, '');

let swRegistration: ServiceWorkerRegistration | null = null;

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    swRegistration = reg;
    return reg;
  } catch (e) {
    console.warn('[PWA Push] Service worker registration failed:', e);
    return null;
  }
}

export async function subscribeToPush(licenseKey: string, eaId?: string): Promise<boolean> {
  if (Platform.OS !== 'web' || !isIOSPWA()) return false;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;

  try {
    let resolvedEaId = eaId;
    if (!resolvedEaId) {
      const res = await fetch(`${API_BASE}/api/get-ea-from-license?licenseKey=${encodeURIComponent(licenseKey)}`);
      const data = await res.json();
      resolvedEaId = String(data?.id ?? data?.eaId ?? '');
    }
    if (!resolvedEaId) return false;

    let reg = swRegistration;
    if (!reg) {
      reg = await registerServiceWorker();
    }
    if (!reg) return false;

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return false;

    const vapidRes = await fetch(`${API_BASE}/api/vapid-public-key`);
    const { publicKey } = await vapidRes.json();
    if (!publicKey) {
      console.warn('[PWA Push] VAPID key not configured on server');
      return false;
    }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await fetch(`${API_BASE}/api/register-push-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        licenseKey,
        eaId: resolvedEaId,
      }),
    });
    console.log('[PWA Push] Subscribed for background signals');
    return true;
  } catch (e) {
    console.error('[PWA Push] Subscribe failed:', e);
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (Platform.OS !== 'web') return;
  try {
    const reg = swRegistration || (await navigator.serviceWorker?.ready);
    if (reg?.pushManager) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`${API_BASE}/api/unregister-push-subscription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
    }
  } catch (e) {
    console.warn('[PWA Push] Unsubscribe failed:', e);
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

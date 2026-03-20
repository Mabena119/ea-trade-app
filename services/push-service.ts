/**
 * Web Push service for iOS PWA
 * Sends push notifications when signals are detected - works when app is in background
 */
import webpush from 'web-push';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(
    'mailto:support@eatrade.io',
    VAPID_PUBLIC,
    VAPID_PRIVATE
  );
}

export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  licenseKey: string;
  eaId: string;
}

const subscriptions = new Map<string, PushSubscription>();

/** Called when a subscription is removed (e.g. 410/404) - for DB cleanup */
let onSubscriptionRemoved: ((endpoint: string) => void) | null = null;
export function setOnSubscriptionRemoved(cb: (endpoint: string) => void) {
  onSubscriptionRemoved = cb;
}

export function addSubscription(sub: PushSubscription) {
  subscriptions.set(sub.endpoint, sub);
}

export function loadSubscriptions(subs: PushSubscription[]) {
  subscriptions.clear();
  for (const sub of subs) {
    if (sub?.endpoint && sub?.keys) subscriptions.set(sub.endpoint, sub);
  }
}

export function removeSubscription(endpoint: string) {
  subscriptions.delete(endpoint);
  onSubscriptionRemoved?.(endpoint);
}

export function getSubscriptions(): PushSubscription[] {
  return [...subscriptions.values()];
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC;
}

export function isPushConfigured(): boolean {
  return !!(VAPID_PUBLIC && VAPID_PRIVATE);
}

function formatSignalDateTime(isoString?: string): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    return `${month} ${day}, ${year}, ${hours}:${mins}`;
  } catch {
    return isoString;
  }
}

export async function sendSignalPush(signal: {
  id: number;
  asset: string;
  action: string;
  sl: number | string;
  tp: number | string;
  time?: string;
  ea: number;
}) {
  if (!isPushConfigured()) return;

  const action = (signal.action || '').toUpperCase();
  const dot = action === 'BUY' ? '🔵' : '🔴';
  const title = `${dot} SIGNAL ${signal.asset || 'Unknown'} ${action}`;
  const sl = typeof signal.sl === 'number' ? signal.sl.toFixed(2) : String(signal.sl || '0');
  const tp = typeof signal.tp === 'number' ? signal.tp.toFixed(2) : String(signal.tp || '0');
  const formattedTime = formatSignalDateTime(signal.time);
  const bodyParts = [`SL: ${sl} • TP: ${tp}`];
  if (formattedTime) bodyParts.push(formattedTime);
  const body = bodyParts.join(' • ');

  const payload = JSON.stringify({
    title,
    body,
    tag: `ea-trade-signal-${signal.id}`,
    signalId: signal.id,
    data: { asset: signal.asset },
  });

  const subsForEa = [...subscriptions.values()].filter((s) => s.eaId === String(signal.ea));
  const results = await Promise.allSettled(
    subsForEa.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          },
          payload
        );
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          removeSubscription(sub.endpoint);
        }
        throw err;
      }
    })
  );

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    console.warn(`[Push] ${failed.length}/${subsForEa.length} push sends failed for signal ${signal.id}`);
  }
}

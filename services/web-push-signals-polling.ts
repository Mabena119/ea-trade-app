/**
 * Web Push signals polling - SERVER-SIDE ONLY.
 *
 * This runs on the server, NOT in the browser. It polls the database every 5 seconds
 * and sends Web Push to subscribed devices. It works when the app is in the background
 * because the server does not depend on the client - it runs 24/7 (when server is awake).
 *
 * Flow: Server polls DB → finds new signal → sends Web Push → Apple delivers to device
 *       → Service worker shows notification (even when app is suspended/closed).
 *
 * For this to work when app is backgrounded:
 * 1. Server must stay awake (use UptimeRobot or keep-alive pings)
 * 2. User must have subscribed to push (when bot was activated)
 * 3. VAPID keys must be configured on the server
 */
import type { Pool } from 'mysql2/promise';
import { getSubscriptions, sendSignalPush, isPushConfigured } from './push-service';

const POLL_INTERVAL_MS = 5000; // 5 seconds - matches client polling for consistency

const lastCheckByEa = new Map<string, string>();
let pollIntervalId: ReturnType<typeof setInterval> | null = null;

function toMysqlTimestamp(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

async function pollAndPush(pool: Pool): Promise<void> {
  if (!isPushConfigured()) return;

  const subs = getSubscriptions();
  const eaIds = [...new Set(subs.map((s) => s.eaId))];
  if (eaIds.length === 0) return;

  for (const eaId of eaIds) {
    const since =
      lastCheckByEa.get(eaId) ||
      toMysqlTimestamp(new Date(Date.now() - 60000)); // default: last 60s

    try {
      const [rows] = await pool.execute(
        `SELECT id, ea, asset, latestupdate, action, price, tp, sl, time 
         FROM \`signals\` 
         WHERE ea = ? AND latestupdate > ? 
         ORDER BY latestupdate DESC 
         LIMIT 20`,
        [eaId, since]
      );

      const signals = rows as Array<{
        id: number;
        ea: number;
        asset: string;
        latestupdate: string;
        action: string;
        price: string | number;
        tp: number | string;
        sl: number | string;
        time?: string;
      }>;

      for (const s of signals) {
        await sendSignalPush({
          id: s.id,
          ea: s.ea,
          asset: s.asset,
          action: s.action,
          sl: s.sl,
          tp: s.tp,
          time: s.time || s.latestupdate,
        });
      }

      if (signals.length > 0) {
        const latest = signals[0]?.latestupdate;
        if (latest) {
          lastCheckByEa.set(eaId, toMysqlTimestamp(latest));
        }
      }
    } catch (e) {
      console.warn('[WebPush Polling] Failed for EA', eaId, e);
    }
  }
}

/**
 * Start the Web Push signals polling loop.
 * Polls DB for new signals and sends Web Push to subscribed devices.
 */
export function startWebPushSignalsPolling(getPool: () => Pool): void {
  if (pollIntervalId) {
    console.log('[WebPush Polling] Already running');
    return;
  }
  if (!isPushConfigured()) {
    console.log('[WebPush Polling] Skipped - VAPID keys not configured');
    return;
  }

  pollIntervalId = setInterval(async () => {
    try {
      const pool = getPool();
      await pollAndPush(pool);
    } catch (e) {
      console.warn('[WebPush Polling] Error:', e);
    }
  }, POLL_INTERVAL_MS);

  console.log('[WebPush Polling] Started - polling every', POLL_INTERVAL_MS / 1000, 's');
}

/**
 * Stop the Web Push signals polling loop.
 */
export function stopWebPushSignalsPolling(): void {
  if (pollIntervalId) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
    console.log('[WebPush Polling] Stopped');
  }
}

/**
 * Trigger an immediate poll (e.g. when new subscription is added).
 */
export async function pollWebPushSignalsNow(getPool: () => Pool): Promise<void> {
  if (!isPushConfigured()) return;
  try {
    await pollAndPush(getPool());
  } catch (e) {
    console.warn('[WebPush Polling] Immediate poll failed:', e);
  }
}

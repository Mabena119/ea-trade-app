import * as FileSystem from 'expo-file-system';

import { EA_BRAND_CDN_HEADERS } from '@/utils/ea-brand-image';

const CACHE_SUBDIR = 'ea-brand-profile-videos/';
/** Skip obvious HTML/error stub bodies; modest floor for corrupt partials. */
const MIN_MP4_BYTES = 128;

const CDN_DOWNLOAD_HEADER_ATTEMPTS: Record<string, string>[] = [
  EA_BRAND_CDN_HEADERS,
  {
    Referer: 'https://www.eatrade.io/',
    Accept: '*/*',
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  {
    Accept: '*/*',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
  {},
];

async function downloadRemoteMp4Attempt(remoteMp4Uri: string, localUri: string): Promise<number> {
  let lastStatus = -1;
  for (const headers of CDN_DOWNLOAD_HEADER_ATTEMPTS) {
    const dl = await FileSystem.downloadAsync(remoteMp4Uri, localUri, {
      headers: Object.keys(headers).length ? headers : undefined,
    });
    lastStatus = dl.status;
    if (dl.status >= 200 && dl.status < 300) {
      return dl.status;
    }
    /** Next attempt replaces file */
    try {
      await FileSystem.deleteAsync(localUri, { idempotent: true });
    } catch {
      /* ignore */
    }
  }
  return lastStatus;
}

function storageBaseUri(): string | null {
  return FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? null;
}

function sanitizeStem(stem: string): string | null {
  const s = stem.trim();
  if (!s || s.includes('/') || s.includes('..')) return null;
  if (!/^[-a-zA-Z0-9._]+$/.test(s)) return null;
  return s;
}

/**
 * Download remote profile mp4 beside the logo (same basename) into app storage & return a `file://` URI for expo-av.
 * Uses cache or document dir; reuses file if already present & non‑empty.
 */
export async function ensureEaBrandMp4Cached(remoteMp4Uri: string, imageBasenameStem: string): Promise<string> {
  const stem = sanitizeStem(imageBasenameStem);
  if (!stem) throw new Error('ea-brand-video: invalid cache stem');

  const base = storageBaseUri();
  if (!base) throw new Error('ea-brand-video: no writable app directory');

  const dir = `${base}${CACHE_SUBDIR}`;
  const localUri = `${dir}${stem}.mp4`;

  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  const before = await FileSystem.getInfoAsync(localUri);
  if (
    before.exists &&
    !before.isDirectory &&
    typeof before.size === 'number' &&
    before.size >= MIN_MP4_BYTES
  ) {
    return localUri;
  }

  const dlStatus = await downloadRemoteMp4Attempt(remoteMp4Uri, localUri);
  const ok = dlStatus >= 200 && dlStatus < 300;
  if (!ok) {
    try {
      await FileSystem.deleteAsync(localUri, { idempotent: true });
    } catch {
      /* ignore */
    }
    throw new Error(`ea-brand-video: HTTP ${dlStatus}`);
  }

  const after = await FileSystem.getInfoAsync(localUri);
  if (!after.exists || (typeof after.size === 'number' && after.size < MIN_MP4_BYTES)) {
    try {
      await FileSystem.deleteAsync(localUri, { idempotent: true });
    } catch {
      /* ignore */
    }
    throw new Error('ea-brand-video: file missing or too small after download');
  }

  return localUri;
}

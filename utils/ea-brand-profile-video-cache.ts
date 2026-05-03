import * as FileSystem from 'expo-file-system';

const CACHE_SUBDIR = 'ea-brand-profile-videos/';
/** Tiny placeholder / error-body responses are skipped. */
const MIN_MP4_BYTES = 512;

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

  const dl = await FileSystem.downloadAsync(remoteMp4Uri, localUri);
  const ok = dl.status >= 200 && dl.status < 300;
  if (!ok) {
    try {
      await FileSystem.deleteAsync(localUri, { idempotent: true });
    } catch {
      /* ignore */
    }
    throw new Error(`ea-brand-video: HTTP ${dl.status}`);
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

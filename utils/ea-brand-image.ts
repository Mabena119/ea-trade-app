import type { ImageSourcePropType } from 'react-native';

/** Default EA app icon shown when no connected bot logo is available or remote load fails. */
export const EA_BRAND_HERO_LOCAL = require('@/assets/images/icon.png');

/** Sent with AV / FileSystem CDN access so picky Apache setups accept range requests vs Image. */
export const EA_BRAND_CDN_HEADERS: Record<string, string> = {
  Referer: 'https://www.eatrade.io/',
  Accept: '*/*',
};

function encodePathSegment(seg: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(seg));
  } catch {
    return encodeURIComponent(seg);
  }
}

/**
 * Full HTTPS URL for a logo still under eatrade uploads; encodes path segments so hex/dot names load reliably.
 */
export function normalizeEaBrandLogoHttpUrl(rawInput: string | null | undefined): string | null {
  if (!rawInput || typeof rawInput !== 'string') return null;
  const raw = rawInput.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const parts = u.pathname.split('/').filter(Boolean).map(encodePathSegment);
      u.pathname = `/${parts.join('/')}`;
      return u.toString();
    } catch {
      return raw;
    }
  }
  const rel = raw.replace(/^\/+/, '');
  const parts = rel.split('/').filter(Boolean).map(encodePathSegment);
  if (parts.length === 0) return null;
  return `https://www.eatrade.io/admin/uploads/${parts.join('/')}`;
}

/** Build `ImageSourcePropType` for the EA brand splash from license `owner.logo` or fallback asset. */
export function resolveEABrandImageSource(logo: string | null | undefined): ImageSourcePropType {
  const raw = (logo ?? '').toString().trim();
  if (!raw) return EA_BRAND_HERO_LOCAL;
  const normalized = /^https?:\/\//i.test(raw)
    ? normalizeEaBrandLogoHttpUrl(raw)
    : normalizeEaBrandLogoHttpUrl(raw.replace(/^\/+/, ''));
  if (!normalized) return EA_BRAND_HERO_LOCAL;
  return { uri: normalized };
}

import type { ImageSourcePropType } from 'react-native';

/** Default EA app icon shown when no connected bot logo is available or remote load fails. */
export const EA_BRAND_HERO_LOCAL = require('@/assets/images/icon.png');

/** Build `ImageSourcePropType` for the EA brand splash from license `owner.logo` or fallback asset. */
export function resolveEABrandImageSource(logo: string | null | undefined): ImageSourcePropType {
  const raw = (logo ?? '').toString().trim();
  if (!raw) return EA_BRAND_HERO_LOCAL;
  if (/^https?:\/\//i.test(raw)) return { uri: raw };
  const filename = raw.replace(/^\/+/, '');
  return { uri: `https://www.eatrade.io/admin/uploads/${filename}` };
}

import type { ImageSourcePropType } from 'react-native';

/** Bundled hero art when no owner logo is configured or remote load fails. */
export const EA_BRAND_HERO_LOCAL = require('@/assets/images/ea-brand-hero.png');

/** Build `ImageSourcePropType` for the EA brand splash from license `owner.logo` or fallback asset. */
export function resolveEABrandImageSource(logo: string | null | undefined): ImageSourcePropType {
  const raw = (logo ?? '').toString().trim();
  if (!raw) return EA_BRAND_HERO_LOCAL;
  if (/^https?:\/\//i.test(raw)) return { uri: raw };
  const filename = raw.replace(/^\/+/, '');
  return { uri: `https://www.eatrade.io/admin/uploads/${filename}` };
}

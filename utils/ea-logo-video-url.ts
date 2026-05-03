/** Same base used by `getEAImageUrl` / `resolveEABrandImageSource` for owner uploads. */
export const EA_BRAND_UPLOADS_BASE = 'https://www.eatrade.io/admin/uploads';

/**
 * Profile videos live next to images: same URL path except final extension is `.mp4`.
 * Handles paths with extensions (png/jpeg/…) and filenames with no dot (append `.mp4`).
 */
export function deriveEALogoMp4Url(imageUrl: string | null | undefined): string | null {
  if (!imageUrl || typeof imageUrl !== 'string') return null;
  const trimmed = imageUrl.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;

  try {
    const u = new URL(trimmed);
    let pathname = u.pathname.replace(/\/+$/, '') || '/';

    if (/\.mp4$/i.test(pathname) || /\.webm$/i.test(pathname)) {
      return u.toString();
    }

    const lastSlash = pathname.lastIndexOf('/');
    const segment = pathname.slice(lastSlash + 1);
    const dot = segment.lastIndexOf('.');

    if (dot > 0) {
      /** Slice through last dot on final path segment (`…/Logo.png` → `…/Logo.mp4`). */
      u.pathname = `${pathname.slice(0, lastSlash + 1 + dot)}.mp4`;
    } else {
      /** `/uploads/BrandLogo` → `/uploads/BrandLogo.mp4` */
      u.pathname = `${pathname}.mp4`;
    }

    return u.toString();
  } catch {
    return naiveSwapExtension(trimmed);
  }
}

/** Fallback when `URL` rejects (unlikely); keeps query/hash split naïvely */
function naiveSwapExtension(trimmed: string): string | null {
  const hashIdx = trimmed.indexOf('#');
  const base = hashIdx >= 0 ? trimmed.slice(0, hashIdx) : trimmed;
  const hash = hashIdx >= 0 ? trimmed.slice(hashIdx) : '';
  const qIdx = base.indexOf('?');
  const pathPart = qIdx >= 0 ? base.slice(0, qIdx) : base;
  const search = qIdx >= 0 ? base.slice(qIdx) : '';

  const pathTrim = pathPart.replace(/\/+$/, '');
  if (/\.mp4$/i.test(pathTrim) || /\.webm$/i.test(pathTrim)) {
    return `${pathTrim}${search}${hash}`;
  }

  let nextPath: string;
  const lastSlash = pathTrim.lastIndexOf('/');
  const seg = pathTrim.slice(lastSlash + 1);
  const dot = seg.lastIndexOf('.');
  if (dot > 0) {
    nextPath = `${pathTrim.slice(0, lastSlash + 1 + dot)}.mp4`;
  } else {
    nextPath = `${pathTrim}.mp4`;
  }
  return `${nextPath}${search}${hash}`;
}

function uniqOrdered(urls: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Normalize a licence / slug for matching files under `/admin/uploads/{slug}.mp4`.
 */
function sanitizeUploadSlug(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;
  const s = input.trim().replace(/^\/+|\/+$/g, '');
  if (!s || s.includes('/')) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(s)) return null;
  return s;
}

function mp4UrlForSlug(slug: string): string {
  return `${EA_BRAND_UPLOADS_BASE.replace(/\/$/, '')}/${slug}.mp4`;
}

/**
 * Alternate locations when the CDN names the looping video after the robot key rather than `owner.logo`.
 * Tries: exact key → hyphens stripped → lowercase variants where they differ.
 */
function mp4UrlsFromLicenseKeys(canonicalFromApi: string | null | undefined, enteredByUser: string | null | undefined): string[] {
  const out: string[] = [];
  const slugsRaw = uniqOrdered([sanitizeUploadSlug(canonicalFromApi), sanitizeUploadSlug(enteredByUser)]);
  for (const slug of slugsRaw) {
    out.push(mp4UrlForSlug(slug));
    const dashed = slug.replace(/-/g, '');
    if (dashed !== slug) {
      out.push(mp4UrlForSlug(dashed));
      out.push(mp4UrlForSlug(dashed.toLowerCase()));
      out.push(mp4UrlForSlug(slug.toLowerCase()));
    } else if (slug !== slug.toLowerCase()) {
      out.push(mp4UrlForSlug(slug.toLowerCase()));
    }
  }
  return uniqOrdered(out);
}

/**
 * Ordered list of looping-profile mp4 URLs: primary is same basename as the still image (`owner.logo`),
 * then fallbacks derived from canonical + entered licence keys (`/admin/uploads/{key}.mp4` patterns).
 */
export function buildEaProfileMp4CandidateUrls(args: {
  brandImageUrl: string | null | undefined;
  licenseCanonicalKey?: string | null | undefined;
  licenseEnteredKey?: string | null | undefined;
}): string[] {
  const fromLogo = deriveEALogoMp4Url(args.brandImageUrl);
  const fromLicences = mp4UrlsFromLicenseKeys(args.licenseCanonicalKey, args.licenseEnteredKey);
  return uniqOrdered([fromLogo, ...fromLicences]);
}

/**
 * Profile videos live beside the logo on the CDN: same path & basename as the still image, extension `.mp4`.
 * CDN names may contain extra dots (`69f7a5057db673.13117558.png` → `69f7a5057db673.13117558.mp4`);
 * only trailing *image* segments are swapped — inner dots stay.
 */

/** Trailing raster extension → replace with `.mp4`; anything else stays on the basename. */
const TRAILING_IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|tif|tiff)$/i;

const TRAILING_VIDEO_EXT_RE = /\.(mp4|webm)$/i;

function basenameStemForMp4Sibling(lastPathSegment: string): string | null {
  const segment = lastPathSegment.trim();
  if (!segment) return null;
  if (TRAILING_IMAGE_EXT_RE.test(segment)) {
    const stem = segment.replace(TRAILING_IMAGE_EXT_RE, '');
    return stem || null;
  }
  /** e.g. `69f7a5057db673.13117558` (already no image ext) → same string + `.mp4` on sibling */
  if (TRAILING_VIDEO_EXT_RE.test(segment)) {
    return segment.replace(TRAILING_VIDEO_EXT_RE, '') || null;
  }
  return segment;
}

/**
 * Stem used for `{stem}.mp4` sibling URL and local cache filename (everything before `.mp4`).
 */
export function deriveEaBrandImageStemFromUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl || typeof imageUrl !== 'string') return null;
  const trimmed = imageUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const pathname = new URL(trimmed).pathname.replace(/\/+$/, '') || '/';
    const lastSlash = pathname.lastIndexOf('/');
    const segment = pathname.slice(lastSlash + 1);
    const stem = basenameStemForMp4Sibling(segment);
    if (!stem || !/^[-a-zA-Z0-9._]+$/.test(stem)) return null;
    return stem;
  } catch {
    return naiveStem(trimmed);
  }
}

function naiveStem(trimmed: string): string | null {
  const qIdx = trimmed.indexOf('?');
  const hashIdx = trimmed.indexOf('#');
  let cut = trimmed;
  if (hashIdx >= 0) cut = cut.slice(0, hashIdx);
  if (qIdx >= 0) cut = cut.slice(0, qIdx);
  const pathPart = cut.replace(/^https?:\/\/[^/]+/i, '');
  const pathTrim = pathPart.replace(/\/+$/, '');
  const lastSlash = pathTrim.lastIndexOf('/');
  const segment = pathTrim.slice(lastSlash + 1);
  const stem = basenameStemForMp4Sibling(segment);
  if (!stem || !/^[-a-zA-Z0-9._]+$/.test(stem)) return null;
  return stem;
}

export function deriveEALogoMp4Url(imageUrl: string | null | undefined): string | null {
  if (!imageUrl || typeof imageUrl !== 'string') return null;
  const trimmed = imageUrl.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;

  try {
    const u = new URL(trimmed);
    let pathname = u.pathname.replace(/\/+$/, '') || '/';

    if (TRAILING_VIDEO_EXT_RE.test(pathname)) {
      return u.toString();
    }

    const lastSlash = pathname.lastIndexOf('/');
    const segment = pathname.slice(lastSlash + 1);
    const prefix = pathname.slice(0, lastSlash + 1);

    let nextSegment: string;
    if (TRAILING_IMAGE_EXT_RE.test(segment)) {
      nextSegment = `${segment.replace(TRAILING_IMAGE_EXT_RE, '')}.mp4`;
    } else {
      nextSegment = `${segment}.mp4`;
    }

    u.pathname = `${prefix}${nextSegment}`;
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
  if (TRAILING_VIDEO_EXT_RE.test(pathTrim)) {
    return `${pathTrim}${search}${hash}`;
  }

  const lastSlash = pathTrim.lastIndexOf('/');
  const segment = pathTrim.slice(lastSlash + 1);
  const prefix = pathTrim.slice(0, lastSlash + 1);
  let nextPath: string;
  if (TRAILING_IMAGE_EXT_RE.test(segment)) {
    nextPath = `${prefix}${segment.replace(TRAILING_IMAGE_EXT_RE, '')}.mp4`;
  } else {
    nextPath = `${pathTrim}.mp4`;
  }
  return `${nextPath}${search}${hash}`;
}

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

/**
 * Profile videos are deployed alongside profile images under the same basename
 * (e.g. `brand.png` → `brand.mp4`).
 */
export function deriveEALogoMp4Url(imageUrl: string | null | undefined): string | null {
  if (!imageUrl || typeof imageUrl !== 'string') return null;
  const trimmed = imageUrl.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;
  try {
    const u = new URL(trimmed);
    const pathname = u.pathname;
    const dot = pathname.lastIndexOf('.');
    const slash = pathname.lastIndexOf('/');
    if (dot <= slash) return null;
    const ext = pathname.slice(dot + 1).toLowerCase();
    if (ext === 'mp4' || ext === 'webm') return trimmed;
    u.pathname = `${pathname.slice(0, dot)}.mp4`;
    return u.toString();
  } catch {
    const bare = trimmed.split('#')[0] ?? trimmed;
    const noQuery = bare.split('?')[0] ?? bare;
    const dot = noQuery.lastIndexOf('.');
    const slash = noQuery.lastIndexOf('/');
    if (dot <= slash) return null;
    return `${noQuery.slice(0, dot)}.mp4`;
  }
}

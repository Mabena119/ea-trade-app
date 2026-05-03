import type { Theme } from '@/providers/theme-provider';

/** Stops reused on every theme; only RGB base changes. */
export const HERO_FULL_BLEED_BLOOM_LOCATIONS = [
  0, 0.085, 0.17, 0.275, 0.38, 0.482, 0.575, 0.665, 0.755, 0.84, 1,
] as const;

const BLOOM_ALPHAS = [
  0, 0, 0.016, 0.058, 0.118, 0.218, 0.348, 0.478, 0.582, 0.668, 0.734,
] as const;

/** Black hero — charcoal scrims unchanged (pixels match original black theme). */
function blackHeroBloom(): readonly string[] {
  return BLOOM_ALPHAS.map((a) => rgba(0, 0, 0, a));
}

const BLACK_HERO_STATIC = {
  controlsScrim: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0.38)', 'rgba(0,0,0,0.52)'],
  topVeil: ['rgba(36,37,41,0.26)', 'rgba(18,18,20,0.06)', 'rgba(0,0,0,0)'],
  edgeWhisper: ['rgba(0,0,0,0.17)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.17)'],
  bloomHighlight: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.028)', 'rgba(255,255,255,0)'],
} as const;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function parseRgbTuple(input: string): [number, number, number] | null {
  const s = input.trim();
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])];
  let hex = /^#([\da-f]{6})$/i.exec(s)?.[1];
  if (hex)
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  hex = /^#([\da-f]{3})$/i.exec(s)?.[1];
  if (!hex) return null;
  return [
    parseInt(hex.slice(0, 1).repeat(2), 16),
    parseInt(hex.slice(1, 2).repeat(2), 16),
    parseInt(hex.slice(2, 3).repeat(2), 16),
  ];
}

function isNearBlack(rgb: [number, number, number]): boolean {
  return rgb[0] + rgb[1] + rgb[2] < 42;
}

/** Accent first, then gradient — skip blacks so Matrix keeps neon tint. */
function tintRgb(theme: Theme): [number, number, number] {
  const seq = [theme.colors.accent, ...theme.colors.primaryGradient];
  for (const c of seq) {
    const rgb = parseRgbTuple(c);
    if (rgb && !isNearBlack(rgb)) return rgb;
  }
  return parseRgbTuple(theme.colors.accent) ?? [96, 96, 110];
}

function nestRgb(theme: Theme): [number, number, number] {
  return (
    parseRgbTuple(theme.colors.backgroundSecondary) ?? parseRgbTuple(theme.colors.background) ?? [22, 22, 30]
  );
}

/** Linear blend RGB (fractional). */
function lerpRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  const u = clamp(t, 0, 1);
  return [
    Math.round(a[0] + (b[0] - a[0]) * u),
    Math.round(a[1] + (b[1] - a[1]) * u),
    Math.round(a[2] + (b[2] - a[2]) * u),
  ];
}

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r},${g},${b},${a})`;
}

export type HeroFullBleedFade = {
  bloom: readonly string[];
  bloomLocations: typeof HERO_FULL_BLEED_BLOOM_LOCATIONS;
  controlsScrim: readonly string[];
  topVeil: readonly string[];
  edgeWhisper: readonly string[];
  bloomHighlight: readonly string[];
};

/**
 * Scrims/vignettes for full-bleed EA hero match each theme tint; pure black palette when `black` theme.
 */
export function getHeroFullBleedFade(
  theme: Theme,
  opts: { isBlackTheme: boolean; isMatrix: boolean }
): HeroFullBleedFade {
  if (opts.isBlackTheme) {
    return {
      bloom: blackHeroBloom(),
      bloomLocations: HERO_FULL_BLEED_BLOOM_LOCATIONS,
      ...BLACK_HERO_STATIC,
    };
  }

  const nest = nestRgb(theme);
  const tint = tintRgb(theme);
  /** How strongly scrims shift toward accent (matrix leans neon). */
  const chroma = opts.isMatrix ? 0.5 : theme.isDark ? 0.4 : 0.34;

  /** Core body tone under gradient alphas — reads as “brand-tinted” shadow. */
  const bodyRgb = lerpRgb(nest, tint, chroma);
  /** Slightly richer at bottom controls for contrast. */
  const deepRgb = lerpRgb(bodyRgb, tint, opts.isMatrix ? 0.22 : 0.14);
  /** Top veil: cool lift into rounded corner; light themes stay lighter. */
  const veilRgb = lerpRgb(
    bodyRgb,
    theme.isDark ? [210, 210, 220] : [255, 255, 255],
    theme.isDark ? 0.12 : 0.55
  );
  /** Specular highlight tinted slightly toward accent on non-black themes */
  const specLight = lerpRgb([255, 255, 255], tint, 0.085);

  const bloom = BLOOM_ALPHAS.map((ai) => {
    if (ai === 0) return 'rgba(0,0,0,0)';
    const src = ai > 0.45 ? deepRgb : bodyRgb;
    return rgba(src[0], src[1], src[2], ai);
  });

  const controlsScrim = [
    rgba(bodyRgb[0], bodyRgb[1], bodyRgb[2], 0),
    rgba(deepRgb[0], deepRgb[1], deepRgb[2], 0.08),
    rgba(deepRgb[0], deepRgb[1], deepRgb[2], 0.38),
    rgba(deepRgb[0], deepRgb[1], deepRgb[2], 0.52),
  ];

  const topVeil = [
    rgba(veilRgb[0], veilRgb[1], veilRgb[2], 0.26),
    rgba(bodyRgb[0], bodyRgb[1], bodyRgb[2], 0.06),
    'rgba(0,0,0,0)',
  ];

  const edgeWhisper = [
    rgba(bodyRgb[0], bodyRgb[1], bodyRgb[2], 0.17),
    'rgba(0,0,0,0)',
    'rgba(0,0,0,0)',
    rgba(bodyRgb[0], bodyRgb[1], bodyRgb[2], 0.17),
  ];

  const bloomHighlight = [
    'rgba(0,0,0,0)',
    rgba(specLight[0], specLight[1], specLight[2], 0.028),
    'rgba(0,0,0,0)',
  ];

  return {
    bloom: [...bloom],
    bloomLocations: HERO_FULL_BLEED_BLOOM_LOCATIONS,
    controlsScrim,
    topVeil,
    edgeWhisper,
    bloomHighlight,
  };
}

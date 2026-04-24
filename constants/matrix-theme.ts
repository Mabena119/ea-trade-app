/**
 * Single source of truth for the “Matrix / digital rain” look:
 * true black, neon green, and glass that never reads as solid grey.
 */

/** Visual / layout tokens for the matrix theme (separate from `matrixTheme` in theme-provider). */
export const matrixVisual = {
  /** Opaque; never use alpha black on full-screen React Native roots (blends to system grey). */
  void: '#000000',

  rain: {
    head: '#E8FFF0',
    mid: '#00FF66',
    body: '#00CC33',
    tail: '#006622',
    glow: 'rgba(0, 255, 120, 0.55)',
  },

  /** Hero / add-robot: nearly invisible tint—rain must read through. */
  glass: {
    stops: [
      'rgba(0, 40, 22, 0.07)',
      'rgba(0, 22, 12, 0.05)',
      'rgba(0, 60, 32, 0.09)',
    ] as [string, string, string],
  },

  border: {
    default: 'rgba(0, 255, 110, 0.38)',
    top: 'rgba(0, 255, 130, 0.52)',
  },

  /** Headers / secondary chrome over rain */
  headerScrim: 'rgba(0, 0, 0, 0.4)',

  /** Tab bar: readable icons, still see rain */
  nav: {
    background: 'rgba(0, 0, 0, 0.5)',
  },

  /** @deprecated use headerScrim + transparent roots instead */
  screenScrim: 'rgba(0,0,0,0.58)',
} as const;

export const matrixVoid = matrixVisual.void;
export const matrixHomeGlass = matrixVisual.glass.stops;
export const matrixNavBackground = matrixVisual.nav.background;

/** iOS: kill shadow/elevation on glass panels so we never get a “silver” bloom. */
export const matrixFlatSurface = {
  shadowOpacity: 0,
  shadowRadius: 0,
  shadowOffset: { width: 0, height: 0 },
  elevation: 0,
} as const;

export const MATRIX_HEADER_SCRIM = matrixVisual.headerScrim;
export const MATRIX_SCREEN_SCRIM = matrixVisual.screenScrim;

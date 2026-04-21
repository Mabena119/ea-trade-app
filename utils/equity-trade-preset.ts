/**
 * MT5 auto trade sizing from linked-account equity, adjusted by instrument type
 * (volatility proxy: indices vs metals vs FX, etc.). Values are not user-editable.
 */

/** Broker-style micro lots: allow up to 5 decimal places (e.g. 0.00005). */
export const MIN_LOT = 0.00001;
export const MAX_LOT = 50;
const LOT_DECIMAL_PLACES = 5;
const LOT_SCALE = 10 ** LOT_DECIMAL_PLACES;

function roundLotStep(n: number): number {
  return Math.round(n * LOT_SCALE) / LOT_SCALE;
}

/** Clamp to [MIN_LOT, MAX_LOT] and round to 5 dp. */
function clampLotRange(n: number): number {
  return roundLotStep(Math.max(MIN_LOT, Math.min(MAX_LOT, n)));
}

/** User-facing lot string (trims trailing zeros, max 5 decimals). */
export function formatLotSizeForDisplay(n: number): string {
  if (!Number.isFinite(n)) return '0.01';
  const v = clampLotRange(n);
  return v.toFixed(LOT_DECIMAL_PLACES).replace(/\.?0+$/, '');
}

export function parseEquityNumber(raw?: string | null): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).replace(/,/g, '').replace(/\s/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export interface EquityMT5Preset {
  lotSize: string;
  direction: 'BOTH';
  numberOfTrades: string;
  platform: 'MT5';
}

/** Rough instrument bucket for volatility-based sizing (broker symbol naming). */
export type InstrumentVolatilityClass = 'forex' | 'metal' | 'index' | 'crypto' | 'commodity' | 'other';

/**
 * Classify a broker symbol string into a volatility bucket. Heuristic only —
 * tune patterns as your supported symbols evolve.
 */
export function classifyInstrumentSymbol(symbol: string): InstrumentVolatilityClass {
  const s = symbol.replace(/[\s._-]/g, '').toUpperCase();
  if (!s) return 'other';

  if (/XAU|XAG|GOLD|SILVER|XPT|XPD|PLAT|PALL/.test(s)) return 'metal';
  if (/(BTC|ETH|LTC|XRP|SOL|ADA|DOGE|DOT|MATIC|AVAX|BNB|PEPE|SHIB|CRYPTO|USDT)/.test(s)) return 'crypto';
  if (/(USOIL|UKOIL|WTI|BRENT|XTI|XBR|OIL|NATGAS|XNG|COPPER|XCU)/.test(s)) return 'commodity';
  if (
    /(US30|US500|US100|NAS100|USTEC|SPX|SP500|GER40|GER30|UK100|DE40|DE30|DAX|DJ30|DOW|WS30|ND100|HK50|JP225|NI225|AUS200|EU50|VOLX|US2000|RUT|STOXX|NIFTY|USDX|VIX)/.test(s)
  ) {
    return 'index';
  }

  return 'forex';
}

function clampLot(lot: number): number {
  return clampLotRange(lot);
}

const AUTO_SIZED_LOT_DP = 2;

/**
 * Lot string for AI sizing + equity-heuristic auto mode: 2 decimal places, minimum 0.01.
 * Manual trade config uses {@link sanitizeManualLotSize} (up to 5 dp).
 */
export function formatAutoSizedLotString(raw: string | number | undefined | null): string {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return '0.01';
  let v = Math.round(n * 10 ** AUTO_SIZED_LOT_DP) / 10 ** AUTO_SIZED_LOT_DP;
  v = Math.max(0.01, Math.min(MAX_LOT, v));
  const s = v.toFixed(AUTO_SIZED_LOT_DP).replace(/\.?0+$/, '');
  return s || '0.01';
}

function formatLot(lot: number): string {
  return formatAutoSizedLotString(clampLot(lot));
}

interface BaseLadder {
  lot: number;
  trades: number;
}

function getBaseEquityLadder(eq: number | null): BaseLadder {
  if (eq == null || eq <= 0) {
    return { lot: 0.01, trades: 1 };
  }

  if (eq < 500) return { lot: 0.01, trades: 1 };
  if (eq < 2000) return { lot: 0.02, trades: 1 };
  if (eq < 10000) return { lot: 0.03, trades: 2 };
  if (eq < 50000) return { lot: 0.05, trades: 2 };
  if (eq < 150000) return { lot: 0.08, trades: 3 };
  return { lot: 0.1, trades: 3 };
}

/** Upper bound on parallel trades from equity (fallback when AI is unavailable). */
function maxTradesForEquity(eq: number | null): number {
  if (eq == null || eq <= 0) return 5;
  if (eq < 500) return 3;
  if (eq < 2000) return 5;
  if (eq < 10000) return 8;
  if (eq < 50000) return 12;
  return 15;
}

const VOL_LOT_MULT: Record<InstrumentVolatilityClass, number> = {
  forex: 1,
  metal: 0.62,
  index: 0.35,
  crypto: 0.42,
  commodity: 0.72,
  other: 0.88,
};

/**
 * When per-trade lot is reduced for volatile symbols, increase trade count so
 * lot × effective workflow stays in scale with the equity ladder (capped).
 */
function applyVolatilityToBase(base: BaseLadder, cls: InstrumentVolatilityClass, equity: number | null): EquityMT5Preset {
  const mult = VOL_LOT_MULT[cls];
  const lot0 = base.lot;
  const trades0 = base.trades;
  const exposure = lot0 * trades0;
  let lot = Math.max(MIN_LOT, lot0 * mult);
  lot = clampLot(lot);
  let trades = Math.max(1, Math.round(exposure / lot));
  trades = Math.min(trades, maxTradesForEquity(equity));

  return {
    lotSize: formatLot(lot),
    direction: 'BOTH',
    numberOfTrades: String(trades),
    platform: 'MT5',
  };
}

/**
 * Tiered risk ladder from equity, then scaled by instrument type (indices vs FX vs metals, etc.).
 * When equity is unknown, uses micro baseline with the same instrument scaling.
 */
export function getEquityBasedMT5Preset(equityInput?: string | null, symbol?: string | null): EquityMT5Preset {
  const eq = parseEquityNumber(equityInput);
  const base = getBaseEquityLadder(eq);
  const cls = classifyInstrumentSymbol(symbol ?? '');
  return applyVolatilityToBase(base, cls, eq);
}

/** Clamp user-entered lot (manual mode). */
export function sanitizeManualLotSize(raw: string | undefined | null): string {
  const n = parseFloat(String(raw ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return '0.01';
  if (n < MIN_LOT) return formatLotSizeForDisplay(MIN_LOT);
  return formatLotSizeForDisplay(n);
}

/** Clamp user-entered trade count (manual mode). */
export function sanitizeManualTradesCount(raw: string | undefined | null): string {
  const n = parseInt(String(raw ?? '').replace(/\D/g, ''), 10);
  if (!Number.isFinite(n) || n < 1) return '1';
  return String(Math.min(50, n));
}

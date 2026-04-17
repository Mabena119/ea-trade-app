/**
 * MT5 auto trade sizing from linked-account equity, adjusted by instrument type
 * (volatility proxy: indices vs metals vs FX, etc.). Values are not user-editable.
 */
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
  const v = Math.max(0.01, Math.min(50, lot));
  return Math.round(v * 100) / 100;
}

function formatLot(lot: number): string {
  return clampLot(lot).toFixed(2);
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
  let lot = Math.max(0.01, lot0 * mult);
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

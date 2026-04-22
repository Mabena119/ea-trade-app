import type { MT5TradeMode } from '@/providers/app-provider';

/** Strip to a numeric string for MT5 order fields (prices may include commas or labels). */
export function stripNumericPrice(s: string | undefined): string {
  if (!s) return '';
  const t = s.trim();
  const m = t.replace(/[^\d.,-]/g, '').replace(/,/g, '');
  return m;
}

/**
 * How far TP is from entry relative to SL distance (reward:risk in price).
 * Slightly above 2:1 to improve net expectancy after costs.
 */
const TP_RISK_MULTIPLIER: Record<MT5TradeMode, number> = {
  scalper: 2.4,
  swing: 2.75,
};

export function getTakeProfitRiskMultiple(tradeMode: MT5TradeMode): number {
  return TP_RISK_MULTIPLIER[tradeMode] ?? 2.5;
}

/**
 * When AI omits SL/TP, derive distances from entry by trade mode (same rules as analyze-chart API).
 * Scalper: tighter; swing: wider.
 */
export function computeFallbackSlTp(
  direction: 'BUY' | 'SELL',
  entryNumeric: number,
  tradeMode: MT5TradeMode = 'swing'
): { sl: string; tp: string } | null {
  if (!entryNumeric || !Number.isFinite(entryNumeric)) return null;
  const pct = tradeMode === 'scalper' ? 0.0025 : 0.007;
  const slDist = entryNumeric * pct;
  const mult = getTakeProfitRiskMultiple(tradeMode);
  const tpDist = entryNumeric * pct * mult;
  const decimals = entryNumeric > 100 ? 2 : 5;
  const fmt = (n: number) => parseFloat(n.toFixed(decimals)).toString();
  if (direction === 'BUY') {
    return { sl: fmt(entryNumeric - slDist), tp: fmt(entryNumeric + tpDist) };
  }
  return { sl: fmt(entryNumeric + slDist), tp: fmt(entryNumeric - tpDist) };
}

/** Percent of price used for SL distance (TP uses getTakeProfitRiskMultiple × this distance). */
export function getSlTpPercentForTradeMode(tradeMode: MT5TradeMode): number {
  return tradeMode === 'scalper' ? 0.0025 : 0.007;
}

const DEFAULT_MIN_RR = 1.85;

/**
 * Widen take-profit to meet a minimum reward:risk when the model returns a tight target.
 * Does not change SL or flip invalid direction (TP on wrong side of entry).
 */
export function ensureMinRewardRisk(
  direction: 'BUY' | 'SELL',
  entry: number,
  sl: number,
  tp: number,
  minRR: number = DEFAULT_MIN_RR
): string {
  if (![entry, sl, tp].every((n) => Number.isFinite(n))) return String(tp);
  const risk = Math.abs(entry - sl);
  if (risk <= 0) return String(tp);
  const reward = direction === 'BUY' ? tp - entry : entry - tp;
  const decimals = entry > 100 ? 2 : 5;
  const fmt = (n: number) => parseFloat(n.toFixed(decimals)).toString();
  if (reward <= 0) return String(tp);
  if (reward / risk >= minRR) return fmt(tp);
  const needDist = minRR * risk;
  const newTp = direction === 'BUY' ? entry + needDist : entry - needDist;
  return fmt(newTp);
}

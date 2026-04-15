import type { MT5TradeMode } from '@/providers/app-provider';

/** Strip to a numeric string for MT5 order fields (prices may include commas or labels). */
export function stripNumericPrice(s: string | undefined): string {
  if (!s) return '';
  const t = s.trim();
  const m = t.replace(/[^\d.,-]/g, '').replace(/,/g, '');
  return m;
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
  const tpDist = entryNumeric * (pct * 2);
  const decimals = entryNumeric > 100 ? 2 : 5;
  const fmt = (n: number) => parseFloat(n.toFixed(decimals)).toString();
  if (direction === 'BUY') {
    return { sl: fmt(entryNumeric - slDist), tp: fmt(entryNumeric + tpDist) };
  }
  return { sl: fmt(entryNumeric + slDist), tp: fmt(entryNumeric - tpDist) };
}

/** Percent of price used for SL distance (TP uses 2× this distance). */
export function getSlTpPercentForTradeMode(tradeMode: MT5TradeMode): number {
  return tradeMode === 'scalper' ? 0.0025 : 0.007;
}

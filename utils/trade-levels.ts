import type { MT5Symbol, MT5TradeMode } from '@/providers/app-provider';

export function normalizeSymbolKey(s: string): string {
  return s.replace(/\s/g, '').toUpperCase();
}

/** Root name before broker suffixes like .i, .m, #, etc. */
export function baseSymbolKey(s: string): string {
  const n = normalizeSymbolKey(s);
  return n.split(/[.#_]/)[0] || n;
}

/**
 * True if chart symbol and configured symbol likely refer to the same instrument
 * (exact, same root, prefix, or contained substring for longer names).
 */
export function symbolsAreSimilar(chartSymbol: string, configuredSymbol: string): boolean {
  const a = normalizeSymbolKey(chartSymbol);
  const b = normalizeSymbolKey(configuredSymbol);
  if (a === b) return true;
  const ba = baseSymbolKey(chartSymbol);
  const bb = baseSymbolKey(configuredSymbol);
  if (ba.length >= 2 && bb.length >= 2 && ba === bb) return true;
  if (a.length >= 3 && b.length >= 3) {
    if (a.startsWith(b) || b.startsWith(a)) return true;
  }
  if (a.length >= 4 && b.length >= 4) {
    if (a.includes(b) || b.includes(a)) return true;
  }
  return false;
}

/** Strip to a numeric string for MT5 order fields (prices may include commas or labels). */
export function stripNumericPrice(s: string | undefined): string {
  if (!s) return '';
  const t = s.trim();
  const m = t.replace(/[^\d.,-]/g, '').replace(/,/g, '');
  return m;
}

/**
 * Scalper: tighter stops; swing: wider (hold longer).
 * Same rules as ai-scanner manual "Take trade" path.
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

/**
 * Resolve MT5 trade-config row for chart AI symbol vs signal asset (broker suffixes).
 */
export function findMT5SymbolConfigForAnalysis(
  analysisSymbol: string,
  fallbackAsset: string,
  mt5Symbols: MT5Symbol[]
): MT5Symbol | undefined {
  if (!mt5Symbols.length) return undefined;
  const candidates = [analysisSymbol, fallbackAsset].filter(Boolean);
  for (const c of candidates) {
    const exact = mt5Symbols.find(s => normalizeSymbolKey(s.symbol) === normalizeSymbolKey(c));
    if (exact) return exact;
  }
  for (const c of candidates) {
    const sim = mt5Symbols.find(s => symbolsAreSimilar(c, s.symbol));
    if (sim) return sim;
  }
  return undefined;
}

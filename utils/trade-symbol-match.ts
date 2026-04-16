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

function rowTradeMode(row: MT5Symbol): MT5TradeMode {
  return row.tradeMode === 'scalper' ? 'scalper' : 'swing';
}

function resolveBestMt5RowForAsset(asset: string, mt5Symbols: MT5Symbol[]): MT5Symbol | null {
  if (!mt5Symbols.length) return null;
  const raw = asset.trim();
  if (!raw) {
    if (mt5Symbols.length === 1) return mt5Symbols[0];
    return null;
  }
  const exact = mt5Symbols.find((s) => normalizeSymbolKey(s.symbol) === normalizeSymbolKey(raw));
  if (exact) return exact;
  const similar = mt5Symbols.filter((s) => symbolsAreSimilar(raw, s.symbol));
  if (similar.length === 0) return null;
  if (similar.length === 1) return similar[0];
  similar.sort((a, b) => {
    const da = Math.abs(normalizeSymbolKey(a.symbol).length - normalizeSymbolKey(raw).length);
    const db = Math.abs(normalizeSymbolKey(b.symbol).length - normalizeSymbolKey(raw).length);
    if (da !== db) return da - db;
    return normalizeSymbolKey(a.symbol).localeCompare(normalizeSymbolKey(b.symbol));
  });
  return similar[0];
}

/**
 * Trade mode for analyze-chart API: uses MT5 trade config for the best-matching symbol,
 * or the sole configured symbol when no asset string is known; otherwise swing.
 */
export function getTradeModeForAnalysis(asset: string | undefined, mt5Symbols: MT5Symbol[]): MT5TradeMode {
  const row = resolveBestMt5RowForAsset(asset || '', mt5Symbols);
  if (row) return rowTradeMode(row);
  if (mt5Symbols.length === 1) return rowTradeMode(mt5Symbols[0]);
  return 'swing';
}

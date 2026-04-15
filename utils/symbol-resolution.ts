import type { ActiveSymbol, MT4Symbol, MT5Symbol } from '@/providers/app-provider';

export function normalizeSymbolKey(s: string): string {
  return s.replace(/\s/g, '').toUpperCase();
}

export function baseSymbolKey(s: string): string {
  const n = normalizeSymbolKey(s);
  return n.split(/[.#_]/)[0] || n;
}

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

/**
 * Maps AI chart symbol text to one configured Quotes symbol (same rules as AI Scanner).
 */
export function resolveConfiguredTradeSymbol(
  analysisSymbol: string | undefined,
  mt5Symbols: MT5Symbol[],
  mt4Symbols: MT4Symbol[],
  activeSymbols: ActiveSymbol[]
): { symbol: string } | null {
  const fromMt5 = mt5Symbols.map((x) => x.symbol);
  const fromMt4 = mt4Symbols.map((x) => x.symbol);
  const fromActive = activeSymbols.map((x) => x.symbol);
  const unique = [...new Set([...fromMt5, ...fromMt4, ...fromActive].filter(Boolean))];
  if (unique.length === 0) return null;

  const raw = (analysisSymbol || '').trim();
  if (!raw) {
    if (unique.length === 1) return { symbol: unique[0] };
    return null;
  }

  const exact = unique.find((u) => normalizeSymbolKey(u) === normalizeSymbolKey(raw));
  if (exact) return { symbol: exact };

  const similar = unique.filter((u) => symbolsAreSimilar(raw, u));
  if (similar.length === 0) return null;
  if (similar.length === 1) return { symbol: similar[0] };
  similar.sort((a, b) => {
    const da = Math.abs(normalizeSymbolKey(a).length - normalizeSymbolKey(raw).length);
    const db = Math.abs(normalizeSymbolKey(b).length - normalizeSymbolKey(raw).length);
    if (da !== db) return da - db;
    return normalizeSymbolKey(a).localeCompare(normalizeSymbolKey(b));
  });
  return { symbol: similar[0] };
}

import type { ChartAnalysisResult } from '@/services/api';
import type { MT5TradeMode, SignalLog } from '@/providers/app-provider';

/** Strip to a numeric string for MT5 order fields (prices may include commas or labels). */
function stripNumericPrice(s: string | undefined): string {
  if (!s) return '';
  const t = s.trim();
  const m = t.replace(/[^\d.,-]/g, '').replace(/,/g, '');
  return m;
}

/** Same distance rules as analyze-chart / ai-scanner when AI omits SL/TP. */
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
 * Builds a SignalLog for MT5 execution, mirroring ai-scanner rules (SL/TP fallbacks).
 */
export function buildSignalLogFromChartAnalysis(
  result: ChartAnalysisResult,
  asset: string,
  tradeMode: MT5TradeMode,
  meta?: { id?: string; type?: string; source?: string }
): SignalLog | null {
  if (result.signal === 'NEUTRAL') return null;
  const dir = result.signal === 'SELL' ? 'SELL' : 'BUY';
  let sl = stripNumericPrice(result.stopLoss);
  let tp = stripNumericPrice(result.takeProfit1 || '');
  const entryStr = stripNumericPrice(result.entryPrice || result.currentPrice);
  const entryNum = parseFloat(entryStr);

  if ((!sl || !tp) && entryNum && Number.isFinite(entryNum)) {
    const fb = computeFallbackSlTp(dir, entryNum, tradeMode);
    if (fb) {
      if (!sl) sl = fb.sl;
      if (!tp) tp = fb.tp;
    }
  }

  if (!sl || !tp) return null;

  return {
    id: meta?.id ?? `ai-fallback-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    asset,
    action: dir === 'BUY' ? 'buy' : 'sell',
    price: entryStr || '0',
    tp,
    sl,
    time: new Date().toISOString(),
    type: meta?.type ?? 'AI_SYMBOL_FALLBACK',
    source: meta?.source ?? 'ai_symbol_fallback',
  };
}

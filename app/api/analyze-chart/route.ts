/**
 * AI Chart Analysis API - Uses Google Gemini to analyze trading chart images
 * Requires GOOGLE_AI_API_KEY or GEMINI_API_KEY environment variable
 */

import { getSlTpPercentForTradeMode } from '@/utils/trade-mode-levels';
import type { MT5TradeMode } from '@/providers/app-provider';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'] as const;
const GEMINI_TIMEOUT_MS = 20000; // Stay under Render timeout
const MAX_BASE64_BYTES = 1_000_000; // 1MB max to avoid 502

/** Keep broker symbol text usable for app matching (exact ticker, no prose). */
function normalizeSymbolFromChart(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  let s = String(raw).trim();
  if (!s) return '';
  s = s.replace(/^[\s"'`]+|[\s"'`]+$/g, '');
  s = s.replace(/\u00A0/g, '');
  const labelPick = s.match(
    /(?:^|\s)(?:symbol|pair|ticker|instrument)\s*[:=]\s*([A-Za-z0-9][A-Za-z0-9.#_\-]{0,30})/i
  );
  if (labelPick?.[1]) return labelPick[1].trim();
  const slash = s.match(/\b([A-Za-z]{3,10})\s*\/\s*([A-Za-z]{3,10})\b/);
  if (slash) return `${slash[1]}${slash[2]}`.toUpperCase();
  const paren = s.match(/\(([A-Za-z0-9][A-Za-z0-9.#_\-]{1,31})\)/);
  if (paren?.[1]) return paren[1].trim();
  const oneToken = s.match(/^([A-Za-z0-9][A-Za-z0-9.#_\-]{1,31})$/);
  if (oneToken) return s;
  const tokens = s.split(/[\s,;|]+/).filter(Boolean);
  for (const t of tokens) {
    if (/^[A-Za-z0-9][A-Za-z0-9.#_\-]{1,31}$/.test(t)) return t;
  }
  const stripped = s.replace(/[^\w.#\-]/g, '');
  return stripped.length <= 32 ? stripped : stripped.slice(0, 32);
}

const CHART_ANALYSIS_PROMPT = `You are an expert technical analyst. Analyze this chart image.

chartDetected rules (critical):
- Set "chartDetected": true if the image shows ANY MetaTrader / MT4 / MT5 / web terminal / cTrader / broker webtrader screenshot that includes a price chart area, candlesticks, bars, or a line chart — even with side panels, toolbars, or account bars visible.
- Set "chartDetected": false ONLY when there is clearly no trading chart at all (e.g. login-only screen with no chart, blank page, unrelated app UI). Do NOT set false just because the image is busy, cropped, or low contrast.
- NEVER claim the image is "entirely black", "blank", or "no chart" if you can see any candles, wicks, grid, price scale numbers, Bid/Ask, balance bar, or symbol title — those mean chartDetected MUST be true and you must read prices from the image.

SYMBOL (critical for automated trading — read from the image, do not guess):
- Set "symbol" to the EXACT instrument code as shown on THIS chart: title bar, Market Watch line, order panel, or corner label (e.g. USTECH, EURUSD, XAUUSD, BTCUSD, US100, GER40, NAS100.i, EURUSD.r).
- Copy spelling, dots, suffixes, and case EXACTLY as the platform displays (brokers differ: .i .m .pro # mini micro).
- If the chart window shows one primary symbol, use that only — not a watchlist of other pairs.
- If the symbol text is unreadable or not visible, use "" for symbol (never invent a ticker from the asset class alone).

APPROACH - Use a structured strategy. First OBSERVE what you see, then CONCLUDE.

OBSERVATIONS (for "reasoning" field - write 4-6 unique sentences):
- Describe the TREND: higher highs/lows (bullish) or lower highs/lows (bearish)? Is it strong or weak?
- Name specific SUPPORT and RESISTANCE levels you see on the chart (use price scale numbers)
- Note any CANDLE PATTERNS: engulfing, doji, hammer, etc.
- If indicators are visible: RSI overbought/oversold? MACD crossover? Moving average alignment?
- What is the MOMENTUM and VOLUME suggesting?
- Conclude: Based on these observations, BUY or SELL and why.

Do NOT repeat "Chart analysis completed" or generic phrases. Do NOT just list Entry/SL/TP. Describe what you SEE and your reasoning.

SUGGESTION (strategic advice - 2-3 sentences):
- Entry timing: immediate or wait for pullback/confirmation?
- Specific trade execution tip (e.g. "Enter on break of 1.3320", "Scale in on dips")
- Risk note (e.g. "Tighten SL if price holds above 1.3350")
Do NOT just repeat "Place order at X, SL Y, TP Z" - add strategy.

ACCOUNT & PORTFOLIO (this app’s execution policy — reflect in summary/suggestion when relevant):
- The automated terminal **never** closes open positions just to make room for a new order on the same symbol, or to “switch” the book. New signals **add** exposure (including on other symbols) rather than mass-closing existing trades first.
- When floating profit is an unusually large share of equity (e.g. **around 30% or more** of equity in combined open P/L), **prioritize** banking gains or reducing size in your suggestion: take-profit discipline, scale-out, or partial close — not blindly adding the same risk.
- Prefer **diversification** across uncorrelated symbols when the account may already have risk; avoid over-concentrating one idea if multiple symbols are in play.
- **Profitable style**: plan entries with clear invalidation, avoid revenge/add-on logic that assumes prior trades will be closed by the system, and treat large unrealized profit as a signal to protect capital.

LEVELS: entryPrice, stopLoss, takeProfit1 as numbers from chart. Never leave SL or TP empty.

Output JSON only (symbol must be the literal ticker string from the chart UI, or ""):
{"chartDetected":true,"symbol":"EXACT_TICKER_OR_EMPTY","timeframe":"X","currentPrice":"X","signal":"BUY"|"SELL","confidence":"high"|"medium"|"low","summary":"One sentence on the key setup","reasoning":"4-6 sentences: your observations - trend, S/R, patterns, indicators, conclusion","suggestion":"2-3 sentences of strategic advice - timing, execution, risk","entryPrice":"number","stopLoss":"number","takeProfit1":"number","takeProfit2":"","takeProfit3":""}`;

/** Second pass when the model wrongly returns chartDetected:false on a large screenshot (typical MT5 web canvas capture). */
const CHART_RETRY_PROMPT = `This image is a screenshot from a MetaTrader web terminal (MT4/MT5) or similar broker terminal. It MUST be treated as a valid trading chart. Set "chartDetected": true. Read the visible symbol from the title bar or chart label. Output the same JSON schema as before (symbol, timeframe, signal BUY or SELL, entryPrice, stopLoss, takeProfit1, reasoning, summary, suggestion).`;

function tradeModePromptAppendix(tradeMode: MT5TradeMode): string {
  if (tradeMode === 'scalper') {
    return `

TRADING STYLE (user configuration: SCALPER):
- Favor short-term, intraday-style interpretation: tighter reasonable SL/TP distances than swing when levels are visible on the chart.
- Emphasize quick confirmation, noise management, and imminent structure; do not invent prices the chart does not show.`;
  }
  return `

TRADING STYLE (user configuration: SWING):
- Favor swing-style interpretation: wider SL/TP when justified by visible multi-session S/R and larger swings on the chart.
- Emphasis on patience, pullbacks, and holding with trend when the structure supports it; do not invent prices the chart does not show.`;
}

function chartAnalysisTextForMode(tradeMode: MT5TradeMode): string {
  return `${CHART_ANALYSIS_PROMPT}${tradeModePromptAppendix(tradeMode)}`;
}

function chartRetryTextForMode(tradeMode: MT5TradeMode): string {
  const hint =
    tradeMode === 'scalper'
      ? ' The user trades SCALPER mode — prefer tighter intraday-style distances when inferring levels.'
      : ' The user trades SWING mode — prefer wider swing-style distances when inferring levels.';
  return `${CHART_RETRY_PROMPT}${hint}`;
}

function asChartString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

function parseGeminiChartResponse(rawText: string): Record<string, string | boolean> {
  let parsed: Record<string, string | boolean>;
  try {
    let cleaned = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    const braceMatch = cleaned.match(/\{[\s\S]*\}/);
    if (braceMatch) cleaned = braceMatch[0];
    cleaned = cleaned.replace(/^\uFEFF/, '').replace(/,(\s*[}\]])/g, '$1');
    parsed = JSON.parse(cleaned) as Record<string, string | boolean>;
  } catch (parseErr) {
    console.warn('JSON parse failed, using regex fallback:', parseErr);
    console.warn('Raw response (first 500 chars):', rawText.slice(0, 500));
    const extract = (key: string): string => {
      const quoted = rawText.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`, 'i'));
      if (quoted?.[1]) return quoted[1].trim();
      const unquoted = rawText.match(new RegExp(`"${key}"\\s*:\\s*([^,}\\s"\\[\\]]+)`, 'i'));
      if (unquoted?.[1]) return String(unquoted[1].trim());
      return '';
    };
    const chartDetMatch = rawText.match(/"chartDetected"\s*:\s*(true|false)/i)?.[1]?.toLowerCase();
    const chartDet = chartDetMatch !== 'false';
    const sig = rawText.match(/"signal"\s*:\s*"(BUY|SELL|NEUTRAL)"/i)?.[1]?.toUpperCase() || 'NEUTRAL';
    parsed = {
      chartDetected: chartDet,
      symbol: extract('symbol') || '',
      timeframe: extract('timeframe') || '',
      currentPrice: extract('currentPrice') || '',
      signal: ['BUY', 'SELL'].includes(sig) ? sig : 'NEUTRAL',
      confidence: extract('confidence') || 'medium',
      summary: extract('summary') || 'Chart analysis completed.',
      reasoning: extract('reasoning') || '',
      suggestion: extract('suggestion') || '',
      entryPrice: extract('entryPrice') || '',
      stopLoss: extract('stopLoss') || '',
      takeProfit1: extract('takeProfit1') || '',
      takeProfit2: extract('takeProfit2') || '',
      takeProfit3: extract('takeProfit3') || '',
    };
  }
  return parsed;
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('Missing GOOGLE_AI_API_KEY or GEMINI_API_KEY');
    return Response.json(
      {
        message: 'error',
        error: 'AI analysis not configured. Set GOOGLE_AI_API_KEY in environment.',
      },
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json();
    const { image, mimeType = 'image/jpeg', tradeMode: tradeModeRaw } = body as {
      image?: string;
      mimeType?: string;
      tradeMode?: string;
    };
    const tradeMode: MT5TradeMode = tradeModeRaw === 'scalper' ? 'scalper' : 'swing';

    if (!image || typeof image !== 'string') {
      return Response.json(
        { message: 'error', error: 'Image data (base64) is required' },
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Strip data URL prefix if present (e.g. "data:image/jpeg;base64,...")
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

    if (base64Data.length > MAX_BASE64_BYTES) {
      return Response.json(
        { message: 'error', error: 'Image too large. Use a smaller chart screenshot.' },
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const geminiPayload = {
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data,
              },
            },
            { text: chartAnalysisTextForMode(tradeMode) },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    let res: Response | undefined;
    let lastErr: string | null = null;

    for (const model of MODELS) {
      try {
        res = await fetch(
          `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload),
            signal: controller.signal,
          }
        );
        if (res.ok) {
          clearTimeout(timeoutId);
          break;
        }
        lastErr = await res.text();
        if (res.status === 404) {
          console.warn(`Model ${model} not found, trying next...`);
          continue;
        }
        clearTimeout(timeoutId);
        console.error('Gemini API error:', res.status, lastErr.slice(0, 500));
        let hint = 'Please try again.';
        if (res.status === 401 || res.status === 403) hint = 'Check API key in Render Environment.';
        if (res.status === 429) hint = 'Rate limit reached. Wait 1 minute and try again.';
        return Response.json(
          { message: 'error', error: `AI analysis failed. ${hint}` },
          { status: 502, headers: { 'Content-Type': 'application/json' } }
        );
      } catch (fetchErr: unknown) {
        if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
          clearTimeout(timeoutId);
          return Response.json(
            { message: 'error', error: 'Request timed out. Try a smaller image.' },
            { status: 502, headers: { 'Content-Type': 'application/json' } }
          );
        }
        lastErr = fetchErr instanceof Error ? fetchErr.message : 'Unknown';
      }
    }
    clearTimeout(timeoutId);

    if (!res?.ok) {
      console.error('All Gemini models failed:', lastErr?.slice(0, 300));
      return Response.json(
        { message: 'error', error: 'AI analysis failed. Please try again.' },
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    if (!text) {
      return Response.json(
        { message: 'error', error: 'No analysis returned from AI' },
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let parsed = parseGeminiChartResponse(text);

    let chartDetected = parsed.chartDetected !== false;
    const MIN_BASE64_FOR_CHART_RETRY = 10_000;
    if (!chartDetected && base64Data.length >= MIN_BASE64_FOR_CHART_RETRY) {
      console.warn('analyze-chart: chartDetected false on substantial image, retrying with MT5 terminal hint');
      const retryPayload = {
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data,
                },
              },
              { text: chartRetryTextForMode(tradeMode) },
            ],
          },
        ],
        generationConfig: geminiPayload.generationConfig,
      };
      const retryController = new AbortController();
      const retryTimeoutId = setTimeout(() => retryController.abort(), GEMINI_TIMEOUT_MS);
      try {
        for (const model of MODELS) {
          const rTry = await fetch(
            `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(retryPayload),
              signal: retryController.signal,
            }
          );
          if (rTry.ok) {
            const retryData = (await rTry.json()) as {
              candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            };
            const retryText = retryData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
            if (retryText) {
              parsed = parseGeminiChartResponse(retryText);
              chartDetected = parsed.chartDetected !== false;
            }
            break;
          }
          const errBody = await rTry.text();
          if (rTry.status === 404) {
            console.warn(`Model ${model} not found for retry, trying next...`);
            continue;
          }
          console.warn('analyze-chart retry Gemini error:', rTry.status, errBody.slice(0, 400));
          break;
        }
      } catch (retryErr) {
        console.warn('analyze-chart retry failed:', retryErr);
      } finally {
        clearTimeout(retryTimeoutId);
      }
    }

    if (!chartDetected) {
      return Response.json(
        {
          message: 'error',
          error: 'Please upload a chart image. The image does not appear to be a trading chart (candlestick, bar, or line chart from a trading platform).',
        },
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Force BUY or SELL only - convert NEUTRAL based on reasoning/summary
    let signal = (asChartString(parsed.signal) || 'BUY').toUpperCase();
    if (signal === 'NEUTRAL') {
      const text = `${asChartString(parsed.reasoning)} ${asChartString(parsed.summary)}`.toLowerCase();
      signal = text.includes('bearish') || text.includes('sell') || text.includes('down') || text.includes('short') ? 'SELL' : 'BUY';
    }

    let currentPrice = asChartString(parsed.currentPrice);
    let entryPrice = asChartString(parsed.entryPrice) || currentPrice;
    let stopLoss = asChartString(parsed.stopLoss);
    let takeProfit1 = asChartString(parsed.takeProfit1);
    const suggestion = asChartString(parsed.suggestion);

    // Fallback: extract prices from suggestion text (e.g. "Enter at 1.0850, SL at 1.0800, TP at 1.0920")
    if ((!entryPrice || !stopLoss || !takeProfit1) && suggestion) {
      const enterMatch = suggestion.match(/(?:enter|entry)\s*(?:at|:)?\s*([\d.,]+)/i) || suggestion.match(/([\d.,]+)\s*(?:for\s+)?(?:entry|enter)/i);
      const slMatch = suggestion.match(/(?:sl|stop\s*loss)\s*(?:at|:)?\s*([\d.,]+)/i) || suggestion.match(/([\d.,]+)\s*(?:for\s+)?(?:sl|stop)/i);
      const tpMatch = suggestion.match(/(?:tp|take\s*profit)\s*(?:at|:)?\s*([\d.,]+)/i) || suggestion.match(/([\d.,]+)\s*(?:for\s+)?(?:tp|target)/i);
      if (!entryPrice && enterMatch?.[1]) entryPrice = enterMatch[1].trim();
      if (!stopLoss && slMatch?.[1]) stopLoss = slMatch[1].trim();
      if (!takeProfit1 && tpMatch?.[1]) takeProfit1 = tpMatch[1].trim();
    }

    // Fallback: compute SL/TP from entry when AI returns empty (scalper: tighter; swing: wider)
    const entryNum = parseFloat(String(entryPrice).replace(/,/g, ''));
    if (entryNum && !isNaN(entryNum) && (!stopLoss || !takeProfit1)) {
      const pct = getSlTpPercentForTradeMode(tradeMode);
      const slDist = entryNum * pct;
      const tpDist = entryNum * (pct * 2);
      const decimals = entryNum > 100 ? 2 : 5;
      const fmt = (n: number) => parseFloat(n.toFixed(decimals)).toString();
      if (!stopLoss) stopLoss = signal === 'BUY' ? fmt(entryNum - slDist) : fmt(entryNum + slDist);
      if (!takeProfit1) takeProfit1 = signal === 'BUY' ? fmt(entryNum + tpDist) : fmt(entryNum - tpDist);
    }

    const symbolNormalized = normalizeSymbolFromChart(parsed.symbol);

    return Response.json(
      {
        message: 'accept',
        data: {
          symbol: symbolNormalized,
          timeframe: asChartString(parsed.timeframe),
          currentPrice,
          signal: signal as 'BUY' | 'SELL',
          confidence: asChartString(parsed.confidence) || 'low',
          summary: asChartString(parsed.summary),
          reasoning: (() => {
            const r = asChartString(parsed.reasoning).replace(/chart analysis completed\.?/gi, '').trim();
            const summary = asChartString(parsed.summary).trim();
            if (r && r.length > 80 && !/entry\s*\d|consider trend|technical analysis indicates/i.test(r)) return r;
            if (summary && summary.length > 30 && !/chart analysis completed/i.test(summary)) return summary;
            return r || summary;
          })(),
          suggestion: (() => {
            const s = (suggestion || '').replace(/review.*levels above\.?/gi, '').trim();
            if (s && s.length > 50 && !/^place\s*(buy|sell)\s*order\s*at\s*[\d.]+\.?\s*stop\s*loss:/i.test(s)) return s;
            return s || (stopLoss && takeProfit1 ? `SL: ${stopLoss}, TP: ${takeProfit1}. Use proper position sizing.` : '');
          })(),
          entryPrice,
          stopLoss,
          takeProfit1,
          takeProfit2: asChartString(parsed.takeProfit2),
          takeProfit3: asChartString(parsed.takeProfit3),
        },
      },
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('analyze-chart error:', error);
    return Response.json(
      {
        message: 'error',
        error: 'Analysis failed. Please try again.',
      },
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function GET(): Promise<Response> {
  return Response.json({ message: 'Use POST with image data' }, { status: 405 });
}

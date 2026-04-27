/**
 * AI Chart Analysis API - Uses Google Gemini to analyze trading chart images
 * Requires GOOGLE_AI_API_KEY or GEMINI_API_KEY environment variable
 */

import { createHash } from 'node:crypto';
import {
  getSlTpPercentForTradeMode,
  getTakeProfitRiskMultiple,
  ensureMinRewardRisk,
} from '@/utils/trade-mode-levels';
import type { MT5TradeMode } from '@/providers/app-provider';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'] as const;
const GEMINI_TIMEOUT_MS = 20000; // Stay under Render timeout
const MAX_BASE64_BYTES = 1_000_000; // 1MB max to avoid 502
const CHART_CACHE_MAX = 200;

/** Same image bytes + trade mode → identical API output (avoids model drift; speeds retries). */
const chartAnalysisResultCache = new Map<
  string,
  {
    data: {
      symbol: string;
      timeframe: string;
      currentPrice: string;
      signal: 'BUY' | 'SELL';
      confidence: string;
      summary: string;
      reasoning: string;
      suggestion: string;
      entryPrice: string;
      stopLoss: string;
      takeProfit1: string;
      takeProfit2: string;
      takeProfit3: string;
    };
  }
>();

function cacheKeyForChart(base64Data: string, tradeMode: MT5TradeMode): string {
  return createHash('sha256').update(base64Data, 'utf8').update('\n').update(tradeMode).digest('hex');
}

function cacheGetChart(base64Data: string, tradeMode: MT5TradeMode) {
  const k = cacheKeyForChart(base64Data, tradeMode);
  return chartAnalysisResultCache.get(k) ?? null;
}

function cacheSetChart(
  base64Data: string,
  tradeMode: MT5TradeMode,
  data: {
    symbol: string;
    timeframe: string;
    currentPrice: string;
    signal: 'BUY' | 'SELL';
    confidence: string;
    summary: string;
    reasoning: string;
    suggestion: string;
    entryPrice: string;
    stopLoss: string;
    takeProfit1: string;
    takeProfit2: string;
    takeProfit3: string;
  }
) {
  if (chartAnalysisResultCache.size >= CHART_CACHE_MAX) {
    const first = chartAnalysisResultCache.keys().next().value;
    if (first) chartAnalysisResultCache.delete(first);
  }
  chartAnalysisResultCache.set(cacheKeyForChart(base64Data, tradeMode), { data });
}

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

FIXED ANALYSIS PROTOCOL (mandatory — follow the SAME steps in the SAME order every time. Do not skip steps, do not reorder, do not "reinterpret creatively"):
1) **Visible structure only:** List the most recent **swing high** and **swing low** (or clearest S/R) using prices actually printed on the chart or inferable from the last clear swing before the right edge. Use the chart's time axis — last closed candles visible, not future bars.
2) **Trend class (objective):** Uptrend = higher swing lows AND higher swing highs in the visible window; downtrend = lower swing highs AND lower swing lows; range = neither condition clearly holds. State this explicitly in "reasoning".
3) **Signal rule (apply exactly):** 
   - If **uptrend** and price is **not** showing a fresh breakdown below the last important swing low → **signal "BUY"** (with-trend or pullback in trend).
   - If **downtrend** and price is **not** showing a clear reclaim above the last important swing high → **signal "SELL"**.
   - If **range**, choose the side of the **nearest** rejected boundary: bounce up from lower range → **BUY**; rejection down from upper range → **SELL**. If exactly mid-range, pick the side of the **smallest** distance to a clear boundary in the direction of the last 2–3 candle **close** direction (higher closes → BUY, lower closes → SELL).
4) **"signal" must be ONLY "BUY" or "SELL"** — never "NEUTRAL" (if unsure, still pick BUY or SELL using step 3).
5) **Reproducibility (critical):** The **identical** chart image (same pixels: no new candle, no new tick, no zoom change) must yield the **same** "signal" and **the same** entryPrice, stopLoss, takeProfit1 (round prices consistently to the chart's precision: indices/metals often 2–5 dp as shown). **Only** change the output if visible price **structure** changes (e.g. new candle breaks a swing, new high/low, clear S/R break). Do not randomize, hedge, or vary the trade direction for stylistic variety.

APPROACH - After the protocol, write observations for "reasoning" (4–6 unique sentences) tied to steps 1–3.

chartDetected rules (critical — be strict: do NOT "invent" a chart):
- Set "chartDetected": true ONLY if the image shows a real **trading price chart**: visible candlesticks, bars (OHLC), or a time-series price/line/area on a time axis, in a context such as MetaTrader / MT4 / MT5 / web terminal / cTrader / TradingView / broker webtrader — including when side toolbars, watchlists, or account bars are visible.
- Set "chartDetected": false if there is no such chart: photos of people or nature, memes, food, games, social/chat apps, generic phone screenshots, Word/PDF/Excel (unless a small embedded chart is the clear subject), login-only or settings screens with no chart pane, or any image where you cannot read actual price action from a trading platform.
- Do NOT set true for pure indicators without price candles/bars, or a single number with no chart area.
- If you see candles, wicks, grid, price scale, Bid/Ask, or a symbol title next to a chart area — that is a chart: set true and read levels.
- If unsure, prefer "chartDetected": false rather than guessing levels from a non-trading image.

SYMBOL (critical for automated trading — read from the image, do not guess):
- Set "symbol" to the EXACT instrument code as shown on THIS chart: title bar, Market Watch line, order panel, or corner label (e.g. USTECH, EURUSD, XAUUSD, BTCUSD, US100, GER40, NAS100.i, EURUSD.r).
- Copy spelling, dots, suffixes, and case EXACTLY as the platform displays (brokers differ: .i .m .pro # mini micro).
- If the chart window shows one primary symbol, use that only — not a watchlist of other pairs.
- If the symbol text is unreadable or not visible, use "" for symbol (never invent a ticker from the asset class alone).

OBSERVATIONS (for "reasoning" field - write 4-6 unique sentences, aligned with the FIXED PROTOCOL above):
- Cite the swing high/low (or S/R) from step 1 with numbers; state trend from step 2; explain why step 3 produced BUY or SELL.
- Name specific SUPPORT and RESISTANCE (use price scale numbers)
- Note any CANDLE PATTERNS if relevant
- If indicators are visible, mention briefly
- Reiterate: same chart → same read unless structure on the image changes

Do NOT repeat "Chart analysis completed" or generic phrases. Do NOT just list Entry/SL/TP without tying to the protocol.

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
- **Reward:risk:** Prefer at least **~2:1** potential profit vs risk (further is fine). Place SL at a real invalidation; TP should warrant taking the risk.
- **confidence:** Set **"high"** or **"medium"** only when trend/S/R and signal align. Set **"low"** for choppy, unclear, or conflicting structure — the app will **not** auto-execute on **low** confidence (user can still trade manually from your levels).

LEVELS: entryPrice, stopLoss, takeProfit1 as numbers from chart. Never leave SL or TP empty.

Output JSON only (symbol must be the literal ticker string from the chart UI, or ""):
{"chartDetected":true,"symbol":"EXACT_TICKER_OR_EMPTY","timeframe":"X","currentPrice":"X","signal":"BUY"|"SELL","confidence":"high"|"medium"|"low","summary":"One sentence on the key setup","reasoning":"4-6 sentences: your observations - trend, S/R, patterns, indicators, conclusion","suggestion":"2-3 sentences of strategic advice - timing, execution, risk","entryPrice":"number","stopLoss":"number","takeProfit1":"number","takeProfit2":"","takeProfit3":""}`;

/** Second pass for large images only — re-check without forcing a positive (avoids classifying memes/photos as charts). */
const CHART_RETRY_PROMPT = `The first pass may have misclassified this image. Look again with fresh eyes.

Set "chartDetected" to true ONLY if you clearly see a trading price chart: candlesticks, OHLC bars, or a time-based price/line/area series on a platform such as MetaTrader, TradingView, cTrader, or another broker terminal.

Set "chartDetected" to false if this is: a person/selfie, scene/food/meme, game, chat/social app, document, or any screen with no real price chart area. Do not invent a chart.

If and only if chartDetected is true, use the same FIXED ANALYSIS PROTOCOL, output BUY or SELL (never NEUTRAL), and the same JSON fields as before. If chartDetected is false, still output valid JSON with "chartDetected":false and minimal placeholder strings for other fields if required.`;

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
    // Only accept chart if model explicitly said true (missing key → not a chart)
    const chartDet = chartDetMatch === 'true';
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

    const cached = cacheGetChart(base64Data, tradeMode);
    if (cached) {
      return Response.json(
        { message: 'accept' as const, data: { ...cached.data } },
        { status: 200, headers: { 'Content-Type': 'application/json' } }
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
        temperature: 0,
        topP: 0.1,
        topK: 1,
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

    const strictChartDetected = (v: unknown): boolean => v === true || v === 'true';
    let chartDetected = strictChartDetected(parsed.chartDetected);
    const MIN_BASE64_FOR_CHART_RETRY = 10_000;
    if (!chartDetected && base64Data.length >= MIN_BASE64_FOR_CHART_RETRY) {
      console.warn('analyze-chart: chartDetected false on substantial image, retrying with second-opinion prompt');
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
              chartDetected = strictChartDetected(parsed.chartDetected);
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

    // Force BUY or SELL only - convert NEUTRAL with deterministic structure keywords
    let signal = (asChartString(parsed.signal) || 'BUY').toUpperCase();
    if (signal === 'NEUTRAL') {
      const text = `${asChartString(parsed.reasoning)} ${asChartString(parsed.summary)}`.toLowerCase();
      const sellHints =
        /\b(sell|bearish|downtrend|lower high|resistance|rejection|breakdown|short)\b/.test(text);
      const buyHints =
        /\b(buy|bullish|uptrend|higher low|support|bounce|breakout|long)\b/.test(text);
      if (sellHints && !buyHints) signal = 'SELL';
      else if (buyHints && !sellHints) signal = 'BUY';
      else
        signal = text.includes('bearish') || text.includes('downtrend') || text.includes('sell') || text.includes('down') || text.includes('short') ? 'SELL' : 'BUY';
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
      const mult = getTakeProfitRiskMultiple(tradeMode);
      const tpDist = entryNum * pct * mult;
      const decimals = entryNum > 100 ? 2 : 5;
      const fmt = (n: number) => parseFloat(n.toFixed(decimals)).toString();
      if (!stopLoss) stopLoss = signal === 'BUY' ? fmt(entryNum - slDist) : fmt(entryNum + slDist);
      if (!takeProfit1) takeProfit1 = signal === 'BUY' ? fmt(entryNum + tpDist) : fmt(entryNum - tpDist);
    }

    // Enforce minimum reward:risk (improves expectancy vs tight model TPs)
    const eN = parseFloat(String(entryPrice).replace(/,/g, ''));
    const slN = parseFloat(String(stopLoss).replace(/,/g, ''));
    const tpN = parseFloat(String(takeProfit1).replace(/,/g, ''));
    if (eN && !isNaN(eN) && !isNaN(slN) && !isNaN(tpN) && (signal === 'BUY' || signal === 'SELL')) {
      takeProfit1 = ensureMinRewardRisk(
        signal as 'BUY' | 'SELL',
        eN,
        slN,
        tpN
      );
    }

    const symbolNormalized = normalizeSymbolFromChart(parsed.symbol);

    const responseData = {
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
    };
    cacheSetChart(base64Data, tradeMode, responseData);

    return Response.json(
      {
        message: 'accept',
        data: responseData,
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

/**
 * AI Chart Analysis API - Uses Google Gemini to analyze trading chart images
 * Requires GOOGLE_AI_API_KEY or GEMINI_API_KEY environment variable
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'] as const;
const GEMINI_TIMEOUT_MS = 20000; // Stay under Render timeout
const MAX_BASE64_BYTES = 1_000_000; // 1MB max to avoid 502

const CHART_ANALYSIS_PROMPT = `You are an expert technical analyst. Analyze this chart image. If it is NOT a trading chart, set "chartDetected":false.

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

LEVELS: entryPrice, stopLoss, takeProfit1 as numbers from chart. Never leave SL or TP empty.

Output JSON only:
{"chartDetected":true,"symbol":"X","timeframe":"X","currentPrice":"X","signal":"BUY"|"SELL","confidence":"high"|"medium"|"low","summary":"One sentence on the key setup","reasoning":"4-6 sentences: your observations - trend, S/R, patterns, indicators, conclusion","suggestion":"2-3 sentences of strategic advice - timing, execution, risk","entryPrice":"number","stopLoss":"number","takeProfit1":"number","takeProfit2":"","takeProfit3":""}`;

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
    const { image, mimeType = 'image/jpeg' } = body as { image?: string; mimeType?: string };

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
            { text: CHART_ANALYSIS_PROMPT },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.4,
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

    // Parse JSON from response (may be wrapped in markdown, have extra text)
    let parsed: Record<string, string | boolean>;
    try {
      let cleaned = text
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      const braceMatch = cleaned.match(/\{[\s\S]*\}/);
      if (braceMatch) cleaned = braceMatch[0];
      cleaned = cleaned.replace(/^\uFEFF/, '').replace(/,(\s*[}\]])/g, '$1');
      parsed = JSON.parse(cleaned) as Record<string, string>;
    } catch (parseErr) {
      console.warn('JSON parse failed, using regex fallback:', parseErr);
      console.warn('Raw response (first 500 chars):', text.slice(0, 500));
      // Fallback: extract fields via regex when JSON is malformed
      const extract = (key: string): string => {
        const quoted = text.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`, 'i'));
        if (quoted?.[1]) return quoted[1].trim();
        const unquoted = text.match(new RegExp(`"${key}"\\s*:\\s*([^,}\\s"\\[\\]]+)`, 'i'));
        if (unquoted?.[1]) return String(unquoted[1].trim());
        return '';
      };
      const chartDetMatch = text.match(/"chartDetected"\s*:\s*(true|false)/i)?.[1]?.toLowerCase();
      const chartDet = chartDetMatch !== 'false'; // default true if not found (backward compat)
      const sig = text.match(/"signal"\s*:\s*"(BUY|SELL|NEUTRAL)"/i)?.[1]?.toUpperCase() || 'NEUTRAL';
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

    const chartDetected = parsed.chartDetected !== false;
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
    let signal = (parsed.signal || 'BUY').toUpperCase();
    if (signal === 'NEUTRAL') {
      const text = `${parsed.reasoning || ''} ${parsed.summary || ''}`.toLowerCase();
      signal = text.includes('bearish') || text.includes('sell') || text.includes('down') || text.includes('short') ? 'SELL' : 'BUY';
    }

    let currentPrice = parsed.currentPrice || '';
    let entryPrice = parsed.entryPrice || currentPrice;
    let stopLoss = parsed.stopLoss || '';
    let takeProfit1 = parsed.takeProfit1 || '';
    const suggestion = parsed.suggestion || '';

    // Fallback: extract prices from suggestion text (e.g. "Enter at 1.0850, SL at 1.0800, TP at 1.0920")
    if ((!entryPrice || !stopLoss || !takeProfit1) && suggestion) {
      const enterMatch = suggestion.match(/(?:enter|entry)\s*(?:at|:)?\s*([\d.,]+)/i) || suggestion.match(/([\d.,]+)\s*(?:for\s+)?(?:entry|enter)/i);
      const slMatch = suggestion.match(/(?:sl|stop\s*loss)\s*(?:at|:)?\s*([\d.,]+)/i) || suggestion.match(/([\d.,]+)\s*(?:for\s+)?(?:sl|stop)/i);
      const tpMatch = suggestion.match(/(?:tp|take\s*profit)\s*(?:at|:)?\s*([\d.,]+)/i) || suggestion.match(/([\d.,]+)\s*(?:for\s+)?(?:tp|target)/i);
      if (!entryPrice && enterMatch?.[1]) entryPrice = enterMatch[1].trim();
      if (!stopLoss && slMatch?.[1]) stopLoss = slMatch[1].trim();
      if (!takeProfit1 && tpMatch?.[1]) takeProfit1 = tpMatch[1].trim();
    }

    // Fallback: compute SL/TP from entry when AI returns empty (0.5% SL, 1% TP)
    const entryNum = parseFloat(String(entryPrice).replace(/,/g, ''));
    if (entryNum && !isNaN(entryNum) && (!stopLoss || !takeProfit1)) {
      const pct = 0.005; // 0.5% SL, 1% TP
      const slDist = entryNum * pct;
      const tpDist = entryNum * (pct * 2);
      const decimals = entryNum > 100 ? 2 : 5;
      const fmt = (n: number) => parseFloat(n.toFixed(decimals)).toString();
      if (!stopLoss) stopLoss = signal === 'BUY' ? fmt(entryNum - slDist) : fmt(entryNum + slDist);
      if (!takeProfit1) takeProfit1 = signal === 'BUY' ? fmt(entryNum + tpDist) : fmt(entryNum - tpDist);
    }

    return Response.json(
      {
        message: 'accept',
        data: {
          symbol: parsed.symbol || '',
          timeframe: parsed.timeframe || '',
          currentPrice,
          signal: signal as 'BUY' | 'SELL',
          confidence: parsed.confidence || 'low',
          summary: parsed.summary || '',
          reasoning: (() => {
            const r = (parsed.reasoning || '').replace(/chart analysis completed\.?/gi, '').trim();
            const summary = (parsed.summary || '').trim();
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
          takeProfit2: parsed.takeProfit2 || '',
          takeProfit3: parsed.takeProfit3 || '',
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

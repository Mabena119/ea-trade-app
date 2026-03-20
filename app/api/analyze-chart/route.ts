/**
 * AI Chart Analysis API - Uses Google Gemini to analyze trading chart images
 * Requires GOOGLE_AI_API_KEY or GEMINI_API_KEY environment variable
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'] as const;
const GEMINI_TIMEOUT_MS = 20000; // Stay under Render timeout
const MAX_BASE64_BYTES = 1_000_000; // 1MB max to avoid 502

const CHART_ANALYSIS_PROMPT = `You are an institutional technical analyst. Analyze ONLY real trading charts (candlestick/bar/line from MetaTrader, TradingView). If NOT a chart, set "chartDetected":false.

STEP 1 - Read from the chart image: Look at the price scale (Y-axis) and the chart header. Extract: symbol (e.g. EURUSD), timeframe (e.g. H1, D1), currentPrice (last candle close or visible price). These MUST come from the image.

STEP 2 - Identify levels: From the price scale, identify: entry (current or last close), stopLoss (nearest support for BUY or resistance for SELL), takeProfit1 (first target). Write exact numbers like "1.0850" or "2650.50".

STEP 3 - Analysis: Write 2-4 sentences on RSI, MACD, moving averages, support/resistance, trend. Explain why BUY or SELL.

STEP 4 - Output this exact JSON (all fields required, no empty strings for prices):
{"chartDetected":true,"symbol":"X","timeframe":"X","currentPrice":"X","signal":"BUY"|"SELL","confidence":"high"|"medium"|"low","summary":"1-2 sentences","reasoning":"2-4 sentences with indicators and levels","suggestion":"Enter at X, SL at Y, TP at Z","entryPrice":"number","stopLoss":"number","takeProfit1":"number","takeProfit2":"","takeProfit3":""}

RULES: signal is BUY or SELL only. entryPrice, stopLoss, takeProfit1 MUST be numbers from the chart scale. reasoning and suggestion MUST NOT be empty. If chartDetected is false, use minimal fields.`;

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
        temperature: 0.2,
        maxOutputTokens: 1536,
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
          reasoning: parsed.reasoning || parsed.summary || 'Technical analysis based on chart patterns and indicators.',
          suggestion: suggestion || 'Review entry, stop loss, and take profit levels above.',
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

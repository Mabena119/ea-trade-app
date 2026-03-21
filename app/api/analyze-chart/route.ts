/**
 * AI Chart Analysis API - Uses Google Gemini to analyze trading chart images
 * Requires GOOGLE_AI_API_KEY or GEMINI_API_KEY environment variable
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'] as const;
const GEMINI_TIMEOUT_MS = 20000; // Stay under Render timeout
const MAX_BASE64_BYTES = 1_000_000; // 1MB max to avoid 502

const CHART_ANALYSIS_PROMPT = `You are a professional technical analyst. Analyze ONLY real trading charts. If NOT a chart, set "chartDetected":false.

CRITICAL - You MUST provide ALL of these with real values. Never leave stopLoss or takeProfit1 empty.

1. READ THE CHART: symbol, timeframe, currentPrice from the image header and price scale (Y-axis).

2. CALCULATE LEVELS - Use the visible price scale on the chart:
   - entryPrice: current price or last candle close
   - stopLoss: For BUY = nearest support level BELOW entry (or entry minus 0.3-0.5%). For SELL = nearest resistance ABOVE entry (or entry plus 0.3-0.5%)
   - takeProfit1: For BUY = first resistance ABOVE entry (or entry plus 0.5-1%). For SELL = first support BELOW entry (or entry minus 0.5-1%)
   Use exact numbers from the chart scale (e.g. 1.0850, 44900, 2650.50). If no clear level, use 0.5% from entry for SL and 1% for TP.

3. REASONING: Write 3-5 sentences describing YOUR OBSERVATIONS: trend direction, key support/resistance, indicator readings (RSI, MACD, MAs if visible), chart patterns, and WHY you chose BUY or SELL. Do NOT write "Chart analysis completed" - write actual technical analysis.

4. SUGGESTION: Write specific actionable advice. Example: "Enter at 44900, place stop loss at 45050, take profit at 44700. Consider partial close at 50% of target." Include the exact price levels. Do NOT write generic text like "Review levels above."

Output JSON only:
{"chartDetected":true,"symbol":"X","timeframe":"X","currentPrice":"X","signal":"BUY"|"SELL","confidence":"high"|"medium"|"low","summary":"1-2 sentences on key pattern","reasoning":"3-5 sentences of technical analysis - indicators, levels, trend","suggestion":"Specific advice with Entry X, SL Y, TP Z","entryPrice":"number","stopLoss":"number","takeProfit1":"number","takeProfit2":"","takeProfit3":""}

FORBIDDEN: "Chart analysis completed", "Review levels above", empty stopLoss, empty takeProfit1.`;

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
          reasoning: (parsed.reasoning || parsed.summary || '').replace(/chart analysis completed\.?/gi, '').trim() ||
            `Technical analysis indicates ${signal} signal. Consider trend, support/resistance, and risk/reward. Entry ${entryPrice}, SL ${stopLoss}, TP ${takeProfit1}.`,
          suggestion: (suggestion || '').replace(/review.*levels above\.?/gi, '').trim() ||
            `Place ${signal} order at ${entryPrice}. Stop loss: ${stopLoss}. Take profit: ${takeProfit1}. Use proper position sizing.`,
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

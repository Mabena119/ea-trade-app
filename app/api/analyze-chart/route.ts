/**
 * AI Chart Analysis API - Uses Google Gemini to analyze trading chart images
 * Requires GOOGLE_AI_API_KEY or GEMINI_API_KEY environment variable
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'] as const;
const GEMINI_TIMEOUT_MS = 20000; // Stay under Render timeout
const MAX_BASE64_BYTES = 1_000_000; // 1MB max to avoid 502

const CHART_ANALYSIS_PROMPT = `You are an institutional-grade technical analyst. ONLY analyze if the image shows a real trading chart (candlestick, bar, or line chart from MetaTrader, TradingView, or similar). If NOT a trading chart, set "chartDetected":false.

Required format:
{"chartDetected":true|false,"symbol":"e.g. EURUSD, XAUUSD","timeframe":"e.g. M1, H1, D1","currentPrice":"last visible price","signal":"BUY"|"SELL","confidence":"high"|"medium"|"low","summary":"1-2 sentences on key patterns","reasoning":"2-4 sentences: describe RSI, MACD, moving averages, support/resistance, trend. Explain what led to your signal.","suggestion":"Specific actionable advice (e.g. Enter at X, SL at Y, TP at Z)","entryPrice":"","stopLoss":"","takeProfit1":"","takeProfit2":"","takeProfit3":""}

CRITICAL RULES when chartDetected is true:
1. signal MUST be "BUY" or "SELL" only. Never "NEUTRAL". Pick the direction with more technical evidence.
2. entryPrice, stopLoss, takeProfit1 MUST be filled with actual numbers from the chart. Use current price or last candle close for entry. Use support/resistance for SL and TP. Never leave empty.
3. reasoning MUST be 2-4 substantive sentences. Mention specific indicators and levels.
4. suggestion MUST be specific actionable advice with price levels.

Apply multi-indicator confluence: RSI, MACD, MAs, S/R, trend. Extract symbol, timeframe, currentPrice from chart header. Extract entry, SL, TP from price scale.

When chartDetected is false: Set chartDetected:false, symbol:"", timeframe:"", currentPrice:"", signal:"SELL", and brief summary.`;

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
        maxOutputTokens: 1024,
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
        const re = new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`, 'i');
        const m = text.match(re);
        return m ? m[1].trim() : '';
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

    const currentPrice = parsed.currentPrice || '';
    const entryPrice = parsed.entryPrice || currentPrice;
    const stopLoss = parsed.stopLoss || '';
    const takeProfit1 = parsed.takeProfit1 || '';

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
          reasoning: parsed.reasoning || '',
          suggestion: parsed.suggestion || '',
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

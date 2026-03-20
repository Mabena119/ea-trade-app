/**
 * AI Chart Analysis API - Uses Google Gemini to analyze trading chart images
 * Requires GOOGLE_AI_API_KEY or GEMINI_API_KEY environment variable
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'gemini-2.5-flash'; // Stable vision-capable model
const GEMINI_TIMEOUT_MS = 45000; // Under Render's typical 50s limit

const CHART_ANALYSIS_PROMPT = `You are an expert technical analyst. Analyze this trading chart image and provide a clear, concise recommendation.

Respond in this exact JSON format only (no other text):
{
  "signal": "BUY" | "SELL" | "NEUTRAL",
  "confidence": "high" | "medium" | "low",
  "summary": "1-2 sentence summary of key chart patterns and indicators",
  "reasoning": "Brief technical reasoning (support/resistance, trend, momentum, etc.)",
  "suggestion": "Specific actionable advice (e.g., 'Wait for pullback to support', 'Consider taking profit at resistance')"
}

If the image is not a trading/financial chart, or you cannot analyze it, return:
{
  "signal": "NEUTRAL",
  "confidence": "low",
  "summary": "Unable to analyze - please upload a clear trading chart image.",
  "reasoning": "Image may not be a valid trading chart.",
  "suggestion": "Upload a screenshot of your trading platform chart (candlestick, line, or bar chart)."
}`;

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

    // Limit size to avoid timeouts (base64 ~1.33x raw size; 3MB raw ≈ 4MB base64)
    if (base64Data.length > 5_000_000) {
      return Response.json(
        { message: 'error', error: 'Image too large. Please use a smaller chart screenshot.' },
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
        temperature: 0.3,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(
        `${GEMINI_API_BASE}/models/${MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiPayload),
          signal: controller.signal,
        }
      );
    } catch (fetchErr: unknown) {
      clearTimeout(timeoutId);
      const msg = fetchErr instanceof Error ? fetchErr.message : 'Unknown error';
      console.error('Gemini fetch error:', msg);
      const isTimeout = msg.includes('abort') || msg.includes('timeout');
      return Response.json(
        {
          message: 'error',
          error: isTimeout
            ? 'Request timed out. Try a smaller image.'
            : 'AI service unavailable. Please try again.',
        },
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      console.error('Gemini API error:', res.status, errText.slice(0, 500));
      // Surface sanitized hint for common issues (no API key in response)
      let hint = 'Please try again.';
      if (res.status === 401 || res.status === 403) hint = 'Check API key in Render Environment.';
      if (res.status === 404) hint = 'Model may have changed.';
      return Response.json(
        {
          message: 'error',
          error: `AI analysis failed. ${hint}`,
        },
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

    // Parse JSON from response (may be wrapped in markdown code blocks)
    let parsed: Record<string, string>;
    try {
      const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleaned) as Record<string, string>;
    } catch {
      return Response.json(
        {
          message: 'error',
          error: 'Invalid AI response format',
          raw: text.slice(0, 200),
        },
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return Response.json(
      {
        message: 'accept',
        data: {
          signal: parsed.signal || 'NEUTRAL',
          confidence: parsed.confidence || 'low',
          summary: parsed.summary || '',
          reasoning: parsed.reasoning || '',
          suggestion: parsed.suggestion || '',
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

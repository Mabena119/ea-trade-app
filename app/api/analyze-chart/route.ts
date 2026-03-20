/**
 * AI Chart Analysis API - Uses Google Gemini to analyze trading chart images
 * Requires GOOGLE_AI_API_KEY or GEMINI_API_KEY environment variable
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODELS = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'] as const;
const GEMINI_TIMEOUT_MS = 25000; // Stay under Render timeout
const MAX_BASE64_BYTES = 1_500_000; // ~1.1MB image to avoid 502 with large body

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
        temperature: 0.3,
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

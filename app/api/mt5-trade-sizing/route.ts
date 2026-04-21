/**
 * AI-assisted MT5 lot size + number of trades per symbol from equity/balance.
 * Uses Gemini (same env as analyze-chart). Text-only JSON output.
 */

import { formatAutoSizedLotString } from '@/utils/equity-trade-preset';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'] as const;
const GEMINI_TIMEOUT_MS = 20000;

const SIZING_PROMPT = `You are a conservative retail MT5 risk assistant.

You receive JSON with:
- equity: account equity (string, may include commas)
- balance: optional account balance
- symbols: array of { "symbol": string, "instrumentClass": string } where instrumentClass is one of: forex, metal, index, crypto, commodity, other

Task: For EACH input symbol, recommend:
- lotSize: string, minimum "0.00001", at most five decimal places (e.g. "0.03", "0.00005", "0.00125")
- numberOfTrades: string integer, minimum "1", maximum "15"

Rules:
1) Scale with equity: higher equity allows modestly more risk; never aggressive or institutional sizing.
2) Volatility: index and crypto are highest — use SMALLER lot per trade. Metals and commodities are medium. Forex majors/crosses are typically lower volatility — can use larger per-trade lot than indices for the same equity.
3) Lot vs trades: when you choose a LOWER lot per trade for a volatile instrument, you MAY INCREASE numberOfTrades so total workflow stays useful (several smaller legs). Do NOT cap trades at 2 — use equity and volatility to choose a dynamic count up to 15.
4) Keep total exposure retail-safe: prefer many small trades over one huge lot.
5) Output one row per input symbol; "symbol" must match the input exactly (same spelling/case).

Return ONLY valid JSON, no markdown:
{"symbols":[{"symbol":"EURUSD","lotSize":"0.03","numberOfTrades":"2"},{"symbol":"XAUUSD","lotSize":"0.01","numberOfTrades":"4"}]}`;

function parseSizingResponse(rawText: string): { symbol: string; lotSize: string; numberOfTrades: string }[] {
  let cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const braceMatch = cleaned.match(/\{[\s\S]*\}/);
  if (braceMatch) cleaned = braceMatch[0];
  cleaned = cleaned.replace(/^\uFEFF/, '').replace(/,(\s*[}\]])/g, '$1');
  const parsed = JSON.parse(cleaned) as { symbols?: unknown };
  const rows = parsed.symbols;
  if (!Array.isArray(rows)) return [];
  const out: { symbol: string; lotSize: string; numberOfTrades: string }[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const symbol = typeof r.symbol === 'string' ? r.symbol.trim() : '';
    const lotSize = typeof r.lotSize === 'string' ? r.lotSize.trim() : String(r.lotSize ?? '');
    const numberOfTrades =
      typeof r.numberOfTrades === 'string' ? r.numberOfTrades.trim() : String(r.numberOfTrades ?? '');
    if (!symbol) continue;
    out.push({ symbol, lotSize, numberOfTrades });
  }
  return out;
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return Response.json(
      {
        message: 'error',
        error: 'AI sizing not configured. Set GOOGLE_AI_API_KEY in environment.',
      },
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json();
    const { equity, balance, symbols } = body as {
      equity?: string;
      balance?: string;
      symbols?: { symbol: string; instrumentClass: string }[];
    };

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return Response.json(
        { message: 'error', error: 'symbols array is required' },
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const payloadText = JSON.stringify(
      { equity: equity ?? '', balance: balance ?? '', symbols },
      null,
      0
    );

    const geminiPayload = {
      contents: [{ parts: [{ text: `${SIZING_PROMPT}\n\nINPUT:\n${payloadText}` }] }],
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
        res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiPayload),
          signal: controller.signal,
        });
        if (res.ok) {
          clearTimeout(timeoutId);
          break;
        }
        lastErr = await res.text();
        if (res.status === 404) continue;
        clearTimeout(timeoutId);
        return Response.json(
          { message: 'error', error: 'AI sizing failed. Try again.' },
          { status: 502, headers: { 'Content-Type': 'application/json' } }
        );
      } catch (fetchErr: unknown) {
        if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
          clearTimeout(timeoutId);
          return Response.json(
            { message: 'error', error: 'Request timed out.' },
            { status: 502, headers: { 'Content-Type': 'application/json' } }
          );
        }
        lastErr = fetchErr instanceof Error ? fetchErr.message : 'Unknown';
      }
    }
    clearTimeout(timeoutId);

    if (!res?.ok) {
      console.error('mt5-trade-sizing Gemini failed:', lastErr?.slice(0, 300));
      return Response.json(
        { message: 'error', error: 'AI sizing failed.' },
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    if (!text) {
      return Response.json(
        { message: 'error', error: 'Empty AI response' },
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let rows: { symbol: string; lotSize: string; numberOfTrades: string }[];
    try {
      rows = parseSizingResponse(text);
    } catch (e) {
      console.warn('mt5-trade-sizing JSON parse failed:', e);
      return Response.json(
        { message: 'error', error: 'Invalid AI response' },
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const normalizeTrades = (s: string): string => {
      const n = parseInt(String(s).replace(/\D/g, ''), 10);
      if (!Number.isFinite(n) || n < 1) return '1';
      return String(Math.min(15, n));
    };

    rows = rows.map((r) => ({
      symbol: r.symbol,
      lotSize: formatAutoSizedLotString(r.lotSize),
      numberOfTrades: normalizeTrades(r.numberOfTrades),
    }));

    return Response.json(
      { message: 'accept', data: rows },
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('mt5-trade-sizing error:', error);
    return Response.json(
      { message: 'error', error: 'Sizing failed.' },
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function GET(): Promise<Response> {
  return Response.json({ message: 'Use POST with equity and symbols' }, { status: 405 });
}

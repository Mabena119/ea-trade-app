import { getOzowConfigFromEnv, requestOzowPaymentUrl } from '@/utils/ozow-checkout';

/**
 * POST /api/ozow-checkout
 * Body: { email?: string }
 * Returns { url: string } for AI Scanner unlock (Ozow instant EFT).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const config = getOzowConfigFromEnv();
    if (!config) {
      return Response.json(
        { error: 'Ozow payment is not configured on the server' },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const email =
      typeof body?.email === 'string' ? body.email.trim().toLowerCase() : undefined;

    const result = await requestOzowPaymentUrl(config, { email });
    if ('error' in result) {
      console.error('ozow-checkout:', result.error);
      return Response.json({ error: result.error }, { status: 502 });
    }

    return Response.json({ url: result.url }, { status: 200 });
  } catch (error) {
    console.error('ozow-checkout error:', error);
    return Response.json({ error: 'Failed to start Ozow checkout' }, { status: 500 });
  }
}

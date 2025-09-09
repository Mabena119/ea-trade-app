import { getPool } from '@/app/api/_db';

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const phoneSecret = (url.searchParams.get('phone_secret') || '').toString().trim();
    if (!phoneSecret) return Response.json({ message: 'error' }, { status: 200 });

    const pool = await getPool();
    const conn = await pool.getConnection();
    try {
      // Ensure license exists for provided phone secret
      const [licRows] = await conn.execute(
        'SELECT ea, expires FROM licences WHERE phone_secret_code = ? LIMIT 1',
        [phoneSecret]
      );
      const lic = Array.isArray(licRows) && licRows.length > 0 ? (licRows[0] as any) : null;
      if (!lic) return Response.json({ message: 'error' }, { status: 200 });

      // Optional: mark expired if needed (match PHP status() behavior)
      if (lic.expires && !isNaN(Date.parse(lic.expires))) {
        const expired = Date.now() > Date.parse(lic.expires);
        if (expired) {
          await conn.execute('UPDATE licences SET status = ? WHERE phone_secret_code = ?', ['Expired', phoneSecret]);
        }
      }

      // Pull symbols for the EA
      const [symRows] = await conn.execute('SELECT id, name FROM symbols WHERE ea = ? ORDER BY name ASC', [lic.ea]);
      const data = Array.isArray(symRows)
        ? symRows.map((r: any) => ({ id: String(r.id), name: String(r.name) }))
        : [];

      return Response.json({ message: 'accept', data }, { status: 200 });
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('symbols error:', error);
    return Response.json({ message: 'error' }, { status: 200 });
  }
}

export async function POST(): Promise<Response> {
  return Response.json({ message: 'error' }, { status: 405 });
}



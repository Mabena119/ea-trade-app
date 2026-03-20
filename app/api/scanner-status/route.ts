import { getPool } from '@/app/api/_db';

/**
 * GET /api/scanner-status?email=xxx
 * Returns { scanner: boolean } based on members.scanner column.
 * If scanner column missing or email not found, returns scanner: false.
 */
export async function GET(request: Request): Promise<Response> {
  let conn = null;
  try {
    const url = new URL(request.url);
    const email = (url.searchParams.get('email') || '').trim().toLowerCase();
    if (!email) {
      return Response.json({ scanner: false }, { status: 200 });
    }
    const pool = await getPool();
    conn = await pool.getConnection();
    const [rows] = await conn.execute(
      'SELECT scanner FROM members WHERE email = ? LIMIT 1',
      [email]
    );
    const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as { scanner?: number | boolean }) : null;
    const scanner = row ? Boolean(Number(row.scanner ?? 0)) : false;
    return Response.json({ scanner }, { status: 200 });
  } catch (error) {
    console.error('scanner-status error:', error);
    return Response.json({ scanner: false }, { status: 200 });
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch (e) {
        console.error('Failed to release connection:', e);
      }
    }
  }
}

export async function POST(): Promise<Response> {
  return Response.json({ error: 'Use GET with email param' }, { status: 405 });
}

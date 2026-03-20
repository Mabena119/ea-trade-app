import { getPool } from '@/app/api/_db';

const MAX_UPLOADS = 5;

/**
 * GET /api/scanner-status?email=xxx
 * Returns { scanner, uploadsUsed, remaining }.
 * scanner: unlocked status. When uploadsUsed reaches 5, scanner is reset to 0.
 */
export async function GET(request: Request): Promise<Response> {
  let conn = null;
  try {
    const url = new URL(request.url);
    const email = (url.searchParams.get('email') || '').trim().toLowerCase();
    if (!email) {
      return Response.json({ scanner: false, uploadsUsed: 0, remaining: 0 }, { status: 200 });
    }
    const pool = await getPool();
    conn = await pool.getConnection();
    const [rows] = await conn.execute(
      'SELECT scanner, IFNULL(scanner_uploads_used, 0) AS uploads_used FROM members WHERE email = ? LIMIT 1',
      [email]
    );
    const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as { scanner?: number; uploads_used?: number }) : null;
    const scanner = row ? Boolean(Number(row.scanner ?? 0)) : false;
    const uploadsUsed = row ? Math.min(Number(row.uploads_used ?? 0), MAX_UPLOADS) : 0;
    const remaining = scanner ? Math.max(0, MAX_UPLOADS - uploadsUsed) : 0;
    return Response.json({ scanner, uploadsUsed, remaining }, { status: 200 });
  } catch (error) {
    console.error('scanner-status error:', error);
    return Response.json({ scanner: false, uploadsUsed: 0, remaining: 0 }, { status: 200 });
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

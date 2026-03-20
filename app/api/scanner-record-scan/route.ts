import { getPool } from '@/app/api/_db';

const MAX_UPLOADS = 5;

/**
 * POST /api/scanner-record-scan
 * Body: { email: string }
 * Increments scanner_uploads_used. When it reaches 5, sets scanner=0.
 */
export async function POST(request: Request): Promise<Response> {
  let conn = null;
  try {
    const body = await request.json().catch(() => ({}));
    const email = (body?.email || '').trim().toLowerCase();
    if (!email) {
      return Response.json({ message: 'error', error: 'Email required' }, { status: 400 });
    }
    const pool = await getPool();
    conn = await pool.getConnection();

    const [rows] = await conn.execute(
      'SELECT scanner, COALESCE(scanner_uploads_used, 0) AS uploads_used FROM members WHERE email = ? LIMIT 1',
      [email]
    );
    const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as { scanner?: number; uploads_used?: number }) : null;
    if (!row) {
      return Response.json({ message: 'error', error: 'Member not found' }, { status: 404 });
    }
    const scanner = Boolean(Number(row.scanner ?? 0));
    const uploadsUsed = Math.min(Number(row.uploads_used ?? 0), MAX_UPLOADS);

    if (!scanner) {
      return Response.json({ message: 'error', error: 'Scanner not unlocked' }, { status: 403 });
    }

    const newCount = uploadsUsed + 1;
    if (newCount >= MAX_UPLOADS) {
      await conn.execute(
        'UPDATE members SET scanner = 0, scanner_uploads_used = 0 WHERE email = ?',
        [email]
      );
      return Response.json({
        message: 'accept',
        uploadsUsed: MAX_UPLOADS,
        remaining: 0,
        limitReached: true,
      });
    }

    await conn.execute(
      'UPDATE members SET scanner_uploads_used = ? WHERE email = ?',
      [newCount, email]
    );
    return Response.json({
      message: 'accept',
      uploadsUsed: newCount,
      remaining: MAX_UPLOADS - newCount,
      limitReached: false,
    });
  } catch (error) {
    console.error('scanner-record-scan error:', error);
    return Response.json({ message: 'error', error: 'Failed to record scan' }, { status: 500 });
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

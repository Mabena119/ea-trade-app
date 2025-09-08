import mysql from 'mysql2/promise';

type CheckEmailResponse = {
  used: number;
  paid: number;
};

const DB_HOST = process.env.DB_HOST || '172.203.148.37.host.secureserver.net';
const DB_USER = process.env.DB_USER || 'eauser';
const DB_PASSWORD = process.env.DB_PASSWORD || 'snVO2i%fZSG%';
const DB_NAME = process.env.DB_NAME || 'eaconverter';
const DB_PORT = Number(process.env.DB_PORT || 3306);

let pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      port: DB_PORT,
      connectionLimit: 10,
      waitForConnections: true,
      queueLimit: 0,
    });
  }
  return pool;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const email = (body?.email as string | undefined)?.trim().toLowerCase();
    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute(
        'SELECT id, email, paid, sub_token, mentor, used FROM members WHERE email = ? LIMIT 1',
        [email]
      );

      const result = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;

      if (!result) {
        const payload: CheckEmailResponse = { used: 0, paid: 0 };
        return Response.json(payload);
      }

      let used: number = Number(result.used ?? 0);
      const paid: number = Number(result.paid ?? 0);

      if (used === 0) {
        // Mark as used but report 0 per original logic
        await conn.execute('UPDATE members SET used = 1 WHERE email = ?', [email]);
        used = 0;
      }

      const payload: CheckEmailResponse = { used, paid };
      return Response.json(payload);
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('check-email error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(): Promise<Response> {
  return Response.json({ ok: true });
}



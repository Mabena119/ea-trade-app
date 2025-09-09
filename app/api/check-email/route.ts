import mysql from 'mysql2/promise';

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
        const mentor = (body?.mentor as string | undefined)?.trim();
        if (!email) {
            return Response.json({ error: 'Email is required' }, { status: 400 });
        }

        const pool = getPool();
        const conn = await pool.getConnection();
        try {
            const [rows] = await conn.execute(
                'SELECT id, email, paid, used FROM members WHERE email = ? LIMIT 1',
                [email]
            );

            const result = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;

            if (!result) {
                return Response.json({ found: 0, used: 0, paid: 0 });
            }

            let used: number = Number(result.used ?? 0);
            const paid: number = Number(result.paid ?? 0);

            // If it's the user's first login (used=0), mark as used immediately
            if (used === 0) {
                await conn.execute('UPDATE members SET used = 1 WHERE email = ?', [email]);
                used = 0;
            }

            // Optionally validate mentor/pass if such column exists
            try {
                if (mentor && result.mentor_id != null) {
                    const ok = String(result.mentor_id).trim().toLowerCase() === mentor.toLowerCase();
                    if (!ok) {
                        return Response.json({ found: 1, used, paid, invalidMentor: 1 });
                    }
                }
            } catch {}

            return Response.json({ found: 1, used, paid });
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



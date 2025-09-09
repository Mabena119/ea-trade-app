// Use dynamic import to avoid TypeScript/node type issues in Expo linting
// and keep this file web-friendly while still running on the server.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MySQLModule = any;

// Prefer environment variables; support common provider aliases
const DB_HOST = process.env.DB_HOST || process.env.MYSQLHOST || process.env.MYSQL_HOST || 'localhost';
const DB_USER = process.env.DB_USER || process.env.MYSQLUSER || process.env.MYSQL_USER || '';
const DB_PASSWORD = process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || '';
const DB_PORT = Number(process.env.DB_PORT || process.env.MYSQLPORT || process.env.MYSQL_PORT || 3306);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pool: any | null = null;

async function getPool() {
    if (!pool) {
        // @ts-ignore - dynamic import; types may not be available in Expo lint context
        const mysql: MySQLModule = await import('mysql2/promise');
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
        const mentor = (body?.mentor as string | undefined)?.toString().trim();
        if (!email) {
            return Response.json({ error: 'Email is required' }, { status: 400 });
        }

        const pool = await getPool();
        const conn = await pool.getConnection();
        try {
            const [rows] = await conn.execute(
                'SELECT id, email, paid, used FROM members WHERE email = ? LIMIT 1',
                [email]
            );

            const result = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;

            if (!result) {
                return Response.json({ found: 0, used: 0, paid: 0, invalidMentor: 0 });
            }

            let used: number = Number(result.used ?? 0);
            const paid: number = Number(result.paid ?? 0);

            // If it's the user's first login (used=0), mark as used immediately
            if (used === 0) {
                await conn.execute('UPDATE members SET used = 1 WHERE email = ?', [email]);
                used = 0;
            }

            // Note: mentor validation not enforced currently; include flag for client compatibility
            const invalidMentor = 0;

            return Response.json({ found: 1, used, paid, invalidMentor });
        } finally {
            conn.release();
        }
    } catch (error) {
        console.error('check-email error:', error);
        // Graceful fallback: treat as not found/unpaid/unused so client can show payment
        return Response.json({ found: 0, used: 0, paid: 0, invalidMentor: 0 }, { status: 200 });
    }
}

export async function GET(): Promise<Response> {
    return Response.json({ ok: true });
}



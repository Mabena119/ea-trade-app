// @ts-ignore types may not resolve in Expo Router route context
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

export async function GET(request: Request): Promise<Response> {
    try {
        const url = new URL(request.url);
        const phoneSecret = (url.searchParams.get('phone_secret') || '').trim();
        if (!phoneSecret) return Response.json({ message: 'error' }, { status: 400 });

        const conn = await getPool().getConnection();
        try {
            const [rows] = await conn.execute(
                `SELECT s.id, s.name
         FROM symbols s
         INNER JOIN licenses l ON l.phone_secret_key = ?
         WHERE s.active = 1
         ORDER BY s.name ASC`,
                [phoneSecret]
            );

            const data = (Array.isArray(rows) ? rows : []).map((r: any) => ({ id: String(r.id), name: String(r.name) }));

            return Response.json({ message: data.length > 0 ? 'accept' : 'error', data });
        } finally {
            conn.release();
        }
    } catch (error) {
        console.error('symbols error:', error);
        return Response.json({ message: 'error' }, { status: 200 });
    }
}



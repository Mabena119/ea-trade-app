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
                `SELECT id, asset, action, price, tp, sl, time, latestupdate
         FROM signals
         WHERE phone_secret = ?
         ORDER BY latestupdate DESC
         LIMIT 1`,
                [phoneSecret]
            );

            const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;
            if (!row) return Response.json({ message: 'error' });

            return Response.json({
                message: 'accept', data: {
                    id: String(row.id),
                    asset: String(row.asset),
                    action: String(row.action),
                    price: String(row.price),
                    tp: String(row.tp),
                    sl: String(row.sl),
                    time: String(row.time),
                    latestupdate: String(row.latestupdate),
                }
            });
        } finally {
            conn.release();
        }
    } catch (error) {
        console.error('signals error:', error);
        return Response.json({ message: 'error' }, { status: 200 });
    }
}



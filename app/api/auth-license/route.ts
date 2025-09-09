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

export async function POST(request: Request): Promise<Response> {
    try {
        const body = await request.json().catch(() => ({}));
        const licence = (body?.licence as string | undefined)?.trim();
        const phoneSecret = (body?.phone_secret as string | undefined)?.trim();
        if (!licence) return Response.json({ message: 'error' }, { status: 400 });

        const conn = await getPool().getConnection();
        try {
            const params: any[] = [licence];
            let sql = `
        SELECT 
          l.user as user,
          l.status as status,
          l.expires as expires,
          l.key as ` + '`key`' + `,
          l.phone_secret_key as phone_secret_key,
          l.ea_name as ea_name,
          l.ea_notification as ea_notification,
          o.name as owner_name,
          o.email as owner_email,
          o.phone as owner_phone,
          o.logo as owner_logo
        FROM licenses l
        LEFT JOIN owners o ON l.owner_id = o.id
        WHERE l.key = ?
        LIMIT 1
      `;
            if (phoneSecret) {
                sql = sql.replace('LIMIT 1', 'AND l.phone_secret_key = ? LIMIT 1');
                params.push(phoneSecret);
            }

            const [rows] = await conn.execute(sql, params);
            const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;
            if (!row) return Response.json({ message: 'error' });

            const data = {
                user: row.user,
                status: row.status,
                expires: row.expires,
                key: row.key,
                phone_secret_key: row.phone_secret_key,
                ea_name: row.ea_name,
                ea_notification: row.ea_notification,
                owner: {
                    name: row.owner_name,
                    email: row.owner_email,
                    phone: row.owner_phone,
                    logo: row.owner_logo,
                },
            };

            // If status indicates used, respond accordingly
            if (String(row.status).toLowerCase() === 'used') {
                return Response.json({ message: 'used', data });
            }

            return Response.json({ message: 'accept', data });
        } finally {
            conn.release();
        }
    } catch (error) {
        console.error('auth-license error:', error);
        return Response.json({ message: 'error' }, { status: 200 });
    }
}

export async function GET(): Promise<Response> {
    return Response.json({ ok: true });
}



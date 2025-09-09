// License authentication API
// POST /api/auth-license
// Body: { licence: string, phone_secret?: string }

// Use dynamic import to avoid tooling type issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MySQLModule = any;

const DB_HOST = process.env.DB_HOST || '172.203.148.37.host.secureserver.net';
const DB_USER = process.env.DB_USER || 'eauser';
const DB_PASSWORD = process.env.DB_PASSWORD || 'snVO2i%fZSG%';
const DB_NAME = process.env.DB_NAME || 'eaconverter';
const DB_PORT = Number(process.env.DB_PORT || 3306);

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
    const body = await request.json().catch(() => ({} as any));
    const licenceRaw = (body?.licence ?? body?.license ?? '').toString();
    const licence = licenceRaw.trim();
    const phoneSecret = (body?.phone_secret as string | undefined)?.toString().trim();
    if (!licence) {
      return Response.json({ message: 'error' }, { status: 200 });
    }

    const pool = await getPool();
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute(
        `SELECT 
           l.user,
           l.status,
           l.expires,
           l.key,
           l.phone_secret_key,
           l.ea_name,
           l.ea_notification,
           o.name as owner_name,
           o.email as owner_email,
           o.phone as owner_phone,
           o.logo as owner_logo
         FROM licenses l
         LEFT JOIN owners o ON l.owner_id = o.id
         WHERE l.key = ?
         LIMIT 1`,
        [licence]
      );

      const result = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;

      if (!result) {
        return Response.json({ message: 'error' }, { status: 200 });
      }

      const statusValue = String(result.status ?? '').toLowerCase();
      const phoneSecretKey = result.phone_secret_key ?? '';

      if (statusValue === 'used' && (!phoneSecret || phoneSecret !== phoneSecretKey)) {
        return Response.json({ message: 'used' }, { status: 200 });
      }

      const data = {
        user: result.user ?? '',
        status: result.status ?? 'active',
        expires: result.expires ?? '',
        key: result.key ?? licence,
        phone_secret_key: result.phone_secret_key ?? '',
        ea_name: result.ea_name ?? 'EA CONVERTER',
        ea_notification: result.ea_notification ?? '',
        owner: {
          name: result.owner_name ?? 'EA CONVERTER',
          email: result.owner_email ?? 'support@ea-converter.com',
          phone: result.owner_phone ?? '',
          logo: result.owner_logo ?? '',
        },
      };

      return Response.json({ message: 'accept', data }, { status: 200 });
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('auth-license error:', error);
    // Fallback to generic error so client can show a friendly message
    return Response.json({ message: 'error' }, { status: 200 });
  }
}

export async function GET(): Promise<Response> {
  return Response.json({ ok: true });
}



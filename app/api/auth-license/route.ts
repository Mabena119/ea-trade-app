// License authentication API
// POST /api/auth-license
// Body: { licence: string, phone_secret?: string }

import crypto from 'crypto';
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

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
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
      // Fetch licence info
      const [licRows] = await conn.execute(
        `SELECT l.k_ey as key,
                l.status as status,
                l.expires as expires,
                l.phone_secret_code as phone_secret_code,
                l.ea as ea_id
         FROM licences l
         WHERE l.k_ey = ?
         LIMIT 1`,
        [licence]
      );

      const lic = Array.isArray(licRows) && licRows.length > 0 ? (licRows[0] as any) : null;
      if (!lic) {
        return Response.json({ message: 'error' }, { status: 200 });
      }

      const statusValue = String(lic.status ?? '').toLowerCase();
      const storedHash: string | null = lic.phone_secret_code ? String(lic.phone_secret_code) : null;

      // If already used and no matching phone secret provided, block with 'used'
      if (storedHash) {
        if (!phoneSecret || sha256Hex(phoneSecret) !== storedHash) {
          return Response.json({ message: 'used' }, { status: 200 });
        }
      } else {
        // Not yet bound to a phone secret; if provided, set it now
        if (phoneSecret && phoneSecret.length > 0) {
          const newHash = sha256Hex(phoneSecret);
          await conn.execute(
            'UPDATE licences SET phone_secret_code = ? WHERE k_ey = ?',
            [newHash, licence]
          );
        }
      }

      // Fetch EA info (name, owner)
      let eaName = 'EA CONVERTER';
      let ownerId: string | number | null = null;
      if (lic.ea_id != null) {
        const [eaRows] = await conn.execute(
          'SELECT name, owner FROM eas WHERE id = ? LIMIT 1',
          [lic.ea_id]
        );
        if (Array.isArray(eaRows) && eaRows.length > 0) {
          const ea = eaRows[0] as any;
          eaName = ea.name ?? eaName;
          ownerId = ea.owner ?? null;
        }
      }

      // Fetch admin info (image, displayname)
      let ownerName = 'EA CONVERTER';
      let ownerLogo = '';
      if (ownerId != null) {
        const [adminRows] = await conn.execute(
          'SELECT image, displayname FROM admin WHERE id = ? LIMIT 1',
          [ownerId]
        );
        if (Array.isArray(adminRows) && adminRows.length > 0) {
          const admin = adminRows[0] as any;
          ownerLogo = admin.image ?? '';
          ownerName = admin.displayname ?? ownerName;
        }
      }

      const data = {
        user: String(lic.ea_id ?? ''),
        status: lic.status ?? (storedHash ? 'used' : 'active'),
        expires: lic.expires ?? '',
        key: lic.key ?? licence,
        // Return the stored hash as phone_secret_key so the app can keep a reference
        phone_secret_key: storedHash || (phoneSecret ? sha256Hex(phoneSecret) : ''),
        ea_name: eaName,
        ea_notification: '',
        owner: {
          name: ownerName,
          email: '',
          phone: '',
          logo: ownerLogo,
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



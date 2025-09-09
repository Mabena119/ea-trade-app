// License authentication API
// POST /api/auth-license
// Body: { licence: string, phone_secret?: string }

import crypto from 'crypto';
import { getPool } from '@/app/api/_db';

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
      // Single query to fetch licence + EA + Owner in one round trip
      const [rows] = await conn.execute(
        `SELECT 
            l.k_ey                AS lic_key,
            l.status              AS lic_status,
            l.expires             AS lic_expires,
            l.phone_secret_code   AS lic_phone_secret_code,
            l.ea                  AS ea_id,
            e.name                AS ea_name,
            e.owner               AS owner_id,
            a.displayname         AS owner_name,
            a.image               AS owner_logo
         FROM licences l
         LEFT JOIN eas e ON e.id = l.ea
         LEFT JOIN admin a ON a.id = e.owner
         WHERE UPPER(REPLACE(l.k_ey, '-', '')) = UPPER(REPLACE(?, '-', ''))
         LIMIT 1`,
        [licence]
      );

      const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;
      if (!row) {
        return Response.json({ message: 'error' }, { status: 200 });
      }

      const canonicalKey: string = row.lic_key ?? licence;
      const currentStatus: string = String(row.lic_status ?? '').toLowerCase();
      const expires: string = row.lic_expires ?? '';
      const existingHash: string | null = row.lic_phone_secret_code ? String(row.lic_phone_secret_code) : null;

      // Optional: expiry check
      if (expires && !isNaN(Date.parse(expires))) {
        const expired = Date.now() > Date.parse(expires);
        if (expired) {
          return Response.json({ message: 'error' }, { status: 200 });
        }
      }

      // Phone secret logic
      let effectiveHash = existingHash;
      if (existingHash) {
        // Already bound: must match
        if (!phoneSecret || sha256Hex(phoneSecret) !== existingHash) {
          return Response.json({ message: 'used' }, { status: 200 });
        }
      } else if (phoneSecret && phoneSecret.length > 0) {
        // Not bound yet: bind now
        effectiveHash = sha256Hex(phoneSecret);
        await conn.execute(
          'UPDATE licences SET phone_secret_code = ? WHERE k_ey = ?',
          [effectiveHash, canonicalKey]
        );
      }

      const data = {
        user: String(row.ea_id ?? ''),
        status: currentStatus || (effectiveHash ? 'used' : 'active'),
        expires: expires,
        key: canonicalKey,
        phone_secret_key: effectiveHash || (phoneSecret ? sha256Hex(phoneSecret) : ''),
        ea_name: row.ea_name || 'EA CONVERTER',
        ea_notification: '',
        owner: {
          name: row.owner_name || 'EA CONVERTER',
          email: '',
          phone: '',
          logo: row.owner_logo || '',
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



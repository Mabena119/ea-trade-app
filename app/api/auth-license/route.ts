// License authentication API
// POST /api/auth-license
// Body: { licence: string, phone_secret?: string }

import * as crypto from 'crypto';
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
            l.user                AS lic_user,
            l.status              AS lic_status,
            l.expires             AS lic_expires,
            l.phone_secret_code   AS lic_phone_secret_code,
            l.ea                  AS ea_id,
            e.name                AS ea_name,
            e.notification_key    AS ea_notification,
            e.owner               AS owner_id,
            a.displayname         AS owner_name,
            a.email               AS owner_email,
            a.phone               AS owner_phone,
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
      const currentStatus: string = String(row.lic_status ?? 'active');
      const expires: string = row.lic_expires ?? '';

      // Phone secret logic (PHP parity):
      // - If not set (null/empty/'None'), generate a new random secret
      // - If set, require an exact match if phone_secret is provided; if missing, return 'used'
      const rawStored = row.lic_phone_secret_code as string | null;
      const isUnset = !rawStored || String(rawStored).trim() === '' || String(rawStored).trim().toLowerCase() === 'none';
      let effectiveSecret = rawStored as string | null;

      if (isUnset) {
        // Generate deterministic-length secret (similar to PHP md5 uniqid)
        const generated = crypto.randomBytes(16).toString('hex'); // 32 hex chars
        await conn.execute(
          'UPDATE licences SET phone_secret_code = ? WHERE k_ey = ?',
          [generated, canonicalKey]
        );
        effectiveSecret = generated;
      } else {
        // Already bound: enforce exact match if provided, otherwise mark as used
        if (!phoneSecret || phoneSecret !== rawStored) {
          return Response.json({ message: 'used' }, { status: 200 });
        }
        effectiveSecret = rawStored;
      }

      const data = {
        user: String(row.lic_user ?? ''),
        status: currentStatus,
        expires: expires,
        key: canonicalKey,
        phone_secret_key: effectiveSecret || '',
        ea_name: row.ea_name || 'EA CONVERTER',
        ea_notification: row.ea_notification || '',
        owner: {
          name: row.owner_name || 'EA CONVERTER',
          email: row.owner_email || '',
          phone: row.owner_phone || '',
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



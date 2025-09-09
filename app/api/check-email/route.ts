import { getPool } from '@/app/api/_db';

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



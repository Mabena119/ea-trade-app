import { join, relative as pathRelative, isAbsolute as pathIsAbsolute } from "node:path";
import { existsSync } from "node:fs";
import mysql from "mysql2/promise";

const port = Number(process.env.PORT ?? 3000);
const hostname = "0.0.0.0";
const distDir = join(process.cwd(), "dist");
const indexFilePath = join(distDir, "index.html");

// Database configuration from environment variables (provide safe defaults)
const DB_HOST = process.env.DB_HOST ?? "172.203.148.37.host.secureserver.net";
const DB_USER = process.env.DB_USER ?? "eauser";
const DB_PASSWORD = process.env.DB_PASSWORD ?? "snVO2i%fZSG%";
const DB_NAME = process.env.DB_NAME ?? "eaconverter";
const DB_PORT = Number(process.env.DB_PORT ?? 3306);
const DB_SSL = (process.env.DB_SSL ?? 'false').toLowerCase() === 'true';

let dbPool: mysql.Pool | null = null;

function getDbPool(): mysql.Pool {
    if (!dbPool) {
        dbPool = mysql.createPool({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASSWORD,
            database: DB_NAME,
            port: DB_PORT,
            connectionLimit: 10,
            waitForConnections: true,
            ssl: DB_SSL ? { rejectUnauthorized: false } : undefined,
        });
    }
    return dbPool;
}

function isSubPath(parent: string, child: string): boolean {
    const rel = pathRelative(parent, child);
    return !!rel && !rel.startsWith("..") && !pathIsAbsolute(rel);
}

if (!existsSync(distDir)) {
    console.error(`dist directory not found at: ${distDir}`);
    process.exit(1);
}

const serverOptions: {
    port: number;
    hostname: string;
    fetch: (request: Request) => Promise<Response> | Response;
    error: (error: unknown) => Response;
} = {
    port,
    hostname,
    async fetch(request) {
        const url = new URL(request.url);
        let pathname = decodeURIComponent(url.pathname);

        if (pathname.includes("..")) {
            return new Response("Not Found", { status: 404 });
        }

        if (pathname === "/") {
            const file = Bun.file(indexFilePath);
            return new Response(file, { headers: { "Cache-Control": "no-cache" } });
        }

        // API: /api/check-email
        if (pathname === "/api/check-email") {
            if (request.method !== "POST") {
                return Response.json({ error: "Method Not Allowed" }, { status: 405 });
            }

            try {
                const body = await request.json().catch(() => ({}));
                const emailRaw = (body?.email ?? "") as string;
                const email = emailRaw.trim().toLowerCase();
                if (!email) {
                    return Response.json({ error: "Email is required" }, { status: 400 });
                }

                const pool = getDbPool();
                const conn = await pool.getConnection();
                try {
                    const [rows] = await conn.execute(
                        "SELECT id, email, paid, used FROM members WHERE email = ? LIMIT 1",
                        [email]
                    );

                    const result = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;

                    if (!result) {
                        return Response.json({ found: 0, used: 0, paid: 0 });
                    }

                    let used: number = Number(result.used ?? 0);
                    const paid: number = Number(result.paid ?? 0);

                    if (used === 0) {
                        await conn.execute("UPDATE members SET used = 1 WHERE email = ?", [email]);
                        used = 0; // per original logic, still return 0 on first login
                    }

                    return Response.json({ found: 1, used, paid });
                } finally {
                    conn.release();
                }
            } catch (error) {
                console.error("/api/check-email error:", error);
                return Response.json({ error: "Internal Server Error" }, { status: 500 });
            }
        }

        // API: /api/auth-license (POST)
        if (pathname === "/api/auth-license") {
            if (request.method !== "POST") {
                return Response.json({ message: "error" }, { status: 405 });
            }
            try {
                const body = await request.json().catch(() => ({}));
                const licenseRaw = (body?.licence ?? "") as string;
                const phoneSecretRaw = (body?.phone_secret ?? "") as string;
                const license = licenseRaw.trim();
                const phoneSecret = phoneSecretRaw.trim();
                if (!license) {
                    return Response.json({ message: "error" }, { status: 400 });
                }

                const pool = getDbPool();
                const conn = await pool.getConnection();
                try {
                    // Load license row
                    const [rows] = await conn.execute("SELECT * FROM licences WHERE k_ey = ? LIMIT 1", [license]);
                    const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;
                    if (!row) {
                        return Response.json({ message: "error" }, { status: 400 });
                    }

                    let phoneSecretCode: string = String(row.phone_secret_code ?? "None");

                    // If phone_secret_code is "None", generate and save a new one
                    if (phoneSecretCode === "None") {
                        // Generate a pseudo-random secret similar to md5(uniqid()) in spirit
                        const randomBytes = crypto.getRandomValues(new Uint8Array(16));
                        phoneSecretCode = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
                        await conn.execute("UPDATE licences SET phone_secret_code = ? WHERE k_ey = ?", [phoneSecretCode, license]);
                    } else {
                        // Already has a phone secret
                        if (!phoneSecret) {
                            // Client must present existing secret
                            return Response.json({ message: "used" }, { status: 200 });
                        }
                        const [matchRows] = await conn.execute(
                            "SELECT * FROM licences WHERE k_ey = ? AND phone_secret_code = ? LIMIT 1",
                            [license, phoneSecret]
                        );
                        const match = Array.isArray(matchRows) && matchRows.length > 0 ? (matchRows[0] as any) : null;
                        if (!match) {
                            return Response.json({ message: "used" }, { status: 200 });
                        }
                        // Keep phoneSecretCode as saved
                        phoneSecretCode = String(match.phone_secret_code ?? phoneSecretCode);
                    }

                    // Optional: expiry status sync (best-effort)
                    try {
                        const expiresValue = row.expires;
                        const expiresDate = expiresValue ? new Date(expiresValue) : null;
                        if (expiresDate && !Number.isNaN(expiresDate.getTime())) {
                            const today = new Date();
                            if (today.getTime() >= expiresDate.getTime()) {
                                await conn.execute(
                                    "UPDATE licences SET status = 'Expired' WHERE k_ey = ?",
                                    [license]
                                );
                                row.status = 'Expired';
                            }
                        }
                    } catch { }

                    // Derive EA and Owner details with best-effort queries
                    let eaName: string = String(row.ea_name ?? "").trim();
                    let eaNotification: string = String(row.ea_notification ?? "").trim();
                    const eaId = row.ea ?? row.ea_id ?? null;
                    if ((!eaName || !eaNotification) && eaId) {
                        try {
                            // Try common table names: ea or eas
                            const [eaRows1] = await conn.execute(
                                "SELECT name, notification_key FROM ea WHERE id = ? LIMIT 1",
                                [eaId]
                            );
                            const eaRow1 = Array.isArray(eaRows1) && eaRows1.length > 0 ? (eaRows1[0] as any) : null;
                            if (eaRow1) {
                                eaName = String(eaRow1.name ?? eaName ?? "").trim();
                                eaNotification = String(eaRow1.notification_key ?? eaNotification ?? "").trim();
                            } else {
                                const [eaRows2] = await conn.execute(
                                    "SELECT name, notification_key FROM eas WHERE id = ? LIMIT 1",
                                    [eaId]
                                );
                                const eaRow2 = Array.isArray(eaRows2) && eaRows2.length > 0 ? (eaRows2[0] as any) : null;
                                if (eaRow2) {
                                    eaName = String(eaRow2.name ?? eaName ?? "").trim();
                                    eaNotification = String(eaRow2.notification_key ?? eaNotification ?? "").trim();
                                }
                            }
                        } catch { }
                    }

                    // Owner details
                    let ownerName: string = String(row.owner_name ?? "").trim();
                    let ownerEmail: string = String(row.owner_email ?? "").trim();
                    let ownerPhone: string = String(row.owner_phone ?? "").trim();
                    let ownerLogo: string = String(row.owner_logo ?? "").trim();
                    const ownerId = row.owner ?? row.owner_id ?? null;
                    if ((!ownerName || !ownerLogo) && ownerId) {
                        try {
                            // Prefer admins table (displayname/image) then owners (name/logo)
                            const [admRows] = await conn.execute(
                                "SELECT displayname AS name, email, phone, image AS logo FROM admins WHERE id = ? LIMIT 1",
                                [ownerId]
                            );
                            const adm = Array.isArray(admRows) && admRows.length > 0 ? (admRows[0] as any) : null;
                            if (adm) {
                                ownerName = String(adm.name ?? ownerName ?? "").trim();
                                ownerEmail = String(adm.email ?? ownerEmail ?? "").trim();
                                ownerPhone = String(adm.phone ?? ownerPhone ?? "").trim();
                                ownerLogo = String(adm.logo ?? ownerLogo ?? "").trim();
                            } else {
                                const [ownRows] = await conn.execute(
                                    "SELECT name, email, phone, logo FROM owners WHERE id = ? LIMIT 1",
                                    [ownerId]
                                );
                                const own = Array.isArray(ownRows) && ownRows.length > 0 ? (ownRows[0] as any) : null;
                                if (own) {
                                    ownerName = String(own.name ?? ownerName ?? "").trim();
                                    ownerEmail = String(own.email ?? ownerEmail ?? "").trim();
                                    ownerPhone = String(own.phone ?? ownerPhone ?? "").trim();
                                    ownerLogo = String(own.logo ?? ownerLogo ?? "").trim();
                                }
                            }
                        } catch { }
                    }

                    // Build absolute owner logo URL if relative
                    try {
                        if (ownerLogo && !/^https?:\/\//i.test(ownerLogo) && !ownerLogo.startsWith('data:')) {
                            ownerLogo = ownerLogo.startsWith('/')
                                ? `https://ea-converter.com${ownerLogo}`
                                : `https://ea-converter.com/${ownerLogo}`;
                        }
                    } catch { }

                    // Build response data (with computed values and safe fallbacks)
                    const data = {
                        user: String(row.user ?? ""),
                        status: String(row.status ?? ""),
                        expires: String(row.expires ?? ""),
                        key: String(row.k_ey ?? license),
                        phone_secret_key: phoneSecretCode,
                        // Never fall back to licence "user" for EA name; prefer stored ea_name or default label
                        ea_name: (eaName && eaName.length > 0) ? eaName : String(row.ea_name ?? "EA CONVERTER"),
                        ea_notification: eaNotification || String(row.ea_notification ?? "enabled"),
                        owner: {
                            name: ownerName || "EA CONVERTER",
                            email: ownerEmail || "",
                            phone: ownerPhone || "",
                            logo: ownerLogo || "",
                        },
                    };

                    return Response.json({ message: "accept", data }, { status: 200 });
                } finally {
                    conn.release();
                }
            } catch (error) {
                console.error("/api/auth-license error:", error);
                return Response.json({ message: "error" }, { status: 500 });
            }
        }

        // API: /api/symbols (GET)
        if (pathname === "/api/symbols") {
            if (request.method !== "GET") {
                return Response.json({ message: "error" }, { status: 405 });
            }
            try {
                const urlObj = new URL(request.url);
                const phoneSecret = (urlObj.searchParams.get("phone_secret") ?? "").trim();
                if (!phoneSecret) {
                    return Response.json({ message: "error" }, { status: 400 });
                }

                const pool = getDbPool();
                const conn = await pool.getConnection();
                try {
                    const [licRows] = await conn.execute(
                        "SELECT * FROM licences WHERE phone_secret_code = ? LIMIT 1",
                        [phoneSecret]
                    );
                    const lic = Array.isArray(licRows) && licRows.length > 0 ? (licRows[0] as any) : null;
                    if (!lic) {
                        return Response.json({ message: "error" }, { status: 400 });
                    }

                    const eaId = lic.ea ?? lic.ea_id ?? null;
                    if (!eaId) {
                        return Response.json({ message: "accept", data: [] }, { status: 200 });
                    }
                    try {
                        const [symRows] = await conn.execute(
                            "SELECT id, name FROM symbols WHERE ea = ?",
                            [eaId]
                        );
                        const data = Array.isArray(symRows)
                            ? (symRows as any[]).map((r) => ({ id: String(r.id), name: String(r.name) }))
                            : [];
                        return Response.json({ message: "accept", data }, { status: 200 });
                    } catch (innerError) {
                        console.error("symbols query error:", innerError);
                        // Fallback to empty list if table/schema differs
                        return Response.json({ message: "accept", data: [] }, { status: 200 });
                    }
                } finally {
                    conn.release();
                }
            } catch (error) {
                console.error("/api/symbols error:", error);
                return Response.json({ message: "error" }, { status: 500 });
            }
        }

        const candidatePath = join(distDir, pathname);

        if (!isSubPath(distDir, candidatePath)) {
            return new Response("Not Found", { status: 404 });
        }

        let fileToServe: string | null = null;

        if (existsSync(candidatePath)) {
            fileToServe = candidatePath;
        } else if (!pathname.includes(".")) {
            fileToServe = indexFilePath;
        }

        if (fileToServe) {
            const file = Bun.file(fileToServe);
            if (await file.exists()) {
                const isHTML = fileToServe.endsWith(".html");
                const cacheHeader = isHTML
                    ? "no-cache"
                    : "public, max-age=31536000, immutable";
                return new Response(file, { headers: { "Cache-Control": cacheHeader } });
            }
        }

        return new Response("Not Found", { status: 404 });
    },
    error(error) {
        console.error(error);
        return new Response("Internal Server Error", { status: 500 });
    },
};

export default serverOptions;



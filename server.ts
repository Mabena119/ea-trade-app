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

                    // Build response data (fallbacks if related tables/columns are unavailable)
                    let eaName: string = String(row.ea_name ?? "EA CONVERTER");
                    let ownerName: string = String(row.owner_name ?? "EA CONVERTER");
                    let ownerLogo: string = String(row.owner_logo ?? "");

                    // Optionally load EA and Admin details similar to user's example
                    try {
                        const eaId = row.ea ?? row.ea_id ?? row.eaId ?? null;
                        if (eaId != null) {
                            try {
                                const [eaRows] = await conn.execute(
                                    "SELECT name, owner FROM eas WHERE id = ? LIMIT 1",
                                    [eaId]
                                );
                                const eaRow = Array.isArray(eaRows) && eaRows.length > 0 ? (eaRows[0] as any) : null;
                                if (eaRow) {
                                    const fetchedEaName = eaRow.name != null ? String(eaRow.name) : null;
                                    if (fetchedEaName) eaName = fetchedEaName;

                                    const ownerId = eaRow.owner ?? eaRow.owner_id ?? null;
                                    if (ownerId != null) {
                                        try {
                                            const [adminRows] = await conn.execute(
                                                "SELECT image, displayname FROM admin WHERE id = ? LIMIT 1",
                                                [ownerId]
                                            );
                                            const adminRow = Array.isArray(adminRows) && adminRows.length > 0 ? (adminRows[0] as any) : null;
                                            if (adminRow) {
                                                const image = adminRow.image != null ? String(adminRow.image) : null;
                                                const displayname = adminRow.displayname != null ? String(adminRow.displayname) : null;
                                                if (image) ownerLogo = image;
                                                if (displayname) ownerName = displayname;
                                            }
                                        } catch (adminQueryError) {
                                            console.error("admin lookup error:", adminQueryError);
                                        }
                                    }
                                }
                            } catch (eaQueryError) {
                                console.error("eas lookup error:", eaQueryError);
                            }
                        }
                    } catch {}

                    const data = {
                        user: String(row.user ?? ""),
                        status: String(row.status ?? ""),
                        expires: String(row.expires ?? ""),
                        key: String(row.k_ey ?? license),
                        phone_secret_key: phoneSecretCode,
                        ea_name: eaName,
                        ea_notification: String(row.ea_notification ?? "enabled"),
                        owner: {
                            name: ownerName,
                            email: String(row.owner_email ?? ""),
                            phone: String(row.owner_phone ?? ""),
                            logo: ownerLogo,
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



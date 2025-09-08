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



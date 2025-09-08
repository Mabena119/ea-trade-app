import { join, relative as pathRelative, isAbsolute as pathIsAbsolute } from "node:path";
import { existsSync } from "node:fs";

const port = Number(process.env.PORT ?? 3000);
const hostname = "0.0.0.0";
const distDir = join(process.cwd(), "dist");
const indexFilePath = join(distDir, "index.html");

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



// Explicitly start the Bun server when this file is executed
Bun.serve(serverOptions);


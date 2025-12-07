// Simple Bun server to serve static web export and handle API routes
// - Serves files from ./dist
// - Routes API calls to optimized database connection pool

import path from 'path';
import { createPool } from 'mysql2/promise';
// Declare Bun global for TypeScript linting in non-Bun tooling contexts
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const Bun: any;

const DIST_DIR = path.join(process.cwd(), 'dist');
const PORT = Number(process.env.PORT || 3000);

// Prefer environment variables for database configuration
const DB_HOST = process.env.DB_HOST || process.env.MYSQLHOST || process.env.MYSQL_HOST || '18.235.43.127';
const DB_USER = process.env.DB_USER || process.env.MYSQLUSER || process.env.MYSQL_USER || 'eatradeadmin';
const DB_PASSWORD = process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || 'eatrade@2026';
const DB_NAME = process.env.DB_NAME || process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || 'eatrade';
const DB_PORT = Number(process.env.DB_PORT || process.env.MYSQLPORT || process.env.MYSQL_PORT || 3306);

// Optimized connection pool configuration for scaling AND CPU efficiency
const POOL_CONFIG = {
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 20),
  maxIdle: Number(process.env.DB_MAX_IDLE || 10),
  idleTimeout: Number(process.env.DB_IDLE_TIMEOUT || 60000),
  queueLimit: Number(process.env.DB_QUEUE_LIMIT || 50),
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  waitForConnections: true,
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 20000),
  acquireTimeout: Number(process.env.DB_ACQUIRE_TIMEOUT || 20000),
  timeout: Number(process.env.DB_QUERY_TIMEOUT || 30000),

  // CPU-efficient settings
  decimalNumbers: true,
  bigNumberStrings: false,
  supportBigNumbers: true,
  dateStrings: false,
  typeCast: true,
  multipleStatements: false,
  rowsAsArray: false,
};

// Create optimized database connection pool
const pool = createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  port: DB_PORT,
  ...POOL_CONFIG,
});

console.log('✅ Database connection pool initialized:', {
  host: DB_HOST,
  database: DB_NAME,
  connectionLimit: POOL_CONFIG.connectionLimit,
});

function getPool() {
  return pool;
}

// Graceful shutdown
async function shutdownServer() {
  console.log('🔄 Shutting down server...');
  try {
    await pool.end();
    console.log('✅ Database connections closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', shutdownServer);
process.on('SIGINT', shutdownServer);

async function serveStatic(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    let filePath = url.pathname;

    // Prevent path traversal
    if (filePath.includes('..')) {
      return new Response('Not Found', { status: 404 });
    }

    // Default to index.html
    if (filePath === '/' || filePath === '') {
      filePath = '/index.html';
    }

    const absolutePath = path.join(DIST_DIR, filePath);
    const file = Bun.file(absolutePath);
    if (await file.exists()) {
      // Set proper MIME type based on file extension
      const ext = path.extname(filePath).toLowerCase();
      let contentType = 'application/octet-stream';

      switch (ext) {
        case '.html':
          contentType = 'text/html; charset=utf-8';
          break;
        case '.css':
          contentType = 'text/css; charset=utf-8';
          break;
        case '.js':
          contentType = 'application/javascript; charset=utf-8';
          break;
        case '.json':
          contentType = 'application/json; charset=utf-8';
          break;
        case '.png':
          contentType = 'image/png';
          break;
        case '.jpg':
        case '.jpeg':
          contentType = 'image/jpeg';
          break;
        case '.gif':
          contentType = 'image/gif';
          break;
        case '.svg':
          contentType = 'image/svg+xml';
          break;
        case '.ico':
          contentType = 'image/x-icon';
          break;
        case '.woff':
          contentType = 'font/woff';
          break;
        case '.woff2':
          contentType = 'font/woff2';
          break;
        case '.ttf':
          contentType = 'font/ttf';
          break;
        case '.eot':
          contentType = 'application/vnd.ms-fontobject';
          break;
      }

      return new Response(file, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': ext === '.html' ? 'no-cache, no-store, must-revalidate' : 'public, max-age=31536000',
        },
      });
    }

    // SPA fallback
    const indexFile = Bun.file(path.join(DIST_DIR, 'index.html'));
    if (await indexFile.exists()) {
      return new Response(indexFile, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    }

    return new Response('Not Found', { status: 404 });
  } catch (error) {
    console.error('Static serve error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

async function handleApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  try {
    if (pathname === '/api/check-email') {
      const route = await import('./app/api/check-email/route.ts');
      if (request.method === 'POST' && typeof route.POST === 'function') {
        return route.POST(request) as Promise<Response>;
      }
      if (request.method === 'GET' && typeof route.GET === 'function') {
        return route.GET() as Promise<Response>;
      }
      return new Response('Method Not Allowed', { status: 405 });
    }
    // Add auth-license routing
    if (pathname === '/api/auth-license') {
      const route = await import('./app/api/auth-license/route.ts');
      if (request.method === 'POST' && typeof route.POST === 'function') {
        return route.POST(request) as Promise<Response>;
      }
      if (request.method === 'GET' && typeof route.GET === 'function') {
        return route.GET() as Promise<Response>;
      }
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Add symbols routing
    if (pathname === '/api/symbols') {
      const route = await import('./app/api/symbols/route.ts');
      if (request.method === 'GET' && typeof route.GET === 'function') {
        return route.GET(request) as Promise<Response>;
      }
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Add terminal-proxy routing
    if (pathname === '/api/terminal-proxy') {
      const route = await import('./app/api/terminal-proxy.ts');
      if (request.method === 'GET' && typeof route.default === 'function') {
        // Convert Bun Request to Express-like request/response
        const expressReq = {
          method: request.method,
          query: Object.fromEntries(new URL(request.url).searchParams),
          url: request.url
        } as any;

        const expressRes = {
          status: (code: number) => ({
            json: (data: any) => new Response(JSON.stringify(data), {
              status: code,
              headers: { 'Content-Type': 'application/json' }
            }),
            send: (data: string) => new Response(data, {
              status: code,
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            })
          }),
          setHeader: (name: string, value: string) => { }
        } as any;

        return route.default(expressReq, expressRes);
      }
      return new Response('Method Not Allowed', { status: 405 });
    }


    // Database API endpoints
    // Get EA ID from license key
    if (pathname === '/api/get-ea-from-license') {
      if (request.method === 'GET') {
        const licenseKey = url.searchParams.get('licenseKey');
        if (!licenseKey) {
          return new Response(JSON.stringify({ error: 'License key required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        let conn = null;
        try {
          const pool = getPool();
          conn = await pool.getConnection();

          const [rows] = await conn.execute(
            'SELECT ea FROM licences WHERE k_ey = ? LIMIT 1',
            [licenseKey]
          );

          const result = rows as any[];
          const eaId = result.length > 0 ? result[0].ea : null;

          // Return in format expected by client: { id: eaId } or { eaId: eaId } for compatibility
          return new Response(JSON.stringify({
            id: eaId,
            eaId: eaId  // Also include eaId for backward compatibility
          }), {
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('❌ Database error in get-ea-from-license:', error);
          return new Response(JSON.stringify({ error: 'Database error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        } finally {
          if (conn) {
            try {
              conn.release();
            } catch (releaseError) {
              console.error('❌ Failed to release connection:', releaseError);
            }
          }
        }
      }
      return new Response('Method Not Allowed', { status: 405 });
    }

    // MT5 Proxy endpoint - fetches MT5 terminal and injects authentication script
    if (pathname === '/api/mt5-proxy') {
      if (request.method === 'GET') {
        const terminalUrl = url.searchParams.get('url');
        const login = url.searchParams.get('login');
        const password = url.searchParams.get('password');

        if (!terminalUrl) {
          return new Response('Missing terminal URL', { status: 400 });
        }

        try {
          // Fetch the MT5 terminal page
          const response = await fetch(terminalUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
          });

          if (!response.ok) {
            return new Response(`Failed to fetch terminal: ${response.statusText}`, { status: response.status });
          }

          let html = await response.text();

          // Escape credentials for safe injection
          const escapeValue = (value: string) => {
            return (value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
          };

          const loginValue = escapeValue(login || '');
          const passwordValue = escapeValue(password || '');

          // Generate authentication script (same as getMT5Script)
          const authScript = `
            (function() {
              const sendMessage = (type, message) => {
                try { 
                  if (window.parent && window.parent !== window) {
                    window.parent.postMessage(JSON.stringify({ type, message }), '*');
                  }
                  if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type, message }));
                  }
                } catch(e) {}
              };

              sendMessage('mt5_loaded', 'MT5 terminal loaded successfully');
              
              const sleep = (ms) => new Promise(r => setTimeout(r, ms));
              
              const loginCredential = '${loginValue}';
              const passwordCredential = '${passwordValue}';
              
              const authenticateMT5 = async () => {
                try {
                  sendMessage('step_update', 'Initializing MT5 Account...');
                  await sleep(5500);
                  
                  // Check for disclaimer and accept if present
                  const disclaimer = document.querySelector('#disclaimer');
                  if (disclaimer) {
                    const acceptButton = document.querySelector('.accept-button');
                    if (acceptButton) {
                      acceptButton.click();
                      sendMessage('step_update', 'Accepting disclaimer...');
                      await sleep(2000);
                    }
                  }
                  
                  // Check if form is visible and remove any existing connections
                  const form = document.querySelector('.form');
                  if (form && !form.classList.contains('hidden')) {
                    const removeButton = document.querySelector('.button.svelte-1wrky82.red');
                    if (removeButton) {
                      removeButton.click();
                      sendMessage('step_update', 'Removing existing connection...');
                      await sleep(3000);
                    } else {
                      const buttons = document.getElementsByTagName('button');
                      for (let i = 0; i < buttons.length; i++) {
                        if (buttons[i].textContent.trim() === 'Remove') {
                          buttons[i].click();
                          sendMessage('step_update', 'Removing existing connection...');
                          await sleep(3000);
                          break;
                        }
                      }
                    }
                  }
                  
                  await sleep(2000);
                  
                  // Fill login credentials
                  const loginField = document.querySelector('input[name="login"]') || 
                                    document.querySelector('input[type="text"][placeholder*="login" i]') ||
                                    document.querySelector('input[type="number"]') ||
                                    document.querySelector('input#login');
                  
                  const passwordField = document.querySelector('input[name="password"]') || 
                                       document.querySelector('input[type="password"]') ||
                                       document.querySelector('input#password');
                  
                  if (loginField && loginCredential) {
                    loginField.focus();
                    loginField.value = '';
                    loginField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    loginField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                    
                    setTimeout(() => {
                      loginField.focus();
                      loginField.value = loginCredential;
                      loginField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                      loginField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                      sendMessage('step_update', 'Login filled');
                    }, 100);
                  } else {
                    sendMessage('authentication_failed', 'Login field not found');
                    return;
                  }
                  
                  if (passwordField && passwordCredential) {
                    setTimeout(() => {
                      passwordField.focus();
                      passwordField.value = '';
                      passwordField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                      passwordField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                      
                      setTimeout(() => {
                        passwordField.focus();
                        passwordField.value = passwordCredential;
                        passwordField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                        passwordField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                        sendMessage('step_update', 'Password filled');
                      }, 100);
                    }, 300);
                  } else {
                    sendMessage('authentication_failed', 'Password field not found');
                    return;
                  }
                  
                  await sleep(2000);
                  
                  // Click login button
                  sendMessage('step_update', 'Connecting to Server...');
                  const loginButton = document.querySelector('.button.svelte-1wrky82.active') ||
                                     document.querySelector('button[type="submit"]') ||
                                     document.querySelector('.button.active') ||
                                     Array.from(document.querySelectorAll('button')).find(btn => 
                                       btn.textContent.trim().toLowerCase().includes('login') ||
                                       btn.textContent.trim().toLowerCase().includes('connect')
                                     );
                  
                  if (loginButton) {
                    loginButton.click();
                    await sleep(8000);
                  } else {
                    sendMessage('authentication_failed', 'Login button not found');
                    return;
                  }
                  
                  sendMessage('step_update', 'Verifying authentication...');
                  await sleep(3000);
                  
                  const searchField = document.querySelector('input[placeholder*="Search symbol" i]') ||
                                     document.querySelector('input[placeholder*="Search" i]') ||
                                     document.querySelector('input[type="search"]');
                  
                  if (searchField && searchField.offsetParent !== null) {
                    sendMessage('authentication_success', 'MT5 Login Successful - Search bar detected');
                    return;
                  }
                  
                  await sleep(3000);
                  const searchFieldRetry = document.querySelector('input[placeholder*="Search symbol" i]') ||
                                          document.querySelector('input[placeholder*="Search" i]') ||
                                          document.querySelector('input[type="search"]');
                  
                  if (searchFieldRetry && searchFieldRetry.offsetParent !== null) {
                    sendMessage('authentication_success', 'MT5 Login Successful - Search bar detected');
                    return;
                  }
                  
                  sendMessage('authentication_failed', 'Authentication failed - Invalid login or password');
                  
                } catch(e) {
                  sendMessage('authentication_failed', 'Error during authentication: ' + e.message);
                }
              };
              
              // Start authentication after page loads
              setTimeout(authenticateMT5, 3000);
            })();
          `;

          // Inject script before closing body tag
          if (html.includes('</body>')) {
            html = html.replace('</body>', `<script>${authScript}</script></body>`);
          } else {
            html += `<script>${authScript}</script>`;
          }

          // Return modified HTML with CORS headers
          return new Response(html, {
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
            },
          });
        } catch (error) {
          console.error('MT5 Proxy error:', error);
          return new Response(`Proxy error: ${error.message}`, { status: 500 });
        }
      }
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Get new signals for EA since a specific time
    if (pathname === '/api/get-new-signals') {
      if (request.method === 'GET') {
        const eaId = url.searchParams.get('eaId');
        const since = url.searchParams.get('since');

        if (!eaId) {
          return new Response(JSON.stringify({ error: 'EA ID required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        let conn = null;
        try {
          const pool = getPool();
          conn = await pool.getConnection();

          let query: string;
          let params: any[];

          if (since) {
            // Get signals since a specific time
            query = `
              SELECT id, ea, asset, latestupdate, type, action, price, tp, sl, time, results
              FROM \`signals\` 
              WHERE ea = ? AND latestupdate > ? AND results = 'active'
              ORDER BY latestupdate DESC
            `;
            params = [eaId, since];
          } else {
            // Get all active signals for EA
            query = `
              SELECT id, ea, asset, latestupdate, type, action, price, tp, sl, time, results
              FROM \`signals\` 
              WHERE ea = ? AND results = 'active'
              ORDER BY latestupdate DESC
            `;
            params = [eaId];
          }

          const [rows] = await conn.execute(query, params);

          const result = rows as any[];
          console.log(`Found ${result.length} new signals for EA ${eaId} since ${since || 'beginning'}`);

          return new Response(JSON.stringify({ signals: result }), {
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          console.error('❌ Database error in get-new-signals:', error);
          return new Response(JSON.stringify({ error: 'Database error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        } finally {
          if (conn) {
            try {
              conn.release();
            } catch (releaseError) {
              console.error('❌ Failed to release connection:', releaseError);
            }
          }
        }
      }
      return new Response('Method Not Allowed', { status: 405 });
    }

    return new Response('Not Found', { status: 404 });
  } catch (error) {
    console.error('API handler error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(request: Request) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health' || url.pathname === '/_health' || url.pathname === '/status') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Handle terminal assets (CSS, JS, etc.) - proxy to the original MT5 terminal
    if (url.pathname.startsWith('/terminal/')) {
      try {
        const assetPath = url.pathname.replace('/terminal/', '');

        // Determine broker URL from referer header or default to RazorMarkets
        const referer = request.headers.get('referer') || '';
        let brokerBaseUrl = 'https://webtrader.razormarkets.co.za';

        if (referer.includes('accumarkets.co.za')) {
          brokerBaseUrl = 'https://webterminal.accumarkets.co.za';
        } else if (referer.includes('razormarkets.co.za')) {
          brokerBaseUrl = 'https://webtrader.razormarkets.co.za';
        }

        const targetUrl = `${brokerBaseUrl}/terminal/${assetPath}`;

        const response = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });

        if (response.ok) {
          const contentType = response.headers.get('content-type') || 'application/octet-stream';
          const content = await response.arrayBuffer();

          return new Response(content, {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=3600',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      } catch (error) {
        console.error('Terminal asset proxy error:', error);
      }

      return new Response('Asset not found', { status: 404 });
    }

    // API routes
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request);
    }

    // Static files
    return serveStatic(request);
  },
});

console.log(`Server running on http://localhost:${server.port}`);



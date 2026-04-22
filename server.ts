// Simple Bun server to serve static web export and handle API routes
// - Serves files from ./dist
// - Routes API calls to optimized database connection pool

import path from 'path';
import { createPool } from 'mysql2/promise';
import {
  addSubscription,
  removeSubscription,
  loadSubscriptions,
  setOnSubscriptionRemoved,
  getVapidPublicKey,
  isPushConfigured,
} from './services/push-service';
import { startWebPushSignalsPolling, pollWebPushSignalsNow } from './services/web-push-signals-polling';
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

      // Service worker must not be cached so updates propagate (critical for iOS PWA)
      const isServiceWorker = filePath === '/sw.js';
      const cacheControl = ext === '.html'
        ? 'no-cache, no-store, must-revalidate'
        : isServiceWorker
          ? 'no-cache, no-store, must-revalidate'
          : 'public, max-age=31536000';

      return new Response(file, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': cacheControl,
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

    // Add AI chart analysis routing
    if (pathname === '/api/analyze-chart') {
      const route = await import('./app/api/analyze-chart/route.ts');
      if (request.method === 'POST' && typeof route.POST === 'function') {
        return route.POST(request) as Promise<Response>;
      }
      if (request.method === 'GET' && typeof route.GET === 'function') {
        return route.GET() as Promise<Response>;
      }
      return new Response('Method Not Allowed', { status: 405 });
    }

    if (pathname === '/api/mt5-trade-sizing') {
      const route = await import('./app/api/mt5-trade-sizing/route.ts');
      if (request.method === 'POST' && typeof route.POST === 'function') {
        return route.POST(request) as Promise<Response>;
      }
      if (request.method === 'GET' && typeof route.GET === 'function') {
        return route.GET() as Promise<Response>;
      }
      return new Response('Method Not Allowed', { status: 405 });
    }

    if (pathname === '/api/scanner-status') {
      const route = await import('./app/api/scanner-status/route.ts');
      if (request.method === 'GET' && typeof route.GET === 'function') {
        return route.GET(request) as Promise<Response>;
      }
      if (request.method === 'POST' && typeof route.POST === 'function') {
        return route.POST(request) as Promise<Response>;
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
        const broker = url.searchParams.get('broker') || '';
        const server = broker; // Server name is the broker name

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

          // Get base URL for fixing relative URLs
          const baseUrlObj = new URL(terminalUrl);
          const baseUrl = `${baseUrlObj.protocol}//${baseUrlObj.host}`;
          const wsBaseUrl = baseUrl.replace('http://', 'ws://').replace('https://', 'wss://');
          // Root-based terminals (e.g. Profinwealth) serve from domain root, not /terminal/
          const isRootTerminal = !terminalUrl.replace(/\/$/, '').endsWith('/terminal');

          // Fix relative URLs in HTML (for assets, scripts, stylesheets)
          // Replace relative URLs with proxy URLs so they go through our proxy
          // Ensure we use HTTPS (force HTTPS even if request came via HTTP)
          const proxyOrigin = url.protocol === 'https:' || url.hostname.includes('onrender.com')
            ? `https://${url.hostname}${url.port ? `:${url.port}` : ''}`
            : url.origin;

          // For terminal assets, route through proxy to avoid CORS issues
          // Root terminals: route ALL /path through proxy; standard: route /terminal/path
          html = html.replace(/href="\/([^"]+)"/g, (match, path) => {
            if (path.startsWith('terminal/')) {
              return `href="${proxyOrigin}/terminal/${path.replace('terminal/', '')}?broker=${encodeURIComponent(broker)}"`;
            }
            if (isRootTerminal) return `href="${proxyOrigin}/terminal/${path}?broker=${encodeURIComponent(broker)}"`;
            return `href="${baseUrl}/${path}"`;
          });
          html = html.replace(/src="\/([^"]+)"/g, (match, path) => {
            if (path.startsWith('terminal/')) {
              return `src="${proxyOrigin}/terminal/${path.replace('terminal/', '')}?broker=${encodeURIComponent(broker)}"`;
            }
            if (isRootTerminal) return `src="${proxyOrigin}/terminal/${path}?broker=${encodeURIComponent(broker)}"`;
            return `src="${baseUrl}/${path}"`;
          });
          html = html.replace(/url\("\/\/([^"]+)"\)/g, (match, path) => {
            if (path.startsWith('terminal/')) {
              // Route through proxy for CSS url() references
              return `url("${proxyOrigin}/terminal/${path.replace('terminal/', '')}?broker=${encodeURIComponent(broker)}")`;
            }
            return `url("${baseUrl}/${path}")`;
          });
          html = html.replace(/url\('\/\/([^']+)'\)/g, (match, path) => {
            if (path.startsWith('terminal/')) {
              // Route through proxy for CSS url() references
              return `url('${proxyOrigin}/terminal/${path.replace('terminal/', '')}?broker=${encodeURIComponent(broker)}')`;
            }
            return `url('${baseUrl}/${path}')`;
          });

          // Also fix any absolute broker URLs in the HTML to use proxy
          html = html.replace(new RegExp(`${baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/terminal/([^"'>\\s]+)`, 'g'), (match, assetPath) => {
            return `${proxyOrigin}/terminal/${assetPath}?broker=${encodeURIComponent(broker)}`;
          });

          // Fix WebSocket URLs - replace proxy domain with broker domain
          const proxyDomain = url.origin; // e.g., https://ea-trade-app.onrender.com
          const proxyHost = proxyDomain.replace(/https?:\/\//, '').replace(/\./g, '\\.');

          // Replace WebSocket URLs pointing to proxy with broker's WebSocket URL
          html = html.replace(new RegExp(`wss?://${proxyHost}/terminal/ws`, 'gi'), `${wsBaseUrl}/terminal/ws`);
          html = html.replace(new RegExp(`wss?://${proxyHost}/terminal/`, 'gi'), `${wsBaseUrl}/terminal/`);

          // Fix dynamically constructed WebSocket URLs
          // Replace window.location.origin/hostname with broker's base URL in WebSocket contexts
          html = html.replace(
            /(new\s+WebSocket\s*\(\s*['"`])(wss?:\/\/)(window\.location\.(origin|hostname)|location\.(origin|hostname))(['"`])/g,
            `$1${wsBaseUrl}/terminal/ws$6`
          );

          // Also inject a script to override WebSocket construction
          const wsOverrideScript = `
            (function() {
              const originalWebSocket = window.WebSocket;
              const brokerWsUrl = '${wsBaseUrl}/terminal/ws';
              
              window.WebSocket = function(url, protocols) {
                // If URL points to proxy domain, replace with broker domain
                if (url && typeof url === 'string') {
                  const proxyHost = '${proxyHost.replace(/\\/g, '')}';
                  if (url.includes(proxyHost) || url.includes('/terminal/ws')) {
                    url = brokerWsUrl;
                  }
                }
                return new originalWebSocket(url, protocols);
              };
              
              // Copy static properties
              Object.setPrototypeOf(window.WebSocket, originalWebSocket);
              window.WebSocket.prototype = originalWebSocket.prototype;
              window.WebSocket.CONNECTING = originalWebSocket.CONNECTING;
              window.WebSocket.OPEN = originalWebSocket.OPEN;
              window.WebSocket.CLOSING = originalWebSocket.CLOSING;
              window.WebSocket.CLOSED = originalWebSocket.CLOSED;
            })();
          `;

          // Inject WebSocket override script before auth script
          if (html.includes('</head>')) {
            html = html.replace('</head>', `<script>${wsOverrideScript}</script></head>`);
          } else if (html.includes('<head>')) {
            html = html.replace('<head>', `<head><script>${wsOverrideScript}</script>`);
          } else {
            html = `<script>${wsOverrideScript}</script>` + html;
          }

          // Escape credentials for safe injection (same as Android)
          const escapeValue = (value: string) => {
            return (value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
          };

          const loginValue = escapeValue(login || '');
          const passwordValue = escapeValue(password || '');
          const serverValue = escapeValue(server || '');

          // Generate authentication script - EXACT COPY from Android getMT5Script()
          // This script will be injected into the HTML and executed automatically when page loads
          const authScript = `
            (function() {
              console.log('[MT5 Auth] Script injected and executing...');
              
              const sendMessage = (type, message, extras) => {
                try {
                  var payload = { type: type, message: message };
                  if (extras && typeof extras === 'object') {
                    for (var key in extras) {
                      if (Object.prototype.hasOwnProperty.call(extras, key) && extras[key] != null) {
                        payload[key] = extras[key];
                      }
                    }
                  }
                  var messageData = JSON.stringify(payload);
                  if (window.parent && window.parent !== window) {
                    window.parent.postMessage(messageData, '*');
                  }
                  if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(messageData);
                  }
                  console.log('[MT5 Auth] Message sent:', type, message);
                } catch(e) {
                  console.error('[MT5 Auth] Error sending message:', e);
                }
              };

              function collectPageTextDeep() {
                var parts = [];
                function walk(d) {
                  try {
                    if (!d) return;
                    if (d.body && d.body.innerText) parts.push(d.body.innerText);
                    var ifr = d.querySelectorAll('iframe');
                    for (var ii = 0; ii < ifr.length; ii++) {
                      try {
                        var ind = ifr[ii].contentDocument;
                        if (ind) walk(ind);
                      } catch (eIf) {}
                    }
                  } catch (eW) {}
                }
                walk(document);
                return parts.join('\\n');
              }

              function normalizeAmountToken(raw) {
                if (!raw) return null;
                var s = String(raw).replace(/[\\s\\u00a0\\u202f\\u2007\\u2009]+/g, '').replace(/'/g, '');
                if (s.indexOf('.') >= 0) {
                  s = s.replace(/,/g, '');
                } else if (s.indexOf(',') > 0 && s.indexOf(',') === s.lastIndexOf(',')) {
                  var sp = s.split(',');
                  if (sp.length === 2 && sp[1].length <= 2 && /^\\d+$/.test(sp[1])) {
                    s = sp[0].replace(/\\./g, '') + '.' + sp[1];
                  } else {
                    s = s.replace(/,/g, '');
                  }
                } else {
                  s = s.replace(/,/g, '');
                }
                return s || null;
              }

              function scrapeTerminalAccountStats() {
                var equity = null;
                var balance = null;
                var floatingProfit = null;
                try {
                  var raw = collectPageTextDeep();
                  var txt = raw || ((document.body && document.body.innerText) ? document.body.innerText : '');
                  txt = txt.replace(/[\\u00a0\\u202f\\u2007\\u2009]/g, ' ');
                  var lineEq = txt.match(/(?:^|[\\n\\r])\\s*Equity\\s*[:\\s]+([\\d][\\d\\s,']*\\.?\\d*)/im);
                  if (lineEq) equity = normalizeAmountToken(lineEq[1]);
                  var lineBal = txt.match(/(?:^|[\\n\\r])\\s*Balance\\s*[:\\s]+([\\d][\\d\\s,']*\\.?\\d*)/im);
                  if (lineBal) balance = normalizeAmountToken(lineBal[1]);
                  if (!equity || !balance) {
                    var compact = txt.replace(/[\\n\\r]+/g, ' ');
                    if (!equity) {
                      var e2 = compact.match(/Equity[:\\s]+([\\d][\\d\\s,']*\\.?\\d*)/i);
                      if (e2) equity = normalizeAmountToken(e2[1]);
                    }
                    if (!balance) {
                      var b2 = compact.match(/Balance[:\\s]+([\\d][\\d\\s,']*\\.?\\d*)/i);
                      if (b2) balance = normalizeAmountToken(b2[1]);
                    }
                  }
                  if (!equity) {
                    var e3 = txt.match(/\\bEquity\\b[^\\d\\n]{0,56}([\\d][\\d\\s,\\.']*)/im);
                    if (e3) equity = normalizeAmountToken(e3[1]);
                  }
                  if (!balance) {
                    var b3 = txt.match(/\\bBalance\\b[^\\d\\n]{0,56}([\\d][\\d\\s,\\.']*)/im);
                    if (b3) balance = normalizeAmountToken(b3[1]);
                  }
                  var cfp = txt.replace(/[\\n\\r\\t]+/g, ' ').replace(/\\s+/g, ' ');
                  var g1 = cfp.match(/(?:Floating|Unrealized)\\s*(?:P\\/?L|Profit)?\\s*[:#]?\\s*([-+]?[\\d][\\d\\s,']*\\.?\\d*)/i);
                  if (g1) floatingProfit = normalizeAmountToken(g1[1]);
                  if (floatingProfit == null) {
                    var g2 = cfp.match(/\\bP\\s*\\/?\\s*L\\s*[:#]?\\s*([-+]?[\\d][\\d\\s,']*\\.?\\d*)/i);
                    if (g2) floatingProfit = normalizeAmountToken(g2[1]);
                  }
                } catch (err) {}
                return { equity: equity, balance: balance, floatingProfit: floatingProfit };
              }

              function findMT5SearchField() {
                var q = [
                  'input[placeholder*="Search symbol" i]',
                  'input[placeholder*="symbol" i]',
                  'input[placeholder*="Search" i]',
                  'input[aria-label*="Search" i]',
                  'input[type="search"]'
                ];
                for (var qi = 0; qi < q.length; qi++) {
                  var el = document.querySelector(q[qi]);
                  if (!el || !el.offsetParent) continue;
                  if (q[qi].indexOf('type="search"') >= 0) {
                    var ph = ((el.getAttribute && el.getAttribute('placeholder')) || '').toLowerCase();
                    var nm = ((el.name || '') + '').toLowerCase();
                    if (ph.indexOf('login') >= 0 || ph.indexOf('password') >= 0 || nm === 'login' || nm === 'password') continue;
                  }
                  return el;
                }
                return null;
              }

              sendMessage('mt5_loaded', 'MT5 terminal loaded successfully');
              console.log('[MT5 Auth] Script initialized, waiting for page load...');
              
              const sleep = (ms) => new Promise(r => setTimeout(r, ms));
              
              // Store credentials
              const loginCredential = '${loginValue}';
              const passwordCredential = '${passwordValue}';
              const serverCredential = '${escapeValue(server || '')}';

              function isTerminalSessionVisible() {
                try {
                  var sb = document.querySelector('input[placeholder*="Search symbol" i]') ||
                           document.querySelector('input[placeholder*="Search" i]') ||
                           document.querySelector('input[type="search"]');
                  if (sb && sb.offsetParent) return true;
                  var txt = (document.body && document.body.innerText) ? document.body.innerText : '';
                  if (/\\bEquity\\b/i.test(txt) && /\\bBalance\\b/i.test(txt)) return true;
                  if (/\\bBid\\b/i.test(txt) && /\\bAsk\\b/i.test(txt)) return true;
                  var list = document.querySelectorAll('canvas');
                  for (var ci = 0; ci < list.length; ci++) {
                    var c = list[ci];
                    if ((c.width || 0) * (c.height || 0) >= 50000) return true;
                  }
                } catch (e) {}
                return false;
              }

              function isConnectModalVisible() {
                try {
                  var bt = (document.body && document.body.innerText) ? document.body.innerText : '';
                  if (bt.indexOf('Connect to account') < 0) return false;
                  var pwd = document.querySelector('input[type="password"]');
                  if (!pwd || !pwd.offsetParent) return false;
                  var rr = pwd.getBoundingClientRect();
                  return rr.width > 0 && rr.height > 0;
                } catch (e) { return false; }
              }

              function isPasswordInModalOverlay() {
                try {
                  var pwd = document.querySelector('input[type="password"]');
                  if (!pwd || !pwd.offsetParent) return false;
                  var rr = pwd.getBoundingClientRect();
                  if (rr.width < 8 || rr.height < 8) return false;
                  var node = pwd;
                  for (var d = 0; d < 28 && node; d++) {
                    var cls = String(node.className || '');
                    var z = parseInt(window.getComputedStyle(node).zIndex, 10) || 0;
                    var tag = (node.tagName || '').toUpperCase();
                    if (tag === 'DIALOG' || cls.indexOf('dialog') >= 0 || cls.indexOf('modal') >= 0 || cls.indexOf('popup') >= 0 || cls.indexOf('overlay') >= 0 || cls.indexOf('backdrop') >= 0 || cls.indexOf('sheet') >= 0 || node.getAttribute('aria-modal') === 'true' || z > 45) {
                      return true;
                    }
                    node = node.parentElement;
                  }
                } catch (e2) {}
                return false;
              }

              function isTradingAccountsSheetVisible() {
                try {
                  if (!isTerminalSessionVisible()) return false;
                  var bt = (document.body && document.body.innerText) ? document.body.innerText : '';
                  var hasTitle = bt.indexOf('Trading accounts') >= 0 || bt.indexOf('Trading account') >= 0 ||
                    (bt.indexOf('Razor Markets') >= 0 && (bt.indexOf('Connect to account') >= 0 || bt.indexOf('Remove') >= 0));
                  if (!hasTitle) return false;
                  if (bt.indexOf('Connect to account') < 0 && bt.indexOf('Remove') < 0) return false;
                  return true;
                } catch (e) { return false; }
              }

              function findTradingAccountsOverlayRoot() {
                try {
                  var candidates = document.querySelectorAll('div, section, aside, [role="dialog"], dialog');
                  var best = null;
                  var minArea = 1e12;
                  for (var i = 0; i < Math.min(candidates.length, 450); i++) {
                    var el = candidates[i];
                    if (!el.offsetParent) continue;
                    var txt = (el.innerText || '').trim();
                    if (txt.length < 40 || txt.length > 2500) continue;
                    if (txt.indexOf('Trading accounts') < 0 && txt.indexOf('Razor Markets') < 0) continue;
                    if (txt.indexOf('Connect to account') < 0 && txt.indexOf('Remove') < 0) continue;
                    var r = el.getBoundingClientRect();
                    var area = r.width * r.height;
                    if (r.width > 100 && r.height > 90 && area >= 12000 && area < minArea) {
                      minArea = area;
                      best = el;
                    }
                  }
                  if (best) return best;
                  var btns = document.querySelectorAll('button, [role="button"]');
                  for (var b = 0; b < Math.min(btns.length, 120); b++) {
                    var t = ((btns[b].innerText || btns[b].textContent || '') + '').trim().toLowerCase();
                    if (t.indexOf('connect') >= 0 && t.indexOf('account') >= 0) {
                      var node = btns[b];
                      for (var d = 0; d < 22 && node; d++) {
                        var inner = (node.innerText || '').trim();
                        if (inner.indexOf('Trading accounts') >= 0 || inner.indexOf('Razor Markets') >= 0) return node;
                        node = node.parentElement;
                      }
                    }
                  }
                } catch (e2) {}
                return null;
              }

              function hideTradingAccountsOverlayIfPresent() {
                try {
                  if (!isTradingAccountsSheetVisible()) return false;
                  var root = findTradingAccountsOverlayRoot();
                  if (root) {
                    root.style.display = 'none';
                    root.style.visibility = 'hidden';
                    root.style.pointerEvents = 'none';
                    return true;
                  }
                  var all = document.querySelectorAll('div, section, aside, [role="dialog"]');
                  for (var ai = 0; ai < Math.min(all.length, 350); ai++) {
                    var ae = all[ai];
                    if (!ae.offsetParent) continue;
                    var atxt = (ae.innerText || '').trim();
                    if (atxt.length > 4000 || atxt.length < 35) continue;
                    if ((atxt.indexOf('Trading accounts') >= 0 || atxt.indexOf('Razor Markets') >= 0) && atxt.indexOf('Connect to account') >= 0) {
                      var ar = ae.getBoundingClientRect();
                      if (ar.width > 120 && ar.height > 80) {
                        ae.style.display = 'none';
                        ae.style.visibility = 'hidden';
                        ae.style.pointerEvents = 'none';
                        return true;
                      }
                    }
                  }
                } catch (e3) {}
                return false;
              }

              function isAnyLoginModalBlocking() {
                if (isConnectModalVisible()) return true;
                if (isTradingAccountsSheetVisible()) return true;
                if (isTerminalSessionVisible() && isPasswordInModalOverlay()) return true;
                return false;
              }

              function findPasswordModalOverlayRoot() {
                try {
                  var pwd = document.querySelector('input[type="password"]');
                  if (!pwd || !pwd.offsetParent) return null;
                  var node = pwd;
                  for (var d = 0; d < 28 && node; d++) {
                    var cls = String(node.className || '');
                    var txt = (node.innerText || '').trim();
                    var z = parseInt(window.getComputedStyle(node).zIndex, 10) || 0;
                    var tag = (node.tagName || '').toUpperCase();
                    if (txt.indexOf('Connect to account') >= 0) return node;
                    if (txt.indexOf('Server') >= 0 && txt.indexOf('Password') >= 0 && txt.length < 500) return node;
                    if (tag === 'DIALOG' || cls.indexOf('dialog') >= 0 || cls.indexOf('modal') >= 0 || cls.indexOf('popup') >= 0 || cls.indexOf('overlay') >= 0 || cls.indexOf('backdrop') >= 0 || cls.indexOf('sheet') >= 0 || node.getAttribute('aria-modal') === 'true' || z > 50) {
                      return node;
                    }
                    node = node.parentElement;
                  }
                } catch (e2) {}
                return null;
              }

              function setInputValueForOverlay(el, val) {
                if (!el || val == null || val === '') return;
                try {
                  el.focus();
                  el.value = '';
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                  var nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') && Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                  if (nativeSetter) nativeSetter.call(el, val);
                  else el.value = val;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                  el.dispatchEvent(new Event('blur', { bubbles: true }));
                } catch (e) {}
              }

              const dismissLoginOverlay = async function() {
                var pw = passwordCredential;
                try {
                  hideTradingAccountsOverlayIfPresent();
                } catch (eT) {}
                try {
                  if (pw && isAnyLoginModalBlocking()) {
                    var pwdIn = document.querySelector('input[type="password"]');
                    if (pwdIn && (!pwdIn.value || String(pwdIn.value).trim() === '')) {
                      setInputValueForOverlay(pwdIn, pw);
                      await new Promise(function(r) { setTimeout(r, 400); });
                      var btns0 = document.querySelectorAll('button');
                      for (var b0 = 0; b0 < btns0.length; b0++) {
                        var t0 = ((btns0[b0].innerText || btns0[b0].textContent || '') + '').trim().toLowerCase();
                        if (t0.indexOf('connect') >= 0 && t0.indexOf('account') >= 0) {
                          btns0[b0].click();
                          sendMessage('step_update', 'Login modal: submitted password (Connect to account)');
                          await new Promise(function(r) { setTimeout(r, 2200); });
                          break;
                        }
                      }
                    }
                  }
                } catch (e0) {}
                try {
                  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
                  await new Promise(function(r) { setTimeout(r, 120); });
                  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
                } catch (e) {}
                await new Promise(function(r) { setTimeout(r, 200); });
                try {
                  var root = findPasswordModalOverlayRoot();
                  if (root) {
                    root.style.display = 'none';
                    root.style.visibility = 'hidden';
                    root.style.pointerEvents = 'none';
                    sendMessage('step_update', 'Hid login modal overlay (password form root)');
                  } else if (isAnyLoginModalBlocking()) {
                    var all = document.querySelectorAll('div, section, [role="dialog"], dialog');
                    for (var ai = 0; ai < Math.min(all.length, 250); ai++) {
                      var ae = all[ai];
                      if (!ae.offsetParent) continue;
                      var atxt = (ae.innerText || '').trim();
                      if (atxt.length > 500) continue;
                      if (atxt.indexOf('Connect to account') >= 0 || (atxt.indexOf('Server') >= 0 && atxt.indexOf('Password') >= 0 && atxt.indexOf('Login') >= 0)) {
                        var ar = ae.getBoundingClientRect();
                        if (ar.width > 160 && ar.height > 100) {
                          ae.style.display = 'none';
                          ae.style.visibility = 'hidden';
                          ae.style.pointerEvents = 'none';
                          sendMessage('step_update', 'Hid login modal (text match)');
                          break;
                        }
                      }
                    }
                  }
                } catch (e3) {}
                try {
                  if (isTerminalSessionVisible() && isPasswordInModalOverlay()) {
                    var root2 = findPasswordModalOverlayRoot();
                    if (root2) {
                      root2.style.display = 'none';
                      root2.style.visibility = 'hidden';
                      root2.style.pointerEvents = 'none';
                      sendMessage('step_update', 'Removed second login layer so terminal stays visible');
                    }
                  }
                } catch (e5) {}
                try {
                  var pwd = document.querySelector('input[type="password"]');
                  var sb = document.querySelector('input[placeholder*="Search symbol" i]') ||
                           document.querySelector('input[placeholder*="Search" i]') ||
                           document.querySelector('input[type="search"]');
                  if (pwd && pwd.offsetParent && sb && sb.offsetParent) {
                    var node = pwd;
                    for (var d = 0; d < 18 && node; d++) {
                      node = node.parentElement;
                      if (!node) break;
                      var cls = String(node.className || '');
                      var z = parseInt(window.getComputedStyle(node).zIndex, 10) || 0;
                      if (node.tagName === 'DIALOG' || cls.indexOf('dialog') >= 0 || cls.indexOf('modal') >= 0 || cls.indexOf('popup') >= 0 || cls.indexOf('overlay') >= 0 || cls.indexOf('backdrop') >= 0 || z > 40) {
                        node.style.display = 'none';
                        node.style.visibility = 'hidden';
                        node.style.pointerEvents = 'none';
                        sendMessage('step_update', 'Dismissed login layer blocking chart');
                        break;
                      }
                    }
                  }
                } catch (e4) {}
                try {
                  hideTradingAccountsOverlayIfPresent();
                } catch (eT2) {}
              };
              
              const authenticateMT5 = async () => {
                try {
                  console.log('[MT5 Auth] Starting authentication process...');
                  sendMessage('step_update', 'Initializing MT5 Account...');
                  await sleep(5500);
                  console.log('[MT5 Auth] Initial wait complete, checking for existing connections...');
                  
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
                  
                  // Remove existing connection - find Remove button (works across different broker terminals)
                  const findAndClickRemove = () => {
                    const allClickables = document.querySelectorAll('button, a, [role="button"], .button');
                    for (const el of allClickables) {
                      const text = (el.textContent || '').trim().toLowerCase();
                      const isRed = el.className && (el.className.includes('red') || el.style.color === 'red');
                      if (text === 'remove' || text.includes('remove') || text === 'disconnect' || (isRed && text.includes('remove'))) {
                        return el;
                      }
                    }
                    return null;
                  };
                  for (let attempt = 0; attempt < 3; attempt++) {
                    const removeBtn = findAndClickRemove();
                    if (removeBtn) {
                      sendMessage('step_update', 'Removing existing connection...');
                      removeBtn.click();
                      await sleep(4500);
                    } else break;
                  }
                  
                  // Wait for form to be ready
                  await sleep(2000);
                  
                  // Fill login credentials with enhanced field detection
                  const loginField = document.querySelector('input[name="login"]') || 
                                    document.querySelector('input[type="text"][placeholder*="login" i]') ||
                                    document.querySelector('input[type="number"]') ||
                                    document.querySelector('input#login');
                  
                  const passwordField = document.querySelector('input[name="password"]') || 
                                       document.querySelector('input[type="password"]') ||
                                       document.querySelector('input#password');
                  
                  // Fill login field
                  if (loginField && loginCredential) {
                    console.log('[MT5 Auth] Found login field, filling credentials...');
                    loginField.focus();
                    loginField.value = '';
                    loginField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    loginField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                    
                    setTimeout(() => {
                    loginField.focus();
                      loginField.value = loginCredential;
                    loginField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    loginField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                      console.log('[MT5 Auth] Login field filled');
                    sendMessage('step_update', 'Login filled');
                    }, 100);
                  } else {
                    console.error('[MT5 Auth] Login field not found! Available inputs:', document.querySelectorAll('input').length);
                    sendMessage('authentication_failed', 'Login field not found');
                    return;
                  }
                  
                  // Fill password field
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
                  
                  // Wait for fields to be filled
                  await sleep(2000);
                  
                  // Click login button
                  sendMessage('step_update', 'Connecting to Server...');
                  console.log('[MT5 Auth] Looking for login button...');
                  const loginButton = document.querySelector('.button.svelte-1wrky82.active') ||
                                     document.querySelector('button[type="submit"]') ||
                                     document.querySelector('.button.active') ||
                                     Array.from(document.querySelectorAll('button')).find(btn => 
                                       btn.textContent.trim().toLowerCase().includes('login') ||
                                       btn.textContent.trim().toLowerCase().includes('connect')
                                     );
                  
                  if (loginButton) {
                    console.log('[MT5 Auth] Found login button, clicking...');
                    loginButton.click();
                    console.log('[MT5 Auth] Login button clicked, waiting for connection...');
                    await sleep(8000);
                    for (var ov = 0; ov < 6; ov++) {
                      await dismissLoginOverlay();
                      await sleep(600);
                    }
                  } else {
                    console.error('[MT5 Auth] Login button not found! Available buttons:', document.querySelectorAll('button').length);
                    sendMessage('authentication_failed', 'Login button not found');
                    return;
                  }
                  
                  sendMessage('step_update', 'Verifying authentication...');
                  await sleep(3000);
                  for (var ov2 = 0; ov2 < 6; ov2++) {
                    await dismissLoginOverlay();
                    if (!isAnyLoginModalBlocking()) break;
                    await sleep(450);
                  }

                  function tryFinishWithScrapedStats(successMsg) {
                    var st = scrapeTerminalAccountStats();
                    if (st.equity && st.balance) {
                      sendMessage('authentication_success', successMsg, { equity: st.equity, balance: st.balance });
                      return true;
                    }
                    return false;
                  }

                  for (var poll = 0; poll < 14; poll++) {
                    if (tryFinishWithScrapedStats('MT5 Login Successful - Balance and equity')) return;
                    await dismissLoginOverlay();
                    await sleep(900);
                  }

                  var searchField = findMT5SearchField();
                  if (searchField) {
                    await dismissLoginOverlay();
                    await sleep(2000);
                    if (tryFinishWithScrapedStats('MT5 Login Successful - Terminal ready')) return;
                    var statsOk = scrapeTerminalAccountStats();
                    sendMessage('authentication_success', 'MT5 Login Successful - Search bar detected', { equity: statsOk.equity, balance: statsOk.balance });
                    return;
                  }

                  await sleep(3000);
                  await dismissLoginOverlay();
                  for (var poll2 = 0; poll2 < 8; poll2++) {
                    if (tryFinishWithScrapedStats('MT5 Login Successful - Balance and equity')) return;
                    await dismissLoginOverlay();
                    await sleep(700);
                  }

                  var searchFieldRetry = findMT5SearchField();
                  if (searchFieldRetry) {
                    await dismissLoginOverlay();
                    if (tryFinishWithScrapedStats('MT5 Login Successful - Terminal ready')) return;
                    var statsRetry = scrapeTerminalAccountStats();
                    sendMessage('authentication_success', 'MT5 Login Successful - Search bar detected', { equity: statsRetry.equity, balance: statsRetry.balance });
                    return;
                  }

                  if (tryFinishWithScrapedStats('MT5 Login Successful - Balance and equity')) return;

                  var low = ((document.body && document.body.innerText) ? document.body.innerText : '').toLowerCase();
                  if (
                    low.indexOf('invalid login') >= 0 ||
                    low.indexOf('invalid password') >= 0 ||
                    low.indexOf('wrong password') >= 0 ||
                    low.indexOf('wrong login') >= 0 ||
                    low.indexOf('incorrect password') >= 0 ||
                    low.indexOf('incorrect login') >= 0
                  ) {
                    sendMessage('authentication_failed', 'Authentication failed - Invalid login or password');
                  } else {
                    sendMessage('authentication_failed', 'Could not verify MT5 session. If the chart is visible, wait a few seconds and try Link Account again.');
                  }
                  
                } catch(e) {
                  sendMessage('authentication_failed', 'Error during authentication: ' + e.message);
                }
              };
               
              // Start authentication after page loads
              setTimeout(authenticateMT5, 3000);
            })();
        `;

          // Inject script before closing body tag (EXACTLY like Android)
          // The script is already embedded in the HTML string, just need to insert it
          if (html.includes('</body>')) {
            html = html.replace('</body>', `<script>${authScript}</script></body>`);
            console.log('✅ MT5 authentication script injected before </body> tag');
          } else if (html.includes('</html>')) {
            html = html.replace('</html>', `<script>${authScript}</script></html>`);
            console.log('✅ MT5 authentication script injected before </html> tag');
          } else {
            html += `<script>${authScript}</script>`;
            console.log('✅ MT5 authentication script appended to HTML');
          }

          // Verify script was injected
          if (html.includes('authenticateMT5')) {
            console.log('✅ Script injection verified - authenticateMT5 function found in HTML');
                     } else {
            console.error('❌ Script injection failed - authenticateMT5 function not found in HTML');
          }

          // Return modified HTML with CORS headers
          return new Response(html, {
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
              'X-Frame-Options': 'SAMEORIGIN',
            },
          });
        } catch (error) {
          console.error('MT5 Proxy error:', error);
          return new Response(`Proxy error: ${error.message}`, { status: 500 });
        }
      }
      return new Response('Method Not Allowed', { status: 405 });
    }

    // MT5 Trading Proxy endpoint - fetches MT5 terminal and injects trading script (EXACTLY like Android)
    if (pathname === '/api/mt5-trading-proxy') {
      if (request.method === 'GET') {
        const terminalUrl = url.searchParams.get('url');
        const login = url.searchParams.get('login');
        const password = url.searchParams.get('password');
        const broker = url.searchParams.get('broker') || '';
        const symbol = url.searchParams.get('symbol') || '';
        const action = url.searchParams.get('action') || '';
        const sl = url.searchParams.get('sl') || '';
        const tp = url.searchParams.get('tp') || '';
        const volume = url.searchParams.get('volume') || '0.01';
        const robotName = url.searchParams.get('robotName') || 'EA Trade';
        const numberOfTrades = url.searchParams.get('numberOfTrades') || '1';
        const chartWarmup = url.searchParams.get('chartWarmup') === '1';

        if (!terminalUrl) {
          return new Response('Missing terminal URL', { status: 400 });
        }

        try {
          // Fetch the MT5 terminal page (same as auth proxy)
          const response = await fetch(terminalUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
          });

          if (!response.ok) {
            return new Response(`Failed to fetch terminal: ${response.statusText}`, { status: response.status });
          }

          let html = await response.text();

          // Get base URL and fix URLs (same as auth proxy)
          const baseUrlObj = new URL(terminalUrl);
          const baseUrl = `${baseUrlObj.protocol}//${baseUrlObj.host}`;
          const wsBaseUrl = baseUrl.replace('http://', 'ws://').replace('https://', 'wss://');
          const isRootTerminal = !terminalUrl.replace(/\/$/, '').endsWith('/terminal');

          const proxyOrigin = url.protocol === 'https:' || url.hostname.includes('onrender.com')
            ? `https://${url.hostname}${url.port ? `:${url.port}` : ''}`
            : url.origin;

          // Fix relative URLs - root terminals: route ALL paths through proxy
          html = html.replace(/href="\/([^"]+)"/g, (match, path) => {
            if (path.startsWith('terminal/')) {
              return `href="${proxyOrigin}/terminal/${path.replace('terminal/', '')}?broker=${encodeURIComponent(broker)}"`;
            }
            if (isRootTerminal) return `href="${proxyOrigin}/terminal/${path}?broker=${encodeURIComponent(broker)}"`;
            return `href="${baseUrl}/${path}"`;
          });
          html = html.replace(/src="\/([^"]+)"/g, (match, path) => {
            if (path.startsWith('terminal/')) {
              return `src="${proxyOrigin}/terminal/${path.replace('terminal/', '')}?broker=${encodeURIComponent(broker)}"`;
            }
            if (isRootTerminal) return `src="${proxyOrigin}/terminal/${path}?broker=${encodeURIComponent(broker)}"`;
            return `src="${baseUrl}/${path}"`;
          });
          html = html.replace(/url\("\/\/([^"]+)"\)/g, (match, path) => {
            if (path.startsWith('terminal/')) {
              return `url("${proxyOrigin}/terminal/${path.replace('terminal/', '')}?broker=${encodeURIComponent(broker)}")`;
            }
            return `url("${baseUrl}/${path}")`;
          });
          html = html.replace(/url\('\/\/([^']+)'\)/g, (match, path) => {
            if (path.startsWith('terminal/')) {
              return `url('${proxyOrigin}/terminal/${path.replace('terminal/', '')}?broker=${encodeURIComponent(broker)}')`;
            }
            return `url('${baseUrl}/${path}')`;
          });

          html = html.replace(new RegExp(`${baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/terminal/([^"'>\\s]+)`, 'g'), (match, assetPath) => {
            return `${proxyOrigin}/terminal/${assetPath}?broker=${encodeURIComponent(broker)}`;
          });

          // Fix WebSocket URLs
          const proxyDomain = url.origin;
          const proxyHost = proxyDomain.replace(/https?:\/\//, '').replace(/\./g, '\\.');

          html = html.replace(new RegExp(`wss?://${proxyHost}/terminal/ws`, 'gi'), `${wsBaseUrl}/terminal/ws`);
          html = html.replace(new RegExp(`wss?://${proxyHost}/terminal/`, 'gi'), `${wsBaseUrl}/terminal/`);

          html = html.replace(
            /(new\s+WebSocket\s*\(\s*['"`])(wss?:\/\/)(window\.location\.(origin|hostname)|location\.(origin|hostname))(['"`])/g,
            `$1${wsBaseUrl}/terminal/ws$6`
          );

          // Inject WebSocket override script - run first to catch terminal's WebSocket URLs (including /terminal without /ws)
          const proxyHostPlain = url.hostname;
          const wsOverrideScript = `
            (function() {
              const originalWebSocket = window.WebSocket;
              const brokerWsUrl = '${wsBaseUrl}/terminal/ws';
              const proxyHost = '${proxyHostPlain}';
              const brokerHost = '${baseUrlObj.host}';
              window.WebSocket = function(url, protocols) {
                if (url && typeof url === 'string') {
                  const isToProxy = url.includes(proxyHost) || (url.includes('/terminal') && !url.includes(brokerHost));
                  if (isToProxy) {
                    return new originalWebSocket(brokerWsUrl, protocols);
                  }
                }
                return new originalWebSocket(url, protocols);
              };
              Object.setPrototypeOf(window.WebSocket, originalWebSocket);
              window.WebSocket.prototype = originalWebSocket.prototype;
              window.WebSocket.CONNECTING = originalWebSocket.CONNECTING;
              window.WebSocket.OPEN = originalWebSocket.OPEN;
              window.WebSocket.CLOSING = originalWebSocket.CLOSING;
              window.WebSocket.CLOSED = originalWebSocket.CLOSED;
            })();
          `;

          if (html.includes('</head>')) {
            html = html.replace('</head>', `<script>${wsOverrideScript}</script></head>`);
          } else if (html.includes('<head>')) {
            html = html.replace('<head>', `<head><script>${wsOverrideScript}</script>`);
                       } else {
            html = `<script>${wsOverrideScript}</script>` + html;
          }

          // Escape values for safe injection
          const escapeValue = (value: string) => {
            return (value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
          };

          const loginValue = escapeValue(login || '');
          const passwordValue = escapeValue(password || '');
          const symbolValue = escapeValue(symbol || '');
          const actionValue = escapeValue(action || '');
          const slValue = escapeValue(sl || '');
          const tpValue = escapeValue(tp || '');
          const volumeValue = escapeValue(volume || '0.01');
          const orderCommentForMt5 = `${(robotName || 'EA Trade').trim()} - EA TRADE`;
          const robotNameValue = escapeValue(orderCommentForMt5);
          const numberOfTradesValue = escapeValue(numberOfTrades || '1');
          const isChartWarmupJs = chartWarmup ? 'true' : 'false';

          // Generate trading script - EXACT COPY from Android mt5-signal-webview.tsx generateMT5AuthScript()
          // This includes authentication + trading logic - MUST BE IDENTICAL TO ANDROID VERSION
          const tradingScript = `
            (function() {
              console.log('[MT5 Trading] Script injected and executing...');
              
              const sendMessage = (type, message, extras) => {
                try {
                  if (type === 'chart_screenshot' && window.__eaChartScreenshotSent) {
                    return;
                  }
                  var payload = { type: type, message: message };
                  if (extras && typeof extras === 'object') {
                    for (var ek in extras) {
                      if (Object.prototype.hasOwnProperty.call(extras, ek) && extras[ek] != null) {
                        payload[ek] = extras[ek];
                      }
                    }
                  }
                  if (type === 'chart_screenshot') {
                    window.__eaChartScreenshotSent = true;
                  }
                  var messageData = JSON.stringify(payload);
                  if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(messageData);
                  } else if (window.parent && window.parent !== window) {
                    window.parent.postMessage(messageData, '*');
                  }
                  console.log('[MT5 Trading] Message sent:', type, message);
                } catch(e) {
                  console.error('[MT5 Trading] Error sending message:', e);
                }
              };

              function scrapeTerminalAccountStats() {
                var equity = null;
                var balance = null;
                var fpOut = null;
                try {
                  var txt = (document.body && document.body.innerText) ? document.body.innerText : '';
                  var lineEq = txt.match(/(?:^|[\\n\\r])\\s*Equity\\s*[:\\s]+([\\d][\\d\\s,]*\\.?\\d*)/im);
                  if (lineEq) equity = lineEq[1].replace(/\\s/g, '').replace(/,/g, '');
                  var lineBal = txt.match(/(?:^|[\\n\\r])\\s*Balance\\s*[:\\s]+([\\d][\\d\\s,]*\\.?\\d*)/im);
                  if (lineBal) balance = lineBal[1].replace(/\\s/g, '').replace(/,/g, '');
                  if (!equity || !balance) {
                    var compact = txt.replace(/[\\n\\r]+/g, ' ');
                    if (!equity) {
                      var e2 = compact.match(/Equity[:\\s]+([\\d][\\d\\s,]*\\.?\\d*)/i);
                      if (e2) equity = e2[1].replace(/\\s/g, '').replace(/,/g, '');
                    }
                    if (!balance) {
                      var b2 = compact.match(/Balance[:\\s]+([\\d][\\d\\s,]*\\.?\\d*)/i);
                      if (b2) balance = b2[1].replace(/\\s/g, '').replace(/,/g, '');
                    }
                  }
                  fpOut = null;
                  var cfx = txt.replace(/[\\n\\r\\t]+/g, ' ').replace(/\\s+/g, ' ');
                  var gf1 = cfx.match(/(?:Floating|Unrealized)\\s*(?:P\\/?L|Profit)?\\s*[:#]?\\s*([-+]?[\\d][\\d\\s,]*\\.?\\d*)/i);
                  if (gf1) fpOut = gf1[1].replace(/\\s/g, '').replace(/,/g, '');
                  if (fpOut == null) {
                    var gf2 = cfx.match(/\\bP\\s*\\/?\\s*L\\s*[:#]?\\s*([-+]?[\\d][\\d\\s,]*\\.?\\d*)/i);
                    if (gf2) fpOut = gf2[1].replace(/\\s/g, '').replace(/,/g, '');
                  }
                } catch (err) {}
                return { equity: equity, balance: balance, floatingProfit: fpOut };
              }

              sendMessage('mt5_loaded', 'MT5 terminal loaded successfully');
              console.log('[MT5 Trading] Script initialized, waiting for page load...');
              
              const sleep = (ms) => new Promise(r => setTimeout(r, ms));
              const isChartWarmup = ${isChartWarmupJs};

              // Prevent page reloads and navigation
              window.addEventListener('beforeunload', function(e) {
                e.preventDefault();
                e.returnValue = '';
                return '';
              });
              
              document.addEventListener('keydown', function(e) {
                if ((e.key === 'F5' || (e.ctrlKey && e.key === 'r') || (e.ctrlKey && e.key === 'R'))) {
                  e.preventDefault();
                  return false;
                }
              });
              
              const originalReload = window.location.reload;
              window.location.reload = function() {
                console.log('Page reload prevented');
                return false;
              };
              
              // Override console methods to suppress warnings
              const originalWarn = console.warn;
              const originalError = console.error;
              const originalLog = console.log;
              
              function shouldSuppress(message) {
                return message.includes('interactive-widget') || 
                       message.includes('viewport') ||
                       message.includes('Viewport argument key') ||
                       message.includes('AES-CBC') ||
                       message.includes('AES-CTR') ||
                       message.includes('AES-GCM') ||
                       message.includes('chosen-ciphertext') ||
                       message.includes('authentication by default') ||
                       message.includes('not recognized and ignored');
              }
              
              console.warn = function(...args) {
                const message = args.join(' ');
                if (shouldSuppress(message)) return;
                originalWarn.apply(console, args);
              };
              
              console.error = function(...args) {
                const message = args.join(' ');
                if (shouldSuppress(message)) return;
                originalError.apply(console, args);
              };
              
              console.log = function(...args) {
                const message = args.join(' ');
                if (shouldSuppress(message)) return;
                originalLog.apply(console, args);
              };

              // Override WebSocket to redirect to broker (proxy /terminal or /terminal/ws -> broker /terminal/ws)
              const originalWebSocket = window.WebSocket;
              const brokerWsUrl = '${wsBaseUrl}/terminal/ws';
              const proxyHostPlain = '${url.hostname}';
              window.WebSocket = function(url, protocols) {
                console.log('WebSocket connection attempt to:', url);
                const isToProxy = url && typeof url === 'string' && (url.includes(proxyHostPlain) || (url.includes('/terminal') && !url.includes('${baseUrlObj.host}')));
                if (isToProxy) {
                  console.log('Redirecting WebSocket to broker:', brokerWsUrl);
                  return new originalWebSocket(brokerWsUrl, protocols);
                }
                return new originalWebSocket(url, protocols);
              };
              
              Object.setPrototypeOf(window.WebSocket, originalWebSocket);
              Object.defineProperty(window.WebSocket, 'prototype', {
                value: originalWebSocket.prototype,
                writable: false
              });

              const loginCredential = '${loginValue}';
              const passwordCredential = '${passwordValue}';

              function isTerminalSessionVisible() {
                try {
                  const sb = document.querySelector('input[placeholder*="Search symbol" i]') ||
                           document.querySelector('input[placeholder*="Search" i]') ||
                           document.querySelector('input[type="search"]');
                  if (sb && sb.offsetParent) return true;
                  const txt = (document.body && document.body.innerText) ? document.body.innerText : '';
                  if (/\bEquity\b/i.test(txt) && /\bBalance\b/i.test(txt)) return true;
                  if (/\bBid\b/i.test(txt) && /\bAsk\b/i.test(txt)) return true;
                  const list = document.querySelectorAll('canvas');
                  for (let ci = 0; ci < list.length; ci++) {
                    const c = list[ci];
                    if ((c.width || 0) * (c.height || 0) >= 50000) return true;
                  }
                } catch (e) {}
                return false;
              }

              function isConnectModalVisible() {
                try {
                  const bt = (document.body && document.body.innerText) ? document.body.innerText : '';
                  if (bt.indexOf('Connect to account') < 0) return false;
                  const pwd = document.querySelector('input[type="password"]');
                  if (!pwd || !pwd.offsetParent) return false;
                  const rr = pwd.getBoundingClientRect();
                  return rr.width > 0 && rr.height > 0;
                } catch (e) { return false; }
              }

              function isPasswordInModalOverlay() {
                try {
                  const pwd = document.querySelector('input[type="password"]');
                  if (!pwd || !pwd.offsetParent) return false;
                  const rr = pwd.getBoundingClientRect();
                  if (rr.width < 8 || rr.height < 8) return false;
                  let node = pwd;
                  for (let d = 0; d < 28 && node; d++) {
                    const cls = String(node.className || '');
                    const z = parseInt(window.getComputedStyle(node).zIndex, 10) || 0;
                    const tag = (node.tagName || '').toUpperCase();
                    if (tag === 'DIALOG' || cls.indexOf('dialog') >= 0 || cls.indexOf('modal') >= 0 || cls.indexOf('popup') >= 0 || cls.indexOf('overlay') >= 0 || cls.indexOf('backdrop') >= 0 || cls.indexOf('sheet') >= 0 || node.getAttribute('aria-modal') === 'true' || z > 45) {
                      return true;
                    }
                    node = node.parentElement;
                  }
                } catch (e2) {}
                return false;
              }

              function isTradingAccountsSheetVisible() {
                try {
                  if (!isTerminalSessionVisible()) return false;
                  const bt = (document.body && document.body.innerText) ? document.body.innerText : '';
                  const hasTitle = bt.indexOf('Trading accounts') >= 0 || bt.indexOf('Trading account') >= 0 ||
                    (bt.indexOf('Razor Markets') >= 0 && (bt.indexOf('Connect to account') >= 0 || bt.indexOf('Remove') >= 0));
                  if (!hasTitle) return false;
                  if (bt.indexOf('Connect to account') < 0 && bt.indexOf('Remove') < 0) return false;
                  return true;
                } catch (e) { return false; }
              }

              function findTradingAccountsOverlayRoot() {
                try {
                  const candidates = document.querySelectorAll('div, section, aside, [role="dialog"], dialog');
                  let best = null;
                  let minArea = 1e12;
                  for (let i = 0; i < Math.min(candidates.length, 450); i++) {
                    const el = candidates[i];
                    if (!el.offsetParent) continue;
                    const txt = (el.innerText || '').trim();
                    if (txt.length < 40 || txt.length > 2500) continue;
                    if (txt.indexOf('Trading accounts') < 0 && txt.indexOf('Razor Markets') < 0) continue;
                    if (txt.indexOf('Connect to account') < 0 && txt.indexOf('Remove') < 0) continue;
                    const r = el.getBoundingClientRect();
                    const area = r.width * r.height;
                    if (r.width > 100 && r.height > 90 && area >= 12000 && area < minArea) {
                      minArea = area;
                      best = el;
                    }
                  }
                  if (best) return best;
                  const btns = document.querySelectorAll('button, [role="button"]');
                  for (let b = 0; b < Math.min(btns.length, 120); b++) {
                    const t = ((btns[b].innerText || btns[b].textContent || '') + '').trim().toLowerCase();
                    if (t.indexOf('connect') >= 0 && t.indexOf('account') >= 0) {
                      let node = btns[b];
                      for (let d = 0; d < 22 && node; d++) {
                        const inner = (node.innerText || '').trim();
                        if (inner.indexOf('Trading accounts') >= 0 || inner.indexOf('Razor Markets') >= 0) return node;
                        node = node.parentElement;
                      }
                    }
                  }
                } catch (e2) {}
                return null;
              }

              function hideTradingAccountsOverlayIfPresent() {
                try {
                  if (!isTradingAccountsSheetVisible()) return false;
                  const root = findTradingAccountsOverlayRoot();
                  if (root) {
                    root.style.display = 'none';
                    root.style.visibility = 'hidden';
                    root.style.pointerEvents = 'none';
                    return true;
                  }
                  const all = document.querySelectorAll('div, section, aside, [role="dialog"]');
                  for (let ai = 0; ai < Math.min(all.length, 350); ai++) {
                    const ae = all[ai];
                    if (!ae.offsetParent) continue;
                    const atxt = (ae.innerText || '').trim();
                    if (atxt.length > 4000 || atxt.length < 35) continue;
                    if ((atxt.indexOf('Trading accounts') >= 0 || atxt.indexOf('Razor Markets') >= 0) && atxt.indexOf('Connect to account') >= 0) {
                      const ar = ae.getBoundingClientRect();
                      if (ar.width > 120 && ar.height > 80) {
                        ae.style.display = 'none';
                        ae.style.visibility = 'hidden';
                        ae.style.pointerEvents = 'none';
                        return true;
                      }
                    }
                  }
                } catch (e3) {}
                return false;
              }

              function isAnyLoginModalBlocking() {
                if (isConnectModalVisible()) return true;
                if (isTradingAccountsSheetVisible()) return true;
                if (isTerminalSessionVisible() && isPasswordInModalOverlay()) return true;
                return false;
              }

              function findPasswordModalOverlayRoot() {
                try {
                  const pwd = document.querySelector('input[type="password"]');
                  if (!pwd || !pwd.offsetParent) return null;
                  let node = pwd;
                  for (let d = 0; d < 28 && node; d++) {
                    const cls = String(node.className || '');
                    const txt = (node.innerText || '').trim();
                    const z = parseInt(window.getComputedStyle(node).zIndex, 10) || 0;
                    const tag = (node.tagName || '').toUpperCase();
                    if (txt.indexOf('Connect to account') >= 0) return node;
                    if (txt.indexOf('Server') >= 0 && txt.indexOf('Password') >= 0 && txt.length < 500) return node;
                    if (tag === 'DIALOG' || cls.indexOf('dialog') >= 0 || cls.indexOf('modal') >= 0 || cls.indexOf('popup') >= 0 || cls.indexOf('overlay') >= 0 || cls.indexOf('backdrop') >= 0 || cls.indexOf('sheet') >= 0 || node.getAttribute('aria-modal') === 'true' || z > 50) {
                      return node;
                    }
                    node = node.parentElement;
                  }
                } catch (e2) {}
                return null;
              }

              function setInputValueForOverlay(el, val) {
                if (!el || val == null || val === '') return;
                try {
                  el.focus();
                  el.value = '';
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
                  const nativeSetter = desc && desc.set;
                  if (nativeSetter) nativeSetter.call(el, val);
                  else el.value = val;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                  el.dispatchEvent(new Event('blur', { bubbles: true }));
                } catch (e) {}
              }

              function visitAllFramesDeep(visitor) {
                function walk(d) {
                  if (!d) return;
                  try {
                    visitor(d);
                    var iframes = d.querySelectorAll('iframe');
                    for (var i = 0; i < iframes.length; i++) {
                      try {
                        var ind = iframes[i].contentDocument;
                        if (ind) walk(ind);
                      } catch (e) {}
                    }
                  } catch (e2) {}
                }
                walk(document);
              }

              async function acceptDisclaimersAndConfirmDeep() {
                var maxPasses = 4;
                for (var pass = 0; pass < maxPasses; pass++) {
                  var changed = false;
                  visitAllFramesDeep(function(d) {
                    try {
                      var disc = d.querySelector('#disclaimer');
                      if (disc && disc.offsetParent) {
                        var ab = d.querySelector('.accept-button');
                        if (ab) {
                          ab.click();
                          changed = true;
                          sendMessage('step_update', 'Accepted broker disclaimer');
                        }
                      }
                    } catch (e) {}
                  });
                  visitAllFramesDeep(function(d) {
                    try {
                      var txt = (d.body && d.body.innerText) ? d.body.innerText : '';
                      var low = txt.toLowerCase();
                      if (low.indexOf('one click') < 0 && low.indexOf('one-click') < 0) return;
                      if (low.indexOf('disclaimer') < 0 && low.indexOf('terms and conditions') < 0) return;
                      var boxes = d.querySelectorAll('input[type="checkbox"]');
                      var hit = false;
                      for (var i = 0; i < boxes.length; i++) {
                        var cb = boxes[i];
                        if (!cb.offsetParent || cb.checked) continue;
                        var labTxt = '';
                        if (cb.labels && cb.labels.length) labTxt = (cb.labels[0].innerText || '') + '';
                        try {
                          var wrapLab = cb.closest('label');
                          if (wrapLab) labTxt += ' ' + (wrapLab.innerText || '');
                        } catch (eL) {}
                        var labLow = (labTxt + '').toLowerCase();
                        if (labLow.indexOf('accept') >= 0 || labLow.indexOf('terms') >= 0 || labLow.indexOf('condition') >= 0) {
                          cb.click();
                          hit = true;
                          changed = true;
                          sendMessage('step_update', 'Accepted One Click Trading checkbox');
                          break;
                        }
                      }
                      if (!hit) {
                        for (var j = 0; j < boxes.length; j++) {
                          var c2 = boxes[j];
                          if (c2.offsetParent && !c2.checked) {
                            c2.click();
                            changed = true;
                            sendMessage('step_update', 'Accepted terms checkbox');
                            break;
                          }
                        }
                      }
                    } catch (e2) {}
                  });
                  visitAllFramesDeep(function(d) {
                    try {
                      var ttxt = (d.body && d.body.innerText) ? d.body.innerText : '';
                      if (!/one click|disclaimer|terms/i.test(ttxt)) return;
                      var btns = d.querySelectorAll('button, [role="button"], a');
                      for (var k = 0; k < btns.length; k++) {
                        var el = btns[k];
                        if (!el.offsetParent) continue;
                        var t = ((el.innerText || el.textContent || '') + '').trim().toLowerCase();
                        if (
                          t === 'ok' ||
                          t === 'accept' ||
                          t === 'continue' ||
                          t.indexOf('i agree') >= 0 ||
                          t.indexOf('i accept') >= 0 ||
                          (t.indexOf('confirm') >= 0 && t.length < 24)
                        ) {
                          el.click();
                          changed = true;
                          sendMessage('step_update', 'Confirmed disclaimer dialog');
                          break;
                        }
                      }
                    } catch (e3) {}
                  });
                  if (!changed) break;
                  await new Promise(function(r) { setTimeout(r, 500); });
                }
              }

              const dismissLoginOverlay = async () => {
                try {
                  hideTradingAccountsOverlayIfPresent();
                } catch (eT) {}
                try {
                  if (passwordCredential && isAnyLoginModalBlocking()) {
                    const pwdIn = document.querySelector('input[type="password"]');
                    if (pwdIn && (!pwdIn.value || String(pwdIn.value).trim() === '')) {
                      setInputValueForOverlay(pwdIn, passwordCredential);
                      await sleep(400);
                      const btns0 = document.querySelectorAll('button');
                      for (let b0 = 0; b0 < btns0.length; b0++) {
                        const t0 = ((btns0[b0].innerText || btns0[b0].textContent || '') + '').trim().toLowerCase();
                        if (t0.indexOf('connect') >= 0 && t0.indexOf('account') >= 0) {
                          btns0[b0].click();
                          sendMessage('step_update', 'Login modal: submitted password (Connect to account)');
                          await sleep(2200);
                          break;
                        }
                      }
                    }
                  }
                } catch (e0) {}
                try {
                  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
                  await sleep(120);
                  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
                } catch (e) {}
                await sleep(200);
                try {
                  const root = findPasswordModalOverlayRoot();
                  if (root) {
                    root.style.display = 'none';
                    root.style.visibility = 'hidden';
                    root.style.pointerEvents = 'none';
                    sendMessage('step_update', 'Hid login modal overlay (password form root)');
                  } else if (isAnyLoginModalBlocking()) {
                    const all = document.querySelectorAll('div, section, [role="dialog"], dialog');
                    for (let ai = 0; ai < Math.min(all.length, 250); ai++) {
                      const ae = all[ai];
                      if (!ae.offsetParent) continue;
                      const atxt = (ae.innerText || '').trim();
                      if (atxt.length > 500) continue;
                      if (atxt.indexOf('Connect to account') >= 0 || (atxt.indexOf('Server') >= 0 && atxt.indexOf('Password') >= 0 && atxt.indexOf('Login') >= 0)) {
                        const ar = ae.getBoundingClientRect();
                        if (ar.width > 160 && ar.height > 100) {
                          ae.style.display = 'none';
                          ae.style.visibility = 'hidden';
                          ae.style.pointerEvents = 'none';
                          sendMessage('step_update', 'Hid login modal (text match)');
                          break;
                        }
                      }
                    }
                  }
                } catch (e3) {}
                try {
                  if (isTerminalSessionVisible() && isPasswordInModalOverlay()) {
                    const root2 = findPasswordModalOverlayRoot();
                    if (root2) {
                      root2.style.display = 'none';
                      root2.style.visibility = 'hidden';
                      root2.style.pointerEvents = 'none';
                      sendMessage('step_update', 'Removed second login layer so terminal stays visible');
                    }
                  }
                } catch (e5) {}
                try {
                  const pwd = document.querySelector('input[type="password"]');
                  const sb = document.querySelector('input[placeholder*="Search symbol" i]') ||
                           document.querySelector('input[placeholder*="Search" i]') ||
                           document.querySelector('input[type="search"]');
                  if (pwd && pwd.offsetParent && sb && sb.offsetParent) {
                    let node = pwd;
                    for (let d = 0; d < 18 && node; d++) {
                      node = node.parentElement;
                      if (!node) break;
                      const cls = String(node.className || '');
                      const z = parseInt(window.getComputedStyle(node).zIndex, 10) || 0;
                      if (node.tagName === 'DIALOG' || cls.indexOf('dialog') >= 0 || cls.indexOf('modal') >= 0 || cls.indexOf('popup') >= 0 || cls.indexOf('overlay') >= 0 || cls.indexOf('backdrop') >= 0 || z > 40) {
                        node.style.display = 'none';
                        node.style.visibility = 'hidden';
                        node.style.pointerEvents = 'none';
                        sendMessage('step_update', 'Dismissed login layer blocking chart');
                        break;
                      }
                    }
                  }
                } catch (e4) {}
                try {
                  hideTradingAccountsOverlayIfPresent();
                } catch (eT2) {}
              };

              function getAllCanvasesDeep() {
                const out = [];
                function walk(d) {
                  if (!d) return;
                  try {
                    const list = d.querySelectorAll('canvas');
                    for (let i = 0; i < list.length; i++) out.push(list[i]);
                    const iframes = d.querySelectorAll('iframe');
                    for (let j = 0; j < iframes.length; j++) {
                      try {
                        const ind = iframes[j].contentDocument;
                        if (ind) walk(ind);
                      } catch (e) {}
                    }
                  } catch (e2) {}
                }
                walk(document);
                return out;
              }

              function canvasHasWebGLContext(canvas) {
                try {
                  if (!canvas || !canvas.getContext) return false;
                  const gl =
                    canvas.getContext('webgl2', { stencil: false }) ||
                    canvas.getContext('webgl', { stencil: false }) ||
                    canvas.getContext('experimental-webgl');
                  return !!gl;
                } catch (e) {
                  return false;
                }
              }

              function collectRankedCanvasCandidates() {
                const canvases = getAllCanvasesDeep();
                const ranked = [];
                for (let i = 0; i < canvases.length; i++) {
                  const c = canvases[i];
                  const rect = c.getBoundingClientRect();
                  if (rect.bottom < -35 || rect.top > window.innerHeight + 50) continue;
                  if (rect.width < 80 || rect.height < 58) continue;
                  const rectArea = rect.width * rect.height;
                  const internal = (c.width || 0) * (c.height || 0);
                  let score = internal > 5000 ? Math.min(rectArea, internal) : rectArea;
                  try {
                    if (canvasHasWebGLContext(c)) score *= 1.5;
                  } catch (e) {}
                  if (score > 0) ranked.push({ canvas: c, score });
                }
                ranked.sort((a, b) => b.score - a.score);
                return ranked;
              }

              const waitForChartReady = async (maxMs) => {
                const deadline = Date.now() + maxMs;
                const tick = 450;
                function isLikelyLoginScreen() {
                  try {
                    if (isAnyLoginModalBlocking()) return true;
                    const hasChart = hasChartCanvas();
                    const hasBidAsk = hasBidAskRibbon();
                    const sb = document.querySelector('input[placeholder*="Search symbol" i]') ||
                             document.querySelector('input[placeholder*="Search" i]') ||
                             document.querySelector('input[type="search"]');
                    const hasSb = sb && sb.offsetParent !== null;
                    if (hasSb && (hasChart || hasBidAsk)) {
                      return false;
                    }
                    const pwd = document.querySelector('input[type="password"]');
                    if (!pwd || pwd.offsetParent === null) return false;
                    const btns = document.querySelectorAll('button');
                    for (let j = 0; j < btns.length; j++) {
                      const t = ((btns[j].innerText || btns[j].textContent || '') + '').trim().toLowerCase();
                      if (t.indexOf('connect') >= 0 && (t.indexOf('account') >= 0 || t === 'connect')) {
                        return btns[j].offsetParent !== null;
                      }
                    }
                  } catch (e) {}
                  return false;
                }
                function hasChartCanvas() {
                  try {
                    function maxArea(d) {
                      if (!d) return 0;
                      let best = 0;
                      try {
                        const list = d.querySelectorAll('canvas');
                        for (let i = 0; i < list.length; i++) {
                          const c = list[i];
                          const area = (c.width || 0) * (c.height || 0);
                          if (area > best) best = area;
                        }
                        const iframes = d.querySelectorAll('iframe');
                        for (let j = 0; j < iframes.length; j++) {
                          try {
                            const ind = iframes[j].contentDocument;
                            if (ind) {
                              const sub = maxArea(ind);
                              if (sub > best) best = sub;
                            }
                          } catch (e) {}
                        }
                      } catch (e2) {}
                      return best;
                    }
                    return maxArea(document) >= 60000;
                  } catch (e3) { return false; }
                }
                function hasBidAskRibbon() {
                  try {
                    function concatText(d) {
                      if (!d || !d.body) return '';
                      let t = '';
                      try {
                        t += (d.body.innerText || '') + '\\n';
                        const iframes = d.querySelectorAll('iframe');
                        for (let i = 0; i < iframes.length; i++) {
                          try {
                            const ind = iframes[i].contentDocument;
                            if (ind) t += concatText(ind);
                          } catch (e) {}
                        }
                      } catch (e2) {}
                      return t;
                    }
                    const txt = concatText(document);
                    return /\\bBid\\b/i.test(txt) && /\\bAsk\\b/i.test(txt);
                  } catch (e3) { return false; }
                }
                while (Date.now() < deadline) {
                  await acceptDisclaimersAndConfirmDeep();
                  await dismissLoginOverlay();
                  const onLogin = isLikelyLoginScreen();
                  const chartOk = hasChartCanvas() || hasBidAskRibbon();
                  if (!onLogin && chartOk) {
                    sendMessage('step_update', 'Chart ready for export');
                    return true;
                  }
                  await sleep(tick);
                }
                return false;
              };

              function findSaveChartAsImageButton() {
                let found = null;
                function searchDoc(d) {
                  if (!d || found) return;
                  try {
                    const exact = d.querySelector(
                      'div.icon-button.svelte-1iwf8ix[title="Save Chart as Image (Ctrl + S)"]'
                    );
                    if (exact && exact.offsetParent !== null) {
                      found = exact;
                      return;
                    }
                    const all = d.querySelectorAll('div.icon-button.svelte-1iwf8ix');
                    for (let bi = 0; bi < all.length; bi++) {
                      const title = (all[bi].getAttribute('title') || '');
                      if (/save chart as image/i.test(title) && all[bi].offsetParent !== null) {
                        found = all[bi];
                        return;
                      }
                    }
                    const iframes = d.querySelectorAll('iframe');
                    for (let j = 0; j < iframes.length; j++) {
                      try {
                        const ind = iframes[j].contentDocument;
                        if (ind) searchDoc(ind);
                      } catch (e) {}
                    }
                  } catch (e) {}
                }
                searchDoc(document);
                return found;
              }

              const origHtmlAnchorClick = HTMLAnchorElement.prototype.click;
              let chartExportAnchorBlockInstalled = false;
              function installChartExportAnchorBlock() {
                if (chartExportAnchorBlockInstalled) return;
                chartExportAnchorBlockInstalled = true;
                HTMLAnchorElement.prototype.click = function() {
                  try {
                    const href = String(this.href || '');
                    const tw = window.top;
                    if (
                      tw &&
                      tw.__eaChartWarmupCapture &&
                      tw.__eaGotChartBlob &&
                      href.indexOf('blob:') === 0 &&
                      this.getAttribute('download') !== null
                    ) {
                      return;
                    }
                  } catch (eA) {}
                  return origHtmlAnchorClick.apply(this, arguments);
                };
              }
              function uninstallChartExportAnchorBlock() {
                if (!chartExportAnchorBlockInstalled) return;
                chartExportAnchorBlockInstalled = false;
                try {
                  HTMLAnchorElement.prototype.click = origHtmlAnchorClick;
                } catch (eU) {}
              }

              function installExportImageBlobHook() {
                let bestBlob = null;
                const createdEntries = [];
                const restoreList = [];
                const patchedWins = [];

                function considerBlob(blob) {
                  if (!blob || blob.size < 400) return;
                  try {
                    const t = (blob.type || '').toLowerCase();
                    const isImage = t.indexOf('image/') === 0;
                    const untypedLarge = (!t || t === '') && blob.size >= 800;
                    const octetOk = t === 'application/octet-stream' && blob.size >= 1200;
                    if (!isImage && !untypedLarge && !octetOk) return;
                    if (!bestBlob || blob.size > bestBlob.size) bestBlob = blob;
                    try {
                      const tw = window.top;
                      if (tw) tw.__eaGotChartBlob = true;
                    } catch (eFlag) {}
                  } catch (e0) {}
                }

                function ensurePatch(win) {
                  if (!win || !win.URL) return;
                  for (let p = 0; p < patchedWins.length; p++) {
                    if (patchedWins[p] === win) return;
                  }
                  patchedWins.push(win);
                  const origCreate = win.URL.createObjectURL.bind(win.URL);
                  win.URL.createObjectURL = function(blob) {
                    const url = origCreate(blob);
                    try {
                      createdEntries.push({ w: win, url: url });
                      considerBlob(blob);
                    } catch (e1) {}
                    return url;
                  };
                  restoreList.push(() => {
                    try {
                      win.URL.createObjectURL = origCreate;
                    } catch (e2) {}
                  });
                }

                function walkInstall(doc) {
                  if (!doc) return;
                  try {
                    ensurePatch(doc.defaultView);
                    const iframes = doc.querySelectorAll('iframe');
                    for (let fi = 0; fi < iframes.length; fi++) {
                      try {
                        const ind = iframes[fi].contentDocument;
                        if (ind) walkInstall(ind);
                      } catch (e3) {}
                    }
                  } catch (e4) {}
                }
                walkInstall(document);

                return {
                  takeBestBlob() {
                    return bestBlob;
                  },
                  cleanup() {
                    for (let ui = 0; ui < createdEntries.length; ui++) {
                      try {
                        createdEntries[ui].w.URL.revokeObjectURL(createdEntries[ui].url);
                      } catch (eR) {}
                    }
                    createdEntries.length = 0;
                    for (let ri = 0; ri < restoreList.length; ri++) {
                      restoreList[ri]();
                    }
                    restoreList.length = 0;
                    patchedWins.length = 0;
                  },
                };
              }

              function blobToBase64(blob) {
                return new Promise((resolve, reject) => {
                  try {
                    const r = new FileReader();
                    r.onloadend = () => {
                      const result = r.result;
                      if (typeof result === 'string' && result.indexOf(',') >= 0) {
                        resolve(result.split(',')[1]);
                      } else {
                        reject(new Error('read failed'));
                      }
                    };
                    r.onerror = () => reject(new Error('read failed'));
                    r.readAsDataURL(blob);
                  } catch (e3) {
                    reject(e3);
                  }
                });
              }

              async function waitForChartExportBlob(hook, minBytes, timeoutMs) {
                const deadline = Date.now() + timeoutMs;
                while (Date.now() < deadline) {
                  const b = hook.takeBestBlob();
                  if (b && b.size >= minBytes) return b;
                  await sleep(80);
                }
                const last = hook.takeBestBlob();
                if (last && last.size >= Math.min(minBytes, 800)) return last;
                return null;
              }

              async function focusChartForExport() {
                try {
                  const ranked = collectRankedCanvasCandidates();
                  const chartElement = ranked.length > 0 ? ranked[0].canvas : null;
                  if (chartElement) {
                    sendMessage('step_update', 'Focusing on chart...');
                    try {
                      chartElement.scrollIntoView({ block: 'center', inline: 'nearest' });
                    } catch (e0) {}
                    if (chartElement.focus) chartElement.focus();
                    chartElement.click();
                    await sleep(450);
                    sendMessage('step_update', 'Chart focused');
                    return;
                  }
                  const chartContainer =
                    document.querySelector('[class*="chart-container"]') ||
                    document.querySelector('[class*="trading-chart"]') ||
                    document.querySelector('div[class*="chart"]');
                  if (chartContainer) {
                    sendMessage('step_update', 'Focusing on chart...');
                    if (chartContainer.focus) chartContainer.focus();
                    chartContainer.click();
                    await sleep(450);
                    sendMessage('step_update', 'Chart container focused');
                  }
                } catch (e4) {}
              }

              async function prepareChartForExport() {
                try {
                  const ranked = collectRankedCanvasCandidates();
                  if (ranked.length > 0) {
                    ranked[0].canvas.scrollIntoView({ block: 'center', inline: 'nearest' });
                  }
                } catch (e) {}
                await new Promise((r) => {
                  requestAnimationFrame(() => {
                    requestAnimationFrame(r);
                  });
                });
                await sleep(450);
              }

              const captureChartWarmupForAi = async () => {
                await acceptDisclaimersAndConfirmDeep();
                await dismissLoginOverlay();
                window.__eaChartScreenshotSent = false;
                window.__eaLastChartCanvas = null;
                await prepareChartForExport();
                await focusChartForExport();
                for (let preCap = 0; preCap < 10; preCap++) {
                  await acceptDisclaimersAndConfirmDeep();
                  await dismissLoginOverlay();
                  if (!isAnyLoginModalBlocking()) break;
                  await sleep(450);
                }
                await prepareChartForExport();
                await focusChartForExport();
                sendMessage(
                  'step_update',
                  'Analysing chart'
                );
                let hook = null;
                try {
                  try {
                    const tw = window.top;
                    if (tw) {
                      tw.__eaChartWarmupCapture = true;
                      tw.__eaGotChartBlob = false;
                    }
                  } catch (eCap) {}
                  installChartExportAnchorBlock();
                  hook = installExportImageBlobHook();
                  const saveBtn = findSaveChartAsImageButton();
                  if (!saveBtn) {
                    sendMessage('chart_warmup_capture_failed', 'Save Chart as Image button not found');
                    return;
                  }
                  const clicked = typeof mouseClick === 'function' ? mouseClick(saveBtn) : false;
                  if (!clicked) saveBtn.click();
                  const blob = await waitForChartExportBlob(hook, 1200, 28000);
                  if (!blob) {
                    sendMessage(
                      'chart_warmup_capture_failed',
                      'Chart image export timed out or image was too small — ensure the chart is focused and try again'
                    );
                    return;
                  }
                  try {
                    const b64 = await blobToBase64(blob);
                    if (!b64 || b64.length < 80) {
                      sendMessage('chart_warmup_capture_failed', 'Could not read exported chart image');
                      return;
                    }
                    const _mt = blob.type && String(blob.type).toLowerCase();
                    const mime =
                      _mt && _mt.indexOf('image/') === 0 ? blob.type : 'image/png';
                    sendMessage('chart_screenshot', 'snapshot', { image: b64, mimeType: mime });
                  } catch (e5) {
                    sendMessage(
                      'chart_warmup_capture_failed',
                      e5 && e5.message ? e5.message : 'Could not read exported chart image'
                    );
                  }
                } finally {
                  if (hook) hook.cleanup();
                  try {
                    const tw2 = window.top;
                    if (tw2) {
                      tw2.__eaChartWarmupCapture = false;
                      tw2.__eaGotChartBlob = false;
                    }
                  } catch (eCap2) {}
                  uninstallChartExportAnchorBlock();
                }
              };

              // Optimized authentication function matching Android robustness
              const authenticateMT5 = async () => {
                try {
                  console.log('[MT5 Trading] Starting authentication process...');
                  sendMessage('step_update', 'Initializing MT5 Account...');
                  
                  // Wait for page to be ready instead of fixed delay
                  let retries = 0;
                  while (retries < 10) {
                    const form = document.querySelector('.form');
                    const loginField = document.querySelector('input[name="login"]');
                    if (form || loginField) break;
                    await sleep(300);
                    retries++;
                  }
                  
                  // Check for disclaimer and accept if present
                  const disclaimer = document.querySelector('#disclaimer');
                  if (disclaimer) {
                    const acceptButton = document.querySelector('.accept-button');
                    if (acceptButton) {
                      acceptButton.click();
                      sendMessage('step_update', 'Accepting disclaimer...');
                      await sleep(500);
                    }
                  }
                  
                  // Remove existing connection - find Remove button (works across different broker terminals)
                  const findAndClickRemove = () => {
                    const allClickables = document.querySelectorAll('button, a, [role="button"], .button');
                    for (const el of allClickables) {
                      const text = (el.textContent || '').trim().toLowerCase();
                      const isRed = el.className && (el.className.includes('red') || el.style.color === 'red');
                      if (text === 'remove' || text.includes('remove') || text === 'disconnect' || (isRed && text.includes('remove'))) {
                        return el;
                      }
                    }
                    return null;
                  };
                  for (let attempt = 0; attempt < 3; attempt++) {
                    const removeBtn = findAndClickRemove();
                    if (removeBtn) {
                      sendMessage('step_update', 'Removing existing connection...');
                      removeBtn.click();
                      await sleep(4500);
                    } else break;
                  }
                  
                  await sleep(2000);
                  
                  // Fill login credentials - use native setter for Svelte/React-controlled inputs
                  const loginField = document.querySelector('input[name="login"]') || 
                                    document.querySelector('input[type="text"][placeholder*="login" i]') ||
                                    document.querySelector('input[type="number"]') ||
                                    document.querySelector('input#login');
                  
                  const passwordField = document.querySelector('input[name="password"]') || 
                                       document.querySelector('input[type="password"]') ||
                                       document.querySelector('input#password');
                  
                  if (!loginField || !passwordField) {
                    sendMessage('authentication_failed', 'Login form not found');
                    return;
                  }
                  if (!loginCredential) {
                    sendMessage('authentication_failed', 'Login not configured - connect MT5 in MetaTrader tab');
                    return;
                  }
                  if (!passwordCredential) {
                    sendMessage('authentication_failed', 'Password not configured - connect MT5 in MetaTrader tab');
                    return;
                  }
                  
                  const setInputValue = (el, val) => {
                    el.focus();
                    el.value = '';
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                    if (nativeSetter) nativeSetter.call(el, val);
                    else el.value = val;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.dispatchEvent(new Event('blur', { bubbles: true }));
                  };
                  setInputValue(loginField, loginCredential);
                  sendMessage('step_update', 'Login filled');
                  await sleep(300);
                  setInputValue(passwordField, passwordCredential);
                  sendMessage('step_update', 'Password filled');
                  await sleep(1500);
                  
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
                    sendMessage('step_update', 'Connecting...');
                    let loginRetries = 0;
                    while (loginRetries < 35) {
                      const pageText = (document.body?.innerText || '').toLowerCase();
                      if (pageText.includes('invalid login') || pageText.includes('invalid password') || 
                          pageText.includes('wrong password') || pageText.includes('wrong login') ||
                          pageText.includes('incorrect password') || pageText.includes('incorrect login')) {
                        sendMessage('authentication_failed', 'Invalid login or password - verify credentials in MetaTrader tab');
                        return;
                      }
                      const loginForm = document.querySelector('input[name="login"]');
                      const searchBar = document.querySelector('input[placeholder*="Search symbol" i]') ||
                                       document.querySelector('input[placeholder*="Search" i]') ||
                                       document.querySelector('input[type="search"]') ||
                                       document.querySelector('.search input');
                      if (!loginForm && searchBar && searchBar.offsetParent !== null) {
                        break;
                      }
                      await sleep(500);
                      loginRetries++;
                    }
                  } else {
                    sendMessage('authentication_failed', 'Login button not found');
                    return;
                  }
                  
                  sendMessage('step_update', 'Verifying authentication...');
                  await sleep(1000);
                  await acceptDisclaimersAndConfirmDeep();
                  await dismissLoginOverlay();
                  
                  sendMessage('step_update', 'Checking Market Watch panel...');
                  
                  const searchFieldCheck = document.querySelector('input[placeholder*="Search symbol" i]') ||
                                          document.querySelector('input[placeholder*="Search" i]') ||
                                          document.querySelector('input[type="search"]');
                  
                  if (!searchFieldCheck || searchFieldCheck.offsetParent === null) {
                    sendMessage('step_update', 'Expanding Market Watch panel...');
                    
                    const marketWatchButton = document.querySelector('div.icon-button.svelte-1iwf8ix[title="Show Market Watch (Ctrl + M)"]') ||
                                             document.querySelector('div.icon-button[title*="Show Market Watch" i]') ||
                                             document.querySelector('div.icon-button[title*="Market Watch" i]') ||
                                             Array.from(document.querySelectorAll('div.icon-button')).find(btn => 
                                               btn.getAttribute('title') && btn.getAttribute('title').includes('Market Watch')
                                             );
                    
                    if (marketWatchButton) {
                      const buttonTitle = marketWatchButton.getAttribute('title') || '';
                      if (buttonTitle.toLowerCase().includes('show')) {
                        marketWatchButton.click();
                        sendMessage('step_update', 'Market Watch button clicked, waiting for panel to expand...');
                        await sleep(2000);
                      } else {
                        sendMessage('step_update', 'Market Watch already visible');
                      }
                    }
                  } else {
                    sendMessage('step_update', 'Market Watch already visible');
                  }
                  
                  await sleep(1000);
                  const searchField = document.querySelector('input[placeholder*="Search symbol" i]') ||
                                     document.querySelector('input[placeholder*="Search" i]') ||
                                     document.querySelector('input[type="search"]');
                  
                  if (searchField && searchField.offsetParent !== null) {
                    await acceptDisclaimersAndConfirmDeep();
                    await dismissLoginOverlay();
                    var _eqSC = scrapeTerminalAccountStats();
                    sendMessage('authentication_success', 'MT5 session verified', { equity: _eqSC.equity, balance: _eqSC.balance });
                    await searchForSymbol('${symbolValue}');
                    await openChart('${symbolValue}');
                    if (isChartWarmup) {
                      await acceptDisclaimersAndConfirmDeep();
                      await dismissLoginOverlay();
                      sendMessage('step_update', 'Waiting for chart (login must complete)...');
                      const chartReadyOk = await waitForChartReady(120000);
                      if (!chartReadyOk) {
                        sendMessage('chart_warmup_capture_failed', 'Chart not ready in time — still on login or chart not visible');
                        return;
                      }
                      var _eqCW = scrapeTerminalAccountStats();
                      if (_eqCW.equity || _eqCW.balance) {
                        sendMessage('equity_snapshot', 'Account updated', { equity: _eqCW.equity, balance: _eqCW.balance });
                      }
                      await captureChartWarmupForAi();
                      return;
                    }
                    await executeMultipleTrades();
                    return;
                  }
                  
                  await sleep(3000);
                  const searchFieldRetry = document.querySelector('input[placeholder*="Search symbol" i]') ||
                                          document.querySelector('input[placeholder*="Search" i]') ||
                                          document.querySelector('input[type="search"]');
                  
                  if (searchFieldRetry && searchFieldRetry.offsetParent !== null) {
                    await acceptDisclaimersAndConfirmDeep();
                    await dismissLoginOverlay();
                    var _eqSC2 = scrapeTerminalAccountStats();
                    sendMessage('authentication_success', 'MT5 session verified', { equity: _eqSC2.equity, balance: _eqSC2.balance });
                    await searchForSymbol('${symbolValue}');
                    await openChart('${symbolValue}');
                    if (isChartWarmup) {
                      await acceptDisclaimersAndConfirmDeep();
                      await dismissLoginOverlay();
                      sendMessage('step_update', 'Waiting for chart (login must complete)...');
                      const chartReadyOk = await waitForChartReady(120000);
                      if (!chartReadyOk) {
                        sendMessage('chart_warmup_capture_failed', 'Chart not ready in time — still on login or chart not visible');
                        return;
                      }
                      var _eqCW2 = scrapeTerminalAccountStats();
                      if (_eqCW2.equity || _eqCW2.balance) {
                        sendMessage('equity_snapshot', 'Account updated', { equity: _eqCW2.equity, balance: _eqCW2.balance });
                      }
                      await captureChartWarmupForAi();
                      return;
                    }
                    await executeMultipleTrades();
                    return;
                  }
                  
                  const errText = (document.body?.innerText || '').toLowerCase();
                  if (errText.includes('invalid') || errText.includes('wrong') || errText.includes('incorrect')) {
                    sendMessage('authentication_failed', 'Invalid login or password - verify credentials in MetaTrader tab');
                  } else {
                    sendMessage('authentication_failed', 'Authentication failed - could not reach terminal. Check broker connection.');
                  }
                  
                } catch(e) {
                  sendMessage('authentication_failed', 'Error during authentication: ' + e.message);
                }
              };

              const closeSearchPanelAfterSymbolSelect = async () => {
                try {
                  sendMessage('step_update', 'Closing search panel for a wider chart...');
                  try {
                    const sf =
                      document.querySelector('input[placeholder*="Search symbol" i]') ||
                      document.querySelector('input[placeholder*="Search" i]');
                    if (sf) sf.blur();
                  } catch (e) {}
                  document.dispatchEvent(
                    new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true })
                  );
                  await sleep(300);
                  const hideMw =
                    document.querySelector('div.icon-button.svelte-1iwf8ix[title="Hide Market Watch (Ctrl + M)"]') ||
                    Array.from(document.querySelectorAll('div.icon-button.svelte-1iwf8ix')).find(btn => {
                      const t = (btn.getAttribute('title') || '').toLowerCase();
                      return t.includes('hide') && t.includes('market watch');
                    });
                  if (hideMw) {
                    hideMw.click();
                    await sleep(650);
                  }
                  const sf2 =
                    document.querySelector('input[placeholder*="Search symbol" i]') ||
                    document.querySelector('input[placeholder*="Search" i]');
                  if (sf2) {
                    sf2.value = '';
                    sf2.dispatchEvent(new Event('input', { bubbles: true }));
                    sf2.blur();
                  }
                  document.dispatchEvent(
                    new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true })
                  );
                  await sleep(400);
                } catch (e) {}
              };
              
              // Search for symbol function - STRICTLY SEQUENTIAL Step 2
              const searchForSymbol = async (symbolName) => {
                try {
                  sendMessage('step_update', 'Step 2: Searching for symbol ' + symbolName + '...');
                  
                  let searchLabel = document.querySelector('label.search.svelte-1mvzp7f');
                  let searchField = null;
                  
                  if (searchLabel) {
                    const labelFor = searchLabel.getAttribute('for');
                    if (labelFor) {
                      searchField = document.getElementById(labelFor);
                    }
                    if (!searchField) {
                      searchField = searchLabel.querySelector('input') || 
                                  searchLabel.parentElement?.querySelector('input') ||
                                  searchLabel.closest('form')?.querySelector('input[type="search"]') ||
                                  searchLabel.closest('form')?.querySelector('input[placeholder*="Search" i]');
                    }
                  }
                  
                  if (!searchField) {
                    searchField = document.querySelector('input[placeholder*="Search symbol" i]') ||
                                document.querySelector('input[placeholder*="Search" i]') ||
                                document.querySelector('input[type="search"]');
                  }
                  
                  if (!searchField || searchField.offsetParent === null) {
                    sendMessage('step_update', 'Expanding search bar using Economic Calendar button...');
                    
                    const economicCalendarButton = document.querySelector('div.icon-button.svelte-1iwf8ix[title="Show Economic Calendar Events on Chart"]') ||
                                                 Array.from(document.querySelectorAll('div.icon-button.svelte-1iwf8ix')).find(btn => 
                                                   btn.getAttribute('title') && btn.getAttribute('title').includes('Economic Calendar')
                                                 );
                    
                    if (economicCalendarButton) {
                      economicCalendarButton.click();
                      sendMessage('step_update', 'Economic Calendar button clicked, waiting for search bar to appear...');
                      await sleep(2000);
                      
                      searchLabel = document.querySelector('label.search.svelte-1mvzp7f');
                      if (searchLabel) {
                        const labelFor = searchLabel.getAttribute('for');
                        if (labelFor) {
                          searchField = document.getElementById(labelFor);
                        }
                        if (!searchField) {
                          searchField = searchLabel.querySelector('input') || 
                                      searchLabel.parentElement?.querySelector('input') ||
                                      searchLabel.closest('form')?.querySelector('input[type="search"]') ||
                                      searchLabel.closest('form')?.querySelector('input[placeholder*="Search" i]');
                        }
                      }
                      
                      if (!searchField) {
                        searchField = document.querySelector('input[placeholder*="Search symbol" i]') ||
                                    document.querySelector('input[placeholder*="Search" i]') ||
                                    document.querySelector('input[type="search"]');
                      }
                    } else {
                      sendMessage('step_update', 'Economic Calendar button not found, trying Market Watch button...');
                      const marketWatchButton = document.querySelector('div.icon-button.svelte-1iwf8ix[title="Show Market Watch (Ctrl + M)"]') ||
                                               Array.from(document.querySelectorAll('div.icon-button.svelte-1iwf8ix')).find(btn => {
                                                 const title = btn.getAttribute('title') || '';
                                                 return title.includes('Market Watch') && title.toLowerCase().includes('show');
                                               });
                      if (marketWatchButton) {
                        const buttonTitle = marketWatchButton.getAttribute('title') || '';
                        if (buttonTitle.toLowerCase().includes('show')) {
                          marketWatchButton.click();
                          await sleep(2000);
                          searchField = document.querySelector('input[placeholder*="Search symbol" i]') ||
                                      document.querySelector('input[placeholder*="Search" i]') ||
                                      document.querySelector('input[type="search"]');
                        } else {
                          sendMessage('step_update', 'Market Watch already visible, skipping click');
                        }
                      }
                    }
                  }
                  
                  if (searchField && searchField.offsetParent !== null) {
                    sendMessage('step_update', 'Search bar found, searching for ' + symbolName + '...');
                    
                    searchField.focus();
                    searchField.value = '';
                    searchField.dispatchEvent(new Event('input', { bubbles: true }));
                    searchField.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    await sleep(300);
                    
                    searchField.focus();
                    searchField.value = symbolName;
                    searchField.dispatchEvent(new Event('input', { bubbles: true }));
                    searchField.dispatchEvent(new Event('change', { bubbles: true }));
                    searchField.dispatchEvent(new Event('keyup', { bubbles: true }));
                    
                    await sleep(2000);
                    
                    sendMessage('symbol_search', 'Symbol ' + symbolName + ' searched');
                    
                    const symbolElements = document.querySelectorAll('.name.svelte-19bwscl .symbol.svelte-19bwscl, .symbol.svelte-19bwscl, [class*="symbol"]');
                    let symbolSelected = false;
                    for (let i = 0; i < symbolElements.length; i++) {
                      const text = (symbolElements[i].innerText || '').trim();
                      if (text === symbolName || text.includes(symbolName)) {
                        symbolElements[i].click();
                        sendMessage('symbol_selected', 'Symbol ' + symbolName + ' selected');
                        symbolSelected = true;
                        await sleep(2000);
                         break;
                       }
                     }

                    if (symbolSelected) {
                      await acceptDisclaimersAndConfirmDeep();
                      await dismissLoginOverlay();
                      await sleep(500);
                      await acceptDisclaimersAndConfirmDeep();
                      await dismissLoginOverlay();
                      await closeSearchPanelAfterSymbolSelect();
                    }
                     
                    if (!symbolSelected) {
                      sendMessage('error', 'Symbol ' + symbolName + ' not found in search results');
                     }
                   } else {
                    sendMessage('error', 'Search field not found or not visible after expanding');
                  }
                } catch(e) {
                  sendMessage('error', 'Error searching for symbol: ' + e.message);
                }
              };

              // Open chart function - STRICTLY SEQUENTIAL Step 3
              const openChart = async (symbolName) => {
                try {
                  sendMessage('step_update', 'Step 3: Opening chart for ' + symbolName + '...');
                  
                  await sleep(2000);
                  
                  let chartElement = null;
                  let retries = 0;
                  while (retries < 5) {
                    chartElement = document.querySelector('[class*="chart"]') ||
                                  document.querySelector('canvas') ||
                                  document.querySelector('[id*="chart"]') ||
                                  document.querySelector('[class*="Chart"]');
                    
                    if (chartElement) {
                      sendMessage('step_update', 'Chart opened for ' + symbolName);
                      break;
                    }
                    await sleep(500);
                    retries++;
                  }
                  
                  await sleep(1000);
                  
                  if (chartElement) {
                    sendMessage('step_update', 'Focusing on chart...');
                    chartElement.focus();
                    chartElement.click();
                    await sleep(500);
                    sendMessage('step_update', 'Chart focused');
                  } else {
                    const chartContainer = document.querySelector('[class*="chart-container"]') ||
                                          document.querySelector('[class*="trading-chart"]') ||
                                          document.querySelector('div[class*="chart"]');
                    if (chartContainer) {
                      chartContainer.focus();
                      chartContainer.click();
                      await sleep(500);
                      sendMessage('step_update', 'Chart container focused');
                    }
                  }

                  await acceptDisclaimersAndConfirmDeep();
                  await dismissLoginOverlay();
                  await sleep(450);
                  await acceptDisclaimersAndConfirmDeep();
                  await dismissLoginOverlay();
                } catch(e) {
                  sendMessage('error', 'Error opening chart: ' + e.message);
                }
              };

              // Helper function to simulate mouse click
              const mouseClick = (element) => {
                try {
                  const rect = element.getBoundingClientRect();
                  const x = rect.left + rect.width / 2;
                  const y = rect.top + rect.height / 2;
                  
                  const mousedownEvent = new MouseEvent('mousedown', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    button: 0,
                    buttons: 1,
                    clientX: x,
                    clientY: y,
                    screenX: x,
                    screenY: y
                  });
                  element.dispatchEvent(mousedownEvent);
                  
                  const mouseupEvent = new MouseEvent('mouseup', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    button: 0,
                    buttons: 0,
                    clientX: x,
                    clientY: y,
                    screenX: x,
                    screenY: y
                  });
                  element.dispatchEvent(mouseupEvent);
                  
                  const clickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    button: 0,
                    buttons: 0,
                    clientX: x,
                    clientY: y,
                    screenX: x,
                    screenY: y
                  });
                  element.dispatchEvent(clickEvent);
                  
                         return true;
                } catch(e) {
                       return false;
                     }
                   };
                   
              // Open order dialog and execute single trade - STRICTLY SEQUENTIAL
              const openOrderDialogAndExecuteTrade = async (tradeNumber, totalTrades) => {
                try {
                  sendMessage('step_update', '📋 Opening order dialog for trade ' + tradeNumber + '/' + totalTrades + '...');
                  
                  const findHideToolbar = () =>
                    document.querySelector('div.icon-button.svelte-1iwf8ix.withText[title="Hide Trade Form (F9)"]') ||
                    Array.from(document.querySelectorAll('div.icon-button.svelte-1iwf8ix.withText')).find((btn) => {
                      const title = btn.getAttribute('title') || '';
                      return title.includes('Hide Trade Form') || (title.includes('Trade Form') && title.includes('Hide'));
                    });
                  const findShowToolbar = () =>
                    document.querySelector('div.icon-button.svelte-1iwf8ix.withText[title="Show Trade Form (F9)"]') ||
                    Array.from(document.querySelectorAll('div.icon-button.svelte-1iwf8ix.withText')).find((btn) => {
                      const title = btn.getAttribute('title') || '';
                      return title.includes('Show Trade Form') || (title.includes('Trade Form') && title.includes('Show'));
                    });

                  let orderDialogTrigger = null;
                  const hideToolbarBtn2 = findHideToolbar();
                  if (hideToolbarBtn2 && hideToolbarBtn2.offsetParent) {
                    orderDialogTrigger = hideToolbarBtn2;
                    sendMessage('step_update', '✅ Order panel already open (not toggling Hide — avoids close)');
                  } else {
                    orderDialogTrigger = findShowToolbar();
                    if (orderDialogTrigger) {
                      const clicked = mouseClick(orderDialogTrigger);
                      if (clicked) {
                        sendMessage('step_update', '✅ Order dialog opened (mouse click)');
                      } else {
                        orderDialogTrigger.click();
                        sendMessage('step_update', '✅ Order dialog opened (fallback click)');
                      }
                    } else {
                      orderDialogTrigger = document.querySelector('div.group.svelte-aqy1pm') ||
                        Array.from(document.querySelectorAll('div.group.svelte-aqy1pm')).find((el) => el.offsetParent !== null);
                      if (orderDialogTrigger) {
                        const clickedG = mouseClick(orderDialogTrigger);
                        if (clickedG) {
                          sendMessage('step_update', '✅ Order dialog opened via group div (mouse click)');
                        } else {
                          orderDialogTrigger.click();
                          sendMessage('step_update', '✅ Order dialog opened via group div (fallback click)');
                        }
                      }
                    }
                  }
                  
                  if (!orderDialogTrigger) {
                    sendMessage('error', '❌ Order dialog trigger not found');
                    return false;
                  }
                  
                  await sleep(2000);
                  
                  let retries = 0;
                  let dialogElement = null;
                  let dialogReady = false;
                  while (retries < 10) {
                    const volumeInput = document.querySelector('input[inputmode="decimal"]');
                    const commentInput = document.querySelector('input.svelte-mtorg2');
                    const tradeButton = document.querySelector('button.trade-button.svelte-ailjot');
                    
                    if (!dialogElement) {
                      dialogElement = document.querySelector('[class*="trade-form"]') ||
                                    document.querySelector('[class*="order-dialog"]') ||
                                    document.querySelector('[class*="trade-dialog"]') ||
                                    document.querySelector('form') ||
                                    volumeInput?.closest('div') ||
                                    volumeInput?.closest('form');
                    }
                    
                    if (volumeInput && commentInput && tradeButton) {
                      sendMessage('step_update', '✅ Order dialog ready with all form elements');
                      dialogReady = true;
                      break;
                    }
                    await sleep(500);
                    retries++;
                  }
                  
                  if (!dialogReady) {
                    sendMessage('error', '❌ Order dialog not ready after waiting');
                    return false;
                  }
                  
                  if (dialogElement) {
                    dialogElement.focus();
                    const rect = dialogElement.getBoundingClientRect();
                    const x = rect.left + rect.width / 2;
                    const y = rect.top + rect.height / 2;
                    const focusClick = new MouseEvent('click', {
                      bubbles: true,
                      cancelable: true,
                      view: window,
                      button: 0,
                      clientX: x,
                      clientY: y
                    });
                    dialogElement.dispatchEvent(focusClick);
                    await sleep(500);
                  }
                  
                  await sleep(500);
                  
                  sendMessage('step_update', '📝 Filling order form for trade ' + tradeNumber + '/' + totalTrades + '...');
                  const tradeSuccess = await fillOrderFormAndConfirm(tradeNumber, totalTrades);
                  
                  if (!tradeSuccess) {
                    sendMessage('error', '❌ Trade ' + tradeNumber + ' execution failed');
                    return false;
                  }
                  
                  sendMessage('step_update', '⏳ Confirming trade ' + tradeNumber + '...');
                  await sleep(1500);
                  
                  const okButton = Array.from(document.querySelectorAll('button.trade-button.svelte-ailjot')).find((btn) => {
                    const text = (btn.innerText || btn.textContent || '').trim();
                    if (/^(buy|sell)/i.test(text)) return false;
                    return text === 'OK' || text === 'ok';
                  });
                  
                  if (okButton) {
                    okButton.click();
                    sendMessage('step_update', '✅ Trade ' + tradeNumber + ' confirmed (OK clicked)');
                    await sleep(1000);
                  } else {
                    sendMessage('step_update', '✅ Trade ' + tradeNumber + ' auto-confirmed');
                  }
                  
                  return true;
                } catch(e) {
                  sendMessage('error', '❌ Error in trade ' + tradeNumber + ': ' + e.message);
                  return false;
                }
              };

              // Fill order form and confirm trade - STRICTLY SEQUENTIAL
              const fillOrderFormAndConfirm = async (tradeNumber, totalTrades) => {
                try {
                  var _p = window.__eaActiveTradePayload;
                  const symbol = (_p && _p.symbol) ? String(_p.symbol) : '${symbolValue}';
                  const action = (_p && _p.action) ? String(_p.action) : '${actionValue}';
                  const volume = (_p && _p.volume) ? String(_p.volume) : '${volumeValue}';
                  const sl = (_p && _p.sl != null && String(_p.sl) !== '') ? String(_p.sl) : '${slValue}';
                  const tp = (_p && _p.tp != null && String(_p.tp) !== '') ? String(_p.tp) : '${tpValue}';
                  const orderComment = '${robotNameValue}';
                  
                  const decimalInputs = Array.from(document.querySelectorAll('input[inputmode="decimal"]'));
                  
                  if (decimalInputs.length > 0 && volume) {
                    const volumeInput = decimalInputs[0];
                    volumeInput.focus();
                    volumeInput.value = '';
                    volumeInput.dispatchEvent(new Event('input', { bubbles: true }));
                    volumeInput.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    await sleep(200);
                    
                    volumeInput.value = volume;
                    volumeInput.dispatchEvent(new Event('input', { bubbles: true }));
                    volumeInput.dispatchEvent(new Event('change', { bubbles: true }));
                    volumeInput.dispatchEvent(new Event('blur', { bubbles: true }));
                    sendMessage('step_update', '✅ Volume: ' + volume);
                  }
                  
                  if (decimalInputs.length > 1 && sl) {
                    await sleep(200);
                    const slInput = decimalInputs[1];
                    slInput.focus();
                    slInput.value = '';
                    slInput.dispatchEvent(new Event('input', { bubbles: true }));
                    slInput.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    await sleep(200);
                    
                    slInput.value = sl.toString();
                    slInput.dispatchEvent(new Event('input', { bubbles: true }));
                    slInput.dispatchEvent(new Event('change', { bubbles: true }));
                    slInput.dispatchEvent(new Event('blur', { bubbles: true }));
                    sendMessage('step_update', '✅ Stop Loss: ' + sl);
                  }
                  
                  if (decimalInputs.length > 2 && tp) {
                    await sleep(200);
                    const tpInput = decimalInputs[2];
                    tpInput.focus();
                    tpInput.value = '';
                    tpInput.dispatchEvent(new Event('input', { bubbles: true }));
                    tpInput.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    await sleep(200);
                    
                    tpInput.value = tp.toString();
                    tpInput.dispatchEvent(new Event('input', { bubbles: true }));
                    tpInput.dispatchEvent(new Event('change', { bubbles: true }));
                    tpInput.dispatchEvent(new Event('blur', { bubbles: true }));
                    sendMessage('step_update', '✅ Take Profit: ' + tp);
                  }
                  
                  if (orderComment) {
                    await sleep(200);
                    const commentInput = document.querySelector('input.svelte-mtorg2') ||
                                        Array.from(document.querySelectorAll('input[autocomplete="off"]')).find(inp => 
                                          inp.classList.contains('svelte-mtorg2')
                                        );
                    
                    if (commentInput) {
                      commentInput.focus();
                      commentInput.value = '';
                      commentInput.dispatchEvent(new Event('input', { bubbles: true }));
                      commentInput.dispatchEvent(new Event('change', { bubbles: true }));
                      
                      await sleep(200);
                      
                      commentInput.value = orderComment;
                      commentInput.dispatchEvent(new Event('input', { bubbles: true }));
                      commentInput.dispatchEvent(new Event('change', { bubbles: true }));
                      commentInput.dispatchEvent(new Event('blur', { bubbles: true }));
                      sendMessage('step_update', '✅ Comment: ' + orderComment);
                    }
                  }
                  
                  await sleep(500);
                  
                  const buyButton = document.querySelector('button.trade-button.svelte-ailjot:not(.red)') ||
                                   Array.from(document.querySelectorAll('button.trade-button.svelte-ailjot')).find(btn => 
                                     (btn.innerText || btn.textContent || '').trim().includes('Buy')
                                   );
                  
                  const sellButton = document.querySelector('button.trade-button.svelte-ailjot.red') ||
                                    Array.from(document.querySelectorAll('button.trade-button.svelte-ailjot.red')).find(btn => 
                                      (btn.innerText || btn.textContent || '').trim().includes('Sell')
                                    );
                  
                  const actionLower = (action || '').toLowerCase();
                  
                  if (actionLower === 'buy' && buyButton) {
                    buyButton.click();
                    sendMessage('step_update', '🚀 Trade ' + tradeNumber + '/' + totalTrades + ': BUY order executed');
                  } else if (actionLower === 'sell' && sellButton) {
                    sellButton.click();
                    sendMessage('step_update', '🚀 Trade ' + tradeNumber + '/' + totalTrades + ': SELL order executed');
                  } else {
                    sendMessage('error', '❌ Trade button not found for action: ' + action);
                    return false;
                  }
                  
                  await sleep(1500);
                  
                  return true;
                } catch(e) {
                  sendMessage('error', '❌ Error filling order form: ' + e.message);
                  return false;
                }
              };

              // Execute multiple trades based on configured number - EXACTLY as configured
              const executeMultipleTrades = async () => {
                const numberOfTrades = parseInt('${numberOfTradesValue}', 10);
                if (isNaN(numberOfTrades) || numberOfTrades < 1) {
                  sendMessage('error', 'Invalid number of trades configured: ' + numberOfTrades);
                  return;
                }

                sendMessage('step_update', '📊 Configured to execute EXACTLY ' + numberOfTrades + ' trade(s)');
                console.log('🎯 STRICT EXECUTION: Will execute exactly ' + numberOfTrades + ' trades, no more, no less');
                
                var _eqEx0 = scrapeTerminalAccountStats();
                if (_eqEx0.equity || _eqEx0.balance) {
                  sendMessage('equity_snapshot', 'Account updated', { equity: _eqEx0.equity, balance: _eqEx0.balance });
                }
                
                let successfulTrades = 0;
                let failedTrades = 0;
                
                for (let i = 0; i < numberOfTrades; i++) {
                  const tradeNumber = i + 1;
                  sendMessage('step_update', '🔄 Executing trade ' + tradeNumber + ' of ' + numberOfTrades + '...');
                  console.log('▶️ Starting trade ' + tradeNumber + '/' + numberOfTrades);
                  
                  try {
                    var _eqPre = scrapeTerminalAccountStats();
                    if (_eqPre.equity || _eqPre.balance) {
                      sendMessage('equity_snapshot', 'Account updated', { equity: _eqPre.equity, balance: _eqPre.balance });
                    }
                    const tradeSuccess = await openOrderDialogAndExecuteTrade(tradeNumber, numberOfTrades);
                    
                    if (tradeSuccess) {
                      successfulTrades++;
                      sendMessage('step_update', '✅ Trade ' + tradeNumber + '/' + numberOfTrades + ' completed successfully');
                      console.log('✅ Trade ' + tradeNumber + ' completed successfully');
                      await sleep(1500);
                      var snapAfter = scrapeTerminalAccountStats();
                      if (snapAfter.equity || snapAfter.balance) {
                        sendMessage('equity_snapshot', 'Account updated', { equity: snapAfter.equity, balance: snapAfter.balance });
                      }
                    } else {
                      failedTrades++;
                      sendMessage('step_update', '❌ Trade ' + tradeNumber + '/' + numberOfTrades + ' failed');
                      console.log('❌ Trade ' + tradeNumber + ' failed');
                    }
                    
                    if (i < numberOfTrades - 1) {
                      sendMessage('step_update', '⏳ Preparing for next trade...');
                      await sleep(1500);
                    }
                  } catch (error) {
                    failedTrades++;
                    sendMessage('error', 'Error executing trade ' + tradeNumber + ': ' + error.message);
                    console.error('❌ Error executing trade ' + tradeNumber + ':', error);
                  }
                }
                
                const summaryMessage = '✅ Completed: ' + successfulTrades + '/' + numberOfTrades + ' trades executed';
                sendMessage('step_update', summaryMessage);
                console.log('📊 EXECUTION COMPLETE: ' + successfulTrades + ' successful, ' + failedTrades + ' failed out of ' + numberOfTrades + ' total');
                
                await sleep(2000);
                var statsFinal = scrapeTerminalAccountStats();
                if (successfulTrades === numberOfTrades) {
                  sendMessage('all_trades_completed', 'All ' + numberOfTrades + ' trades completed successfully', { equity: statsFinal.equity, balance: statsFinal.balance });
                } else {
                  sendMessage('all_trades_completed', successfulTrades + '/' + numberOfTrades + ' trades completed', { equity: statsFinal.equity, balance: statsFinal.balance });
                }
                
                await sleep(1000);
                window.__eaActiveTradePayload = null;
              };

              window.__eaRunExecuteMultipleTrades = executeMultipleTrades;
              
              var __eaStartAuthOnce = (function() {
                var done = false;
                return function() {
                  if (done) return;
                  done = true;
                  void authenticateMT5();
                };
              })();
              if (document.readyState === 'complete' || document.readyState === 'interactive') {
                __eaStartAuthOnce();
              } else {
                document.addEventListener('DOMContentLoaded', __eaStartAuthOnce);
                setTimeout(__eaStartAuthOnce, 2500);
              }
            })();
          `;

          // Inject script before closing body tag
          if (html.includes('</body>')) {
            html = html.replace('</body>', `<script>${tradingScript}</script></body>`);
            console.log('✅ MT5 trading script injected before </body> tag');
          } else if (html.includes('</html>')) {
            html = html.replace('</html>', `<script>${tradingScript}</script></html>`);
            console.log('✅ MT5 trading script injected before </html> tag');
          } else {
            html += `<script>${tradingScript}</script>`;
            console.log('✅ MT5 trading script appended to HTML');
          }

          // Verify script was injected
          if (html.includes('authenticateMT5')) {
            console.log('✅ Trading script injection verified - authenticateMT5 function found in HTML');
          } else {
            console.error('❌ Trading script injection failed - authenticateMT5 function not found in HTML');
          }

          // Return modified HTML with CORS headers
          return new Response(html, {
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
              'X-Frame-Options': 'SAMEORIGIN',
            },
          });
        } catch (error) {
          console.error('❌ MT5 trading proxy error:', error);
          return new Response(`Proxy error: ${error}`, { status: 500 });
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
            // Convert ISO timestamp to MySQL-compatible format
            // Remove 'Z' suffix and replace 'T' with space for MySQL DATETIME compatibility
            let mysqlTimestamp = since;
            try {
              // Parse the ISO timestamp and convert to MySQL format
              const date = new Date(since);
              if (!isNaN(date.getTime())) {
                // Format: YYYY-MM-DD HH:MM:SS
                mysqlTimestamp = date.toISOString().slice(0, 19).replace('T', ' ');
              }
            } catch (parseError) {
              console.warn('⚠️ Could not parse timestamp, using as-is:', since);
            }
            
            console.log(`📊 Fetching signals for EA ${eaId} since ${mysqlTimestamp} (original: ${since})`);
            
            // Get signals since a specific time
            // Query only existing columns: id, ea, asset, latestupdate, action, price, tp, sl, time
            query = `
              SELECT id, ea, asset, latestupdate, action, price, tp, sl, time
              FROM \`signals\` 
              WHERE ea = ? AND latestupdate > ?
              ORDER BY latestupdate DESC
              LIMIT 50
            `;
            params = [eaId, mysqlTimestamp];
          } else {
            // Get recent signals for EA (last 50)
            query = `
              SELECT id, ea, asset, latestupdate, action, price, tp, sl, time
              FROM \`signals\` 
              WHERE ea = ?
              ORDER BY latestupdate DESC
              LIMIT 50
            `;
            params = [eaId];
          }

          const [rows] = await conn.execute(query, params);

          const result = rows as any[];
          console.log(`✅ Found ${result.length} new signals for EA ${eaId} since ${since || 'beginning'}`);

          return new Response(JSON.stringify({ signals: result }), {
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        } catch (error: any) {
          console.error('❌ Database error in get-new-signals:', error?.message || error);
          console.error('❌ Error details:', { eaId, since, stack: error?.stack });
          return new Response(JSON.stringify({ 
            error: 'Database error', 
            message: error?.message || 'Unknown error',
            details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
          }), {
            status: 500,
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
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

    // Web Push for iOS PWA - VAPID public key
    if (pathname === '/api/vapid-public-key') {
      if (request.method === 'GET') {
        return new Response(JSON.stringify({ publicKey: getVapidPublicKey() }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Web Push - register subscription (when bot activated on iOS PWA)
    if (pathname === '/api/register-push-subscription') {
      if (request.method === 'POST') {
        try {
          const body = await request.json() as {
            subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
            licenseKey: string;
            eaId: string;
          };
          if (!body?.subscription?.endpoint || !body?.licenseKey || !body?.eaId) {
            return new Response(JSON.stringify({ error: 'subscription, licenseKey, eaId required' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }
          const sub = {
            endpoint: body.subscription.endpoint,
            keys: body.subscription.keys,
            licenseKey: body.licenseKey,
            eaId: String(body.eaId),
          };
          addSubscription(sub);
          // Persist to DB so subscriptions survive server restarts (critical for Render cold starts)
          try {
            const p = getPool();
            await p.execute(
              'INSERT INTO push_subscriptions (endpoint, p256dh, auth, license_key, ea_id) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE p256dh=VALUES(p256dh), auth=VALUES(auth), license_key=VALUES(license_key), ea_id=VALUES(ea_id)',
              [sub.endpoint, sub.keys.p256dh, sub.keys.auth, sub.licenseKey, sub.eaId]
            );
          } catch (dbErr) {
            console.warn('[Push] Failed to persist subscription:', dbErr);
          }
          // Immediate poll so new subscriber gets any recent signals right away
          pollWebPushSignalsNow(getPool).catch(() => {});
          return new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
      }
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Web Push - unregister subscription (when bot deactivated)
    if (pathname === '/api/unregister-push-subscription') {
      if (request.method === 'POST') {
        try {
          const body = await request.json() as { endpoint?: string };
          if (body?.endpoint) {
            removeSubscription(body.endpoint);
            try {
              await getPool().execute('DELETE FROM push_subscriptions WHERE endpoint = ?', [body.endpoint]);
            } catch (dbErr) {
              console.warn('[Push] Failed to delete subscription from DB:', dbErr);
            }
          }
          return new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        } catch {
          return new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
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

    // Keep-alive: resets Render inactivity timer so server stays awake for Web Push
    if (url.pathname === '/api/keep-alive') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Handle terminal assets (CSS, JS, etc.) - proxy to the original MT5 terminal
    if (url.pathname.startsWith('/terminal/')) {
      try {
        const assetPath = url.pathname.replace('/terminal/', '');
        
        // Determine broker URL from referer header, query param, or default to RazorMarkets
        const referer = request.headers.get('referer') || '';
        const brokerParam = url.searchParams.get('broker');
        let brokerBaseUrl = 'https://webtrader.razormarkets.co.za';
        
        // Map of broker names to their base URLs (matching MT5_BROKER_URLS from metatrader.tsx)
        const brokerUrlMap: Record<string, string> = {
          'razormarkets-live': 'https://webtrader.razormarkets.co.za',
          'razormarkets': 'https://webtrader.razormarkets.co.za',
          'accumarkets-live': 'https://webterminal.accumarkets.co.za',
          'accumarkets': 'https://webterminal.accumarkets.co.za',
          'rockwest-server': 'https://webtrader.rock-west.com',
          'rockwest': 'https://webtrader.rock-west.com',
          'rock-west': 'https://webtrader.rock-west.com',
          'maonoglobalmarkets-live': 'https://web.maonoglobalmarkets.com',
          'maonoglobalmarkets': 'https://web.maonoglobalmarkets.com',
          'deriv-demo': 'https://mt5-demo-web.deriv.com',
          'derivsvg-server': 'https://mt5-real01-web-svg.deriv.com',
          'derivsvg-server-02': 'https://mt5-real02-web-svg.deriv.com',
          'derivsvg-server-03': 'https://mt5-real03-web-svg.deriv.com',
          'derivbvi-server': 'https://mt5-real01-web-bvi.deriv.com',
          'derivbvi-server-02': 'https://mt5-real02-web-bvi.deriv.com',
          'derivbvi-server-03': 'https://mt5-real03-web-bvi.deriv.com',
          'derivbvi-server-vu': 'https://mt5-real01-web-vu.deriv.com',
          'derivbvi-server-vu-02': 'https://mt5-real02-web-vu.deriv.com',
          'derivbvi-server-vu-03': 'https://mt5-real03-web-vu.deriv.com',
          'rocketx-live': 'https://webtrader.rocketx.io:1950',
          'rocketx': 'https://webtrader.rocketx.io:1950',
          'profinwealth-live': 'https://mt5.profinwealth.com',
          'profinwealth': 'https://mt5.profinwealth.com',
        };

        // Try to detect broker from query param first
        if (brokerParam) {
          const brokerKey = brokerParam.toLowerCase().replace(/\s+/g, '-');
          if (brokerUrlMap[brokerKey]) {
            brokerBaseUrl = brokerUrlMap[brokerKey];
          } else {
            // Try partial match
            for (const [key, url] of Object.entries(brokerUrlMap)) {
              if (brokerKey.includes(key.replace(/-/g, '')) || key.includes(brokerKey.replace(/-/g, ''))) {
                brokerBaseUrl = url;
                break;
              }
            }
          }
        }

        // Fallback: Check referer for broker domain
        if (brokerBaseUrl === 'https://webtrader.razormarkets.co.za') {
          for (const [key, brokerUrl] of Object.entries(brokerUrlMap)) {
            const domain = brokerUrl.replace('https://', '').replace('http://', '').split('/')[0];
            if (referer.includes(domain)) {
              brokerBaseUrl = brokerUrl;
              break;
            }
          }
        }

        // Brokers that serve terminal from root (no /terminal path)
        const rootTerminalBrokers = ['mt5.profinwealth.com', 'profinwealth'];
        const isRootTerminal = rootTerminalBrokers.some(b => brokerBaseUrl.includes(b));

        // Try to fetch from broker's terminal directory (or root for root-terminal brokers)
        let targetUrl = isRootTerminal
          ? `${brokerBaseUrl.replace(/\/$/, '')}/${assetPath}`
          : `${brokerBaseUrl}/terminal/${assetPath}`;

        let response = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': brokerBaseUrl,
            'Accept': request.headers.get('accept') || '*/*',
          },
        });

        // Fallback: for root-terminal brokers, try /terminal/ if root fetch fails
        if (!response.ok && isRootTerminal) {
          const fallbackUrl = `${brokerBaseUrl}/terminal/${assetPath}`;
          response = await fetch(fallbackUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': brokerBaseUrl,
              'Accept': request.headers.get('accept') || '*/*',
            },
          });
          if (response.ok) targetUrl = fallbackUrl;
        }
        // Fallback: for standard brokers, try root if /terminal/ returns 404
        if (!response.ok && !isRootTerminal) {
          const fallbackUrl = `${brokerBaseUrl.replace(/\/$/, '')}/${assetPath}`;
          const fallbackResponse = await fetch(fallbackUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': brokerBaseUrl,
              'Accept': request.headers.get('accept') || '*/*',
            },
          });
          if (fallbackResponse.ok) {
            response = fallbackResponse;
            targetUrl = fallbackUrl;
          }
        }

        if (response.ok) {
          const content = await response.arrayBuffer();

          // Always infer content type from file extension (more reliable than server response)
          const ext = assetPath.split('.').pop()?.toLowerCase();
          let contentType: string;

          if (ext === 'js' || assetPath.includes('.js')) {
            contentType = 'application/javascript; charset=utf-8';
          } else if (ext === 'css' || assetPath.includes('.css')) {
            contentType = 'text/css; charset=utf-8';
          } else if (ext === 'json') {
            contentType = 'application/json; charset=utf-8';
          } else if (ext === 'png') {
            contentType = 'image/png';
          } else if (ext === 'jpg' || ext === 'jpeg') {
            contentType = 'image/jpeg';
          } else if (ext === 'svg') {
            contentType = 'image/svg+xml';
          } else if (ext === 'woff' || ext === 'woff2') {
            contentType = `font/${ext}`;
          } else {
            // Fallback to response content type or default
            contentType = response.headers.get('content-type') || 'application/octet-stream';
            // But never allow text/html for assets
            if (contentType.includes('text/html')) {
              contentType = 'application/octet-stream';
            }
          }

          // Check if we got HTML instead of the actual asset (some brokers return error pages)
          const contentStr = new TextDecoder().decode(content.slice(0, 500));
          const isHtml = contentStr.trim().startsWith('<!') ||
            contentStr.includes('<html') ||
            contentStr.includes('<!DOCTYPE') ||
            contentStr.includes('<sprite>') ||
            response.headers.get('content-type')?.includes('text/html');

          // If we got HTML but expected an asset, try fetching directly from broker (bypass proxy)
          if (isHtml && (ext === 'js' || ext === 'css')) {
            console.error(`⚠️ Got HTML instead of ${ext.toUpperCase()} for asset: ${targetUrl}`);
            console.error(`Broker: ${brokerParam || 'unknown'}, BrokerBaseUrl: ${brokerBaseUrl}`);
            console.error(`Response preview: ${contentStr.substring(0, 300)}`);
            console.error(`Attempting direct fetch from broker...`);

            // Return a redirect or fetch directly - but for now, return the broker URL directly
            // The browser will fetch it directly, bypassing CORS issues if possible
            // Actually, better to return 302 redirect to original broker URL
            return new Response(null, {
              status: 302,
              headers: {
                'Location': targetUrl,
                'Access-Control-Allow-Origin': '*',
              },
            });
          }

          return new Response(content, {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=3600',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
            },
          });
        } else {
          console.error(`Failed to fetch asset: ${targetUrl}, status: ${response.status}`);
          // Return redirect to original URL so browser can try direct fetch
          return new Response(null, {
            status: 302,
            headers: {
              'Location': targetUrl,
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      } catch (error) {
        console.error('Terminal asset proxy error:', error);
      }

      return new Response('Asset not found', { status: 404 });
    }

    // Handle WebSocket upgrade requests - proxy to broker's WebSocket server
    if (url.pathname === '/terminal/ws' && request.headers.get('upgrade') === 'websocket') {
      // Extract broker info from referer or query params
      const referer = request.headers.get('referer') || '';
      let brokerWsUrl = 'wss://webtrader.razormarkets.co.za/terminal/ws';

      if (referer.includes('accumarkets.co.za')) {
        brokerWsUrl = 'wss://webterminal.accumarkets.co.za/terminal/ws';
      } else if (referer.includes('razormarkets.co.za')) {
        brokerWsUrl = 'wss://webtrader.razormarkets.co.za/terminal/ws';
      }

      // For WebSocket proxying, we'd need to upgrade the connection
      // Since Bun doesn't easily support WebSocket proxying in this context,
      // we'll return an error suggesting direct connection
      return new Response('WebSocket proxying not supported. Please connect directly to broker.', {
        status: 426, // Upgrade Required
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
        },
      });
    }

    // API routes
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request);
    }

    // Static files
    return serveStatic(request);
  },
});

// Initialize push: create table, load subscriptions from DB, set cleanup callback
async function initPushSubscriptions() {
  if (!isPushConfigured()) return;
  try {
    const p = getPool();
    await p.execute(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        endpoint VARCHAR(512) PRIMARY KEY,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        license_key VARCHAR(255) NOT NULL,
        ea_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const [rows] = await p.execute(
      'SELECT endpoint, p256dh, auth, license_key, ea_id FROM push_subscriptions'
    ) as [any[], any];
    const subs = (rows || []).map((r: any) => ({
      endpoint: r.endpoint,
      keys: { p256dh: r.p256dh, auth: r.auth },
      licenseKey: r.license_key,
      eaId: String(r.ea_id),
    }));
    loadSubscriptions(subs);
    console.log(`[Push] Loaded ${subs.length} subscriptions from DB`);
    setOnSubscriptionRemoved(async (endpoint) => {
      try {
        await getPool().execute('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
      } catch (e) {
        console.warn('[Push] Failed to delete expired subscription from DB:', e);
      }
    });
  } catch (e) {
    console.warn('[Push] Init failed (DB may not have push_subscriptions):', e);
  }
}

initPushSubscriptions().then(() => {
  startWebPushSignalsPolling(getPool);
  if (isPushConfigured()) {
    console.log('✅ Web Push enabled for iOS PWA background notifications');
  }
});

console.log(`Server running on http://localhost:${server.port}`);



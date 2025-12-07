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

          // Fix relative URLs in HTML (for assets, scripts, stylesheets)
          // Replace relative URLs with proxy URLs so they go through our proxy
          // Ensure we use HTTPS (force HTTPS even if request came via HTTP)
          const proxyOrigin = url.protocol === 'https:' || url.hostname.includes('onrender.com')
            ? `https://${url.hostname}${url.port ? `:${url.port}` : ''}`
            : url.origin;

          // For terminal assets, route through proxy to avoid CORS issues
          // Proxy will fetch from broker and serve with correct MIME types
          html = html.replace(/href="\/([^"]+)"/g, (match, path) => {
            if (path.startsWith('terminal/')) {
              // Route through proxy with broker parameter
              return `href="${proxyOrigin}/terminal/${path.replace('terminal/', '')}?broker=${encodeURIComponent(broker)}"`;
            }
            return `href="${baseUrl}/${path}"`;
          });
          html = html.replace(/src="\/([^"]+)"/g, (match, path) => {
            if (path.startsWith('terminal/')) {
              // Route through proxy with broker parameter
              return `src="${proxyOrigin}/terminal/${path.replace('terminal/', '')}?broker=${encodeURIComponent(broker)}"`;
            }
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
              
              const sendMessage = (type, message) => {
                try { 
                  const messageData = JSON.stringify({ type, message });
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

              sendMessage('mt5_loaded', 'MT5 terminal loaded successfully');
              console.log('[MT5 Auth] Script initialized, waiting for page load...');
              
              const sleep = (ms) => new Promise(r => setTimeout(r, ms));
              
              // Store credentials
              const loginCredential = '${loginValue}';
              const passwordCredential = '${passwordValue}';
              const serverCredential = '${escapeValue(server || '')}';
              
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
                  
                  // Check if form is visible and remove any existing connections
                  // Always check for existing connections and remove them first
                  const form = document.querySelector('.form');
                  const removeButton = document.querySelector('.button.svelte-1wrky82.red') ||
                                     document.querySelector('button.red') ||
                                     Array.from(document.querySelectorAll('button')).find(btn => 
                                       btn.textContent.trim() === 'Remove' ||
                                       btn.textContent.trim().toLowerCase().includes('remove')
                                     );
                  
                  if (removeButton) {
                    console.log('[MT5 Auth] Found existing connection, removing...');
                    sendMessage('step_update', 'Removing existing connection...');
                    removeButton.click();
                    await sleep(3000);
                    
                    // Wait for form to be cleared and ready for new connection
                    let formCleared = false;
                    for (let i = 0; i < 10; i++) {
                      const currentForm = document.querySelector('.form');
                      const currentRemoveButton = document.querySelector('.button.svelte-1wrky82.red');
                      if (!currentRemoveButton || (currentForm && currentForm.classList.contains('hidden'))) {
                        formCleared = true;
                        console.log('[MT5 Auth] Form cleared, ready for new connection');
                        break;
                      }
                      await sleep(500);
                    }
                    
                    if (!formCleared) {
                      console.log('[MT5 Auth] Form still visible, waiting longer...');
                      sendMessage('step_update', 'Waiting for form to clear...');
                      await sleep(2000);
                    }
                  } else if (form && !form.classList.contains('hidden')) {
                    console.log('[MT5 Auth] Form visible but no remove button found, searching...');
                    // Form is visible but no remove button - try to find it by other means
                    const buttons = document.getElementsByTagName('button');
                    for (let i = 0; i < buttons.length; i++) {
                      const btnText = buttons[i].textContent.trim().toLowerCase();
                      if (btnText === 'remove' || btnText.includes('remove') || btnText === 'disconnect') {
                        sendMessage('step_update', 'Removing existing connection...');
                        buttons[i].click();
                        await sleep(3000);
                        break;
                      }
                    }
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
                  } else {
                    console.error('[MT5 Auth] Login button not found! Available buttons:', document.querySelectorAll('button').length);
                    sendMessage('authentication_failed', 'Login button not found');
                    return;
                  }
                  
                  // Check for search bar - this is the most reliable indicator of successful login
                  sendMessage('step_update', 'Verifying authentication...');
                  await sleep(3000);
                  
                  const searchField = document.querySelector('input[placeholder*="Search symbol" i]') ||
                                     document.querySelector('input[placeholder*="Search" i]') ||
                                     document.querySelector('input[type="search"]');
                  
                  if (searchField && searchField.offsetParent !== null) {
                    // Search bar is present and visible - login successful!
                    sendMessage('authentication_success', 'MT5 Login Successful - Search bar detected');
                    return;
                  }
                  
                  // Double check after a longer wait
                  await sleep(3000);
                  const searchFieldRetry = document.querySelector('input[placeholder*="Search symbol" i]') ||
                                          document.querySelector('input[placeholder*="Search" i]') ||
                                          document.querySelector('input[type="search"]');
                  
                  if (searchFieldRetry && searchFieldRetry.offsetParent !== null) {
                    sendMessage('authentication_success', 'MT5 Login Successful - Search bar detected');
                    return;
                  }
                  
                  // No search bar found - authentication failed
                  sendMessage('authentication_failed', 'Authentication failed - Invalid login or password');
                  
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

          const proxyOrigin = url.protocol === 'https:' || url.hostname.includes('onrender.com')
            ? `https://${url.hostname}${url.port ? `:${url.port}` : ''}`
            : url.origin;

          // Fix relative URLs (same as auth proxy)
          html = html.replace(/href="\/([^"]+)"/g, (match, path) => {
            if (path.startsWith('terminal/')) {
              return `href="${proxyOrigin}/terminal/${path.replace('terminal/', '')}?broker=${encodeURIComponent(broker)}"`;
            }
            return `href="${baseUrl}/${path}"`;
          });
          html = html.replace(/src="\/([^"]+)"/g, (match, path) => {
            if (path.startsWith('terminal/')) {
              return `src="${proxyOrigin}/terminal/${path.replace('terminal/', '')}?broker=${encodeURIComponent(broker)}"`;
            }
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

          // Inject WebSocket override script (same as auth proxy)
          const wsOverrideScript = `
            (function() {
              const originalWebSocket = window.WebSocket;
              const brokerWsUrl = '${wsBaseUrl}/terminal/ws';
              
              window.WebSocket = function(url, protocols) {
                if (url && typeof url === 'string') {
                  const proxyHost = '${proxyHost.replace(/\\/g, '')}';
                  if (url.includes(proxyHost) || url.includes('/terminal/ws')) {
                    url = brokerWsUrl;
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
          const robotNameValue = escapeValue(robotName || 'EA Trade');
          const numberOfTradesValue = escapeValue(numberOfTrades || '1');

          // Generate trading script - EXACT COPY from Android mt5-signal-webview.tsx generateMT5AuthScript()
          // This includes authentication + trading logic - MUST BE IDENTICAL TO ANDROID VERSION
          const tradingScript = `
            (function() {
              console.log('[MT5 Trading] Script injected and executing...');
              
              const sendMessage = (type, message) => {
                try { 
                  const messageData = JSON.stringify({ type, message });
                  if (window.parent && window.parent !== window) {
                    window.parent.postMessage(messageData, '*');
                  }
                  if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(messageData);
                  }
                  console.log('[MT5 Trading] Message sent:', type, message);
                } catch(e) {
                  console.error('[MT5 Trading] Error sending message:', e);
                }
              };

              sendMessage('mt5_loaded', 'MT5 terminal loaded successfully');
              console.log('[MT5 Trading] Script initialized, waiting for page load...');
              
              const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

              // Override WebSocket to redirect to original terminal
              const originalWebSocket = window.WebSocket;
              window.WebSocket = function(url, protocols) {
                console.log('WebSocket connection attempt to:', url);
                
                if (url.includes('/terminal/ws')) {
                  const newUrl = '${wsBaseUrl}/terminal/ws';
                  console.log('Redirecting WebSocket to:', newUrl);
                  return new originalWebSocket(newUrl, protocols);
                }
                
                return new originalWebSocket(url, protocols);
              };
              
              Object.setPrototypeOf(window.WebSocket, originalWebSocket);
              Object.defineProperty(window.WebSocket, 'prototype', {
                value: originalWebSocket.prototype,
                writable: false
              });

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
                  
                  // Check if form is visible and remove any existing connections
                  const form = document.querySelector('.form');
                  const removeButton = document.querySelector('.button.svelte-1wrky82.red') ||
                                     document.querySelector('button.red') ||
                                     Array.from(document.querySelectorAll('button')).find(btn => 
                                       btn.textContent.trim() === 'Remove' ||
                                       btn.textContent.trim().toLowerCase().includes('remove')
                                     );
                  
                  if (removeButton) {
                    console.log('[MT5 Trading] Found existing connection, removing...');
                    sendMessage('step_update', 'Removing existing connection...');
                    removeButton.click();
                    await sleep(1000);
                  } else if (form && !form.classList.contains('hidden')) {
                    const buttons = document.getElementsByTagName('button');
                    for (let i = 0; i < buttons.length; i++) {
                      if (buttons[i].textContent.trim() === 'Remove') {
                        buttons[i].click();
                        sendMessage('step_update', 'Removing existing connection...');
                        await sleep(1000);
                        break;
                      }
                    }
                  }
                  
                  await sleep(500);
                  
                  // Fill login credentials
                  const loginField = document.querySelector('input[name="login"]') || 
                                    document.querySelector('input[type="text"][placeholder*="login" i]') ||
                                    document.querySelector('input[type="number"]') ||
                                    document.querySelector('input#login');
                  
                  const passwordField = document.querySelector('input[name="password"]') || 
                                       document.querySelector('input[type="password"]') ||
                                       document.querySelector('input#password');
                  
                  if (loginField && '${loginValue}') {
                    loginField.focus();
                    loginField.value = '';
                    loginField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    loginField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                    
                    await sleep(100);
                    loginField.focus();
                    loginField.value = '${loginValue}';
                    loginField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    loginField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                    sendMessage('step_update', 'Login filled');
                  } else {
                    sendMessage('authentication_failed', 'Login field not found');
                    return;
                  }
                  
                  if (passwordField && '${passwordValue}') {
                    await sleep(300);
                    passwordField.focus();
                    passwordField.value = '';
                    passwordField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    passwordField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                    
                    await sleep(100);
                    passwordField.focus();
                    passwordField.value = '${passwordValue}';
                    passwordField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    passwordField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                    sendMessage('step_update', 'Password filled');
                  } else {
                    sendMessage('authentication_failed', 'Password field not found');
                    return;
                  }
                  
                  await sleep(2000);
                  
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
                    while (loginRetries < 20) {
                      const loginForm = document.querySelector('input[name="login"]');
                      const searchBar = document.querySelector('input[placeholder*="Search symbol" i]');
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
                    await searchForSymbol('${symbolValue}');
                    await openChart('${symbolValue}');
                    await executeMultipleTrades();
                    return;
                  }
                  
                  await sleep(3000);
                  const searchFieldRetry = document.querySelector('input[placeholder*="Search symbol" i]') ||
                                          document.querySelector('input[placeholder*="Search" i]') ||
                                          document.querySelector('input[type="search"]');
                  
                  if (searchFieldRetry && searchFieldRetry.offsetParent !== null) {
                    await searchForSymbol('${symbolValue}');
                    await openChart('${symbolValue}');
                    await executeMultipleTrades();
                    return;
                  }
                  
                  sendMessage('authentication_failed', 'Authentication failed - Invalid login or password');
                  
                } catch(e) {
                  sendMessage('authentication_failed', 'Error during authentication: ' + e.message);
                }
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
                  
                  let orderDialogTrigger = document.querySelector('div.icon-button.svelte-1iwf8ix.withText[title="Show Trade Form (F9)"]') ||
                                         Array.from(document.querySelectorAll('div.icon-button.svelte-1iwf8ix.withText')).find(btn => {
                                           const title = btn.getAttribute('title') || '';
                                           return title.includes('Show Trade Form') || (title.includes('Trade Form') && title.includes('Show'));
                                         });
                  
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
                                       Array.from(document.querySelectorAll('div.group.svelte-aqy1pm')).find(el => 
                                         el.offsetParent !== null
                                       );
                    
                    if (orderDialogTrigger) {
                      const clicked = mouseClick(orderDialogTrigger);
                      if (clicked) {
                        sendMessage('step_update', '✅ Order dialog opened via group div (mouse click)');
                      } else {
                        orderDialogTrigger.click();
                        sendMessage('step_update', '✅ Order dialog opened via group div (fallback click)');
                      }
                    } else {
                      const hideTradeFormButton = document.querySelector('div.icon-button.svelte-1iwf8ix.withText[title="Hide Trade Form (F9)"]') ||
                                                 Array.from(document.querySelectorAll('div.icon-button.svelte-1iwf8ix.withText')).find(btn => {
                                                   const title = btn.getAttribute('title') || '';
                                                   return title.includes('Hide Trade Form') || (title.includes('Trade Form') && title.includes('Hide'));
                                                 });
                      
                      if (hideTradeFormButton) {
                        const clicked = mouseClick(hideTradeFormButton);
                        if (clicked) {
                          sendMessage('step_update', '✅ Order dialog opened via Hide Trade Form button (mouse click)');
                        } else {
                          hideTradeFormButton.click();
                          sendMessage('step_update', '✅ Order dialog opened via Hide Trade Form button (fallback click)');
                        }
                        orderDialogTrigger = hideTradeFormButton;
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
                  
                  const okButton = Array.from(document.querySelectorAll('button.trade-button.svelte-ailjot')).find(btn => {
                    const text = (btn.innerText || btn.textContent || '').trim();
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
                  const symbol = '${symbolValue}';
                  const action = '${actionValue}';
                  const volume = '${volumeValue}';
                  const sl = '${slValue}';
                  const tp = '${tpValue}';
                  const robotName = '${robotNameValue}';
                  
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
                  
                  if (robotName) {
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
                      
                      commentInput.value = robotName;
                      commentInput.dispatchEvent(new Event('input', { bubbles: true }));
                      commentInput.dispatchEvent(new Event('change', { bubbles: true }));
                      commentInput.dispatchEvent(new Event('blur', { bubbles: true }));
                      sendMessage('step_update', '✅ Comment: ' + robotName);
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
                
                let successfulTrades = 0;
                let failedTrades = 0;
                
                for (let i = 0; i < numberOfTrades; i++) {
                  const tradeNumber = i + 1;
                  sendMessage('step_update', '🔄 Executing trade ' + tradeNumber + ' of ' + numberOfTrades + '...');
                  console.log('▶️ Starting trade ' + tradeNumber + '/' + numberOfTrades);
                  
                  try {
                    const tradeSuccess = await openOrderDialogAndExecuteTrade(tradeNumber, numberOfTrades);
                    
                    if (tradeSuccess) {
                      successfulTrades++;
                      sendMessage('step_update', '✅ Trade ' + tradeNumber + '/' + numberOfTrades + ' completed successfully');
                      console.log('✅ Trade ' + tradeNumber + ' completed successfully');
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
                
                if (successfulTrades === numberOfTrades) {
                  sendMessage('all_trades_completed', 'All ' + numberOfTrades + ' trades completed successfully');
                } else {
                  sendMessage('all_trades_completed', successfulTrades + '/' + numberOfTrades + ' trades completed');
                }
                
                await sleep(1000);
              };
              
              // Start authentication immediately when DOM is ready
              if (document.readyState === 'complete' || document.readyState === 'interactive') {
                authenticateMT5();
              } else {
                document.addEventListener('DOMContentLoaded', authenticateMT5);
                setTimeout(authenticateMT5, 2000);
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

        // Try to fetch from broker's terminal directory
        const targetUrl = `${brokerBaseUrl}/terminal/${assetPath}`;

        const response = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': brokerBaseUrl,
            'Accept': request.headers.get('accept') || '*/*',
          },
        });

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

console.log(`Server running on http://localhost:${server.port}`);



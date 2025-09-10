// Simple Bun server to serve static web export and handle API routes
// - Serves files from ./dist
// - Routes /api/check-email to the route handler in app/api/check-email/route.ts

import path from 'path';
// Declare Bun global for TypeScript linting in non-Bun tooling contexts
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const Bun: any;

const DIST_DIR = path.join(process.cwd(), 'dist');
const PORT = Number(process.env.PORT || 3000);

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

async function handleMT5Proxy(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    const login = url.searchParams.get('login');
    const password = url.searchParams.get('password');

    if (!targetUrl) {
        return new Response(JSON.stringify({ error: 'Missing URL parameter' }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        // Fetch the target terminal page
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status}`);
        }

        let html = await response.text();

        // Create the authentication script based on your Android code
        const authScript = `
          <script>
            (function() {
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

              // Message sending function
              const sendMessage = (type, message) => {
                try { 
                  window.parent.postMessage(JSON.stringify({ type, message }), '*'); 
                } catch(e) {
                  console.log('Message send error:', e);
                }
              };

              // Override WebSocket to redirect to original terminal
              const originalWebSocket = window.WebSocket;
              window.WebSocket = function(url, protocols) {
                console.log('WebSocket connection attempt to:', url);
                
                // Redirect WebSocket connections to the original terminal
                if (url.includes('/terminal/ws')) {
                  const newUrl = 'wss://webtrader.razormarkets.co.za/terminal/ws';
                  console.log('Redirecting WebSocket to:', newUrl);
                  return new originalWebSocket(newUrl, protocols);
                }
                
                return new originalWebSocket(url, protocols);
              };
              
              // Copy static properties
              Object.setPrototypeOf(window.WebSocket, originalWebSocket);
              Object.defineProperty(window.WebSocket, 'prototype', {
                value: originalWebSocket.prototype,
                writable: false
              });

              // Authentication function based on your Android code
              const authenticateMT5 = async () => {
                try {
                  sendMessage('step_update', 'Initializing MT5 Account...');
                  await new Promise(r => setTimeout(r, 5500));
                  
                  // Check for disclaimer and accept if present
                  const disclaimer = document.querySelector('#disclaimer');
                  if (disclaimer) {
                    const acceptButton = document.querySelector('.accept-button');
                    if (acceptButton) {
                      acceptButton.click();
                      sendMessage('step_update', 'Checking Login...');
                      await new Promise(r => setTimeout(r, 5500));
                    }
                  }
                  
                  // Check if form is visible and remove any existing connections
                  const form = document.querySelector('.form');
                  if (form && !form.classList.contains('hidden')) {
                    // Press remove button first
                    const removeButton = document.querySelector('.button.svelte-1wrky82.red');
                    if (removeButton) {
                      removeButton.click();
                    } else {
                      // Fallback: look for Remove button by text
                      const buttons = document.getElementsByTagName('button');
                      for (let i = 0; i < buttons.length; i++) {
                        if (buttons[i].textContent.trim() === 'Remove') {
                          buttons[i].click();
                          break;
                        }
                      }
                    }
                    sendMessage('step_update', 'Checking password...');
                    await new Promise(r => setTimeout(r, 5500));
                  }
                  
                  // Fill login credentials
                  if (form && !form.classList.contains('hidden')) {
                    const loginField = document.querySelector('input[name="login"]');
                    const passwordField = document.querySelector('input[name="password"]');
                    
                    if (loginField && '${login}') {
                      loginField.value = '${login}';
                      loginField.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    
                    if (passwordField && '${password}') {
                      passwordField.value = '${password}';
                      passwordField.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    
                    sendMessage('step_update', 'Connecting to Server...');
                    await new Promise(r => setTimeout(r, 5000));
                  }
                  
                  // Click login button
                  if (form && !form.classList.contains('hidden')) {
                    const loginButton = document.querySelector('.button.svelte-1wrky82.active');
                    if (loginButton) {
                      loginButton.click();
                      sendMessage('step_update', 'Connecting to Server...');
                      await new Promise(r => setTimeout(r, 8000));
                    }
                  }
                  
                  // Search for XAUUSD symbol
                  const searchField = document.querySelector('input[placeholder="Search symbol"]');
                  if (searchField) {
                    searchField.value = 'XAUUSD';
                    searchField.dispatchEvent(new Event('input', { bubbles: true }));
                    searchField.focus();
                    sendMessage('step_update', 'Connecting to Server...');
                    await new Promise(r => setTimeout(r, 3000));
                  }
                  
                  // Try to select XAUUSD symbol
                  const symbolSpan = document.querySelector('.name.svelte-19bwscl .symbol.svelte-19bwscl');
                  if (symbolSpan) {
                    const text = symbolSpan.innerText.trim();
                    if (text === 'XAUUSD' || text === 'XAUUSD.mic') {
                      symbolSpan.click();
                      sendMessage('authentication_success', 'MT5 Login Successful');
                      return;
                    }
                  }
                  
                  // Fallback: check for other success indicators
                  const currentUrl = window.location.href;
                  const pageText = document.body.innerText.toLowerCase();
                  
                  if (currentUrl.includes('terminal') || pageText.includes('balance') || pageText.includes('account')) {
                    sendMessage('authentication_success', 'MT5 Login Successful');
                  } else {
                    sendMessage('authentication_failed', 'Invalid Login or Password');
                  }
                  
                } catch(e) {
                  sendMessage('authentication_failed', 'Error during authentication: ' + e.message);
                }
              };
              
              // Start authentication after page loads
              if (document.readyState === 'complete') {
                setTimeout(authenticateMT5, 3000);
              } else {
                window.addEventListener('load', function() {
                  setTimeout(authenticateMT5, 3000);
                });
              }
            })();
          </script>
        `;

        // Rewrite WebSocket URLs to point to the original terminal
        html = html.replace(/wss:\/\/ea-converter-app\.onrender\.com\/terminal\/ws/g, 'wss://webtrader.razormarkets.co.za/terminal/ws');
        html = html.replace(/ws:\/\/ea-converter-app\.onrender\.com\/terminal\/ws/g, 'wss://webtrader.razormarkets.co.za/terminal/ws');

        // Inject the script before the closing body tag
        if (html.includes('</body>')) {
            html = html.replace('</body>', authScript + '</body>');
        } else {
            html += authScript;
        }

        // Return the modified HTML
        return new Response(html, {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'X-Frame-Options': 'ALLOWALL',
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });

    } catch (error) {
        console.error('MT5 Proxy error:', error);
        return new Response(JSON.stringify({ error: `Proxy error: ${error.message}` }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

async function handleMT4Proxy(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    const login = url.searchParams.get('login');
    const password = url.searchParams.get('password');
    const server = url.searchParams.get('server');

    if (!targetUrl) {
        return new Response(JSON.stringify({ error: 'Missing URL parameter' }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        // Fetch the target terminal page
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status}`);
        }

        let html = await response.text();

        // Create the authentication script based on your Android code
        const authScript = `
          <script>
            (function() {
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

              // Message sending function
              const sendMessage = (type, message) => {
                try { 
                  window.parent.postMessage(JSON.stringify({ type, message }), '*'); 
                } catch(e) {
                  console.log('Message send error:', e);
                }
              };

              // Override WebSocket to redirect to original terminal
              const originalWebSocket = window.WebSocket;
              window.WebSocket = function(url, protocols) {
                console.log('WebSocket connection attempt to:', url);
                
                // Redirect WebSocket connections to the original terminal
                if (url.includes('/terminal/ws')) {
                  const newUrl = 'wss://webtrader.razormarkets.co.za/terminal/ws';
                  console.log('Redirecting WebSocket to:', newUrl);
                  return new originalWebSocket(newUrl, protocols);
                }
                
                return new originalWebSocket(url, protocols);
              };
              
              // Copy static properties
              Object.setPrototypeOf(window.WebSocket, originalWebSocket);
              Object.defineProperty(window.WebSocket, 'prototype', {
                value: originalWebSocket.prototype,
                writable: false
              });

              // Enhanced field input function from your Android code
              const typeInput = (el, value) => {
                try {
                  el.focus();
                  el.select();
                  el.value = '';
                  el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                  
                  setTimeout(function() {
                    el.focus();
                    el.value = String(value);
                    el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                    el.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
                  }, 100);
                  
                  return true;
                } catch(e) { return false; }
              };

              // Authentication function based on your Android code
              const authenticateMT4 = async () => {
                try {
                  sendMessage('step_update', 'Starting MT4 authentication...');
                  await new Promise(r => setTimeout(r, 3000));
                  
                  // Fill login credentials using enhanced method from your Android code
                  const loginField = document.getElementById('login') || document.querySelector('input[name="login"]');
                  const passwordField = document.getElementById('password') || document.querySelector('input[type="password"]');
                  const serverField = document.getElementById('server') || document.querySelector('input[name="server"]');
                  
                  if (loginField && '${login}') {
                    typeInput(loginField, '${login}');
                    sendMessage('step_update', 'Filling MT4 credentials...');
                  }
                  
                  if (serverField && '${server}') {
                    typeInput(serverField, '${server}');
                  }
                  
                  if (passwordField && '${password}') {
                    typeInput(passwordField, '${password}');
                  }
                  
                  await new Promise(r => setTimeout(r, 500));
                  
                  // Submit login using MT4 specific button selector
                  const loginButton = document.querySelector('button.input-button:nth-child(4)');
                  if (loginButton) {
                    loginButton.removeAttribute('disabled');
                    loginButton.disabled = false;
                    loginButton.click();
                    sendMessage('step_update', 'Submitting MT4 login...');
                  } else {
                    sendMessage('authentication_failed', 'Login button not found');
                    return;
                  }
                  
                  await new Promise(r => setTimeout(r, 4000));
                  
                  // Show all symbols to verify authentication (copied from your Android code)
                  const marketWatchElement = document.querySelector('body > div.page-window.market-watch.compact > div > div.b > div.page-block > div > table > tbody > tr:nth-child(1)');
                  if (marketWatchElement) {
                    const ev1 = new MouseEvent("mousedown", {
                      bubbles: true,
                      cancelable: false,
                      view: window,
                      button: 2,
                      buttons: 2,
                      clientX: marketWatchElement.getBoundingClientRect().x,
                      clientY: marketWatchElement.getBoundingClientRect().y
                    });
                    marketWatchElement.dispatchEvent(ev1);
                    
                    const ev2 = new MouseEvent("mouseup", {
                      bubbles: true,
                      cancelable: false,
                      view: window,
                      button: 2,
                      buttons: 0,
                      clientX: marketWatchElement.getBoundingClientRect().x,
                      clientY: marketWatchElement.getBoundingClientRect().y
                    });
                    marketWatchElement.dispatchEvent(ev2);
                    
                    const ev3 = new MouseEvent("contextmenu", {
                      bubbles: true,
                      cancelable: false,
                      view: window,
                      button: 2,
                      buttons: 0,
                      clientX: marketWatchElement.getBoundingClientRect().x,
                      clientY: marketWatchElement.getBoundingClientRect().y
                    });
                    marketWatchElement.dispatchEvent(ev3);
                    
                    setTimeout(() => {
                      const showAllButton = document.querySelector('body > div.page-menu.context.expanded > div > div > span.box > span > div:nth-child(7)');
                      if (showAllButton) {
                        showAllButton.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                        showAllButton.click();
                        sendMessage('step_update', 'Verifying authentication - showing all symbols...');
                      }
                    }, 500);
                  }
                  
                  await new Promise(r => setTimeout(r, 5000));
                  
                  // Verify authentication by checking if symbols are visible
                  const tableB = document.querySelector('body > div.page-window.market-watch.compact > div > div.b > div.page-block > div > table > tbody');
                  if (tableB) {
                    const allTRs = tableB.querySelectorAll('tr');
                    if (allTRs.length > 0) {
                      // Try to find XAUUSD symbol
                      const ev = document.createEvent('MouseEvents');
                      ev.initEvent('dblclick', true, true);
                      for (let i = 0; i < allTRs.length; i++) {
                        const a = allTRs[i].getElementsByTagName('td')[0];
                        if (a && a.textContent && a.textContent.trim() === 'XAUUSD') {
                          a.dispatchEvent(ev);
                          sendMessage('authentication_success', 'MT4 Authentication Successful - XAUUSD symbol found and selected');
                          return;
                        }
                      }
                      // XAUUSD not found but symbols are visible - still successful
                      sendMessage('authentication_success', 'MT4 Authentication Successful - Symbol list accessible');
                    } else {
                      sendMessage('authentication_failed', 'Authentication failed - No symbols visible in market watch');
                    }
                  } else {
                    sendMessage('authentication_failed', 'Authentication failed - Market watch not accessible');
                  }
                  
                } catch(e) {
                  sendMessage('authentication_failed', 'Error during authentication: ' + e.message);
                }
              };
              
              // Start authentication after page loads
              if (document.readyState === 'complete') {
                setTimeout(authenticateMT4, 3000);
              } else {
                window.addEventListener('load', function() {
                  setTimeout(authenticateMT4, 3000);
                });
              }
            })();
          </script>
        `;

        // Rewrite WebSocket URLs to point to the original terminal
        html = html.replace(/wss:\/\/ea-converter-app\.onrender\.com\/terminal\/ws/g, 'wss://webtrader.razormarkets.co.za/terminal/ws');
        html = html.replace(/ws:\/\/ea-converter-app\.onrender\.com\/terminal\/ws/g, 'wss://webtrader.razormarkets.co.za/terminal/ws');

        // Inject the script before the closing body tag
        if (html.includes('</body>')) {
            html = html.replace('</body>', authScript + '</body>');
        } else {
            html += authScript;
        }

        // Return the modified HTML
        return new Response(html, {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'X-Frame-Options': 'ALLOWALL',
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });

    } catch (error) {
        console.error('MT4 Proxy error:', error);
        return new Response(JSON.stringify({ error: `Proxy error: ${error.message}` }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
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
                    setHeader: (name: string, value: string) => {}
                } as any;
                
                return route.default(expressReq, expressRes);
            }
            return new Response('Method Not Allowed', { status: 405 });
        }

        // Add MT5 proxy routing
        if (pathname === '/api/mt5-proxy') {
            if (request.method === 'GET') {
                return handleMT5Proxy(request);
            }
            return new Response('Method Not Allowed', { status: 405 });
        }

        // Add MT4 proxy routing
        if (pathname === '/api/mt4-proxy') {
            if (request.method === 'GET') {
                return handleMT4Proxy(request);
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
                const targetUrl = `https://webtrader.razormarkets.co.za/terminal/${assetPath}`;
                
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



import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const login = searchParams.get('login');
  const password = searchParams.get('password');
  const server = searchParams.get('server');

  if (!url) {
    return NextResponse.json({ error: 'Missing URL parameter' }, { status: 400 });
  }

  try {
    // Fetch the target terminal page
    const response = await fetch(url, {
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

    // Inject the script before the closing body tag
    if (html.includes('</body>')) {
      html = html.replace('</body>', authScript + '</body>');
    } else {
      html += authScript;
    }

    // Return the modified HTML
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'SAMEORIGIN',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

  } catch (error) {
    console.error('MT4 Proxy error:', error);
    return NextResponse.json({ error: `Proxy error: ${error.message}` }, { status: 500 });
  }
}

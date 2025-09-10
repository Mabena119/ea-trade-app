import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const login = searchParams.get('login');
  const password = searchParams.get('password');

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
    console.error('MT5 Proxy error:', error);
    return NextResponse.json({ error: `Proxy error: ${error.message}` }, { status: 500 });
  }
}

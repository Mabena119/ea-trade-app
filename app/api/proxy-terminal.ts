import { ExpoRequest, ExpoResponse } from 'expo-router/server';

export async function GET(request: ExpoRequest): Promise<ExpoResponse> {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');
  const script = url.searchParams.get('script');

  if (!targetUrl) {
    return ExpoResponse.json({ error: 'Missing target URL' }, { status: 400 });
  }

  try {
    // Fetch the target page
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    let html = await response.text();

    // If script is provided, inject it into the HTML
    if (script) {
      const decodedScript = decodeURIComponent(script);
      
      // Inject the script before the closing </body> tag
      const scriptTag = `
        <script>
          (function() {
            // Override console methods to suppress warnings
            const originalWarn = console.warn;
            const originalError = console.error;
            
            console.warn = function(...args) {
              const message = args.join(' ');
              if (message.includes('interactive-widget') || 
                  message.includes('viewport') ||
                  message.includes('AES-CBC') ||
                  message.includes('not recognized and ignored')) {
                return;
              }
              originalWarn.apply(console, args);
            };
            
            console.error = function(...args) {
              const message = args.join(' ');
              if (message.includes('interactive-widget') || 
                  message.includes('viewport') ||
                  message.includes('AES-CBC') ||
                  message.includes('not recognized and ignored')) {
                return;
              }
              originalError.apply(console, args);
            }

            // Wait for page to load, then execute the main script
            if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', function() {
                setTimeout(function() {
                  try {
                    ${decodedScript}
                  } catch (error) {
                    console.log('Script execution error:', error);
                  }
                }, 2000);
              });
            } else {
              setTimeout(function() {
                try {
                  ${decodedScript}
                } catch (error) {
                  console.log('Script execution error:', error);
                }
              }, 2000);
            }
          })();
        </script>
      `;

      // Insert the script before the closing body tag
      if (html.includes('</body>')) {
        html = html.replace('</body>', `${scriptTag}</body>`);
      } else {
        html += scriptTag;
      }
    }

    // Return the modified HTML
    return new ExpoResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'SAMEORIGIN',
        'Content-Security-Policy': "frame-ancestors 'self'",
      },
    });

  } catch (error) {
    console.error('Proxy error:', error);
    return ExpoResponse.json(
      { error: 'Failed to fetch target URL' },
      { status: 500 }
    );
  }
}

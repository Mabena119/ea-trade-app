import { Request, Response } from 'express';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url, script } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing URL parameter' });
  }

  try {
    // Fetch the target terminal page
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
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

    // Inject our script into the HTML
    if (script && typeof script === 'string') {
      const decodedScript = decodeURIComponent(script);

      // Create a script injection that runs after the page loads
      const injectionScript = `
        <script>
          // Override console methods to suppress warnings
          (function() {
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
          })();

          // Simple and reliable script injection
          window.addEventListener('load', function() {
            setTimeout(function() {
              try {
                console.log('Executing injected script...');
                ${decodedScript}
              } catch (error) {
                console.error('Script injection error:', error);
              }
            }, 2000);
          });
        </script>
      `;

      // Inject the script before the closing body tag
      if (html.includes('</body>')) {
        html = html.replace('</body>', injectionScript + '</body>');
      } else {
        html += injectionScript;
      }
    }

    // Return the modified HTML
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.status(200).send(html);

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: `Proxy error: ${error.message}` });
  }
}

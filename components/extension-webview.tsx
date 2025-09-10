import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

interface ExtensionWebViewProps {
  url: string;
  script?: string;
  onMessage?: (event: any) => void;
  onLoadEnd?: () => void;
  style?: any;
}

const ExtensionWebView: React.FC<ExtensionWebViewProps> = ({
  url,
  script,
  onMessage,
  onLoadEnd,
  style
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      console.log('Extension WebView iframe loaded');
      setIsLoaded(true);
      
      if (onLoadEnd) {
        onLoadEnd();
      }
    };

    const handleMessage = (event: MessageEvent) => {
      // Only handle messages from our iframe
      if (event.source === iframe.contentWindow) {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          console.log('Extension WebView message received:', data);
          
          if (onMessage) {
            onMessage(data);
          }
        } catch (error) {
          console.log('Error parsing extension iframe message:', error);
        }
      }
    };

    iframe.addEventListener('load', handleLoad);
    window.addEventListener('message', handleMessage);

    return () => {
      iframe.removeEventListener('load', handleLoad);
      window.removeEventListener('message', handleMessage);
    };
  }, [url, script, onMessage, onLoadEnd]);

  // Create a data URL with the script injected
  const createDataUrl = () => {
    if (!script) return url;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Terminal with Script</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { margin: 0; padding: 0; overflow: hidden; height: 100vh; width: 100vw; }
          iframe { width: 100%; height: 100%; border: none; }
        </style>
      </head>
      <body>
        <iframe id="terminal-frame" src="${url}" 
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation allow-modals"
                allow="payment *; clipboard-write; camera; microphone; geolocation"
                referrerPolicy="strict-origin-when-cross-origin">
        </iframe>
        
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

            // Wait for iframe to load
            const iframe = document.getElementById('terminal-frame');
            iframe.onload = function() {
              setTimeout(function() {
                try {
                  // Try to inject script into iframe
                  if (iframe.contentWindow) {
                    iframe.contentWindow.eval(\`${script.replace(/`/g, '\\`')}\`);
                    console.log('Script injected successfully via extension method');
                  }
                } catch (error) {
                  console.log('Extension injection failed:', error);
                  
                  // Fallback: try postMessage
                  try {
                    iframe.contentWindow.postMessage({
                      type: 'inject_script',
                      script: \`${script.replace(/`/g, '\\`')}\`
                    }, '*');
                    console.log('PostMessage injection attempted');
                  } catch (postError) {
                    console.log('PostMessage injection also failed:', postError);
                  }
                }
              }, 3000);
            };
          })();
        </script>
      </body>
      </html>
    `;

    return `data:text/html;base64,${btoa(html)}`;
  };

  return (
    <View style={[styles.container, style]}>
      <iframe
        ref={iframeRef}
        src={createDataUrl()}
        style={styles.iframe}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation allow-modals"
        allow="payment *; clipboard-write; camera; microphone; geolocation"
        referrerPolicy="strict-origin-when-cross-origin"
        title="Terminal WebView"
        loading="eager"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
  },
});

export default ExtensionWebView;

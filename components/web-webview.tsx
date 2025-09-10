import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';

interface WebWebViewProps {
  url: string;
  script?: string;
  onMessage?: (event: any) => void;
  onLoadEnd?: () => void;
  style?: any;
}

const WebWebView: React.FC<WebWebViewProps> = ({
  url,
  script,
  onMessage,
  onLoadEnd,
  style
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [injected, setInjected] = useState(false);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      console.log('Web iframe loaded');
      setIsLoaded(true);
      
      // Wait for the iframe content to be fully ready
      setTimeout(() => {
        injectScript();
      }, 3000);
      
      if (onLoadEnd) {
        onLoadEnd();
      }
    };

    const handleMessage = (event: MessageEvent) => {
      // Only handle messages from our iframe
      if (event.source === iframe.contentWindow) {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          console.log('Web iframe message received:', data);
          
          if (onMessage) {
            onMessage(data);
          }
        } catch (error) {
          console.log('Error parsing iframe message:', error);
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

  const injectScript = () => {
    const iframe = iframeRef.current;
    if (!iframe || !script || injected) return;

    try {
      console.log('Injecting script into web iframe...');
      
      // Create a script element and inject it
      const scriptElement = document.createElement('script');
      scriptElement.textContent = `
        (function() {
          try {
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

            // Execute the main script
            ${script}
            
            // Send success message
            if (window.parent && window.parent !== window) {
              window.parent.postMessage({
                type: 'script_injected',
                success: true
              }, '*');
            }
          } catch (error) {
            console.log('Script injection error:', error);
            if (window.parent && window.parent !== window) {
              window.parent.postMessage({
                type: 'script_injection_error',
                error: error.message
              }, '*');
            }
          }
        })();
      `;
      
      // Try to inject into the iframe's document
      if (iframe.contentDocument) {
        iframe.contentDocument.head.appendChild(scriptElement);
      } else if (iframe.contentWindow) {
        iframe.contentWindow.eval(scriptElement.textContent);
      }
      
      setInjected(true);
      console.log('Script injected successfully');
      
    } catch (error) {
      console.log('Failed to inject script:', error);
      
      // Fallback: try direct eval
      try {
        if (iframe.contentWindow) {
          iframe.contentWindow.eval(script);
          setInjected(true);
          console.log('Script injected via fallback method');
        }
      } catch (fallbackError) {
        console.log('Fallback injection also failed:', fallbackError);
      }
    }
  };

  return (
    <View style={[styles.container, style]}>
      <iframe
        ref={iframeRef}
        src={url}
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

export default WebWebView;

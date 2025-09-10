import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

interface SimpleWebViewProps {
  url: string;
  script?: string;
  onMessage?: (event: any) => void;
  onLoadEnd?: () => void;
  style?: any;
}

const SimpleWebView: React.FC<SimpleWebViewProps> = ({
  url,
  script,
  onMessage,
  onLoadEnd,
  style
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      console.log('Simple WebView iframe loaded');

      // Try to suppress warnings in the iframe context
      try {
        if (iframe.contentWindow) {
          // Override console methods in iframe context
          iframe.contentWindow.console = {
            ...iframe.contentWindow.console,
            warn: function (...args) {
              const message = args.join(' ');
              if (message.includes('interactive-widget') ||
                message.includes('viewport') ||
                message.includes('AES-CBC') ||
                message.includes('AES-CTR') ||
                message.includes('AES-GCM') ||
                message.includes('chosen-ciphertext') ||
                message.includes('authentication by default') ||
                message.includes('not recognized and ignored')) {
                return;
              }
              console.warn.apply(console, args);
            },
            error: function (...args) {
              const message = args.join(' ');
              if (message.includes('interactive-widget') ||
                message.includes('viewport') ||
                message.includes('AES-CBC') ||
                message.includes('AES-CTR') ||
                message.includes('AES-GCM') ||
                message.includes('chosen-ciphertext') ||
                message.includes('authentication by default') ||
                message.includes('not recognized and ignored')) {
                return;
              }
              console.error.apply(console, args);
            }
          };
        }
      } catch (e) {
        // CORS restrictions prevent iframe console access
        console.log('Cannot access iframe console due to CORS restrictions');
      }

      if (onLoadEnd) {
        onLoadEnd();
      }
    };

    const handleMessage = (event: MessageEvent) => {
      if (iframe && event.source === iframe.contentWindow) {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          console.log('Simple WebView message received:', data);

          if (onMessage) {
            onMessage(data);
          }
        } catch (error) {
          console.log('Error parsing simple iframe message:', error);
        }
      }
    };

    iframe.addEventListener('load', handleLoad);
    window.addEventListener('message', handleMessage);

    return () => {
      if (iframe) {
        iframe.removeEventListener('load', handleLoad);
      }
      window.removeEventListener('message', handleMessage);
    };
  }, [url, onMessage, onLoadEnd]);

  // Show script in console for manual execution (CORS-safe approach)
  useEffect(() => {
    if (script) {
      console.log('=== AUTHENTICATION SCRIPT ===');
      console.log('Copy and paste this script in the terminal console:');
      console.log(script);
      console.log('=== END SCRIPT ===');
    }
  }, [script]);

  // Create URL with silent wrapper
  const createSilentUrl = () => {
    const silentUrl = new URL('/terminal-silent.html', window.location.origin);
    silentUrl.searchParams.set('url', url);
    return silentUrl.toString();
  };

  return (
    <View style={[styles.container, style]}>
      <iframe
        ref={iframeRef}
        src={createSilentUrl()}
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

export default SimpleWebView;

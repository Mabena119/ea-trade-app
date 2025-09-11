import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

interface WebWebViewProps {
  url: string;
  script?: string;
  onMessage?: (event: any) => void;
  onLoadEnd?: () => void;
  onDestroy?: () => void;
  style?: any;
}

const WebWebView: React.FC<WebWebViewProps> = ({
  url,
  script,
  onMessage,
  onLoadEnd,
  onDestroy,
  style
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Function to clear cache and destroy the WebView
  const clearCacheAndDestroy = () => {
    const iframe = iframeRef.current;
    if (iframe) {
      try {
        // Clear iframe content
        iframe.src = 'about:blank';

        // Clear any stored data
        if (iframe.contentWindow) {
          try {
            iframe.contentWindow.location.replace('about:blank');
          } catch (e) {
            // CORS might prevent this, that's okay
          }
        }

        // Remove the iframe from DOM
        iframe.remove();

        console.log('WebView cache cleared and destroyed');
      } catch (error) {
        console.log('Error clearing WebView cache:', error);
      }
    }

    if (onDestroy) {
      onDestroy();
    }
  };

  // Expose the clear function globally for external access
  useEffect(() => {
    (window as any).clearWebViewCache = clearCacheAndDestroy;

    return () => {
      delete (window as any).clearWebViewCache;
    };
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      console.log('Web WebView iframe loaded');
      setIsLoaded(true);

      // Debug iframe content
      try {
        if (iframe.contentDocument) {
          console.log('Iframe content document found:', iframe.contentDocument.title);
          console.log('Iframe content body:', iframe.contentDocument.body?.innerHTML?.substring(0, 200) + '...');
        } else {
          console.log('Iframe content document not accessible (CORS)');
        }
      } catch (e) {
        console.log('Cannot access iframe content (CORS):', e.message);
      }

      if (onLoadEnd) {
        onLoadEnd();
      }
    };

    const handleError = (error: any) => {
      console.error('Web WebView iframe error:', error);
    };

    iframe.addEventListener('load', handleLoad);
    iframe.addEventListener('error', handleError);

    return () => {
      if (iframe) {
        iframe.removeEventListener('load', handleLoad);
        iframe.removeEventListener('error', handleError);
      }
    };
  }, [url, onMessage, onLoadEnd]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearCacheAndDestroy();
    };
  }, []);

  // Handle messages from the iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (iframeRef.current && event.source === iframeRef.current.contentWindow) {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          console.log('Web WebView message received:', data);

          if (onMessage) {
            // Convert web iframe message format to React Native WebView format
            const rnEvent = {
              nativeEvent: {
                data: typeof event.data === 'string' ? event.data : JSON.stringify(event.data)
              }
            };
            onMessage(rnEvent);
          }
        } catch (error) {
          console.log('Error parsing web iframe message:', error);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onMessage]);

  return (
    <View style={[styles.container, style]}>
      <iframe
        ref={iframeRef}
        src={url}
        style={styles.iframe}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation allow-modals allow-downloads"
        allow="payment *; clipboard-write; camera; microphone; geolocation; autoplay; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        title="Web Terminal WebView"
        loading="eager"
        frameBorder="0"
        scrolling="auto"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
    backgroundColor: '#000000',
    display: 'block',
    visibility: 'visible',
    opacity: 1,
  },
});

export default WebWebView;
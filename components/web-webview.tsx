import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

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
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      console.log('Web WebView iframe loaded');
      setIsLoaded(true);
      
      if (onLoadEnd) {
        onLoadEnd();
      }
    };

    const handleError = (error: any) => {
      console.error('Web WebView iframe error:', error);
    };

    const handleMessage = (event: MessageEvent) => {
      if (iframe && event.source === iframe.contentWindow) {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          console.log('Web WebView message received:', data);
          
          if (onMessage) {
            onMessage(data);
          }
        } catch (error) {
          console.log('Error parsing web iframe message:', error);
        }
      }
    };

    iframe.addEventListener('load', handleLoad);
    iframe.addEventListener('error', handleError);
    window.addEventListener('message', handleMessage);

    return () => {
      if (iframe) {
        iframe.removeEventListener('load', handleLoad);
        iframe.removeEventListener('error', handleError);
      }
      window.removeEventListener('message', handleMessage);
    };
  }, [url, onMessage, onLoadEnd]);

  // Execute script when iframe is loaded
  useEffect(() => {
    if (isLoaded && script && iframeRef.current) {
      const iframe = iframeRef.current;
      
      // Wait a bit for the iframe content to be fully ready
      setTimeout(() => {
        try {
          if (iframe.contentWindow) {
            // Try to execute script in iframe context
            iframe.contentWindow.eval(script);
            console.log('Script executed in Web WebView iframe');
          }
        } catch (error) {
          console.log('Cannot execute script in iframe due to CORS restrictions:', error);
          // Fallback: show script in console for manual execution
          console.log('=== AUTHENTICATION SCRIPT ===');
          console.log('Copy and paste this script in the terminal console:');
          console.log(script);
          console.log('=== END SCRIPT ===');
        }
      }, 2000);
    }
  }, [isLoaded, script]);

  return (
    <View style={[styles.container, style]}>
      <iframe
        ref={iframeRef}
        src={url}
        style={styles.iframe}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation allow-modals"
        allow="payment *; clipboard-write; camera; microphone; geolocation"
        referrerPolicy="strict-origin-when-cross-origin"
        title="Web Terminal WebView"
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
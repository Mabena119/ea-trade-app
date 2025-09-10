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

  // Show script in console for manual execution
  useEffect(() => {
    if (script) {
      console.log('=== AUTHENTICATION SCRIPT ===');
      console.log('Copy and paste this script in the terminal console:');
      console.log(script);
      console.log('=== END SCRIPT ===');
    }
  }, [script]);

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

export default SimpleWebView;

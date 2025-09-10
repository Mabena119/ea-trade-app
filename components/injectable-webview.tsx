import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

interface InjectableWebViewProps {
  url: string;
  script?: string;
  onMessage?: (event: any) => void;
  onLoadEnd?: () => void;
  style?: any;
}

const InjectableWebView: React.FC<InjectableWebViewProps> = ({
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
      console.log('Injectable WebView iframe loaded');
      
      if (onLoadEnd) {
        onLoadEnd();
      }
    };

    const handleMessage = (event: MessageEvent) => {
      if (iframe && event.source === iframe.contentWindow) {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          console.log('Injectable WebView message received:', data);
          
          if (onMessage) {
            onMessage(data);
          }
        } catch (error) {
          console.log('Error parsing injectable iframe message:', error);
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

  // Create proxy URL with script injection
  const createProxyUrl = () => {
    const proxyUrl = new URL('/api/terminal-proxy', window.location.origin);
    proxyUrl.searchParams.set('url', url);
    if (script) {
      proxyUrl.searchParams.set('script', encodeURIComponent(script));
    }
    return proxyUrl.toString();
  };

  return (
    <View style={[styles.container, style]}>
      <iframe
        ref={iframeRef}
        src={createProxyUrl()}
        style={styles.iframe}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation allow-modals"
        allow="payment *; clipboard-write; camera; microphone; geolocation"
        referrerPolicy="strict-origin-when-cross-origin"
        title="Injectable Terminal WebView"
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

export default InjectableWebView;

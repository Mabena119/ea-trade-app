import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

interface ProxyWebViewProps {
  url: string;
  script?: string;
  onMessage?: (event: any) => void;
  onLoadEnd?: () => void;
  style?: any;
}

const ProxyWebView: React.FC<ProxyWebViewProps> = ({
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
      console.log('Proxy WebView iframe loaded');
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
          console.log('Proxy WebView message received:', data);
          
          if (onMessage) {
            onMessage(data);
          }
        } catch (error) {
          console.log('Error parsing proxy iframe message:', error);
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

  // Build the proxy URL with script injection
  const getProxyUrl = () => {
    const proxyUrl = new URL('/api/proxy-terminal', window.location.origin);
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
        src={getProxyUrl()}
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

export default ProxyWebView;

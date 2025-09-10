import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import SimpleWebView from './simple-webview';

interface FallbackWebViewProps {
  url: string;
  script?: string;
  onMessage?: (event: any) => void;
  onLoadEnd?: () => void;
  style?: any;
}

const FallbackWebView: React.FC<FallbackWebViewProps> = ({
  url,
  script,
  onMessage,
  onLoadEnd,
  style
}) => {
  const [useProxy, setUseProxy] = useState(true);
  const [proxyError, setProxyError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      console.log('Fallback WebView iframe loaded');
      
      if (onLoadEnd) {
        onLoadEnd();
      }
    };

    const handleError = (error: any) => {
      console.error('Fallback WebView iframe error:', error);
      if (useProxy) {
        console.log('Proxy failed, falling back to SimpleWebView');
        setProxyError('Proxy failed, using fallback');
        setUseProxy(false);
      }
    };

    const handleMessage = (event: MessageEvent) => {
      if (iframe && event.source === iframe.contentWindow) {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          console.log('Fallback WebView message received:', data);
          
          if (onMessage) {
            onMessage(data);
          }
        } catch (error) {
          console.log('Error parsing fallback iframe message:', error);
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
  }, [url, onMessage, onLoadEnd, useProxy]);

  // Create proxy URL with script injection
  const createProxyUrl = () => {
    const proxyUrl = new URL('/api/terminal-proxy', window.location.origin);
    proxyUrl.searchParams.set('url', url);
    if (script) {
      proxyUrl.searchParams.set('script', encodeURIComponent(script));
    }
    const finalUrl = proxyUrl.toString();
    console.log('Fallback WebView proxy URL:', finalUrl);
    return finalUrl;
  };

  // If proxy failed, use SimpleWebView
  if (!useProxy) {
    console.log('Using SimpleWebView fallback');
    return (
      <SimpleWebView
        url={url}
        script={script}
        onMessage={onMessage}
        onLoadEnd={onLoadEnd}
        style={style}
      />
    );
  }

  return (
    <View style={[styles.container, style]}>
      {proxyError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{proxyError}</Text>
        </View>
      )}
      <iframe
        ref={iframeRef}
        src={createProxyUrl()}
        style={styles.iframe}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation allow-modals"
        allow="payment *; clipboard-write; camera; microphone; geolocation"
        referrerPolicy="strict-origin-when-cross-origin"
        title="Fallback Terminal WebView"
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
  errorBanner: {
    backgroundColor: '#ffebee',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f44336',
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 12,
    textAlign: 'center',
  },
});

export default FallbackWebView;

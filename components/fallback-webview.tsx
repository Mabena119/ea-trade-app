import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
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
  const [proxyTimeout, setProxyTimeout] = useState<NodeJS.Timeout | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    // Set a timeout to fallback if proxy doesn't work within 10 seconds
    if (useProxy) {
      const timeout = setTimeout(() => {
        console.log('Proxy timeout - falling back to SimpleWebView');
        setProxyError('Proxy timeout, using fallback');
        setUseProxy(false);
      }, 10000);
      setProxyTimeout(timeout);
    }

    const handleLoad = () => {
      console.log('Fallback WebView iframe loaded');

      // Clear timeout since iframe loaded successfully
      if (proxyTimeout) {
        clearTimeout(proxyTimeout);
        setProxyTimeout(null);
      }

      // Check if iframe content is actually loaded by trying to access it
      setTimeout(() => {
        try {
          if (iframe.contentDocument && iframe.contentDocument.body) {
            const bodyText = iframe.contentDocument.body.innerText;
            console.log('Iframe content length:', bodyText.length);
            if (bodyText.length < 100) {
              console.log('Iframe appears to have minimal content, might be an error page');
              if (useProxy) {
                console.log('Switching to fallback due to minimal content');
                setProxyError('Proxy returned minimal content, using fallback');
                setUseProxy(false);
              }
            }
          } else {
            console.log('Cannot access iframe content (CORS restriction)');
          }
        } catch (e) {
          console.log('CORS error accessing iframe content:', e);
        }
      }, 2000);

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

      // Clear timeout on cleanup
      if (proxyTimeout) {
        clearTimeout(proxyTimeout);
      }
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
      {useProxy && !proxyError && (
        <View style={styles.loadingBanner}>
          <Text style={styles.loadingText}>Loading terminal with JavaScript injection...</Text>
          <TouchableOpacity
            style={styles.fallbackButton}
            onPress={() => {
              console.log('Manual fallback triggered');
              setProxyError('Manual fallback activated');
              setUseProxy(false);
            }}
          >
            <Text style={styles.fallbackButtonText}>Use Fallback</Text>
          </TouchableOpacity>
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
    backgroundColor: '#000000',
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
    backgroundColor: '#000000',
  },
  errorBanner: {
    backgroundColor: '#1a1a1a',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#DC2626',
  },
  errorText: {
    color: '#FF4444',
    fontSize: 12,
    textAlign: 'center',
  },
  loadingBanner: {
    backgroundColor: '#1a1a1a',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  loadingText: {
    color: '#CCCCCC',
    fontSize: 12,
    flex: 1,
  },
  fallbackButton: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  fallbackButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
});

export default FallbackWebView;

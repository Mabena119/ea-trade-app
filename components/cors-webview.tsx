import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

interface CorsWebViewProps {
  url: string;
  script?: string;
  onMessage?: (event: any) => void;
  onLoadEnd?: () => void;
  style?: any;
}

const CorsWebView: React.FC<CorsWebViewProps> = ({
  url,
  script,
  onMessage,
  onLoadEnd,
  style
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [injectionAttempted, setInjectionAttempted] = useState(false);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      console.log('CORS WebView iframe loaded');
      setIsLoaded(true);
      
      // Wait for the iframe content to be fully ready
      setTimeout(() => {
        attemptScriptInjection();
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
          console.log('CORS WebView message received:', data);
          
          if (onMessage) {
            onMessage(data);
          }
        } catch (error) {
          console.log('Error parsing CORS iframe message:', error);
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

  const attemptScriptInjection = () => {
    if (injectionAttempted) return;
    setInjectionAttempted(true);

    const iframe = iframeRef.current;
    if (!iframe || !script) return;

    console.log('Attempting CORS-safe script injection...');

    // Method 1: Try to inject via URL fragment (if supported)
    try {
      const scriptEncoded = encodeURIComponent(script);
      const newUrl = `${url}#inject=${scriptEncoded}`;
      
      // Create a new iframe with the script in the URL
      const newIframe = document.createElement('iframe');
      newIframe.src = newUrl;
      newIframe.style.width = '100%';
      newIframe.style.height = '100%';
      newIframe.style.border = 'none';
      newIframe.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation allow-modals';
      newIframe.allow = 'payment *; clipboard-write; camera; microphone; geolocation';
      newIframe.referrerPolicy = 'strict-origin-when-cross-origin';
      newIframe.title = 'Terminal WebView';
      newIframe.loading = 'eager';

      // Replace the current iframe
      if (iframe.parentNode) {
        iframe.parentNode.replaceChild(newIframe, iframe);
        iframeRef.current = newIframe;
      }

      console.log('CORS-safe injection method 1 attempted');
    } catch (error) {
      console.log('CORS-safe injection method 1 failed:', error);
    }

    // Method 2: Try postMessage communication
    setTimeout(() => {
      try {
        if (iframe.contentWindow) {
          iframe.contentWindow.postMessage({
            type: 'inject_script',
            script: script
          }, '*');
          console.log('CORS-safe injection method 2 attempted');
        }
      } catch (error) {
        console.log('CORS-safe injection method 2 failed:', error);
      }
    }, 1000);

    // Method 3: Try to modify the iframe src with script parameters
    setTimeout(() => {
      try {
        const scriptParam = encodeURIComponent(script);
        const newSrc = `${url}?inject_script=${scriptParam}`;
        iframe.src = newSrc;
        console.log('CORS-safe injection method 3 attempted');
      } catch (error) {
        console.log('CORS-safe injection method 3 failed:', error);
      }
    }, 2000);
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

export default CorsWebView;

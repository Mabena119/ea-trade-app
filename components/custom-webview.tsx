import React, { useRef, useEffect, useState } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

interface CustomWebViewProps {
  url: string;
  script?: string;
  onMessage?: (event: any) => void;
  onLoadEnd?: () => void;
  style?: any;
}

const CustomWebView: React.FC<CustomWebViewProps> = ({
  url,
  script,
  onMessage,
  onLoadEnd,
  style
}) => {
  const webViewRef = useRef<WebView>(null);
  const [injected, setInjected] = useState(false);

  // Enhanced JavaScript injection with better timing and error handling
  const injectScript = () => {
    if (webViewRef.current && script && !injected) {
      console.log('Injecting script into WebView...');

      // Use injectedJavaScript for better compatibility with retry mechanism
      webViewRef.current.injectJavaScript(`
        (function() {
          let attempts = 0;
          const maxAttempts = 10;
          
          const tryInject = () => {
            attempts++;
            console.log('Script injection attempt:', attempts);
            
            try {
              // Check if the page is ready for injection
              if (document.readyState === 'complete' && document.body) {
                console.log('Page ready, executing script...');
                ${script}
                return true;
              } else {
                console.log('Page not ready, retrying...');
                if (attempts < maxAttempts) {
                  setTimeout(tryInject, 1000);
                } else {
                  console.error('Max injection attempts reached');
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'injection_error',
                    error: 'Page not ready after max attempts'
                  }));
                }
                return false;
              }
            } catch (error) {
              console.error('Script injection error:', error);
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'injection_error',
                error: error.message
              }));
              return false;
            }
          };
          
          // Start injection attempt
          tryInject();
        })();
        true;
      `);

      setInjected(true);
    }
  };

  // Handle WebView load events
  const handleLoadEnd = () => {
    console.log('WebView load ended');

    // Wait longer for the page to fully initialize and DOM to be ready
    setTimeout(() => {
      injectScript();
    }, 5000);

    if (onLoadEnd) {
      onLoadEnd();
    }
  };

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('WebView message received:', data);

      if (onMessage) {
        onMessage(data);
      }
    } catch (error) {
      console.log('Error parsing WebView message:', error);
    }
  };

  // Enhanced injected JavaScript that runs before page load
  const injectedJavaScript = `
    (function() {
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
      };

      // Send ready message
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'webview_ready'
      }));
    })();
    true;
  `;

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={styles.webview}
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
        injectedJavaScript={injectedJavaScript}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        mixedContentMode="compatibility"
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo={true}
        userAgent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.log('WebView error:', nativeEvent);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.log('WebView HTTP error:', nativeEvent);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
});

export default CustomWebView;

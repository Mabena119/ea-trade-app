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

  // Execute the pending script when page is ready
  const injectScript = () => {
    if (webViewRef.current && script && !injected) {
      console.log('Executing pending script in WebView...');
      
      // Execute the pending script that was stored during page load
      webViewRef.current.injectJavaScript(`
        if (window.executePendingScript) {
          window.executePendingScript();
        } else {
          console.error('executePendingScript function not found');
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'injection_error',
            error: 'executePendingScript function not found'
          }));
        }
        true;
      `);
      
      setInjected(true);
    }
  };

  // Handle WebView load events
  const handleLoadEnd = () => {
    console.log('WebView load ended');
    
    // Wait for page to be ready, then inject script
    setTimeout(() => {
      injectScript();
    }, 3000);
    
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

      // Store the script to be executed later
      window.pendingScript = \`${script || ''}\`;
      
      // Function to execute the pending script
      window.executePendingScript = function() {
        if (window.pendingScript && window.pendingScript.trim()) {
          try {
            console.log('Executing pending script...');
            eval(window.pendingScript);
            window.pendingScript = null; // Clear after execution
          } catch (error) {
            console.error('Error executing pending script:', error);
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'injection_error',
              error: error.message
            }));
          }
        }
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

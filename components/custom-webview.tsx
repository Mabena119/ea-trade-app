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
  
  // Reset injected state when URL or script changes (component remounts)
  useEffect(() => {
    setInjected(false);
  }, [url, script]);

  // Execute the pending script when page is ready
  const injectScript = () => {
    if (webViewRef.current && script && !injected) {
      console.log('Injecting and executing trading script...');
      
      // Directly inject and execute the script (don't rely on stored function)
      webViewRef.current.injectJavaScript(`
        (function() {
          try {
            console.log('Executing trading script directly...');
            ${script}
          } catch (error) {
            console.error('Error executing trading script:', error);
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'injection_error',
              error: error.message
            }));
          }
        })();
        true;
      `);
      
      setInjected(true);
    }
  };

  // Handle WebView load events
  const handleLoadEnd = () => {
    console.log('WebView load ended, checking if page is ready...');
    
    // Check if page is fully loaded before injecting script
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        (function waitForPageReady() {
          console.log('Checking page readiness...');
          console.log('Document readyState:', document.readyState);
          
          if (document.readyState === 'complete') {
            console.log('Page is complete, waiting 3 seconds for MT5 terminal to initialize...');
            setTimeout(() => {
              console.log('Page ready for script injection');
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'page_ready_for_script'
              }));
            }, 3000);
          } else {
            console.log('Page not ready yet, checking again in 500ms...');
            setTimeout(waitForPageReady, 500);
          }
        })();
        true;
      `);
    }
    
    if (onLoadEnd) {
      onLoadEnd();
    }
  };

  const handleMessage = (event: any) => {
    try {
      // Handle both raw event and already-parsed data
      const data = event.nativeEvent?.data 
        ? JSON.parse(event.nativeEvent.data)
        : event;
      
      console.log('WebView message received:', data);

      // Handle page_ready_for_script message
      if (data.type === 'page_ready_for_script') {
        console.log('Page is ready, injecting trading script now...');
        injectScript();
      }

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
      // IMMEDIATELY clear all storage before anything else
      console.log('Clearing all WebView storage on mount...');
      try { localStorage.clear(); } catch(e) { console.log('localStorage clear failed:', e); }
      try { sessionStorage.clear(); } catch(e) { console.log('sessionStorage clear failed:', e); }
      try {
        if (indexedDB && indexedDB.databases) {
          indexedDB.databases().then(dbs => {
            dbs.forEach(db => {
              if (db.name) {
                try { indexedDB.deleteDatabase(db.name); } catch(e) {}
              }
            });
          });
        }
      } catch(e) { console.log('IndexedDB clear failed:', e); }
      try {
        if (document && document.cookie) {
          document.cookie.split(';').forEach(c => {
            const eq = c.indexOf('=');
            const name = eq > -1 ? c.substr(0, eq) : c;
            document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
          });
        }
      } catch(e) { console.log('Cookie clear failed:', e); }
      console.log('Storage cleared successfully');
      
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
        // Clear cache and storage on each mount to prevent stale data
        cacheEnabled={false}
        incognito={true}
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
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

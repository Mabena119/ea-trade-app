import React, { useRef, useEffect, useCallback } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

interface CustomWebViewProps {
  url: string;
  script?: string;
  onMessage?: (event: any) => void;
  onLoadEnd?: () => void;
  style?: any;
  /** Keep cookies/cache (required for Cloudflare-protected brokers like JustMarkets). */
  preserveSession?: boolean;
  /** Wait after each load before injecting automation (Cloudflare brokers need longer). */
  postLoadDelayMs?: number;
}

const CustomWebView: React.FC<CustomWebViewProps> = ({
  url,
  script,
  onMessage,
  onLoadEnd,
  style,
  preserveSession = false,
  postLoadDelayMs = 3000,
}) => {
  const webViewRef = useRef<WebView>(null);
  const injectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authStartedRef = useRef(false);
  const loadGenerationRef = useRef(0);

  const clearInjectTimer = useCallback(() => {
    if (injectTimerRef.current) {
      clearTimeout(injectTimerRef.current);
      injectTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    authStartedRef.current = false;
    loadGenerationRef.current += 1;
    clearInjectTimer();
  }, [url, script, clearInjectTimer]);

  useEffect(() => () => clearInjectTimer(), [clearInjectTimer]);

  const injectScript = useCallback(() => {
    if (!webViewRef.current || !script?.trim() || authStartedRef.current) {
      return;
    }
    authStartedRef.current = true;
    console.log('Injecting MT5 automation script via eval...');

    const wrapped = `(function(){
      try {
        if (window.__eaMt5LinkAuthStarted) return;
        window.__eaMt5LinkAuthStarted = true;
        eval(${JSON.stringify(script)});
      } catch (error) {
        console.error('Error executing automation script:', error);
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'injection_error',
            error: error && error.message ? String(error.message) : 'Script injection failed'
          }));
        } catch (e2) {}
      }
    })();true;`;

    webViewRef.current.injectJavaScript(wrapped);
  }, [script]);

  const scheduleInjectAfterLoad = useCallback(() => {
    clearInjectTimer();
    const generation = loadGenerationRef.current;
    const delay = Math.max(800, postLoadDelayMs);

    injectTimerRef.current = setTimeout(() => {
      if (generation !== loadGenerationRef.current || authStartedRef.current) {
        return;
      }
      if (!webViewRef.current) {
        return;
      }

      webViewRef.current.injectJavaScript(`(function waitForPageReady(){
        var gen = ${generation};
        function fire(){
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'page_ready_for_script', gen: gen }));
          } catch(e) {}
        }
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
          fire();
        } else {
          document.addEventListener('DOMContentLoaded', fire, { once: true });
          setTimeout(fire, 600);
        }
      })();true;`);
    }, delay);
  }, [clearInjectTimer, postLoadDelayMs]);

  const handleLoadStart = useCallback(() => {
    authStartedRef.current = false;
    clearInjectTimer();
  }, [clearInjectTimer]);

  const handleLoadEnd = useCallback(() => {
    console.log('WebView load ended, scheduling script injection...');
    scheduleInjectAfterLoad();
    onLoadEnd?.();
  }, [onLoadEnd, scheduleInjectAfterLoad]);

  const handleMessage = (event: any) => {
    try {
      const data = event.nativeEvent?.data
        ? JSON.parse(event.nativeEvent.data)
        : event;

      if (data.type === 'page_ready_for_script') {
        if (typeof data.gen === 'number' && data.gen !== loadGenerationRef.current) {
          return;
        }
        console.log('Page ready, injecting automation script...');
        injectScript();
      }

      if (data.type === 'authentication_success' || data.type === 'authentication_failed') {
        authStartedRef.current = true;
      }

      onMessage?.(data);
    } catch (error) {
      console.log('Error parsing WebView message:', error);
    }
  };

  const injectedJavaScript = `
(function(){
  try {
    ${preserveSession ? '' : `
    try { localStorage.clear(); } catch(e) {}
    try { sessionStorage.clear(); } catch(e) {}
    try {
      if (indexedDB && indexedDB.databases) {
        indexedDB.databases().then(function(dbs){
          dbs.forEach(function(db){
            if (db.name) try { indexedDB.deleteDatabase(db.name); } catch(e2) {}
          });
        });
      }
    } catch(e) {}
    try {
      if (document && document.cookie) {
        document.cookie.split(';').forEach(function(c){
          var eq = c.indexOf('=');
          var name = eq > -1 ? c.substr(0, eq) : c;
          document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
        });
      }
    } catch(e) {}
    `}
    var ow = console.warn;
    var oe = console.error;
    console.warn = function(){
      var m = Array.prototype.join.call(arguments, ' ');
      if (m.indexOf('interactive-widget') >= 0 || m.indexOf('viewport') >= 0 || m.indexOf('AES-CBC') >= 0) return;
      ow.apply(console, arguments);
    };
    console.error = function(){
      var m = Array.prototype.join.call(arguments, ' ');
      if (m.indexOf('interactive-widget') >= 0 || m.indexOf('viewport') >= 0 || m.indexOf('AES-CBC') >= 0) return;
      oe.apply(console, arguments);
    };
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'webview_ready' }));
  } catch(e) {}
})();
true;
`;

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={styles.webview}
        onLoadStart={handleLoadStart}
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
        userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        cacheEnabled={preserveSession}
        incognito={!preserveSession}
        sharedCookiesEnabled={preserveSession}
        thirdPartyCookiesEnabled={preserveSession}
        setSupportMultipleWindows={false}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.log('WebView error:', nativeEvent);
          onMessage?.({
            type: 'error',
            message: nativeEvent.description || 'WebView failed to load broker terminal',
          });
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.log('WebView HTTP error:', nativeEvent);
          if (nativeEvent.statusCode === 403 && preserveSession) {
            onMessage?.({
              type: 'step_update',
              message: 'Waiting for security check...',
            });
          }
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

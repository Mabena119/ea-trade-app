import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { MT5_LINK_AUTOWATCH_JS } from '@/utils/mt5-brokers';

interface CustomWebViewProps {
  url: string;
  script?: string;
  onMessage?: (event: any) => void;
  onLoadEnd?: () => void;
  style?: any;
  /** Keep cookies/cache (required for Cloudflare-protected brokers like JustMarkets). */
  preserveSession?: boolean;
  /** Wait after each load before injecting automation (non-Cloudflare brokers). */
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
  const retryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authFinalizedRef = useRef(false);
  const loadGenerationRef = useRef(0);
  const scriptRef = useRef(script);
  const preserveSessionRef = useRef(preserveSession);

  scriptRef.current = script;
  preserveSessionRef.current = preserveSession;

  const clearInjectTimer = useCallback(() => {
    if (injectTimerRef.current) {
      clearTimeout(injectTimerRef.current);
      injectTimerRef.current = null;
    }
  }, []);

  const clearRetryInterval = useCallback(() => {
    if (retryIntervalRef.current) {
      clearInterval(retryIntervalRef.current);
      retryIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    authFinalizedRef.current = false;
    loadGenerationRef.current += 1;
    clearInjectTimer();
    clearRetryInterval();
  }, [url, clearInjectTimer, clearRetryInterval]);

  useEffect(() => () => {
    clearInjectTimer();
    clearRetryInterval();
  }, [clearInjectTimer, clearRetryInterval]);

  /** Inject directly — no eval() (JustMarkets CSP blocks eval on iOS WKWebView). */
  const injectScript = useCallback((reason?: string) => {
    const currentScript = scriptRef.current;
    if (!webViewRef.current || !currentScript?.trim() || authFinalizedRef.current) {
      return false;
    }
    console.log('Injecting MT5 automation script directly...', reason || '');
    const payload = `${currentScript.trim()}\ntrue;`;
    webViewRef.current.injectJavaScript(payload);
    return true;
  }, []);

  const requestScriptInjection = useCallback((reason?: string) => {
    if (authFinalizedRef.current) {
      return;
    }
    injectScript(reason);
  }, [injectScript]);

  const scheduleInjectAfterLoad = useCallback(() => {
    if (authFinalizedRef.current) {
      return;
    }
    clearInjectTimer();
    const generation = loadGenerationRef.current;
    const delay = preserveSessionRef.current
      ? 2000
      : Math.max(800, postLoadDelayMs);

    injectTimerRef.current = setTimeout(() => {
      if (generation !== loadGenerationRef.current || authFinalizedRef.current) {
        return;
      }
      if (!webViewRef.current) {
        return;
      }

      webViewRef.current.injectJavaScript(`(function waitForPageReady(){
        var gen = ${generation};
        var preserve = ${preserveSessionRef.current ? 'true' : 'false'};
        function fire(){
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'page_ready_for_script',
              gen: gen,
              preserve: preserve
            }));
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

  const startRetryLoop = useCallback(() => {
    if (!preserveSessionRef.current || retryIntervalRef.current) {
      return;
    }
    let attempts = 0;
    retryIntervalRef.current = setInterval(() => {
      if (authFinalizedRef.current || attempts >= 18) {
        clearRetryInterval();
        return;
      }
      attempts += 1;
      requestScriptInjection(`retry-${attempts}`);
    }, 5000);
  }, [clearRetryInterval, requestScriptInjection]);

  const handleLoadStart = useCallback(() => {
    if (preserveSessionRef.current) {
      return;
    }
    clearInjectTimer();
  }, [clearInjectTimer]);

  const handleLoadEnd = useCallback(() => {
    console.log('WebView load ended, scheduling script injection...');
    scheduleInjectAfterLoad();
    if (preserveSessionRef.current) {
      startRetryLoop();
    }
    onLoadEnd?.();
  }, [onLoadEnd, scheduleInjectAfterLoad, startRetryLoop]);

  const handleNavigationStateChange = useCallback((navState: { url?: string; loading?: boolean }) => {
    if (authFinalizedRef.current || !preserveSessionRef.current) {
      return;
    }
    if (navState.loading) {
      return;
    }
    const href = (navState.url || '').toLowerCase();
    if (href.includes('justmarkets.com')) {
      requestScriptInjection('navigation-settled');
    }
  }, [requestScriptInjection]);

  const handleMessage = useCallback((event: any) => {
    try {
      const data = event.nativeEvent?.data
        ? JSON.parse(event.nativeEvent.data)
        : event;

      if (data.type === 'terminal_shell_detected') {
        console.log('Broker terminal shell detected:', data.message);
        requestScriptInjection('shell-detected');
      }

      if (data.type === 'page_ready_for_script') {
        const preserve = preserveSessionRef.current || data.preserve === true;
        if (!preserve && typeof data.gen === 'number' && data.gen !== loadGenerationRef.current) {
          return;
        }
        requestScriptInjection('page-ready');
      }

      if (data.type === 'step_update' || data.type === 'mt5_loaded') {
        clearRetryInterval();
      }

      if (data.type === 'authentication_success' || data.type === 'authentication_failed') {
        authFinalizedRef.current = true;
        clearRetryInterval();
        clearInjectTimer();
      }

      onMessage?.(data);
    } catch (error) {
      console.log('Error parsing WebView message:', error);
    }
  }, [clearInjectTimer, clearRetryInterval, onMessage, requestScriptInjection]);

  const injectedJavaScript = useMemo(() => `
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
    ${preserveSession ? MT5_LINK_AUTOWATCH_JS : ''}
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
`, [preserveSession]);

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={styles.webview}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onNavigationStateChange={handleNavigationStateChange}
        onMessage={handleMessage}
        injectedJavaScript={injectedJavaScript}
        injectedJavaScriptForMainFrameOnly={false}
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

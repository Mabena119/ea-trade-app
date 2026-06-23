import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  getMt5LinkShellProbeJs,
  getMt5LinkShellProbeMaxWaitMs,
  getMt5WebViewBootstrapJs,
} from '@/utils/mt5-brokers';

interface CustomWebViewProps {
  url: string;
  script?: string;
  onMessage?: (event: any) => void;
  onLoadEnd?: () => void;
  style?: any;
  /** Wait after each load before injecting automation. */
  postLoadDelayMs?: number;
  /** Direct terminal URL (e.g. JustMarkets): preserve Cloudflare session, retry inject across redirects. */
  directTerminalLoad?: boolean;
  /** Broker server key for shell-probe tuning. */
  brokerServer?: string;
}

const CustomWebView: React.FC<CustomWebViewProps> = ({
  url,
  script,
  onMessage,
  onLoadEnd,
  style,
  postLoadDelayMs = 3000,
  directTerminalLoad = false,
  brokerServer = '',
}) => {
  const webViewRef = useRef<WebView>(null);
  const injectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authStartedRef = useRef(false);
  const authFinalizedRef = useRef(false);
  const automationActiveRef = useRef(false);
  const loadGenerationRef = useRef(0);
  const scriptRef = useRef(script);

  scriptRef.current = script;

  const clearInjectTimer = useCallback(() => {
    if (injectTimerRef.current) {
      clearTimeout(injectTimerRef.current);
      injectTimerRef.current = null;
    }
  }, []);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    authStartedRef.current = false;
    authFinalizedRef.current = false;
    automationActiveRef.current = false;
    loadGenerationRef.current += 1;
    clearInjectTimer();
    clearRetryTimer();
  }, [url, clearInjectTimer, clearRetryTimer]);

  useEffect(() => () => {
    clearInjectTimer();
    clearRetryTimer();
  }, [clearInjectTimer, clearRetryTimer]);

  const injectScript = useCallback((force = false) => {
    const currentScript = scriptRef.current;
    if (!webViewRef.current || !currentScript?.trim() || authFinalizedRef.current) {
      return;
    }
    if (authStartedRef.current && !force) {
      return;
    }
    authStartedRef.current = true;
    console.log('Injecting MT5 automation script...');
    const body = currentScript.trim();
    const wrapped = `(function(){
  try {
    if (window.__eaMt5LinkAuthRunning) return;
    window.__eaMt5LinkAuthRunning = true;
    ${body}
  } catch(e) {
    window.__eaMt5LinkAuthRunning = false;
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'injection_error', error: String(e && e.message || e) }));
    } catch(e2) {}
  }
})();true;`;
    webViewRef.current.injectJavaScript(wrapped);
  }, []);

  const scheduleInjectAfterLoad = useCallback(() => {
    if (authFinalizedRef.current) {
      return;
    }
    clearInjectTimer();
    const generation = loadGenerationRef.current;
    const delay = Math.max(800, postLoadDelayMs);

    injectTimerRef.current = setTimeout(() => {
      if (generation !== loadGenerationRef.current || authFinalizedRef.current) {
        return;
      }
      if (!webViewRef.current) {
        return;
      }

      if (directTerminalLoad) {
        const probeMaxWait = getMt5LinkShellProbeMaxWaitMs(brokerServer);
        webViewRef.current.injectJavaScript(getMt5LinkShellProbeJs(generation, probeMaxWait));
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
  }, [brokerServer, clearInjectTimer, directTerminalLoad, postLoadDelayMs]);

  const scheduleDirectTerminalRetry = useCallback(() => {
    if (!directTerminalLoad) {
      return;
    }
    clearRetryTimer();
    retryTimerRef.current = setInterval(() => {
      if (authFinalizedRef.current || automationActiveRef.current) {
        clearRetryTimer();
        return;
      }
      console.log('Direct terminal: retrying MT5 script injection...');
      authStartedRef.current = false;
      try {
        webViewRef.current?.injectJavaScript('window.__eaMt5LinkAuthRunning=false;true;');
      } catch (e) {}
      scheduleInjectAfterLoad();
    }, 10000);
  }, [clearRetryTimer, directTerminalLoad, scheduleInjectAfterLoad]);

  const handleLoadStart = useCallback(() => {
    if (directTerminalLoad) {
      return;
    }
    clearInjectTimer();
  }, [clearInjectTimer, directTerminalLoad]);

  const handleLoadEnd = useCallback(() => {
    if (directTerminalLoad && !automationActiveRef.current) {
      authStartedRef.current = false;
    }
    console.log('WebView load ended, scheduling script injection...');
    scheduleInjectAfterLoad();
    if (directTerminalLoad && !automationActiveRef.current) {
      scheduleDirectTerminalRetry();
    }
    onLoadEnd?.();
  }, [directTerminalLoad, onLoadEnd, scheduleDirectTerminalRetry, scheduleInjectAfterLoad]);

  const handleMessage = useCallback((event: any) => {
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

      if (data.type === 'step_update' || data.type === 'mt5_loaded') {
        automationActiveRef.current = true;
        clearRetryTimer();
      }

      if (data.type === 'authentication_success' || data.type === 'authentication_failed') {
        authStartedRef.current = true;
        authFinalizedRef.current = true;
        automationActiveRef.current = true;
        clearInjectTimer();
        clearRetryTimer();
      }

      if (data.type === 'injection_error') {
        authStartedRef.current = false;
        automationActiveRef.current = false;
      }

      onMessage?.(data);
    } catch (error) {
      console.log('Error parsing WebView message:', error);
    }
  }, [clearInjectTimer, clearRetryTimer, injectScript, onMessage]);

  const injectedJavaScript = useMemo(
    () => getMt5WebViewBootstrapJs(directTerminalLoad),
    [directTerminalLoad]
  );

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
        cacheEnabled={true}
        incognito={false}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
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

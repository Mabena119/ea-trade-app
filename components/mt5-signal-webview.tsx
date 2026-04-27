import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Text,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  ScrollView,
  BackHandler,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import WebWebView from './web-webview';
import { useApp, SignalLog } from '@/providers/app-provider';
import apiService, { type ChartAnalysisResult } from '@/services/api';
import { computeFallbackSlTp, ensureMinRewardRisk, stripNumericPrice } from '@/utils/trade-mode-levels';
import { getTradeModeForAnalysis } from '@/utils/trade-symbol-match';
import { isRetriableTerminalAuthFailure, MT_TERMINAL_AUTH_REMOUNTS } from '@/utils/mt-terminal-auth-retry';
import { formatAutoSizedLotString, sanitizeManualLotSize } from '@/utils/equity-trade-preset';
import { clearWebTerminalByScope, WEBVIEW_SCOPE_MT5_TRADING } from '@/utils/web-terminal-scope';
import type { MT5TradeMode } from '@/providers/app-provider';

type AiTradePayload = { action: string; sl: string; tp: string; symbol: string; volume: string };

function escapeJsonForSingleQuotedJs(jsonStr: string): string {
  return jsonStr.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

function buildAiTradeInjectScript(payload: AiTradePayload): string {
  const escaped = escapeJsonForSingleQuotedJs(JSON.stringify(payload));
  return `
(function(){
  try {
    window.__eaActiveTradePayload = JSON.parse('${escaped}');
    if (typeof window.__eaRunExecuteMultipleTrades === 'function') {
      void window.__eaRunExecuteMultipleTrades();
    } else {
      var fail = JSON.stringify({ type: 'ai_trade_inject_failed', message: 'Trade runner not ready' });
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(fail);
      if (window.parent && window.parent !== window) window.parent.postMessage(fail, '*');
    }
  } catch (e) {
    var msg = (e && e.message) ? String(e.message) : 'AI trade inject failed';
    var err = JSON.stringify({ type: 'ai_trade_inject_failed', message: msg });
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(err);
    if (window.parent && window.parent !== window) window.parent.postMessage(err, '*');
  }
})();
true;
`;
}
import { useTheme } from '@/providers/theme-provider';
import colors from '@/constants/colors';
import { AlertCircle, X } from 'lucide-react-native';

interface MT5SignalWebViewProps {
  visible: boolean;
  signal: SignalLog | null;
  onClose: () => void;
}

// MT5 Brokers with URL mapping (same as metatrader.tsx)
const MT5_BROKER_URLS: Record<string, string> = {
  'RazorMarkets-Live': 'https://webtrader.razormarkets.co.za/terminal/',
  'AccuMarkets-Live': 'https://webterminal.accumarkets.co.za/terminal/',
  'RockWest-Server': 'https://webtrader.rock-west.com/terminal',
  'MaonoGlobalMarkets-Live': 'https://web.maonoglobalmarkets.com/terminal',
  'Deriv-Demo': 'https://mt5-demo-web.deriv.com/terminal',
  'DerivSVG-Server': 'https://mt5-real01-web-svg.deriv.com/terminal',
  'DerivSVG-Server-02': 'https://mt5-real02-web-svg.deriv.com/terminal',
  'DerivSVG-Server-03': 'https://mt5-real03-web-svg.deriv.com/terminal',
  'DerivBVI-Server': 'https://mt5-real01-web-bvi.deriv.com/terminal',
  'DerivBVI-Server-02': 'https://mt5-real02-web-bvi.deriv.com/terminal',
  'DerivBVI-Server-03': 'https://mt5-real03-web-bvi.deriv.com/terminal',
  'DerivBVI-Server-VU': 'https://mt5-real01-web-vu.deriv.com/terminal',
  'DerivBVI-Server-VU-02': 'https://mt5-real02-web-vu.deriv.com/terminal',
  'DerivBVI-Server-VU-03': 'https://mt5-real03-web-vu.deriv.com/terminal',
  'RocketX-Live': 'https://webtrader.rocketx.io:1950/terminal',
  'Profinwealth-Live': 'https://mt5.profinwealth.com/',
};

/** When true, MT5 signal WebView uses a visible bottom panel for debugging (all platforms). Chart warmup keeps the WebView fully laid out (below cover) so WebGL still composites. */
const SHOW_MT5_SIGNAL_WEBVIEW_DEBUG = false;

/** Same chart image: server cache + low model temp; client retries transient network/API errors with same snapshot. */
const CHART_AI_ANALYSIS_MAX_ATTEMPTS = 4;

/** Android fires onShouldStartLoadWithRequest for about:blank; iOS may not. Trailing slash on mt5Url must not block /terminal vs /terminal/. */
function isAllowedTerminalWebViewUrl(requestUrl: string, terminalBaseUrl: string, blockDataImages: boolean): boolean {
  const u = (requestUrl || '').trim();
  if (blockDataImages && (u.startsWith('blob:') || u.startsWith('data:image/'))) {
    return false;
  }
  if (!u || u === 'about:blank' || u.startsWith('about:') || u === 'about:srcdoc') {
    return true;
  }
  const stripHash = (s: string) => s.split('#')[0] ?? s;
  const nu = stripHash(u);
  const base = stripHash(terminalBaseUrl).replace(/\/$/, '');
  if (nu === base) return true;
  if (nu.startsWith(`${base}/`) || nu.startsWith(`${base}?`)) return true;
  try {
    if (new URL(nu).origin === new URL(terminalBaseUrl).origin) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Toast subtitle during CHART_WARMUP: single friendly line unless the step is an outcome/error. */
function displayStatusForChartWarmup(step: string | null | undefined): string {
  const s = (step || '').trim();
  if (!s) return 'Analysing chart';
  if (
    /^error\b/i.test(s) ||
    /^authentication failed/i.test(s) ||
    /^chart snapshot failed/i.test(s) ||
    /^ai analysis failed/i.test(s) ||
    /^ai analysis error/i.test(s) ||
    /^auto-trade failed/i.test(s) ||
    /^ai analysis complete/i.test(s) ||
    /^ai suggests a trade/i.test(s) ||
    /^all trades completed/i.test(s)
  ) {
    return s;
  }
  return 'Analysing chart';
}

export function MT5SignalWebView({ visible, signal, onClose }: MT5SignalWebViewProps) {
  const {
    mt5Account,
    setMT5Account,
    setMTAccount,
    eas,
    mt5Symbols,
    mt5LotSizingMode,
    markTradeExecuted,
    mt5TradeOverlayMessage,
    resumePolling,
  } = useApp();
  const mt5AccountRef = useRef(mt5Account);
  useEffect(() => {
    mt5AccountRef.current = mt5Account;
  }, [mt5Account]);
  const { theme } = useTheme();
  const authToastChrome = useMemo(
    () => ({
      borderColor: `${theme.colors.accent}80`,
      borderTopColor: `${theme.colors.accent}B3`,
      shadowColor: theme.colors.glowColor,
    }),
    [theme]
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [currentStep, setCurrentStep] = useState<string>('Initializing...');
  const [chartAiResult, setChartAiResult] = useState<ChartAnalysisResult | null>(null);
  const [chartAiError, setChartAiError] = useState<string | null>(null);
  const [chartAiAnalyzing, setChartAiAnalyzing] = useState(false);
  const [webExternalEval, setWebExternalEval] = useState<{ code: string; id: number } | null>(null);
  const webViewRef = useRef<WebView>(null);
  const lastChartScreenshotAtRef = useRef(0);
  const signalRef = useRef(signal);
  const [webViewKey, setWebViewKey] = useState<number>(0);
  const signalAuthRemountRef = useRef(0);

  useEffect(() => {
    signalRef.current = signal;
  }, [signal]);

  /** Bumps WebView when DB row is updated (new scan) or SL/TP/action change — avoids executing stale baked-in script. */
  const signalExecutionKey = useMemo(() => {
    if (!signal) return '';
    const lu = signal.latestupdate ?? '';
    return [String(signal.id), lu, signal.action ?? '', signal.sl ?? '', signal.tp ?? '', signal.price ?? ''].join(
      '\x1f'
    );
  }, [signal]);
  const signalExecutionKeyRef = useRef(signalExecutionKey);
  useEffect(() => {
    signalExecutionKeyRef.current = signalExecutionKey;
  }, [signalExecutionKey]);

  /** Chart warmup uses in-tree overlay (not Modal); Android back should dismiss like before. */
  useEffect(() => {
    if (!visible || signal?.type !== 'CHART_WARMUP' || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, signal?.type, onClose]);

  // Get MT5 terminal URL
  const getMT5Url = useCallback(() => {
    if (!mt5Account || !mt5Account.server) {
      return 'https://webtrader.razormarkets.co.za/terminal/';
    }
    return MT5_BROKER_URLS[mt5Account.server] || 'https://webtrader.razormarkets.co.za/terminal/';
  }, [mt5Account]);

  /** Number of trades from trade config (MT5 symbol row); defaults to 1 if unset/invalid */
  const getNumberOfTrades = useCallback(() => {
    if (!signal?.asset || !mt5Symbols || mt5Symbols.length === 0) {
      return 1;
    }
    const symbolConfig = mt5Symbols.find(s => s.symbol === signal.asset);
    if (!symbolConfig?.numberOfTrades) return 1;
    const numTrades = parseInt(String(symbolConfig.numberOfTrades), 10);
    return isNaN(numTrades) || numTrades < 1 ? 1 : numTrades;
  }, [signal, mt5Symbols]);

  /** Lot size from trade config (MT5 symbol row); defaults to 0.01 if unset/invalid */
  const getVolume = useCallback((): string => {
    if (!signal?.asset || !mt5Symbols || mt5Symbols.length === 0) {
      return '0.01';
    }
    const symbolConfig = mt5Symbols.find(s => s.symbol === signal.asset);
    if (!symbolConfig?.lotSize) return '0.01';
    return mt5LotSizingMode === 'manual'
      ? sanitizeManualLotSize(symbolConfig.lotSize)
      : formatAutoSizedLotString(symbolConfig.lotSize);
  }, [signal, mt5Symbols, mt5LotSizingMode]);

  const buildAiTradePayloadFromAnalysis = useCallback(
    (data: ChartAnalysisResult): AiTradePayload | null => {
      const baseAsset = signalRef.current?.asset || '';
      const action = data.signal === 'SELL' ? 'sell' : 'buy';
      const sym = (data.symbol && data.symbol.trim()) || baseAsset;
      if (!sym) return null;
      const symCfg = mt5Symbols.find((s) => s.symbol === sym);
      const tradeMode: MT5TradeMode = symCfg?.tradeMode === 'scalper' ? 'scalper' : 'swing';
      const lot = symCfg?.lotSize;
      const volume =
        lot && !Number.isNaN(parseFloat(String(lot)))
          ? mt5LotSizingMode === 'manual'
            ? sanitizeManualLotSize(lot)
            : formatAutoSizedLotString(lot)
          : '0.01';

      const dir = data.signal === 'SELL' ? 'SELL' : 'BUY';
      let sl = stripNumericPrice(data.stopLoss);
      let tp = stripNumericPrice(data.takeProfit1 || '');
      const entryStr = stripNumericPrice(data.entryPrice || data.currentPrice);
      const entryNum = parseFloat(entryStr);
      if ((!sl || !tp) && entryNum && Number.isFinite(entryNum)) {
        const fb = computeFallbackSlTp(dir, entryNum, tradeMode);
        if (fb) {
          if (!sl) sl = fb.sl;
          if (!tp) tp = fb.tp;
        }
      }
      if (!sl || !tp) return null; // Same as AI scanner: need valid levels to send to MT5
      if (entryNum && Number.isFinite(entryNum)) {
        const slN = parseFloat(String(sl).replace(/,/g, ''));
        const tpN = parseFloat(String(tp).replace(/,/g, ''));
        if (Number.isFinite(slN) && Number.isFinite(tpN)) {
          tp = ensureMinRewardRisk(dir, entryNum, slN, tpN);
        }
      }
      return { action, sl, tp, symbol: sym, volume };
    },
    [mt5Symbols, mt5LotSizingMode]
  );

  const runAiTradeInject = useCallback(
    (payload: AiTradePayload) => {
      const code = buildAiTradeInjectScript(payload);
      if (Platform.OS === 'web') {
        setWebExternalEval({ code, id: Date.now() });
        return;
      }
      setTimeout(() => {
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(code);
        } else {
          setChartAiError('WebView not ready for auto-trade');
          void Promise.resolve(resumePolling()).catch(() => { });
        }
      }, 120);
    },
    [resumePolling]
  );

  const onWebExternalEvalConsumed = useCallback(() => {
    setWebExternalEval(null);
  }, []);

  // Generate MT5 authentication script - EXACT COPY from server.ts proxy handler
  const generateMT5AuthScript = useCallback(() => {
    if (!signal || !mt5Account) return '';

    const { login, password, server } = mt5Account;
    const symbol = signal.asset;

    // Escape for safe injection into JS string (handles ', ", \, newlines)
    const escapeForJS = (v: string) => (v || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    const loginVal = escapeForJS(login || '');
    const passwordVal = escapeForJS(password || '');
    const terminalUrl = getMT5Url();
    const baseUrl = terminalUrl.replace(/\/terminal\/?/, '').replace(/\/$/, '');
    const wsUrl = `${baseUrl.replace('http://', 'wss://').replace('https://', 'wss://')}/terminal/ws`;

    // Get robot/EA name (order comment = bot name + suffix on every trade)
    const primaryEA = Array.isArray(eas) && eas.length > 0 ? eas[0] : null;
    const robotName = primaryEA?.name || 'EA Trade';
    const tradeOrderCommentEscaped = escapeForJS(`${robotName.trim()} - EA TRADE`);
    const isChartWarmup = signal?.type === 'CHART_WARMUP';
    const defaultVolumeEscaped = escapeForJS(getVolume());

    return `
      (function() {
        var isChartWarmup = ${isChartWarmup ? 'true' : 'false'};
        try { window.__eaActiveTradePayload = null; } catch (e) {}
        // Prevent page reloads and navigation
        window.addEventListener('beforeunload', function(e) {
          e.preventDefault();
          e.returnValue = '';
          return '';
        });
        
        // Prevent page refresh
        document.addEventListener('keydown', function(e) {
          if ((e.key === 'F5' || (e.ctrlKey && e.key === 'r') || (e.ctrlKey && e.key === 'R'))) {
            e.preventDefault();
            return false;
          }
        });
        
        // Override location reload
        const originalReload = window.location.reload;
        window.location.reload = function() {
          console.log('Page reload prevented');
          return false;
        };
        
        // Override console methods to suppress warnings
        const originalWarn = console.warn;
        const originalError = console.error;
        const originalLog = console.log;
        
        function shouldSuppress(message) {
          return message.includes('interactive-widget') || 
                 message.includes('viewport') ||
                 message.includes('Viewport argument key') ||
                 message.includes('AES-CBC') ||
                 message.includes('AES-CTR') ||
                 message.includes('AES-GCM') ||
                 message.includes('chosen-ciphertext') ||
                 message.includes('authentication by default') ||
                 message.includes('not recognized and ignored');
        }
        
        console.warn = function(...args) {
          const message = args.join(' ');
          if (shouldSuppress(message)) return;
          originalWarn.apply(console, args);
        };
        
        console.error = function(...args) {
          const message = args.join(' ');
          if (shouldSuppress(message)) return;
          originalError.apply(console, args);
        };
        
        console.log = function(...args) {
          const message = args.join(' ');
          if (shouldSuppress(message)) return;
          originalLog.apply(console, args);
        };

        const sendMessage = (type, message, extras) => {
          try {
            if (type === 'chart_screenshot' && window.__eaChartScreenshotSent) {
              return;
            }
            var payload = { type: type, message: message };
            if (extras && typeof extras === 'object') {
              for (var ek in extras) {
                if (Object.prototype.hasOwnProperty.call(extras, ek) && extras[ek] != null) {
                  payload[ek] = extras[ek];
                }
              }
            }
            if (type === 'chart_screenshot') {
              window.__eaChartScreenshotSent = true;
            }
            window.ReactNativeWebView.postMessage(JSON.stringify(payload));
          } catch(e) {
            console.log('Message send error:', e);
          }
        };

        function scrapeTerminalAccountStats() {
          var equity = null;
          var balance = null;
          var floatingProfit = null;
          try {
            var txt = (document.body && document.body.innerText) ? document.body.innerText : '';
            var lineEq = txt.match(/(?:^|[\\n\\r])\\s*Equity\\s*[:\\s]+([\\d][\\d\\s,]*\\.?\\d*)/im);
            if (lineEq) equity = lineEq[1].replace(/\\s/g, '').replace(/,/g, '');
            var lineBal = txt.match(/(?:^|[\\n\\r])\\s*Balance\\s*[:\\s]+([\\d][\\d\\s,]*\\.?\\d*)/im);
            if (lineBal) balance = lineBal[1].replace(/\\s/g, '').replace(/,/g, '');
            if (!equity || !balance) {
              var compact = txt.replace(/[\\n\\r]+/g, ' ');
              if (!equity) {
                var e2 = compact.match(/Equity[:\\s]+([\\d][\\d\\s,]*\\.?\\d*)/i);
                if (e2) equity = e2[1].replace(/\\s/g, '').replace(/,/g, '');
              }
              if (!balance) {
                var b2 = compact.match(/Balance[:\\s]+([\\d][\\d\\s,]*\\.?\\d*)/i);
                if (b2) balance = b2[1].replace(/\\s/g, '').replace(/,/g, '');
              }
            }
            var cfp = txt.replace(/[\\n\\r\\t]+/g, ' ').replace(/\\s+/g, ' ');
            var fp1 = cfp.match(/(?:Floating|Unrealized)\\s*(?:P\\/?L|Profit)?\\s*[:#]?\\s*([-+]?[\\d][\\d\\s,]*\\.?\\d*)/i);
            if (fp1) floatingProfit = fp1[1].replace(/\\s/g, '').replace(/,/g, '');
            if (floatingProfit == null) {
              var fp2 = cfp.match(/\\bP\\s*\\/?\\s*L\\s*[:#]?\\s*([-+]?[\\d][\\d\\s,]*\\.?\\d*)/i);
              if (fp2) floatingProfit = fp2[1].replace(/\\s/g, '').replace(/,/g, '');
            }
            if (floatingProfit == null) {
              var fp3 = cfp.match(/\\bMargin\\b[^0-9]{0,8}[0-9][\\d\\s,]*\\.?\\d*[^0-9]{0,20}\\bProfit\\b\\s*[:#]?\\s*([-+]?[\\d][\\d\\s,]*\\.?\\d*)/i);
              if (fp3) floatingProfit = fp3[1].replace(/\\s/g, '').replace(/,/g, '');
            }
          } catch (err) {}
          return { equity: equity, balance: balance, floatingProfit: floatingProfit };
        }

        // Override WebSocket to redirect to original terminal
        const originalWebSocket = window.WebSocket;
        window.WebSocket = function(url, protocols) {
          console.log('WebSocket connection attempt to:', url);
          
          // Redirect WebSocket connections to the original terminal
          if (url.includes('/terminal/ws')) {
            const newUrl = '${wsUrl}';
            console.log('Redirecting WebSocket to:', newUrl);
            return new originalWebSocket(newUrl, protocols);
          }
          
          return new originalWebSocket(url, protocols);
        };
        
        // Copy static properties
        Object.setPrototypeOf(window.WebSocket, originalWebSocket);
        Object.defineProperty(window.WebSocket, 'prototype', {
          value: originalWebSocket.prototype,
          writable: false
        });

        function isTerminalSessionVisible() {
          try {
            var sb = document.querySelector('input[placeholder*="Search symbol" i]') ||
                     document.querySelector('input[placeholder*="Search" i]') ||
                     document.querySelector('input[type="search"]');
            if (sb && sb.offsetParent) return true;
            var txt = (document.body && document.body.innerText) ? document.body.innerText : '';
            if (/\\bEquity\\b/i.test(txt) && /\\bBalance\\b/i.test(txt)) return true;
            if (/\\bBid\\b/i.test(txt) && /\\bAsk\\b/i.test(txt)) return true;
            var list = document.querySelectorAll('canvas');
            for (var ci = 0; ci < list.length; ci++) {
              var c = list[ci];
              if ((c.width || 0) * (c.height || 0) >= 50000) return true;
            }
          } catch (e) {}
          return false;
        }

        /** True when MT5 shows the in-terminal "Connect to account" sheet on top of the chart (session reconnect). */
        function isConnectModalVisible() {
          try {
            var bt = (document.body && document.body.innerText) ? document.body.innerText : '';
            if (bt.indexOf('Connect to account') < 0) return false;
            var pwd = document.querySelector('input[type="password"]');
            if (!pwd || !pwd.offsetParent) return false;
            var rr = pwd.getBoundingClientRect();
            return rr.width > 0 && rr.height > 0;
          } catch (e) { return false; }
        }

        function isPasswordInModalOverlay() {
          try {
            var pwd = document.querySelector('input[type="password"]');
            if (!pwd || !pwd.offsetParent) return false;
            var rr = pwd.getBoundingClientRect();
            if (rr.width < 8 || rr.height < 8) return false;
            var node = pwd;
            for (var d = 0; d < 28 && node; d++) {
              var cls = String(node.className || '');
              var z = parseInt(window.getComputedStyle(node).zIndex, 10) || 0;
              var tag = (node.tagName || '').toUpperCase();
              if (tag === 'DIALOG' || cls.indexOf('dialog') >= 0 || cls.indexOf('modal') >= 0 || cls.indexOf('popup') >= 0 || cls.indexOf('overlay') >= 0 || cls.indexOf('backdrop') >= 0 || cls.indexOf('sheet') >= 0 || node.getAttribute('aria-modal') === 'true' || z > 45) {
                return true;
              }
              node = node.parentElement;
            }
          } catch (e2) {}
          return false;
        }

        /** Razor Markets / MT5 "Trading accounts" drawer (Connect + Remove); blocks chart; may show Error (10) without a password field. */
        function isTradingAccountsSheetVisible() {
          try {
            if (!isTerminalSessionVisible()) return false;
            var bt = (document.body && document.body.innerText) ? document.body.innerText : '';
            var hasTitle = bt.indexOf('Trading accounts') >= 0 || bt.indexOf('Trading account') >= 0 ||
              (bt.indexOf('Razor Markets') >= 0 && (bt.indexOf('Connect to account') >= 0 || bt.indexOf('Remove') >= 0));
            if (!hasTitle) return false;
            if (bt.indexOf('Connect to account') < 0 && bt.indexOf('Remove') < 0) return false;
            return true;
          } catch (e) { return false; }
        }

        function findTradingAccountsOverlayRoot() {
          try {
            var candidates = document.querySelectorAll('div, section, aside, [role="dialog"], dialog');
            var best = null;
            var minArea = 1e12;
            for (var i = 0; i < Math.min(candidates.length, 450); i++) {
              var el = candidates[i];
              if (!el.offsetParent) continue;
              var txt = (el.innerText || '').trim();
              if (txt.length < 40 || txt.length > 2500) continue;
              if (txt.indexOf('Trading accounts') < 0 && txt.indexOf('Razor Markets') < 0) continue;
              if (txt.indexOf('Connect to account') < 0 && txt.indexOf('Remove') < 0) continue;
              var r = el.getBoundingClientRect();
              var area = r.width * r.height;
              if (r.width > 100 && r.height > 90 && area >= 12000 && area < minArea) {
                minArea = area;
                best = el;
              }
            }
            if (best) return best;
            var btns = document.querySelectorAll('button, [role="button"]');
            for (var b = 0; b < Math.min(btns.length, 120); b++) {
              var t = ((btns[b].innerText || btns[b].textContent || '') + '').trim().toLowerCase();
              if (t.indexOf('connect') >= 0 && t.indexOf('account') >= 0) {
                var node = btns[b];
                for (var d = 0; d < 22 && node; d++) {
                  var inner = (node.innerText || '').trim();
                  if (inner.indexOf('Trading accounts') >= 0 || inner.indexOf('Razor Markets') >= 0) return node;
                  node = node.parentElement;
                }
              }
            }
          } catch (e2) {}
          return null;
        }

        function hideTradingAccountsOverlayIfPresent() {
          try {
            if (!isTradingAccountsSheetVisible()) return false;
            var root = findTradingAccountsOverlayRoot();
            if (root) {
              root.style.display = 'none';
              root.style.visibility = 'hidden';
              root.style.pointerEvents = 'none';
              return true;
            }
            var all = document.querySelectorAll('div, section, aside, [role="dialog"]');
            for (var ai = 0; ai < Math.min(all.length, 350); ai++) {
              var ae = all[ai];
              if (!ae.offsetParent) continue;
              var atxt = (ae.innerText || '').trim();
              if (atxt.length > 4000 || atxt.length < 35) continue;
              if ((atxt.indexOf('Trading accounts') >= 0 || atxt.indexOf('Razor Markets') >= 0) && atxt.indexOf('Connect to account') >= 0) {
                var ar = ae.getBoundingClientRect();
                if (ar.width > 120 && ar.height > 80) {
                  ae.style.display = 'none';
                  ae.style.visibility = 'hidden';
                  ae.style.pointerEvents = 'none';
                  return true;
                }
              }
            }
          } catch (e3) {}
          return false;
        }

        /** Any floating login sheet while terminal chrome is already visible (second modal after chart open). */
        function isAnyLoginModalBlocking() {
          if (isConnectModalVisible()) return true;
          if (isTradingAccountsSheetVisible()) return true;
          if (isTerminalSessionVisible() && isPasswordInModalOverlay()) return true;
          return false;
        }

        function findPasswordModalOverlayRoot() {
          try {
            var pwd = document.querySelector('input[type="password"]');
            if (!pwd || !pwd.offsetParent) return null;
            var node = pwd;
            for (var d = 0; d < 28 && node; d++) {
              var cls = String(node.className || '');
              var txt = (node.innerText || '').trim();
              var z = parseInt(window.getComputedStyle(node).zIndex, 10) || 0;
              var tag = (node.tagName || '').toUpperCase();
              if (txt.indexOf('Connect to account') >= 0) return node;
              if (txt.indexOf('Server') >= 0 && txt.indexOf('Password') >= 0 && txt.length < 500) return node;
              if (tag === 'DIALOG' || cls.indexOf('dialog') >= 0 || cls.indexOf('modal') >= 0 || cls.indexOf('popup') >= 0 || cls.indexOf('overlay') >= 0 || cls.indexOf('backdrop') >= 0 || cls.indexOf('sheet') >= 0 || node.getAttribute('aria-modal') === 'true' || z > 50) {
                return node;
              }
              node = node.parentElement;
            }
          } catch (e2) {}
          return null;
        }

        function setInputValueForOverlay(el, val) {
          if (!el || val == null || val === '') return;
          try {
            el.focus();
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            var nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') && Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            if (nativeSetter) nativeSetter.call(el, val);
            else el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
          } catch (e) {}
        }

        /** Dismiss any post-login modal so only the logged-in terminal (and chart) remains visible. */
        const dismissLoginOverlay = async function() {
          var pw = '${passwordVal}';
          try {
            hideTradingAccountsOverlayIfPresent();
          } catch (eT) {}
          try {
            if (pw && isAnyLoginModalBlocking()) {
              var pwdIn = document.querySelector('input[type="password"]');
              if (pwdIn && (!pwdIn.value || String(pwdIn.value).trim() === '')) {
                setInputValueForOverlay(pwdIn, pw);
                await new Promise(function(r) { setTimeout(r, 400); });
                var btns0 = document.querySelectorAll('button');
                for (var b0 = 0; b0 < btns0.length; b0++) {
                  var t0 = ((btns0[b0].innerText || btns0[b0].textContent || '') + '').trim().toLowerCase();
                  if (t0.indexOf('connect') >= 0 && t0.indexOf('account') >= 0) {
                    btns0[b0].click();
                    sendMessage('step_update', 'Login modal: submitted password (Connect to account)');
                    await new Promise(function(r) { setTimeout(r, 2200); });
                    break;
                  }
                }
              }
            }
          } catch (e0) {}
          try {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
            await new Promise(function(r) { setTimeout(r, 120); });
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
          } catch (e) {}
          await new Promise(function(r) { setTimeout(r, 200); });
          try {
            var root = findPasswordModalOverlayRoot();
            if (root) {
              root.style.display = 'none';
              root.style.visibility = 'hidden';
              root.style.pointerEvents = 'none';
              sendMessage('step_update', 'Hid login modal overlay (password form root)');
            } else if (isAnyLoginModalBlocking()) {
              var all = document.querySelectorAll('div, section, [role="dialog"], dialog');
              for (var ai = 0; ai < Math.min(all.length, 250); ai++) {
                var ae = all[ai];
                if (!ae.offsetParent) continue;
                var atxt = (ae.innerText || '').trim();
                if (atxt.length > 500) continue;
                if (atxt.indexOf('Connect to account') >= 0 || (atxt.indexOf('Server') >= 0 && atxt.indexOf('Password') >= 0 && atxt.indexOf('Login') >= 0)) {
                  var ar = ae.getBoundingClientRect();
                  if (ar.width > 160 && ar.height > 100) {
                    ae.style.display = 'none';
                    ae.style.visibility = 'hidden';
                    ae.style.pointerEvents = 'none';
                    sendMessage('step_update', 'Hid login modal (text match)');
                    break;
                  }
                }
              }
            }
          } catch (e3) {}
          try {
            if (isTerminalSessionVisible() && isPasswordInModalOverlay()) {
              var root2 = findPasswordModalOverlayRoot();
              if (root2) {
                root2.style.display = 'none';
                root2.style.visibility = 'hidden';
                root2.style.pointerEvents = 'none';
                sendMessage('step_update', 'Removed second login layer so terminal stays visible');
              }
            }
          } catch (e5) {}
          try {
            var pwd = document.querySelector('input[type="password"]');
            var sb = document.querySelector('input[placeholder*="Search symbol" i]') ||
                     document.querySelector('input[placeholder*="Search" i]') ||
                     document.querySelector('input[type="search"]');
            if (pwd && pwd.offsetParent && sb && sb.offsetParent) {
              var node = pwd;
              for (var d = 0; d < 18 && node; d++) {
                node = node.parentElement;
                if (!node) break;
                var cls = String(node.className || '');
                var z = parseInt(window.getComputedStyle(node).zIndex, 10) || 0;
                if (node.tagName === 'DIALOG' || cls.indexOf('dialog') >= 0 || cls.indexOf('modal') >= 0 || cls.indexOf('popup') >= 0 || cls.indexOf('overlay') >= 0 || cls.indexOf('backdrop') >= 0 || z > 40) {
                  node.style.display = 'none';
                  node.style.visibility = 'hidden';
                  node.style.pointerEvents = 'none';
                  sendMessage('step_update', 'Dismissed login layer blocking chart');
                  break;
                }
              }
            }
          } catch (e4) {}
          try {
            hideTradingAccountsOverlayIfPresent();
          } catch (eT2) {}
        };

        function visitAllFramesDeep(visitor) {
          function walk(d) {
            if (!d) return;
            try {
              visitor(d);
              var iframes = d.querySelectorAll('iframe');
              for (var i = 0; i < iframes.length; i++) {
                try {
                  var ind = iframes[i].contentDocument;
                  if (ind) walk(ind);
                } catch (e) {}
              }
            } catch (e2) {}
          }
          walk(document);
        }

        async function acceptDisclaimersAndConfirmDeep() {
          var maxPasses = 4;
          for (var pass = 0; pass < maxPasses; pass++) {
            var changed = false;
            visitAllFramesDeep(function(d) {
              try {
                var disc = d.querySelector('#disclaimer');
                if (disc && disc.offsetParent) {
                  var ab = d.querySelector('.accept-button');
                  if (ab) {
                    ab.click();
                    changed = true;
                    sendMessage('step_update', 'Accepted broker disclaimer');
                  }
                }
              } catch (e) {}
            });
            visitAllFramesDeep(function(d) {
              try {
                var txt = (d.body && d.body.innerText) ? d.body.innerText : '';
                var low = txt.toLowerCase();
                if (low.indexOf('one click') < 0 && low.indexOf('one-click') < 0) return;
                if (low.indexOf('disclaimer') < 0 && low.indexOf('terms and conditions') < 0) return;
                var boxes = d.querySelectorAll('input[type="checkbox"]');
                var hit = false;
                for (var i = 0; i < boxes.length; i++) {
                  var cb = boxes[i];
                  if (!cb.offsetParent || cb.checked) continue;
                  var labTxt = '';
                  if (cb.labels && cb.labels.length) labTxt = (cb.labels[0].innerText || '') + '';
                  try {
                    var wrapLab = cb.closest('label');
                    if (wrapLab) labTxt += ' ' + (wrapLab.innerText || '');
                  } catch (eL) {}
                  var labLow = (labTxt + '').toLowerCase();
                  if (labLow.indexOf('accept') >= 0 || labLow.indexOf('terms') >= 0 || labLow.indexOf('condition') >= 0) {
                    cb.click();
                    hit = true;
                    changed = true;
                    sendMessage('step_update', 'Accepted One Click Trading checkbox');
                    break;
                  }
                }
                if (!hit) {
                  for (var j = 0; j < boxes.length; j++) {
                    var c2 = boxes[j];
                    if (c2.offsetParent && !c2.checked) {
                      c2.click();
                      changed = true;
                      sendMessage('step_update', 'Accepted terms checkbox');
                      break;
                    }
                  }
                }
              } catch (e2) {}
            });
            visitAllFramesDeep(function(d) {
              try {
                var ttxt = (d.body && d.body.innerText) ? d.body.innerText : '';
                if (!/one click|disclaimer|terms/i.test(ttxt)) return;
                var btns = d.querySelectorAll('button, [role="button"], a');
                for (var k = 0; k < btns.length; k++) {
                  var el = btns[k];
                  if (!el.offsetParent) continue;
                  var t = ((el.innerText || el.textContent || '') + '').trim().toLowerCase();
                  if (
                    t === 'ok' ||
                    t === 'accept' ||
                    t === 'continue' ||
                    t.indexOf('i agree') >= 0 ||
                    t.indexOf('i accept') >= 0 ||
                    (t.indexOf('confirm') >= 0 && t.length < 24)
                  ) {
                    el.click();
                    changed = true;
                    sendMessage('step_update', 'Confirmed disclaimer dialog');
                    break;
                  }
                }
              } catch (e3) {}
            });
            if (!changed) break;
            await new Promise(function(r) { setTimeout(r, 500); });
          }
        }

        /** Collect canvases from this document and all same-origin nested iframes (MT5 chart often lives in a child frame). */
        function getAllCanvasesDeep() {
          var out = [];
          function walk(d) {
            if (!d) return;
            try {
              var list = d.querySelectorAll('canvas');
              for (var i = 0; i < list.length; i++) out.push(list[i]);
              var iframes = d.querySelectorAll('iframe');
              for (var j = 0; j < iframes.length; j++) {
                try {
                  var ind = iframes[j].contentDocument;
                  if (ind) walk(ind);
                } catch (e) {}
              }
            } catch (e2) {}
          }
          walk(document);
          return out;
        }

        function canvasHasWebGLContext(canvas) {
          try {
            if (!canvas || !canvas.getContext) return false;
            var gl =
              canvas.getContext('webgl2', { stencil: false }) ||
              canvas.getContext('webgl', { stencil: false }) ||
              canvas.getContext('experimental-webgl');
            return !!gl;
          } catch (e) {
            return false;
          }
        }

        /** Rank canvases; WebGL chart surfaces get a higher score (MT5 draws the chart with WebGL). */
        function collectRankedCanvasCandidates() {
          var canvases = getAllCanvasesDeep();
          var ranked = [];
          for (var i = 0; i < canvases.length; i++) {
            var c = canvases[i];
            var rect = c.getBoundingClientRect();
            if (rect.bottom < -35 || rect.top > (window.innerHeight || 0) + 50) continue;
            if (rect.width < 80 || rect.height < 58) continue;
            var rectArea = rect.width * rect.height;
            var internal = (c.width || 0) * (c.height || 0);
            var score = internal > 5000 ? Math.min(rectArea, internal) : rectArea;
            try {
              if (canvasHasWebGLContext(c)) score *= 1.5;
            } catch (e) {}
            if (score > 0) ranked.push({ canvas: c, score: score });
          }
          ranked.sort(function(a, b) {
            return b.score - a.score;
          });
          return ranked;
        }

        /** Toolbar save control; MT5 may mount it in a nested same-origin iframe. */
        function findSaveChartAsImageButton() {
          var found = null;
          function searchDoc(d) {
            if (!d || found) return;
            try {
              var exact = d.querySelector(
                'div.icon-button.svelte-1iwf8ix[title="Save Chart as Image (Ctrl + S)"]'
              );
              if (exact && exact.offsetParent !== null) {
                found = exact;
                return;
              }
              var all = d.querySelectorAll('div.icon-button.svelte-1iwf8ix');
              for (var bi = 0; bi < all.length; bi++) {
                var title = (all[bi].getAttribute('title') || '');
                if (/save chart as image/i.test(title) && all[bi].offsetParent !== null) {
                  found = all[bi];
                  return;
                }
              }
              var iframes = d.querySelectorAll('iframe');
              for (var j = 0; j < iframes.length; j++) {
                try {
                  var ind = iframes[j].contentDocument;
                  if (ind) searchDoc(ind);
                } catch (e) {}
              }
            } catch (e) {}
          }
          searchDoc(document);
          return found;
        }

        /** After createObjectURL has seen a chart blob, skip synthetic <a download> click so WebKit does not open blob/data preview. */
        var origHtmlAnchorClick = HTMLAnchorElement.prototype.click;
        var chartExportAnchorBlockInstalled = false;
        function installChartExportAnchorBlock() {
          if (chartExportAnchorBlockInstalled) return;
          chartExportAnchorBlockInstalled = true;
          HTMLAnchorElement.prototype.click = function() {
            try {
              var href = String(this.href || '');
              var tw = window.top;
              if (
                tw &&
                tw.__eaChartWarmupCapture &&
                tw.__eaGotChartBlob &&
                href.indexOf('blob:') === 0 &&
                this.getAttribute('download') !== null
              ) {
                return;
              }
            } catch (eA) {}
            return origHtmlAnchorClick.apply(this, arguments);
          };
        }
        function uninstallChartExportAnchorBlock() {
          if (!chartExportAnchorBlockInstalled) return;
          chartExportAnchorBlockInstalled = false;
          try {
            HTMLAnchorElement.prototype.click = origHtmlAnchorClick;
          } catch (eU) {}
        }

        /**
         * Hooks createObjectURL on the top window and every same-origin frame so we see chart exports
         * even when the terminal builds the blob inside an iframe.
         */
        function installExportImageBlobHook() {
          var bestBlob = null;
          var createdEntries = [];
          var restoreList = [];
          var patchedWins = [];

          function considerBlob(blob) {
            if (!blob || blob.size < 400) return;
            try {
              var t = (blob.type || '').toLowerCase();
              var isImage = t.indexOf('image/') === 0;
              var untypedLarge = (!t || t === '') && blob.size >= 800;
              var octetOk = t === 'application/octet-stream' && blob.size >= 1200;
              if (!isImage && !untypedLarge && !octetOk) return;
              if (!bestBlob || blob.size > bestBlob.size) bestBlob = blob;
              try {
                var tw = window.top;
                if (tw) tw.__eaGotChartBlob = true;
              } catch (eFlag) {}
            } catch (e0) {}
          }

          function ensurePatch(win) {
            if (!win || !win.URL) return;
            for (var p = 0; p < patchedWins.length; p++) {
              if (patchedWins[p] === win) return;
            }
            patchedWins.push(win);
            var origCreate = win.URL.createObjectURL.bind(win.URL);
            win.URL.createObjectURL = function(blob) {
              var url = origCreate(blob);
              try {
                createdEntries.push({ w: win, url: url });
                considerBlob(blob);
              } catch (e1) {}
              return url;
            };
            restoreList.push(function() {
              try {
                win.URL.createObjectURL = origCreate;
              } catch (e2) {}
            });
          }

          function walkInstall(doc) {
            if (!doc) return;
            try {
              ensurePatch(doc.defaultView);
              var iframes = doc.querySelectorAll('iframe');
              for (var fi = 0; fi < iframes.length; fi++) {
                try {
                  var ind = iframes[fi].contentDocument;
                  if (ind) walkInstall(ind);
                } catch (e3) {}
              }
            } catch (e4) {}
          }
          walkInstall(document);

          return {
            takeBestBlob: function() {
              return bestBlob;
            },
            cleanup: function() {
              for (var ui = 0; ui < createdEntries.length; ui++) {
                try {
                  createdEntries[ui].w.URL.revokeObjectURL(createdEntries[ui].url);
                } catch (eR) {}
              }
              createdEntries.length = 0;
              for (var ri = 0; ri < restoreList.length; ri++) {
                restoreList[ri]();
              }
              restoreList.length = 0;
              patchedWins.length = 0;
            },
          };
        }

        function blobToBase64(blob) {
          return new Promise(function(resolve, reject) {
            try {
              var r = new FileReader();
              r.onloadend = function() {
                var result = r.result;
                if (typeof result === 'string' && result.indexOf(',') >= 0) {
                  resolve(result.split(',')[1]);
                } else {
                  reject(new Error('read failed'));
                }
              };
              r.onerror = function() {
                reject(new Error('read failed'));
              };
              r.readAsDataURL(blob);
            } catch (e3) {
              reject(e3);
            }
          });
        }

        async function waitForChartExportBlob(hook, minBytes, timeoutMs) {
          var deadline = Date.now() + timeoutMs;
          while (Date.now() < deadline) {
            var b = hook.takeBestBlob();
            if (b && b.size >= minBytes) return b;
            await new Promise(function(r) {
              setTimeout(r, 80);
            });
          }
          var last = hook.takeBestBlob();
          if (last && last.size >= Math.min(minBytes, 800)) return last;
          return null;
        }

        async function focusChartForExport() {
          try {
            var ranked = collectRankedCanvasCandidates();
            var chartElement = ranked.length > 0 ? ranked[0].canvas : null;
            if (chartElement) {
              sendMessage('step_update', 'Focusing on chart...');
              try {
                chartElement.scrollIntoView({ block: 'center', inline: 'nearest' });
              } catch (e0) {}
              if (chartElement.focus) chartElement.focus();
              chartElement.click();
              await new Promise(function(r) {
                setTimeout(r, 450);
              });
              sendMessage('step_update', 'Chart focused');
              return;
            }
            var chartContainer =
              document.querySelector('[class*="chart-container"]') ||
              document.querySelector('[class*="trading-chart"]') ||
              document.querySelector('div[class*="chart"]');
            if (chartContainer) {
              sendMessage('step_update', 'Focusing on chart...');
              if (chartContainer.focus) chartContainer.focus();
              chartContainer.click();
              await new Promise(function(r) {
                setTimeout(r, 450);
              });
              sendMessage('step_update', 'Chart container focused');
            }
          } catch (e4) {}
        }

        async function prepareChartForExport() {
          try {
            var ranked = collectRankedCanvasCandidates();
            if (ranked.length > 0) {
              ranked[0].canvas.scrollIntoView({ block: 'center', inline: 'nearest' });
            }
          } catch (e) {}
          await new Promise(function(r) {
            requestAnimationFrame(function() {
              requestAnimationFrame(r);
            });
          });
          await new Promise(function(r) {
            setTimeout(r, 450);
          });
        }

        var captureChartWarmupForAi = async function() {
          await acceptDisclaimersAndConfirmDeep();
          await dismissLoginOverlay();
          window.__eaChartScreenshotSent = false;
          window.__eaLastChartCanvas = null;
          await prepareChartForExport();
          await focusChartForExport();
          for (var preCap = 0; preCap < 10; preCap++) {
            await acceptDisclaimersAndConfirmDeep();
            await dismissLoginOverlay();
            if (!isAnyLoginModalBlocking()) break;
            await new Promise(function(r) {
              setTimeout(r, 450);
            });
          }
          await prepareChartForExport();
          await focusChartForExport();
          sendMessage('step_update', 'Analysing chart');
          var hook = null;
          try {
            try {
              var tw = window.top;
              if (tw) {
                tw.__eaChartWarmupCapture = true;
                tw.__eaGotChartBlob = false;
              }
            } catch (eCap) {}
            installChartExportAnchorBlock();
            hook = installExportImageBlobHook();
            var saveBtn = findSaveChartAsImageButton();
            if (!saveBtn) {
              sendMessage('chart_warmup_capture_failed', 'Save Chart as Image button not found');
              return;
            }
            var clicked = typeof mouseClick === 'function' ? mouseClick(saveBtn) : false;
            if (!clicked) saveBtn.click();
            var blob = await waitForChartExportBlob(hook, 1200, 28000);
            if (!blob) {
              sendMessage(
                'chart_warmup_capture_failed',
                'Chart image export timed out or image was too small — ensure the chart is focused and try again'
              );
              return;
            }
            try {
              var b64 = await blobToBase64(blob);
              if (!b64 || b64.length < 80) {
                sendMessage('chart_warmup_capture_failed', 'Could not read exported chart image');
                return;
              }
              var _mt = blob.type && String(blob.type).toLowerCase();
              var mime =
                _mt && _mt.indexOf('image/') === 0 ? blob.type : 'image/png';
              sendMessage('chart_screenshot', 'snapshot', { image: b64, mimeType: mime });
            } catch (e5) {
              sendMessage(
                'chart_warmup_capture_failed',
                e5 && e5.message ? e5.message : 'Could not read exported chart image'
              );
            }
          } finally {
            if (hook) hook.cleanup();
            try {
              var tw2 = window.top;
              if (tw2) {
                tw2.__eaChartWarmupCapture = false;
                tw2.__eaGotChartBlob = false;
              }
            } catch (eCap2) {}
            uninstallChartExportAnchorBlock();
          }
        };

        /** Wait until not on broker login screen and chart canvas is visible (avoids AI snapshot of login page). */
        const waitForChartReady = async function(maxMs) {
          var deadline = Date.now() + maxMs;
          var tick = 450;
          function isLikelyLoginScreen() {
            try {
              if (isAnyLoginModalBlocking()) return true;
              var hasChart = hasChartCanvas();
              var hasBidAsk = hasBidAskRibbon();
              var sb = document.querySelector('input[placeholder*="Search symbol" i]') ||
                       document.querySelector('input[placeholder*="Search" i]') ||
                       document.querySelector('input[type="search"]');
              var hasSb = sb && sb.offsetParent !== null;
              if (hasSb && (hasChart || hasBidAsk)) {
                return false;
              }
              var pwd = document.querySelector('input[type="password"]');
              if (!pwd || pwd.offsetParent === null) return false;
              var btns = document.querySelectorAll('button');
              for (var j = 0; j < btns.length; j++) {
                var t = ((btns[j].innerText || btns[j].textContent || '') + '').trim().toLowerCase();
                if (t.indexOf('connect') >= 0 && (t.indexOf('account') >= 0 || t === 'connect')) {
                  return btns[j].offsetParent !== null;
                }
              }
            } catch (e) {}
            return false;
          }
          function hasChartCanvas() {
            try {
              function maxArea(d) {
                if (!d) return 0;
                var best = 0;
                try {
                  var list = d.querySelectorAll('canvas');
                  for (var i = 0; i < list.length; i++) {
                    var c = list[i];
                    var area = (c.width || 0) * (c.height || 0);
                    if (area > best) best = area;
                  }
                  var iframes = d.querySelectorAll('iframe');
                  for (var j = 0; j < iframes.length; j++) {
                    try {
                      var ind = iframes[j].contentDocument;
                      if (ind) {
                        var sub = maxArea(ind);
                        if (sub > best) best = sub;
                      }
                    } catch (e) {}
                  }
                } catch (e2) {}
                return best;
              }
              return maxArea(document) >= 60000;
            } catch (e3) { return false; }
          }
          function hasBidAskRibbon() {
            try {
              function concatText(d) {
                if (!d || !d.body) return '';
                var t = '';
                try {
                  t += (d.body.innerText || '') + '\\n';
                  var iframes = d.querySelectorAll('iframe');
                  for (var i = 0; i < iframes.length; i++) {
                    try {
                      var ind = iframes[i].contentDocument;
                      if (ind) t += concatText(ind);
                    } catch (e) {}
                  }
                } catch (e2) {}
                return t;
              }
              var txt = concatText(document);
              return /\\bBid\\b/i.test(txt) && /\\bAsk\\b/i.test(txt);
            } catch (e3) { return false; }
          }
          while (Date.now() < deadline) {
            await acceptDisclaimersAndConfirmDeep();
            await dismissLoginOverlay();
            var onLogin = isLikelyLoginScreen();
            var chartOk = hasChartCanvas() || hasBidAskRibbon();
            if (!onLogin && chartOk) {
              sendMessage('step_update', 'Chart ready for snapshot');
              return true;
            }
            await new Promise(function(r) { setTimeout(r, tick); });
          }
          return false;
        };

        // Optimized authentication function matching Android robustness
        const authenticateMT5 = async () => {
          try {
            sendMessage('step_update', 'Initializing MT5 Account...');
            // Wait for page to be ready (some brokers load slower)
            let retries = 0;
            while (retries < 20) {
              const form = document.querySelector('.form');
              const loginField = document.querySelector('input[name="login"]') ||
                               document.querySelector('input[name="Login"]') ||
                               document.querySelector('input[type="number"]');
              if (form || loginField) break;
              await new Promise(r => setTimeout(r, 400));
              retries++;
            }
            
            // Check for disclaimer and accept if present
            const disclaimer = document.querySelector('#disclaimer');
            if (disclaimer) {
              const acceptButton = document.querySelector('.accept-button');
              if (acceptButton) {
                acceptButton.click();
                sendMessage('step_update', 'Accepting disclaimer...');
                await new Promise(r => setTimeout(r, 500));
              }
            }
            
            // Remove existing connection - find Remove button (works across different broker terminals)
            const findAndClickRemove = () => {
              const allClickables = document.querySelectorAll('button, a, [role="button"], .button');
              for (const el of allClickables) {
                const text = (el.textContent || '').trim().toLowerCase();
                const isRed = el.className && (el.className.includes('red') || el.style.color === 'red');
                if (text === 'remove' || text.includes('remove') || text === 'disconnect' || (isRed && text.includes('remove'))) {
                  return el;
                }
              }
              return null;
            };
            for (let attempt = 0; attempt < 3; attempt++) {
              const removeBtn = findAndClickRemove();
              if (removeBtn) {
                sendMessage('step_update', 'Removing existing connection...');
                removeBtn.click();
                await new Promise(r => setTimeout(r, 4500));
              } else break;
            }
            
            // Wait for form to be ready
            await new Promise(r => setTimeout(r, 2000));
            
            // Fill login credentials with enhanced field detection (matching Android)
            const loginField = document.querySelector('input[name="login"]') || 
                              document.querySelector('input[type="text"][placeholder*="login" i]') ||
                              document.querySelector('input[type="number"]') ||
                              document.querySelector('input#login');
            
            const passwordField = document.querySelector('input[name="password"]') || 
                                 document.querySelector('input[type="password"]') ||
                                 document.querySelector('input#password');
            
            if (!loginField) {
              sendMessage('authentication_failed', 'Login field not found');
              return;
            }
            if (!passwordField) {
              sendMessage('authentication_failed', 'Password field not found');
              return;
            }
            if (!'${loginVal}') {
              sendMessage('authentication_failed', 'Login not configured - connect MT5 in MetaTrader tab');
              return;
            }
            if (!'${passwordVal}') {
              sendMessage('authentication_failed', 'Password not configured - connect MT5 in MetaTrader tab');
              return;
            }
            
            // Fill login - use native setter for React/Svelte-controlled inputs
            const setInputValue = (el, val) => {
              el.focus();
              el.value = '';
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
              if (nativeSetter) nativeSetter.call(el, val);
              else el.value = val;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new Event('blur', { bubbles: true }));
            };
            
            setInputValue(loginField, '${loginVal}');
            sendMessage('step_update', 'Login filled');
            await new Promise(r => setTimeout(r, 300));
            
            setInputValue(passwordField, '${passwordVal}');
            sendMessage('step_update', 'Password filled');
            
            // Wait for fields to be filled before clicking connect
            await new Promise(r => setTimeout(r, 1500));
            
            // Click login button with enhanced detection (matching Android)
            sendMessage('step_update', 'Connecting to Server...');
            const loginButton = document.querySelector('.button.svelte-1wrky82.active') ||
                               document.querySelector('button[type="submit"]') ||
                               document.querySelector('.button.active') ||
                               Array.from(document.querySelectorAll('button')).find(btn => 
                                 btn.textContent.trim().toLowerCase().includes('login') ||
                                 btn.textContent.trim().toLowerCase().includes('connect')
                               );
            
            if (loginButton) {
              loginButton.click();
              // Wait for login to complete - check for search bar or disappearance of login form
              sendMessage('step_update', 'Connecting...');
              let loginRetries = 0;
              const maxRetries = 35;
              while (loginRetries < maxRetries) {
                // Check for visible error messages (broker rejected credentials)
                const pageText = (document.body?.innerText || '').toLowerCase();
                if (pageText.includes('invalid login') || pageText.includes('invalid password') || 
                    pageText.includes('wrong password') || pageText.includes('wrong login') ||
                    pageText.includes('incorrect password') || pageText.includes('incorrect login')) {
                  sendMessage('authentication_failed', 'Invalid login or password - verify credentials in MetaTrader tab');
                  return;
                }
                const loginForm = document.querySelector('input[name="login"]');
                const searchBar = document.querySelector('input[placeholder*="Search symbol" i]') ||
                                 document.querySelector('input[placeholder*="Search" i]') ||
                                 document.querySelector('input[type="search"]') ||
                                 document.querySelector('.search input');
                if (!loginForm && searchBar && searchBar.offsetParent !== null) {
                  break; // Login successful
                }
                await new Promise(r => setTimeout(r, 500));
                loginRetries++;
              }
            } else {
              sendMessage('authentication_failed', 'Login button not found');
              return;
            }
            
            // Check for successful login
            sendMessage('step_update', 'Verifying authentication...');
            await new Promise(r => setTimeout(r, 1000)); // Reduced wait
            await dismissLoginOverlay();
            
            // After login, expand Market Watch panel if not already expanded
            sendMessage('step_update', 'Checking Market Watch panel...');
            
            // First check if search bar is already visible
            const searchFieldCheck = document.querySelector('input[placeholder*="Search symbol" i]') ||
                                    document.querySelector('input[placeholder*="Search" i]') ||
                                    document.querySelector('input[type="search"]');
            
            // Only click if search bar is not visible (Market Watch is hidden)
            if (!searchFieldCheck || searchFieldCheck.offsetParent === null) {
              sendMessage('step_update', 'Expanding Market Watch panel...');
              
              // Find and click the "Show Market Watch" button to expand search bar
              const marketWatchButton = document.querySelector('div.icon-button.svelte-1iwf8ix[title="Show Market Watch (Ctrl + M)"]') ||
                                       document.querySelector('div.icon-button[title*="Show Market Watch" i]') ||
                                       document.querySelector('div.icon-button[title*="Market Watch" i]') ||
                                       Array.from(document.querySelectorAll('div.icon-button')).find(btn => 
                                         btn.getAttribute('title') && btn.getAttribute('title').includes('Market Watch')
                                       );
              
              if (marketWatchButton) {
                // Check if button title says "Show" (not "Hide") before clicking
                const buttonTitle = marketWatchButton.getAttribute('title') || '';
                if (buttonTitle.toLowerCase().includes('show')) {
                  marketWatchButton.click();
                  sendMessage('step_update', 'Market Watch button clicked, waiting for panel to expand...');
                  await new Promise(r => setTimeout(r, 2000)); // Wait for panel to expand
                } else {
                  sendMessage('step_update', 'Market Watch already visible');
                }
              }
            } else {
              sendMessage('step_update', 'Market Watch already visible');
            }
            
            // Check for search bar after expanding Market Watch
            await new Promise(r => setTimeout(r, 1000)); // Additional wait for search bar to appear
            const searchField = document.querySelector('input[placeholder*="Search symbol" i]') ||
                               document.querySelector('input[placeholder*="Search" i]') ||
                               document.querySelector('input[type="search"]');
            
            if (searchField && searchField.offsetParent !== null) {
              // Search bar is present and visible - login successful!
              // STRICTLY SEQUENTIAL FLOW - none before the other:
              // Step 1: Login ✅ (completed)
              await dismissLoginOverlay();
              var _eqAfterConnect = scrapeTerminalAccountStats();
              sendMessage('authentication_success', 'MT5 session verified', {
                equity: _eqAfterConnect.equity,
                balance: _eqAfterConnect.balance,
              });
              // Step 2: Search for symbol
              await searchForSymbol('${symbol}');
              
              // Step 3: Open chart (chart opens automatically when symbol is selected)
              await openChart('${symbol}');
              
              if (isChartWarmup) {
                await dismissLoginOverlay();
                sendMessage('step_update', 'Waiting for chart (login must complete)...');
                var chartReadyOk = await waitForChartReady(120000);
                if (!chartReadyOk) {
                  sendMessage('chart_warmup_capture_failed', 'Chart not ready in time — still on login or chart not visible');
                  return;
                }
                var _eqWarm = scrapeTerminalAccountStats();
                if (_eqWarm.equity || _eqWarm.balance) {
                  sendMessage('equity_snapshot', 'Account updated', { equity: _eqWarm.equity, balance: _eqWarm.balance });
                }
                await captureChartWarmupForAi();
                return;
              }
              // Step 4 & 5: Execute multiple trades (opens dialog and fills details for each)
              await executeMultipleTrades();
              
              return;
            }
            
            // Double check after a longer wait (matching Android)
            await new Promise(r => setTimeout(r, 3000)); // Match Android timing
            const searchFieldRetry = document.querySelector('input[placeholder*="Search symbol" i]') ||
                                    document.querySelector('input[placeholder*="Search" i]') ||
                                    document.querySelector('input[type="search"]');
            
            if (searchFieldRetry && searchFieldRetry.offsetParent !== null) {
              // STRICTLY SEQUENTIAL FLOW - none before the other:
              // Step 1: Login ✅ (completed)
              await dismissLoginOverlay();
              var _eqAfterConnect2 = scrapeTerminalAccountStats();
              sendMessage('authentication_success', 'MT5 session verified', {
                equity: _eqAfterConnect2.equity,
                balance: _eqAfterConnect2.balance,
              });
              // Step 2: Search for symbol
              await searchForSymbol('${symbol}');
              
              // Step 3: Open chart (chart opens automatically when symbol is selected)
              await openChart('${symbol}');
              
              if (isChartWarmup) {
                await dismissLoginOverlay();
                sendMessage('step_update', 'Waiting for chart (login must complete)...');
                var chartReadyOk = await waitForChartReady(120000);
                if (!chartReadyOk) {
                  sendMessage('chart_warmup_capture_failed', 'Chart not ready in time — still on login or chart not visible');
                  return;
                }
                var _eqWarm2 = scrapeTerminalAccountStats();
                if (_eqWarm2.equity || _eqWarm2.balance) {
                  sendMessage('equity_snapshot', 'Account updated', { equity: _eqWarm2.equity, balance: _eqWarm2.balance });
                }
                await captureChartWarmupForAi();
                return;
              }
              // Step 4 & 5: Execute multiple trades (opens dialog and fills details for each)
              await executeMultipleTrades();
              
              return;
            }
            
            // No search bar found - check page for specific error before generic message
            const errText = (document.body?.innerText || '').toLowerCase();
            if (errText.includes('invalid') || errText.includes('wrong') || errText.includes('incorrect')) {
              sendMessage('authentication_failed', 'Invalid login or password - verify credentials in MetaTrader tab');
            } else {
              sendMessage('authentication_failed', 'Authentication failed - could not reach terminal. Check broker connection.');
            }
            
          } catch(e) {
            sendMessage('authentication_failed', 'Error during authentication: ' + e.message);
          }
        };

        /** Collapse Market Watch / clear search after picking a symbol so the chart uses full width for screenshots and AI analysis. */
        const closeSearchPanelAfterSymbolSelect = async () => {
          try {
            sendMessage('step_update', 'Closing search panel for a wider chart...');
            try {
              const sf =
                document.querySelector('input[placeholder*="Search symbol" i]') ||
                document.querySelector('input[placeholder*="Search" i]');
              if (sf) sf.blur();
            } catch (e) {}
            document.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true })
            );
            await new Promise(r => setTimeout(r, 300));
            const hideMw =
              document.querySelector('div.icon-button.svelte-1iwf8ix[title="Hide Market Watch (Ctrl + M)"]') ||
              Array.from(document.querySelectorAll('div.icon-button.svelte-1iwf8ix')).find(btn => {
                const t = (btn.getAttribute('title') || '').toLowerCase();
                return t.includes('hide') && t.includes('market watch');
              });
            if (hideMw) {
              hideMw.click();
              await new Promise(r => setTimeout(r, 650));
            }
            const sf2 =
              document.querySelector('input[placeholder*="Search symbol" i]') ||
              document.querySelector('input[placeholder*="Search" i]');
            if (sf2) {
              sf2.value = '';
              sf2.dispatchEvent(new Event('input', { bubbles: true }));
              sf2.blur();
            }
            document.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true })
            );
            await new Promise(r => setTimeout(r, 400));
          } catch (e) {}
        };

        // Search for symbol function - STRICTLY SEQUENTIAL Step 2
        const searchForSymbol = async (symbolName) => {
          try {
            sendMessage('step_update', 'Step 2: Searching for symbol ' + symbolName + '...');
            
            // First, check if search bar is visible/expanded
            // Try to find search input via the search label
            let searchLabel = document.querySelector('label.search.svelte-1mvzp7f');
            let searchField = null;
            
            if (searchLabel) {
              // Find input associated with the label
              const labelFor = searchLabel.getAttribute('for');
              if (labelFor) {
                searchField = document.getElementById(labelFor);
              }
              // If no 'for' attribute, try to find input within or near the label
              if (!searchField) {
                searchField = searchLabel.querySelector('input') || 
                            searchLabel.parentElement?.querySelector('input') ||
                            searchLabel.closest('form')?.querySelector('input[type="search"]') ||
                            searchLabel.closest('form')?.querySelector('input[placeholder*="Search" i]');
              }
            }
            
            // Fallback to other search field selectors
            if (!searchField) {
              searchField = document.querySelector('input[placeholder*="Search symbol" i]') ||
                          document.querySelector('input[placeholder*="Search" i]') ||
                          document.querySelector('input[type="search"]');
            }
            
            // If search field is not visible, expand using Economic Calendar button
            if (!searchField || searchField.offsetParent === null) {
              sendMessage('step_update', 'Expanding search bar using Economic Calendar button...');
              
              // Find and click the "Show Economic Calendar Events on Chart" button
              const economicCalendarButton = document.querySelector('div.icon-button.svelte-1iwf8ix[title="Show Economic Calendar Events on Chart"]') ||
                                           Array.from(document.querySelectorAll('div.icon-button.svelte-1iwf8ix')).find(btn => 
                                             btn.getAttribute('title') && btn.getAttribute('title').includes('Economic Calendar')
                                           );
              
              if (economicCalendarButton) {
                economicCalendarButton.click();
                sendMessage('step_update', 'Economic Calendar button clicked, waiting for search bar to appear...');
                await new Promise(r => setTimeout(r, 2000)); // Wait for search bar to appear
                
                // Try to find search field again after expansion
                searchLabel = document.querySelector('label.search.svelte-1mvzp7f');
                if (searchLabel) {
                  const labelFor = searchLabel.getAttribute('for');
                  if (labelFor) {
                    searchField = document.getElementById(labelFor);
                  }
                  if (!searchField) {
                    searchField = searchLabel.querySelector('input') || 
                                searchLabel.parentElement?.querySelector('input') ||
                                searchLabel.closest('form')?.querySelector('input[type="search"]') ||
                                searchLabel.closest('form')?.querySelector('input[placeholder*="Search" i]');
                  }
                }
                
                // Fallback
                if (!searchField) {
                  searchField = document.querySelector('input[placeholder*="Search symbol" i]') ||
                              document.querySelector('input[placeholder*="Search" i]') ||
                              document.querySelector('input[type="search"]');
                }
              } else {
                sendMessage('step_update', 'Economic Calendar button not found, trying Market Watch button...');
                // Fallback to Market Watch button - only click if it says "Show"
                const marketWatchButton = document.querySelector('div.icon-button.svelte-1iwf8ix[title="Show Market Watch (Ctrl + M)"]') ||
                                         Array.from(document.querySelectorAll('div.icon-button.svelte-1iwf8ix')).find(btn => {
                                           const title = btn.getAttribute('title') || '';
                                           return title.includes('Market Watch') && title.toLowerCase().includes('show');
                                         });
                if (marketWatchButton) {
                  // Double check the button title says "Show" before clicking
                  const buttonTitle = marketWatchButton.getAttribute('title') || '';
                  if (buttonTitle.toLowerCase().includes('show')) {
                    marketWatchButton.click();
                    await new Promise(r => setTimeout(r, 2000));
                    searchField = document.querySelector('input[placeholder*="Search symbol" i]') ||
                                document.querySelector('input[placeholder*="Search" i]') ||
                                document.querySelector('input[type="search"]');
                  } else {
                    sendMessage('step_update', 'Market Watch already visible, skipping click');
                  }
                }
              }
            }
            
            if (searchField && searchField.offsetParent !== null) {
              sendMessage('step_update', 'Search bar found, searching for ' + symbolName + '...');
              
              searchField.focus();
              searchField.value = '';
              searchField.dispatchEvent(new Event('input', { bubbles: true }));
              searchField.dispatchEvent(new Event('change', { bubbles: true }));
              
              await new Promise(r => setTimeout(r, 300));
              
              searchField.focus();
              searchField.value = symbolName;
              searchField.dispatchEvent(new Event('input', { bubbles: true }));
              searchField.dispatchEvent(new Event('change', { bubbles: true }));
              searchField.dispatchEvent(new Event('keyup', { bubbles: true }));
              
              await new Promise(r => setTimeout(r, 2000)); // Wait for search results
              
              sendMessage('symbol_search', 'Symbol ' + symbolName + ' searched');
              
              // Try to select the symbol if found - this will open the chart
              const symbolElements = document.querySelectorAll('.name.svelte-19bwscl .symbol.svelte-19bwscl, .symbol.svelte-19bwscl, [class*="symbol"]');
              let symbolSelected = false;
              for (let i = 0; i < symbolElements.length; i++) {
                const text = (symbolElements[i].innerText || '').trim();
                if (text === symbolName || text.includes(symbolName)) {
                  symbolElements[i].click();
                  sendMessage('symbol_selected', 'Symbol ' + symbolName + ' selected');
                  symbolSelected = true;
                  await new Promise(r => setTimeout(r, 2000)); // Wait for symbol to be selected and chart to open
                  break;
                }
              }

              if (symbolSelected) {
                await dismissLoginOverlay();
                await new Promise(r => setTimeout(r, 500));
                await dismissLoginOverlay();
                await closeSearchPanelAfterSymbolSelect();
              }
              
              if (!symbolSelected) {
                sendMessage('error', 'Symbol ' + symbolName + ' not found in search results');
              }
            } else {
              sendMessage('error', 'Search field not found or not visible after expanding');
            }
          } catch(e) {
            sendMessage('error', 'Error searching for symbol: ' + e.message);
          }
        };

        // Open chart function - STRICTLY SEQUENTIAL Step 3
        const openChart = async (symbolName) => {
          try {
            sendMessage('step_update', 'Step 3: Opening chart for ' + symbolName + '...');
            
            // Chart should already be open from symbol selection, but verify
            // Wait a bit for chart to fully load
            await new Promise(r => setTimeout(r, 2000));
            
            // Verify chart is open by checking for chart elements
            let chartElement = null;
            let retries = 0;
            while (retries < 5) {
              chartElement = document.querySelector('[class*="chart"]') ||
                            document.querySelector('canvas') ||
                            document.querySelector('[id*="chart"]') ||
                            document.querySelector('[class*="Chart"]');
              
              if (chartElement) {
                sendMessage('step_update', 'Chart opened for ' + symbolName);
                break;
              }
              await new Promise(r => setTimeout(r, 500));
              retries++;
            }
            
            // Additional wait to ensure chart is fully loaded
            await new Promise(r => setTimeout(r, 1000));
            
            // Focus on the chart before opening dialog
            if (chartElement) {
              sendMessage('step_update', 'Focusing on chart...');
              chartElement.focus();
              chartElement.click(); // Click to ensure focus
              await new Promise(r => setTimeout(r, 500)); // Wait for focus to take effect
              sendMessage('step_update', 'Chart focused');
            } else {
              // Try to find and focus any chart-related element
              const chartContainer = document.querySelector('[class*="chart-container"]') ||
                                    document.querySelector('[class*="trading-chart"]') ||
                                    document.querySelector('div[class*="chart"]');
              if (chartContainer) {
                chartContainer.focus();
                chartContainer.click();
                await new Promise(r => setTimeout(r, 500));
                sendMessage('step_update', 'Chart container focused');
              }
            }

            await dismissLoginOverlay();
            await new Promise(r => setTimeout(r, 450));
            await dismissLoginOverlay();
          } catch(e) {
            sendMessage('error', 'Error opening chart: ' + e.message);
          }
        };

        // Helper function to simulate mouse click
        const mouseClick = (element) => {
          try {
            const rect = element.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            
            // Create and dispatch mousedown event
            const mousedownEvent = new MouseEvent('mousedown', {
              bubbles: true,
              cancelable: true,
              view: window,
              button: 0,
              buttons: 1,
              clientX: x,
              clientY: y,
              screenX: x,
              screenY: y
            });
            element.dispatchEvent(mousedownEvent);
            
            // Create and dispatch mouseup event
            const mouseupEvent = new MouseEvent('mouseup', {
              bubbles: true,
              cancelable: true,
              view: window,
              button: 0,
              buttons: 0,
              clientX: x,
              clientY: y,
              screenX: x,
              screenY: y
            });
            element.dispatchEvent(mouseupEvent);
            
            // Create and dispatch click event
            const clickEvent = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window,
              button: 0,
              buttons: 0,
              clientX: x,
              clientY: y,
              screenX: x,
              screenY: y
            });
            element.dispatchEvent(clickEvent);
            
            return true;
          } catch(e) {
            return false;
          }
        };

        // Open order dialog and execute single trade - STRICTLY SEQUENTIAL
        const openOrderDialogAndExecuteTrade = async (tradeNumber, totalTrades) => {
          try {
            sendMessage('step_update', '📋 Opening order dialog for trade ' + tradeNumber + '/' + totalTrades + '...');
            
            // "Hide Trade Form" = panel already OPEN (do NOT click — that would close it).
            // "Show Trade Form" = panel closed — click once to open.
            var findHideTradeToolbar = function() {
              return document.querySelector('div.icon-button.svelte-1iwf8ix.withText[title="Hide Trade Form (F9)"]') ||
                Array.from(document.querySelectorAll('div.icon-button.svelte-1iwf8ix.withText')).find(function(btn) {
                  var title = btn.getAttribute('title') || '';
                  return title.indexOf('Hide Trade Form') >= 0 || (title.indexOf('Trade Form') >= 0 && title.indexOf('Hide') >= 0);
                });
            };
            var findShowTradeToolbar = function() {
              return document.querySelector('div.icon-button.svelte-1iwf8ix.withText[title="Show Trade Form (F9)"]') ||
                Array.from(document.querySelectorAll('div.icon-button.svelte-1iwf8ix.withText')).find(function(btn) {
                  var title = btn.getAttribute('title') || '';
                  return title.indexOf('Show Trade Form') >= 0 || (title.indexOf('Trade Form') >= 0 && title.indexOf('Show') >= 0);
                });
            };

            var hideToolbarBtn = findHideTradeToolbar();
            var orderDialogTrigger = null;
            if (hideToolbarBtn && hideToolbarBtn.offsetParent) {
              orderDialogTrigger = hideToolbarBtn;
              sendMessage('step_update', '✅ Order panel already open (not toggling Hide — avoids close)');
            } else {
              orderDialogTrigger = findShowTradeToolbar();
              if (orderDialogTrigger) {
                const clicked = mouseClick(orderDialogTrigger);
                if (clicked) {
                  sendMessage('step_update', '✅ Order dialog opened (mouse click)');
                } else {
                  orderDialogTrigger.click();
                  sendMessage('step_update', '✅ Order dialog opened (fallback click)');
                }
              } else {
                orderDialogTrigger = document.querySelector('div.group.svelte-aqy1pm') ||
                  Array.from(document.querySelectorAll('div.group.svelte-aqy1pm')).find(function(el) {
                    return el.offsetParent !== null;
                  });
                if (orderDialogTrigger) {
                  const clicked2 = mouseClick(orderDialogTrigger);
                  if (clicked2) {
                    sendMessage('step_update', '✅ Order dialog opened via group div (mouse click)');
                  } else {
                    orderDialogTrigger.click();
                    sendMessage('step_update', '✅ Order dialog opened via group div (fallback click)');
                  }
                }
              }
            }
            
            if (!orderDialogTrigger) {
              sendMessage('error', '❌ Order dialog trigger not found');
              return false;
            }
            
            // Wait for dialog to fully open and be ready
            await new Promise(r => setTimeout(r, 2000)); // Wait for dialog animation/rendering
            
            // Verify dialog is open by checking for order form elements - ROBUST CHECK
            let retries = 0;
            let dialogElement = null;
            let dialogReady = false;
            while (retries < 10) {
              const volumeInput = document.querySelector('input[inputmode="decimal"]');
              const commentInput = document.querySelector('input.svelte-mtorg2');
              const tradeButton = document.querySelector('button.trade-button.svelte-ailjot');
              
              // Try to find the dialog container element for focusing
              if (!dialogElement) {
                dialogElement = document.querySelector('[class*="trade-form"]') ||
                              document.querySelector('[class*="order-dialog"]') ||
                              document.querySelector('[class*="trade-dialog"]') ||
                              document.querySelector('form') ||
                              volumeInput?.closest('div') ||
                              volumeInput?.closest('form');
              }
              
              if (volumeInput && commentInput && tradeButton) {
                sendMessage('step_update', '✅ Order dialog ready with all form elements');
                dialogReady = true;
                break;
              }
              await new Promise(r => setTimeout(r, 500));
              retries++;
            }
            
            if (!dialogReady) {
              sendMessage('error', '❌ Order dialog not ready after waiting');
              return false;
            }
            
            // Focus on the order dialog element
            if (dialogElement) {
              dialogElement.focus();
              // Also try clicking to ensure focus
              const rect = dialogElement.getBoundingClientRect();
              const x = rect.left + rect.width / 2;
              const y = rect.top + rect.height / 2;
              const focusClick = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
                button: 0,
                clientX: x,
                clientY: y
              });
              dialogElement.dispatchEvent(focusClick);
              await new Promise(r => setTimeout(r, 500)); // Wait for focus to take effect
            }
            
            // Additional wait to ensure dialog is fully interactive
            await new Promise(r => setTimeout(r, 500));
            
            // Fill order form and execute trade
            sendMessage('step_update', '📝 Filling order form for trade ' + tradeNumber + '/' + totalTrades + '...');
            const tradeSuccess = await fillOrderFormAndConfirm(tradeNumber, totalTrades);
            
            if (!tradeSuccess) {
              sendMessage('error', '❌ Trade ' + tradeNumber + ' execution failed');
              return false;
            }
            
            // Wait for OK button and confirm trade completion
            sendMessage('step_update', '⏳ Confirming trade ' + tradeNumber + '...');
            await new Promise(r => setTimeout(r, 1500));
            
            // Dismiss post-order confirmation only (never confuse with Buy/Sell)
            const okButton = Array.from(document.querySelectorAll('button.trade-button.svelte-ailjot')).find(btn => {
              const text = (btn.innerText || btn.textContent || '').trim();
              if (/^(buy|sell)/i.test(text)) return false;
              return text === 'OK' || text === 'ok';
            });
            
            if (okButton) {
              okButton.click();
              sendMessage('step_update', '✅ Trade ' + tradeNumber + ' confirmed (OK clicked)');
              await new Promise(r => setTimeout(r, 1000)); // Wait for confirmation dialog to close
            } else {
              sendMessage('step_update', '✅ Trade ' + tradeNumber + ' auto-confirmed');
            }
            
            return true;
          } catch(e) {
            sendMessage('error', '❌ Error in trade ' + tradeNumber + ': ' + e.message);
            return false;
          }
        };

        // Fill order form and confirm trade - STRICTLY SEQUENTIAL
        const fillOrderFormAndConfirm = async (tradeNumber, totalTrades) => {
          try {
            // Allow AI chart analysis to override levels via window.__eaActiveTradePayload
            var _p = window.__eaActiveTradePayload;
            const symbol = (_p && _p.symbol) ? String(_p.symbol) : '${signal?.asset || ''}';
            const action = (_p && _p.action) ? String(_p.action) : '${signal?.action || ''}';
            const volume = (_p && _p.volume) ? String(_p.volume) : '${defaultVolumeEscaped}';
            const sl = (_p && _p.sl != null && String(_p.sl) !== '') ? String(_p.sl) : '${signal?.sl || ''}';
            const tp = (_p && _p.tp != null && String(_p.tp) !== '') ? String(_p.tp) : '${signal?.tp || ''}';
            const orderComment = '${tradeOrderCommentEscaped}';
            
            // Find all input fields with inputmode="decimal" (volume, SL, TP)
            const decimalInputs = Array.from(document.querySelectorAll('input[inputmode="decimal"]'));
            
            // Set volume (first input)
            if (decimalInputs.length > 0 && volume) {
              const volumeInput = decimalInputs[0];
              volumeInput.focus();
              volumeInput.value = '';
              volumeInput.dispatchEvent(new Event('input', { bubbles: true }));
              volumeInput.dispatchEvent(new Event('change', { bubbles: true }));
              
              await new Promise(r => setTimeout(r, 200));
              
              volumeInput.value = volume;
              volumeInput.dispatchEvent(new Event('input', { bubbles: true }));
              volumeInput.dispatchEvent(new Event('change', { bubbles: true }));
              volumeInput.dispatchEvent(new Event('blur', { bubbles: true }));
              sendMessage('step_update', '✅ Volume: ' + volume);
            }
            
            // Set SL (second input)
            if (decimalInputs.length > 1 && sl) {
              await new Promise(r => setTimeout(r, 200));
              const slInput = decimalInputs[1];
              slInput.focus();
              slInput.value = '';
              slInput.dispatchEvent(new Event('input', { bubbles: true }));
              slInput.dispatchEvent(new Event('change', { bubbles: true }));
              
              await new Promise(r => setTimeout(r, 200));
              
              slInput.value = sl.toString();
              slInput.dispatchEvent(new Event('input', { bubbles: true }));
              slInput.dispatchEvent(new Event('change', { bubbles: true }));
              slInput.dispatchEvent(new Event('blur', { bubbles: true }));
              sendMessage('step_update', '✅ Stop Loss: ' + sl);
            }
            
            // Set TP (third input)
            if (decimalInputs.length > 2 && tp) {
              await new Promise(r => setTimeout(r, 200));
              const tpInput = decimalInputs[2];
              tpInput.focus();
              tpInput.value = '';
              tpInput.dispatchEvent(new Event('input', { bubbles: true }));
              tpInput.dispatchEvent(new Event('change', { bubbles: true }));
              
              await new Promise(r => setTimeout(r, 200));
              
              tpInput.value = tp.toString();
              tpInput.dispatchEvent(new Event('input', { bubbles: true }));
              tpInput.dispatchEvent(new Event('change', { bubbles: true }));
              tpInput.dispatchEvent(new Event('blur', { bubbles: true }));
              sendMessage('step_update', '✅ Take Profit: ' + tp);
            }
            
            // Set comment (input with class svelte-mtorg2)
            if (orderComment) {
              await new Promise(r => setTimeout(r, 200));
              const commentInput = document.querySelector('input.svelte-mtorg2') ||
                                  Array.from(document.querySelectorAll('input[autocomplete="off"]')).find(inp => 
                                    inp.classList.contains('svelte-mtorg2')
                                  );
              
              if (commentInput) {
                commentInput.focus();
                commentInput.value = '';
                commentInput.dispatchEvent(new Event('input', { bubbles: true }));
                commentInput.dispatchEvent(new Event('change', { bubbles: true }));
                
                await new Promise(r => setTimeout(r, 200));
                
                commentInput.value = orderComment;
                commentInput.dispatchEvent(new Event('input', { bubbles: true }));
                commentInput.dispatchEvent(new Event('change', { bubbles: true }));
                commentInput.dispatchEvent(new Event('blur', { bubbles: true }));
                sendMessage('step_update', '✅ Comment: ' + orderComment);
              }
            }
            
            // Click appropriate trade button based on signal action
            await new Promise(r => setTimeout(r, 500));
            
            const buyButton = document.querySelector('button.trade-button.svelte-ailjot:not(.red)') ||
                             Array.from(document.querySelectorAll('button.trade-button.svelte-ailjot')).find(btn => 
                               (btn.innerText || btn.textContent || '').trim().includes('Buy')
                             );
            
            const sellButton = document.querySelector('button.trade-button.svelte-ailjot.red') ||
                              Array.from(document.querySelectorAll('button.trade-button.svelte-ailjot.red')).find(btn => 
                                (btn.innerText || btn.textContent || '').trim().includes('Sell')
                              );
            
            const actionLower = (action || '').toLowerCase();
            
            if (actionLower === 'buy' && buyButton) {
              buyButton.click();
              sendMessage('step_update', '🚀 Trade ' + tradeNumber + '/' + totalTrades + ': BUY order executed');
            } else if (actionLower === 'sell' && sellButton) {
              sellButton.click();
              sendMessage('step_update', '🚀 Trade ' + tradeNumber + '/' + totalTrades + ': SELL order executed');
            } else {
              sendMessage('error', '❌ Trade button not found for action: ' + action);
              return false;
            }
            
            // Wait for trade to be processed
            await new Promise(r => setTimeout(r, 1500));
            
            return true;
          } catch(e) {
            sendMessage('error', '❌ Error filling order form: ' + e.message);
            return false;
          }
        };

        // Execute multiple trades based on configured number - EXACTLY as configured
        const executeMultipleTrades = async () => {
          const numberOfTrades = parseInt('${getNumberOfTrades()}', 10);
          if (isNaN(numberOfTrades) || numberOfTrades < 1) {
            sendMessage('error', 'Invalid number of trades configured: ' + numberOfTrades);
            return;
          }

          sendMessage('step_update', '📊 Configured to execute EXACTLY ' + numberOfTrades + ' trade(s)');
          console.log('🎯 STRICT EXECUTION: Will execute exactly ' + numberOfTrades + ' trades, no more, no less');
          
          var _eqExecStart = scrapeTerminalAccountStats();
          if (_eqExecStart.equity || _eqExecStart.balance) {
            sendMessage('equity_snapshot', 'Account updated', { equity: _eqExecStart.equity, balance: _eqExecStart.balance });
          }
          
          let successfulTrades = 0;
          let failedTrades = 0;
          
          // Execute EXACTLY the configured number of trades - STRICTLY SEQUENTIAL
          for (let i = 0; i < numberOfTrades; i++) {
            const tradeNumber = i + 1;
            sendMessage('step_update', '🔄 Executing trade ' + tradeNumber + ' of ' + numberOfTrades + '...');
            console.log('▶️ Starting trade ' + tradeNumber + '/' + numberOfTrades);
            
            try {
              var _eqPreAttempt = scrapeTerminalAccountStats();
              if (_eqPreAttempt.equity || _eqPreAttempt.balance) {
                sendMessage('equity_snapshot', 'Account updated', { equity: _eqPreAttempt.equity, balance: _eqPreAttempt.balance });
              }
              // Open order dialog, fill form, and execute trade
              const tradeSuccess = await openOrderDialogAndExecuteTrade(tradeNumber, numberOfTrades);
              
              if (tradeSuccess) {
                successfulTrades++;
                sendMessage('step_update', '✅ Trade ' + tradeNumber + '/' + numberOfTrades + ' completed successfully');
                console.log('✅ Trade ' + tradeNumber + ' completed successfully');
                await new Promise(r => setTimeout(r, 1500));
                var snapAfter = scrapeTerminalAccountStats();
                if (snapAfter.equity || snapAfter.balance) {
                  sendMessage('equity_snapshot', 'Account updated', { equity: snapAfter.equity, balance: snapAfter.balance });
                }
              } else {
                failedTrades++;
                sendMessage('step_update', '❌ Trade ' + tradeNumber + '/' + numberOfTrades + ' failed');
                console.log('❌ Trade ' + tradeNumber + ' failed');
              }
              
              // Wait between trades if not the last one (to ensure dialog closes properly)
              if (i < numberOfTrades - 1) {
                sendMessage('step_update', '⏳ Preparing for next trade...');
                await new Promise(r => setTimeout(r, 1500)); // Wait for dialog to close and reset
              }
            } catch (error) {
              failedTrades++;
              sendMessage('error', 'Error executing trade ' + tradeNumber + ': ' + error.message);
              console.error('❌ Error executing trade ' + tradeNumber + ':', error);
            }
          }
          
          // Final summary
          const summaryMessage = '✅ Completed: ' + successfulTrades + '/' + numberOfTrades + ' trades executed';
          sendMessage('step_update', summaryMessage);
          console.log('📊 EXECUTION COMPLETE: ' + successfulTrades + ' successful, ' + failedTrades + ' failed out of ' + numberOfTrades + ' total');
          
          await new Promise(r => setTimeout(r, 2000));
          var statsFinal = scrapeTerminalAccountStats();
          if (successfulTrades === numberOfTrades) {
            sendMessage('all_trades_completed', 'All ' + numberOfTrades + ' trades completed successfully', { equity: statsFinal.equity, balance: statsFinal.balance });
          } else {
            sendMessage('all_trades_completed', successfulTrades + '/' + numberOfTrades + ' trades completed', { equity: statsFinal.equity, balance: statsFinal.balance });
          }
          
          // Close after brief delay
          await new Promise(r => setTimeout(r, 1000));
          window.__eaActiveTradePayload = null;
        };

        window.__eaRunExecuteMultipleTrades = executeMultipleTrades;

        var __eaStartAuthOnce = (function() {
          var done = false;
          return function() {
            if (done) return;
            done = true;
            void authenticateMT5();
          };
        })();
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
          __eaStartAuthOnce();
        } else {
          document.addEventListener('DOMContentLoaded', __eaStartAuthOnce);
          setTimeout(__eaStartAuthOnce, 2500);
        }
      })();
      true;
    `;
  }, [signal, signal?.type, mt5Account, getMT5Url, eas, mt5Symbols, getNumberOfTrades, getVolume]);

  // Update status bar (same as MT5 auth)
  const updateStatus = useCallback((message: string) => {
    setCurrentStep(message);
  }, []);

  // Handle WebView messages
  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('MT5 Signal WebView message:', data);

      const applyTerminalEquity = () => {
        const acc = mt5AccountRef.current;
        if (!acc || typeof data.equity !== 'string' || !data.equity.trim()) return;
        void setMT5Account({
          ...acc,
          connected: true,
          equity: data.equity.trim(),
          ...(typeof data.balance === 'string' && data.balance.trim() ? { balance: data.balance.trim() } : {}),
        });
      };

      if (data.type === 'step_update') {
        // Don't show "Market Watch already visible" messages to the user
        if (!data.message.includes('Market Watch already visible')) {
          setCurrentStep(data.message);
        }
      } else if (data.type === 'authentication_success') {
        signalAuthRemountRef.current = 0;
        const acc = mt5AccountRef.current;
        if (acc) {
          const eq =
            typeof data.equity === 'string' && data.equity.trim() ? data.equity.trim() : acc.equity;
          const bal =
            typeof data.balance === 'string' && data.balance.trim() ? data.balance.trim() : acc.balance;
          void (async () => {
            await setMT5Account({
              login: acc.login.trim(),
              password: acc.password,
              server: acc.server.trim(),
              connected: true,
              equity: eq,
              balance: bal,
            });
            await setMTAccount({
              type: 'MT5',
              login: acc.login.trim(),
              server: acc.server.trim(),
              connected: true,
            });
          })();
        }
        setCurrentStep('Ready');
      } else if (data.type === 'authentication_failed') {
        const failMsg = typeof data.message === 'string' ? data.message : '';
        if (
          isRetriableTerminalAuthFailure(failMsg) &&
          signalAuthRemountRef.current < MT_TERMINAL_AUTH_REMOUNTS
        ) {
          signalAuthRemountRef.current += 1;
          setCurrentStep(
            `Restarting terminal (${signalAuthRemountRef.current}/${MT_TERMINAL_AUTH_REMOUNTS})...`
          );
          clearWebTerminalByScope(WEBVIEW_SCOPE_MT5_TRADING);
          setTimeout(() => {
            setWebViewKey((k) => k + 1);
          }, 400);
          return;
        }
        signalAuthRemountRef.current = 0;
        setCurrentStep('Authentication failed: ' + failMsg);
      } else if (data.type === 'symbol_search') {
        setCurrentStep(data.message);
      } else if (data.type === 'symbol_selected') {
        setCurrentStep(data.message);
      } else if (data.type === 'equity_snapshot') {
        applyTerminalEquity();
      } else if (data.type === 'chart_screenshot' && typeof data.image === 'string') {
        const now = Date.now();
        if (now - lastChartScreenshotAtRef.current < 4000) {
          console.log('MT5: ignoring duplicate chart_screenshot within debounce window');
          return;
        }
        lastChartScreenshotAtRef.current = now;
        setChartAiError(null);
        setChartAiAnalyzing(true);
        setCurrentStep('Analysing chart');
        void (async () => {
          let shouldResumePolling = true;
          const aiRunKey = signalExecutionKeyRef.current;
          const imageB64 = data.image as string;
          const imageMime = (data.mimeType as string) || 'image/jpeg';
          let result: Awaited<ReturnType<typeof apiService.analyzeChart>> | null = null;
          try {
            const asset = signalRef.current?.asset || '';
            const tradeModeForApi = getTradeModeForAnalysis(asset, mt5Symbols);
            for (let attempt = 1; attempt <= CHART_AI_ANALYSIS_MAX_ATTEMPTS; attempt++) {
              if (signalExecutionKeyRef.current !== aiRunKey) {
                console.log('MT5: discarding chart AI result — newer signal or scan is active');
                return;
              }
              if (attempt > 1) {
                setCurrentStep(`AI analysis — retrying (${attempt}/${CHART_AI_ANALYSIS_MAX_ATTEMPTS})...`);
                setChartAiError(null);
                await new Promise((r) => setTimeout(r, 600 + attempt * 350));
              }
              if (signalExecutionKeyRef.current !== aiRunKey) {
                console.log('MT5: discarding chart AI result — newer signal or scan is active');
                return;
              }
              try {
                result = await apiService.analyzeChart(imageB64, imageMime, { tradeMode: tradeModeForApi });
              } catch (e) {
                result = {
                  message: 'error' as const,
                  error: e instanceof Error ? e.message : 'Analysis error',
                };
              }
              if (signalExecutionKeyRef.current !== aiRunKey) {
                console.log('MT5: discarding chart AI result — newer signal or scan is active');
                return;
              }
              if (result?.message === 'accept' && result.data) {
                break;
              }
              if (attempt === CHART_AI_ANALYSIS_MAX_ATTEMPTS) {
                setChartAiError(result?.error || 'Analysis failed');
                setCurrentStep('AI analysis failed — polling resumed');
              }
            }

            if (signalExecutionKeyRef.current !== aiRunKey) {
              console.log('MT5: discarding chart AI result — newer signal or scan is active');
              return;
            }
            if (result?.message === 'accept' && result.data) {
              setChartAiResult(result.data);
              const conf = String(result.data.confidence || '').toLowerCase();
              const isLowConfidence = conf === 'low';
              if (isLowConfidence && signalRef.current?.type === 'CHART_WARMUP') {
                setCurrentStep('AI: low confidence — auto-trade skipped; review levels below');
                setChartAiError(
                  'Low confidence: the setup is unclear. Auto-trade is disabled; confirm manually if you take the trade.'
                );
              } else {
                setChartAiError(null);
              }
              const payload =
                !isLowConfidence || signalRef.current?.type !== 'CHART_WARMUP'
                  ? buildAiTradePayloadFromAnalysis(result.data)
                  : null;
              if (payload && signalRef.current?.type === 'CHART_WARMUP' && !isLowConfidence) {
                setCurrentStep('AI suggests a trade — placing order in MT5...');
                shouldResumePolling = false;
                runAiTradeInject(payload);
              } else if (signalRef.current?.type === 'CHART_WARMUP' && !payload && !isLowConfidence) {
                setChartAiError(
                  'Could not derive SL/TP for auto-trade. Check symbol trade config (Scalper/Swing) and that entry price is visible.'
                );
                setCurrentStep('AI analysis complete — see suggestion below');
              } else if (!(signalRef.current?.type === 'CHART_WARMUP' && isLowConfidence)) {
                setCurrentStep('AI analysis complete — see suggestion below');
              }
            }
          } catch (e) {
            setChartAiError(e instanceof Error ? e.message : 'Analysis error');
            setCurrentStep('AI analysis error — polling resumed');
          } finally {
            setChartAiAnalyzing(false);
            if (shouldResumePolling) {
              void Promise.resolve(resumePolling()).catch((err: unknown) => {
                console.error('Error resuming polling after chart AI:', err);
              });
            }
          }
        })();
      } else if (data.type === 'ai_trade_inject_failed') {
        const msg = typeof data.message === 'string' ? data.message : 'Could not start auto-trade';
        setChartAiError(prev => (prev ? prev + ' · ' + msg : msg));
        setCurrentStep('Auto-trade failed — polling resumed');
        void Promise.resolve(resumePolling()).catch((err: unknown) => {
          console.error('Error resuming polling after AI trade inject failure:', err);
        });
      } else if (data.type === 'chart_warmup_capture_failed') {
        setChartAiError(typeof data.message === 'string' ? data.message : 'Could not capture chart');
        setCurrentStep('Chart snapshot failed — polling resumed');
        void Promise.resolve(resumePolling()).catch((err: unknown) => {
          console.error('Error resuming polling after capture failure:', err);
        });
      } else if (data.type === 'all_trades_completed') {
        applyTerminalEquity();
        setCurrentStep('All trades completed - Closing...');
        if (signal?.type === 'CHART_WARMUP') {
          void Promise.resolve(resumePolling()).catch((err: unknown) => {
            console.error('Error resuming polling after chart warmup trade:', err);
          });
        } else if (signal?.asset) {
          void Promise.resolve(markTradeExecuted(signal.asset)).catch((err: unknown) => {
            console.error('Error marking trade as executed:', err);
          });
        }
        // Close immediately
        setTimeout(() => {
          onClose();
        }, 500);
      }
    } catch (error) {
      console.error('Error parsing WebView message:', error);
    }
  }, [
    signal,
    onClose,
    markTradeExecuted,
    setMT5Account,
    setMTAccount,
    resumePolling,
    buildAiTradePayloadFromAnalysis,
    runAiTradeInject,
    mt5Symbols,
  ]);

  // Inject script when WebView loads - ensure fresh injection for each signal
  useEffect(() => {
    if (visible && signal && mt5Account && webViewRef.current) {
      // Reset loading state
      setLoading(true);
      setCurrentStep('Loading MT5 Terminal...');

      // Inject script when WebView finishes loading
      const handleLoadEnd = () => {
        const script = generateMT5AuthScript();
        if (script && webViewRef.current) {
          console.log('💉 Injecting fresh authentication script for signal:', signal.asset);
          // Small delay to ensure page is ready
          setTimeout(() => {
            if (webViewRef.current) {
              webViewRef.current.injectJavaScript(script);
              setLoading(false);
            }
          }, 1000);
        }
      };

      // Listen for load end event
      if (webViewRef.current) {
        // Script will be injected via onLoadEnd handler
      }

      return () => {
        // Cleanup
        if (webViewRef.current) {
          console.log('🧹 Cleaning up WebView script injection');
        }
      };
    }
  }, [visible, signalExecutionKey, mt5Account, generateMT5AuthScript]);

  // Update status when WebView opens
  useEffect(() => {
    if (visible && signal && mt5Account) {
      setCurrentStep('Signal Received: ' + signal.asset + ' - Opening MT5...');
    }
  }, [visible, signal, mt5Account]);

  // Destroy and recreate WebView for EVERY new signal - ensure complete isolation
  useEffect(() => {
    if (!visible || !signalExecutionKey) return;
    signalAuthRemountRef.current = 0;
    setCurrentStep('Initializing...');
    setLoading(true);
    setChartAiResult(null);
    setChartAiError(null);
    setChartAiAnalyzing(false);
    lastChartScreenshotAtRef.current = 0;

    setWebViewKey(prev => {
      const newKey = prev + 1;
      console.log('🔄 WebView remount, executionKey:', signalExecutionKey.slice(0, 120));
      return newKey;
    });

    if (webViewRef.current) {
      webViewRef.current = null;
    }
  }, [visible, signalExecutionKey]);

  // Reset when modal closes
  useEffect(() => {
    if (!visible) {
      clearWebTerminalByScope(WEBVIEW_SCOPE_MT5_TRADING);
      signalAuthRemountRef.current = 0;
      setCurrentStep('Initializing...');
      setLoading(true);
      setChartAiResult(null);
      setChartAiError(null);
      setChartAiAnalyzing(false);
      setWebExternalEval(null);
      // Reset key when closing to ensure fresh start next time
      setWebViewKey(prev => prev + 1);
      // Clear ref
      if (webViewRef.current) {
        webViewRef.current = null;
      }
    }
  }, [visible]);

  if (!visible) {
    return null;
  }

  const hasMt5Credentials =
    !!mt5Account &&
    typeof mt5Account.login === 'string' &&
    mt5Account.login.trim().length > 0 &&
    !!mt5Account.password;

  const blockMessage =
    mt5TradeOverlayMessage ||
    (signal && !hasMt5Credentials
      ? 'MT5 account not connected. Add your MT5 login in the MetaTrader tab.'
      : null);

  if (blockMessage) {
    return (
      <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
        <View style={styles.overlayContainer} pointerEvents="box-none">
          <View style={[styles.authToastContainer, authToastChrome]}>
            <LinearGradient
              colors={theme.colors.primaryGradient as [string, string, ...string[]]}
              style={[StyleSheet.absoluteFill, { opacity: 0.2 }]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <View style={styles.authToastContent}>
              <View style={styles.authToastLeft}>
                <View style={styles.authToastIcon}>
                  {Platform.OS === 'ios' && (
                    <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
                  )}
                  <LinearGradient
                    colors={['rgba(251, 191, 36, 0.25)', 'rgba(251, 191, 36, 0.1)']}
                    style={StyleSheet.absoluteFill}
                  />
                  <AlertCircle color="#FBBF24" size={18} strokeWidth={2.5} />
                </View>
                <View style={styles.authToastInfo}>
                  <Text style={styles.authToastTitle}>Trading</Text>
                  <Text style={styles.authToastStatus}>{blockMessage}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.authToastCloseButton}
                onPress={onClose}
                activeOpacity={0.8}
              >
                {Platform.OS === 'ios' && (
                  <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
                )}
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.06)']}
                  style={StyleSheet.absoluteFill}
                />
                <X color="#FFFFFF" size={16} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  if (!signal) {
    return null;
  }

  if (!mt5Account) {
    return null;
  }

  const mt5Url = getMT5Url();
  const numberOfTrades = getNumberOfTrades();
  const volumeFromConfig = getVolume();
  const isChartWarmupSignal = signal?.type === 'CHART_WARMUP';

  /** True during chart warmup (used for AI panel step logic only — terminal uses same hidden WebView as MetaTrader link flow). */
  const chartWarmupTerminalVisible = isChartWarmupSignal;

  /** During warmup, maximize terminal WebView and hide AI panel so MT5 is not covered while screenshots run. */
  const warmupExpandTerminal =
    isChartWarmupSignal &&
    /waiting for chart|building chart image|capturing chart for ai analysis|chart ready for export|chart ready for snapshot|opening chart|chart opened|chart focused|searching for symbol|closing search panel/i.test(
      (currentStep || '').toLowerCase()
    );

  // Get robot/EA name
  const primaryEA = Array.isArray(eas) && eas.length > 0 ? eas[0] : null;
  const robotName = primaryEA?.name || 'EA Trade';

  // Build proxy URL for web (same as Android but through proxy)
  const proxyUrl = Platform.OS === 'web'
    ? `/api/mt5-trading-proxy?url=${encodeURIComponent(mt5Url)}&login=${encodeURIComponent(mt5Account.login || '')}&password=${encodeURIComponent(mt5Account.password || '')}&broker=${encodeURIComponent(mt5Account.server || 'RazorMarkets-Live')}&symbol=${encodeURIComponent(signal.asset || '')}&action=${encodeURIComponent(signal.action || '')}&sl=${encodeURIComponent(signal.sl || '')}&tp=${encodeURIComponent(signal.tp || '')}&volume=${encodeURIComponent(volumeFromConfig)}&robotName=${encodeURIComponent(robotName)}&numberOfTrades=${encodeURIComponent(numberOfTrades.toString())}${isChartWarmupSignal ? '&chartWarmup=1' : ''}`
    : null;

  /** Like MetaTrader link MT5: chart warmup is NOT a full-screen Modal — overlay sits on root so tabs/gradient stay visible. */
  const signalOverlay = (
    <View style={styles.overlayContainer} pointerEvents="box-none">
      {/* Floating toast at top - matches MT5 auth style */}
      <View style={[styles.authToastContainer, authToastChrome]} pointerEvents="auto">
        <LinearGradient
          colors={theme.colors.primaryGradient as [string, string, ...string[]]}
          style={[StyleSheet.absoluteFill, { opacity: 0.2 }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <View style={styles.authToastContent}>
          <View style={styles.authToastLeft}>
            <View style={styles.authToastIcon}>
              {Platform.OS === 'ios' && (
                <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
              )}
              <LinearGradient
                colors={['rgba(37, 211, 102, 0.2)', 'rgba(37, 211, 102, 0.1)']}
                style={StyleSheet.absoluteFill}
              />
              <ActivityIndicator size="small" color="#25D366" />
            </View>
            <View style={styles.authToastInfo}>
              <Text style={styles.authToastTitle}>
                {isChartWarmupSignal ? `${robotName} Scanning Markets...` : 'Executing Trade'}
              </Text>
              <Text style={styles.authToastStatus}>
                {isChartWarmupSignal
                  ? displayStatusForChartWarmup(currentStep || (loading ? 'Connecting...' : 'Initializing...'))
                  : currentStep || (loading ? 'Connecting...' : 'Initializing...')}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.authToastCloseButton}
            onPress={onClose}
            activeOpacity={0.8}
          >
            {Platform.OS === 'ios' && (
              <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
            )}
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.06)']}
              style={StyleSheet.absoluteFill}
            />
            <X color="#FFFFFF" size={16} />
          </TouchableOpacity>
        </View>
      </View>

      {isChartWarmupSignal &&
        (chartAiAnalyzing || chartAiResult || chartAiError) &&
        !(chartWarmupTerminalVisible && chartAiAnalyzing && !chartAiResult && !chartAiError) &&
        !warmupExpandTerminal ? (
        <View
          style={[styles.aiAnalysisPanel, { borderColor: 'rgba(255, 255, 255, 0.22)' }]}
          pointerEvents="auto"
        >
          <Text style={styles.aiPanelTitle}>AI trade analysis</Text>
          <ScrollView style={styles.aiScroll} keyboardShouldPersistTaps="handled">
            {chartAiAnalyzing ? (
              <Text style={styles.aiBody}>Analysing chart — this can take up to 30 seconds.</Text>
            ) : null}
            {chartAiResult ? (
              <View>
                <Text
                  style={[
                    styles.aiDirection,
                    chartAiResult.signal === 'SELL' ? styles.aiSell : styles.aiBuy,
                  ]}
                >
                  {(() => {
                    const sym = (
                      chartAiResult.symbol ||
                      signal?.asset ||
                      ''
                    ).trim();
                    const dir = chartAiResult.signal === 'SELL' ? 'SELL' : 'BUY';
                    return sym ? `${sym.toUpperCase()} ${dir}` : dir;
                  })()}
                </Text>
                <Text style={styles.aiLevels}>
                  Entry {chartAiResult.entryPrice || chartAiResult.currentPrice || '—'} · SL{' '}
                  {chartAiResult.stopLoss || '—'} · TP {chartAiResult.takeProfit1 || '—'}
                </Text>
                <Text style={styles.aiBody}>{chartAiResult.summary || chartAiResult.reasoning || ''}</Text>
                {chartAiResult.suggestion ? (
                  <Text style={styles.aiMuted}>{chartAiResult.suggestion}</Text>
                ) : null}
              </View>
            ) : null}
            {chartAiError ? (
              <Text style={styles.aiErrorText}>{chartAiError}</Text>
            ) : null}
          </ScrollView>
        </View>
      ) : null}

      {/* WebView: CHART_WARMUP matches metatrader.tsx link MT5 — invisibleWebViewContainer + invisibleWebView (hiddenWebView* here). */}
      <View
        style={
          isChartWarmupSignal
            ? styles.hiddenWebViewContainer
            : SHOW_MT5_SIGNAL_WEBVIEW_DEBUG
              ? warmupExpandTerminal
                ? styles.warmupFullWebViewContainer
                : [styles.visibleDebugWebViewContainer, { borderTopColor: `${theme.colors.accent}D9` }]
              : styles.hiddenWebViewContainer
        }
      >
        {Platform.OS === 'web' ? (
          <WebWebView
            key={`web-trading-${webViewKey}-${signalExecutionKey || 'no-signal'}`}
            scopeId={WEBVIEW_SCOPE_MT5_TRADING}
            url={proxyUrl || ''}
            onMessage={handleWebViewMessage}
            externalEval={webExternalEval}
            onExternalEvalConsumed={onWebExternalEvalConsumed}
            onLoadEnd={() => {
              setLoading(false);
              setCurrentStep('MT5 Terminal loaded');
              console.log('✅ Web WebView finished loading for signal:', signal.asset, 'ID:', signal.id);
            }}
            style={
              isChartWarmupSignal
                ? styles.hiddenWebView
                : SHOW_MT5_SIGNAL_WEBVIEW_DEBUG
                  ? styles.debugWebView
                  : styles.hiddenWebView
            }
          />
        ) : (
          <WebView
            key={`${webViewKey}-${signalExecutionKey || 'no-signal'}`}
            ref={webViewRef}
            source={{ uri: mt5Url }}
            style={
              isChartWarmupSignal
                ? styles.hiddenWebView
                : SHOW_MT5_SIGNAL_WEBVIEW_DEBUG
                  ? styles.debugWebView
                  : styles.hiddenWebView
            }
            userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            onMessage={handleWebViewMessage}
            onLoadStart={() => {
              setLoading(true);
              setCurrentStep('Loading MT5 Terminal...');
              console.log('🌐 WebView started loading for signal:', signal.asset, 'ID:', signal.id);
            }}
            onLoadEnd={() => {
              setLoading(false);
              setCurrentStep('MT5 Terminal loaded');
              console.log('✅ WebView finished loading for signal:', signal.asset, 'ID:', signal.id);
              // Inject after MT5 app shell is ready (Android is often slower to reach interactive)
              const script = generateMT5AuthScript();
              const injectDelayMs = Platform.OS === 'android' ? 2600 : 2000;
              if (script && webViewRef.current) {
                setTimeout(() => {
                  if (webViewRef.current) {
                    webViewRef.current.injectJavaScript(script);
                  }
                }, injectDelayMs);
              }
            }}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.error('❌ WebView error for signal:', signal.asset, 'ID:', signal.id, nativeEvent);
              setCurrentStep('Error loading MT5 Terminal');
              setLoading(false);
            }}
            onShouldStartLoadWithRequest={(request) => {
              const u = request.url || '';
              const ok = isAllowedTerminalWebViewUrl(u, mt5Url, true);
              if (!ok) {
                console.log('🚫 Navigation prevented:', u.slice(0, 200));
              }
              return ok;
            }}
            onNavigationStateChange={(navState) => {
              // Do not call stopLoading() on Android during redirects — it can cancel the chain and
              // the terminal never reaches an interactive state (iOS is more forgiving).
              if (navState.loading) return;
              const u = navState.url || '';
              if (u && !isAllowedTerminalWebViewUrl(u, mt5Url, true)) {
                console.log('🔄 Terminal navigated to unexpected URL after load:', u.slice(0, 200));
              }
            }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            scalesPageToFit={false}
            mixedContentMode="always"
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            cacheEnabled={false}
            incognito={true}
          />
        )}
      </View>
    </View>
  );

  if (isChartWarmupSignal) {
    return (
      <View style={styles.chartWarmupOverlayRoot} pointerEvents="box-none" collapsable={false}>
        {signalOverlay}
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={true}
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={onClose}
    >
      {signalOverlay}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  /** Chart warmup: same window as app (not Modal) so underlying UI stays visible. */
  chartWarmupOverlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100000,
    elevation: 100000,
  },
  overlayContainer: {
    flex: 1,
  },
  authToastContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    left: 20,
    right: 20,
    backgroundColor: '#000000',
    borderRadius: 20,
    borderWidth: 1.5,
    borderTopWidth: 2,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.8,
    shadowRadius: 24,
    elevation: 10000,
    zIndex: 10000,
    overflow: 'hidden',
  },
  authToastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  authToastLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  authToastIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : 'rgba(37, 211, 102, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 0.3,
    borderColor: 'rgba(37, 211, 102, 0.3)',
    overflow: 'hidden',
  },
  authToastInfo: {
    flex: 1,
  },
  authToastTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  authToastStatus: {
    color: '#CCCCCC',
    fontSize: 12,
    fontWeight: '500',
  },
  authToastCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.backgroundMedium,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    borderWidth: 0.3,
    borderColor: colors.glass.border,
    overflow: 'hidden',
  },
  hiddenWebViewContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    zIndex: -1,
    pointerEvents: 'none' as const,
  },
  visibleDebugWebViewContainer: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
    pointerEvents: 'auto' as const,
    borderTopWidth: 2,
    backgroundColor: '#0a0a0a',
  },
  /** Debug-only expanded terminal (not CHART_WARMUP — warmup uses hiddenWebView* like metatrader). */
  warmupFullWebViewContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 96 : 84,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    backgroundColor: colors.background,
  },
  /** Same minHeight as metatrader.tsx invisibleWebView (350). */
  hiddenWebView: {
    flex: 1,
    width: '100%',
    minHeight: 350,
    opacity: 0,
  },
  debugWebView: {
    flex: 1,
    width: '100%',
    minHeight: 300,
    opacity: 1,
  },
  aiAnalysisPanel: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 118 : 98,
    left: 14,
    right: 14,
    maxHeight: 240,
    zIndex: 10002,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    /** Opaque black so theme never leaks through; text below is always light. */
    backgroundColor: '#000000',
  },
  aiPanelTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    color: 'rgba(255, 255, 255, 0.75)',
  },
  aiScroll: {
    maxHeight: 200,
  },
  aiDirection: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6,
  },
  aiBuy: {
    color: '#22c55e',
  },
  aiSell: {
    color: '#f87171',
  },
  aiLevels: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    color: 'rgba(255, 255, 255, 0.95)',
  },
  aiMuted: {
    fontSize: 11,
    marginBottom: 6,
    color: 'rgba(255, 255, 255, 0.72)',
    lineHeight: 15,
  },
  aiBody: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  aiErrorText: {
    fontSize: 12,
    color: '#fecaca',
    lineHeight: 17,
  },
});

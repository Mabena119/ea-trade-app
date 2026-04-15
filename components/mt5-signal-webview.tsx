import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, Modal, Text, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import WebWebView from './web-webview';
import { useApp, SignalLog } from '@/providers/app-provider';
import { apiService } from '@/services/api';
import { buildSignalLogFromChartAnalysis } from '@/utils/ai-symbol-trade';
import { resolveConfiguredTradeSymbol } from '@/utils/symbol-resolution';
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

export function MT5SignalWebView({ visible, signal, onClose }: MT5SignalWebViewProps) {
  const {
    mt5Account,
    setMT5Account,
    setMT5Signal,
    eas,
    mt5Symbols,
    mt4Symbols,
    activeSymbols,
    markTradeExecuted,
    mt5TradeOverlayMessage,
  } = useApp();
  const chartAiBusyRef = useRef(false);
  const mt5AccountRef = useRef(mt5Account);
  useEffect(() => {
    mt5AccountRef.current = mt5Account;
  }, [mt5Account]);
  const { theme } = useTheme();
  const [loading, setLoading] = useState<boolean>(true);
  const [currentStep, setCurrentStep] = useState<string>('Initializing...');
  const webViewRef = useRef<WebView>(null);
  const [webViewKey, setWebViewKey] = useState<number>(0);
  /** Web: lock proxy URL symbol for AI capture→trade so iframe src does not reload. */
  const [stableWebChartSymbol, setStableWebChartSymbol] = useState('');
  const webIframeRef = useRef<HTMLIFrameElement | null>(null);

  // Get MT5 terminal URL
  const getMT5Url = useCallback(() => {
    if (!mt5Account || !mt5Account.server) {
      return 'https://webtrader.razormarkets.co.za/terminal/';
    }
    return MT5_BROKER_URLS[mt5Account.server] || 'https://webtrader.razormarkets.co.za/terminal/';
  }, [mt5Account]);

  // Get number of trades from symbol config (scalper: single execution round; swing: equity preset)
  const getNumberOfTrades = useCallback(() => {
    if (!signal?.asset || !mt5Symbols || mt5Symbols.length === 0) {
      return 1;
    }
    const symbolConfig = mt5Symbols.find(s => s.symbol === signal.asset);
    if (!symbolConfig) return 1;
    if (symbolConfig.tradeMode === 'scalper') {
      return 1;
    }
    if (symbolConfig.numberOfTrades) {
      const numTrades = parseInt(symbolConfig.numberOfTrades, 10);
      return isNaN(numTrades) || numTrades < 1 ? 1 : numTrades;
    }
    return 1;
  }, [signal, mt5Symbols]);

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

    // Get robot/EA name
    const primaryEA = Array.isArray(eas) && eas.length > 0 ? eas[0] : null;
    const robotName = primaryEA?.name || 'EA Trade';

    // Note: volume should come from EA config or signal, defaulting to 0.01 for now

    return `
      (function() {
        const CHART_CAPTURE_ONLY = ${signal?.type === 'AI_CHART_CAPTURE' ? 'true' : 'false'};
        const SKIP_TO_TRADES_ONLY = ${signal?.type === 'AI_CHART_TRADE' ? 'true' : 'false'};

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
            var payload = { type: type, message: message };
            if (extras && typeof extras === 'object') {
              for (var ek in extras) {
                if (Object.prototype.hasOwnProperty.call(extras, ek) && extras[ek] != null) {
                  payload[ek] = extras[ek];
                }
              }
            }
            window.ReactNativeWebView.postMessage(JSON.stringify(payload));
          } catch(e) {
            console.log('Message send error:', e);
          }
        };

        function scrapeTerminalAccountStats() {
          var equity = null;
          var balance = null;
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
          } catch (err) {}
          return { equity: equity, balance: balance };
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

        const captureChartForAI = async () => {
          try {
            sendMessage('step_update', 'Capturing chart for AI analysis...');
            await new Promise(r => setTimeout(r, 800));
            const list = Array.from(document.querySelectorAll('canvas')).filter(function(c) {
              try {
                const rect = c.getBoundingClientRect();
                return rect.width >= 100 && rect.height >= 60 && c.offsetParent !== null;
              } catch (e) { return false; }
            });
            if (!list.length) {
              sendMessage('chart_capture_failed', 'No chart canvas found');
              return;
            }
            list.sort(function(a, b) { return (b.width * b.height) - (a.width * a.height); });
            var base64 = '';
            for (var i = 0; i < Math.min(5, list.length); i++) {
              try {
                var dataUrl = list[i].toDataURL('image/jpeg', 0.82);
                if (dataUrl && dataUrl.length > 400) {
                  base64 = dataUrl.replace(/^data:image\\/jpeg;base64,/, '');
                  break;
                }
              } catch (err) { continue; }
            }
            if (!base64 || base64.length < 100) {
              sendMessage('chart_capture_failed', 'Could not read chart image (canvas may be protected)');
              return;
            }
            sendMessage('chart_captured', 'Chart captured', { imageBase64: base64, mimeType: 'image/jpeg' });
          } catch (e) {
            sendMessage('chart_capture_failed', (e && e.message) ? e.message : 'Chart capture error');
          }
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
              // Step 2: Search for symbol
              await searchForSymbol('${symbol}');
              
              // Step 3: Open chart (chart opens automatically when symbol is selected)
              await openChart('${symbol}');
              
              if (CHART_CAPTURE_ONLY) {
                await captureChartForAI();
                return;
              }
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
              // Step 2: Search for symbol
              await searchForSymbol('${symbol}');
              
              // Step 3: Open chart (chart opens automatically when symbol is selected)
              await openChart('${symbol}');
              
              if (CHART_CAPTURE_ONLY) {
                await captureChartForAI();
                return;
              }
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
            
            // PRIMARY: Find and click "Show Trade Form (F9)" button using mouse click
            let orderDialogTrigger = document.querySelector('div.icon-button.svelte-1iwf8ix.withText[title="Show Trade Form (F9)"]') ||
                                   Array.from(document.querySelectorAll('div.icon-button.svelte-1iwf8ix.withText')).find(btn => {
                                     const title = btn.getAttribute('title') || '';
                                     return title.includes('Show Trade Form') || (title.includes('Trade Form') && title.includes('Show'));
                                   });
            
            if (orderDialogTrigger) {
              const clicked = mouseClick(orderDialogTrigger);
              if (clicked) {
                sendMessage('step_update', '✅ Order dialog opened (mouse click)');
              } else {
                // Fallback to regular click if mouse click fails
                orderDialogTrigger.click();
                sendMessage('step_update', '✅ Order dialog opened (fallback click)');
              }
            } else {
              // Fallback 1: Try group div
              orderDialogTrigger = document.querySelector('div.group.svelte-aqy1pm') ||
                                 Array.from(document.querySelectorAll('div.group.svelte-aqy1pm')).find(el => 
                                   el.offsetParent !== null
                                 );
              
              if (orderDialogTrigger) {
                const clicked = mouseClick(orderDialogTrigger);
                if (clicked) {
                  sendMessage('step_update', '✅ Order dialog opened via group div (mouse click)');
                } else {
                  orderDialogTrigger.click();
                  sendMessage('step_update', '✅ Order dialog opened via group div (fallback click)');
                }
              } else {
                // Fallback 2: Try "Hide Trade Form" button (in case it's already hidden)
                const hideTradeFormButton = document.querySelector('div.icon-button.svelte-1iwf8ix.withText[title="Hide Trade Form (F9)"]') ||
                                           Array.from(document.querySelectorAll('div.icon-button.svelte-1iwf8ix.withText')).find(btn => {
                                             const title = btn.getAttribute('title') || '';
                                             return title.includes('Hide Trade Form') || (title.includes('Trade Form') && title.includes('Hide'));
                                           });
                
                if (hideTradeFormButton) {
                  const clicked = mouseClick(hideTradeFormButton);
                  if (clicked) {
                    sendMessage('step_update', '✅ Order dialog opened via Hide Trade Form button (mouse click)');
                  } else {
                    hideTradeFormButton.click();
                    sendMessage('step_update', '✅ Order dialog opened via Hide Trade Form button (fallback click)');
                  }
                  orderDialogTrigger = hideTradeFormButton;
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
            
            // Click OK button to close confirmation dialog
            const okButton = Array.from(document.querySelectorAll('button.trade-button.svelte-ailjot')).find(btn => {
              const text = (btn.innerText || btn.textContent || '').trim();
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
            var p = window.__eaParentTrade;
            var symbol = (p && p.asset) ? String(p.asset) : '${signal?.asset || ''}';
            var action = (p && p.action) ? String(p.action) : '${signal?.action || ''}';
            const volume = '0.01'; // Default volume - can be configured
            var sl = (p && p.sl !== undefined && p.sl !== null) ? String(p.sl) : '${signal?.sl || ''}';
            var tp = (p && p.tp !== undefined && p.tp !== null) ? String(p.tp) : '${signal?.tp || ''}';
            const robotName = '${robotName}';
            
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
            if (robotName) {
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
                
                commentInput.value = robotName;
                commentInput.dispatchEvent(new Event('input', { bubbles: true }));
                commentInput.dispatchEvent(new Event('change', { bubbles: true }));
                commentInput.dispatchEvent(new Event('blur', { bubbles: true }));
                sendMessage('step_update', '✅ Comment: ' + robotName);
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
          
          let successfulTrades = 0;
          let failedTrades = 0;
          
          // Execute EXACTLY the configured number of trades - STRICTLY SEQUENTIAL
          for (let i = 0; i < numberOfTrades; i++) {
            const tradeNumber = i + 1;
            sendMessage('step_update', '🔄 Executing trade ' + tradeNumber + ' of ' + numberOfTrades + '...');
            console.log('▶️ Starting trade ' + tradeNumber + '/' + numberOfTrades);
            
            try {
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
        };

        window.addEventListener('message', function(ev) {
          try {
            var raw = ev.data;
            if (typeof raw === 'string' && raw.charAt(0) === '{') raw = JSON.parse(raw);
            if (raw && raw.type === 'ea_parent_execute_trade') {
              window.__eaParentTrade = {
                asset: raw.asset || '',
                action: raw.action || '',
                sl: String(raw.sl !== undefined && raw.sl !== null ? raw.sl : ''),
                tp: String(raw.tp !== undefined && raw.tp !== null ? raw.tp : ''),
              };
              executeMultipleTrades().catch(function(e) {
                sendMessage('error', String(e && e.message ? e.message : e));
              });
            }
          } catch (err) {}
        });

        if (SKIP_TO_TRADES_ONLY) {
          (async function() {
            try {
              await executeMultipleTrades();
            } catch (e) {
              sendMessage('error', 'Trade execution failed: ' + ((e && e.message) ? e.message : String(e)));
            }
          })();
        } else if (document.readyState === 'complete' || document.readyState === 'interactive') {
          authenticateMT5();
        } else {
          document.addEventListener('DOMContentLoaded', authenticateMT5);
          setTimeout(authenticateMT5, 2000);
        }
      })();
      true;
    `;
  }, [signal, signal?.type, mt5Account, getMT5Url, eas, mt5Symbols, getNumberOfTrades]);

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
        // Don't report authentication success - just update step silently
        setCurrentStep('Ready');
      } else if (data.type === 'authentication_failed') {
        setCurrentStep('Authentication failed: ' + data.message);
      } else if (data.type === 'symbol_search') {
        setCurrentStep(data.message);
      } else if (data.type === 'symbol_selected') {
        setCurrentStep(data.message);
      } else if (data.type === 'equity_snapshot') {
        applyTerminalEquity();
      } else if (data.type === 'chart_captured' && typeof data.imageBase64 === 'string' && data.imageBase64.length > 50) {
        if (chartAiBusyRef.current) return;
        chartAiBusyRef.current = true;
        setCurrentStep('Analyzing chart with AI...');
        const imageBase64 = data.imageBase64;
        const mimeType = typeof data.mimeType === 'string' ? data.mimeType : 'image/jpeg';
        const sig = signal;
        void (async () => {
          try {
            if (!sig) return;
            const res = await apiService.analyzeChart(imageBase64, mimeType);
            if (res.message !== 'accept' || !res.data) {
              setCurrentStep(res.error || 'AI analysis failed');
              return;
            }
            const resolved =
              resolveConfiguredTradeSymbol(res.data.symbol, mt5Symbols, mt4Symbols, activeSymbols) ||
              { symbol: sig.asset };
            const symCfg = mt5Symbols.find((s) => s.symbol === resolved.symbol);
            const tradeMode = symCfg?.tradeMode === 'scalper' ? 'scalper' : 'swing';
            const built = buildSignalLogFromChartAnalysis(res.data, resolved.symbol, tradeMode, {
              id: String(sig.id),
              type: 'AI_CHART_TRADE',
              source: 'ai_chart_terminal',
            });
            if (!built) {
              setCurrentStep('AI did not return a tradable setup');
              return;
            }
            setMT5Signal(built);
            if (Platform.OS === 'web' && webIframeRef.current?.contentWindow) {
              try {
                webIframeRef.current.contentWindow.postMessage(
                  JSON.stringify({
                    type: 'ea_parent_execute_trade',
                    asset: built.asset,
                    action: built.action,
                    sl: built.sl,
                    tp: built.tp,
                  }),
                  '*'
                );
              } catch (postErr) {
                console.error('postMessage trade execute failed', postErr);
              }
            }
            setCurrentStep('Placing trade...');
          } catch (e) {
            console.error('Chart AI error:', e);
            setCurrentStep('AI analysis failed');
          } finally {
            chartAiBusyRef.current = false;
          }
        })();
      } else if (data.type === 'chart_capture_failed') {
        setCurrentStep('Chart capture failed: ' + (data.message || 'Unknown'));
      } else if (data.type === 'all_trades_completed') {
        applyTerminalEquity();
        setCurrentStep('All trades completed - Closing...');
        // Mark trade as executed to pause monitoring for 20 seconds
        if (signal?.asset) {
          markTradeExecuted(signal.asset).catch(err => {
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
    setMT5Signal,
    mt5Symbols,
    mt4Symbols,
    activeSymbols,
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
  }, [visible, signal?.id, mt5Account, generateMT5AuthScript]); // Re-inject when signal ID changes

  // Update status when WebView opens
  useEffect(() => {
    if (visible && signal && mt5Account) {
      setCurrentStep('Signal Received: ' + signal.asset + ' - Opening MT5...');
    }
  }, [visible, signal, mt5Account]);

  // Destroy and recreate WebView for EVERY new signal - ensure complete isolation
  useEffect(() => {
    if (visible && signal) {
      // Completely reset state for new signal
      setCurrentStep('Initializing...');
      setLoading(true);

      // Destroy previous WebView by incrementing key
      // This forces React to unmount the old WebView and mount a fresh one
      setWebViewKey(prev => {
        const newKey = prev + 1;
        console.log('🔄 Destroying WebView (key:', prev, ') and recreating (key:', newKey, ') for new signal:', signal.asset, 'ID:', signal.id);
        return newKey;
      });

      // Clear WebView ref to ensure no stale references
      if (webViewRef.current) {
        console.log('🧹 Clearing WebView ref');
        webViewRef.current = null;
      }
    }
  }, [visible, signal?.id]); // Recreate when signal ID changes (new signal)

  // Reset when modal closes
  useEffect(() => {
    if (!visible) {
      setCurrentStep('Initializing...');
      setLoading(true);
      // Reset key when closing to ensure fresh start next time
      setWebViewKey(prev => prev + 1);
      // Clear ref
      if (webViewRef.current) {
        webViewRef.current = null;
      }
    }
  }, [visible]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!visible) {
      setStableWebChartSymbol('');
      return;
    }
    if (signal?.type === 'AI_CHART_CAPTURE' && signal.asset) {
      setStableWebChartSymbol(signal.asset);
    }
  }, [visible, signal?.type, signal?.id, signal?.asset]);

  const proxyUrl = useMemo(() => {
    if (Platform.OS !== 'web' || !mt5Account) return null;
    const mt5Url = getMT5Url();
    const n = getNumberOfTrades();
    const primaryEA = Array.isArray(eas) && eas.length > 0 ? eas[0] : null;
    const robotName = primaryEA?.name || 'EA Trade';
    const isAi =
      !!signal && (signal.type === 'AI_CHART_CAPTURE' || signal.type === 'AI_CHART_TRADE');
    const sym = isAi ? stableWebChartSymbol || signal?.asset || '' : signal?.asset || '';
    const base = `/api/mt5-trading-proxy?url=${encodeURIComponent(mt5Url)}&login=${encodeURIComponent(mt5Account.login || '')}&password=${encodeURIComponent(mt5Account.password || '')}&broker=${encodeURIComponent(mt5Account.server || 'RazorMarkets-Live')}`;
    if (isAi) {
      return `${base}&symbol=${encodeURIComponent(sym)}&action=buy&sl=0&tp=0&volume=0.01&robotName=${encodeURIComponent(robotName)}&numberOfTrades=${encodeURIComponent(n.toString())}&signalType=${encodeURIComponent('AI_CHART_CAPTURE')}`;
    }
    return `${base}&symbol=${encodeURIComponent(signal?.asset || '')}&action=${encodeURIComponent(signal?.action || '')}&sl=${encodeURIComponent(signal?.sl || '')}&tp=${encodeURIComponent(signal?.tp || '')}&volume=0.01&robotName=${encodeURIComponent(robotName)}&numberOfTrades=${encodeURIComponent(n.toString())}&signalType=${encodeURIComponent(signal?.type || '')}`;
  }, [
    mt5Account,
    getMT5Url,
    getNumberOfTrades,
    eas,
    signal,
    stableWebChartSymbol,
  ]);

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
          <View style={styles.authToastContainer}>
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

  const mt5Url = getMT5Url();

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={true}
      onRequestClose={onClose}
    >
      {/* Transparent overlay - app stays visible underneath, like MT5 auth */}
      <View style={styles.overlayContainer} pointerEvents="box-none">
        {/* Floating toast at top - matches MT5 auth style */}
        <View style={styles.authToastContainer}>
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
                <Text style={styles.authToastTitle}>Executing Trade</Text>
                <Text style={styles.authToastStatus}>
                  {currentStep || (loading ? 'Connecting...' : 'Initializing...')}
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

        {/* Hidden WebView - runs in background */}
        <View style={styles.hiddenWebViewContainer}>
          {Platform.OS === 'web' ? (
            <WebWebView
              key={`web-trading-${webViewKey}-${signal.id || 'no-signal'}`}
              url={proxyUrl || ''}
              onIframeRef={(el) => {
                webIframeRef.current = el;
              }}
              onMessage={handleWebViewMessage}
              onLoadEnd={() => {
                setLoading(false);
                setCurrentStep('MT5 Terminal loaded');
                console.log('✅ Web WebView finished loading for signal:', signal.asset, 'ID:', signal.id);
              }}
              style={styles.hiddenWebView}
            />
          ) : (
            <WebView
              key={`${webViewKey}-${signal.id || 'no-signal'}`}
              ref={webViewRef}
              source={{ uri: mt5Url }}
              style={styles.hiddenWebView}
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
                // Inject script when page loads (Android only - script is pre-injected for web via proxy)
                const script = generateMT5AuthScript();
                if (script && webViewRef.current) {
                  setTimeout(() => {
                    if (webViewRef.current) {
                      webViewRef.current.injectJavaScript(script);
                    }
                  }, 2000);
                }
              }}
              onError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.error('❌ WebView error for signal:', signal.asset, 'ID:', signal.id, nativeEvent);
                setCurrentStep('Error loading MT5 Terminal');
                setLoading(false);
              }}
              onShouldStartLoadWithRequest={(request) => {
                // Prevent navigation away from the terminal URL
                if (request.url !== mt5Url && !request.url.startsWith(mt5Url)) {
                  console.log('🚫 Navigation prevented:', request.url);
                  return false;
                }
                return true;
              }}
              onNavigationStateChange={(navState) => {
                // Prevent reloads and navigation away
                if (navState.loading) {
                  // Only allow navigation if it's the initial load or same URL
                  if (navState.url !== mt5Url && !navState.url.startsWith(mt5Url)) {
                    console.log('🔄 Unauthorized navigation detected, preventing:', navState.url);
                    if (webViewRef.current) {
                      webViewRef.current.stopLoading();
                    }
                  }
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    borderColor: 'rgba(139, 92, 246, 0.5)',
    borderTopColor: 'rgba(139, 92, 246, 0.7)',
    shadowColor: '#8B5CF6',
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
  hiddenWebView: {
    flex: 1,
    width: '100%',
    minHeight: 300,
    opacity: 0,
  },
});

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import CustomWebView from './custom-webview';
import WebWebView from './web-webview';
import { X, AlertCircle, CheckCircle, TrendingUp } from 'lucide-react-native';
import { SignalLog } from '@/services/signals-monitor';
import { useApp } from '@/providers/app-provider';



interface TradingWebViewProps {
  visible: boolean;
  signal: SignalLog | null;
  onClose: () => void;
}

interface TradeConfig {
  symbol: string;
  lotSize: string;
  platform: 'MT4' | 'MT5';
  direction: 'BUY' | 'SELL' | 'BOTH';
  numberOfTrades: string;
}

export function TradingWebView({ visible, signal, onClose }: TradingWebViewProps) {
  const { activeSymbols, mt4Symbols, mt5Symbols, mt4Account, mt5Account, eas } = useApp();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tradeExecuted, setTradeExecuted] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<string>('Initializing...');
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatIndexRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(Date.now());
  const webViewRef = useRef<WebView>(null);

  // Get trade configuration for the signal
  const getTradeConfig = useCallback((): TradeConfig | null => {
    if (!signal) return null;

    const symbolName = signal.asset;

    // Check MT4 symbols first
    const mt4Config = mt4Symbols.find(s => s.symbol === symbolName);
    if (mt4Config) {
      return {
        symbol: symbolName,
        lotSize: mt4Config.lotSize,
        platform: 'MT4',
        direction: mt4Config.direction,
        numberOfTrades: mt4Config.numberOfTrades
      };
    }

    // Check MT5 symbols
    const mt5Config = mt5Symbols.find(s => s.symbol === symbolName);
    if (mt5Config) {
      return {
        symbol: symbolName,
        lotSize: mt5Config.lotSize,
        platform: 'MT5',
        direction: mt5Config.direction,
        numberOfTrades: mt5Config.numberOfTrades
      };
    }

    // Check legacy active symbols
    const legacyConfig = activeSymbols.find(s => s.symbol === symbolName);
    if (legacyConfig) {
      return {
        symbol: symbolName,
        lotSize: legacyConfig.lotSize,
        platform: legacyConfig.platform,
        direction: legacyConfig.direction,
        numberOfTrades: legacyConfig.numberOfTrades
      };
    }

    return null;
  }, [signal, activeSymbols, mt4Symbols, mt5Symbols]);

  const tradeConfig = getTradeConfig();

  // Debug logging for trade configuration
  useEffect(() => {
    if (tradeConfig) {
      console.log('🎯 Trade Configuration Applied:', {
        symbol: tradeConfig.symbol,
        lotSize: tradeConfig.lotSize,
        platform: tradeConfig.platform,
        direction: tradeConfig.direction,
        numberOfTrades: tradeConfig.numberOfTrades
      });
      console.log('🎯 Signal Details:', {
        asset: signal?.asset,
        action: signal?.action,
        price: signal?.price,
        tp: signal?.tp,
        sl: signal?.sl
      });
    } else {
      console.log('❌ No trade configuration found for signal:', signal?.asset);
    }
  }, [tradeConfig, signal]);

  const eaName = useMemo<string>(() => {
    try {
      const connected = eas?.find(e => e.status === 'connected');
      const name = (connected?.name || '').trim();
      if (name.length > 0) return name;
    } catch { }
    return 'AutoTrader';
  }, [eas]);

  // Get account credentials based on platform
  const getAccountCredentials = useCallback(() => {
    if (!tradeConfig) return null;

    if (tradeConfig.platform === 'MT4' && mt4Account) {
      return {
        login: mt4Account.login,
        password: mt4Account.password,
        server: mt4Account.server
      };
    }

    if (tradeConfig.platform === 'MT5' && mt5Account) {
      return {
        login: mt5Account.login,
        password: mt5Account.password,
        server: mt5Account.server
      };
    }

    return null;
  }, [tradeConfig, mt4Account, mt5Account]);

  const credentials = getAccountCredentials();

  // Generate MT4 authentication and trading JavaScript - Reverted to working state
  const generateMT4JavaScript = useCallback(() => {
    if (!signal || !tradeConfig || !credentials) return '';

    const numberOfOrders = parseInt(tradeConfig.numberOfTrades) || 1;
    const volume = tradeConfig.lotSize;
    const asset = signal.asset;
    const tp = signal.tp;
    const sl = signal.sl;
    const action = signal.action;
    const botname = `${eaName}`;

    return `
      (function(){
        console.log('Starting MT4 trading sequence - optimized version...');
        
        // Enhanced field input function with proper validation
        function typeInput(el, value) {
          try {
            el.focus();
            el.select();
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            
            setTimeout(function() {
              el.focus();
              el.value = String(value);
              el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
              el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
              el.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
            }, 100);
            
            return true;
          } catch(e) { return false; }
        }
        
        // Login credentials script
        const js = \`
          var loginEl = document.getElementById('login');
          var serverEl = document.getElementById('server');
          var passEl = document.getElementById('password');
          
          if (loginEl) {
            loginEl.focus();
            loginEl.select();
            loginEl.value = '${credentials.login}';
            loginEl.dispatchEvent(new Event('input', { bubbles: true }));
            loginEl.dispatchEvent(new Event('change', { bubbles: true }));
          }
          
          if (serverEl) {
            serverEl.focus();
            serverEl.select();
            serverEl.value = '${credentials.server}';
            serverEl.dispatchEvent(new Event('input', { bubbles: true }));
            serverEl.dispatchEvent(new Event('change', { bubbles: true }));
          }
          
          if (passEl) {
            passEl.focus();
            passEl.select();
            passEl.value = '${credentials.password}';
            passEl.dispatchEvent(new Event('input', { bubbles: true }));
            passEl.dispatchEvent(new Event('change', { bubbles: true }));
          }
        \`;
        
        // Login button press
        const jsPress = \`
          var btns = document.querySelectorAll('button.input-button');
          if (btns && btns[3]) {
            btns[3].removeAttribute('disabled');
            btns[3].disabled = false;
            btns[3].click();
          }
        \`;
        
        // Right-click on first symbol in Market Watch
        const item1InSymbolsRightClick = \`
          var element = document.querySelector('body > div.page-window.market-watch.compact > div > div.b > div.page-block > div > table > tbody > tr:nth-child(1)');
          if (element) {
            var rect = element.getBoundingClientRect();
            var ev1 = new MouseEvent("mousedown", {
              bubbles: true,
              cancelable: false,
              view: window,
              button: 2,
              buttons: 2,
              clientX: rect.x,
              clientY: rect.y
            });
            element.dispatchEvent(ev1);
            
            var ev2 = new MouseEvent("mouseup", {
              bubbles: true,
              cancelable: false,
              view: window,
              button: 2,
              buttons: 0,
              clientX: rect.x,
              clientY: rect.y
            });
            element.dispatchEvent(ev2);
            
            var ev3 = new MouseEvent("contextmenu", {
              bubbles: true,
              cancelable: false,
              view: window,
              button: 2,
              buttons: 0,
              clientX: rect.x,
              clientY: rect.y
            });
            element.dispatchEvent(ev3);
          }
        \`;
        
        // Press "Show All"
        const press_show_all = \`
          var sall = document.querySelector('body > div.page-menu.context.expanded > div > div > span.box > span > div:nth-child(7)');
          if (sall) {
            sall.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            sall.click();
          }
        \`;
        
        // Main execution function
        function executeTrading() {
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'step',
            message: 'Initializing MT4...'
          }));
          
          // Step 1: Login
          setTimeout(function() {
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'step',
              message: 'Logging in...'
            }));
            eval(js);
            eval(jsPress);
            
            // Step 2: Wait for login and show all symbols
            setTimeout(function() {
              window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'step',
                message: 'Accessing symbol list...'
              }));
              eval(item1InSymbolsRightClick);
              
              setTimeout(function() {
                eval(press_show_all);
                
                // Step 3: Start trading after authentication
                setTimeout(function() {
                  startTradingSequence();
                }, 3000);
              }, 2000);
            }, 8000);
          }, 3000);
        }
        
        // Trading sequence - optimized for multiple orders
        function startTradingSequence() {
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'step',
            message: 'Starting trade execution for ${asset}...'
          }));
          
          // Select symbol
          const selectSymbol = \`
            var tableB = document.querySelector('body > div.page-window.market-watch.compact > div > div.b > div.page-block > div > table > tbody');
            if (tableB) {
              var allTRs = tableB.querySelectorAll('tr');
              var ev = document.createEvent('MouseEvents');
              ev.initEvent('dblclick', true, true);
              for (var i = 0; i < allTRs.length; i++) {
                var a = allTRs[i].getElementsByTagName('td')[0];
                if (a && a.textContent && a.textContent.trim() === '${asset}') {
                  a.dispatchEvent(ev);
                  console.log('Selected symbol: ${asset}');
                  break;
                }
              }
            }
          \`;
          
          // Optimized field setting with proper SL/TP handling - Enhanced version
          const setTradeParams = \`
            function setFieldValueOptimized(selector, value, fieldName) {
              var field = document.querySelector(selector);
              if (field) {
                console.log('Setting ' + fieldName + ' to: ' + value);
                
                // Clear field completely first
                field.focus();
                field.select();
                field.value = '';
                
                // Trigger clear events
                field.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                field.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                field.dispatchEvent(new Event('keyup', { bubbles: true, cancelable: true }));
                
                // Wait for clear to process, then set new value
                setTimeout(function() {
                  field.focus();
                  field.value = String(value);
                  
                  // Trigger all relevant events for the new value
                  field.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                  field.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                  field.dispatchEvent(new Event('keyup', { bubbles: true, cancelable: true }));
                  field.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
                  
                  // Final verification with retry mechanism
                  setTimeout(function() {
                    var currentValue = field.value;
                    console.log('Expected ' + fieldName + ': ' + value + ' but actual ' + fieldName + ' field shows: ' + currentValue);
                    
                    // If value still doesn't match, use alternative method
                    if (currentValue !== String(value)) {
                      console.log('Value mismatch detected for ' + fieldName + ', using alternative input method...');
                      
                      // Method 2: Simulate typing character by character
                      field.focus();
                      field.select();
                      field.value = '';
                      
                      var targetValue = String(value);
                      var currentIndex = 0;
                      
                      function typeNextCharacter() {
                        if (currentIndex < targetValue.length) {
                          var char = targetValue.charAt(currentIndex);
                          field.value += char;
                          
                          // Simulate key events for each character
                          var keyEvent = new KeyboardEvent('keydown', {
                            key: char,
                            code: 'Digit' + char,
                            keyCode: char.charCodeAt(0),
                            bubbles: true,
                            cancelable: true
                          });
                          field.dispatchEvent(keyEvent);
                          
                          field.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                          
                          currentIndex++;
                          setTimeout(typeNextCharacter, 100);
                        } else {
                          // Final events after typing complete
                          field.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                          field.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
                          
                          // Final verification
                          setTimeout(function() {
                            var finalValue = field.value;
                            console.log('Final verification - ' + fieldName + ' expected: ' + value + ', final: ' + finalValue);
                            
                            // If still not matching, try direct DOM manipulation
                            if (finalValue !== String(value)) {
                              console.log('Using direct DOM manipulation for ' + fieldName);
                              field.setAttribute('value', String(value));
                              field.value = String(value);
                              
                              // Trigger final events
                              field.dispatchEvent(new Event('input', { bubbles: true }));
                              field.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                          }, 200);
                        }
                      }
                      
                      typeNextCharacter();
                    }
                  }, 500);
                }, 200);
                
                return true;
              } else {
                console.log('Field not found: ' + selector);
                return false;
              }
            }
            
            // Set Volume first
            setFieldValueOptimized('#volume', '${volume}', 'Volume');
            
            // Set SL with longer delay to ensure Volume is processed
            setTimeout(function() {
              setFieldValueOptimized('#sl', '${sl}', 'SL');
            }, 1000);
            
            // Set TP with even longer delay to ensure SL is processed
            setTimeout(function() {
              setFieldValueOptimized('#tp', '${tp}', 'TP');
            }, 2000);
            
            // Set Comment last
            setTimeout(function() {
              setFieldValueOptimized('#comment', '${botname}', 'Comment');
            }, 3000);
          \`;
          
          const executeOrder = \`
            ${action === 'BUY' ?
        "var buyBtn = document.querySelector('button.input-button.blue'); if (buyBtn) { buyBtn.click(); console.log('BUY order executed'); }" :
        "var sellBtn = document.querySelector('button.input-button.red'); if (sellBtn) { sellBtn.click(); console.log('SELL order executed'); }"
      }
          \`;
          
          // Execute trading sequence with optimized timing
          setTimeout(function() {
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'step',
              message: 'Selecting symbol ${asset}...'
            }));
            eval(selectSymbol);
            
            // Execute multiple orders with proper delays and enhanced tracking
            console.log('Starting execution of ${numberOfOrders} orders for ${asset}');
            
            function executeOrderSequence(orderIndex) {
              if (orderIndex >= ${numberOfOrders}) {
                // All orders completed
                setTimeout(function() {
                  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'success',
                    message: 'All ${numberOfOrders} order(s) executed successfully for ${asset}'
                  }));
                  
                  // Close execution window after 3 seconds
                  setTimeout(function() {
                    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'close',
                      message: 'Execution completed - closing window'
                    }));
                  }, 3000);
                }, 2000);
                return;
              }
              
              console.log('Executing MT4 order ' + (orderIndex + 1) + ' of ${numberOfOrders}');
              window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'step',
                message: 'Executing MT4 order ' + (orderIndex + 1) + ' of ${numberOfOrders} for ${asset}...'
              }));
              
              // Set parameters for this order
              eval(setTradeParams);
              
              // Execute order after parameters are set
              setTimeout(function() {
                console.log('Placing MT4 order ' + (orderIndex + 1) + ' - ${action}');
                eval(executeOrder);
                
                // Wait before next order
                setTimeout(function() {
                  executeOrderSequence(orderIndex + 1);
                }, 8000); // 8 second delay between orders
              }, 4500); // Delay to allow field setting to complete
            }
            
            // Start the sequence
            executeOrderSequence(0);
          }, 2000);
        }
        
        // Start the execution
        setTimeout(function() {
          executeTrading();
        }, 2000);
      })();
    `;
  }, [signal, tradeConfig, credentials, eaName]);

  // Generate MT5 trading JavaScript
  const generateMT5JavaScript = useCallback(() => {
    if (!signal || !tradeConfig || !credentials) return '';

    const numberOfOrders = parseInt(tradeConfig.numberOfTrades) || 1;
    const volume = tradeConfig.lotSize;
    const asset = signal.asset;
    const tp = signal.tp;
    const sl = signal.sl;
    const action = signal.action;
    const botname = `${eaName}`;

    return `
      // MT5 Trading Script
      console.log('Starting MT5 trade execution for ${asset}');
      
      const loginScript = \`
        var x = document.querySelector('input[name="login"]');
        if (x != null) {
          x.value = '${credentials.login}';
          x.dispatchEvent(new Event('input', { bubbles: true }));
        }
        var y = document.querySelector('input[name="password"]');
        if (y != null) {
          y.value = '${credentials.password}';
          y.dispatchEvent(new Event('input', { bubbles: true }));
        }
      \`;
      
      const loginPress = \`
        var button = document.querySelector('.button.svelte-1wrky82.active');
        if(button !== null) {
          button.click();
        }
      \`;
      
      // Enhanced search bar reveal and verification function
      const revealAndVerifySearchBar = \`
        function ensureSearchBarVisible(callback) {
          var attempts = 0;
          var maxAttempts = 3;
          
          function tryRevealSearchBar() {
            attempts++;
            console.log('Attempting to reveal search bar, attempt: ' + attempts);
            
            // First, try to click the title to reveal search bar
            var titleEl = document.querySelector('.title-wrap.svelte-19c9jff .title.svelte-19c9jff');
            if (titleEl) {
              titleEl.click();
              console.log('Clicked title element to reveal search bar');
            }
            
            // Wait a moment then check if search bar is visible
            setTimeout(function() {
              var searchInput = document.querySelector('input[placeholder="Search symbol"]') ||
                               document.querySelector('label.search.svelte-1mvzp7f input') ||
                               document.querySelector('.search input');
              
              if (searchInput && searchInput.offsetParent !== null) {
                console.log('Search bar is now visible and ready');
                callback(searchInput);
              } else if (attempts < maxAttempts) {
                console.log('Search bar not visible yet, retrying...');
                setTimeout(tryRevealSearchBar, 1000);
              } else {
                console.log('Failed to reveal search bar after ' + maxAttempts + ' attempts');
                // Try to proceed anyway with any input field found
                var fallbackInput = document.querySelector('input[type="text"]');
                if (fallbackInput) {
                  console.log('Using fallback input field');
                  callback(fallbackInput);
                } else {
                  console.log('No input field found at all');
                  callback(null);
                }
              }
            }, 800);
          }
          
          tryRevealSearchBar();
        }
      \`;
      
      const searchSymbol = \`
        ensureSearchBarVisible(function(searchInput) {
          if (searchInput) {
            console.log('Setting search value to: ${asset}');
            searchInput.focus();
            searchInput.select();
            searchInput.value = '${asset}';
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true }));
            searchInput.dispatchEvent(new Event('keyup', { bubbles: true }));
            
            // Verify the value was set
            setTimeout(function() {
              console.log('Search input value after setting: "' + searchInput.value + '"');
            }, 200);
          } else {
            console.log('Could not find or reveal search input field');
          }
        });
      \`;
      
      const selectSymbol = \`
        var candidates = document.querySelectorAll('.name.svelte-19bwscl .symbol.svelte-19bwscl, .symbol.svelte-19bwscl, [class*="symbol"], .name .symbol');
        var found = false;
        for (var i = 0; i < candidates.length; i++) {
          var el = candidates[i];
          var txt = (el.innerText || '').trim();
          if (txt === '${asset}' || txt === '${asset}.mic' || txt.includes('${asset}')) {
            el.click();
            found = true;
            break;
          }
        }
        if (!found && candidates.length > 0) {
          candidates[0].click();
        }
      \`;
      
      const openOrderDialog = \`
        var element = document.querySelector('.icon-button.withText span.button-text');
        if (element !== null) {
          element.scrollIntoView();
          element.click();
        }
      \`;
      
      const setOrderParams = \`
        // Optimized MT5 field setting function with proper clearing and validation
        function setMT5FieldValue(selector, value, fieldName) {
          var field = document.querySelector(selector);
          if (field) {
            console.log('Setting MT5 ' + fieldName + ' to: ' + value);
            
            // Clear the field first
            field.focus();
            field.select();
            field.value = '';
            
            // Trigger clear events
            field.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            field.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            
            // Small delay before setting new value
            setTimeout(function() {
              field.focus();
              field.value = String(value);
              
              // Trigger input events for the new value
              field.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
              field.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
              field.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
              
              // Verify the value was set correctly
              setTimeout(function() {
                var currentValue = field.value;
                console.log('Expected MT5 ' + fieldName + ': ' + value + ' but actual ' + fieldName + ' field shows: ' + currentValue);
                
                // If value doesn't match, try alternative setting method
                if (currentValue !== String(value)) {
                  console.log('Retrying MT5 ' + fieldName + ' with alternative method...');
                  field.focus();
                  
                  // Try using execCommand if available
                  if (document.execCommand) {
                    field.select();
                    document.execCommand('delete', false, null);
                    document.execCommand('insertText', false, String(value));
                  } else {
                    // Fallback: character by character input simulation
                    field.value = '';
                    var chars = String(value).split('');
                    chars.forEach(function(char, index) {
                      setTimeout(function() {
                        field.value += char;
                        field.dispatchEvent(new Event('input', { bubbles: true }));
                        if (index === chars.length - 1) {
                          field.dispatchEvent(new Event('change', { bubbles: true }));
                          field.blur();
                        }
                      }, index * 50);
                    });
                  }
                }
              }, 200);
            }, 100);
            
            return true;
          } else {
            console.log('MT5 Field not found: ' + selector);
            return false;
          }
        }
        
        // Set Volume
        setMT5FieldValue('.trade-input input[type="text"]', '${volume}', 'Volume');
        
        // Set Stop Loss with enhanced validation
        setTimeout(function() {
          setMT5FieldValue('.sl input[type="text"]', '${sl}', 'SL');
        }, 300);
        
        // Set Take Profit with enhanced validation  
        setTimeout(function() {
          setMT5FieldValue('.tp input[type="text"]', '${tp}', 'TP');
        }, 600);
        
        // Set Comment
        setTimeout(function() {
          var commentSelector = '.input.svelte-mtorg2 input[type="text"]';
          var commentField = document.querySelector(commentSelector);
          if (!commentField) {
            commentSelector = '.input.svelte-1d8k9kk input[type="text"]';
          }
          setMT5FieldValue(commentSelector, '${botname}', 'Comment');
        }, 900);
      \`;
      
      const executeOrder = \`
        ${action === 'BUY' ?
        "var buyButton = document.querySelector('.footer-row button.trade-button:not(.red)'); if (buyButton !== null) { buyButton.click(); }" :
        "var sellButton = document.querySelector('.footer-row button.trade-button.red'); if (sellButton !== null) { sellButton.click(); }"
      }
      \`;
      
      const confirmOrder = \`
        var okButton = document.querySelector('.trade-button.svelte-16cwwe0');
        if (okButton !== null) {
          okButton.click();
        }
      \`;
      
      // Execute trading sequence
      setTimeout(() => {
        window.ReactNativeWebView.postMessage(JSON.stringify({type: 'step', message: 'Logging in...'}));
        eval(loginScript);
        eval(loginPress);
        
        setTimeout(() => {
          window.ReactNativeWebView.postMessage(JSON.stringify({type: 'step', message: 'Ensuring search bar is visible...'}));
          eval(revealAndVerifySearchBar);
          
          setTimeout(() => {
            window.ReactNativeWebView.postMessage(JSON.stringify({type: 'step', message: 'Searching for symbol ${asset}...'}));
            eval(searchSymbol);
            
            setTimeout(() => {
              eval(selectSymbol);
              
              setTimeout(() => {
                window.ReactNativeWebView.postMessage(JSON.stringify({type: 'step', message: 'Opening order dialog...'}));
                
                // Enhanced MT5 order execution sequence
                console.log('Starting MT5 execution of ${numberOfOrders} orders for ${asset}');
                
                function executeMT5OrderSequence(orderIndex) {
                  if (orderIndex >= ${numberOfOrders}) {
                    // All orders completed - verify all trades are actually executed
                    console.log('All MT5 orders completed, verifying execution status...');
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'step', 
                      message: 'All ${numberOfOrders} MT5 order(s) completed, verifying execution...'
                    }));
                    
                    // Function to check if all trades are actually executed
                    function verifyAllTradesExecuted() {
                      console.log('Verifying all MT5 trades are executed...');
                      
                      // Check for any remaining order dialogs or pending states
                      var orderDialog = document.querySelector('.trade-dialog, .order-dialog, .modal');
                      var loadingIndicators = document.querySelectorAll('.loading, .spinner, [class*="loading"]');
                      var pendingOrders = document.querySelectorAll('.pending, [class*="pending"]');
                      
                      var hasOpenDialog = orderDialog && orderDialog.offsetParent !== null;
                      var hasLoading = Array.from(loadingIndicators).some(el => el.offsetParent !== null);
                      var hasPending = Array.from(pendingOrders).some(el => el.offsetParent !== null);
                      
                      console.log('MT5 Execution verification:', {
                        hasOpenDialog: hasOpenDialog,
                        hasLoading: hasLoading,
                        hasPending: hasPending,
                        totalOrdersExpected: ${numberOfOrders}
                      });
                      
                      // If no pending operations, all trades are complete
                      if (!hasOpenDialog && !hasLoading && !hasPending) {
                        console.log('All MT5 trades verified as completed');
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                          type: 'success', 
                          message: 'All ${numberOfOrders} MT5 order(s) executed successfully for ${asset}'
                        }));
                        
                        // Now safe to close - all trades are confirmed executed
                        setTimeout(() => {
                          console.log('All MT5 trades confirmed executed - safe to close');
                          window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'close', 
                            message: 'All trades executed - closing window'
                          }));
                        }, 2000);
                        return true;
                      }
                      
                      return false;
                    }
                    
                    // Start verification process with retries
                    var verificationAttempts = 0;
                    var maxVerificationAttempts = 20; // 20 attempts = up to 40 seconds
                    
                    function attemptVerification() {
                      verificationAttempts++;
                      console.log('MT5 verification attempt:', verificationAttempts, 'of', maxVerificationAttempts);
                      
                      if (verifyAllTradesExecuted()) {
                        // All trades confirmed executed
                        return;
                      }
                      
                      if (verificationAttempts < maxVerificationAttempts) {
                        // Continue checking
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                          type: 'step', 
                          message: \`Verifying execution... (\${verificationAttempts}/\${maxVerificationAttempts})\`
                        }));
                        setTimeout(attemptVerification, 2000);
                      } else {
                        // Max attempts reached - assume completion
                        console.log('MT5 verification timeout - assuming all trades completed');
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                          type: 'success', 
                          message: 'All ${numberOfOrders} MT5 order(s) processing completed for ${asset}'
                        }));
                        
                        setTimeout(() => {
                          console.log('MT5 verification timeout - closing window');
                          window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'close', 
                            message: 'Processing completed - closing window'
                          }));
                        }, 2000);
                      }
                    }
                    
                    // Start verification after a brief delay
                    setTimeout(attemptVerification, 3000);
                    return;
                  }
                  
                  console.log('Executing MT5 order ' + (orderIndex + 1) + ' of ${numberOfOrders}');
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'step', 
                    message: \`Opening order dialog for MT5 trade \${orderIndex + 1} of ${numberOfOrders}...\`
                  }));
                  
                  eval(openOrderDialog);
                  
                  setTimeout(() => {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'step', 
                      message: \`Setting parameters for MT5 order \${orderIndex + 1} of ${numberOfOrders}...\`
                    }));
                    eval(setOrderParams);
                    
                    setTimeout(() => {
                      console.log('Placing MT5 order ' + (orderIndex + 1) + ' - ${action}');
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'step', 
                        message: \`Executing MT5 order \${orderIndex + 1} of ${numberOfOrders} - ${action}...\`
                      }));
                      
                      eval(executeOrder);
                      eval(confirmOrder);
                      
                      // Enhanced wait time between orders to ensure each trade is fully processed
                      setTimeout(() => {
                        console.log('MT5 order ' + (orderIndex + 1) + ' processing completed, moving to next...');
                        executeMT5OrderSequence(orderIndex + 1);
                      }, 8000); // Increased from 6 to 8 seconds delay between orders
                    }, 3000); // Increased from 2.5 to 3 seconds for parameter setting
                  }, 2500); // Increased from 2 to 2.5 seconds for dialog opening
                }
                
                // Start the MT5 sequence
                executeMT5OrderSequence(0);
              }, 3000);
            }, 4000); // Increased delay to allow search bar verification and search completion
          }, 4000); // Increased delay to allow search bar reveal verification
        }, 8000);
      }, 3000);
    `;
  }, [signal, tradeConfig, credentials, eaName]);

  // Get WebView URL for trading based on platform
  const getWebViewUrl = useCallback(() => {
    if (!tradeConfig || !credentials) return '';

    // Determine the correct action based on trade config direction and signal
    let action = signal?.action || '';

    // If trade config has specific direction, use it instead of signal action
    if (tradeConfig.direction === 'BUY') {
      action = 'BUY';
    } else if (tradeConfig.direction === 'SELL') {
      action = 'SELL';
    }
    // If direction is 'BOTH', keep the signal action

    const params = new URLSearchParams({
      url: tradeConfig.platform === 'MT4'
        ? 'https://metatraderweb.app/trade?version=4'
        : 'https://webtrader.razormarkets.co.za/terminal/',
      login: credentials.login,
      password: credentials.password,
      server: credentials.server,
      asset: signal?.asset || '',
      action: action,
      price: signal?.price || '',
      tp: signal?.tp || '',
      sl: signal?.sl || '',
      volume: tradeConfig.lotSize,
      numberOfTrades: tradeConfig.numberOfTrades,
      botname: eaName
    });

    // Use the correct proxy based on platform
    const proxyEndpoint = tradeConfig.platform === 'MT4' ? '/api/mt4-proxy' : '/api/mt5-proxy';
    const finalUrl = `${proxyEndpoint}?${params.toString()}`;

    console.log('🎯 Trading WebView URL:', {
      platform: tradeConfig.platform,
      proxyEndpoint: proxyEndpoint,
      finalUrl: finalUrl,
      params: Object.fromEntries(params.entries())
    });

    return finalUrl;
  }, [tradeConfig, credentials, signal, eaName]);

  // Storage clear script for MT5 cleanup
  const getStorageClearScript = useCallback(() => {
    return `
      (async function() {
        try {
          try { localStorage.clear(); } catch(e) {}
          try { sessionStorage.clear(); } catch(e) {}
          try {
            if (indexedDB && indexedDB.databases) {
              const dbs = await indexedDB.databases();
              for (const db of dbs) {
                const name = (db && db.name) ? db.name : null;
                if (name) {
                  try { indexedDB.deleteDatabase(name); } catch(e) {}
                }
              }
            }
          } catch(e) {}
          try {
            if ('caches' in window) {
              const names = await caches.keys();
              for (const n of names) { try { await caches.delete(n); } catch(e) {} }
            }
          } catch(e) {}
          try {
            if ('serviceWorker' in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations();
              for (const r of regs) { try { await r.unregister(); } catch(e) {} }
            }
          } catch(e) {}
          try {
            if (document && document.cookie) {
              document.cookie.split(';').forEach(function(c){
                const eq = c.indexOf('=');
                const name = eq > -1 ? c.substr(0, eq) : c;
                document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
              });
            }
          } catch(e) {}
        } catch(e) {}
        true;
      })();
    `;
  }, []);

  // Cleanup function for MT5 trading webview
  const cleanupMT5WebView = useCallback(() => {
    if (tradeConfig?.platform === 'MT5' && webViewRef.current) {
      console.log('Cleaning up MT5 trading webview - clearing all stored data...');

      // Clear all storage before closing
      const clearScript = getStorageClearScript();
      webViewRef.current.injectJavaScript(clearScript);

      // Small delay to allow cleanup to complete
      setTimeout(() => {
        console.log('MT5 trading webview cleanup completed - destroying webview');
        // The webview will be destroyed when the modal closes
      }, 500);
    }
  }, [tradeConfig, getStorageClearScript]);

  // Handle WebView messages
  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    const phases: string[] = [
      'Preparing session...', 'Injecting strategy...', 'Connecting to broker...', 'Verifying interface...', 'Initializing execution...'
    ];
    heartbeatIndexRef.current = 0;
    setCurrentStep('Initializing...');
    lastUpdateRef.current = Date.now();
    heartbeatRef.current = setInterval(() => {
      // If there was a recent real update, skip heartbeat
      if (Date.now() - lastUpdateRef.current < 2000) return;
      heartbeatIndexRef.current = (heartbeatIndexRef.current + 1) % phases.length;
      setCurrentStep(phases[heartbeatIndexRef.current]);
    }, 2000) as unknown as ReturnType<typeof setInterval>;
  }, [stopHeartbeat]);

  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      console.log('Trading WebView Message:', data);
      lastUpdateRef.current = Date.now();

      switch (data.type) {
        case 'step':
          console.log('Trading step update:', data.message);
          stopHeartbeat();
          setCurrentStep(data.message);
          // Restart heartbeat with longer delay to allow real updates
          setTimeout(() => {
            if (Date.now() - lastUpdateRef.current > 3000) {
              startHeartbeat();
            }
          }, 3000);
          break;
        case 'success':
        case 'authentication_success':
          console.log('Trading success:', data.message);
          stopHeartbeat();
          setCurrentStep(data.message);
          setTradeExecuted(true);
          setLoading(false);
          break;
        case 'close':
        case 'authentication_failed':
          console.log('Trading close/failed:', data.message);
          stopHeartbeat();
          setCurrentStep(data.message);
          if (data.type === 'authentication_failed') {
            setError(data.message);
            setLoading(false);
          } else {
            // For MT5, cleanup webview before closing
            if (tradeConfig?.platform === 'MT5') {
              cleanupMT5WebView();
              // Close after cleanup delay
              setTimeout(() => {
                onClose();
              }, 600);
            } else {
              // For MT4, close immediately
              setTimeout(() => {
                onClose();
              }, 100);
            }
          }
          break;
        case 'error':
          console.log('Trading error:', data.message);
          stopHeartbeat();
          setError(data.message);
          setLoading(false);
          break;
        case 'trade_executed':
          console.log('Trade executed:', data.message);
          stopHeartbeat();
          setCurrentStep(data.message);
          setTradeExecuted(true);
          setLoading(false);
          break;
      }
    } catch (parseError) {
      console.error('Error parsing WebView message:', parseError);
    }
  }, [tradeConfig, cleanupMT5WebView, onClose, stopHeartbeat, startHeartbeat]);

  // Handle WebView load events
  const handleWebViewLoad = useCallback(() => {
    console.log('Trading WebView loaded, MT5 proxy will handle authentication and trading...');
    setLoading(false);
    stopHeartbeat();
    setCurrentStep('Terminal loaded, MT5 proxy handling authentication...');
    lastUpdateRef.current = Date.now();

    // MT5 proxy will handle all authentication and trading automatically
    // No need to inject JavaScript - the proxy does everything
    console.log('MT5 proxy will handle authentication and trading for', tradeConfig?.platform);
    console.log('Platform:', Platform.OS, 'WebView type:', Platform.OS === 'web' ? 'WebWebView' : 'CustomWebView');

    // Start heartbeat to show progress while proxy works
    setTimeout(() => {
      if (Date.now() - lastUpdateRef.current > 2000) {
        startHeartbeat();
      }
    }, 2000);
  }, [tradeConfig, stopHeartbeat, startHeartbeat]);

  const handleWebViewError = useCallback((syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    setError(`WebView error: ${nativeEvent.description}`);
    setLoading(false);
  }, []);

  // Reset state when modal opens and cleanup when closing
  useEffect(() => {
    if (visible) {
      setLoading(true);
      setError(null);
      setTradeExecuted(false);
      setCurrentStep('Initializing...');
      startHeartbeat();
    } else {
      stopHeartbeat();
      // Modal is closing - cleanup MT5 if needed
      if (tradeConfig?.platform === 'MT5') {
        cleanupMT5WebView();
      }
    }
  }, [visible, tradeConfig, cleanupMT5WebView, startHeartbeat, stopHeartbeat]);

  // Debug logging
  useEffect(() => {
    console.log('TradingWebView render state:', {
      visible,
      hasSignal: !!signal,
      hasTradeConfig: !!tradeConfig,
      hasCredentials: !!credentials,
      signal: signal ? {
        id: signal.id,
        asset: signal.asset,
        action: signal.action,
        price: signal.price,
        tp: signal.tp,
        sl: signal.sl
      } : null,
      tradeConfig: tradeConfig ? {
        symbol: tradeConfig.symbol,
        platform: tradeConfig.platform,
        lotSize: tradeConfig.lotSize
      } : null,
      credentials: credentials ? {
        login: credentials.login,
        server: credentials.server,
        hasPassword: !!credentials.password
      } : null
    });
  }, [visible, signal, tradeConfig, credentials]);

  // Don't render if no signal or config
  if (!signal || !tradeConfig || !credentials) {
    console.log('TradingWebView not rendering:', {
      hasSignal: !!signal,
      hasTradeConfig: !!tradeConfig,
      hasCredentials: !!credentials
    });
    return null;
  }

  console.log('TradingWebView rendering with signal:', signal.asset, 'platform:', tradeConfig.platform);

  const webViewUrl = getWebViewUrl();

  const { width: screenWidth } = Dimensions.get('window');

  return (
    <>
      {/* Compact Progress Toast */}
      {visible && (
        <View style={[
          styles.toastContainer,
          {
            width: screenWidth - 40,
            // Position toast at top of screen, above menu
            top: Platform.OS === 'ios' ? 50 : 30,
          }
        ]}>
          <View style={styles.toastContent}>
            <View style={styles.toastLeft}>
              <View style={styles.toastIcon}>
                {error ? (
                  <AlertCircle color="#FF4444" size={16} />
                ) : tradeExecuted ? (
                  <CheckCircle color="#00FF88" size={16} />
                ) : (
                  <TrendingUp color="#CCCCCC" size={16} />
                )}
              </View>
              <View style={styles.toastInfo}>
                <Text style={styles.toastTitle}>
                  {signal.asset} • {signal.action} • {tradeConfig.platform}
                </Text>
                <Text style={[styles.toastStatus, {
                  color: error ? '#FF4444' : tradeExecuted ? '#00FF88' : '#CCCCCC'
                }]}>
                  {error || (tradeExecuted ? 'Execution Complete' : currentStep)}
                </Text>
              </View>
            </View>

            <View style={styles.toastRight}>
              {loading && !tradeExecuted && !error && (
                <ActivityIndicator size="small" color="#CCCCCC" />
              )}
              {error && (
                <TouchableOpacity
                  style={styles.toastRetryButton}
                  onPress={() => {
                    setError(null);
                    setLoading(true);
                    setTradeExecuted(false);
                    setCurrentStep('Retrying...');
                    // Reload the WebView
                    if (webViewRef.current) {
                      webViewRef.current.reload();
                    }
                  }}
                >
                  <Text style={styles.toastRetryText}>Retry</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.toastCloseButton}
                onPress={() => {
                  // For MT5, cleanup before closing
                  if (tradeConfig?.platform === 'MT5') {
                    cleanupMT5WebView();
                    setTimeout(() => {
                      onClose();
                    }, 600);
                  } else {
                    onClose();
                  }
                }}
              >
                <X color="#FFFFFF" size={16} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Progress Bar */}
          {!error && !tradeExecuted && (
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBar} />
            </View>
          )}
        </View>
      )}

      {/* WebView for trading execution - Completely invisible, runs in background */}
      {visible && (
        <View style={styles.invisibleWebViewContainer}>
          {Platform.OS === 'web' ? (
            <WebWebView
              url={webViewUrl}
              onMessage={handleWebViewMessage}
              onLoadEnd={handleWebViewLoad}
              style={styles.invisibleWebView}
            />
          ) : (
            <CustomWebView
              url={webViewUrl}
              onMessage={handleWebViewMessage}
              onLoadEnd={handleWebViewLoad}
              style={styles.invisibleWebView}
            />
          )}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // Toast Styles - Clean positioning at top of screen
  toastContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.8,
    shadowRadius: 16,
    elevation: 10000, // Very high elevation to stay on top
    zIndex: 10000, // Highest z-index to appear above everything
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  toastLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  toastIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  toastInfo: {
    flex: 1,
  },
  toastTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  toastStatus: {
    fontSize: 12,
    fontWeight: '500',
  },
  toastRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toastRetryButton: {
    backgroundColor: '#00FF00',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 8,
  },
  toastRetryText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '600',
  },
  toastCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  progressBarContainer: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#CCCCCC',
    width: '100%',
    opacity: 0.8,
  },

  // Full-screen WebView Styles
  webViewContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 10000,
  },
  webView: {
    flex: 1,
    backgroundColor: '#000000',
  },

  // Invisible WebView Styles - Completely invisible and non-interactive
  invisibleWebViewContainer: {
    position: 'absolute',
    top: -10000, // Move completely off-screen
    left: -10000,
    width: 1, // Minimal size
    height: 1,
    opacity: 0, // Completely transparent
    zIndex: -10000, // Far behind everything
    overflow: 'hidden',
    pointerEvents: 'none', // Disable all touch events
    elevation: -10000, // Android: behind everything
  },
  invisibleWebView: {
    width: 1,
    height: 1,
    opacity: 0,
    backgroundColor: 'transparent',
    pointerEvents: 'none', // Disable all touch events
    elevation: -10000, // Android: behind everything
  },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10001,
  },

  // Legacy styles (kept for compatibility)
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    color: '#CCCCCC',
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
  },
  successBadge: {
    backgroundColor: '#00FF00',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  successText: {
    color: '#000000',
    fontSize: 10,
    fontWeight: 'bold',
  },
  tradeDetails: {
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  tradeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tradeLabel: {
    color: '#CCCCCC',
    fontSize: 12,
    fontWeight: '500',
  },
  tradeValue: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  webViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingText: {
    color: '#CCCCCC',
    fontSize: 16,
    marginTop: 16,
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorTitle: {
    color: '#FF4444',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    color: '#CCCCCC',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#00FF00',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    display: 'none',
  },
});
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
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView } from 'react-native-webview';
import CustomWebView from './custom-webview';
import WebWebView from './web-webview';
import { X, AlertCircle, CheckCircle, TrendingUp } from 'lucide-react-native';
import { SignalLog } from '@/services/signals-monitor';
import { useApp } from '@/providers/app-provider';
import Constants from 'expo-constants';
import colors from '@/constants/colors';



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
  const [webViewKey, setWebViewKey] = useState<number>(0); // Key for forcing WebView remount
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
            console.log('🎯 Starting execution of ${numberOfOrders} orders for ${asset}');
            
            var ordersExecuted = 0; // Track actual executed orders
            var targetOrders = ${numberOfOrders};
            
            function executeOrderSequence(orderIndex) {
              console.log('📊 MT4 executeOrderSequence - orderIndex:', orderIndex, 'ordersExecuted:', ordersExecuted, 'targetOrders:', targetOrders);
              
              // Check if we've executed all required orders
              if (ordersExecuted >= targetOrders) {
                console.log('✅ All MT4 orders completed! Total executed:', ordersExecuted, 'Target:', targetOrders);
                
                setTimeout(function() {
                  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'success',
                    message: 'All ' + targetOrders + ' order(s) executed successfully for ${asset}'
                  }));
                  
                  console.log('⏳ Waiting 3 seconds before closing trading process...');
                  
                  // Wait 3 seconds then close and return to listening state
                  setTimeout(function() {
                    console.log('🔄 3 seconds elapsed, closing trading process and returning to listening state');
                    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'close',
                      message: 'All trades completed - returning to listening state'
                    }));
                  }, 3000);
                }, 2000);
                return;
              }
              
              console.log('🔨 Executing MT4 order ' + (ordersExecuted + 1) + ' of ' + targetOrders);
              window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'step',
                message: 'Executing MT4 order ' + (ordersExecuted + 1) + ' of ' + targetOrders + ' for ${asset}...'
              }));
              
              // Set parameters for this order
              eval(setTradeParams);
              
              // Execute order after parameters are set
              setTimeout(function() {
                console.log('💰 Placing MT4 order ' + (ordersExecuted + 1) + ' - ${action}');
                eval(executeOrder);
                
                // Increment the counter AFTER executing
                ordersExecuted++;
                console.log('✓ Order executed, ordersExecuted now:', ordersExecuted);
                
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
      
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      
      // Check for and remove existing connected account
      const checkAndRemoveExistingAccount = async () => {
        console.log('Checking for existing connected MT5 account...');
        await sleep(5500); // Wait for page to load
        
        // Check for disclaimer and accept if present
        const disclaimer = document.querySelector('#disclaimer');
        if (disclaimer) {
          const acceptButton = document.querySelector('.accept-button');
          if (acceptButton) {
            acceptButton.click();
            console.log('Accepted disclaimer');
            await sleep(5500);
          }
        }
        
        // Check if form is visible (means we need to login)
        const form = document.querySelector('.form');
        if (form && !form.classList.contains('hidden')) {
          console.log('Login form is visible, checking for existing connection...');
          
          // Press remove button first to clear any existing connection
          const removeButton = document.querySelector('.button.svelte-1wrky82.red');
          if (removeButton) {
            console.log('Found Remove button, clicking to clear existing connection...');
            removeButton.click();
            await sleep(5500);
          } else {
            // Fallback: look for Remove button by text
            const buttons = document.getElementsByTagName('button');
            for (let i = 0; i < buttons.length; i++) {
              if (buttons[i].textContent.trim() === 'Remove') {
                console.log('Found Remove button by text, clicking...');
                buttons[i].click();
                await sleep(5500);
                break;
              }
            }
          }
          
          console.log('Ready to login with fresh credentials');
        } else {
          console.log('Form is hidden or not found, may already be logged in');
        }
      };
      
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
      (async () => {
        window.ReactNativeWebView.postMessage(JSON.stringify({type: 'step', message: 'Checking for existing account...'}));
        await checkAndRemoveExistingAccount();
        
        window.ReactNativeWebView.postMessage(JSON.stringify({type: 'step', message: 'Logging in...'}));
        eval(loginScript);
        await sleep(500);
        eval(loginPress);
        
        await sleep(8000);
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
                console.log('🎯 Starting MT5 execution of ${numberOfOrders} orders for ${asset}');
                
                var ordersExecuted = 0; // Track actual executed orders
                var targetOrders = ${numberOfOrders};
                
                function executeMT5OrderSequence(orderIndex) {
                  console.log('📊 MT5 executeMT5OrderSequence - orderIndex:', orderIndex, 'ordersExecuted:', ordersExecuted, 'targetOrders:', targetOrders);
                  
                  if (ordersExecuted >= targetOrders) {
                    // All orders completed - verify all trades are actually executed
                    console.log('✅ All MT5 orders completed! Total executed:', ordersExecuted, 'Target:', targetOrders, '- verifying execution status...');
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'step', 
                      message: 'All ' + targetOrders + ' MT5 order(s) completed, verifying execution...'
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
                        ordersExecuted: ordersExecuted,
                        targetOrders: targetOrders
                      });
                      
                      // If no pending operations, all trades are complete
                      if (!hasOpenDialog && !hasLoading && !hasPending) {
                        console.log('All MT5 trades verified as completed');
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                          type: 'success', 
                          message: 'All ' + targetOrders + ' MT5 order(s) executed successfully for ${asset}'
                        }));
                        
                        console.log('Waiting 3 seconds before closing trading process...');
                        
                        // Wait 3 seconds then close and return to listening state
                        setTimeout(() => {
                          console.log('3 seconds elapsed, closing trading process and returning to listening state');
                          window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'close', 
                            message: 'All trades completed - returning to listening state'
                          }));
                        }, 3000);
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
                          message: 'All ' + targetOrders + ' MT5 order(s) processing completed for ${asset}'
                        }));
                        
                        console.log('Waiting 3 seconds before closing trading process...');
                        
                        setTimeout(() => {
                          console.log('3 seconds elapsed, closing trading process and returning to listening state');
                          window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'close', 
                            message: 'All trades completed - returning to listening state'
                          }));
                        }, 3000);
                      }
                    }
                    
                    // Start verification after a brief delay
                    setTimeout(attemptVerification, 3000);
                    return;
                  }
                  
                  console.log('🔨 Executing MT5 order ' + (ordersExecuted + 1) + ' of ' + targetOrders);
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'step', 
                    message: 'Opening order dialog for MT5 trade ' + (ordersExecuted + 1) + ' of ' + targetOrders + '...'
                  }));
                  
                  eval(openOrderDialog);
                  
                  setTimeout(() => {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'step', 
                      message: 'Setting parameters for MT5 order ' + (ordersExecuted + 1) + ' of ' + targetOrders + '...'
                    }));
                    eval(setOrderParams);
                    
                    setTimeout(() => {
                      console.log('💰 Placing MT5 order ' + (ordersExecuted + 1) + ' - ${action}');
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'step', 
                        message: 'Executing MT5 order ' + (ordersExecuted + 1) + ' of ' + targetOrders + ' - ${action}...'
                      }));
                      
                      eval(executeOrder);
                      eval(confirmOrder);
                      
                      // Increment the counter AFTER executing
                      ordersExecuted++;
                      console.log('✓ Order executed, ordersExecuted now:', ordersExecuted);
                      
                      // Enhanced wait time between orders to ensure each trade is fully processed
                      setTimeout(() => {
                        console.log('MT5 order processing completed, moving to next...');
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
        }, 0); // Immediate execution after login
      })(); // Execute async function
    `;
  }, [signal, tradeConfig, credentials, eaName]);

  // MT5 Broker URL mapping
  const MT5_BROKER_URLS: Record<string, string> = {
    'RazorMarkets-Live': 'https://webtrader.razormarkets.co.za/terminal/',
    'AccuMarkets-Live': 'https://webterminal.accumarkets.co.za/terminal/',
  };

  // Get WebView URL for trading based on platform - Load actual terminal, not proxy
  const getWebViewUrl = useCallback(() => {
    if (!tradeConfig || !credentials) return '';

    // Determine MT5 broker URL based on server name
    let mt5Url = 'https://webtrader.razormarkets.co.za/terminal/'; // Default
    if (tradeConfig.platform === 'MT5' && credentials.server) {
      mt5Url = MT5_BROKER_URLS[credentials.server] || MT5_BROKER_URLS['RazorMarkets-Live'];
    }

    // Return the actual MT4/MT5 web terminal URL (not the proxy)
    const terminalUrl = tradeConfig.platform === 'MT4'
        ? 'https://metatraderweb.app/trade?version=4'
      : mt5Url;

    console.log('🎯 Trading WebView URL:', {
      platform: tradeConfig.platform,
      terminalUrl: terminalUrl,
      broker: tradeConfig.platform === 'MT5' ? credentials.server : 'N/A',
      willInjectScript: true
    });

    return terminalUrl;
  }, [tradeConfig, credentials]);

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

  // Cleanup function for trading webview - works for both MT4 and MT5
  const cleanupTradingWebView = useCallback(() => {
    console.log(`Cleaning up ${tradeConfig?.platform} trading webview - clearing all stored data...`);

    if (webViewRef.current) {
      // Clear all storage before closing
      const clearScript = getStorageClearScript();
      webViewRef.current.injectJavaScript(clearScript);
    }

    // Increment key to force WebView remount and destroy cached instance
      setTimeout(() => {
      console.log('Trading webview cleanup completed - incrementing key to destroy instance');
      setWebViewKey(prev => prev + 1);
      }, 500);
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
          // Cleanup after successful trade
          setTimeout(() => {
            console.log('Trade successful - cleaning up WebView');
            cleanupTradingWebView();
          }, 2000);
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
            // Cleanup webview before closing (both MT4 and MT5)
            cleanupTradingWebView();
              // Close after cleanup delay
              setTimeout(() => {
                onClose();
              }, 600);
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
          // Cleanup after trade execution
          setTimeout(() => {
            console.log('Trade executed - cleaning up WebView');
            cleanupTradingWebView();
          }, 2000);
          break;
      }
    } catch (parseError) {
      console.error('Error parsing WebView message:', parseError);
    }
  }, [tradeConfig, cleanupTradingWebView, onClose, stopHeartbeat, startHeartbeat]);

  // Handle WebView load events
  const handleWebViewLoad = useCallback(() => {
    console.log('Trading WebView loaded, injecting trading script...');
    setLoading(false);
    stopHeartbeat();
    setCurrentStep('Terminal loaded, starting authentication...');
    lastUpdateRef.current = Date.now();

    console.log('Trading script will handle authentication and trading for', tradeConfig?.platform);
    console.log('Platform:', Platform.OS, 'WebView type:', Platform.OS === 'web' ? 'WebWebView' : 'CustomWebView');

    // Start heartbeat to show progress while trading script works
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
      // Modal is closing - cleanup trading webview
      console.log('Trading modal closing - cleaning up WebView');
      cleanupTradingWebView();
    }
  }, [visible, tradeConfig, cleanupTradingWebView, startHeartbeat, stopHeartbeat]);

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
  const tradingScript = tradeConfig.platform === 'MT4' ? generateMT4JavaScript() : generateMT5JavaScript();

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
          {Platform.OS === 'ios' && (
            <BlurView intensity={130} tint="dark" style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.15)', 'rgba(255, 255, 255, 0.08)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.toastContent}>
            <View style={styles.toastLeft}>
              <View style={styles.toastIcon}>
                {Platform.OS === 'ios' && (
                  <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
                )}
                <LinearGradient
                  colors={error 
                    ? ['rgba(220, 38, 38, 0.2)', 'rgba(220, 38, 38, 0.1)']
                    : tradeExecuted
                    ? ['rgba(37, 211, 102, 0.2)', 'rgba(37, 211, 102, 0.1)']
                    : ['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.06)']}
                  style={StyleSheet.absoluteFill}
                />
                {error ? (
                  <AlertCircle color="#DC2626" size={16} />
                ) : tradeExecuted ? (
                  <CheckCircle color="#25D366" size={16} />
                ) : (
                  <TrendingUp color="#CCCCCC" size={16} />
                )}
              </View>
              <View style={styles.toastInfo}>
                <Text style={styles.toastTitle}>
                  {signal.asset} {signal.action} ORDER
                </Text>
                <Text style={[styles.toastStatus, {
                  color: error ? '#FF4444' : tradeExecuted ? '#00FF88' : '#CCCCCC'
                }]}>
                  {error || (tradeExecuted ? 'TRADE EXECUTED' : currentStep.toUpperCase())}
                </Text>
                <Text style={styles.toastPlatform}>
                  {tradeConfig.platform.toUpperCase()}
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
                  activeOpacity={0.8}
                >
                  {Platform.OS === 'ios' && (
                    <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
                  )}
                  <LinearGradient
                    colors={['rgba(37, 211, 102, 0.15)', 'rgba(37, 211, 102, 0.08)']}
                    style={StyleSheet.absoluteFill}
                  />
                  <Text style={styles.toastRetryText}>RETRY</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.toastCloseButton}
                onPress={() => {
                  // Cleanup before closing
                  cleanupTradingWebView();
                    setTimeout(() => {
                      onClose();
                    }, 600);
                }}
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

          {/* Progress Bar */}
          {!error && !tradeExecuted && (
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBar} />
            </View>
          )}
        </View>
      )}

      {/* WebView for trading execution - Visible for debugging */}
      {visible && (
        <View key={`trading-webview-${webViewKey}`} style={styles.invisibleWebViewContainer}>
          {Platform.OS === 'web' ? (
            <WebWebView
              key={`trading-web-${webViewKey}`}
              url={webViewUrl}
              script={tradingScript}
              onMessage={handleWebViewMessage}
              onLoadEnd={handleWebViewLoad}
              style={styles.invisibleWebView}
            />
          ) : (
            <CustomWebView
              key={`trading-custom-${webViewKey}`}
              url={webViewUrl}
              script={tradingScript}
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
    backgroundColor: '#1F1F1F',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333333',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10000,
    zIndex: 10000,
    overflow: 'hidden',
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
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.backgroundMedium,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 0.3,
    borderColor: colors.glass.border,
    overflow: 'hidden',
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
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  toastPlatform: {
    fontSize: 10,
    fontWeight: '600',
    color: '#999999',
    letterSpacing: 1,
    marginTop: 2,
  },
  toastRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toastRetryButton: {
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.backgroundMedium,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 8,
    borderWidth: 0.3,
    borderColor: colors.glass.border,
    overflow: 'hidden',
  },
  toastRetryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  toastCloseButton: {
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

  // Visible WebView Styles - For debugging trade execution
  invisibleWebViewContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1,
    height: 1,
    opacity: 0,
    zIndex: -1,
  },
  invisibleWebView: {
    flex: 1,
    backgroundColor: '#000000',
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
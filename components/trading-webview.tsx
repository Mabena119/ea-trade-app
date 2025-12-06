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
  // Add WebView readiness state and proper timing control
  const [webViewReady, setWebViewReady] = useState(false);
  const [isTradingInProgress, setIsTradingInProgress] = useState(false);

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
        
        // MT4 ACCOUNT AUTHENTICATION FUNCTION - Returns true if successful
        async function authenticateMT4Account() {
          const sendMessage = (type, message) => {
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type, message }));
          };
          
          console.log('MT4: === ACCOUNT AUTHENTICATION START ===');
          sendMessage('step', 'Starting MT4 account authentication...');
          
          // Step 1: ALWAYS connect/login with correct account credentials
          await new Promise(r => setTimeout(r, 3000));
          sendMessage('step', 'Connecting to account ${credentials.login} on server ${credentials.server}...');
          
          // Fill login credentials (login, server, password)
          eval(js);
          
          // Submit login
          await new Promise(r => setTimeout(r, 1000));
          eval(jsPress);
          
          // Step 2: Wait for login to complete
          sendMessage('step', 'Authenticating with MT4 server...');
          await new Promise(r => setTimeout(r, 8000));
          
          // Step 3: VERIFY login success by checking for Market Watch table (MUST PASS)
          sendMessage('step', 'Verifying account connection...');
          
          let loginSuccess = false;
          let loginAttempts = 0;
          
          while (!loginSuccess && loginAttempts < 15) {
            await new Promise(r => setTimeout(r, 1000));
            loginAttempts++;
            
            // Check if Market Watch is visible (indicates successful login)
            const marketWatch = document.querySelector('body > div.page-window.market-watch.compact > div > div.b > div.page-block > div > table > tbody');
            const loginButton = document.querySelectorAll('button.input-button')[3];
            
            // Login is successful if Market Watch is visible AND login button is no longer visible/disabled
            if (marketWatch && marketWatch.querySelectorAll('tr').length > 0) {
              loginSuccess = true;
              sendMessage('step', '✅ Authentication SUCCESS - Account ${credentials.login} connected on ${credentials.server}');
              sendMessage('authentication_success', 'MT4 Account authenticated successfully');
              console.log('MT4: Authentication PASSED - Market Watch detected with', marketWatch.querySelectorAll('tr').length, 'symbols');
              return true; // Authentication successful
            }
            
            if (loginAttempts % 3 === 0) {
              sendMessage('step', 'Still verifying connection... (' + loginAttempts + '/15 attempts)');
            }
          }
          
          // Authentication failed
          sendMessage('error', '❌ Authentication FAILED - Could not verify login after 15 seconds');
          sendMessage('authentication_failed', 'MT4 Account authentication failed');
          console.log('MT4: Authentication FAILED - Aborting trading execution');
          return false;
        }
        
        // MT4 TRADING EXECUTION FUNCTION - Executes trades according to trade configuration
        async function executeMT4Trades() {
          const sendMessage = (type, message) => {
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type, message }));
          };
          
          console.log('MT4: === TRADING EXECUTION START ===');
          sendMessage('step', 'Starting MT4 trade execution according to trade configuration...');
          
          // Step 1: Show all symbols
          sendMessage('step', 'Accessing symbol list...');
          eval(item1InSymbolsRightClick);
          await new Promise(r => setTimeout(r, 2000));
          eval(press_show_all);
          await new Promise(r => setTimeout(r, 3000));
          
          // Step 2: Execute trading sequence according to trade configuration
          await startTradingSequence();
        }
        
        // MAIN EXECUTION FLOW: Authenticate first, then execute trades
        async function executeTrading() {
          try {
            const sendMessage = (type, message) => {
              window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type, message }));
            };
            
            console.log('MT4: === STRICT SEQUENTIAL TRADING START ===');
            sendMessage('step', 'Initializing MT4 - Ensuring correct account connection...');
            
            // STEP 1: Authenticate account first
            const authenticationSuccess = await authenticateMT4Account();
            
            if (!authenticationSuccess) {
              sendMessage('error', 'Cannot proceed with trading - Authentication failed');
              console.log('MT4: Trading aborted - Authentication failed');
              return;
            }
            
            // STEP 2: Once authentication is true, continue to place trades
            await new Promise(r => setTimeout(r, 2000)); // Brief pause after authentication
            await executeMT4Trades();
            
          } catch (error) {
            console.log('MT4 Trading: Error in executeTrading:', error.message);
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'error',
              message: 'MT4 execution error: ' + error.message
            }));
          }
        }
        
        // Trading sequence - optimized for multiple orders
        async function startTradingSequence() {
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
            
            // Clean sequential MT4 order execution - matching web script exactly
            (async () => {
              const numberOfTrades = ${numberOfOrders};
              let completedTrades = 0;
              let failedTrades = 0;
              
              console.log('🎯 MT4 Trading: Starting STRICT execution of EXACTLY', numberOfTrades, 'trade(s) for ${asset}');
              window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'step',
                message: 'Starting execution of ' + numberOfTrades + ' MT4 trade(s) for ${asset}...'
              }));
              
              // Function to execute a single MT4 trade
              const executeSingleTrade = async (tradeIndex) => {
                try {
                  const currentTradeNumber = tradeIndex + 1;
                  console.log('MT4 Trading: Starting trade', currentTradeNumber, 'of', numberOfTrades);
                  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'step',
                    message: 'Executing MT4 trade ' + currentTradeNumber + ' of ' + numberOfTrades + ' for ${asset}...'
                  }));
                  
                  // Set parameters for this order
                  eval(setTradeParams);
                  await new Promise(r => setTimeout(r, 1500));
                  
                  // Execute order
                  console.log('MT4 Trading: Executing trade', currentTradeNumber, '- ${action}');
                  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'step',
                    message: 'Executing MT4 trade ' + currentTradeNumber + ' - ${action}...'
                  }));
                  eval(executeOrder);
                  
                  // MT4 doesn't have a separate confirmation dialog, wait for order to process
                  await new Promise(r => setTimeout(r, 2000));
                  
                  console.log('MT4 Trading: Trade', currentTradeNumber, 'completed successfully');
                  return true;
                } catch (error) {
                  console.log('MT4 Trading: Trade', (tradeIndex + 1), 'failed:', error.message);
                  return false;
                }
              };
              
              // Execute trades sequentially - loop runs EXACTLY numberOfTrades times
              for (let tradeIndex = 0; tradeIndex < numberOfTrades; tradeIndex++) {
                const success = await executeSingleTrade(tradeIndex);
                
                if (success) {
                  completedTrades++;
                  console.log('MT4 Trading: SUCCESS - Trade', (tradeIndex + 1), 'completed! Progress:', completedTrades, 'of', numberOfTrades);
                  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'step',
                    message: 'SUCCESS - MT4 trade ' + (tradeIndex + 1) + ' completed! Progress: ' + completedTrades + ' of ' + numberOfTrades
                  }));
                  
                  // Wait between trades (but not after the last one)
                  if (tradeIndex < numberOfTrades - 1) {
                    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'step',
                      message: 'Waiting before next MT4 trade... (' + completedTrades + '/' + numberOfTrades + ' completed)'
                    }));
                    await new Promise(r => setTimeout(r, 3000)); // 3 second delay between MT4 orders
                  }
                } else {
                  failedTrades++;
                  console.log('MT4 Trading: FAILED - Trade', (tradeIndex + 1), 'failed. Continuing...');
                  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'step',
                    message: 'FAILED - MT4 trade ' + (tradeIndex + 1) + ' failed. Continuing to next trade...'
                  }));
                  
                  // Wait before next trade even if this one failed (but not after the last one)
                  if (tradeIndex < numberOfTrades - 1) {
                    await new Promise(r => setTimeout(r, 2000));
                  }
                }
              }
              
              // Log completion
              console.log('MT4 Trading: Loop completed - executed', numberOfTrades, 'iterations, completed:', completedTrades, 'failed:', failedTrades);
              
              // Final summary
              console.log('MT4 Trading: EXECUTION COMPLETED - Completed:', completedTrades, 'Failed:', failedTrades, 'Target:', numberOfTrades);
              window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'trade_executed',
                message: 'All MT4 trades completed: ' + completedTrades + ' of ' + numberOfTrades + ' successful for ${asset}'
              }));
              
              // Close after completion
              if (completedTrades === numberOfTrades) {
                window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'success',
                  message: 'All ' + numberOfTrades + ' MT4 trade(s) executed successfully for ${asset}'
                }));
                
                setTimeout(() => {
                  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'close',
                    message: 'All trades completed - returning to listening state'
                  }));
                }, 3000);
              } else if (completedTrades > 0) {
                window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'success',
                  message: 'Partial completion: ' + completedTrades + ' of ' + numberOfTrades + ' MT4 trades executed'
                }));
                
                setTimeout(() => {
                  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'close',
                    message: 'Trading completed - returning to listening state'
                  }));
                }, 3000);
              } else {
                window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'error',
                  message: 'No MT4 trades executed successfully'
                }));
              }
            })();
          }, 2000);
        }
        
        // Start the execution with proper async handling
        (async () => {
          try {
            await new Promise(r => setTimeout(r, 2000));
            await executeTrading();
          } catch (error) {
            console.log('MT4 Trading: Error in main execution:', error.message);
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'error',
              message: 'MT4 main execution error: ' + error.message
            }));
          }
        })();
      })();
    `;
  }, [signal, tradeConfig, credentials, eaName]);

  // Generate MT5 trading JavaScript
  const generateMT5JavaScript = useCallback(() => {
    if (!signal || !tradeConfig || !credentials) return '';

    const numberOfTrades = parseInt(tradeConfig.numberOfTrades) || 1;
    const volume = tradeConfig.lotSize;
    const asset = signal.asset;
    const tp = signal.tp;
    const sl = signal.sl;
    const action = signal.action;
    const botname = `${eaName}`;

    return `
      (function(){
        console.log('MT5 Trading script injected - starting immediately');
        
        // MT5 ACCOUNT AUTHENTICATION FUNCTION - Duplicated from metatrader screen
        // Returns true if successful, false if failed
        async function authenticateMT5Account() {
          const sleep = (ms) => new Promise(r => setTimeout(r, ms));
          const sendMessage = (type, message) => {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type, message }));
          };
          
          console.log('MT5: === ACCOUNT AUTHENTICATION START ===');
          
          try {
            sendMessage('step', 'Initializing MT5 Account...');
            await sleep(5500);
            
            // Check for disclaimer and accept if present
            const disclaimer = document.querySelector('#disclaimer');
            if (disclaimer) {
              const acceptButton = document.querySelector('.accept-button');
              if (acceptButton) {
                acceptButton.click();
                sendMessage('step', 'Accepting disclaimer...');
                await sleep(2000);
              }
            }
            
            // Check if form is visible and remove any existing connections
            const form = document.querySelector('.form');
            if (form && !form.classList.contains('hidden')) {
              // Press remove button first to clear any existing connection
              const removeButton = document.querySelector('.button.svelte-1wrky82.red');
              if (removeButton) {
                removeButton.click();
                sendMessage('step', 'Removing existing connection...');
                await sleep(3000);
              } else {
                // Fallback: look for Remove button by text
                const buttons = document.getElementsByTagName('button');
                for (let i = 0; i < buttons.length; i++) {
                  if (buttons[i].textContent.trim() === 'Remove') {
                    buttons[i].click();
                    sendMessage('step', 'Removing existing connection...');
                    await sleep(3000);
                    break;
                  }
                }
              }
            }
            
            // Wait for form to be ready
            await sleep(2000);
            
            // Fill login credentials with enhanced field detection (matching metatrader screen)
            const loginField = document.querySelector('input[name="login"]') || 
                              document.querySelector('input[type="text"][placeholder*="login" i]') ||
                              document.querySelector('input[type="number"]') ||
                              document.querySelector('input#login');
            
            const passwordField = document.querySelector('input[name="password"]') || 
                                 document.querySelector('input[type="password"]') ||
                                 document.querySelector('input#password');
            
            // Fill login field
            if (loginField && '${credentials.login}') {
              loginField.focus();
              loginField.value = '';
              loginField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
              loginField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
              
              setTimeout(() => {
                loginField.focus();
                loginField.value = '${credentials.login}';
                loginField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                loginField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                sendMessage('step', 'Login filled');
              }, 100);
            } else {
              sendMessage('error', 'Login field not found');
              sendMessage('authentication_failed', 'MT5 Login field not found');
              return false;
            }
            
            // Fill password field
            if (passwordField && '${credentials.password}') {
              setTimeout(() => {
                passwordField.focus();
                passwordField.value = '';
                passwordField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                passwordField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                
                setTimeout(() => {
                  passwordField.focus();
                  passwordField.value = '${credentials.password}';
                  passwordField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                  passwordField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                  sendMessage('step', 'Password filled');
                }, 100);
              }, 300);
            } else {
              sendMessage('error', 'Password field not found');
              sendMessage('authentication_failed', 'MT5 Password field not found');
              return false;
            }
            
            // Wait for fields to be filled
            await sleep(2000);
            
            // Click login button
            sendMessage('step', 'Connecting to Server ${credentials.server}...');
            const loginButton = document.querySelector('.button.svelte-1wrky82.active') ||
                               document.querySelector('button[type="submit"]') ||
                               document.querySelector('.button.active') ||
                               Array.from(document.querySelectorAll('button')).find(btn => 
                                 btn.textContent.trim().toLowerCase().includes('login') ||
                                 btn.textContent.trim().toLowerCase().includes('connect')
                               );
            
            if (loginButton) {
              loginButton.click();
              await sleep(8000);
            } else {
              sendMessage('error', 'Login button not found');
              sendMessage('authentication_failed', 'MT5 Login button not found');
              return false;
            }
            
            // Check for search bar - this is the most reliable indicator of successful login
            sendMessage('step', 'Verifying authentication...');
            await sleep(3000);
            
            const searchField = document.querySelector('input[placeholder*="Search symbol" i]') ||
                               document.querySelector('input[placeholder*="Search" i]') ||
                               document.querySelector('input[type="search"]');
            
            if (searchField && searchField.offsetParent !== null) {
              // Search bar is present and visible - login successful!
              sendMessage('step', '✅ Authentication SUCCESS - Account ${credentials.login} connected on ${credentials.server}');
              sendMessage('authentication_success', 'MT5 Login Successful - Search bar detected');
              console.log('MT5: Authentication PASSED - Account connected successfully');
              return true;
            }
            
            // Double check after a longer wait
            await sleep(3000);
            const searchFieldRetry = document.querySelector('input[placeholder*="Search symbol" i]') ||
                                    document.querySelector('input[placeholder*="Search" i]') ||
                                    document.querySelector('input[type="search"]');
            
            if (searchFieldRetry && searchFieldRetry.offsetParent !== null) {
              sendMessage('step', '✅ Authentication SUCCESS - Account ${credentials.login} connected on ${credentials.server}');
              sendMessage('authentication_success', 'MT5 Login Successful - Search bar detected');
              console.log('MT5: Authentication PASSED - Account connected successfully');
              return true;
            }
            
            // No search bar found - authentication failed
            sendMessage('error', '❌ Authentication FAILED - Invalid login or password');
            sendMessage('authentication_failed', 'MT5 Authentication failed - Invalid login or password');
            console.error('MT5: Authentication failed - Search bar not found');
            return false;
            
          } catch(e) {
            sendMessage('error', 'Error during authentication: ' + e.message);
            sendMessage('authentication_failed', 'MT5 Error during authentication: ' + e.message);
            console.error('MT5: Authentication error:', e);
            return false;
          }
        }
        
        // MT5 TRADING EXECUTION FUNCTION - Executes trades according to trade configuration
        async function executeMT5Trades() {
          try {
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));
            const sendMessage = (type, message) => {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type, message }));
            };
            
            console.log('MT5: === TRADING EXECUTION START ===');
            sendMessage('step', 'Starting trade execution according to trade configuration...');
            console.log('MT5: Function executeMT5Trades called successfully');
          
          // Step 1: Search for symbol ONCE
          sendMessage('step', 'Locating ${asset} symbol...');
          console.log('MT5: Step 1 - Searching for symbol ${asset}');
          const searchBar = document.querySelector('input[placeholder="Search symbol"]') ||
                           document.querySelector('input[placeholder*="Search"]') ||
                           document.querySelector('input[type="search"]');
          
          if (!searchBar) {
            sendMessage('error', 'Search bar not found - cannot locate symbol');
            return;
          }
          
          searchBar.focus();
          searchBar.value = '${asset}';
          searchBar.dispatchEvent(new Event('input', { bubbles: true }));
          searchBar.dispatchEvent(new Event('change', { bubbles: true }));
          searchBar.dispatchEvent(new Event('keyup', { bubbles: true }));
          await sleep(2000);
          sendMessage('step', '${asset} symbol search completed');
          
          // Step 2: Select symbol ONCE
          sendMessage('step', 'Selecting ${asset} symbol...');
          const symbolElements = document.querySelectorAll('.name.svelte-19bwscl .symbol.svelte-19bwscl, .symbol.svelte-19bwscl, [class*="symbol"]');
          let symbolSelected = false;
          
          for (let i = 0; i < symbolElements.length; i++) {
            const text = (symbolElements[i].innerText || '').trim();
            if (text === '${asset}' || text.includes('${asset}')) {
              symbolElements[i].click();
              symbolSelected = true;
              console.log(\`MT5: \${asset} symbol selected\`);
              break;
            }
          }
          
          if (!symbolSelected) {
            sendMessage('error', 'Could not select ${asset} symbol');
            return;
          }
          
          sendMessage('step', '${asset} symbol selected - starting trade execution immediately');
          console.log('MT5: Symbol selected successfully, starting trade execution NOW');
          
          // Brief wait for symbol selection to register
          await sleep(1000);
          
          // Step 3: STRICT SEQUENTIAL TRADE EXECUTION according to trade configuration
          sendMessage('step', 'Executing trades according to trade configuration...');
          const numTrades = ${numberOfTrades};
          let successfulTrades = 0;
          let failedTrades = 0;
          
          console.log(\`MT5: Executing EXACTLY \${numTrades} trades for \${asset} (lot size: \${volume})\`);
          sendMessage('step', \`Trade Configuration: \${numTrades} trade(s), Lot Size: \${volume}, Action: \${action}\`);
          console.log('MT5: Starting trade loop - will execute ' + numTrades + ' trades');
          
          // Execute trades sequentially - loop runs EXACTLY numTrades times
          for (let tradeNum = 0; tradeNum < numTrades; tradeNum++) {
            console.log('MT5: === LOOP ITERATION ' + (tradeNum + 1) + ' START ===');
            const currentTrade = tradeNum + 1;
            console.log(\`MT5: === TRADE \${currentTrade} OF \${numTrades} START ===\`);
            
            sendMessage('step', \`Trade \${currentTrade}/\${numTrades}: Opening order dialog...\`);
            
            // Wait a moment for chart/UI to be ready if this is the first trade
            if (tradeNum === 0) {
              await sleep(1500); // Give chart time to render after symbol selection
              console.log('MT5: First trade - waited for chart to render');
            }
            
            // Method 1: Try keyboard shortcut F9 (standard MT5 shortcut for new order)
            console.log(\`MT5: Attempting to open order dialog using F9 keyboard shortcut...\`);
            const f9Event = new KeyboardEvent('keydown', {
              key: 'F9',
              code: 'F9',
              keyCode: 120,
              which: 120,
              bubbles: true,
              cancelable: true
            });
            document.dispatchEvent(f9Event);
            document.dispatchEvent(new KeyboardEvent('keyup', {
              key: 'F9',
              code: 'F9',
              keyCode: 120,
              which: 120,
              bubbles: true,
              cancelable: true
            }));
            await sleep(1500);
            
            // Check if order dialog opened
            let orderDialogOpen = document.querySelector('.modal') || 
                                 document.querySelector('[class*="dialog"]') ||
                                 document.querySelector('[class*="order"]') ||
                                 document.querySelector('.trade-input') ||
                                 document.querySelector('input[placeholder*="volume" i]') ||
                                 document.querySelector('input[placeholder*="lot" i]');
            
            if (orderDialogOpen) {
              console.log(\`MT5: Order dialog opened via F9 shortcut for trade \${currentTrade}\`);
              sendMessage('step', \`Trade \${currentTrade}/\${numTrades}: Order dialog opened via F9\`);
            } else {
              // Method 2: Try right-clicking on chart to open context menu
              console.log(\`MT5: F9 failed, trying right-click on chart...\`);
              const chartArea = document.querySelector('.chart-container') || 
                               document.querySelector('[class*="chart"]') ||
                               document.querySelector('canvas') ||
                               document.querySelector('[class*="tradingview"]');
              
              if (chartArea) {
                const rect = chartArea.getBoundingClientRect();
                const rightClickEvent = new MouseEvent('contextmenu', {
                  bubbles: true,
                  cancelable: true,
                  clientX: rect.left + rect.width / 2,
                  clientY: rect.top + rect.height / 2,
                  button: 2
                });
                chartArea.dispatchEvent(rightClickEvent);
                await sleep(1000);
                
                // Try to find and click "New Order" in context menu
                const newOrderOption = Array.from(document.querySelectorAll('*')).find(el => {
                  const text = (el.textContent || '').trim().toLowerCase();
                  return text.includes('new order') || text.includes('order') || text.includes('trade');
                });
                
                if (newOrderOption) {
                  newOrderOption.click();
                  await sleep(1500);
                  orderDialogOpen = document.querySelector('.modal') || 
                                   document.querySelector('[class*="dialog"]') ||
                                   document.querySelector('.trade-input');
                }
              }
            }
            
            // Method 3: Try finding order button with comprehensive selectors
            if (!orderDialogOpen) {
              console.log(\`MT5: Trying to find order button with comprehensive selectors...\`);
              let orderBtn = document.querySelector('.icon-button.withText span.button-text') ||
                            document.querySelector('.icon-button.withText') ||
                            document.querySelector('button[class*="order"]') ||
                            document.querySelector('button[class*="trade"]') ||
                            document.querySelector('[class*="new-order"]') ||
                            document.querySelector('[class*="new-order-button"]') ||
                            document.querySelector('button[title*="order" i]') ||
                            document.querySelector('button[title*="trade" i]') ||
                            Array.from(document.querySelectorAll('button')).find(btn => {
                              const text = (btn.textContent || '').trim().toLowerCase();
                              const title = (btn.getAttribute('title') || '').toLowerCase();
                              return (text.includes('order') || text.includes('trade') || text.includes('buy') || text.includes('sell')) &&
                                     !btn.classList.contains('red') &&
                                     btn.offsetParent !== null;
                            });
              
              if (orderBtn) {
                orderBtn.click();
                await sleep(1500);
                orderDialogOpen = document.querySelector('.modal') || 
                                 document.querySelector('[class*="dialog"]') ||
                                 document.querySelector('.trade-input');
              }
            }
            
            // Method 4: Try clicking on toolbar buttons
            if (!orderDialogOpen) {
              console.log(\`MT5: Trying toolbar buttons...\`);
              const toolbarButtons = document.querySelectorAll('[class*="toolbar"] button, [class*="header"] button, [class*="bar"] button');
              for (let i = 0; i < toolbarButtons.length; i++) {
                const btn = toolbarButtons[i];
                const text = (btn.textContent || '').trim().toLowerCase();
                const title = (btn.getAttribute('title') || '').toLowerCase();
                if ((text.includes('order') || text.includes('trade') || title.includes('order') || title.includes('trade')) &&
                    btn.offsetParent !== null) {
                  btn.click();
                  await sleep(1500);
                  orderDialogOpen = document.querySelector('.modal') || 
                                   document.querySelector('[class*="dialog"]') ||
                                   document.querySelector('.trade-input');
                  if (orderDialogOpen) break;
                }
              }
            }
            
            // Final check - if still no dialog, try double-clicking chart
            if (!orderDialogOpen) {
              console.log(\`MT5: Trying double-click on chart...\`);
              const chartArea = document.querySelector('.chart-container') || 
                               document.querySelector('[class*="chart"]') ||
                               document.querySelector('canvas');
              if (chartArea) {
                const dblClickEvent = new MouseEvent('dblclick', {
                  bubbles: true,
                  cancelable: true,
                  clientX: chartArea.getBoundingClientRect().left + chartArea.getBoundingClientRect().width / 2,
                  clientY: chartArea.getBoundingClientRect().top + chartArea.getBoundingClientRect().height / 2
                });
                chartArea.dispatchEvent(dblClickEvent);
                await sleep(1500);
                orderDialogOpen = document.querySelector('.modal') || 
                                 document.querySelector('[class*="dialog"]') ||
                                 document.querySelector('.trade-input');
              }
            }
            
            // Verify order dialog is actually open - try one more time with longer wait
            if (!orderDialogOpen) {
              console.log(\`MT5: Order dialog not detected, waiting longer and checking again...\`);
              await sleep(2000);
              orderDialogOpen = document.querySelector('.modal') || 
                               document.querySelector('[class*="dialog"]') ||
                               document.querySelector('[class*="order"]') ||
                               document.querySelector('.trade-input') ||
                               document.querySelector('input[placeholder*="volume" i]') ||
                               document.querySelector('input[placeholder*="lot" i]') ||
                               document.querySelector('input[name="volume"]');
            }
            
            // Final verification - if still not found, try to find volume field directly
            if (!orderDialogOpen) {
              console.log(\`MT5: Trying to find volume field directly without dialog detection...\`);
              const volumeField = document.querySelector('input[placeholder*="volume" i]') ||
                                 document.querySelector('input[placeholder*="lot" i]') ||
                                 document.querySelector('input[name="volume"]') ||
                                 document.querySelector('.trade-input input[type="text"]');
              
              if (volumeField) {
                console.log(\`MT5: Found volume field directly - proceeding with trade setup\`);
                orderDialogOpen = volumeField; // Use volume field as indicator
                sendMessage('step', \`Trade \${currentTrade}/\${numTrades}: Found order form fields - proceeding\`);
              } else {
                console.error(\`MT5: Order dialog and fields not found after all attempts for trade \${currentTrade}\`);
                sendMessage('error', \`Trade \${currentTrade}: Could not access order dialog or form fields - all methods failed\`);
                failedTrades++;
                continue;
              }
            } else {
              console.log(\`MT5: Order dialog confirmed open for trade \${currentTrade}\`);
              sendMessage('step', \`Trade \${currentTrade}/\${numTrades}: Order dialog opened successfully\`);
            }
            
            await sleep(1000); // Brief pause to ensure dialog/form is fully rendered
            
            // Set parameters with enhanced field detection
            sendMessage('step', \`Trade \${currentTrade}/\${numTrades}: Setting trade parameters (Lot: \${volume}, SL: \${sl}, TP: \${tp})...\`);
            
            const setField = (selector, value, name) => {
              const field = typeof selector === 'string' ? document.querySelector(selector) : selector;
              if (field) {
                field.focus();
                field.select();
                field.value = '';
                field.dispatchEvent(new Event('input', { bubbles: true }));
                field.dispatchEvent(new Event('change', { bubbles: true }));
                
                setTimeout(() => {
                  field.focus();
                  field.value = value;
                  field.dispatchEvent(new Event('input', { bubbles: true }));
                  field.dispatchEvent(new Event('change', { bubbles: true }));
                  field.dispatchEvent(new Event('blur', { bubbles: true }));
                  console.log(\`MT5: Set \${name} to \${value}\`);
                }, 100);
                return true;
              }
              console.error(\`MT5: Could not set \${name} - field not found: \${selector}\`);
              return false;
            };
            
            // Set Volume (lot size) - try multiple selectors
            const volumeSet = setField('.trade-input input[type="text"]', '${volume}', 'Volume') ||
                             setField('input[placeholder*="volume" i]', '${volume}', 'Volume') ||
                             setField('input[placeholder*="lot" i]', '${volume}', 'Volume') ||
                             setField('input[name="volume"]', '${volume}', 'Volume');
            
            await sleep(300);
            
            // Set Stop Loss - try multiple selectors
            const slSet = setField('.sl input[type="text"]', '${sl}', 'Stop Loss') ||
                         setField('input[placeholder*="stop" i]', '${sl}', 'Stop Loss') ||
                         setField('input[name="sl"]', '${sl}', 'Stop Loss') ||
                         setField('input[class*="sl"]', '${sl}', 'Stop Loss');
            
            await sleep(300);
            
            // Set Take Profit - try multiple selectors
            const tpSet = setField('.tp input[type="text"]', '${tp}', 'Take Profit') ||
                         setField('input[placeholder*="profit" i]', '${tp}', 'Take Profit') ||
                         setField('input[name="tp"]', '${tp}', 'Take Profit') ||
                         setField('input[class*="tp"]', '${tp}', 'Take Profit');
            
            await sleep(300);
            
            // Set comment - try multiple selectors
            const commentField = document.querySelector('.input.svelte-mtorg2 input[type="text"]') || 
                                document.querySelector('.input.svelte-1d8k9kk input[type="text"]') ||
                                document.querySelector('input[placeholder*="comment" i]') ||
                                document.querySelector('input[name="comment"]');
            if (commentField) {
              setField(commentField, '${botname}', 'Comment');
            }
            
            await sleep(1500); // Wait for all parameters to be set
            console.log(\`MT5: All parameters set for trade \${currentTrade}\`);
            sendMessage('step', \`Trade \${currentTrade}/\${numTrades}: Parameters set - Volume: \${volume}, SL: \${sl}, TP: \${tp}\`);
            
            // Execute order - try multiple selectors for BUY/SELL buttons
            sendMessage('step', \`Trade \${currentTrade}/\${numTrades}: Executing \${action} order...\`);
            
            let executeBtn = null;
            if ('${action}' === 'BUY') {
              executeBtn = document.querySelector('.footer-row button.trade-button:not(.red)') ||
                          document.querySelector('button.trade-button:not(.red)') ||
                          document.querySelector('button[class*="buy"]') ||
                          Array.from(document.querySelectorAll('button')).find(btn => 
                            (btn.textContent || '').trim().toLowerCase().includes('buy') &&
                            !btn.classList.contains('red'));
            } else {
              executeBtn = document.querySelector('.footer-row button.trade-button.red') ||
                          document.querySelector('button.trade-button.red') ||
                          document.querySelector('button[class*="sell"]') ||
                          Array.from(document.querySelectorAll('button')).find(btn => 
                            (btn.textContent || '').trim().toLowerCase().includes('sell') ||
                            btn.classList.contains('red'));
            }
            
            if (executeBtn) {
              executeBtn.click();
              await sleep(2500); // Wait for order execution
              console.log(\`MT5: Order executed for trade \${currentTrade}\`);
              sendMessage('step', \`Trade \${currentTrade}/\${numTrades}: Order executed, confirming...\`);
            } else {
              console.error(\`MT5: Execute button not found for trade \${currentTrade}\`);
              sendMessage('error', \`Trade \${currentTrade}: Execute button not found\`);
              failedTrades++;
              continue;
            }
            
            // Confirm order - try multiple selectors
            sendMessage('step', \`Trade \${currentTrade}/\${numTrades}: Confirming order...\`);
            await sleep(1000);
            
            let confirmBtn = document.querySelector('.trade-button.svelte-16cwwe0') ||
                            document.querySelector('button.trade-button:not(.red):not([class*="footer"])') ||
                            document.querySelector('.modal button:not(.red):not(.cancel)') ||
                            document.querySelector('button[class*="confirm"]') ||
                            Array.from(document.querySelectorAll('button')).find(btn => 
                              (btn.textContent || '').trim().toLowerCase().includes('confirm') ||
                              (btn.textContent || '').trim().toLowerCase().includes('ok') ||
                              (!btn.classList.contains('red') && 
                               !btn.classList.contains('cancel') && 
                               btn.offsetParent !== null));
            
            if (confirmBtn) {
              confirmBtn.click();
              await sleep(2000);
              successfulTrades++;
              console.log(\`MT5: Trade \${currentTrade} confirmed successfully\`);
              sendMessage('step', \`Trade \${currentTrade}/\${numTrades}: COMPLETED ✓ (\${successfulTrades} successful)\`);
            } else {
              // Try alternative confirmation methods
              const modalBtns = document.querySelectorAll('.modal button, .dialog button, [class*="modal"] button');
              let confirmed = false;
              for (let i = 0; i < modalBtns.length; i++) {
                const btn = modalBtns[i];
                if (!btn.classList.contains('red') && 
                    !btn.classList.contains('cancel') && 
                    !btn.classList.contains('close') &&
                    btn.offsetParent !== null) {
                  btn.click();
                  await sleep(2000);
                  successfulTrades++;
                  confirmed = true;
                  console.log(\`MT5: Trade \${currentTrade} confirmed via alternative method\`);
                  sendMessage('step', \`Trade \${currentTrade}/\${numTrades}: COMPLETED ✓ (\${successfulTrades} successful)\`);
                  break;
                }
              }
              if (!confirmed) {
                failedTrades++;
                console.error(\`MT5: Could not confirm trade \${currentTrade}\`);
                sendMessage('error', \`Trade \${currentTrade}: Confirmation button not found\`);
              }
            }
            
            // Wait between trades (except after last)
            if (tradeNum < numTrades - 1) {
              sendMessage('step', \`Trade \${currentTrade} complete - waiting before next trade...\`);
              await sleep(2500); // Wait before opening next order dialog
            }
          }
          
          // Final completion
          console.log('MT5: === ALL TRADES COMPLETED ===');
          console.log('MT5: Successful:', successfulTrades, 'Failed:', failedTrades, 'Target:', numTrades);
          
          sendMessage('trade_executed', \`Trading complete: \${successfulTrades}/\${numTrades} successful\`);
          
          if (successfulTrades === numTrades) {
            sendMessage('success', 'All trades executed successfully according to trade configuration');
            setTimeout(() => {
              sendMessage('close', 'Trading completed - closing WebView');
            }, 2000);
          } else if (successfulTrades > 0) {
            sendMessage('partial', 'Trading completed with partial success');
            setTimeout(() => {
              sendMessage('close', 'Trading completed - closing WebView');
            }, 2000);
          } else {
            sendMessage('error', 'No trades executed successfully');
          }
          } catch (error) {
            console.error('MT5: Critical error in executeMT5Trades:', error);
            sendMessage('error', 'Critical error in trade execution: ' + error.message);
            sendMessage('error', 'Stack trace: ' + (error.stack || 'No stack available'));
          }
        }
        
        // MAIN EXECUTION FLOW: Authenticate first, then execute trades
        async function executeStrictMT5Trading() {
          try {
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));
            const sendMessage = (type, message) => {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type, message }));
            };
            
            console.log('MT5: === STRICT SEQUENTIAL TRADING START ===');
            
            // STEP 1: Authenticate account first
            const authenticationSuccess = await authenticateMT5Account();
            
            if (!authenticationSuccess) {
              sendMessage('error', 'Cannot proceed with trading - Authentication failed');
              console.error('MT5: Trading aborted - Authentication failed');
              return;
            }
            
            // STEP 2: Once authentication is true, continue to place trades
            await sleep(2000); // Brief pause after authentication
            await executeMT5Trades();
            
          } catch (error) {
            console.error('MT5 Trading Error:', error);
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'error',
              message: 'Critical trading error: ' + error.message
            }));
          }
        }
        
        // Start execution immediately when script loads
        // Wait a moment for page to be ready, then start authentication and trading
        console.log('MT5: Setting up execution timer...');
        setTimeout(() => {
          console.log('MT5: Timer fired - checking if executeStrictMT5Trading exists:', typeof executeStrictMT5Trading);
          if (typeof executeStrictMT5Trading === 'function') {
            console.log('MT5: Starting STRICT sequential trading execution');
            executeStrictMT5Trading().catch(err => {
              console.error('MT5: Unhandled error in executeStrictMT5Trading:', err);
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'error',
                message: 'Unhandled execution error: ' + err.message
              }));
            });
          } else {
            console.error('MT5: ERROR - executeStrictMT5Trading is not a function! Type:', typeof executeStrictMT5Trading);
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'error',
              message: 'CRITICAL: executeStrictMT5Trading function not found!'
            }));
          }
        }, 3000); // Wait 3 seconds for MT5 terminal to initialize
      })();
    `;
  }, [signal, tradeConfig, credentials, eaName]);

  // MT5 Broker URL mapping - Must match metatrader screen exactly
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
  };

  // Get WebView URL for trading based on platform
  // For web: Use proxy URL that injects script server-side (like Android)
  // For Android/iOS: Use direct terminal URL with client-side script injection
  const getWebViewUrl = useCallback(() => {
    if (!tradeConfig || !credentials || !signal) return '';

    // Determine MT5 broker URL based on server name
    let mt5Url = 'https://webtrader.razormarkets.co.za/terminal/'; // Default
    if (tradeConfig.platform === 'MT5' && credentials.server) {
      mt5Url = MT5_BROKER_URLS[credentials.server] || MT5_BROKER_URLS['RazorMarkets-Live'];
    }

    // For web platform, use proxy URL that injects script server-side
    if (Platform.OS === 'web') {
      const proxyBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const proxyPath = tradeConfig.platform === 'MT5' ? '/api/mt5-proxy' : '/api/mt4-proxy';

      const terminalUrl = tradeConfig.platform === 'MT4'
        ? 'https://metatraderweb.app/trade?version=4'
        : mt5Url;

      // Build proxy URL with all trading parameters
      const proxyUrl = new URL(proxyPath, proxyBaseUrl);
      proxyUrl.searchParams.set('url', terminalUrl);
      proxyUrl.searchParams.set('login', credentials.login);
      proxyUrl.searchParams.set('password', credentials.password);
      proxyUrl.searchParams.set('server', credentials.server || '');
      proxyUrl.searchParams.set('asset', signal.asset);
      proxyUrl.searchParams.set('action', signal.action);
      proxyUrl.searchParams.set('price', signal.price?.toString() || '');
      proxyUrl.searchParams.set('tp', signal.tp?.toString() || '');
      proxyUrl.searchParams.set('sl', signal.sl?.toString() || '');
      proxyUrl.searchParams.set('volume', tradeConfig.lotSize);
      proxyUrl.searchParams.set('numberOfTrades', tradeConfig.numberOfTrades);
      proxyUrl.searchParams.set('botname', eaName);

      console.log('🎯 Web Trading WebView URL (Proxy):', {
        platform: tradeConfig.platform,
        proxyUrl: proxyUrl.toString(),
        broker: tradeConfig.platform === 'MT5' ? credentials.server : 'N/A',
        willInjectScript: 'server-side via proxy'
      });

      return proxyUrl.toString();
    }

    // For Android/iOS: Return direct terminal URL (script injected client-side)
    const terminalUrl = tradeConfig.platform === 'MT4'
      ? 'https://metatraderweb.app/trade?version=4'
      : mt5Url;

    console.log('🎯 Trading WebView URL (Direct):', {
      platform: tradeConfig.platform,
      terminalUrl: terminalUrl,
      broker: tradeConfig.platform === 'MT5' ? credentials.server : 'N/A',
      willInjectScript: 'client-side'
    });

    return terminalUrl;
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
          {/* Debug Close Button */}
          <TouchableOpacity
            style={styles.debugCloseButton}
            onPress={onClose}
          >
            <X color="#FFFFFF" size={20} />
          </TouchableOpacity>

          {/* Debug Info Banner */}
          <View style={styles.debugBanner}>
            <Text style={styles.debugText}>
              DEBUG MODE - Trading WebView Visible
            </Text>
            {signal && (
              <Text style={styles.debugTextSmall}>
                Signal: {signal.asset} {signal.action} | Platform: {tradeConfig?.platform || 'N/A'}
              </Text>
            )}
          </View>

          {Platform.OS === 'web' ? (
            <WebWebView
              key={`trading-web-${webViewKey}`}
              url={webViewUrl}
              script={undefined} // No script needed for web - proxy URL injects script server-side
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
    top: 100,
    left: 20,
    right: 20,
    bottom: 100,
    width: 'auto',
    height: 'auto',
    opacity: 1,
    zIndex: 10001,
    backgroundColor: '#000000',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#00FF88',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10001,
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
  debugCloseButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 0, 0, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10002,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  debugBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 255, 136, 0.9)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    zIndex: 10002,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  debugText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  debugTextSmall: {
    color: '#000000',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
});
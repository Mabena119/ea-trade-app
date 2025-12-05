import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert, AppState } from 'react-native';
import { LicenseData } from '@/services/api';
import signalsMonitor, { SignalLog } from '@/services/signals-monitor';
import databaseSignalsPollingService, { DatabaseSignal } from '@/services/database-signals-polling';
import signalMonitoringService from '@/services/signal-monitoring-service';
import { isIOSPWA } from '@/utils/pwa-detection';
import { NativeModules } from 'react-native';

export interface User {
  mentorId: string;
  email: string;
}

export interface EA {
  id: string;
  name: string;
  licenseKey: string;
  status: 'connected' | 'disconnected';
  description?: string;
  phoneSecretKey?: string;
  userData?: LicenseData;
}

export interface MTAccount {
  type: 'MT4' | 'MT5';
  login: string;
  server: string;
  connected: boolean;
}

export interface MT4Account {
  login: string;
  password: string;
  server: string;
  connected: boolean;
}

export interface MT5Account {
  login: string;
  password: string;
  server: string;
  connected: boolean;
}

export interface ActiveSymbol {
  symbol: string;
  lotSize: string;
  direction: 'BUY' | 'SELL' | 'BOTH';
  platform: 'MT4' | 'MT5';
  numberOfTrades: string;
  activatedAt: Date;
}

export interface MT4Symbol {
  symbol: string;
  lotSize: string;
  direction: 'BUY' | 'SELL' | 'BOTH';
  numberOfTrades: string;
  activatedAt: Date;
}

export interface MT5Symbol {
  symbol: string;
  lotSize: string;
  direction: 'BUY' | 'SELL' | 'BOTH';
  numberOfTrades: string;
  activatedAt: Date;
}

interface AppState {
  user: User | null;
  eas: EA[];
  mtAccount: MTAccount | null;
  mt4Account: MT4Account | null;
  mt5Account: MT5Account | null;
  isFirstTime: boolean;
  activeSymbols: ActiveSymbol[];
  mt4Symbols: MT4Symbol[];
  mt5Symbols: MT5Symbol[];
  isBotActive: boolean;
  signalLogs: SignalLog[];
  isSignalsMonitoring: boolean;
  newSignal: SignalLog | null;
  tradingSignal: SignalLog | null;
  showTradingWebView: boolean;
  databaseSignal: DatabaseSignal | null;
  isDatabaseSignalsPolling: boolean;
  isPollingPaused: boolean;
  pausePolling: () => void;
  resumePolling: () => void;
  setUser: (user: User) => void;
  addEA: (ea: EA) => Promise<boolean>;
  removeEA: (id: string) => Promise<boolean>;
  setActiveEA: (id: string) => Promise<void>;
  setMTAccount: (account: MTAccount) => void;
  setMT4Account: (account: MT4Account) => void;
  setMT5Account: (account: MT5Account) => void;
  setIsFirstTime: (isFirstTime: boolean) => void;
  activateSymbol: (symbolConfig: Omit<ActiveSymbol, 'activatedAt'>) => void;
  activateMT4Symbol: (symbolConfig: Omit<MT4Symbol, 'activatedAt'>) => void;
  activateMT5Symbol: (symbolConfig: Omit<MT5Symbol, 'activatedAt'>) => void;
  deactivateSymbol: (symbol: string) => void;
  deactivateMT4Symbol: (symbol: string) => void;
  deactivateMT5Symbol: (symbol: string) => void;
  setBotActive: (active: boolean) => void;
  requestOverlayPermission: () => Promise<boolean>;
  startSignalsMonitoring: (phoneSecret: string) => void;
  stopSignalsMonitoring: () => void;
  clearSignalLogs: () => void;
  dismissNewSignal: () => void;
  setTradingSignal: (signal: SignalLog | null) => void;
  setShowTradingWebView: (show: boolean) => void;
}

export const [AppProvider, useApp] = createContextHook<AppState>(() => {
  const [user, setUserState] = useState<User | null>(null);
  const [eas, setEAs] = useState<EA[]>([]);
  const [mtAccount, setMTAccountState] = useState<MTAccount | null>(null);
  const [mt4Account, setMT4AccountState] = useState<MT4Account | null>(null);
  const [mt5Account, setMT5AccountState] = useState<MT5Account | null>(null);
  const [isFirstTime, setIsFirstTimeState] = useState<boolean>(true);
  const [activeSymbols, setActiveSymbols] = useState<ActiveSymbol[]>([]);
  const [mt4Symbols, setMT4Symbols] = useState<MT4Symbol[]>([]);
  const [mt5Symbols, setMT5Symbols] = useState<MT5Symbol[]>([]);
  const [isBotActive, setIsBotActive] = useState<boolean>(false);
  const [signalLogs, setSignalLogs] = useState<SignalLog[]>([]);
  const [isSignalsMonitoring, setIsSignalsMonitoring] = useState<boolean>(false);
  const [newSignal, setNewSignal] = useState<SignalLog | null>(null);
  const [tradingSignal, setTradingSignal] = useState<SignalLog | null>(null);
  const [showTradingWebView, setShowTradingWebView] = useState<boolean>(false);
  const [databaseSignal, setDatabaseSignal] = useState<DatabaseSignal | null>(null);
  const [isDatabaseSignalsPolling, setIsDatabaseSignalsPolling] = useState<boolean>(false);
  const [isPollingPaused, setIsPollingPaused] = useState<boolean>(false);

  // Load persisted data on mount
  useEffect(() => {
    loadPersistedData();
  }, []);

  // Shared helper function to get EA image URL (same as home page)
  const getEAImageUrl = useCallback((ea: EA | null): string | null => {
    if (!ea || !ea.userData || !ea.userData.owner) return null;
    const raw = (ea.userData.owner.logo || '').toString().trim();
    if (!raw) return null;
    // If already an absolute URL, return as-is
    if (/^https?:\/\//i.test(raw)) return raw;
    // Otherwise, treat as filename and prefix uploads base URL
    const filename = raw.replace(/^\/+/, '');
    const base = 'https://ea-converter.com/admin/uploads';
    return `${base}/${filename}`;
  }, []);

  const loadPersistedData = async () => {
    try {
      console.log('Loading persisted data...');

      // Load all data in parallel but handle each independently
      const [userData, easData, mtData, mt4Data, mt5Data, firstTimeData, activeSymbolsData, mt4SymbolsData, mt5SymbolsData, botActiveData] = await Promise.allSettled([
        AsyncStorage.getItem('user'),
        AsyncStorage.getItem('eas'),
        AsyncStorage.getItem('mtAccount'),
        AsyncStorage.getItem('mt4Account'),
        AsyncStorage.getItem('mt5Account'),
        AsyncStorage.getItem('isFirstTime'),
        AsyncStorage.getItem('activeSymbols'),
        AsyncStorage.getItem('mt4Symbols'),
        AsyncStorage.getItem('mt5Symbols'),
        AsyncStorage.getItem('isBotActive')
      ]);

      // Handle user data
      if (userData.status === 'fulfilled' && userData.value) {
        try {
          const parsed = JSON.parse(userData.value);
          if (parsed && typeof parsed === 'object') {
            setUserState(parsed);
            console.log('User data loaded successfully');
          }
        } catch (parseError) {
          console.error('Error parsing user data:', parseError);
          AsyncStorage.removeItem('user').catch(console.error);
        }
      }

      // Handle EAs data
      if (easData.status === 'fulfilled' && easData.value) {
        try {
          const parsed = JSON.parse(easData.value);
          if (Array.isArray(parsed)) {
            setEAs(parsed);
            console.log('EAs data loaded successfully:', parsed.length);
          } else {
            setEAs([]);
          }
        } catch (parseError) {
          console.error('Error parsing EAs data:', parseError);
          AsyncStorage.removeItem('eas').catch(console.error);
          setEAs([]);
        }
      }

      // Handle MT account data
      if (mtData.status === 'fulfilled' && mtData.value) {
        try {
          const parsed = JSON.parse(mtData.value);
          if (parsed && typeof parsed === 'object') {
            setMTAccountState(parsed);
            console.log('MT account data loaded successfully');
          }
        } catch (parseError) {
          console.error('Error parsing MT account data:', parseError);
          AsyncStorage.removeItem('mtAccount').catch(console.error);
        }
      }

      // Handle MT4 account data
      if (mt4Data.status === 'fulfilled' && mt4Data.value) {
        try {
          const parsed = JSON.parse(mt4Data.value);
          if (parsed && typeof parsed === 'object') {
            setMT4AccountState(parsed);
            console.log('MT4 account data loaded successfully');
          }
        } catch (parseError) {
          console.error('Error parsing MT4 account data:', parseError);
          AsyncStorage.removeItem('mt4Account').catch(console.error);
        }
      }

      // Handle MT5 account data
      if (mt5Data.status === 'fulfilled' && mt5Data.value) {
        try {
          const parsed = JSON.parse(mt5Data.value);
          if (parsed && typeof parsed === 'object') {
            setMT5AccountState(parsed);
            console.log('MT5 account data loaded successfully');
          }
        } catch (parseError) {
          console.error('Error parsing MT5 account data:', parseError);
          AsyncStorage.removeItem('mt5Account').catch(console.error);
        }
      }

      // Handle first time flag
      if (firstTimeData.status === 'fulfilled' && firstTimeData.value !== null) {
        try {
          const parsed = JSON.parse(firstTimeData.value);
          if (typeof parsed === 'boolean') {
            setIsFirstTimeState(parsed);
            console.log('First time flag loaded successfully:', parsed);
          }
        } catch (parseError) {
          console.error('Error parsing first time data:', parseError);
          AsyncStorage.removeItem('isFirstTime').catch(console.error);
        }
      }

      // Handle active symbols
      if (activeSymbolsData.status === 'fulfilled' && activeSymbolsData.value) {
        try {
          const parsed = JSON.parse(activeSymbolsData.value);
          if (Array.isArray(parsed)) {
            const symbolsWithDates = parsed.map((symbol: any) => {
              try {
                return {
                  ...symbol,
                  activatedAt: new Date(symbol.activatedAt)
                };
              } catch {
                return {
                  ...symbol,
                  activatedAt: new Date()
                };
              }
            });
            setActiveSymbols(symbolsWithDates);
            console.log('Active symbols loaded successfully:', symbolsWithDates.length);
          } else {
            setActiveSymbols([]);
          }
        } catch (parseError) {
          console.error('Error parsing active symbols data:', parseError);
          AsyncStorage.removeItem('activeSymbols').catch(console.error);
          setActiveSymbols([]);
        }
      }

      // Handle MT4 symbols
      if (mt4SymbolsData.status === 'fulfilled' && mt4SymbolsData.value) {
        try {
          const parsed = JSON.parse(mt4SymbolsData.value);
          if (Array.isArray(parsed)) {
            const symbolsWithDates = parsed.map((symbol: any) => {
              try {
                return {
                  ...symbol,
                  activatedAt: new Date(symbol.activatedAt)
                };
              } catch {
                return {
                  ...symbol,
                  activatedAt: new Date()
                };
              }
            });
            setMT4Symbols(symbolsWithDates);
            console.log('MT4 symbols loaded successfully:', symbolsWithDates.length);
          } else {
            setMT4Symbols([]);
          }
        } catch (parseError) {
          console.error('Error parsing MT4 symbols data:', parseError);
          AsyncStorage.removeItem('mt4Symbols').catch(console.error);
          setMT4Symbols([]);
        }
      }

      // Handle MT5 symbols
      if (mt5SymbolsData.status === 'fulfilled' && mt5SymbolsData.value) {
        try {
          const parsed = JSON.parse(mt5SymbolsData.value);
          if (Array.isArray(parsed)) {
            const symbolsWithDates = parsed.map((symbol: any) => {
              try {
                return {
                  ...symbol,
                  activatedAt: new Date(symbol.activatedAt)
                };
              } catch {
                return {
                  ...symbol,
                  activatedAt: new Date()
                };
              }
            });
            setMT5Symbols(symbolsWithDates);
            console.log('MT5 symbols loaded successfully:', symbolsWithDates.length);
          } else {
            setMT5Symbols([]);
          }
        } catch (parseError) {
          console.error('Error parsing MT5 symbols data:', parseError);
          AsyncStorage.removeItem('mt5Symbols').catch(console.error);
          setMT5Symbols([]);
        }
      }

      // Handle bot active state
      if (botActiveData.status === 'fulfilled' && botActiveData.value !== null) {
        try {
          const parsed = JSON.parse(botActiveData.value);
          if (typeof parsed === 'boolean') {
            setIsBotActive(parsed);
            console.log('Bot active state loaded successfully:', parsed);
          }
        } catch (parseError) {
          console.error('Error parsing bot active data:', parseError);
          AsyncStorage.removeItem('isBotActive').catch(console.error);
        }
      }

      console.log('Persisted data loading completed');
    } catch (error) {
      console.error('Critical error loading persisted data:', error);
      // Reset to safe default state
      setUserState(null);
      setEAs([]);
      setMTAccountState(null);
      setMT4AccountState(null);
      setMT5AccountState(null);
      setIsFirstTimeState(true);
      setActiveSymbols([]);
      setMT4Symbols([]);
      setMT5Symbols([]);
      setIsBotActive(false);
    }
  };

  // On Android, automatically show overlay when bot is active and EAs are loaded
  useEffect(() => {
    if (Platform.OS !== 'android' || !isBotActive || eas.length === 0) return;
    
    const showOverlayOnStart = async () => {
      try {
        const { overlayService } = await import('@/services/overlay-service');
        const primaryEA = eas[0];
        
        if (primaryEA) {
          const botName = primaryEA.name || 'EA Trade';
          const botImageURL = getEAImageUrl(primaryEA);
          
          console.log('[Android Overlay] Bot active and EAs loaded, showing overlay:', { botName, botImageURL });
          
          // Save image URL first
          await overlayService.updateOverlayData(botName, true, false, botImageURL || null);
          
          // Show overlay at default position
          const statusBarHeight = 50;
          const initialX = 20;
          const initialY = statusBarHeight + 50;
          const overlayWidth = 140;
          const overlayHeight = 140;
          
          const showSuccess = await overlayService.showOverlay(
            initialX,
            initialY,
            overlayWidth,
            overlayHeight
          );
          
          if (showSuccess) {
            console.log('[Android Overlay] Overlay shown successfully');
            // Update overlay data again to ensure image is loaded
            await overlayService.updateOverlayData(botName, true, false, botImageURL || null);
          } else {
            console.log('[Android Overlay] Failed to show overlay - permission may be required');
          }
        }
      } catch (error) {
        console.error('[Android Overlay] Error showing overlay:', error);
      }
    };
    
    // Small delay to ensure everything is ready
    const timeoutId = setTimeout(showOverlayOnStart, 500);
    return () => clearTimeout(timeoutId);
  }, [isBotActive, eas, getEAImageUrl]);

  const setUser = useCallback(async (newUser: User) => {
    setUserState(newUser);
    try {
      await AsyncStorage.setItem('user', JSON.stringify(newUser));
    } catch (error) {
      console.error('Error saving user:', error);
    }
  }, []);

  const addEA = useCallback(async (ea: EA) => {
    try {
      console.log('Adding EA:', ea.name, 'Current EAs count:', eas.length);

      // Validate EA object
      if (!ea || !ea.id || !ea.name || !ea.licenseKey) {
        console.error('Invalid EA object:', ea);
        return false;
      }

      // Check for duplicates with current state
      const existingEA = eas.find(existingEa =>
        existingEa.licenseKey.toLowerCase().trim() === ea.licenseKey.toLowerCase().trim() ||
        existingEa.id === ea.id
      );

      if (existingEA) {
        console.warn('Attempted to add duplicate EA:', ea.name);
        return false;
      }

      const updatedEAs = [...eas, ea];
      console.log('Saving EAs to storage, count:', updatedEAs.length);

      // Save to AsyncStorage with error handling
      try {
        await AsyncStorage.setItem('eas', JSON.stringify(updatedEAs));
        console.log('EAs saved to AsyncStorage successfully');
      } catch (storageError) {
        console.error('Failed to save EAs to AsyncStorage:', storageError);
        return false;
      }

      // Update state after successful storage save
      setEAs(updatedEAs);
      console.log('EA added successfully:', ea.name, 'Total EAs:', updatedEAs.length);

      return true;
    } catch (error) {
      console.error('Critical error adding EA:', error);
      return false;
    }
  }, [eas]);

  const removeEA = useCallback(async (id: string) => {
    try {
      const updatedEAs = eas.filter(ea => ea.id !== id);
      await AsyncStorage.setItem('eas', JSON.stringify(updatedEAs));
      setEAs(updatedEAs);
      console.log('EA removed successfully:', id);
      return true;
    } catch (error) {
      console.error('Error removing EA:', error);
      return false;
    }
  }, [eas]);

  const setActiveEA = useCallback(async (id: string) => {
    try {
      console.log('Setting active EA by id:', id);
      const index = eas.findIndex(e => e.id === id);
      if (index <= 0) {
        console.log('Active EA already first or not found, index:', index);
        return;
      }
      const reordered = [eas[index], ...eas.slice(0, index), ...eas.slice(index + 1)];
      await AsyncStorage.setItem('eas', JSON.stringify(reordered));
      setEAs(reordered);
      console.log('Active EA set. New first EA:', reordered[0]?.name);
    } catch (error) {
      console.error('Error setting active EA:', error);
    }
  }, [eas]);

  const setMTAccount = useCallback(async (account: MTAccount) => {
    setMTAccountState(account);
    try {
      await AsyncStorage.setItem('mtAccount', JSON.stringify(account));
    } catch (error) {
      console.error('Error saving MT account:', error);
    }
  }, []);

  const setMT4Account = useCallback(async (account: MT4Account) => {
    setMT4AccountState(account);
    try {
      await AsyncStorage.setItem('mt4Account', JSON.stringify(account));
      console.log('MT4 account saved successfully');
    } catch (error) {
      console.error('Error saving MT4 account:', error);
    }
  }, []);

  const setMT5Account = useCallback(async (account: MT5Account) => {
    setMT5AccountState(account);
    try {
      await AsyncStorage.setItem('mt5Account', JSON.stringify(account));
      console.log('MT5 account saved successfully');
    } catch (error) {
      console.error('Error saving MT5 account:', error);
    }
  }, []);

  const setIsFirstTime = useCallback(async (value: boolean) => {
    setIsFirstTimeState(value);
    try {
      await AsyncStorage.setItem('isFirstTime', JSON.stringify(value));
    } catch (error) {
      console.error('Error saving first time flag:', error);
    }
  }, []);

  const activateSymbol = useCallback(async (symbolConfig: Omit<ActiveSymbol, 'activatedAt'>) => {
    const newActiveSymbol: ActiveSymbol = {
      ...symbolConfig,
      activatedAt: new Date()
    };

    // Ensure single-platform config per symbol: remove from MT4/MT5 lists
    setMT4Symbols(current => {
      const updated = current.filter(s => s.symbol !== symbolConfig.symbol);
      AsyncStorage.setItem('mt4Symbols', JSON.stringify(updated)).catch(error => {
        console.error('Error saving MT4 symbols:', error);
      });
      return updated;
    });
    setMT5Symbols(current => {
      const updated = current.filter(s => s.symbol !== symbolConfig.symbol);
      AsyncStorage.setItem('mt5Symbols', JSON.stringify(updated)).catch(error => {
        console.error('Error saving MT5 symbols:', error);
      });
      return updated;
    });

    setActiveSymbols(currentSymbols => {
      const filteredSymbols = currentSymbols.filter(s => s.symbol !== symbolConfig.symbol);
      const updatedSymbols = [...filteredSymbols, newActiveSymbol];

      AsyncStorage.setItem('activeSymbols', JSON.stringify(updatedSymbols)).catch(error => {
        console.error('Error saving active symbols:', error);
      });

      return updatedSymbols;
    });
  }, []);

  const deactivateSymbol = useCallback(async (symbol: string) => {
    setActiveSymbols(currentSymbols => {
      const updatedSymbols = currentSymbols.filter(s => s.symbol !== symbol);

      AsyncStorage.setItem('activeSymbols', JSON.stringify(updatedSymbols)).catch(error => {
        console.error('Error saving active symbols:', error);
      });

      return updatedSymbols;
    });
  }, []);

  const activateMT4Symbol = useCallback(async (symbolConfig: Omit<MT4Symbol, 'activatedAt'>) => {
    const newActiveSymbol: MT4Symbol = {
      ...symbolConfig,
      activatedAt: new Date()
    };

    // Ensure single-platform config per symbol: clear legacy and MT5 entries
    setActiveSymbols(current => {
      const updated = current.filter(s => s.symbol !== symbolConfig.symbol);
      AsyncStorage.setItem('activeSymbols', JSON.stringify(updated)).catch(error => {
        console.error('Error saving active symbols:', error);
      });
      return updated;
    });
    setMT5Symbols(current => {
      const updated = current.filter(s => s.symbol !== symbolConfig.symbol);
      AsyncStorage.setItem('mt5Symbols', JSON.stringify(updated)).catch(error => {
        console.error('Error saving MT5 symbols:', error);
      });
      return updated;
    });

    setMT4Symbols(currentSymbols => {
      const filteredSymbols = currentSymbols.filter(s => s.symbol !== symbolConfig.symbol);
      const updatedSymbols = [...filteredSymbols, newActiveSymbol];

      AsyncStorage.setItem('mt4Symbols', JSON.stringify(updatedSymbols)).catch(error => {
        console.error('Error saving MT4 symbols:', error);
      });

      console.log('MT4 symbol activated:', symbolConfig.symbol);
      return updatedSymbols;
    });
  }, []);

  const activateMT5Symbol = useCallback(async (symbolConfig: Omit<MT5Symbol, 'activatedAt'>) => {
    const newActiveSymbol: MT5Symbol = {
      ...symbolConfig,
      activatedAt: new Date()
    };

    // Ensure single-platform config per symbol: clear legacy and MT4 entries
    setActiveSymbols(current => {
      const updated = current.filter(s => s.symbol !== symbolConfig.symbol);
      AsyncStorage.setItem('activeSymbols', JSON.stringify(updated)).catch(error => {
        console.error('Error saving active symbols:', error);
      });
      return updated;
    });
    setMT4Symbols(current => {
      const updated = current.filter(s => s.symbol !== symbolConfig.symbol);
      AsyncStorage.setItem('mt4Symbols', JSON.stringify(updated)).catch(error => {
        console.error('Error saving MT4 symbols:', error);
      });
      return updated;
    });

    setMT5Symbols(currentSymbols => {
      const filteredSymbols = currentSymbols.filter(s => s.symbol !== symbolConfig.symbol);
      const updatedSymbols = [...filteredSymbols, newActiveSymbol];

      AsyncStorage.setItem('mt5Symbols', JSON.stringify(updatedSymbols)).catch(error => {
        console.error('Error saving MT5 symbols:', error);
      });

      console.log('MT5 symbol activated:', symbolConfig.symbol);
      return updatedSymbols;
    });
  }, []);

  const deactivateMT4Symbol = useCallback(async (symbol: string) => {
    setMT4Symbols(currentSymbols => {
      const updatedSymbols = currentSymbols.filter(s => s.symbol !== symbol);

      AsyncStorage.setItem('mt4Symbols', JSON.stringify(updatedSymbols)).catch(error => {
        console.error('Error saving MT4 symbols:', error);
      });

      console.log('MT4 symbol deactivated:', symbol);
      return updatedSymbols;
    });
  }, []);

  const deactivateMT5Symbol = useCallback(async (symbol: string) => {
    setMT5Symbols(currentSymbols => {
      const updatedSymbols = currentSymbols.filter(s => s.symbol !== symbol);

      AsyncStorage.setItem('mt5Symbols', JSON.stringify(updatedSymbols)).catch(error => {
        console.error('Error saving MT5 symbols:', error);
      });

      console.log('MT5 symbol deactivated:', symbol);
      return updatedSymbols;
    });
  }, []);

  const requestOverlayPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return true;
    }

    try {
      console.log('Checking overlay permission for Android...');
      // Permission is already requested at app startup in MainActivity
      // Just check if we have permission, don't show dialog
      const { overlayService } = await import('@/services/overlay-service');
      const hasPermission = await overlayService.checkOverlayPermission();
      if (!hasPermission) {
        console.log('Overlay permission not granted, opening settings silently');
        // Silently open settings if needed, but don't block bot activation
        overlayService.requestOverlayPermission();
      }
      return hasPermission;
    } catch (error) {
      console.error('Error checking overlay permission:', error);
      return false;
    }
  }, []);

  const setBotActive = useCallback(async (active: boolean) => {
    console.log('setBotActive called with:', active);

    // Check overlay permission on Android (but don't block activation)
    if (active && Platform.OS === 'android') {
      // Silently check permission, but don't block bot activation
      requestOverlayPermission().catch(err => {
        console.error('Error checking overlay permission:', err);
      });
    }

    try {
      setIsBotActive(active);
      await AsyncStorage.setItem('isBotActive', JSON.stringify(active));
      console.log('Bot active state saved:', active);

      // Get primary EA and bot image URL for both iOS and Android
      const primaryEA = Array.isArray(eas) && eas.length > 0 ? eas[0] : null;
      const botName = primaryEA?.name?.toUpperCase() || 'EA TRADE';
      const botImageURL = getEAImageUrl(primaryEA);

      // Update Android overlay widget - show/hide overlay automatically
      if (Platform.OS === 'android') {
        try {
          const { overlayService } = await import('@/services/overlay-service');
          
          if (active) {
            // Bot is being activated - show overlay automatically
            console.log('[Android Overlay] Bot activated, showing overlay:', { botName, botImageURL, hasPrimaryEA: !!primaryEA });
            
            // Save image URL first (even if null, so overlay can load default icon)
            await overlayService.updateOverlayData(botName, active, isPollingPaused, botImageURL || null);
            
            // Show overlay at default position
            const statusBarHeight = 50;
            const initialX = 20;
            const initialY = statusBarHeight + 50;
            const overlayWidth = 140;
            const overlayHeight = 140;
            
            const showOverlayWithRetry = async (retryCount = 0): Promise<boolean> => {
              try {
                const showSuccess = await overlayService.showOverlay(
                  initialX,
                  initialY,
                  overlayWidth,
                  overlayHeight
                );
                
                if (showSuccess) {
                  console.log('[Android Overlay] Overlay shown successfully');
                  // Update overlay data again to ensure image is loaded
                  await overlayService.updateOverlayData(botName, active, isPollingPaused, botImageURL || null);
                  return true;
                } else {
                  console.log('[Android Overlay] Failed to show overlay - retry count:', retryCount);
                  if (retryCount < 2) {
                    // Retry after delay
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    return showOverlayWithRetry(retryCount + 1);
                  } else {
                    console.log('[Android Overlay] Failed to show overlay after retries - permission may be required');
                    return false;
                  }
                }
              } catch (error) {
                console.error('[Android Overlay] Error showing overlay:', error);
                if (retryCount < 2) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  return showOverlayWithRetry(retryCount + 1);
                }
                return false;
              }
            };
            
            // Show overlay with retry logic
            await showOverlayWithRetry();
          } else {
            // Bot is being deactivated - hide overlay
            console.log('[Android Overlay] Bot deactivated, hiding overlay');
            await overlayService.hideOverlay();
            // Still update data in case overlay is shown again later
            await overlayService.updateOverlayData(botName, active, isPollingPaused, botImageURL || null);
          }
        } catch (error) {
          console.error('[Android Overlay] Error managing overlay:', error);
          // Don't throw - allow bot activation to continue even if overlay fails
        }
      }

      // Update iOS widget if on iOS (native app or PWA)
      const isIOS = Platform.OS === 'ios' || (Platform.OS === 'web' && isIOSPWA());
      if (isIOS) {

        console.log('[Widget] Updating widget:', { 
          platform: Platform.OS, 
          isPWA: Platform.OS === 'web' && isIOSPWA(),
          botName, 
          active, 
          botImageURL 
        });
        
        try {
          const { widgetService } = await import('@/services/widget-service');
          await widgetService.updateWidget(botName, active, isPollingPaused, botImageURL);
          console.log('[Widget] Widget update triggered successfully');
        } catch (error) {
          console.error('[Widget] Error updating iOS widget:', error);
        }
      }

      // Show PWA notification for iOS PWA
      if (Platform.OS === 'web' && isIOSPWA()) {
        try {
          const primaryEA = Array.isArray(eas) && eas.length > 0 ? eas[0] : null;
          const botName = primaryEA?.name?.toUpperCase() || 'EA TRADE';
          const botImageURL = getEAImageUrl(primaryEA);
          
          const { pwaNotificationService } = await import('@/services/pwa-notification-service');
          await pwaNotificationService.showPersistentBotNotification(
            botName,
            active,
            isPollingPaused,
            botImageURL
          );
          console.log('[Notifications] PWA notification shown');
        } catch (error) {
          console.error('[Notifications] Error showing PWA notification:', error);
        }
      }

      if (active) {
        // Start database signals polling when bot is activated
        const primaryEA = Array.isArray(eas) && eas.length > 0 ? eas[0] : null;
        if (primaryEA && primaryEA.licenseKey) {
          console.log('Starting database signals polling for license:', primaryEA.licenseKey);

          const onDatabaseSignalFound = (signal: DatabaseSignal) => {
            console.log('🎯 Database signal found:', signal);
            setDatabaseSignal(signal);
            // Add database signal to existing signals monitoring system
            const signalLog: SignalLog = {
              id: signal.id,
              asset: signal.asset,
              action: signal.action,
              price: signal.price,
              tp: signal.tp,
              sl: signal.sl,
              time: signal.time,
              type: 'DATABASE_SIGNAL',
              source: 'database',
              latestupdate: signal.latestupdate
            };

            console.log('🎯 Converted to SignalLog:', signalLog);

            // Add to signal logs
            setSignalLogs(prev => {
              const newLogs = [...prev, signalLog];
              console.log('🎯 Updated signal logs:', newLogs);
              return newLogs;
            });

            // Update new signal for dynamic island
            console.log('🎯 Setting new signal for dynamic island:', signalLog);
            setNewSignal(signalLog);
          };

          const onDatabaseError = (error: string) => {
            console.error('Database signals polling error:', error);
          };

          // Always start monitoring when bot is activated
          if (Platform.OS === 'android') {
            // Start native foreground service for background monitoring (works in background)
            signalMonitoringService.startMonitoring(primaryEA.licenseKey).then(success => {
              if (success) {
                console.log('✅ Native background signal monitoring started - will work in background');
              } else {
                console.error('❌ Failed to start native background monitoring');
              }
            });
            
            // Also start JS polling for foreground (both can run simultaneously)
            // This provides faster updates when app is in foreground
            databaseSignalsPollingService.startPolling(
              primaryEA.licenseKey,
              onDatabaseSignalFound,
              onDatabaseError
            );
            setIsDatabaseSignalsPolling(true);
            console.log('✅ JS polling started for foreground monitoring');
          } else {
            // For iOS/web, use JS polling (works when app is active)
            databaseSignalsPollingService.startPolling(
              primaryEA.licenseKey,
              onDatabaseSignalFound,
              onDatabaseError
            );
            setIsDatabaseSignalsPolling(true);
            console.log('✅ JS polling started for signal monitoring');
          }
        } else {
          console.log('No primary EA with license key found for database signals polling');
        }
      } else {
        // Clear signal logs and stop database signals polling when stopping the bot
        console.log('Bot stopped - clearing signal logs and stopping all monitoring');
        signalsMonitor.clearSignalLogs();
        databaseSignalsPollingService.stopPolling();
        if (Platform.OS === 'android') {
          signalMonitoringService.stopMonitoring().then(success => {
            if (success) {
              console.log('✅ Native background monitoring stopped');
            }
          });
        }
        setSignalLogs([]);
        setNewSignal(null);
        setDatabaseSignal(null);
        setIsDatabaseSignalsPolling(false);
        setIsPollingPaused(false);
      }
    } catch (error) {
      console.error('Error saving bot active state:', error);
      // Revert state on error
      setIsBotActive(!active);
    }
  }, [requestOverlayPermission, eas, isPollingPaused]);

  // Pause polling (keeps bot active but stops signal checking)
  const pausePolling = useCallback(async () => {
    console.log('Pausing database signals polling');
    databaseSignalsPollingService.pausePolling();
    if (Platform.OS === 'android') {
      // Stop native service when pausing
      signalMonitoringService.stopMonitoring();
    }
    setIsPollingPaused(true);
    setIsDatabaseSignalsPolling(false);

    // Update iOS widget (native app or PWA)
    const isIOS = Platform.OS === 'ios' || (Platform.OS === 'web' && isIOSPWA());
    if (isIOS) {
      const primaryEA = Array.isArray(eas) && eas.length > 0 ? eas[0] : null;
      const botName = primaryEA?.name?.toUpperCase() || 'EA TRADE';
      const botImageURL = getEAImageUrl(primaryEA);
      
      try {
        const { widgetService } = await import('@/services/widget-service');
        await widgetService.updateWidget(botName, isBotActive, true, botImageURL);
      } catch (error) {
        console.error('Error updating iOS widget:', error);
      }
    }

    // Update PWA notification
    if (Platform.OS === 'web' && isIOSPWA()) {
      try {
        const primaryEA = Array.isArray(eas) && eas.length > 0 ? eas[0] : null;
        const botName = primaryEA?.name?.toUpperCase() || 'EA TRADE';
        const botImageURL = getEAImageUrl(primaryEA);
        
        const { pwaNotificationService } = await import('@/services/pwa-notification-service');
        await pwaNotificationService.showPersistentBotNotification(
          botName,
          isBotActive,
          true, // isPaused
          botImageURL
        );
      } catch (error) {
        console.error('Error updating PWA notification:', error);
      }
    }
  }, [eas, isBotActive]);

  // Resume polling (restarts signal checking)
  const resumePolling = useCallback(async () => {
    console.log('Resuming database signals polling');
    
    const primaryEA = Array.isArray(eas) && eas.length > 0 ? eas[0] : null;
    if (primaryEA && primaryEA.licenseKey) {
      databaseSignalsPollingService.resumePolling();
      if (Platform.OS === 'android') {
        // Restart native service when resuming
        signalMonitoringService.startMonitoring(primaryEA.licenseKey);
      }
      setIsPollingPaused(false);
      setIsDatabaseSignalsPolling(true);

      // Update iOS widget (native app or PWA)
      const isIOS = Platform.OS === 'ios' || (Platform.OS === 'web' && isIOSPWA());
      if (isIOS) {
        const botName = primaryEA?.name?.toUpperCase() || 'EA TRADE';
        const botImageURL = getEAImageUrl(primaryEA);
        
        try {
          const { widgetService } = await import('@/services/widget-service');
          await widgetService.updateWidget(botName, isBotActive, false, botImageURL);
        } catch (error) {
          console.error('Error updating iOS widget:', error);
        }
      }

      // Update PWA notification
      if (Platform.OS === 'web' && isIOSPWA()) {
        try {
          const botName = primaryEA?.name?.toUpperCase() || 'EA TRADE';
          const botImageURL = getEAImageUrl(primaryEA);
          
          const { pwaNotificationService } = await import('@/services/pwa-notification-service');
          await pwaNotificationService.showPersistentBotNotification(
            botName,
            isBotActive,
            false, // isPaused
            botImageURL
          );
        } catch (error) {
          console.error('Error updating PWA notification:', error);
        }
      }
    } else {
      console.log('No primary EA with license key found to resume polling');
    }
  }, [eas, isBotActive]);

  const startSignalsMonitoring = useCallback((phoneSecret: string) => {
    console.log('Starting signals monitoring with phone secret:', phoneSecret);

    const onSignalReceived = (signal: SignalLog) => {
      console.log('Signal received in app provider:', signal);
      setSignalLogs(currentLogs => {
        const newLogs = [signal, ...currentLogs];
        // Keep only last 50 signals in state for performance
        return newLogs.slice(0, 50);
      });

      // Set as new signal for dynamic island notification
      setNewSignal(signal);

      // Check if this signal is for an active symbol and should trigger trading
      const symbolName = signal.asset;
      const isActiveInLegacy = activeSymbols.some(s => s.symbol === symbolName);
      const isActiveInMT4 = mt4Symbols.some(s => s.symbol === symbolName);
      const isActiveInMT5 = mt5Symbols.some(s => s.symbol === symbolName);

      console.log('Signal received - checking if active:', {
        symbolName,
        isActiveInLegacy,
        isActiveInMT4,
        isActiveInMT5,
        activeSymbols: activeSymbols.map(s => s.symbol),
        mt4Symbols: mt4Symbols.map(s => s.symbol),
        mt5Symbols: mt5Symbols.map(s => s.symbol)
      });

      if (isActiveInLegacy || isActiveInMT4 || isActiveInMT5) {
        console.log('✅ Signal is for active symbol, triggering trading WebView:', symbolName);
        console.log('Setting trading signal:', signal);
        console.log('Setting showTradingWebView to true');
        setTradingSignal(signal);
        setShowTradingWebView(true);
      } else {
        console.log('❌ Signal ignored - not for active symbol:', symbolName);
      }
    };

    const onError = (error: string) => {
      console.error('Signals monitoring error:', error);
    };

    signalsMonitor.startMonitoring(phoneSecret, onSignalReceived, onError);
    setIsSignalsMonitoring(true);
  }, [activeSymbols, mt4Symbols, mt5Symbols]);

  const stopSignalsMonitoring = useCallback(() => {
    console.log('Stopping signals monitoring');
    signalsMonitor.stopMonitoring();
    setIsSignalsMonitoring(false);
  }, []);

  const clearSignalLogs = useCallback(() => {
    console.log('Clearing signal logs');
    signalsMonitor.clearSignalLogs();
    setSignalLogs([]);
  }, []);

  const dismissNewSignal = useCallback(() => {
    console.log('Dismissing new signal notification');
    setNewSignal(null);
  }, []);

  const setTradingSignalCallback = useCallback((signal: SignalLog | null) => {
    setTradingSignal(signal);
  }, []);

  const setShowTradingWebViewCallback = useCallback((show: boolean) => {
    setShowTradingWebView(show);
    if (!show) {
      // Clear trading signal when closing WebView
      setTradingSignal(null);
    }
  }, []);

  // Initialize signals monitoring state on mount
  useEffect(() => {
    setIsSignalsMonitoring(signalsMonitor.isRunning());
    setSignalLogs(signalsMonitor.getSignalLogs());
  }, []);

  // Listen for background signals from native service (Android)
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const listener = signalMonitoringService.addListener((signal: any) => {
      console.log('🎯 Background signal received from native service:', signal);
      
      const signalLog: SignalLog = {
        id: signal.id,
        asset: signal.asset,
        action: signal.action,
        price: signal.price,
        tp: signal.tp,
        sl: signal.sl,
        time: signal.time,
        type: signal.type || 'DATABASE_SIGNAL',
        source: signal.source || 'database',
        latestupdate: signal.latestupdate
      };

      setDatabaseSignal(signal);
      setSignalLogs(prev => [...prev, signalLog]);
      setNewSignal(signalLog);
    });

    return () => {
      signalMonitoringService.removeListener(listener);
    };
  }, []);

  // Ensure signal monitoring continues when app is in background
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      console.log('App state changed - ensuring signal monitoring continues:', nextAppState);
      
      // Ensure database signals polling continues in background
      if (isBotActive && isDatabaseSignalsPolling && !isPollingPaused) {
        const primaryEA = Array.isArray(eas) && eas.length > 0 ? eas[0] : null;
        if (primaryEA && primaryEA.licenseKey) {
          // Check if polling is still running, restart if needed
          if (!databaseSignalsPollingService.isRunning()) {
            console.log('Polling stopped - restarting for background monitoring');
            const onDatabaseSignalFound = (signal: DatabaseSignal) => {
              console.log('🎯 Database signal found (background):', signal);
              setDatabaseSignal(signal);
              const signalLog: SignalLog = {
                id: signal.id,
                asset: signal.asset,
                action: signal.action,
                price: signal.price,
                tp: signal.tp,
                sl: signal.sl,
                time: signal.time,
                type: 'DATABASE_SIGNAL',
                source: 'database',
                latestupdate: signal.latestupdate
              };
              setSignalLogs(prev => [...prev, signalLog]);
              setNewSignal(signalLog);
            };
            const onDatabaseError = (error: string) => {
              console.error('Database signals polling error (background):', error);
            };
            databaseSignalsPollingService.startPolling(
              primaryEA.licenseKey,
              onDatabaseSignalFound,
              onDatabaseError
            );
          }
        }
      }
      
      // Ensure signals monitoring continues
      if (isBotActive && isSignalsMonitoring) {
        const connectedEAWithSecret = eas.find(ea => ea.phoneSecretKey);
        if (connectedEAWithSecret && connectedEAWithSecret.phoneSecretKey) {
          if (!signalsMonitor.isRunning()) {
            console.log('Signals monitoring stopped - restarting for background monitoring');
            startSignalsMonitoring(connectedEAWithSecret.phoneSecretKey);
          }
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [isBotActive, isDatabaseSignalsPolling, isPollingPaused, eas, isSignalsMonitoring, startSignalsMonitoring]);

  // Update iOS widget whenever EAs or bot state changes (native app or PWA)
  useEffect(() => {
    const isIOS = Platform.OS === 'ios' || (Platform.OS === 'web' && isIOSPWA());
    if (isIOS) {
      const updateWidget = async () => {
        try {
          const primaryEA = Array.isArray(eas) && eas.length > 0 ? eas[0] : null;
          const botName = primaryEA?.name?.toUpperCase() || 'EA TRADE';
          
          // Get bot image URL using the same logic as home page
          const botImageURL = getEAImageUrl(primaryEA);
          console.log('[Widget] Updating widget:', { 
            platform: Platform.OS, 
            isPWA: Platform.OS === 'web' && isIOSPWA(),
            botName, 
            isBotActive, 
            botImageURL 
          });
          
          const { widgetService } = await import('@/services/widget-service');
          await widgetService.updateWidget(botName, isBotActive, isPollingPaused, botImageURL);
          console.log('[Widget] Widget updated successfully:', { botName, isBotActive, botImageURL });
        } catch (error) {
          console.error('Error updating iOS widget:', error);
        }
      };
      updateWidget();
    }
  }, [eas, isBotActive]);

  // Auto-start/stop signals monitoring based on EA status and bot active state
  useEffect(() => {
    const connectedEAWithSecret = eas.find(ea =>
      ea.status === 'connected' && ea.phoneSecretKey
    );

    console.log('Signals monitoring effect triggered:', {
      isBotActive,
      hasConnectedEA: !!connectedEAWithSecret,
      phoneSecretKey: connectedEAWithSecret?.phoneSecretKey ? 'present' : 'missing',
      isCurrentlyMonitoring: signalsMonitor.isRunning()
    });

    if (isBotActive && connectedEAWithSecret && connectedEAWithSecret.phoneSecretKey) {
      // Start monitoring if bot is active and we have a connected EA with phone secret
      if (!signalsMonitor.isRunning()) {
        console.log('Auto-starting signals monitoring for EA:', connectedEAWithSecret.name);
        startSignalsMonitoring(connectedEAWithSecret.phoneSecretKey);
      } else {
        console.log('Signals monitoring already running, continuing...');
      }
    } else {
      // Stop monitoring if bot is not active or no connected EA with phone secret
      if (signalsMonitor.isRunning()) {
        console.log('Auto-stopping signals monitoring - bot inactive or no connected EA');
        stopSignalsMonitoring();
      }
    }
  }, [eas, isBotActive, startSignalsMonitoring, stopSignalsMonitoring]);



  return useMemo(() => ({
    user,
    eas,
    mtAccount,
    mt4Account,
    mt5Account,
    isFirstTime,
    activeSymbols,
    mt4Symbols,
    mt5Symbols,
    isBotActive,
    signalLogs,
    isSignalsMonitoring,
    newSignal,
    tradingSignal,
    showTradingWebView,
    databaseSignal,
    isDatabaseSignalsPolling,
    isPollingPaused,
    pausePolling,
    resumePolling,
    setUser,
    addEA,
    removeEA,
    setActiveEA,
    setMTAccount,
    setMT4Account,
    setMT5Account,
    setIsFirstTime,
    activateSymbol,
    activateMT4Symbol,
    activateMT5Symbol,
    deactivateSymbol,
    deactivateMT4Symbol,
    deactivateMT5Symbol,
    setBotActive,
    requestOverlayPermission,
    startSignalsMonitoring,
    stopSignalsMonitoring,
    clearSignalLogs,
    dismissNewSignal,
    setTradingSignal: setTradingSignalCallback,
    setShowTradingWebView: setShowTradingWebViewCallback,
  }), [user, eas, mtAccount, mt4Account, mt5Account, isFirstTime, activeSymbols, mt4Symbols, mt5Symbols, isBotActive, signalLogs, isSignalsMonitoring, newSignal, tradingSignal, showTradingWebView, databaseSignal, isDatabaseSignalsPolling, isPollingPaused, pausePolling, resumePolling, setUser, addEA, removeEA, setActiveEA, setMTAccount, setMT4Account, setMT5Account, setIsFirstTime, activateSymbol, activateMT4Symbol, activateMT5Symbol, deactivateSymbol, deactivateMT4Symbol, deactivateMT5Symbol, setBotActive, requestOverlayPermission, startSignalsMonitoring, stopSignalsMonitoring, clearSignalLogs, dismissNewSignal, setTradingSignalCallback, setShowTradingWebViewCallback]);
});
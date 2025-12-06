import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert, AppState, Linking } from 'react-native';
import { LicenseData } from '@/services/api';
import signalsMonitor, { SignalLog } from '@/services/signals-monitor';
import databaseSignalsPollingService, { DatabaseSignal } from '@/services/database-signals-polling';
import { isIOSPWA } from '@/utils/pwa-detection';

// Lazy imports for Android-only native services to prevent web initialization errors
const getBackgroundMonitoringService = async () => {
  if (Platform.OS !== 'android') return null;
  try {
    const module = await import('@/services/background-monitoring-service');
    return module.default;
  } catch (error) {
    console.log('[AppProvider] Failed to load backgroundMonitoringService (non-critical):', error);
    return null;
  }
};

const getSignalMonitoringService = async () => {
  if (Platform.OS !== 'android') return null;
  try {
    const module = await import('@/services/signal-monitoring-service');
    return module.default;
  } catch (error) {
    console.log('[AppProvider] Failed to load signalMonitoringService (non-critical):', error);
    return null;
  }
};

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
  showMT5SignalWebView: boolean;
  mt5Signal: SignalLog | null;
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
  setShowMT5SignalWebView: (show: boolean) => void;
  setMT5Signal: (signal: SignalLog | null) => void;
  markTradeExecuted: (symbol: string) => void;
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
  const [showMT5SignalWebView, setShowMT5SignalWebView] = useState<boolean>(false);
  const [mt5Signal, setMT5Signal] = useState<SignalLog | null>(null);
  const [databaseSignal, setDatabaseSignal] = useState<DatabaseSignal | null>(null);
  const [isDatabaseSignalsPolling, setIsDatabaseSignalsPolling] = useState<boolean>(false);
  const [isPollingPaused, setIsPollingPaused] = useState<boolean>(false);
  // Track processed signal IDs to prevent duplicates
  const processedSignalIdsRef = useRef<Set<number>>(new Set());
  // Track last trade execution time per symbol (45-second cooldown)
  const lastTradeExecutionRef = useRef<Map<string, number>>(new Map());

  // Helper function to check if signal is recent and not already processed
  const shouldProcessSignal = useCallback((signalId: number, symbol: string, time?: string, latestupdate?: string): { shouldProcess: boolean; ageInSeconds: number; reason?: string } => {
    // Check if signal was already processed
    if (processedSignalIdsRef.current.has(signalId)) {
      return { shouldProcess: false, ageInSeconds: -1, reason: 'already_processed' };
    }

    // Note: Cooldown is now handled by global pausePolling (35 seconds), not per-symbol

    // Compare both time and latestupdate from database, use the most recent one
    const now = new Date().getTime();
    let signalTime: Date | null = null;

    if (time) {
      signalTime = new Date(time);
    }
    if (latestupdate) {
      const latestUpdateTime = new Date(latestupdate);
      // Use the most recent timestamp between time and latestupdate
      if (!signalTime || latestUpdateTime.getTime() > signalTime.getTime()) {
        signalTime = latestUpdateTime;
      }
    }

    if (!signalTime || isNaN(signalTime.getTime())) {
      return { shouldProcess: false, ageInSeconds: -1, reason: 'invalid_time' };
    }

    const ageInSeconds = (now - signalTime.getTime()) / 1000;
    // If signal is more than 30 seconds old (based on most recent timestamp), ignore it
    const isRecent = ageInSeconds <= 30;

    if (isRecent) {
      // Mark as processed
      processedSignalIdsRef.current.add(signalId);
      // Clean up old IDs (keep only last 1000 to prevent memory leak)
      if (processedSignalIdsRef.current.size > 1000) {
        const idsArray = Array.from(processedSignalIdsRef.current);
        processedSignalIdsRef.current.clear();
        idsArray.slice(-500).forEach(id => processedSignalIdsRef.current.add(id));
      }
    }

    return { shouldProcess: isRecent, ageInSeconds };
  }, []);

  // Mark trade as executed (pauses monitoring for 35 seconds)
  const markTradeExecuted = useCallback(async (symbol: string) => {
    lastTradeExecutionRef.current.set(symbol, Date.now());
    console.log('✅ Trade executed for', symbol, '- Keeping monitoring paused for 35 seconds');

    // Monitoring is already paused when WebView opened, just keep it paused for 35 seconds
    // Resume after 35 seconds
    setTimeout(async () => {
      await resumePolling();
      console.log('▶️ Monitoring resumed after 35-second pause');
    }, 35000);

    // Clean up old entries (keep only last 100 symbols)
    if (lastTradeExecutionRef.current.size > 100) {
      const entries = Array.from(lastTradeExecutionRef.current.entries());
      lastTradeExecutionRef.current.clear();
      entries.slice(-50).forEach(([sym, time]) => lastTradeExecutionRef.current.set(sym, time));
    }
  }, [pausePolling, resumePolling]);

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
    const base = 'https://www.eatrade.io/admin/uploads';
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

      // Stop background monitoring service when bot is deactivated
      if (!active && Platform.OS === 'android') {
        const backgroundService = await getBackgroundMonitoringService();
        if (backgroundService) {
          backgroundService.stopMonitoring().catch(err => {
            console.log('Error stopping background monitoring service (non-critical):', err);
          });
          backgroundService.removeListener();
        }
      }

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

            // Check if signal should be processed (recent and not duplicate)
            const { shouldProcess, ageInSeconds, reason, cooldownRemaining } = shouldProcessSignal(signal.id, signal.asset, signal.time, signal.latestupdate);

            if (!shouldProcess) {
              if (reason === 'already_processed') {
                console.log('⏭️ Signal already processed, ignoring:', signal.asset, 'ID:', signal.id);
              } else if (reason === 'cooldown' && cooldownRemaining) {
                console.log('⏸️ Symbol in cooldown (' + cooldownRemaining.toFixed(1) + 's remaining), ignoring:', signal.asset, 'ID:', signal.id);
              } else if (reason === 'invalid_time') {
                console.log('⏭️ Signal has invalid time, ignoring:', signal.asset, 'ID:', signal.id);
              } else {
                console.log('⏰ Signal too old (' + ageInSeconds.toFixed(1) + 's), ignoring:', signal.asset, 'ID:', signal.id);
              }
              return;
            }

            console.log('✅ Signal is recent (' + ageInSeconds.toFixed(1) + 's old), processing:', signal.asset, 'ID:', signal.id);

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

            // Open MT5 WebView for ANY signal if MT5 account is connected
            if (mt5Account && mt5Account.connected) {
              console.log('🚀 Opening MT5 WebView for database signal:', signalLog.asset);
              // Pause monitoring when trades start executing
              pausePolling().catch(err => {
                console.error('Error pausing polling when opening WebView:', err);
              });
              setMT5Signal(signalLog);
              setShowMT5SignalWebView(true);
              // Note: markTradeExecuted will be called when trades complete, not here
            }

            setNewSignal(signalLog);
          };

          const onDatabaseError = (error: string) => {
            console.error('Database signals polling error:', error);
          };

          // Always start monitoring when bot is activated
          if (Platform.OS === 'android') {
            console.log('🚀 Starting native background monitoring service for license:', primaryEA.licenseKey);
            // Start native foreground service for reliable background monitoring
            const backgroundService = await getBackgroundMonitoringService();
            if (backgroundService) {
              backgroundService.startMonitoring(primaryEA.licenseKey).then(success => {
                if (success) {
                  console.log('✅ Native background monitoring service started - will work reliably in background');
                  console.log('📡 Service will poll every 10 seconds and bring app to foreground on signal');
                } else {
                  console.log('⚠️ Native background monitoring service not available - using database polling service');
                }
              }).catch(err => {
                console.error('❌ Native background monitoring service error:', err);
                console.log('ℹ️ Falling back to database polling service');
              });
            }

            // Also try legacy signal monitoring service (non-critical)
            const signalService = await getSignalMonitoringService();
            if (signalService) {
              signalService.startMonitoring(primaryEA.licenseKey).then(success => {
                if (success) {
                  console.log('✅ Legacy native background signal monitoring started');
                }
              }).catch(err => {
                console.log('ℹ️ Legacy native monitoring error (non-critical):', err);
              });
            }

            // Also start JS polling for foreground (both can run simultaneously)
            // This provides faster updates when app is in foreground
            databaseSignalsPollingService.startPolling(
              primaryEA.licenseKey,
              onDatabaseSignalFound,
              onDatabaseError
            );
            setIsDatabaseSignalsPolling(true);

            // Listen for signals from native background service
            if (Platform.OS === 'android') {
              const backgroundService = await getBackgroundMonitoringService();
              if (!backgroundService) {
                console.log('⚠️ Background monitoring service not available for listener');
              } else {
                const nativeListener = backgroundService.addListener((signal: any) => {
                console.log('🎯 Signal received from native background service:', signal);
                console.log('📱 App will be brought to foreground by native service');

                // Convert to DatabaseSignal format
                const databaseSignal: DatabaseSignal = {
                  id: signal.id?.toString() || '',
                  ea: signal.ea?.toString() || '',
                  asset: signal.asset || '',
                  latestupdate: signal.latestupdate || '',
                  type: signal.type || '',
                  action: signal.action || '',
                  price: signal.price?.toString() || '0',
                  tp: signal.tp?.toString() || '0',
                  sl: signal.sl?.toString() || '0',
                  time: signal.time || '',
                  results: signal.results || ''
                };

                // Check if signal should be processed (recent and not duplicate)
                const { shouldProcess, ageInSeconds, reason, cooldownRemaining } = shouldProcessSignal(signal.id, signal.asset, signal.time, signal.latestupdate);

                if (!shouldProcess) {
                  if (reason === 'already_processed') {
                    console.log('⏭️ Native signal already processed, ignoring:', signal.asset, 'ID:', signal.id);
                  } else if (reason === 'cooldown' && cooldownRemaining) {
                    console.log('⏸️ Native signal in cooldown (' + cooldownRemaining.toFixed(1) + 's remaining), ignoring:', signal.asset, 'ID:', signal.id);
                  } else if (reason === 'invalid_time') {
                    console.log('⏭️ Native signal has invalid time, ignoring:', signal.asset, 'ID:', signal.id);
                  } else {
                    console.log('⏰ Native signal too old (' + ageInSeconds.toFixed(1) + 's), ignoring:', signal.asset, 'ID:', signal.id);
                  }
                  return;
                }

                console.log('✅ Native signal is recent (' + ageInSeconds.toFixed(1) + 's old), processing:', signal.asset, 'ID:', signal.id);

                setDatabaseSignal(databaseSignal);
                const signalLog: SignalLog = {
                  id: databaseSignal.id,
                  asset: databaseSignal.asset,
                  action: databaseSignal.action,
                  price: databaseSignal.price,
                  tp: databaseSignal.tp,
                  sl: databaseSignal.sl,
                  time: databaseSignal.time,
                  type: 'DATABASE_SIGNAL',
                  source: 'native_background',
                  latestupdate: databaseSignal.latestupdate
                };
                setSignalLogs(prev => [...prev, signalLog]);

                // Open MT5 WebView for ANY signal if MT5 account is connected
                if (mt5Account && mt5Account.connected) {
                  console.log('🚀 Opening MT5 WebView for native background signal:', signalLog.asset);
                  // Pause monitoring when trades start executing
                  pausePolling().catch(err => {
                    console.error('Error pausing polling when opening WebView:', err);
                  });
                  setMT5Signal(signalLog);
                  setShowMT5SignalWebView(true);
                  // Note: markTradeExecuted will be called when trades complete, not here
                }

                setNewSignal(signalLog);
              });

                // Store listener for cleanup
                if (backgroundService) {
                  (backgroundService as any)._listener = nativeListener;
                  console.log('✅ Native background service listener registered');
                }
              }
            }
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
          const backgroundService = await getBackgroundMonitoringService();
          if (backgroundService) {
            backgroundService.stopMonitoring().then(success => {
              if (success) {
                console.log('✅ Background monitoring service stopped');
              }
            }).catch(err => {
              console.log('Error stopping background monitoring service (non-critical):', err);
            });
            backgroundService.removeListener();
          }
          const signalService = await getSignalMonitoringService();
          if (signalService) {
            signalService.stopMonitoring().then(success => {
              if (success) {
                console.log('✅ Legacy native background monitoring stopped');
              }
            });
          }
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
  }, [requestOverlayPermission, eas, isPollingPaused, mt5Account]);

  // Pause polling (keeps bot active but stops signal checking)
  const pausePolling = useCallback(async () => {
    if (isPollingPaused) {
      return; // Already paused
    }
    console.log('Pausing database signals polling');
    databaseSignalsPollingService.pausePolling();
    if (Platform.OS === 'android') {
      // Stop native services when pausing
      const backgroundService = await getBackgroundMonitoringService();
      if (backgroundService) {
        backgroundService.stopMonitoring().catch(err => {
          console.log('Error stopping background monitoring service (non-critical):', err);
        });
      }
      const signalService = await getSignalMonitoringService();
      if (signalService) {
        signalService.stopMonitoring();
      }
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
  }, [eas, isBotActive, isPollingPaused]);

  // Bring app to foreground (Android)
  const bringAppToForeground = useCallback(async () => {
    if (Platform.OS === 'android') {
      try {
        // Check if app is in background
        const currentState = AppState.currentState;
        if (currentState === 'background' || currentState === 'inactive') {
          console.log('📱 App is in background, bringing to foreground...');
          // Use deep link to bring app to foreground
          await Linking.openURL('myapp://trade-signal');
          console.log('✅ App brought to foreground');
        }
      } catch (error) {
        console.error('Error bringing app to foreground:', error);
      }
    }
  }, []);

  // Resume polling (restarts signal checking)
  const resumePolling = useCallback(async () => {
    if (!isPollingPaused) {
      return; // Already resumed
    }
    console.log('▶️ Resuming database signals polling');

    const primaryEA = Array.isArray(eas) && eas.length > 0 ? eas[0] : null;
    if (primaryEA && primaryEA.licenseKey) {
      databaseSignalsPollingService.resumePolling();
      if (Platform.OS === 'android') {
        console.log('🔄 Restarting native background monitoring service after pause...');
        // Restart native foreground service when resuming
        const backgroundService = await getBackgroundMonitoringService();
        if (backgroundService) {
          backgroundService.startMonitoring(primaryEA.licenseKey).then(success => {
            if (success) {
              console.log('✅ Background monitoring service restarted - will continue polling in background');
              console.log('📡 Native service will poll every 10 seconds and bring app to foreground on signal');
            } else {
              console.warn('⚠️ Background monitoring service restart returned false');
            }
          }).catch(err => {
            console.error('❌ Background monitoring service restart failed:', err);
            console.log('ℹ️ Falling back to JavaScript polling only');
          });
        }
        // Also try legacy service (non-critical)
        const signalService = await getSignalMonitoringService();
        if (signalService) {
          signalService.startMonitoring(primaryEA.licenseKey).catch(err => {
            console.log('ℹ️ Legacy native monitoring restart failed (non-critical):', err);
          });
        }
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
  }, [eas, isBotActive, mt5Account]);

  const startSignalsMonitoring = useCallback((phoneSecret: string) => {
    console.log('Starting signals monitoring with phone secret:', phoneSecret);

    const onSignalReceived = (signal: SignalLog) => {
      console.log('Signal received in app provider:', signal);

      // Check if signal should be processed (recent and not duplicate)
      const { shouldProcess, ageInSeconds, reason, cooldownRemaining } = shouldProcessSignal(signal.id, signal.asset, signal.time, signal.latestupdate);

      if (!shouldProcess) {
        if (reason === 'already_processed') {
          console.log('⏭️ Signal already processed, ignoring:', signal.asset, 'ID:', signal.id);
        } else if (reason === 'cooldown' && cooldownRemaining) {
          console.log('⏸️ Symbol in cooldown (' + cooldownRemaining.toFixed(1) + 's remaining), ignoring:', signal.asset, 'ID:', signal.id);
        } else if (reason === 'invalid_time') {
          console.log('⏭️ Signal has invalid time, ignoring:', signal.asset, 'ID:', signal.id);
        } else {
          console.log('⏰ Signal too old (' + ageInSeconds.toFixed(1) + 's), ignoring:', signal.asset, 'ID:', signal.id);
        }
        return;
      }

      console.log('✅ Signal is recent (' + ageInSeconds.toFixed(1) + 's old), processing:', signal.asset, 'ID:', signal.id);

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
        console.log('✅ Signal is for active symbol:', symbolName);
      } else {
        console.log('❌ Signal ignored - not for active symbol:', symbolName);
      }

      // Open MT5 WebView for ANY signal if MT5 account is connected
      if (mt5Account && mt5Account.connected) {
        console.log('🚀 Opening MT5 WebView for signal:', symbolName);
        // Pause monitoring when trades start executing
        pausePolling().catch(err => {
          console.error('Error pausing polling when opening WebView:', err);
        });
        setMT5Signal(signal);
        setShowMT5SignalWebView(true);
        // Note: markTradeExecuted will be called when trades complete, not here
      }
    };

    const onError = (error: string) => {
      console.error('Signals monitoring error:', error);
    };

    signalsMonitor.startMonitoring(phoneSecret, onSignalReceived, onError);
    setIsSignalsMonitoring(true);
  }, [activeSymbols, mt4Symbols, mt5Symbols, mt5Account]);

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

  const setShowMT5SignalWebViewCallback = useCallback((show: boolean) => {
    setShowMT5SignalWebView(show);
    if (!show) {
      setMT5Signal(null);
    }
  }, []);

  const setMT5SignalCallback = useCallback((signal: SignalLog | null) => {
    setMT5Signal(signal);
  }, []);


  // Initialize signals monitoring state on mount
  useEffect(() => {
    setIsSignalsMonitoring(signalsMonitor.isRunning());
    setSignalLogs(signalsMonitor.getSignalLogs());
  }, []);

  // Listen for background signals from native service (Android)
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    let listener: any = null;
    let mounted = true;

    const setupListener = async () => {
      const signalService = await getSignalMonitoringService();
      if (!signalService || !mounted) return;

      listener = signalService.addListener((signal: any) => {
        console.log('🎯 Background signal received from native service:', signal);

        // Check if signal should be processed (recent and not duplicate)
        const { shouldProcess, ageInSeconds, reason, cooldownRemaining } = shouldProcessSignal(signal.id, signal.asset, signal.time, signal.latestupdate);

        if (!shouldProcess) {
          if (reason === 'already_processed') {
            console.log('⏭️ Background signal already processed, ignoring:', signal.asset, 'ID:', signal.id);
          } else if (reason === 'cooldown' && cooldownRemaining) {
            console.log('⏸️ Background symbol in cooldown (' + cooldownRemaining.toFixed(1) + 's remaining), ignoring:', signal.asset, 'ID:', signal.id);
          } else if (reason === 'invalid_time') {
            console.log('⏭️ Background signal has invalid time, ignoring:', signal.asset, 'ID:', signal.id);
          } else {
            console.log('⏰ Background signal too old (' + ageInSeconds.toFixed(1) + 's), ignoring:', signal.asset, 'ID:', signal.id);
          }
          return;
        }

        console.log('✅ Background signal is recent (' + ageInSeconds.toFixed(1) + 's old), processing:', signal.asset, 'ID:', signal.id);

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

        // Open MT5 WebView for ANY signal if MT5 account is connected
        if (mt5Account && mt5Account.connected) {
          console.log('🚀 Opening MT5 WebView for native service signal:', signalLog.asset);
          // Bring app to foreground if in background (must be done first)
          bringAppToForeground();
          // Pause monitoring when trades start executing
          pausePolling().catch(err => {
            console.error('Error pausing polling when opening WebView:', err);
          });
          setMT5Signal(signalLog);
          setShowMT5SignalWebView(true);
          // Note: markTradeExecuted will be called when trades complete, not here
        }

        setNewSignal(signalLog);
      });

      return () => {
        if (listener && signalService) {
          signalService.removeListener(listener);
        }
      };
    };

    setupListener();

    return () => {
      mounted = false;
      if (listener) {
        getSignalMonitoringService().then(signalService => {
          if (signalService) {
            signalService.removeListener(listener);
          }
        });
      }
    };
  }, [mt5Account]);

  // Ensure signal monitoring continues when app is in background and resumes when active
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      console.log('App state changed - ensuring signal monitoring continues:', nextAppState);

      // When app becomes active, ensure monitoring is running if bot is active
      if (nextAppState === 'active' && isBotActive) {
        const primaryEA = Array.isArray(eas) && eas.length > 0 ? eas[0] : null;
        if (primaryEA && primaryEA.licenseKey) {
          // If polling is paused but bot is active, check if we should resume
          // (but respect the 35-second cooldown after trade execution)
          if (isPollingPaused) {
            console.log('App active - monitoring is paused (will resume after cooldown)');
          } else {
            // Ensure polling is running when app becomes active
            if (!databaseSignalsPollingService.isRunning()) {
              console.log('App active - restarting database signals polling');
              const onDatabaseSignalFound = (signal: DatabaseSignal) => {
                console.log('🎯 Database signal found (foreground):', signal);

                // Check if signal should be processed (recent and not duplicate)
                const { shouldProcess, ageInSeconds, reason, cooldownRemaining } = shouldProcessSignal(signal.id, signal.asset, signal.time, signal.latestupdate);

                if (!shouldProcess) {
                  if (reason === 'already_processed') {
                    console.log('⏭️ Signal already processed, ignoring:', signal.asset, 'ID:', signal.id);
                  } else if (reason === 'cooldown' && cooldownRemaining) {
                    console.log('⏸️ Symbol in cooldown (' + cooldownRemaining.toFixed(1) + 's remaining), ignoring:', signal.asset, 'ID:', signal.id);
                  } else if (reason === 'invalid_time') {
                    console.log('⏭️ Signal has invalid time, ignoring:', signal.asset, 'ID:', signal.id);
                  } else {
                    console.log('⏰ Signal too old (' + ageInSeconds.toFixed(1) + 's), ignoring:', signal.asset, 'ID:', signal.id);
                  }
                  return;
                }

                console.log('✅ Signal is recent (' + ageInSeconds.toFixed(1) + 's old), processing:', signal.asset, 'ID:', signal.id);

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

                // Open MT5 WebView for ANY signal if MT5 account is connected
                if (mt5Account && mt5Account.connected) {
                  console.log('🚀 Opening MT5 WebView for database signal:', signalLog.asset);
                  // Pause monitoring when trades start executing
                  pausePolling().catch(err => {
                    console.error('Error pausing polling when opening WebView:', err);
                  });
                  setMT5Signal(signalLog);
                  setShowMT5SignalWebView(true);
                  // Note: markTradeExecuted will be called when trades complete, not here
                }

                setNewSignal(signalLog);
              };

              const onDatabaseError = (error: string) => {
                console.error('Database signals polling error:', error);
              };

              databaseSignalsPollingService.startPolling(
                primaryEA.licenseKey,
                onDatabaseSignalFound,
                onDatabaseError
              );
              setIsDatabaseSignalsPolling(true);
            } else {
              console.log('App active - database signals polling already running');
            }
          }
        }
      }

      // Ensure database signals polling continues when app goes to background
      if ((nextAppState === 'background' || nextAppState === 'inactive') && isBotActive && !isPollingPaused) {
        const primaryEA = Array.isArray(eas) && eas.length > 0 ? eas[0] : null;
        if (primaryEA && primaryEA.licenseKey) {
          // Ensure polling is running when app goes to background
          if (!databaseSignalsPollingService.isRunning()) {
            console.log('App in background - restarting database signals polling for background monitoring');
            const onDatabaseSignalFound = (signal: DatabaseSignal) => {
              console.log('🎯 Database signal found (background):', signal);

              // Check if signal should be processed (recent and not duplicate)
              const { shouldProcess, ageInSeconds, reason, cooldownRemaining } = shouldProcessSignal(signal.id, signal.asset, signal.time, signal.latestupdate);

              if (!shouldProcess) {
                if (reason === 'already_processed') {
                  console.log('⏭️ Background database signal already processed, ignoring:', signal.asset, 'ID:', signal.id);
                } else if (reason === 'cooldown' && cooldownRemaining) {
                  console.log('⏸️ Background database symbol in cooldown (' + cooldownRemaining.toFixed(1) + 's remaining), ignoring:', signal.asset, 'ID:', signal.id);
                } else if (reason === 'invalid_time') {
                  console.log('⏭️ Background database signal has invalid time, ignoring:', signal.asset, 'ID:', signal.id);
                } else {
                  console.log('⏰ Background database signal too old (' + ageInSeconds.toFixed(1) + 's), ignoring:', signal.asset, 'ID:', signal.id);
                }
                return;
              }

              console.log('✅ Background database signal is recent (' + ageInSeconds.toFixed(1) + 's old), processing:', signal.asset, 'ID:', signal.id);

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

              // Open MT5 WebView for ANY signal if MT5 account is connected
              if (mt5Account && mt5Account.connected) {
                console.log('🚀 Opening MT5 WebView for background database signal:', signalLog.asset);
                // Bring app to foreground if in background (must be done first)
                bringAppToForeground();
                // Pause monitoring when trades start executing
                pausePolling().catch(err => {
                  console.error('Error pausing polling when opening WebView:', err);
                });
                setMT5Signal(signalLog);
                setShowMT5SignalWebView(true);
                // Note: markTradeExecuted will be called when trades complete, not here
              }

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
            setIsDatabaseSignalsPolling(true);
          } else {
            console.log('App in background - database signals polling already running');
          }
        }
      } else if ((nextAppState === 'background' || nextAppState === 'inactive') && isBotActive && isPollingPaused) {
        console.log('App in background - monitoring is paused (will resume after cooldown)');
      }

      // Also ensure database signals polling continues in background (fallback check)
      if (isBotActive && isDatabaseSignalsPolling && !isPollingPaused) {
        const primaryEA = Array.isArray(eas) && eas.length > 0 ? eas[0] : null;
        if (primaryEA && primaryEA.licenseKey) {
          // Check if polling is still running, restart if needed
          if (!databaseSignalsPollingService.isRunning()) {
            console.log('Polling stopped - restarting for background monitoring');
            const onDatabaseSignalFound = (signal: DatabaseSignal) => {
              console.log('🎯 Database signal found (background):', signal);

              // Check if signal should be processed (recent and not duplicate)
              const { shouldProcess, ageInSeconds, reason, cooldownRemaining } = shouldProcessSignal(signal.id, signal.asset, signal.time, signal.latestupdate);

              if (!shouldProcess) {
                if (reason === 'already_processed') {
                  console.log('⏭️ Background database signal already processed, ignoring:', signal.asset, 'ID:', signal.id);
                } else if (reason === 'cooldown' && cooldownRemaining) {
                  console.log('⏸️ Background database symbol in cooldown (' + cooldownRemaining.toFixed(1) + 's remaining), ignoring:', signal.asset, 'ID:', signal.id);
                } else if (reason === 'invalid_time') {
                  console.log('⏭️ Background database signal has invalid time, ignoring:', signal.asset, 'ID:', signal.id);
                } else {
                  console.log('⏰ Background database signal too old (' + ageInSeconds.toFixed(1) + 's), ignoring:', signal.asset, 'ID:', signal.id);
                }
                return;
              }

              console.log('✅ Background database signal is recent (' + ageInSeconds.toFixed(1) + 's old), processing:', signal.asset, 'ID:', signal.id);

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

              // Open MT5 WebView for ANY signal if MT5 account is connected
              if (mt5Account && mt5Account.connected) {
                console.log('🚀 Opening MT5 WebView for background database signal:', signalLog.asset);
                // Bring app to foreground if in background (must be done first)
                bringAppToForeground();
                // Pause monitoring when trades start executing
                pausePolling().catch(err => {
                  console.error('Error pausing polling when opening WebView:', err);
                });
                setMT5Signal(signalLog);
                setShowMT5SignalWebView(true);
                // Note: markTradeExecuted will be called when trades complete, not here
              }

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
            setIsDatabaseSignalsPolling(true);
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
  }, [isBotActive, isDatabaseSignalsPolling, isPollingPaused, eas, isSignalsMonitoring, startSignalsMonitoring, mt5Account, shouldProcessSignal, pausePolling, bringAppToForeground]);

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
    showMT5SignalWebView,
    mt5Signal,
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
    setShowMT5SignalWebView: setShowMT5SignalWebViewCallback,
    setMT5Signal: setMT5SignalCallback,
    markTradeExecuted,
  }), [user, eas, mtAccount, mt4Account, mt5Account, isFirstTime, activeSymbols, mt4Symbols, mt5Symbols, isBotActive, signalLogs, isSignalsMonitoring, newSignal, showMT5SignalWebView, mt5Signal, databaseSignal, isDatabaseSignalsPolling, isPollingPaused, pausePolling, resumePolling, setUser, addEA, removeEA, setActiveEA, setMTAccount, setMT4Account, setMT5Account, setIsFirstTime, activateSymbol, activateMT4Symbol, activateMT5Symbol, deactivateSymbol, deactivateMT4Symbol, deactivateMT5Symbol, setBotActive, requestOverlayPermission, startSignalsMonitoring, stopSignalsMonitoring, clearSignalLogs, dismissNewSignal, setShowMT5SignalWebViewCallback, setMT5SignalCallback, markTradeExecuted]);
});
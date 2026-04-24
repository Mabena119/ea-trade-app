import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, TextInput, ScrollView, Platform, FlatList, Alert, ActivityIndicator, Image, KeyboardAvoidingView, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView } from 'react-native-webview';
import CustomWebView from '../../components/custom-webview';
import WebWebView from '../../components/web-webview';
import SimpleWebView from '../../components/simple-webview';
import InjectableWebView from '../../components/injectable-webview';
import FallbackWebView from '../../components/fallback-webview';
import { Eye, EyeOff, Search, Database, ExternalLink, Shield, RefreshCw, X } from 'lucide-react-native';
import { useApp } from '@/providers/app-provider';
import { getScreenBackgroundColor, useTheme } from '@/providers/theme-provider';
import { MatrixSceneRain } from '@/components/matrix-scene-rain';
import colors from '@/constants/colors';
import { isRetriableTerminalAuthFailure, MT_TERMINAL_AUTH_REMOUNTS } from '@/utils/mt-terminal-auth-retry';
import { clearWebTerminalByScope, WEBVIEW_SCOPE_MT5_LINK } from '@/utils/web-terminal-scope';

/** Embedded MT4/MT5 terminal WebView: false = fully hidden (toast-only UX). true = bottom panel visible for debugging. */
const SHOW_EMBEDDED_MT_WEBVIEW = false;

const EMBEDDED_WEBVIEW_HEIGHT = Math.round(Dimensions.get('window').height * 0.42);

// Default MT4 Brokers (will be updated from web terminal)
const DEFAULT_MT4_BROKERS = [
  'FXCM-Demo01',
  'FXCM-USDDemo01',
  'FXCM-Real',
  'FXCM-USDReal',
  'ICMarkets-Demo',
  'ICMarkets-Live01',
  'ICMarkets-Live02',
  'XM-Demo 1',
  'XM-Demo 2',
  'XM-Demo 3',
  'XM-Real 1',
  'XM-Real 2',
  'XM-Real 3',
  'OANDA-Demo',
  'OANDA-Live',
  'Pepperstone-Demo',
  'Pepperstone-Live',
  'IG-Demo',
  'IG-Live',
  'FXTM-Demo',
  'FXTM-Real',
  'Exness-Demo',
  'Exness-Real1',
  'Exness-Real2',
  'Admiral-Demo',
  'Admiral-Real',
  'FBS-Demo',
  'FBS-Real',
  'HotForex-Demo',
  'HotForex-Live',
  'InstaForex-Demo',
  'InstaForex-Live',
  'Tickmill-Demo',
  'Tickmill-Live',
  'FxPro-Demo',
  'FxPro-Live',
  'FIBO-Demo',
  'FIBO-Live',
  'Alpari-Demo',
  'Alpari-Live',
  'RoboForex-Demo',
  'RoboForex-Live',
  'LiteForex-Demo',
  'LiteForex-Live',
  'NordFX-Demo',
  'NordFX-Live',
  'AMarkets-Demo',
  'AMarkets-Live',
  'Forex4you-Demo',
  'Forex4you-Live',
  'JustForex-Demo',
  'JustForex-Live',
  'OctaFX-Demo',
  'OctaFX-Live',
  'TeleTrade-Demo',
  'TeleTrade-Live',
  'ForexClub-Demo',
  'ForexClub-Live',
  'Weltrade-Demo',
  'Weltrade-Live',
  'FreshForex-Demo',
  'FreshForex-Live',
  'Grand Capital-Demo',
  'Grand Capital-Live',
  'Forex Optimum-Demo',
  'Forex Optimum-Live',
  'NPBFX-Demo',
  'NPBFX-Live',
  'Traders Trust-Demo',
  'Traders Trust-Live',
  'Windsor Brokers-Demo',
  'Windsor Brokers-Live',
  'FXOpen-Demo',
  'FXOpen-Live',
  'AGEA-Demo',
  'AGEA-Live',
  'Dukascopy-Demo',
  'Dukascopy-Live',
  'Swissquote-Demo',
  'Swissquote-Live',
  'Saxo Bank-Demo',
  'Saxo Bank-Live',
  'Interactive Brokers-Demo',
  'Interactive Brokers-Live',
  'TD Ameritrade-Demo',
  'TD Ameritrade-Live',
  'Charles Schwab-Demo',
  'Charles Schwab-Live',
  'E*TRADE-Demo',
  'E*TRADE-Live',
  'Fidelity-Demo',
  'Fidelity-Live',
  'Vanguard-Demo',
  'Vanguard-Live',
  'Plus500-Demo',
  'Plus500-Live',
  'eToro-Demo',
  'eToro-Live',
  'AvaTrade-Demo',
  'AvaTrade-Live',
  'Markets.com-Demo',
  'Markets.com-Live',
  'CMC Markets-Demo',
  'CMC Markets-Live',
  'City Index-Demo',
  'City Index-Live',
  'GAIN Capital-Demo',
  'GAIN Capital-Live',
  'ThinkMarkets-Demo',
  'ThinkMarkets-Live',
  'Vantage FX-Demo',
  'Vantage FX-Live',
  'BlackBull Markets-Demo',
  'BlackBull Markets-Live',
  'FP Markets-Demo',
  'FP Markets-Live',
  'Blueberry Markets-Demo',
  'Blueberry Markets-Live',
  'Axi-Demo',
  'Axi-Live',
  'GO Markets-Demo',
  'GO Markets-Live',
  'Eightcap-Demo',
  'Eightcap-Live',
  'Global Prime-Demo',
  'Global Prime-Live',
  'Fusion Markets-Demo',
  'Fusion Markets-Live',
  'Darwinex-Demo',
  'Darwinex-Live',
  'TMGM-Demo',
  'TMGM-Live',
  'Hantec Markets-Demo',
  'Hantec Markets-Live',
  'Core Spreads-Demo',
  'Core Spreads-Live',
  'Capital.com-Demo',
  'Capital.com-Live',
  'XTB-Demo',
  'XTB-Live',
  'Trading 212-Demo',
  'Trading 212-Live',
  'Libertex-Demo',
  'Libertex-Live',
  'IQ Option-Demo',
  'IQ Option-Live',
  'Olymp Trade-Demo',
  'Olymp Trade-Live',
  'Binomo-Demo',
  'Binomo-Live',
  'Pocket Option-Demo',
  'Pocket Option-Live',
  'Expert Option-Demo',
  'Expert Option-Live',
  'Quotex-Demo',
  'Quotex-Live',
  'Deriv-Demo',
  'Deriv-Live',
  'Binary.com-Demo',
  'Binary.com-Live',
  'Nadex-Demo',
  'Nadex-Live',
  'CBOE-Demo',
  'CBOE-Live',
  'CME Group-Demo',
  'CME Group-Live',
  'ICE-Demo',
  'ICE-Live',
  'Eurex-Demo',
  'Eurex-Live',
  'LSE-Demo',
  'LSE-Live',
  'NYSE-Demo',
  'NYSE-Live',
  'NASDAQ-Demo',
  'NASDAQ-Live',
  'TSX-Demo',
  'TSX-Live',
  'ASX-Demo',
  'ASX-Live',
  'JSE-Demo',
  'JSE-Live',
  'BSE-Demo',
  'BSE-Live',
  'NSE-Demo',
  'NSE-Live',
  'SSE-Demo',
  'SSE-Live',
  'SZSE-Demo',
  'SZSE-Live',
  'TSE-Demo',
  'TSE-Live',
  'HKEX-Demo',
  'HKEX-Live',
  'SGX-Demo',
  'SGX-Live',
  'KRX-Demo',
  'KRX-Live',
  'TWSE-Demo',
  'TWSE-Live',
  'SET-Demo',
  'SET-Live',
  'IDX-Demo',
  'IDX-Live',
  'PSE-Demo',
  'PSE-Live',
  'KLSE-Demo',
  'KLSE-Live',
  'VNX-Demo',
  'VNX-Live',
  'MSX-Demo',
  'MSX-Live',
  'CSE-Demo',
  'CSE-Live',
  'DSE-Demo',
  'DSE-Live',
  'KSE-Demo',
  'KSE-Live',
  'EGX-Demo',
  'EGX-Live',
  'CASE-Demo',
  'CASE-Live',
  'NSE-Nigeria-Demo',
  'NSE-Nigeria-Live',
  'GSE-Demo',
  'GSE-Live',
  'USE-Demo',
  'USE-Live',
  'RSE-Demo',
  'RSE-Live',
  'MSE-Demo',
  'MSE-Live',
  'ZSE-Demo',
  'ZSE-Live',
  'BSE-Botswana-Demo',
  'BSE-Botswana-Live',
  'NSX-Demo',
  'NSX-Live',
  'SEM-Demo',
  'SEM-Live',
  'BRVM-Demo',
  'BRVM-Live',
  'BVMAC-Demo',
  'BVMAC-Live',
  'DSX-Demo',
  'DSX-Live',
  'BVB-Demo',
  'BVB-Live',
  'WSE-Demo',
  'WSE-Live',
  'PX-Demo',
  'PX-Live',
  'BET-Demo',
  'BET-Live',
  'BSE-Bulgaria-Demo',
  'BSE-Bulgaria-Live',
  'BELEX-Demo',
  'BELEX-Live',
  'MSE-Macedonia-Demo',
  'MSE-Macedonia-Live',
  'SASE-Demo',
  'SASE-Live',
  'LJSE-Demo',
  'LJSE-Live',
  'ZSE-Croatia-Demo',
  'ZSE-Croatia-Live',
  'BSSE-Demo',
  'BSSE-Live',
  'BSE-Armenia-Demo',
  'BSE-Armenia-Live',
  'GSE-Georgia-Demo',
  'GSE-Georgia-Live',
  'BCSE-Demo',
  'BCSE-Live',
  'KASE-Demo',
  'KASE-Live',
  'RSE-Kyrgyzstan-Demo',
  'RSE-Kyrgyzstan-Live',
  'UZSE-Demo',
  'UZSE-Live',
  'TASE-Demo',
  'TASE-Live',
  'ASE-Demo',
  'ASE-Live',
  'DFM-Demo',
  'DFM-Live',
  'ADX-Demo',
  'ADX-Live',
  'QE-Demo',
  'QE-Live',
  'KSE-Kuwait-Demo',
  'KSE-Kuwait-Live',
  'BSE-Bahrain-Demo',
  'BSE-Bahrain-Live',
  'MSM-Demo',
  'MSM-Live',
  'TSE-Iran-Demo',
  'TSE-Iran-Live',
  'ISE-Demo',
  'ISE-Live',
  'BIST-Demo',
  'BIST-Live',
  'MOEX-Demo',
  'MOEX-Live',
  'SPB-Demo',
  'SPB-Live',
  'KASE-Demo',
  'KASE-Live',
  'BCSE-Demo',
  'BCSE-Live',
  'PFTS-Demo',
  'PFTS-Live',
  'GPW-Demo',
  'GPW-Live',
  'BVB-Romania-Demo',
  'BVB-Romania-Live',
  'BSE-Sofia-Demo',
  'BSE-Sofia-Live',
  'BELEX15-Demo',
  'BELEX15-Live',
  'MSE-Montenegro-Demo',
  'MSE-Montenegro-Live',
  'SASE-Slovenia-Demo',
  'SASE-Slovenia-Live',
  'LJSE-Slovenia-Demo',
  'LJSE-Slovenia-Live',
  'ZSE-Zagreb-Demo',
  'ZSE-Zagreb-Live',
  'BSSE-Bosnia-Demo',
  'BSSE-Bosnia-Live',
  'MSE-Skopje-Demo',
  'MSE-Skopje-Live',
  'ASE-Athens-Demo',
  'ASE-Athens-Live',
  'CSE-Cyprus-Demo',
  'CSE-Cyprus-Live',
  'MSE-Malta-Demo',
  'MSE-Malta-Live',
  // South African MT4 Brokers
  'HotForex-SA-Demo',
  'HotForex-SA-Live',
  'XM-SA-Demo',
  'XM-SA-Live',
  'Exness-SA-Demo',
  'Exness-SA-Live',
  'FBS-SA-Demo',
  'FBS-SA-Live',
  'OctaFX-SA-Demo',
  'OctaFX-SA-Live',
  'InstaForex-SA-Demo',
  'InstaForex-SA-Live',
  'RoboForex-SA-Demo',
  'RoboForex-SA-Live',
  'Tickmill-SA-Demo',
  'Tickmill-SA-Live',
  'FxPro-SA-Demo',
  'FxPro-SA-Live',
  'Admiral-SA-Demo',
  'Admiral-SA-Live',
  'FXTM-SA-Demo',
  'FXTM-SA-Live',
  'Alpari-SA-Demo',
  'Alpari-SA-Live',
  'AvaTrade-SA-Demo',
  'AvaTrade-SA-Live',
  'Plus500-SA-Demo',
  'Plus500-SA-Live',
  'eToro-SA-Demo',
  'eToro-SA-Live',
  'Capital.com-SA-Demo',
  'Capital.com-SA-Live',
  'XTB-SA-Demo',
  'XTB-SA-Live',
  'Trading212-SA-Demo',
  'Trading212-SA-Live',
  'Libertex-SA-Demo',
  'Libertex-SA-Live',
  'IQ Option-SA-Demo',
  'IQ Option-SA-Live',
  'Deriv-SA-Demo',
  'Deriv-SA-Live',
  'ThinkMarkets-SA-Demo',
  'ThinkMarkets-SA-Live',
  'Vantage-SA-Demo',
  'Vantage-SA-Live',
  'IC Markets-SA-Demo',
  'IC Markets-SA-Live',
  'Pepperstone-SA-Demo',
  'Pepperstone-SA-Live',
  'FP Markets-SA-Demo',
  'FP Markets-SA-Live',
  'Axi-SA-Demo',
  'Axi-SA-Live',
  'GO Markets-SA-Demo',
  'GO Markets-SA-Live',
  'Eightcap-SA-Demo',
  'Eightcap-SA-Live',
  'Global Prime-SA-Demo',
  'Global Prime-SA-Live',
  'Fusion Markets-SA-Demo',
  'Fusion Markets-SA-Live',
  'TMGM-SA-Demo',
  'TMGM-SA-Live',
  'Hantec-SA-Demo',
  'Hantec-SA-Live',
  'Core Spreads-SA-Demo',
  'Core Spreads-SA-Live',
  'Windsor Brokers-SA-Demo',
  'Windsor Brokers-SA-Live',
  'FXOpen-SA-Demo',
  'FXOpen-SA-Live',
  'AGEA-SA-Demo',
  'AGEA-SA-Live',
  'Dukascopy-SA-Demo',
  'Dukascopy-SA-Live',
  'Swissquote-SA-Demo',
  'Swissquote-SA-Live',
  'Saxo Bank-SA-Demo',
  'Saxo Bank-SA-Live',
  'Interactive Brokers-SA-Demo',
  'Interactive Brokers-SA-Live',
  'CMC Markets-SA-Demo',
  'CMC Markets-SA-Live',
  'City Index-SA-Demo',
  'City Index-SA-Live',
  'IG-SA-Demo',
  'IG-SA-Live',
  'OANDA-SA-Demo',
  'OANDA-SA-Live',
  'FXCM-SA-Demo',
  'FXCM-SA-Live',
  'Markets.com-SA-Demo',
  'Markets.com-SA-Live',
  'GAIN Capital-SA-Demo',
  'GAIN Capital-SA-Live',
  'BlackBull Markets-SA-Demo',
  'BlackBull Markets-SA-Live',
  'Blueberry Markets-SA-Demo',
  'Blueberry Markets-SA-Live',
  'Darwinex-SA-Demo',
  'Darwinex-SA-Live',
  // Additional South African Brokers
  'RazorMarkets-SA-Demo',
  'RazorMarkets-SA-Live',
  'AcctMates-SA-Demo',
  'AcctMates-SA-Live',
  'SpacesMarkets-SA-Demo',
  'SpacesMarkets-SA-Live',
  'NeoBrokers-SA-Demo',
  'NeoBrokers-SA-Live',
  'FundedMarketplace-SA-Demo',
  'FundedMarketplace-SA-Live',
  'StandardBank-SA-Demo',
  'StandardBank-SA-Live',
  'ABSA-SA-Demo',
  'ABSA-SA-Live',
  'FNB-SA-Demo',
  'FNB-SA-Live',
  'Nedbank-SA-Demo',
  'Nedbank-SA-Live',
  'Capitec-SA-Demo',
  'Capitec-SA-Live',
  'PurpleTradingZA-SA-Demo',
  'PurpleTradingZA-SA-Live',
  'TradingView-SA-Demo',
  'TradingView-SA-Live',
  'EasyEquities-SA-Demo',
  'EasyEquities-SA-Live',
  'GTFX-SA-Demo',
  'GTFX-SA-Live',
  'TradeFX-SA-Demo',
  'TradeFX-SA-Live',
];

// MT5 Brokers with URL mapping
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

const MT5_BROKERS = Object.keys(MT5_BROKER_URLS);

export default function MetaTraderScreen() {
  const { theme, themeName } = useTheme();
  const screenBg = getScreenBackgroundColor(theme, themeName);
  const mt5TabGradActive =
    themeName === 'matrix'
      ? (['rgba(0, 88, 44, 0.98)', 'rgba(0, 42, 22, 0.96)'] as [string, string])
      : (['rgba(255, 255, 255, 0.18)', 'rgba(255, 255, 255, 0.1)'] as [string, string]);
  const mt5TabGradInactive =
    themeName === 'matrix'
      ? (['rgba(0, 36, 18, 0.9)', 'rgba(0, 22, 12, 0.85)'] as [string, string])
      : (['rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.05)'] as [string, string]);
  const mtChrome = useMemo(
    () => ({
      tab: {
        paddingVertical: 14,
        paddingHorizontal: 36,
        borderRadius: 24,
        backgroundColor: theme.colors.cardBackground,
        alignItems: 'center' as const,
        borderWidth: 1,
        borderColor: theme.colors.borderColor,
        overflow: 'hidden' as const,
        shadowColor: theme.colors.glowColor,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 8,
      },
      tabActive: {
        backgroundColor: `${theme.colors.accent}40`,
        borderColor: theme.colors.accent,
        borderWidth: 2,
        shadowOpacity: 0.55,
      },
      input: {
        backgroundColor: theme.colors.cardBackground,
        borderWidth: 1,
        borderColor: theme.colors.borderColor,
        borderRadius: 20,
        paddingHorizontal: 18,
        paddingVertical: 16,
        fontSize: 16,
        color: theme.colors.textPrimary,
        fontWeight: '600' as const,
        shadowColor: theme.colors.glowColor,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 6,
        zIndex: 1,
        position: 'relative' as const,
      },
      accentControl: {
        paddingHorizontal: 14,
        paddingVertical: 14,
        backgroundColor: `${theme.colors.accent}33`,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: `${theme.colors.accent}55`,
        overflow: 'hidden' as const,
        shadowColor: theme.colors.accent,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 4,
      },
      linkButton: {
        backgroundColor: `${theme.colors.accent}44`,
        paddingVertical: 18,
        borderRadius: 24,
        marginTop: 24,
        borderWidth: 1,
        borderColor: `${theme.colors.accent}66`,
        overflow: 'hidden' as const,
        shadowColor: theme.colors.accent,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 16,
        elevation: 10,
      },
      brokerListChrome: {
        backgroundColor: screenBg,
        borderColor: theme.colors.borderColor,
        shadowColor: theme.colors.glowColor,
      },
      brokerItemChrome: {
        shadowColor: theme.colors.glowColor,
      },
      framedPanel: {
        borderColor: `${theme.colors.accent}55`,
        borderTopColor: theme.colors.accent,
        shadowColor: theme.colors.glowColor,
      },
      toastFrame: {
        borderColor: `${theme.colors.accent}70`,
        borderTopColor: theme.colors.accent,
        shadowColor: theme.colors.glowColor,
      },
    }),
    [theme, screenBg]
  );
  const [activeTab, setActiveTab] = useState<'MT5' | 'MT4'>('MT5');
  const [login, setLogin] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [server, setServer] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showBrokerList, setShowBrokerList] = useState<boolean>(false);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [showWebView, setShowWebView] = useState<boolean>(false);
  const [showBrokerFetchWebView, setShowBrokerFetchWebView] = useState<boolean>(false);
  const [showMT5WebView, setShowMT5WebView] = useState<boolean>(false);
  const [showMT4WebView, setShowMT4WebView] = useState<boolean>(false);
  const [authenticationStep, setAuthenticationStep] = useState<string>('Initializing...');
  const [mt4Brokers, setMt4Brokers] = useState<string[]>(DEFAULT_MT4_BROKERS);
  const [isLoadingBrokers, setIsLoadingBrokers] = useState<boolean>(false);
  const [brokerFetchError, setBrokerFetchError] = useState<string | null>(null);
  const [webViewKey, setWebViewKey] = useState<number>(0);
  const [brokerFetchKey, setBrokerFetchKey] = useState<number>(0);
  const [mt5WebViewKey, setMT5WebViewKey] = useState<number>(0);
  const [mt4WebViewKey, setMT4WebViewKey] = useState<number>(0);
  const webViewRef = useRef<any>(null);
  const brokerFetchRef = useRef<any>(null);
  const mt5WebViewRef = useRef<any>(null);
  const mt4WebViewRef = useRef<any>(null);
  const authTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackSuccessRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brokerFetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authFinalizedRef = useRef<boolean>(false);
  const mt5LinkAuthRemountRef = useRef(0);
  const mt4LinkAuthRemountRef = useRef(0);
  const { mtAccount, setMTAccount, mt4Account, setMT4Account, mt5Account, setMT5Account } = useApp();

  // Load existing account data when tab changes
  useEffect(() => {
    const currentAccount = activeTab === 'MT4' ? mt4Account : mt5Account;
    if (currentAccount) {
      setLogin(currentAccount.login || '');
      setServer(currentAccount.server || '');
      setPassword(currentAccount.password || '');
    } else {
      setLogin('');
      setServer('');
      setPassword('');
    }
  }, [activeTab, mt4Account, mt5Account]);

  // Authentication state tracking
  const [authState, setAuthState] = useState({
    loading: false,
    showAllSymbols: false,
    chooseSymbol: false,
    logged: false,
    attempt: 0
  });

  // Fetch MT4 brokers from web terminal - only start WebView when needed
  const fetchMT4Brokers = async () => {
    if (Platform.OS === 'web') {
      setBrokerFetchError('Broker fetching not available on web platform');
      return;
    }

    console.log('Starting broker fetch WebView...');
    // Networking disabled: skip remote fetch and use default list
    setIsLoadingBrokers(false);
    setBrokerFetchError('Live broker fetch disabled (offline mode)');
    setShowBrokerFetchWebView(false);
  };

  // Close broker fetch WebView and cleanup
  const closeBrokerFetchWebView = () => {
    console.log('Closing broker fetch WebView and cleaning up...');
    setShowBrokerFetchWebView(false);
    setIsLoadingBrokers(false);

    // Clear timeout
    if (brokerFetchTimeoutRef.current) {
      clearTimeout(brokerFetchTimeoutRef.current);
      brokerFetchTimeoutRef.current = null;
    }

    // Clear WebView reference
    if (brokerFetchRef.current) {
      brokerFetchRef.current = null;
    }

    console.log('Broker fetch WebView destroyed and cleaned up');
  };

  // Only fetch brokers when explicitly requested, not on tab change
  // This prevents unnecessary WebView creation

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (authTimeoutRef.current) {
        clearTimeout(authTimeoutRef.current);
      }
      if (brokerFetchTimeoutRef.current) {
        clearTimeout(brokerFetchTimeoutRef.current);
      }
      console.log('MetaTrader component unmounted - all timeouts cleared');
    };
  }, []);

  const onBrokerFetchMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('Broker fetch message received:', data);

      if (data.type === 'brokers_fetched' && data.brokers) {
        console.log('Successfully received brokers:', data.brokers.length);
        setMt4Brokers(data.brokers);
        setBrokerFetchError(null);
        // Immediately close and destroy WebView after success
        setTimeout(() => closeBrokerFetchWebView(), 100);
      } else if (data.type === 'broker_fetch_error') {
        console.error('Broker fetch error:', data.message);
        setBrokerFetchError(data.message || 'Failed to fetch brokers');
        // Close and destroy WebView on error
        setTimeout(() => closeBrokerFetchWebView(), 100);
      }
    } catch (error) {
      console.error('Error parsing broker fetch message:', error);
      setBrokerFetchError('Error processing broker list');
      // Close and destroy WebView on parsing error
      setTimeout(() => closeBrokerFetchWebView(), 100);
    }
  };

  const getBrokerFetchScript = () => {
    return `
      (function() {
        const sendMessage = (type, data) => {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...data }));
        };
        
        const extractBrokers = () => {
          try {
            // Wait for the server dropdown to be available
            const checkForServerDropdown = () => {
              const serverInput = document.getElementById('server');
              if (serverInput) {
                // Click on server input to open dropdown
                serverInput.focus();
                serverInput.click();
                
                setTimeout(() => {
                  // Look for server options in various possible locations
                  let brokers = [];
                  
                  // Method 1: Check for datalist options
                  const datalist = document.querySelector('datalist');
                  if (datalist) {
                    const options = datalist.querySelectorAll('option');
                    brokers = Array.from(options).map(option => option.value).filter(value => value.trim());
                  }
                  
                  // Method 2: Check for dropdown options
                  if (brokers.length === 0) {
                    const dropdownOptions = document.querySelectorAll('select option, .dropdown-option, .server-option');
                    brokers = Array.from(dropdownOptions).map(option => option.textContent || option.value).filter(value => value && value.trim());
                  }
                  
                  // Method 3: Check for any elements containing server names
                  if (brokers.length === 0) {
                    const allElements = document.querySelectorAll('*');
                    const serverPattern = /^[A-Za-z0-9\-_]+\-(Demo|Live|Real|Server)\d*$/;
                    
                    allElements.forEach(element => {
                      const text = element.textContent?.trim();
                      if (text && serverPattern.test(text) && !brokers.includes(text)) {
                        brokers.push(text);
                      }
                    });
                  }
                  
                  // Method 4: Extract from JavaScript variables if available
                  if (brokers.length === 0) {
                    try {
                      // Check if there are any global variables containing server lists
                      const scripts = document.querySelectorAll('script');
                      scripts.forEach(script => {
                        const content = script.textContent || '';
                        const serverMatches = content.match(/["'][A-Za-z0-9\-_]+\-(Demo|Live|Real|Server)\d*["']/g);
                        if (serverMatches) {
                          serverMatches.forEach(match => {
                            const server = match.replace(/["']/g, '');
                            if (!brokers.includes(server)) {
                              brokers.push(server);
                            }
                          });
                        }
                      });
                    } catch (e) {
                      console.log('Error extracting from scripts:', e);
                    }
                  }
                  
                  // If we still don't have brokers, use a comprehensive list of known MT4 servers
                  if (brokers.length === 0) {
                    brokers = [
                      'FXCM-Demo01', 'FXCM-USDDemo01', 'FXCM-Real', 'FXCM-USDReal',
                      'ICMarkets-Demo', 'ICMarkets-Live01', 'ICMarkets-Live02',
                      'XM-Demo 1', 'XM-Demo 2', 'XM-Demo 3', 'XM-Real 1', 'XM-Real 2', 'XM-Real 3',
                      'OANDA-Demo', 'OANDA-Live', 'Pepperstone-Demo', 'Pepperstone-Live',
                      'IG-Demo', 'IG-Live', 'FXTM-Demo', 'FXTM-Real',
                      'Exness-Demo', 'Exness-Real1', 'Exness-Real2',
                      'Admiral-Demo', 'Admiral-Real', 'FBS-Demo', 'FBS-Real',
                      'HotForex-Demo', 'HotForex-Live', 'InstaForex-Demo', 'InstaForex-Live',
                      'Tickmill-Demo', 'Tickmill-Live', 'FxPro-Demo', 'FxPro-Live',
                      'FIBO-Demo', 'FIBO-Live', 'Alpari-Demo', 'Alpari-Live',
                      'RoboForex-Demo', 'RoboForex-Live', 'LiteForex-Demo', 'LiteForex-Live',
                      'NordFX-Demo', 'NordFX-Live', 'AMarkets-Demo', 'AMarkets-Live',
                      'OctaFX-Demo', 'OctaFX-Live', 'TeleTrade-Demo', 'TeleTrade-Live',
                      'FreshForex-Demo', 'FreshForex-Live', 'Grand Capital-Demo', 'Grand Capital-Live',
                      'NPBFX-Demo', 'NPBFX-Live', 'Traders Trust-Demo', 'Traders Trust-Live',
                      'FXOpen-Demo', 'FXOpen-Live', 'Dukascopy-Demo', 'Dukascopy-Live',
                      'AvaTrade-Demo', 'AvaTrade-Live', 'Plus500-Demo', 'Plus500-Live',
                      'ThinkMarkets-Demo', 'ThinkMarkets-Live', 'Vantage FX-Demo', 'Vantage FX-Live',
                      'BlackBull Markets-Demo', 'BlackBull Markets-Live', 'FP Markets-Demo', 'FP Markets-Live',
                      'Axi-Demo', 'Axi-Live', 'GO Markets-Demo', 'GO Markets-Live',
                      'Eightcap-Demo', 'Eightcap-Live', 'Global Prime-Demo', 'Global Prime-Live',
                      'Fusion Markets-Demo', 'Fusion Markets-Live', 'TMGM-Demo', 'TMGM-Live'
                    ];
                  }
                  
                  // Remove duplicates and sort
                  brokers = [...new Set(brokers)].sort();
                  
                  console.log('Extracted brokers:', brokers.length);
                  sendMessage('brokers_fetched', { brokers });
                }, 2000);
              } else {
                setTimeout(checkForServerDropdown, 1000);
              }
            };
            
            checkForServerDropdown();
          } catch (error) {
            console.error('Error extracting brokers:', error);
            sendMessage('broker_fetch_error', { message: 'Failed to extract broker list' });
          }
        };
        
        // Start extraction after page loads
        if (document.readyState === 'complete') {
          setTimeout(extractBrokers, 3000);
        } else {
          window.addEventListener('load', () => {
            setTimeout(extractBrokers, 3000);
          });
        }
      })();
    `;
  };

  const filteredBrokers = useMemo(() => {
    const brokerList = activeTab === 'MT4' ? mt4Brokers : MT5_BROKERS;
    if (!server.trim()) {
      // MT5 has a small fixed list - show all; MT4 has many - show top 15
      return activeTab === 'MT5' ? brokerList : brokerList.slice(0, 15);
    }
    return brokerList.filter(broker =>
      broker.toLowerCase().includes(server.toLowerCase())
    ); // Allow selection of any broker from the list - fixed to allow any broker selection
  }, [server, activeTab, mt4Brokers]);

  const authenticateWithWebTerminal = async (loginData: { login: string; password: string; server: string; type: 'MT4' | 'MT5' }) => {
    try {
      setIsAuthenticating(true);
      setAuthState({ loading: false, showAllSymbols: false, chooseSymbol: false, logged: false, attempt: 0 });
      authFinalizedRef.current = false;

      if (Platform.OS === 'web') {
        setAuthenticationStep(`Simulating ${loginData.type} authentication on web...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        handleAuthenticationResult(true, `${loginData.type} linked (web simulation)`);
        return { success: true, message: `${loginData.type} linked (web simulation)` };
      }

      console.log(`Starting ${loginData.type} authentication WebView...`);
      setAuthenticationStep(`Loading ${loginData.type} Web Terminal...`);
      setShowWebView(true);
      setWebViewKey((k) => k + 1);

      const timeoutDuration = loginData.type === 'MT5' ? 30000 : 120000;
      authTimeoutRef.current = setTimeout(() => {
        if (authFinalizedRef.current) { return; }
        console.log('Authentication timeout - destroying WebView');
        handleAuthenticationResult(false, 'Authentication timeout');
      }, timeoutDuration) as ReturnType<typeof setTimeout>;

      return new Promise((resolve) => {
        (window as any).authResolve = resolve;
      });
    } catch (error) {
      console.error('Authentication error:', error);
      return { success: false, message: 'Authentication failed' };
    } finally {
      // no-op: handleAuthenticationResult toggles isAuthenticating
    }
  };

  const handleAuthenticationResult = (
    success: boolean,
    message: string,
    terminalStats?: { equity?: string; balance?: string },
  ) => {
    if (authFinalizedRef.current) {
      console.log('Authentication already finalized, ignoring result:', { success, message });
      return;
    }
    authFinalizedRef.current = true;
    console.log(`Authentication result: ${success ? 'SUCCESS' : 'FAILED'} - ${message}`);
    setIsAuthenticating(false);

    // Update connection status based on authentication result
    if (success) {
      // Update the legacy mtAccount for backward compatibility
      setMTAccount({
        type: activeTab,
        login: login.trim(),
        server: server.trim(),
        connected: true,
      });

      // Update the separate MT4/MT5 accounts - stored separately
      if (activeTab === 'MT4') {
        setMT4Account({
          login: login.trim(),
          password: password.trim(),
          server: server.trim(),
          connected: true,
          equity: terminalStats?.equity,
          balance: terminalStats?.balance,
        });
      } else {
        setMT5Account({
          login: login.trim(),
          password: password.trim(),
          server: server.trim(),
          connected: true,
          equity: terminalStats?.equity,
          balance: terminalStats?.balance,
        });
      }
    } else {
      // Set connection to false on authentication failure - show red status
      setMTAccount({
        type: activeTab,
        login: login.trim(),
        server: server.trim(),
        connected: false, // Red status when authentication failed
      });

      // Update the separate MT4/MT5 accounts with failed status - stored separately
      if (activeTab === 'MT4') {
        setMT4Account({
          login: login.trim(),
          password: password.trim(),
          server: server.trim(),
          connected: false,
          equity: undefined,
          balance: undefined,
        });
      } else {
        setMT5Account({
          login: login.trim(),
          password: password.trim(),
          server: server.trim(),
          connected: false,
          equity: undefined,
          balance: undefined,
        });
      }
    }

    // Close and destroy WebView
    closeAuthWebView();

    // Resolve the authentication promise
    if ((window as any).authResolve) {
      (window as any).authResolve({ success, message });
      delete (window as any).authResolve;
    }
  };

  // Close authentication WebView and cleanup
  const closeAuthWebView = () => {
    console.log('Closing authentication WebView and cleaning up...');
    setShowWebView(false);

    if (authTimeoutRef.current) {
      clearTimeout(authTimeoutRef.current);
      authTimeoutRef.current = null;
    }
    if (fallbackSuccessRef.current) {
      clearTimeout(fallbackSuccessRef.current);
      fallbackSuccessRef.current = null;
    }
    if (webViewRef.current) {
      webViewRef.current = null;
    }
    setAuthState({ loading: false, showAllSymbols: false, chooseSymbol: false, logged: false, attempt: 0 });
    setAuthenticationStep('Initializing...');
    console.log('Authentication WebView destroyed and cleaned up');
  };

  const executeJavaScript = (script: string) => {
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(script);
    }
  };

  const onWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('WebView message:', data);

      if (data.type === 'authentication_success') {
        if (fallbackSuccessRef.current) {
          clearTimeout(fallbackSuccessRef.current);
          fallbackSuccessRef.current = null;
        }
        setAuthState(prev => ({ ...prev, logged: true }));
        setAuthenticationStep('Login Successful!');
        console.log('Authentication successful - destroying WebView');
        handleAuthenticationResult(true, 'Authentication successful', {
          equity: typeof data.equity === 'string' ? data.equity : undefined,
          balance: typeof data.balance === 'string' ? data.balance : undefined,
        });
      } else if (data.type === 'authentication_failed') {
        setAuthState(prev => ({ ...prev, attempt: prev.attempt + 1 }));
        console.log('Authentication failed - destroying WebView');
        // Close and destroy WebView after failed authentication
        setTimeout(() => {
          handleAuthenticationResult(false, 'Invalid Login or Password');
        }, 1000);
      } else if (data.type === 'step_update') {
        // Don't show "Market Watch already visible" messages to the user
        if (!data.message.includes('Market Watch already visible')) {
          setAuthenticationStep(data.message);
        }
      }
    } catch (error) {
      console.error('Error parsing WebView message:', error);
      if (!authFinalizedRef.current) {
        handleAuthenticationResult(false, 'Authentication error');
      }
    }
  };

  // Handle MT5 WebView messages
  const onMT5WebViewMessage = async (data: any) => {
    try {
      // Handle both formats: parsed (CustomWebView) and unparsed (WebWebView)
      let parsedData = data;

      // If data has nativeEvent.data (WebWebView format), parse it
      if (data?.nativeEvent?.data) {
        try {
          parsedData = typeof data.nativeEvent.data === 'string'
            ? JSON.parse(data.nativeEvent.data)
            : data.nativeEvent.data;
        } catch (e) {
          console.error('Error parsing MT5 WebView message data:', e);
          return;
        }
      } else if (typeof data === 'string') {
        // If data is a string, parse it
        try {
          parsedData = JSON.parse(data);
        } catch (e) {
          console.error('Error parsing MT5 WebView message string:', e);
          return;
        }
      }

      console.log('MT5 WebView message:', parsedData);

      if (parsedData.type === 'mt5_loaded') {
        console.log('MT5 terminal loaded successfully');
      } else if (parsedData.type === 'step_update') {
        console.log('MT5 step:', parsedData.message);
        // Update authentication step for UI feedback
        setAuthenticationStep(parsedData.message);
      } else if (parsedData.type === 'authentication_success') {
        console.log('MT5 authentication successful');
        mt5LinkAuthRemountRef.current = 0;
        // Update authentication step
        setAuthenticationStep('Login Successful!');
        // Update account status to connected - use await to ensure state is saved
        await setMT5Account({
          login: login.trim(),
          password: password.trim(),
          server: server.trim(),
          connected: true,
          equity: typeof parsedData.equity === 'string' ? parsedData.equity : undefined,
          balance: typeof parsedData.balance === 'string' ? parsedData.balance : undefined,
        });
        await setMTAccount({
          type: 'MT5',
          login: login.trim(),
          server: server.trim(),
          connected: true,
        });
        console.log('✅ MT5 account authenticated successfully!');
        // Close WebView immediately after successful authentication
        closeMT5WebView();
      } else if (parsedData.type === 'authentication_failed') {
        const failMsg = typeof parsedData.message === 'string' ? parsedData.message : '';
        console.log('MT5 authentication failed:', failMsg);
        if (
          isRetriableTerminalAuthFailure(failMsg) &&
          mt5LinkAuthRemountRef.current < MT_TERMINAL_AUTH_REMOUNTS
        ) {
          mt5LinkAuthRemountRef.current += 1;
          setAuthenticationStep(
            `Connection issue — retrying (${mt5LinkAuthRemountRef.current}/${MT_TERMINAL_AUTH_REMOUNTS})...`
          );
          setTimeout(() => {
            setShowMT5WebView(true);
            setMT5WebViewKey((k) => k + 1);
          }, 1500);
          return;
        }
        mt5LinkAuthRemountRef.current = 0;
        setAuthenticationStep(failMsg || 'Authentication Failed');
        await setMT5Account({
          login: login.trim(),
          password: password.trim(),
          server: server.trim(),
          connected: false,
          equity: undefined,
          balance: undefined,
        });
        await setMTAccount({
          type: 'MT5',
          login: login.trim(),
          server: server.trim(),
          connected: false,
        });
        console.log('❌ MT5 authentication failed:', failMsg);
        setTimeout(() => {
          closeMT5WebView();
        }, 2000);
      } else if (parsedData.type === 'error') {
        console.error('MT5 WebView error:', parsedData.message);
      } else if (parsedData.type === 'injection_error') {
        console.error('MT5 JavaScript injection error:', parsedData.error);
        Alert.alert('Script Injection Error', `Failed to inject authentication script: ${parsedData.error}`);
      } else if (parsedData.type === 'webview_ready') {
        console.log('MT5 WebView is ready for script injection');
      }
    } catch (error) {
      console.error('Error parsing MT5 WebView message:', error);
    }
  };

  // Handle MT4 WebView messages
  const onMT4WebViewMessage = async (data: any) => {
    try {
      // Handle both formats: parsed (CustomWebView) and unparsed (WebWebView)
      let parsedData = data;

      // If data has nativeEvent.data (WebWebView format), parse it
      if (data?.nativeEvent?.data) {
        try {
          parsedData = typeof data.nativeEvent.data === 'string'
            ? JSON.parse(data.nativeEvent.data)
            : data.nativeEvent.data;
        } catch (e) {
          console.error('Error parsing MT4 WebView message data:', e);
          return;
        }
      } else if (typeof data === 'string') {
        // If data is a string, parse it
        try {
          parsedData = JSON.parse(data);
        } catch (e) {
          console.error('Error parsing MT4 WebView message string:', e);
          return;
        }
      }

      console.log('MT4 WebView message:', parsedData);

      if (parsedData.type === 'mt4_loaded') {
        console.log('MT4 terminal loaded successfully');
      } else if (parsedData.type === 'step_update') {
        console.log('MT4 step:', parsedData.message);
        // Update authentication step for UI feedback
        setAuthenticationStep(parsedData.message);
      } else if (parsedData.type === 'authentication_success') {
        console.log('MT4 authentication successful');
        mt4LinkAuthRemountRef.current = 0;
        // Update authentication step
        setAuthenticationStep('Login Successful!');
        // Update account status to connected - use await to ensure state is saved
        await setMT4Account({
          login: login.trim(),
          password: password.trim(),
          server: server.trim(),
          connected: true,
          equity: typeof parsedData.equity === 'string' ? parsedData.equity : undefined,
          balance: typeof parsedData.balance === 'string' ? parsedData.balance : undefined,
        });
        await setMTAccount({
          type: 'MT4',
          login: login.trim(),
          server: server.trim(),
          connected: true,
        });
        console.log('✅ MT4 account authenticated successfully!');
        // Close WebView immediately after successful authentication
        closeMT4WebView();
      } else if (parsedData.type === 'authentication_failed') {
        const failMsg = typeof parsedData.message === 'string' ? parsedData.message : '';
        console.log('MT4 authentication failed:', failMsg);
        if (
          isRetriableTerminalAuthFailure(failMsg) &&
          mt4LinkAuthRemountRef.current < MT_TERMINAL_AUTH_REMOUNTS
        ) {
          mt4LinkAuthRemountRef.current += 1;
          setAuthenticationStep(
            `Connection issue — retrying (${mt4LinkAuthRemountRef.current}/${MT_TERMINAL_AUTH_REMOUNTS})...`
          );
          setTimeout(() => {
            setShowMT4WebView(true);
            setMT4WebViewKey((k) => k + 1);
          }, 1500);
          return;
        }
        mt4LinkAuthRemountRef.current = 0;
        setAuthenticationStep(failMsg || 'Authentication Failed');
        await setMT4Account({
          login: login.trim(),
          password: password.trim(),
          server: server.trim(),
          connected: false,
          equity: undefined,
          balance: undefined,
        });
        await setMTAccount({
          type: 'MT4',
          login: login.trim(),
          server: server.trim(),
          connected: false,
        });
        console.log('❌ MT4 authentication failed:', failMsg);
        setTimeout(() => {
          closeMT4WebView();
        }, 2000);
      } else if (parsedData.type === 'error') {
        console.error('MT4 WebView error:', parsedData.message);
      } else if (parsedData.type === 'injection_error') {
        console.error('MT4 JavaScript injection error:', parsedData.error);
        Alert.alert('Script Injection Error', `Failed to inject authentication script: ${parsedData.error}`);
      } else if (parsedData.type === 'webview_ready') {
        console.log('MT4 WebView is ready for script injection');
      }
    } catch (error) {
      console.error('Error parsing MT4 WebView message:', error);
    }
  };

  const getStorageClearScript = () => {
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
  };

  const getAuthenticationScript = (loginData: { login: string; password: string; server: string }) => {
    if (activeTab === 'MT5') {
      return `
        (function() {
          const asset = 'XAUUSD';
          let done = false;

          const send = (type, message, extras) => {
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
            } catch (e) {}
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

          const sleep = (ms) => new Promise(r => setTimeout(r, ms));

          const fillCreds = () => {
            try {
              var x = document.querySelector('input[name="login"]');
              if (x != null) {
                x.value = '${loginData.login}';
                x.dispatchEvent(new Event('input', { bubbles: true }));
              }
              var y = document.querySelector('input[name="password"]');
              if (y != null) {
                y.value = '${loginData.password}';
                y.dispatchEvent(new Event('input', { bubbles: true }));
              }
              return !!(x && y);
            } catch(e) { return false; }
          };

          const pressLogin = () => {
            try {
              var button = document.querySelector('.button.svelte-1wrky82.active');
              if(button !== null) { button.click(); return true; }
              return false;
            } catch(e) { return false; }
          };

          const pressRemove = () => {
            try {
              var button = document.querySelector('.button.svelte-1wrky82.red');
              if (button !== null) { button.click(); return true; }
              var buttons = document.getElementsByTagName('button');
              for (var i = 0; i < buttons.length; i++) {
                if ((buttons[i].textContent || '').trim() === 'Remove') { buttons[i].click(); return true; }
              }
              return false;
            } catch(e) { return false; }
          };

          const selectSymbolCandidate = () => {
            try {
              var symbolSpan = document.querySelector('.name.svelte-19bwscl .symbol.svelte-19bwscl') ||
                               document.querySelector('.symbol.svelte-19bwscl') ||
                               document.querySelector('[class*="symbol"]');
              if (symbolSpan) { (symbolSpan).click(); return true; }
              return false;
            } catch(e) { return false; }
          };

          const searchAsset = async () => {
            try {
              var x = document.querySelector('input[placeholder="Search symbol"]') ||
                      document.querySelector('label.search.svelte-1mvzp7f input') ||
                      document.querySelector('.search input');
              if (x != null) {
                (x).value = asset;
                x.dispatchEvent(new Event('input', { bubbles: true }));
                x.focus();
                await sleep(800);
                return true;
              }
              return false;
            } catch(e) { return false; }
          };

          const loginFlow = async () => {
            send('step_update', 'Initializing MT5 Authentication...');
            await sleep(1200);

            pressRemove();
            await sleep(300);

            const filled = fillCreds();
            if (!filled) { send('authentication_failed', 'Could not find login fields'); return; }
            send('step_update', 'Submitting login...');
            const pressed = pressLogin();
            if (!pressed) { send('authentication_failed', 'Login button not found'); return; }

            // Poll for login inputs to disappear or search bar to appear
            let attempts = 0;
            while (attempts < 25) {
              attempts++;
              const loginInput = document.querySelector('input[name="login"]');
              const pwInput = document.querySelector('input[name="password"]');
              const search = document.querySelector('input[placeholder="Search symbol"], label.search input, .search input');
              if ((!loginInput && !pwInput) || (search && (search).offsetParent !== null)) {
                break;
              }
              await sleep(500);
            }

            send('step_update', 'Verifying authentication via symbol search...');
            const searched = await searchAsset();
            await sleep(800);
            if (searched) {
              // If we can search, treat as success and optionally click a symbol
              selectSymbolCandidate();
              done = true;
              var stS = scrapeTerminalAccountStats();
              send('authentication_success', 'Login Successful', { equity: stS.equity, balance: stS.balance });
              return;
            }

            // Fallback check on UI cues for success
            const bodyText = (document.body.innerText || '');
            if (bodyText.includes('Balance:') || bodyText.includes('Create New Order')) {
              done = true;
              var stF = scrapeTerminalAccountStats();
              send('authentication_success', 'Login Successful', { equity: stF.equity, balance: stF.balance });
              return;
            }

            send('authentication_failed', 'Authentication could not be verified');
          };

          if (document.readyState === 'complete' || document.readyState === 'interactive') loginFlow();
          else window.addEventListener('DOMContentLoaded', loginFlow);
        })();
      `;
    } else {
      // MT4 Authentication - Copy from successful trade execution steps
      return `
        (function(){
          const sendMessage = (type, message, extras) => {
            try {
              var payload = { type: type, message: message };
              if (extras && typeof extras === 'object') {
                for (var sk in extras) {
                  if (Object.prototype.hasOwnProperty.call(extras, sk) && extras[sk] != null) {
                    payload[sk] = extras[sk];
                  }
                }
              }
              window.ReactNativeWebView.postMessage(JSON.stringify(payload));
            } catch(e) {}
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

          // Enhanced field input function from trade script
          const typeInput = (el, value) => {
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
          };

          const login = () => {
            try {
              sendMessage('step_update', 'Filling MT4 credentials...');
              const loginEl = document.getElementById('login');
              const serverEl = document.getElementById('server');
              const passEl = document.getElementById('password');
              
              if (!loginEl || !serverEl || !passEl) {
                sendMessage('authentication_failed', 'Login form fields not found');
                return false;
              }
              
              // Fill credentials using enhanced method
              typeInput(loginEl, '${loginData.login}');
              typeInput(serverEl, '${loginData.server}');
              typeInput(passEl, '${loginData.password}');
              
              // Submit login
              setTimeout(function() {
                const btns = document.querySelectorAll('button.input-button');
                if (btns && btns[3]) { 
                  btns[3].removeAttribute('disabled'); 
                  btns[3].disabled = false; 
                  btns[3].click();
                  sendMessage('step_update', 'Submitting MT4 login...');
                } else {
                  sendMessage('authentication_failed', 'Login button not found');
                }
              }, 500);
              
              return true;
            } catch(e) { 
              sendMessage('authentication_failed', 'Error during login: ' + e.message);
              return false; 
            }
          };

          // Show all symbols to verify authentication (copied from trade script)
          const showAllSymbols = () => {
            try {
              var element = document.querySelector('body > div.page-window.market-watch.compact > div > div.b > div.page-block > div > table > tbody > tr:nth-child(1)');
              if (element) {
                var ev1 = new MouseEvent("mousedown", {
                  bubbles: true,
                  cancelable: false,
                  view: window,
                  button: 2,
                  buttons: 2,
                  clientX: element.getBoundingClientRect().x,
                  clientY: element.getBoundingClientRect().y
                });
                element.dispatchEvent(ev1);
                
                var ev2 = new MouseEvent("mouseup", {
                  bubbles: true,
                  cancelable: false,
                  view: window,
                  button: 2,
                  buttons: 0,
                  clientX: element.getBoundingClientRect().x,
                  clientY: element.getBoundingClientRect().y
                });
                element.dispatchEvent(ev2);
                
                var ev3 = new MouseEvent("contextmenu", {
                  bubbles: true,
                  cancelable: false,
                  view: window,
                  button: 2,
                  buttons: 0,
                  clientX: element.getBoundingClientRect().x,
                  clientY: element.getBoundingClientRect().y
                });
                element.dispatchEvent(ev3);
                
                setTimeout(function() {
                  var sall = document.querySelector('body > div.page-menu.context.expanded > div > div > span.box > span > div:nth-child(7)');
                  if (sall) {
                    sall.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                    sall.click();
                    sendMessage('step_update', 'Verifying authentication - showing all symbols...');
                  }
                }, 500);
                return true;
              }
              return false;
            } catch(e) { return false; }
          };

          // Verify authentication by checking if symbols are visible after "Show All"
          const verifyAuthentication = () => {
            try {
              // Check if the "Show All" menu item is still visible (means it wasn't clicked successfully)
              var showAllMenu = document.querySelector('body > div.page-menu.context.expanded > div > div > span.box > span > div:nth-child(7)');
              if (showAllMenu) {
                // Menu is still visible, "Show All" was not successful
                sendMessage('authentication_failed', 'Authentication failed - Could not access symbol list');
                return false;
              }
              
              // Check if we can see the market watch table with symbols
              var tableB = document.querySelector('body > div.page-window.market-watch.compact > div > div.b > div.page-block > div > table > tbody');
              if (tableB) {
                var allTRs = tableB.querySelectorAll('tr');
                if (allTRs.length > 0) {
                  // Try to find XAUUSD symbol
                  var ev = document.createEvent('MouseEvents');
                  ev.initEvent('dblclick', true, true);
                  for (var i = 0; i < allTRs.length; i++) {
                    var a = allTRs[i].getElementsByTagName('td')[0];
                    if (a && a.textContent && a.textContent.trim() === 'XAUUSD') {
                      a.dispatchEvent(ev);
                      var stX = scrapeTerminalAccountStats();
                      sendMessage('authentication_success', 'MT4 Authentication Successful - XAUUSD symbol found and selected', { equity: stX.equity, balance: stX.balance });
                      return true;
                    }
                  }
                  // XAUUSD not found but symbols are visible - still successful
                  var stL = scrapeTerminalAccountStats();
                  sendMessage('authentication_success', 'MT4 Authentication Successful - Symbol list accessible', { equity: stL.equity, balance: stL.balance });
                  return true;
                } else {
                  // No symbols visible - authentication failed
                  sendMessage('authentication_failed', 'Authentication failed - No symbols visible in market watch');
                  return false;
                }
              } else {
                // Market watch table not found - authentication failed
                sendMessage('authentication_failed', 'Authentication failed - Market watch not accessible');
                return false;
              }
            } catch(e) { 
              sendMessage('authentication_failed', 'Authentication failed - Error verifying access: ' + e.message);
              return false; 
            }
          };

          const start = () => {
            sendMessage('step_update', 'Starting MT4 authentication...');
            
            setTimeout(() => {
              const loginOk = login();
              if (!loginOk) return;
              
              // Wait for login to complete, then verify by showing symbols
              setTimeout(() => {
                sendMessage('step_update', 'Login submitted, verifying access...');
                const symbolsShown = showAllSymbols();
                
                // Wait longer for the "Show All" action to complete
                setTimeout(() => {
                  sendMessage('step_update', 'Checking symbol access...');
                  const authVerified = verifyAuthentication();
                  
                  // If verification failed, try one more time after a longer delay
                  if (!authVerified) {
                    setTimeout(() => {
                      sendMessage('step_update', 'Final authentication check...');
                      const finalCheck = verifyAuthentication();
                      if (!finalCheck) {
                        // Final fallback - check if we can see any trading interface
                        const hasMarketWatch = document.querySelector('div.page-window.market-watch');
                        const hasChart = document.querySelector('div.page-window.chart');
                       
                      }
                    }, 2000);
                  }
                }, 5000);
              }, 4000);
            }, 1000);
          };

          if (document.readyState === 'complete') start();
          else window.addEventListener('load', start);
        })();
      `;
    }
  };

  // Handle MT5 Web View
  const handleMT5WebView = () => {
    console.log('Opening MT5 Web View...');
    mt5LinkAuthRemountRef.current = 0;
    setShowMT5WebView(true);
    setMT5WebViewKey((k) => k + 1);
  };

  // Handle MT4 Web View
  const handleMT4WebView = () => {
    console.log('Opening MT4 Web View...');
    mt4LinkAuthRemountRef.current = 0;
    setShowMT4WebView(true);
    setMT4WebViewKey((k) => k + 1);
  };

  // Close MT5 Web View
  const closeMT5WebView = () => {
    console.log('Closing MT5 Web View...');

    clearWebTerminalByScope(WEBVIEW_SCOPE_MT5_LINK);

    setShowMT5WebView(false);
    if (mt5WebViewRef.current) {
      mt5WebViewRef.current = null;
    }

    // Force remount by incrementing key - this ensures fresh WebView instance
    setMT5WebViewKey((k) => k + 1);
  };

  // Close MT4 Web View
  const closeMT4WebView = () => {
    console.log('Closing MT4 Web View...');
    // Web: no WebWebView for MT4 (CustomWebView/native only). Do not call link/trading iframe clear.

    setShowMT4WebView(false);
    if (mt4WebViewRef.current) {
      mt4WebViewRef.current = null;
    }

    // Force remount by incrementing key - this ensures fresh WebView instance
    setMT4WebViewKey((k) => k + 1);
  };

  // Get MT5 JavaScript injection script
  const getMT5Script = () => {
    // Escape special characters to prevent injection issues
    const escapeValue = (value: string) => {
      return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    };

    const loginValue = escapeValue(login.trim());
    const passwordValue = escapeValue(password.trim());
    const serverValue = escapeValue(server.trim());

    // Validate that required values are provided
    if (!loginValue || !passwordValue) {
      return `
      (function() {
        const sendMessage = (type, message) => {
          try { window.ReactNativeWebView.postMessage(JSON.stringify({ type, message })); } catch(e) {}
        };
          sendMessage('authentication_failed', 'Login and password are required');
        })();
      `;
    }

    return `
      (function() {
        const sendMessage = (type, message, extras) => {
          try {
            var payload = { type: type, message: message };
            if (extras && typeof extras === 'object') {
              for (var key in extras) {
                if (Object.prototype.hasOwnProperty.call(extras, key) && extras[key] != null) {
                  payload[key] = extras[key];
                }
              }
            }
            window.ReactNativeWebView.postMessage(JSON.stringify(payload));
          } catch(e) {}
        };

        function collectPageTextDeep() {
          var parts = [];
          function walk(d) {
            try {
              if (!d) return;
              if (d.body && d.body.innerText) parts.push(d.body.innerText);
              var ifr = d.querySelectorAll('iframe');
              for (var ii = 0; ii < ifr.length; ii++) {
                try {
                  var ind = ifr[ii].contentDocument;
                  if (ind) walk(ind);
                } catch (eIf) {}
              }
            } catch (eW) {}
          }
          walk(document);
          return parts.join('\\n');
        }

        function normalizeAmountToken(raw) {
          if (!raw) return null;
          var s = String(raw).replace(/[\\s\\u00a0\\u202f\\u2007\\u2009]+/g, '').replace(/'/g, '');
          if (s.indexOf('.') >= 0) {
            s = s.replace(/,/g, '');
          } else if (s.indexOf(',') > 0 && s.indexOf(',') === s.lastIndexOf(',')) {
            var sp = s.split(',');
            if (sp.length === 2 && sp[1].length <= 2 && /^\\d+$/.test(sp[1])) {
              s = sp[0].replace(/\\./g, '') + '.' + sp[1];
            } else {
              s = s.replace(/,/g, '');
            }
          } else {
            s = s.replace(/,/g, '');
          }
          return s || null;
        }

        function scrapeTerminalAccountStats() {
          var equity = null;
          var balance = null;
          try {
            var raw = collectPageTextDeep();
            var txt = raw || ((document.body && document.body.innerText) ? document.body.innerText : '');
            txt = txt.replace(/[\\u00a0\\u202f\\u2007\\u2009]/g, ' ');
            var lineEq = txt.match(/(?:^|[\\n\\r])\\s*Equity\\s*[:\\s]+([\\d][\\d\\s,']*\\.?\\d*)/im);
            if (lineEq) equity = normalizeAmountToken(lineEq[1]);
            var lineBal = txt.match(/(?:^|[\\n\\r])\\s*Balance\\s*[:\\s]+([\\d][\\d\\s,']*\\.?\\d*)/im);
            if (lineBal) balance = normalizeAmountToken(lineBal[1]);
            if (!equity || !balance) {
              var compact = txt.replace(/[\\n\\r]+/g, ' ');
              if (!equity) {
                var e2 = compact.match(/Equity[:\\s]+([\\d][\\d\\s,']*\\.?\\d*)/i);
                if (e2) equity = normalizeAmountToken(e2[1]);
              }
              if (!balance) {
                var b2 = compact.match(/Balance[:\\s]+([\\d][\\d\\s,']*\\.?\\d*)/i);
                if (b2) balance = normalizeAmountToken(b2[1]);
              }
            }
            if (!equity) {
              var e3 = txt.match(/\\bEquity\\b[^\\d\\n]{0,56}([\\d][\\d\\s,\\.']*)/im);
              if (e3) equity = normalizeAmountToken(e3[1]);
            }
            if (!balance) {
              var b3 = txt.match(/\\bBalance\\b[^\\d\\n]{0,56}([\\d][\\d\\s,\\.']*)/im);
              if (b3) balance = normalizeAmountToken(b3[1]);
            }
          } catch (err) {}
          return { equity: equity, balance: balance };
        }

        function findMT5SearchField() {
          var q = [
            'input[placeholder*="Search symbol" i]',
            'input[placeholder*="symbol" i]',
            'input[placeholder*="Search" i]',
            'input[aria-label*="Search" i]',
            'input[type="search"]'
          ];
          for (var qi = 0; qi < q.length; qi++) {
            var el = document.querySelector(q[qi]);
            if (!el || !el.offsetParent) continue;
            if (q[qi].indexOf('type="search"') >= 0) {
              var ph = ((el.getAttribute && el.getAttribute('placeholder')) || '').toLowerCase();
              var nm = ((el.name || '') + '').toLowerCase();
              if (ph.indexOf('login') >= 0 || ph.indexOf('password') >= 0 || nm === 'login' || nm === 'password') continue;
            }
            return el;
          }
          return null;
        }

        sendMessage('mt5_loaded', 'MT5 terminal loaded successfully');
        
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        
        // Store credentials
        const loginCredential = '${loginValue}';
        const passwordCredential = '${passwordValue}';
        const serverCredential = '${serverValue}';

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

        const dismissLoginOverlay = async function() {
          var pw = passwordCredential;
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
        
        const authenticateMT5 = async () => {
          try {
            sendMessage('step_update', 'Initializing MT5 Account...');
            await sleep(5500);
            
            // Check for disclaimer and accept if present
            const disclaimer = document.querySelector('#disclaimer');
            if (disclaimer) {
              const acceptButton = document.querySelector('.accept-button');
              if (acceptButton) {
                acceptButton.click();
                sendMessage('step_update', 'Accepting disclaimer...');
                await sleep(2000);
              }
            }
            
            // Remove any existing connection - find Remove button (works across different broker terminals)
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
                await sleep(4500);
              } else {
                break;
              }
            }
            
            // Wait for form to be ready
            await sleep(2000);
            
            // Fill login credentials with enhanced field detection
            const loginField = document.querySelector('input[name="login"]') || 
                              document.querySelector('input[type="text"][placeholder*="login" i]') ||
                              document.querySelector('input[type="number"]') ||
                              document.querySelector('input#login');
            
            const passwordField = document.querySelector('input[name="password"]') || 
                                 document.querySelector('input[type="password"]') ||
                                 document.querySelector('input#password');
            
            // Fill login field
            if (loginField && loginCredential) {
              loginField.focus();
              loginField.value = '';
              loginField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
              loginField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
              
              setTimeout(() => {
                loginField.focus();
                loginField.value = loginCredential;
                loginField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                loginField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                sendMessage('step_update', 'Login filled');
              }, 100);
            } else {
              sendMessage('authentication_failed', 'Login field not found');
              return;
            }
            
            // Fill password field
            if (passwordField && passwordCredential) {
              setTimeout(() => {
                passwordField.focus();
                passwordField.value = '';
                passwordField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                passwordField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                
                setTimeout(() => {
                  passwordField.focus();
                  passwordField.value = passwordCredential;
                  passwordField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                  passwordField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                  sendMessage('step_update', 'Password filled');
                }, 100);
              }, 300);
            } else {
              sendMessage('authentication_failed', 'Password field not found');
              return;
            }
            
            // Wait for fields to be filled
            await sleep(2000);
            
            // Click login button
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
                await sleep(8000);
                for (var ov = 0; ov < 6; ov++) {
                  await dismissLoginOverlay();
                  await sleep(600);
                }
            } else {
              sendMessage('authentication_failed', 'Login button not found');
              return;
            }
            
            sendMessage('step_update', 'Verifying authentication...');
            await sleep(3000);
            for (var ov2 = 0; ov2 < 6; ov2++) {
              await dismissLoginOverlay();
              if (!isAnyLoginModalBlocking()) break;
              await sleep(450);
            }

            function tryFinishWithScrapedStats(successMsg) {
              var st = scrapeTerminalAccountStats();
              if (st.equity && st.balance) {
                sendMessage('authentication_success', successMsg, { equity: st.equity, balance: st.balance });
                return true;
              }
              return false;
            }

            for (var poll = 0; poll < 14; poll++) {
              if (tryFinishWithScrapedStats('MT5 Login Successful - Balance and equity')) return;
              await dismissLoginOverlay();
              await sleep(900);
            }

            var searchField = findMT5SearchField();
            if (searchField) {
              await dismissLoginOverlay();
              await sleep(2000);
              if (tryFinishWithScrapedStats('MT5 Login Successful - Terminal ready')) return;
              var statsOk = scrapeTerminalAccountStats();
              sendMessage('authentication_success', 'MT5 Login Successful - Search bar detected', { equity: statsOk.equity, balance: statsOk.balance });
              return;
            }

            await sleep(3000);
            await dismissLoginOverlay();
            for (var poll2 = 0; poll2 < 8; poll2++) {
              if (tryFinishWithScrapedStats('MT5 Login Successful - Balance and equity')) return;
              await dismissLoginOverlay();
              await sleep(700);
            }

            var searchFieldRetry = findMT5SearchField();
            if (searchFieldRetry) {
              await dismissLoginOverlay();
              if (tryFinishWithScrapedStats('MT5 Login Successful - Terminal ready')) return;
              var statsRetry = scrapeTerminalAccountStats();
              sendMessage('authentication_success', 'MT5 Login Successful - Search bar detected', { equity: statsRetry.equity, balance: statsRetry.balance });
              return;
            }

            if (tryFinishWithScrapedStats('MT5 Login Successful - Balance and equity')) return;

            var low = ((document.body && document.body.innerText) ? document.body.innerText : '').toLowerCase();
            if (
              low.indexOf('invalid login') >= 0 ||
              low.indexOf('invalid password') >= 0 ||
              low.indexOf('wrong password') >= 0 ||
              low.indexOf('wrong login') >= 0 ||
              low.indexOf('incorrect password') >= 0 ||
              low.indexOf('incorrect login') >= 0
            ) {
              sendMessage('authentication_failed', 'Authentication failed - Invalid login or password');
            } else {
              sendMessage('authentication_failed', 'Could not verify MT5 session. If the chart is visible, wait a few seconds and try Link Account again.');
            }
            
          } catch(e) {
            sendMessage('authentication_failed', 'Error during authentication: ' + e.message);
          }
        };
        
        // Start authentication after page loads
        setTimeout(authenticateMT5, 3000);
      })();
    `;
  };

  // Get MT4 JavaScript injection script
  const getMT4Script = () => {
    return `
      (function() {
        const sendMessage = (type, message, extras) => {
          try {
            var payload = { type: type, message: message };
            if (extras && typeof extras === 'object') {
              for (var key in extras) {
                if (Object.prototype.hasOwnProperty.call(extras, key) && extras[key] != null) {
                  payload[key] = extras[key];
                }
              }
            }
            window.ReactNativeWebView.postMessage(JSON.stringify(payload));
          } catch(e) {}
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

        sendMessage('mt4_loaded', 'MT4 MetaTrader Web terminal loaded successfully');
        
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        
        const authenticateMT4 = async () => {
          try {
            sendMessage('step_update', 'Starting MT4 authentication...');
            await sleep(3000);
            
            // Fill login credentials using enhanced method from your Android code
            const loginField = document.getElementById('login') || document.querySelector('input[name="login"]');
            const passwordField = document.getElementById('password') || document.querySelector('input[type="password"]');
            const serverField = document.getElementById('server') || document.querySelector('input[name="server"]');
            
            if (loginField && '${login.trim()}') {
              loginField.focus();
              loginField.select();
              loginField.value = '';
              loginField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
              loginField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
              
              setTimeout(() => {
                loginField.focus();
                loginField.value = '${login.trim()}';
                loginField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                loginField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                loginField.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
              }, 100);
              
              sendMessage('step_update', 'Filling MT4 credentials...');
            }
            
            if (serverField && '${server.trim()}') {
              serverField.focus();
              serverField.select();
              serverField.value = '';
              serverField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
              serverField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
              
              setTimeout(() => {
                serverField.focus();
                serverField.value = '${server.trim()}';
                serverField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                serverField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                serverField.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
              }, 100);
            }
            
            if (passwordField && '${password.trim()}') {
              passwordField.focus();
              passwordField.select();
              passwordField.value = '';
              passwordField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
              passwordField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
              
              setTimeout(() => {
                passwordField.focus();
                passwordField.value = '${password.trim()}';
                passwordField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                passwordField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                passwordField.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
              }, 100);
            }
            
            await sleep(500);
            
            // Submit login using MT4 specific button selector
            const loginButton = document.querySelector('button.input-button:nth-child(4)');
            if (loginButton) {
              loginButton.removeAttribute('disabled');
              loginButton.disabled = false;
              loginButton.click();
              sendMessage('step_update', 'Submitting MT4 login...');
            } else {
              sendMessage('authentication_failed', 'Login button not found');
              return;
            }
            
            await sleep(4000);
            
            // Show all symbols to verify authentication (copied from your Android code)
            const marketWatchElement = document.querySelector('body > div.page-window.market-watch.compact > div > div.b > div.page-block > div > table > tbody > tr:nth-child(1)');
            if (marketWatchElement) {
              const ev1 = new MouseEvent("mousedown", {
                bubbles: true,
                cancelable: false,
                view: window,
                button: 2,
                buttons: 2,
                clientX: marketWatchElement.getBoundingClientRect().x,
                clientY: marketWatchElement.getBoundingClientRect().y
              });
              marketWatchElement.dispatchEvent(ev1);
              
              const ev2 = new MouseEvent("mouseup", {
                bubbles: true,
                cancelable: false,
                view: window,
                button: 2,
                buttons: 0,
                clientX: marketWatchElement.getBoundingClientRect().x,
                clientY: marketWatchElement.getBoundingClientRect().y
              });
              marketWatchElement.dispatchEvent(ev2);
              
              const ev3 = new MouseEvent("contextmenu", {
                bubbles: true,
                cancelable: false,
                view: window,
                button: 2,
                buttons: 0,
                clientX: marketWatchElement.getBoundingClientRect().x,
                clientY: marketWatchElement.getBoundingClientRect().y
              });
              marketWatchElement.dispatchEvent(ev3);
              
              setTimeout(() => {
                const showAllButton = document.querySelector('body > div.page-menu.context.expanded > div > div > span.box > span > div:nth-child(7)');
                if (showAllButton) {
                  showAllButton.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                  showAllButton.click();
                  sendMessage('step_update', 'Verifying authentication - showing all symbols...');
                }
              }, 500);
            }
            
            await sleep(5000);
            
            // Verify authentication by checking if symbols are visible
            const tableB = document.querySelector('body > div.page-window.market-watch.compact > div > div.b > div.page-block > div > table > tbody');
            if (tableB) {
              const allTRs = tableB.querySelectorAll('tr');
              if (allTRs.length > 0) {
                // Try to find XAUUSD symbol
                const ev = document.createEvent('MouseEvents');
                ev.initEvent('dblclick', true, true);
                for (let i = 0; i < allTRs.length; i++) {
                  const a = allTRs[i].getElementsByTagName('td')[0];
                  if (a && a.textContent && a.textContent.trim() === 'XAUUSD') {
                    a.dispatchEvent(ev);
                    var stX = scrapeTerminalAccountStats();
                    sendMessage('authentication_success', 'MT4 Authentication Successful - XAUUSD symbol found and selected', { equity: stX.equity, balance: stX.balance });
                    return;
                  }
                }
                // XAUUSD not found but symbols are visible - still successful
                var stList = scrapeTerminalAccountStats();
                sendMessage('authentication_success', 'MT4 Authentication Successful - Symbol list accessible', { equity: stList.equity, balance: stList.balance });
              } else {
                sendMessage('authentication_failed', 'Authentication failed - No symbols visible in market watch');
              }
            } else {
              sendMessage('authentication_failed', 'Authentication failed - Market watch not accessible');
            }
            
          } catch(e) {
            sendMessage('authentication_failed', 'Error during authentication: ' + e.message);
          }
        };
        
        // Start authentication after page loads
        setTimeout(authenticateMT4, 3000);
      })();
    `;
  };

  const handleLinkAccount = async () => {
    if (!login.trim() || !password.trim() || !server.trim()) {
      Alert.alert('Missing Information', 'Please fill in all fields to continue.');
      return;
    }

    // Show web view based on active tab
    if (activeTab === 'MT5') {
      handleMT5WebView();
    } else {
      handleMT4WebView();
    }
  };



  return (
    <SafeAreaView style={[styles.container, { backgroundColor: screenBg }]}>
      <MatrixSceneRain>
      <KeyboardAvoidingView
        style={[styles.keyboardAvoidingView, { backgroundColor: screenBg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={[styles.content, { backgroundColor: screenBg }]}
          contentContainerStyle={
            SHOW_EMBEDDED_MT_WEBVIEW && (showMT5WebView || showMT4WebView)
              ? { paddingBottom: EMBEDDED_WEBVIEW_HEIGHT + 16 }
              : undefined
          }
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Account Type Tabs */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[mtChrome.tab, activeTab === 'MT5' && mtChrome.tabActive, styles.centeredTab]}
              onPress={() => setActiveTab('MT5')}
              activeOpacity={0.8}
            >
              {Platform.OS === 'ios' && (
                <BlurView intensity={130} tint="dark" style={StyleSheet.absoluteFill} />
              )}
              <LinearGradient
                colors={activeTab === 'MT5' ? mt5TabGradActive : mt5TabGradInactive}
                style={StyleSheet.absoluteFill}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'MT5'
                    ? { color: theme.colors.textPrimary, fontWeight: '800' }
                    : { color: theme.colors.textMuted },
                ]}
              >
                MT5 ACCOUNT
              </Text>
            </TouchableOpacity>
          </View>

          {/* Connection Status */}
          <View style={styles.statusContainer}>
            <View
              testID="connection-status-dot"
              style={[
                styles.statusDot,
                (activeTab === 'MT4' ? mt4Account?.connected : mt5Account?.connected) === true && {
                  backgroundColor: theme.colors.statusActive,
                },
                (activeTab === 'MT4' ? mt4Account?.connected : mt5Account?.connected) === false && {
                  backgroundColor: theme.colors.error,
                },
              ]}
            />
            <Text
              style={[
                styles.statusText,
                {
                  color:
                    (activeTab === 'MT4' ? mt4Account?.connected : mt5Account?.connected) === true
                      ? theme.colors.accent
                      : (activeTab === 'MT4' ? mt4Account?.connected : mt5Account?.connected) === false
                        ? theme.colors.error
                        : theme.colors.textMuted,
                },
              ]}
            >
              MT5
            </Text>
          </View>

          {(activeTab === 'MT4' ? mt4Account?.connected : mt5Account?.connected) === true && (
            <View style={styles.equityStrip}>
              <Text style={[styles.equityStripLabel, { color: theme.colors.textSecondary }]}>
                Equity
              </Text>
              <Text
                testID="terminal-equity"
                style={[
                  styles.equityStripValue,
                  { color: theme.colors.textPrimary },
                  !(activeTab === 'MT4' ? mt4Account?.equity : mt5Account?.equity) && {
                    color: theme.colors.textMuted,
                  },
                ]}
              >
                {(activeTab === 'MT4' ? mt4Account?.equity : mt5Account?.equity) ?? '—'}
              </Text>
              {(activeTab === 'MT4' ? mt4Account?.balance : mt5Account?.balance) ? (
                <>
                  <Text style={[styles.equityStripSep, { color: theme.colors.textMuted }]}>·</Text>
                  <Text style={[styles.equityStripLabel, { color: theme.colors.textSecondary }]}>
                    Balance
                  </Text>
                  <Text style={[styles.equityStripValue, { color: theme.colors.textPrimary }]}>
                    {activeTab === 'MT4' ? mt4Account?.balance : mt5Account?.balance}
                  </Text>
                </>
              ) : null}
            </View>
          )}

          {/* MT Logo and Title */}
          <View style={styles.logoContainer}>
            <View style={styles.mtLogoImageContainer}>
              <Image
                source={activeTab === 'MT4' ? require('@/assets/images/mt4logo.png') : require('@/assets/images/mt5logo.png')}
                style={styles.mtLogoImage}
                resizeMode="contain"
              />
            </View>
          </View>

          {/* Current Account Details Display */}
          {false && (
            <View style={styles.accountDetailsContainer}>
              <Text style={styles.accountDetailsTitle}>CURRENT {activeTab} ACCOUNT</Text>
              <View style={styles.accountDetailRow}>
                <Text style={styles.accountDetailLabel}>Login:</Text>
                <Text style={styles.accountDetailValue}>
                  {(activeTab === 'MT4' ? mt4Account?.login : mt5Account?.login) || 'Not set'}
                </Text>
              </View>
              <View style={styles.accountDetailRow}>
                <Text style={styles.accountDetailLabel}>Password:</Text>
                <Text style={styles.accountDetailValue}>
                  {(activeTab === 'MT4' ? mt4Account?.password : mt5Account?.password) ? '••••••••' : 'Not set'}
                </Text>
              </View>
              <View style={styles.accountDetailRow}>
                <Text style={styles.accountDetailLabel}>Server:</Text>
                <Text style={styles.accountDetailValue}>
                  {(activeTab === 'MT4' ? mt4Account?.server : mt5Account?.server) || 'Not set'}
                </Text>
              </View>
              <View style={styles.accountDetailRow}>
                <Text style={styles.accountDetailLabel}>Status:</Text>
                <Text style={[
                  styles.accountDetailValue,
                  (activeTab === 'MT4' ? mt4Account?.connected : mt5Account?.connected) === true && styles.connectedStatus,
                  (activeTab === 'MT4' ? mt4Account?.connected : mt5Account?.connected) === false && styles.disconnectedStatus
                ]}>
                  {(activeTab === 'MT4' ? mt4Account?.connected : mt5Account?.connected) === true ? 'Connected' :
                    (activeTab === 'MT4' ? mt4Account?.connected : mt5Account?.connected) === false ? 'Disconnected' : 'Not configured'}
                </Text>
              </View>
            </View>
          )}

          {/* Hidden WebView for fetching MT4 brokers - Mobile only, only shown when fetching brokers */}
          {/* Networking disabled: broker fetch WebView removed */}

          {/* Authentication WebView. MT4 and MT5 are VISIBLE so you can observe the login flow */}
          {/* Networking disabled: authentication WebView removed */}

          {/* Authentication Status Display - Only shown during authentication */}
          {isAuthenticating && (
            <View style={[styles.authStatusDisplay, mtChrome.framedPanel]}>
              {/* Gradient background */}
              <LinearGradient
                colors={theme.colors.primaryGradient as [string, string, ...string[]]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />

              {/* Glass overlay */}
              {Platform.OS === 'ios' && (
                <BlurView intensity={40} tint="light" style={[StyleSheet.absoluteFill, { opacity: 0.3 }]} />
              )}

              <ActivityIndicator color="#FFFFFF" size="small" style={{ zIndex: 3 }} />
              <Text style={[styles.authStatusDisplayText, { zIndex: 3 }]}>{authenticationStep}</Text>
            </View>
          )}

          {/* Login Form */}
          <View style={[styles.formCard, { shadowColor: theme.colors.glowColor }]}>
            {/* Gradient background */}
            <LinearGradient
              colors={theme.colors.primaryGradient as [string, string, ...string[]]}
              style={styles.formGradientBackground}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />

            {/* Glass overlay */}
            {Platform.OS === 'ios' && (
              <BlurView intensity={40} tint="light" style={styles.formGlassOverlay} />
            )}

            {/* Glossy shine */}
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 0.15)', 'rgba(255, 255, 255, 0)']}
              style={styles.formGlossShine}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
            />

            <View style={styles.form}>
              <View style={[styles.inputContainer, { zIndex: 3 }]} pointerEvents="box-none">
                {Platform.OS === 'ios' && (
                  <BlurView intensity={130} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
                )}
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.04)']}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <TextInput
                  style={mtChrome.input}
                  placeholder="Login"
                  placeholderTextColor={theme.colors.textMuted}
                  value={login}
                  onChangeText={(text) => {
                    console.log('Login input changed:', text);
                    setLogin(text);
                  }}
                  keyboardType="numeric"
                  editable={true}
                />
              </View>

              <View style={[styles.passwordContainer, { zIndex: 3 }]} pointerEvents="box-none">
                {Platform.OS === 'ios' && (
                  <BlurView intensity={130} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
                )}
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.04)']}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <TextInput
                  style={[styles.passwordInput, { color: theme.colors.textPrimary }]}
                  placeholder="Password"
                  placeholderTextColor={theme.colors.textMuted}
                  value={password}
                  onChangeText={(text) => {
                    console.log('Password input changed:', text);
                    setPassword(text);
                  }}
                  secureTextEntry={!showPassword}
                  editable={true}
                />
                <TouchableOpacity
                  style={[styles.eyeButton, mtChrome.accentControl]}
                  onPress={() => setShowPassword(!showPassword)}
                  activeOpacity={0.8}
                >
                  {Platform.OS === 'ios' && (
                    <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
                  )}
                  {showPassword ? (
                    <EyeOff color={theme.colors.textMuted} size={18} />
                  ) : (
                    <Eye color={theme.colors.textMuted} size={18} />
                  )}
                </TouchableOpacity>
              </View>

              <View style={[styles.serverContainer, { zIndex: 3 }]}>
                <View style={styles.serverInputContainer} pointerEvents="box-none">
                  {Platform.OS === 'ios' && (
                    <BlurView intensity={130} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
                  )}
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.04)']}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  <Database color={theme.colors.textMuted} size={18} style={styles.serverIcon} />
                  <TextInput
                    style={[styles.serverInput, { color: theme.colors.textPrimary }]}
                    placeholder={activeTab === 'MT4' ? "Search MT4 Broker Server..." : "Search MT5 Broker Server..."}
                    placeholderTextColor={theme.colors.textMuted}
                    value={server}
                    onChangeText={(text) => {
                      console.log('Server input changed:', text);
                      setServer(text);
                      setShowBrokerList(true);
                    }}
                    onFocus={() => {
                      setShowBrokerList(true);
                    }}
                    autoCapitalize="none"
                    editable={true}
                  />
                  {server.length > 0 && (
                    <TouchableOpacity
                      style={[styles.clearButton, mtChrome.accentControl]}
                      onPress={() => {
                        setServer('');
                        setShowBrokerList(false);
                      }}
                      activeOpacity={0.8}
                    >
                      {Platform.OS === 'ios' && (
                        <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
                      )}
                      <Text style={styles.clearButtonText}>×</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {showBrokerList && (
                  <View style={[styles.brokerListContainer, mtChrome.brokerListChrome]}>
                    <View style={styles.brokerListHeader}>
                      <Text style={styles.brokerListTitle}>Active {activeTab} Brokers</Text>
                      <View style={styles.brokerListActions}>
                        {activeTab === 'MT4' && (
                          <TouchableOpacity
                            onPress={() => {
                              console.log('Manual broker refresh requested');
                              fetchMT4Brokers();
                            }}
                            style={styles.refreshButton}
                            disabled={isLoadingBrokers}
                            activeOpacity={0.8}
                          >
                            {Platform.OS === 'ios' && (
                              <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
                            )}
                            <RefreshCw
                              color={Platform.OS === 'ios' ? '#FFFFFF' : '#FFFFFF'}
                              size={16}
                              style={[styles.refreshIcon, isLoadingBrokers && styles.refreshIconSpinning]}
                            />
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          onPress={() => setShowBrokerList(false)}
                          style={styles.closeBrokerList}
                          activeOpacity={0.8}
                        >
                          {Platform.OS === 'ios' && (
                            <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
                          )}
                          <Text style={styles.closeBrokerListText}>×</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    {brokerFetchError && (
                      <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{brokerFetchError}</Text>
                      </View>
                    )}
                    {isLoadingBrokers && (
                      <View style={styles.loadingBrokersContainer}>
                        <ActivityIndicator color={Platform.OS === 'ios' ? '#FFFFFF' : '#000000'} size="small" />
                        <Text style={styles.loadingBrokersText}>Fetching live broker list...</Text>
                      </View>
                    )}
                    <ScrollView style={styles.brokerList} nestedScrollEnabled={true}>
                      {filteredBrokers.map((item, index) => {
                        return (
                          <TouchableOpacity
                            key={`${item}-${index}`}
                            style={[styles.brokerItem, mtChrome.brokerItemChrome]}
                            onPress={() => {
                              console.log('Broker selected:', item);
                              setServer(item); // Allow selection of any broker from the list
                              setShowBrokerList(false);
                            }}
                          >
                            {/* Gradient background */}
                            <LinearGradient
                              colors={theme.colors.primaryGradient as [string, string, ...string[]]}
                              style={styles.brokerGradientBackground}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                            />

                            {/* Glass overlay — matrix: dark blur only (no white glass) */}
                            {Platform.OS === 'ios' && (
                              <BlurView
                                intensity={themeName === 'matrix' ? 28 : 40}
                                tint={themeName === 'matrix' ? 'dark' : 'light'}
                                style={styles.brokerGlassOverlay}
                              />
                            )}

                            {/* Glossy shine */}
                            <LinearGradient
                              colors={
                                themeName === 'matrix'
                                  ? ['rgba(0, 255, 100, 0.16)', 'rgba(0, 255, 100, 0.05)', 'rgba(0, 0, 0, 0)']
                                  : ['rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 0.15)', 'rgba(255, 255, 255, 0)']
                              }
                              style={styles.brokerGlossShine}
                              start={{ x: 0.5, y: 0 }}
                              end={{ x: 0.5, y: 1 }}
                            />

                            <View style={[styles.brokerItemContent, { zIndex: 3 }]}>
                              <View style={[styles.brokerStatusDot, styles.liveBrokerDot]} />
                              <Text style={styles.brokerItemText}>
                                {item}
                              </Text>
                              <Text style={styles.brokerItemType}>
                                {item.includes('Demo') ? 'DEMO' : 'LIVE'}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                    {filteredBrokers.length === 0 && (
                      <View style={styles.noBrokersContainer}>
                        <Search color="#999999" size={24} />
                        <Text style={styles.noBrokersText}>No brokers found</Text>
                        <Text style={styles.noBrokersSubtext}>Try a different search term</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[
                  mtChrome.linkButton,
                  isAuthenticating && styles.linkButtonDisabled,
                  activeTab === 'MT4' && styles.linkButtonComingSoon,
                  { zIndex: 1 },
                ]}
                onPress={activeTab === 'MT4' ? undefined : handleLinkAccount}
                disabled={isAuthenticating || activeTab === 'MT4'}
                activeOpacity={0.8}
              >
                {Platform.OS === 'ios' && (
                  <BlurView intensity={130} tint="dark" style={StyleSheet.absoluteFill} />
                )}
                <LinearGradient
                  colors={activeTab === 'MT4'
                    ? ['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.02)']
                    : ['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.06)']}
                  style={StyleSheet.absoluteFill}
                />
                {isAuthenticating ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator color={theme.colors.onAccent} size="small" />
                    <Text style={[styles.linkButtonText, { color: theme.colors.onAccent }]}>
                      AUTHENTICATING...
                    </Text>
                  </View>
                ) : activeTab === 'MT4' ? (
                  <View style={styles.buttonContent}>
                    <Shield color={theme.colors.textMuted} size={16} style={styles.buttonIcon} />
                    <Text style={[styles.linkButtonText, { color: theme.colors.textSecondary }]}>
                      LINK MT4 ACCOUNT DETAILS
                    </Text>
                    <Text style={styles.comingSoonText}>
                      COMING SOON
                    </Text>
                  </View>
                ) : (
                  <View style={styles.buttonContent}>
                    <Text style={[styles.linkButtonText, { color: theme.colors.onAccent }]}>
                      CONNECT
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* MT5 Authentication Toast */}
      {showMT5WebView && (
        <View style={[styles.authToastContainer, mtChrome.toastFrame]}>
          {/* Gradient background for toast */}
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
                <Text style={styles.authToastTitle}>MT5 Authentication</Text>
                <Text style={styles.authToastStatus}>
                  {authenticationStep || 'Connecting to RazorMarkets...'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.authToastCloseButton}
              onPress={closeMT5WebView}
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
      )}

      {/* MT5 WebView — hidden or bottom panel (see SHOW_EMBEDDED_MT_WEBVIEW) */}
      {showMT5WebView && (
        <View
          key={`mt5-webview-${mt5WebViewKey}`}
          style={SHOW_EMBEDDED_MT_WEBVIEW ? styles.visibleWebViewContainer : styles.invisibleWebViewContainer}
        >
          {Platform.OS === 'web' ? (
            <WebWebView
              key={`mt5-web-${mt5WebViewKey}`}
              scopeId={WEBVIEW_SCOPE_MT5_LINK}
              url={`/api/mt5-proxy?url=${encodeURIComponent(MT5_BROKER_URLS[server] || MT5_BROKER_URLS['RazorMarkets-Live'])}&login=${encodeURIComponent(login)}&password=${encodeURIComponent(password)}&broker=${encodeURIComponent(server || 'RazorMarkets-Live')}`}
              onMessage={onMT5WebViewMessage}
              onLoadEnd={() => console.log('MT5 Web WebView loaded')}
              style={SHOW_EMBEDDED_MT_WEBVIEW ? styles.visibleWebView : styles.invisibleWebView}
            />
          ) : (
            <CustomWebView
              key={`mt5-custom-${mt5WebViewKey}`}
              url={MT5_BROKER_URLS[server] || MT5_BROKER_URLS['RazorMarkets-Live']}
              script={getMT5Script()}
              onMessage={onMT5WebViewMessage}
              onLoadEnd={() => console.log('MT5 CustomWebView loaded')}
              style={SHOW_EMBEDDED_MT_WEBVIEW ? styles.visibleWebView : styles.invisibleWebView}
            />
          )}
        </View>
      )}

      {/* MT4 Authentication Toast */}
      {showMT4WebView && (
        <View style={[styles.authToastContainer, mtChrome.toastFrame]}>
          {/* Gradient background for toast */}
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
                <Text style={styles.authToastTitle}>MT4 Authentication</Text>
                <Text style={styles.authToastStatus}>
                  {authenticationStep || 'Connecting to MetaTrader...'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.authToastCloseButton}
              onPress={closeMT4WebView}
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
      )}

      {/* MT4 WebView — hidden or bottom panel (see SHOW_EMBEDDED_MT_WEBVIEW) */}
      {showMT4WebView && (
        <View
          key={`mt4-webview-${mt4WebViewKey}`}
          style={SHOW_EMBEDDED_MT_WEBVIEW ? styles.visibleWebViewContainer : styles.invisibleWebViewContainer}
        >
          <CustomWebView
            key={`mt4-custom-${mt4WebViewKey}`}
            url="https://metatraderweb.app/trade?version=4"
            script={getMT4Script()}
            onMessage={onMT4WebViewMessage}
            onLoadEnd={() => console.log('MT4 CustomWebView loaded')}
            style={SHOW_EMBEDDED_MT_WEBVIEW ? styles.visibleWebView : styles.invisibleWebView}
          />
        </View>
      )}
      </MatrixSceneRain>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingTop: 20,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 20,
    justifyContent: 'center',
  },
  centeredTab: {
    alignSelf: 'center',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#999999', // Default gray when no account
    marginRight: 10,
  },
  statusText: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
  },
  equityStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  equityStripLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  equityStripValue: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  equityStripSep: {
    fontSize: 14,
    marginHorizontal: 4,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  mtLogoImageContainer: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  mtLogoImage: {
    width: 100,
    height: 100,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  formCard: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 30,
    borderRadius: 32,
    borderWidth: 1.5,
    borderTopWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderTopColor: 'rgba(255, 255, 255, 0.4)',
    overflow: 'visible',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 15,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  formGradientBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 32,
    zIndex: 0,
    opacity: 0.9,
  },
  formGlassOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 32,
    zIndex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  formGlossShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    zIndex: 2,
  },
  form: {
    paddingHorizontal: 20,
    paddingVertical: 30,
    zIndex: 3,
  },
  inputContainer: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.backgroundMedium,
    borderWidth: 0.3,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
    position: 'relative',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    zIndex: 1,
    position: 'relative',
  },
  eyeButton: {
    marginLeft: 8,
  },
  linkButtonText: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginLeft: 8,
    letterSpacing: 0.5,
  },
  linkButtonDisabled: {
    opacity: 0.7,
  },
  linkButtonComingSoon: {
    backgroundColor: '#1a1a1a', // Dark background
    opacity: 0.6,
  },
  comingSoonText: {
    color: '#FF4444', // Red color
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    marginLeft: 8,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIcon: {
    marginRight: 8,
  },

  serverContainer: {
    marginBottom: 16,
    position: 'relative',
    zIndex: 10000,
    overflow: 'visible',
  },
  serverInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.backgroundMedium,
    borderWidth: 0.3,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
    position: 'relative',
  },
  serverIcon: {
    marginLeft: 16,
  },
  serverInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    zIndex: 1,
    position: 'relative',
  },
  clearButton: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    overflow: 'hidden',
  },
  clearButtonText: {
    color: '#999999',
    fontSize: 20,
    fontWeight: 'bold',
  },
  brokerListContainer: {
    position: 'absolute',
    top: 62,
    left: -20,
    right: -20,
    height: 240,
    backgroundColor: '#000000',
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.8,
    shadowRadius: 24,
    elevation: 20,
    zIndex: 10001,
  },
  brokerListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  brokerListTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  closeBrokerList: {
    padding: 6,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.backgroundStrong,
    borderRadius: 12,
    borderWidth: 0.3,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  closeBrokerListText: {
    color: '#999999',
    fontSize: 18,
    fontWeight: 'bold',
  },
  brokerList: {
    flex: 1,
  },
  brokerItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    borderTopWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderTopColor: 'rgba(255, 255, 255, 0.4)',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  brokerGradientBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    zIndex: 0,
    opacity: 0.85,
  },
  brokerGlassOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    zIndex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  brokerGlossShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 2,
  },
  brokerItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brokerStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  liveBrokerDot: {
    backgroundColor: '#10B981',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  demoBrokerDot: {
    backgroundColor: '#F59E0B',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  brokerItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  brokerItemType: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  noBrokersContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  noBrokersText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 12,
  },
  noBrokersSubtext: {
    fontSize: 14,
    color: '#999999',
    marginTop: 4,
  },
  authStatusDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 20,
    backgroundColor: 'transparent',
    borderRadius: 20,
    marginHorizontal: 20,
    borderWidth: 1.5,
    borderTopWidth: 2,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
    position: 'relative',
  },
  authStatusDisplayText: {
    marginLeft: 12,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  brokerListActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  refreshButton: {
    padding: 6,
    marginRight: 8,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.backgroundStrong,
    borderRadius: 12,
    borderWidth: 0.3,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  refreshIcon: {
    opacity: 0.7,
  },
  refreshIconSpinning: {
    opacity: 0.5,
  },
  errorContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#DC2626',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  errorText: {
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  loadingBrokersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  loadingBrokersText: {
    marginLeft: 8,
    fontSize: 12,
    color: '#FFFFFF',
  },
  brokerItemDisabled: {
    opacity: 0.5,
  },
  brokerStatusDotDisabled: {
    backgroundColor: '#666666',
  },
  brokerItemTextDisabled: {
    color: '#666666',
  },
  brokerItemTypeDisabled: {
    color: '#666666',
    backgroundColor: '#1A1A1A',
  },
  disabledLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: '#DC2626',
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    marginLeft: 8,
  },
  accountDetailsContainer: {
    marginHorizontal: 20,
    marginBottom: 30,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333333',
  },
  accountDetailsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  accountDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  accountDetailLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#CCCCCC',
  },
  accountDetailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'right',
  },
  connectedStatus: {
    color: '#16A34A',
  },
  disconnectedStatus: {
    color: '#DC2626',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 1000,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalButtonText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  webViewContainer: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  webView: {
    flex: 1,
  },

  // Authentication Toast Styles
  authToastContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    left: 20,
    right: 20,
    backgroundColor: '#000000',
    borderRadius: 20,
    borderWidth: 1.5,
    borderTopWidth: 2,
    shadowOffset: {
      width: 0,
      height: 12,
    },
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

  invisibleWebViewContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    zIndex: -1,
    pointerEvents: 'none' as const,
  },
  invisibleWebView: {
    flex: 1,
    width: '100%',
    minHeight: 350,
    opacity: 0,
  },
  visibleWebViewContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: EMBEDDED_WEBVIEW_HEIGHT,
    zIndex: 8,
    backgroundColor: '#0a0a0f',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.14)',
    pointerEvents: 'auto' as const,
  },
  visibleWebView: {
    flex: 1,
    width: '100%',
    minHeight: 200,
    opacity: 1,
  },
});
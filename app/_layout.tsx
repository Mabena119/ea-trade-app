import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState, Component, ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { AppProvider, useApp } from "@/providers/app-provider";
import { View, Platform, Text, TouchableOpacity, StyleSheet, AppState, NativeEventEmitter, NativeModules, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { DynamicIsland } from "@/components/dynamic-island";
import { RobotLogo } from "@/components/robot-logo";
import { TradingWebView } from "@/components/trading-webview";
import colors from "@/constants/colors";
import * as Linking from "expo-linking";

// CRITICAL: Ensure React Native Web event system initializes on web
if (typeof window !== 'undefined' && Platform.OS === 'web') {
  // Initialize React Native Web event system immediately
  (function initRNW() {
    const root = document.getElementById('root');
    if (root) {
      root.setAttribute('data-reactroot', '');
      root.style.pointerEvents = 'auto';
      root.style.touchAction = 'manipulation';
    }
    
    // Also initialize when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initRNW);
    }
    
    // Initialize after React might have mounted
    setTimeout(initRNW, 100);
    setTimeout(initRNW, 500);
  })();
}

// Early console suppression - must be at the very top
if (typeof window !== 'undefined' && Platform.OS === 'web') {
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
      message.includes('not recognized and ignored') ||
      message.includes('We recommended using authenticated encryption') ||
      message.includes('implementing it manually can result in minor') ||
      message.includes('serious mistakes') ||
      message.includes('protect against chosen-ciphertext attacks') ||
      message.includes('do not provide authentication by default') ||
      message.includes('can result in minor, but serious mistakes') ||
      message.includes('We recommended using') ||
      message.includes('authenticated encryption like AES-GCM');
  }

  console.warn = function (...args) {
    const message = args.join(' ');
    if (shouldSuppress(message)) return;
    originalWarn.apply(console, args);
  };

  console.error = function (...args) {
    const message = args.join(' ');
    if (shouldSuppress(message)) return;
    originalError.apply(console, args);
  };

  console.log = function (...args) {
    const message = args.join(' ');
    if (shouldSuppress(message)) return;
    originalLog.apply(console, args);
  };
}

// Error Boundary Component
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    console.error('ErrorBoundary caught an error:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary componentDidCatch:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <RobotLogo size={80} />
          <Text style={errorStyles.title}>Something went wrong</Text>
          <Text style={errorStyles.message}>
            The app encountered an error. Please restart the app.
          </Text>
          <TouchableOpacity
            style={errorStyles.button}
            onPress={() => this.setState({ hasError: false, error: undefined })}
          >
            <Text style={errorStyles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 20,
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
  },
  button: {
    backgroundColor: colors.error,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 16,
  },
  buttonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

function RootLayoutNav() {
  const {
    isFirstTime,
    eas,
    isBotActive,
    newSignal,
    dismissNewSignal,
    tradingSignal,
    showTradingWebView,
    setShowTradingWebView,
    pausePolling,
    resumePolling
  } = useApp();
  const [appState, setAppState] = useState<string>(AppState.currentState);

  // Debug TradingWebView state changes
  useEffect(() => {
    console.log('Root Layout - TradingWebView state changed:', {
      visible: showTradingWebView,
      hasSignal: !!tradingSignal,
      signalAsset: tradingSignal?.asset,
      signalAction: tradingSignal?.action
    });
  }, [showTradingWebView, tradingSignal]);

  // Listen for widget button clicks via native events (immediate, no polling needed)
  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    // Create event emitter for WidgetDataManager
    const { WidgetDataManager } = NativeModules;
    if (!WidgetDataManager) {
      console.warn('WidgetDataManager native module not available');
      return;
    }

    const eventEmitter = new NativeEventEmitter(WidgetDataManager);

    // Listen for widget polling toggle events
    const subscription = eventEmitter.addListener('WidgetPollingToggled', (event: { isPaused: boolean }) => {
      console.log('Widget button clicked via native event, syncing polling state:', event.isPaused);
      if (event.isPaused) {
        pausePolling();
      } else {
        resumePolling();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [pausePolling, resumePolling]);

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={[colors.background, colors.backgroundSecondary, colors.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
        <Stack.Screen name="license" />
        <Stack.Screen name="trade-config" options={{ presentation: "modal" }} />
      </Stack>
      {/* Always render DynamicIsland when conditions are met, regardless of app state */}
      {/* Render outside Stack to ensure it appears on top */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'box-none', zIndex: 10000 }}>
        <DynamicIsland
          visible={!isFirstTime && eas.length > 0 && isBotActive}
          newSignal={newSignal}
          onSignalDismiss={dismissNewSignal}
        />
      </View>

      {/* Trading WebView Modal */}
      <TradingWebView
        visible={showTradingWebView}
        signal={tradingSignal}
        onClose={() => {
          console.log('TradingWebView onClose called');
          setShowTradingWebView(false);
        }}
      />
    </View>
  );
}

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState<boolean>(false);

  // Force React Native Web to update dimensions on window resize
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const updateDimensions = () => {
        // Trigger a Dimensions update by accessing it
        const { width, height } = Dimensions.get('window');
        // Force a re-render by updating a state if needed
        // This ensures React Native Web components respond to window resize
        window.dispatchEvent(new Event('resize'));
      };

      window.addEventListener('resize', updateDimensions);
      window.addEventListener('orientationchange', updateDimensions);
      
      return () => {
        window.removeEventListener('resize', updateDimensions);
        window.removeEventListener('orientationchange', updateDimensions);
      };
    }
  }, []);

  useEffect(() => {
    // Set up comprehensive console warning filter for external warnings
    if (Platform.OS === 'web') {
      const originalWarn = console.warn;
      const originalError = console.error;
      const originalLog = console.log;

      // Filter console.warn
      console.warn = (...args) => {
        const message = args.join(' ');
        // Suppress warnings from external terminals and dependencies
        if (message.includes('interactive-widget') ||
          message.includes('viewport') ||
          message.includes('Viewport argument key') ||
          message.includes('AES-CBC') ||
          message.includes('AES-CTR') ||
          message.includes('AES-GCM') ||
          message.includes('chosen-ciphertext') ||
          message.includes('authentication by default') ||
          message.includes('not recognized and ignored') ||
          message.includes('We recommended using authenticated encryption') ||
          message.includes('implementing it manually can result in minor') ||
          message.includes('serious mistakes') ||
          message.includes('protect against chosen-ciphertext attacks') ||
          message.includes('do not provide authentication by default') ||
          message.includes('can result in minor, but serious mistakes') ||
          message.includes('We recommended using') ||
          message.includes('authenticated encryption like AES-GCM')) {
          return;
        }
        originalWarn.apply(console, args);
      };

      // Filter console.error for the same warnings
      console.error = (...args) => {
        const message = args.join(' ');
        // Suppress error messages from external terminals and dependencies
        if (message.includes('interactive-widget') ||
          message.includes('viewport') ||
          message.includes('Viewport argument key') ||
          message.includes('AES-CBC') ||
          message.includes('AES-CTR') ||
          message.includes('AES-GCM') ||
          message.includes('chosen-ciphertext') ||
          message.includes('authentication by default') ||
          message.includes('not recognized and ignored') ||
          message.includes('We recommended using authenticated encryption') ||
          message.includes('implementing it manually can result in minor') ||
          message.includes('serious mistakes') ||
          message.includes('protect against chosen-ciphertext attacks') ||
          message.includes('do not provide authentication by default') ||
          message.includes('can result in minor, but serious mistakes') ||
          message.includes('We recommended using') ||
          message.includes('authenticated encryption like AES-GCM')) {
          return;
        }
        originalError.apply(console, args);
      };

      // Filter console.log for terminal warnings
      console.log = (...args) => {
        const message = args.join(' ');
        // Suppress log messages from external terminals and dependencies
        if (message.includes('interactive-widget') ||
          message.includes('viewport') ||
          message.includes('Viewport argument key') ||
          message.includes('AES-CBC') ||
          message.includes('AES-CTR') ||
          message.includes('AES-GCM') ||
          message.includes('chosen-ciphertext') ||
          message.includes('authentication by default') ||
          message.includes('not recognized and ignored') ||
          message.includes('We recommended using authenticated encryption') ||
          message.includes('implementing it manually can result in minor') ||
          message.includes('serious mistakes') ||
          message.includes('protect against chosen-ciphertext attacks') ||
          message.includes('do not provide authentication by default') ||
          message.includes('can result in minor, but serious mistakes') ||
          message.includes('We recommended using') ||
          message.includes('authenticated encryption like AES-GCM')) {
          return;
        }
        originalLog.apply(console, args);
      };
    }

    async function prepare() {
      try {
        // Keep the splash screen visible while we fetch resources
        await SplashScreen.preventAutoHideAsync();

        // Pre-load any resources or data here if needed
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (e) {
        console.warn('Error during app preparation:', e);
      } finally {
        // Tell the application to render
        setAppIsReady(true);
        try {
          await SplashScreen.hideAsync();
        } catch (hideError) {
          console.warn('Error hiding splash screen:', hideError);
        }
      }
    }

    prepare();
  }, []);

  if (!appIsReady) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <ErrorBoundary>
      <AppProvider>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
          <StatusBar style="light" backgroundColor={colors.background} translucent={false} />
          <RootLayoutNav />
        </GestureHandlerRootView>
      </AppProvider>
    </ErrorBoundary>
  );
}
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState, Component, ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { AppProvider, useApp } from "@/providers/app-provider";
import { View, Platform, Text, TouchableOpacity, StyleSheet, AppState, Linking } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { DynamicIsland } from "@/components/dynamic-island";
import { RobotLogo } from "@/components/robot-logo";
import { TradingWebView } from "@/components/trading-webview";
import colors from "@/constants/colors";
import { isIOSPWA } from "@/utils/pwa-detection";

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
    setShowTradingWebView
  } = useApp();
  const [appState, setAppState] = useState<string>(AppState.currentState);
  
  // Note: Native iOS widgets are NOT possible from PWAs
  // PWAs run in Safari's WebView and cannot access WidgetKit/ActivityKit APIs
  // We use React-based DynamicIsland overlay instead (see below)

  // Debug TradingWebView state changes
  useEffect(() => {
    console.log('Root Layout - TradingWebView state changed:', {
      visible: showTradingWebView,
      hasSignal: !!tradingSignal,
      signalAsset: tradingSignal?.asset,
      signalAction: tradingSignal?.action
    });
  }, [showTradingWebView, tradingSignal]);

  // Handle app state changes for overlay persistence
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      console.log('Root Layout: App state changed from', appState, 'to', nextAppState);
      setAppState(nextAppState);
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [appState]);

  // Note: Native iOS widgets (Live Activities/Dynamic Island) are NOT possible from PWAs
  // PWAs run in Safari's WebView and cannot access WidgetKit/ActivityKit APIs
  // We use React-based DynamicIsland overlay instead (see below)
  
  // Handle deep links (for future use or if native app exists for development)
  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const handleDeepLink = async (url: string) => {
      try {
        console.log('[DeepLink] Received deep link:', url);
        
        // Parse URL manually (works on both web and native)
        // Format: myapp://widget?action=updateWidget&botName=...&isActive=true&...
        if (!url.includes('widget')) {
          console.log('[DeepLink] URL does not contain "widget", ignoring');
          return;
        }
        
        // Extract query parameters
        const urlParts = url.split('?');
        if (urlParts.length < 2) {
          console.log('[DeepLink] URL has no query parameters');
          return;
        }
        
        const queryString = urlParts[1];
        const params = new Map<string, string>();
        queryString.split('&').forEach(param => {
          const [key, value] = param.split('=');
          if (key && value) {
            params.set(key, decodeURIComponent(value));
          }
        });
        
        const action = params.get('action');
        console.log('[DeepLink] Parsed action:', action);
        
        if (action === 'updateWidget') {
          let botName = params.get('botName') || '';
          let isActive = params.get('isActive') === 'true';
          let isPaused = params.get('isPaused') === 'true';
          let botImageURL = params.get('botImageURL') || null;

          console.log('[DeepLink] Parsed widget params:', { botName, isActive, isPaused, botImageURL });

          // If botName is missing, try to get it from app state
          if (!botName && eas.length > 0) {
            const primaryEA = eas[0];
            botName = primaryEA?.name || 'EA Trade';
            
            // Get bot image URL from EA data
            if (!botImageURL && primaryEA?.userData?.owner?.logo) {
              const raw = primaryEA.userData.owner.logo.toString().trim();
              if (raw) {
                if (/^https?:\/\//i.test(raw)) {
                  botImageURL = raw;
                } else {
                  const filename = raw.replace(/^\/+/, '');
                  botImageURL = `https://ea-converter.com/admin/uploads/${filename}`;
                }
              }
            }
            
            // Use current bot active state if not provided
            if (params.get('isActive') === null) {
              isActive = isBotActive;
            }
          }

          console.log('[DeepLink] Final widget update params:', { botName, isActive, isPaused, botImageURL });

          // Update widget via native module
          const { widgetService } = await import('@/services/widget-service');
          await widgetService.updateWidget(botName, isActive, isPaused, botImageURL);
          console.log('[DeepLink] ✅ Widget updated successfully from deep link');
        } else {
          console.log('[DeepLink] Unknown action:', action);
        }
      } catch (error) {
        console.error('[DeepLink] ❌ Error handling deep link for widget update:', error);
      }
    };

    // Handle initial URL (if app was opened via deep link)
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('[DeepLink] App opened with initial URL:', url);
        handleDeepLink(url);
      } else {
        console.log('[DeepLink] No initial URL - app opened normally');
      }
    }).catch(err => {
      console.error('[DeepLink] ❌ Error getting initial URL:', err);
    });

    // Listen for deep links while app is running
    const subscription = Linking.addEventListener('url', (event) => {
      console.log('[DeepLink] Deep link received while app running:', event.url);
      handleDeepLink(event.url);
    });

    return () => subscription.remove();
  }, [eas, isBotActive]);

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
      {/* DynamicIsland: React-based overlay works on all platforms including iOS PWA
          Note: Native iOS widgets (Live Activities) are NOT possible from PWAs
          PWAs cannot access WidgetKit/ActivityKit APIs, so we use React overlay */}
      <DynamicIsland
        visible={!isFirstTime && eas.length > 0 && isBotActive}
        newSignal={newSignal}
        onSignalDismiss={dismissNewSignal}
      />

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
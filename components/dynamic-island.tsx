import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  Dimensions,
  StatusBar,
  AppState,
  PanResponder,
  Image,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Play, Square, TrendingUp, Trash2, Activity } from 'lucide-react-native';

import { RobotLogo } from './robot-logo';
import { useApp } from '@/providers/app-provider';
import { router } from 'expo-router';
import { SignalLog } from '@/services/signals-monitor';
import type { EA } from '@/providers/app-provider';
import colors from '@/constants/colors';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface DynamicIslandProps {
  visible: boolean;
  newSignal?: SignalLog | null;
  onSignalDismiss?: () => void;
}

export function DynamicIsland({ visible, newSignal, onSignalDismiss }: DynamicIslandProps) {
  const { eas, isBotActive, setBotActive, removeEA, signalLogs, isSignalsMonitoring, activeSymbols, mt4Symbols, mt5Symbols, setTradingSignal, setShowTradingWebView } = useApp();
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [appState, setAppState] = useState<string>(AppState.currentState);
  const [isOverlayMode, setIsOverlayMode] = useState<boolean>(false);

  const animatedHeight = useRef(new Animated.Value(50)).current;
  const animatedWidth = useRef(new Animated.Value(160)).current;
  const animatedOpacity = useRef(new Animated.Value(0)).current;
  const panX = useRef(new Animated.Value(20)).current;
  const panY = useRef(new Animated.Value(100)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;


  const primaryEA = Array.isArray(eas) && eas.length > 0 ? eas[0] : null;

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

  const primaryEAImage = useMemo(() => getEAImageUrl(primaryEA), [getEAImageUrl, primaryEA]);
  const [logoError, setLogoError] = useState<boolean>(false);

  // Simple circular collapsed state
  const collapsedSize = 50;

  // Create pan responder for dragging the widget
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        panX.setOffset((panX as any)._value);
        panY.setOffset((panY as any)._value);
      },
      onPanResponderMove: Animated.event(
        [null, { dx: panX, dy: panY }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (evt, gestureState) => {
        panX.flattenOffset();
        panY.flattenOffset();

        // Snap to edges
        const finalX = (panX as any)._value;
        const finalY = (panY as any)._value;
        const widgetWidth = isExpanded ? screenWidth - 40 : collapsedSize;

        let snapX = finalX;
        if (finalX < screenWidth / 2) {
          snapX = 20; // Snap to left
        } else {
          snapX = screenWidth - widgetWidth - 20; // Snap to right
        }

        // Keep within screen bounds
        const minY = (StatusBar.currentHeight || 0) + 20;
        const maxY = screenHeight - (isExpanded ? 220 : 50) - 100;
        const snapY = Math.max(minY, Math.min(maxY, finalY));

        Animated.parallel([
          Animated.spring(panX, {
            toValue: snapX,
            useNativeDriver: false,
            tension: 100,
            friction: 8,
          }),
          Animated.spring(panY, {
            toValue: snapY,
            useNativeDriver: false,
            tension: 100,
            friction: 8,
          }),
        ]).start();
      },
    })
  ).current;

  useEffect(() => {
    // Initialize position for Android draw-over widget
    if (Platform.OS === 'android') {
      const statusBarHeight = StatusBar.currentHeight || 0;
      const initialY = statusBarHeight + 50;
      panX.setValue(20);
      panY.setValue(initialY);
    }
    // Update width for circular collapsed state
    animatedWidth.setValue(collapsedSize);
  }, [panX, panY, collapsedSize, animatedWidth]);

  // Handle app state changes for overlay mode
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      console.log('App state changed from', appState, 'to', nextAppState);
      setAppState(nextAppState);

      if (Platform.OS === 'android' && isBotActive && visible) {
        if (nextAppState === 'background' || nextAppState === 'inactive') {
          // App is going to background - activate overlay mode
          console.log('Activating overlay mode');
          setIsOverlayMode(true);
          // Make widget semi-transparent when in overlay mode
          Animated.timing(overlayOpacity, {
            toValue: 0.9,
            duration: 300,
            useNativeDriver: false,
          }).start();
        } else if (nextAppState === 'active') {
          // App is coming to foreground - deactivate overlay mode
          console.log('Deactivating overlay mode');
          setIsOverlayMode(false);
          Animated.timing(overlayOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: false,
          }).start();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [appState, isBotActive, visible, overlayOpacity]);

  const handleExpand = React.useCallback(() => {
    Animated.parallel([
      Animated.timing(animatedHeight, {
        toValue: 220,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(animatedWidth, {
        toValue: screenWidth - 40,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(animatedOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start();
    setIsExpanded(true);
  }, [animatedHeight, animatedWidth, animatedOpacity]);

  // Check if a signal is for an active symbol
  const isSignalForActiveSymbol = useCallback((signal: SignalLog) => {
    const symbolName = signal.asset;

    // Check if symbol is active in any of the symbol lists
    const isActiveInLegacy = activeSymbols.some(s => s.symbol === symbolName);
    const isActiveInMT4 = mt4Symbols.some(s => s.symbol === symbolName);
    const isActiveInMT5 = mt5Symbols.some(s => s.symbol === symbolName);

    return isActiveInLegacy || isActiveInMT4 || isActiveInMT5;
  }, [activeSymbols, mt4Symbols, mt5Symbols]);

  // Handle new signal detection - automatically trigger trading WebView for active symbols
  useEffect(() => {
    if (newSignal) {
      console.log('🔔 New signal detected in Dynamic Island:', newSignal);
      console.log('🔔 Signal details:', {
        id: newSignal.id,
        asset: newSignal.asset,
        action: newSignal.action,
        type: newSignal.type,
        source: newSignal.source
      });

      // Check if this signal is for an active symbol
      const isActiveSymbol = isSignalForActiveSymbol(newSignal);
      console.log('🔔 Is signal for active symbol?', isActiveSymbol);
      console.log('🔔 Active symbols check:', {
        activeSymbols: activeSymbols.map(s => s.symbol),
        mt4Symbols: mt4Symbols.map(s => s.symbol),
        mt5Symbols: mt5Symbols.map(s => s.symbol)
      });

      if (!isActiveSymbol) {
        console.log('❌ Signal ignored - not for active symbol:', newSignal.asset);
        // Dismiss signal immediately if not for active symbol
        if (onSignalDismiss) {
          onSignalDismiss();
        }
      } else {
        console.log('✅ Signal accepted - for active symbol:', newSignal.asset);
        console.log('🚀 Automatically triggering trading WebView for signal:', newSignal.asset);

        // Set the trading signal and show the trading WebView
        console.log('🚀 Setting trading signal:', newSignal);
        setTradingSignal(newSignal);
        console.log('🚀 Showing trading WebView');
        setShowTradingWebView(true);

        // Dismiss the signal after a short delay to allow WebView to open
        setTimeout(() => {
          console.log('🚀 Dismissing signal after WebView opened');
          if (onSignalDismiss) {
            onSignalDismiss();
          }
        }, 500);
      }
    }
  }, [newSignal, onSignalDismiss, isSignalForActiveSymbol, setTradingSignal, setShowTradingWebView, activeSymbols, mt4Symbols, mt5Symbols]);

  // Only show when bot is active
  if (!visible || !isBotActive || !primaryEA) {
    return null;
  }

  // In overlay mode, show a persistent floating widget
  if (isOverlayMode) {
    return (
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.overlayModeContainer,
          {
            left: panX,
            top: panY,
            opacity: overlayOpacity,
          },
        ]}
        pointerEvents="auto"
      >
        <TouchableOpacity
          onPress={() => {
            // Bring app to foreground when tapped
            console.log('Overlay widget tapped - bringing app to foreground');
            // Force app to active state
            setIsOverlayMode(false);
          }}
          activeOpacity={0.8}
          style={styles.overlayModeWidget}
        >
          {Platform.OS === 'ios' && (
            <BlurView intensity={130} tint="dark" style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.06)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.overlayModeContent}>
            <View style={styles.overlayIcon}>
              {Platform.OS === 'ios' && (
                <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
              )}
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.15)', 'rgba(255, 255, 255, 0.08)']}
                style={StyleSheet.absoluteFill}
              />
              {primaryEAImage && !logoError ? (
                <Image
                  source={{ uri: primaryEAImage }}
                  style={styles.overlayLogo}
                  onError={() => setLogoError(true)}
                  resizeMode="cover"
                />
              ) : (
                <RobotLogo size={14} />
              )}
            </View>
            <View style={styles.overlayIndicator} />
            <Text style={styles.overlayText} numberOfLines={1}>
              {primaryEA?.name || 'EA'}
            </Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }



  const handleCollapse = () => {
    Animated.parallel([
      Animated.timing(animatedHeight, {
        toValue: 50,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(animatedWidth, {
        toValue: collapsedSize,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(animatedOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start();
    setIsExpanded(false);
  };

  const handlePress = () => {
    if (isExpanded) {
      handleCollapse();
    } else {
      handleExpand();
    }
  };



  const formatTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const handleQuotes = () => {
    router.push('/(tabs)/quotes');
    handleCollapse();
  };

  const handleRemoveBot = async () => {
    if (primaryEA && primaryEA.id) {
      try {
        console.log('Dynamic Island: Removing EA:', primaryEA.name);
        const success = await removeEA(primaryEA.id);
        if (success) {
          setBotActive(false);
          console.log('Dynamic Island: EA removed successfully');
        }
      } catch (error) {
        console.error('Dynamic Island: Error removing EA:', error);
      }
    }
    handleCollapse();
  };

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.drawOverlayContainer,
        {
          left: panX,
          top: panY,
        },
      ]}
    >
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.8}
        style={styles.touchableContainer}
      >
        <Animated.View
          style={[
            styles.overlayWidget,
            {
              height: animatedHeight,
              width: animatedWidth,
              borderRadius: isExpanded ? 24 : 28,
            },
          ]}
        >
          {Platform.OS === 'ios' && (
            <BlurView intensity={130} tint="dark" style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient
            colors={isExpanded 
              ? ['rgba(255, 255, 255, 0.15)', 'rgba(255, 255, 255, 0.08)']
              : ['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.06)']}
            style={StyleSheet.absoluteFill}
          />
          
          {/* Collapsed State - Modern Glass Pill */}
          {!isExpanded && (
            <View style={styles.collapsedPill}>
              <View style={styles.collapsedIconContainer}>
              {primaryEAImage && !logoError ? (
                <Image
                  source={{ uri: primaryEAImage }}
                  style={styles.collapsedLogo}
                  onError={() => setLogoError(true)}
                  resizeMode="cover"
                />
              ) : (
                  <RobotLogo size={20} />
              )}
              </View>
              <View style={styles.collapsedStatusDot} />
            </View>
          )}

          {/* Expanded State - Modern Glass Card */}
          <Animated.View
            style={[
              styles.expandedContent,
              {
                opacity: animatedOpacity,
              },
            ]}
            pointerEvents={isExpanded ? 'auto' : 'none'}
          >
            <View style={styles.expandedHeader}>
              <View style={styles.expandedInfo}>
                <Text style={styles.expandedTitle} numberOfLines={1} ellipsizeMode="tail">
                  {primaryEA?.name}
                </Text>
                <View style={styles.expandedStatusRow}>
                  <View style={styles.expandedStatusDot} />
                  <Text style={styles.expandedSubtitle}>
                    ACTIVE
                  </Text>
                </View>
              </View>
              <View style={styles.expandedIconContainer}>
                {Platform.OS === 'ios' && (
                  <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
                )}
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.1)']}
                  style={StyleSheet.absoluteFill}
                />
                {primaryEAImage && !logoError ? (
                  <Image
                    source={{ uri: primaryEAImage }}
                    style={styles.expandedLogo}
                    onError={() => setLogoError(true)}
                    resizeMode="cover"
                  />
                ) : (
                  <RobotLogo size={28} />
                )}
              </View>
            </View>

            <View style={styles.expandedControls}>
              <TouchableOpacity
                style={[styles.controlButton, styles.controlButtonPrimary]}
                onPress={() => {
                  console.log('Android Widget: Start/Stop button pressed, current state:', isBotActive);
                  try {
                    setBotActive(!isBotActive);
                    console.log('Android Widget: Bot active state changed to:', !isBotActive);
                  } catch (error) {
                    console.error('Android Widget: Error changing bot state:', error);
                  }
                }}
                activeOpacity={0.8}
              >
                {Platform.OS === 'ios' && (
                  <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
                )}
                <LinearGradient
                  colors={isBotActive 
                    ? ['rgba(220, 38, 38, 0.25)', 'rgba(220, 38, 38, 0.15)']
                    : ['rgba(37, 211, 102, 0.25)', 'rgba(37, 211, 102, 0.15)']}
                  style={StyleSheet.absoluteFill}
                />
                {isBotActive ? (
                  <Square color="#DC2626" size={18} fill="#DC2626" />
                ) : (
                  <Play color="#25D366" size={18} fill="#25D366" />
                )}
                <Text style={[styles.controlButtonText, { color: isBotActive ? "#DC2626" : "#25D366" }]}>
                  {isBotActive ? 'STOP' : 'START'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.controlButton} 
                onPress={handleQuotes}
                activeOpacity={0.8}
              >
                {Platform.OS === 'ios' && (
                  <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
                )}
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.06)']}
                  style={StyleSheet.absoluteFill}
                />
                <TrendingUp color="#FFFFFF" size={16} />
                <Text style={styles.controlButtonText}>QUOTES</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.controlButton} 
                onPress={handleRemoveBot}
                activeOpacity={0.8}
              >
                {Platform.OS === 'ios' && (
                  <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
                )}
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.06)']}
                  style={StyleSheet.absoluteFill}
                />
                <Trash2 color="#FFFFFF" size={16} />
                <Text style={styles.controlButtonText}>REMOVE</Text>
              </TouchableOpacity>
            </View>

            {/* Signals Status - Only show latest signal details when signals are active */}
            {isSignalsMonitoring && signalLogs.filter(signal => isSignalForActiveSymbol(signal)).length > 0 && (
              <View style={styles.signalsStatus}>
                {Platform.OS === 'ios' && (
                  <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
                )}
                <LinearGradient
                  colors={['rgba(37, 211, 102, 0.2)', 'rgba(37, 211, 102, 0.1)']}
                  style={StyleSheet.absoluteFill}
                />
                  <View style={styles.latestSignalContainer}>
                    {signalLogs
                      .filter(signal => isSignalForActiveSymbol(signal))
                      .slice(-1)
                      .map((signal, index) => {
                        // Use signal ID and timestamp for unique key to force re-render
                        const uniqueKey = `${signal.id}-${signal.latestupdate}-${index}`;
                        return (
                          <View key={uniqueKey} style={styles.latestSignalDetails}>
                            {Platform.OS === 'ios' && (
                              <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
                            )}
                            <LinearGradient
                              colors={['rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.05)']}
                              style={StyleSheet.absoluteFill}
                            />
                            <View style={styles.latestSignalHeader}>
                              <Text style={styles.latestSignalAsset}>{signal.asset}</Text>
                              <View style={[
                                styles.latestSignalBadge,
                                signal.action === 'BUY' ? styles.latestBuyBadge : styles.latestSellBadge
                              ]}>
                                <Text style={styles.latestSignalAction}>{signal.action}</Text>
                              </View>
                            </View>
                            <View style={styles.latestSignalPrices}>
                              <View style={styles.latestPriceItem}>
                                <Text style={styles.latestPriceLabel}>Entry:</Text>
                                <Text style={styles.latestPriceValue}>{signal.price}</Text>
                              </View>
                              <View style={styles.latestPriceItem}>
                                <Text style={styles.latestPriceLabel}>TP:</Text>
                                <Text style={[styles.latestPriceValue, styles.latestTpValue]}>{signal.tp}</Text>
                              </View>
                              <View style={styles.latestPriceItem}>
                                <Text style={styles.latestPriceLabel}>SL:</Text>
                                <Text style={[styles.latestPriceValue, styles.latestSlValue]}>{signal.sl}</Text>
                              </View>
                            </View>
                            <View style={styles.latestSignalFooter}>
                              <Text style={styles.latestSignalTime}>
                                {formatTime(signal.time)}
                              </Text>
                              <Text style={styles.latestSignalId}>ID: {signal.id}</Text>
                            </View>
                          </View>
                        );
                      })
                    }
                  </View>
                )}
              </View>
            )}


          </Animated.View>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  drawOverlayContainer: {
    position: 'absolute',
    zIndex: 9999,
  },
  overlayModeContainer: {
    position: 'absolute',
    zIndex: 99999,
    elevation: 999,
  },
  overlayModeWidget: {
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.backgroundMedium,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 0.3,
    borderColor: colors.glass.border,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 20,
    overflow: 'hidden',
  },
  overlayModeContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  overlayIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.backgroundMedium,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    overflow: 'hidden',
    borderWidth: 0.3,
    borderColor: colors.glass.border,
  },
  overlayLogo: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  overlayIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#25D366',
    marginRight: 6,
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  overlayText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    maxWidth: 80,
    textAlign: 'center',
  },
  touchableContainer: {
    flex: 1,
  },
  overlayWidget: {
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.backgroundMedium,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 20,
    borderWidth: 0.3,
    borderColor: colors.glass.border,
    overflow: 'hidden',
  },
  collapsedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: '100%',
    height: '100%',
  },
  collapsedIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.backgroundStrong,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 0.3,
    borderColor: colors.glass.borderMedium,
    marginRight: 8,
  },
  collapsedLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  collapsedStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#25D366',
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  expandedContent: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 20,
    paddingVertical: 20,
    position: 'relative',
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 0.3,
    borderBottomColor: colors.glass.border,
  },
  expandedIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.backgroundStrong,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.3,
    borderColor: colors.glass.borderMedium,
    overflow: 'hidden',
    alignSelf: 'flex-end',
  },
  expandedLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  expandedInfo: {
    flex: 1,
    marginRight: 12,
  },
  expandedTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  expandedStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expandedStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#25D366',
    marginRight: 6,
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  expandedSubtitle: {
    color: '#25D366',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  expandedControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
    gap: 10,
  },
  controlButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.backgroundMedium,
    borderWidth: 0.3,
    borderColor: colors.glass.border,
    overflow: 'hidden',
  },
  controlButtonPrimary: {
    flex: 1.2,
  },
  controlButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
    letterSpacing: 0.5,
  },
  bottomControls: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    paddingHorizontal: 8,
  },
  expandedInfoButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  signalAppIcon: {
    backgroundColor: '#F59E0B',
  },
  signalIndicator: {
    backgroundColor: '#F59E0B',
  },
  signalIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signalDetails: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  signalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  signalAsset: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  signalAssetText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginRight: 8,
  },
  signalActionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  buyBadge: {
    backgroundColor: '#16A34A',
  },
  sellBadge: {
    backgroundColor: '#DC2626',
  },
  signalActionText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 3,
  },
  dismissButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  signalPrices: {
    marginBottom: 12,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  priceLabel: {
    fontSize: 12,
    color: '#CCCCCC',
    fontWeight: '500',
  },
  priceValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  tpValue: {
    color: '#16A34A',
  },
  slValue: {
    color: '#DC2626',
  },
  signalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  signalTime: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  signalTimeText: {
    fontSize: 10,
    color: '#CCCCCC',
    marginLeft: 4,
  },
  signalId: {
    fontSize: 9,
    color: '#999999',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  signalsStatus: {
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.backgroundMedium,
    borderRadius: 16,
    padding: 14,
    marginTop: 16,
    borderWidth: 0.3,
    borderColor: colors.glass.borderMedium,
    overflow: 'hidden',
  },
  signalsStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  signalsStatusIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : 'rgba(37, 211, 102, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 0.3,
    borderColor: 'rgba(37, 211, 102, 0.3)',
  },
  signalsStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  signalsCount: {
    fontSize: 11,
    color: '#CCCCCC',
    marginTop: 2,
    fontWeight: '500',
  },
  latestSignalContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 0.3,
    borderTopColor: colors.glass.border,
  },
  latestSignalDetails: {
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.backgroundMedium,
    borderRadius: 14,
    padding: 12,
    borderWidth: 0.3,
    borderColor: colors.glass.borderMedium,
    overflow: 'hidden',
  },
  latestSignalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  latestSignalAsset: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  latestSignalBadge: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  latestBuyBadge: {
    backgroundColor: '#16A34A',
  },
  latestSellBadge: {
    backgroundColor: '#DC2626',
  },
  latestSignalAction: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '600',
  },
  latestSignalPrices: {
    marginBottom: 6,
  },
  latestPriceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  latestPriceLabel: {
    fontSize: 9,
    color: '#CCCCCC',
    fontWeight: '500',
  },
  latestPriceValue: {
    fontSize: 9,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  latestTpValue: {
    color: '#16A34A',
  },
  latestSlValue: {
    color: '#DC2626',
  },
  latestSignalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  latestSignalTime: {
    fontSize: 8,
    color: '#CCCCCC',
  },
  latestSignalId: {
    fontSize: 7,
    color: '#999999',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});
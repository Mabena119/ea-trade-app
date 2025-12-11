import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Animated, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Circle, RefreshCw } from 'lucide-react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '@/providers/app-provider';
import { Symbol as ApiSymbol, apiService } from '@/services/api';
import colors from '@/constants/colors';

interface Quote {
  symbol: string;
  lotSize: number;
  platform: string;
  direction: 'BUY' | 'SELL' | 'BOTH';
  isActive?: boolean;
}



export default function QuotesScreen() {
  const { eas, activeSymbols, mt4Symbols, mt5Symbols } = useApp();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [apiSymbols, setApiSymbols] = useState<ApiSymbol[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const [error, setError] = useState<string | null>(null);

  const primaryEA = eas.length > 0 ? eas[0] : null;
  const hasActiveQuotes = activeSymbols.length > 0 || mt4Symbols.length > 0 || mt5Symbols.length > 0;
  const hasConnectedEA = primaryEA && primaryEA.status === 'connected' && primaryEA.phoneSecretKey;

  // Merge quotes with active symbol status
  const quotesWithActiveStatus = quotes.map(quote => ({
    ...quote,
    isActive: activeSymbols.some(activeSymbol => activeSymbol.symbol === quote.symbol) ||
      mt4Symbols.some(mt4Symbol => mt4Symbol.symbol === quote.symbol) ||
      mt5Symbols.some(mt5Symbol => mt5Symbol.symbol === quote.symbol)
  }));

  // Fetch symbols from API - only show symbols from connected robot
  const fetchSymbols = useCallback(async (showRefreshIndicator = false) => {
    try {
      console.log('Fetching symbols for active bot:', {
        botId: primaryEA?.id,
        botName: primaryEA?.name,
        licenseKey: primaryEA?.licenseKey,
        hasConnectedEA,
        hasPhoneSecret: !!primaryEA?.phoneSecretKey
      });

      if (showRefreshIndicator) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      // Only fetch from API if we have a connected EA with phone secret
      let response: { data: ApiSymbol[] } = { data: [] };
      if (hasConnectedEA && primaryEA?.phoneSecretKey) {
        console.log('Fetching symbols from API for bot:', primaryEA.name);
        const apiRes = await apiService.getSymbols(primaryEA.phoneSecretKey);
        if (apiRes.message === 'accept' && Array.isArray(apiRes.data)) {
          response = { data: apiRes.data };
          console.log(`API returned ${apiRes.data.length} symbols for bot:`, primaryEA.name);
        } else {
          console.log('API returned no symbols or error for bot:', primaryEA.name);
        }
      } else {
        console.log('No connected EA or missing phone secret - quotes will be empty');
      }
      // If no connected EA or API returns empty, keep quotes empty

      setApiSymbols(response.data);
      // Convert API symbols to quotes with actual saved data or defaults
      const newQuotes: Quote[] = response.data.map(apiSymbol => {
        const symbolName = apiSymbol.name;

        // Consolidate configs across legacy, MT4 and MT5 and pick the most recently activated
        const legacyConfig = activeSymbols.find(s => s.symbol === symbolName);
        const mt4Config = mt4Symbols.find(s => s.symbol === symbolName);
        const mt5Config = mt5Symbols.find(s => s.symbol === symbolName);

        type Unified = { platform: 'MT4' | 'MT5'; lotSize: number; direction: 'BUY' | 'SELL' | 'BOTH'; activatedAt: Date };

        const candidates: Unified[] = [];

        if (legacyConfig) {
          const lot = Number.parseFloat(legacyConfig.lotSize ?? '0.01');
          const act = legacyConfig.activatedAt instanceof Date ? legacyConfig.activatedAt : new Date(legacyConfig.activatedAt as unknown as string);
          candidates.push({ platform: legacyConfig.platform, lotSize: Number.isFinite(lot) ? lot : 0.01, direction: legacyConfig.direction, activatedAt: act });
        }
        if (mt4Config) {
          const lot = Number.parseFloat(mt4Config.lotSize ?? '0.01');
          const act = mt4Config.activatedAt instanceof Date ? mt4Config.activatedAt : new Date(mt4Config.activatedAt as unknown as string);
          candidates.push({ platform: 'MT4', lotSize: Number.isFinite(lot) ? lot : 0.01, direction: mt4Config.direction, activatedAt: act });
        }
        if (mt5Config) {
          const lot = Number.parseFloat(mt5Config.lotSize ?? '0.01');
          const act = mt5Config.activatedAt instanceof Date ? mt5Config.activatedAt : new Date(mt5Config.activatedAt as unknown as string);
          candidates.push({ platform: 'MT5', lotSize: Number.isFinite(lot) ? lot : 0.01, direction: mt5Config.direction, activatedAt: act });
        }

        if (candidates.length > 0) {
          const latest = candidates.sort((a, b) => (b.activatedAt?.getTime?.() ?? 0) - (a.activatedAt?.getTime?.() ?? 0))[0];
          console.log('Using latest config for symbol', symbolName, latest);
          return {
            symbol: symbolName,
            lotSize: latest.lotSize,
            platform: latest.platform,
            direction: latest.direction,
          };
        }

        // Return default values if no saved configuration
        return {
          symbol: symbolName,
          lotSize: 0.01,
          platform: 'MT5' as const,
          direction: 'BUY' as const
        };
      });

      setQuotes(newQuotes);
      console.log(`Quotes updated for bot "${primaryEA?.name}":`, {
        quotesCount: newQuotes.length,
        symbols: newQuotes.map(q => q.symbol)
      });
    } catch (error) {
      console.error('Error fetching symbols:', error);
      setError('Failed to load symbols (offline)');

      // Keep quotes empty if API fails - don't fallback to mock data
      console.log(`API failed for bot "${primaryEA?.name}", keeping quotes empty`);
      setQuotes([]);
    } finally {
      // Add a small delay to make the refresh feel more natural
      setTimeout(() => {
        setLoading(false);
        setRefreshing(false);
      }, showRefreshIndicator ? 300 : 0);
    }
  }, [hasConnectedEA, primaryEA, activeSymbols, mt4Symbols, mt5Symbols]);

  // Initial load and refresh when symbols change or active bot switches
  useEffect(() => {
    console.log('Bot or symbols changed, refreshing quotes...', {
      botId: primaryEA?.id,
      botName: primaryEA?.name,
      hasConnectedEA,
      activeSymbols: activeSymbols.length,
      mt4Symbols: mt4Symbols.length,
      mt5Symbols: mt5Symbols.length
    });

    // Always fetch to ensure quotes reflect current active bot's symbols
    fetchSymbols(quotes.length > 0);
  }, [
    hasConnectedEA, 
    primaryEA?.id, 
    primaryEA?.phoneSecretKey, 
    activeSymbols.length, 
    mt4Symbols.length, 
    mt5Symbols.length
  ]);

  // Smooth rotation animation for refresh button
  useEffect(() => {
    if (refreshing) {
      const rotateAnimation = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        })
      );
      rotateAnimation.start();
      return () => {
        rotateAnimation.stop();
        // Smoothly reset to 0 when stopping
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      };
    }
  }, [refreshing, rotateAnim]);

  // Refresh when screen comes into focus (e.g., returning from trade-config)
  useFocusEffect(
    useCallback(() => {
      console.log('Quotes screen focused, refreshing to sync active bot symbols...');
      // Always refresh with indicator since we're coming back to focus
      setTimeout(() => fetchSymbols(true), 100);
    }, [fetchSymbols])
  );

  // Refresh function
  const handleRefresh = () => {
    console.log('Manual refresh triggered');
    fetchSymbols(true);
  };



  const handleBack = () => {
    router.back();
  };

  const handleRetry = () => {
    fetchSymbols();
  };

  const formatLotSize = (lotSize: number) => {
    return lotSize.toFixed(2);
  };





  const handleQuoteTap = (symbol: string) => {
    router.push(`/trade-config?symbol=${symbol}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
          {Platform.OS === 'ios' && (
            <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
          )}
          <ArrowLeft color="#FFFFFF" size={22} strokeWidth={2.5} />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <View style={styles.titleContainer}>
            <Text style={styles.headerTitle}>QUOTES</Text>
            {primaryEA && (
              <View style={styles.statusContainer}>
                <Circle
                  color={hasActiveQuotes ? '#8B5CF6' : '#666666'}
                  fill={hasActiveQuotes ? '#8B5CF6' : 'transparent'}
                  size={10}
                />
                <Text style={styles.botName} numberOfLines={1} ellipsizeMode="tail">{primaryEA.name}</Text>
              </View>
            )}
          </View>
        </View>

        {hasConnectedEA && (
          <TouchableOpacity
            style={[styles.refreshButton, refreshing && styles.refreshButtonDisabled]}
            onPress={handleRefresh}
            disabled={refreshing}
            activeOpacity={refreshing ? 1 : 0.7}
          >
            {Platform.OS === 'ios' && (
              <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
            )}
            <Animated.View
              style={{
                transform: [{
                  rotate: rotateAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '360deg'],
                  })
                }]
              }}
            >
              <RefreshCw
                color={refreshing ? '#666666' : '#FFFFFF'}
                size={20}
                strokeWidth={2.5}
              />
            </Animated.View>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        {loading && !refreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator testID="quotes-loading" size="large" color="#8B5CF6" />
            <Text style={styles.loadingText}>Loading symbols...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            {hasConnectedEA ? (
              <TouchableOpacity style={styles.retryButton} onPress={handleRetry} activeOpacity={0.7}>
                {Platform.OS === 'ios' && (
                  <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
                )}
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.retryButton} onPress={() => router.push('/license')} activeOpacity={0.7}>
                {Platform.OS === 'ios' && (
                  <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
                )}
                <Text style={styles.retryButtonText}>Connect EA</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {quotesWithActiveStatus.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No symbols configured</Text>
                <Text style={styles.emptySubtext}>Configure symbols in your connected robot to see them here</Text>
              </View>
            ) : (
              quotesWithActiveStatus.map((quote, index) => (
                <TouchableOpacity
                  testID={`quote-item-${quote.symbol}`}
                  key={quote.symbol}
                  style={[
                    styles.quoteCard,
                    quote.isActive && styles.activeQuoteCard
                  ]}
                  onPress={() => handleQuoteTap(quote.symbol)}
                  activeOpacity={0.7}
                >
                  {/* Gradient background */}
                  <LinearGradient
                    colors={['#8B5CF6', '#EC4899', '#F97316']}
                    style={styles.quoteGradientBackground}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  />

                  {/* Glass overlay */}
                  {Platform.OS === 'ios' && (
                    <BlurView intensity={40} tint="light" style={styles.quoteGlassOverlay} />
                  )}

                  {/* Glossy shine */}
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 0.15)', 'rgba(255, 255, 255, 0)']}
                    style={styles.quoteGlossShine}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                  />

                  <View style={styles.quoteHeader}>
                    <View style={styles.symbolContainer}>
                      <Text style={styles.symbol}>{quote.symbol}</Text>
                      {quote.isActive && (
                        <Circle
                          color="#8B5CF6"
                          fill="#8B5CF6"
                          size={10}
                          style={styles.activeIndicator}
                        />
                      )}
                    </View>

                  </View>

                  <View style={styles.priceContainer}>
                    <View style={styles.priceColumn}>
                      <Text style={styles.priceLabel}>LOT SIZE</Text>
                      <Text style={styles.priceValue}>{formatLotSize(quote.lotSize)}</Text>
                    </View>

                    <View style={styles.priceColumn}>
                      <Text style={styles.priceLabel}>PLATFORM</Text>
                      <Text style={styles.platformValue}>{quote.platform}</Text>
                    </View>

                    <View style={styles.priceColumn}>
                      <Text style={styles.priceLabel}>DIRECTION</Text>
                      <Text style={[
                        styles.directionValue,
                        { color: quote.direction === 'BUY' ? '#00FF88' : quote.direction === 'SELL' ? '#FF4444' : '#FFAA00' }
                      ]}>{quote.direction}</Text>
                    </View>
                  </View>

                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.3,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.background,
  },
  backButton: {
    marginRight: 16,
    padding: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    overflow: 'hidden',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  headerContent: {
    flex: 1,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginRight: 12,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  botName: {
    color: '#CCCCCC',
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  refreshButton: {
    padding: 10,
    marginLeft: 8,
    borderRadius: 24,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    overflow: 'hidden',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  refreshButtonDisabled: {
    opacity: 0.5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
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
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  errorText: {
    color: '#FF4444',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 24,
  },
  retryButton: {
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    overflow: 'hidden',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#CCCCCC',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
  },
  quoteCard: {
    backgroundColor: 'transparent',
    borderRadius: 32,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1.5,
    borderTopWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderTopColor: 'rgba(255, 255, 255, 0.4)',
    overflow: 'hidden',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 15,
    position: 'relative',
  },
  quoteGradientBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 32,
    zIndex: 0,
    opacity: 0.9,
  },
  quoteGlassOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 32,
    zIndex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  quoteGlossShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    zIndex: 2,
  },
  quoteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    zIndex: 3,
  },
  symbolContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  symbol: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  activeIndicator: {
    marginLeft: 8,
  },
  activeQuoteCard: {
    borderColor: 'rgba(139, 92, 246, 0.6)',
    borderWidth: 2,
    borderTopWidth: 2.5,
    shadowOpacity: 0.7,
    shadowRadius: 30,
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
  },

  priceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    zIndex: 3,
  },
  priceColumn: {
    alignItems: 'center',
    flex: 1,
  },
  priceLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  priceValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'monospace',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  platformValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    fontFamily: 'monospace',
  },
  directionValue: {
    fontSize: 18,
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    fontFamily: 'monospace',
  },

});
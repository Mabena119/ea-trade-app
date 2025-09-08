import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Animated } from 'react-native';
import { ArrowLeft, Circle, RefreshCw } from 'lucide-react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '@/providers/app-provider';
import { Symbol as ApiSymbol } from '@/services/api';

interface Quote {
  symbol: string;
  lotSize: number;
  platform: string;
  direction: 'BUY' | 'SELL' | 'BOTH';
  isActive?: boolean;
}



const mockQuotes: Quote[] = [
  { symbol: 'EURUSD', lotSize: 0.1, platform: 'MT5', direction: 'BUY' },
  { symbol: 'GBPUSD', lotSize: 0.2, platform: 'MT4', direction: 'SELL' },
  { symbol: 'USDJPY', lotSize: 0.15, platform: 'MT5', direction: 'BUY' },
  { symbol: 'AUDUSD', lotSize: 0.1, platform: 'MT5', direction: 'BUY' },
  { symbol: 'USDCAD', lotSize: 0.25, platform: 'MT4', direction: 'SELL' },
  { symbol: 'NZDUSD', lotSize: 0.1, platform: 'MT5', direction: 'BUY' },
  { symbol: 'USDCHF', lotSize: 0.2, platform: 'MT4', direction: 'SELL' },
  { symbol: 'EURGBP', lotSize: 0.1, platform: 'MT5', direction: 'BUY' },
  { symbol: 'EURJPY', lotSize: 0.15, platform: 'MT5', direction: 'BUY' },
  { symbol: 'GBPJPY', lotSize: 0.2, platform: 'MT4', direction: 'SELL' },
];

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

  // Fetch symbols (offline: from local mock)
  const fetchSymbols = useCallback(async (showRefreshIndicator = false) => {
    try {
      if (showRefreshIndicator) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      // Offline mode: use mock symbols
      const response = {
        data: [
          { id: '1', name: 'EURUSD' },
          { id: '2', name: 'GBPUSD' },
          { id: '3', name: 'XAUUSD' },
          { id: '4', name: 'USDJPY' },
        ] as ApiSymbol[]
      };

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
    } catch (error) {
      console.error('Error fetching symbols:', error);
      setError('Failed to load symbols (offline)');

      // Fallback to mock data if API fails
      if (quotes.length === 0) {
        console.log('Using fallback mock data');
        setQuotes(mockQuotes);
      }
    } finally {
      // Add a small delay to make the refresh feel more natural
      setTimeout(() => {
        setLoading(false);
        setRefreshing(false);
      }, showRefreshIndicator ? 300 : 0);
    }
  }, [activeSymbols, mt4Symbols, mt5Symbols, quotes.length]);

  // Initial load and refresh when symbols change
  useEffect(() => {
    console.log('Symbols changed, refreshing quotes...', {
      activeSymbols: activeSymbols.length,
      mt4Symbols: mt4Symbols.length,
      mt5Symbols: mt5Symbols.length
    });

    // Only do a full refresh if we don't have quotes yet, otherwise do a gentle refresh
    if (quotes.length === 0) {
      fetchSymbols(false);
    } else {
      // Gentle refresh to update the active status without disrupting the UI
      fetchSymbols(true);
    }
  }, [hasConnectedEA, primaryEA?.phoneSecretKey, activeSymbols.length, mt4Symbols.length, mt5Symbols.length, quotes.length]);

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
      console.log('Quotes screen focused, refreshing (offline)...');
      if (quotes.length > 0) {
        setTimeout(() => fetchSymbols(true), 100);
      } else {
        fetchSymbols(false);
      }
    }, [fetchSymbols, quotes.length])
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
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <ArrowLeft color="#FFFFFF" size={24} />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <View style={styles.titleContainer}>
            <Text style={styles.headerTitle}>QUOTES</Text>
            {primaryEA && (
              <View style={styles.statusContainer}>
                <Circle
                  color={hasActiveQuotes ? '#00FF00' : '#666666'}
                  fill={hasActiveQuotes ? '#00FF00' : 'transparent'}
                  size={8}
                />
                <Text style={[styles.statusText, { color: hasActiveQuotes ? '#00FF00' : '#666666' }]}>
                  {hasActiveQuotes ? 'ACTIVE' : 'INACTIVE'}
                </Text>
              </View>
            )}
          </View>
          {primaryEA && (
            <Text style={styles.botName}>{primaryEA.name}</Text>
          )}
          {apiSymbols.length > 0 && (
            <Text style={styles.symbolCount}>{apiSymbols.length} symbols available</Text>
          )}
        </View>

        {hasConnectedEA && (
          <TouchableOpacity
            style={[styles.refreshButton, refreshing && styles.refreshButtonDisabled]}
            onPress={handleRefresh}
            disabled={refreshing}
            activeOpacity={refreshing ? 1 : 0.7}
          >
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
              />
            </Animated.View>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        {loading && !refreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator testID="quotes-loading" size="large" color="#00FF00" />
            <Text style={styles.loadingText}>Loading symbols...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            {hasConnectedEA ? (
              <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.retryButton} onPress={() => router.push('/license')}>
                <Text style={styles.retryButtonText}>Connect EA</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {quotesWithActiveStatus.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No symbols available</Text>
                <Text style={styles.emptySubtext}>Connect an EA to view trading symbols</Text>
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
                  <View style={styles.quoteHeader}>
                    <View style={styles.symbolContainer}>
                      <Text style={styles.symbol}>{quote.symbol}</Text>
                      {quote.isActive && (
                        <Circle
                          color="#00FF00"
                          fill="#00FF00"
                          size={8}
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
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  headerContent: {
    flex: 1,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
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
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  botName: {
    color: '#CCCCCC',
    fontSize: 12,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  refreshButton: {
    padding: 8,
    marginLeft: 8,
    borderRadius: 20,
  },
  refreshButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  symbolCount: {
    color: '#888888',
    fontSize: 10,
    fontWeight: '400',
    marginTop: 2,
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
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  quoteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  symbolContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  symbol: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  activeIndicator: {
    marginLeft: 8,
  },
  activeQuoteCard: {
    borderColor: '#00FF00',
    borderWidth: 1,
  },

  priceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  priceColumn: {
    alignItems: 'center',
    flex: 1,
  },
  priceLabel: {
    color: '#888888',
    fontSize: 10,
    fontWeight: '500',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  priceValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  platformValue: {
    color: '#CCCCCC',
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'monospace',
  },
  directionValue: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
  },

});
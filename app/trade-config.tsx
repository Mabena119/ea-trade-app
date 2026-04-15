import React, { useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Trash2 } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/providers/app-provider';
import { useTheme } from '@/providers/theme-provider';
import colors from '@/constants/colors';
import { getEquityBasedMT5Preset } from '@/utils/equity-trade-preset';

export default function TradeConfigScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const {
    activeSymbols,
    deactivateSymbol,
    mt5Symbols,
    activateMT5Symbol,
    deactivateMT5Symbol,
    mt5Account,
  } = useApp();
  const { theme } = useTheme();

  const preset = useMemo(() => getEquityBasedMT5Preset(mt5Account?.equity), [mt5Account?.equity]);

  const isSymbolActive =
    mt5Symbols.some(s => s.symbol === symbol) || activeSymbols.some(s => s.symbol === symbol);

  const handleBack = () => {
    router.back();
  };

  const handleSetSymbol = () => {
    if (!symbol) return;
    activateMT5Symbol({
      symbol,
      lotSize: preset.lotSize,
      direction: 'BOTH',
      numberOfTrades: preset.numberOfTrades,
    });
    router.back();
  };

  const handleRemoveSymbol = () => {
    if (!symbol) return;
    deactivateSymbol(symbol);
    deactivateMT5Symbol(symbol);
    router.back();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { borderBottomColor: `${theme.colors.accent}15` }]}>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: `${theme.colors.accent}33`, borderColor: `${theme.colors.accent}66` }]} onPress={handleBack} activeOpacity={0.7}>
          {Platform.OS === 'ios' && (
            <BlurView intensity={60} tint={theme.isDark ? "light" : "dark"} style={StyleSheet.absoluteFill} />
          )}
          <ArrowLeft color={theme.colors.textPrimary} size={22} strokeWidth={2.5} />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>TRADE CONFIG</Text>
          <Text style={[styles.symbolText, { color: theme.colors.textSecondary }]}>{symbol}</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.notice, { color: theme.colors.textSecondary }]}>
          Lot size and number of trades are set automatically from your linked MT5 account equity (risk
          management). Direction is always BOTH. Platform is always MT5. These values cannot be edited.
        </Text>
        {!mt5Account?.connected && (
          <Text style={[styles.warn, { color: theme.colors.warning }]}>
            Connect your account on MetaTrader for equity-based sizing. Until then, baseline sizing
            applies (0.01 lot, 1 trade).
          </Text>
        )}

        <View style={[styles.heroCard, { shadowColor: theme.colors.accent, borderColor: `${theme.colors.accent}40`, borderTopColor: `${theme.colors.accent}66` }]}>
          <LinearGradient
            colors={theme.colors.primaryGradient as [string, string, ...string[]]}
            style={styles.gradientBackground}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />

          {Platform.OS === 'ios' && (
            <BlurView intensity={40} tint={theme.isDark ? "light" : "dark"} style={styles.glassOverlay} />
          )}

          <LinearGradient
            colors={theme.isDark ? ['rgba(255, 255, 255, 0.4)', 'rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0)'] : ['rgba(255, 255, 255, 0.6)', 'rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 0)']}
            style={styles.glossShine}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          />

          <View style={styles.cardContent}>
            <ReadOnlyRow label="LOT SIZE" value={preset.lotSize} />
            <ReadOnlyRow label="DIRECTION" value="BOTH" />
            <ReadOnlyRow label="PLATFORM" value="MT5" />
            <ReadOnlyRow label="NUMBER OF TRADES" value={preset.numberOfTrades} />
            {mt5Account?.equity != null && mt5Account.equity !== '' && (
              <ReadOnlyRow label="ACCOUNT EQUITY (REFERENCE)" value={String(mt5Account.equity)} />
            )}

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.executeButton, { backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.15)' }]}
                onPress={handleSetSymbol}
                activeOpacity={0.7}
              >
                {Platform.OS === 'ios' && (
                  <BlurView intensity={60} tint={theme.isDark ? "light" : "dark"} style={StyleSheet.absoluteFill} />
                )}
                <Text style={[styles.executeButtonText, { color: theme.isDark ? '#FFFFFF' : '#000000' }]}>
                  {isSymbolActive ? 'CONFIRM / RE-SYNC SYMBOL' : 'SET SYMBOL'}
                </Text>
              </TouchableOpacity>

              {isSymbolActive && (
                <TouchableOpacity
                  style={[styles.removeButton, { backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)' }]}
                  onPress={handleRemoveSymbol}
                  activeOpacity={0.7}
                >
                  {Platform.OS === 'ios' && (
                    <BlurView intensity={60} tint={theme.isDark ? "light" : "dark"} style={StyleSheet.absoluteFill} />
                  )}
                  <Trash2 color={theme.isDark ? '#FFFFFF' : '#000000'} size={20} strokeWidth={2.5} />
                  <Text style={[styles.removeButtonText, { color: theme.isDark ? '#FFFFFF' : '#000000' }]}>REMOVE</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.configSection}>
      <Text style={[styles.sectionTitle, { color: theme.isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.8)' }]}>
        {label}
      </Text>
      <View style={[styles.readOnlyBox, { backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.06)', borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)' }]}>
        {Platform.OS === 'ios' && (
          <BlurView intensity={30} tint={theme.isDark ? "light" : "dark"} style={StyleSheet.absoluteFill} pointerEvents="none" />
        )}
        <Text style={[styles.readOnlyText, { color: theme.isDark ? '#FFFFFF' : '#000000' }]}>{value}</Text>
      </View>
    </View>
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
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 2,
  },
  symbolText: {
    color: '#CCCCCC',
    fontSize: 14,
    fontWeight: '500',
  },
  notice: {
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 20,
    marginBottom: 10,
    marginTop: 8,
  },
  warn: {
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 20,
    marginBottom: 12,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  heroCard: {
    marginBottom: 24,
    borderRadius: 40,
    overflow: 'hidden',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.6,
    shadowRadius: 60,
    elevation: 30,
    borderWidth: 1.5,
    borderTopWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderTopColor: 'rgba(255, 255, 255, 0.4)',
    position: 'relative',
  },
  gradientBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 40,
    zIndex: 0,
    opacity: 0.9,
  },
  glassOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 40,
    zIndex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  glossShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    zIndex: 2,
  },
  cardContent: {
    padding: 24,
    zIndex: 3,
  },
  configSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  readOnlyBox: {
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  readOnlyText: {
    fontSize: 18,
    fontWeight: '700',
    zIndex: 1,
  },
  buttonContainer: {
    marginTop: 24,
    marginBottom: 16,
    gap: 12,
  },
  executeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 24,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 0,
    overflow: 'hidden',
    shadowColor: 'rgba(255, 255, 255, 0.5)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  executeButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  removeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 0,
    borderRadius: 24,
    paddingVertical: 18,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    overflow: 'hidden',
    shadowColor: 'rgba(255, 255, 255, 0.3)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  removeButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});

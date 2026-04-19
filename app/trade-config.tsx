import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, Platform, TextInput } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Trash2 } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp, type MT5TradeMode } from '@/providers/app-provider';
import { useTheme } from '@/providers/theme-provider';
import colors from '@/constants/colors';
import { getEquityBasedMT5Preset, sanitizeManualLotSize, sanitizeManualTradesCount } from '@/utils/equity-trade-preset';

export default function TradeConfigScreen() {
  const { symbol: symbolParam } = useLocalSearchParams<{ symbol?: string | string[] }>();
  const symbol = useMemo(() => {
    const raw = symbolParam == null ? '' : Array.isArray(symbolParam) ? symbolParam[0] : symbolParam;
    const s = String(raw ?? '').trim();
    return s.length > 0 ? s : undefined;
  }, [symbolParam]);

  const {
    activeSymbols,
    deactivateSymbol,
    mt5Symbols,
    activateMT5Symbol,
    deactivateMT5Symbol,
    mt5Account,
    mt5LotSizingMode,
    setMt5LotSizingMode,
  } = useApp();
  const { theme } = useTheme();

  const preset = useMemo(
    () => getEquityBasedMT5Preset(mt5Account?.equity, symbol),
    [mt5Account?.equity, symbol]
  );

  /** Saved row for this symbol — same source as Quotes list (always show live stored values in Auto). */
  const savedMt5 = useMemo(
    () => (symbol ? mt5Symbols.find((s) => s.symbol === symbol) : undefined),
    [symbol, mt5Symbols]
  );
  const autoLotDisplay = savedMt5 ? savedMt5.lotSize : preset.lotSize;
  const autoTradesDisplay = savedMt5 ? savedMt5.numberOfTrades : preset.numberOfTrades;

  const [tradeMode, setTradeMode] = useState<MT5TradeMode>('swing');
  const [manualLot, setManualLot] = useState('0.01');
  const [manualTrades, setManualTrades] = useState('1');

  useEffect(() => {
    if (!symbol) return;
    const existing = mt5Symbols.find((s) => s.symbol === symbol);
    setTradeMode(existing?.tradeMode === 'scalper' ? 'scalper' : 'swing');
  }, [symbol, mt5Symbols]);

  useEffect(() => {
    if (!symbol) return;
    const existing = mt5Symbols.find((s) => s.symbol === symbol);
    const fb = getEquityBasedMT5Preset(mt5Account?.equity, symbol);
    if (existing) {
      setManualLot(existing.lotSize);
      setManualTrades(existing.numberOfTrades);
    } else {
      setManualLot(fb.lotSize);
      setManualTrades(fb.numberOfTrades);
    }
  }, [symbol, mt5Symbols, mt5Account?.equity, mt5LotSizingMode]);

  const isSymbolActive =
    mt5Symbols.some(s => s.symbol === symbol) || activeSymbols.some(s => s.symbol === symbol);

  const handleBack = () => {
    router.back();
  };

  const handleSetSymbol = () => {
    if (!symbol) return;
    const lot =
      mt5LotSizingMode === 'manual' ? sanitizeManualLotSize(manualLot) : preset.lotSize;
    const numberOfTrades =
      mt5LotSizingMode === 'manual' ? sanitizeManualTradesCount(manualTrades) : preset.numberOfTrades;
    activateMT5Symbol({
      symbol,
      lotSize: lot,
      direction: 'BOTH',
      numberOfTrades,
      tradeMode,
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
      <View style={[styles.header, { borderBottomColor: theme.colors.borderColor }]}>
        <TouchableOpacity
          style={[
            styles.backButton,
            {
              backgroundColor: `${theme.colors.accent}33`,
              borderColor: `${theme.colors.accent}66`,
              shadowColor: theme.colors.accent,
            },
          ]}
          onPress={handleBack}
          activeOpacity={0.7}
        >
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
          Lots: Auto/Manual on Quotes · Scalper/Swing = execution style
        </Text>
        {!mt5Account?.connected && (
          <Text style={[styles.warn, { color: theme.colors.warning }]}>
            Connect MetaTrader for live equity in Auto mode.
          </Text>
        )}

        <View
          style={[
            styles.heroCard,
            {
              shadowColor: theme.colors.glowColor,
              borderColor: `${theme.colors.accent}40`,
              borderTopColor: `${theme.colors.accent}66`,
            },
          ]}
        >
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
            <View style={styles.configSection}>
              <Text
                style={[styles.sectionTitle, { color: theme.isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.8)' }]}
              >
                LOT SIZING
              </Text>
              <View style={styles.modeRow}>
                {(['auto', 'manual'] as const).map((m) => {
                  const selected = mt5LotSizingMode === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      onPress={() => void setMt5LotSizingMode(m)}
                      activeOpacity={0.75}
                      style={[
                        styles.modeChip,
                        {
                          borderColor: selected ? theme.colors.accent : theme.isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                          backgroundColor: selected ? `${theme.colors.accent}44` : theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeChipText,
                          { color: theme.colors.textPrimary, fontWeight: selected ? '800' : '600' },
                        ]}
                      >
                        {m === 'auto' ? 'Auto (AI)' : 'Manual'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.configSection}>
              <Text
                style={[styles.sectionTitle, { color: theme.isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.8)' }]}
              >
                TRADE MODE
              </Text>
              <View style={styles.modeRow}>
                {(['scalper', 'swing'] as const).map((m) => {
                  const selected = tradeMode === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      onPress={() => setTradeMode(m)}
                      activeOpacity={0.75}
                      style={[
                        styles.modeChip,
                        {
                          borderColor: selected ? theme.colors.accent : theme.isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                          backgroundColor: selected ? `${theme.colors.accent}44` : theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeChipText,
                          { color: theme.colors.textPrimary, fontWeight: selected ? '800' : '600' },
                        ]}
                      >
                        {m === 'scalper' ? 'Scalper' : 'Swing'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {mt5LotSizingMode === 'auto' ? (
              <>
                <ReadOnlyRow label="LOT SIZE" value={autoLotDisplay} />
                <ReadOnlyRow label="NUMBER OF TRADES" value={String(autoTradesDisplay)} />
              </>
            ) : (
              <>
                <ManualFieldRow
                  label="LOT SIZE"
                  value={manualLot}
                  onChangeText={setManualLot}
                  keyboardType="decimal-pad"
                />
                <ManualFieldRow
                  label="NUMBER OF TRADES"
                  value={manualTrades}
                  onChangeText={setManualTrades}
                  keyboardType="number-pad"
                />
              </>
            )}
            <ReadOnlyRow label="DIRECTION" value="BOTH" />
            <ReadOnlyRow label="PLATFORM" value="MT5" />
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

function ManualFieldRow({
  label,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType: 'decimal-pad' | 'number-pad';
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.configSection}>
      <Text style={[styles.sectionTitle, { color: theme.isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.8)' }]}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholderTextColor={theme.isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'}
        style={[
          styles.manualInput,
          {
            color: theme.isDark ? '#FFFFFF' : '#000000',
            borderColor: theme.isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)',
            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
          },
        ]}
      />
    </View>
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
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.background,
  },
  backButton: {
    marginRight: 16,
    padding: 10,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
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
  manualInput: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '700',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  modeChip: {
    flex: 1,
    minWidth: 120,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeChipText: {
    fontSize: 16,
    letterSpacing: 0.3,
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

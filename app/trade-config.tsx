import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, ScrollView, Modal, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ChevronDown, Trash2 } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/providers/app-provider';
import { useTheme } from '@/providers/theme-provider';
import colors from '@/constants/colors';

interface TradeConfig {
  lotSize: string;
  direction: 'BUY' | 'SELL' | 'BOTH';
  platform: 'MT4' | 'MT5';
  numberOfTrades: string;
}

export default function TradeConfigScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const { activeSymbols, activateSymbol, deactivateSymbol, mt4Symbols, mt5Symbols, activateMT4Symbol, activateMT5Symbol, deactivateMT4Symbol, deactivateMT5Symbol } = useApp();
  const { theme } = useTheme();
  
  const [config, setConfig] = useState<TradeConfig>({
    lotSize: '0.01',
    direction: 'BUY',
    platform: 'MT5',
    numberOfTrades: '1'
  });
  
  // Check if symbol is active in the current platform's separate storage
  const isSymbolActive = config.platform === 'MT4' 
    ? mt4Symbols.some(s => s.symbol === symbol)
    : mt5Symbols.some(s => s.symbol === symbol);
    
  // Also check legacy activeSymbols for backward compatibility
  const legacySymbolActive = activeSymbols.some(s => s.symbol === symbol);
  const legacySymbolConfig = activeSymbols.find(s => s.symbol === symbol);
  
  // Load existing config when symbol changes (initial load only)
  useEffect(() => {
    const loadInitialConfig = () => {
      // Check legacy config first for backward compatibility
      if (legacySymbolConfig) {
        setConfig({
          lotSize: legacySymbolConfig.lotSize,
          direction: legacySymbolConfig.direction,
          platform: legacySymbolConfig.platform,
          numberOfTrades: legacySymbolConfig.numberOfTrades
        });
        return;
      }
      
      // Check MT5 config first (default platform)
      const mt5Config = mt5Symbols.find(s => s.symbol === symbol);
      if (mt5Config) {
        setConfig(prev => ({
          ...prev,
          lotSize: mt5Config.lotSize,
          direction: mt5Config.direction,
          platform: 'MT5',
          numberOfTrades: mt5Config.numberOfTrades
        }));
        return;
      }
      
      // Check MT4 config
      const mt4Config = mt4Symbols.find(s => s.symbol === symbol);
      if (mt4Config) {
        setConfig(prev => ({
          ...prev,
          lotSize: mt4Config.lotSize,
          direction: mt4Config.direction,
          platform: 'MT4',
          numberOfTrades: mt4Config.numberOfTrades
        }));
        return;
      }
      
      // Reset to defaults if no config found
      setConfig(prev => ({
        ...prev,
        lotSize: '0.01',
        direction: 'BUY',
        platform: 'MT5',
        numberOfTrades: '1'
      }));
    };
    
    // Only load initial config when component mounts or symbol changes
    loadInitialConfig();
  }, [symbol, mt4Symbols, mt5Symbols, legacySymbolConfig]);
  
  const [showDirectionModal, setShowDirectionModal] = useState(false);
  const [showPlatformModal, setShowPlatformModal] = useState(false);

  const handleBack = () => {
    router.back();
  };

  const handleSetSymbol = () => {
    if (symbol) {
      // Save to both legacy and separate storage for compatibility
      activateSymbol({
        symbol,
        lotSize: config.lotSize,
        direction: config.direction,
        platform: config.platform,
        numberOfTrades: config.numberOfTrades
      });
      
      // Save to platform-specific storage (MT4 and MT5 are stored separately)
      if (config.platform === 'MT4') {
        activateMT4Symbol({
          symbol,
          lotSize: config.lotSize,
          direction: config.direction,
          numberOfTrades: config.numberOfTrades
        });
        console.log('MT4 symbol activated:', { symbol, ...config });
      } else {
        activateMT5Symbol({
          symbol,
          lotSize: config.lotSize,
          direction: config.direction,
          numberOfTrades: config.numberOfTrades
        });
        console.log('MT5 symbol activated:', { symbol, ...config });
      }
      
      router.back();
    }
  };
  
  const handleRemoveSymbol = () => {
    if (symbol) {
      // Remove from both legacy and separate storage
      deactivateSymbol(symbol);
      
      // Remove from platform-specific storage (MT4 and MT5 are stored separately)
      if (config.platform === 'MT4') {
        deactivateMT4Symbol(symbol);
        console.log('MT4 symbol deactivated:', symbol);
      } else {
        deactivateMT5Symbol(symbol);
        console.log('MT5 symbol deactivated:', symbol);
      }
      
      router.back();
    }
  };

  const updateConfig = (key: keyof TradeConfig, value: string) => {
    setConfig(prev => {
      const newConfig = { ...prev, [key]: value };
      
      // If platform is being changed, load existing config for that platform
      if (key === 'platform' && symbol) {
        const targetPlatform = value as 'MT4' | 'MT5';
        
        if (targetPlatform === 'MT4') {
          const mt4Config = mt4Symbols.find(s => s.symbol === symbol);
          if (mt4Config) {
            return {
              ...newConfig,
              lotSize: mt4Config.lotSize,
              direction: mt4Config.direction,
              numberOfTrades: mt4Config.numberOfTrades
            };
          }
        } else if (targetPlatform === 'MT5') {
          const mt5Config = mt5Symbols.find(s => s.symbol === symbol);
          if (mt5Config) {
            return {
              ...newConfig,
              lotSize: mt5Config.lotSize,
              direction: mt5Config.direction,
              numberOfTrades: mt5Config.numberOfTrades
            };
          }
        }
        
        // If no config found for target platform, use defaults
        return {
          ...newConfig,
          lotSize: '0.01',
          direction: 'BUY',
          numberOfTrades: '1'
        };
      }
      
      return newConfig;
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
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

      <KeyboardAvoidingView 
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Gradient Card Wrapper */}
          <View style={[styles.heroCard, { shadowColor: theme.colors.accent, borderColor: `${theme.colors.accent}40`, borderTopColor: `${theme.colors.accent}66` }]}>
            {/* Beautiful gradient background with glass effect */}
            <LinearGradient
              colors={theme.colors.primaryGradient as [string, string, ...string[]]}
              style={styles.gradientBackground}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            
            {/* Glass overlay effect */}
            {Platform.OS === 'ios' && (
              <BlurView intensity={40} tint={theme.isDark ? "light" : "dark"} style={styles.glassOverlay} />
            )}
            
            {/* Glossy shine effect at top */}
            <LinearGradient
              colors={theme.isDark ? ['rgba(255, 255, 255, 0.4)', 'rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0)'] : ['rgba(255, 255, 255, 0.6)', 'rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 0)']}
              style={styles.glossShine}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
            />
            
            <View style={styles.cardContent}>
        {/* Lot Size */}
        <View style={styles.configSection}>
          <Text style={[styles.sectionTitle, { color: theme.isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.8)' }]}>LOT SIZE</Text>
          <View style={[styles.inputContainer, { backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)', borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)' }]} pointerEvents="box-none">
            {Platform.OS === 'ios' && (
              <BlurView intensity={30} tint={theme.isDark ? "light" : "dark"} style={StyleSheet.absoluteFill} pointerEvents="none" />
            )}
          <TextInput
            style={[styles.input, { color: theme.isDark ? '#FFFFFF' : '#000000' }]}
            value={config.lotSize}
              onChangeText={(value) => {
                console.log('Lot size input changed:', value);
                updateConfig('lotSize', value);
              }}
            keyboardType="decimal-pad"
            placeholder="0.01"
            placeholderTextColor={theme.isDark ? '#666666' : '#999999'}
              editable={true}
          />
          </View>
        </View>

        {/* Direction */}
        <View style={styles.configSection}>
          <Text style={[styles.sectionTitle, { color: theme.isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.8)' }]}>DIRECTION</Text>
          <TouchableOpacity 
            style={[styles.picker, { backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)', borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)' }]}
            onPress={() => setShowDirectionModal(true)}
            activeOpacity={0.7}
          >
            {Platform.OS === 'ios' && (
              <BlurView intensity={30} tint={theme.isDark ? "light" : "dark"} style={StyleSheet.absoluteFill} />
            )}
            <Text style={[styles.pickerText, { color: theme.isDark ? '#FFFFFF' : '#000000' }]}>{config.direction}</Text>
            <ChevronDown color={theme.isDark ? '#FFFFFF' : '#000000'} size={20} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {/* Platform */}
        <View style={styles.configSection}>
          <Text style={[styles.sectionTitle, { color: theme.isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.8)' }]}>PLATFORM</Text>
          <TouchableOpacity 
            style={[styles.picker, { backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)', borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)' }]}
            onPress={() => setShowPlatformModal(true)}
            activeOpacity={0.7}
          >
            {Platform.OS === 'ios' && (
              <BlurView intensity={30} tint={theme.isDark ? "light" : "dark"} style={StyleSheet.absoluteFill} />
            )}
            <Text style={[styles.pickerText, { color: theme.isDark ? '#FFFFFF' : '#000000' }]}>{config.platform}</Text>
            <ChevronDown color={theme.isDark ? '#FFFFFF' : '#000000'} size={20} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {/* Number of Trades */}
        <View style={styles.configSection}>
          <Text style={[styles.sectionTitle, { color: theme.isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.8)' }]}>NUMBER OF TRADES</Text>
          <View style={[styles.inputContainer, { backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)', borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)' }]} pointerEvents="box-none">
            {Platform.OS === 'ios' && (
              <BlurView intensity={30} tint={theme.isDark ? "light" : "dark"} style={StyleSheet.absoluteFill} pointerEvents="none" />
            )}
          <TextInput
            style={[styles.input, { color: theme.isDark ? '#FFFFFF' : '#000000' }]}
            value={config.numberOfTrades}
              onChangeText={(value) => {
                console.log('Number of trades input changed:', value);
                updateConfig('numberOfTrades', value);
              }}
            keyboardType="number-pad"
            placeholder="1"
            placeholderTextColor={theme.isDark ? '#666666' : '#999999'}
              editable={true}
          />
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={[styles.executeButton, { backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.15)' }]} onPress={handleSetSymbol} activeOpacity={0.7}>
            {Platform.OS === 'ios' && (
              <BlurView intensity={60} tint={theme.isDark ? "light" : "dark"} style={StyleSheet.absoluteFill} />
            )}
            <Text style={[styles.executeButtonText, { color: theme.isDark ? '#FFFFFF' : '#000000' }]}>
              {(isSymbolActive || legacySymbolActive) ? 'UPDATE SYMBOL' : 'SET SYMBOL'}
            </Text>
          </TouchableOpacity>
          
          {(isSymbolActive || legacySymbolActive) && (
            <TouchableOpacity style={[styles.removeButton, { backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)' }]} onPress={handleRemoveSymbol} activeOpacity={0.7}>
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
      </KeyboardAvoidingView>

      {/* Direction Modal */}
      <Modal
        visible={showDirectionModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDirectionModal(false)}
      >
        <Pressable 
          style={[styles.modalOverlay, { backgroundColor: theme.isDark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.5)' }]}
          onPress={() => setShowDirectionModal(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.colors.background, borderColor: `${theme.colors.accent}80`, borderTopColor: `${theme.colors.accent}B3` }]}>
            {/* Subtle gradient overlay */}
            <LinearGradient
              colors={theme.colors.primaryGradient as [string, string, ...string[]]}
              style={[StyleSheet.absoluteFill, { opacity: 0.15 }]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            
            <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>Select Direction</Text>
            {['BUY', 'SELL', 'BOTH'].map((direction) => (
              <TouchableOpacity
                key={direction}
                style={[
                  styles.modalOption,
                  { borderBottomColor: `${theme.colors.accent}33` },
                  config.direction === direction && { backgroundColor: `${theme.colors.accent}4D`, borderBottomColor: `${theme.colors.accent}99` }
                ]}
                onPress={() => {
                  updateConfig('direction', direction as 'BUY' | 'SELL' | 'BOTH');
                  setShowDirectionModal(false);
                }}
                activeOpacity={0.8}
              >
                {config.direction === direction && Platform.OS === 'ios' && (
                  <BlurView intensity={100} tint={theme.isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
                )}
                <Text style={[
                  styles.modalOptionText,
                  { color: theme.colors.textPrimary },
                  config.direction === direction && { fontWeight: '900', textShadowColor: `${theme.colors.accent}80` }
                ]}>
                  {direction}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Platform Modal */}
      <Modal
        visible={showPlatformModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPlatformModal(false)}
      >
        <Pressable 
          style={[styles.modalOverlay, { backgroundColor: theme.isDark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.5)' }]}
          onPress={() => setShowPlatformModal(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.colors.background, borderColor: `${theme.colors.accent}80`, borderTopColor: `${theme.colors.accent}B3` }]}>
            {/* Subtle gradient overlay */}
            <LinearGradient
              colors={theme.colors.primaryGradient as [string, string, ...string[]]}
              style={[StyleSheet.absoluteFill, { opacity: 0.15 }]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            
            <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>Select Platform</Text>
            {['MT4', 'MT5'].map((platform) => (
              <TouchableOpacity
                key={platform}
                style={[
                  styles.modalOption,
                  { borderBottomColor: `${theme.colors.accent}33` },
                  config.platform === platform && { backgroundColor: `${theme.colors.accent}4D`, borderBottomColor: `${theme.colors.accent}99` }
                ]}
                onPress={() => {
                  updateConfig('platform', platform as 'MT4' | 'MT5');
                  setShowPlatformModal(false);
                }}
                activeOpacity={0.8}
              >
                {config.platform === platform && Platform.OS === 'ios' && (
                  <BlurView intensity={100} tint={theme.isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
                )}
                <Text style={[
                  styles.modalOptionText,
                  { color: theme.colors.textPrimary },
                  config.platform === platform && { fontWeight: '900', textShadowColor: `${theme.colors.accent}80` }
                ]}>
                  {platform}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  keyboardAvoidingView: {
    flex: 1,
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
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
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
    marginBottom: 24,
  },
  sectionTitle: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  inputContainer: {
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.3)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  input: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    zIndex: 1,
    position: 'relative',
  },
  picker: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: 'rgba(255, 255, 255, 0.3)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  pickerText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  modalContent: {
    backgroundColor: '#000000',
    borderRadius: 24,
    borderWidth: 1.5,
    borderTopWidth: 2,
    borderColor: 'rgba(139, 92, 246, 0.5)',
    borderTopColor: 'rgba(139, 92, 246, 0.7)',
    paddingVertical: 20,
    width: '100%',
    maxWidth: 300,
    overflow: 'hidden',
    shadowColor: '#8B5CF6',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.8,
    shadowRadius: 24,
    elevation: 20,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  modalOption: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 92, 246, 0.2)',
    overflow: 'hidden',
    position: 'relative',
  },
  selectedModalOption: {
    backgroundColor: 'rgba(139, 92, 246, 0.3)',
    borderBottomColor: 'rgba(139, 92, 246, 0.6)',
  },
  modalOptionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    zIndex: 3,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  selectedModalOptionText: {
    color: '#FFFFFF',
    fontWeight: '900',
    textShadowColor: 'rgba(139, 92, 246, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  buttonContainer: {
    marginTop: 32,
    marginBottom: 32,
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
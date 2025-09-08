import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, ScrollView, Modal, Pressable } from 'react-native';
import { ArrowLeft, ChevronDown, Trash2 } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/providers/app-provider';

interface TradeConfig {
  lotSize: string;
  direction: 'BUY' | 'SELL' | 'BOTH';
  platform: 'MT4' | 'MT5';
  numberOfTrades: string;
}

export default function TradeConfigScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const { activeSymbols, activateSymbol, deactivateSymbol, mt4Symbols, mt5Symbols, activateMT4Symbol, activateMT5Symbol, deactivateMT4Symbol, deactivateMT5Symbol } = useApp();
  
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
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <ArrowLeft color="#FFFFFF" size={24} />
        </TouchableOpacity>
        
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>TRADE CONFIG</Text>
          <Text style={styles.symbolText}>{symbol}</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Lot Size */}
        <View style={styles.configSection}>
          <Text style={styles.sectionTitle}>LOT SIZE</Text>
          <TextInput
            style={styles.input}
            value={config.lotSize}
            onChangeText={(value) => updateConfig('lotSize', value)}
            keyboardType="decimal-pad"
            placeholder="0.01"
            placeholderTextColor="#666666"
          />
        </View>

        {/* Direction */}
        <View style={styles.configSection}>
          <Text style={styles.sectionTitle}>DIRECTION</Text>
          <TouchableOpacity 
            style={styles.picker}
            onPress={() => setShowDirectionModal(true)}
          >
            <Text style={styles.pickerText}>{config.direction}</Text>
            <ChevronDown color="#FFFFFF" size={20} />
          </TouchableOpacity>
        </View>

        {/* Platform */}
        <View style={styles.configSection}>
          <Text style={styles.sectionTitle}>PLATFORM</Text>
          <TouchableOpacity 
            style={styles.picker}
            onPress={() => setShowPlatformModal(true)}
          >
            <Text style={styles.pickerText}>{config.platform}</Text>
            <ChevronDown color="#FFFFFF" size={20} />
          </TouchableOpacity>
        </View>

        {/* Number of Trades */}
        <View style={styles.configSection}>
          <Text style={styles.sectionTitle}>NUMBER OF TRADES</Text>
          <TextInput
            style={styles.input}
            value={config.numberOfTrades}
            onChangeText={(value) => updateConfig('numberOfTrades', value)}
            keyboardType="number-pad"
            placeholder="1"
            placeholderTextColor="#666666"
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.executeButton} onPress={handleSetSymbol}>
            <Text style={styles.executeButtonText}>
              {(isSymbolActive || legacySymbolActive) ? 'UPDATE SYMBOL' : 'SET SYMBOL'}
            </Text>
          </TouchableOpacity>
          
          {(isSymbolActive || legacySymbolActive) && (
            <TouchableOpacity style={styles.removeButton} onPress={handleRemoveSymbol}>
              <Trash2 color="#FF4444" size={20} />
              <Text style={styles.removeButtonText}>REMOVE</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Direction Modal */}
      <Modal
        visible={showDirectionModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDirectionModal(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setShowDirectionModal(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Direction</Text>
            {['BUY', 'SELL', 'BOTH'].map((direction) => (
              <TouchableOpacity
                key={direction}
                style={[
                  styles.modalOption,
                  config.direction === direction && styles.selectedModalOption
                ]}
                onPress={() => {
                  updateConfig('direction', direction as 'BUY' | 'SELL' | 'BOTH');
                  setShowDirectionModal(false);
                }}
              >
                <Text style={[
                  styles.modalOptionText,
                  config.direction === direction && styles.selectedModalOptionText
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
          style={styles.modalOverlay}
          onPress={() => setShowPlatformModal(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Platform</Text>
            {['MT4', 'MT5'].map((platform) => (
              <TouchableOpacity
                key={platform}
                style={[
                  styles.modalOption,
                  config.platform === platform && styles.selectedModalOption
                ]}
                onPress={() => {
                  updateConfig('platform', platform as 'MT4' | 'MT5');
                  setShowPlatformModal(false);
                }}
              >
                <Text style={[
                  styles.modalOptionText,
                  config.platform === platform && styles.selectedModalOptionText
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
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  configSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  picker: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  modalContent: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#00FF00',
    paddingVertical: 20,
    width: '100%',
    maxWidth: 300,
    shadowColor: '#00FF00',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.6,
    shadowRadius: 16,
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
    borderBottomColor: '#333333',
  },
  selectedModalOption: {
    backgroundColor: 'rgba(0, 255, 0, 0.15)',
  },
  modalOptionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  selectedModalOptionText: {
    color: '#00FF00',
    fontWeight: 'bold',
  },
  buttonContainer: {
    marginTop: 32,
    marginBottom: 32,
    gap: 12,
  },
  executeButton: {
    backgroundColor: '#00FF00',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  executeButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  removeButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#FF4444',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  removeButtonText: {
    color: '#FF4444',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
});
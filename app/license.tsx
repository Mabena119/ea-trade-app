import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, Alert, ActivityIndicator, Image, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useApp } from '@/providers/app-provider';
import { useTheme } from '@/providers/theme-provider';
import { apiService } from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import colors from '@/constants/colors';

export default function LicenseScreen() {
  const { theme } = useTheme();
  const [licenseKey, setLicenseKey] = useState<string>('');
  const [isActivating, setIsActivating] = useState<boolean>(false);
  const { addEA, eas, setIsFirstTime } = useApp();
  const hasActiveBots = eas.length > 0;
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [modalTitle, setModalTitle] = useState<string>('');
  const [modalMessage, setModalMessage] = useState<string>('');

  // Check email authentication on mount
  useEffect(() => {
    const checkEmailAuth = async () => {
      try {
        const emailAuthenticated = await AsyncStorage.getItem('emailAuthenticated');
        
        // If email not authenticated, redirect to login
        if (!emailAuthenticated || emailAuthenticated !== 'true') {
          console.log('Email not authenticated, redirecting to login...');
          await setIsFirstTime(true);
          router.replace('/login');
        }
      } catch (error) {
        console.error('Error checking email authentication:', error);
        // On error, redirect to login to be safe
        await setIsFirstTime(true);
        router.replace('/login');
      }
    };

    checkEmailAuth();
  }, []);

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      Alert.alert('ERROR', 'PLEASE ENTER A VALID ROBOT KEY');
      return;
    }

    // Check if robot key already exists
    const existingEA = eas.find(ea => ea.licenseKey.toLowerCase().trim() === licenseKey.trim().toLowerCase());
    if (existingEA) {
      setModalTitle('ROBOT ALREADY ADDED');
      setModalMessage('THIS ROBOT KEY IS ALREADY ADDED ON THIS DEVICE.');
      setModalVisible(true);
      return;
    }

    setIsActivating(true);

    try {
      console.log('Starting license activation process...');

      // Attempt: authenticate with just the license key
      const authResponse = await apiService.authenticateLicense({
        licence: licenseKey.trim(),
      });

      if (authResponse.message === 'used') {
        setModalTitle('ROBOT ALREADY USED');
        setModalMessage('THIS ROBOT KEY IS BOUND TO ANOTHER DEVICE. PLEASE CONTACT SUPPORT IF YOU NEED ASSISTANCE.');
        setModalVisible(true);
        return;
      }

      if (authResponse.message !== 'accept' || !authResponse.data) {
        setModalTitle('Incorrect/Used Robot Copy');
        setModalMessage('');
        setModalVisible(true);
        return;
      }

      // Success path
      const data = authResponse.data;

      // Generate unique ID
      const timestamp = Date.now();
      const randomPart = Math.random().toString(36).substr(2, 9);
      const keyHash = licenseKey.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const uniqueId = `ea_${timestamp}_${randomPart}_${keyHash}`;

      const newEA = {
        id: uniqueId,
        name: data.ea_name || 'EA TRADE',
        licenseKey: licenseKey.trim(),
        status: 'connected' as const,
        description: (data.owner && data.owner.name) ? data.owner.name : 'EA TRADE',
        phoneSecretKey: data.phone_secret_key,
        userData: data,
      };

      const success = await addEA(newEA);
      if (success) {
        // Wait longer to ensure state is fully updated before navigation
        await new Promise(resolve => setTimeout(resolve, 600));
        console.log('License added successfully, navigating to tabs...');
        router.replace('/(tabs)');
      } else {
        Alert.alert('ERROR', 'FAILED TO SAVE THIS LICENSE LOCALLY.');
      }
    } catch (error) {
      console.error('Critical error during license activation:', error);
      Alert.alert('NETWORK ERROR', 'FAILED TO REACH THE SERVER. PLEASE TRY AGAIN.');
    } finally {
      setIsActivating(false);
    }
  };

  const handleBack = async () => {
    // Check if email is authenticated before allowing back navigation
    const emailAuthenticated = await AsyncStorage.getItem('emailAuthenticated');
    
    if (!emailAuthenticated || emailAuthenticated !== 'true') {
      // Not authenticated, go back to login/start
      console.log('Not authenticated, redirecting to login...');
      await setIsFirstTime(true);
      router.replace('/login');
    } else {
      // Authenticated, allow normal back navigation
    router.back();
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {hasActiveBots && (
        <View style={styles.header}>
          <TouchableOpacity style={[styles.backButton, { backgroundColor: `${theme.colors.accent}1A` }]} onPress={handleBack}>
            <ArrowLeft size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>
      )}
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.logoContainer}>
              <Image
                source={require('@/assets/images/icon.png')}
                style={[styles.appIcon, { width: 140, height: 140 }]}
                resizeMode="contain"
              />
              <Text style={[styles.title, { color: theme.colors.textPrimary }]}>ENTER ROBOT KEY</Text>
            </View>

            <View style={styles.form}>
              <TextInput
                style={[styles.input, { backgroundColor: `${theme.colors.accent}26`, borderColor: `${theme.colors.accent}4D`, color: theme.colors.textPrimary, shadowColor: theme.colors.accent }]}
                placeholder="ROBOT KEY"
                placeholderTextColor={theme.colors.textMuted}
                value={licenseKey}
                onChangeText={setLicenseKey}
                autoCapitalize="characters"
              />

              <TouchableOpacity
                style={[styles.activateButton, { backgroundColor: `${theme.colors.accent}4D`, borderColor: `${theme.colors.accent}80`, shadowColor: theme.colors.accent }, isActivating && styles.activateButtonDisabled]}
                onPress={handleActivate}
                disabled={isActivating}
              >
                {isActivating ? (
                  <View style={styles.activatingContainer}>
                    <ActivityIndicator size="small" color={theme.colors.textPrimary} />
                    <Text style={[styles.activatingText, { color: theme.colors.textPrimary }]}>ACTIVATING...</Text>
                  </View>
                ) : (
                  <Text style={[styles.activateButtonText, { color: theme.colors.textPrimary }]}>ACTIVATE</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {modalVisible && (
        <View style={[styles.modalOverlay, { backgroundColor: theme.isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.4)' }]}>
          <TouchableOpacity 
            style={styles.modalOverlayTouchable}
            activeOpacity={1}
            onPress={() => setModalVisible(false)}
          >
          <View style={[styles.modalCard, { backgroundColor: Platform.OS === 'ios' ? 'transparent' : theme.colors.backgroundSecondary }]}>
              {Platform.OS === 'ios' && (
                <BlurView intensity={130} tint={theme.isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
              )}
              <LinearGradient
                colors={theme.colors.cardGradient as [string, string, ...string[]]}
                style={StyleSheet.absoluteFill}
              />
            <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>{modalTitle}</Text>
              {modalMessage ? <Text style={[styles.modalMessage, { color: theme.colors.textSecondary }]}>{modalMessage}</Text> : null}
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: Platform.OS === 'ios' ? 'transparent' : theme.colors.backgroundSecondary }]}
              onPress={() => setModalVisible(false)}
                activeOpacity={0.8}
              >
                {Platform.OS === 'ios' && (
                  <BlurView intensity={100} tint={theme.isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
                )}
                <LinearGradient
                  colors={theme.colors.cardGradient as [string, string, ...string[]]}
                  style={StyleSheet.absoluteFill}
                />
              <Text style={[styles.modalButtonText, { color: theme.colors.textPrimary }]}>OK</Text>
            </TouchableOpacity>
          </View>
          </TouchableOpacity>
        </View>
      )}
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
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 16,
  },
  form: {
    width: '100%',
    maxWidth: 300,
  },
  input: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 16,
    marginBottom: 18,
    color: '#FFFFFF',
    fontWeight: '600',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  activateButton: {
    backgroundColor: 'rgba(139, 92, 246, 0.3)',
    paddingVertical: 18,
    borderRadius: 24,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.5)',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  activateButtonDisabled: {
    opacity: 0.5,
  },
  activatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activateButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  activatingText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
    marginLeft: 8,
  },
  hint: {
    fontSize: 12,
    color: '#CCCCCC',
    textAlign: 'center',
    marginTop: 12,
  },
  appIcon: {
    width: 80,
    height: 80,
    borderRadius: 16,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalOverlayTouchable: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.backgroundMedium,
    borderRadius: 20,
    padding: 24,
    borderWidth: 0.3,
    borderColor: colors.glass.border,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    color: '#CCCCCC',
    marginBottom: 16,
  },
  modalButton: {
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.backgroundMedium,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
    overflow: 'hidden',
    borderWidth: 0.3,
    borderColor: colors.glass.border,
  },
  modalButtonText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
});
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, Alert, ActivityIndicator, Image, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useApp } from '@/providers/app-provider';
import { apiService } from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function LicenseScreen() {
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
      Alert.alert('Error', 'Please enter a valid license key');
      return;
    }

    // Check if license key already exists
    const existingEA = eas.find(ea => ea.licenseKey.toLowerCase().trim() === licenseKey.trim().toLowerCase());
    if (existingEA) {
      setModalTitle('License Already Added');
      setModalMessage('This license key is already added on this device.');
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
        setModalTitle('License Already Used');
        setModalMessage('This license key is bound to another device. Please contact support if you need assistance.');
        setModalVisible(true);
        return;
      }

      if (authResponse.message !== 'accept' || !authResponse.data) {
        setModalTitle('Invalid License');
        setModalMessage('The license key does not exist or authentication failed.');
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
        Alert.alert('Error', 'Failed to save this license locally.');
      }
    } catch (error) {
      console.error('Critical error during license activation:', error);
      Alert.alert('Network Error', 'Failed to reach the server. Please try again.');
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
    <SafeAreaView style={styles.container}>
      {hasActiveBots && (
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <ArrowLeft size={24} color="#FFFFFF" />
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
              <Text style={styles.title}>Enter License Key</Text>
            </View>

            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="License Key"
                placeholderTextColor="#999999"
                value={licenseKey}
                onChangeText={setLicenseKey}
                autoCapitalize="characters"
              />

              <TouchableOpacity
                style={[styles.activateButton, isActivating && styles.activateButtonDisabled]}
                onPress={handleActivate}
                disabled={isActivating}
              >
                {isActivating ? (
                  <View style={styles.activatingContainer}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.activatingText}>Activating...</Text>
                  </View>
                ) : (
                  <Text style={styles.activateButtonText}>Activate EA</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.hint}>
                Enter your license key to activate EA
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {modalVisible && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{modalTitle}</Text>
            <Text style={styles.modalMessage}>{modalMessage}</Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.modalButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
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
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
    color: '#FFFFFF',
  },
  activateButton: {
    backgroundColor: '#000000',
    paddingVertical: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  activateButtonDisabled: {
    backgroundColor: '#999999',
  },
  activatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  activatingText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
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
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
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
    backgroundColor: '#000000',
    paddingVertical: 12,
    borderRadius: 8,
  },
  modalButtonText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
});
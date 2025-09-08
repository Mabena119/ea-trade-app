import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, Alert, ActivityIndicator, Image } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useApp } from '@/providers/app-provider';
import { apiService } from '@/services/api';

export default function LicenseScreen() {
  const [licenseKey, setLicenseKey] = useState<string>('');
  const [isActivating, setIsActivating] = useState<boolean>(false);
  const { addEA, eas } = useApp();
  const hasActiveBots = eas.length > 0;

  // In-app modal (consistent with login UX)
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [modalTitle, setModalTitle] = useState<string>('');
  const [modalMessage, setModalMessage] = useState<string>('');

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      setModalTitle('Invalid Key');
      setModalMessage('Please enter a valid license key.');
      setModalVisible(true);
      return;
    }

    // Check if license key already exists
    const existingEA = eas.find(ea => ea.licenseKey.toLowerCase().trim() === licenseKey.trim().toLowerCase());
    if (existingEA) {
      setModalTitle('Already Added');
      setModalMessage('This license key is already connected on this device.');
      setModalVisible(true);
      return;
    }

    setIsActivating(true);

    try {
      console.log('Starting license activation process...');

      // First attempt: authenticate with just the license key
      let authResponse = await apiService.authenticateLicense({
        licence: licenseKey.trim()
      });

      if (authResponse.message === 'used') {
        // License requires phone secret or already paired to another device
        setModalTitle('License Already Used');
        setModalMessage('This license key is already paired to a device. Contact support if you need assistance.');
        setModalVisible(true);
        return;
      }

      if (authResponse.message === 'accept' && authResponse.data) {
        console.log('License authenticated successfully:', authResponse.data);

        // Generate unique ID based on timestamp, random number, and license key hash
        const timestamp = Date.now();
        const randomPart = Math.random().toString(36).substr(2, 9);
        const keyHash = licenseKey.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const uniqueId = `ea_${timestamp}_${randomPart}_${keyHash}`;

        const newEA = {
          id: uniqueId,
          name: (authResponse.data.ea_name || 'EA CONVERTER').trim(),
          licenseKey: licenseKey.trim(),
          status: 'connected' as const,
          description: (authResponse.data.owner.name || 'EA CONVERTER').trim(),
          phoneSecretKey: authResponse.data.phone_secret_key,
          userData: authResponse.data,
        };

        console.log('Attempting to add EA:', newEA);
        const success = await addEA(newEA);

        if (success) {
          console.log('EA added successfully, navigating to home...');
          // Add another delay before navigation to ensure state is updated
          await new Promise(resolve => setTimeout(resolve, 800));

          // Use replace to prevent going back to license screen
          router.replace('/(tabs)');
        } else {
          console.error('Failed to add EA');
          Alert.alert('Error', 'This license key is already in use or failed to save.');
        }
      } else {
        console.log('License authentication failed:', authResponse.message);
        setModalTitle('Invalid License');
        setModalMessage('The license key does not exist or could not be verified.');
        setModalVisible(true);
      }
    } catch (error) {
      console.error('Critical error during license activation:', error);
      setModalTitle('Activation Error');
      setModalMessage('Failed to activate license. Please try again.');
      setModalVisible(true);
    } finally {
      setIsActivating(false);
    }
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      {hasActiveBots && (
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <ArrowLeft size={24} color="#000000" />
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={styles.appIcon}
            resizeMode="contain"
          />
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
    backgroundColor: '#FFFFFF',
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
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
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
    color: '#000000',
    marginTop: 16,
  },
  form: {
    width: '100%',
    maxWidth: 300,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
    color: '#000000',
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
    color: '#666666',
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
    backgroundColor: '#FFFFFF',
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
    color: '#000000',
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    color: '#333333',
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
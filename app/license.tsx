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

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      Alert.alert('Error', 'Please enter a valid license key');
      return;
    }

    // Check if license key already exists
    const existingEA = eas.find(ea => ea.licenseKey.toLowerCase().trim() === licenseKey.trim().toLowerCase());
    if (existingEA) {
      Alert.alert('Error', 'This license key is already in use');
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
        Alert.alert(
          'License Already Used',
          'This license key is bound to another device. Please contact support if you need assistance.'
        );
        return;
      }

      if (authResponse.message !== 'accept' || !authResponse.data) {
        Alert.alert('Invalid License', 'The license key does not exist or authentication failed.');
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
        name: data.ea_name || 'EA CONVERTER',
        licenseKey: licenseKey.trim(),
        status: 'connected' as const,
        description: (data.owner && data.owner.name) ? data.owner.name : 'EA CONVERTER',
        phoneSecretKey: data.phone_secret_key,
        userData: data,
      };

      const success = await addEA(newEA);
      if (success) {
        await new Promise(resolve => setTimeout(resolve, 300));
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
});
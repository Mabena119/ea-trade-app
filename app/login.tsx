import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, Alert, ActivityIndicator, Image, Linking, Platform, KeyboardAvoidingView, ScrollView, BackHandler } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView } from 'react-native-webview';
import { router } from 'expo-router';
import { ArrowLeft, X } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
// Networking disabled: avoid external browser/payment flows
import { useApp } from '@/providers/app-provider';
import { apiService } from '@/services/api';
import colors from '@/constants/colors';

export default function LoginScreen() {
  const [mentorId, setMentorId] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPaymentProcessing, setIsPaymentProcessing] = useState<boolean>(false);
  // In-app modal (reliable on iOS Safari)
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [modalTitle, setModalTitle] = useState<string>('');
  const [modalMessage, setModalMessage] = useState<string>('');
  const [paymentVisible, setPaymentVisible] = useState<boolean>(false);
  const [paymentUrl, setPaymentUrl] = useState<string>('');
  const { setUser, setIsFirstTime } = useApp();

  // Handle back button - go back to start page
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      console.log('Back pressed on login - going to start page');
      handleBackToStart();
      return true; // Prevent default back behavior
    });

    return () => backHandler.remove();
  }, []);

  const handleBackToStart = async () => {
    // Clear authentication and go back to start
    await AsyncStorage.removeItem('emailAuthenticated');
    await setIsFirstTime(true);
    router.replace('/(tabs)');
  };

  const handleProceed = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }

    if (!email.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setIsLoading(true);

    try {
      const trimmedEmail = email.trim();
      const trimmedMentor = ''; // No mentor ID required
      const account = await apiService.authenticate({ email: trimmedEmail, mentor: trimmedMentor });

      // If user doesn't exist or hasn't paid: redirect to payment/shop page
      if (account.status === 'not_found' || !account.paid) {
        const url = `https://ea-converter.com/shop/indexIOS.php?email=${encodeURIComponent(trimmedEmail)}&mentor=${encodeURIComponent(trimmedMentor)}`;
        setPaymentUrl(url);
        setPaymentVisible(true);
        return;
      }

      // If invalid mentor id is returned, block with message
      if ((account as any).invalidMentor === 1) {
        setModalTitle('Invalid Mentor ID');
        setModalMessage('The Mentor ID does not match our records for this email.');
        setModalVisible(true);
        return;
      }

      // If already used: show iOS-safe in-app modal and block
      if (account.used) {
        setModalTitle('Account Used');
        setModalMessage('');
        setModalVisible(true);
        return;
      }

      // Allow only existing + not used
      // Mark that email authentication was successful
      await AsyncStorage.setItem('emailAuthenticated', 'true');
      // Set isFirstTime to false after successful authentication
      await setIsFirstTime(false);
      setUser({ mentorId: trimmedMentor, email: account.email });
      router.replace('/license');
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentFlow = async () => {
    // Offline mode: do nothing
    setIsPaymentProcessing(false);
    Alert.alert('Offline mode', 'Payments are disabled. Continuing locally.');
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Back Button */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackToStart}>
          <ArrowLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

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
              <Text style={styles.title}>Login</Text>
            </View>

            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#999999"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <TouchableOpacity
                style={[styles.proceedButton, (isLoading || isPaymentProcessing) && styles.proceedButtonDisabled]}
                onPress={handleProceed}
                disabled={isLoading || isPaymentProcessing}
              >
                {isLoading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text style={styles.proceedButtonText}>Checking...</Text>
                  </View>
                ) : isPaymentProcessing ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text style={styles.proceedButtonText}>Processing Payment...</Text>
                  </View>
                ) : (
                  <Text style={styles.proceedButtonText}>Proceed</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {modalVisible && (
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalOverlayTouchable}
            activeOpacity={1}
            onPress={() => setModalVisible(false)}
          >
            <View style={styles.modalCard}>
              {Platform.OS === 'ios' && (
                <BlurView intensity={130} tint="dark" style={StyleSheet.absoluteFill} />
              )}
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.06)']}
                style={StyleSheet.absoluteFill}
              />
              <Text style={styles.modalTitle}>{modalTitle}</Text>
              {modalMessage ? <Text style={styles.modalMessage}>{modalMessage}</Text> : null}
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setModalVisible(false)}
                activeOpacity={0.8}
              >
                {Platform.OS === 'ios' && (
                  <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
                )}
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.15)', 'rgba(255, 255, 255, 0.08)']}
                  style={StyleSheet.absoluteFill}
                />
                <Text style={styles.modalButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>
      )}
      {paymentVisible && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { width: '100%', maxWidth: 800, height: '80%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={styles.modalTitle}>Pay for App</Text>
              <TouchableOpacity 
                onPress={() => setPaymentVisible(false)}
                style={styles.closeButton}
                activeOpacity={0.8}
              >
                <X color="#FFFFFF" size={24} />
              </TouchableOpacity>
            </View>
            {Platform.OS === 'web' ? (
              <View style={{ flex: 1, borderRadius: 8, overflow: 'hidden' }}>
                {/* On web, render the payment page inline via iframe inside the modal */}
                <iframe
                  src={paymentUrl}
                  style={{ width: '100%', height: '100%', border: '0' }}
                  loading="eager"
                  allow="payment *; clipboard-write;"
                />
              </View>
            ) : (
              <View style={{ flex: 1, borderRadius: 8, overflow: 'hidden' }}>
                <WebView source={{ uri: paymentUrl }} startInLoadingState />
              </View>
            )}
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
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 10 : 20,
    paddingBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
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
  appIcon: {
    width: 80,
    height: 80,
    borderRadius: 16,
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
  proceedButton: {
    backgroundColor: '#000000',
    paddingVertical: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  proceedButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginLeft: 8,
  },
  proceedButtonDisabled: {
    opacity: 0.7,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.glass.backgroundMedium,
    borderWidth: 0.3,
    borderColor: colors.glass.border,
  },
});
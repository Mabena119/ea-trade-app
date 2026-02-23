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
import { useTheme } from '@/providers/theme-provider';
import { apiService } from '@/services/api';
import colors from '@/constants/colors';

export default function LoginScreen() {
  const { theme } = useTheme();
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
      Alert.alert('ERROR', 'PLEASE ENTER YOUR EMAIL');
      return;
    }

    if (!email.includes('@')) {
      Alert.alert('ERROR', 'PLEASE ENTER A VALID EMAIL ADDRESS');
      return;
    }

    setIsLoading(true);

    try {
      const trimmedEmail = email.trim();
      const trimmedMentor = ''; // No mentor ID required
      const account = await apiService.authenticate({ email: trimmedEmail, mentor: trimmedMentor });

      // If user doesn't exist or hasn't paid: redirect to payment/shop page
      if (account.status === 'not_found' || !account.paid) {
        const url = `https://www.eatrade.io/shop/?email=${encodeURIComponent(trimmedEmail)}`;
        setPaymentUrl(url);
        setPaymentVisible(true);
        return;
      }

      // If invalid mentor id is returned, block with message
      if ((account as any).invalidMentor === 1) {
        setModalTitle('INVALID MENTOR ID');
        setModalMessage('THE MENTOR ID DOES NOT MATCH OUR RECORDS FOR THIS EMAIL.');
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
      Alert.alert('ERROR', error instanceof Error ? error.message.toUpperCase() : 'LOGIN FAILED. PLEASE TRY AGAIN.');
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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Back Button */}
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: `${theme.colors.accent}1A` }]} onPress={handleBackToStart}>
          <ArrowLeft size={24} color={theme.colors.textPrimary} />
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
              <Text style={[styles.title, { color: theme.colors.textPrimary }]}>LOGIN</Text>
            </View>

            <View style={styles.form}>
              <TextInput
                style={[styles.input, { backgroundColor: `${theme.colors.accent}26`, borderColor: `${theme.colors.accent}4D`, color: theme.colors.textPrimary, shadowColor: theme.colors.accent }]}
                placeholder="EMAIL"
                placeholderTextColor={theme.colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <TouchableOpacity
                style={[styles.proceedButton, { backgroundColor: `${theme.colors.accent}4D`, borderColor: `${theme.colors.accent}80`, shadowColor: theme.colors.accent }, (isLoading || isPaymentProcessing) && styles.proceedButtonDisabled]}
                onPress={handleProceed}
                disabled={isLoading || isPaymentProcessing}
              >
                {isLoading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator color={theme.colors.textPrimary} size="small" />
                    <Text style={[styles.proceedButtonText, { color: theme.colors.textPrimary }]}>CHECKING...</Text>
                  </View>
                ) : isPaymentProcessing ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator color={theme.colors.textPrimary} size="small" />
                    <Text style={[styles.proceedButtonText, { color: theme.colors.textPrimary }]}>PROCESSING PAYMENT...</Text>
                  </View>
                ) : (
                  <Text style={[styles.proceedButtonText, { color: theme.colors.textPrimary }]}>PROCEED</Text>
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
              style={[styles.modalButton, { backgroundColor: `${theme.colors.accent}40`, borderColor: `${theme.colors.accent}66`, shadowColor: theme.colors.accent }]}
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
      {paymentVisible && (
        <View style={[styles.modalOverlay, { backgroundColor: theme.isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.4)' }]}>
          <View style={[styles.modalCard, { width: '100%', maxWidth: 800, height: '80%', backgroundColor: Platform.OS === 'ios' ? 'transparent' : theme.colors.backgroundSecondary }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>Pay for App</Text>
              <TouchableOpacity 
                onPress={() => setPaymentVisible(false)}
                style={[styles.closeButton, { backgroundColor: `${theme.colors.accent}33`, borderColor: `${theme.colors.accent}66`, shadowColor: theme.colors.accent }]}
                activeOpacity={0.8}
              >
                <X color={theme.colors.textPrimary} size={24} />
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
  proceedButton: {
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
  proceedButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
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
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
    paddingVertical: 16,
    borderRadius: 20,
    marginTop: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  modalButtonText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  closeButton: {
    padding: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
});
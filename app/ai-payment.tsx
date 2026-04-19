import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Scan } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/providers/theme-provider';

const PAYSTACK_BASE = 'https://paystack.shop/pay/za670n3c51';

export default function AIPaymentScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = (params.email || '').trim().toLowerCase();
  const paymentUrl = email
    ? `${PAYSTACK_BASE}?email=${encodeURIComponent(email)}`
    : PAYSTACK_BASE;

  const handleBack = () => {
    router.back();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
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
            <BlurView intensity={60} tint={theme.isDark ? 'light' : 'dark'} style={StyleSheet.absoluteFill} />
          )}
          <ArrowLeft color={theme.colors.textPrimary} size={22} strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>AI SCANNER</Text>
          <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
            Unlock with one-time payment
          </Text>
        </View>
      </View>

      {/* Payment details card */}
      <View style={[styles.detailsCard, { borderColor: theme.colors.borderColor }]}>
        <LinearGradient
          colors={theme.colors.cardGradient as [string, string, ...string[]]}
          style={styles.detailsGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <View style={styles.detailsContent}>
          <Scan color={theme.colors.accent} size={40} strokeWidth={2} />
          <Text style={[styles.detailsTitle, { color: theme.colors.textPrimary }]}>
            Unlock AI Scanner
          </Text>
          <Text style={[styles.detailsText, { color: theme.colors.textSecondary }]}>
            Get AI-powered chart analysis with BUY/SELL/NEUTRAL signals, entry price, stop loss, and take profit levels.
          </Text>
        </View>
      </View>

      {/* WebView - Paystack payment */}
      <View style={styles.webViewContainer}>
        {Platform.OS === 'web' ? (
          <iframe
            src={paymentUrl}
            style={styles.webView}
            title="AI Scanner Payment"
            allow="payment *; clipboard-write;"
          />
        ) : (
          <WebView
            source={{ uri: paymentUrl }}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={theme.colors.accent} />
                <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
                  Loading payment...
                </Text>
              </View>
            )}
            style={styles.webView}
          />
        )}
      </View>

      <Text style={[styles.footerNote, { color: theme.colors.textMuted }]}>
        After payment, tap back to return. Your access will unlock automatically once payment is confirmed.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.3,
  },
  backButton: {
    marginRight: 16,
    padding: 10,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  detailsCard: {
    margin: 20,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: 'hidden',
    position: 'relative',
  },
  detailsGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.6,
  },
  detailsContent: {
    padding: 20,
    alignItems: 'center',
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 12,
    letterSpacing: 0.5,
  },
  detailsText: {
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
  webViewContainer: {
    flex: 1,
    marginHorizontal: 20,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
    minHeight: 400,
  },
  webView: {
    flex: 1,
    width: '100%',
    height: '100%',
    minHeight: 400,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  footerNote: {
    fontSize: 11,
    textAlign: 'center',
    padding: 16,
    lineHeight: 18,
  },
});

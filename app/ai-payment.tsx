import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, CreditCard, Scan } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/providers/theme-provider';

const WHOP_CHECKOUT_URL = 'https://whop.com/checkout/plan_CN9y3j02PlLmN';
const PAYSTACK_CHECKOUT_URL = 'https://paystack.shop/pay/204p1hwqij';

export default function AIPaymentScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = (params.email || '').trim().toLowerCase();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const handleBack = () => {
    router.back();
  };

  const buildPaystackUrl = () => {
    if (!email) return PAYSTACK_CHECKOUT_URL;
    return `${PAYSTACK_CHECKOUT_URL}?email=${encodeURIComponent(email)}`;
  };

  const openWhopCheckout = async () => {
    setCheckoutError(null);
    try {
      await Linking.openURL(WHOP_CHECKOUT_URL);
    } catch {
      setCheckoutError('Could not open checkout. Please try again.');
    }
  };

  const openPaystackCheckout = async () => {
    setCheckoutError(null);
    try {
      await Linking.openURL(buildPaystackUrl());
    } catch {
      setCheckoutError('Could not open checkout. Please try again.');
    }
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

      <View style={[styles.paymentSection, { borderColor: theme.colors.borderColor }]}>
        <Text style={[styles.paymentSectionTitle, { color: theme.colors.textPrimary }]}>
          Choose payment method
        </Text>

        <TouchableOpacity
          onPress={openWhopCheckout}
          activeOpacity={0.8}
          style={[
            styles.paymentOption,
            {
              borderColor: `${theme.colors.accent}88`,
              backgroundColor: `${theme.colors.accent}22`,
            },
          ]}
        >
          <View style={[styles.paymentIconWrap, { backgroundColor: `${theme.colors.accent}33` }]}>
            <CreditCard color={theme.colors.accent} size={22} strokeWidth={2.5} />
          </View>
          <View style={styles.paymentOptionText}>
            <Text style={[styles.paymentOptionTitle, { color: theme.colors.textPrimary }]}>
              Card · Apple Pay · Crypto · International
            </Text>
            <Text style={[styles.paymentOptionSubtitle, { color: theme.colors.textMuted }]}>
              Pay with Whop checkout
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={openPaystackCheckout}
          activeOpacity={0.8}
          style={[
            styles.paymentOption,
            {
              borderColor: theme.colors.borderColor,
              backgroundColor: `${theme.colors.textPrimary}08`,
            },
          ]}
        >
          <View style={[styles.paymentIconWrap, { backgroundColor: `${theme.colors.textPrimary}12` }]}>
            <CreditCard color={theme.colors.textSecondary} size={22} strokeWidth={2.5} />
          </View>
          <View style={styles.paymentOptionText}>
            <Text style={[styles.paymentOptionTitle, { color: theme.colors.textPrimary }]}>
              Card payment
            </Text>
            <Text style={[styles.paymentOptionSubtitle, { color: theme.colors.textMuted }]}>
              Pay with Paystack (South Africa)
            </Text>
          </View>
        </TouchableOpacity>

        {checkoutError ? (
          <Text style={[styles.errorText, { color: theme.colors.textMuted }]}>{checkoutError}</Text>
        ) : null}
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
  paymentSection: {
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  paymentSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  paymentIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentOptionText: {
    flex: 1,
    gap: 4,
  },
  paymentOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  paymentOptionSubtitle: {
    fontSize: 12,
    lineHeight: 18,
  },
  footerNote: {
    fontSize: 11,
    textAlign: 'center',
    padding: 16,
    lineHeight: 18,
  },
  errorText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});

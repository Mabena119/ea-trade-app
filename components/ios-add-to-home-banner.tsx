import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlusSquare, Share, X } from 'lucide-react-native';
import { shouldShowIOSAddToHomePrompt } from '@/utils/pwa-detection';

const DISMISS_KEY = 'iosAddToHomeBannerDismissed';

type IOSAddToHomeBannerProps = {
  accentColor?: string;
};

export function IOSAddToHomeBanner({ accentColor = '#8B5CF6' }: IOSAddToHomeBannerProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(140)).current;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!shouldShowIOSAddToHomePrompt()) {
      return;
    }

    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') {
        return;
      }
    } catch {
      // ignore storage errors
    }

    setVisible(true);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: Platform.OS !== 'web',
      tension: 70,
      friction: 12,
    }).start();
  }, [slideAnim]);

  const dismiss = () => {
    Animated.timing(slideAnim, {
      toValue: 140,
      duration: 220,
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => {
      setVisible(false);
      try {
        sessionStorage.setItem(DISMISS_KEY, '1');
      } catch {
        // ignore storage errors
      }
    });
  };

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, 12),
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={[styles.card, { borderColor: `${accentColor}66` }]}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Install EA Trade</Text>
          <TouchableOpacity
            onPress={dismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss install instructions"
          >
            <X color="rgba(255,255,255,0.65)" size={18} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        <Text style={styles.subtitle}>
          Add this app to your Home Screen for the best experience and background alerts.
        </Text>

        <View style={styles.stepRow}>
          <View style={[styles.stepIcon, { backgroundColor: `${accentColor}22` }]}>
            <Share color={accentColor} size={16} strokeWidth={2.5} />
          </View>
          <Text style={styles.stepText}>
            Tap <Text style={styles.stepEmphasis}>Share</Text> in Safari&apos;s toolbar
          </Text>
        </View>

        <View style={styles.stepRow}>
          <View style={[styles.stepIcon, { backgroundColor: `${accentColor}22` }]}>
            <PlusSquare color={accentColor} size={16} strokeWidth={2.5} />
          </View>
          <Text style={styles.stepText}>
            Choose <Text style={styles.stepEmphasis}>Add to Home Screen</Text>
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    zIndex: 20,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: 'rgba(12, 12, 24, 0.96)',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  stepIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    lineHeight: 18,
  },
  stepEmphasis: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

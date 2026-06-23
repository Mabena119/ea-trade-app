import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Download, X } from 'lucide-react-native';

const AUTO_DISMISS_MS = 15000;

type AdminUpdateToastProps = {
  visible: boolean;
  onHide: () => void;
};

export function AdminUpdateToast({ visible, onHide }: AdminUpdateToastProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-24)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const dismiss = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    progressAnimRef.current?.stop();

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -24,
        duration: 220,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start(() => onHide());
  };

  useEffect(() => {
    if (!visible) return;

    slideAnim.setValue(-24);
    opacityAnim.setValue(0);
    progressAnim.setValue(1);

    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: Platform.OS !== 'web',
        tension: 72,
        friction: 11,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 240,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();

    progressAnimRef.current = Animated.timing(progressAnim, {
      toValue: 0,
      duration: AUTO_DISMISS_MS,
      useNativeDriver: false,
    });
    progressAnimRef.current.start();

    hideTimerRef.current = setTimeout(dismiss, AUTO_DISMISS_MS);

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      progressAnimRef.current?.stop();
    };
  }, [visible, opacityAnim, progressAnim, slideAnim]);

  if (!visible) {
    return null;
  }

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.container,
        {
          top: Math.max(insets.top, Platform.OS === 'ios' ? 50 : 30),
          opacity: opacityAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <Pressable style={styles.card} onPress={dismiss}>
        <View style={styles.accentBar} />

        <View style={styles.contentRow}>
          <View style={styles.iconWrap}>
            <Download color="#c4b5fd" size={20} strokeWidth={2.25} />
          </View>

          <View style={styles.textWrap}>
            <Text style={styles.title}>Update your MT5 .ex5 file</Text>
            <Text style={styles.subtitle}>
              Signals won&apos;t work until you replace the EA on MT5 and update the app.
            </Text>
          </View>

          <TouchableOpacity
            onPress={dismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss update notice"
            style={styles.closeButton}
          >
            <X color="#d4d4d8" size={14} strokeWidth={3} />
          </TouchableOpacity>
        </View>

        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100000,
    elevation: 100000,
  },
  card: {
    borderRadius: 14,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#3f3f46',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#8b5cf6',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingTop: 16,
    paddingBottom: 16,
    paddingRight: 16,
    paddingLeft: 20,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
    paddingTop: 1,
  },
  title: {
    color: '#f4f4f5',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.1,
    lineHeight: 19,
    marginBottom: 4,
  },
  subtitle: {
    color: '#a1a1aa',
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '500',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(63, 63, 70, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    marginTop: -2,
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(63, 63, 70, 0.5)',
  },
  progressFill: {
    height: 3,
    backgroundColor: '#8b5cf6',
  },
});

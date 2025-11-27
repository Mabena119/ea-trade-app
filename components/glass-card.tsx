import React from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import colors from '@/constants/colors';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
  borderRadius?: number;
}

export function GlassCard({ 
  children, 
  style, 
  intensity = 80,
  borderRadius = 20 
}: GlassCardProps) {
  if (Platform.OS === 'ios') {
    return (
      <View style={[styles.container, { borderRadius }, style]}>
        <BlurView
          intensity={intensity}
          tint="dark"
          style={[StyleSheet.absoluteFill, { borderRadius }]}
        />
        <LinearGradient
          colors={[
            'rgba(255, 255, 255, 0.1)',
            'rgba(255, 255, 255, 0.05)',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
        />
        <View style={styles.content}>
          {children}
        </View>
      </View>
    );
  }

  // Android fallback with solid glass effect
  return (
    <View style={[styles.container, styles.androidGlass, { borderRadius }, style]}>
      <LinearGradient
        colors={[
          'rgba(255, 255, 255, 0.08)',
          'rgba(255, 255, 255, 0.03)',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
      />
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.glass.border,
    shadowColor: colors.glass.shadow,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  androidGlass: {
    backgroundColor: colors.glass.background,
  },
  content: {
    flex: 1,
  },
});


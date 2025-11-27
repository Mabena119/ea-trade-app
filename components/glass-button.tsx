import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle, Platform, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import colors from '@/constants/colors';

interface GlassButtonProps {
  title: string;
  onPress: () => void;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
}

export function GlassButton({ 
  title, 
  onPress, 
  icon,
  variant = 'primary',
  style,
  textStyle,
  disabled = false
}: GlassButtonProps) {
  const getColors = () => {
    switch (variant) {
      case 'primary':
        return {
          gradient: ['rgba(37, 211, 102, 0.3)', 'rgba(37, 211, 102, 0.1)'],
          border: colors.primary,
          text: colors.primary,
        };
      case 'danger':
        return {
          gradient: ['rgba(220, 38, 38, 0.3)', 'rgba(220, 38, 38, 0.1)'],
          border: colors.error,
          text: colors.error,
        };
      default:
        return {
          gradient: ['rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.05)'],
          border: colors.glass.border,
          text: colors.text,
        };
    }
  };

  const buttonColors = getColors();

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        { 
          borderColor: buttonColors.border,
          opacity: disabled ? 0.5 : 1,
        },
        style
      ]}
      activeOpacity={0.7}
    >
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={60}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <LinearGradient
        colors={buttonColors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>
        {icon && <View style={styles.icon}>{icon}</View>}
        <Text style={[styles.text, { color: buttonColors.text }, textStyle]}>
          {title}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.glass.shadow,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  icon: {
    marginRight: 8,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});


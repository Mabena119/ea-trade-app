import React, { useCallback, useMemo, useState } from 'react';
import {
  ImageBackground,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { EA } from '@/providers/app-provider';
import { EA_BRAND_HERO_LOCAL, resolveEABrandImageSource } from '@/utils/ea-brand-image';

interface EABrandBackdropProps {
  children: React.ReactNode;
  primaryEA: EA | null;
  accentColor: string;
  glowColor: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Full-screen shell: active EA owner logo (or bundled hero) as a soft “splashed” backdrop
 * behind dark + accent gradients so UI stays readable.
 */
export function EABrandBackdrop({
  children,
  primaryEA,
  accentColor,
  glowColor,
  style,
}: EABrandBackdropProps) {
  const rawLogo = primaryEA?.userData?.owner?.logo;
  const [forceFallback, setForceFallback] = useState(false);

  const source = useMemo<ImageSourcePropType>(() => {
    if (forceFallback) return EA_BRAND_HERO_LOCAL;
    return resolveEABrandImageSource(rawLogo);
  }, [rawLogo, forceFallback]);

  const onError = useCallback(() => {
    setForceFallback(true);
  }, []);

  return (
    <ImageBackground
      source={source}
      style={[styles.root, style]}
      imageStyle={styles.image}
      resizeMode="cover"
      onError={onError}
    >
      <LinearGradient
        colors={['rgba(0, 0, 0, 0.42)', 'rgba(12, 0, 0, 0.78)', 'rgba(0, 0, 0, 0.92)']}
        locations={[0, 0.52, 1]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      <LinearGradient
        colors={[`${accentColor}38`, 'transparent', `${glowColor}30`]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent', 'transparent', 'rgba(0,0,0,0.65)']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        pointerEvents="none"
      />
      <View style={styles.content} pointerEvents="box-none">
        {children}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  image: {
    transform: [{ scale: 1.12 }],
    opacity: 0.88,
  },
  content: {
    flex: 1,
  },
});

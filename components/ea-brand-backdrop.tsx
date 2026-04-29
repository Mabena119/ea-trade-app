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
      resizeMode="contain"
      onError={onError}
    >
      {/* Vertical dark vignette — lighter top so the logo image shows strongly */}
      <LinearGradient
        colors={['rgba(0, 0, 0, 0.22)', 'rgba(0, 0, 0, 0.55)', 'rgba(0, 0, 0, 0.80)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      {/* Diagonal accent tint (white for glass theme → barely visible; coloured for other themes) */}
      <LinearGradient
        colors={[`${accentColor}22`, 'transparent', `${glowColor}18`]}
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
    opacity: 0.92,
  },
  content: {
    flex: 1,
  },
});

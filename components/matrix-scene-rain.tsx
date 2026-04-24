import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { isMatrixStyleTheme, type ThemeName, useTheme } from '@/providers/theme-provider';
import { MatrixBackground, type MatrixRainTint } from '@/components/matrix-background';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Opaque black + matrix rain, then your UI on top (same screen subtree as the navigator scene).
 * Avoids transparent tab scenes (iOS system grey) while still drawing rain on black behind cards.
 */
export function MatrixSceneRain({ children, style }: Props) {
  const { themeName } = useTheme();
  if (!isMatrixStyleTheme(themeName as ThemeName)) {
    return <>{children}</>;
  }
  const rainTint: MatrixRainTint = themeName === 'matrixRed' ? 'red' : 'green';
  return (
    <View style={[styles.fill, style]}>
      <View style={styles.rainLayer} pointerEvents="none">
        <MatrixBackground rainTint={rainTint} />
      </View>
      <View style={styles.uiLayer} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: '#000000',
    position: 'relative',
  },
  rainLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  uiLayer: {
    flex: 1,
    zIndex: 1,
  },
});

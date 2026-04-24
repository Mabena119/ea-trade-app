import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { matrixVoid } from '@/constants/matrix-theme';
import { MATRIX_RAIN_CANVAS_HTML } from './matrix-canvas-document';
import { MatrixRainText } from './matrix-rain-text';

/**
 * Full-screen “digital rain” for the matrix app theme.
 * - **iOS / Android:** canvas + requestAnimationFrame in a WebView (sharp, high FPS, true trail).
 * - **Web / PWA:** text-column fallback (no extra native WebView stack).
 * Root `View` in `_layout` should stay `#000` under this layer.
 */
export function MatrixBackground() {
  if (Platform.OS === 'web') {
    return <MatrixRainText />;
  }

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <WebView
        source={{ html: MATRIX_RAIN_CANVAS_HTML, baseUrl: 'https://localhost' }}
        style={[StyleSheet.absoluteFill, { backgroundColor: matrixVoid }]}
        scrollEnabled={false}
        bounces={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        overScrollMode="never"
        androidLayerType="hardware"
        originWhitelist={['*']}
        pointerEvents="none"
        setSupportMultipleWindows={false}
        allowsFullscreenVideo={false}
      />
    </View>
  );
}

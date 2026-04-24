import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

const CHAR_ROWS = 28;
const CHAR_LINE_HEIGHT = 15;
const SEGMENT_EXTRA_PAD = 64;

type ColumnProps = {
  left: number;
  width: number;
  screenHeight: number;
  speedMs: number;
  charStream: string[];
};

function MatrixColumn({ left, width, screenHeight, speedMs, charStream }: ColumnProps) {
  const shift = useRef(new Animated.Value(0)).current;
  const segmentHeight = charStream.length * CHAR_LINE_HEIGHT;

  useEffect(() => {
    shift.setValue(0);
    const loop = Animated.loop(
      Animated.timing(shift, {
        toValue: 1,
        duration: speedMs,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [shift, speedMs]);

  const translateY = shift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -segmentHeight],
  });

  return (
    <View style={[styles.column, { left, width, height: screenHeight }]} pointerEvents="none">
      <Animated.View style={{ transform: [{ translateY }] }}>
        {charStream.map((c, i) => (
          <Text
            key={`a-${i}`}
            style={[
              styles.digit,
              { opacity: 0.12 + (i / charStream.length) * 0.78 },
            ]}
            maxFontSizeMultiplier={1.2}
          >
            {c}
          </Text>
        ))}
        {charStream.map((c, i) => (
          <Text
            key={`b-${i}`}
            style={[
              styles.digit,
              { opacity: 0.12 + (i / charStream.length) * 0.78 },
            ]}
            maxFontSizeMultiplier={1.2}
          >
            {c}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

/**
 * Black / neon-green “digital rain” of 0s and 1s. Mount in (tabs)/_layout behind tab scenes;
 * tab screens use transparent background when the matrix theme is active.
 */
export function MatrixBackground() {
  const { width, height } = useWindowDimensions();
  const colCount = Math.max(8, Math.min(20, Math.floor(width / 20)));
  const colW = width / colCount;

  const columns = useMemo(() => {
    return Array.from({ length: colCount }, (_, i) => {
      const stream = Array.from({ length: CHAR_ROWS }, () => (Math.random() < 0.5 ? '1' : '0'));
      const speedMs = 9000 + (i % 5) * 1200 + Math.floor(i / 3) * 400;
      return { stream, speedMs, key: i };
    });
  }, [colCount]);

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.root]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {columns.map((c, i) => (
        <MatrixColumn
          key={c.key}
          left={i * colW}
          width={colW}
          screenHeight={height + SEGMENT_EXTRA_PAD}
          speedMs={c.speedMs}
          charStream={c.stream}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    zIndex: 0,
    backgroundColor: '#000000',
  },
  column: {
    position: 'absolute',
    top: 0,
    overflow: 'hidden',
  },
  digit: {
    color: '#00FF66',
    fontSize: 12,
    lineHeight: CHAR_LINE_HEIGHT,
    textAlign: 'center',
    fontWeight: '600',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    textShadowColor: 'rgba(0, 255, 102, 0.35)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
});

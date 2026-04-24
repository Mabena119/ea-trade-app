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

/** Halfwidth katakana, digits, and symbols for classic “code rain” look */
const GLYPHS =
  'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789:;<=>?';

const pickChar = (seed: number) => GLYPHS[Math.abs(seed) % GLYPHS.length] ?? '0';

const CHAR_LINE_HEIGHT = 12;
const SEGMENT_EXTRA_PAD = 80;

type ColumnConfig = {
  key: number;
  stream: string[];
  speedMs: number;
  colOpacity: number;
};

function getGlyphStyle(i: number, len: number) {
  const t = len <= 1 ? 1 : i / (len - 1);
  // Tail (top) dim, head (bottom) full brightness — steeper than linear
  const fade = 0.06 + 0.9 * t ** 0.55;
  // “Leading light” for the last few cells
  let color = '#00CC44';
  if (t > 0.9) {
    color = '#E8FFF0';
  } else if (t > 0.75) {
    color = '#66FF99';
  } else if (t > 0.4) {
    color = '#00FF66';
  } else {
    color = '#008833';
  }
  const opacity = t < 0.2 ? 0.08 + fade * 0.4 : 0.15 + fade * 0.8;
  const isHead = t > 0.86;
  return {
    color,
    opacity: Math.min(0.95, Math.max(0.06, opacity)),
    textShadowColor: isHead
      ? 'rgba(200, 255, 220, 0.95)'
      : 'rgba(0, 255, 120, 0.65)',
    textShadowRadius: isHead ? 7 : 4,
  };
}

type MatrixColumnProps = {
  left: number;
  width: number;
  screenHeight: number;
  speedMs: number;
  charStream: string[];
  colOpacity: number;
};

function MatrixColumn({
  left,
  width,
  screenHeight,
  speedMs,
  charStream,
  colOpacity,
}: MatrixColumnProps) {
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

  const len = charStream.length;

  const renderBlock = (keyPrefix: string) =>
    charStream.map((c, i) => {
      const g = getGlyphStyle(i, len);
      return (
        <Text
          key={`${keyPrefix}-${i}`}
          maxFontSizeMultiplier={1.1}
          style={[
            styles.digit,
            {
              color: g.color,
              opacity: g.opacity * colOpacity,
              textShadowColor: g.textShadowColor,
              textShadowRadius: g.textShadowRadius,
            },
          ]}
        >
          {c}
        </Text>
      );
    });

  return (
    <View style={[styles.column, { left, width, height: screenHeight }]} pointerEvents="none">
      <Animated.View style={{ transform: [{ translateY }] }}>
        {renderBlock('a')}
        {renderBlock('b')}
      </Animated.View>
    </View>
  );
}

/**
 * High-density “digital rain” (matrix-style), placed behind app content. Screens use a light scrim
 * when the matrix theme is active.
 */
export function MatrixBackground() {
  const { width, height } = useWindowDimensions();
  // Tight column spacing (reference: dense columns, little black between)
  const colCount = Math.max(32, Math.min(56, Math.floor(width / 5.2)));

  const columns = useMemo((): ColumnConfig[] => {
    return Array.from({ length: colCount }, (_, i) => {
      const streamLen = 24 + (i * 7) % 19;
      const stream = Array.from({ length: streamLen }, (_, j) => pickChar(i * 97 + j * 13 + (j << 2)));
      const base = 5500 + (i % 9) * 800;
      const speedMs = base + (i * 17) % 2200;
      // Slight depth variation (keeps most columns at full strength)
      const colOpacity = 0.75 + (i % 3) * 0.08 + ((i * 2) % 2) * 0.04;
      return { stream, speedMs, key: i, colOpacity: Math.min(1, colOpacity) };
    });
  }, [colCount]);

  const colW = width / colCount;

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.root]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {columns.map((c) => (
        <MatrixColumn
          key={c.key}
          left={c.key * colW}
          width={colW}
          screenHeight={height + SEGMENT_EXTRA_PAD}
          speedMs={c.speedMs}
          charStream={c.stream}
          colOpacity={c.colOpacity}
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
    fontSize: 11,
    lineHeight: CHAR_LINE_HEIGHT,
    textAlign: 'center',
    fontWeight: '600',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    textShadowOffset: { width: 0, height: 0 },
  },
});

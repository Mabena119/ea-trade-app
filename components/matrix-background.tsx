import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

/** Taller stream = longer scroll segment = smoother infinite loop. */
const CHAR_ROWS = 42;
const CHAR_LINE_HEIGHT = 14;
const SEGMENT_EXTRA_PAD = 80;

type ColumnProps = {
  left: number;
  width: number;
  screenHeight: number;
  speedMs: number;
  charStream: string[];
  delayMs: number;
};

function MatrixColumn({ left, width, screenHeight, speedMs, charStream, delayMs }: ColumnProps) {
  const shift = useRef(new Animated.Value(0)).current;
  const segmentHeight = charStream.length * CHAR_LINE_HEIGHT;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  /** Bits flip over time so the rain feels alive (scroll animation stays smooth). */
  const [glyphs, setGlyphs] = useState(() => charStream);

  useEffect(() => {
    setGlyphs(charStream);
  }, [charStream]);

  useEffect(() => {
    const period = 700 + (delayMs % 5) * 90;
    const t = setInterval(() => {
      setGlyphs((prev) =>
        prev.map((c) => (Math.random() < 0.16 ? (c === '0' ? '1' : '0') : c))
      );
    }, period);
    return () => clearInterval(t);
  }, [delayMs, charStream.length]);

  useEffect(() => {
    shift.setValue(0);
    const timer = setTimeout(() => {
      const loop = Animated.loop(
        Animated.timing(shift, {
          toValue: 1,
          duration: speedMs,
          easing: Easing.linear,
          useNativeDriver: true,
          isInteraction: false,
        })
      );
      loopRef.current = loop;
      loop.start();
    }, delayMs);
    return () => {
      clearTimeout(timer);
      if (loopRef.current) {
        try {
          loopRef.current.stop();
        } catch {
          /* noop */
        }
        loopRef.current = null;
      }
    };
  }, [shift, speedMs, delayMs]);

  const translateY = shift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -segmentHeight],
  });

  return (
    <View style={[styles.column, { left, width, height: screenHeight }]} pointerEvents="none">
      <Animated.View style={{ transform: [{ translateY }] }}>
        {glyphs.map((c, i) => {
          const t = i / Math.max(1, glyphs.length - 1);
          return (
            <Text
              key={`a-${i}`}
              style={[
                styles.digit,
                { opacity: 0.2 + t * 0.75 },
              ]}
              maxFontSizeMultiplier={1.2}
            >
              {c}
            </Text>
          );
        })}
        {glyphs.map((c, i) => {
          const t = i / Math.max(1, glyphs.length - 1);
          return (
            <Text
              key={`b-${i}`}
              style={[
                styles.digit,
                { opacity: 0.2 + t * 0.75 },
              ]}
              maxFontSizeMultiplier={1.2}
            >
              {c}
            </Text>
          );
        })}
      </Animated.View>
    </View>
  );
}

export type MatrixBackgroundVariant = 'overlay' | 'sheet';

type MatrixBackgroundProps = {
  /**
   * `overlay` — transparent root, only green glyphs; draw on top of opaque black UI (pointerEvents none).
   * `sheet` — includes black fill (legacy / standalone).
   */
  variant?: MatrixBackgroundVariant;
};

/**
 * Neon-green “digital rain” (scrolling 0/1). Used inside `MatrixSceneRain`: opaque black parent,
 * then this layer (transparent root, glyphs only), then your UI on top.
 */
export function MatrixBackground({ variant = 'overlay' }: MatrixBackgroundProps) {
  const { width, height } = useWindowDimensions();
  const colCount = Math.max(18, Math.min(52, Math.floor(width / 8)));
  const colW = width / colCount;

  const columns = useMemo(() => {
    return Array.from({ length: colCount }, (_, i) => {
      const stream = Array.from({ length: CHAR_ROWS }, () => (Math.random() < 0.5 ? '1' : '0'));
      // Faster, varied column speeds = continuous “always moving” feel
      const speedMs = 2800 + (i % 15) * 160 + (i * 11) % 1200;
      const delayMs = (i * 19) % 420 + (i % 3) * 40;
      return { stream, speedMs, delayMs, key: i };
    });
  }, [colCount]);

  const rootStyle = variant === 'sheet' ? styles.rootSheet : styles.rootOverlay;

  return (
    <View
      style={[StyleSheet.absoluteFill, rootStyle]}
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
          delayMs={c.delayMs}
          charStream={c.stream}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rootOverlay: {
    zIndex: 0,
    backgroundColor: 'transparent',
  },
  rootSheet: {
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

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

/** Minimum lines per stream tile; real count scales with window height to fill the full screen. */
const MIN_CHAR_ROWS = 24;
const CHAR_LINE_HEIGHT = 15;
const SEGMENT_EXTRA_PAD = 64;
/** Pixels of vertical travel per second so motion stays “continuous” on tall phones. */
const SCROLL_PX_PER_SEC = 44;

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
    // Rare bit flips — heavy updates can stutter the native scroll loop
    const period = 4500 + (delayMs % 5) * 200;
    const t = setInterval(() => {
      setGlyphs((prev) =>
        prev.map((c) => (Math.random() < 0.06 ? (c === '0' ? '1' : '0') : c))
      );
    }, period);
    return () => clearInterval(t);
  }, [delayMs, charStream.length]);

  useEffect(() => {
    let cancelled = false;
    shift.setValue(0);
    // Chain timings on completion (more reliable than Animated.loop on some devices / RN versions).
    const runSegment = () => {
      if (cancelled) return;
      shift.setValue(0);
      const timing = Animated.timing(shift, {
        toValue: 1,
        duration: speedMs,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      });
      loopRef.current = timing;
      timing.start(({ finished }) => {
        if (cancelled) return;
        if (finished) {
          runSegment();
        } else {
          // Interrupted elsewhere — resume next frame so motion does not stay stopped
          requestAnimationFrame(() => {
            if (!cancelled) runSegment();
          });
        }
      });
    };
    const timer = setTimeout(runSegment, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      try {
        shift.stopAnimation();
      } catch {
        /* noop */
      }
      if (loopRef.current) {
        try {
          loopRef.current.stop?.();
        } catch {
          /* noop */
        }
        loopRef.current = null;
      }
    };
  }, [shift, speedMs, delayMs, segmentHeight]);

  const translateY = shift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -segmentHeight],
  });

  return (
    <View style={[styles.column, { left, width, height: screenHeight }]} pointerEvents="none">
      <Animated.View style={{ transform: [{ translateY }] }}>
        {glyphs.map((c, i) => (
          <Text
            key={`a-${i}`}
            style={[
              styles.digit,
              { opacity: 0.12 + (i / glyphs.length) * 0.78 },
            ]}
            maxFontSizeMultiplier={1.2}
          >
            {c}
          </Text>
        ))}
        {glyphs.map((c, i) => (
          <Text
            key={`b-${i}`}
            style={[
              styles.digit,
              { opacity: 0.12 + (i / glyphs.length) * 0.78 },
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
  const colCount = Math.max(10, Math.min(28, Math.floor(width / 14)));
  const colW = width / colCount;

  /** One segment must be at least full viewport so rain covers the entire screen; two copies loop seamlessly. */
  const rowsPerSegment = useMemo(
    () => Math.max(MIN_CHAR_ROWS, Math.ceil((height + SEGMENT_EXTRA_PAD) / CHAR_LINE_HEIGHT) + 1),
    [height]
  );
  const segmentPx = rowsPerSegment * CHAR_LINE_HEIGHT;
  const baseScrollMs = useMemo(
    () => Math.max(2200, Math.round((segmentPx / SCROLL_PX_PER_SEC) * 1000)),
    [segmentPx]
  );

  const columns = useMemo(() => {
    return Array.from({ length: colCount }, (_, i) => {
      const stream = Array.from({ length: rowsPerSegment }, () => (Math.random() < 0.5 ? '1' : '0'));
      // Same upward speed (px/s), slight per-column duration/spread so columns stay desynchronized
      const speedMs = Math.round(
        baseScrollMs * (0.9 + (i % 8) * 0.02 + (i * 7) / 2000)
      );
      const delayMs = (i * 37) % 800 + (i % 4) * 90;
      return { stream, speedMs, delayMs, key: i };
    });
  }, [colCount, rowsPerSegment, baseScrollMs]);

  const rootStyle = variant === 'sheet' ? styles.rootSheet : styles.rootOverlay;

  return (
    <View
      style={[StyleSheet.absoluteFill, rootStyle]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {columns.map((c) => {
        const left = c.key * colW;
        const columnWidth = c.key === colCount - 1 ? width - left : colW;
        return (
          <MatrixColumn
            key={c.key}
            left={left}
            width={columnWidth}
            screenHeight={height + SEGMENT_EXTRA_PAD}
            speedMs={c.speedMs}
            delayMs={c.delayMs}
            charStream={c.stream}
          />
        );
      })}
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

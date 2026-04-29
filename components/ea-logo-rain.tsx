import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useApp } from '@/providers/app-provider';
import { EA_BRAND_HERO_LOCAL, resolveEABrandImageSource } from '@/utils/ea-brand-image';

const MIN_LOGO_ROWS = 20;
const LOGO_ROW_HEIGHT = 20;
const SEGMENT_EXTRA_PAD = 64;
const SCROLL_PX_PER_SEC = 44;

type LogoColumnProps = {
  left: number;
  width: number;
  screenHeight: number;
  speedMs: number;
  delayMs: number;
  rowCount: number;
  source: ImageSourcePropType;
  onImageError?: () => void;
};

function LogoRainColumn({
  left,
  width,
  screenHeight,
  speedMs,
  delayMs,
  rowCount,
  source,
  onImageError,
}: LogoColumnProps) {
  const shift = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const segmentHeight = rowCount * LOGO_ROW_HEIGHT;
  const imgW = Math.min(width * 0.88, Math.round(LOGO_ROW_HEIGHT * 1.35));

  useEffect(() => {
    let cancelled = false;
    shift.setValue(0);
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

  const renderStrip = (stripKey: 'a' | 'b') =>
    Array.from({ length: rowCount }, (_, i) => (
      <View
        key={`${stripKey}-${i}`}
        style={[styles.logoRow, { height: LOGO_ROW_HEIGHT, width }]}
      >
        <Image
          source={source}
          style={[
            styles.logoImg,
            {
              width: imgW,
              height: LOGO_ROW_HEIGHT - 4,
              opacity: 0.14 + (i / Math.max(1, rowCount - 1)) * 0.72,
            },
          ]}
          resizeMode="contain"
          onError={onImageError && i === 0 && stripKey === 'a' ? onImageError : undefined}
        />
      </View>
    ));

  return (
    <View style={[styles.column, { left, width, height: screenHeight }]} pointerEvents="none">
      <Animated.View style={{ transform: [{ translateY }] }}>
        {renderStrip('a')}
        {renderStrip('b')}
      </Animated.View>
    </View>
  );
}

/**
 * Falling columns of the active EA owner logo (or bundled hero), same motion recipe as matrix digit rain.
 */
export function EALogoRain() {
  const { width, height } = useWindowDimensions();
  const { eas } = useApp();
  const primaryEA = Array.isArray(eas) && eas.length > 0 ? eas[0] : null;
  const rawLogo = primaryEA?.userData?.owner?.logo;
  const [forceFallback, setForceFallback] = useState(false);
  const failedOnceRef = useRef(false);

  const source = useMemo<ImageSourcePropType>(() => {
    if (forceFallback) return EA_BRAND_HERO_LOCAL;
    return resolveEABrandImageSource(rawLogo);
  }, [rawLogo, forceFallback]);

  useEffect(() => {
    failedOnceRef.current = false;
    setForceFallback(false);
  }, [rawLogo]);

  const onImageError = useCallback(() => {
    if (failedOnceRef.current) return;
    failedOnceRef.current = true;
    setForceFallback(true);
  }, []);

  const colCount = useMemo(
    () => Math.max(6, Math.min(18, Math.floor(width / 28))),
    [width]
  );
  const colW = width / colCount;

  const rowsPerSegment = useMemo(
    () =>
      Math.max(
        MIN_LOGO_ROWS,
        Math.ceil((height + SEGMENT_EXTRA_PAD) / LOGO_ROW_HEIGHT) + 1
      ),
    [height]
  );
  const segmentPx = rowsPerSegment * LOGO_ROW_HEIGHT;
  const baseScrollMs = useMemo(
    () => Math.max(2200, Math.round((segmentPx / SCROLL_PX_PER_SEC) * 1000)),
    [segmentPx]
  );

  const columns = useMemo(() => {
    return Array.from({ length: colCount }, (_, i) => {
      const speedMs = Math.round(
        baseScrollMs * (0.9 + (i % 8) * 0.02 + (i * 7) / 2000)
      );
      const delayMs = (i * 37) % 800 + (i % 4) * 90;
      return { speedMs, delayMs, key: i };
    });
  }, [colCount, baseScrollMs]);

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.root]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {columns.map((c) => {
        const left = c.key * colW;
        const columnWidth = c.key === colCount - 1 ? width - left : colW;
        return (
          <LogoRainColumn
            key={c.key}
            left={left}
            width={columnWidth}
            screenHeight={height + SEGMENT_EXTRA_PAD}
            speedMs={c.speedMs}
            delayMs={c.delayMs}
            rowCount={rowsPerSegment}
            source={source}
            onImageError={c.key === 0 ? onImageError : undefined}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    zIndex: 0,
    backgroundColor: 'transparent',
  },
  column: {
    position: 'absolute',
    top: 0,
    overflow: 'hidden',
  },
  logoRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImg: {
    alignSelf: 'center',
  },
});

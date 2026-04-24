import React, { memo, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { matrixVisual, matrixVoid } from '@/constants/matrix-theme';

const { rain } = matrixVisual;

const GLYPHS =
  'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789';
const pick = (s: number) => GLYPHS[Math.abs(s) % GLYPHS.length] ?? '0';

const LINE = 12;
const PAD = 64;

type Col = { key: number; stream: string[]; speed: number; depth: number };

function glyph(i: number, len: number) {
  const t = len <= 1 ? 1 : i / (len - 1);
  const f = 0.08 + 0.9 * t ** 0.5;
  const color = t > 0.9 ? rain.head : t > 0.72 ? rain.mid : t > 0.35 ? rain.body : rain.tail;
  const opacity = Math.min(0.92, Math.max(0.08, 0.12 + f * 0.78));
  const head = t > 0.85;
  return {
    color,
    opacity: opacity * 0.88,
    textShadowColor: head ? 'rgba(220, 255, 230, 0.85)' : rain.glow,
    textShadowRadius: head ? 6 : 3,
  };
}

const MatrixColumn = memo(function MatrixColumn({
  left,
  width,
  h,
  speedMs,
  stream,
  depth,
}: {
  left: number;
  width: number;
  h: number;
  speedMs: number;
  stream: string[];
  depth: number;
}) {
  const shift = useRef(new Animated.Value(0)).current;
  const seg = stream.length * LINE;

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
    return () => loop.stop();
  }, [shift, speedMs]);

  const ty = shift.interpolate({ inputRange: [0, 1], outputRange: [0, -seg] });
  const L = stream.length;

  const block = (p: 'a' | 'b') =>
    stream.map((c, i) => {
      const g = glyph(i, L);
      return (
        <Text
          key={`${p}-${i}`}
          maxFontSizeMultiplier={1.1}
          style={[
            s.digit,
            {
              color: g.color,
              opacity: g.opacity * depth,
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
    <View style={[s.col, { left, width, height: h }]} pointerEvents="none">
      <Animated.View style={{ transform: [{ translateY: ty }] }}>
        {block('a')}
        {block('b')}
      </Animated.View>
    </View>
  );
});

/** Web / PWA: canvas is awkward; use dense animated text columns (expo web). */
export function MatrixRainText() {
  const { width, height } = useWindowDimensions();
  const n = useMemo(
    () => Math.max(22, Math.min(44, Math.floor(width / 6))),
    [width]
  );
  const cols: Col[] = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({
        key: i,
        stream: Array.from({ length: 26 + (i * 5) % 16 }, (_, j) => pick(i * 99 + j * 17)),
        speed: 7000 + (i % 7) * 900 + (i * 3) % 500,
        depth: 0.72 + (i % 3) * 0.1,
      })),
    [n]
  );
  const colW = width / n;

  return (
    <View style={[StyleSheet.absoluteFill, s.root]}>
      {cols.map((c) => (
        <MatrixColumn
          key={c.key}
          left={c.key * colW}
          width={colW}
          h={height + PAD}
          speedMs={c.speed}
          stream={c.stream}
          depth={c.depth}
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  root: { zIndex: 0, backgroundColor: matrixVoid },
  col: { position: 'absolute', top: 0, overflow: 'hidden' },
  digit: {
    fontSize: 11,
    lineHeight: LINE,
    textAlign: 'center',
    fontWeight: '600',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    textShadowOffset: { width: 0, height: 0 },
  },
});

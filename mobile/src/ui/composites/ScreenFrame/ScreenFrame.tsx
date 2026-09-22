import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { ScreenGrid } from '@/ui/composites/ScreenGrid';
import { useUITheme, withAlpha } from '@/ui/theme';

// The instrument-cluster shell every screen sits inside, ported from
// cc-autobahn's `.cluster` / `.screen`: a TRUE BLACK canvas (AMOLED pixels stay
// off) + the pixel grid layered ON TOP so content reads as glowing UNDER the
// glass. Two motion systems, both built to read on black and stay AMOLED-cheap:
//
//   AMBIENT (continuous, 90s data-display feel): a scan bar rolls down the
//     glass forever, and a scatter of accent PIXELS flare as the bar crosses
//     their row — like an old cluster refreshing/reading telemetry. The flare
//     is driven purely off the bar position, so it's spatial, not random noise.
//
//   POWER-ON (one-shot, on every screen mount; navigator animation is `none`):
//     content ramps up, a bright scan-beam wipes down once, a quick energize
//     flash.

type ScreenFrameProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  showGrid?: boolean;
  gridSpacing?: number;
  /** Disable all motion (e.g. reduced-motion contexts). */
  animated?: boolean;
};

const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
const BEAM_H = 56;
const ROLL_H = 120;
const PIXEL_COUNT = 34;
const FLARE = 0.1; // how close (in screen fraction) the bar must be to light a pixel

type Pixel = { fx: number; fy: number; size: number; base: number };

function ScanPixel({ roll, pixel, color }: { roll: SharedValue<number>; pixel: Pixel; color: string }) {
  const style = useAnimatedStyle(() => {
    // Two scan bars, half a cycle apart — pixel flares from whichever is closer.
    const r2 = (roll.value + 0.5) % 1;
    const dist = Math.min(Math.abs(pixel.fy - roll.value), Math.abs(pixel.fy - r2));
    const lit = Math.max(0, 1 - dist / FLARE);
    return { opacity: pixel.base + lit * lit * 0.85 };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: `${pixel.fx * 100}%`,
          top: `${pixel.fy * 100}%`,
          width: pixel.size,
          height: pixel.size,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

export function ScreenFrame({
  children,
  style,
  showGrid = true,
  gridSpacing = 3,
  animated = true,
}: ScreenFrameProps) {
  const theme = useUITheme();
  const accent = theme.semantic.accent.warning;

  const [height, setHeight] = useState(0);

  // Power-on (one-shot).
  const boot = useSharedValue(animated ? 0 : 1);
  const beam = useSharedValue(0);
  const flash = useSharedValue(0);
  // Ambient scan bar (loop).
  const roll = useSharedValue(0);

  const pixels = useMemo<Pixel[]>(
    () =>
      Array.from({ length: PIXEL_COUNT }, () => ({
        fx: Math.random(),
        fy: Math.random(),
        size: Math.random() < 0.25 ? 4 : 2,
        base: 0.02 + Math.random() * 0.04,
      })),
    [],
  );

  useEffect(() => {
    if (!animated) {
      boot.value = 1;
      return;
    }
    boot.value = 0;
    boot.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) });
    beam.value = 0;
    beam.value = withTiming(1, { duration: 440, easing: Easing.out(Easing.quad) });
    flash.value = 0.18;
    flash.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) });
  }, [animated, boot, beam, flash]);

  useEffect(() => {
    if (!animated) return;
    roll.value = 0;
    roll.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(roll);
  }, [animated, roll]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: boot.value,
    transform: [{ translateY: (1 - boot.value) * 12 }],
  }));
  const beamStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: beam.value * (height + BEAM_H) - BEAM_H }],
    opacity: (1 - beam.value) * 0.9,
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const rollStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: roll.value * (height + ROLL_H) - ROLL_H }],
  }));
  const rollStyle2 = useAnimatedStyle(() => ({
    transform: [{ translateY: ((roll.value + 0.5) % 1) * (height + ROLL_H) - ROLL_H }],
  }));

  function onLayout(e: LayoutChangeEvent) {
    const h = e.nativeEvent.layout.height;
    if (h !== height) setHeight(h);
  }

  return (
    <View
      onLayout={onLayout}
      style={[{ flex: 1, backgroundColor: theme.semantic.bg.canvas }, style]}
    >
      {/* Ambient pixel field — flares row by row as the scan bar passes. */}
      {animated
        ? pixels.map((p, i) => <ScanPixel key={i} roll={roll} pixel={p} color={accent} />)
        : null}

      {/* Ambient scan bars — two, half a cycle apart; soft body + faint edge. */}
      {animated && height > 0 ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: ROLL_H }, rollStyle]}
          >
            <View style={{ flex: 1, backgroundColor: withAlpha(accent, 0.025) }} />
            <View style={{ height: 1, backgroundColor: withAlpha(accent, 0.2) }} />
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: ROLL_H }, rollStyle2]}
          >
            <View style={{ flex: 1, backgroundColor: withAlpha(accent, 0.02) }} />
            <View style={{ height: 1, backgroundColor: withAlpha(accent, 0.16) }} />
          </Animated.View>
        </>
      ) : null}

      <Animated.View style={[{ flex: 1 }, contentStyle]}>{children}</Animated.View>

      {/* Bezel edge — subtle inner frame, below the grid. */}
      <View pointerEvents="none" style={[FILL, { borderWidth: 1, borderColor: theme.semantic.bg.bezel }]} />

      {showGrid ? <ScreenGrid spacing={gridSpacing} /> : null}

      {/* Power-on scan-beam: soft trail + bright leading edge, wipes down once. */}
      {animated && height > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: BEAM_H }, beamStyle]}
        >
          <View style={{ flex: 1, backgroundColor: withAlpha(accent, 0.07) }} />
          <View style={{ height: 2, backgroundColor: withAlpha(accent, 0.95) }} />
        </Animated.View>
      ) : null}

      {/* Power-on energize flash — accent wash, visible on black, fades fast. */}
      {animated ? (
        <Animated.View pointerEvents="none" style={[FILL, { backgroundColor: accent }, flashStyle]} />
      ) : null}
    </View>
  );
}

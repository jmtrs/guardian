import { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useUITheme, withAlpha } from '@/ui/theme';

const BAR_HEIGHT = 120;
const PIXEL_COUNT = 34;
const PIXEL_GROUP_COUNT = 12;
const FLARE_DISTANCE = 0.12;

type Pixel = {
  x: number;
  y: number;
  size: number;
  strength: number;
};

function createPixels(): Pixel[] {
  let seed = 0x72a4c19;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  return Array.from({ length: PIXEL_COUNT }, () => ({
    x: random(),
    y: random(),
    size: random() < 0.25 ? 4 : 2,
    strength: 0.72 + random() * 0.28,
  }));
}

const PIXEL_GROUPS = (() => {
  const groups = Array.from({ length: PIXEL_GROUP_COUNT }, () => [] as Pixel[]);
  for (const pixel of createPixels()) {
    const group = Math.min(PIXEL_GROUP_COUNT - 1, Math.floor(pixel.y * PIXEL_GROUP_COUNT));
    groups[group].push(pixel);
  }
  return groups;
})();

function PixelGroup({
  pixels,
  groupIndex,
  progress,
  color,
}: {
  pixels: Pixel[];
  groupIndex: number;
  progress: SharedValue<number>;
  color: string;
}) {
  const groupY = (groupIndex + 0.5) / PIXEL_GROUP_COUNT;
  const animatedStyle = useAnimatedStyle(() => {
    const secondBar = (progress.value + 0.5) % 1;
    const distance = Math.min(Math.abs(groupY - progress.value), Math.abs(groupY - secondBar));
    const flare = Math.max(0, 1 - distance / FLARE_DISTANCE);
    return { opacity: 0.045 + flare * flare * 0.72 };
  });

  return (
    <Animated.View style={[styles.pixelLayer, animatedStyle]}>
      {pixels.map((pixel, index) => (
        <View
          key={index}
          style={[
            styles.pixel,
            {
              left: `${pixel.x * 100}%`,
              top: `${pixel.y * 100}%`,
              width: pixel.size,
              height: pixel.size,
              opacity: pixel.strength,
              backgroundColor: color,
            },
          ]}
        />
      ))}
    </Animated.View>
  );
}

// One persistent ambient layer for the whole app. Pixels remain fixed while
// twelve horizontal groups vary their brightness as the two scan bars pass.
// This preserves the original effect without mounting one worklet per pixel
// (and without duplicating the animation for every route in the stack).
export function ScreenAmbient() {
  const theme = useUITheme();
  const { height } = useWindowDimensions();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: 4200, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [progress]);

  const firstBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: progress.value * (height + BAR_HEIGHT) - BAR_HEIGHT }],
  }));
  const secondBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ((progress.value + 0.5) % 1) * (height + BAR_HEIGHT) - BAR_HEIGHT }],
  }));

  const accent = theme.semantic.accent.warning;

  return (
    <View pointerEvents="none" style={styles.container}>
      {PIXEL_GROUPS.map((pixels, groupIndex) => (
        <PixelGroup
          key={groupIndex}
          pixels={pixels}
          groupIndex={groupIndex}
          progress={progress}
          color={accent}
        />
      ))}
      <Animated.View style={[styles.bar, firstBarStyle]}>
        <View style={[styles.barBody, { backgroundColor: withAlpha(accent, 0.02) }]} />
        <View style={[styles.barEdge, { backgroundColor: withAlpha(accent, 0.16) }]} />
      </Animated.View>
      <Animated.View style={[styles.bar, secondBarStyle]}>
        <View style={[styles.barBody, { backgroundColor: withAlpha(accent, 0.016) }]} />
        <View style={[styles.barEdge, { backgroundColor: withAlpha(accent, 0.13) }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  pixelLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  pixel: {
    position: 'absolute',
  },
  bar: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: BAR_HEIGHT,
  },
  barBody: {
    flex: 1,
  },
  barEdge: {
    height: 1,
  },
});

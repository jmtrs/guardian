import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';

// Dot-matrix / scanline mask that sits ON TOP of screen content with
// pointerEvents="none" — the "grid tipo pantalla, todo por debajo" look ported
// from cc-autobahn's `.screen::after`. There the lines are DARK (rgba black)
// with `mix-blend-mode: multiply`: they darken only the lit content beneath, so
// text/panels read as if masked behind a pixel screen while true-black areas
// stay black. RN has no blend modes, but plain semi-transparent BLACK lines on
// top achieve the same read — they're invisible over black, visible over
// anything lit. RN also has no repeating gradient, so lines are hairline Views
// laid out from the measured size; count per axis is capped so spacing coarsens
// on huge surfaces instead of spawning thousands of Views.

type ScreenGridProps = {
  /** Base gap between grid lines, in px. */
  spacing?: number;
  style?: StyleProp<ViewStyle>;
  /** Overrides the default dark grid line color. */
  color?: string;
};

// Dark line, like autobahn's rgba(0,0,0,0.18). Kept at that alpha so the mask
// reads over lit areas without darkening text underneath enough to hurt legibility.
const DEFAULT_LINE = 'rgba(0, 0, 0, 0.18)';

const MAX_LINES_PER_AXIS = 340;

function buildOffsets(extent: number, step: number): number[] {
  if (extent <= 0) return [];
  const offsets: number[] = [];
  for (let pos = 0; pos < extent; pos += step) offsets.push(pos);
  return offsets;
}

export function ScreenGrid({ spacing = 3, style, color = DEFAULT_LINE }: ScreenGridProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  }

  // ONE step for both axes so every cell is a true square (reads as pixels,
  // not rectangles). Coarsen uniformly from the larger side so neither axis
  // blows past the line cap.
  const step = useMemo(() => {
    const maxExtent = Math.max(size.w, size.h);
    return Math.max(spacing, Math.ceil(maxExtent / MAX_LINES_PER_AXIS));
  }, [size.w, size.h, spacing]);

  const rows = useMemo(() => buildOffsets(size.h, step), [size.h, step]);
  const cols = useMemo(() => buildOffsets(size.w, step), [size.w, step]);

  return (
    <View
      pointerEvents="none"
      onLayout={onLayout}
      style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }, style]}
    >
      {rows.map((top) => (
        <View
          key={`r${top}`}
          style={{ position: 'absolute', left: 0, right: 0, top, height: 1, backgroundColor: color }}
        />
      ))}
      {cols.map((left) => (
        <View
          key={`c${left}`}
          style={{ position: 'absolute', top: 0, bottom: 0, left, width: 1, backgroundColor: color }}
        />
      ))}
    </View>
  );
}

import { Animated, View } from 'react-native';

import type { PlaceholderProps } from '../Placeholder.types';
import { getPlaceholderColor, getPlaceholderOpacity } from '../placeholderUtils';
import { useSpeedLinesAnim, LINE_PERIOD } from './SpeedLines.anim';
import { styles } from './SpeedLines.styles';

/**
 * Motion-blur effect — 7 thin lines at a shallow angle scrolling left on loop.
 * Each line has a different speed, width, and opacity to avoid uniformity.
 *
 * Fixed 60px height; sizes horizontally to the parent.
 *
 * ## Implementation Details
 *
 * The component renders 7 lines, each with unique properties defined in `LINE_DEFS`:
 * - Different vertical positions (top: 4-50px)
 * - Different widths (50-140px)
 * - Different opacities (0.4-0.9)
 * - Different scroll durations (offset from BASE_DURATION_MS)
 *
 * All lines are skewed -12 degrees for the shallow angle effect.
 * Line width includes `LINE_PERIOD` to prevent gaps during scrolling.
 *
 * ## Visual Characteristics
 *
 * - Color: controlled by `tone` prop (warning=yellow, carbon=dark grey, smoke=light grey)
 * - Opacity: controlled by `intensity` prop (low=14%, medium=26%, high=42%)
 * - Height: fixed 60px
 * - Width: stretches to parent width
 * - Lines: 7 total, each with unique animation timing
 *
 * ## LINE_DEFS Reference
 *
 * | Index | Top | Width | Opacity | Duration Offset |
 * |-------|-----|-------|---------|-----------------|
 * | 0 | 4px | 90px | 0.9 | +0ms |
 * | 1 | 10px | 130px | 0.7 | +80ms |
 * | 2 | 18px | 60px | 0.5 | +140ms |
 * | 3 | 26px | 110px | 0.8 | +30ms |
 * | 4 | 34px | 75px | 0.6 | +200ms |
 * | 5 | 42px | 140px | 0.9 | +60ms |
 * | 6 | 50px | 50px | 0.4 | +170ms |
 *
 * @example
 * ```tsx
 * // Yellow warning lines (motion blur for speed effect)
 * <SpeedLines intensity="high" tone="warning" />
 *
 * // Dark grey smoke lines (subtle motion atmosphere)
 * <SpeedLines intensity="medium" tone="smoke" />
 *
 * // Low intensity for background texture
 * <SpeedLines intensity="low" tone="carbon" />
 * ```
 */
export function SpeedLines({ style, intensity = 'medium', tone = 'warning' }: PlaceholderProps) {
  const color = getPlaceholderColor(tone);
  const lines = useSpeedLinesAnim();

  return (
    <View
      pointerEvents="none"
      style={[styles.root, { opacity: getPlaceholderOpacity(intensity) }, style]}
    >
      {lines.map((line, i) => (
        <Animated.View
          key={i}
          style={[
            styles.line,
            {
              top: line.top,
              width: line.width + LINE_PERIOD,
              opacity: line.opacity,
              backgroundColor: color,
              transform: [
                { translateX: line.translateX },
                { skewX: '-12deg' },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

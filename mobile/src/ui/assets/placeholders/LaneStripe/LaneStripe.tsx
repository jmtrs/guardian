import { Animated, View } from 'react-native';

import type { PlaceholderProps } from '../Placeholder.types';
import { getPlaceholderColor, getPlaceholderOpacity } from '../placeholderUtils';
import { useLaneStripeAnim, STRIPE_PERIOD } from './LaneStripe.anim';
import { styles, STRIPE_COUNT } from './LaneStripe.styles';

/**
 * Scrolling hazard-tape stripe — angled bars that slide continuously to the left.
 *
 * Fixed 18px height; sizes horizontally to the parent. Used as a visual separator
 * with a road-warning feel. Supports `carbon` and `warning` tones.
 *
 * ## Implementation Details
 *
 * The component renders 8 angled bars (stripes) in a horizontal track that
 * scrolls left continuously. Each stripe is:
 * - Width: 9px
 * - Height: 48px (extends above and below the 18px container)
 * - Rotated: 45 degrees for diagonal effect
 *
 * The `translateX` animation cycles from 0 to `-STRIPE_PERIOD` (-28px), then
 * loops seamlessly to 0, creating an infinite scrolling effect.
 *
 * ## Visual Characteristics
 *
 * - Color: controlled by `tone` prop (warning=yellow, carbon=dark grey, smoke=light grey)
 * - Opacity: controlled by `intensity` prop (low=14%, medium=26%, high=42%)
 * - Height: fixed 18px
 * - Width: stretches to parent width
 * - Loop duration: 1200ms
 *
 * @example
 * ```tsx
 * // Yellow hazard tape (road warning feel)
 * <LaneStripe intensity="high" tone="warning" />
 *
 * // Dark carbon stripe (subtle separation)
 * <LaneStripe tone="carbon" />
 *
 * // Light smoke stripe (soft division)
 * <LaneStripe intensity="low" tone="smoke" />
 * ```
 */
export function LaneStripe({ style, intensity = 'medium', tone = 'carbon' }: PlaceholderProps) {
  const color = getPlaceholderColor(tone);
  const { translateX } = useLaneStripeAnim();

  return (
    <View
      pointerEvents="none"
      style={[styles.root, { opacity: getPlaceholderOpacity(intensity) }, style]}
    >
      <Animated.View style={[styles.track, { transform: [{ translateX }] }]}>
        {Array.from({ length: STRIPE_COUNT }, (_, i) => (
          <View
            key={i}
            style={[styles.stripe, { left: i * STRIPE_PERIOD, backgroundColor: color }]}
          />
        ))}
      </Animated.View>
    </View>
  );
}

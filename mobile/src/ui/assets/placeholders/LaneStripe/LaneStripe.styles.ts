import { StyleSheet } from 'react-native';

import { darkTheme } from '@/ui/theme';

/**
 * Number of hazard tape stripes in the track.
 * @defaultValue 8
 */
export const STRIPE_COUNT = 8;

/**
 * LaneStripe component styles.
 *
 * The component renders a horizontal track containing angled stripes
 * that scroll left to create a hazard-tape effect.
 *
 * Each stripe is:
 * - Width: 9px
 * - Height: 48px (extends above and below container)
 * - Rotated: 45 degrees
 */
export const styles = StyleSheet.create({
  /**
   * Root container style.
   * Fixed 18px height with dark background to contrast stripes.
   * Hidden overflow clips stripes extending beyond bounds.
   */
  root: {
    height: 18,
    overflow: 'hidden',
    backgroundColor: darkTheme.tokens.color['black.1000'],
  },
  /**
   * Track container that holds all stripes.
   * Uses absolute positioning and row layout for horizontal scrolling.
   */
  track: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  /**
   * Individual stripe style.
   * Absolute positioning allows precise control over placement.
   * Rotated 45 degrees for diagonal hazard-tape appearance.
   */
  stripe: {
    position: 'absolute',
    top: -12,
    width: 9,
    height: 48,
    transform: [{ rotate: '45deg' }],
  },
});

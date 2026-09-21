import { StyleSheet } from 'react-native';

/**
 * Default values for ChainLink component props.
 */
export const DEFAULTS = {
  /**
   * Default spacing between parallel lines in pixels.
   * @defaultValue 18
   */
  spacing: 18,
  /**
   * Default line thickness in pixels.
   * @defaultValue 1
   */
  thickness: 1,
} as const;

export const styles = StyleSheet.create({
  /**
   * Root container style.
   * Uses `absoluteFillObject` to cover the entire parent container.
   * Overflow is hidden to clip lines extending beyond bounds.
   */
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  /**
   * Individual line style.
   * Lines are absolutely positioned and rotated for diagonal effect.
   */
  line: {
    position: 'absolute',
  },
});

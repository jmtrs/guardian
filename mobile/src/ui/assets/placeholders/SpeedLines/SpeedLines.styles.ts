import { StyleSheet } from 'react-native';

/**
 * SpeedLines component styles.
 *
 * The component renders multiple thin horizontal lines with varying
 * widths, opacities, and scroll speeds to create a motion-blur effect.
 *
 * All lines use absolute positioning and are skewed -12 degrees.
 */
export const styles = StyleSheet.create({
  /**
   * Root container style.
   * Fixed 60px height with hidden overflow to clip lines.
   */
  root: {
    height: 60,
    overflow: 'hidden',
  },
  /**
   * Individual line style.
   * Lines are 1px high with absolute positioning for placement.
   */
  line: {
    position: 'absolute',
    height: 1,
  },
});

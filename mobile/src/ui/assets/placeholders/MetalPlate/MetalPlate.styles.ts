import { StyleSheet } from 'react-native';

import { darkTheme } from '@/ui/theme';

/**
 * MetalPlate component styles.
 *
 * The component applies a metal panel appearance with:
 * - Thin border using metal color
 * - Carbon panel background
 * - No border radius for sharp, angular look
 */
export const styles = StyleSheet.create({
  /**
   * Root container style.
   * Applies metal border, carbon panel background, and sharp corners.
   */
  root: {
    overflow: 'hidden',
    borderWidth: darkTheme.tokens.border.width.thin,
    borderColor: darkTheme.semantic.border.metal,
    borderRadius: darkTheme.tokens.radius.none,
    backgroundColor: darkTheme.semantic.surface.panel,
  },
});

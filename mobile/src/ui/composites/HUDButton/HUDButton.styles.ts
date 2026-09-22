import { StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';

import { BTN_H, WRAP_PAD } from './HUDButton.anim';
import type { HUDButtonVariant } from './HUDButton.types';
import type { UITheme } from '@/ui/theme';

type VariantPalette = {
  bg: [string, string];
  corner: [string, string];
  label: string;
  scan: string;
};

export function getVariantPalette(variant: HUDButtonVariant, theme: UITheme): VariantPalette {
  // Danger stays on the theme palette (no hardcoded red). Dark fill + a BRIGHT
  // glow label (light-on-dark = maximum legibility); distinct from primary by
  // the brighter tone + brighter scan, not by a black-on-accent slab.
  if (variant === 'danger') {
    return {
      bg: [theme.semantic.bg.inset, theme.semantic.surface.raised],
      corner: [theme.semantic.accent.glow, theme.semantic.accent.warning],
      label: theme.semantic.accent.glow,
      scan: theme.semantic.accent.warning,
    };
  }
  return {
    bg: [theme.semantic.bg.inset, theme.semantic.surface.raised],
    corner: [theme.semantic.accent.warning, theme.semantic.accent.dirtyAmber],
    label: theme.semantic.accent.warning,
    scan: theme.semantic.accent.dirtyAmber,
  };
}

export function createHUDButtonStyles(theme: UITheme) {
  return StyleSheet.create({
    pressable: {
      alignSelf: 'stretch',
    },
    wrapper: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: WRAP_PAD,
      alignSelf: 'stretch',
    },
    disabled: {
      opacity: 0.4,
    },
    corner: {
      position: 'absolute',
    },
    cornerLT: { borderTopWidth: 2, borderLeftWidth: 2 },
    cornerLB: { borderBottomWidth: 2, borderLeftWidth: 2 },
    cornerRT: { borderTopWidth: 2, borderRightWidth: 2 },
    cornerRB: { borderBottomWidth: 2, borderRightWidth: 2 },
    button: {
      height: BTN_H,
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    scanLine: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      bottom: 0,
      width: 32,
      opacity: 0.32,
    },
    label: {
      color: theme.semantic.fg.primary,
      fontFamily: theme.fontFamily.ui.bold,
      fontSize: theme.tokens.typography.size.body + 2,
      fontWeight: theme.tokens.typography.weight.bold as unknown as '700',
      letterSpacing: theme.tokens.typography.letterSpacing.wide,
      textTransform: 'uppercase',
    },
  });
}

export type HUDButtonStyles = ReturnType<typeof createHUDButtonStyles>;
export type HUDButtonPressableStyle = ViewStyle;

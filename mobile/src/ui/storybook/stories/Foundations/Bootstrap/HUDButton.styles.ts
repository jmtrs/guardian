import { StyleSheet } from 'react-native';

import { useUITheme } from '@/ui/theme';
import { BTN_W, BTN_H, WRAP_PAD } from './HUDButton.anim';

export function createHUDButtonStyles(theme: ReturnType<typeof useUITheme>) {
  return StyleSheet.create({
    pressable: {
      alignSelf: 'center',
    },
    wrapper: {
      width: BTN_W + WRAP_PAD * 2,
      height: BTN_H + WRAP_PAD * 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    corner: {
      position: 'absolute',
    },
    cornerLT: { borderTopWidth: 2, borderLeftWidth: 2 },
    cornerLB: { borderBottomWidth: 2, borderLeftWidth: 2 },
    cornerRT: { borderTopWidth: 2, borderRightWidth: 2 },
    cornerRB: { borderBottomWidth: 2, borderRightWidth: 2 },
    button: {
      width: BTN_W,
      height: BTN_H,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    scanLine: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: 32,
      backgroundColor: 'rgba(255, 159, 28, 0.32)',
    },
    okText: {
      color: theme.semantic.accent.warning,
      fontSize: theme.tokens.typography.size.label,
      fontFamily: theme.fontFamily.ui.bold,
      fontWeight: theme.tokens.typography.weight.bold as unknown as '700',
      letterSpacing: theme.tokens.typography.letterSpacing.wide,
    },
  });
}

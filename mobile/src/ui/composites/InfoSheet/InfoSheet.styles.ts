import { StyleSheet } from 'react-native';

import type { UITheme } from '@/ui/theme';

// Variante translucida del lenguaje de panel: sin cajas ni insets, solo
// glifos, texto y lineas finas sobre el blur del sheet.
export function createInfoSheetStyles(theme: UITheme) {
  const { semantic, tokens, fontFamily } = theme;
  return StyleSheet.create({
    // Linea de acento superior: la unica "decoracion" del panel.
    accentBar: {
      height: 2,
      backgroundColor: semantic.accent.warning,
      opacity: 0.7,
    },
    content: {
      paddingHorizontal: tokens.spacing['6'],
      paddingTop: tokens.spacing['5'],
      paddingBottom: tokens.spacing['5'],
      gap: tokens.spacing['4'],
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing['3'],
    },
    glyph: {
      color: semantic.accent.warning,
      fontFamily: fontFamily.display,
      fontSize: 20,
      textShadowColor: semantic.glow.text,
      textShadowRadius: 8,
    },
    title: {
      flex: 1,
      color: semantic.fg.primary,
      fontFamily: fontFamily.display,
      fontSize: 14,
      letterSpacing: 3,
      textTransform: 'uppercase',
    },
    rows: {
      gap: 0,
    },
    // Cada fila se separa por una linea sutil: cero chrome extra.
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: tokens.spacing['3'],
      paddingVertical: tokens.spacing['4'],
      borderTopWidth: 1,
      borderTopColor: semantic.border.subtle,
    },
    rowGlyph: {
      color: semantic.accent.warning,
      fontFamily: fontFamily.ui.regular,
      fontSize: 13,
      lineHeight: 18,
    },
    rowText: {
      flex: 1,
      color: semantic.fg.secondary,
      fontFamily: fontFamily.ui.regular,
      fontSize: 13,
      lineHeight: 18,
    },
  });
}

export type InfoSheetStyles = ReturnType<typeof createInfoSheetStyles>;

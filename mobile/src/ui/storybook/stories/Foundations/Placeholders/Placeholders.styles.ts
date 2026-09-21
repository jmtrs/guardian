import { StyleSheet } from 'react-native';

import { useUITheme } from '@/ui/theme';

export function createPlaceholderStyles(theme: ReturnType<typeof useUITheme>) {
  return StyleSheet.create({
    screen: {
      flex: 1,
    },
    content: {
      gap: theme.tokens.spacing['4'],
      paddingBottom: theme.tokens.spacing['6'],
    },

    // ── section grouping ──────────────────────────────────────────────────────
    sectionTitle: {
      color: theme.semantic.fg.muted,
      fontFamily: theme.fontFamily.ui.semibold,
      fontSize: theme.tokens.typography.size.caption,
      letterSpacing: theme.tokens.typography.letterSpacing.wide,
      textTransform: 'uppercase',
      marginBottom: theme.tokens.spacing['1'] ?? 2,
    },

    // ── individual entry ──────────────────────────────────────────────────────
    entry: {
      gap: theme.tokens.spacing['2'],
    },
    entryHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: theme.tokens.spacing['2'],
    },
    entryName: {
      color: theme.semantic.fg.primary,
      fontFamily: theme.fontFamily.ui.bold,
      fontSize: theme.tokens.typography.size.label,
      letterSpacing: theme.tokens.typography.letterSpacing.wide,
    },
    entryDesc: {
      color: theme.semantic.fg.muted,
      fontFamily: theme.fontFamily.ui.regular,
      fontSize: theme.tokens.typography.size.caption,
      letterSpacing: theme.tokens.typography.letterSpacing.wide,
    },

    // ── preview containers ────────────────────────────────────────────────────
    // Fixed height for absoluteFillObject components (ChainLink, HUDScan)
    previewBox: {
      height: 80,
      borderWidth: theme.tokens.border.width.thin,
      borderColor: theme.semantic.border.subtle,
      overflow: 'hidden',
      backgroundColor: theme.tokens.color['asphalt.900'],
    },
    previewBoxTall: {
      height: 120,
      borderWidth: theme.tokens.border.width.thin,
      borderColor: theme.semantic.border.subtle,
      overflow: 'hidden',
      backgroundColor: theme.tokens.color['asphalt.900'],
    },
    // Inline components (LaneStripe, CourtLine, SpeedLines) size themselves
    previewInline: {
      borderWidth: theme.tokens.border.width.thin,
      borderColor: theme.semantic.border.subtle,
      overflow: 'hidden',
    },
    // MetalPlate is its own container
    metalCard: {
      padding: theme.tokens.spacing['3'],
      gap: theme.tokens.spacing['2'],
    },
    metalCardBody: {
      color: theme.semantic.fg.secondary,
      fontFamily: theme.fontFamily.ui.regular,
      fontSize: theme.tokens.typography.size.body,
      lineHeight: theme.tokens.typography.lineHeight.body,
    },
  });
}

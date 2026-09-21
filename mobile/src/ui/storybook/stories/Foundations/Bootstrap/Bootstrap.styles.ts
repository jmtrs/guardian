import { StyleSheet } from 'react-native';

import { useUITheme } from '@/ui/theme';

export function createBootstrapStyles(theme: ReturnType<typeof useUITheme>) {
  return StyleSheet.create({
    card: {
      minHeight: 366,
      padding: theme.tokens.spacing['3'],
      gap: theme.tokens.spacing['3'],
      ...theme.elevation.raised,
    },
    header: {
      height: 36,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: theme.tokens.border.width.thin,
      borderColor: theme.semantic.border.subtle,
      backgroundColor: theme.semantic.bg.inset,
      paddingHorizontal: theme.tokens.spacing['3'],
      gap: theme.tokens.spacing['2'],
    },
    headerText: {
      flex: 1,
      color: theme.semantic.fg.primary,
      fontSize: theme.tokens.typography.size.body,
      lineHeight: theme.tokens.typography.lineHeight.label,
      fontFamily: theme.fontFamily.ui.bold,
      fontWeight: theme.tokens.typography.weight.bold as unknown as '700',
      letterSpacing: theme.tokens.typography.letterSpacing.wide,
    },
    headerArrowBox: {
      width: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerArrow: {
      width: 9,
      height: 9,
      borderRightWidth: theme.tokens.border.width.base,
      borderBottomWidth: theme.tokens.border.width.base,
      borderColor: theme.semantic.accent.warning,
      transform: [{ rotate: '-45deg' }],
    },
    hazardBand: {
      height: 18,
    },
    headline: {
      color: theme.semantic.fg.primary,
      fontSize: theme.tokens.typography.size.display,
      lineHeight: theme.tokens.typography.lineHeight.display,
      fontFamily: theme.fontFamily.display,
      fontWeight: theme.tokens.typography.weight.bold as unknown as '700',
      textTransform: 'uppercase',
    },
    body: {
      color: theme.semantic.fg.secondary,
      fontSize: theme.tokens.typography.size.body,
      lineHeight: theme.tokens.typography.lineHeight.body,
      fontFamily: theme.fontFamily.ui.regular,
    },
    courtLineAccent: {
      marginTop: -theme.tokens.spacing['2'],
      marginBottom: -theme.tokens.spacing['2'],
    },
    trackPanel: {
      height: 56,
      borderTopWidth: theme.tokens.border.width.thin,
      borderBottomWidth: theme.tokens.border.width.thin,
      borderColor: theme.semantic.border.subtle,
      justifyContent: 'center',
    },
    trackLabel: {
      color: theme.semantic.fg.muted,
      fontSize: theme.tokens.typography.size.caption,
      fontFamily: theme.fontFamily.ui.semibold,
      letterSpacing: theme.tokens.typography.letterSpacing.wide,
      marginBottom: theme.tokens.spacing['2'],
    },
    trackLine: {
      height: 3,
      backgroundColor: theme.semantic.map.route,
    },
    trackPulse: {
      position: 'absolute',
      right: 72,
      bottom: 16,
      left: 92,
      height: 8,
      backgroundColor: theme.semantic.accent.dirtyAmber,
      opacity: 0.38,
    },
    trackMarker: {
      position: 'absolute',
      right: 64,
      bottom: 12,
      width: 16,
      height: 16,
      borderWidth: theme.tokens.border.width.base,
      borderColor: theme.semantic.accent.warning,
      backgroundColor: theme.semantic.surface.carbon,
    },
    actions: {
      alignItems: 'center',
    },
  });
}

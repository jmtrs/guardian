import { StyleSheet } from 'react-native';

import type { UITheme } from '@/ui/theme';

export function createStyles(theme: UITheme) {
  const { semantic, tokens, fontFamily } = theme;
  return StyleSheet.create({
    content: {
      paddingHorizontal: tokens.spacing['6'],
      paddingTop: tokens.spacing['14'],
      paddingBottom: tokens.spacing['16'],
      gap: tokens.spacing['8'],
    },
    // Header — back caret + section title, HUD style.
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing['4'],
    },
    backButton: {
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: semantic.border.metal,
      backgroundColor: semantic.bg.surface,
    },
    backIcon: {
      color: semantic.accent.warning,
      fontFamily: fontFamily.ui.medium,
      fontSize: 18,
      textShadowColor: semantic.glow.text,
      textShadowRadius: 8,
    },
    title: {
      color: semantic.fg.primary,
      fontFamily: fontFamily.display,
      fontSize: 22,
      letterSpacing: 4,
      textTransform: 'uppercase',
    },
    // Section block.
    section: {
      gap: tokens.spacing['4'],
    },
    sectionLabel: {
      color: semantic.fg.muted,
      fontFamily: fontFamily.ui.medium,
      fontSize: 11,
      letterSpacing: 3,
      textTransform: 'uppercase',
    },
    fieldLabel: {
      color: semantic.accent.warning,
      fontFamily: fontFamily.ui.medium,
      fontSize: 12,
      letterSpacing: 2,
      textTransform: 'uppercase',
      textShadowColor: semantic.glow.text,
      textShadowRadius: 6,
    },
    fieldHint: {
      color: semantic.fg.muted,
      fontFamily: fontFamily.ui.regular,
      fontSize: 11,
      letterSpacing: 0.5,
    },
    panel: {
      borderWidth: 1,
      borderColor: semantic.border.metal,
      backgroundColor: semantic.bg.surface,
      padding: tokens.spacing['5'],
      gap: tokens.spacing['4'],
      overflow: 'hidden',
    },
    // Chip grid.
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: tokens.spacing['2'],
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing['2'],
      paddingVertical: tokens.spacing['2'],
      paddingHorizontal: tokens.spacing['3'],
      borderWidth: 1,
      borderColor: semantic.border.subtle,
      backgroundColor: semantic.bg.inset,
    },
    chipActive: {
      borderColor: semantic.accent.warning,
      backgroundColor: semantic.bg.surfaceRaised,
    },
    chipSwatch: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: semantic.border.subtle,
    },
    chipLabel: {
      color: semantic.fg.secondary,
      fontFamily: fontFamily.ui.medium,
      fontSize: 12,
      letterSpacing: 1.5,
    },
    chipLabelActive: {
      color: semantic.accent.warning,
      textShadowColor: semantic.glow.text,
      textShadowRadius: 6,
    },
    chipPressed: {
      opacity: 0.7,
    },
    // Session — logout lives here (moved off the dashboard for a cleaner HUD).
    logoutButton: {
      borderWidth: 1,
      borderColor: semantic.border.danger,
      backgroundColor: semantic.bg.inset,
      paddingVertical: tokens.spacing['4'],
      alignItems: 'center',
    },
    logoutText: {
      color: semantic.accent.red,
      fontFamily: fontFamily.ui.medium,
      fontSize: 13,
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    // Custom accent picker.
    accentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing['4'],
    },
    accentPreview: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 2,
    },
    slider: {
      flex: 1,
      height: 40,
    },
  });
}

export type SettingsStyles = ReturnType<typeof createStyles>;

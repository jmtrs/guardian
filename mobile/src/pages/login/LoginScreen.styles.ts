import { StyleSheet } from 'react-native';
import type { UITheme } from '@/ui/theme';

export function createStyles(theme: UITheme) {
  return StyleSheet.create({
    keyboardContainer: {
      flex: 1,
      paddingHorizontal: theme.tokens.spacing['6'],
      paddingTop: theme.tokens.spacing['48'],
    },
    headerFixed: {
      alignItems: 'center',
      gap: theme.tokens.spacing['2'],
      marginTop: theme.tokens.spacing['2'],
    },
    formArea: {
      flex: 1,
    },
    androidFormContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingBottom: theme.tokens.spacing['6'],
    },
    iosFormContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingBottom: theme.tokens.spacing['6'],
    },
    formContent: {
      gap: theme.tokens.spacing['6'],
      paddingVertical: theme.tokens.spacing['10'],
    },
    form: {
      gap: theme.tokens.spacing['4'],
    },
    title: {
      color: theme.semantic.accent.warning,
      fontFamily: theme.fontFamily.display,
      fontSize: 32,
      letterSpacing: 6,
    },
    subtitle: {
      color: theme.semantic.fg.muted,
      fontFamily: theme.fontFamily.ui.regular,
      fontSize: 13,
      letterSpacing: 1,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.semantic.border.metal,
      backgroundColor: theme.semantic.bg.inset,
      color: theme.semantic.fg.primary,
      fontFamily: theme.fontFamily.ui.regular,
      fontSize: 16,
      paddingHorizontal: theme.tokens.spacing['4'],
      paddingVertical: theme.tokens.spacing['4'],
    },
    backButton: {
      paddingVertical: theme.tokens.spacing['3'],
      alignItems: 'center',
    },
    backButtonText: {
      color: theme.semantic.fg.muted,
      fontFamily: theme.fontFamily.ui.regular,
      fontSize: 13,
      letterSpacing: 1,
    },
    infoText: {
      color: theme.semantic.fg.secondary,
      fontFamily: theme.fontFamily.ui.regular,
      fontSize: 13,
    },
    errorText: {
      color: theme.semantic.state.error,
      fontFamily: theme.fontFamily.ui.regular,
      fontSize: 13,
    },
  });
}

export type LoginStyles = ReturnType<typeof createStyles>;

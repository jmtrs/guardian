import { StyleSheet } from 'react-native';
import type { UITheme } from '@/ui/theme';
import { uiFontFamily } from '@/ui/theme/fonts';

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
      gap: theme.tokens.spacing['5'],
      paddingVertical: theme.tokens.spacing['10'],
    },
    title: {
      color: theme.semantic.accent.warning,
      fontFamily: uiFontFamily.display,
      fontSize: 28,
      letterSpacing: 4,
    },
    subtitle: {
      color: theme.semantic.fg.muted,
      fontFamily: uiFontFamily.ui.regular,
      fontSize: 13,
      letterSpacing: 1,
    },
    email: {
      color: theme.semantic.fg.secondary,
      fontFamily: uiFontFamily.ui.medium,
      fontSize: 14,
    },
    backButton: {
      paddingVertical: theme.tokens.spacing['3'],
      alignItems: 'center',
    },
    backButtonText: {
      color: theme.semantic.fg.muted,
      fontFamily: uiFontFamily.ui.regular,
      fontSize: 13,
      letterSpacing: 1,
    },
    // Contrato de estilos que consume OtpVerifyForm.
    form: { gap: theme.tokens.spacing['4'] },
    label: { display: 'none' as const },
    input: {
      borderWidth: 1,
      borderColor: theme.semantic.border.metal,
      backgroundColor: theme.semantic.bg.inset,
      color: theme.semantic.accent.warning,
      fontFamily: uiFontFamily.ui.bold,
      fontSize: 28,
      letterSpacing: 12,
      textShadowColor: theme.semantic.glow.text,
      textShadowRadius: 8,
      paddingVertical: theme.tokens.spacing['4'],
      textAlign: 'center',
    },
    resendButton: {
      paddingVertical: theme.tokens.spacing['2'],
      alignItems: 'center',
    },
    resendButtonDisabled: { opacity: 0.4 },
    resendButtonText: {
      color: theme.semantic.fg.muted,
      fontFamily: uiFontFamily.ui.regular,
      fontSize: 13,
    },
    errorText: {
      color: theme.semantic.state.error,
      fontFamily: uiFontFamily.ui.regular,
      fontSize: 13,
      textAlign: 'center',
    },
  });
}

export type VerifyStyles = ReturnType<typeof createStyles>;

import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { authClient } from '@/api/auth-client';
import { OtpVerifyForm } from '@/components/auth/otp/OtpVerifyForm';
import { useUITheme } from '@/ui/theme';
import { uiFontFamily } from '@/ui/theme/fonts';

// Reenvio con cooldown: el OTP dura 10 min, 5 intentos.
const RESEND_COOLDOWN_S = 30;

export default function VerifyScreen() {
  const { t } = useTranslation();
  const theme = useUITheme();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const verify = async () => {
    if (code.length !== 6 || isLoading) return;
    setIsLoading(true);
    setError(null);
    const { error: signInError } = await authClient.signIn.emailOtp({
      email: email ?? '',
      otp: code,
    });
    setIsLoading(false);
    if (signInError) {
      setError(t('auth.invalidCode'));
      setCode('');
      return;
    }
    // Esperar a que expoClient persista la cookie en SecureStore antes de
    // navegar: el guard de (home) redirige a login si la sesion no se ve.
    await authClient.getCookie();
    router.replace('/(home)');
  };

  const resend = async () => {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    const { error: otpError } = await authClient.emailOtp.sendVerificationOtp({
      email: email ?? '',
      type: 'sign-in',
    });
    setIsResending(false);
    if (!otpError) {
      setCooldown(RESEND_COOLDOWN_S);
      setError(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.canvas}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.hudFrame}>
        <Text style={styles.title}>{t('auth.verifyTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.verifySubtitle')}</Text>
        <Text style={styles.email}>{email}</Text>

        <OtpVerifyForm
          code={code}
          isLoading={isLoading}
          isResending={isResending}
          resendDisabled={cooldown > 0}
          resendLabel={
            cooldown > 0
              ? `${t('auth.resendCode')} (${cooldown}s)`
              : t('auth.resendCode')
          }
          verifyLabel={t('auth.verifyTitle')}
          label={t('auth.verifyTitle')}
          placeholder="000000"
          error={error ?? undefined}
          styles={otpStyles}
          theme={theme}
          t={t}
          onCodeChange={setCode}
          onVerify={verify}
          onResendCode={resend}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    backgroundColor: '#0b0d10',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  hudFrame: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    backgroundColor: 'rgba(15, 18, 23, 0.9)',
    padding: 24,
    gap: 12,
  },
  title: {
    fontFamily: uiFontFamily.display,
    fontSize: 24,
    letterSpacing: 4,
    color: '#e2e8f0',
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: uiFontFamily.ui.regular,
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  email: {
    fontFamily: uiFontFamily.ui.medium,
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 8,
  },
});

const otpStyles = StyleSheet.create({
  form: { gap: 16 },
  label: { display: 'none' as const },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.3)',
    backgroundColor: 'rgba(11, 13, 16, 0.8)',
    color: '#e2e8f0',
    fontFamily: uiFontFamily.ui.bold,
    fontSize: 28,
    letterSpacing: 12,
    paddingVertical: 16,
  },
  button: {
    backgroundColor: '#b45309',
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: {
    color: '#0b0d10',
    fontFamily: uiFontFamily.ui.bold,
    fontSize: 15,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  resendButton: { paddingVertical: 8, alignItems: 'center' },
  resendButtonDisabled: { opacity: 0.4 },
  resendButtonText: {
    color: '#94a3b8',
    fontFamily: uiFontFamily.ui.regular,
    fontSize: 13,
  },
  errorText: {
    color: '#ef4444',
    fontFamily: uiFontFamily.ui.regular,
    fontSize: 13,
    textAlign: 'center',
  },
});

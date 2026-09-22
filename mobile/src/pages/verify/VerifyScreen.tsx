import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { authClient } from '@/api/auth-client';
import { OtpVerifyForm } from '@/components/auth/otp/OtpVerifyForm';
import { ScreenFrame } from '@/ui/composites/ScreenFrame';
import { useAndroidKeyboardHeight } from '@/hooks/useAndroidKeyboardHeight';
import { getErrorMessage } from '@/lib/error-handler';
import {
  decrementOtpCooldown,
  getOtpResendDisabled,
  getOtpResendLabel,
  OTP_RESEND_COOLDOWN_SECONDS,
} from '@/lib/otp-resend';
import { useUITheme } from '@/ui/theme';

import { createStyles } from './VerifyScreen.styles';

const CODE_REGEX = /^\d{6}$/;

export function VerifyScreen() {
  const { t } = useTranslation();
  const theme = useUITheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const androidKeyboardHeight = useAndroidKeyboardHeight();
  const email = String(params.email || '').trim().toLowerCase();
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(
    OTP_RESEND_COOLDOWN_SECONDS
  );
  const [error, setError] = useState<string | undefined>(undefined);

  const resendDisabled = getOtpResendDisabled(
    isLoading,
    isResending,
    resendCooldownSeconds
  );
  const resendLabel = getOtpResendLabel(
    t,
    resendCooldownSeconds,
    'auth.resendCountdown',
    'auth.resendCode'
  );

  useEffect(() => {
    if (resendCooldownSeconds <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setResendCooldownSeconds((prev) => decrementOtpCooldown(prev));
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldownSeconds]);

  const handleVerifyCode = async () => {
    if (!email || !CODE_REGEX.test(code) || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(undefined);

    const { error: signInError } = await authClient.signIn.emailOtp({
      email,
      otp: code,
    });

    if (signInError) {
      setIsLoading(false);
      setError(t('auth.invalidCode'));
      setCode('');
      return;
    }

    // Esperar a que expoClient persista la cookie en SecureStore antes de
    // navegar: el guard de (home) redirige a login si la sesion no se ve.
    await authClient.getCookie();
    router.replace('/(home)');
  };

  // Auto-verificar al completar los 6 digitos (misma UX que BasketBlackTop).
  useEffect(() => {
    if (CODE_REGEX.test(code)) {
      handleVerifyCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const handleResendCode = async () => {
    if (!email || resendDisabled) {
      return;
    }

    setIsResending(true);
    setError(undefined);

    const { error: otpError } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: 'sign-in',
    });

    setIsResending(false);

    if (otpError) {
      setError(getErrorMessage(otpError, t));
      return;
    }

    setCode('');
    setResendCooldownSeconds(OTP_RESEND_COOLDOWN_SECONDS);
  };

  const handleChangeEmail = () => {
    router.replace('/(auth)/login');
  };

  const formContent = (
    <View style={styles.formContent}>
      <OtpVerifyForm
        code={code}
        isLoading={isLoading}
        isResending={isResending}
        resendDisabled={resendDisabled}
        resendLabel={resendLabel}
        verifyLabel={t('auth.verifyTitle')}
        label={t('auth.verifyTitle')}
        placeholder="000000"
        error={error}
        styles={styles}
        theme={theme}
        t={t}
        onCodeChange={(text) => {
          setCode(text.replace(/[^\d]/g, ''));
          setError(undefined);
        }}
        onVerify={handleVerifyCode}
        onResendCode={handleResendCode}
      />
      <Pressable style={styles.backButton} onPress={handleChangeEmail} disabled={isLoading}>
        <Text style={styles.backButtonText}>{t('auth.changeEmail')}</Text>
      </Pressable>
    </View>
  );

  return (
    <ScreenFrame>
      <View style={styles.keyboardContainer}>
      <View style={styles.headerFixed}>
        <Text style={styles.title}>{t('auth.verifyTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.verifySubtitle')}</Text>
        <Text style={styles.email}>{email}</Text>
      </View>

      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView
          style={styles.formArea}
          behavior="padding"
          keyboardVerticalOffset={24}
        >
          <ScrollView
            style={styles.formArea}
            contentContainerStyle={styles.iosFormContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets
          >
            {formContent}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView
          style={styles.formArea}
          contentContainerStyle={[
            styles.androidFormContent,
            { paddingBottom: androidKeyboardHeight + theme.tokens.spacing['6'] },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
        >
          {formContent}
        </ScrollView>
      )}
      </View>
    </ScreenFrame>
  );
}

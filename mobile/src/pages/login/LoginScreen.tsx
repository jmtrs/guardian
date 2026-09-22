import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { authClient } from '@/api/auth-client';
import { getErrorMessage } from '@/lib/error-handler';
import { useAndroidKeyboardHeight } from '@/hooks/useAndroidKeyboardHeight';
import { HUDButton } from '@/ui/composites/HUDButton';
import { ScreenFrame } from '@/ui/composites/ScreenFrame';
import { useUITheme } from '@/ui/theme';

import { createStyles } from './LoginScreen.styles';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginScreen() {
  const { t } = useTranslation();
  const theme = useUITheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const androidKeyboardHeight = useAndroidKeyboardHeight();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  const handleSendCode = async () => {
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setError(t('auth.invalidEmail'));
      return;
    }

    setIsLoading(true);
    setError(undefined);

    const { error: otpError } = await authClient.emailOtp.sendVerificationOtp({
      email: normalizedEmail,
      type: 'sign-in',
    });

    setIsLoading(false);

    if (otpError) {
      setError(getErrorMessage(otpError, t));
      return;
    }

    router.push({
      pathname: '/(auth)/verify',
      params: { email: normalizedEmail },
    });
  };

  const formContent = (
    <View style={styles.formContent}>
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setError(undefined);
          }}
          placeholder={t('auth.emailPlaceholder')}
          placeholderTextColor={theme.semantic.fg.muted}
          cursorColor={theme.semantic.accent.warning}
          selectionColor={theme.semantic.accent.warning}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!isLoading}
          onSubmitEditing={handleSendCode}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      <HUDButton
        label={t('auth.sendCode')}
        onPress={handleSendCode}
        loading={isLoading}
        testID="login-submit"
      />
    </View>
  );

  return (
    <ScreenFrame>
      <View style={styles.keyboardContainer}>
      <View style={styles.headerFixed}>
        <Text style={styles.title}>{t('auth.loginTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.loginSubtitle')}</Text>
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

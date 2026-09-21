import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { authClient } from '@/api/auth-client';
import { useUITheme } from '@/ui/theme';
import { uiFontFamily } from '@/ui/theme/fonts';

export default function LoginScreen() {
  const { t } = useTranslation();
  const theme = useUITheme();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const sendCode = async () => {
    if (!emailValid || isLoading) return;
    setIsLoading(true);
    setError(null);
    const { error: otpError } = await authClient.emailOtp.sendVerificationOtp({
      email: email.trim().toLowerCase(),
      type: 'sign-in',
    });
    setIsLoading(false);
    if (otpError) {
      setError(t('common.error'));
      return;
    }
    router.push({ pathname: '/(auth)/verify', params: { email: email.trim().toLowerCase() } });
  };

  return (
    <KeyboardAvoidingView
      style={styles.canvas}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.hudFrame}>
        <Text style={styles.title}>{t('auth.loginTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.loginSubtitle')}</Text>

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder={t('auth.emailPlaceholder')}
          placeholderTextColor={theme.semantic.fg.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          autoFocus
          editable={!isLoading}
          onSubmitEditing={sendCode}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            (!emailValid || isLoading) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
          onPress={sendCode}
          disabled={!emailValid || isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? t('auth.sendingCode') : t('auth.sendCode')}
          </Text>
        </Pressable>
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
    gap: 16,
  },
  title: {
    fontFamily: uiFontFamily.display,
    fontSize: 40,
    letterSpacing: 6,
    color: '#e2e8f0',
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: uiFontFamily.ui.regular,
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.3)',
    backgroundColor: 'rgba(11, 13, 16, 0.8)',
    color: '#e2e8f0',
    fontFamily: uiFontFamily.ui.regular,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  error: {
    color: '#ef4444',
    fontFamily: uiFontFamily.ui.regular,
    fontSize: 13,
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
});

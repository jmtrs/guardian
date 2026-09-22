import React from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import type { TFunction } from 'i18next';

import { HUDButton } from '@/ui/composites/HUDButton';
import type { UITheme } from '@/ui/theme';

type OtpVerifyFormStyles = {
  form: object;
  label: object;
  input: object;
  resendButton: object;
  resendButtonDisabled: object;
  resendButtonText: object;
  errorText?: object;
};

type OtpVerifyFormProps = {
  code: string;
  isLoading: boolean;
  isResending: boolean;
  resendDisabled: boolean;
  resendLabel: string;
  verifyLabel: string;
  label: string;
  placeholder: string;
  testId?: string;
  error?: string;
  styles: OtpVerifyFormStyles;
  theme: UITheme;
  t: TFunction;
  onCodeChange: (text: string) => void;
  onVerify: () => void;
  onResendCode: () => void;
};

export function OtpVerifyForm({
  code,
  isLoading,
  isResending,
  resendDisabled,
  resendLabel,
  verifyLabel,
  label,
  placeholder,
  testId,
  error,
  styles,
  theme,
  t,
  onCodeChange,
  onVerify,
  onResendCode,
}: OtpVerifyFormProps) {
  const platformAutofillProps = Platform.OS === 'ios' ? { textContentType: 'oneTimeCode' as const } : {};

  return (
    <View style={styles.form}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={code}
        onChangeText={onCodeChange}
        placeholder={placeholder}
        placeholderTextColor={theme.semantic.fg.muted}
        cursorColor={theme.semantic.accent.warning}
        selectionColor={theme.semantic.accent.warning}
        keyboardType="number-pad"
        maxLength={6}
        autoCapitalize="none"
        autoCorrect={false}
        textAlign="center"
        importantForAutofill="yes"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={onVerify}
        editable={!isLoading}
        {...platformAutofillProps}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <HUDButton
        label={isLoading ? t('auth.verifying') : verifyLabel}
        onPress={onVerify}
        loading={isLoading}
      />

      <Pressable
        style={[styles.resendButton, resendDisabled && styles.resendButtonDisabled]}
        onPress={onResendCode}
        disabled={resendDisabled || isResending}
        testID={testId}
      >
        <Text style={styles.resendButtonText}>{resendLabel}</Text>
      </Pressable>
    </View>
  );
}

import type { TFunction } from 'i18next';

export const OTP_RESEND_COOLDOWN_SECONDS = 30;

export function getOtpResendDisabled(
  isLoading: boolean,
  isResending: boolean,
  resendCooldownSeconds: number
): boolean {
  return isLoading || isResending || resendCooldownSeconds > 0;
}

export function getOtpResendLabel(
  t: TFunction,
  resendCooldownSeconds: number,
  countdownKey: string,
  resendKey: string
): string {
  if (resendCooldownSeconds > 0) {
    return t(countdownKey, { seconds: resendCooldownSeconds });
  }

  return t(resendKey);
}

export function decrementOtpCooldown(seconds: number): number {
  return seconds > 0 ? seconds - 1 : 0;
}

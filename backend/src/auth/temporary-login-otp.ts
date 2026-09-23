export type TemporaryLoginOtp = {
  email: string;
  code: string;
};

export function readTemporaryLoginOtp(): TemporaryLoginOtp | undefined {
  const email = process.env.TEMP_LOGIN_OTP_EMAIL?.trim().toLowerCase();
  const code = process.env.TEMP_LOGIN_OTP_CODE?.trim();

  if (!email && !code) {
    return undefined;
  }
  if (!email || !code) {
    throw new Error('TEMP_LOGIN_OTP_EMAIL and TEMP_LOGIN_OTP_CODE must be configured together');
  }
  if (!/^\d{6}$/.test(code)) {
    throw new Error('TEMP_LOGIN_OTP_CODE must contain exactly 6 digits');
  }

  return { email, code };
}

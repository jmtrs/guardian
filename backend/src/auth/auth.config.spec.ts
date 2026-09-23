import { readTemporaryLoginOtp } from './temporary-login-otp';

describe('temporary production login OTP', () => {
  const originalEmail = process.env.TEMP_LOGIN_OTP_EMAIL;
  const originalCode = process.env.TEMP_LOGIN_OTP_CODE;

  afterEach(() => {
    if (originalEmail === undefined) delete process.env.TEMP_LOGIN_OTP_EMAIL;
    else process.env.TEMP_LOGIN_OTP_EMAIL = originalEmail;
    if (originalCode === undefined) delete process.env.TEMP_LOGIN_OTP_CODE;
    else process.env.TEMP_LOGIN_OTP_CODE = originalCode;
  });

  it('stays disabled when neither value is configured', () => {
    delete process.env.TEMP_LOGIN_OTP_EMAIL;
    delete process.env.TEMP_LOGIN_OTP_CODE;

    expect(readTemporaryLoginOtp()).toBeUndefined();
  });

  it('normalizes the allowlisted email and accepts a six-digit secret', () => {
    process.env.TEMP_LOGIN_OTP_EMAIL = '  Owner@Example.com ';
    process.env.TEMP_LOGIN_OTP_CODE = ' 482731 ';

    expect(readTemporaryLoginOtp()).toEqual({ email: 'owner@example.com', code: '482731' });
  });

  it.each([
    ['owner@example.com', undefined],
    [undefined, '482731'],
    ['owner@example.com', '00000'],
    ['owner@example.com', 'abcdef'],
  ])('fails closed for an incomplete or invalid configuration', (email, code) => {
    if (email === undefined) delete process.env.TEMP_LOGIN_OTP_EMAIL;
    else process.env.TEMP_LOGIN_OTP_EMAIL = email;
    if (code === undefined) delete process.env.TEMP_LOGIN_OTP_CODE;
    else process.env.TEMP_LOGIN_OTP_CODE = code;

    expect(() => readTemporaryLoginOtp()).toThrow();
  });
});

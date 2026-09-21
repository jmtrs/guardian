import type { Translation } from './es';

export const en: Translation = {
  common: {
    loading: 'Loading...',
    error: 'Error',
    retry: 'Retry',
    cancel: 'Cancel',
  },
  auth: {
    loginTitle: 'Guardian',
    loginSubtitle: 'Sign in with your email',
    emailLabel: 'Email',
    emailPlaceholder: 'you@email.com',
    sendCode: 'Send code',
    resendCode: 'Resend code',
    verifying: 'Verifying...',
    verifyTitle: 'Enter the code',
    verifySubtitle: 'We sent you a 6-digit code',
    invalidCode: 'Invalid code',
    logout: 'Sign out',
  },
  home: {
    title: 'Guardian',
    statusArmed: 'ARMED',
    statusTrip: 'TRIP AUTHORIZED',
    statusAlert: 'ALERT',
    startTrip: 'Start trip',
    endTrip: 'End trip',
    events: 'Recent events',
    noEvents: 'No events',
  },
};

import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';
import { emailOTPClient } from 'better-auth/client/plugins';

import { getApiBaseUrl } from './config';

/**
 * Better Auth cliente Expo. El scheme "guardian" debe coincidir con
 * app.json -> expo.scheme. Sesiones persisten en SecureStore con el
 * storagePrefix (cookie emulada, no AsyncStorage plano).
 */
export const authClient = createAuthClient({
  ...expoClient({
    scheme: 'guardian',
    storagePrefix: 'guardian-auth',
    storage: SecureStore,
  }),
  baseURL: `${getApiBaseUrl()}`,
  plugins: [emailOTPClient()],
});

export type AuthUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  name?: string | null;
};

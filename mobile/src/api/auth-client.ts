import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import { emailOTPClient } from 'better-auth/client/plugins';
import * as SecureStore from 'expo-secure-store';

import { getApiBaseUrl } from './config';

/**
 * Better Auth cliente Expo. El scheme "guardian" debe coincidir con
 * app.json -> expo.scheme. Sesiones persisten en SecureStore con el
 * storagePrefix (cookie emulada, no AsyncStorage plano).
 * getCookie() (accion del plugin expo) inyecta la cookie en axios.
 */
export const authClient = createAuthClient({
  baseURL: getApiBaseUrl(),
  plugins: [
    expoClient({
      scheme: 'guardian',
      storagePrefix: 'guardian-auth',
      storage: SecureStore,
    }),
    emailOTPClient(),
  ],
});

export type AuthUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  name?: string | null;
};

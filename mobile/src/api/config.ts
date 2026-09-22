import Constants from 'expo-constants';

/**
 * Get API base URL from environment or fallback to localhost
 */
export const getApiBaseUrl = (): string => {
  // EXPO_PUBLIC_* se inlinea en el bundle en build time (babel);
  // extra solo vale si se define en app.json.
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) {
    return envUrl;
  }
  const extra = Constants.expoConfig?.extra || {};
  const extraUrl = extra.EXPO_PUBLIC_API_URL as string | undefined;
  if (extraUrl) {
    return extraUrl;
  }
  return 'http://localhost:3000';
};

/**
 * API timeout in milliseconds
 */
export const API_TIMEOUT = 10000;

import Constants from 'expo-constants';

/**
 * Get API base URL from environment or fallback to localhost
 */
export const getApiBaseUrl = (): string => {
  const extra = Constants.expoConfig?.extra || {};
  const envUrl = extra.EXPO_PUBLIC_API_URL as string | undefined;
  if (envUrl) {
    return envUrl;
  }
  return 'http://localhost:3000';
};

/**
 * API timeout in milliseconds
 */
export const API_TIMEOUT = 10000;

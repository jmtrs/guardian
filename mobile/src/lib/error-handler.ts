import { TFunction } from 'i18next';

/**
 * Maps backend error codes to translated messages
 * @param error - Error object from axios or backend response
 * @param t - Translation function
 * @returns Translated error message
 */
export function getErrorMessage(error: unknown, t: TFunction): string {
  // Axios error with backend response
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as {
      response?: {
        status?: number;
        data?: {
          message?: string | string[];
          statusCode?: number;
          error?: string;
        };
      };
    };
    const responseStatus = axiosError.response?.status ?? axiosError.response?.data?.statusCode;
    const backendMessage = axiosError.response?.data?.message;
    const backendCode = Array.isArray(backendMessage) ? backendMessage[0] : backendMessage;

    if (
      responseStatus === 429 ||
      backendCode === 'RATE_LIMIT_EXCEEDED' ||
      backendCode?.includes('Too Many Requests') ||
      backendCode?.includes('ThrottlerException')
    ) {
      return t('errors.RATE_LIMIT_EXCEEDED');
    }

    if (backendCode && typeof backendCode === 'string') {
      // Try to translate backend error code
      const translated = t(`errors.${backendCode}`, { defaultValue: backendCode });
      if (translated !== backendCode) {
        return translated;
      }
    }
  }

  // Network errors
  if (error && typeof error === 'object' && 'code' in error) {
    const networkError = error as { code?: string; message?: string };
    if (networkError.code === 'NETWORK_ERROR' || networkError.code === 'ECONNREFUSED') {
      return t('errors.networkError');
    }

    if (typeof networkError.message === 'string' && networkError.message.trim()) {
      return networkError.message;
    }
  }

  // Default to generic error
  return t('errors.generic');
}

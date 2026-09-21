import { getErrorMessage } from '../error-handler';
import type { TFunction } from 'i18next';

const mockT = ((key: string, options?: any) => {
  if (options?.defaultValue) {
    return key;
  }
  return key;
}) as unknown as TFunction;

describe('error-handler', () => {
  describe('getErrorMessage', () => {
    it('returns translated error message from backend', () => {
      const error = {
        response: {
          data: {
            message: 'ALIAS_ALREADY_TAKEN',
          },
        },
      };

      const message = getErrorMessage(error, mockT);

      expect(message).toBe('errors.ALIAS_ALREADY_TAKEN');
    });

    it('returns generic error message for unknown errors', () => {
      const error = new Error('Unknown error');

      const message = getErrorMessage(error, mockT);

      expect(message).toBe('errors.generic');
    });

    it('handles network errors with ECONNREFUSED code', () => {
      const error = {
        code: 'ECONNREFUSED',
      };

      const message = getErrorMessage(error, mockT);

      expect(message).toBe('errors.networkError');
    });

    it('handles errors without response object', () => {
      const error = {
        message: 'Some error',
      };

      const message = getErrorMessage(error, mockT);

      expect(message).toBe('errors.generic');
    });

    it('uses message from response data if available', () => {
      const error = {
        response: {
          data: {
            message: 'INVALID_ALIAS',
          },
        },
      };

      const message = getErrorMessage(error, mockT);

      expect(message).toBe('errors.INVALID_ALIAS');
    });

    it('maps any 429 response to RATE_LIMIT_EXCEEDED', () => {
      const error = {
        response: {
          status: 429,
          data: {
            message: 'Too Many Requests',
          },
        },
      };

      const message = getErrorMessage(error, mockT);

      expect(message).toBe('errors.RATE_LIMIT_EXCEEDED');
    });

    it('handles throttler messages returned by Nest', () => {
      const error = {
        response: {
          data: {
            statusCode: 429,
            message: 'ThrottlerException: Too Many Requests',
          },
        },
      };

      const message = getErrorMessage(error, mockT);

      expect(message).toBe('errors.RATE_LIMIT_EXCEEDED');
    });

    it('handles array messages from backend validation/error shapes', () => {
      const error = {
        response: {
          data: {
            statusCode: 429,
            message: ['Too Many Requests'],
          },
        },
      };

      const message = getErrorMessage(error, mockT);

      expect(message).toBe('errors.RATE_LIMIT_EXCEEDED');
    });
  });
});

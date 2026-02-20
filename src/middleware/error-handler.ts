import type { Context, Next } from 'hono';
import { ProviderError } from '../types/errors.js';
import type { UnifiedErrorResponse } from '../types/errors.js';
import { logger } from '../utils/logger.js';

export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (err) {
    logger.error('Request error:', err);

    let status = 500;
    let errorResponse: UnifiedErrorResponse;

    if (err instanceof ProviderError) {
      status = err.statusCode;
      errorResponse = {
        error: {
          message: err.message,
          type: 'provider_error',
          code: err.providerType || null,
          param: null,
        },
      };
    } else if (err instanceof Error) {
      errorResponse = {
        error: {
          message: err.message,
          type: 'internal_error',
          code: null,
          param: null,
        },
      };
    } else {
      errorResponse = {
        error: {
          message: 'An unexpected error occurred',
          type: 'internal_error',
          code: null,
          param: null,
        },
      };
    }

    return c.json(errorResponse, status as any);
  }
}

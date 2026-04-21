import {
  ERROR_CODES,
  ERROR_MESSAGES,
  type BilingualMessage,
  type ErrorCode,
} from '@/constants/errors';
import { type HttpStatus } from '@/constants/http';

export interface ApiMeta {
  [key: string]: unknown;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: ApiMeta;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: BilingualMessage;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function apiSuccess<T>(data: T, meta?: ApiMeta): ApiSuccess<T> {
  return meta === undefined
    ? { success: true, data }
    : { success: true, data, meta };
}

/**
 * Typed error carrier thrown by feature code and caught by the global error
 * handler. The handler converts it into an ApiFailure response using the
 * attached HTTP status.
 */
export class ApiError extends Error {
  public readonly code: ErrorCode | string;
  public readonly status: HttpStatus;
  public readonly details?: unknown;

  constructor(code: ErrorCode | string, status: HttpStatus, details?: unknown) {
    super(typeof code === 'string' ? code : String(code));
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  public toResponse(): ApiFailure {
    return apiError(this.code, this.details);
  }
}

export function apiError(code: ErrorCode | string, details?: unknown): ApiFailure {
  const message =
    (ERROR_MESSAGES as Record<string, BilingualMessage>)[code] ??
    ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR];

  const payload: ApiFailure = {
    success: false,
    error: {
      code,
      message,
    },
  };

  if (details !== undefined) {
    payload.error.details = details;
  }

  return payload;
}

/**
 * Convenience factory: throw a structured error from inside a handler/service.
 *
 *   throw createApiError(ERROR_CODES.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
 */
export function createApiError(
  code: ErrorCode | string,
  status: HttpStatus,
  details?: unknown,
): ApiError {
  return new ApiError(code, status, details);
}

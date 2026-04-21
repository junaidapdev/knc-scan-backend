import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { HTTP_STATUS } from '@/constants/http';
import { ERROR_CODES } from '@/constants/errors';
import { ApiError, apiError } from '@/lib/apiResponse';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { env } from '@/config/env';

function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const isProduction = env.NODE_ENV === 'production';

  if (isApiError(err)) {
    logger.warn('Handled ApiError', {
      code: err.code,
      status: err.status,
      path: req.path,
      method: req.method,
      request_id: req.request_id,
    });
    // Only 5xx ApiErrors flow to Sentry — 4xx are client errors and would
    // flood the backend queue without signal.
    if (err.status >= 500) {
      captureException(err, {
        request_id: req.request_id,
        path: req.path,
        method: req.method,
        status: err.status,
        code: err.code,
      });
    }
    res.status(err.status).json(err.toResponse());
    return;
  }

  if (err instanceof ZodError) {
    logger.warn('Unhandled ZodError', {
      path: req.path,
      method: req.method,
      issues: err.issues,
    });
    res
      .status(HTTP_STATUS.UNPROCESSABLE_ENTITY)
      .json(
        apiError(ERROR_CODES.VALIDATION_FAILED, {
          issues: err.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        }),
      );
    return;
  }

  // Unknown / unexpected error
  const stack = err instanceof Error ? err.stack : undefined;
  const message = err instanceof Error ? err.message : String(err);

  logger.error('Unhandled error', {
    path: req.path,
    method: req.method,
    message,
    stack,
    request_id: req.request_id,
  });

  captureException(err, {
    request_id: req.request_id,
    path: req.path,
    method: req.method,
    status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
  });

  const responseBody = apiError(
    ERROR_CODES.INTERNAL_ERROR,
    isProduction ? undefined : { message, stack },
  );

  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(responseBody);
};

/**
 * 404 fallback — mounted just before errorHandler so unmatched routes produce
 * a consistent ApiResponse shape instead of Express's default HTML.
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(HTTP_STATUS.NOT_FOUND).json(
    apiError(ERROR_CODES.NOT_FOUND, {
      path: req.path,
      method: req.method,
    }),
  );
};

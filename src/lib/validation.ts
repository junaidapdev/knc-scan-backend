import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { HTTP_STATUS } from '@/constants/http';
import { ERROR_CODES } from '@/constants/errors';
import { apiError, createApiError } from './apiResponse';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

interface FormattedIssue {
  path: string;
  message: string;
}

function formatZodError(err: ZodError): FormattedIssue[] {
  return err.issues.map((i) => ({
    path: i.path.join('.'),
    message: i.message,
  }));
}

/**
 * Parse arbitrary input with a Zod schema. Throws an ApiError (422) on failure
 * so the global error handler produces a consistent response.
 */
export function parseOrThrow<T extends ZodTypeAny>(
  schema: T,
  input: unknown,
): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw createApiError(
      ERROR_CODES.VALIDATION_FAILED,
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      { issues: formatZodError(result.error) },
    );
  }
  return result.data;
}

/**
 * Express middleware: validates body/params/query against the provided Zod
 * schemas and replaces the request properties with their parsed (typed)
 * versions. Returns a 422 apiError response on any failure.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      if (schemas.query) {
        // Express 5 makes req.query a getter; reassigning is still allowed in
        // Express 4. We cast to unknown to keep the type system honest.
        (req as unknown as { query: unknown }).query = schemas.query.parse(
          req.query,
        );
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res
          .status(HTTP_STATUS.UNPROCESSABLE_ENTITY)
          .json(
            apiError(ERROR_CODES.VALIDATION_FAILED, {
              issues: formatZodError(err),
            }),
          );
        return;
      }
      next(err);
    }
  };
}

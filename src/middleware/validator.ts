import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { HTTP_STATUS } from '@/constants/http';
import { ERROR_CODES } from '@/constants/errors';
import { apiError } from '@/lib/apiResponse';

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
        (req as unknown as { query: unknown }).query = schemas.query.parse(
          req.query,
        );
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res
          .status(HTTP_STATUS.BAD_REQUEST)
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

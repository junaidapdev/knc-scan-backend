import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { createApiError } from '@/lib/apiResponse';
import { verifyAdminToken } from '@/lib/jwt';
import { ERROR_CODES } from '@/constants/errors';
import { HTTP_STATUS } from '@/constants/http';

/**
 * JWT-based admin auth (Chunk 6).
 *
 * Expects `Authorization: Bearer <admin_token>` signed with
 * ADMIN_SESSION_SECRET (scope: 'admin', 8h TTL). Sets `req.admin` for
 * downstream handlers and audit logging.
 */
export function requireAdmin(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      next(
        createApiError(ERROR_CODES.ADMIN_AUTH_REQUIRED, HTTP_STATUS.UNAUTHORIZED, {
          message: 'Missing or malformed admin authorization header',
        }),
      );
      return;
    }
    const token = authHeader.slice('Bearer '.length);
    try {
      const payload = verifyAdminToken(token);
      req.admin = payload;
      next();
    } catch (err) {
      next(err);
    }
  };
}

import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from '@/config/env';
import { createApiError } from './apiResponse';
import { ERROR_CODES } from '@/constants/errors';
import { HTTP_STATUS } from '@/constants/http';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

const SECRET = env.JWT_SECRET;
const ADMIN_SECRET = env.ADMIN_SESSION_SECRET;

export interface TokenPayload {
  customerId?: string; // Opt for pre-registration
  phone: string;
  scope: 'registration' | 'session' | 'scan';
}

export interface RedemptionTokenPayload {
  scope: 'redemption';
  unique_code: string;
  customer_id: string;
  branch_id: string;
}

export function signRegistrationToken(payload: Pick<TokenPayload, 'phone'>): string {
  return jwt.sign({ ...payload, scope: 'registration' }, SECRET, { expiresIn: '15m' });
}

export function signSessionToken(payload: Omit<TokenPayload, 'scope'>): string {
  return jwt.sign({ ...payload, scope: 'session' }, SECRET, { expiresIn: '90d' });
}

/**
 * Short-lived token issued by POST /visits/scan/lookup for returning customers.
 * Authorizes exactly one subsequent POST /visits/scan call — 5 min TTL means a
 * customer can't reuse an old lookup indefinitely.
 */
export function signScanToken(
  payload: { phone: string; customerId: string },
): string {
  return jwt.sign({ ...payload, scope: 'scan' }, SECRET, { expiresIn: '5m' });
}

/**
 * 2-minute JWT issued by the reward step-1 endpoint. The step-2 handler
 * requires it in addition to the customer session token — proves step 1
 * just happened and binds the redemption to a specific branch.
 */
export function signRedemptionToken(payload: Omit<RedemptionTokenPayload, 'scope'>): string {
  return jwt.sign({ ...payload, scope: 'redemption' }, SECRET, { expiresIn: '2m' });
}

export function verifyRedemptionToken(token: string): RedemptionTokenPayload {
  try {
    const payload = jwt.verify(token, SECRET) as JwtPayload & RedemptionTokenPayload;
    if (payload.scope !== 'redemption') {
      throw new Error('Wrong scope');
    }
    return {
      scope: 'redemption',
      unique_code: payload.unique_code,
      customer_id: payload.customer_id,
      branch_id: payload.branch_id,
    };
  } catch (err) {
    throw createApiError(
      ERROR_CODES.INVALID_REDEMPTION_TOKEN,
      HTTP_STATUS.UNAUTHORIZED,
      { message: 'Invalid or expired redemption token' },
    );
  }
}

export interface AdminTokenPayload {
  scope: 'admin';
  admin_id: string;
  email: string;
  role: 'admin' | 'viewer';
}

/**
 * 8h session JWT issued by POST /admin/auth/login. Signed with a SEPARATE
 * secret (ADMIN_SESSION_SECRET) so a leaked customer JWT_SECRET can't be used
 * to forge admin tokens, and vice versa. Consumed exclusively by the
 * requireAdmin middleware.
 */
export function signAdminToken(payload: Omit<AdminTokenPayload, 'scope'>): string {
  return jwt.sign({ ...payload, scope: 'admin' }, ADMIN_SECRET, { expiresIn: '8h' });
}

export function verifyAdminToken(token: string): AdminTokenPayload {
  try {
    const payload = jwt.verify(token, ADMIN_SECRET) as JwtPayload & AdminTokenPayload;
    if (payload.scope !== 'admin') {
      throw new Error('Wrong scope');
    }
    return {
      scope: 'admin',
      admin_id: payload.admin_id,
      email: payload.email,
      role: payload.role,
    };
  } catch (err) {
    throw createApiError(ERROR_CODES.ADMIN_AUTH_REQUIRED, HTTP_STATUS.UNAUTHORIZED, {
      message: 'Invalid or expired admin token',
    });
  }
}

export function verifyToken(token: string): TokenPayload {
  try {
    const payload = jwt.verify(token, SECRET) as JwtPayload & TokenPayload;
    return { customerId: payload.customerId, phone: payload.phone, scope: payload.scope };
  } catch (err) {
    throw createApiError(ERROR_CODES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED, {
      message: 'Invalid or expired token',
    });
  }
}

declare global {
  namespace Express {
    interface Request {
      customer?: TokenPayload;
      admin?: AdminTokenPayload;
    }
  }
}

export function requireAuth(allowedScopes: TokenPayload['scope'][]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      next(
        createApiError(ERROR_CODES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED, {
          message: 'Missing or malformed authorization header',
        }),
      );
      return;
    }

    const token = authHeader.split(' ')[1];
    
    try {
      const payload = verifyToken(token);
      
      if (!allowedScopes.includes(payload.scope)) {
        next(
          createApiError(ERROR_CODES.FORBIDDEN, HTTP_STATUS.FORBIDDEN, {
            message: `Insufficient token scope. Required: ${allowedScopes.join(' or ')}`,
          }),
        );
        return;
      }

      req.customer = payload;
      next();
    } catch (err) {
      next(err);
    }
  };
}

import rateLimit, { type Options } from 'express-rate-limit';
import type { Request, Response } from 'express';

import { apiError } from '@/lib/apiResponse';
import { logger } from '@/lib/logger';
import { HTTP_STATUS } from '@/constants/http';
import { ERROR_CODES } from '@/constants/errors';

// Lockout windows centralised so tests and docs can reason about them without
// recomputing milliseconds.
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

/**
 * Shared 429 handler. Emits the canonical ApiResponse envelope with
 * ERROR_CODES.RATE_LIMITED so clients can reuse a single branch for every
 * rate-limiter we deploy.
 */
function rateLimitHandler(req: Request, res: Response): void {
  logger.warn('Rate limit exceeded', {
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
    request_id: req.request_id,
  });
  res
    .status(HTTP_STATUS.TOO_MANY_REQUESTS)
    .json(apiError(ERROR_CODES.RATE_LIMITED));
}

const baseOptions: Partial<Options> = {
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
};

/**
 * Per-IP cap on OTP requests. Prevents a single host from exhausting the SMS
 * budget across many phone numbers. Complements the per-phone in-DB throttle
 * in auth.controller.
 */
export const otpPerIpLimiter = rateLimit({
  ...baseOptions,
  windowMs: MS_PER_HOUR,
  limit: 10,
});

/**
 * Per-phone limiter for OTP requests as a belt-and-suspenders check alongside
 * the pre-existing DB-level 3-per-10-min throttle.
 */
export const otpPerPhoneLimiter = rateLimit({
  ...baseOptions,
  windowMs: 10 * MS_PER_MINUTE,
  limit: 3,
  keyGenerator: (req: Request): string => {
    const phone =
      typeof req.body === 'object' && req.body !== null
        ? ((req.body as Record<string, unknown>).phone as string | undefined)
        : undefined;
    return phone ?? req.ip ?? 'unknown';
  },
});

/**
 * Per-IP lookup limiter. The DB-backed ladder in visit.service already does a
 * finer-grained 10/min hard-stop; this middleware is a coarse front-line
 * defence that short-circuits before we touch the DB.
 */
export const scanLookupLimiter = rateLimit({
  ...baseOptions,
  windowMs: MS_PER_MINUTE,
  limit: 10,
});

/**
 * Per-IP throttle on admin login attempts. Matches the per-account throttle
 * enforced inside auth.service but caps chain-wide attempts from one IP as
 * well, so a single host can't spray credentials across many accounts.
 */
export const adminLoginLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * MS_PER_MINUTE,
  limit: 5,
});

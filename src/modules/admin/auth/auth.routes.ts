import { Router } from 'express';
import { validate } from '@/middleware/validator';
import { requireAdmin } from '@/middleware/requireAdmin';
import { adminLoginLimiter } from '@/middleware/rateLimiters';
import { adminAuthValidators } from './auth.validators';
import * as auth from './auth.controller';

const router = Router();

// Public — no auth required. Issues the admin JWT. Per-IP limiter matches the
// per-account throttle inside auth.service (5 attempts / 15 min) so a single
// host can't spray credentials across many accounts.
router.post(
  '/login',
  adminLoginLimiter,
  validate(adminAuthValidators.login),
  auth.login,
);

// Authenticated — everything below requires a valid admin token.
router.post('/logout', requireAdmin(), auth.logout);
router.get('/me', requireAdmin(), auth.me);

export { router as adminAuthRoutes };

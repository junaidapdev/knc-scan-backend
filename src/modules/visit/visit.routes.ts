import { Router } from 'express';

import { validate } from '@/middleware/validator';
import { requireAuth } from '@/lib/jwt';
import { scanLookupLimiter } from '@/middleware/rateLimiters';

import { visitValidators } from './visit.validators';
import { scan, scanLookup } from './visit.controller';

const router = Router();

// Unauthenticated — returning-customer recognition. Rate-limited first by a
// coarse express-rate-limit 10/min/IP gate (short-circuits before DB touch),
// then by the finer DB ladder in visit.service#recordLookupAndCheckLimits.
router.post(
  '/scan/lookup',
  scanLookupLimiter,
  validate(visitValidators.scanLookup),
  scanLookup,
);

// Accepts either the 5-minute scan token from /scan/lookup OR a long-lived
// session token from a previous OTP verification.
router.post(
  '/scan',
  requireAuth(['scan', 'session']),
  validate(visitValidators.scan),
  scan,
);

export const visitRoutes = router;

import { Router } from 'express';
import { validate } from '@/middleware/validator';
import {
  otpPerIpLimiter,
  otpPerPhoneLimiter,
} from '@/middleware/rateLimiters';
import { authValidators } from './auth.validators';
import { requestOtp, verifyOtp } from './auth.controller';

const router = Router();

// IP limiter runs first so a single host can't blow the SMS budget even by
// rotating phone numbers; phone limiter runs second so we don't rate-limit a
// phone whose traffic was actually legitimate on another IP.
router.post(
  '/otp/request',
  otpPerIpLimiter,
  otpPerPhoneLimiter,
  validate(authValidators.requestOtp),
  requestOtp,
);
router.post('/otp/verify', validate(authValidators.verifyOtp), verifyOtp);

export const authRoutes = router;

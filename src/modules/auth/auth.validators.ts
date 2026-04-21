import { z } from 'zod';
import { SAUDI_PHONE_REGEX } from '@/constants/business';

export const requestOtpSchema = z.object({
  phone: z.string().regex(SAUDI_PHONE_REGEX, 'Must be a valid Saudi E.164 number (+9665XXXXXXXX)'),
});

export const verifyOtpSchema = z.object({
  phone: z.string().regex(SAUDI_PHONE_REGEX, 'Must be a valid Saudi E.164 number (+9665XXXXXXXX)'),
  otp: z.string().length(4, 'OTP must be 4 digits').regex(/^\d+$/, 'OTP must contain only digits'),
});

export const authValidators = {
  requestOtp: { body: requestOtpSchema },
  verifyOtp: { body: verifyOtpSchema },
};

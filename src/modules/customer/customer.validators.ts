import { z } from 'zod';
import { SAUDI_PHONE_REGEX } from '@/constants/business';

export const registerSchema = z.object({
  phone: z.string().regex(SAUDI_PHONE_REGEX, 'Must be a valid Saudi E.164 number (+9665XXXXXXXX)'),
  name: z.string().min(2),
  birthday_month: z.number().int().min(1).max(12),
  birthday_day: z.number().int().min(1).max(31),
  preferred_branch_id: z.string().uuid(),
  language: z.enum(['ar', 'en']),
  consent_marketing: z.literal(true),
  branch_scan_id: z.string().uuid(),
});

export const customerValidators = {
  register: { body: registerSchema },
};

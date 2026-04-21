import { z } from 'zod';
import { SAUDI_PHONE_REGEX } from '@/constants/business';

export const scanLookupSchema = z.object({
  phone: z
    .string()
    .regex(SAUDI_PHONE_REGEX, 'Must be a valid Saudi E.164 number (+9665XXXXXXXX)'),
});

export const scanSchema = z.object({
  branch_qr_identifier: z.string().min(1).max(64),
  bill_amount: z
    .number()
    .refine((n) => Number.isFinite(n), 'bill_amount must be a finite number')
    .refine((n) => n >= 1 && n <= 9999, 'bill_amount must be between 1 and 9999 SAR'),
  device_fingerprint: z.string().max(256).optional(),
});

export const visitValidators = {
  scanLookup: { body: scanLookupSchema },
  scan: { body: scanSchema },
};

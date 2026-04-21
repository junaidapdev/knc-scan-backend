import { z } from 'zod';

const step1 = z.object({
  branch_qr_identifier: z.string().min(1).max(64),
});

const step2 = z.object({
  branch_qr_identifier: z.string().min(1).max(64),
  device_fingerprint: z.string().max(256).optional(),
});

const uniqueCodeParam = z.object({
  unique_code: z
    .string()
    .min(3)
    .max(64)
    .regex(
      /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)+$/i,
      'unique_code must match <prefix>-<segment>[-<segment>...]',
    ),
});

export const issuedValidators = {
  step1: { body: step1, params: uniqueCodeParam },
  step2: { body: step2, params: uniqueCodeParam },
};

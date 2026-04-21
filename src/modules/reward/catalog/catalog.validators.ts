import { z } from 'zod';

// Pattern: uppercase word(s) joined by hyphens. Examples: BOX, BOX-FAHADAH.
const CODE_PREFIX_PATTERN = /^[A-Z]+(-[A-Z]+)*$/;

const statusEnum = z.enum(['active', 'paused', 'archived']);

const createSchema = z.object({
  code_prefix: z
    .string()
    .min(2)
    .max(40)
    .regex(CODE_PREFIX_PATTERN, 'code_prefix must match [A-Z]+(-[A-Z]+)*'),
  name_en: z.string().min(1).max(120),
  name_ar: z.string().min(1).max(120),
  description_en: z.string().max(500).optional(),
  description_ar: z.string().max(500).optional(),
  image_url: z.string().url().max(500).optional(),
  estimated_value_sar: z.number().nonnegative().max(100000),
  default_expiry_days: z.number().int().positive().max(3650),
  status: statusEnum.optional(),
});

const updateSchema = z
  .object({
    name_en: z.string().min(1).max(120).optional(),
    name_ar: z.string().min(1).max(120).optional(),
    description_en: z.string().max(500).nullable().optional(),
    description_ar: z.string().max(500).nullable().optional(),
    image_url: z.string().url().max(500).nullable().optional(),
    estimated_value_sar: z.number().nonnegative().max(100000).optional(),
    default_expiry_days: z.number().int().positive().max(3650).optional(),
    status: statusEnum.optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: 'At least one field must be provided',
  });

const idParam = z.object({ id: z.string().uuid() });

const listQuery = z.object({
  status: statusEnum.optional(),
});

export const catalogValidators = {
  create: { body: createSchema },
  update: { body: updateSchema, params: idParam },
  idParam: { params: idParam },
  list: { query: listQuery },
};

export { CODE_PREFIX_PATTERN };

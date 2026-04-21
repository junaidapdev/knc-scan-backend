import { z } from 'zod';

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
  status: z.enum(['pending', 'redeemed', 'expired']).optional(),
  customer_id: z.string().uuid().optional(),
  catalog_id: z.string().uuid().optional(),
  include_voided: z
    .union([z.literal('true'), z.literal('false')])
    .optional(),
  voided_only: z
    .union([z.literal('true'), z.literal('false')])
    .optional(),
});

const idParam = z.object({ id: z.string().uuid() });

const voidBody = z.object({
  reason: z.string().min(3).max(500),
});

export const adminRewardValidators = {
  list: { query: listQuery },
  idParam: { params: idParam },
  void: { params: idParam, body: voidBody },
};

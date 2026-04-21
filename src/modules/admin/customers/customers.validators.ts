import { z } from 'zod';

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().max(120).optional(),
  tier: z.enum(['standard', 'silver', 'gold']).optional(),
  language: z.enum(['ar', 'en']).optional(),
  sort: z
    .enum([
      'created_at.desc',
      'created_at.asc',
      'last_scan_at.desc',
      'total_visits.desc',
      'total_self_reported_spend_sar.desc',
    ])
    .default('created_at.desc'),
});

const idParam = z.object({ id: z.string().uuid() });

export const customerAdminValidators = {
  list: { query: listQuery },
  idParam: { params: idParam },
};

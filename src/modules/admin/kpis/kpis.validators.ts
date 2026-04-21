import { z } from 'zod';

const timeseriesQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  branch_id: z.string().uuid().optional(),
});

export const kpiValidators = {
  timeseries: { query: timeseriesQuery },
};

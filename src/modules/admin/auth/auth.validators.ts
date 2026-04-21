import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

export const adminAuthValidators = {
  login: { body: loginSchema },
};

import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  SMS_PROVIDER_API_KEY: z.string().min(1),
  SMS_PROVIDER_SENDER_ID: z.string().min(1),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  ADMIN_SESSION_SECRET: z
    .string()
    .min(16, 'ADMIN_SESSION_SECRET must be at least 16 characters'),

  // Legacy shared-secret from pre-Chunk 6 placeholder requireAdmin. No longer
  // read by runtime code (Chunk 6 replaced it with JWT auth) but kept as
  // optional so existing .env files don't blow up. Safe to delete.
  ADMIN_PLACEHOLDER_KEY: z.string().optional(),

  // Single-admin bootstrap. If both are set AND no admin rows exist yet, the
  // server inserts one `admin_users` row on startup. Leave unset in
  // environments where the admin was provisioned manually.
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z
    .string()
    .min(12, 'ADMIN_BOOTSTRAP_PASSWORD must be at least 12 characters')
    .optional(),
  ADMIN_BOOTSTRAP_NAME: z.string().min(1).optional(),

  CORS_ALLOWED_ORIGINS: z
    .string()
    .min(1)
    .transform((val) =>
      val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),

  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'debug'])
    .default('info'),

  // Sentry — all optional. When SENTRY_DSN is unset, Sentry is a no-op.
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  APP_RELEASE: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    // Startup failure path — logger isn't initialized yet, so stderr is the only
    // reasonable sink. Use process.stderr to avoid the no-console lint rule.
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    process.stderr.write(
      `\n[env] Invalid or missing environment variables:\n${issues}\n\n`,
    );
    throw new Error('Environment validation failed. See stderr for details.');
  }

  return parsed.data;
}

export const env: Env = loadEnv();

import bcrypt from 'bcrypt';
import { supabaseAdmin } from './supabase';
import { logger } from './logger';
import { env } from '@/config/env';

const BCRYPT_ROUNDS = 10;

/**
 * Idempotent single-admin bootstrap, run at server startup.
 *
 * If ADMIN_BOOTSTRAP_EMAIL + ADMIN_BOOTSTRAP_PASSWORD are set AND the
 * admin_users table is empty, insert one `admin` row with the hashed
 * password. Any other state (creds missing, admins already exist) is a
 * no-op. This is explicitly a single-admin system per product decision;
 * adding more admins is a manual DB task for now.
 */
export async function bootstrapAdminIfNeeded(): Promise<void> {
  const email = env.ADMIN_BOOTSTRAP_EMAIL;
  const password = env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !password) {
    logger.info('admin bootstrap skipped: ADMIN_BOOTSTRAP_* not set');
    return;
  }

  const { count, error: countErr } = await supabaseAdmin
    .from('admin_users')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null);

  if (countErr) {
    logger.warn('admin bootstrap: count query failed', { message: countErr.message });
    return;
  }

  if ((count ?? 0) > 0) {
    logger.info('admin bootstrap skipped: admin already exists');
    return;
  }

  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const name = env.ADMIN_BOOTSTRAP_NAME ?? 'Administrator';

  const { error: insertErr } = await supabaseAdmin.from('admin_users').insert({
    email,
    password_hash,
    name,
    role: 'admin',
  });

  if (insertErr) {
    logger.warn('admin bootstrap: insert failed', { message: insertErr.message });
    return;
  }

  logger.info('admin bootstrap: inserted initial admin', { email });
}

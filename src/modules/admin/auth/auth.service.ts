import bcrypt from 'bcrypt';
import { supabaseAdmin } from '@/lib/supabase';
import { createApiError } from '@/lib/apiResponse';
import { ERROR_CODES } from '@/constants/errors';
import { HTTP_STATUS } from '@/constants/http';
import type { AdminUserPublic } from '@/interfaces/admin';

const ADMIN_TABLE = 'admin_users';

// Per-account throttle: 5 failed logins within a 15-minute rolling window →
// reject with ADMIN_RATE_LIMIT until the window slides past.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export interface AdminRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: 'admin' | 'viewer';
  last_login_at: string | null;
  login_attempt_count: number;
  login_attempt_window_start: string | null;
  deleted_at: string | null;
}

function internal(detail: string, message: string): Error {
  return createApiError(ERROR_CODES.INTERNAL_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, {
    message,
    details: detail,
  });
}

export function toPublicAdmin(row: AdminRow): AdminUserPublic {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    last_login_at: row.last_login_at,
  };
}

export async function findAdminByEmail(email: string): Promise<AdminRow | null> {
  const { data, error } = await supabaseAdmin
    .from(ADMIN_TABLE)
    .select(
      'id, email, password_hash, name, role, last_login_at, login_attempt_count, login_attempt_window_start, deleted_at',
    )
    .eq('email', email)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw internal(error.message, 'Failed to look up admin');
  return (data as AdminRow | null) ?? null;
}

export async function findAdminById(id: string): Promise<AdminRow | null> {
  const { data, error } = await supabaseAdmin
    .from(ADMIN_TABLE)
    .select(
      'id, email, password_hash, name, role, last_login_at, login_attempt_count, login_attempt_window_start, deleted_at',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw internal(error.message, 'Failed to look up admin');
  return (data as AdminRow | null) ?? null;
}

export function isThrottled(row: AdminRow): boolean {
  if (!row.login_attempt_window_start) return false;
  const windowStart = Date.parse(row.login_attempt_window_start);
  if (Number.isNaN(windowStart)) return false;
  const windowOpen = Date.now() - windowStart < WINDOW_MS;
  return windowOpen && row.login_attempt_count >= MAX_ATTEMPTS;
}

export async function registerFailedAttempt(row: AdminRow): Promise<void> {
  const now = Date.now();
  const windowStart = row.login_attempt_window_start
    ? Date.parse(row.login_attempt_window_start)
    : NaN;
  const windowExpired =
    Number.isNaN(windowStart) || now - windowStart >= WINDOW_MS;

  const patch = windowExpired
    ? {
        login_attempt_count: 1,
        login_attempt_window_start: new Date(now).toISOString(),
      }
    : {
        login_attempt_count: row.login_attempt_count + 1,
        login_attempt_window_start: row.login_attempt_window_start,
      };

  const { error } = await supabaseAdmin
    .from(ADMIN_TABLE)
    .update(patch)
    .eq('id', row.id);
  if (error) throw internal(error.message, 'Failed to record login failure');
}

export async function registerSuccessfulLogin(row: AdminRow): Promise<void> {
  const { error } = await supabaseAdmin
    .from(ADMIN_TABLE)
    .update({
      login_attempt_count: 0,
      login_attempt_window_start: null,
      last_login_at: new Date().toISOString(),
    })
    .eq('id', row.id);
  if (error) throw internal(error.message, 'Failed to update last_login_at');
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

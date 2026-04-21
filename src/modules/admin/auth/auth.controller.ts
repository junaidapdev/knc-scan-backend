import type { Request, Response, NextFunction } from 'express';
import { apiSuccess, createApiError } from '@/lib/apiResponse';
import { signAdminToken } from '@/lib/jwt';
import { writeAudit } from '@/lib/audit';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '@/constants/audit';
import { ERROR_CODES } from '@/constants/errors';
import { HTTP_STATUS } from '@/constants/http';
import type {
  AdminLoginPayload,
  AdminLoginResult,
} from '@/interfaces/admin';
import {
  findAdminByEmail,
  isThrottled,
  registerFailedAttempt,
  registerSuccessfulLogin,
  toPublicAdmin,
  verifyPassword,
} from './auth.service';

// Keep message identical across wrong-email and wrong-password paths to
// avoid leaking which half of the credentials was wrong.
const INVALID_LOGIN_MSG = 'Invalid email or password';
const TOKEN_TTL_SECONDS = 8 * 60 * 60;

export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password } = req.body as AdminLoginPayload;
    const ip = req.ip ?? null;
    const row = await findAdminByEmail(email);

    if (!row) {
      await writeAudit({
        action: AUDIT_ACTIONS.ADMIN_LOGIN_FAILED,
        ip,
        metadata: { email, reason: 'unknown_email' },
      });
      throw createApiError(ERROR_CODES.ADMIN_LOGIN_INVALID, HTTP_STATUS.UNAUTHORIZED, {
        message: INVALID_LOGIN_MSG,
      });
    }

    if (isThrottled(row)) {
      await writeAudit({
        action: AUDIT_ACTIONS.ADMIN_LOGIN_FAILED,
        adminId: row.id,
        ip,
        entityType: AUDIT_ENTITIES.ADMIN_USER,
        entityId: row.id,
        metadata: { reason: 'throttled' },
      });
      throw createApiError(ERROR_CODES.ADMIN_RATE_LIMIT, HTTP_STATUS.TOO_MANY_REQUESTS, {
        message: 'Too many login attempts. Try again in a few minutes.',
      });
    }

    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) {
      await registerFailedAttempt(row);
      await writeAudit({
        action: AUDIT_ACTIONS.ADMIN_LOGIN_FAILED,
        adminId: row.id,
        ip,
        entityType: AUDIT_ENTITIES.ADMIN_USER,
        entityId: row.id,
        metadata: { reason: 'bad_password' },
      });
      throw createApiError(ERROR_CODES.ADMIN_LOGIN_INVALID, HTTP_STATUS.UNAUTHORIZED, {
        message: INVALID_LOGIN_MSG,
      });
    }

    await registerSuccessfulLogin(row);
    const token = signAdminToken({
      admin_id: row.id,
      email: row.email,
      role: row.role,
    });

    await writeAudit({
      action: AUDIT_ACTIONS.ADMIN_LOGIN_SUCCESS,
      adminId: row.id,
      ip,
      entityType: AUDIT_ENTITIES.ADMIN_USER,
      entityId: row.id,
    });

    const result: AdminLoginResult = {
      token,
      expires_in_seconds: TOKEN_TTL_SECONDS,
      admin: toPublicAdmin({ ...row, last_login_at: new Date().toISOString() }),
    };
    res.json(apiSuccess(result));
  } catch (err) {
    next(err);
  }
}

export async function logout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // JWT is stateless; "logout" is a client-side token drop. We record it
    // for the audit trail only — the token itself remains valid until its
    // natural expiry.
    const adminId = req.admin?.admin_id ?? null;
    await writeAudit({
      action: AUDIT_ACTIONS.ADMIN_LOGOUT,
      adminId,
      ip: req.ip ?? null,
      entityType: AUDIT_ENTITIES.ADMIN_USER,
      entityId: adminId,
    });
    res.json(apiSuccess({ ok: true }));
  } catch (err) {
    next(err);
  }
}

export async function me(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // `requireAdmin` guarantees req.admin is populated.
    const adminToken = req.admin;
    if (!adminToken) {
      throw createApiError(ERROR_CODES.ADMIN_AUTH_REQUIRED, HTTP_STATUS.UNAUTHORIZED, {
        message: 'Admin identity not present on request',
      });
    }
    const { findAdminById } = await import('./auth.service');
    const row = await findAdminById(adminToken.admin_id);
    if (!row) {
      throw createApiError(ERROR_CODES.ADMIN_AUTH_REQUIRED, HTTP_STATUS.UNAUTHORIZED, {
        message: 'Admin account not found or deleted',
      });
    }
    res.json(apiSuccess(toPublicAdmin(row)));
  } catch (err) {
    next(err);
  }
}

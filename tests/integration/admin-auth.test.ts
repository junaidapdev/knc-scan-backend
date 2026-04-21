import supertest from 'supertest';
import bcrypt from 'bcrypt';
import { createApp } from '@/server';
import { supabaseAdmin } from '@/lib/supabase';
import { HTTP_STATUS } from '@/constants/http';
import { ERROR_CODES } from '@/constants/errors';
import { signAdminToken } from '@/lib/jwt';
import { thenableBuilder, installFromRouter } from './_helpers';

jest.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

const app = createApp();
const request = supertest(app);

describe('Admin auth', () => {
  const email = 'ops@kayan.test';
  const password = 'CorrectHorseBattery';
  let password_hash: string;
  const adminRow = {
    id: 'admin-1',
    email,
    name: 'Ops Admin',
    role: 'admin' as const,
    last_login_at: null,
    login_attempt_count: 0,
    login_attempt_window_start: null,
    deleted_at: null,
  };

  beforeAll(async () => {
    password_hash = await bcrypt.hash(password, 4);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unknown email with ADMIN_LOGIN_INVALID (401)', async () => {
    installFromRouter(supabaseAdmin, {
      admin_users: thenableBuilder({ data: null, error: null }),
      audit_log: thenableBuilder({ data: null, error: null }),
    });
    const res = await request.post('/admin/auth/login').send({ email, password });
    expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    expect(res.body.error.code).toBe(ERROR_CODES.ADMIN_LOGIN_INVALID);
  });

  it('rejects bad password with ADMIN_LOGIN_INVALID (401)', async () => {
    installFromRouter(supabaseAdmin, {
      admin_users: thenableBuilder({
        data: { ...adminRow, password_hash },
        error: null,
      }),
      audit_log: thenableBuilder({ data: null, error: null }),
    });
    const res = await request
      .post('/admin/auth/login')
      .send({ email, password: 'WrongPassword!' });
    expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    expect(res.body.error.code).toBe(ERROR_CODES.ADMIN_LOGIN_INVALID);
  });

  it('returns token + admin on valid credentials', async () => {
    installFromRouter(supabaseAdmin, {
      admin_users: thenableBuilder({
        data: { ...adminRow, password_hash },
        error: null,
      }),
      audit_log: thenableBuilder({ data: null, error: null }),
    });
    const res = await request.post('/admin/auth/login').send({ email, password });
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.admin.email).toBe(email);
    expect(res.body.data.admin).not.toHaveProperty('password_hash');
  });

  it('returns ADMIN_RATE_LIMIT after too many failed attempts', async () => {
    installFromRouter(supabaseAdmin, {
      admin_users: thenableBuilder({
        data: {
          ...adminRow,
          password_hash,
          login_attempt_count: 5,
          login_attempt_window_start: new Date().toISOString(),
        },
        error: null,
      }),
      audit_log: thenableBuilder({ data: null, error: null }),
    });
    const res = await request.post('/admin/auth/login').send({ email, password });
    expect(res.status).toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
    expect(res.body.error.code).toBe(ERROR_CODES.ADMIN_RATE_LIMIT);
  });

  it('GET /admin/auth/me returns the current admin when token valid', async () => {
    const token = signAdminToken({
      admin_id: adminRow.id,
      email: adminRow.email,
      role: adminRow.role,
    });
    installFromRouter(supabaseAdmin, {
      admin_users: thenableBuilder({
        data: { ...adminRow, password_hash },
        error: null,
      }),
    });
    const res = await request
      .get('/admin/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.id).toBe(adminRow.id);
  });

  it('GET /admin/auth/me rejects missing token with ADMIN_AUTH_REQUIRED', async () => {
    const res = await request.get('/admin/auth/me');
    expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    expect(res.body.error.code).toBe(ERROR_CODES.ADMIN_AUTH_REQUIRED);
  });
});

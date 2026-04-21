import supertest from 'supertest';
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

const ADMIN_TOKEN = signAdminToken({
  admin_id: 'admin-1',
  email: 'ops@kayan.test',
  role: 'admin',
});

describe('Admin issued rewards', () => {
  beforeEach(() => jest.clearAllMocks());

  const pendingRow = {
    id: '22222222-2222-2222-2222-222222222222',
    unique_code: 'BOX-TEST-ABCD',
    status: 'pending' as const,
    catalog_id: 'cat-1',
    customer_id: 'c-1',
    reward_name_snapshot: 'Box',
    reward_name_snapshot_ar: 'علبة',
    issued_at: '2026-04-10T00:00:00Z',
    expires_at: '2026-05-10T00:00:00Z',
    redeemed_at: null,
    redeemed_at_branch_id: null,
    redemption_ip: null,
    redemption_device_fingerprint: null,
    voided_at: null,
    voided_by: null,
    void_reason: null,
    customers: { phone: '+966500000111', name: 'Ahmed' },
  };

  it('GET /admin/rewards/issued masks customer phone + hides voided by default', async () => {
    installFromRouter(supabaseAdmin, {
      rewards_issued: thenableBuilder({
        data: [pendingRow],
        error: null,
        count: 1,
      }),
    });
    const res = await request
      .get('/admin/rewards/issued')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.rows[0].customer_phone_masked).toMatch(/^\+9665X+111$/);
    expect(res.body.data.rows[0]).not.toHaveProperty('customer_phone_full');
  });

  it('POST /admin/rewards/issued/:id/void rejects non-pending rewards', async () => {
    installFromRouter(supabaseAdmin, {
      rewards_issued: thenableBuilder({
        data: { id: '22222222-2222-2222-2222-222222222222', status: 'redeemed', voided_at: null },
        error: null,
      }),
      audit_log: thenableBuilder({ data: null, error: null }),
    });
    const res = await request
      .post('/admin/rewards/issued/22222222-2222-2222-2222-222222222222/void')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ reason: 'customer request' });
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE_ENTITY);
    expect(res.body.error.code).toBe(ERROR_CODES.REWARD_NOT_VOIDABLE);
  });

  it('POST /admin/rewards/issued/:id/void rejects already-voided', async () => {
    installFromRouter(supabaseAdmin, {
      rewards_issued: thenableBuilder({
        data: {
          id: '22222222-2222-2222-2222-222222222222',
          status: 'pending',
          voided_at: '2026-04-18T00:00:00Z',
        },
        error: null,
      }),
      audit_log: thenableBuilder({ data: null, error: null }),
    });
    const res = await request
      .post('/admin/rewards/issued/22222222-2222-2222-2222-222222222222/void')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ reason: 'test' });
    expect(res.status).toBe(HTTP_STATUS.CONFLICT);
    expect(res.body.error.code).toBe(ERROR_CODES.REWARD_ALREADY_VOIDED);
  });

  it('POST /admin/rewards/issued/:id/void succeeds on pending reward', async () => {
    // 1st from: look up state (pending, not voided)
    // 2nd from: update no-op read (we return the join again for detail refetch)
    // 3rd from: audit write
    installFromRouter(supabaseAdmin, {
      rewards_issued: [
        thenableBuilder({
          data: { id: '22222222-2222-2222-2222-222222222222', status: 'pending', voided_at: null },
          error: null,
        }),
        thenableBuilder({
          data: { id: '22222222-2222-2222-2222-222222222222', status: 'pending', voided_at: null },
          error: null,
        }),
        thenableBuilder({
          data: {
            ...pendingRow,
            voided_at: new Date().toISOString(),
            voided_by: 'admin-1',
            void_reason: 'test',
          },
          error: null,
        }),
      ],
      audit_log: thenableBuilder({ data: null, error: null }),
    });
    const res = await request
      .post('/admin/rewards/issued/22222222-2222-2222-2222-222222222222/void')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ reason: 'test' });
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.voided_at).toBeTruthy();
    expect(res.body.data.void_reason).toBe('test');
  });

  it('POST /admin/rewards/issued/:id/void validates reason length', async () => {
    const res = await request
      .post('/admin/rewards/issued/00000000-0000-0000-0000-000000000000/void')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ reason: 'xx' });
    expect(res.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(res.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
  });
});

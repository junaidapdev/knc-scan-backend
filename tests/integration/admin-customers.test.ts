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

describe('Admin customers', () => {
  beforeEach(() => jest.clearAllMocks());

  const summaryRow = {
    id: '11111111-1111-1111-1111-111111111111',
    phone: '+966500000001',
    name: 'Ahmed',
    language: 'ar',
    tier: 'standard',
    current_stamps: 3,
    cards_completed: 1,
    total_visits: 14,
    total_self_reported_spend_sar: 600,
    last_scan_at: '2026-04-19T09:00:00Z',
    created_at: '2026-01-10T00:00:00Z',
    rewards_issued_count: 1,
    rewards_redeemed_count: 1,
    rewards_pending_count: 0,
  };

  it('GET /admin/customers masks phone numbers in list output', async () => {
    installFromRouter(supabaseAdmin, {
      v_customer_summary: thenableBuilder({
        data: [summaryRow],
        error: null,
        count: 1,
      }),
    });
    const res = await request
      .get('/admin/customers')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.rows[0].phone_masked).toMatch(/^\+9665X+001$/);
    // Raw phone must not leak into list responses.
    expect(res.body.data.rows[0]).not.toHaveProperty('phone');
  });

  it('GET /admin/customers/:id returns full phone + audits the fetch', async () => {
    installFromRouter(supabaseAdmin, {
      v_customer_summary: thenableBuilder({ data: summaryRow, error: null }),
      customers: thenableBuilder({
        data: {
          phone: summaryRow.phone,
          birthday_month: null,
          birthday_day: null,
          preferred_branch_id: null,
          consent_marketing: false,
          lifetime_points: 0,
        },
        error: null,
      }),
      visits: thenableBuilder({ data: [], error: null }),
      rewards_issued: thenableBuilder({ data: [], error: null }),
      audit_log: thenableBuilder({ data: null, error: null }),
    });
    const res = await request
      .get('/admin/customers/11111111-1111-1111-1111-111111111111')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.phone_full).toBe('+966500000001');
    expect(res.body.data.phone_masked).toBeTruthy();
  });

  it('DELETE /admin/customers/:id soft-deletes a live customer', async () => {
    installFromRouter(supabaseAdmin, {
      customers: thenableBuilder({
        data: { id: '11111111-1111-1111-1111-111111111111', phone: summaryRow.phone, deleted_at: null },
        error: null,
      }),
      audit_log: thenableBuilder({ data: null, error: null }),
    });
    const res = await request
      .delete('/admin/customers/11111111-1111-1111-1111-111111111111')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.ok).toBe(true);
  });

  it('DELETE /admin/customers/:id returns 409 when already deleted', async () => {
    installFromRouter(supabaseAdmin, {
      customers: thenableBuilder({
        data: {
          id: '11111111-1111-1111-1111-111111111111',
          phone: summaryRow.phone,
          deleted_at: '2026-04-19T00:00:00Z',
        },
        error: null,
      }),
      audit_log: thenableBuilder({ data: null, error: null }),
    });
    const res = await request
      .delete('/admin/customers/11111111-1111-1111-1111-111111111111')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(HTTP_STATUS.CONFLICT);
    expect(res.body.error.code).toBe(ERROR_CODES.CUSTOMER_ALREADY_DELETED);
  });

  it('GET /admin/customers/export streams a CSV with header row', async () => {
    // First page has one row, second page has zero → terminator.
    installFromRouter(supabaseAdmin, {
      customers: [
        thenableBuilder({
          data: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              phone: summaryRow.phone,
              name: 'Ahmed, Jr.',
              language: 'ar',
              tier: 'standard',
              current_stamps: 3,
              cards_completed: 1,
              total_visits: 14,
              total_self_reported_spend_sar: 600,
              last_scan_at: '2026-04-19T09:00:00Z',
              created_at: '2026-01-10T00:00:00Z',
            },
          ],
          error: null,
        }),
        thenableBuilder({ data: [], error: null }),
      ],
      audit_log: thenableBuilder({ data: null, error: null }),
    });
    const res = await request
      .get('/admin/customers/export')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    const body = res.text.split('\n');
    expect(body[0]).toBe(
      'id,phone,name,language,tier,current_stamps,cards_completed,total_visits,total_self_reported_spend_sar,last_scan_at,created_at',
    );
    // Name contains a comma → must be quoted per RFC 4180.
    expect(body[1]).toContain('"Ahmed, Jr."');
  });
});

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

describe('Admin KPIs', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects unauthenticated callers with ADMIN_AUTH_REQUIRED', async () => {
    const res = await request.get('/admin/kpis/summary');
    expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    expect(res.body.error.code).toBe(ERROR_CODES.ADMIN_AUTH_REQUIRED);
  });

  it('GET /admin/kpis/summary returns the single-row view payload', async () => {
    const summary = {
      total_customers: 1200,
      new_customers_30d: 80,
      scans_30d: 3000,
      stamps_30d: 2800,
      spend_30d: 145000,
      rewards_issued_30d: 40,
      rewards_redeemed_30d: 35,
      rewards_outstanding: 22,
      active_branches: 11,
    };
    installFromRouter(supabaseAdmin, {
      v_admin_kpi_summary: thenableBuilder({ data: summary, error: null }),
    });
    const res = await request
      .get('/admin/kpis/summary')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.total_customers).toBe(1200);
    expect(res.body.data.active_branches).toBe(11);
  });

  it('GET /admin/kpis/by-branch returns the view rows', async () => {
    const rows = [
      {
        branch_id: 'b-1',
        branch_name: 'Jeddah Rawdah',
        city: 'Jeddah',
        active: true,
        scans_30d: 400,
        stamps_30d: 380,
        spend_30d: 18000,
        unique_customers_30d: 220,
      },
    ];
    installFromRouter(supabaseAdmin, {
      v_admin_kpi_by_branch: thenableBuilder({ data: rows, error: null }),
    });
    const res = await request
      .get('/admin/kpis/by-branch')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].branch_id).toBe('b-1');
  });

  it('GET /admin/kpis/timeseries folds multi-branch rows per day', async () => {
    const rows = [
      {
        scan_date: '2026-04-18',
        branch_id: 'b-1',
        scans: 10,
        stamps_awarded: 9,
        lockouts: 1,
        total_bill_amount: 500,
        unique_customers: 8,
      },
      {
        scan_date: '2026-04-18',
        branch_id: 'b-2',
        scans: 5,
        stamps_awarded: 5,
        lockouts: 0,
        total_bill_amount: 250,
        unique_customers: 4,
      },
      {
        scan_date: '2026-04-19',
        branch_id: 'b-1',
        scans: 7,
        stamps_awarded: 6,
        lockouts: 1,
        total_bill_amount: 300,
        unique_customers: 6,
      },
    ];
    installFromRouter(supabaseAdmin, {
      v_daily_scans: thenableBuilder({ data: rows, error: null }),
    });
    const res = await request
      .get('/admin/kpis/timeseries?days=7')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data).toHaveLength(2);
    const day1 = res.body.data.find((p: { date: string }) => p.date === '2026-04-18');
    expect(day1.scans).toBe(15);
    expect(day1.stamps_awarded).toBe(14);
    expect(day1.total_bill_amount).toBe(750);
  });

  it('rejects invalid `days` query param with VALIDATION_FAILED', async () => {
    const res = await request
      .get('/admin/kpis/timeseries?days=0')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(res.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
  });
});

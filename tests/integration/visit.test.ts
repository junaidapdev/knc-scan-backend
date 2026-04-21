import supertest from 'supertest';
import { createApp } from '@/server';
import { supabaseAdmin } from '@/lib/supabase';
import { HTTP_STATUS } from '@/constants/http';
import { ERROR_CODES } from '@/constants/errors';
import { signSessionToken } from '@/lib/jwt';

jest.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

const app = createApp();
const request = supertest(app);

// ---------------------------------------------------------------------------
// Supabase builder-chain test helpers
// ---------------------------------------------------------------------------
// The real supabase-js builder is heavily fluent. We only need to satisfy the
// exact chains used by visit.service + customer.controller, so we build small
// "fake" builders per test that resolve the terminal awaited promise.

type Terminal = Promise<unknown> | { then: unknown };

function singleResultBuilder(result: { data: unknown; error: unknown }): Record<string, unknown> {
  const self: Record<string, unknown> = {};
  const chain = (): Record<string, unknown> => self;
  self.select = chain;
  self.eq = chain;
  self.gte = chain;
  self.order = chain;
  self.maybeSingle = jest.fn().mockResolvedValue(result);
  self.single = jest.fn().mockResolvedValue(result);
  return self;
}

function countResultBuilder(result: { count: number | null; error: unknown }): Record<string, unknown> {
  // `.select('*', { count: 'exact', head: true }).eq(...).eq(...).gte(...)` is
  // the terminal — Supabase resolves it when awaited. We implement that by
  // making the chain itself thenable.
  const resolved = Promise.resolve(result);
  const chain: Record<string, unknown> & Terminal = {
    then: (...args: Parameters<Promise<unknown>['then']>) => resolved.then(...args),
    catch: (...args: Parameters<Promise<unknown>['catch']>) => resolved.catch(...args),
    finally: (...args: Parameters<Promise<unknown>['finally']>) => resolved.finally(...args),
  };
  const self: Record<string, unknown> = chain;
  self.select = () => chain;
  self.eq = () => chain;
  self.gte = () => chain;
  return self;
}

function insertResultBuilder(error: unknown = null): Record<string, unknown> {
  return {
    insert: jest.fn().mockResolvedValue({ error }),
  };
}

interface FromRouter {
  [table: string]: Record<string, unknown>;
}

/**
 * Installs a routing `from(table)` mock. Caller provides, per table, either a
 * single builder used for every call or an array of builders consumed in
 * order (to script multi-step flows like insert-then-count).
 */
function installFromRouter(routes: Record<string, Record<string, unknown> | Record<string, unknown>[]>): void {
  const cursors: Record<string, number> = {};
  (supabaseAdmin.from as jest.Mock).mockImplementation((table: string) => {
    const route = routes[table];
    if (!route) {
      throw new Error(`Unmocked supabase.from('${table}')`);
    }
    if (Array.isArray(route)) {
      const idx = cursors[table] ?? 0;
      const hit = route[Math.min(idx, route.length - 1)];
      cursors[table] = idx + 1;
      return hit;
    }
    return route;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Visit — /visits/scan and /visits/scan/lookup', () => {
  const mockCustomerId = 'cust-abc';
  const mockPhone = '+966500000000';
  const mockBranchId = 'branch-xyz';
  const sessionToken = signSessionToken({ phone: mockPhone, customerId: mockCustomerId });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /visits/scan (happy path)', () => {
    it('awards a stamp when RPC reports stamp_awarded=true', async () => {
      installFromRouter({
        branches: singleResultBuilder({
          data: { id: mockBranchId, active: true },
          error: null,
        }),
      });
      (supabaseAdmin.rpc as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          visit_id: 'visit-1',
          stamp_awarded: true,
          lockout_applied: false,
          current_stamps: 4,
          ready_for_reward: false,
          next_eligible_at: null,
        },
        error: null,
      });

      const response = await request
        .post('/visits/scan')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ branch_qr_identifier: 'KYN-JED-MRW', bill_amount: 150 });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        stamp_awarded: true,
        current_stamps: 4,
        ready_for_reward: false,
        visit_id: 'visit-1',
      });
    });
  });

  describe('POST /visits/scan (lockout path)', () => {
    it('returns 422 SCAN_LOCKOUT_ACTIVE with next_eligible_at in details', async () => {
      installFromRouter({
        branches: singleResultBuilder({
          data: { id: mockBranchId, active: true },
          error: null,
        }),
      });
      const nextEligible = new Date(Date.now() + 22 * 3600 * 1000).toISOString();
      (supabaseAdmin.rpc as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          visit_id: 'visit-2',
          stamp_awarded: false,
          lockout_applied: true,
          current_stamps: 3,
          ready_for_reward: false,
          next_eligible_at: nextEligible,
        },
        error: null,
      });

      const response = await request
        .post('/visits/scan')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ branch_qr_identifier: 'KYN-JED-MRW', bill_amount: 90 });

      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE_ENTITY);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ERROR_CODES.SCAN_LOCKOUT_ACTIVE);
      expect(response.body.error.details).toEqual({
        next_eligible_at: nextEligible,
        current_stamps: 3,
        visit_id_for_record: 'visit-2',
      });
    });
  });

  describe('POST /visits/scan (10th stamp)', () => {
    it('sets ready_for_reward=true when current_stamps reaches 10', async () => {
      installFromRouter({
        branches: singleResultBuilder({
          data: { id: mockBranchId, active: true },
          error: null,
        }),
      });
      (supabaseAdmin.rpc as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          visit_id: 'visit-10',
          stamp_awarded: true,
          lockout_applied: false,
          current_stamps: 10,
          ready_for_reward: true,
          next_eligible_at: null,
        },
        error: null,
      });

      const response = await request
        .post('/visits/scan')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ branch_qr_identifier: 'KYN-JED-MRW', bill_amount: 200 });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data.current_stamps).toBe(10);
      expect(response.body.data.ready_for_reward).toBe(true);
    });
  });

  describe('POST /visits/scan (inactive branch)', () => {
    it('returns 422 BRANCH_INACTIVE without calling the RPC', async () => {
      installFromRouter({
        branches: singleResultBuilder({
          data: { id: mockBranchId, active: false },
          error: null,
        }),
      });

      const response = await request
        .post('/visits/scan')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ branch_qr_identifier: 'KYN-JED-MRW', bill_amount: 100 });

      expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE_ENTITY);
      expect(response.body.error.code).toBe(ERROR_CODES.BRANCH_INACTIVE);
      expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
    });
  });

  describe('POST /visits/scan/lookup (rate limit)', () => {
    it('returns 429 RATE_LIMITED when >10 lookups/min from the same IP', async () => {
      installFromRouter({
        audit_log: [
          // (1) insert of this attempt
          insertResultBuilder(null),
          // (2) per-minute count — breaches 10
          countResultBuilder({ count: 11, error: null }),
        ],
      });

      const response = await request
        .post('/visits/scan/lookup')
        .send({ phone: mockPhone });

      expect(response.status).toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
      expect(response.body.error.code).toBe(ERROR_CODES.RATE_LIMITED);
    });
  });

  describe('POST /visits/scan/lookup (silence mode)', () => {
    it('returns exists:false even for a registered phone when >5 lookups/hour', async () => {
      installFromRouter({
        audit_log: [
          insertResultBuilder(null),                      // insert
          countResultBuilder({ count: 3, error: null }),  // per-minute (ok)
          countResultBuilder({ count: 6, error: null }),  // per-hour (silence)
        ],
        // customers.findCustomerByPhone should NOT be invoked; if it is, the
        // test will blow up with an unmocked from() call (we intentionally
        // don't register 'customers' in the router).
      });

      const response = await request
        .post('/visits/scan/lookup')
        .send({ phone: mockPhone });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({ exists: false });
    });
  });
});

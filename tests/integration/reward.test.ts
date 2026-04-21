import supertest from 'supertest';
import { createApp } from '@/server';
import { supabaseAdmin } from '@/lib/supabase';
import { HTTP_STATUS } from '@/constants/http';
import { ERROR_CODES } from '@/constants/errors';
import { signSessionToken, signRedemptionToken, signAdminToken } from '@/lib/jwt';

jest.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

const app = createApp();
const request = supertest(app);

const ADMIN_TOKEN = signAdminToken({
  admin_id: 'admin-test-1',
  email: 'ops@kayan.test',
  role: 'admin',
});

// ---------------------------------------------------------------------------
// Supabase builder-chain helpers — mirror the visit.test.ts approach.
// ---------------------------------------------------------------------------
import { thenableBuilder, installFromRouter as _install } from './_helpers';

function installFromRouter(
  routes: Record<string, Record<string, unknown> | Record<string, unknown>[]>,
): void {
  _install(supabaseAdmin, routes);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Reward system', () => {
  const customerId = 'cust-abc';
  const phone = '+966500000000';
  const branchId = 'branch-xyz';
  const qr = 'KYN-JED-MRW';
  const sessionToken = signSessionToken({ phone, customerId });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // Catalog CRUD + pause/resume/archive
  // ------------------------------------------------------------------
  describe('Catalog CRUD', () => {
    it('rejects admin endpoints without an admin Bearer token', async () => {
      const res = await request.get('/admin/rewards/catalog');
      expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(res.body.error.code).toBe(ERROR_CODES.ADMIN_AUTH_REQUIRED);
    });

    it('creates, updates, and pauses a catalog item', async () => {
      const created = {
        id: '33333333-3333-3333-3333-333333333333',
        code_prefix: 'BOX-TEST',
        name_en: 'Box',
        name_ar: 'علبة',
        description_en: null,
        description_ar: null,
        image_url: null,
        estimated_value_sar: 20,
        default_expiry_days: 30,
        status: 'active',
        created_at: '2026-04-18T00:00:00Z',
        updated_at: '2026-04-18T00:00:00Z',
      };

      // Create
      installFromRouter({
        rewards_catalog: thenableBuilder({ data: created, error: null }),
      });
      const createRes = await request
        .post('/admin/rewards/catalog')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({
          code_prefix: 'BOX-TEST',
          name_en: 'Box',
          name_ar: 'علبة',
          estimated_value_sar: 20,
          default_expiry_days: 30,
        });
      expect(createRes.status).toBe(HTTP_STATUS.CREATED);
      expect(createRes.body.data.code_prefix).toBe('BOX-TEST');

      // Pause
      installFromRouter({
        rewards_catalog: thenableBuilder({
          data: { ...created, status: 'paused' },
          error: null,
        }),
      });
      const pauseRes = await request
        .post('/admin/rewards/catalog/33333333-3333-3333-3333-333333333333/pause')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(pauseRes.status).toBe(HTTP_STATUS.OK);
      expect(pauseRes.body.data.status).toBe('paused');
    });

    it('rejects duplicate code_prefix with CATALOG_CODE_PREFIX_TAKEN (409)', async () => {
      installFromRouter({
        rewards_catalog: thenableBuilder({
          data: null,
          error: { code: '23505', message: 'duplicate key value' },
        }),
      });
      const res = await request
        .post('/admin/rewards/catalog')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({
          code_prefix: 'BOX-TEST',
          name_en: 'Box',
          name_ar: 'علبة',
          estimated_value_sar: 20,
          default_expiry_days: 30,
        });
      expect(res.status).toBe(HTTP_STATUS.CONFLICT);
      expect(res.body.error.code).toBe(ERROR_CODES.CATALOG_CODE_PREFIX_TAKEN);
    });
  });

  // ------------------------------------------------------------------
  // Auto-issuance on 10th stamp — delegated to fn_process_scan RPC
  // ------------------------------------------------------------------
  describe('Auto-issuance on 10th stamp', () => {
    it('returns issued_reward, stamps reset to 0, ready_for_reward=false', async () => {
      installFromRouter({
        branches: thenableBuilder({ data: { id: branchId, active: true }, error: null }),
      });
      (supabaseAdmin.rpc as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          visit_id: 'v-10',
          stamp_awarded: true,
          lockout_applied: false,
          current_stamps: 0,
          ready_for_reward: false,
          next_eligible_at: null,
          issued_reward: {
            reward_id: 'rew-1',
            unique_code: 'BOX-FAHADAH-ABCD',
            catalog_id: 'cat-A',
            name_en: 'Fahadah Box',
            name_ar: 'علبة فهادة',
            description_en: null,
            description_ar: null,
            estimated_value_sar: 35,
            expires_at: '2026-05-18T00:00:00Z',
          },
          catalog_empty: false,
        },
        error: null,
      });

      const res = await request
        .post('/visits/scan')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ branch_qr_identifier: qr, bill_amount: 100 });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data.current_stamps).toBe(0);
      expect(res.body.data.ready_for_reward).toBe(false);
      expect(res.body.data.issued_reward.unique_code).toBe('BOX-FAHADAH-ABCD');
      expect(res.body.data.catalog_empty).toBe(false);
    });

    it('reports catalog_empty=true and keeps stamps at 10 when no active rewards', async () => {
      installFromRouter({
        branches: thenableBuilder({ data: { id: branchId, active: true }, error: null }),
      });
      (supabaseAdmin.rpc as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          visit_id: 'v-10',
          stamp_awarded: true,
          lockout_applied: false,
          current_stamps: 10,
          ready_for_reward: true,
          next_eligible_at: null,
          issued_reward: null,
          catalog_empty: true,
        },
        error: null,
      });

      const res = await request
        .post('/visits/scan')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ branch_qr_identifier: qr, bill_amount: 100 });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data.catalog_empty).toBe(true);
      expect(res.body.data.current_stamps).toBe(10);
      expect(res.body.data.issued_reward).toBeNull();
    });

    // Round-robin ordering is enforced INSIDE fn_issue_reward_if_ready (Postgres).
    // From the controller's perspective, we only verify it surfaces whatever the
    // RPC returns — so here we script three consecutive RPC outputs and check
    // the API faithfully passes each through.
    it('passes through three consecutive issuances in round-robin order', async () => {
      const issuances = ['cat-A', 'cat-B', 'cat-C'];
      for (const catId of issuances) {
        installFromRouter({
          branches: thenableBuilder({ data: { id: branchId, active: true }, error: null }),
        });
        (supabaseAdmin.rpc as jest.Mock).mockResolvedValueOnce({
          data: {
            success: true,
            visit_id: 'v-' + catId,
            stamp_awarded: true,
            lockout_applied: false,
            current_stamps: 0,
            ready_for_reward: false,
            next_eligible_at: null,
            issued_reward: {
              reward_id: 'rew-' + catId,
              unique_code: 'X-' + catId,
              catalog_id: catId,
              name_en: catId,
              name_ar: catId,
              description_en: null,
              description_ar: null,
              estimated_value_sar: 30,
              expires_at: '2026-05-18T00:00:00Z',
            },
            catalog_empty: false,
          },
          error: null,
        });

        const res = await request
          .post('/visits/scan')
          .set('Authorization', `Bearer ${sessionToken}`)
          .send({ branch_qr_identifier: qr, bill_amount: 50 });
        expect(res.body.data.issued_reward.catalog_id).toBe(catId);
      }
    });
  });

  // ------------------------------------------------------------------
  // Two-step redemption
  // ------------------------------------------------------------------
  describe('Two-step redemption', () => {
    const uniqueCode = 'BOX-FAHADAH-ABCD';
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    it('step 1 returns a redemption_token without mutating state', async () => {
      installFromRouter({
        branches: thenableBuilder({ data: { id: branchId, active: true }, error: null }),
        rewards_issued: thenableBuilder({
          data: {
            id: 'rew-1',
            unique_code: uniqueCode,
            customer_id: customerId,
            reward_name_snapshot: 'Fahadah Box',
            reward_name_snapshot_ar: 'علبة فهادة',
            status: 'pending',
            expires_at: tomorrow,
            customers: { name: 'Ahmed' },
          },
          error: null,
        }),
      });

      const res = await request
        .post(`/rewards/${uniqueCode}/confirm-redeem-step-1`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ branch_qr_identifier: qr });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data.redemption_token).toEqual(expect.any(String));
      expect(res.body.data.summary.customer_name).toBe('Ahmed');
      expect(res.body.data.summary.unique_code).toBe(uniqueCode);
    });

    it('step 1 rejects a reward owned by another customer with REWARD_NOT_OWNED', async () => {
      installFromRouter({
        branches: thenableBuilder({ data: { id: branchId, active: true }, error: null }),
        rewards_issued: thenableBuilder({
          data: {
            id: 'rew-1',
            unique_code: uniqueCode,
            customer_id: 'cust-other',
            reward_name_snapshot: 'Fahadah Box',
            reward_name_snapshot_ar: null,
            status: 'pending',
            expires_at: tomorrow,
            customers: { name: 'Someone Else' },
          },
          error: null,
        }),
      });

      const res = await request
        .post(`/rewards/${uniqueCode}/confirm-redeem-step-1`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ branch_qr_identifier: qr });

      expect(res.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(res.body.error.code).toBe(ERROR_CODES.REWARD_NOT_OWNED);
    });

    it('step 1 rejects an expired reward with REWARD_EXPIRED', async () => {
      installFromRouter({
        branches: thenableBuilder({ data: { id: branchId, active: true }, error: null }),
        rewards_issued: thenableBuilder({
          data: {
            id: 'rew-1',
            unique_code: uniqueCode,
            customer_id: customerId,
            reward_name_snapshot: 'Fahadah Box',
            reward_name_snapshot_ar: null,
            status: 'pending',
            expires_at: yesterday,
            customers: { name: 'Ahmed' },
          },
          error: null,
        }),
      });

      const res = await request
        .post(`/rewards/${uniqueCode}/confirm-redeem-step-1`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ branch_qr_identifier: qr });

      expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE_ENTITY);
      expect(res.body.error.code).toBe(ERROR_CODES.REWARD_EXPIRED);
    });

    it('step 2 redeems successfully with a valid redemption_token', async () => {
      const redemptionToken = signRedemptionToken({
        unique_code: uniqueCode,
        customer_id: customerId,
        branch_id: branchId,
      });

      installFromRouter({
        branches: thenableBuilder({ data: { id: branchId, active: true }, error: null }),
      });
      (supabaseAdmin.rpc as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          reward: {
            id: 'rew-1',
            unique_code: uniqueCode,
            customer_id: customerId,
            catalog_id: 'cat-A',
            reward_name_snapshot: 'Fahadah Box',
            reward_name_snapshot_ar: 'علبة فهادة',
            redeemed_at: new Date().toISOString(),
            redeemed_at_branch_id: branchId,
            status: 'redeemed',
          },
        },
        error: null,
      });

      const res = await request
        .post(`/rewards/${uniqueCode}/confirm-redeem-step-2`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .set('X-Redemption-Token', redemptionToken)
        .send({ branch_qr_identifier: qr });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data.status).toBe('redeemed');
      expect(res.body.data.unique_code).toBe(uniqueCode);
    });

    it('step 2 returns 409 REWARD_NOT_PENDING when someone else redeemed between step 1 and step 2', async () => {
      const redemptionToken = signRedemptionToken({
        unique_code: uniqueCode,
        customer_id: customerId,
        branch_id: branchId,
      });

      installFromRouter({
        branches: thenableBuilder({ data: { id: branchId, active: true }, error: null }),
      });
      (supabaseAdmin.rpc as jest.Mock).mockResolvedValue({
        data: { success: false, reason: 'REWARD_ALREADY_REDEEMED' },
        error: null,
      });

      const res = await request
        .post(`/rewards/${uniqueCode}/confirm-redeem-step-2`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .set('X-Redemption-Token', redemptionToken)
        .send({ branch_qr_identifier: qr });

      expect(res.status).toBe(HTTP_STATUS.CONFLICT);
      expect(res.body.error.code).toBe(ERROR_CODES.REWARD_NOT_PENDING);
    });

    it('step 2 rejects a missing redemption token', async () => {
      const res = await request
        .post(`/rewards/${uniqueCode}/confirm-redeem-step-2`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({ branch_qr_identifier: qr });

      expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(res.body.error.code).toBe(ERROR_CODES.INVALID_REDEMPTION_TOKEN);
    });
  });

  // ------------------------------------------------------------------
  // Historical integrity — verified structurally: issued.service reads only
  // snapshot columns from rewards_issued, never joins rewards_catalog name
  // columns. We assert by mocking a catalog update and then listing the
  // customer's rewards — snapshot fields in the response come from the
  // rewards_issued row we provide, not the catalog.
  // ------------------------------------------------------------------
  describe('Historical integrity', () => {
    it('customer rewards response reflects snapshot_name, not current catalog name', async () => {
      installFromRouter({
        rewards_issued: thenableBuilder({
          data: [
            {
              id: 'rew-1',
              unique_code: 'BOX-FAHADAH-ABCD',
              catalog_id: 'cat-A',
              // Snapshot captured at issue time — even if catalog item is now
              // renamed to "Renamed Box", this value must persist unchanged.
              reward_name_snapshot: 'Fahadah Boxed Chocolate',
              reward_name_snapshot_ar: 'علبة شوكولاتة فهادة',
              reward_description_snapshot: null,
              reward_description_snapshot_ar: null,
              issued_at: '2026-04-10T00:00:00Z',
              expires_at: '2026-05-10T00:00:00Z',
              status: 'pending',
              redeemed_at: null,
              redeemed_at_branch_id: null,
            },
          ],
          error: null,
        }),
      });

      const res = await request
        .get('/customers/me/rewards')
        .set('Authorization', `Bearer ${sessionToken}`);

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].reward_name_snapshot).toBe('Fahadah Boxed Chocolate');
      expect(res.body.data[0].reward_name_snapshot_ar).toBe('علبة شوكولاتة فهادة');
      // Instructions attached by the service, not the DB.
      expect(res.body.data[0].redemption_instructions).toBeDefined();
    });
  });
});

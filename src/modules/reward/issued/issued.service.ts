import { supabaseAdmin } from '@/lib/supabase';
import { createApiError } from '@/lib/apiResponse';
import { ERROR_CODES } from '@/constants/errors';
import { HTTP_STATUS } from '@/constants/http';
import type { IssuedReward } from '@/interfaces/reward';

const TABLE = 'rewards_issued';

export const REDEMPTION_INSTRUCTIONS = {
  en: 'Show this screen to the cashier at any Kayan branch. Tap the button when they are ready to confirm.',
  ar: 'أظهر هذه الشاشة للكاشير في أي فرع من فروع كيان، ثم اضغط الزر عندما يكون جاهزاً للتأكيد.',
};

/**
 * Treat a pending reward whose expires_at has already passed as expired at
 * read time. The nightly cron flips the DB status eventually; this keeps the
 * API consistent in between.
 */
function derivedStatus(row: { status: string; expires_at: string }): 'pending' | 'redeemed' | 'expired' {
  if (row.status === 'pending' && Date.parse(row.expires_at) < Date.now()) {
    return 'expired';
  }
  return row.status as 'pending' | 'redeemed' | 'expired';
}

export async function listCustomerRewards(customerId: string): Promise<IssuedReward[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select(
      'id, unique_code, catalog_id, reward_name_snapshot, reward_name_snapshot_ar, reward_description_snapshot, reward_description_snapshot_ar, issued_at, expires_at, status, redeemed_at, redeemed_at_branch_id',
    )
    .eq('customer_id', customerId)
    .order('issued_at', { ascending: false });

  if (error) {
    throw createApiError(ERROR_CODES.INTERNAL_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, {
      message: 'Failed to list customer rewards',
      details: error.message,
    });
  }

  return (data ?? []).map((row) => ({
    ...(row as IssuedReward),
    status: derivedStatus(row as { status: string; expires_at: string }),
    redemption_instructions: REDEMPTION_INSTRUCTIONS,
  }));
}

export interface RewardWithOwner {
  id: string;
  unique_code: string;
  customer_id: string;
  reward_name_snapshot: string;
  reward_name_snapshot_ar: string | null;
  status: 'pending' | 'redeemed' | 'expired';
  expires_at: string;
  customer_name: string | null;
}

/**
 * Used by step 1 — validates ownership + pending + not expired without
 * mutating state. Joins customers for the confirmation summary.
 */
export async function findRewardForStep1(uniqueCode: string): Promise<RewardWithOwner | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select(
      'id, unique_code, customer_id, reward_name_snapshot, reward_name_snapshot_ar, status, expires_at, customers(name)',
    )
    .eq('unique_code', uniqueCode)
    .maybeSingle();

  if (error) {
    throw createApiError(ERROR_CODES.INTERNAL_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, {
      message: 'Failed to look up reward',
      details: error.message,
    });
  }
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    unique_code: string;
    customer_id: string;
    reward_name_snapshot: string;
    reward_name_snapshot_ar: string | null;
    status: 'pending' | 'redeemed' | 'expired';
    expires_at: string;
    customers: { name: string | null } | { name: string | null }[] | null;
  };
  const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  return {
    id: row.id,
    unique_code: row.unique_code,
    customer_id: row.customer_id,
    reward_name_snapshot: row.reward_name_snapshot,
    reward_name_snapshot_ar: row.reward_name_snapshot_ar,
    status: row.status,
    expires_at: row.expires_at,
    customer_name: customer?.name ?? null,
  };
}

export interface RedeemRpcResult {
  success: boolean;
  reason?:
    | 'REWARD_NOT_FOUND'
    | 'REWARD_NOT_OWNED'
    | 'REWARD_ALREADY_REDEEMED'
    | 'REWARD_EXPIRED'
    | 'INTERNAL_ERROR';
  detail?: string;
  reward?: {
    id: string;
    unique_code: string;
    customer_id: string;
    catalog_id: string;
    reward_name_snapshot: string;
    reward_name_snapshot_ar: string | null;
    redeemed_at: string;
    redeemed_at_branch_id: string;
    status: 'redeemed';
  };
}

export async function redeemReward(params: {
  uniqueCode: string;
  customerId: string;
  branchId: string;
  ip?: string;
  deviceFingerprint?: string;
}): Promise<RedeemRpcResult> {
  const { data, error } = await supabaseAdmin.rpc('fn_redeem_reward', {
    p_unique_code: params.uniqueCode,
    p_customer_id: params.customerId,
    p_branch_id: params.branchId,
    p_ip: params.ip ?? null,
    p_device_fingerprint: params.deviceFingerprint ?? null,
  });

  if (error) {
    throw createApiError(ERROR_CODES.INTERNAL_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, {
      message: 'RPC error during fn_redeem_reward',
      details: error.message,
    });
  }
  return data as RedeemRpcResult;
}

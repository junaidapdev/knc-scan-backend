import { supabaseAdmin } from '@/lib/supabase';
import { createApiError } from '@/lib/apiResponse';
import { maskPhone } from '@/lib/mask';
import { ERROR_CODES } from '@/constants/errors';
import { HTTP_STATUS } from '@/constants/http';
import type {
  IssuedRewardAdminDetail,
  IssuedRewardAdminRow,
} from '@/interfaces/admin';

const TABLE = 'rewards_issued';

function internal(detail: string, message: string): Error {
  return createApiError(ERROR_CODES.INTERNAL_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, {
    message,
    details: detail,
  });
}

interface JoinedRow {
  id: string;
  unique_code: string;
  status: 'pending' | 'redeemed' | 'expired';
  catalog_id: string;
  customer_id: string;
  reward_name_snapshot: string;
  reward_name_snapshot_ar: string | null;
  issued_at: string;
  expires_at: string;
  redeemed_at: string | null;
  redeemed_at_branch_id: string | null;
  redemption_ip: string | null;
  redemption_device_fingerprint: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  // Supabase types one-to-one joins as arrays; normalize at read time.
  customers:
    | { phone: string; name: string | null }
    | { phone: string; name: string | null }[]
    | null;
  branches?:
    | { name: string }
    | { name: string }[]
    | null;
}

function joinedBranch(
  j: JoinedRow['branches'],
): { name: string } | null {
  if (!j) return null;
  if (Array.isArray(j)) return j[0] ?? null;
  return j;
}

function joinedCustomer(
  j: JoinedRow['customers'],
): { phone: string; name: string | null } | null {
  if (!j) return null;
  if (Array.isArray(j)) return j[0] ?? null;
  return j;
}

function rowToListItem(r: JoinedRow): IssuedRewardAdminRow {
  const cust = joinedCustomer(r.customers);
  return {
    id: r.id,
    unique_code: r.unique_code,
    status: r.status,
    customer_id: r.customer_id,
    customer_phone_masked: maskPhone(cust?.phone ?? null) ?? '',
    customer_name: cust?.name ?? null,
    catalog_id: r.catalog_id,
    reward_name_snapshot: r.reward_name_snapshot,
    reward_name_snapshot_ar: r.reward_name_snapshot_ar,
    issued_at: r.issued_at,
    expires_at: r.expires_at,
    redeemed_at: r.redeemed_at,
    redeemed_at_branch_id: r.redeemed_at_branch_id,
    voided_at: r.voided_at,
    voided_by: r.voided_by,
    void_reason: r.void_reason,
  };
}

export interface ListIssuedParams {
  page: number;
  pageSize: number;
  status?: 'pending' | 'redeemed' | 'expired';
  customerId?: string;
  catalogId?: string;
  includeVoided: boolean;
  voidedOnly?: boolean;
}

export interface ListIssuedResult {
  rows: IssuedRewardAdminRow[];
  page: number;
  page_size: number;
  total: number;
}

export async function listIssued(params: ListIssuedParams): Promise<ListIssuedResult> {
  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;

  let query = supabaseAdmin
    .from(TABLE)
    .select(
      'id, unique_code, status, catalog_id, customer_id, reward_name_snapshot, reward_name_snapshot_ar, issued_at, expires_at, redeemed_at, redeemed_at_branch_id, redemption_ip, redemption_device_fingerprint, voided_at, voided_by, void_reason, customers(phone, name)',
      { count: 'exact' },
    )
    .order('issued_at', { ascending: false })
    .range(from, to);

  if (params.status) query = query.eq('status', params.status);
  if (params.customerId) query = query.eq('customer_id', params.customerId);
  if (params.catalogId) query = query.eq('catalog_id', params.catalogId);
  if (params.voidedOnly) {
    query = query.not('voided_at', 'is', null);
  } else if (!params.includeVoided) {
    query = query.is('voided_at', null);
  }

  const { data, error, count } = await query;
  if (error) throw internal(error.message, 'Failed to list issued rewards');
  const rows = (data as unknown as JoinedRow[] | null) ?? [];
  return {
    rows: rows.map(rowToListItem),
    page: params.page,
    page_size: params.pageSize,
    total: count ?? 0,
  };
}

export async function fetchIssuedDetail(
  id: string,
): Promise<IssuedRewardAdminDetail | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select(
      'id, unique_code, status, catalog_id, customer_id, reward_name_snapshot, reward_name_snapshot_ar, issued_at, expires_at, redeemed_at, redeemed_at_branch_id, redemption_ip, redemption_device_fingerprint, voided_at, voided_by, void_reason, customers(phone, name), branches:redeemed_at_branch_id(name)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw internal(error.message, 'Failed to load issued reward');
  if (!data) return null;
  const r = data as unknown as JoinedRow;
  const cust = joinedCustomer(r.customers);
  const br = joinedBranch(r.branches ?? null);
  return {
    ...rowToListItem(r),
    customer_phone_full: cust?.phone ?? '',
    redemption_ip: r.redemption_ip,
    redemption_device_fingerprint: r.redemption_device_fingerprint,
    redeemed_at_branch_name: br?.name ?? null,
  };
}

/**
 * Mark a pending reward as voided. 404 when missing, 409 when already
 * voided, 422 when not in 'pending' state (can't void something already
 * redeemed or system-expired).
 */
export async function voidReward(params: {
  id: string;
  adminId: string;
  reason: string;
}): Promise<IssuedRewardAdminRow> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('id, status, voided_at')
    .eq('id', params.id)
    .maybeSingle();
  if (error) throw internal(error.message, 'Failed to look up reward');
  if (!data) {
    throw createApiError(ERROR_CODES.REWARD_NOT_FOUND, HTTP_STATUS.NOT_FOUND, {
      message: 'No issued reward with that id',
    });
  }
  const row = data as { status: string; voided_at: string | null };
  if (row.voided_at) {
    throw createApiError(
      ERROR_CODES.REWARD_ALREADY_VOIDED,
      HTTP_STATUS.CONFLICT,
      { message: 'Reward already voided' },
    );
  }
  if (row.status !== 'pending') {
    throw createApiError(
      ERROR_CODES.REWARD_NOT_VOIDABLE,
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      { message: `Cannot void a reward in state '${row.status}'` },
    );
  }

  const { error: updErr } = await supabaseAdmin
    .from(TABLE)
    .update({
      voided_at: new Date().toISOString(),
      voided_by: params.adminId,
      void_reason: params.reason,
    })
    .eq('id', params.id);
  if (updErr) throw internal(updErr.message, 'Failed to void reward');

  const after = await fetchIssuedDetail(params.id);
  if (!after) {
    throw internal('post-void fetch returned null', 'Reward disappeared after void');
  }
  return after;
}

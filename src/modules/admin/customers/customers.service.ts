import { supabaseAdmin } from '@/lib/supabase';
import { createApiError } from '@/lib/apiResponse';
import { maskPhone } from '@/lib/mask';
import { ERROR_CODES } from '@/constants/errors';
import { HTTP_STATUS } from '@/constants/http';
import type {
  CustomerDetail,
  CustomerIssuedRewardRow,
  CustomerListItem,
  CustomerVisitRow,
} from '@/interfaces/admin';

const CUSTOMER_VIEW = 'v_customer_summary';

function internal(detail: string, message: string): Error {
  return createApiError(ERROR_CODES.INTERNAL_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, {
    message,
    details: detail,
  });
}

interface SummaryRow {
  id: string;
  phone: string;
  name: string | null;
  language: 'ar' | 'en';
  tier: string;
  current_stamps: number;
  cards_completed: number;
  total_visits: number;
  total_self_reported_spend_sar: number;
  last_scan_at: string | null;
  created_at: string;
  rewards_issued_count: number;
  rewards_redeemed_count: number;
  rewards_pending_count: number;
}

function rowToListItem(row: SummaryRow): CustomerListItem {
  return {
    id: row.id,
    phone_masked: maskPhone(row.phone) ?? '',
    name: row.name,
    language: row.language,
    tier: row.tier,
    current_stamps: row.current_stamps,
    cards_completed: row.cards_completed,
    total_visits: row.total_visits,
    total_self_reported_spend_sar: Number(row.total_self_reported_spend_sar),
    rewards_issued_count: row.rewards_issued_count,
    rewards_redeemed_count: row.rewards_redeemed_count,
    last_scan_at: row.last_scan_at,
    created_at: row.created_at,
  };
}

export interface ListCustomersParams {
  page: number;
  pageSize: number;
  search?: string;
  tier?: string;
  language?: 'ar' | 'en';
  sort: string;
}

export interface ListCustomersResult {
  rows: CustomerListItem[];
  page: number;
  page_size: number;
  total: number;
}

export async function listCustomers(
  params: ListCustomersParams,
): Promise<ListCustomersResult> {
  const [sortCol, sortDir] = params.sort.split('.') as [string, 'asc' | 'desc'];
  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;

  let query = supabaseAdmin
    .from(CUSTOMER_VIEW)
    .select('*', { count: 'exact' })
    .order(sortCol, { ascending: sortDir === 'asc', nullsFirst: false })
    .range(from, to);

  if (params.tier) query = query.eq('tier', params.tier);
  if (params.language) query = query.eq('language', params.language);
  if (params.search) {
    // Search against phone (exact match on E.164) OR name (ilike). Phone
    // search is intentionally exact — masking means admins typing a partial
    // number wouldn't match anyway, and exact lookup is the common case.
    const term = params.search.trim();
    if (term.startsWith('+')) {
      query = query.eq('phone', term);
    } else {
      query = query.ilike('name', `%${term}%`);
    }
  }

  const { data, error, count } = await query;
  if (error) throw internal(error.message, 'Failed to list customers');
  const rows = (data as SummaryRow[] | null) ?? [];
  return {
    rows: rows.map(rowToListItem),
    page: params.page,
    page_size: params.pageSize,
    total: count ?? 0,
  };
}

export async function fetchCustomerDetail(id: string): Promise<CustomerDetail | null> {
  const { data: summary, error } = await supabaseAdmin
    .from(CUSTOMER_VIEW)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw internal(error.message, 'Failed to read customer summary');
  if (!summary) return null;
  const s = summary as SummaryRow;

  // Pull extras not in the view.
  const { data: extraRow, error: extraErr } = await supabaseAdmin
    .from('customers')
    .select(
      'phone, birthday_month, birthday_day, preferred_branch_id, consent_marketing, lifetime_points',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (extraErr) throw internal(extraErr.message, 'Failed to read customer extras');
  if (!extraRow) return null;

  const { data: visitRows, error: visitErr } = await supabaseAdmin
    .from('visits')
    .select(
      'id, scanned_at, branch_id, stamp_awarded, lockout_applied, bill_amount, branches(name)',
    )
    .eq('customer_id', id)
    .order('scanned_at', { ascending: false })
    .limit(50);
  if (visitErr) throw internal(visitErr.message, 'Failed to read visits');

  type VisitJoin = {
    id: string;
    scanned_at: string;
    branch_id: string | null;
    stamp_awarded: boolean;
    lockout_applied: boolean;
    bill_amount: number | null;
    // Supabase returns joined rows as an array even for one-to-one FKs.
    branches: { name: string } | { name: string }[] | null;
  };
  const rawVisits = (visitRows as unknown as VisitJoin[] | null) ?? [];
  const recent_visits: CustomerVisitRow[] = rawVisits.map((v) => {
    const branch = Array.isArray(v.branches) ? v.branches[0] ?? null : v.branches;
    return {
      id: v.id,
      scanned_at: v.scanned_at,
      branch_id: v.branch_id,
      branch_name: branch?.name ?? null,
      stamp_awarded: v.stamp_awarded,
      lockout_applied: v.lockout_applied,
      bill_amount: v.bill_amount === null ? null : Number(v.bill_amount),
    };
  });

  const { data: rewardRows, error: rewardErr } = await supabaseAdmin
    .from('rewards_issued')
    .select(
      'id, unique_code, reward_name_snapshot, status, issued_at, expires_at, redeemed_at, voided_at',
    )
    .eq('customer_id', id)
    .order('issued_at', { ascending: false });
  if (rewardErr) throw internal(rewardErr.message, 'Failed to read rewards');
  const rewards = (rewardRows as CustomerIssuedRewardRow[] | null) ?? [];

  return {
    ...rowToListItem(s),
    phone_full: (extraRow as { phone: string }).phone,
    birthday_month:
      (extraRow as { birthday_month: number | null }).birthday_month ?? null,
    birthday_day:
      (extraRow as { birthday_day: number | null }).birthday_day ?? null,
    preferred_branch_id:
      (extraRow as { preferred_branch_id: string | null }).preferred_branch_id ?? null,
    consent_marketing:
      (extraRow as { consent_marketing: boolean }).consent_marketing,
    lifetime_points: (extraRow as { lifetime_points: number }).lifetime_points,
    recent_visits,
    rewards,
  };
}

/**
 * Soft-delete the customer row. Returns the post-state plus raw phone for
 * the audit metadata. Throws 404 on unknown id, 409 if already deleted.
 */
export async function softDeleteCustomer(id: string): Promise<{ phone: string }> {
  const { data: row, error } = await supabaseAdmin
    .from('customers')
    .select('id, phone, deleted_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw internal(error.message, 'Failed to look up customer');
  if (!row) {
    throw createApiError(ERROR_CODES.CUSTOMER_NOT_FOUND, HTTP_STATUS.NOT_FOUND, {
      message: 'No customer with that id',
    });
  }
  if ((row as { deleted_at: string | null }).deleted_at) {
    throw createApiError(
      ERROR_CODES.CUSTOMER_ALREADY_DELETED,
      HTTP_STATUS.CONFLICT,
      { message: 'Customer already deleted' },
    );
  }
  const { error: updErr } = await supabaseAdmin
    .from('customers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (updErr) throw internal(updErr.message, 'Failed to soft-delete customer');
  return { phone: (row as { phone: string }).phone };
}

export interface CustomerExportRow {
  id: string;
  phone: string;
  name: string | null;
  language: string;
  tier: string;
  current_stamps: number;
  cards_completed: number;
  total_visits: number;
  total_self_reported_spend_sar: number;
  last_scan_at: string | null;
  created_at: string;
}

/**
 * Streaming-friendly fetch of ALL non-deleted customers for CSV export.
 * Pages the query in 1000-row chunks so we never pull the whole table into
 * memory at once. No hard cap per product decision.
 */
export async function* iterateCustomersForExport(): AsyncGenerator<CustomerExportRow> {
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('customers')
      .select(
        'id, phone, name, language, tier, current_stamps, cards_completed, total_visits, total_self_reported_spend_sar, last_scan_at, created_at',
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw internal(error.message, 'Failed to page customers for export');
    const rows = (data as CustomerExportRow[] | null) ?? [];
    if (rows.length === 0) return;
    for (const r of rows) yield r;
    if (rows.length < PAGE) return;
    from += PAGE;
  }
}

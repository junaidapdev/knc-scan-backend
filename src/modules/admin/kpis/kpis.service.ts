import { supabaseAdmin } from '@/lib/supabase';
import { createApiError } from '@/lib/apiResponse';
import { ERROR_CODES } from '@/constants/errors';
import { HTTP_STATUS } from '@/constants/http';
import type {
  KpiByBranch,
  KpiSummary,
  KpiTimeseriesPoint,
} from '@/interfaces/admin';

function internal(detail: string, message: string): Error {
  return createApiError(ERROR_CODES.INTERNAL_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, {
    message,
    details: detail,
  });
}

export async function fetchKpiSummary(): Promise<KpiSummary> {
  const { data, error } = await supabaseAdmin
    .from('v_admin_kpi_summary')
    .select('*')
    .limit(1)
    .maybeSingle();
  if (error) throw internal(error.message, 'Failed to read v_admin_kpi_summary');
  // View always returns one row; if absent return zeros defensively.
  return (
    (data as KpiSummary | null) ?? {
      total_customers: 0,
      new_customers_30d: 0,
      scans_30d: 0,
      stamps_30d: 0,
      spend_30d: 0,
      rewards_issued_30d: 0,
      rewards_redeemed_30d: 0,
      rewards_outstanding: 0,
      active_branches: 0,
    }
  );
}

export async function fetchKpiByBranch(): Promise<KpiByBranch[]> {
  const { data, error } = await supabaseAdmin
    .from('v_admin_kpi_by_branch')
    .select('*')
    .order('scans_30d', { ascending: false });
  if (error) throw internal(error.message, 'Failed to read v_admin_kpi_by_branch');
  return (data as KpiByBranch[] | null) ?? [];
}

/**
 * Read v_daily_scans for the trailing `days` window, optionally filtered to
 * one branch, and fold to a per-day timeseries (merging branches when no
 * branch_id filter is supplied).
 */
export async function fetchKpiTimeseries(params: {
  days: number;
  branchId?: string;
}): Promise<KpiTimeseriesPoint[]> {
  const sinceDate = new Date(Date.now() - params.days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  let query = supabaseAdmin
    .from('v_daily_scans')
    .select(
      'scan_date, branch_id, scans, stamps_awarded, lockouts, total_bill_amount, unique_customers',
    )
    .gte('scan_date', sinceDate)
    .order('scan_date', { ascending: true });

  if (params.branchId) {
    query = query.eq('branch_id', params.branchId);
  }

  const { data, error } = await query;
  if (error) throw internal(error.message, 'Failed to read v_daily_scans');

  const rows = (data as Array<{
    scan_date: string;
    branch_id: string;
    scans: number;
    stamps_awarded: number;
    lockouts: number;
    total_bill_amount: number;
    unique_customers: number;
  }> | null) ?? [];

  // Merge per-branch rows into per-day rows when no branch filter is active.
  // Note: unique_customers becomes a SUM across branches (not distinct) —
  // acceptable for the admin chart; a chain-wide distinct would need a
  // separate view. Document the approximation in the interface comment.
  const byDay = new Map<string, KpiTimeseriesPoint>();
  for (const r of rows) {
    const existing = byDay.get(r.scan_date);
    if (existing) {
      existing.scans += Number(r.scans);
      existing.stamps_awarded += Number(r.stamps_awarded);
      existing.lockouts += Number(r.lockouts);
      existing.total_bill_amount += Number(r.total_bill_amount);
      existing.unique_customers += Number(r.unique_customers);
    } else {
      byDay.set(r.scan_date, {
        date: r.scan_date,
        scans: Number(r.scans),
        stamps_awarded: Number(r.stamps_awarded),
        lockouts: Number(r.lockouts),
        total_bill_amount: Number(r.total_bill_amount),
        unique_customers: Number(r.unique_customers),
      });
    }
  }
  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
}

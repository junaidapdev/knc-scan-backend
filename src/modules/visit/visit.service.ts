import { supabaseAdmin } from '@/lib/supabase';
import { createApiError } from '@/lib/apiResponse';
import { logger } from '@/lib/logger';
import { ERROR_CODES } from '@/constants/errors';
import { HTTP_STATUS } from '@/constants/http';
import { STAMP_LOCKOUT_HOURS } from '@/constants/business';
import { env } from '@/config/env';

const LOOKUP_ACTION = 'scan_lookup';

// Ladder per task 6 — N lookups/IP/min is a hard stop (429). If the IP has
// not breached the per-minute cap but has exceeded the per-hour silence
// threshold, we enter "silence mode" and always return exists:false, hiding
// whether the phone is registered. See visit.controller.ts for the apiError
// vs silent branch.
//
// Development mode gets much looser caps so smoke-testing doesn't trip the
// silence branch (which makes a registered phone look unregistered and
// misroutes the tester into the OTP flow). Production + test keep the
// original tight values so the integration suite and the live ladder stay
// honest.
const IS_DEV = env.NODE_ENV === 'development';
export const LOOKUP_HARD_LIMIT_PER_MIN = IS_DEV ? 1000 : 10;
export const LOOKUP_SILENCE_THRESHOLD_PER_HOUR = IS_DEV ? 1000 : 5;

export type LookupRateStatus = 'ok' | 'hard_limit' | 'silence_mode';

/**
 * Record the lookup attempt and return whether the caller is inside normal
 * limits, should be hard-capped with 429, or should be fed a silent
 * exists:false. The audit_log insert is best-effort — failures are logged
 * but do not block the request.
 */
export async function recordLookupAndCheckLimits(
  ip: string | undefined,
  phone: string,
): Promise<LookupRateStatus> {
  // Best-effort record — we never want a failed audit insert to block a scan.
  const { error: insertError } = await supabaseAdmin.from('audit_log').insert({
    ip: ip ?? null,
    action: LOOKUP_ACTION,
    phone,
    metadata: null,
  });
  if (insertError) {
    logger.warn('audit_log insert failed', {
      action: LOOKUP_ACTION,
      message: insertError.message,
    });
  }

  if (!ip) {
    // No IP available (shouldn't happen once trust proxy is set). Treat as
    // normal — we can't meaningfully rate-limit without an IP.
    return 'ok';
  }

  const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count: perMinCount, error: perMinErr } = await supabaseAdmin
    .from('audit_log')
    .select('*', { count: 'exact', head: true })
    .eq('action', LOOKUP_ACTION)
    .eq('ip', ip)
    .gte('created_at', oneMinAgo);
  if (perMinErr) throw perMinErr;

  if ((perMinCount ?? 0) > LOOKUP_HARD_LIMIT_PER_MIN) {
    return 'hard_limit';
  }

  const { count: perHourCount, error: perHourErr } = await supabaseAdmin
    .from('audit_log')
    .select('*', { count: 'exact', head: true })
    .eq('action', LOOKUP_ACTION)
    .eq('ip', ip)
    .gte('created_at', oneHourAgo);
  if (perHourErr) throw perHourErr;

  if ((perHourCount ?? 0) > LOOKUP_SILENCE_THRESHOLD_PER_HOUR) {
    return 'silence_mode';
  }

  return 'ok';
}

export interface CustomerLookupRow {
  id: string;
  name: string | null;
  current_stamps: number;
  language: 'ar' | 'en';
  last_scan_at: string | null;
}

export async function findCustomerByPhone(
  phone: string,
): Promise<CustomerLookupRow | null> {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, name, current_stamps, language, last_scan_at')
    .eq('phone', phone)
    .maybeSingle();

  if (error) {
    throw createApiError(ERROR_CODES.INTERNAL_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, {
      message: 'Failed to look up customer',
      details: error.message,
    });
  }
  return (data as CustomerLookupRow | null) ?? null;
}

export interface BranchLookupRow {
  id: string;
  active: boolean;
}

export async function findBranchByQrIdentifier(
  qrIdentifier: string,
): Promise<BranchLookupRow | null> {
  const { data, error } = await supabaseAdmin
    .from('branches')
    .select('id, active')
    .eq('qr_identifier', qrIdentifier)
    .maybeSingle();

  if (error) {
    throw createApiError(ERROR_CODES.INTERNAL_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, {
      message: 'Failed to look up branch by qr_identifier',
      details: error.message,
    });
  }
  return (data as BranchLookupRow | null) ?? null;
}

export interface IssuedRewardRpcPayload {
  reward_id: string;
  unique_code: string;
  catalog_id: string;
  name_en: string;
  name_ar: string;
  description_en: string | null;
  description_ar: string | null;
  estimated_value_sar: number;
  expires_at: string;
}

export interface ProcessScanRpcResult {
  success: boolean;
  reason?: string;
  detail?: string;
  visit_id?: string;
  stamp_awarded?: boolean;
  lockout_applied?: boolean;
  current_stamps?: number;
  ready_for_reward?: boolean;
  next_eligible_at?: string | null;
  issued_reward?: IssuedRewardRpcPayload | null;
  catalog_empty?: boolean;
}

export async function processScan(params: {
  customerId: string;
  branchId: string;
  billAmount: number;
  deviceFingerprint?: string;
  ipAddress?: string;
}): Promise<ProcessScanRpcResult> {
  const { data, error } = await supabaseAdmin.rpc('fn_process_scan', {
    p_customer_id: params.customerId,
    p_branch_id: params.branchId,
    p_bill_amount: params.billAmount,
    p_device_fingerprint: params.deviceFingerprint ?? null,
    p_ip_address: params.ipAddress ?? null,
  });

  if (error) {
    throw createApiError(ERROR_CODES.INTERNAL_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, {
      message: 'RPC error during fn_process_scan',
      details: error.message,
    });
  }
  return data as ProcessScanRpcResult;
}

/**
 * Compute next_eligible_at for a customer given their latest scan info.
 * Returns null when no lockout applies.
 *
 * Rule: customer must have at least one stamped visit (current_stamps >= 1)
 * AND last_scan_at must be within the STAMP_LOCKOUT_HOURS window.
 */
export function computeNextEligibleAt(input: {
  last_scan_at: string | null;
  current_stamps: number;
}): string | null {
  if (!input.last_scan_at || input.current_stamps < 1) return null;
  const lastScanMs = Date.parse(input.last_scan_at);
  if (Number.isNaN(lastScanMs)) return null;
  const unlockAtMs = lastScanMs + STAMP_LOCKOUT_HOURS * 60 * 60 * 1000;
  if (unlockAtMs <= Date.now()) return null;
  return new Date(unlockAtMs).toISOString();
}

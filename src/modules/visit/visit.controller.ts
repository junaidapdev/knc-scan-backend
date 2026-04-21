import type { Request, Response, NextFunction } from 'express';

import { apiSuccess, createApiError } from '@/lib/apiResponse';
import { signScanToken, signSessionToken } from '@/lib/jwt';
import { HTTP_STATUS } from '@/constants/http';
import { ERROR_CODES, type ErrorCode } from '@/constants/errors';

import type { ScanLookupPayload } from '@/interfaces/visit/ScanLookupPayload';
import type {
  ScanLookupResult,
  ScanLookupProfile,
} from '@/interfaces/visit/ScanLookupResult';
import type { ScanPayload } from '@/interfaces/visit/ScanPayload';
import type { ScanResult } from '@/interfaces/visit/ScanResult';
import type { LockoutResult } from '@/interfaces/visit/LockoutResult';

import {
  computeNextEligibleAt,
  findBranchByQrIdentifier,
  findCustomerByPhone,
  processScan,
  recordLookupAndCheckLimits,
} from './visit.service';

const SCAN_TOKEN_TTL_SECONDS = 5 * 60;

// Map fn_process_scan reason strings → HTTP status. Anything unknown is 500.
function statusForScanReason(
  reason: string | undefined,
): (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS] {
  switch (reason) {
    case ERROR_CODES.BRANCH_NOT_FOUND:
    case ERROR_CODES.CUSTOMER_NOT_FOUND:
      return HTTP_STATUS.NOT_FOUND;
    case ERROR_CODES.BRANCH_INACTIVE:
      return HTTP_STATUS.UNPROCESSABLE_ENTITY;
    default:
      return HTTP_STATUS.INTERNAL_SERVER_ERROR;
  }
}

export async function scanLookup(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { phone } = req.body as ScanLookupPayload;
    const ip = req.ip;

    const rate = await recordLookupAndCheckLimits(ip, phone);

    if (rate === 'hard_limit') {
      throw createApiError(ERROR_CODES.RATE_LIMITED, HTTP_STATUS.TOO_MANY_REQUESTS, {
        message: 'Too many lookup attempts from this IP. Try again shortly.',
      });
    }

    // Silence mode: mimic the "no such customer" response without touching the
    // DB. Hides whether the phone is registered from a probing attacker.
    if (rate === 'silence_mode') {
      const body: ScanLookupResult = { exists: false };
      res.json(apiSuccess(body));
      return;
    }

    const customer = await findCustomerByPhone(phone);

    if (!customer) {
      const body: ScanLookupResult = { exists: false };
      res.json(apiSuccess(body));
      return;
    }

    const profile: ScanLookupProfile = {
      name: customer.name,
      current_stamps: customer.current_stamps,
      language: customer.language,
      next_eligible_at: computeNextEligibleAt({
        last_scan_at: customer.last_scan_at,
        current_stamps: customer.current_stamps,
      }),
    };

    const scanToken = signScanToken({ phone, customerId: customer.id });
    // Mint a long-lived session JWT too so returning customers can reach
    // /rewards (and other session-scoped endpoints) without re-doing OTP.
    // The scan flow continues to use `scanToken` explicitly via the http
    // helper's `token` option; this session token is only consumed when the
    // client falls back to the persisted localStorage JWT.
    const sessionToken = signSessionToken({ phone, customerId: customer.id });

    const body: ScanLookupResult = {
      exists: true,
      profile,
      scan_token: scanToken,
      scan_token_expires_in_seconds: SCAN_TOKEN_TTL_SECONDS,
      session_token: sessionToken,
      customer_id: customer.id,
    };
    res.json(apiSuccess(body));
  } catch (err) {
    next(err);
  }
}

export async function scan(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const customerId = req.customer?.customerId;
    if (!customerId) {
      throw createApiError(ERROR_CODES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED, {
        message: 'Token missing customerId claim',
      });
    }

    const payload = req.body as ScanPayload;

    // 1) Resolve branch up front so we can return a clean 404 / 422 without
    //    the RPC round-trip noise.
    const branch = await findBranchByQrIdentifier(payload.branch_qr_identifier);
    if (!branch) {
      throw createApiError(ERROR_CODES.BRANCH_NOT_FOUND, HTTP_STATUS.NOT_FOUND, {
        message: 'No branch matches the provided qr_identifier',
      });
    }
    if (!branch.active) {
      throw createApiError(ERROR_CODES.BRANCH_INACTIVE, HTTP_STATUS.UNPROCESSABLE_ENTITY, {
        message: 'The scanned branch is not currently active',
      });
    }

    // 2) Atomic scan processing via RPC.
    const rpc = await processScan({
      customerId,
      branchId: branch.id,
      billAmount: payload.bill_amount,
      deviceFingerprint: payload.device_fingerprint,
      ipAddress: req.ip,
    });

    if (!rpc.success) {
      const code = (rpc.reason ?? ERROR_CODES.INTERNAL_ERROR) as ErrorCode;
      const status = statusForScanReason(rpc.reason);
      throw createApiError(code, status, {
        message: 'fn_process_scan failed',
        detail: rpc.detail,
      });
    }

    // 3) Lockout → return apiError(SCAN_LOCKOUT_ACTIVE, 422). Visit IS recorded.
    if (rpc.lockout_applied) {
      const details: LockoutResult = {
        next_eligible_at: rpc.next_eligible_at ?? '',
        current_stamps: rpc.current_stamps ?? 0,
        visit_id_for_record: rpc.visit_id ?? '',
      };
      throw createApiError(
        ERROR_CODES.SCAN_LOCKOUT_ACTIVE,
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        details,
      );
    }

    // 4) Success path — either stamp awarded, or card-full/ready-for-reward.
    const result: ScanResult = {
      stamp_awarded: rpc.stamp_awarded ?? false,
      current_stamps: rpc.current_stamps ?? 0,
      ready_for_reward: rpc.ready_for_reward ?? false,
      visit_id: rpc.visit_id ?? '',
      issued_reward: rpc.issued_reward ?? null,
      catalog_empty: rpc.catalog_empty ?? false,
    };
    res.status(HTTP_STATUS.OK).json(apiSuccess(result));
  } catch (err) {
    next(err);
  }
}

import type { Request, Response, NextFunction } from 'express';
import { apiSuccess, createApiError } from '@/lib/apiResponse';
import { writeAudit } from '@/lib/audit';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '@/constants/audit';
import { ERROR_CODES } from '@/constants/errors';
import { HTTP_STATUS } from '@/constants/http';

import {
  fetchIssuedDetail,
  listIssued,
  voidReward,
} from './rewards.service';

export async function list(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const q = req.query as Record<string, string | undefined>;
    const result = await listIssued({
      page: Number(q.page ?? 1),
      pageSize: Number(q.page_size ?? 50),
      status: q.status as 'pending' | 'redeemed' | 'expired' | undefined,
      customerId: q.customer_id,
      catalogId: q.catalog_id,
      includeVoided: q.include_voided === 'true',
      voidedOnly: q.voided_only === 'true',
    });
    res.json(apiSuccess(result));
  } catch (err) {
    next(err);
  }
}

export async function detail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = req.params.id;
    const row = await fetchIssuedDetail(id);
    if (!row) {
      throw createApiError(ERROR_CODES.REWARD_NOT_FOUND, HTTP_STATUS.NOT_FOUND, {
        message: 'No issued reward with that id',
      });
    }
    await writeAudit({
      action: AUDIT_ACTIONS.ADMIN_REWARD_VIEW_DETAIL,
      adminId: req.admin?.admin_id ?? null,
      ip: req.ip ?? null,
      entityType: AUDIT_ENTITIES.REWARD_ISSUED,
      entityId: id,
      phone: row.customer_phone_full || null,
    });
    res.json(apiSuccess(row));
  } catch (err) {
    next(err);
  }
}

export async function voidOne(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = req.params.id;
    const adminId = req.admin?.admin_id;
    if (!adminId) {
      throw createApiError(ERROR_CODES.ADMIN_AUTH_REQUIRED, HTTP_STATUS.UNAUTHORIZED, {
        message: 'Admin identity missing',
      });
    }
    const reason = (req.body as { reason: string }).reason;
    const row = await voidReward({ id, adminId, reason });
    await writeAudit({
      action: AUDIT_ACTIONS.ADMIN_REWARD_VOID,
      adminId,
      ip: req.ip ?? null,
      entityType: AUDIT_ENTITIES.REWARD_ISSUED,
      entityId: id,
      metadata: { reason, unique_code: row.unique_code },
    });
    res.json(apiSuccess(row));
  } catch (err) {
    next(err);
  }
}

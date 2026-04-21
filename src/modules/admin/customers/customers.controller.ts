import type { Request, Response, NextFunction } from 'express';
import { apiSuccess, createApiError } from '@/lib/apiResponse';
import { writeAudit } from '@/lib/audit';
import { maskPhone } from '@/lib/mask';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '@/constants/audit';
import { ERROR_CODES } from '@/constants/errors';
import { HTTP_STATUS } from '@/constants/http';

import {
  fetchCustomerDetail,
  listCustomers,
  softDeleteCustomer,
} from './customers.service';
import { streamCustomerCsv } from './customers.export';

export async function list(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const q = req.query as Record<string, string | undefined>;
    const result = await listCustomers({
      page: Number(q.page ?? 1),
      pageSize: Number(q.page_size ?? 50),
      search: q.search,
      tier: q.tier,
      language: q.language as 'ar' | 'en' | undefined,
      sort: q.sort ?? 'created_at.desc',
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
    const row = await fetchCustomerDetail(id);
    if (!row) {
      throw createApiError(ERROR_CODES.CUSTOMER_NOT_FOUND, HTTP_STATUS.NOT_FOUND, {
        message: 'No customer with that id',
      });
    }
    await writeAudit({
      action: AUDIT_ACTIONS.ADMIN_CUSTOMER_VIEW_DETAIL,
      adminId: req.admin?.admin_id ?? null,
      ip: req.ip ?? null,
      entityType: AUDIT_ENTITIES.CUSTOMER,
      entityId: id,
      phone: row.phone_full,
    });
    res.json(apiSuccess(row));
  } catch (err) {
    next(err);
  }
}

export async function remove(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = req.params.id;
    const { phone } = await softDeleteCustomer(id);
    await writeAudit({
      action: AUDIT_ACTIONS.ADMIN_CUSTOMER_DELETE,
      adminId: req.admin?.admin_id ?? null,
      ip: req.ip ?? null,
      entityType: AUDIT_ENTITIES.CUSTOMER,
      entityId: id,
      phone,
      metadata: { phone_masked: maskPhone(phone) },
    });
    res.json(apiSuccess({ ok: true, id }));
  } catch (err) {
    next(err);
  }
}

export async function exportCsv(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await writeAudit({
      action: AUDIT_ACTIONS.ADMIN_CUSTOMER_EXPORT,
      adminId: req.admin?.admin_id ?? null,
      ip: req.ip ?? null,
      entityType: AUDIT_ENTITIES.CUSTOMER,
    });
    await streamCustomerCsv(res);
  } catch (err) {
    next(err);
  }
}

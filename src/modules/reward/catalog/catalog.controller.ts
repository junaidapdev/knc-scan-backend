import type { Request, Response, NextFunction } from 'express';
import { apiSuccess } from '@/lib/apiResponse';
import { writeAudit } from '@/lib/audit';
import { HTTP_STATUS } from '@/constants/http';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '@/constants/audit';
import type {
  CatalogCreatePayload,
  CatalogUpdatePayload,
  CatalogStatus,
} from '@/interfaces/reward';
import {
  listCatalog,
  createCatalogItem,
  updateCatalogItem,
  setCatalogStatus,
} from './catalog.service';

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = (req.query.status as CatalogStatus | undefined) ?? undefined;
    const rows = await listCatalog(status);
    res.json(apiSuccess(rows));
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const created = await createCatalogItem(req.body as CatalogCreatePayload);
    await writeAudit({
      action: AUDIT_ACTIONS.ADMIN_CATALOG_CREATE,
      adminId: req.admin?.admin_id ?? null,
      ip: req.ip ?? null,
      entityType: AUDIT_ENTITIES.CATALOG,
      entityId: (created as { id?: string }).id ?? null,
      metadata: { code_prefix: (created as { code_prefix?: string }).code_prefix },
    });
    res.status(HTTP_STATUS.CREATED).json(apiSuccess(created));
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const updated = await updateCatalogItem(req.params.id, req.body as CatalogUpdatePayload);
    await writeAudit({
      action: AUDIT_ACTIONS.ADMIN_CATALOG_UPDATE,
      adminId: req.admin?.admin_id ?? null,
      ip: req.ip ?? null,
      entityType: AUDIT_ENTITIES.CATALOG,
      entityId: req.params.id,
      metadata: { fields: Object.keys(req.body as Record<string, unknown>) },
    });
    res.json(apiSuccess(updated));
  } catch (err) {
    next(err);
  }
}

async function setStatus(
  req: Request,
  res: Response,
  status: CatalogStatus,
  action:
    | typeof AUDIT_ACTIONS.ADMIN_CATALOG_PAUSE
    | typeof AUDIT_ACTIONS.ADMIN_CATALOG_RESUME
    | typeof AUDIT_ACTIONS.ADMIN_CATALOG_ARCHIVE,
): Promise<void> {
  const updated = await setCatalogStatus(req.params.id, status);
  await writeAudit({
    action,
    adminId: req.admin?.admin_id ?? null,
    ip: req.ip ?? null,
    entityType: AUDIT_ENTITIES.CATALOG,
    entityId: req.params.id,
  });
  res.json(apiSuccess(updated));
}

export async function pause(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await setStatus(req, res, 'paused', AUDIT_ACTIONS.ADMIN_CATALOG_PAUSE);
  } catch (err) {
    next(err);
  }
}

export async function resume(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await setStatus(req, res, 'active', AUDIT_ACTIONS.ADMIN_CATALOG_RESUME);
  } catch (err) {
    next(err);
  }
}

export async function archive(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await setStatus(req, res, 'archived', AUDIT_ACTIONS.ADMIN_CATALOG_ARCHIVE);
  } catch (err) {
    next(err);
  }
}

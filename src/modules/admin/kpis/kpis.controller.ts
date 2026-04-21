import type { Request, Response, NextFunction } from 'express';
import { apiSuccess } from '@/lib/apiResponse';
import {
  fetchKpiByBranch,
  fetchKpiSummary,
  fetchKpiTimeseries,
} from './kpis.service';

export async function summary(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await fetchKpiSummary();
    res.json(apiSuccess(data));
  } catch (err) {
    next(err);
  }
}

export async function byBranch(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rows = await fetchKpiByBranch();
    res.json(apiSuccess(rows));
  } catch (err) {
    next(err);
  }
}

export async function timeseries(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const days = Number(req.query.days ?? 30);
    const branchId = req.query.branch_id as string | undefined;
    const points = await fetchKpiTimeseries({ days, branchId });
    res.json(apiSuccess(points));
  } catch (err) {
    next(err);
  }
}

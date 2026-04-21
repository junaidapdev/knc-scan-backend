import type { Request, Response, NextFunction } from 'express';
import { listActiveBranches } from './branch.service';
import { apiSuccess } from '@/lib/apiResponse';

export async function getBranches(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const branches = await listActiveBranches();
    res.json(apiSuccess({ branches }));
  } catch (error) {
    next(error);
  }
}

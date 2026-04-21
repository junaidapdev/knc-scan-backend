import { Router } from 'express';
import { validate } from '@/middleware/validator';
import { requireAdmin } from '@/middleware/requireAdmin';
import { kpiValidators } from './kpis.validators';
import * as kpis from './kpis.controller';

const router = Router();
router.use(requireAdmin());

router.get('/summary', kpis.summary);
router.get('/by-branch', kpis.byBranch);
router.get('/timeseries', validate(kpiValidators.timeseries), kpis.timeseries);

export { router as adminKpiRoutes };

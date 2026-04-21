import { Router } from 'express';
import { adminAuthRoutes } from './auth';
import { adminKpiRoutes } from './kpis';
import { adminCustomerRoutes } from './customers';
import { adminIssuedRewardRoutes } from './rewards';

/**
 * Composite `/admin` router. Auth sub-router is mounted first (it handles
 * the public /login endpoint). All other sub-routers mount their own
 * `requireAdmin()` via the sub-router.use chain.
 */
const router = Router();

router.use('/auth', adminAuthRoutes);
router.use('/kpis', adminKpiRoutes);
router.use('/customers', adminCustomerRoutes);
router.use('/rewards/issued', adminIssuedRewardRoutes);

export { router as adminRouter };

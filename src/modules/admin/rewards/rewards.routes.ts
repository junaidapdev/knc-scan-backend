import { Router } from 'express';
import { validate } from '@/middleware/validator';
import { requireAdmin } from '@/middleware/requireAdmin';
import { adminRewardValidators } from './rewards.validators';
import * as rewards from './rewards.controller';

const router = Router();
router.use(requireAdmin());

router.get('/', validate(adminRewardValidators.list), rewards.list);
router.get('/:id', validate(adminRewardValidators.idParam), rewards.detail);
router.post('/:id/void', validate(adminRewardValidators.void), rewards.voidOne);

export { router as adminIssuedRewardRoutes };

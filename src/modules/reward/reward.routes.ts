import { Router } from 'express';
import { validate } from '@/middleware/validator';
import { requireAuth } from '@/lib/jwt';
import { requireAdmin } from '@/middleware/requireAdmin';

import { catalogValidators } from './catalog/catalog.validators';
import * as catalog from './catalog/catalog.controller';
import { issuedValidators } from './issued/issued.validators';
import * as issued from './issued/issued.controller';

// ---------------------------------------------------------------------------
// Admin catalog router — mounted at /admin/rewards/catalog
// ---------------------------------------------------------------------------
const adminCatalog = Router();
adminCatalog.use(requireAdmin());

adminCatalog.get('/', validate(catalogValidators.list), catalog.list);
adminCatalog.post('/', validate(catalogValidators.create), catalog.create);
adminCatalog.patch('/:id', validate(catalogValidators.update), catalog.update);
adminCatalog.post('/:id/pause', validate(catalogValidators.idParam), catalog.pause);
adminCatalog.post('/:id/resume', validate(catalogValidators.idParam), catalog.resume);
adminCatalog.post('/:id/archive', validate(catalogValidators.idParam), catalog.archive);

// ---------------------------------------------------------------------------
// Public redemption router — mounted at /rewards
// ---------------------------------------------------------------------------
const rewards = Router();

rewards.post(
  '/:unique_code/confirm-redeem-step-1',
  requireAuth(['session']),
  validate(issuedValidators.step1),
  issued.confirmStep1,
);
rewards.post(
  '/:unique_code/confirm-redeem-step-2',
  requireAuth(['session']),
  validate(issuedValidators.step2),
  issued.confirmStep2,
);

// ---------------------------------------------------------------------------
// Customer "my rewards" router — mounted at /customers/me/rewards.
// Lives here because the handler is a reward concern; mounted under
// /customers for URL-namespace consistency.
// ---------------------------------------------------------------------------
const customerRewards = Router();
customerRewards.get('/', requireAuth(['session']), issued.listMine);

export { adminCatalog, rewards as rewardRoutes, customerRewards };

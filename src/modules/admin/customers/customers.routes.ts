import { Router } from 'express';
import { validate } from '@/middleware/validator';
import { requireAdmin } from '@/middleware/requireAdmin';
import { customerAdminValidators } from './customers.validators';
import * as customers from './customers.controller';

const router = Router();
router.use(requireAdmin());

router.get('/', validate(customerAdminValidators.list), customers.list);
// Order matters: `/export` must come before `/:id` so Express doesn't route
// it to the detail handler with id='export'.
router.get('/export', customers.exportCsv);
router.get('/:id', validate(customerAdminValidators.idParam), customers.detail);
router.delete('/:id', validate(customerAdminValidators.idParam), customers.remove);

export { router as adminCustomerRoutes };

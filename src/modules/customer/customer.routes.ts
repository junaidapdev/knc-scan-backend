import { Router } from 'express';
import { validate } from '@/middleware/validator';
import { requireAuth } from '@/lib/jwt';
import { customerValidators } from './customer.validators';
import { registerCustomer, getCustomerProfile } from './customer.controller';
import { customerRewards } from '@/modules/reward';

const router = Router();

router.post('/register', requireAuth(['registration']), validate(customerValidators.register), registerCustomer);
router.get('/me', requireAuth(['session']), getCustomerProfile);

// Customer's own issued rewards. Lives under /customers/me/... for namespace
// consistency with the profile endpoint; handler belongs to the reward module.
router.use('/me/rewards', customerRewards);

export const customerRoutes = router;

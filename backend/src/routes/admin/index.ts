import { Router } from 'express';
import { authenticate, requireRole } from '../../auth/middleware';
import analytics from './analytics';
import questions from './questions';
import testCases from './testCases';
import tests from './tests';
import users from './users';

const router = Router();

// Every route below requires an authenticated admin. Enforced server-side.
router.use(authenticate);
router.use(requireRole('ADMIN'));

router.use(users);
router.use(questions);
router.use(testCases);
router.use(tests);
router.use(analytics);

export default router;

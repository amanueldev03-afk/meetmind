import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { devLogin, getCurrentUser, telegramLogin } from './auth.controller.js';

const router = Router();

router.post('/telegram', telegramLogin);
if (process.env.NODE_ENV === 'development') {
  router.post('/dev-login', devLogin);
}
router.get('/me', requireAuth, getCurrentUser);

export default router;
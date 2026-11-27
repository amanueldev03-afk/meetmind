import { Router } from 'express';
import { handleLiveKitWebhook } from './livekit.webhook.js';

const router = Router();

router.post('/', handleLiveKitWebhook);

export default router;
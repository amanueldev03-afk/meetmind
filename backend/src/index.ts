import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { webhookCallback } from 'grammy';
import healthRoutes from './health/health.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import groupRoutes from './modules/groups/groups.routes.js';
import meetingRoutes from './modules/meetings/meetings.routes.js';
import liveKitWebhookRoutes from './modules/webhooks/webhooks.routes.js';
import { bot } from './services/telegram.service.js';
import { startReminderScheduler, stopReminderScheduler } from './workers/reminder.worker.js';

const app = express();
const port = Number(process.env.PORT ?? 3000);
const isProduction = process.env.NODE_ENV === 'production';
const telegramWebhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const telegramAllowedUpdates = [
  'message',
  'chat_member',
  'my_chat_member',
  'callback_query',
] as const;

if (!Number.isInteger(port) || port <= 0) {
  throw new Error('PORT must be a positive integer.');
}

if (isProduction) {
  if (!telegramWebhookUrl || !telegramWebhookSecret) {
    throw new Error(
      'TELEGRAM_WEBHOOK_URL and TELEGRAM_WEBHOOK_SECRET must be set in production.',
    );
  }
  if (
    !telegramWebhookSecret.match(/^[A-Za-z0-9_-]{1,256}$/) ||
    !telegramWebhookUrl.startsWith('https://')
  ) {
    throw new Error('Telegram webhook URL must use HTTPS and its secret must be valid.');
  }
}

app.use(cors());
app.use(
  '/api/webhooks/livekit',
  express.raw({ type: 'application/webhook+json' }),
  liveKitWebhookRoutes,
);
app.use(express.json());
if (isProduction && telegramWebhookSecret) {
  app.post(
    '/api/webhooks/telegram',
    webhookCallback(bot, 'express', { secretToken: telegramWebhookSecret }),
  );
}
app.use('/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/meetings', meetingRoutes);

startReminderScheduler();

const server = app.listen(port, () => {
  console.log(`MeetMind API listening on port ${port}.`);
});

if (isProduction && telegramWebhookUrl && telegramWebhookSecret) {
  void bot.api
    .setWebhook(telegramWebhookUrl, {
      secret_token: telegramWebhookSecret,
      allowed_updates: [...telegramAllowedUpdates],
    })
    .catch((error: unknown) => {
      console.error('Telegram webhook setup failed:', error);
      stopReminderScheduler();
      process.exitCode = 1;
      server.close();
    });
} else {
  void bot.api
    .deleteWebhook()
    .then(() =>
      bot.start({
        allowed_updates: [...telegramAllowedUpdates],
      }),
    )
    .catch((error: unknown) => {
      console.error('Telegram bot long polling failed:', error);
      stopReminderScheduler();
      process.exitCode = 1;
      server.close();
    });
}
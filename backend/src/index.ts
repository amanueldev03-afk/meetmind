import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import healthRoutes from './health/health.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import groupRoutes from './modules/groups/groups.routes.js';
import { bot } from './services/telegram.service.js';

const app = express();
const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error('PORT must be a positive integer.');
}

app.use(cors());
app.use(express.json());
app.use('/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);

const server = app.listen(port, () => {
  console.log(`MeetMind API listening on port ${port}.`);
});

if (process.env.NODE_ENV !== 'production') {
  void bot.start({
    allowed_updates: ['message', 'chat_member', 'my_chat_member'],
  }).catch((error: unknown) => {
    console.error('Telegram bot long polling failed:', error);
    process.exitCode = 1;
    server.close();
  });
}
import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

const router = Router();

router.get('/', async (_req, res) => {
  await db.execute(sql`select 1`);
  res.json({ status: 'ok' });
});

export default router;
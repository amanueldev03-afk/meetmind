import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { groupMemberships, users } from '../../db/schema/users.schema.js';
import { syncUserGroupMemberships } from '../../services/telegram.service.js';
import { devLoginSchema, telegramLoginSchema } from './auth.schema.js';
import { getJwtSecret, signAuthToken } from './auth.utils.js';

function getProfile(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    telegramUserId: user.telegramUserId,
    telegramUsername: user.telegramUsername,
    avatarUrl: user.avatarUrl,
    isSystemAdmin: user.isSystemAdmin,
    createdAt: user.createdAt,
  };
}

async function getMemberships(userId: string) {
  return db
    .select({
      groupId: groupMemberships.groupId,
      role: groupMemberships.role,
    })
    .from(groupMemberships)
    .where(eq(groupMemberships.userId, userId));
}

function verifyTelegramPayload(
  payload: Record<string, unknown> & { hash: string },
  botToken: string,
): boolean {
  const checkStringEntries = Object.entries(payload).filter(([key]) => key !== 'hash');
  if (
    checkStringEntries.some(
      ([, value]) =>
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean',
    )
  ) {
    return false;
  }

  const dataCheckString = checkStringEntries
    .sort(([leftKey], [rightKey]) =>
      leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0,
    )
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('\n');
  const secretKey = createHash('sha256').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest();
  const receivedHash = Buffer.from(payload.hash, 'hex');

  return receivedHash.length === expectedHash.length && timingSafeEqual(receivedHash, expectedHash);
}

export async function telegramLogin(req: Request, res: Response): Promise<void> {
  const parsed = telegramLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid Telegram login payload.' });
    return;
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    res.status(500).json({ error: 'Telegram authentication is not configured.' });
    return;
  }

  if (!verifyTelegramPayload(parsed.data, botToken)) {
    res.status(401).json({ error: 'Invalid Telegram login signature.' });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  if (parsed.data.auth_date > now + 60 || now - parsed.data.auth_date > 86400) {
    res.status(401).json({ error: 'Telegram login payload has expired.' });
    return;
  }

  const displayName = [parsed.data.first_name, parsed.data.last_name].filter(Boolean).join(' ');
  const [user] = await db
    .insert(users)
    .values({
      telegramUserId: String(parsed.data.id),
      displayName,
      telegramUsername: parsed.data.username ?? null,
      avatarUrl: parsed.data.photo_url ?? null,
    })
    .onConflictDoUpdate({
      target: users.telegramUserId,
      set: {
        displayName,
        telegramUsername: parsed.data.username ?? null,
        avatarUrl: parsed.data.photo_url ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (user.isBanned) {
    res.status(403).json({ error: 'This account is banned.' });
    return;
  }

  const jwtSecret = getJwtSecret();
  if (!jwtSecret) {
    res.status(500).json({ error: 'JWT authentication is not configured.' });
    return;
  }

  await syncUserGroupMemberships(user.id, user.telegramUserId!);

  res.json({
    token: signAuthToken(user.id, jwtSecret),
    user: getProfile(user),
    memberships: await getMemberships(user.id),
  });
}

export async function devLogin(req: Request, res: Response): Promise<void> {
  if (process.env.NODE_ENV !== 'development') {
    res.status(404).json({ error: 'Developer login is only available in development.' });
    return;
  }

  const parsed = devLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid Telegram ID.' });
    return;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.telegramUserId, String(parsed.data.telegramId)))
    .limit(1);

  if (!user || user.isBanned) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const jwtSecret = getJwtSecret();
  if (!jwtSecret) {
    res.status(500).json({ error: 'JWT authentication is not configured.' });
    return;
  }

  await syncUserGroupMemberships(user.id, user.telegramUserId!);

  res.json({
    token: signAuthToken(user.id, jwtSecret),
    user: getProfile(user),
    memberships: await getMemberships(user.id),
  });
}

export async function getCurrentUser(req: Request, res: Response): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  res.json({
    user: getProfile(user),
    memberships: await getMemberships(user.id),
  });
}
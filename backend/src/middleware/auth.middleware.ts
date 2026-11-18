import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema/users.schema.js';
import { jwtPayloadSchema } from '../modules/auth/auth.schema.js';
import { getJwtSecret } from '../modules/auth/auth.utils.js';

export interface AuthenticatedUser {
  id: string;
  isSystemAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const authorization = req.header('Authorization');
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!match) {
    res.status(401).json({ error: 'A bearer token is required.' });
    return;
  }

  const secret = getJwtSecret();
  if (!secret) {
    res.status(500).json({ error: 'JWT authentication is not configured.' });
    return;
  }

  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(match[1], secret);
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }

  const payload = jwtPayloadSchema.safeParse(decoded);
  if (!payload.success) {
    res.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }

  const [user] = await db
    .select({ id: users.id, isSystemAdmin: users.isSystemAdmin, isBanned: users.isBanned })
    .from(users)
    .where(eq(users.id, payload.data.sub))
    .limit(1);

  if (!user || user.isBanned) {
    res.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }

  req.user = { id: user.id, isSystemAdmin: user.isSystemAdmin };
  next();
};
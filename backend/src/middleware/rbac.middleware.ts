import type { RequestHandler } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { groupMemberships, groupRoleEnum } from '../db/schema/users.schema.js';
import { groupIdSchema } from '../modules/groups/groups.schema.js';

type GroupRole = (typeof groupRoleEnum.enumValues)[number];

export const requireSystemAdmin: RequestHandler = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication is required.' });
    return;
  }
  if (!req.user.isSystemAdmin) {
    res.status(403).json({ error: 'System administrator access is required.' });
    return;
  }
  next();
};

export function requireGroupRole(allowedRoles: readonly GroupRole[]): RequestHandler {
  return async (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication is required.' });
      return;
    }

    const parsedGroupId = groupIdSchema.safeParse(req.params.groupId);
    if (!parsedGroupId.success) {
      res.status(400).json({ error: 'Invalid group ID.' });
      return;
    }

    const [membership] = await db
      .select({ role: groupMemberships.role })
      .from(groupMemberships)
      .where(
        and(
          eq(groupMemberships.groupId, parsedGroupId.data),
          eq(groupMemberships.userId, req.user.id),
        ),
      )
      .limit(1);

    if (!membership || !allowedRoles.includes(membership.role)) {
      res.status(403).json({ error: 'You do not have the required group role.' });
      return;
    }

    next();
  };
}
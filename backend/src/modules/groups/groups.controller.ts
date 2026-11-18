import type { Request, Response } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { auditLogs } from '../../db/schema/audit.schema.js';
import { groupMemberships, telegramGroups, users } from '../../db/schema/users.schema.js';
import {
  groupMemberParamsSchema,
  groupParamsSchema,
  updateGroupSchema,
  updateMemberRoleSchema,
} from './groups.schema.js';

export async function listGroups(req: Request, res: Response): Promise<void> {
  const memberships = await db
    .select({
      id: telegramGroups.id,
      telegramGroupId: telegramGroups.telegramGroupId,
      title: telegramGroups.title,
      retentionDays: telegramGroups.retentionDays,
      role: groupMemberships.role,
    })
    .from(groupMemberships)
    .innerJoin(telegramGroups, eq(groupMemberships.groupId, telegramGroups.id))
    .where(eq(groupMemberships.userId, req.user!.id));

  res.json({ groups: memberships });
}

export async function listGroupMembers(req: Request, res: Response): Promise<void> {
  const parsedParams = groupParamsSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: 'Invalid group ID.' });
    return;
  }

  const members = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      telegramUsername: users.telegramUsername,
      avatarUrl: users.avatarUrl,
      role: groupMemberships.role,
      lastVerifiedAt: groupMemberships.lastVerifiedAt,
    })
    .from(groupMemberships)
    .innerJoin(users, eq(groupMemberships.userId, users.id))
    .where(eq(groupMemberships.groupId, parsedParams.data.groupId));

  res.json({ members });
}

export async function updateGroup(req: Request, res: Response): Promise<void> {
  const parsedParams = groupParamsSchema.safeParse(req.params);
  const parsedBody = updateGroupSchema.safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success) {
    res.status(400).json({ error: 'Invalid group settings.' });
    return;
  }

  const [group] = await db
    .update(telegramGroups)
    .set({ retentionDays: parsedBody.data.retentionDays, updatedAt: new Date() })
    .where(eq(telegramGroups.id, parsedParams.data.groupId))
    .returning({ id: telegramGroups.id, retentionDays: telegramGroups.retentionDays });

  if (!group) {
    res.status(404).json({ error: 'Group not found.' });
    return;
  }

  await db.insert(auditLogs).values({
    groupId: group.id,
    actorId: req.user!.id,
    action: 'GROUP_SETTINGS_UPDATED',
    metadata: { retentionDays: group.retentionDays },
  });

  res.json({ group });
}

export async function updateMemberRole(req: Request, res: Response): Promise<void> {
  const parsedParams = groupMemberParamsSchema.safeParse(req.params);
  const parsedBody = updateMemberRoleSchema.safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success) {
    res.status(400).json({ error: 'Invalid member role update.' });
    return;
  }

  const [existingMembership] = await db
    .select({ role: groupMemberships.role })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.groupId, parsedParams.data.groupId),
        eq(groupMemberships.userId, parsedParams.data.userId),
      ),
    )
    .limit(1);

  if (!existingMembership) {
    res.status(404).json({ error: 'Group member not found.' });
    return;
  }
  if (existingMembership.role === 'OWNER') {
    res.status(409).json({ error: 'The group owner role cannot be changed here.' });
    return;
  }

  const [membership] = await db
    .update(groupMemberships)
    .set({ role: parsedBody.data.role })
    .where(
      and(
        eq(groupMemberships.groupId, parsedParams.data.groupId),
        eq(groupMemberships.userId, parsedParams.data.userId),
        inArray(groupMemberships.role, ['MANAGER', 'MEMBER']),
      ),
    )
    .returning({
      groupId: groupMemberships.groupId,
      userId: groupMemberships.userId,
      role: groupMemberships.role,
    });

  if (!membership) {
    res.status(409).json({ error: 'The member role changed before this update could be applied.' });
    return;
  }

  await db.insert(auditLogs).values({
    groupId: membership.groupId,
    actorId: req.user!.id,
    action: 'ROLE_CHANGED',
    metadata: {
      userId: membership.userId,
      previousRole: existingMembership.role,
      role: membership.role,
    },
  });

  res.json({ membership });
}
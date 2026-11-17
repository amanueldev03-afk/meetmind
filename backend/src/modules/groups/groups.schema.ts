import { z } from 'zod';

export const groupIdSchema = z.string().uuid();

export const groupParamsSchema = z.object({
  groupId: groupIdSchema,
});

export const groupMemberParamsSchema = groupParamsSchema.extend({
  userId: z.string().uuid(),
});

export const updateGroupSchema = z.object({
  retentionDays: z.number().int().positive(),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['MANAGER', 'MEMBER']),
});
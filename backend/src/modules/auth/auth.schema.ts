import { z } from 'zod';

const telegramIdSchema = z.union([
  z.number().int().positive().safe(),
  z.string().regex(/^\d+$/),
]);

export const telegramLoginSchema = z
  .object({
    id: telegramIdSchema,
    first_name: z.string().min(1),
    last_name: z.string().optional(),
    username: z.string().optional(),
    photo_url: z.string().url().optional(),
    auth_date: z.number().int().positive(),
    hash: z.string().regex(/^[a-f\d]{64}$/i),
  })
  .passthrough();

export const devLoginSchema = z.object({
  telegramId: telegramIdSchema,
});

export const jwtPayloadSchema = z.object({
  sub: z.string().uuid(),
});
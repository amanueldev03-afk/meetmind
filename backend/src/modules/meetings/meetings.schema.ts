import { z } from 'zod';

export const createMeetingSchema = z.object({
  groupId: z.string().uuid(),
  title: z.string().min(3).max(150),
  agenda: z.string().max(2000).optional(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  recordAudio: z.boolean().default(true),
  isRecurring: z.boolean().default(false),
  recurringWeeks: z.number().int().min(2).max(12).optional(),
});

export const meetingIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const updateMeetingSchema = z
  .object({
    title: z.string().min(3).max(150).optional(),
    agenda: z.string().max(2000).optional(),
    scheduledAt: z.string().datetime().optional(),
    status: z.literal('CANCELLED').optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one meeting field must be provided.',
  });
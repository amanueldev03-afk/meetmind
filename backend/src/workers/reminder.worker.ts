import { and, eq, gte, gt, inArray, lte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { meetings } from '../db/schema/meetings.schema.js';
import { telegramGroups } from '../db/schema/users.schema.js';
import { recoverExpiredMeetingAdmissions } from '../services/meeting-admissions.service.js';
import { sendMeetingReminderToGroup } from '../services/telegram.service.js';

const startReminderWindowMs = 3 * 60_000;
const closingReminderWindowMs = 2 * 60_000;
const intervalMs = 15_000;

let schedulerStarted = false;
let tickInProgress = false;
let schedulerInterval: ReturnType<typeof setInterval> | undefined;

async function sendStartReminders(now: Date): Promise<void> {
  const dueMeetings = await db
    .select({
      id: meetings.id,
      title: meetings.title,
      telegramChatId: telegramGroups.telegramGroupId,
    })
    .from(meetings)
    .innerJoin(telegramGroups, eq(meetings.groupId, telegramGroups.id))
    .where(
      and(
        eq(meetings.status, 'SCHEDULED'),
        eq(meetings.reminderSent1h, false),
        gte(meetings.scheduledAt, now),
        lte(meetings.scheduledAt, new Date(now.getTime() + startReminderWindowMs)),
      ),
    );

  for (const meeting of dueMeetings) {
    try {
      await sendMeetingReminderToGroup({
        telegramChatId: meeting.telegramChatId,
        meetingId: meeting.id,
        message: `⏰ Reminder: "${meeting.title}" starts in less than 3 minutes!`,
      });
      await db
        .update(meetings)
        .set({ reminderSent1h: true, updatedAt: new Date() })
        .where(and(eq(meetings.id, meeting.id), eq(meetings.reminderSent1h, false)));
    } catch (error) {
      console.error(`Failed to send start reminder for meeting ${meeting.id}:`, error);
    }
  }
}

async function sendClosingReminders(now: Date): Promise<void> {
  const dueMeetings = await db
    .select({
      id: meetings.id,
      title: meetings.title,
      telegramChatId: telegramGroups.telegramGroupId,
    })
    .from(meetings)
    .innerJoin(telegramGroups, eq(meetings.groupId, telegramGroups.id))
    .where(
      and(
        inArray(meetings.status, ['SCHEDULED', 'LIVE']),
        eq(meetings.reminderSent10m, false),
        gt(meetings.expiresAt, now),
        lte(meetings.expiresAt, new Date(now.getTime() + closingReminderWindowMs)),
      ),
    );

  for (const meeting of dueMeetings) {
    try {
      await sendMeetingReminderToGroup({
        telegramChatId: meeting.telegramChatId,
        meetingId: meeting.id,
        message: `⚠️ Closing Soon: "${meeting.title}" room link closes in 2 minutes!`,
      });
      await db
        .update(meetings)
        .set({ reminderSent10m: true, updatedAt: new Date() })
        .where(and(eq(meetings.id, meeting.id), eq(meetings.reminderSent10m, false)));
    } catch (error) {
      console.error(`Failed to send closing reminder for meeting ${meeting.id}:`, error);
    }
  }
}

async function runReminderTick(): Promise<void> {
  if (tickInProgress) {
    return;
  }
  tickInProgress = true;
  try {
    const now = new Date();
    const results = await Promise.allSettled([
      recoverExpiredMeetingAdmissions(),
      sendStartReminders(now),
      sendClosingReminders(now),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Meeting reminder or admission recovery task failed:', result.reason);
      }
    }
  } finally {
    tickInProgress = false;
  }
}

export function startReminderScheduler(): void {
  if (schedulerStarted) {
    return;
  }
  schedulerStarted = true;
  void runReminderTick();
  schedulerInterval = setInterval(() => {
    void runReminderTick();
  }, intervalMs);
}

export function stopReminderScheduler(): void {
  if (schedulerInterval !== undefined) {
    clearInterval(schedulerInterval);
    schedulerInterval = undefined;
  }
  schedulerStarted = false;
}
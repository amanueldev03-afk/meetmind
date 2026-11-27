import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { auditLogs } from '../../db/schema/audit.schema.js';
import {
  attendanceLogs,
  meetingAccessTokenIssuances,
  meetings,
} from '../../db/schema/meetings.schema.js';
import { groupMemberships, telegramGroups, users } from '../../db/schema/users.schema.js';
import { announceMeetingToGroup, verifyGroupMembership } from '../../services/telegram.service.js';
import {
  createMeetingAccessToken,
  deleteLiveKitRoom,
  meetingAccessTokenTtlMs,
  revokeMeetingAccessTokens,
} from '../../services/livekit.service.js';
import {
  recoverExpiredMeetingAdmissions,
  commitMeetingAdmission,
  releaseMeetingAdmission,
  renewMeetingAdmission,
  reserveMeetingAdmission,
} from '../../services/meeting-admissions.service.js';
import { groupIdSchema } from '../groups/groups.schema.js';
import { createMeetingSchema, meetingIdParamsSchema } from './meetings.schema.js';

const meetingResponseColumns = {
  id: meetings.id,
  groupId: meetings.groupId,
  createdById: meetings.createdById,
  creatorDisplayName: users.displayName,
  title: meetings.title,
  agenda: meetings.description,
  status: meetings.status,
  scheduledAt: meetings.scheduledAt,
  startedAt: meetings.startedAt,
  endedAt: meetings.endedAt,
  seriesId: meetings.seriesId,
  isRecurring: isNotNull(meetings.seriesId),
  expiresAt: meetings.expiresAt,
  livekitRoomName: meetings.livekitRoomName,
  recordAudio: meetings.recordAudio,
  createdAt: meetings.createdAt,
  updatedAt: meetings.updatedAt,
};

function omitAdmissionCount<
  T extends { admissionCount: number; hasIssuedAdmission: boolean; shutdownAt: Date | null },
>(meeting: T) {
  const {
    admissionCount: _admissionCount,
    hasIssuedAdmission: _hasIssuedAdmission,
    shutdownAt: _shutdownAt,
    ...responseMeeting
  } = meeting;
  return responseMeeting;
}

async function closeOpenAttendance(meetingId: string, endedAt: Date): Promise<void> {
  await db
    .update(attendanceLogs)
    .set({
      leftAt: endedAt,
      leftAtInferred: true,
      durationSeconds: sql<number>`GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${endedAt} - ${attendanceLogs.joinedAt})))::int)`,
    })
    .where(and(eq(attendanceLogs.meetingId, meetingId), isNull(attendanceLogs.leftAt)));
}

async function waitForMeetingAdmissionsToDrain(meetingId: string): Promise<boolean> {
  const deadline = Date.now() + 15_000;
  await recoverExpiredMeetingAdmissions();

  while (Date.now() < deadline) {
    const [meeting] = await db
      .select({ admissionCount: meetings.admissionCount })
      .from(meetings)
      .where(eq(meetings.id, meetingId))
      .limit(1);
    if (!meeting || meeting.admissionCount === 0) {
      return Boolean(meeting);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await recoverExpiredMeetingAdmissions();
  const [meeting] = await db
    .select({ admissionCount: meetings.admissionCount })
    .from(meetings)
    .where(eq(meetings.id, meetingId))
    .limit(1);
  return Boolean(meeting && meeting.admissionCount === 0);
}

export async function createMeeting(req: Request, res: Response): Promise<void> {
  const parsed = createMeetingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid meeting details.', details: parsed.error.issues });
    return;
  }

  const [group] = await db
    .select({ telegramChatId: telegramGroups.telegramGroupId })
    .from(telegramGroups)
    .where(eq(telegramGroups.id, parsed.data.groupId))
    .limit(1);
  if (!group) {
    res.status(404).json({ error: 'Group not found.' });
    return;
  }

  const scheduledAt = new Date(parsed.data.scheduledAt);
  const occurrenceCount = parsed.data.isRecurring ? (parsed.data.recurringWeeks ?? 2) : 1;
  const seriesId = parsed.data.isRecurring ? randomUUID() : null;
  const durationMs = parsed.data.durationMinutes * 60_000;
  const gracePeriodMs = 30 * 60_000;
  const rows = Array.from({ length: occurrenceCount }, (_, index) => {
    const occurrenceScheduledAt = new Date(scheduledAt.getTime() + index * 7 * 24 * 60 * 60_000);
    return {
      id: randomUUID(),
      groupId: parsed.data.groupId,
      createdById: req.user!.id,
      title: parsed.data.title,
      description: parsed.data.agenda ?? null,
      recordAudio: parsed.data.recordAudio,
      scheduledAt: occurrenceScheduledAt,
      expiresAt: new Date(occurrenceScheduledAt.getTime() + durationMs + gracePeriodMs),
      livekitRoomName: `meetmind-${randomUUID()}`,
      seriesId,
    };
  });

  const [createdMeetings] = await db.batch([
    db.insert(meetings).values(rows).returning(),
    db.insert(auditLogs).values({
      groupId: parsed.data.groupId,
      actorId: req.user!.id,
      action: 'MEETING_SCHEDULED',
      metadata: {
        meetingIds: rows.map((meeting) => meeting.id),
        seriesId,
        occurrenceCount: rows.length,
      },
    }),
  ]);
  const firstMeeting = createdMeetings[0];

  await announceMeetingToGroup({
    telegramChatId: group.telegramChatId,
    meetingId: firstMeeting.id,
    title: firstMeeting.title,
    agenda: firstMeeting.description,
    scheduledAt: firstMeeting.scheduledAt,
    expiresAt: rows[0].expiresAt,
  });

  res.status(201).json({
    meetings: createdMeetings.map((meeting) => ({
      ...omitAdmissionCount(meeting),
      agenda: meeting.description,
      isRecurring: meeting.seriesId !== null,
    })),
  });
}

export async function listMeetings(req: Request, res: Response): Promise<void> {
  const parsedGroupId = groupIdSchema.safeParse(req.query.groupId);
  if (!parsedGroupId.success) {
    res.status(400).json({ error: 'A valid groupId query parameter is required.' });
    return;
  }

  const meetingRows = await db
    .select(meetingResponseColumns)
    .from(meetings)
    .leftJoin(users, eq(meetings.createdById, users.id))
    .where(eq(meetings.groupId, parsedGroupId.data))
    .orderBy(desc(meetings.scheduledAt));

  res.json({ meetings: meetingRows });
}

export async function getMeetingById(req: Request, res: Response): Promise<void> {
  const meetingId = req.meeting!.id;
  const [meeting] = await db
    .select(meetingResponseColumns)
    .from(meetings)
    .leftJoin(users, eq(meetings.createdById, users.id))
    .where(eq(meetings.id, meetingId))
    .limit(1);

  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found.' });
    return;
  }
  res.json({ meeting });
}

export async function cancelMeeting(req: Request, res: Response): Promise<void> {
  const updatedAt = new Date();
  const [cancelled] = (
    await db.execute<{ id: string }>(sql`
      WITH cancelled_meeting AS (
        UPDATE ${meetings}
        SET status = 'CANCELLED', updated_at = ${updatedAt}
        WHERE id = ${req.meeting!.id} AND status = 'SCHEDULED'
        RETURNING id, group_id
      ),
      audit AS (
        INSERT INTO ${auditLogs} ("group_id", "actor_id", "action", "metadata")
        SELECT
          group_id,
          ${req.user!.id},
          'MEETING_CANCELLED',
          jsonb_build_object('meetingId', id)
        FROM cancelled_meeting
        RETURNING "id"
      )
      SELECT id FROM cancelled_meeting
    `)
  ).rows;

  if (!cancelled) {
    res.status(409).json({ error: 'Only scheduled meetings can be cancelled.' });
    return;
  }

  res.json({
    meeting: omitAdmissionCount({
      ...req.meeting!,
      status: 'CANCELLED',
      updatedAt,
    }),
  });
}

export async function joinMeeting(req: Request, res: Response): Promise<void> {
  const parsedParams = meetingIdParamsSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: 'Invalid meeting ID.' });
    return;
  }

  const [meeting] = await db
    .select()
    .from(meetings)
    .where(eq(meetings.id, parsedParams.data.id))
    .limit(1);
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found.' });
    return;
  }
  if (
    meeting.status === 'CANCELLED' ||
    meeting.status === 'ENDING' ||
    meeting.status === 'ENDED'
  ) {
    res.status(400).json({ error: 'This meeting is no longer available.' });
    return;
  }
  if (meeting.expiresAt && new Date() > meeting.expiresAt) {
    res.status(410).json({ error: 'This meeting link has expired.' });
    return;
  }

  const [group] = await db
    .select({
      telegramChatId: telegramGroups.telegramGroupId,
      isSuspended: telegramGroups.isSuspended,
    })
    .from(telegramGroups)
    .where(eq(telegramGroups.id, meeting.groupId))
    .limit(1);
  if (!group) {
    res.status(404).json({ error: 'Meeting group not found.' });
    return;
  }

  const [user] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      telegramUserId: users.telegramUserId,
    })
    .from(users)
    .where(eq(users.id, req.user!.id))
    .limit(1);
  if (!user) {
    res.status(401).json({ error: 'Authenticated user was not found.' });
    return;
  }

  const [membership] = await db
    .select({ role: groupMemberships.role })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.groupId, meeting.groupId),
        eq(groupMemberships.userId, user.id),
      ),
    )
    .limit(1);
  if (!membership || group.isSuspended) {
    res.status(403).json({ error: 'You do not have access to this meeting group.' });
    return;
  }

  let isTelegramMember = false;
  if (user.telegramUserId) {
    try {
      isTelegramMember = await verifyGroupMembership(group.telegramChatId, user.telegramUserId);
    } catch (error) {
      console.error(`Telegram membership verification failed for user ${user.id}:`, error);
      res.status(502).json({ error: 'Could not verify Telegram group membership.' });
      return;
    }
  }

  if (!isTelegramMember) {
    await db.execute(sql`
      WITH deleted_membership AS (
        DELETE FROM ${groupMemberships}
        WHERE
          ${groupMemberships.groupId} = ${meeting.groupId}
          AND ${groupMemberships.userId} = ${user.id}
        RETURNING ${groupMemberships.groupId} AS group_id
      ),
      audit AS (
        INSERT INTO ${auditLogs} ("group_id", "actor_id", "action", "metadata")
        SELECT
          group_id,
          ${user.id},
          'ACCESS_DENIED_NOT_MEMBER',
          jsonb_build_object(
            'meetingId', ${meeting.id},
            'telegramUserId', ${user.telegramUserId}
          )
        FROM deleted_membership
        RETURNING "id"
      )
      SELECT "id" FROM deleted_membership
    `);
    res.status(403).json({ error: 'You must be a current Telegram group member to join.' });
    return;
  }

  const livekitUrl = process.env.LIVEKIT_URL;
  if (
    !livekitUrl ||
    !process.env.LIVEKIT_API_KEY ||
    !process.env.LIVEKIT_API_SECRET ||
    !meeting.livekitRoomName
  ) {
    res.status(503).json({ error: 'LiveKit is not configured for this meeting.' });
    return;
  }

  await db
    .update(groupMemberships)
    .set({ lastVerifiedAt: new Date() })
    .where(
      and(
        eq(groupMemberships.groupId, meeting.groupId),
        eq(groupMemberships.userId, user.id),
      ),
    );

  const admission = await reserveMeetingAdmission(meeting.id);

  if (!admission) {
    const [currentMeeting] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.id, meeting.id))
      .limit(1);
    if (!currentMeeting) {
      res.status(404).json({ error: 'Meeting not found.' });
      return;
    }
    if (
      currentMeeting.status === 'CANCELLED' ||
      currentMeeting.status === 'ENDING' ||
      currentMeeting.status === 'ENDED'
    ) {
      res.status(400).json({ error: 'This meeting is no longer available.' });
      return;
    }
    if (currentMeeting.expiresAt && new Date() > currentMeeting.expiresAt) {
      res.status(410).json({ error: 'This meeting link has expired.' });
      return;
    }
    if (!currentMeeting.livekitRoomName) {
      res.status(503).json({ error: 'LiveKit is not configured for this meeting.' });
      return;
    }
    res.status(409).json({ error: 'Could not reserve a place in this meeting.' });
    return;
  }

  const activeMeeting = {
    ...meeting,
    status: admission.status,
    startedAt: admission.startedAt,
    admissionCount: admission.admissionCount,
    updatedAt: admission.updatedAt,
  };

  let resolveResponseFinished!: () => void;
  const responseFinished = new Promise<void>((resolve) => {
    resolveResponseFinished = resolve;
  });
  res.once('finish', resolveResponseFinished);
  res.once('close', resolveResponseFinished);

  let renewalTimer: ReturnType<typeof setInterval> | undefined;
  let renewalFailed = false;
  let renewalError: unknown;
  let admissionCommitted = false;
  try {
    if (res.destroyed) {
      return;
    }

    renewalTimer = setInterval(() => {
      void renewMeetingAdmission(admission.id)
        .then((renewed) => {
          if (!renewed) {
            renewalFailed = true;
            renewalError = new Error(
              `Meeting admission reservation ${admission.id} expired.`,
            );
            console.error(renewalError);
          }
        })
        .catch((error: unknown) => {
          renewalFailed = true;
          renewalError = error;
          console.error(
            `Failed to renew meeting admission ${admission.id}:`,
            error,
          );
        });
    }, 3_000);

    const roomName = activeMeeting.livekitRoomName;
    if (!roomName) {
      throw new Error(`Meeting ${activeMeeting.id} has no LiveKit room name.`);
    }

    const [currentMembership] = await db
      .select({ role: groupMemberships.role })
      .from(groupMemberships)
      .where(
        and(
          eq(groupMemberships.groupId, meeting.groupId),
          eq(groupMemberships.userId, user.id),
        ),
      )
      .limit(1);
    if (!currentMembership) {
      res.status(403).json({ error: 'You do not have access to this meeting group.' });
      return;
    }

    const token = await createMeetingAccessToken({
      roomName,
      participantIdentity: user.id,
      participantName: user.displayName,
      isHost: currentMembership.role === 'OWNER' || currentMembership.role === 'MANAGER',
    });

    if (renewalFailed) {
      throw renewalError;
    }

    const tokenExpiresAt = new Date(Date.now() + meetingAccessTokenTtlMs + 60_000);
    if (res.destroyed || res.writableEnded) {
      return;
    }

    if (!(await commitMeetingAdmission(admission.id, user.id, tokenExpiresAt))) {
      throw new Error(`Meeting admission reservation ${admission.id} expired.`);
    }

    admissionCommitted = true;
    res.json({ token, livekitUrl, meeting: omitAdmissionCount(activeMeeting) });
    await responseFinished;
  } finally {
    if (renewalTimer !== undefined) {
      clearInterval(renewalTimer);
    }
    res.off('finish', resolveResponseFinished);
    res.off('close', resolveResponseFinished);
    await releaseMeetingAdmission(admission.id, !admissionCommitted);
  }
}

async function revokeAndDeleteMeetingRoom(
  meetingId: string,
  roomName: string | null,
): Promise<void> {
  if (!roomName) {
    return;
  }

  const issuedTokens = await db
    .select({ participantIdentity: meetingAccessTokenIssuances.participantIdentity })
    .from(meetingAccessTokenIssuances)
    .where(eq(meetingAccessTokenIssuances.meetingId, meetingId));

  await revokeMeetingAccessTokens(
    roomName,
    issuedTokens.map(({ participantIdentity }) => participantIdentity),
  );
  await deleteLiveKitRoom(roomName);
}

export async function endMeeting(req: Request, res: Response): Promise<void> {
  const requestedMeeting = req.meeting!;
  const shutdownRequestedAt = new Date();
  const [endingMeeting] = await db
    .update(meetings)
    .set({
      status: 'ENDING',
      shutdownAt: sql`COALESCE(${meetings.shutdownAt}, ${shutdownRequestedAt})`,
      updatedAt: shutdownRequestedAt,
    })
    .where(
      and(
        eq(meetings.id, requestedMeeting.id),
        inArray(meetings.status, ['SCHEDULED', 'LIVE', 'ENDING', 'CANCELLED']),
      ),
    )
    .returning();

  if (!endingMeeting) {
    const [currentMeeting] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.id, requestedMeeting.id))
      .limit(1);
    if (!currentMeeting) {
      res.status(404).json({ error: 'Meeting not found.' });
      return;
    }
    if (currentMeeting.status === 'ENDED') {
      res.json({ meeting: omitAdmissionCount(currentMeeting) });
      return;
    }
    res.json({ meeting: omitAdmissionCount(currentMeeting) });
    return;
  }

  if (!(await waitForMeetingAdmissionsToDrain(endingMeeting.id))) {
    res
      .status(503)
      .json({ error: 'Meeting admissions are still completing. Retry ending the meeting.' });
    return;
  }

  await revokeAndDeleteMeetingRoom(
    endingMeeting.id,
    endingMeeting.livekitRoomName,
  );

  const now = new Date();
  const shutdownAt = endingMeeting.shutdownAt ?? shutdownRequestedAt;
  await closeOpenAttendance(endingMeeting.id, shutdownAt);

  const [latestToken] = await db
    .select({
      expiresAt: sql<string | null>`MAX(${meetingAccessTokenIssuances.tokenExpiresAt})`,
    })
    .from(meetingAccessTokenIssuances)
    .where(eq(meetingAccessTokenIssuances.meetingId, endingMeeting.id));
  if (latestToken?.expiresAt && new Date(latestToken.expiresAt) > now) {
    res
      .status(503)
      .json({ error: 'Meeting access tokens are still valid. Retry ending the meeting later.' });
    return;
  }

  const [ended] = (
    await db.execute<{ id: string }>(sql`
      WITH ended_meeting AS (
        UPDATE ${meetings}
        SET status = 'ENDED', ended_at = ${now}, updated_at = ${now}
        WHERE id = ${endingMeeting.id} AND status = 'ENDING'
        RETURNING id, group_id
      ),
      audit AS (
        INSERT INTO ${auditLogs} ("group_id", "actor_id", "action", "metadata")
        SELECT
          group_id,
          ${req.user!.id},
          'MEETING_ENDED',
          jsonb_build_object('meetingId', id)
        FROM ended_meeting
        RETURNING "id"
      )
      SELECT id FROM ended_meeting
    `)
  ).rows;

  if (!ended) {
    const [currentMeeting] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.id, endingMeeting.id))
      .limit(1);
    if (currentMeeting?.status === 'ENDED') {
      res.json({ meeting: omitAdmissionCount(currentMeeting) });
      return;
    }
    res.status(409).json({ error: 'Meeting state changed while it was ending.' });
    return;
  }

  res.json({
    meeting: omitAdmissionCount({
      ...endingMeeting,
      status: 'ENDED',
      endedAt: now,
      updatedAt: now,
    }),
  });
}

export async function getMeetingAttendance(req: Request, res: Response): Promise<void> {
  const attendance = await db
    .select({
      userId: attendanceLogs.userId,
      displayName: users.displayName,
      telegramUsername: users.telegramUsername,
      avatarUrl: users.avatarUrl,
      participantName: attendanceLogs.participantName,
      joinedAt: attendanceLogs.joinedAt,
      leftAt: attendanceLogs.leftAt,
      durationSeconds: sql<number>`COALESCE(
        ${attendanceLogs.durationSeconds},
        FLOOR(EXTRACT(EPOCH FROM (NOW() - ${attendanceLogs.joinedAt})))::int
      )`,
    })
    .from(attendanceLogs)
    .leftJoin(users, eq(attendanceLogs.userId, users.id))
    .where(eq(attendanceLogs.meetingId, req.meeting!.id))
    .orderBy(desc(attendanceLogs.joinedAt));

  res.json({ attendance });
}
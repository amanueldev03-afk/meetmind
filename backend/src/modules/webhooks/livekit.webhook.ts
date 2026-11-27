import type { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import {
  attendanceLogs,
  attendancePendingDepartures,
  meetings,
} from '../../db/schema/meetings.schema.js';
import { users } from '../../db/schema/users.schema.js';
import {
  deleteLiveKitRoom,
  revokeMeetingAccessTokens,
  verifyLiveKitWebhook,
} from '../../services/livekit.service.js';
import type { WebhookEvent } from 'livekit-server-sdk';

const participantIdentitySchema = z.string().uuid();

export async function handleLiveKitWebhook(req: Request, res: Response): Promise<void> {
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : typeof req.body === 'string'
      ? req.body
      : null;
  if (rawBody === null) {
    res.status(400).json({ error: 'Expected the raw LiveKit webhook body.' });
    return;
  }

  let event: WebhookEvent;
  try {
    event = await verifyLiveKitWebhook(rawBody, req.header('Authorization'));
  } catch (error) {
    console.error('LiveKit webhook verification failed:', error);
    res.status(401).json({ error: 'Invalid LiveKit webhook signature or payload.' });
    return;
  }

  if (event.event !== 'participant_joined' && event.event !== 'participant_left') {
    res.status(200).json({ received: true });
    return;
  }

  const eventTimeSeconds = Number(event.createdAt);
  const eventTime = new Date(eventTimeSeconds * 1000);
  if (
    event.createdAt <= 0n ||
    !Number.isSafeInteger(eventTimeSeconds) ||
    !Number.isFinite(eventTime.getTime())
  ) {
    res.status(400).json({ error: 'LiveKit participant event has an invalid timestamp.' });
    return;
  }

  const roomName = event.room?.name;
  const participant = event.participant;
  if (!roomName || !participant?.identity || !participant.sid) {
    res.status(400).json({ error: 'LiveKit participant event is missing room or identity.' });
    return;
  }

  const [meeting] = await db
    .select({ id: meetings.id })
    .from(meetings)
    .where(eq(meetings.livekitRoomName, roomName))
    .limit(1);
  if (!meeting) {
    res.status(200).json({ received: true, ignored: true });
    return;
  }

  const parsedIdentity = participantIdentitySchema.safeParse(participant.identity);
  const user = parsedIdentity.success
    ? (
        await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, parsedIdentity.data))
          .limit(1)
      )[0]
    : undefined;

  if (event.event === 'participant_joined') {
    const [outcome] = (
      await db.execute<{
        status: string;
        eligible: boolean;
        accepted: boolean;
      }>(sql`
        WITH locked_meeting AS MATERIALIZED (
          SELECT id, status, shutdown_at
          FROM ${meetings}
          WHERE id = ${meeting.id}
          FOR UPDATE
        ),
        eligible_meeting AS (
          SELECT id, status, shutdown_at
          FROM locked_meeting
          WHERE status <> 'CANCELLED'
            AND (
              status NOT IN ('ENDING', 'ENDED')
              OR (
                shutdown_at IS NOT NULL
                AND ${eventTime} < date_trunc('second', shutdown_at)
              )
            )
        ),
        consumed_departure AS (
          DELETE FROM ${attendancePendingDepartures}
          WHERE "meeting_id" = ${meeting.id}
            AND "participant_sid" = ${participant.sid}
            AND EXISTS (SELECT 1 FROM eligible_meeting)
            AND ${user !== undefined}
          RETURNING "left_at"
        ),
        recorded AS (
          INSERT INTO ${attendanceLogs} (
            "meeting_id",
            "user_id",
            "participant_sid",
            "participant_name",
            "joined_at",
            "left_at",
            "left_at_inferred",
            "duration_seconds"
          )
          SELECT
            id,
            ${user?.id ?? null},
            ${participant.sid},
            ${participant.name || null},
            ${eventTime},
            CASE
              WHEN departure."left_at" >= ${eventTime} THEN departure."left_at"
              WHEN status IN ('ENDING', 'ENDED') THEN shutdown_at
              ELSE NULL
            END,
            (
              departure."left_at" IS NULL
              OR departure."left_at" < ${eventTime}
            ) AND status IN ('ENDING', 'ENDED'),
            CASE
              WHEN departure."left_at" >= ${eventTime} THEN GREATEST(
                0,
                FLOOR(EXTRACT(EPOCH FROM (departure."left_at" - ${eventTime})))::int
              )
              WHEN status IN ('ENDING', 'ENDED') THEN GREATEST(
                0,
                FLOOR(EXTRACT(EPOCH FROM (shutdown_at - ${eventTime})))::int
              )
              ELSE NULL
            END
          FROM eligible_meeting
          LEFT JOIN consumed_departure AS departure ON true
          WHERE ${user !== undefined}
          ON CONFLICT ("meeting_id", "participant_sid")
            WHERE "participant_sid" IS NOT NULL
          DO UPDATE SET
            "user_id" = EXCLUDED."user_id",
            "participant_name" = EXCLUDED."participant_name",
            "joined_at" = EXCLUDED."joined_at",
            "left_at" = CASE
              WHEN ${attendanceLogs.leftAtInferred} AND NOT EXCLUDED."left_at_inferred"
                THEN EXCLUDED."left_at"
              ELSE COALESCE(${attendanceLogs.leftAt}, EXCLUDED."left_at")
            END,
            "left_at_inferred" = CASE
              WHEN ${attendanceLogs.leftAt} IS NULL OR ${attendanceLogs.leftAtInferred}
                THEN EXCLUDED."left_at_inferred"
              ELSE ${attendanceLogs.leftAtInferred}
            END,
            "duration_seconds" = CASE
              WHEN CASE
                WHEN ${attendanceLogs.leftAtInferred} AND NOT EXCLUDED."left_at_inferred"
                  THEN EXCLUDED."left_at"
                ELSE COALESCE(${attendanceLogs.leftAt}, EXCLUDED."left_at")
              END IS NULL THEN ${attendanceLogs.durationSeconds}
              ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
                CASE
                  WHEN ${attendanceLogs.leftAtInferred} AND NOT EXCLUDED."left_at_inferred"
                    THEN EXCLUDED."left_at"
                  ELSE COALESCE(${attendanceLogs.leftAt}, EXCLUDED."left_at")
                END - EXCLUDED."joined_at"
              )))::int)
            END
          RETURNING "id"
        )
        SELECT
          locked_meeting.status AS "status",
          EXISTS(SELECT 1 FROM eligible_meeting) AS "eligible",
          EXISTS(SELECT 1 FROM recorded) AS "accepted"
        FROM locked_meeting
      `)
    ).rows;

    if (!outcome) {
      res.status(200).json({ received: true, ignored: true });
      return;
    }

    if (!outcome.eligible) {
      await revokeMeetingAccessTokens(roomName, [participant.identity]);
      await deleteLiveKitRoom(roomName);
      res.status(200).json({ received: true, ignored: true });
      return;
    }

    if (!outcome.accepted) {
      res.status(200).json({ received: true, ignored: true });
      return;
    }
  } else {
    await db.execute(sql`
      WITH locked_meeting AS MATERIALIZED (
        SELECT id, status
        FROM ${meetings}
        WHERE id = ${meeting.id}
        FOR UPDATE
      ),
      closed_attendance AS (
        UPDATE ${attendanceLogs} AS attendance
        SET
          "left_at" = ${eventTime},
          "left_at_inferred" = false,
          "duration_seconds" = GREATEST(
            0,
            FLOOR(EXTRACT(EPOCH FROM (${eventTime} - attendance."joined_at")))::int
          )
        FROM locked_meeting
        WHERE attendance."meeting_id" = locked_meeting.id
          AND attendance."participant_sid" = ${participant.sid}
          AND (
            attendance."left_at" IS NULL
            OR attendance."left_at_inferred" = true
          )
        RETURNING attendance."id"
      ),
      pending_departure AS (
        INSERT INTO ${attendancePendingDepartures} (
          "meeting_id", "participant_sid", "left_at"
        )
        SELECT locked_meeting.id, ${participant.sid}, ${eventTime}
        FROM locked_meeting
        WHERE locked_meeting.status <> 'CANCELLED'
          AND NOT EXISTS (
            SELECT 1
            FROM ${attendanceLogs} AS attendance
            WHERE attendance."meeting_id" = locked_meeting.id
              AND attendance."participant_sid" = ${participant.sid}
          )
        ON CONFLICT ("meeting_id", "participant_sid") DO NOTHING
        RETURNING "meeting_id"
      )
      SELECT EXISTS(SELECT 1 FROM closed_attendance) AS "closed"
    `);
  }

  res.status(200).json({ received: true });
}
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { meetings } from '../db/schema/meetings.schema.js';

const admissionLeaseMs = 10_000;

export async function reserveMeetingAdmission(
  meetingId: string,
): Promise<
  | {
      id: string;
      status: string;
      startedAt: Date;
      updatedAt: Date;
      admissionCount: number;
    }
  | undefined
> {
  const reservationId = randomUUID();
  const result = await db.execute<{
    id: string;
    status: string;
    startedAt: string;
    updatedAt: string;
    admissionCount: number;
  }>(sql`
    WITH current_meeting AS MATERIALIZED (
      SELECT id
      FROM ${meetings}
      WHERE
        id = ${meetingId}
        AND status IN ('SCHEDULED', 'LIVE')
        AND (expires_at IS NULL OR expires_at > clock_timestamp())
        AND livekit_room_name IS NOT NULL
      FOR UPDATE
    ),
    admitted AS (
      UPDATE ${meetings}
      SET
        status = 'LIVE',
        started_at = COALESCE(started_at, clock_timestamp()),
        admission_count = admission_count + 1,
        updated_at = CASE
          WHEN started_at IS NULL THEN clock_timestamp()
          ELSE updated_at
        END
      WHERE
        id IN (SELECT id FROM current_meeting)
      RETURNING id, status, started_at, updated_at, admission_count
    ),
    reserved AS (
      INSERT INTO "meeting_admission_reservations" ("id", "meeting_id", "expires_at")
      SELECT
        ${reservationId},
        id,
        clock_timestamp() + (${admissionLeaseMs} * INTERVAL '1 millisecond')
      FROM admitted
      RETURNING id, meeting_id
    )
    SELECT
      reserved.id,
      admitted.status,
      admitted.started_at AS "startedAt",
      admitted.updated_at AS "updatedAt",
      admitted.admission_count AS "admissionCount"
    FROM reserved
    INNER JOIN admitted ON admitted.id = reserved.meeting_id
  `);

  const reservation = result.rows[0];
  return reservation
    ? {
        ...reservation,
        startedAt: new Date(reservation.startedAt),
        updatedAt: new Date(reservation.updatedAt),
      }
    : undefined;
}

export async function renewMeetingAdmission(reservationId: string): Promise<boolean> {
  const result = await db.execute<{ id: string }>(sql`
    UPDATE "meeting_admission_reservations"
    SET "expires_at" = clock_timestamp() + (${admissionLeaseMs} * INTERVAL '1 millisecond')
    WHERE "id" = ${reservationId} AND "expires_at" > clock_timestamp()
    RETURNING "id"
  `);

  return result.rows.length > 0;
}

export async function commitMeetingAdmission(
  reservationId: string,
  participantIdentity: string,
  tokenExpiresAt: Date,
): Promise<boolean> {
  const result = await db.execute<{ id: string }>(sql`
    WITH renewed AS (
      UPDATE "meeting_admission_reservations"
      SET "expires_at" = clock_timestamp() + (${admissionLeaseMs} * INTERVAL '1 millisecond')
      WHERE "id" = ${reservationId} AND "expires_at" > clock_timestamp()
      RETURNING "meeting_id"
    ),
    marked AS (
      UPDATE ${meetings}
      SET has_issued_admission = true
      FROM renewed
      WHERE ${meetings.id} = renewed.meeting_id AND ${meetings.status} = 'LIVE'
      RETURNING ${meetings.id} AS id
    ),
    issued AS (
      INSERT INTO "meeting_access_token_issuances" (
        "meeting_id",
        "participant_identity",
        "token_expires_at"
      )
      SELECT id, ${participantIdentity}, ${tokenExpiresAt}
      FROM marked
      ON CONFLICT ("meeting_id", "participant_identity")
      DO UPDATE SET "token_expires_at" = GREATEST(
        "meeting_access_token_issuances"."token_expires_at",
        EXCLUDED."token_expires_at"
      )
      RETURNING "meeting_id"
    )
    SELECT id FROM marked
  `);

  return result.rows.length > 0;
}

export async function releaseMeetingAdmission(
  reservationId: string,
  rollbackIfUnissued: boolean,
): Promise<void> {
  await db.execute(sql`
    WITH released AS (
      DELETE FROM "meeting_admission_reservations"
      WHERE "id" = ${reservationId}
      RETURNING "meeting_id"
    )
    UPDATE ${meetings}
    SET
      admission_count = GREATEST(${meetings.admissionCount} - 1, 0),
      status = CASE
        WHEN ${rollbackIfUnissued}
          AND ${meetings.status} = 'LIVE'
          AND ${meetings.admissionCount} <= 1
          AND ${meetings.hasIssuedAdmission} = false
        THEN 'SCHEDULED'
        ELSE ${meetings.status}
      END,
      started_at = CASE
        WHEN ${rollbackIfUnissued}
          AND ${meetings.status} = 'LIVE'
          AND ${meetings.admissionCount} <= 1
          AND ${meetings.hasIssuedAdmission} = false
        THEN NULL
        ELSE ${meetings.startedAt}
      END,
      updated_at = CASE
        WHEN ${rollbackIfUnissued}
          AND ${meetings.status} = 'LIVE'
          AND ${meetings.admissionCount} <= 1
          AND ${meetings.hasIssuedAdmission} = false
        THEN clock_timestamp()
        ELSE ${meetings.updatedAt}
      END
    FROM released
    WHERE ${meetings.id} = released.meeting_id
  `);
}

export async function recoverExpiredMeetingAdmissions(): Promise<void> {
  await db.execute(sql`
    WITH expired AS (
      DELETE FROM "meeting_admission_reservations"
      WHERE "expires_at" <= clock_timestamp()
      RETURNING "meeting_id"
    ),
    expired_counts AS (
      SELECT "meeting_id", COUNT(*)::int AS count
      FROM expired
      GROUP BY "meeting_id"
    )
    UPDATE ${meetings}
    SET
      admission_count = GREATEST(${meetings.admissionCount} - expired_counts.count, 0),
      status = CASE
        WHEN ${meetings.status} = 'LIVE'
          AND ${meetings.admissionCount} <= expired_counts.count
          AND ${meetings.hasIssuedAdmission} = false
        THEN 'SCHEDULED'
        ELSE ${meetings.status}
      END,
      started_at = CASE
        WHEN ${meetings.status} = 'LIVE'
          AND ${meetings.admissionCount} <= expired_counts.count
          AND ${meetings.hasIssuedAdmission} = false
        THEN NULL
        ELSE ${meetings.startedAt}
      END,
      updated_at = CASE
        WHEN ${meetings.status} = 'LIVE'
          AND ${meetings.admissionCount} <= expired_counts.count
          AND ${meetings.hasIssuedAdmission} = false
        THEN clock_timestamp()
        ELSE ${meetings.updatedAt}
      END
    FROM expired_counts
    WHERE ${meetings.id} = expired_counts.meeting_id
  `);
}

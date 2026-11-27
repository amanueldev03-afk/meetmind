LOCK TABLE "attendance_logs" IN ACCESS EXCLUSIVE MODE;

DROP INDEX IF EXISTS "attendance_logs_open_participant_uidx";

ALTER TYPE "meeting_status" ADD VALUE IF NOT EXISTS 'ENDING';

ALTER TABLE "meetings"
ADD COLUMN IF NOT EXISTS "admission_count" integer DEFAULT 0 NOT NULL;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY meeting_id, participant_sid
      ORDER BY joined_at, id
    ) AS row_number,
    min(joined_at) OVER (PARTITION BY meeting_id, participant_sid) AS first_joined_at,
    CASE
      WHEN bool_or(left_at IS NULL) OVER (PARTITION BY meeting_id, participant_sid) THEN NULL
      ELSE max(left_at) OVER (PARTITION BY meeting_id, participant_sid)
    END AS last_left_at
  FROM "attendance_logs"
  WHERE participant_sid IS NOT NULL
),
keepers AS (
  SELECT id, first_joined_at, last_left_at
  FROM ranked
  WHERE row_number = 1
)
UPDATE "attendance_logs" AS attendance
SET
  joined_at = keepers.first_joined_at,
  left_at = keepers.last_left_at,
  duration_seconds = CASE
    WHEN keepers.last_left_at IS NULL THEN NULL
    ELSE GREATEST(
      0,
      FLOOR(EXTRACT(EPOCH FROM (keepers.last_left_at - keepers.first_joined_at)))::int
    )
  END
FROM keepers
WHERE attendance.id = keepers.id;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY meeting_id, participant_sid
      ORDER BY joined_at, id
    ) AS row_number
  FROM "attendance_logs"
  WHERE participant_sid IS NOT NULL
)
DELETE FROM "attendance_logs" AS attendance
USING ranked
WHERE attendance.id = ranked.id AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_logs_participant_session_uidx"
ON "attendance_logs" ("meeting_id", "participant_sid")
WHERE "participant_sid" IS NOT NULL;

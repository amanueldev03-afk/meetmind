ALTER TABLE "attendance_logs"
ADD COLUMN IF NOT EXISTS "participant_sid" text;

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_logs_open_participant_uidx"
ON "attendance_logs" ("meeting_id", "participant_sid")
WHERE "participant_sid" IS NOT NULL AND "left_at" IS NULL;

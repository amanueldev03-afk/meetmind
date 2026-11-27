ALTER TABLE "meetings"
ADD COLUMN "has_issued_admission" boolean DEFAULT false NOT NULL,
ADD COLUMN "shutdown_at" timestamp with time zone;

UPDATE "meetings"
SET "has_issued_admission" = true
WHERE "status" IN ('LIVE', 'ENDING', 'ENDED');

ALTER TABLE "attendance_logs"
ADD COLUMN "left_at_inferred" boolean DEFAULT false NOT NULL;

ALTER TABLE "meeting_access_token_issuances"
ADD COLUMN "token_expires_at" timestamp with time zone;

UPDATE "meeting_access_token_issuances"
SET "token_expires_at" = clock_timestamp() + INTERVAL '11 minutes'
WHERE "token_expires_at" IS NULL;

ALTER TABLE "meeting_access_token_issuances"
ALTER COLUMN "token_expires_at" SET NOT NULL;

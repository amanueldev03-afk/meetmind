ALTER TABLE "attendance_logs"
ADD COLUMN IF NOT EXISTS "duration_seconds" integer;

ALTER TABLE "meetings"
ADD COLUMN IF NOT EXISTS "reminder_sent_1h" boolean DEFAULT false NOT NULL;

ALTER TABLE "meetings"
ADD COLUMN IF NOT EXISTS "reminder_sent_10m" boolean DEFAULT false NOT NULL;

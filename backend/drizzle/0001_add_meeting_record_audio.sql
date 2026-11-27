ALTER TABLE "meetings"
ADD COLUMN IF NOT EXISTS "record_audio" boolean DEFAULT true NOT NULL;

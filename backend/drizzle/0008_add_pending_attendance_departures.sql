CREATE TABLE "attendance_pending_departures" (
  "meeting_id" uuid NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
  "participant_sid" text NOT NULL,
  "left_at" timestamp with time zone NOT NULL,
  CONSTRAINT "attendance_pending_departures_pk"
    PRIMARY KEY ("meeting_id", "participant_sid")
);

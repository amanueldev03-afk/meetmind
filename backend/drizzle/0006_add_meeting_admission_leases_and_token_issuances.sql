CREATE TABLE "meeting_admission_reservations" (
  "id" uuid PRIMARY KEY NOT NULL,
  "meeting_id" uuid NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
  "expires_at" timestamp with time zone NOT NULL
);

CREATE INDEX "meeting_admission_reservations_expiry_idx"
ON "meeting_admission_reservations" ("expires_at");

CREATE TABLE "meeting_access_token_issuances" (
  "meeting_id" uuid NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
  "participant_identity" text NOT NULL,
  CONSTRAINT "meeting_access_token_issuances_pk"
    PRIMARY KEY ("meeting_id", "participant_identity")
);

INSERT INTO "meeting_access_token_issuances" ("meeting_id", "participant_identity")
SELECT meetings.id, group_memberships.user_id::text
FROM meetings
INNER JOIN group_memberships ON group_memberships.group_id = meetings.group_id
ON CONFLICT DO NOTHING;

INSERT INTO "meeting_access_token_issuances" ("meeting_id", "participant_identity")
SELECT meeting_id, user_id::text
FROM attendance_logs
WHERE user_id IS NOT NULL
ON CONFLICT DO NOTHING;

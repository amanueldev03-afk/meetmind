ALTER TABLE "group_memberships"
ADD COLUMN IF NOT EXISTS "last_verified_at" timestamp with time zone DEFAULT now() NOT NULL;

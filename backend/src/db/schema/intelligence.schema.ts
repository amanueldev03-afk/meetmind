import {
  AnyPgColumn,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import { meetings } from './meetings.schema.js';
import { users } from './users.schema.js';

export const meetingArtifactStatusEnum = pgEnum('meeting_artifact_status', [
  'PENDING',
  'TRANSCRIBING',
  'SUMMARIZING',
  'COMPLETED',
  'FAILED',
]);

export const actionItemStatusEnum = pgEnum('action_item_status', [
  'OPEN',
  'IN_PROGRESS',
  'DONE',
  'UNRESOLVED',
]);

export const meetingArtifacts = pgTable(
  'meeting_artifacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    status: meetingArtifactStatusEnum('status').notNull().default('PENDING'),
    audioCloudinaryUrl: text('audio_cloudinary_url'),
    audioCloudinaryPublicId: text('audio_cloudinary_public_id'),
    transcriptJson: jsonb('transcript_json'),
    summaryMd: text('summary_md'),
    decisionsJson: jsonb('decisions_json'),
    embedding: vector('embedding', { dimensions: 1536 }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('meeting_artifacts_meeting_id_uidx').on(table.meetingId),
    index('meeting_artifacts_status_created_idx').on(table.status, table.createdAt),
  ],
);

export const actionItems = pgTable(
  'action_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    artifactId: uuid('artifact_id').references(() => meetingArtifacts.id, {
      onDelete: 'set null',
    }),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    carriedOverFromId: uuid('carried_over_from_id').references(
      (): AnyPgColumn => actionItems.id,
      { onDelete: 'set null' },
    ),
    title: text('title').notNull(),
    description: text('description'),
    status: actionItemStatusEnum('status').notNull().default('OPEN'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('action_items_meeting_status_idx').on(table.meetingId, table.status),
    index('action_items_assignee_status_idx').on(table.assigneeId, table.status),
    index('action_items_carried_over_from_idx').on(table.carriedOverFromId),
  ],
);

export type MeetingArtifact = typeof meetingArtifacts.$inferSelect;
export type NewMeetingArtifact = typeof meetingArtifacts.$inferInsert;
export type ActionItem = typeof actionItems.$inferSelect;
export type NewActionItem = typeof actionItems.$inferInsert;
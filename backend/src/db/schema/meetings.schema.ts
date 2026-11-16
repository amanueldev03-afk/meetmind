import {
  bigint,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { telegramGroups, users } from './users.schema.js';

export const meetingStatusEnum = pgEnum('meeting_status', [
  'SCHEDULED',
  'LIVE',
  'ENDED',
  'CANCELLED',
]);

export const meetings = pgTable(
  'meetings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => telegramGroups.id, { onDelete: 'cascade' }),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    status: meetingStatusEnum('status').notNull().default('SCHEDULED'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    seriesId: uuid('series_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    livekitRoomName: text('livekit_room_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('meetings_group_status_scheduled_idx').on(
      table.groupId,
      table.status,
      table.scheduledAt,
    ),
    index('meetings_series_id_idx').on(table.seriesId),
    index('meetings_expires_at_idx').on(table.expiresAt),
    uniqueIndex('meetings_livekit_room_name_uidx').on(table.livekitRoomName),
  ],
);

export const attendanceLogs = pgTable(
  'attendance_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    participantName: text('participant_name'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (table) => [
    index('attendance_logs_meeting_joined_idx').on(table.meetingId, table.joinedAt),
    index('attendance_logs_user_idx').on(table.userId),
  ],
);

export const sharedFiles = pgTable(
  'shared_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    uploadedById: uuid('uploaded_by_id').references(() => users.id, { onDelete: 'set null' }),
    fileName: text('file_name').notNull(),
    fileUrl: text('file_url').notNull(),
    cloudinaryPublicId: text('cloudinary_public_id'),
    contentType: text('content_type'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('shared_files_meeting_created_idx').on(table.meetingId, table.createdAt),
    index('shared_files_uploaded_by_idx').on(table.uploadedById),
  ],
);

export type Meeting = typeof meetings.$inferSelect;
export type NewMeeting = typeof meetings.$inferInsert;
export type AttendanceLog = typeof attendanceLogs.$inferSelect;
export type NewAttendanceLog = typeof attendanceLogs.$inferInsert;
export type SharedFile = typeof sharedFiles.$inferSelect;
export type NewSharedFile = typeof sharedFiles.$inferInsert;
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { telegramGroups, users } from './users.schema.js';

export const meetingStatusEnum = pgEnum('meeting_status', [
  'SCHEDULED',
  'LIVE',
  'ENDING',
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
    recordAudio: boolean('record_audio').notNull().default(true),
    reminderSent1h: boolean('reminder_sent_1h').notNull().default(false),
    reminderSent10m: boolean('reminder_sent_10m').notNull().default(false),
    status: meetingStatusEnum('status').notNull().default('SCHEDULED'),
    admissionCount: integer('admission_count').notNull().default(0),
    hasIssuedAdmission: boolean('has_issued_admission').notNull().default(false),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    shutdownAt: timestamp('shutdown_at', { withTimezone: true }),
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
    participantSid: text('participant_sid'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
    leftAtInferred: boolean('left_at_inferred').notNull().default(false),
    durationSeconds: integer('duration_seconds'),
  },
  (table) => [
    index('attendance_logs_meeting_joined_idx').on(table.meetingId, table.joinedAt),
    index('attendance_logs_user_idx').on(table.userId),
    uniqueIndex('attendance_logs_participant_session_uidx')
      .on(table.meetingId, table.participantSid)
      .where(sql`${table.participantSid} IS NOT NULL`),
  ],
);

export const attendancePendingDepartures = pgTable(
  'attendance_pending_departures',
  {
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    participantSid: text('participant_sid').notNull(),
    leftAt: timestamp('left_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      name: 'attendance_pending_departures_pk',
      columns: [table.meetingId, table.participantSid],
    }),
  ],
);

export const meetingAdmissionReservations = pgTable(
  'meeting_admission_reservations',
  {
    id: uuid('id').primaryKey(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('meeting_admission_reservations_expiry_idx').on(table.expiresAt)],
);

export const meetingAccessTokenIssuances = pgTable(
  'meeting_access_token_issuances',
  {
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    participantIdentity: text('participant_identity').notNull(),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      name: 'meeting_access_token_issuances_pk',
      columns: [table.meetingId, table.participantIdentity],
    }),
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
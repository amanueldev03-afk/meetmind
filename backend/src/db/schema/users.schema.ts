import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const groupRoleEnum = pgEnum('group_role', ['OWNER', 'MANAGER', 'MEMBER']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    displayName: text('display_name').notNull(),
    email: text('email'),
    telegramUserId: text('telegram_user_id'),
    telegramUsername: text('telegram_username'),
    avatarUrl: text('avatar_url'),
    isSystemAdmin: boolean('is_system_admin').notNull().default(false),
    isBanned: boolean('is_banned').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_email_uidx').on(table.email),
    uniqueIndex('users_telegram_user_id_uidx').on(table.telegramUserId),
  ],
);

export const telegramGroups = pgTable(
  'telegram_groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    telegramGroupId: text('telegram_group_id').notNull(),
    title: text('title').notNull(),
    retentionDays: integer('retention_days').notNull(),
    monthlyAiQuotaMinutes: integer('monthly_ai_quota_minutes').notNull().default(0),
    usedAiMinutes: integer('used_ai_minutes').notNull().default(0),
    isSuspended: boolean('is_suspended').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('telegram_groups_telegram_group_id_uidx').on(table.telegramGroupId),
    index('telegram_groups_suspended_idx').on(table.isSuspended),
  ],
);

export const groupMemberships = pgTable(
  'group_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => telegramGroups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: groupRoleEnum('role').notNull().default('MEMBER'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('group_memberships_group_user_uidx').on(table.groupId, table.userId),
    index('group_memberships_user_idx').on(table.userId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type TelegramGroup = typeof telegramGroups.$inferSelect;
export type NewTelegramGroup = typeof telegramGroups.$inferInsert;
export type GroupMembership = typeof groupMemberships.$inferSelect;
export type NewGroupMembership = typeof groupMemberships.$inferInsert;
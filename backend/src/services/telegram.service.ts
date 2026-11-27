import 'dotenv/config';
import { Bot, InlineKeyboard } from 'grammy';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { auditLogs } from '../db/schema/audit.schema.js';
import { groupMemberships, telegramGroups, users } from '../db/schema/users.schema.js';

type TelegramMemberUser = {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
};

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN must be set before initializing the Telegram bot.');
}

export const bot = new Bot(token);

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getMeetingJoinUrl(meetingId: string): string {
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${frontendUrl}/meetings/${encodeURIComponent(meetingId)}/join`;
}

function getMeetingJoinKeyboard(meetingId: string, joinUrl: string): InlineKeyboard {
  if (joinUrl.startsWith('https://')) {
    return new InlineKeyboard().url('🎥 Join Meeting Room', joinUrl);
  }
  return new InlineKeyboard().text('🔗 Get Join Link', `join_link:${meetingId}`);
}

function getJoinLinkText(joinUrl: string): string {
  return `<a href="${escapeHtml(joinUrl)}">🎥 Join Meeting Room</a>`;
}

export async function announceMeetingToGroup(params: {
  telegramChatId: string;
  meetingId: string;
  title: string;
  agenda?: string | null;
  scheduledAt: Date;
  expiresAt: Date;
}): Promise<void> {
  const joinUrl = getMeetingJoinUrl(params.meetingId);
  const agendaText = params.agenda?.trim();
  const agendaPreview = agendaText
    ? `${agendaText.slice(0, 500)}${agendaText.length > 500 ? '...' : ''}`
    : 'No agenda provided.';
  const message = [
    `<b>${escapeHtml(params.title)}</b>`,
    `Starts: ${escapeHtml(params.scheduledAt.toUTCString())}`,
    `Agenda: ${escapeHtml(agendaPreview)}`,
    `Available until: ${escapeHtml(params.expiresAt.toUTCString())}`,
    ...(joinUrl.startsWith('https://') ? [] : [getJoinLinkText(joinUrl)]),
  ].join('\n');

  try {
    await bot.api.sendMessage(params.telegramChatId, message, {
      parse_mode: 'HTML',
      reply_markup: getMeetingJoinKeyboard(params.meetingId, joinUrl),
    });
  } catch (error) {
    console.error(`Failed to announce meeting ${params.meetingId} to Telegram:`, error);
  }
}

export async function sendMeetingReminderToGroup(params: {
  telegramChatId: string;
  meetingId: string;
  message: string;
}): Promise<void> {
  const joinUrl = getMeetingJoinUrl(params.meetingId);
  const message = [
    escapeHtml(params.message),
    ...(joinUrl.startsWith('https://') ? [] : [getJoinLinkText(joinUrl)]),
  ].join('\n');

  await bot.api.sendMessage(params.telegramChatId, message, {
    parse_mode: 'HTML',
    reply_markup: getMeetingJoinKeyboard(params.meetingId, joinUrl),
  });
}

bot.on('callback_query:data', async (ctx) => {
  const match = /^join_link:([0-9a-f-]{36})$/i.exec(ctx.callbackQuery.data);
  if (!match) {
    return;
  }

  const joinUrl = getMeetingJoinUrl(match[1]);
  await ctx.answerCallbackQuery({ text: 'Join link sent to the group.' });
  await ctx.reply(getJoinLinkText(joinUrl), { parse_mode: 'HTML' });
});

async function findLinkedGroup(telegramGroupId: string): Promise<{ id: string } | undefined> {
  const [group] = await db
    .select({ id: telegramGroups.id })
    .from(telegramGroups)
    .where(eq(telegramGroups.telegramGroupId, telegramGroupId))
    .limit(1);

  return group;
}

async function upsertGroupMember(
  groupId: string,
  telegramUser: TelegramMemberUser,
): Promise<void> {
  if (telegramUser.is_bot) {
    return;
  }

  const displayName = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ');
  const telegramUserId = String(telegramUser.id);
  const [user] = await db
    .insert(users)
    .values({
      displayName,
      telegramUserId,
      telegramUsername: telegramUser.username ?? null,
    })
    .onConflictDoUpdate({
      target: users.telegramUserId,
      set: {
        displayName,
        telegramUsername: telegramUser.username ?? null,
        updatedAt: new Date(),
      },
    })
    .returning({ id: users.id });

  await db
    .insert(groupMemberships)
    .values({ groupId, userId: user.id, role: 'MEMBER' })
    .onConflictDoUpdate({
      target: [groupMemberships.groupId, groupMemberships.userId],
      set: { lastVerifiedAt: new Date() },
    });
}

bot.on('chat_member', async (ctx) => {
  const group = await findLinkedGroup(String(ctx.chat.id));
  if (!group) {
    return;
  }

  const member = ctx.chatMember.new_chat_member;
  const telegramUserId = String(member.user.id);
  if (member.user.is_bot) {
    return;
  }

  if (
    member.status === 'creator' ||
    member.status === 'administrator' ||
    member.status === 'member' ||
    (member.status === 'restricted' && member.is_member)
  ) {
    await upsertGroupMember(group.id, member.user);
    await db.insert(auditLogs).values({
      groupId: group.id,
      action: 'MEMBER_JOINED',
      metadata: { telegramUserId },
    });
  } else if (member.status === 'left' || member.status === 'kicked') {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.telegramUserId, telegramUserId))
      .limit(1);

    if (user) {
      await db
        .delete(groupMemberships)
        .where(
          and(
            eq(groupMemberships.groupId, group.id),
            eq(groupMemberships.userId, user.id),
          ),
        );
    }

    await db.insert(auditLogs).values({
      groupId: group.id,
      actorId: user?.id,
      action: 'MEMBER_REMOVED',
      metadata: { telegramUserId },
    });
  }
});

bot.on('message:new_chat_members', async (ctx) => {
  const group = await findLinkedGroup(String(ctx.chat.id));
  if (!group) {
    return;
  }

  for (const telegramUser of ctx.message.new_chat_members) {
    await upsertGroupMember(group.id, telegramUser);
  }
});

export async function syncUserGroupMemberships(
  userId: string,
  telegramUserId: string,
): Promise<void> {
  const groups = await db
    .select({ id: telegramGroups.id, telegramGroupId: telegramGroups.telegramGroupId })
    .from(telegramGroups)
    .where(eq(telegramGroups.isSuspended, false));

  for (const group of groups) {
    let member;
    try {
      member = await bot.api.getChatMember(Number(group.telegramGroupId), Number(telegramUserId));
    } catch {
      continue;
    }

    if (
      member.status === 'creator' ||
      member.status === 'administrator' ||
      member.status === 'member' ||
      (member.status === 'restricted' && member.is_member)
    ) {
      await db
        .insert(groupMemberships)
        .values({ groupId: group.id, userId, role: 'MEMBER' })
        .onConflictDoUpdate({
          target: [groupMemberships.groupId, groupMemberships.userId],
          set: { lastVerifiedAt: new Date() },
        });
    } else if (member.status === 'left' || member.status === 'kicked') {
      await db
        .delete(groupMemberships)
        .where(
          and(
            eq(groupMemberships.groupId, group.id),
            eq(groupMemberships.userId, userId),
          ),
        );
    }
  }
}

bot.command('start', async (ctx) => {
  await ctx.reply(
    'Welcome to MeetMind! Add me to your Telegram group, then send /link there to connect the group.',
  );
});

bot.command('link', async (ctx) => {
  if (!ctx.chat || (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup')) {
    await ctx.reply('Please run /link in the group you want to connect to MeetMind.');
    return;
  }

  const sender = ctx.from;
  if (!sender) {
    await ctx.reply('I could not identify your Telegram account. Please try again.');
    return;
  }

  const administrators = await ctx.getChatAdministrators();
  const isAdministrator = administrators.some(
    (member) =>
      member.user.id === sender.id &&
      (member.status === 'administrator' || member.status === 'creator'),
  );

  if (!isAdministrator) {
    await ctx.reply('Only a group administrator can connect this group to MeetMind.');
    return;
  }

  const [user] = await db
    .insert(users)
    .values({
      displayName: [sender.first_name, sender.last_name].filter(Boolean).join(' '),
      telegramUserId: String(sender.id),
      telegramUsername: sender.username ?? null,
    })
    .onConflictDoUpdate({
      target: users.telegramUserId,
      set: {
        displayName: [sender.first_name, sender.last_name].filter(Boolean).join(' '),
        telegramUsername: sender.username ?? null,
        updatedAt: new Date(),
      },
    })
    .returning({ id: users.id });

  const [group] = await db
    .insert(telegramGroups)
    .values({
      telegramGroupId: String(ctx.chat.id),
      title: ctx.chat.title,
      retentionDays: 30,
    })
    .onConflictDoUpdate({
      target: telegramGroups.telegramGroupId,
      set: {
        title: ctx.chat.title,
        updatedAt: new Date(),
      },
    })
    .returning({ id: telegramGroups.id });

  await db
    .insert(groupMemberships)
    .values({ groupId: group.id, userId: user.id, role: 'OWNER' })
    .onConflictDoUpdate({
      target: [groupMemberships.groupId, groupMemberships.userId],
      set: { role: 'OWNER' },
    });

  await db.insert(auditLogs).values({
    groupId: group.id,
    actorId: user.id,
    action: 'GROUP_LINKED',
  });

  await ctx.reply('This group is now connected to MeetMind.');
});

export async function verifyGroupMembership(
  telegramChatId: string,
  telegramUserId: string,
): Promise<boolean> {
  const chatId = Number(telegramChatId);
  const userId = Number(telegramUserId);

  if (!Number.isSafeInteger(chatId) || !Number.isSafeInteger(userId)) {
    throw new Error('Telegram chat and user IDs must be safe integers.');
  }

  const member = await bot.api.getChatMember(chatId, userId);

  return (
    member.status === 'creator' ||
    member.status === 'administrator' ||
    member.status === 'member' ||
    (member.status === 'restricted' && member.is_member)
  );
}
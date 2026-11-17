import 'dotenv/config';
import { Bot } from 'grammy';
import { db } from '../db/index.js';
import { auditLogs } from '../db/schema/audit.schema.js';
import { groupMemberships, telegramGroups, users } from '../db/schema/users.schema.js';

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN must be set before initializing the Telegram bot.');
}

export const bot = new Bot(token);

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
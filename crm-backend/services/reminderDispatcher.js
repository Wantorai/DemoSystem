const { Op, QueryTypes } = require('sequelize');
const db = require('../models');
const getIO = require('../socket').getIO;

const Reminder = db.sequelize.models.Reminder;
const Room = db.sequelize.models.Room;
const RoomUsers = db.sequelize.models.RoomUsers;
const RoomMessage = db.sequelize.models.RoomMessage;
const BossMessage = db.sequelize.models.BossMessage;
const User = db.sequelize.models.User;
const BossChatUsers = db.sequelize.models.BossChatUsers;
const sequelize = db.sequelize;
const { sendPushNotification } = require('./sendPushNotification');

function parseIds(jsonValue) {
  try {
    const raw = JSON.parse(String(jsonValue || '[]'));
    if (!Array.isArray(raw)) return [];
    return Array.from(new Set(raw.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)));
  } catch (_) {
    return [];
  }
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function calcNextMonthlyDay(currentNextRunAt, recurrenceDayOfMonth) {
  const base = currentNextRunAt ? new Date(currentNextRunAt) : new Date();
  const day = Number(recurrenceDayOfMonth);
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;

  const year = base.getFullYear();
  const month = base.getMonth();
  const thisMonthDays = new Date(year, month + 1, 0).getDate();
  const thisMonthTargetDay = Math.min(Math.floor(day), thisMonthDays);
  const thisMonthCandidate = new Date(
    year,
    month,
    thisMonthTargetDay,
    base.getHours(),
    base.getMinutes(),
    base.getSeconds(),
    base.getMilliseconds()
  );
  if (thisMonthCandidate > base) return thisMonthCandidate;

  const nextMonthDate = new Date(year, month + 1, 1);
  const nextYear = nextMonthDate.getFullYear();
  const nextMonth = nextMonthDate.getMonth();
  const nextMonthDays = new Date(nextYear, nextMonth + 1, 0).getDate();
  const nextMonthTargetDay = Math.min(Math.floor(day), nextMonthDays);
  return new Date(
    nextYear,
    nextMonth,
    nextMonthTargetDay,
    base.getHours(),
    base.getMinutes(),
    base.getSeconds(),
    base.getMilliseconds()
  );
}

function calcNextRun(currentNextRunAt, recurrenceKind, recurrenceMinutes, recurrenceDayOfMonth) {
  const base = currentNextRunAt ? new Date(currentNextRunAt) : new Date();
  if (recurrenceKind === 'daily') return addMinutes(base, 24 * 60);
  if (recurrenceKind === 'weekly') return addMinutes(base, 7 * 24 * 60);
  if (recurrenceKind === 'interval') {
    const mins = Number(recurrenceMinutes);
    return addMinutes(base, Number.isFinite(mins) && mins > 0 ? mins : 60);
  }
  if (recurrenceKind === 'monthly_day') {
    return calcNextMonthlyDay(base, recurrenceDayOfMonth);
  }
  return null;
}

async function findOrCreatePersonalRoomId(creatorUserId, otherUserId) {
  const candidateRooms = await Room.findAll({
    where: { type: 'personal' },
    include: [
      {
        model: User,
        attributes: ['id'],
        through: { attributes: [] },
        where: { id: { [Op.in]: [creatorUserId, otherUserId] } },
      },
    ],
  });

  for (const room of candidateRooms) {
    const users = await room.getUsers({ attributes: ['id'], through: { attributes: [] } });
    const ids = users.map((u) => Number(u.id)).sort((a, b) => a - b);
    if (ids.length === 2 && ids[0] === Math.min(creatorUserId, otherUserId) && ids[1] === Math.max(creatorUserId, otherUserId)) {
      return Number(room.id);
    }
  }

  const creator = await User.findByPk(creatorUserId);
  const other = await User.findByPk(otherUserId);
  if (!creator || !other) return null;

  const room = await Room.create({
    name: `Личный чат: ${creator.name} - ${other.name}`,
    type: 'personal',
  });
  await room.addUsers([creator, other]);
  return Number(room.id);
}

async function dispatchToGroupRooms(reminder, roomIds) {
  const createdIds = [];
  const io = getIO();
  for (const roomId of roomIds) {
    const member = await RoomUsers.findOne({
      where: { roomId, userId: reminder.creatorUserId },
      attributes: ['roomId'],
    });
    if (!member) continue;

    const created = await RoomMessage.create({
      roomId,
      userId: reminder.creatorUserId,
      content: reminder.content,
      type: 'text',
      deliveryStatus: 'sent',
    });
    createdIds.push(Number(created.id));

    const full = await RoomMessage.findByPk(created.id, {
      include: [{ model: User, attributes: ['id', 'name'] }],
    });
    io.to(`room-${roomId}`).emit('newRoomMessage', full);

    try {
      const participants = await RoomUsers.findAll({
        where: { roomId },
        attributes: ['userId'],
      });
      const recipientUserIds = Array.from(
        new Set(
          participants
            .map((p) => Number(p.userId))
            .filter((id) => Number.isFinite(id) && id > 0)
        )
      );
      if (recipientUserIds.length > 0) {
        const senderName = full?.User?.name || `User ${reminder.creatorUserId}`;
        const title = `Напоминание от ${senderName}`;
        const body = String(reminder.content || '').slice(0, 100) || 'Новое напоминание';
        await sendPushNotification(recipientUserIds, title, body, {
          type: 'messages',
          screen: 'room',
          roomId,
          url: `mobileapp://room/${encodeURIComponent(String(roomId))}`,
          source: 'reminder',
          reminderId: Number(reminder.id),
        });
      }
    } catch (err) {
      console.error('[reminder] room push error:', err);
    }
  }
  return createdIds;
}

async function dispatchToBossChats(reminder, chatIds) {
  const createdIds = [];
  const io = getIO();
  for (const chatId of chatIds) {
    const member = await BossChatUsers.findOne({
      where: { chatId, userId: reminder.creatorUserId },
      attributes: ['chatId'],
    });
    if (!member) continue;

    const now = new Date();
    const created = await BossMessage.create({
      chatId,
      userId: reminder.creatorUserId,
      content: reminder.content,
      type: 'text',
      deliveryStatus: 'sent',
      createdAt: now,
      updatedAt: now,
    });
    createdIds.push(Number(created.id));

    const full = await BossMessage.findByPk(created.id, {
      include: [{ model: User, attributes: ['id', 'name'] }],
    });
    io.to(`chat-${chatId}`).emit('newBossChatMessage', full);

    try {
      const participants = await BossChatUsers.findAll({
        where: { chatId },
        attributes: ['userId'],
      });
      const recipientUserIds = Array.from(
        new Set(
          participants
            .map((p) => Number(p.userId))
            .filter((id) => Number.isFinite(id) && id > 0)
        )
      );
      if (recipientUserIds.length > 0) {
        const senderName = full?.User?.name || `User ${reminder.creatorUserId}`;
        const title = `Напоминание от ${senderName}`;
        const body = String(reminder.content || '').slice(0, 100) || 'Новое напоминание';
        await sendPushNotification(recipientUserIds, title, body, {
          type: 'messages',
          screen: 'admin',
          chatId,
          url: `mobileapp://bossChats/${encodeURIComponent(String(chatId))}`,
          source: 'reminder',
          reminderId: Number(reminder.id),
        });
      }
    } catch (err) {
      console.error('[reminder] boss push error:', err);
    }
  }
  return createdIds;
}

async function dispatchToUsers(reminder, userIds) {
  const createdIds = [];
  const io = getIO();
  const pushTargetUserIds = new Set();
  const creator = await User.findByPk(reminder.creatorUserId, { attributes: ['name'] });
  const creatorName = creator?.name || `User ${reminder.creatorUserId}`;
  for (const otherUserId of userIds) {
    if (Number(otherUserId) === Number(reminder.creatorUserId)) continue;
    const roomId = await findOrCreatePersonalRoomId(reminder.creatorUserId, Number(otherUserId));
    if (!roomId) continue;

    const created = await RoomMessage.create({
      roomId,
      userId: reminder.creatorUserId,
      content: reminder.content,
      type: 'text',
      deliveryStatus: 'sent',
    });
    createdIds.push(Number(created.id));
    const full = await RoomMessage.findByPk(created.id, {
      include: [{ model: User, attributes: ['id', 'name'] }],
    });
    io.to(`room-${roomId}`).emit('newRoomMessage', full);
    pushTargetUserIds.add(Number(otherUserId));
  }

  // По требованию: автор тоже получает push по своим напоминаниям.
  pushTargetUserIds.add(Number(reminder.creatorUserId));
  const targets = Array.from(pushTargetUserIds).filter((id) => Number.isFinite(id) && id > 0);
  if (targets.length > 0) {
    try {
      const title = `Напоминание от ${creatorName}`;
      const body = String(reminder.content || '').slice(0, 100) || 'Новое напоминание';
      await sendPushNotification(targets, title, body, {
        type: 'messages',
        source: 'reminder',
        reminderId: Number(reminder.id),
      });
    } catch (err) {
      console.error('[reminder] users push error:', err);
    }
  }
  return createdIds;
}

async function dispatchReminderById(reminderId) {
  const reminder = await Reminder.findByPk(reminderId);
  if (!reminder) return { ok: false, reason: 'not_found' };
  if (!reminder.isActive) return { ok: false, reason: 'inactive' };
  if (reminder.isPaused) return { ok: false, reason: 'paused' };

  const ids = parseIds(reminder.targetIdsJson);
  if (ids.length === 0) {
    await reminder.update({ lastError: 'No targets' });
    return { ok: false, reason: 'no_targets' };
  }

  let createdIds = [];
  if (reminder.targetKind === 'group') {
    createdIds = await dispatchToGroupRooms(reminder, ids);
  } else if (reminder.targetKind === 'boss') {
    createdIds = await dispatchToBossChats(reminder, ids);
  } else {
    createdIds = await dispatchToUsers(reminder, ids);
  }

  const nextRunAt = calcNextRun(
    reminder.nextRunAt,
    reminder.recurrenceKind,
    reminder.recurrenceMinutes,
    reminder.recurrenceDayOfMonth
  );
  await reminder.update({
    lastSentAt: new Date(),
    nextRunAt: nextRunAt || reminder.nextRunAt,
    isActive: Boolean(nextRunAt),
    lastError: null,
  });

  return { ok: true, sentCount: createdIds.length, nextRunAt };
}

async function claimDueReminders(limit = 20) {
  const sql = `
    WITH cte AS (
      SELECT id
      FROM reminders
      WHERE "isActive" = TRUE
        AND "isPaused" = FALSE
        AND "nextRunAt" <= NOW()
      ORDER BY "nextRunAt" ASC
      LIMIT :limit
      FOR UPDATE SKIP LOCKED
    )
    SELECT id FROM cte;
  `;

  return sequelize.transaction(async (t) => {
    const rows = await sequelize.query(sql, {
      replacements: { limit },
      transaction: t,
      type: QueryTypes.SELECT,
    });
    return rows || [];
  });
}

async function processDueReminders(limit = 20) {
  const due = await claimDueReminders(limit);
  if (!due.length) return { processed: 0 };
  let processed = 0;
  for (const row of due) {
    try {
      await dispatchReminderById(Number(row.id));
      processed += 1;
    } catch (err) {
      await Reminder.update(
        { lastError: String(err?.message || err).slice(0, 1000) },
        { where: { id: Number(row.id) } }
      );
    }
  }
  return { processed };
}

module.exports = {
  dispatchReminderById,
  processDueReminders,
  parseIds,
  calcNextRun,
};

'use strict';

const { QueryTypes } = require('sequelize');
const db = require('../models');
const getIO = require('../socket').getIO;
const { sendPushNotification } = require('./sendPushNotification');
const { ensureRoomAllowsMessage } = require('./roomDeletionAccess');

const ScheduledMessage = db.sequelize.models.ScheduledMessage;
const RoomMessage = db.sequelize.models.RoomMessage;
const BossMessage = db.sequelize.models.BossMessage;
const RoomUsers = db.sequelize.models.RoomUsers;
const BossChatUsers = db.sequelize.models.BossChatUsers;
const Room = db.sequelize.models.Room;
const User = db.sequelize.models.User;
const sequelize = db.sequelize;

async function dispatchRoomScheduled(scheduled) {
  await ensureRoomAllowsMessage(scheduled.roomId, scheduled.userId);
  const created = await RoomMessage.create({
    roomId: scheduled.roomId,
    userId: scheduled.userId,
    content: scheduled.content,
    type: 'text',
    replyToMessageId: scheduled.replyToMessageId || null,
    deliveryStatus: 'sent',
  });

  const full = await RoomMessage.findByPk(created.id, {
    include: [
      { model: User, attributes: ['id', 'name'] },
      {
        model: RoomMessage,
        as: 'replyToMessage',
        include: [{ model: User, attributes: ['id', 'name'] }],
      },
    ],
  });

  const io = getIO();
  io.to(`room-${scheduled.roomId}`).emit('newRoomMessage', full);

  try {
    const room = await Room.findByPk(scheduled.roomId, {
      include: [{ model: User, through: { attributes: [] }, attributes: ['id'] }],
    });

    if (!room) return { sentMessageId: full.id };

    const activeMemberships = await RoomUsers.findAll({
      where: { roomId: scheduled.roomId, deletedAt: null },
      attributes: ['userId'],
    });
    const recipientUserIds = activeMemberships
      .map((membership) => Number(membership.userId))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (recipientUserIds.length === 0) return { sentMessageId: full.id };

    const senderName = full?.User?.name || `User ${scheduled.userId}`;
    const title = room.type === 'personal' ? `От ${senderName}` : `От ${senderName} в ${room.name}`;
    const body = (scheduled.content || '').slice(0, 100) || 'Новое сообщение';
    await sendPushNotification(recipientUserIds, title, body, { screen: 'room', roomId: scheduled.roomId });
  } catch (err) {
    console.error('[scheduled] room push error:', err);
  }

  return { sentMessageId: full.id };
}

async function dispatchBossScheduled(scheduled) {
  const now = new Date();
  const created = await BossMessage.create({
    chatId: scheduled.chatId,
    userId: scheduled.userId,
    content: scheduled.content,
    type: 'text',
    replyToMessageId: scheduled.replyToMessageId || null,
    deliveryStatus: 'sent',
    createdAt: now,
    updatedAt: now,
  });

  const full = await BossMessage.findByPk(created.id, {
    include: [
      { model: User, attributes: ['id', 'name'] },
      {
        model: BossMessage,
        as: 'replyToMessage',
        include: [{ model: User, attributes: ['id', 'name'] }],
      },
    ],
  });

  const io = getIO();
  io.to(`chat-${scheduled.chatId}`).emit('newBossChatMessage', full);

  try {
    const participants = await BossChatUsers.findAll({
      where: { chatId: scheduled.chatId },
      include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
    });

    const recipientUserIds = participants
      .map((p) => Number(p?.user?.id))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (recipientUserIds.length > 0) {
      const title = `От ${full?.User?.name || `User ${scheduled.userId}`}`;
      const body = (scheduled.content || '').slice(0, 100) || 'Новое сообщение';
      await sendPushNotification(recipientUserIds, title, body, { screen: 'admin', chatId: scheduled.chatId });
    }
  } catch (err) {
    console.error('[scheduled] boss push error:', err);
  }

  return { sentMessageId: full.id };
}

async function dispatchScheduledMessageById(id, options = {}) {
  const force = Boolean(options.force);
  const now = new Date();

  let scheduled = null;
  await sequelize.transaction(async (t) => {
    const row = await ScheduledMessage.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!row) return;
    if (row.scheduleState === 'sent' || row.scheduleState === 'cancelled') {
      scheduled = row;
      return;
    }
    if (!force && new Date(row.scheduledFor).getTime() > now.getTime()) {
      scheduled = row;
      return;
    }
    row.scheduleState = 'sending';
    await row.save({ transaction: t });
    scheduled = row;
  });

  if (!scheduled) return { ok: false, reason: 'not_found' };
  if (scheduled.scheduleState === 'sent') return { ok: true, reason: 'already_sent', sentMessageId: scheduled.sentMessageId };
  if (scheduled.scheduleState === 'cancelled') return { ok: false, reason: 'cancelled' };
  if (!force && new Date(scheduled.scheduledFor).getTime() > now.getTime()) return { ok: false, reason: 'not_due' };

  try {
    const result = scheduled.kind === 'room'
      ? await dispatchRoomScheduled(scheduled)
      : await dispatchBossScheduled(scheduled);

    await ScheduledMessage.update(
      {
        scheduleState: 'sent',
        sentAt: new Date(),
        sentMessageId: result.sentMessageId || null,
        lastError: null,
      },
      { where: { id: scheduled.id } }
    );

    return { ok: true, sentMessageId: result.sentMessageId || null };
  } catch (err) {
    await ScheduledMessage.update(
      {
        scheduleState: 'failed',
        lastError: String(err && err.message ? err.message : err).slice(0, 1000),
      },
      { where: { id: scheduled.id } }
    );
    return { ok: false, reason: 'dispatch_failed', error: err };
  }
}

async function claimDueScheduledMessages(limit = 20) {
  const sql = `
    WITH cte AS (
      SELECT id
      FROM scheduled_messages
      WHERE "scheduleState" = 'pending'
        AND "scheduledFor" <= NOW()
      ORDER BY "scheduledFor" ASC
      LIMIT :limit
      FOR UPDATE SKIP LOCKED
    )
    UPDATE scheduled_messages sm
    SET "scheduleState" = 'sending',
        "updatedAt" = NOW()
    FROM cte
    WHERE sm.id = cte.id
    RETURNING sm.id;
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

async function processDueScheduledMessages(limit = 20) {
  const claimed = await claimDueScheduledMessages(limit);
  if (!claimed || claimed.length === 0) return { processed: 0 };

  let processed = 0;
  for (const row of claimed) {
    await dispatchScheduledMessageById(row.id, { force: true });
    processed += 1;
  }
  return { processed };
}

module.exports = {
  dispatchScheduledMessageById,
  processDueScheduledMessages,
};

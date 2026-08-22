'use strict';

const db = require('../models');
const ScheduledMessage = db.sequelize.models.ScheduledMessage;
const RoomUsers = db.sequelize.models.RoomUsers;
const BossChatUsers = db.sequelize.models.BossChatUsers;
const { dispatchScheduledMessageById } = require('../services/scheduledMessageDispatcher');

function parseScheduledFor(value) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function parseReplyToMessageId(value) {
  if (value == null || String(value).trim() === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

async function ensureRoomAccess(userId, roomId) {
  const row = await RoomUsers.findOne({ where: { roomId, userId } });
  return Boolean(row);
}

async function ensureBossAccess(userId, chatId) {
  const row = await BossChatUsers.findOne({ where: { chatId, userId } });
  return Boolean(row);
}

async function listMyScheduledMessages(req, res) {
  try {
    const userId = Number(req.user.id);
    const rows = await ScheduledMessage.findAll({
      where: {
        userId,
        scheduleState: ['pending', 'sending'],
      },
      order: [['scheduledFor', 'ASC']],
      limit: 200,
    });
    return res.json(rows);
  } catch (err) {
    console.error('listMyScheduledMessages error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function createScheduledRoomMessage(req, res) {
  try {
    const roomId = Number(req.params.roomId);
    const userId = Number(req.user.id);
    const { content, scheduledFor, clientId } = req.body || {};
    const replyToMessageId = parseReplyToMessageId(req.body?.replyToMessageId ?? req.body?.replyToMessage);

    if (!Number.isFinite(roomId) || roomId <= 0) {
      return res.status(400).json({ message: 'Invalid roomId' });
    }
    const hasAccess = await ensureRoomAccess(userId, roomId);
    if (!hasAccess) return res.status(403).json({ message: 'Access denied' });

    const text = String(content || '').trim();
    if (!text) return res.status(400).json({ message: 'Content required' });

    const when = parseScheduledFor(scheduledFor);
    if (!when) return res.status(400).json({ message: 'Invalid scheduledFor' });
    if (when.getTime() < Date.now() + 5000) {
      return res.status(400).json({ message: 'scheduledFor must be at least 5 seconds in the future' });
    }

    if (clientId) {
      const existing = await ScheduledMessage.findOne({ where: { clientId } });
      if (existing) return res.json(existing);
    }

    const row = await ScheduledMessage.create({
      kind: 'room',
      roomId,
      userId,
      content: text,
      replyToMessageId,
      scheduledFor: when,
      scheduleState: 'pending',
      clientId: clientId || null,
    });

    return res.status(201).json(row);
  } catch (err) {
    console.error('createScheduledRoomMessage error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function listScheduledRoomMessages(req, res) {
  try {
    const roomId = Number(req.params.roomId);
    const userId = Number(req.user.id);
    if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json({ message: 'Invalid roomId' });
    const hasAccess = await ensureRoomAccess(userId, roomId);
    if (!hasAccess) return res.status(403).json({ message: 'Access denied' });

    const rows = await ScheduledMessage.findAll({
      where: { kind: 'room', roomId, userId },
      order: [['scheduledFor', 'ASC']],
      limit: 200,
    });
    return res.json(rows);
  } catch (err) {
    console.error('listScheduledRoomMessages error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function cancelScheduledRoomMessage(req, res) {
  try {
    const roomId = Number(req.params.roomId);
    const userId = Number(req.user.id);
    const scheduledId = Number(req.params.scheduledId);
    if (!Number.isFinite(roomId) || !Number.isFinite(scheduledId)) return res.status(400).json({ message: 'Invalid params' });
    const hasAccess = await ensureRoomAccess(userId, roomId);
    if (!hasAccess) return res.status(403).json({ message: 'Access denied' });

    const row = await ScheduledMessage.findOne({
      where: { id: scheduledId, kind: 'room', roomId, userId },
    });
    if (!row) return res.status(404).json({ message: 'Scheduled message not found' });
    if (row.scheduleState === 'sent') return res.status(409).json({ message: 'Already sent' });

    row.scheduleState = 'cancelled';
    row.cancelledAt = new Date();
    await row.save();
    return res.json({ ok: true, id: row.id });
  } catch (err) {
    console.error('cancelScheduledRoomMessage error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function updateScheduledRoomMessage(req, res) {
  try {
    const roomId = Number(req.params.roomId);
    const userId = Number(req.user.id);
    const scheduledId = Number(req.params.scheduledId);
    if (!Number.isFinite(roomId) || !Number.isFinite(scheduledId)) {
      return res.status(400).json({ message: 'Invalid params' });
    }
    const hasAccess = await ensureRoomAccess(userId, roomId);
    if (!hasAccess) return res.status(403).json({ message: 'Access denied' });

    const row = await ScheduledMessage.findOne({
      where: { id: scheduledId, kind: 'room', roomId, userId },
    });
    if (!row) return res.status(404).json({ message: 'Scheduled message not found' });
    if (row.scheduleState !== 'pending') {
      return res.status(409).json({ message: 'Only pending scheduled messages can be edited' });
    }

    const hasContent = Object.prototype.hasOwnProperty.call(req.body || {}, 'content');
    const hasScheduledFor = Object.prototype.hasOwnProperty.call(req.body || {}, 'scheduledFor');
    if (!hasContent && !hasScheduledFor) {
      return res.status(400).json({ message: 'Nothing to update' });
    }

    if (hasContent) {
      const text = String(req.body.content || '').trim();
      if (!text) return res.status(400).json({ message: 'Content required' });
      row.content = text;
    }
    if (hasScheduledFor) {
      const when = parseScheduledFor(req.body.scheduledFor);
      if (!when) return res.status(400).json({ message: 'Invalid scheduledFor' });
      if (when.getTime() < Date.now() + 5000) {
        return res.status(400).json({ message: 'scheduledFor must be at least 5 seconds in the future' });
      }
      row.scheduledFor = when;
    }

    await row.save();
    return res.json(row);
  } catch (err) {
    console.error('updateScheduledRoomMessage error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function sendScheduledRoomMessageNow(req, res) {
  try {
    const roomId = Number(req.params.roomId);
    const userId = Number(req.user.id);
    const scheduledId = Number(req.params.scheduledId);
    if (!Number.isFinite(roomId) || !Number.isFinite(scheduledId)) return res.status(400).json({ message: 'Invalid params' });
    const hasAccess = await ensureRoomAccess(userId, roomId);
    if (!hasAccess) return res.status(403).json({ message: 'Access denied' });

    const row = await ScheduledMessage.findOne({
      where: { id: scheduledId, kind: 'room', roomId, userId },
    });
    if (!row) return res.status(404).json({ message: 'Scheduled message not found' });

    const result = await dispatchScheduledMessageById(row.id, { force: true });
    if (!result.ok) return res.status(409).json(result);
    return res.json(result);
  } catch (err) {
    console.error('sendScheduledRoomMessageNow error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function createScheduledBossMessage(req, res) {
  try {
    const chatId = Number(req.params.chatId);
    const userId = Number(req.user.id);
    const { content, scheduledFor, clientId } = req.body || {};
    const replyToMessageId = parseReplyToMessageId(req.body?.replyToMessageId ?? req.body?.replyToMessage);

    if (!Number.isFinite(chatId) || chatId <= 0) {
      return res.status(400).json({ message: 'Invalid chatId' });
    }
    const hasAccess = await ensureBossAccess(userId, chatId);
    if (!hasAccess) return res.status(403).json({ message: 'Access denied' });

    const text = String(content || '').trim();
    if (!text) return res.status(400).json({ message: 'Content required' });

    const when = parseScheduledFor(scheduledFor);
    if (!when) return res.status(400).json({ message: 'Invalid scheduledFor' });
    if (when.getTime() < Date.now() + 5000) {
      return res.status(400).json({ message: 'scheduledFor must be at least 5 seconds in the future' });
    }

    if (clientId) {
      const existing = await ScheduledMessage.findOne({ where: { clientId } });
      if (existing) return res.json(existing);
    }

    const row = await ScheduledMessage.create({
      kind: 'boss',
      chatId,
      userId,
      content: text,
      replyToMessageId,
      scheduledFor: when,
      scheduleState: 'pending',
      clientId: clientId || null,
    });

    return res.status(201).json(row);
  } catch (err) {
    console.error('createScheduledBossMessage error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function listScheduledBossMessages(req, res) {
  try {
    const chatId = Number(req.params.chatId);
    const userId = Number(req.user.id);
    if (!Number.isFinite(chatId) || chatId <= 0) return res.status(400).json({ message: 'Invalid chatId' });
    const hasAccess = await ensureBossAccess(userId, chatId);
    if (!hasAccess) return res.status(403).json({ message: 'Access denied' });

    const rows = await ScheduledMessage.findAll({
      where: { kind: 'boss', chatId, userId },
      order: [['scheduledFor', 'ASC']],
      limit: 200,
    });
    return res.json(rows);
  } catch (err) {
    console.error('listScheduledBossMessages error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function cancelScheduledBossMessage(req, res) {
  try {
    const chatId = Number(req.params.chatId);
    const userId = Number(req.user.id);
    const scheduledId = Number(req.params.scheduledId);
    if (!Number.isFinite(chatId) || !Number.isFinite(scheduledId)) return res.status(400).json({ message: 'Invalid params' });
    const hasAccess = await ensureBossAccess(userId, chatId);
    if (!hasAccess) return res.status(403).json({ message: 'Access denied' });

    const row = await ScheduledMessage.findOne({
      where: { id: scheduledId, kind: 'boss', chatId, userId },
    });
    if (!row) return res.status(404).json({ message: 'Scheduled message not found' });
    if (row.scheduleState === 'sent') return res.status(409).json({ message: 'Already sent' });

    row.scheduleState = 'cancelled';
    row.cancelledAt = new Date();
    await row.save();
    return res.json({ ok: true, id: row.id });
  } catch (err) {
    console.error('cancelScheduledBossMessage error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function updateScheduledBossMessage(req, res) {
  try {
    const chatId = Number(req.params.chatId);
    const userId = Number(req.user.id);
    const scheduledId = Number(req.params.scheduledId);
    if (!Number.isFinite(chatId) || !Number.isFinite(scheduledId)) {
      return res.status(400).json({ message: 'Invalid params' });
    }
    const hasAccess = await ensureBossAccess(userId, chatId);
    if (!hasAccess) return res.status(403).json({ message: 'Access denied' });

    const row = await ScheduledMessage.findOne({
      where: { id: scheduledId, kind: 'boss', chatId, userId },
    });
    if (!row) return res.status(404).json({ message: 'Scheduled message not found' });
    if (row.scheduleState !== 'pending') {
      return res.status(409).json({ message: 'Only pending scheduled messages can be edited' });
    }

    const hasContent = Object.prototype.hasOwnProperty.call(req.body || {}, 'content');
    const hasScheduledFor = Object.prototype.hasOwnProperty.call(req.body || {}, 'scheduledFor');
    if (!hasContent && !hasScheduledFor) {
      return res.status(400).json({ message: 'Nothing to update' });
    }

    if (hasContent) {
      const text = String(req.body.content || '').trim();
      if (!text) return res.status(400).json({ message: 'Content required' });
      row.content = text;
    }
    if (hasScheduledFor) {
      const when = parseScheduledFor(req.body.scheduledFor);
      if (!when) return res.status(400).json({ message: 'Invalid scheduledFor' });
      if (when.getTime() < Date.now() + 5000) {
        return res.status(400).json({ message: 'scheduledFor must be at least 5 seconds in the future' });
      }
      row.scheduledFor = when;
    }

    await row.save();
    return res.json(row);
  } catch (err) {
    console.error('updateScheduledBossMessage error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function sendScheduledBossMessageNow(req, res) {
  try {
    const chatId = Number(req.params.chatId);
    const userId = Number(req.user.id);
    const scheduledId = Number(req.params.scheduledId);
    if (!Number.isFinite(chatId) || !Number.isFinite(scheduledId)) return res.status(400).json({ message: 'Invalid params' });
    const hasAccess = await ensureBossAccess(userId, chatId);
    if (!hasAccess) return res.status(403).json({ message: 'Access denied' });

    const row = await ScheduledMessage.findOne({
      where: { id: scheduledId, kind: 'boss', chatId, userId },
    });
    if (!row) return res.status(404).json({ message: 'Scheduled message not found' });

    const result = await dispatchScheduledMessageById(row.id, { force: true });
    if (!result.ok) return res.status(409).json(result);
    return res.json(result);
  } catch (err) {
    console.error('sendScheduledBossMessageNow error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  listMyScheduledMessages,
  createScheduledRoomMessage,
  listScheduledRoomMessages,
  updateScheduledRoomMessage,
  cancelScheduledRoomMessage,
  sendScheduledRoomMessageNow,
  createScheduledBossMessage,
  listScheduledBossMessages,
  updateScheduledBossMessage,
  cancelScheduledBossMessage,
  sendScheduledBossMessageNow,
};

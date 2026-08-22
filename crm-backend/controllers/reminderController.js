const { Op } = require('sequelize');
const db = require('../models');
const { dispatchReminderById, parseIds, calcNextRun } = require('../services/reminderDispatcher');

const Reminder = db.sequelize.models.Reminder;
const User = db.sequelize.models.User;
const Room = db.sequelize.models.Room;
const RoomUsers = db.sequelize.models.RoomUsers;
const BossChat = db.sequelize.models.BossChat;
const BossChatUsers = db.sequelize.models.BossChatUsers;

let syncPromise = null;
function ensureReminderTable() {
  if (!syncPromise) {
    syncPromise = Reminder.sync().catch((err) => {
      syncPromise = null;
      throw err;
    });
  }
  return syncPromise;
}

function sanitizeIds(ids) {
  const raw = Array.isArray(ids) ? ids : [];
  return Array.from(new Set(raw.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)));
}

function parseDate(value, fallback = null) {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseOptionalPositiveInt(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.floor(num);
}

function parseDayOfMonth(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1 || num > 31) return null;
  return Math.floor(num);
}

async function listReminderOptions(req, res) {
  try {
    await ensureReminderTable();
    const userId = Number(req.user.id);

    const employees = await User.findAll({
      where: { isActive: true, canChat: true, id: { [Op.ne]: userId } },
      attributes: ['id', 'name'],
      order: [['name', 'ASC']],
    });

    const bossMemberships = await BossChatUsers.findAll({
      where: { userId },
      attributes: ['chatId'],
    });
    const bossIds = bossMemberships.map((row) => Number(row.chatId)).filter(Boolean);
    const bossChats = bossIds.length
      ? await BossChat.findAll({
          where: { id: bossIds },
          attributes: ['id', 'name'],
          order: [['name', 'ASC']],
        })
      : [];

    const roomMemberships = await RoomUsers.findAll({
      where: { userId },
      attributes: ['roomId'],
    });
    const roomIds = roomMemberships.map((row) => Number(row.roomId)).filter(Boolean);
    const groups = roomIds.length
      ? await Room.findAll({
          where: { id: roomIds, type: 'group' },
          attributes: ['id', 'name'],
          order: [['name', 'ASC']],
        })
      : [];

    return res.json({
      employees,
      bossChats,
      groups,
    });
  } catch (err) {
    console.error('listReminderOptions error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function listReminders(req, res) {
  try {
    await ensureReminderTable();
    const userId = Number(req.user.id);
    const rows = await Reminder.findAll({
      where: { creatorUserId: userId },
      order: [['createdAt', 'DESC']],
      limit: 300,
    });
    return res.json(
      rows.map((row) => {
        const plain = row.get({ plain: true });
        return {
          ...plain,
          targetIds: parseIds(plain.targetIdsJson),
        };
      })
    );
  } catch (err) {
    console.error('listReminders error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function createReminder(req, res) {
  try {
    await ensureReminderTable();
    const userId = Number(req.user.id);
    const content = String(req.body?.content || '').trim();
    const targetKind = String(req.body?.targetKind || '').trim();
    const targetIds = sanitizeIds(req.body?.targetIds);
    const recurrenceKind = String(req.body?.recurrenceKind || 'none');
    const recurrenceMinutesRaw = Number(req.body?.recurrenceMinutes);
    const recurrenceMinutes = Number.isFinite(recurrenceMinutesRaw) && recurrenceMinutesRaw > 0
      ? Math.floor(recurrenceMinutesRaw)
      : null;
    const recurrenceDayOfMonth = parseDayOfMonth(req.body?.recurrenceDayOfMonth);
    const scheduledFor = parseDate(req.body?.scheduledFor);
    const sourceKind = ['room', 'boss', 'manual'].includes(String(req.body?.sourceKind))
      ? String(req.body?.sourceKind)
      : 'manual';
    const sourceRoomId = parseOptionalPositiveInt(req.body?.sourceRoomId);
    const sourceChatId = parseOptionalPositiveInt(req.body?.sourceChatId);

    if (!content) return res.status(400).json({ message: 'Content required' });
    if (!['users', 'boss', 'group'].includes(targetKind)) return res.status(400).json({ message: 'Invalid targetKind' });
    if (targetIds.length === 0) return res.status(400).json({ message: 'Select at least one target' });
    if (!scheduledFor) return res.status(400).json({ message: 'Invalid scheduledFor' });
    if (scheduledFor.getTime() < Date.now() + 5000) {
      return res.status(400).json({ message: 'scheduledFor must be at least 5 seconds in the future' });
    }
    if (!['none', 'daily', 'weekly', 'interval', 'monthly_day'].includes(recurrenceKind)) {
      return res.status(400).json({ message: 'Invalid recurrenceKind' });
    }
    if (recurrenceKind === 'interval' && (!recurrenceMinutes || recurrenceMinutes < 1)) {
      return res.status(400).json({ message: 'recurrenceMinutes required for interval' });
    }
    if (recurrenceKind === 'monthly_day' && !recurrenceDayOfMonth) {
      return res.status(400).json({ message: 'recurrenceDayOfMonth required for monthly_day' });
    }

    const row = await Reminder.create({
      creatorUserId: userId,
      sourceKind,
      sourceRoomId,
      sourceChatId,
      targetKind,
      targetIdsJson: JSON.stringify(targetIds),
      content,
      scheduledFor,
      nextRunAt: scheduledFor,
      recurrenceKind,
      recurrenceMinutes: recurrenceKind === 'interval' ? recurrenceMinutes : null,
      recurrenceDayOfMonth: recurrenceKind === 'monthly_day' ? recurrenceDayOfMonth : null,
      isPaused: false,
      isActive: true,
    });

    const plain = row.get({ plain: true });
    return res.status(201).json({ ...plain, targetIds });
  } catch (err) {
    console.error('createReminder error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function updateReminder(req, res) {
  try {
    await ensureReminderTable();
    const userId = Number(req.user.id);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });

    const row = await Reminder.findOne({ where: { id, creatorUserId: userId } });
    if (!row) return res.status(404).json({ message: 'Reminder not found' });

    const body = req.body || {};
    if (Object.prototype.hasOwnProperty.call(body, 'content')) {
      const content = String(body.content || '').trim();
      if (!content) return res.status(400).json({ message: 'Content required' });
      row.content = content;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'targetKind')) {
      const targetKind = String(body.targetKind || '').trim();
      if (!['users', 'boss', 'group'].includes(targetKind)) {
        return res.status(400).json({ message: 'Invalid targetKind' });
      }
      row.targetKind = targetKind;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'targetIds')) {
      const ids = sanitizeIds(body.targetIds);
      if (!ids.length) return res.status(400).json({ message: 'Select at least one target' });
      row.targetIdsJson = JSON.stringify(ids);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'scheduledFor')) {
      const dt = parseDate(body.scheduledFor);
      if (!dt) return res.status(400).json({ message: 'Invalid scheduledFor' });
      row.scheduledFor = dt;
      row.nextRunAt = dt;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'recurrenceKind')) {
      const recurrenceKind = String(body.recurrenceKind || '').trim();
      if (!['none', 'daily', 'weekly', 'interval', 'monthly_day'].includes(recurrenceKind)) {
        return res.status(400).json({ message: 'Invalid recurrenceKind' });
      }
      row.recurrenceKind = recurrenceKind;
      if (recurrenceKind !== 'interval') row.recurrenceMinutes = null;
      if (recurrenceKind !== 'monthly_day') row.recurrenceDayOfMonth = null;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'recurrenceMinutes')) {
      if (body.recurrenceMinutes == null || body.recurrenceMinutes === '') {
        if (row.recurrenceKind === 'interval') {
          return res.status(400).json({ message: 'Invalid recurrenceMinutes' });
        }
        row.recurrenceMinutes = null;
      } else {
        const mins = Number(body.recurrenceMinutes);
        if (!Number.isFinite(mins) || mins < 1) return res.status(400).json({ message: 'Invalid recurrenceMinutes' });
        if (row.recurrenceKind !== 'interval') {
          return res.status(400).json({ message: 'recurrenceMinutes allowed only for interval' });
        }
        row.recurrenceMinutes = Math.floor(mins);
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'recurrenceDayOfMonth')) {
      if (body.recurrenceDayOfMonth == null || body.recurrenceDayOfMonth === '') {
        if (row.recurrenceKind === 'monthly_day') {
          return res.status(400).json({ message: 'Invalid recurrenceDayOfMonth' });
        }
        row.recurrenceDayOfMonth = null;
      } else {
        const day = parseDayOfMonth(body.recurrenceDayOfMonth);
        if (!day) return res.status(400).json({ message: 'Invalid recurrenceDayOfMonth' });
        if (row.recurrenceKind !== 'monthly_day') {
          return res.status(400).json({ message: 'recurrenceDayOfMonth allowed only for monthly_day' });
        }
        row.recurrenceDayOfMonth = day;
      }
    }
    if (row.recurrenceKind === 'monthly_day' && !row.recurrenceDayOfMonth) {
      return res.status(400).json({ message: 'recurrenceDayOfMonth required for monthly_day' });
    }
    if (Object.prototype.hasOwnProperty.call(body, 'isPaused')) {
      row.isPaused = Boolean(body.isPaused);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'isActive')) {
      row.isActive = Boolean(body.isActive);
    }
    if (!row.isActive && row.recurrenceKind !== 'none') {
      row.isActive = true;
      row.nextRunAt = calcNextRun(
        new Date(),
        row.recurrenceKind,
        row.recurrenceMinutes,
        row.recurrenceDayOfMonth
      ) || row.nextRunAt;
    }

    await row.save();
    const plain = row.get({ plain: true });
    return res.json({ ...plain, targetIds: parseIds(plain.targetIdsJson) });
  } catch (err) {
    console.error('updateReminder error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function setReminderPaused(req, res) {
  try {
    await ensureReminderTable();
    const userId = Number(req.user.id);
    const id = Number(req.params.id);
    const row = await Reminder.findOne({ where: { id, creatorUserId: userId } });
    if (!row) return res.status(404).json({ message: 'Reminder not found' });
    row.isPaused = Boolean(req.body?.paused ?? true);
    await row.save();
    return res.json({ ok: true, id: row.id, isPaused: row.isPaused });
  } catch (err) {
    console.error('setReminderPaused error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function deleteReminder(req, res) {
  try {
    await ensureReminderTable();
    const userId = Number(req.user.id);
    const id = Number(req.params.id);
    const row = await Reminder.findOne({ where: { id, creatorUserId: userId } });
    if (!row) return res.status(404).json({ message: 'Reminder not found' });
    await row.destroy();
    return res.json({ ok: true, id });
  } catch (err) {
    console.error('deleteReminder error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function sendReminderNow(req, res) {
  try {
    await ensureReminderTable();
    const userId = Number(req.user.id);
    const id = Number(req.params.id);
    const row = await Reminder.findOne({ where: { id, creatorUserId: userId } });
    if (!row) return res.status(404).json({ message: 'Reminder not found' });
    const result = await dispatchReminderById(id);
    if (!result.ok) return res.status(409).json(result);
    return res.json(result);
  } catch (err) {
    console.error('sendReminderNow error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  listReminderOptions,
  listReminders,
  createReminder,
  updateReminder,
  setReminderPaused,
  deleteReminder,
  sendReminderNow,
  ensureReminderTable,
};

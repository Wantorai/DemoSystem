const { Op } = require('sequelize');
const db = require('../models');

const AlertNotice = db.sequelize.models.AlertNotice;
const AlertNoticeRecipient = db.sequelize.models.AlertNoticeRecipient;
const User = db.sequelize.models.User;
const Room = db.sequelize.models.Room;
const RoomUsers = db.sequelize.models.RoomUsers;
const BossChat = db.sequelize.models.BossChat;
const BossChatUsers = db.sequelize.models.BossChatUsers;
const { sendPushNotification } = require('../services/sendPushNotification');
const { getIO } = require('../socket');
const ALERTS_ADMIN_CHAT_ID = 5;


let syncPromise = null;
function ensureAlertTables() {
  if (!syncPromise) {
    syncPromise = (async () => {
      await AlertNotice.sync();
      await AlertNoticeRecipient.sync();
    })().catch((err) => {
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

function parseIds(jsonValue) {
  try {
    const parsed = JSON.parse(String(jsonValue || '[]'));
    return sanitizeIds(parsed);
  } catch {
    return [];
  }
}

function parseDate(value, fallback = null) {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function emitAlertsChanged(targetUserIds, payload = {}) {
  try {
    const io = getIO();
    if (!io) return;
    const normalized = sanitizeIds(targetUserIds);
    io.emit('alerts:changed', {
      targetUserIds: normalized,
      ...payload,
      ts: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[alerts] emitAlertsChanged failed:', err?.message || err);
  }
}

async function resolveRecipientUserIds(targetKind, targetIds) {
  if (targetKind === 'users') {
    const users = await User.findAll({
      where: { id: { [Op.in]: targetIds }, isActive: true, canChat: true },
      attributes: ['id'],
    });
    return sanitizeIds(users.map((u) => Number(u.id)));
  }

  if (targetKind === 'boss') {
    const rows = await BossChatUsers.findAll({
      where: { chatId: { [Op.in]: targetIds } },
      attributes: ['userId'],
    });
    return sanitizeIds(rows.map((r) => Number(r.userId)));
  }

  if (targetKind === 'group') {
    const rows = await RoomUsers.findAll({
      where: { roomId: { [Op.in]: targetIds } },
      attributes: ['userId'],
    });
    return sanitizeIds(rows.map((r) => Number(r.userId)));
  }

  return [];
}

function summarizeRecipients(recipientRows) {
  const totalRecipients = recipientRows.length;
  const readRecipients = recipientRows.filter((r) => !!r.readAt).length;
  const pendingRecipients = totalRecipients - readRecipients;
  const pendingUsers = recipientRows
    .filter((r) => !r.readAt && r.user)
    .map((r) => ({ id: r.user.id, name: r.user.name }));
  const readUsers = recipientRows
    .filter((r) => !!r.readAt && r.user)
    .map((r) => ({ id: r.user.id, name: r.user.name }));
  return { totalRecipients, readRecipients, pendingRecipients, pendingUsers, readUsers };
}

async function canCreateAlertsForUser(user) {
  const userId = Number(user?.id);
  if (!Number.isFinite(userId) || userId <= 0) return false;
  const membership = await BossChatUsers.findOne({
    where: {
      chatId: ALERTS_ADMIN_CHAT_ID,
      userId,
    },
    attributes: ['userId'],
  });
  return !!membership;
}

async function listAlertOptions(req, res) {
  try {
    await ensureAlertTables();
    const userId = Number(req.user.id);
    const canCreate = await canCreateAlertsForUser(req.user);
    if (!canCreate) return res.status(403).json({ message: 'Access denied' });

    const employees = await User.findAll({
      where: { isActive: true, canChat: true, id: { [Op.ne]: userId } },
      attributes: ['id', 'name'],
      order: [['name', 'ASC']],
    });

    const bossMemberships = await BossChatUsers.findAll({
      where: { userId },
      attributes: ['chatId'],
    });
    const bossIds = sanitizeIds(bossMemberships.map((row) => Number(row.chatId)));
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
    const roomIds = sanitizeIds(roomMemberships.map((row) => Number(row.roomId)));
    const groups = roomIds.length
      ? await Room.findAll({
          where: { id: roomIds, type: 'group' },
          attributes: ['id', 'name'],
          order: [['name', 'ASC']],
        })
      : [];

    return res.json({ employees, bossChats, groups });
  } catch (err) {
    console.error('listAlertOptions error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function createAlert(req, res) {
  try {
    await ensureAlertTables();
    const creatorUserId = Number(req.user.id);
    const canCreate = await canCreateAlertsForUser(req.user);
    if (!canCreate) return res.status(403).json({ message: 'Access denied' });
    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || '').trim();
    const targetKind = String(req.body?.targetKind || 'users').trim();
    const targetIds = sanitizeIds(req.body?.targetIds);
    const scheduledFor = parseDate(req.body?.scheduledFor, new Date());

    if (!title) return res.status(400).json({ message: 'Title required' });
    if (!content) return res.status(400).json({ message: 'Content required' });
    if (!['users', 'boss', 'group'].includes(targetKind)) {
      return res.status(400).json({ message: 'Invalid targetKind' });
    }
    if (targetIds.length === 0) return res.status(400).json({ message: 'Select at least one target' });
    if (!scheduledFor) return res.status(400).json({ message: 'Invalid scheduledFor' });

    const recipientUserIds = sanitizeIds(
      await resolveRecipientUserIds(targetKind, targetIds)
    );
    if (recipientUserIds.length === 0) {
      return res.status(400).json({ message: 'No recipients resolved' });
    }

    const publishNow = scheduledFor.getTime() <= Date.now();
    const publishedAt = publishNow ? new Date() : null;

    const result = await db.sequelize.transaction(async (tx) => {
      const alert = await AlertNotice.create(
        {
          creatorUserId,
          title,
          content,
          targetKind,
          targetIdsJson: JSON.stringify(targetIds),
          isActive: true,
          scheduledFor,
          publishedAt,
          lastSentAt: publishedAt,
        },
        { transaction: tx }
      );

      await AlertNoticeRecipient.bulkCreate(
        recipientUserIds.map((userId) => ({
          alertId: alert.id,
          userId,
          readAt: null,
        })),
        { transaction: tx }
      );

      return alert;
    });

    const full = await AlertNotice.findByPk(result.id, {
      include: [
        { model: User, as: 'creator', attributes: ['id', 'name'] },
        {
          model: AlertNoticeRecipient,
          as: 'recipients',
          include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
        },
      ],
      order: [[{ model: AlertNoticeRecipient, as: 'recipients' }, 'id', 'ASC']],
    });

    const plain = full.get({ plain: true });

    // push отправляем только если оповещение уже опубликовано
    if (publishNow) {
      (async () => {
        try {
          const pushTargetUserIds = sanitizeIds([...recipientUserIds, creatorUserId]);
          if (pushTargetUserIds.length === 0) return;

          const creatorName = plain?.creator?.name || `User ${creatorUserId}`;
          const pushTitle = `Оповещение от ${creatorName}`;
          const pushBody = title || 'Новое оповещение';

          await sendPushNotification(pushTargetUserIds, pushTitle, pushBody, {
            screen: 'alerts',
            alerts: '1',
            alertId: String(result.id),
          });
        } catch (pushErr) {
          console.error('createAlert push error:', pushErr);
        }
      })();
    }

    emitAlertsChanged([...recipientUserIds, creatorUserId], {
      reason: 'created',
      alertId: result.id,
      creatorUserId,
    });


    return res.status(201).json({
      ...plain,
      targetIds: parseIds(plain.targetIdsJson),
      ...summarizeRecipients(plain.recipients || []),
    });
  } catch (err) {
    console.error('createAlert error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function listAlerts(req, res) {
  try {
    await ensureAlertTables();
    const userId = Number(req.user.id);
    const canCreate = await canCreateAlertsForUser(req.user);

    const sentRows = await AlertNotice.findAll({
      where: { creatorUserId: userId, isActive: true },
      include: [
        {
          model: AlertNoticeRecipient,
          as: 'recipients',
          include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: 200,
    });

    const inboxRecipientRows = await AlertNoticeRecipient.findAll({
      where: { userId },
      include: [
        {
          model: AlertNotice,
          as: 'alert',
          where: { isActive: true, publishedAt: { [Op.lte]: new Date() } },
          include: [{ model: User, as: 'creator', attributes: ['id', 'name'] }],
        },
      ],
      order: [[{ model: AlertNotice, as: 'alert' }, 'createdAt', 'DESC']],
      limit: 200,
    });

    const inboxAlertIds = sanitizeIds(
      inboxRecipientRows.map((row) => Number(row?.alert?.id ?? row?.alertId))
    );
    const inboxStatsRows = inboxAlertIds.length
      ? await AlertNoticeRecipient.findAll({
          where: { alertId: { [Op.in]: inboxAlertIds } },
          include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
          order: [['id', 'ASC']],
        })
      : [];
    const inboxStatsByAlertId = new Map();
    inboxStatsRows.forEach((row) => {
      const plain = row.get({ plain: true });
      const alertId = Number(plain.alertId);
      if (!Number.isFinite(alertId) || alertId <= 0) return;
      const list = inboxStatsByAlertId.get(alertId) || [];
      list.push(plain);
      inboxStatsByAlertId.set(alertId, list);
    });

    const sent = sentRows.map((row) => {
      const plain = row.get({ plain: true });
      return {
        ...plain,
        targetIds: parseIds(plain.targetIdsJson),
        ...summarizeRecipients(plain.recipients || []),
      };
    });

    const inbox = inboxRecipientRows.map((row) => {
      const plain = row.get({ plain: true });
      const alert = plain.alert || {};
      return {
        recipientId: plain.id,
        userId: plain.userId,
        readAt: plain.readAt,
        isRead: !!plain.readAt,
        alert: {
          ...alert,
          targetIds: parseIds(alert.targetIdsJson),
          ...summarizeRecipients(inboxStatsByAlertId.get(Number(alert.id)) || []),
        },
      };
    });

    const inboxUnreadTotal = inbox.filter((row) => !row.isRead).length;

    return res.json({ sent, inbox, inboxUnreadTotal, canCreate });
  } catch (err) {
    console.error('listAlerts error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function listAlertSummary(req, res) {
  try {
    await ensureAlertTables();
    const userId = Number(req.user.id);
    const now = new Date();
    const [canCreate, unreadTotal, latestInbox] = await Promise.all([
      canCreateAlertsForUser(req.user),
      AlertNoticeRecipient.count({
        where: { userId, readAt: { [Op.is]: null } },
        include: [
          {
            model: AlertNotice,
            as: 'alert',
            where: { isActive: true, publishedAt: { [Op.lte]: now } },
            attributes: [],
          },
        ],
      }),
      AlertNoticeRecipient.findOne({
        where: { userId },
        include: [
          {
            model: AlertNotice,
            as: 'alert',
            where: { isActive: true, publishedAt: { [Op.lte]: now } },
            attributes: ['id', 'title', 'createdAt'],
          },
        ],
        order: [[{ model: AlertNotice, as: 'alert' }, 'createdAt', 'DESC']],
      }),
    ]);

    const latestSent = canCreate
      ? await AlertNotice.findOne({
          where: { creatorUserId: userId, isActive: true },
          attributes: ['id', 'title', 'createdAt'],
          order: [['createdAt', 'DESC']],
        })
      : null;

    const inboxAlert = latestInbox?.alert || null;
    const sentAlert = latestSent || null;
    const inboxTs = inboxAlert?.createdAt ? new Date(inboxAlert.createdAt).getTime() : 0;
    const sentTs = sentAlert?.createdAt ? new Date(sentAlert.createdAt).getTime() : 0;
    const latest = sentTs > inboxTs ? sentAlert : inboxAlert;

    return res.json({
      unreadTotal: Number(unreadTotal || 0),
      canCreate,
      lastAlertTitle: latest?.title || '',
      lastAlertAt: latest?.createdAt || null,
    });
  } catch (err) {
    console.error('listAlertSummary error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function listUnreadTotal(req, res) {
  try {
    await ensureAlertTables();
    const userId = Number(req.user.id);
    const total = await AlertNoticeRecipient.count({
      where: { userId, readAt: { [Op.is]: null } },
      include: [
        {
          model: AlertNotice,
          as: 'alert',
          where: { isActive: true, publishedAt: { [Op.lte]: new Date() } },
          attributes: [],
        },
      ],
    });
    return res.json({ unreadTotal: Number(total || 0) });
  } catch (err) {
    console.error('listUnreadTotal error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function markAlertRead(req, res) {
  try {
    await ensureAlertTables();
    const userId = Number(req.user.id);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });

    const row = await AlertNoticeRecipient.findOne({
      where: { alertId: id, userId },
      include: [{ model: AlertNotice, as: 'alert', attributes: ['id', 'isActive', 'creatorUserId'] }],
    });
    if (!row || !row.alert || !row.alert.isActive) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    if (!row.readAt) {
      row.readAt = new Date();
      await row.save();
      emitAlertsChanged([userId, Number(row.alert?.creatorUserId)], {
        reason: 'read',
        alertId: id,
        readerUserId: userId,
      });
    }
    return res.json({ ok: true, readAt: row.readAt });
  } catch (err) {
    console.error('markAlertRead error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function getAlertRecipients(req, res) {
  try {
    await ensureAlertTables();
    const userId = Number(req.user.id);
    const canCreate = await canCreateAlertsForUser(req.user);
    if (!canCreate) return res.status(403).json({ message: 'Access denied' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });

    const alert = await AlertNotice.findByPk(id, {
      include: [{ model: User, as: 'creator', attributes: ['id', 'name'] }],
    });
    if (!alert || !alert.isActive) return res.status(404).json({ message: 'Alert not found' });
    if (Number(alert.creatorUserId) !== userId) return res.status(403).json({ message: 'Access denied' });

    const recipients = await AlertNoticeRecipient.findAll({
      where: { alertId: id },
      include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
      order: [['id', 'ASC']],
    });

    return res.json({
      alert: alert.get({ plain: true }),
      recipients: recipients.map((r) => r.get({ plain: true })),
    });
  } catch (err) {
    console.error('getAlertRecipients error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function updateAlert(req, res) {
  try {
    await ensureAlertTables();
    const userId = Number(req.user.id);
    const canCreate = await canCreateAlertsForUser(req.user);
    if (!canCreate) return res.status(403).json({ message: 'Access denied' });

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });

    const alert = await AlertNotice.findOne({ where: { id, creatorUserId: userId, isActive: true } });
    if (!alert) return res.status(404).json({ message: 'Alert not found' });

    const nextTitle = req.body?.title != null ? String(req.body.title).trim() : null;
    const nextContent = req.body?.content != null ? String(req.body.content).trim() : null;
    const nextScheduledFor = Object.prototype.hasOwnProperty.call(req.body || {}, 'scheduledFor')
      ? parseDate(req.body?.scheduledFor)
      : undefined;
    if (nextTitle !== null) {
      if (!nextTitle) return res.status(400).json({ message: 'Title required' });
      alert.title = nextTitle;
    }
    if (nextContent !== null) {
      if (!nextContent) return res.status(400).json({ message: 'Content required' });
      alert.content = nextContent;
    }
    if (nextScheduledFor !== undefined) {
      if (!nextScheduledFor) return res.status(400).json({ message: 'Invalid scheduledFor' });
      alert.scheduledFor = nextScheduledFor;
      if (!alert.publishedAt && nextScheduledFor.getTime() <= Date.now()) {
        alert.publishedAt = new Date();
      }
    }

    await alert.save();

    const recipientRows = await AlertNoticeRecipient.findAll({
      where: { alertId: alert.id },
      attributes: ['userId'],
    });
    const recipientUserIds = sanitizeIds(recipientRows.map((row) => Number(row.userId)));

    if (alert.publishedAt) {
      await AlertNoticeRecipient.update(
        { readAt: null },
        { where: { alertId: alert.id } }
      );

      (async () => {
        try {
          const pushTargetUserIds = sanitizeIds([...recipientUserIds, userId]);
          if (!pushTargetUserIds.length) return;
          const creatorName = req.user?.name || `User ${userId}`;
          const pushTitle = `Оповещение от ${creatorName}`;
          const pushBody = alert.title || 'Новое оповещение';
          await sendPushNotification(pushTargetUserIds, pushTitle, pushBody, {
            screen: 'alerts',
            alerts: '1',
            alertId: String(alert.id),
          });
        } catch (pushErr) {
          console.error('updateAlert push error:', pushErr);
        }
      })();
    }

    const recipients = await AlertNoticeRecipient.findAll({
      where: { alertId: alert.id },
      include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
      order: [['id', 'ASC']],
    });
    const plainRecipients = recipients.map((r) => r.get({ plain: true }));
    const targetUserIds = sanitizeIds([
      userId,
      ...plainRecipients.map((r) => Number(r.userId)),
    ]);

    emitAlertsChanged(targetUserIds, {
      reason: 'updated',
      alertId: alert.id,
      creatorUserId: userId,
    });

    return res.json({
      ...alert.get({ plain: true }),
      targetIds: parseIds(alert.targetIdsJson),
      ...summarizeRecipients(plainRecipients),
    });
  } catch (err) {
    console.error('updateAlert error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function deleteAlert(req, res) {
  try {
    await ensureAlertTables();
    const userId = Number(req.user.id);
    const canCreate = await canCreateAlertsForUser(req.user);
    if (!canCreate) return res.status(403).json({ message: 'Access denied' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });

    const alert = await AlertNotice.findOne({ where: { id, isActive: true } });
    if (!alert) return res.status(404).json({ message: 'Alert not found' });
    const recipientRows = await AlertNoticeRecipient.findAll({
      where: { alertId: alert.id },
      attributes: ['userId'],
    });
    const targetUserIds = sanitizeIds([
      userId,
      Number(alert.creatorUserId),
      ...recipientRows.map((r) => Number(r.userId)),
    ]);
    alert.isActive = false;
    await alert.save();
    emitAlertsChanged(targetUserIds, {
      reason: 'deleted',
      alertId: alert.id,
      creatorUserId: Number(alert.creatorUserId),
      deletedByUserId: userId,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('deleteAlert error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  ensureAlertTables,
  listAlertOptions,
  createAlert,
  listAlerts,
  listAlertSummary,
  listUnreadTotal,
  markAlertRead,
  getAlertRecipients,
  updateAlert,
  deleteAlert,
};

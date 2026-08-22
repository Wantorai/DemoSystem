const { Op } = require('sequelize');
const db = require('../models');
const { sendPushNotification } = require('./sendPushNotification');
const { getIO } = require('../socket');

const AlertNotice = db.sequelize.models.AlertNotice;
const AlertNoticeRecipient = db.sequelize.models.AlertNoticeRecipient;
const User = db.sequelize.models.User;

function emitAlertsChanged(targetUserIds, payload = {}) {
  try {
    const io = getIO();
    if (!io) return;
    const normalized = Array.from(
      new Set((Array.isArray(targetUserIds) ? targetUserIds : [])
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v > 0))
    );
    io.emit('alerts:changed', {
      targetUserIds: normalized,
      ...payload,
      ts: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[alerts-dispatcher] emitAlertsChanged failed:', err?.message || err);
  }
}

async function publishAlertById(alertId) {
  const alert = await AlertNotice.findByPk(alertId, {
    include: [{ model: User, as: 'creator', attributes: ['id', 'name'] }],
  });
  if (!alert) return { ok: false, reason: 'not_found' };
  if (!alert.isActive) return { ok: false, reason: 'inactive' };
  if (alert.publishedAt) return { ok: false, reason: 'already_published' };
  if (!alert.scheduledFor || new Date(alert.scheduledFor).getTime() > Date.now()) {
    return { ok: false, reason: 'not_due' };
  }

  const [updated] = await AlertNotice.update(
    { publishedAt: new Date(), lastSentAt: new Date() },
    { where: { id: alert.id, publishedAt: { [Op.is]: null } } }
  );
  if (!updated) return { ok: false, reason: 'already_published' };

  const recipients = await AlertNoticeRecipient.findAll({
    where: { alertId: alert.id },
    attributes: ['userId'],
  });
  const recipientUserIds = Array.from(
    new Set(recipients.map((r) => Number(r.userId)).filter((v) => Number.isFinite(v) && v > 0))
  );
  const pushTargetUserIds = Array.from(
    new Set([...recipientUserIds, Number(alert.creatorUserId)].filter((v) => Number.isFinite(v) && v > 0))
  );
  if (!pushTargetUserIds.length) return { ok: true, sent: 0 };

  const creatorName = alert.creator?.name || `User ${alert.creatorUserId}`;
  const title = `Оповещение от ${creatorName}`;
  const body = alert.title || 'Новое оповещение';
  await sendPushNotification(pushTargetUserIds, title, body, {
    screen: 'alerts',
    alerts: '1',
    alertId: String(alert.id),
  });
  emitAlertsChanged(pushTargetUserIds, {
    reason: 'published',
    alertId: alert.id,
    creatorUserId: Number(alert.creatorUserId),
  });
  return { ok: true, sent: pushTargetUserIds.length };
}

async function processDueAlerts(limit = 20) {
  const rows = await AlertNotice.findAll({
    where: {
      isActive: true,
      publishedAt: { [Op.is]: null },
      scheduledFor: { [Op.lte]: new Date() },
    },
    order: [['scheduledFor', 'ASC']],
    limit,
  });
  if (!rows.length) return { processed: 0 };

  let processed = 0;
  for (const row of rows) {
    try {
      const result = await publishAlertById(row.id);
      if (result.ok) processed += 1;
    } catch (err) {
      console.error('[alerts-dispatcher] publish error:', err);
    }
  }
  return { processed };
}

module.exports = {
  publishAlertById,
  processDueAlerts,
};

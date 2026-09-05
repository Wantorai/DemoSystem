'use strict';

const { Op } = require('sequelize');
const db = require('../models');

const SecurityEvent = db.sequelize.models.SecurityEvent;
const recentKeys = new Map();
let lastCleanupAt = 0;

const text = (value, max) => String(value || '').trim().slice(0, max) || null;

const requestIp = (req) =>
  text(
    String(req?.headers?.['x-forwarded-for'] || req?.ip || req?.socket?.remoteAddress || '')
      .split(',')[0]
      .trim(),
    100
  );

const requestFields = (req) => ({
  ipAddress: requestIp(req),
  origin: text(req?.headers?.origin, 500),
  host: text(req?.headers?.['x-forwarded-host'] || req?.headers?.host, 255),
  method: text(req?.method, 12),
  path: text(String(req?.originalUrl || req?.url || '').split('?')[0], 500),
  userAgent: text(req?.headers?.['user-agent'], 1000),
});

const cleanupOldEvents = async () => {
  const now = Date.now();
  if (now - lastCleanupAt < 60 * 60 * 1000) return;
  lastCleanupAt = now;
  const retentionDays = Math.min(Math.max(Number(process.env.SECURITY_LOG_RETENTION_DAYS) || 90, 7), 365);
  await SecurityEvent.destroy({
    where: { occurredAt: { [Op.lt]: new Date(now - retentionDays * 24 * 60 * 60 * 1000) } },
  });
};

const recordSecurityEvent = async ({ req, eventType, severity = 'warning', statusCode, username, details = {}, throttleKey, throttleMs = 0 }) => {
  if (!SecurityEvent || !eventType) return;
  if (throttleKey && throttleMs > 0) {
    const now = Date.now();
    if ((recentKeys.get(throttleKey) || 0) > now - throttleMs) return;
    recentKeys.set(throttleKey, now);
    if (recentKeys.size > 5000) {
      for (const [key, timestamp] of recentKeys) {
        if (timestamp < now - 60 * 60 * 1000) recentKeys.delete(key);
      }
    }
  }

  await SecurityEvent.create({
    eventType: text(eventType, 50),
    severity: text(severity, 20) || 'warning',
    ...requestFields(req),
    statusCode: Number.isInteger(Number(statusCode)) ? Number(statusCode) : null,
    username: text(username, 160),
    details: details && typeof details === 'object' && !Array.isArray(details) ? details : {},
    occurredAt: new Date(),
  });
  cleanupOldEvents().catch((error) => console.error('[security] log cleanup failed', error));
};

const recordSecurityEventSafe = (payload) => {
  recordSecurityEvent(payload).catch((error) => console.error('[security] event write failed', error));
};

module.exports = { recordSecurityEvent, recordSecurityEventSafe, requestIp };

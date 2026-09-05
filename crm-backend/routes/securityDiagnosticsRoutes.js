'use strict';

const express = require('express');
const { Op, fn, col } = require('sequelize');
const auth = require('../middleware/authMiddleware');
const db = require('../models');

const SecurityEvent = db.sequelize.models.SecurityEvent;
const router = express.Router();

const parseIdSet = (raw, fallback = '') =>
  new Set(
    String(raw || fallback)
      .split(',')
      .map((value) => Number(String(value || '').trim()))
      .filter((value) => Number.isFinite(value) && value > 0)
  );

const ADMIN_ROLE_IDS = new Set([
  ...parseIdSet(process.env.SUPER_ADMIN_ROLE_IDS, '1'),
  ...parseIdSet(process.env.ADMIN_ROLE_IDS, '2'),
]);
const SUPER_ADMIN_USER_IDS = parseIdSet(process.env.SUPER_ADMIN_USER_IDS, '');

const requireSecurityAdmin = (req, res, next) => {
  const allowed =
    ADMIN_ROLE_IDS.has(Number(req.user?.roleId)) ||
    SUPER_ADMIN_USER_IDS.has(Number(req.user?.id));
  if (!allowed) return res.status(403).json({ error: 'Диагностика безопасности доступна только администраторам' });
  return next();
};

const rangeFromQuery = (query) => {
  const days = Math.min(Math.max(Number.parseInt(String(query.days || '7'), 10) || 7, 1), 90);
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { days, from, to };
};

const whereFromQuery = (query, from, to) => {
  const where = { occurredAt: { [Op.between]: [from, to] } };
  const eventType = String(query.eventType || '').trim();
  const severity = String(query.severity || '').trim();
  if (eventType) where.eventType = eventType.slice(0, 50);
  if (severity) where.severity = severity.slice(0, 20);
  return where;
};

router.use(auth, requireSecurityAdmin);

router.get('/security-diagnostics/summary', async (req, res) => {
  try {
    const { days, from, to } = rangeFromQuery(req.query);
    const where = whereFromQuery(req.query, from, to);
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || '200'), 10) || 200, 20), 1000);
    const last24h = new Date(to.getTime() - 24 * 60 * 60 * 1000);

    const [events, total, last24Hours, critical, byTypeRows, topIpRows, topOriginRows] = await Promise.all([
      SecurityEvent.findAll({ where, order: [['occurredAt', 'DESC']], limit }),
      SecurityEvent.count({ where }),
      SecurityEvent.count({ where: { occurredAt: { [Op.between]: [last24h, to] } } }),
      SecurityEvent.count({ where: { ...where, severity: 'critical' } }),
      SecurityEvent.findAll({
        attributes: ['eventType', [fn('COUNT', col('id')), 'count']],
        where,
        group: ['eventType'],
        order: [[fn('COUNT', col('id')), 'DESC']],
        raw: true,
      }),
      SecurityEvent.findAll({
        attributes: ['ipAddress', [fn('COUNT', col('id')), 'count']],
        where: { ...where, ipAddress: { [Op.not]: null } },
        group: ['ipAddress'],
        order: [[fn('COUNT', col('id')), 'DESC']],
        limit: 10,
        raw: true,
      }),
      SecurityEvent.findAll({
        attributes: ['origin', [fn('COUNT', col('id')), 'count']],
        where: { ...where, eventType: 'unexpected_origin', origin: { [Op.not]: null } },
        group: ['origin'],
        order: [[fn('COUNT', col('id')), 'DESC']],
        limit: 10,
        raw: true,
      }),
    ]);

    return res.json({
      generatedAt: new Date().toISOString(),
      range: { days, from: from.toISOString(), to: to.toISOString() },
      totals: { selected: total, last24Hours, critical },
      byType: byTypeRows.map((row) => ({ eventType: row.eventType, count: Number(row.count) || 0 })),
      topIps: topIpRows.map((row) => ({ value: row.ipAddress, count: Number(row.count) || 0 })),
      topOrigins: topOriginRows.map((row) => ({ value: row.origin, count: Number(row.count) || 0 })),
      events,
    });
  } catch (error) {
    console.error('[security] summary failed', error);
    return res.status(500).json({ error: 'Не удалось загрузить диагностику безопасности' });
  }
});

const csvCell = (value) => {
  const normalized = value == null
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
};

router.get('/security-diagnostics/export', async (req, res) => {
  try {
    const { days, from, to } = rangeFromQuery(req.query);
    const where = whereFromQuery(req.query, from, to);
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || '10000'), 10) || 10000, 100), 50000);
    const events = await SecurityEvent.findAll({ where, order: [['occurredAt', 'DESC']], limit, raw: true });
    const format = String(req.query.format || 'json').toLowerCase();
    const date = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
      const columns = ['occurredAt', 'eventType', 'severity', 'statusCode', 'ipAddress', 'origin', 'host', 'method', 'path', 'username', 'userAgent', 'details'];
      const csv = [
        columns.map(csvCell).join(','),
        ...events.map((event) => columns.map((column) => csvCell(event[column])).join(',')),
      ].join('\r\n');
      res.setHeader('content-type', 'text/csv; charset=utf-8');
      res.setHeader('content-disposition', `attachment; filename="security-diagnostics-${days}d-${date}.csv"`);
      return res.send(`\uFEFF${csv}`);
    }

    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="security-diagnostics-${days}d-${date}.json"`);
    return res.send(JSON.stringify({
      generatedAt: new Date().toISOString(),
      range: { days, from: from.toISOString(), to: to.toISOString() },
      count: events.length,
      privacy: 'Пароли, JWT и тела запросов не журналируются.',
      events,
    }, null, 2));
  } catch (error) {
    console.error('[security] export failed', error);
    return res.status(500).json({ error: 'Не удалось выгрузить диагностику безопасности' });
  }
});

module.exports = router;

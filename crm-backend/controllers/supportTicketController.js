const path = require('path');
const fs = require('fs');
const db = require('../models');
const { Op } = require('sequelize');

const SupportTicket = db.sequelize.models.SupportTicket;

const STATUS_VALUES = new Set(['new', 'in_progress', 'done']);

const parseIdSet = (raw, fallback = '') =>
  new Set(
    String(raw || fallback)
      .split(',')
      .map((value) => Number(String(value || '').trim()))
      .filter((value) => Number.isFinite(value) && value > 0)
  );

const ADMIN_ROLE_IDS = parseIdSet(process.env.ADMIN_ROLE_IDS, '2');
const SUPER_ADMIN_ROLE_IDS = parseIdSet(process.env.SUPER_ADMIN_ROLE_IDS, '1');
const SUPER_ADMIN_USER_IDS = parseIdSet(process.env.SUPER_ADMIN_USER_IDS, '');
const SUPPORT_ADMIN_HOSTS = new Set(
  String(process.env.SUPPORT_ADMIN_HOSTS || 'orderspace.ru,www.orderspace.ru,localhost,127.0.0.1')
    .split(',')
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
);

const extractHost = (req) =>
  String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');

const canManageTickets = (req) => {
  const host = extractHost(req);
  const isAllowedHost = SUPPORT_ADMIN_HOSTS.has(host);
  const roleId = Number(req.user?.roleId);
  const userId = Number(req.user?.id);
  const isAdmin =
    ADMIN_ROLE_IDS.has(roleId) ||
    SUPER_ADMIN_ROLE_IDS.has(roleId) ||
    SUPER_ADMIN_USER_IDS.has(userId);
  return isAllowedHost && isAdmin;
};

const requireTicketAdmin = (req, res) => {
  if (canManageTickets(req)) return true;
  res.status(403).json({ error: 'Управление тикетами доступно только администраторам основной системы' });
  return false;
};

const removeUploadedFile = (file) => {
  if (!file?.path) return;
  fs.unlink(file.path, () => {});
};

const parseTechnicalInfo = (raw) => {
  if (!raw) return {};
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || Array.isArray(value) || typeof value !== 'object') return {};
    return value;
  } catch {
    return {};
  }
};

const getRequestIp = (req) =>
  String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
    .split(',')[0]
    .trim()
    .slice(0, 100);

const createTicket = async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    const source = String(req.body?.source || req.headers['x-support-source'] || 'web')
      .trim()
      .slice(0, 100);
    const creatorKey = `${source || 'web'}:${req.user.id}`.slice(0, 180);
    const clientTechnicalInfo = parseTechnicalInfo(req.body?.technicalInfo);
    const technicalInfo = {
      ...clientTechnicalInfo,
      request: {
        ip: getRequestIp(req),
        host: extractHost(req),
        userAgent: String(req.headers['user-agent'] || '').slice(0, 1000),
        receivedAt: new Date().toISOString(),
      },
    };

    if (!title || !description) {
      removeUploadedFile(req.file);
      return res.status(400).json({ error: 'Укажите тему и описание проблемы' });
    }

    const attachmentUrl = req.file
      ? `/uploads/support/${path.basename(req.file.filename)}`
      : null;

    const ticket = await SupportTicket.create({
      creatorUserId: req.user.id,
      creatorKey,
      creatorName: req.user.name,
      source: source || 'web',
      title: title.slice(0, 200),
      description,
      attachmentUrl,
      attachmentName: req.file?.originalname || null,
      attachmentType: req.file?.mimetype || null,
      technicalInfo,
    });

    return res.status(201).json(ticket);
  } catch (error) {
    removeUploadedFile(req.file);
    console.error('[support] create ticket failed', error);
    return res.status(500).json({ error: 'Не удалось создать тикет' });
  }
};

const listMyTickets = async (req, res) => {
  try {
    const source = String(req.headers['x-support-source'] || 'web').trim().slice(0, 100);
    const creatorKey = `${source || 'web'}:${req.user.id}`.slice(0, 180);
    const tickets = await SupportTicket.findAll({
      where: { creatorKey },
      order: [['createdAt', 'DESC']],
      limit: 100,
    });
    return res.json(tickets);
  } catch (error) {
    console.error('[support] list own tickets failed', error);
    return res.status(500).json({ error: 'Не удалось получить тикеты' });
  }
};

const listAdminTickets = async (req, res) => {
  if (!requireTicketAdmin(req, res)) return;
  try {
    const where = {};
    const status = String(req.query?.status || '').trim();
    if (STATUS_VALUES.has(status)) where.status = status;

    const tickets = await SupportTicket.findAll({
      where,
      order: [
        ['status', 'ASC'],
        ['createdAt', 'DESC'],
      ],
      limit: 500,
    });
    return res.json(tickets);
  } catch (error) {
    console.error('[support] admin list failed', error);
    return res.status(500).json({ error: 'Не удалось получить тикеты' });
  }
};

const getUnreadTicketCount = async (req, res) => {
  if (!requireTicketAdmin(req, res)) return;
  try {
    const count = await SupportTicket.count({
      where: {
        status: 'new',
        adminViewedAt: { [Op.is]: null },
      },
    });
    return res.json({ count });
  } catch (error) {
    console.error('[support] unread count failed', error);
    return res.status(500).json({ error: 'Не удалось получить количество новых тикетов' });
  }
};

const markTicketsViewed = async (req, res) => {
  if (!requireTicketAdmin(req, res)) return;
  try {
    const ticketIds = Array.isArray(req.body?.ticketIds)
      ? req.body.ticketIds
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      : [];
    if (ticketIds.length === 0) {
      const remainingCount = await SupportTicket.count({
        where: {
          status: 'new',
          adminViewedAt: { [Op.is]: null },
        },
      });
      return res.json({ updated: 0, remainingCount });
    }

    const [updated] = await SupportTicket.update(
      { adminViewedAt: new Date() },
      {
        where: {
          id: { [Op.in]: ticketIds },
          adminViewedAt: { [Op.is]: null },
        },
      }
    );
    const remainingCount = await SupportTicket.count({
      where: {
        status: 'new',
        adminViewedAt: { [Op.is]: null },
      },
    });
    return res.json({ updated, remainingCount });
  } catch (error) {
    console.error('[support] mark viewed failed', error);
    return res.status(500).json({ error: 'Не удалось отметить тикеты просмотренными' });
  }
};

const updateTicket = async (req, res) => {
  if (!requireTicketAdmin(req, res)) return;
  try {
    const ticket = await SupportTicket.findByPk(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Тикет не найден' });

    const status = String(req.body?.status || '').trim();
    if (!STATUS_VALUES.has(status)) {
      return res.status(400).json({ error: 'Некорректный статус' });
    }

    ticket.status = status;
    ticket.adminComment = String(req.body?.adminComment || '').trim() || null;
    ticket.resolvedAt = status === 'done' ? new Date() : null;
    await ticket.save();
    return res.json(ticket);
  } catch (error) {
    console.error('[support] update ticket failed', error);
    return res.status(500).json({ error: 'Не удалось обновить тикет' });
  }
};

const deleteTicket = async (req, res) => {
  if (!requireTicketAdmin(req, res)) return;
  try {
    const ticket = await SupportTicket.findByPk(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Тикет не найден' });

    const attachmentPath = ticket.attachmentUrl
      ? path.join(__dirname, '..', 'uploads', 'support', path.basename(ticket.attachmentUrl))
      : null;

    await ticket.destroy();
    if (attachmentPath) {
      fs.unlink(attachmentPath, (error) => {
        if (error && error.code !== 'ENOENT') {
          console.error('[support] delete attachment failed', error);
        }
      });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('[support] delete ticket failed', error);
    return res.status(500).json({ error: 'Не удалось удалить тикет' });
  }
};

module.exports = {
  createTicket,
  listMyTickets,
  listAdminTickets,
  getUnreadTicketCount,
  markTicketsViewed,
  updateTicket,
  deleteTicket,
};

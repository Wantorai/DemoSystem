// controllers/roomPinnedController.js
const db = require('../models');
const RoomPinnedMessage = db.sequelize.models.RoomPinnedMessage;
const RoomPinnedArchive = db.sequelize.models.RoomPinnedArchive;
const User        = db.sequelize.models.User;
const Room        = db.sequelize.models.Room;
const RoomMessage = db.sequelize.models.RoomMessage;
const { getIO } = require('../socket');
const { Op } = require('sequelize');
const { decryptString } = require('../services/messageCrypto');

function decryptPinnedPayload(payload) {
  if (!payload) return payload;
  const plain = typeof payload.get === 'function' ? payload.get({ plain: true }) : payload;
  const message = plain?.message ? { ...plain.message } : null;
  if (message && typeof message.content === 'string') {
    message.content = decryptString(message.content);
  }
  if (message && typeof message.transcriptionText === 'string') {
    message.transcriptionText = decryptString(message.transcriptionText);
  }
  return { ...plain, message };
}

function decryptPinnedArchivePayload(payload) {
  if (!payload) return payload;
  const plain = typeof payload.get === 'function' ? payload.get({ plain: true }) : payload;
  const message = plain?.message ? { ...plain.message } : null;
  if (message && typeof message.content === 'string') {
    message.content = decryptString(message.content);
  }
  if (message && typeof message.transcriptionText === 'string') {
    message.transcriptionText = decryptString(message.transcriptionText);
  }
  return { ...plain, message };
}

function normalizePhoneLast10(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  return digits.slice(-10);
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}


async function pinRoomMess(req, res) {
  const io = getIO();
  const t = await db.sequelize.transaction();
  try {
    const roomId = parseInt(req.params.roomId, 10);
    const { messageId, expiresAt, orderIndex } = req.body;
    const pinnedByUserId = req.user.id;

    // проверяем, что сообщение принадлежит чату
    const message = await RoomMessage.findOne({ where: { id: messageId, roomId }, transaction: t });
    if (!message) {
      await t.rollback();
      return res.status(404).json({ error: 'Message not found in chat' });
    }

    // Если уже есть пин для этой пары — вернём его (избегаем дубликата)
    const existing = await RoomPinnedMessage.findOne({ where: { roomId, messageId }, transaction: t });
    if (existing) {
      // загрузим полноту если нужно
      const existingFull = await RoomPinnedMessage.findOne({
        where: { id: existing.id },
        include: [
          { model: RoomMessage, as: 'message' },
          { model: User, as: 'pinnedBy', attributes: ['id','name'] },
        ],
        transaction: t,
      });
      await t.commit();
      // emit: всё ещё полезно оповестить (опционально)
      if (io) io.to(`room_chat-${roomId}`).emit('room:message_pinned', { roomId, pinned: existingFull });
      return res.json({ pinned: decryptPinnedPayload(existingFull) });
    }

    // Ограничение кол-ва закрепов
    const MAX_PINNED = 50;
    const count = await RoomPinnedMessage.count({ where: { roomId }, transaction: t });
    if (count >= MAX_PINNED) {
      const oldest = await RoomPinnedMessage.findOne({ where: { roomId }, order: [['pinnedAt', 'ASC']], transaction: t });
      if (oldest) await oldest.destroy({ transaction: t });
    }

    // Создаём новый пин
    let pinned;
    try {
      pinned = await RoomPinnedMessage.create({
        roomId,
        messageId,
        pinnedByUserId,
        pinnedAt: new Date(),
        expiresAt: expiresAt || null,
        orderIndex: orderIndex ?? null,
      }, { transaction: t });
    } catch (err) {
      // на случай гонки — если другой процесс только что вставил такой же уникальный ключ
      if (err.name === 'SequelizeUniqueConstraintError' || err.parent?.code === '23505') {
        // найдем существующий и вернём его
        const conflict = await RoomPinnedMessage.findOne({ where: { roomId, messageId }, transaction: t });
        const conflictFull = await RoomPinnedMessage.findOne({
          where: { id: conflict.id },
          include: [
            { model: RoomMessage, as: 'message' },
            { model: User, as: 'pinnedBy', attributes: ['id','name'] },
          ],
          transaction: t,
        });
        await t.commit();
        if (io) io.to(`room_chat-${roomId}`).emit('room:message_pinned', { roomId, pinned: conflictFull });
        return res.json({ pinned: decryptPinnedPayload(conflictFull) });
      }
      throw err; // пробросим дальше
    }

    // Получаем полноту данных
    const pinnedFull = await RoomPinnedMessage.findOne({
      where: { id: pinned.id },
      include: [
        { model: RoomMessage, as: 'message' },
        { model: User, as: 'pinnedBy', attributes: ['id','name'] },
      ],
      transaction: t,
    });

    await t.commit();

    // emit socket уже после коммита
    if (io) io.to(`room_chat-${roomId}`).emit('room:message_pinned', { roomId, pinned: pinnedFull });

    return res.json({ pinned: decryptPinnedPayload(pinnedFull) });
  } catch (err) {
    // safety rollback
    try { await t.rollback(); } catch (e) {}
    console.error('pin error', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}



async function unpinRoomMess(req, res) {
    const io = getIO();
    const t = await db.sequelize.transaction();
    try {
        const roomId = parseInt(req.params.roomId, 10);
        const { pinnedId, messageId, archiveComment } = req.body;
        const currentUserId = Number(req.user?.id || 0);

        // if (!await hasPinRights(req.user, roomId)) {
        //     return res.status(403).json({ error: 'No permission to unpin in this chat' });
        // }

        const where = { roomId };
        if (pinnedId) where.id = pinnedId;
        if (messageId) where.messageId = messageId;

        const pinned = await RoomPinnedMessage.findOne({ where, transaction: t });
        if (!pinned) {
          await t.rollback();
          return res.status(404).json({ error: 'Pinned not found' });
        }
        const pinnedOwnerId = Number(pinned.pinnedByUserId || 0);
        const sameById = Number.isFinite(pinnedOwnerId) && pinnedOwnerId > 0 && pinnedOwnerId === currentUserId;
        const ownerUser = (Number.isFinite(pinnedOwnerId) && pinnedOwnerId > 0)
          ? await User.findByPk(pinnedOwnerId, { attributes: ['id', 'phone', 'name'], transaction: t })
          : null;
        const currentPhone10 = normalizePhoneLast10(req.user?.phone);
        const ownerPhone10 = normalizePhoneLast10(ownerUser?.phone);
        const sameByPhone = Boolean(currentPhone10) && Boolean(ownerPhone10) && currentPhone10 === ownerPhone10;
        const currentName = normalizeName(req.user?.name);
        const ownerName = normalizeName(ownerUser?.name);
        const sameByName = Boolean(currentName) && Boolean(ownerName) && currentName === ownerName;
        if (!sameById && !sameByPhone && !sameByName) {
          await t.rollback();
          return res.status(403).json({ error: 'Only pin author can unpin this message' });
        }

        const now = new Date();
        const archivedUntil = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        const comment = String(archiveComment || '').trim().slice(0, 1000);

        const archived = await RoomPinnedArchive.create({
          roomId,
          messageId: Number(pinned.messageId) || null,
          pinnedId: Number(pinned.id) || null,
          userId: currentUserId,
          comment: comment || null,
          unpinnedAt: now,
          archivedUntil,
        }, { transaction: t });

        await pinned.destroy({ transaction: t });
        await t.commit();

        const archivedFull = await RoomPinnedArchive.findOne({
          where: { id: archived.id },
          include: [
            { model: RoomMessage, as: 'message' },
            { model: Room, as: 'room', attributes: ['id', 'name', 'type'] },
            { model: User, as: 'user', attributes: ['id', 'name'] },
          ],
        });

        if (io) io.to(`room_chat-${roomId}`).emit('room:message_unpinned', {
        roomId,
        messageId: pinned.messageId,
        pinnedId: pinned.id,
        });

        return res.json({ ok: true, archived: decryptPinnedArchivePayload(archivedFull) });
    } catch (err) {
        try { await t.rollback(); } catch (_) {}
        console.error('unpin error', err);
        return res.status(500).json({ error: 'Internal error' });
    }
}

async function listRoomPinned(req, res) {
    try {
        const roomId = parseInt(req.params.roomId, 10);
        const pinned = await RoomPinnedMessage.findAll({
        where: { roomId },
        include: [
            { model: RoomMessage, as: 'message' },
            { model: User, as: 'pinnedBy', attributes: ['id','name'] },
        ],
        order: [['orderIndex', 'ASC'], ['pinnedAt', 'DESC']],
        });

        return res.json({ pinned: (pinned || []).map(decryptPinnedPayload) });
    } catch (err) {
        console.error('list pinned error', err);
        return res.status(500).json({ error: 'Internal error' });
    }
}


async function positionMessage(req, res) {

    try {
    const { roomId, messageId } = req.params;
    const pageSize = Number(req.query.pageSize ?? 30);

    // 1) Найдём сообщение (получаем createdAt)
    const msg = await RoomMessage.findOne({
      where: { id: messageId, roomId },
      attributes: ['createdAt'],
      raw: true,
    });

    if (!msg) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const createdAt = msg.createdAt;

    // 2) Считаем, сколько сообщений раньше него (ASC order)
    // Если у вас есть индекс по (roomId, createdAt) -> COUNT будет быстрым
    const countBefore = await RoomMessage.count({
      where: {
        roomId,
        createdAt: { [Op.lt]: createdAt },
      },
    });

    const indexInAll = Number(countBefore); // zero-based
    const page = Math.floor(indexInAll / pageSize);
    const indexInPage = indexInAll % pageSize;

    // 3) (Опционально) общее количество сообщений в комнате
    const totalMessages = await RoomMessage.count({ where: { roomId } });

    return res.json({
      indexInAll,
      page,
      indexInPage,
      totalMessages,
    });
  } catch (err) {
    console.error('position endpoint error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }


};

async function anchorMessageWindow(req, res) {
  try {
    const roomId = Number(req.params.roomId);
    const messageId = Number(req.params.messageId);
    const currentUserId = Number(req.user?.id || 0);
    const rawWindow = Number(req.query.window ?? 120);
    const windowSize = Math.min(300, Math.max(30, Number.isFinite(rawWindow) ? rawWindow : 120));

    if (!Number.isFinite(roomId) || roomId <= 0 || !Number.isFinite(messageId) || messageId <= 0) {
      return res.status(400).json({ error: 'Invalid roomId/messageId' });
    }
    if (!Number.isFinite(currentUserId) || currentUserId <= 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.log('[PinnedAnchor][room] start', { roomId, messageId, currentUserId, windowSize });

    const RoomUsers = db.sequelize.models.RoomUsers;
    const member = await RoomUsers.findOne({
      where: { roomId, userId: currentUserId },
      attributes: ['roomId', 'userId'],
      raw: true,
    });
    if (!member) {
      console.log('[PinnedAnchor][room] denied', { roomId, messageId, currentUserId });
      return res.status(403).json({ error: 'Access denied' });
    }

    const target = await RoomMessage.findOne({
      where: { id: messageId, roomId },
      attributes: ['id', 'createdAt'],
      raw: true,
    });
    if (!target) {
      console.log('[PinnedAnchor][room] target-not-found', { roomId, messageId });
      return res.status(404).json({ error: 'Message not found' });
    }

    // Надежный индекс в общей ASC-ленте: учитываем createdAt + id как tie-breaker.
    const countBefore = await RoomMessage.count({
      where: {
        roomId,
        [Op.or]: [
          { createdAt: { [Op.lt]: target.createdAt } },
          {
            [Op.and]: [
              { createdAt: target.createdAt },
              { id: { [Op.lt]: messageId } },
            ],
          },
        ],
      },
    });

    const totalMessages = await RoomMessage.count({ where: { roomId } });
    const indexInAll = Number(countBefore);
    const indexFromNewest = Math.max(0, Number(totalMessages) - 1 - indexInAll);

    const startIndex = Math.max(0, indexInAll - Math.floor(windowSize / 2));
    const messages = await RoomMessage.findAll({
      where: { roomId },
      include: [
        { model: User, attributes: ['id', 'name'] },
        {
          model: RoomMessage,
          as: 'replyToMessage',
          include: [{ model: User, attributes: ['id', 'name'] }],
        },
      ],
      order: [['createdAt', 'ASC'], ['id', 'ASC']],
      offset: startIndex,
      limit: windowSize,
    });

    const indexInWindow = messages.findIndex((m) => Number(m.id) === messageId);
    if (indexInWindow < 0) {
      console.log('[PinnedAnchor][room] desync', { roomId, messageId, startIndex, windowSize, totalMessages, indexInAll });
      return res.status(409).json({ error: 'Anchor window desync' });
    }
    console.log('[PinnedAnchor][room] success', { roomId, messageId, startIndex, indexInWindow, windowSize, totalMessages, indexInAll });

    return res.json({
      messages,
      indexInWindow,
      startIndex,
      windowSize,
      totalMessages,
      indexInAll,
      indexFromNewest,
    });
  } catch (err) {
    console.error('anchorMessageWindow error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function listPinnedArchive(req, res) {
  try {
    const currentUserId = Number(req.user?.id || 0);
    if (!Number.isFinite(currentUserId) || currentUserId <= 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const now = new Date();
    await RoomPinnedArchive.destroy({
      where: {
        archivedUntil: { [Op.lt]: now },
      },
    });

    const archived = await RoomPinnedArchive.findAll({
      where: {
        userId: currentUserId,
        archivedUntil: { [Op.gte]: now },
      },
      include: [
        { model: RoomMessage, as: 'message' },
        { model: Room, as: 'room', attributes: ['id', 'name', 'type'] },
        { model: User, as: 'user', attributes: ['id', 'name'] },
      ],
      order: [['unpinnedAt', 'DESC'], ['id', 'DESC']],
    });

    return res.json({ archived: (archived || []).map(decryptPinnedArchivePayload) });
  } catch (err) {
    console.error('list pinned archive error', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function deletePinnedArchiveItem(req, res) {
  try {
    const archiveId = Number(req.params.archiveId);
    const currentUserId = Number(req.user?.id || 0);
    if (!Number.isFinite(archiveId) || archiveId <= 0) {
      return res.status(400).json({ error: 'Invalid archiveId' });
    }
    if (!Number.isFinite(currentUserId) || currentUserId <= 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const row = await RoomPinnedArchive.findOne({
      where: { id: archiveId, userId: currentUserId },
    });
    if (!row) return res.status(404).json({ error: 'Archive item not found' });

    await row.destroy();
    return res.json({ ok: true });
  } catch (err) {
    console.error('delete pinned archive error', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}

module.exports = {
    listRoomPinned,
    unpinRoomMess,
    pinRoomMess,
    positionMessage,
    anchorMessageWindow,
    listPinnedArchive,
    deletePinnedArchiveItem,
};

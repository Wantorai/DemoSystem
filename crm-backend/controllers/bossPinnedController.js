// controllers/bossPinnedController.js
const db = require('../models');
const BossPinnedMessage = db.sequelize.models.BossPinnedMessage;
const User        = db.sequelize.models.User;
const BossMessage = db.sequelize.models.BossMessage;
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

function emitBossPinned(io, chatId, event, payload) {
  if (!io) return;
  // main room used by joinBossChat in server.js
  io.to(`chat-${chatId}`).emit(event, payload);
  // backward compatibility for legacy listeners
  io.to(`boss_chat-${chatId}`).emit(event, payload);
}


async function pinBossMess(req, res) {
  const io = getIO();
  const t = await db.sequelize.transaction();
  try {
    const chatId = parseInt(req.params.chatId, 10);
    const { messageId, expiresAt, orderIndex } = req.body;
    const pinnedByUserId = req.user.id;

    // проверяем, что сообщение принадлежит чату
    const message = await BossMessage.findOne({ where: { id: messageId, chatId }, transaction: t });
    if (!message) {
      await t.rollback();
      return res.status(404).json({ error: 'Message not found in chat' });
    }

    // Если уже есть пин для этой пары — вернём его (избегаем дубликата)
    const existing = await BossPinnedMessage.findOne({ where: { chatId, messageId }, transaction: t });
    if (existing) {
      // загрузим полноту если нужно
      const existingFull = await BossPinnedMessage.findOne({
        where: { id: existing.id },
        include: [
          { model: BossMessage, as: 'message' },
          { model: User, as: 'pinnedBy', attributes: ['id','name'] },
        ],
        transaction: t,
      });
      await t.commit();
      // emit: всё ещё полезно оповестить (опционально)
      emitBossPinned(io, chatId, 'boss:message_pinned', { chatId, pinned: existingFull });
      return res.json({ pinned: decryptPinnedPayload(existingFull) });
    }

    // Ограничение кол-ва закрепов
    const MAX_PINNED = 50;
    const count = await BossPinnedMessage.count({ where: { chatId }, transaction: t });
    if (count >= MAX_PINNED) {
      const oldest = await BossPinnedMessage.findOne({ where: { chatId }, order: [['pinnedAt', 'ASC']], transaction: t });
      if (oldest) await oldest.destroy({ transaction: t });
    }

    // Создаём новый пин
    let pinned;
    try {
      pinned = await BossPinnedMessage.create({
        chatId,
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
        const conflict = await BossPinnedMessage.findOne({ where: { chatId, messageId }, transaction: t });
        const conflictFull = await BossPinnedMessage.findOne({
          where: { id: conflict.id },
          include: [
            { model: BossMessage, as: 'message' },
            { model: User, as: 'pinnedBy', attributes: ['id','name'] },
          ],
          transaction: t,
        });
        await t.commit();
        emitBossPinned(io, chatId, 'boss:message_pinned', { chatId, pinned: conflictFull });
        return res.json({ pinned: decryptPinnedPayload(conflictFull) });
      }
      throw err; // пробросим дальше
    }

    // Получаем полноту данных
    const pinnedFull = await BossPinnedMessage.findOne({
      where: { id: pinned.id },
      include: [
        { model: BossMessage, as: 'message' },
        { model: User, as: 'pinnedBy', attributes: ['id','name'] },
      ],
      transaction: t,
    });

    await t.commit();

    // emit socket уже после коммита
    emitBossPinned(io, chatId, 'boss:message_pinned', { chatId, pinned: pinnedFull });

    return res.json({ pinned: decryptPinnedPayload(pinnedFull) });
  } catch (err) {
    // safety rollback
    try { await t.rollback(); } catch (e) {}
    console.error('pin error', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}



async function unpinBossMess(req, res) {
    const io = getIO();
    try {
        const chatId = parseInt(req.params.chatId, 10);
        const { pinnedId, messageId } = req.body;

        // if (!await hasPinRights(req.user, chatId)) {
        //     return res.status(403).json({ error: 'No permission to unpin in this chat' });
        // }

        const where = { chatId };
        if (pinnedId) where.id = pinnedId;
        if (messageId) where.messageId = messageId;

        const pinned = await BossPinnedMessage.findOne({ where });
        if (!pinned) return res.status(404).json({ error: 'Pinned not found' });

        await pinned.destroy();

        emitBossPinned(io, chatId, 'boss:message_unpinned', {
          chatId,
          messageId: pinned.messageId,
          pinnedId: pinned.id,
        });

        return res.json({ ok: true });
    } catch (err) {
        console.error('unpin error', err);
        return res.status(500).json({ error: 'Internal error' });
    }
}

async function listBossPinned(req, res) {
    try {
        const chatId = parseInt(req.params.chatId, 10);
        const pinned = await BossPinnedMessage.findAll({
        where: { chatId },
        include: [
            { model: BossMessage, as: 'message' },
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



// async function positionBossMessage(req, res) {

//       try {
//       const { chatId, messageId } = req.params;
//       const pageSize = Number(req.query.pageSize ?? 30);
  
//       // 1) Найдём сообщение (получаем createdAt)
//       const msg = await BossMessage.findOne({
//         where: { id: messageId, chatId },
//         attributes: ['createdAt'],
//         raw: true,
//       });
  
//       if (!msg) {
//         return res.status(404).json({ error: 'Message not found' });
//       }
  
//       const createdAt = msg.createdAt;
  
//       // 2) Считаем, сколько сообщений раньше него (ASC order)
//       // Если у вас есть индекс по (chatId, createdAt) -> COUNT будет быстрым
//       const countBefore = await BossMessage.count({
//         where: {
//           chatId,
//           createdAt: { [Op.lt]: createdAt },
//         },
//       });
  
//       const indexInAll = Number(countBefore); // zero-based
//       const page = Math.floor(indexInAll / pageSize);
//       const indexInPage = indexInAll % pageSize;
  
//       // 3) (Опционально) общее количество сообщений в комнате
//       const totalMessages = await BossMessage.count({ where: { chatId } });
  
//       return res.json({
//         indexInAll,
//         page,
//         indexInPage,
//         totalMessages,
//       });
//     } catch (err) {
//       console.error('position endpoint error', err);
//       return res.status(500).json({ error: 'Internal server error' });
//     }

// }


async function positionBossMessage(req, res) {
  try {
    const { chatId, messageId } = req.params;
    const pageSize = Number(req.query.pageSize ?? 30);

    // 1) Найдём сообщение (получаем createdAt)
    const msg = await BossMessage.findOne({
      where: { id: messageId, chatId },
      attributes: ['createdAt', 'id'],
      raw: true,
    });

    if (!msg) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const createdAt = msg.createdAt;

    // 2) Считаем, сколько сообщений раньше него (ASC order), учитывая tie-breaker по id
    const countBefore = await BossMessage.count({
      where: {
        chatId,
        [Op.or]: [
          { createdAt: { [Op.lt]: createdAt } },
          { createdAt: createdAt, id: { [Op.lt]: messageId } }
        ],
      },
    });

    const indexInAll = Number(countBefore); // zero-based, oldest -> newest

    // 3) Общее количество сообщений в комнате
    const totalMessages = await BossMessage.count({ where: { chatId } });

    // 4) Вычисляем view-index (newest -> oldest) и страницу относительно newest
    const indexFromNewest = Math.max(0, (totalMessages - 1) - indexInAll); // zero-based newest->oldest
    const pageFromNewest = Math.floor(indexFromNewest / pageSize);
    const indexInPageFromNewest = indexFromNewest % pageSize;

    // 5) Обычные page/index в логическом порядке (если нужно клиенту)
    const page = Math.floor(indexInAll / pageSize);
    const indexInPage = indexInAll % pageSize;

    // 6) Доп: id предыдущего и следующего сообщений (по хронологии)
    const prev = await BossMessage.findOne({
      where: {
        chatId,
        [Op.or]: [
          { createdAt: { [Op.lt]: createdAt } },
          { createdAt: createdAt, id: { [Op.lt]: messageId } }
        ],
      },
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      attributes: ['id'],
      raw: true,
    });

    const next = await BossMessage.findOne({
      where: {
        chatId,
        [Op.or]: [
          { createdAt: { [Op.gt]: createdAt } },
          { createdAt: createdAt, id: { [Op.gt]: messageId } }
        ],
      },
      order: [['createdAt', 'ASC'], ['id', 'ASC']],
      attributes: ['id'],
      raw: true,
    });

    return res.json({
      indexInAll,
      page,
      indexInPage,
      totalMessages,
      indexFromNewest,
      pageFromNewest,
      indexInPageFromNewest,
      prevMessageId: prev?.id ?? null,
      nextMessageId: next?.id ?? null,
    });
  } catch (err) {
    console.error('position endpoint error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}


module.exports = {
    listBossPinned,
    unpinBossMess,
    pinBossMess,
    positionBossMessage
};




// // // helper: проверка прав — owner или admin в чате или глобальный isAdmin
// async function hasPinRights(user, chatId) {
//   if (!user) return false;
//   if (user.isAdmin) return true; // по-прежнему можно оставить глобальных админов
//   const relation = await BossChatUsers.findOne({ where: { chatId, userId: user.id } });
//   return !!relation; // true если пользователь состоит в чате
// }

// async function pinBossMess(req, res) {
//     const io = getIO();
//     try {
//         const chatId = parseInt(req.params.chatId, 10);
//         const { messageId, expiresAt, orderIndex } = req.body;
//         const pinnedByUserId = req.user.id;

//         // if (!await hasPinRights(req.user, chatId)) {
//         //     return res.status(403).json({ error: 'No permission to pin in this chat' });
//         // }

//         // Проверка что сообщение принадлежит чату
//         const message = await BossMessage.findOne({ where: { id: messageId, chatId } });
//         if (!message) return res.status(404).json({ error: 'Message not found in chat' });

//         // Ограничение кол-ва закрепов (опционально)
//         const MAX_PINNED = 5;
//         const count = await BossPinnedMessage.count({ where: { chatId } });
//         if (count >= MAX_PINNED) {
//         // удалим самый старый пин (по pinnedAt) чтобы освободить место
//         const oldest = await BossPinnedMessage.findOne({ where: { chatId }, order: [['pinnedAt', 'ASC']] });
//         if (oldest) await oldest.destroy();
//         }

//         const pinned = await BossPinnedMessage.create({
//         chatId,
//         messageId,
//         pinnedByUserId,
//         pinnedAt: new Date(),
//         expiresAt: expiresAt || null,
//         orderIndex: orderIndex ?? null,
//         });

//         // Загрузим полноту данных с вложением сообщения и пользователя
//         const pinnedFull = await BossPinnedMessage.findOne({
//         where: { id: pinned.id },
//         include: [
//             { model: BossMessage, as: 'message' },
//             { model: User, as: 'pinnedBy', attributes: ['id','name'] },
//         ],
//         });

//         // emit socket
//         if (io) io.to(`boss_chat-${chatId}`).emit('boss:message_pinned', { chatId, pinned: pinnedFull });

//         return res.json({ pinned: pinnedFull });
//     } catch (err) {
//         console.error('pin error', err);
//         return res.status(500).json({ error: 'Internal error' });
//     }
// }

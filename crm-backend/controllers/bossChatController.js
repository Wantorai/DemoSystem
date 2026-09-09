const db = require('../models');
const BossChat     = db.sequelize.models.BossChat;
const User        = db.sequelize.models.User;
const BossChatUsers = db.sequelize.models.BossChatUsers;
const BossMessage = db.sequelize.models.BossMessage;
const { Op, QueryTypes }      = require('sequelize');

function normalizeRetentionDays(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

// POST /admin/boss/chats
async function createBossChat(req, res) {
  try {
    const { name, participants, mode, retentionDays } = req.body;
    if (!name || !Array.isArray(participants)) {
      return res.status(400).json({ message: 'Name & participants required' });
    }
    const normalizedRetentionDays = normalizeRetentionDays(retentionDays);
    const chat = await BossChat.create({
      name,
      mode: Boolean(mode),
      retentionDays: normalizedRetentionDays == null ? 360 : normalizedRetentionDays,
    });
    // связываем участников
    await chat.setUsers(participants);
    // отдать с полной инфо
    const full = await BossChat.findByPk(chat.id, {
      include: [{ model: User, attributes: ['id','name','roleId'] }]
    });
    res.status(201).json(full);
  } catch (err) {
    console.error('createBossChat error', err);
    res.status(500).json({ message: 'Server error' });
  }
}

// GET /admin/boss/chats для АДМИНКИ !
async function listBossChatsForAdmin(req, res) {
  try {
    // можно фильтровать по текущему юзеру: only those where he is participant
    const userId = req.user.id;
    const chats = await BossChat.findAll({
      include: [{ model: User, attributes: ['id','name','roleId'] }],
      order: [['createdAt','DESC']],
    });

    // (опционально) посчитать непрочитанные через BossChatUsers.lastReadMessageId
    const chatIds = chats.map(c => c.id);
    const reads = await BossChatUsers.findAll({
      where: {
        chatId: { [Op.in]: chatIds },
        userId
      }
    });
    const readsMap = {};
    reads.forEach(r => { readsMap[r.chatId] = r.lastReadAt || new Date(0); });

    for (const chat of chats) {
      const lastReadAt = readsMap[chat.id] || new Date(0);
      const unreadCount = await db.sequelize.models.BossMessage.count({
        where: { chatId: chat.id, createdAt: { [Op.gt]: new Date(lastReadAt) }}
      });
      chat.setDataValue('unreadCount', unreadCount);

      const lastMessage = await db.sequelize.models.BossMessage.findOne({
        where: { chatId: chat.id },
        include: [{ model: User, attributes: ['id','name'] }],
        order: [['createdAt','DESC']],
      });
      chat.setDataValue('lastMessage', lastMessage || null);
    }

    res.json(chats);
  } catch (err) {
    console.error('listBossChats error', err);
    res.status(500).json({ message: 'Server error' });
  }
}



// // GET /app/boss/chats для ПРИЛОЖЕНИЯ !
// async function listBossChatsForApp(req, res) {
//   try {
//     // можно фильтровать по текущему юзеру: only those where he is participant
//     const userId = req.user.id;
//     const chats = await BossChat.findAll({
//       include: [{ model: User, attributes: ['id','name','roleId'], where: { id: userId } }],
//       order: [['createdAt','DESC']],
//     });

//     // (опционально) посчитать непрочитанные через BossChatUsers.lastReadMessageId
//     const chatIds = chats.map(c => c.id);
//     const reads = await BossChatUsers.findAll({
//       where: {
//         chatId: { [Op.in]: chatIds },
//         userId
//       }
//     });
//     const readsMap = {};
//     reads.forEach(r => { readsMap[r.chatId] = r.lastReadAt || new Date(0); });

//     for (const chat of chats) {
//       const lastReadAt = readsMap[chat.id] || new Date(0);
//       const unreadCount = await BossMessage.count({
//         where: { chatId: chat.id, createdAt: { [Op.gt]: new Date(lastReadAt) } }
//       });
//       chat.setDataValue('unreadCount', unreadCount);

//       const lastMessage = await db.sequelize.models.BossMessage.findOne({
//         where: { chatId: chat.id },
//         include: [{ model: User, attributes: ['id','name'] }],
//         order: [['createdAt','DESC']],
//       });
//       chat.setDataValue('lastMessage', lastMessage || null);
//     }

//     res.json(chats);
//   } catch (err) {
//     console.error('listBossChats error', err);
//     res.status(500).json({ message: 'Server error' });
//   }
// }






// GET /app/boss/chats для ПРИЛОЖЕНИЯ ! ПЕредалан из за lastReadMessageId
async function listBossChatsForApp(req, res) {
  try {
    // можно фильтровать по текущему юзеру: only those where he is participant
    const userId = req.user.id;
    // const chats = await BossChat.findAll({
    //   include: [{ model: User, attributes: ['id','name','roleId'], where: { id: userId } }],
    //   order: [['createdAt','DESC']],
    // });

    // // (опционально) посчитать непрочитанные через BossChatUsers.lastReadMessageId
    // for (const chat of chats) {
    //   const read = await BossChatUsers.findOne({
    //     where: { chatId: chat.id, userId }
    //   });

    //   const lastReadMessageId = Number(read?.lastReadMessageId) || 0;

    //   console.log(
    //     '[unreadCount]',
    //     'chatId=', chat.id,
    //     'lastReadMessageId=', lastReadMessageId
    //   );

    //   const unreadCount = await BossMessage.count({
    //     where: {
    //       chatId: chat.id,
    //       id: { [Op.gt]: lastReadMessageId }
    //     }
    //   });

    //   chat.setDataValue('unreadCount', unreadCount);

    //   const lastMessage = await BossMessage.findOne({
    //     where: { chatId: chat.id },
    //     include: [{ model: User, attributes: ['id', 'name'] }],
    //     order: [['createdAt', 'DESC']],
    //   });

    //   chat.setDataValue('lastMessage', lastMessage || null);
    // }




    const chats = await BossChat.findAll({
      include: [{ model: User, attributes: ['id','name','roleId'], where: { id: userId } }],
      order: [['createdAt','DESC']],
    });

    //console.log('chats  = ', chats.length)

    // Получаем lastReadMessageId для всех комнат пользователя
    const chatIds = chats.map(r => r.id);

    //console.log('chatIds = ', chatIds)
    if (chatIds.length > 0) {
      const maxRows = await db.sequelize.query(
        `SELECT "chatId", MAX(id) AS "maxMessageId"
         FROM boss_messages
         WHERE "chatId" IN (:chatIds)
         GROUP BY "chatId"`,
        {
          replacements: { chatIds },
          type: QueryTypes.SELECT,
        }
      );
      const maxIdMap = {};
      maxRows.forEach((row) => {
        maxIdMap[Number(row.chatId)] = Number(row.maxMessageId || 0);
      });

      const unreadRows = await db.sequelize.query(
        `SELECT bm."chatId", COUNT(*)::int AS "unreadCount"
         FROM boss_messages bm
         LEFT JOIN boss_chat_users bcu
           ON bcu."chatId" = bm."chatId" AND bcu."userId" = :userId
         WHERE bm."chatId" IN (:chatIds)
           AND bm."userId" <> :userId
           AND bm.id > COALESCE(bcu."lastReadMessageId", 0)
         GROUP BY bm."chatId"`,
        {
          replacements: { chatIds, userId },
          type: QueryTypes.SELECT,
        }
      );
      const unreadMap = {};
      unreadRows.forEach((row) => {
        unreadMap[Number(row.chatId)] = Number(row.unreadCount || 0);
      });

      const lastMessageIds = Object.values(maxIdMap).filter((id) => Number(id) > 0);
      const lastMessages = lastMessageIds.length > 0
        ? await BossMessage.findAll({
            where: { id: { [Op.in]: lastMessageIds } },
            include: [{ model: User, attributes: ['id', 'name'] }],
          })
        : [];
      const lastMessageMap = {};
      lastMessages.forEach((message) => {
        lastMessageMap[Number(message.chatId)] = message;
      });

      for (const chat of chats) {
        const chatId = Number(chat.id);
        chat.setDataValue('unreadCount', unreadMap[chatId] || 0);
        chat.setDataValue('lastMessage', lastMessageMap[chatId] || null);
      }
    }

    res.json(chats);
  } catch (err) {
    console.error('listBossChats error', err);
    res.status(500).json({ message: 'Server error' });
  }
}



// --- Helper: нормализация lastMessage для фронта ---
function normalizeLastMessage(messageRow) {
  if (!messageRow) return { text: '', raw: null, author: null, time: null };

  const m = messageRow.toJSON();
  const text = m.content ?? m.transcriptionText ?? m.text ?? m.body ?? '';
  const fileName = m.fileName ?? null;
  const display = text || fileName || (m.type ? `[${m.type}]` : (m.mediaUrl ? '[Вложение]' : ''));
  const author = m.User?.name ?? null;
  const time = m.createdAt ?? m.updatedAt ?? null;

  return { text: display, raw: m, author, time };
}



const listBossChatsForWeb = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // Все чаты пользователя + lastReadMessageId
    const bossUserRows = await BossChatUsers.findAll({
      where: { userId },
      attributes: ['chatId','lastReadMessageId']
    });

    const chatIds = bossUserRows.map(r => r.chatId);
    if (!chatIds.length) return res.json([]);

    // Получаем сами чаты
    const chats = await BossChat.findAll({
      where: { id: { [Op.in]: chatIds } },
      order: [['updatedAt','DESC']],
    });

    const lastReadMap = {};
    bossUserRows.forEach(r => { lastReadMap[r.chatId] = r.lastReadMessageId ?? 0; });

    const out = await Promise.all(chats.map(async (c) => {
      const chatId = c.id;
      const maxMessageId = Number(
        await BossMessage.max('id', { where: { chatId } })
      ) || 0;
      const rawLastReadId = Number(lastReadMap[chatId] ?? 0);
      const lastReadId = Math.max(0, Math.min(rawLastReadId, maxMessageId));

      // Последнее сообщение в чате
      const lastMessage = await BossMessage.findOne({
        where: { chatId },
        include: [{ model: User, attributes: ['id','name'] }],
        order: [['id','DESC']],
        limit: 1
      });

      // Непрочитанные
      const unread = await BossMessage.count({
        where: {
          chatId,
          id: { [Op.gt]: lastReadId },
          userId: { [Op.ne]: userId },
        }
      });

      const last = normalizeLastMessage(lastMessage);
      let lastMessageStatus = null;
      if (lastMessage && Number(lastMessage.userId) === Number(userId)) {
        const otherMemberships = await BossChatUsers.findAll({
          where: { chatId, userId: { [Op.ne]: userId } },
          attributes: ['userId', 'lastReadMessageId'],
        });
        lastMessageStatus = otherMemberships.length === 0
          ? 'read'
          : otherMemberships.every((membership) => Number(membership.lastReadMessageId || 0) >= Number(lastMessage.id))
            ? 'read'
            : 'sent';
      }

      return {
        kind: 'boss',
        rawId: `boss-${chatId}`,
        id: `boss-${chatId}`,
        title: c.name ?? `Чат ${chatId}`,
        lastMessage: last.text,
        lastMessageRaw: last.raw,
        lastMessageAuthor: last.author,
        lastMessageTime: last.time,
        lastMessageStatus,
        updatedAt: c.updatedAt,
        unread,
        lastReadMessageId: lastReadId
      };
    }));

    const mergedSorted = out.sort((a,b) => {
      const ta = a.lastMessageTime ?? a.updatedAt ?? 0;
      const tb = b.lastMessageTime ?? b.updatedAt ?? 0;
      return (tb ? Date.parse(tb) : 0) - (ta ? Date.parse(ta) : 0);
    });

    res.json(mergedSorted);

  } catch (err) {
    console.error('listBossChatsForWeb error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};


// GET /admin/boss/chats/:id
async function getBossChat(req, res) {
  try {
    const chat = await BossChat.findByPk(req.params.id, {
      include: [{ model: User, attributes: ['id','name','roleId'] }]
    });
    if (!chat) return res.status(404).json({ message: 'Not found' });
    res.json(chat);
  } catch (err) {
    console.error('getBossChat error', err);
    res.status(500).json({ message: 'Server error' });
  }
}

// PUT /admin/boss/chats/:id
async function updateBossChat(req, res) {
  try {
    const { name, participants, mode, retentionDays } = req.body;
    const chat = await BossChat.findByPk(req.params.id);
    if (!chat) return res.status(404).json({ message: 'Not found' });

    if (name !== undefined) chat.name = name;
    if (mode !== undefined) chat.mode = Boolean(mode);
    if (retentionDays !== undefined) {
      const normalizedRetentionDays = normalizeRetentionDays(retentionDays);
      chat.retentionDays = normalizedRetentionDays == null ? chat.retentionDays : normalizedRetentionDays;
    }
    await chat.save();
    if (Array.isArray(participants)) {
      await chat.setUsers(participants);
    }

    const full = await BossChat.findByPk(chat.id, {
      include: [{ model: User, attributes: ['id','name','roleId'] }]
    });
    res.json(full);
  } catch (err) {
    console.error('updateBossChat error', err);
    res.status(500).json({ message: 'Server error' });
  }
}

// DELETE /admin/boss/chats/:id
async function deleteBossChat(req, res) {
  try {
    const chat = await BossChat.findByPk(req.params.id);
    if (!chat) return res.status(404).json({ message: 'Not found' });
    await chat.destroy();
    res.status(204).end();
  } catch (err) {
    console.error('deleteBossChat error', err);
    res.status(500).json({ message: 'Server error' });
  }
}



// Получить участников чата
// GET /admin/boss/chats/:id/users
const getBossChatUsers = async (req, res) => {
  try {
    const chat = await BossChat.findByPk(req.params.id, {
      include: [{ model: User, attributes: ['id','name'], through: { attributes: [] } }]
    });
    if (!chat) return res.status(404).json({ message: 'Not found' });
    return res.json(chat.Users || []);
  } catch (err) {
    console.error('getBossChatUsers error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}




module.exports = {
  createBossChat,
  listBossChatsForAdmin,
  listBossChatsForApp,
  getBossChat,
  updateBossChat,
  deleteBossChat,
  getBossChatUsers,
  listBossChatsForWeb
};


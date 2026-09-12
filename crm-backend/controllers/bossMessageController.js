const boundHistoryPayload = require('../services/boundHistoryPayload');
const db = require('../models');
const BossMessage  = db.sequelize.models.BossMessage;
const BossChat = db.sequelize.models.BossChat;
const User         = db.sequelize.models.User;
const BossChatUsers = db.sequelize.models.BossChatUsers;
const BossMessageReaction = db.sequelize.models.BossMessageReaction;
const PushToken    = db.sequelize.models.PushToken;
const { sendPushNotification } = require('../services/sendPushNotification');
const { Op, fn, col, literal } = require('sequelize');
const getIO = require("../socket").getIO;
const CHAT_TRACE_LOGS = String(process.env.CHAT_TRACE_LOGS || '').toLowerCase() === 'true';
const chatTraceLog = (...args) => {
  if (CHAT_TRACE_LOGS) console.log(...args);
};
function normalizeEmoji(input) {
  const emoji = String(input || '').trim();
  if (!emoji) return '';
  return Array.from(emoji).slice(0, 8).join('');
}

function buildReactionSummary(rows, currentUserId) {
  const grouped = new Map();
  const me = Number(currentUserId) || 0;

  for (const row of rows || []) {
    const plain = typeof row?.get === 'function' ? row.get({ plain: true }) : row;
    const emoji = String(plain?.emoji || '').trim();
    const uid = Number(plain?.userId) || 0;
    if (!emoji || !uid) continue;

    if (!grouped.has(emoji)) {
      grouped.set(emoji, { emoji, count: 0, reactedByMe: false, users: [] });
    }
    const entry = grouped.get(emoji);
    entry.count += 1;
    if (uid === me) entry.reactedByMe = true;
    if (plain?.user?.id) {
      entry.users.push({ id: Number(plain.user.id), name: String(plain.user.name || '') });
    }
  }

  return Array.from(grouped.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.emoji.localeCompare(b.emoji);
  });
}

async function attachBossReactions(messages, currentUserId) {
  const list = Array.isArray(messages) ? messages : [];
  if (list.length === 0) return [];

  const messageIds = Array.from(
    new Set(
      list
        .map((m) => Number((typeof m?.get === 'function' ? m.get({ plain: true }) : m)?.id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );

  if (!messageIds.length) {
    return list.map((m) => {
      const plain = typeof m?.get === 'function' ? m.get({ plain: true }) : { ...m };
      return { ...plain, reactions: [] };
    });
  }

  const reactionRows = await BossMessageReaction.findAll({
    where: { messageId: { [Op.in]: messageIds } },
    include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
    order: [['createdAt', 'ASC']],
  });

  const byMessageId = new Map();
  for (const row of reactionRows) {
    const plain = typeof row?.get === 'function' ? row.get({ plain: true }) : row;
    const messageId = Number(plain?.messageId) || 0;
    if (!messageId) continue;
    if (!byMessageId.has(messageId)) byMessageId.set(messageId, []);
    byMessageId.get(messageId).push(plain);
  }

  return list.map((m) => {
    const plain = typeof m?.get === 'function' ? m.get({ plain: true }) : { ...m };
    const reactions = buildReactionSummary(byMessageId.get(Number(plain.id)) || [], currentUserId);
    return { ...plain, reactions };
  });
}




// Вариант getMessages с beforeId/offset support
// GET /admin/boss/chats/:chatId/messages
async function getBossMessages(req, res) {
  //console.log('вызван getBossMessages')
  try {
    const chatId = req.params.chatId;
    const currentUserId = Number(req.user?.id) || 0;
    const { query, limit = 90, offset = 0, beforeId, afterId } = req.query;

    const whereClause = { chatId };
    const requestedUserId = Number(req.query?.userId);
    if (Number.isFinite(requestedUserId) && requestedUserId > 0) {
      whereClause.userId = requestedUserId;
    }
    const andClauses = [];
    const chat = await BossChat.findByPk(chatId, { attributes: ['id', 'retentionDays'] });
    const retentionDays = Number(chat?.retentionDays);
    if (Number.isFinite(retentionDays) && retentionDays > 0) {
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      andClauses.push({ createdAt: { [Op.gte]: cutoff } });
    }


    if (String(req.query.recovery) === '1') {
      try {
        const scope = { ...whereClause, ...(andClauses.length ? { [Op.and]: andClauses } : {}) };
        return res.json(await require('../services/chatRecoveryPage')({
          query: req.query, model: BossMessage, where: scope,
          include: [
            { model: User, attributes: ['id', 'name', 'avatar'] },
            { model: BossMessage, as: 'replyToMessage', include: [{ model: User, attributes: ['id', 'name', 'avatar'] }] },
          ],
          decorate: rows => attachBossReactions(rows, currentUserId),
          readState: async (_ids, ceiling) => {
            const others = await BossChatUsers.findAll({ where: { chatId, userId: { [Op.ne]: currentUserId } }, attributes: ['userId', 'lastReadMessageId'] });
            return { otherUserReadMap: Object.fromEntries(others.map(row => [row.userId, Math.max(0, Math.min(ceiling, Number(row.lastReadMessageId) || 0))])) };
          },
        }));
      } catch (error) {
        if (error.status === 400) return res.status(400).json({ message: error.message });
        throw error;
      }
    }

    if (query) {
      whereClause[Op.or] = [
        { content: { [Op.iLike]: `%${query}%` } },
        { transcriptionText: { [Op.iLike]: `%${query}%` } },
      ];
    }


    // Cursor: если beforeId передан — выбираем сообщения старше (createdAt < pivot.createdAt)
    if (beforeId) {
      // сначала найдём pivot message чтобы получить его createdAt (без него сравнение по id тоже можно, но менее точно)
      const pivot = await BossMessage.findOne({ where: { id: beforeId, chatId } });
      if (pivot) {
        // Keep PostgreSQL timestamp precision; JavaScript Date truncates microseconds.
        const pivotTime = literal(`(SELECT "createdAt" FROM boss_messages WHERE id = ${Number(pivot.id)})`);
        andClauses.push({ [Op.or]: [
          { createdAt: { [Op.lt]: pivotTime } },
          { createdAt: { [Op.eq]: pivotTime }, id: { [Op.lt]: pivot.id } },
        ] });
      } else {
        // если pivot не найден — вернём пустой массив
        return res.json([]);
      }
    }

    // Optionally support afterId (получить более новые сообщения)
    if (afterId) {
      const pivot = await BossMessage.findOne({ where: { id: afterId, chatId } });
      if (pivot) {
        const pivotTime = literal(`(SELECT "createdAt" FROM boss_messages WHERE id = ${Number(pivot.id)})`);
        andClauses.push({ [Op.or]: [
          { createdAt: { [Op.gt]: pivotTime } },
          { createdAt: { [Op.eq]: pivotTime }, id: { [Op.gt]: pivot.id } },
        ] });
      }
    }
    if (andClauses.length > 0) whereClause[Op.and] = andClauses;


    let order = [['createdAt', 'DESC'], ['id', 'DESC']];
    if (beforeId) {
      order = [['createdAt', 'DESC'], ['id', 'DESC']];
    } else if (afterId) {
      order = [['createdAt', 'ASC'], ['id', 'ASC']];
    }

    const messages = await BossMessage.findAll({
      where: whereClause,
      include: [
        { model: User, attributes: ['id', 'name', 'avatar'] },
        {
          model: BossMessage,
          as: 'replyToMessage',
          include: [{ model: User, attributes: ['id', 'name', 'avatar'] }],
        },
      ],
      order,
      limit: parseInt(limit),
      offset: beforeId || afterId ? 0 : parseInt(offset),
    });

    if (!afterId) {
      messages.reverse();
    }
    const messagesWithReactions = await attachBossReactions(messages, currentUserId);

    // backward-compatible:
    // - default: old clients get array as before
    // - ?meta=1: mobile boss chat gets read-status watermarks similar to room chat API
    if (String(req.query?.meta || '') !== '1') {
      return res.json(messagesWithReactions);
    }

    let otherUserLastReadId = null;
    let minOtherUserLastReadId = null;
    let maxOtherUserLastReadId = null;
    const otherUserReadMap = {};

    if (currentUserId) {
      const maxChatMessageId =
        Number(await BossMessage.max('id', { where: { chatId } })) || 0;

      const otherRows = await BossChatUsers.findAll({
        where: {
          chatId,
          userId: { [Op.ne]: currentUserId },
        },
        attributes: ['userId', 'lastReadMessageId'],
      });

      for (const row of otherRows) {
        const uid = Number(row.userId) || 0;
        if (!uid) continue;
        const rawRead = Number(row.lastReadMessageId) || 0;
        const safeRead = Math.max(0, Math.min(rawRead, maxChatMessageId));
        otherUserReadMap[uid] = safeRead;
      }

      const readValues = Object.values(otherUserReadMap)
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v));

      if (readValues.length === 1) {
        otherUserLastReadId = readValues[0];
        minOtherUserLastReadId = readValues[0] > 0 ? readValues[0] : null;
        maxOtherUserLastReadId = readValues[0] > 0 ? readValues[0] : null;
      } else if (readValues.length > 1) {
        const minRead = Math.min(...readValues);
        const maxRead = Math.max(...readValues);
        minOtherUserLastReadId = minRead > 0 ? minRead : null;
        maxOtherUserLastReadId = maxRead > 0 ? maxRead : null;
      }
    }

    return res.json(boundHistoryPayload({
      messages: messagesWithReactions,
      otherUserLastReadId,
      minOtherUserLastReadId,
      maxOtherUserLastReadId,
      otherUserReadMap,
    }, req.query));
  } catch (err) {
    console.error('getBossMessages error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}


// GET /web/boss/chats/:chatId/messages  для веб чата
async function getBossMessagesWeb(req, res) {
  try {
    const chatId = req.params.chatId;
    const currentUserId = Number(req.user?.id) || 0;
    const { query, limit = 90, offset = 0, beforeId, afterId } = req.query;

    const whereClause = { chatId };
    const requestedUserId = Number(req.query?.userId);
    if (Number.isFinite(requestedUserId) && requestedUserId > 0) {
      whereClause.userId = requestedUserId;
    }
    const andClauses = [];
    const chat = await BossChat.findByPk(chatId, { attributes: ['id', 'retentionDays'] });
    const retentionDays = Number(chat?.retentionDays);
    if (Number.isFinite(retentionDays) && retentionDays > 0) {
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      andClauses.push({ createdAt: { [Op.gte]: cutoff } });
    }

    if (query) {
      whereClause[Op.or] = [
        { content: { [Op.iLike]: `%${query}%` } },
        { transcriptionText: { [Op.iLike]: `%${query}%` } },
      ];
    }


    // Cursor: если beforeId передан — выбираем сообщения старше (createdAt < pivot.createdAt)
    if (beforeId) {
      // сначала найдём pivot message чтобы получить его createdAt (без него сравнение по id тоже можно, но менее точно)
      const pivot = await BossMessage.findByPk(beforeId);
      if (pivot) {
        andClauses.push({ createdAt: { [Op.lt]: pivot.createdAt } });
      } else {
        // если pivot не найден — вернём пустой массив
        return res.json([]);
      }
    }

    // Optionally support afterId (получить более новые сообщения)
    if (afterId) {
      const pivot = await BossMessage.findByPk(afterId);
      if (pivot) {
        andClauses.push({ createdAt: { [Op.gt]: pivot.createdAt } });
      }
    }
    if (andClauses.length > 0) whereClause[Op.and] = andClauses;


    let order = [['createdAt', 'DESC']];
    if (beforeId) {
      order = [['createdAt', 'DESC']];
    } else if (afterId) {
      order = [['createdAt', 'ASC']];
    }

    const messages = await BossMessage.findAll({
      where: whereClause,
      include: [
        { model: User, attributes: ['id', 'name', 'avatar'] },
        {
          model: BossMessage,
          as: 'replyToMessage',
          include: [{ model: User, attributes: ['id', 'name', 'avatar'] }],
        },
      ],
      order,
      limit: parseInt(limit),
      offset: beforeId || afterId ? 0 : parseInt(offset),
    });
    if (!afterId) {
      messages.reverse();
    }
    const messagesWithReactions = await attachBossReactions(messages, currentUserId);

    res.json(messagesWithReactions);
  } catch (err) {
    console.error('getBossMessages error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}



// POST /admin/boss/chats/:chatId/messages
async function createBossMessage(req, res) {
  try {
    const traceId = `bm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const trace = (stage, extra = {}) => {
      try {
        chatTraceLog('[ChatTrace][boss:createMessage]', { traceId, stage, ...extra });
      } catch {}
    };
    const chatId = req.params.chatId;
    const userId = req.user.id;
    const { content, clientId, socketId, socketIds, deliveryStatus } = req.body;
    trace('incoming', {
      chatId: Number(chatId) || chatId,
      userId: Number(userId) || null,
      clientId: clientId ?? null,
      socketId: socketId ?? null,
      socketIdsCount: Array.isArray(socketIds) ? socketIds.length : 0,
      deliveryStatus: deliveryStatus ?? null,
      contentLen: typeof content === 'string' ? content.length : null,
    });
    const replyToMessage = req.params.replyToMessage ?? null;
    const replyToMessageId = req.body?.replyToMessageId ? Number(req.body.replyToMessageId) : null;

    if (clientId) {
      const exists = await BossMessage.findOne({ where: { clientId } });
      if (exists) return res.json(exists);
    }

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!content || !content.trim()) return res.status(400).json({ message: 'Content required' });

    const now = new Date();
    let message;
    try {
      message = await BossMessage.create({ chatId, userId, content, createdAt: now, updatedAt: now, replyToMessage, replyToMessageId, clientId, deliveryStatus });
    } catch (createErr) {
      if (clientId && createErr?.name === 'SequelizeUniqueConstraintError') {
        const existing = await BossMessage.findOne({ where: { clientId } });
        if (existing) {
          trace('idempotent:race-reuse-existing', {
            chatId: Number(chatId) || chatId,
            existingMessageId: existing.id,
            clientId,
          });
          chatTraceLog(`[createBossMessage][idempotent-race] reused existing message by clientId=${clientId}`);
          return res.json(existing);
        }
      }
      throw createErr;
    }

    // полная запись
    const full = await BossMessage.findByPk(message.id, {
      include: [
        { model: User, attributes: ['id','name', 'avatar'] },
        {
          model: BossMessage,
          as: 'replyToMessage',
          include: [{ model: User, attributes: ['id', 'name', 'avatar'] }]
        }
      ],
    });
    const [fullWithReactions] = await attachBossReactions([full], userId);
    trace('message:created', {
      chatId: Number(fullWithReactions?.chatId) || Number(chatId) || chatId,
      messageId: fullWithReactions?.id ?? null,
      clientId: fullWithReactions?.clientId ?? clientId ?? null,
      userId: fullWithReactions?.userId ?? (Number(userId) || null),
    });


    
    // Эмитим о сообщении с сайта
    try {
      // savedMessage — объект, который только что положили в БД
      const kind = 'chat'
      const chatIdCheck = full.chatId
      const roomName = `${kind}-${chatIdCheck}`;

      const io = getIO();
      // Emit: в комнату 

      if (Array.isArray(socketIds) && socketIds.length) {
        io.to(roomName).except(socketIds).emit('newBossChatMessage', fullWithReactions);
      } else if (socketId) {
        io.to(roomName).except(socketId).emit('newBossChatMessage', fullWithReactions);
      } else {
        io.to(roomName).emit('newBossChatMessage', fullWithReactions);
      }
      trace('emit:newBossChatMessage', {
        roomName,
        messageId: fullWithReactions?.id ?? null,
        chatId: fullWithReactions?.chatId ?? (Number(chatId) || chatId),
        clientId: fullWithReactions?.clientId ?? clientId ?? null,
      });

      // io.to(roomName).emit('newBossChatMessage', fullWithReactions);
      // console.log('[createMessage] emitted newBossChatMessage to', roomName);
    }  catch (errSock) {
      console.error('Ошибка при отправке emit for boss:', errSock);
    }



    // после формирования `full` (полной записи) и recipients/tokens вычисления:
    try {

      const participants = await BossChatUsers.findAll({
        where: { chatId: message.chatId },
        include: [{ model: User, as: 'user' }]
      });

      const recipientUserIds = participants
        .map(p => p.user && p.user.id)
        .filter(id => id && id !== userId);

      // Зеркально room-контроллеру:
      // считаем "активных" в чате и при пустом inactive делаем fallback на всех получателей.
      let activeUserIds = [];
      try {
        const io = getIO();
        const roomName = `chat-${message.chatId}`;
        const socketsInRoom = await io.in(roomName).fetchSockets();
        activeUserIds = socketsInRoom.map(s => s.userId).filter(id => id);
      } catch (err) {
        console.error('Ошибка при получении активных сокетов boss-чата:', err);
      }

      const inactiveRecipientIds = recipientUserIds.filter(id => !activeUserIds.includes(id));
      const pushRecipientIds = inactiveRecipientIds.length > 0 ? inactiveRecipientIds : recipientUserIds;

      trace('push:candidates', {
        chatId: message.chatId,
        recipientCount: recipientUserIds.length,
        activeCount: activeUserIds.length,
        inactiveCount: inactiveRecipientIds.length,
        pushRecipientCount: pushRecipientIds.length,
        fallbackToAllRecipients: inactiveRecipientIds.length === 0 && recipientUserIds.length > 0,
        recipientUserIds,
        activeUserIds,
        inactiveRecipientIds,
        pushRecipientIds,
      });

      if (pushRecipientIds.length > 0) {
        const tokenRows = await PushToken.findAll({
          where: { userId: { [Op.in]: pushRecipientIds } },
          attributes: ['token'],
        });
        const tokens = Array.from(new Set(tokenRows.map(r => r.token).filter(Boolean)));

        trace('push:tokens:resolved', {
          chatId: message.chatId,
          inactiveCount: inactiveRecipientIds.length,
          pushRecipientCount: pushRecipientIds.length,
          tokenRowsCount: tokenRows.length,
          tokensCount: tokens.length,
        });

        const title = `От ${full.User?.name || 'Не опознан'}`;
        const body = (content && content.length > 0) ? (content.length > 100 ? content.slice(0,100)+'...' : content) : (message.fileName || 'НС:');

        trace('push:send:start', {
          chatId: message.chatId,
          pushRecipientCount: pushRecipientIds.length,
          tokensCount: tokens.length,
          title: title || null,
          hasBody: Boolean(body),
        });

        await sendPushNotification(pushRecipientIds, title, body, {
          type: 'messages',
          screen: 'admin',
          chatId,
          url: `mobileapp://bossChats/${encodeURIComponent(String(chatId))}`,
        });

        trace('push:send:done', {
          chatId: message.chatId,
          pushRecipientCount: pushRecipientIds.length,
          tokensCount: tokens.length,
        });
      } else {
        trace('push:skip:no-recipients', {
          chatId: message.chatId,
          recipientCount: recipientUserIds.length,
          activeCount: activeUserIds.length,
        });
      }
    } catch (errPush) {
      console.error('Ошибка при отправке push в createBossMessage:', errPush);
    }

    res.status(201).json(fullWithReactions);

  } catch (err) {
    console.error('createBossMessage error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}


// PUT /admin/boss/chats/:chatId/messages/:messageId
async function updateBossMessage(req, res) {
  try {
    const chatId = req.params.chatId;
    const messageId = Number(req.params.messageId);
    const userId = req.user?.id;
    const content = (req.body.content || '').trim();

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!content) return res.status(400).json({ message: 'Content required' });

    const msg = await BossMessage.findByPk(messageId);
    if (!msg || String(msg.chatId) !== String(chatId)) {
      return res.status(404).json({ message: 'Message not found' });
    }
    if (msg.userId !== userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    msg.content = content;
    msg.updatedAt = new Date();
    // если есть поле edited в модели — обновите его
    if (typeof msg.edited !== 'undefined') msg.edited = true;

    await msg.save();

    const full = await BossMessage.findByPk(msg.id, {
      include: [
        { model: User, attributes: ['id','name', 'avatar'] },
        { model: BossMessage, as: 'replyToMessage', include: [{ model: User, attributes: ['id','name', 'avatar'] }] }
      ]
    });

    // emit update
    try {
      const roomName = `chat-${full.chatId}`;
      const io = getIO();
      io.to(roomName).emit('updateBossChatMessage', full);
    } catch (errSock) {
      console.error('Socket emit error updateBossMessage:', errSock);
    }

    res.json(full);
  } catch (err) {
    console.error('updateBossMessage error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}

// GET /web/boss/chats/:chatId/folders
async function getBossMessageFolders(req, res) {
  try {
    const chatId = Number(req.params.chatId);
    if (!Number.isFinite(chatId) || chatId <= 0) {
      return res.status(400).json({ message: 'Invalid chat id' });
    }

    const chat = await BossChat.findByPk(chatId, {
      attributes: ['id', 'mode', 'retentionDays'],
    });
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    if (!chat.mode) return res.json([]);

    const where = { chatId };
    const retentionDays = Number(chat.retentionDays);
    if (Number.isFinite(retentionDays) && retentionDays > 0) {
      where.createdAt = {
        [Op.gte]: new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000),
      };
    }

    const rows = await BossMessage.findAll({
      where,
      attributes: [
        'userId',
        [fn('COUNT', col('id')), 'messageCount'],
        [fn('MAX', col('createdAt')), 'lastMessageAt'],
      ],
      group: ['userId'],
      order: [[fn('MAX', col('createdAt')), 'DESC']],
      raw: true,
    });

    const userIds = rows
      .map((item) => Number(item.userId))
      .filter((userId) => Number.isFinite(userId) && userId > 0);
    const users = userIds.length
      ? await User.findAll({
          where: { id: { [Op.in]: userIds } },
          attributes: ['id', 'name', 'avatar'],
          raw: true,
        })
      : [];
    const userNames = new Map(users.map((user) => [Number(user.id), user.name]));
    const timeZone = 'Asia/Vladivostok';
    const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const monthKeyFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
    });
    const dayLabelFormatter = new Intl.DateTimeFormat('ru-RU', {
      timeZone,
      day: 'numeric',
      month: 'long',
    });
    const monthLabelFormatter = new Intl.DateTimeFormat('ru-RU', {
      timeZone,
      month: 'long',
    });
    const performanceLabelFormatter = new Intl.DateTimeFormat('ru-RU', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const now = new Date();
    const currentDayKey = dayKeyFormatter.format(now);
    const currentMonthKey = monthKeyFormatter.format(now);
    const activitySince = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
    const activityRows = userIds.length
      ? await BossMessage.findAll({
          where: {
            chatId,
            userId: { [Op.in]: userIds },
            createdAt: { [Op.gte]: activitySince },
          },
          attributes: ['userId', 'createdAt'],
          raw: true,
        })
      : [];
    const activityByUser = new Map();

    for (const activity of activityRows) {
      const userId = Number(activity.userId);
      const createdAt = new Date(activity.createdAt);
      if (!Number.isFinite(userId) || Number.isNaN(createdAt.getTime())) continue;
      if (!activityByUser.has(userId)) activityByUser.set(userId, new Map());
      const dayKey = dayKeyFormatter.format(createdAt);
      const counts = activityByUser.get(userId);
      counts.set(dayKey, Number(counts.get(dayKey) || 0) + 1);
    }

    const performanceDates = Array.from({ length: 15 }, (_, index) => {
      const date = new Date(now.getTime() - index * 24 * 60 * 60 * 1000);
      return {
        key: dayKeyFormatter.format(date),
        label: performanceLabelFormatter.format(date),
      };
    });
    const previousWeekKeys = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now.getTime() - (index + 7) * 24 * 60 * 60 * 1000);
      return dayKeyFormatter.format(date);
    });

    return res.json(rows.map((item) => {
      const userId = Number(item.userId);
      const counts = activityByUser.get(userId) || new Map();
      const performanceRows = performanceDates.map((date) => ({
        ...date,
        count: Number(counts.get(date.key) || 0),
      }));
      const current7 = performanceRows
        .slice(0, 7)
        .reduce((sum, row) => sum + row.count, 0);
      const previous7 = previousWeekKeys
        .reduce((sum, key) => sum + Number(counts.get(key) || 0), 0);
      const monthCount = Array.from(counts.entries()).reduce(
        (sum, [key, count]) => sum + (key.startsWith(currentMonthKey) ? Number(count) : 0),
        0
      );
      return {
        userId,
        name: userNames.get(userId) || `Пользователь ${userId}`,
        messageCount: Number(item.messageCount) || 0,
        lastMessageAt: item.lastMessageAt || null,
        todayCount: Number(counts.get(currentDayKey) || 0),
        monthCount,
        dayLabel: dayLabelFormatter.format(now),
        monthLabel: monthLabelFormatter.format(now),
        performanceRows,
        current7,
        previous7,
        trendUp: current7 > previous7,
      };
    }));
  } catch (err) {
    console.error('getBossMessageFolders error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function toggleBossMessageReaction(req, res) {
  try {
    const chatId = Number(req.params.chatId);
    const messageId = Number(req.params.messageId);
    const userId = Number(req.user?.id);
    const emoji = normalizeEmoji(req.body?.emoji);

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!Number.isFinite(chatId) || !Number.isFinite(messageId)) {
      return res.status(400).json({ message: 'Invalid chatId/messageId' });
    }
    if (!emoji) return res.status(400).json({ message: 'Emoji is required' });

    const message = await BossMessage.findByPk(messageId);
    if (!message || Number(message.chatId) !== chatId) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const existing = await BossMessageReaction.findOne({
      where: { messageId, userId },
    });

    if (!existing) {
      await BossMessageReaction.create({ messageId, userId, emoji });
    } else if (existing.emoji === emoji) {
      await existing.destroy();
    } else {
      existing.emoji = emoji;
      await existing.save();
    }

    const full = await BossMessage.findByPk(messageId, {
      include: [
        { model: User, attributes: ['id', 'name', 'avatar'] },
        {
          model: BossMessage,
          as: 'replyToMessage',
          include: [{ model: User, attributes: ['id', 'name', 'avatar'] }],
        },
      ],
    });
    const [withReactions] = await attachBossReactions([full], userId);

    try {
      const io = getIO();
      io.to(`chat-${chatId}`).emit('messageReactionUpdated', withReactions);
    } catch (errSock) {
      console.error('Socket emit error toggleBossMessageReaction:', errSock);
    }

    return res.json({ ok: true, message: withReactions });
  } catch (err) {
    console.error('toggleBossMessageReaction error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}





module.exports = {
  getBossMessages,
  createBossMessage,
  getBossMessagesWeb,
  getBossMessageFolders,
  updateBossMessage,
  toggleBossMessageReaction,
};








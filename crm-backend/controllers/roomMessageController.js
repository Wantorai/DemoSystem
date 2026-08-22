const db = require('../models');
const RoomMessage = db.sequelize.models.RoomMessage;
const BossMessage = db.sequelize.models.BossMessage;
const User = db.sequelize.models.User;
const { sendPushNotification } = require('../services/sendPushNotification');
const RoomUsers = require('../models/RoomUsers'); // связь пользователей и комнат
const BossChatUsers = require('../models/BossChatUsers');
const { ensureRoomAllowsMessage } = require('../services/roomDeletionAccess');
const PushToken = require('../models/PushToken');
const { Op } = require('sequelize');
const getIO = require("../socket").getIO; 
const Room = db.sequelize.models.Room;
const { getOwnDomain, sendBridgePost } = require('../services/crossChatBridge');
const { ensureRoomChatNotArchived } = require('../services/crossChatArchiveAccess');
const { isMessageEncryptionEnabled } = require('../services/messageCrypto');
const { relayRoomMessageToExternalParticipants } = require('../services/roomExternalParticipants');
const MessageDelivery = db.sequelize.models.MessageDelivery;
const RoomMessageReaction = db.sequelize.models.RoomMessageReaction;
const UserSetting = db.sequelize.models.UserSetting;
const AUTO_REPLY_KEY = 'mobile_auto_reply';
const READ_DEBUG_LOGS = String(process.env.READ_DEBUG_LOGS || '').toLowerCase() === 'true';
const CHAT_TRACE_LOGS = String(process.env.CHAT_TRACE_LOGS || '').toLowerCase() === 'true';
const readDebugLog = (...args) => {
  if (READ_DEBUG_LOGS) console.log(...args);
};
const chatTraceLog = (...args) => {
  if (CHAT_TRACE_LOGS) console.log(...args);
};
function normalizeEmoji(input) {
  const emoji = String(input || '').trim();
  if (!emoji) return '';
  return Array.from(emoji).slice(0, 8).join('');
}

const MAX_SAFE_DB_MESSAGE_ID = 2147483647;
const ENCRYPTED_SEARCH_SCAN_LIMIT = Math.max(
  500,
  Math.min(20000, Number(process.env.ENCRYPTED_SEARCH_SCAN_LIMIT || 5000))
);

function toSafeDbMessageId(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const id = Math.trunc(n);
  if (id <= 0 || id > MAX_SAFE_DB_MESSAGE_ID) return null;
  return id;
}

function parseBridgePhone(rawPhone) {
  const value = String(rawPhone || '').trim();
  const m = /^xbridge:([^:]+):(.+)$/i.exec(value);
  if (!m) return null;
  return {
    domain: String(m[1] || '').trim().toLowerCase(),
    phone: String(m[2] || '').replace(/\D/g, ''),
  };
}

function toAbsoluteMediaUrl(url, domain) {
  const value = String(url || '').trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const normalizedDomain = String(domain || '').trim().toLowerCase();
  if (!normalizedDomain) return value;
  const prefixed = value.startsWith('/') ? value : `/${value}`;
  return `https://${normalizedDomain}${prefixed}`;
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

async function attachRoomReactions(messages, currentUserId) {
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

  const reactionRows = await RoomMessageReaction.findAll({
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



// Новый GET для учета работы с кэшем
// Вариант getMessages с beforeId/offset support
// const getMessages = async (req, res) => {
//   //console.log('вызван getMessages для rooms')
//   try {
//     const roomId = req.params.roomId;
//     const { query, limit = 90, offset = 0, beforeId, afterId } = req.query;

//     const where = { roomId };

//     if (query) {
//       where[Op.or] = [
//         { content: { [Op.iLike]: `%${query}%` } },
//         { transcriptionText: { [Op.iLike]: `%${query}%` } },
//       ];
//     }


//     // Cursor: если beforeId передан — выбираем сообщения старше (createdAt < pivot.createdAt)
//     if (beforeId) {
//       // сначала найдём pivot message чтобы получить его createdAt (без него сравнение по id тоже можно, но менее точно)
//       const pivot = await RoomMessage.findByPk(beforeId);
//       if (pivot) {
//         where.createdAt = { [Op.lt]: pivot.createdAt };
//       } else {
//         // если pivot не найден — вернём пустой массив
//         return res.json([]);
//       }
//     }

//     // Optionally support afterId (получить более новые сообщения)
//     if (afterId) {
//       const pivot = await RoomMessage.findByPk(afterId);
//       if (pivot) {
//         where.createdAt = { [Op.gt]: pivot.createdAt };
//       }
//     }

//     const messages = await RoomMessage.findAll({
//       where,
//       include: [
//         { model: User, attributes: ['id', 'name'] },
//         {
//           model: RoomMessage,
//           as: 'replyToMessage',
//           include: [{ model: User, attributes: ['id', 'name'] }],
//         },
//       ],
//       order: [['createdAt', 'ASC']], // рекомендую DESC: newest first
//       limit: parseInt(limit),
//       offset: beforeId || afterId ? 0 : parseInt(offset), // если cursor-driven — offset игнорируем
//     });

//     //console.log('[get mes rooms] messages length = ', messages.length)

//     res.json(messages);
//   } catch (err) {
//     console.error('getMessages error:', err);
//     res.status(500).json({ message: 'Server error' });
//   }
// };


// С добавлением данных о статусах прочтения
const getMessages = async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const currentUserId = req.user.id; // предполагаем, что аутентификация добавляет user
    const { query, limit = 90, offset = 0, beforeId, afterId } = req.query;
    const queryText = String(query || '').trim();

    // ---- 1. Получаем комнату с участниками ----
    const room = await Room.findByPk(roomId, {
      include: [
        {
          model: User,
          through: { attributes: [] },
          attributes: ['id', 'name', 'phone', 'avatar'],
        },
      ],
    });

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Удаливший personal-чат пользователь больше не может открыть его по старой ссылке.
    const membership = await RoomUsers.findOne({
      where: { roomId, userId: currentUserId, deletedAt: null },
      attributes: ['userId'],
    });
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // ---- 2. Условия выборки сообщений (как было) ----
    const where = { roomId };

    const beforeIdSafe = toSafeDbMessageId(beforeId);
    const afterIdSafe = toSafeDbMessageId(afterId);

    if (beforeIdSafe) {
      const pivot = await RoomMessage.findByPk(beforeIdSafe);
      if (pivot) {
        where.createdAt = { [Op.lt]: pivot.createdAt };
      } else {
        return res.json([]);
      }
    }

    if (afterIdSafe) {
      const pivot = await RoomMessage.findByPk(afterIdSafe);
      if (pivot) {
        where.createdAt = { [Op.gt]: pivot.createdAt };
      }
    }

    const encryptedSearchFallback = queryText && isMessageEncryptionEnabled();
    if (queryText && !encryptedSearchFallback) {
      where[Op.or] = [
        { content: { [Op.iLike]: `%${queryText}%` } },
        { transcriptionText: { [Op.iLike]: `%${queryText}%` } },
        { fileName: { [Op.iLike]: `%${queryText}%` } },
      ];
    }

    // ---- 3. Получаем сообщения ----
    // ВАЖНО:
    // - без cursor нужно отдавать ПОСЛЕДНИЕ limit сообщений, а не самые ранние
    // - формат ответа держим ASC (старые -> новые), как ожидает мобильный клиент
    let order = [['createdAt', 'DESC']];
    if (beforeId) {
      // старые сообщения (older page)
      order = [['createdAt', 'DESC']];
    } else if (afterId) {
      // более новые сообщения относительно pivot
      order = [['createdAt', 'ASC']];
    }
    const messages = encryptedSearchFallback
      ? await findMessagesByDecryptedQuery({
          roomId,
          query: queryText,
          limit: parseInt(limit),
          offset: beforeIdSafe || afterIdSafe ? 0 : parseInt(offset),
          createdAtFilter: where.createdAt,
          newestFirst: true,
        })
      : await RoomMessage.findAll({
          where,
          include: buildMessageIncludeForSearch(),
          order,
          limit: parseInt(limit),
          offset: beforeIdSafe || afterIdSafe ? 0 : parseInt(offset),
        });

    // Приводим к ASC:
    // - default (DESC newest window) => reverse
    // - beforeId (DESC older window) => reverse
    if (!afterIdSafe) {
      messages.reverse();
    }
    const messagesWithReactions = await attachRoomReactions(messages, currentUserId);



    // ---- 4. Для личного чата собираем данные о статусах ----
    let otherUserLastReadId = null;
    let deliveredMessageIds = [];

    if (room.type === 'personal') {
      const otherUser = room.Users.find(u => u.id !== currentUserId);
      if (otherUser) {
        const otherUserId = otherUser.id;

        // 4.1 Последнее прочитанное сообщение собеседником
        const roomUserOther = await RoomUsers.findOne({
          where: { roomId, userId: otherUserId },
          attributes: ['lastReadMessageId'],
        });
        if (roomUserOther) {
          const rawOtherRead = Number(roomUserOther.lastReadMessageId) || 0;
          // Санитизируем "битые" значения: lastRead не может быть больше максимального id сообщения комнаты.
          const maxRoomMessageId = Number(
            await RoomMessage.max('id', { where: { roomId } })
          ) || 0;
          otherUserLastReadId = Math.min(rawOtherRead, maxRoomMessageId);
        }

        // 4.2 ID сообщений текущего пользователя, доставленных собеседнику
        const deliveries = await MessageDelivery.findAll({
          where: { userId: otherUserId },
          include: [
            {
              model: RoomMessage,
              where: { roomId, userId: currentUserId },
              attributes: [],
              required: true,
            },
          ],
          attributes: ['messageId'],
        });
        deliveredMessageIds = deliveries.map(d => d.messageId);
      }
    }


    // ---- 5. Данные о статусах для группового чата ----
    let minOtherUserLastReadId = null;
    if (room.type === 'group') {
      const otherUserIds = room.Users.filter(u => u.id !== currentUserId).map(u => u.id);
      if (otherUserIds.length > 0) {
        const otherRoomUsers = await RoomUsers.findAll({
          where: {
            roomId,
            userId: { [Op.in]: otherUserIds }
          },
          attributes: ['lastReadMessageId']
        });
        const lastReadIds = otherRoomUsers.map(ru => Number(ru.lastReadMessageId) || 0);
        // Минимальный lastReadMessageId среди остальных – это ID сообщения, которое прочитали все
        minOtherUserLastReadId = Math.min(...lastReadIds);
        // Если все lastReadMessageId = 0, то min будет 0, но это означает, что никто ничего не читал
        if (minOtherUserLastReadId === 0) minOtherUserLastReadId = null;
      } else {
        // Если пользователь один в группе (редкий случай), считаем все свои сообщения прочитанными
        minOtherUserLastReadId = Number.MAX_SAFE_INTEGER; // или можно оставить null и обработать на клиенте
      }
    }




    // ---- 6. Отправляем ответ ----
    readDebugLog('[ReadDebug][backend:getMessages]', {
      roomId: Number(roomId),
      currentUserId: Number(currentUserId),
      roomType: room.type,
      otherUserLastReadId,
      minOtherUserLastReadId,
      deliveredCount: deliveredMessageIds.length,
      topMessageIds: messagesWithReactions.slice(-5).map(m => m?.id), // ASC -> последние 5
    });

    res.json({
      messages: messagesWithReactions,
      // Для личного чата
      ...(room.type === 'personal' && {
        otherUserLastReadId,
        deliveredMessageIds,
      }),
      // Для группового чата
      ...(room.type === 'group' && {
        minOtherUserLastReadId,
      }),
    });
  } catch (err) {
    console.error('getMessages error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};




// POST /admin/rooms/:roomId/messages
const createMessage = async (req, res) => {
  try {
    const traceId = `rm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const trace = (stage, extra = {}) => {
      try {
        chatTraceLog('[ChatTrace][room:createMessage]', { traceId, stage, ...extra });
      } catch {}
    };

    //console.log('req.body = ' , req.body)
    const roomId = req.params.roomId;
    const userId = req.user?.id; // ← если у тебя есть авторизация
    const {
      content,
      clientId,
      socketId,
      socketIds,
      deliveryStatus,
      readStatus,
      type,
      mediaUrl,
      thumbnailUrl,
      fileName,
      fileSize,
      duration,
      mediaMimeType,
    } = req.body;
      trace('incoming', {
        roomId: Number(roomId) || roomId,
        userId: Number(userId) || null,
        clientId: clientId ?? null,
        socketId: socketId ?? null,
        socketIdsCount: Array.isArray(socketIds) ? socketIds.length : 0,
        deliveryStatus: deliveryStatus ?? null,
        readStatus: readStatus ?? null,
        type: type ?? null,
        hasMediaUrl: Boolean(mediaUrl),
        hasThumbUrl: Boolean(thumbnailUrl),
        fileName: fileName ?? null,
        fileSize: Number.isFinite(Number(fileSize)) ? Number(fileSize) : null,
        duration: Number.isFinite(Number(duration)) ? Number(duration) : null,
        contentLen: typeof content === 'string' ? content.length : null,
      });

    const replyToMessageId = toSafeDbMessageId(req.body?.replyToMessageId);
    const replyToMessage = req.params.replyToMessage ?? null;

    // console.log('content = ', content)
    // console.log('replyToMessage:', replyToMessage);
    // console.log('replyToMessageId:', replyToMessageId);

    if (clientId) {
      const exists = await RoomMessage.findOne({ where: { clientId } });
      if (exists) return res.json(exists);
    }


    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    try {
      await ensureRoomAllowsMessage(roomId, userId);
    } catch (accessErr) {
      return res.status(accessErr?.status || 403).json({
        message: accessErr?.message || 'Отправка сообщений недоступна',
        code: accessErr?.code || 'ROOM_SEND_FORBIDDEN',
      });
    }
    try {
      await ensureRoomChatNotArchived(Number(roomId));
    } catch (archiveErr) {
      if (archiveErr?.status === 403) {
        return res.status(403).json({
          message: archiveErr.message || 'Чат в архиве',
          code: archiveErr.code || 'CROSS_CHAT_ARCHIVED',
        });
      }
      throw archiveErr;
    }
    const normalizedContent = typeof content === 'string' ? content : '';
    const normalizedMediaUrl = String(mediaUrl || '').trim();
    if (!normalizedContent.trim() && !normalizedMediaUrl) {
      return res.status(400).json({ message: 'Content or media required' });
    }

    let message;
    try {
      message = await RoomMessage.create({
        roomId,
        userId,
        content: normalizedContent,
        replyToMessage,
        replyToMessageId,
        clientId,
        deliveryStatus,
        readStatus,
        type: String(type || 'text'),
        mediaUrl: normalizedMediaUrl || null,
        thumbnailUrl: String(thumbnailUrl || '').trim() || null,
        fileName: String(fileName || '').trim() || null,
        fileSize: Number.isFinite(Number(fileSize)) ? Number(fileSize) : null,
        duration: Number.isFinite(Number(duration)) ? Number(duration) : null,
        mediaMimeType: String(mediaMimeType || '').trim() || null,
      });
    } catch (createErr) {
      if (clientId && createErr?.name === 'SequelizeUniqueConstraintError') {
        const existing = await RoomMessage.findOne({ where: { clientId } });
        if (existing) {
          trace('idempotent:race-reuse-existing', {
            roomId: Number(roomId) || roomId,
            existingMessageId: existing.id,
            clientId,
          });
          chatTraceLog(`[createMessage][idempotent-race] reused existing message by clientId=${clientId}`);
          return res.json(existing);
        }
      }
      throw createErr;
    }

    const savedMessage = await RoomMessage.findByPk(message.id, {
      include: [
        { model: User, attributes: ['id', 'name', 'avatar', 'phone'] },
        {
          model: RoomMessage,
          as: 'replyToMessage',
          include: [{ model: User, attributes: ['id', 'name', 'avatar', 'phone'] }],
        }
      ],
    });
    const [savedMessageWithReactions] = await attachRoomReactions([savedMessage], userId);
    trace('message:created', {
      roomId: Number(savedMessageWithReactions?.roomId) || Number(roomId) || roomId,
      messageId: savedMessageWithReactions?.id ?? null,
      clientId: savedMessageWithReactions?.clientId ?? clientId ?? null,
      userId: savedMessageWithReactions?.userId ?? (Number(userId) || null),
    });


    void relayRoomMessageToExternalParticipants({
        roomId,
        senderName: savedMessageWithReactions?.User?.name || savedMessage?.User?.name || req.user?.name || 'Сотрудник',
        content: savedMessageWithReactions?.content || normalizedContent,
        message: savedMessageWithReactions || savedMessage,
      }).catch((relayExternalErr) => {
        console.warn('[room-external][relay] failed:', relayExternalErr?.message || relayExternalErr);
      });
    // ----  Получаем комнату с участниками ----
    const room = await Room.findByPk(roomId, {
      include: [
        {
          model: User,
          through: { attributes: [] },
          attributes: ['id', 'name', 'phone', 'avatar'],
        },
      ],
    });

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Cross-domain bridge relay: mirror message to remote company
    // when chat partner is synthetic xbridge user.
    try {
      const relayAllowed = !req.body?.bridgeRelay;
      if (relayAllowed && ['personal', 'group'].includes(String(room.type || '')) && Array.isArray(room.Users)) {
        const selfUser = room.Users.find((u) => Number(u.id) === Number(userId));
        const peerUsers = String(room.type || '') === 'personal'
          ? [room.Users.find((u) => Number(u.id) !== Number(userId))]
          : room.Users.filter((u) => Number(u.id) !== Number(userId) && parseBridgePhone(u?.phone));
        trace('bridge:relay:candidates', {
          roomId: Number(roomId) || roomId,
          messageId: Number(savedMessageWithReactions?.id || message.id || 0) || null,
          roomType: String(room.type || ''),
          usersCount: Array.isArray(room.Users) ? room.Users.length : 0,
          peerUsersCount: peerUsers.filter(Boolean).length,
          bridgeUsers: (Array.isArray(room.Users) ? room.Users : [])
            .filter((u) => parseBridgePhone(u?.phone))
            .map((u) => ({ id: Number(u.id) || null, name: u.name || null, phone: String(u.phone || '').slice(0, 80) })),
        });
        for (const peerUser of peerUsers) {
          const bridgePeer = parseBridgePhone(peerUser?.phone);
          if (!bridgePeer?.domain || !bridgePeer?.phone) continue;
          const ownDomain = getOwnDomain(req);
          const payload = {
            externalMessageId: String(savedMessageWithReactions?.id || message.id || Date.now()),
            sender: {
              userId: Number(userId) || null,
              name: String(selfUser?.name || req.user?.name || 'Сотрудник'),
              phone: String(selfUser?.phone || req.user?.phone || '').replace(/\D/g, ''),
              domain: ownDomain,
              avatar: toAbsoluteMediaUrl(selfUser?.avatar || req.user?.avatar, ownDomain),
            },
            target: {
              domain: bridgePeer.domain,
              phone: bridgePeer.phone,
            },
            room: String(room.type || '') === 'group'
              ? {
                  mode: 'group',
                  sourceRoomId: Number(room.id),
                  name: String(room.name || ''),
                }
              : null,
            message: {
              content: String(savedMessageWithReactions?.content || ''),
              type: String(savedMessageWithReactions?.type || type || 'text'),
              clientId: String(clientId || ''),
              createdAt: new Date().toISOString(),
              mediaUrl: toAbsoluteMediaUrl(savedMessageWithReactions?.mediaUrl, ownDomain),
              thumbnailUrl: toAbsoluteMediaUrl(savedMessageWithReactions?.thumbnailUrl, ownDomain),
              fileName: savedMessageWithReactions?.fileName || null,
              fileSize: Number.isFinite(Number(savedMessageWithReactions?.fileSize))
                ? Number(savedMessageWithReactions.fileSize)
                : null,
              duration: Number.isFinite(Number(savedMessageWithReactions?.duration))
                ? Number(savedMessageWithReactions.duration)
                : null,
              mediaMimeType: savedMessageWithReactions?.mediaMimeType || mediaMimeType || null,
              transcriptionText: savedMessageWithReactions?.transcriptionText || null,
              transcriptionStatus: savedMessageWithReactions?.transcriptionStatus || null,
            },
          };

          trace('bridge:relay:start', {
            roomId: Number(roomId) || roomId,
            messageId: Number(savedMessageWithReactions?.id || message.id || 0) || null,
            peerUserId: Number(peerUser?.id) || null,
            peerDomain: bridgePeer.domain,
            peerPhoneTail: bridgePeer.phone ? String(bridgePeer.phone).slice(-4) : null,
          });
          sendBridgePost(bridgePeer.domain, '/api/cross-chat/bridge/message', payload, ownDomain)
            .then((bridgeResult) => {
              trace('bridge:relay:ok', {
                roomId: Number(roomId) || roomId,
                messageId: Number(savedMessageWithReactions?.id || message.id || 0) || null,
                peerUserId: Number(peerUser?.id) || null,
                peerDomain: bridgePeer.domain,
                remoteRoomId: bridgeResult?.roomId ?? null,
                remoteMessageId: bridgeResult?.messageId ?? null,
                dedup: Boolean(bridgeResult?.dedup),
              });
            })
            .catch((relayErr) => {
              console.warn('[cross-chat][bridge][relay] failed:', {
                roomId: Number(roomId) || roomId,
                messageId: Number(savedMessageWithReactions?.id || message.id || 0) || null,
                peerUserId: Number(peerUser?.id) || null,
                peerDomain: bridgePeer.domain,
                message: relayErr?.message || String(relayErr),
                status: relayErr?.response?.status || null,
                data: relayErr?.response?.data || null,
              });
              trace('bridge:relay:fail', {
                roomId: Number(roomId) || roomId,
                peerDomain: bridgePeer.domain,
                error: relayErr?.message || String(relayErr),
              });
            });
        }
      }
    } catch (relayErr) {
      console.warn('[cross-chat][bridge][relay] unexpected:', relayErr?.message || relayErr);
    }

    let title;

    if (room.type === 'personal') {
      title = `От ${savedMessage.User?.name || 'Коллеги'}`;
    } else { 
      title = `От ${savedMessage.User?.name || 'Коллеги'} в ${room.name}`;
    }


    // Эмитим о сообщении с сайта
    try {
      // savedMessage — объект, который только что положили в БД
      const kind = 'room'
      const chatId = savedMessage.roomId
      const roomName = `${kind}-${chatId}`;

      const io = getIO();
      // Emit: в комнату 

      if (Array.isArray(socketIds) && socketIds.length) {
        io.to(roomName).except(socketIds).emit('newRoomMessage', savedMessageWithReactions);
      } else if (socketId) {
        io.to(roomName).except(socketId).emit('newRoomMessage', savedMessageWithReactions);
      } else {
        io.to(roomName).emit('newRoomMessage', savedMessageWithReactions);
      }
      trace('emit:newRoomMessage', {
        roomName,
        messageId: savedMessageWithReactions?.id ?? null,
        roomId: savedMessageWithReactions?.roomId ?? (Number(roomId) || roomId),
        clientId: savedMessageWithReactions?.clientId ?? clientId ?? null,
      });

      chatTraceLog('[createMessage] emitted newRoomMessage to', roomName);
    }  catch (errSock) {
      console.error('Ошибка при отправке emit for room:', errSock);
    }
    




    // Push/auto-reply are side effects; do not keep the HTTP response waiting on providers.
    void (async () => {
    try {
      const recipientUsers = (Array.isArray(room.Users) ? room.Users : [])
        .filter((u) => u?.id && Number(u.id) !== Number(userId));
      const skippedBridgeRecipientIds = recipientUsers
        .filter((u) => parseBridgePhone(u.phone))
        .map((u) => Number(u.id));
      const recipientUserIds = recipientUsers
        .filter((u) => !parseBridgePhone(u.phone))
        .map((u) => Number(u.id));

      // console.log(`[createMessage] roomName = room-${message.roomId}`);
      // console.log(`[createMessage] recipientUserIds = ${JSON.stringify(recipientUserIds)}`);  

     // Получаем активных пользователей в комнате через сокеты
     let activeUserIds = [];
     try {
       const io = getIO();
       const roomName = `room-${message.roomId}`; // должно совпадать с именем комнаты при emit
       const socketsInRoom = await io.in(roomName).fetchSockets();
       //console.log(`[createMessage] socketsInRoom count = ${socketsInRoom.length}`);
       activeUserIds = socketsInRoom.map(s => s.userId).filter(id => id);
       //console.log(`[createMessage] activeUserIds = ${JSON.stringify(activeUserIds)}`);
     } catch (err) {
       console.error('Ошибка при получении активных сокетов:', err);
       // при ошибке не фильтруем – отправим всем (безопасное поведение)
     }

     // Оставляем только тех получателей, которые не активны в чате.
     // В проде бывают ложные "active" (подвисшие сокеты/фоновые подключения),
     // поэтому при пустом inactive делаем fallback на всех получателей.
     const inactiveRecipientIds = recipientUserIds.filter(id => !activeUserIds.includes(id));
     const pushRecipientIds = inactiveRecipientIds.length > 0 ? inactiveRecipientIds : recipientUserIds;
     //console.log(`[createMessage] inactiveRecipientIds = ${JSON.stringify(inactiveRecipientIds)}`);
     trace('push:candidates', {
       roomId: message.roomId,
       recipientCount: recipientUserIds.length,
       activeCount: activeUserIds.length,
       inactiveCount: inactiveRecipientIds.length,
       pushRecipientCount: pushRecipientIds.length,
       fallbackToAllRecipients: inactiveRecipientIds.length === 0 && recipientUserIds.length > 0,
       recipientUserIds,
       skippedBridgeRecipientIds,
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
          roomId: message.roomId,
          inactiveCount: inactiveRecipientIds.length,
          pushRecipientCount: pushRecipientIds.length,
          tokenRowsCount: tokenRows.length,
          tokensCount: tokens.length,
        });

        const pushText = String(savedMessageWithReactions?.content || '').trim();
        const pushFileName = String(savedMessageWithReactions?.fileName || '').trim();
        const typeLower = String(savedMessageWithReactions?.type || '').toLowerCase();
        const mediaHint =
          typeLower === 'audio' || typeLower === 'voice' ? 'Голосовое сообщение' :
          typeLower === 'image' ? 'Изображение' :
          typeLower === 'video' ? 'Видео' :
          pushFileName || 'Вложение';
        const body = pushText ? (pushText.length > 100 ? `${pushText.slice(0, 100)}...` : pushText) : mediaHint;
        const senderAvatarUrl = toAbsoluteMediaUrl(savedMessageWithReactions?.User?.avatar || savedMessage?.User?.avatar, getOwnDomain(req));

        // IMPORTANT:
        // Send by recipient user IDs, not only Expo tokens, so fallback providers
        // (e.g. UnifiedPush) can work even when expo tokens count is zero.
        trace('push:send:start', {
          roomId: message.roomId,
          pushRecipientCount: pushRecipientIds.length,
          tokensCount: tokens.length,
          title: title || null,
          hasBody: Boolean(body),
        });
        await sendPushNotification(pushRecipientIds, title, body, {
          type: 'messages',
          screen: 'room',
          roomId: message.roomId,
          messageId: savedMessageWithReactions?.id || message.id,
          url: `mobileapp://room/${encodeURIComponent(String(message.roomId))}`,
          avatarUrl: senderAvatarUrl,
        });
        trace('push:send:done', {
          roomId: message.roomId,
          pushRecipientCount: pushRecipientIds.length,
          tokensCount: tokens.length,
        });

        // Auto-reply notice to sender:
        // if recipient has enabled auto-reply, notify current sender by push.
        try {
          const autoRows = await UserSetting.findAll({
            where: {
              userId: { [Op.in]: pushRecipientIds },
              key: AUTO_REPLY_KEY,
            },
            attributes: ['userId', 'value'],
          });
          const byUser = new Map(autoRows.map((r) => [Number(r.userId), r.value || {}]));
          const activeAuto = room.Users
            .filter((u) => pushRecipientIds.includes(Number(u.id)))
            .map((u) => {
              const cfg = byUser.get(Number(u.id)) || {};
              return {
                userId: Number(u.id),
                name: String(u.name || 'Пользователь'),
                enabled: Boolean(cfg?.enabled),
                text: String(cfg?.text || '').trim(),
              };
            })
            .filter((x) => x.enabled);
          if (activeAuto.length > 0 && Number(userId) > 0) {
            const first = activeAuto[0];
            const autoText = first.text || 'Пользователь временно не может читать сообщения.';
            const autoTitle = `Автоответ от ${first.name}`;
            const autoBody = autoText.length > 140 ? `${autoText.slice(0, 140)}...` : autoText;
            const io = getIO();
            if (io) {
              io.to(`user:${Number(userId)}`).emit('room:auto_reply_notice', {
                roomId: Number(message.roomId) || null,
                fromUserId: Number(first.userId) || null,
                fromUserName: first.name,
                text: autoText,
              });
            }
            await sendPushNotification([Number(userId)], autoTitle, autoBody, {
              type: 'auto-reply',
              screen: 'room',
              roomId: message.roomId,
              fromUserId: first.userId,
              fromUserName: first.name,
            });
            trace('push:auto-reply:sent', {
              roomId: message.roomId,
              senderUserId: Number(userId),
              recipientsWithAutoReply: activeAuto.map((x) => x.userId),
            });
          } else {
            trace('push:auto-reply:skip', {
              roomId: message.roomId,
              senderUserId: Number(userId) || null,
              recipientsChecked: pushRecipientIds.length,
              activeAutoCount: activeAuto.length,
            });
          }
        } catch (autoErr) {
          console.warn('[auto-reply] push notify failed:', autoErr?.message || autoErr);
        }
      } else {
        trace('push:skip:no-recipients', {
          roomId: message.roomId,
          recipientCount: recipientUserIds.length,
          activeCount: activeUserIds.length,
        });
      }
    } catch (errPush) {
      console.error('Ошибка при отправке push в createMessage for room:', errPush);
    }
    })();


    res.status(201).json(savedMessageWithReactions);
  } catch (err) {
    console.error('createMessage error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};



// Вариант getMessages с beforeId/offset support (PATCH)
const getMessagesForWeb = async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const currentUserId = Number(req.user?.id) || 0;
    const { query, limit = 90, offset = 0, beforeId, afterId } = req.query;
    const queryText = String(query || '').trim();

    const where = { roomId };

    const beforeIdSafe = toSafeDbMessageId(beforeId);
    const afterIdSafe = toSafeDbMessageId(afterId);

    // Cursor: если beforeId передан — выбираем сообщения старше (createdAt < pivot.createdAt)
    if (beforeIdSafe) {
      const pivot = await RoomMessage.findByPk(beforeIdSafe);
      if (pivot) {
        where.createdAt = { [Op.lt]: pivot.createdAt };
      } else {
        return res.json([]);
      }
    }

    // Optionally support afterId (получить более новые сообщения)
    if (afterIdSafe) {
      const pivot = await RoomMessage.findByPk(afterIdSafe);
      if (pivot) {
        where.createdAt = { [Op.gt]: pivot.createdAt };
      }
    }

    const encryptedSearchFallback = queryText && isMessageEncryptionEnabled();
    if (queryText && !encryptedSearchFallback) {
      where[Op.or] = [
        { content: { [Op.iLike]: `%${queryText}%` } },
        { transcriptionText: { [Op.iLike]: `%${queryText}%` } },
        { fileName: { [Op.iLike]: `%${queryText}%` } },
      ];
    }

    // *** Ключевая строка: возвращаем новейшие первыми (DESC) ***
    const messages = encryptedSearchFallback
      ? await findMessagesByDecryptedQuery({
          roomId,
          query: queryText,
          limit: parseInt(limit),
          offset: beforeIdSafe || afterIdSafe ? 0 : parseInt(offset),
          createdAtFilter: where.createdAt,
          newestFirst: true,
        })
      : await RoomMessage.findAll({
          where,
          include: buildMessageIncludeForSearch(),
          order: [['createdAt', 'DESC']], // <- было ASC, меняем на DESC
          limit: parseInt(limit),
          offset: beforeIdSafe || afterIdSafe ? 0 : parseInt(offset),
        });

    const messagesWithReactions = await attachRoomReactions(messages, currentUserId);
    res.json(messagesWithReactions);
  } catch (err) {
    console.error('getMessages error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};


// PUT /admin/rooms/:roomId/messages/:messageId
async function updateRoomMessage(req, res) {
  try {
    const roomId = req.params.roomId;
    const messageId = Number(req.params.messageId);
    const userId = req.user?.id;
    const content = (req.body.content || '').trim();

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!content) return res.status(400).json({ message: 'Content required' });

    const msg = await RoomMessage.findByPk(messageId);
    if (!msg || String(msg.roomId) !== String(roomId)) {
      return res.status(404).json({ message: 'Message not found' });
    }
    if (msg.userId !== userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    msg.content = content;
    msg.updatedAt = new Date();
    if (typeof msg.edited !== 'undefined') msg.edited = true;

    await msg.save();

    const full = await RoomMessage.findByPk(msg.id, {
      include: [
        { model: User, attributes: ['id','name', 'avatar', 'phone'] },
        { model: RoomMessage, as: 'replyToMessage', include: [{ model: User, attributes: ['id','name', 'avatar', 'phone'] }] }
      ]
    });

    // emit update
    try {
      const roomName = `room-${full.roomId}`;
      const io = getIO();
      io.to(roomName).emit('updateRoomMessage', full);
    } catch (errSock) {
      console.error('Socket emit error updateRoomMessage:', errSock);
    }

    res.json(full);
  } catch (err) {
    console.error('updateRoomMessage error:', err);
    res.status(500).json({ message: 'Server error' });
  }
}



async function toggleRoomMessageReaction(req, res) {
  try {
    const roomId = Number(req.params.roomId);
    const messageId = Number(req.params.messageId);
    const userId = Number(req.user?.id);
    const emoji = normalizeEmoji(req.body?.emoji);

    if (!roomId || !messageId || !userId) {
      return res.status(400).json({ message: 'Invalid params' });
    }
    if (!emoji) {
      return res.status(400).json({ message: 'Emoji required' });
    }

    const membership = await RoomUsers.findOne({ where: { roomId, userId }, attributes: ['userId'] });
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const msg = await RoomMessage.findByPk(messageId);
    if (!msg || Number(msg.roomId) !== roomId) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const existing = await RoomMessageReaction.findOne({ where: { messageId, userId } });
    if (existing) {
      if (String(existing.emoji) === emoji) {
        await existing.destroy();
      } else {
        existing.emoji = emoji;
        await existing.save();
      }
    } else {
      await RoomMessageReaction.create({ messageId, userId, emoji });
    }

    const full = await RoomMessage.findByPk(messageId, {
      include: [
        { model: User, attributes: ['id', 'name', 'avatar', 'phone'] },
        {
          model: RoomMessage,
          as: 'replyToMessage',
          include: [{ model: User, attributes: ['id', 'name', 'avatar', 'phone'] }],
        }
      ],
    });

    const [withReactions] = await attachRoomReactions([full], userId);

    try {
      const io = getIO();
      io.to(`room-${roomId}`).emit('messageReactionUpdated', withReactions);
    } catch (errSock) {
      console.error('Socket emit error toggleRoomMessageReaction:', errSock);
    }

    return res.json(withReactions);
  } catch (err) {
    console.error('toggleRoomMessageReaction error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

function buildMessageIncludeForSearch() {
  return [
    { model: User, attributes: ['id', 'name', 'avatar', 'phone'] },
    {
      model: RoomMessage,
      as: 'replyToMessage',
      include: [{ model: User, attributes: ['id', 'name', 'avatar', 'phone'] }],
    },
  ];
}

function messageMatchesQuery(msg, queryLower) {
  if (!queryLower) return false;
  const content = String(msg?.content || '').toLowerCase();
  const transcription = String(msg?.transcriptionText || '').toLowerCase();
  const fileName = String(msg?.fileName || '').toLowerCase();
  return content.includes(queryLower) || transcription.includes(queryLower) || fileName.includes(queryLower);
}

async function findMessagesByDecryptedQuery({
  roomId,
  query,
  limit,
  offset,
  createdAtFilter,
  newestFirst = true,
}) {
  const normalizedLimit = Math.max(1, Math.min(200, Number(limit) || 90));
  const normalizedOffset = Math.max(0, Number(offset) || 0);
  const queryLower = String(query || '').trim().toLowerCase();
  const whereBase = { roomId };
  if (createdAtFilter) whereBase.createdAt = createdAtFilter;

  const scanRows = await RoomMessage.findAll({
    where: whereBase,
    include: buildMessageIncludeForSearch(),
    order: [['createdAt', 'DESC']],
    limit: ENCRYPTED_SEARCH_SCAN_LIMIT,
  });

  const filtered = scanRows.filter((m) => {
    const plain = typeof m?.get === 'function' ? m.get({ plain: true }) : m;
    return messageMatchesQuery(plain, queryLower);
  });

  const paged = filtered.slice(normalizedOffset, normalizedOffset + normalizedLimit);
  if (newestFirst) return paged;
  return paged.slice().reverse();
}


async function searchWebMessages(req, res) {
  try {
    const userId = Number(req.user?.id) || 0;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const queryText = String(req.query?.query || '').trim();
    if (!queryText) return res.json({ items: [] });

    const limit = Math.max(1, Math.min(100, Number(req.query?.limit) || 60));
    const perKindLimit = Math.max(20, limit);

    const [roomUserRows, bossUserRows] = await Promise.all([
      RoomUsers.findAll({ where: { userId }, attributes: ['roomId'] }),
      BossChatUsers.findAll({ where: { userId }, attributes: ['chatId'] }),
    ]);

    const roomIds = roomUserRows.map((row) => Number(row.roomId)).filter((id) => Number.isFinite(id) && id > 0);
    const bossChatIds = bossUserRows.map((row) => Number(row.chatId)).filter((id) => Number.isFinite(id) && id > 0);

    const roomPromise = (async () => {
      if (!roomIds.length) return [];
      if (isMessageEncryptionEnabled()) {
        const perRoomLimit = Math.max(5, Math.ceil(perKindLimit / Math.max(1, roomIds.length)));
        const batches = await Promise.all(roomIds.map((roomId) => findMessagesByDecryptedQuery({
          roomId,
          query: queryText,
          limit: perRoomLimit,
          offset: 0,
          newestFirst: true,
        })));
        return batches.flat();
      }
      return RoomMessage.findAll({
        where: {
          roomId: { [Op.in]: roomIds },
          [Op.or]: [
            { content: { [Op.iLike]: `%${queryText}%` } },
            { transcriptionText: { [Op.iLike]: `%${queryText}%` } },
            { fileName: { [Op.iLike]: `%${queryText}%` } },
          ],
        },
        include: buildMessageIncludeForSearch(),
        order: [['createdAt', 'DESC']],
        limit: perKindLimit,
      });
    })();

    const bossPromise = bossChatIds.length
      ? BossMessage.findAll({
          where: {
            chatId: { [Op.in]: bossChatIds },
            [Op.or]: [
              { content: { [Op.iLike]: `%${queryText}%` } },
              { transcriptionText: { [Op.iLike]: `%${queryText}%` } },
              { fileName: { [Op.iLike]: `%${queryText}%` } },
            ],
          },
          include: [
            { model: User, attributes: ['id', 'name', 'avatar', 'phone'] },
            {
              model: BossMessage,
              as: 'replyToMessage',
              include: [{ model: User, attributes: ['id', 'name', 'avatar', 'phone'] }],
            },
          ],
          order: [['createdAt', 'DESC']],
          limit: perKindLimit,
        })
      : Promise.resolve([]);

    const [roomMessages, bossMessages] = await Promise.all([roomPromise, bossPromise]);

    const normalize = (message, kind) => {
      const plain = typeof message?.get === 'function' ? message.get({ plain: true }) : message;
      const text = plain?.content || plain?.transcriptionText || plain?.text || plain?.body || plain?.fileName || '';
      return {
        ...plain,
        id: plain?.id,
        kind,
        roomId: kind === 'room' ? plain?.roomId : null,
        chatId: kind === 'boss' ? plain?.chatId : null,
        userName: plain?.User?.name || plain?.user?.name || null,
        text,
      };
    };

    const items = [
      ...roomMessages.map((message) => normalize(message, 'room')),
      ...bossMessages.map((message) => normalize(message, 'boss')),
    ]
      .sort((a, b) => (Date.parse(b?.createdAt || '') || 0) - (Date.parse(a?.createdAt || '') || 0))
      .slice(0, limit);

    return res.json({ items });
  } catch (err) {
    console.error('searchWebMessages error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}
module.exports = { getMessages, createMessage, getMessagesForWeb, updateRoomMessage, toggleRoomMessageReaction, searchWebMessages };

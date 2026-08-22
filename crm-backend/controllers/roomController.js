// controllers/roomController.js

const db = require("../models");
const Room = db.sequelize.models.Room;
const User = db.sequelize.models.User;
const RoomUsers = db.sequelize.models.RoomUsers;
const RoomMessage = db.sequelize.models.RoomMessage;
const MessageDelivery = db.sequelize.models.MessageDelivery;
const RoomMessageReaction = db.sequelize.models.RoomMessageReaction;
const RoomPinnedMessage = db.sequelize.models.RoomPinnedMessage;
const RoomPinnedArchive = db.sequelize.models.RoomPinnedArchive;
const ScheduledMessage = db.sequelize.models.ScheduledMessage;
const CrossCompanyChatRequest = db.sequelize.models.CrossCompanyChatRequest;
const RoomExternalParticipant = db.sequelize.models.RoomExternalParticipant;
const { Op, QueryTypes } = require('sequelize');
const { createRoomExternalInvitePayload, normalizeKind } = require('../services/roomExternalInvite');
const { telegramRequest } = require('../services/telegramApi');
const { buildMaxRoomBotLink } = require('../services/maxInvite');

const SELF_CHAT_NAME = 'Отправка себе';
const READ_DEBUG_LOGS = String(process.env.READ_DEBUG_LOGS || '').toLowerCase() === 'true';
const readDebugLog = (...args) => {
  if (READ_DEBUG_LOGS) console.log(...args);
};
const isSelfPersonalRoom = (room, roomUsers, userId) =>
  room?.type === 'personal' &&
  String(room?.name || '').trim() === SELF_CHAT_NAME &&
  Array.isArray(roomUsers) &&
  roomUsers.length === 1 &&
  Number(roomUsers[0]?.id) === Number(userId);
const AVATAR_DEBUG = false;
const avatarDebug = (event, payload) => {
  if (!AVATAR_DEBUG) return;
  try {
    console.log(`[AvatarDebug][backend][rooms] ${event}`, payload);
  } catch {}
};
const normalizeAvatarPath = (value) => {
  const raw = String(value || '').trim().replace(/\\/g, '/');
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const uploadsIndex = raw.indexOf('/uploads/');
  if (uploadsIndex >= 0) return raw.slice(uploadsIndex);
  if (raw.startsWith('uploads/')) return `/${raw}`;
  if (raw.startsWith('/')) return raw;
  return `/uploads/avatars/${raw.split('/').pop()}`;
};
const serializeUserWithAvatar = (user) => {
  if (!user) return null;
  const plain = typeof user.toJSON === 'function' ? user.toJSON() : user;
  return {
    ...plain,
    avatar: normalizeAvatarPath(plain.avatar),
  };
};


// Создание новой комнаты с участниками
const createRoom = async (req, res) => {
    try {
      const { name, participants } = req.body;
      if (!name || !Array.isArray(participants)) {
        return res.status(400).json({ message: 'Name & participants required' });
      }
      const room = await Room.create({ name, creatorUserId: req.user.id });
      await room.setUsers(participants);
      const full = await Room.findByPk(room.id, {
        include: [{ model: User, attributes: ['id','name','roleId'] }],
      });
      res.status(201).json(full);
    } catch (err) {
      console.error('createRoom error', err);
      res.status(500).json({ message: 'Server error' });
    }
};


// Получаем все чаты для АДМИНКИ
const listRoomsForAdmin = async (req, res) => {

  // console.log('req.user =' , req.user)

  try {
    const userId = req.user.id; // берём id из авторизации

    const rooms = await Room.findAll({
      include: [{ model: User, attributes: ['id','name','roleId'] }],
      order: [['createdAt','DESC']],
    });

    // console.log('rooms = ', rooms)

    // Получаем lastReadMessageId для всех комнат пользователя
    const roomIds = rooms.map(r => r.id);

    // console.log('roomIds = ', roomIds)

    const reads = await RoomUsers.findAll({
      where: {
        roomId: { [Op.in]: roomIds },
        userId,
      }
    });

    // console.log('reads = ', reads)

    // Преобразуем в мапу для удобства
    const readsMap = {};
    reads.forEach(r => { readsMap[r.roomId] = r.lastReadMessageId || 0; });

    // Считаем непрочитанные сообщения для каждой комнаты
    for (const room of rooms) {
      const lastReadId = readsMap[room.id] || 0;

      // console.log('lastReadId = ',  lastReadId)

      const unreadCount = await db.sequelize.models.RoomMessage.count({
        where: {
          roomId: room.id,
          id: { [Op.gt]: lastReadId },
        }
      });

      // console.log('unreadCount = ',  unreadCount)
      room.setDataValue('unreadCount', unreadCount);

      // Получаем последнее сообщение в комнате
      const lastMessage = await db.sequelize.models.RoomMessage.findOne({
        where: { roomId: room.id },
        include: [{ model: User, attributes: ['id', 'name'] }],
        order: [['createdAt', 'DESC']],
      });

      // console.log('lastMessage = ', lastMessage)

      // Присваиваем его виртуальному полю lastMessage
      room.setDataValue('lastMessage', lastMessage || null);
    }

    res.json(rooms);
  } catch (err) {
    console.error('listRooms error', err);
    res.status(500).json({ message: 'Server error' });
  }
};


// Получаем все чаты (групповые и личные)
const listRoomsForApp = async (req, res) => {
  try {
    const userId = req.user.id;
    //console.log(`[listRoomsForApp] Получаем комнаты для пользователя ID: ${userId}`);

    // Жёстко ограничиваем выборку через таблицу участников,
    // чтобы в ответ не мог попасть "чужой" чат без membership текущего пользователя.
    const membershipRows = await RoomUsers.findAll({
      where: { userId, deletedAt: null },
      attributes: ['roomId', 'lastReadMessageId', 'archivedAt', 'deletedAt'],
    });

    const roomIds = Array.from(new Set(membershipRows.map((r) => Number(r.roomId)).filter((id) => Number.isFinite(id) && id > 0)));
    if (roomIds.length === 0) {
      return res.json([]);
    }

    const rooms = await Room.findAll({
      where: { id: { [Op.in]: roomIds } },
      order: [['createdAt','DESC']],
    });

    //console.log(`[listRoomsForApp] Найдено комнат: ${rooms.length}`);

    const membershipMap = new Map(
      membershipRows.map((row) => [Number(row.roomId), row])
    );

    const [roomUsersRows, maxRows, unreadRows] = await Promise.all([
      RoomUsers.findAll({
        where: { roomId: { [Op.in]: roomIds } },
        attributes: ['roomId', 'userId', 'lastReadMessageId'],
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'roleId', 'avatar', 'canChat', 'system'],
        }],
      }),
      db.sequelize.query(
        `SELECT DISTINCT ON ("roomId") "roomId", id AS "lastMessageId"
         FROM "RoomMessages"
         WHERE "roomId" IN (:roomIds)
         ORDER BY "roomId", "createdAt" DESC, id DESC`,
        {
          replacements: { roomIds },
          type: QueryTypes.SELECT,
        }
      ),
      db.sequelize.query(
        `SELECT rm."roomId", COUNT(*)::int AS "unreadCount"
         FROM "RoomMessages" rm
         JOIN "RoomUsers" ru
           ON ru."roomId" = rm."roomId" AND ru."userId" = :userId
         WHERE rm."roomId" IN (:roomIds)
           AND rm."userId" <> :userId
           AND rm.id > CASE
             WHEN ru."lastReadMessageId" IS NULL THEN 0
             WHEN ru."lastReadMessageId" < 0 THEN 0
             WHEN ru."lastReadMessageId" > 2147483647 THEN 0
             ELSE ru."lastReadMessageId"
           END
         GROUP BY rm."roomId"`,
        {
          replacements: { roomIds, userId },
          type: QueryTypes.SELECT,
        }
      ),
    ]);

    const roomUsersByRoomId = new Map();
    const roomUserRowsByRoomId = new Map();
    roomUsersRows.forEach((row) => {
      const roomId = Number(row.roomId);
      const list = roomUsersByRoomId.get(roomId) || [];
      const rowList = roomUserRowsByRoomId.get(roomId) || [];
      const user = row.user || row.User;
      if (user) list.push(user);
      rowList.push(row);
      roomUsersByRoomId.set(roomId, list);
      roomUserRowsByRoomId.set(roomId, rowList);
    });

    const unreadMap = {};
    unreadRows.forEach((row) => {
      unreadMap[Number(row.roomId)] = Number(row.unreadCount || 0);
    });

    const lastMessageIdByRoomId = {};
    maxRows.forEach((row) => {
      lastMessageIdByRoomId[Number(row.roomId)] = Number(row.lastMessageId || 0);
    });

    const lastMessageIds = Object.values(lastMessageIdByRoomId).filter((id) => id > 0);
    const lastMessages = lastMessageIds.length > 0
      ? await RoomMessage.findAll({
          where: { id: { [Op.in]: lastMessageIds } },
          include: [{
            model: User,
            attributes: ['id', 'name', 'avatar'],
            required: false,
          }],
        })
      : [];
    const lastMessageByRoomId = {};
    lastMessages.forEach((message) => {
      lastMessageByRoomId[Number(message.roomId)] = message;
    });

    const deliveryMessageIds = [];
    const deliveryUserIds = [];
    rooms.forEach((room) => {
      const roomId = Number(room.id);
      const lastMessage = lastMessageByRoomId[roomId];
      if (!lastMessage || Number(lastMessage.userId) !== Number(userId)) return;
      const roomUsers = roomUsersByRoomId.get(roomId) || [];
      if (room.type === 'personal') {
        if (isSelfPersonalRoom(room, roomUsers, userId)) return;
        const otherUser = roomUsers.find((u) => Number(u.id) !== Number(userId));
        if (!otherUser) return;
        deliveryMessageIds.push(Number(lastMessage.id));
        deliveryUserIds.push(Number(otherUser.id));
      }
    });

    const deliveryRows = deliveryMessageIds.length > 0 && deliveryUserIds.length > 0
      ? await MessageDelivery.findAll({
          where: {
            messageId: { [Op.in]: Array.from(new Set(deliveryMessageIds)) },
            userId: { [Op.in]: Array.from(new Set(deliveryUserIds)) },
          },
          attributes: ['messageId', 'userId'],
        })
      : [];
    const deliveryMap = new Set(
      deliveryRows.map((row) => `${Number(row.messageId)}:${Number(row.userId)}`)
    );

    // Для каждой комнаты получаем полную информацию
    const roomsWithDetails = await Promise.all(rooms.map(async (room) => {
      const roomId = Number(room.id);
      const unreadCount = unreadMap[roomId] || 0;
      const lastMessage = lastMessageByRoomId[roomId] || null;
      const roomUsers = roomUsersByRoomId.get(roomId) || [];
      const roomUserRows = roomUserRowsByRoomId.get(roomId) || [];

      // Дополнительная защита от "битых" связей/кэша ORM.
      if (!roomUsers.some((u) => Number(u.id) === Number(userId))) {
        return null;
      }

      // Для личных чатов определяем собеседника
      let partner = null;
      let shouldShowRoom = true;

      if (room.type === 'personal') {
        const isSelfRoom = isSelfPersonalRoom(room, roomUsers, userId);
        // Обычный personal содержит двух участников, self-chat — одного владельца.
        if (!isSelfRoom && (!Array.isArray(roomUsers) || roomUsers.length !== 2)) {
          shouldShowRoom = false;
        }
        partner = isSelfRoom
          ? roomUsers[0]
          : roomUsers.find(user => Number(user.id) !== Number(userId));

        // Проверяем, разрешены ли чаты с этим пользователем
        if (!isSelfRoom && partner && (partner.canChat === false || partner.system === true)) {
          shouldShowRoom = false;
        }
      }

      // Если комната не должна показываться, возвращаем null
      if (!shouldShowRoom) {
        return null;
      }


      // --- НАЧАЛО: Определяем статус последнего сообщения, если оно от текущего пользователя ---
      let lastMessageStatus = null;
      if (lastMessage && lastMessage.userId === userId) {
        // Сообщение от текущего пользователя
        if (room.type === 'personal') {
          if (isSelfPersonalRoom(room, roomUsers, userId)) {
            lastMessageStatus = 'read';
          } else {
            const otherUser = roomUsers.find(u => Number(u.id) !== Number(userId));
            if (otherUser) {
              // Получаем lastReadMessageId собеседника
              const otherRoomUser = roomUserRows.find((row) => Number(row.userId) === Number(otherUser.id));
              const safeOtherRead = Math.min(
                Number(otherRoomUser?.lastReadMessageId) || 0,
                Number(lastMessage?.id) || 0
              );
              if (safeOtherRead >= lastMessage.id) {
                lastMessageStatus = 'read';
              } else {
                // Проверяем доставку
                const delivery = deliveryMap.has(`${Number(lastMessage.id)}:${Number(otherUser.id)}`);
                lastMessageStatus = delivery ? 'delivered' : 'sent';
              }
            } else {
              // Собеседник не найден (маловероятно) – считаем отправленным
              lastMessageStatus = 'sent';
            }
          }
        } else { // group
          // Получаем всех участников, кроме текущего
          const otherUserIds = roomUsers.filter(u => Number(u.id) !== Number(userId)).map(u => Number(u.id));
          if (otherUserIds.length === 0) {
            // Если пользователь один в группе (странно, но на всякий случай)
            lastMessageStatus = 'read';
          } else {
            // Находим минимальный lastReadMessageId среди остальных участников
            const otherRoomUsers = roomUserRows.filter((row) => otherUserIds.includes(Number(row.userId)));
            const minLastRead = Math.min(...otherRoomUsers.map(ru => ru.lastReadMessageId || 0));
            lastMessageStatus = (minLastRead >= lastMessage.id) ? 'read' : 'sent';
          }
        }
      }
      // --- КОНЕЦ ---



      const serializedPartner = serializeUserWithAvatar(partner);
      const serializedRoomUsers = roomUsers.map(serializeUserWithAvatar);
      const serializedLastMessageUser = lastMessage?.User
        ? serializeUserWithAvatar(lastMessage.User)
        : null;

      return {
        id: room.id,
        name: room.name,
        type: room.type || 'group', // 'group' или 'personal'
        partner: serializedPartner, // только для личных чатов
        unreadCount,
        lastMessage: lastMessage ? {
          id: lastMessage.id,
          content: lastMessage.content,
          type: lastMessage.type,
          fileName: lastMessage.fileName,
          createdAt: lastMessage.createdAt,
          User: serializedLastMessageUser
        } : null,
        lastMessageStatus, 
        Users: serializedRoomUsers,
        archived: Boolean(membershipMap.get(Number(room.id))?.archivedAt),
        canDelete: room.type === 'personal' || Number(room.creatorUserId) === Number(userId),
        creatorUserId: room.creatorUserId || null,
      };
    }));

    // Фильтруем null значения (скрытые комнаты)
    const filteredRooms = roomsWithDetails.filter(room => room !== null);
    avatarDebug('listRoomsForApp:response', {
      userId,
      rooms: filteredRooms.length,
      personalSample: filteredRooms
        .filter((room) => room?.type === 'personal')
        .slice(0, 8)
        .map((room) => ({
          roomId: room.id,
          name: room.name,
          partnerId: room.partner?.id ?? null,
          partnerName: room.partner?.name ?? null,
          partnerAvatar: room.partner?.avatar ?? null,
          users: Array.isArray(room.Users)
            ? room.Users.map((u) => ({ id: u.id, name: u.name, avatar: u.avatar ?? null }))
            : [],
        })),
    });
    
    res.json(filteredRooms);

  } catch (err) {
    console.error('listRooms error', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Функция для получения или создания личного чата
const getOrCreatePersonalRoom = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { otherUserId } = req.params;

    //console.log(`[getOrCreatePersonalRoom] Создание/получение чата между ${currentUserId} и ${otherUserId}`);

    if (parseInt(otherUserId) === currentUserId) {
      return res.status(400).json({ error: "Нельзя создать чат с самим собой" });
    }

    const currentUser = await User.findByPk(currentUserId, {
      attributes: ['id', 'name', 'isActive', 'canChat', 'system', 'autoCreatePersonalChats']
    });

    if (!currentUser) {
      return res.status(404).json({ error: "Текущий пользователь не найден" });
    }

    if (currentUser.system === true || currentUser.autoCreatePersonalChats === false) {
      return res.status(403).json({
        error: "Личные чаты отключены",
        message: "Для этого пользователя личные чаты создаются только по приглашению"
      });
    }

    // Проверяем, существует ли пользователь и может ли он чатиться
    const otherUser = await User.findByPk(otherUserId, {
      attributes: ['id', 'name', 'roleId', 'isActive', 'canChat', 'system', 'autoCreatePersonalChats']
    });

    if (!otherUser) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    if (!otherUser.isActive) {
      return res.status(400).json({ error: "Пользователь не активен" });
    }

    // Проверяем поле canChat
    if (!otherUser.canChat) {
      return res.status(403).json({ 
        error: "С этим пользователем нельзя создать чат",
        message: "Пользователь отключил возможность личных сообщений"
      });
    }

    if (otherUser.system === true || otherUser.autoCreatePersonalChats === false) {
      return res.status(403).json({
        error: "С этим пользователем нельзя создать чат",
        message: "Для этого пользователя личные чаты создаются только по приглашению"
      });
    }

    // Ищем существующий личный чат между этими пользователями
    const existingRooms = await Room.findAll({
      where: {
        type: 'personal'
      },
      include: [{
        model: User,
        where: { id: { [Op.in]: [currentUserId, parseInt(otherUserId)] } },
        through: { attributes: [] }
      }]
    });

    // Ищем комнату, где оба пользователя
    let personalRoom = null;
    for (const room of existingRooms) {
      const roomUsers = await room.getUsers();
      const userIds = roomUsers.map(u => u.id);
      
      // Убеждаемся, что это строго персональный чат (ровно 2 участника) и в нем оба пользователя.
      if (
        userIds.length === 2 &&
        userIds.includes(currentUserId) &&
        userIds.includes(parseInt(otherUserId))
      ) {
        personalRoom = room;
        break;
      }
    }

    // Если чат не найден, создаем новый
    if (!personalRoom) {
      // Получаем информацию о пользователях для названия чата
      const [currentUserRecord, otherUserRecord] = await Promise.all([
        User.findByPk(currentUserId, { attributes: ['id', 'name', 'roleId', 'avatar'] }),
        User.findByPk(otherUserId, { attributes: ['id', 'name', 'roleId', 'avatar'] })
      ]);

      if (!otherUserRecord) {
        return res.status(404).json({ error: "Пользователь не найден" });
      }

      // Создаем комнату с типом 'personal'
      personalRoom = await Room.create({
        name: `Чат с ${otherUserRecord.name}`,
        type: 'personal',
        creatorUserId: currentUserId,
      });

      // Добавляем обоих пользователей в комнату
      await personalRoom.addUsers([currentUserRecord, otherUserRecord]);
    } else {
      await RoomUsers.update(
        { deletedAt: null, archivedAt: null },
        {
          where: {
            roomId: personalRoom.id,
            userId: currentUserId,
          },
        }
      );
    }

    // Получаем полную информацию о комнате
    const roomUsers = await personalRoom.getUsers({
      attributes: ['id', 'name', 'roleId', 'avatar', 'canMax', 'canTelegram'],
      through: { attributes: [] }
    });

    // Получаем последнее сообщение
    const lastMessage = await db.sequelize.models.RoomMessage.findOne({
      where: { roomId: personalRoom.id },
      include: [{ 
        model: User, 
        attributes: ['id', 'name', 'avatar'],
        required: false 
      }],
      order: [['createdAt', 'DESC']],
    });

    // Определяем собеседника
    const partner = roomUsers.find(user => user.id !== currentUserId);

    res.json({
      id: personalRoom.id,
      name: personalRoom.name,
      type: personalRoom.type,
      partner: partner,
      Users: roomUsers,
      lastMessage: lastMessage ? {
        id: lastMessage.id,
        content: lastMessage.content,
        type: lastMessage.type,
        fileName: lastMessage.fileName,
        createdAt: lastMessage.createdAt,
        User: lastMessage.User
      } : null
    });
  } catch (error) {
    console.error("Ошибка при создании/получении личного чата:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
};





// Получить список сотрудников для создания новых личных чатов
// controllers/roomController.js - обновляем getAvailableUsersForPersonalChat
const getAvailableUsersForPersonalChat = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const currentUser = await User.findByPk(currentUserId, {
      attributes: ['id', 'system', 'autoCreatePersonalChats']
    });

    if (!currentUser) {
      return res.status(404).json({ error: "Текущий пользователь не найден" });
    }

    if (currentUser.system === true || currentUser.autoCreatePersonalChats === false) {
      return res.json([]);
    }

    // Получаем всех активных пользователей кроме текущего, у которых canChat = true
    const allUsers = await User.findAll({
      where: {
        id: { [Op.ne]: currentUserId },
        isActive: true,
        canChat: true, // ТОЛЬКО те, с кем можно создать чат
        system: false,
        autoCreatePersonalChats: true // исключаем "приватных" пользователей
      },
      attributes: ['id', 'name', 'roleId', 'phone', 'canChat'],
      order: [['name', 'ASC']]
    });

    // Получаем все существующие личные чаты пользователя
    const personalRooms = await Room.findAll({
      where: { type: 'personal' },
      include: [{
        model: User,
        where: { id: currentUserId },
        required: true
      }]
    });

    // Для каждого личного чата получаем второго участника
    const existingPersonalUserIds = new Set();
    for (const room of personalRooms) {
      const roomUsers = await room.getUsers();
      const otherUser = roomUsers.find(user => user.id !== currentUserId);
      if (otherUser) {
        existingPersonalUserIds.add(otherUser.id);
      }
    }

    // Формируем ответ с информацией, есть ли уже чат
    const usersWithChatStatus = allUsers.map(user => ({
      id: user.id,
      name: user.name,
      roleId: user.roleId,
      phone: user.phone || '',
      canChat: user.canChat,
      hasExistingChat: existingPersonalUserIds.has(user.id)
    }));

    res.json(usersWithChatStatus);
  } catch (error) {
    console.error("Ошибка при получении списка пользователей:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
};




// Автоматически создавать личные чаты при первом входе (опционально)
// const autoCreatePersonalChats = async (req, res) => {
//   console.log('start autoCreatePersonalChats')
//   try {
//     const currentUserId = req.user.id;

//     //console.log('currentUserId = ', currentUserId)

//     // Получаем всех активных пользователей кроме текущего
//     const allUsers = await User.findAll({
//       where: {
//         id: { [Op.ne]: currentUserId },
//         isActive: true
//       },
//       attributes: ['id', 'name']
//     });

//     console.log('allUsers = ', allUsers)

//     const createdRooms = [];

//     for (const otherUser of allUsers) {
//       // Проверяем, существует ли уже личный чат
//       const existingRooms = await Room.findAll({
//         where: { type: 'personal' },
//         include: [{
//           model: User,
//           where: { id: [currentUserId, otherUser.id] },
//           through: { attributes: [] }
//         }]
//       });

//       //console.log('existingRooms = ', existingRooms)

//       let personalRoom = null;
//       for (const room of existingRooms) {
//         const roomUsers = await room.getUsers();
//         if (roomUsers.length === 2) {
//           const userIds = roomUsers.map(u => u.id);
//           if (userIds.includes(currentUserId) && userIds.includes(otherUser.id)) {
//             personalRoom = room;
//             break;
//           }
//         }
//       }

//       //console.log('personalRoom = ', personalRoom)

//       // Если чата нет, создаем его
//       if (!personalRoom) {
//         const currentUser = await User.findByPk(currentUserId);
        
//         personalRoom = await Room.create({
//           name: `Чат с ${otherUser.name}`,
//           type: 'personal'
//         });

//         //console.log('personalRoom = ', personalRoom)

//         await personalRoom.addUsers([currentUser, otherUser]);
//         createdRooms.push(personalRoom);
//       }
//     }

//     res.json({ 
//       message: `Создано ${createdRooms.length} новых личных чатов`,
//       createdRooms: createdRooms.length 
//     });
//   } catch (error) {
//     console.error("Ошибка при автоматическом создании личных чатов:", error);
//     res.status(500).json({ error: "Ошибка сервера" });
//   }
// };


// controllers/roomController.js - исправляем autoCreatePersonalChats
const autoCreatePersonalChats = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const currentUser = await User.findByPk(currentUserId);
    
    if (!currentUser) {
      return res.status(404).json({ error: "Текущий пользователь не найден" });
    }

    if (currentUser.system === true || currentUser.autoCreatePersonalChats === false) {
      return res.json({
        message: "Автосоздание личных чатов отключено для пользователя",
        results: { created: 0, alreadyExist: 0, skipped: 0, errors: [] },
      });
    }

    //console.log(`[autoCreatePersonalChats] Создание чатов для: ${currentUser.name}`);

    // Получаем всех активных пользователей кроме текущего, у которых canChat = true
    const allUsers = await User.findAll({
      where: {
        id: { [Op.ne]: currentUserId },
        isActive: true,
        canChat: true, // ТОЛЬКО пользователи с разрешением на чат
        system: false,
        autoCreatePersonalChats: true, // исключаем "приватных" пользователей из авто-создания у других
      },
      attributes: ['id', 'name', 'roleId', 'canChat']
    });

    //console.log(`[autoCreatePersonalChats] Всего активных пользователей с canChat=true: ${allUsers.length}`);

    const results = {
      created: 0,
      alreadyExist: 0,
      skipped: 0, // пользователи с canChat = false
      errors: []
    };

    for (const otherUser of allUsers) {
      try {
        //console.log(`[autoCreatePersonalChats] Обрабатываем: ${otherUser.name} (canChat: ${otherUser.canChat})`);

        // Дополнительная проверка на всякий случай
        if (!otherUser.canChat) {
          //console.log(`[autoCreatePersonalChats] Пропускаем ${otherUser.name} - canChat = false`);
          results.skipped++;
          continue;
        }

        // Ищем существующий личный чат
        const existingChats = await Room.findAll({
          where: { type: 'personal' },
          include: [{
            model: User,
            required: true,
            where: { id: currentUserId }
          }]
        });

        // Проверяем каждый чат на наличие обоих пользователей
        let chatExists = false;
        for (const chat of existingChats) {
          const usersInChat = await chat.getUsers();
          const userIds = usersInChat.map(u => u.id);
          if (
            userIds.length === 2 &&
            userIds.includes(currentUserId) &&
            userIds.includes(otherUser.id)
          ) {
            chatExists = true;
            break;
          }
        }

        if (chatExists) {
          //console.log(`[autoCreatePersonalChats] Чат с ${otherUser.name} уже существует`);
          results.alreadyExist++;
        } else {
          // Создаем новый чат
          const newRoom = await Room.create({
            name: `Чат с ${otherUser.name}`,
            type: 'personal',
            creatorUserId: currentUserId,
          });

          // Добавляем обоих пользователей
          await newRoom.addUsers([currentUser, otherUser]);

          // Проверяем создание
          const usersInNewChat = await newRoom.getUsers();
          if (usersInNewChat.length === 2) {
            //console.log(`[autoCreatePersonalChats] ✅ Создан чат: ${newRoom.id} с ${otherUser.name}`);
            results.created++;
          } else {
            console.error(`[autoCreatePersonalChats] ❌ Проблема: в чате ${newRoom.id} только ${usersInNewChat.length} пользователей`);
            results.errors.push(`В чате ${newRoom.id} только ${usersInNewChat.length} пользователей`);
            await newRoom.destroy();
          }
        }
      } catch (userError) {
        console.error(`[autoCreatePersonalChats] Ошибка с ${otherUser.name}:`, userError);
        results.errors.push(`${otherUser.name}: ${userError.message}`);
      }
    }

    res.json({
      message: `Создано ${results.created} новых чатов, ${results.alreadyExist} уже существовали, ${results.skipped} пропущено (canChat=false)`,
      results
    });

  } catch (error) {
    console.error("[autoCreatePersonalChats] Критическая ошибка:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
};

// --- Helper: нормализация lastMessage для фронта ---
function normalizeLastMessage(messageRow) {
  if (!messageRow) return { text: '', raw: null, author: null, time: null };

  const m = messageRow.toJSON();
  if (m.User) {
    m.User = serializeUserWithAvatar(m.User);
  }
  const text = m.content ?? m.transcriptionText ?? m.text ?? m.body ?? '';
  const fileName = m.fileName ?? null;
  const display = text || fileName || (m.type ? `[${m.type}]` : (m.mediaUrl ? '[Вложение]' : ''));
  const author = m.User?.name ?? null;
  const time = m.createdAt ?? m.updatedAt ?? null;

  return { text: display, raw: m, author, time };
}


// controllers/roomController.js - обновляем listRoomsForWeb
const listRoomsForWeb = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // Все комнаты пользователя + lastReadMessageId
    const roomUsersRows = await RoomUsers.findAll({
      where: { userId },
      attributes: ['roomId', 'lastReadMessageId', 'archivedAt']
    });

    const roomIds = roomUsersRows.map(r => r.roomId);
    if (!roomIds.length) return res.json([]);

    // Получаем сами комнаты, включаем тип
    const rooms = await Room.findAll({
      where: { id: { [Op.in]: roomIds } },
      attributes: ['id', 'name', 'type', 'creatorUserId', 'updatedAt'], // явно указываем type
      order: [['updatedAt', 'DESC']],
    });

    // Map lastReadMessageId
    const lastReadMap = {};
    const membershipMap = new Map();
    roomUsersRows.forEach(r => {
      lastReadMap[r.roomId] = r.lastReadMessageId ?? 0;
      membershipMap.set(Number(r.roomId), r);
    });

    // Формируем объекты для фронта
    const out = await Promise.all(rooms.map(async (room) => {
      const roomId = room.id;
      const maxMessageId = Number(
        await RoomMessage.max('id', { where: { roomId } })
      ) || 0;
      const rawLastReadId = Number(lastReadMap[roomId] ?? 0);
      const lastReadId = Math.max(0, Math.min(rawLastReadId, maxMessageId));

      // Берём последнее сообщение в чате
      const lastMessage = await RoomMessage.findOne({
        where: { roomId },
        include: [{ model: User, attributes: ['id','name','avatar'] }],
        order: [['id','DESC']],
        limit: 1
      });

      // Кол-во непрочитанных сообщений
      const unread = await RoomMessage.count({
        where: {
          roomId,
          id: { [Op.gt]: lastReadId },
          userId: { [Op.ne]: userId },
        }
      });

      const last = normalizeLastMessage(lastMessage);

      // Получаем всех пользователей комнаты (нужно для личных чатов)
      const roomUsers = await room.getUsers({
        attributes: ['id', 'name', 'avatar', 'canChat', 'system'], // добавляем canChat/system
        through: { attributes: [] }
      });

      // По умолчанию название комнаты
      let title = room.name;
      let shouldShow = true;
      let partnerName = null;
      let partnerAvatar = null;

      // Если это личный чат
      if (room.type === 'personal') {
        const isSelfRoom = isSelfPersonalRoom(room, roomUsers, userId);
        if (!isSelfRoom && (!Array.isArray(roomUsers) || roomUsers.length !== 2)) {
          shouldShow = false;
        }
        const roomName = String(room.name || '').trim();
        const hasCustomPersonalName =
          roomName.length > 0 &&
          !/^personal-\d+-\d+$/i.test(roomName) &&
          !/^чат с\s+/i.test(roomName);

        // Находим собеседника
        const partner = isSelfRoom
          ? roomUsers[0]
          : roomUsers.find(user => Number(user.id) !== Number(userId));
        
        if (partner) {
          const serializedPartner = serializeUserWithAvatar(partner);
          partnerName = serializedPartner.name;
          partnerAvatar = serializedPartner.avatar || null;
          
          // Проверяем, разрешены ли чаты с этим пользователем
          if (!isSelfRoom && (partner.canChat === false || partner.system === true)) {
            shouldShow = false; // скрываем чат
          } else {
            // Для personal-чата показываем кастомное имя комнаты, если оно задано.
            // Иначе — как раньше имя собеседника.
            title = isSelfRoom ? SELF_CHAT_NAME : (hasCustomPersonalName ? roomName : partner.name);
          }
        } else {
          // Если не найден собеседник (битый чат) - скрываем
          shouldShow = false;
        }
      }

      // Если не должны показывать, пропускаем
      if (!shouldShow) {
        return null;
      }

      return {
        kind: 'room',
        rawId: `room-${roomId}`,
        id: `room-${roomId}`,
        title: title, // теперь для личных чатов это имя собеседника
        lastMessage: last.text,
        lastMessageRaw: last.raw,
        lastMessageAuthor: last.author,
        lastMessageTime: last.time,
        updatedAt: room.updatedAt,
        unread,
        archived: Boolean(membershipMap.get(Number(roomId))?.archivedAt),
        // Добавим для отладки/совместимости
        partnerName: partnerName, // полезно для фронта
        partnerAvatar,
        roomType: room.type, // group/personal
        creatorUserId: room.creatorUserId || null,
        Users: roomUsers.map(serializeUserWithAvatar)
      };
    }));

    // Фильтруем null (скрытые чаты)
    const filteredOut = out.filter(item => item !== null);

    // Сортировка по последнему сообщению / updatedAt
    const mergedSorted = filteredOut.sort((a,b) => {
      const ta = a.lastMessageTime ?? a.updatedAt ?? 0;
      const tb = b.lastMessageTime ?? b.updatedAt ?? 0;
      return (tb ? Date.parse(tb) : 0) - (ta ? Date.parse(ta) : 0);
    });
    avatarDebug('listRoomsForWeb:response', {
      userId,
      rooms: mergedSorted.length,
      personalSample: mergedSorted
        .filter((item) => item?.roomType === 'personal')
        .slice(0, 8)
        .map((item) => ({
          id: item.id,
          title: item.title,
          partnerName: item.partnerName,
          partnerAvatar: item.partnerAvatar,
        })),
    });

    res.json(mergedSorted);
  } catch (err) {
    console.error('listRoomsForWeb error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};





// const listRoomsForWeb = async (req, res) => {
//   try {
//     const userId = req.user?.id;
//     if (!userId) return res.status(401).json({ message: 'Unauthorized' });

//     //console.log('[roomController] req.user = ', req.user)

//     // Все комнаты пользователя + lastReadMessageId
//     const roomUsersRows = await RoomUsers.findAll({
//       where: { userId },
//       attributes: ['roomId', 'lastReadMessageId']
//     });

//     const roomIds = roomUsersRows.map(r => r.roomId);
//     if (!roomIds.length) return res.json([]);

//     // Получаем сами комнаты
//     const rooms = await Room.findAll({
//       where: { id: { [Op.in]: roomIds } },
//       order: [['updatedAt', 'DESC']],
//     });

//     // Map lastReadMessageId
//     const lastReadMap = {};
//     roomUsersRows.forEach(r => { lastReadMap[r.roomId] = r.lastReadMessageId ?? 0; });

//     // Формируем объекты для фронта
//     const out = await Promise.all(rooms.map(async (r) => {
//       const roomId = r.id;
//       const lastReadId = Number(lastReadMap[roomId] ?? 0);

//       // Берём последнее сообщение в чате
//       const lastMessage = await RoomMessage.findOne({
//         where: { roomId },
//         include: [{ model: User, attributes: ['id','name'] }],
//         order: [['id','DESC']],
//         limit: 1
//       });

//       // Кол-во непрочитанных сообщений
//       const unread = await RoomMessage.count({
//         where: { roomId, id: { [Op.gt]: lastReadId } }
//       });

//       const last = normalizeLastMessage(lastMessage);

//       //console.log('[roomController] r = ', r)

//       return {
//         kind: 'room',
//         rawId: `room-${roomId}`,      // для фронта
//         id: `room-${roomId}`,
//         title: r.name ?? `Чат ${roomId}`,
//         lastMessage: last.text,
//         lastMessageRaw: last.raw,
//         lastMessageAuthor: last.author,
//         lastMessageTime: last.time,
//         updatedAt: r.updatedAt,
//         unread
//       };
//     }));

//     // Сортировка по последнему сообщению / updatedAt
//     const mergedSorted = out.sort((a,b) => {
//       const ta = a.lastMessageTime ?? a.updatedAt ?? 0;
//       const tb = b.lastMessageTime ?? b.updatedAt ?? 0;
//       return (tb ? Date.parse(tb) : 0) - (ta ? Date.parse(ta) : 0);
//     });

//     res.json(mergedSorted);
//   } catch (err) {
//     console.error('listRoomsForWeb error:', err);
//     res.status(500).json({ message: 'Server error' });
//   }
// };


// Получение комнаты по ID с участниками
const getRoom = async (req, res) => {
    try {
      const actorUserId = Number(req.user?.id ?? req.userId ?? 0);
      const room = await Room.findByPk(req.params.id, {
        include: [
          { model: User, attributes: ['id','name','roleId','avatar','phone','lastSeenAt'] },
          { model: RoomExternalParticipant, as: 'externalParticipants', required: false, where: { status: 'active' } },
        ],
      });
      if (!room) return res.status(404).json({ message: 'Not found' });
      const plainRoom = room.toJSON ? room.toJSON() : room;
      const users = Array.isArray(plainRoom?.Users) ? plainRoom.Users : [];
      const partner = plainRoom?.type === 'personal'
        ? users.find((u) => Number(u?.id) !== actorUserId) || null
        : null;
      res.json({
        ...plainRoom,
        partner,
      });
    } catch (err) {
      console.error('getRoom error', err);
      res.status(500).json({ message: 'Server error' });
    }
}


// Получить участников чата
// GET /admin/rooms/:id/users
const getRoomUsers = async (req, res) => {
  try {
    const room = await Room.findByPk(req.params.id, {
      include: [{ model: User, attributes: ['id','name'], through: { attributes: [] } }]
    });
    if (!room) return res.status(404).json({ message: 'Not found' });
    return res.json(room.Users || []);
  } catch (err) {
    console.error('getRoomUsers error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}



// PUT /admin/rooms/:id
const updateRoom = async (req, res) => {
    try {
      const { name, participants } = req.body;
      const room = await Room.findByPk(req.params.id);
      if (!room) return res.status(404).json({ message: 'Not found' });
      if (name !== undefined) room.name = name;
      await room.save();
      if (Array.isArray(participants)) {
        const normalizedParticipants = Array.from(
          new Set(
            participants
              .map((v) => Number(v))
              .filter((v) => Number.isInteger(v) && v > 0)
          )
        );

        if (room.type === 'personal') {
          const existingRows = await RoomUsers.findAll({
            where: { roomId: room.id },
            attributes: ['userId'],
          });
          const existingUserIds = Array.from(new Set(existingRows.map((r) => Number(r.userId)).filter((v) => Number.isInteger(v) && v > 0))).sort((a, b) => a - b);
          const requestedUserIds = [...normalizedParticipants].sort((a, b) => a - b);
          const sameSet =
            existingUserIds.length === requestedUserIds.length &&
            existingUserIds.every((id, idx) => id === requestedUserIds[idx]);
          const requestedIsSubsetOfExisting =
            requestedUserIds.length > 0 &&
            requestedUserIds.every((id) => existingUserIds.includes(id));

          // Режим "ремонта" personal-чата:
          // разрешаем только удаление лишних участников из уже битого personal (3+ -> ровно 2),
          // без добавления новых пользователей.
          const canRepairBrokenPersonal =
            existingUserIds.length > 2 &&
            requestedUserIds.length === 2 &&
            requestedIsSubsetOfExisting;

          // Для личных чатов запрещаем менять состав через общий admin endpoint.
          // Исключение: если personal уже "битый", разрешаем только ремонт до 2 участников.
          if (!sameSet && !canRepairBrokenPersonal) {
            return res.status(400).json({
              message: 'Нельзя изменять участников личного чата через этот endpoint',
            });
          }

          if (canRepairBrokenPersonal) {
            await room.setUsers(requestedUserIds);
          }
        } else {
          await room.setUsers(normalizedParticipants);
        }
      }
      const full = await Room.findByPk(room.id, {
        include: [{ model: User, attributes: ['id','name','roleId'] }],
      });
      res.json(full);
    } catch (err) {
      console.error('updateRoom error', err);
      res.status(500).json({ message: 'Server error' });
    }
}


// DELETE /admin/rooms/:id
const deleteRoom = async (req, res) => {
    try {
      const room = await Room.findByPk(req.params.id);
      if (!room) return res.status(404).json({ message: 'Not found' });
      await room.destroy();
      res.status(204).end();
    } catch (err) {
      console.error('deleteRoom error', err);
      res.status(500).json({ message: 'Server error' });
    }
}

// PUT /app/rooms/:id/archive
const setRoomArchive = async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    const userId = Number(req.user.id);
    const membership = await RoomUsers.findOne({ where: { roomId, userId, deletedAt: null } });
    if (!membership) {
      return res.status(404).json({ message: 'Чат не найден' });
    }

    const archived = req.body?.archived === true;
    membership.archivedAt = archived ? new Date() : null;
    await membership.save();
    return res.json({ roomId, archived });
  } catch (err) {
    console.error('setRoomArchive error', err);
    return res.status(500).json({ message: 'Не удалось изменить архив' });
  }
};

const getAvailableUsersForRoomCreation = async (req, res) => {
  try {
    const currentUserId = Number(req.user.id);
    const users = await User.findAll({
      where: {
        id: { [Op.ne]: currentUserId },
        isActive: true,
        canChat: true,
        system: false,
      },
      attributes: ['id', 'name', 'roleId', 'avatar', 'canMax', 'canTelegram'],
      order: [['name', 'ASC']],
    });
    res.json(users);
  } catch (error) {
    console.error('getAvailableUsersForRoomCreation error', error);
    res.status(500).json({ error: 'Ошибка получения сотрудников' });
  }
};

const createGroupRoom = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const currentUserId = Number(req.user.id);
    const name = String(req.body?.name || '').trim().slice(0, 80);
    const requestedIds = Array.isArray(req.body?.participants)
      ? req.body.participants
      : req.body?.participantIds;
    const participantIds = Array.from(new Set(
      (Array.isArray(requestedIds) ? requestedIds : [])
        .map(Number)
        .filter((id) => Number.isFinite(id) && id > 0 && id !== currentUserId)
    ));

    if (!name) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Введите название группы' });
    }
    if (participantIds.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Выберите хотя бы одного сотрудника' });
    }

    const allowedUsers = await User.findAll({
      where: {
        id: { [Op.in]: participantIds },
        isActive: true,
        canChat: true,
        system: false,
      },
      attributes: ['id'],
      transaction,
    });
    if (allowedUsers.length !== participantIds.length) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Один или несколько сотрудников недоступны для чата' });
    }

    const room = await Room.create({
      name,
      type: 'group',
      creatorUserId: currentUserId,
    }, { transaction });
    await room.setUsers([currentUserId, ...participantIds], { transaction });
    await transaction.commit();

    const fullRoom = await Room.findByPk(room.id, {
      include: [{ model: User, attributes: ['id', 'name', 'roleId'] }],
    });
    res.status(201).json(fullRoom);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('createGroupRoom error', error);
    res.status(500).json({ error: 'Ошибка создания группы' });
  }
};

const updateGroupRoomParticipants = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const roomId = Number(req.params.id);
    const currentUserId = Number(req.user?.id || 0);
    const requestedIdsRaw = Array.isArray(req.body?.participants)
      ? req.body.participants
      : req.body?.participantIds;
    const requestedIds = Array.from(new Set(
      (Array.isArray(requestedIdsRaw) ? requestedIdsRaw : [])
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0)
    ));

    if (!roomId || !currentUserId) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Некорректный запрос' });
    }

    const room = await Room.findByPk(roomId, { transaction });
    if (!room) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Чат не найден' });
    }
    if (room.type !== 'group') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Состав можно менять только у группового чата' });
    }
    if (Number(room.creatorUserId || 0) !== currentUserId) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Редактировать группу может только ее создатель' });
    }

    const finalIds = Array.from(new Set([currentUserId, ...requestedIds]));
    if (finalIds.length < 2) {
      await transaction.rollback();
      return res.status(400).json({ error: 'В группе должен быть хотя бы один сотрудник кроме вас' });
    }

    const allowedUsers = await User.findAll({
      where: {
        id: { [Op.in]: finalIds },
        canChat: true,
        system: false,
        [Op.or]: [
          { isActive: true },
          { phone: { [Op.like]: 'xbridge:%' } },
        ],
      },
      attributes: ['id'],
      transaction,
    });
    const allowedIds = new Set(allowedUsers.map((row) => Number(row.id)));
    if (finalIds.some((id) => !allowedIds.has(id))) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Один или несколько сотрудников недоступны для чата' });
    }

    await room.setUsers(finalIds, { transaction });
    await transaction.commit();

    const fullRoom = await Room.findByPk(roomId, {
      include: [
        { model: User, attributes: ['id', 'name', 'roleId', 'avatar', 'phone', 'lastSeenAt'] },
        { model: RoomExternalParticipant, as: 'externalParticipants', required: false, where: { status: 'active' } },
      ],
    });
    const payload = {
      roomId,
      creatorUserId: room.creatorUserId || null,
      participantIds: finalIds,
      Users: fullRoom?.Users || [],
      externalParticipants: fullRoom?.externalParticipants || [],
    };
    const io = req.app.get('io');
    if (io) io.to('room-' + roomId).emit('room:participants_updated', payload);
    return res.json({ success: true, room: fullRoom, ...payload });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error('updateGroupRoomParticipants error', error);
    return res.status(500).json({ error: 'Не удалось обновить состав группы' });
  }
};

const deleteGroupRoomExternalParticipant = async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    const participantId = Number(req.params.participantId);
    const currentUserId = Number(req.user?.id || 0);

    if (!roomId || !participantId || !currentUserId) {
      return res.status(400).json({ error: 'Некорректный запрос' });
    }

    const room = await Room.findByPk(roomId, {
      attributes: ['id', 'name', 'type', 'creatorUserId'],
    });
    if (!room) return res.status(404).json({ error: 'Чат не найден' });
    if (room.type !== 'group') {
      return res.status(400).json({ error: 'Внешние участники доступны только в группах' });
    }
    if (Number(room.creatorUserId || 0) !== currentUserId) {
      return res.status(403).json({ error: 'Редактировать группу может только ее создатель' });
    }

    const participant = await RoomExternalParticipant.findOne({
      where: { id: participantId, roomId },
    });
    if (!participant) return res.status(404).json({ error: 'Внешний участник не найден' });

    await participant.update({ status: 'removed' });

    const externalParticipants = await RoomExternalParticipant.findAll({
      where: { roomId, status: 'active' },
      order: [['kind', 'ASC'], ['displayName', 'ASC']],
    });

    const io = req.app.get('io');
    if (io) {
      io.to('room-' + roomId).emit('room:external_participants_updated', {
        roomId,
        participant: participant.toJSON ? participant.toJSON() : participant,
        externalParticipants,
      });
    }

    return res.json({ success: true, roomId, participantId, externalParticipants });
  } catch (error) {
    console.error('deleteGroupRoomExternalParticipant error', error);
    return res.status(500).json({ error: 'Не удалось удалить внешнего участника' });
  }
};
const createGroupRoomExternalInvite = async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    const currentUserId = Number(req.user?.id || 0);
    const kind = normalizeKind(req.body?.kind);

    if (!roomId || !currentUserId || !kind) {
      return res.status(400).json({ error: 'Некорректное приглашение' });
    }

    const room = await Room.findByPk(roomId, {
      attributes: ['id', 'name', 'type', 'creatorUserId'],
    });
    if (!room) return res.status(404).json({ error: 'Чат не найден' });
    if (room.type !== 'group') {
      return res.status(400).json({ error: 'Внешних участников можно приглашать только в группу' });
    }
    if (Number(room.creatorUserId || 0) !== currentUserId) {
      return res.status(403).json({ error: 'Приглашать может только владелец группы' });
    }

    const invite = createRoomExternalInvitePayload({ roomId, inviterId: currentUserId, kind });
    if (!invite) {
      return res.status(503).json({ error: 'Секрет приглашений не настроен' });
    }

    let url = '';
    const command = `/start ${invite.payload}`;
    let text = command;
    if (kind === 'telegram') {
      if (!String(process.env.TELEGRAM_ROOM_TOKEN || '').trim()) {
        return res.status(503).json({ error: 'Telegram-бот для групп не подключен' });
      }
      let botUsername = String(process.env.TELEGRAM_ROOM_BOT_USERNAME || '')
        .trim()
        .replace(/^@/, '');
      if (!botUsername) {
        const me = await telegramRequest('getMe', {}, { botType: 'room' });
        botUsername = String(me?.username || '').trim().replace(/^@/, '');
      }
      if (!botUsername) return res.status(503).json({ error: 'Не удалось определить имя Telegram-бота' });
      url = `https://t.me/${botUsername}?start=${encodeURIComponent(invite.payload)}`;
      text = url;
    } else if (kind === 'max') {
      url = buildMaxRoomBotLink(invite.payload);
      text = url || command;
    }

    return res.json({
      success: true,
      kind,
      roomId,
      roomName: room.name,
      payload: invite.payload,
      url,
      text,
      command,
      expiresAt: invite.expiresAt,
    });
  } catch (error) {
    console.error('createGroupRoomExternalInvite error', error);
    return res.status(500).json({ error: 'Не удалось создать приглашение' });
  }
};
// PUT /app/rooms/:id/read
const markRoomAsRead = async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    const userId = Number(req.user.id);
    const requestedLastRead = Number(req.body?.lastReadMessageId);
    if (!roomId || !userId || !requestedLastRead) {
      return res.status(400).json({ message: 'Некорректная отметка прочтения' });
    }

    const membership = await RoomUsers.findOne({
      where: { roomId, userId, deletedAt: null },
    });
    if (!membership) {
      return res.status(404).json({ message: 'Чат не найден' });
    }

    const safeLastRead =
      Number(
        await RoomMessage.max('id', {
          where: { roomId, id: { [Op.lte]: requestedLastRead } },
        })
      ) || 0;
    if (!safeLastRead) {
      return res.status(404).json({ message: 'Сообщение не найдено' });
    }

    const previousLastRead = Number(membership.lastReadMessageId || 0);
    if (previousLastRead < safeLastRead) {
      membership.lastReadMessageId = safeLastRead;
      await membership.save();
    }

    const payload = { roomId, userId, lastReadMessageId: safeLastRead };
    const io = req.app.get('io');
    if (io) {
      io.emit('readStatusUpdated', payload);
    }
    readDebugLog('[ReadDebug][backend:http-markAsRead][saved]', {
      ...payload,
      previousLastRead,
    });
    return res.json({ ok: true, ...payload });
  } catch (err) {
    console.error('markRoomAsRead error', err);
    return res.status(500).json({ message: 'Не удалось сохранить отметку прочтения' });
  }
};

const hardDeleteRoomData = async (roomId, transaction) => {
  const messageRows = await RoomMessage.findAll({
    where: { roomId },
    attributes: ['id'],
    transaction,
  });
  const messageIds = messageRows.map((message) => message.id);

  if (messageIds.length > 0) {
    if (RoomMessageReaction) {
      await RoomMessageReaction.destroy({ where: { messageId: { [Op.in]: messageIds } }, transaction });
    }
    if (MessageDelivery) {
      await MessageDelivery.destroy({ where: { messageId: { [Op.in]: messageIds } }, transaction });
    }
  }
  if (RoomPinnedArchive) await RoomPinnedArchive.destroy({ where: { roomId }, transaction });
  if (RoomPinnedMessage) await RoomPinnedMessage.destroy({ where: { roomId }, transaction });
  if (ScheduledMessage) await ScheduledMessage.destroy({ where: { roomId }, transaction });
  await RoomUsers.destroy({ where: { roomId }, transaction });
  await RoomMessage.destroy({ where: { roomId }, transaction });
  await Room.destroy({ where: { id: roomId }, transaction });
};

// DELETE /app/rooms/:id
const deleteOwnRoom = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const roomId = Number(req.params.id);
    const userId = Number(req.user.id);
    const room = await Room.findByPk(roomId, { transaction });
    if (!room) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Чат не найден' });
    }
    const membership = await RoomUsers.findOne({
      where: { roomId, userId },
      transaction,
    });
    if (!membership || membership.deletedAt) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Чат не найден' });
    }
    if (room.type !== 'personal' && Number(room.creatorUserId) !== userId) {
      await transaction.rollback();
      return res.status(403).json({ message: 'Удалить чат может только его создатель' });
    }

    if (CrossCompanyChatRequest) {
      const crossChat = await CrossCompanyChatRequest.findOne({
        where: { roomId },
        transaction,
      });
      if (crossChat) {
        await transaction.rollback();
        return res.status(409).json({ message: 'Cross-bridge чат нужно удалить через действие bridge-чата' });
      }
    }

    if (room.type === 'personal') {
      membership.deletedAt = new Date();
      membership.archivedAt = null;
      await membership.save({ transaction });

      const remainingMembers = await RoomUsers.count({
        where: { roomId, deletedAt: null },
        transaction,
      });
      if (remainingMembers === 0) {
        await hardDeleteRoomData(roomId, transaction);
      }
    } else {
      await hardDeleteRoomData(roomId, transaction);
    }

    await transaction.commit();
    return res.json({
      ok: true,
      roomId,
      deletedForUser: room.type === 'personal',
    });
  } catch (err) {
    await transaction.rollback();
    console.error('deleteOwnRoom error', err);
    return res.status(500).json({ message: 'Не удалось удалить чат' });
  }
};




module.exports = { createRoom, listRoomsForAdmin, listRoomsForApp, getRoom, updateRoom, deleteRoom, getRoomUsers, 
  listRoomsForWeb, autoCreatePersonalChats, getAvailableUsersForPersonalChat, getOrCreatePersonalRoom,
  getAvailableUsersForRoomCreation, createGroupRoom, updateGroupRoomParticipants, createGroupRoomExternalInvite, deleteGroupRoomExternalParticipant,
  setRoomArchive, markRoomAsRead, deleteOwnRoom
};

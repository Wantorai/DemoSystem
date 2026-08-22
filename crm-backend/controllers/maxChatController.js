const { MaxChat, MaxMessage, User, PushToken, sequelize } = require('../models');
const { withReactions, toggleReaction } = require('../services/externalMessageReactions');
const { createPersonalInvitePayload, buildMaxBotLink } = require('../services/maxInvite');
const axios = require('axios');
const { getIO } = require('../socket');
require('dotenv').config();
const fs = require('fs');
const FormData = require('form-data');
const { Op } = require('sequelize');

const normalizePhoneForMax = (rawPhone = '') => {
  const digits = String(rawPhone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `7${digits}`;
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
  return digits;
};

const makePhoneRecipient = (phoneDigits) => `phone:${phoneDigits}`;

const getMaxRecipientQuery = (maxUserId = '') => {
  const value = String(maxUserId || '');
  if (value.startsWith('phone:')) return null;
  return `user_id=${encodeURIComponent(value)}`;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const postMessageWithAttachmentRetry = async ({
  recipientQuery,
  messageBody,
  botToken,
  maxAttempts = 4,
  initialDelayMs = 1200,
  maxDelayMs = 8000,
  requestTimeoutMs = 12000,
  backoffFactor = 1.7,
  maxTotalMs = 45000,
}) => {
  let attempt = 0;
  let delayMs = initialDelayMs;
  let lastError;
  const startedAt = Date.now();

  while (attempt < maxAttempts) {
    if ((Date.now() - startedAt) >= maxTotalMs) {
      break;
    }
    attempt += 1;
    try {
      return await axios.post(
        `https://platform-api2.max.ru/messages?${recipientQuery}`,
        messageBody,
        {
          headers: {
            Authorization: `${botToken}`,
            'Content-Type': 'application/json',
          },
          timeout: requestTimeoutMs,
        }
      );
    } catch (error) {
      lastError = error;
      const status = Number(error?.response?.status);
      const code = String(error?.response?.data?.code || '');
      const isAttachmentNotReady = status === 400 && code === 'attachment.not.ready';

      if (!isAttachmentNotReady || attempt >= maxAttempts) {
        throw error;
      }

      console.warn('[MAX][sendMessage][attachment-not-ready]', {
        attempt,
        maxAttempts,
        delayMs,
      });
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, maxTotalMs - elapsed);
      if (remaining <= 0) break;
      await sleep(Math.min(delayMs, remaining));
      delayMs = Math.min(Math.round(delayMs * backoffFactor), maxDelayMs);
    }
  }

  throw lastError || new Error('MAX message send failed');
};

const normalizeParticipantIds = (value) => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v > 0)
    )
  );
};

const computeMaxMembership = (chatData, currentUserId) => {
  const ownerId = Number(chatData?.assigneeId || 0);
  const participants = normalizeParticipantIds(chatData?.participantIds);
  const me = Number(currentUserId || 0);
  const isOwner = ownerId > 0 && ownerId === me;
  const isParticipant = ownerId > 0 && !isOwner && participants.includes(me);
  return { ownerId, participants, isOwner, isParticipant };
};

const getMaxBotType = (chatData) => chatData?.botType === 'personal' ? 'personal' : 'business';
const isPersonalMaxChat = (chatData) => getMaxBotType(chatData) === 'personal';
const canAccessMaxChat = (chatData, currentUserId) => {
  if (!isPersonalMaxChat(chatData)) return true;
  return Number(chatData?.assigneeId || 0) === Number(currentUserId || 0);
};




exports.createPersonalInvite = async (req, res) => {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ error: 'Не авторизован' });
    if (!String(process.env.MAX_TOKEN || '').trim()) {
      return res.status(503).json({ error: 'MAX-бот не подключен' });
    }

    const invite = createPersonalInvitePayload(userId);
    if (!invite) {
      return res.status(503).json({ error: 'Секрет личных MAX-приглашений не настроен' });
    }

    const url = buildMaxBotLink(invite.payload);
    return res.json({
      success: true,
      url,
      text: `/start ${invite.payload}`,
      payload: invite.payload,
      expiresAt: invite.expiresAt,
    });
  } catch (error) {
    console.error('[MaxPersonal] create invite failed', error?.response?.data || error);
    return res.status(500).json({ error: 'Не удалось создать приглашение MAX-чата' });
  }
};

exports.getMaxChats = async (req, res) => {
  try {
    //console.log('🔥 getMaxChats CALLED');
    
    // Получаем ID текущего пользователя
    // Предполагается, что middleware аутентификации добавил user в req
    const currentUserId = req.user?.id;
    
    if (!currentUserId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }
    
    // Групповые MAX-чаты показываем всем, personal MAX-чаты - только владельцу.
    const chats = await MaxChat.findAll({
      where: {
        [Op.or]: [
          { botType: { [Op.ne]: 'personal' } },
          { botType: null },
          { botType: 'personal', assigneeId: currentUserId },
        ],
      },
      order: [['updatedAt', 'DESC']],
      attributes: {
        include: [
          [
            sequelize.literal(`(
              SELECT text
              FROM max_messages
              WHERE "mChatId" = "MaxChat"."id"
              ORDER BY "createdAt" DESC
              LIMIT 1
            )`),
            'lastMessage',
          ],
          [
            sequelize.literal(`(
              SELECT COUNT(*)
              FROM max_messages
              WHERE "mChatId" = "MaxChat"."id"
                AND "fromMe" = false
                AND "isRead" = false
            )`),
            'unreadCount',
          ],
        ],
      },
      include: [
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'name'],
          required: false,
        }
      ],
    });

    //console.log(`Найдено ${chats.length} чатов`);
    
    // Форматируем ответ
    const formattedChats = chats.map(chat => {
      const chatData = chat.get({ plain: true });
      
      const membership = computeMaxMembership(chatData, currentUserId);
      return {
        id: chatData.id,
        username: chatData.username,
        lastMessage: chatData.lastMessage || 'Фото или голосовое сообщение',
        unreadCount: parseInt(chatData.unreadCount) || 0,
        updatedAt: chatData.updatedAt,
        assigneeId: chatData.assigneeId,
        assigneeName: chatData.assignee ? chatData.assignee.name : null,
        participantIds: membership.participants,
        isOwner: membership.isOwner,
        isParticipant: membership.isParticipant,
        isAssignedToMe: membership.isOwner,
        botType: getMaxBotType(chatData),
        isPersonal: isPersonalMaxChat(chatData),
        archived: Boolean(chatData.archivedAt),
        archivedAt: chatData.archivedAt || null,
        // Добавляем старые поля для совместимости (если нужно)
        maxChatId: chatData.maxChatId,
      };
    });

    res.json(formattedChats);
    
  } catch (error) {
    console.error('❌ Ошибка получения чатов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};



// Получить информацию о чате
exports.getChat = async (req, res) => {
  try {
    const { id } = req.params;
    
    const chat = await MaxChat.findByPk(id, {
      include: [
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'name', 'phone'], // Возвращаем нужные поля пользователя
          required: false
        }
      ]
    });
    
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    const chatPlain = chat.get({ plain: true });
    if (!canAccessMaxChat(chatPlain, req.user?.id)) {
      return res.status(403).json({ error: 'Доступ к личному MAX-чату есть только у владельца' });
    }

    const membership = computeMaxMembership(chatPlain, req.user?.id);

    // Форматируем ответ
    const response = {
      id: chat.id,
      maxChatId: chat.maxChatId,
      maxUserId: chat.maxUserId,
      username: chat.username,
      unreadCount: chat.unreadCount || 0,
      lastMessageText: chat.lastMessageText || '',
      lastMessageTime: chat.lastMessageTime || chat.createdAt,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      // Добавляем новые поля
      assigneeId: chat.assigneeId || null,
      assigneeName: chat.assignee ? chat.assignee.name : null,
      assigneePhone: chat.assignee ? chat.assignee.phone : null,
      participantIds: membership.participants,
      isOwner: membership.isOwner,
      isParticipant: membership.isParticipant,
      botType: getMaxBotType(chat),
      isPersonal: isPersonalMaxChat(chat),
      archived: Boolean(chat.archivedAt),
      archivedAt: chat.archivedAt || null,
      isClosed: chat.isClosed || false,
      // Для совместимости со старым кодом
      messages: [] // Если нужно включать сообщения
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Error fetching chat:', error);
    res.status(500).json({ error: 'Failed to fetch chat' });
  }
};



// Отметить все сообщения в чате как прочитанные
exports.markChatAsRead = async (req, res) => {
  try {
    const { chatId } = req.params;
    
   //console.log(`Marking chat ${chatId} as read`);
    
    // Находим чат
    const chat = await MaxChat.findByPk(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    // Считаем сколько непрочитанных сообщений
    const unreadMessages = await MaxMessage.findAll({
      where: {
        mChatId: chatId,
        fromMe: false,
        isRead: false
      }
    });
    
   //console.log(`Found ${unreadMessages.length} unread messages`);
    
    // Помечаем каждое сообщение как прочитанное
    for (const message of unreadMessages) {
      await message.update({ isRead: true });
    }
    
    // Обновляем счетчик в чате (хук afterUpdate уже это сделал, но для надежности)
    await chat.update({ unreadCount: 0 });
    
    res.json({ 
      success: true, 
      markedAsRead: unreadMessages.length,
      unreadCount: 0
    });
  } catch (error) {
    console.error('Error marking chat as read:', error);
    res.status(500).json({ error: 'Failed to mark chat as read' });
  }
};

// Отметить одно сообщение как прочитанное
exports.markMessageAsRead = async (req, res) => {
  try {
    const { messageId } = req.params;
    
    const message = await MaxMessage.findByPk(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Обновляем только если сообщение от клиента и еще не прочитано
    if (message.fromMe === false && !message.isRead) {
      await message.update({ isRead: true });
      
      // Обновляем счетчик в чате
      const chat = await message.getMaxChat();
      if (chat) {
        const newUnreadCount = Math.max(0, chat.unreadCount - 1);
        await chat.update({ unreadCount: newUnreadCount });
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
};


exports.getMessagesByChat = async (req, res) => {
  const { id } = req.params;

  const chat = await MaxChat.findByPk(id);
  if (!chat) {
    return res.status(404).json({ error: 'Чат не найден' });
  }
  if (!canAccessMaxChat(chat, req.user?.id)) {
    return res.status(403).json({ error: 'Доступ к личному MAX-чату есть только у владельца' });
  }

  const messages = await MaxMessage.findAll({
    where: { mChatId: id },
    order: [['createdAt', 'ASC']],
  });

  res.json(await withReactions(messages, 'max', req.user?.id));
};

exports.toggleMessageReaction = async (req, res) => {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ error: 'Не авторизован' });
    const chat = await MaxChat.findByPk(req.params.id);
    if (!chat || !canAccessMaxChat(chat, userId)) return res.status(404).json({ error: 'Чат не найден' });
    const message = await MaxMessage.findOne({ where: { id: req.params.messageId, mChatId: chat.id } });
    if (!message) return res.status(404).json({ error: 'Сообщение не найдено' });
    const updated = await toggleReaction({ channel: 'max', message, userId, emoji: String(req.body?.emoji || '') });
    getIO().to(`room-max-${chat.id}`).emit('max:message-reaction-updated', { chatId: chat.id, message: updated });
    return res.json({ message: updated });
  } catch (error) {
    console.error('[MAX] toggle reaction failed', error);
    return res.status(error.status || 500).json({ error: error.message || 'Не удалось обновить реакцию' });
  }
};

exports.startChatByPhone = async (req, res) => {
  try {
    const rawPhone = req.body?.phone;
    const clientName = String(req.body?.clientName || '').trim();
    const normalizedPhone = normalizePhoneForMax(rawPhone);

    if (!normalizedPhone || normalizedPhone.length < 11) {
      return res.status(400).json({
        success: false,
        error: 'Укажите корректный номер телефона',
      });
    }

    const manualChatId = `manual:${normalizedPhone}`;
    const phoneRecipient = makePhoneRecipient(normalizedPhone);

    const existing = await MaxChat.findOne({
      where: {
        [Op.or]: [
          { maxChatId: manualChatId },
          { maxUserId: phoneRecipient },
        ],
      },
      include: [
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'name'],
          required: false,
        },
      ],
    });

    if (existing) {
      return res.json({
        success: true,
        created: false,
        chat: {
          id: existing.id,
          username: existing.username,
          assigneeId: existing.assigneeId || null,
          assigneeName: existing.assignee ? existing.assignee.name : null,
          maxChatId: existing.maxChatId,
        },
      });
    }

    const currentUserId = req.user?.id || null;
    const currentUserName = req.user?.name || null;
    const defaultName = clientName || `MAX +${normalizedPhone}`;

    const createdChat = await MaxChat.create({
      maxChatId: manualChatId,
      maxUserId: phoneRecipient,
      username: defaultName,
      assigneeId: currentUserId,
      unreadCount: 0,
      lastMessageText: null,
      lastMessageTime: null,
      isClosed: false,
    });

    const io = getIO();
    io.emit('max:new-chat', {
      id: createdChat.id,
      username: createdChat.username,
      assigneeId: createdChat.assigneeId,
      assigneeName: currentUserName,
      unreadCount: 0,
      maxChatId: createdChat.maxChatId,
      updatedAt: createdChat.updatedAt,
    });

    return res.json({
      success: true,
      created: true,
      chat: {
        id: createdChat.id,
        username: createdChat.username,
        assigneeId: createdChat.assigneeId || null,
        assigneeName: currentUserName,
        maxChatId: createdChat.maxChatId,
      },
    });
  } catch (error) {
    console.error('❌ Ошибка создания MAX-чата по телефону:', error);
    return res.status(500).json({
      success: false,
      error: 'Не удалось создать чат по номеру телефона',
    });
  }
};



const resolveMaxReply = async (chatId, replyToMessageId) => {
  const localId = Number(replyToMessageId || 0);
  if (!localId) return null;
  const replied = await MaxMessage.findOne({ where: { id: localId, mChatId: chatId } });
  if (!replied) return null;
  return {
    externalMessageId: String(replied.maxMessageId || ''),
    meta: {
      messageId: replied.id,
      externalMessageId: String(replied.maxMessageId || ''),
      authorName: replied.senderName || (replied.fromMe ? 'Вы' : 'MAX'),
      content: String(replied.text || '').trim() || 'Вложение',
    },
  };
};

exports.sendMessageToMax = async (req, res) => {

  //console.log('1. 📥 Запрос получен, chatId:', req.params.id, 'text:', req.body.text);

  const { id } = req.params;
  const { text, senderName, senderId, replyToMessageId } = req.body;

  const chat = await MaxChat.findByPk(id);

  if (!chat) {
    return res.status(404).json({ 
      error: 'Чат не найден',
      success: false 
    });
  }
  if (!canAccessMaxChat(chat, senderId || req.user?.id)) {
    return res.status(403).json({
      error: 'Доступ к личному MAX-чату есть только у владельца',
      success: false,
    });
  }  

  //console.log('text = ', text, 'chat = ', chat)


  // Флаг, указывающий было ли только что произведено назначение
  let wasAssigned = false;  



  // Если чат еще не назначен, назначаем текущего пользователя
  const participantIds = normalizeParticipantIds(chat.participantIds);
  if (!chat.assigneeId) {
    chat.assigneeId = senderId;
    await chat.save();
    wasAssigned = true;
    //console.log(`✅ Чат ${id} назначен пользователю ${senderId}`);
  } else if (chat.assigneeId !== senderId && !participantIds.includes(Number(senderId))) {
    // Если чат уже назначен другому пользователю
    return res.status(403).json({ 
      error: 'Чат уже взят другим сотрудником',
      assigneeId: chat.assigneeId,
      success: false
    });
  }

  const reply = await resolveMaxReply(chat.id, replyToMessageId);
  const localMessage = await MaxMessage.create({
    mChatId: chat.id,
    maxMessageId: `local-${Date.now()}`,
    text,
    fromMe: true,
    senderName, // Сохраняем имя отправителя
    senderId,   // Сохраняем ID отправителя
    attachments: reply ? { _reply: reply.meta } : null,
  });

  //console.log('localMessage = ', localMessage)

  try {
    //console.log('2. 📤 Отправляю в MAX API, user_id:', chat.maxUserId);
    const recipientQuery = getMaxRecipientQuery(chat.maxUserId);
    if (!recipientQuery) {
      return res.status(400).json({
        success: false,
        error: 'MAX API не поддерживает отправку по номеру телефона. Нужен user_id или chat_id (клиент должен сначала написать боту).',
      });
    }
    const response = await axios.post(
      `https://platform-api2.max.ru/messages?${recipientQuery}`,
      {
        text,
        ...(reply?.externalMessageId ? { link: { type: 'reply', mid: reply.externalMessageId } } : {}),
      },
      {
        headers: {
          Authorization: `${process.env.MAX_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    //console.log('3. ✅ Ответ от MAX API получен, статус:', response.status);
    //console.log('4. 📦 Тело ответа от MAX:', JSON.stringify(response.data));

    // ВАЖНО: mid находится в response.data.message.body.mid
    const messageIdFromApi = response.data?.message?.body?.mid;
    //console.log('5. 🔍 Извлеченный ID сообщения:', messageIdFromApi);

    if (messageIdFromApi) {
        await localMessage.update({ maxMessageId: messageIdFromApi });
        //console.log('6. 💾 Локальное сообщение обновлено с maxMessageId:', messageIdFromApi);
    } else {
        console.warn('⚠️ В ответе MAX не найден mid. Оставляю локальный ID.');
    }

    // //console.log('7. 🔌 Пытаюсь получить io...');
    // const io = getIO();
    // //console.log('8. 📡 Эмичу в комнату:', `room-max-${chat.id}`);


    // // 4. Эмитим сообщение всем подключенным клиентам через сокет
    // io.to(`room-max-${chat.id}`).emit('max:new-message', {
    //   chatId: chat.id,
    //   message: localMessage,
    // });



    // Уведомляем всех через сокеты о назначении чата (если оно произошло)
    if (wasAssigned) {
      const io = getIO(); // Убедитесь, что getIO импортирован
      io.to(`room-max-${chat.id}`).emit('max:chat-assigned', {
        chatId: chat.id,
        assigneeId: senderId,
        assigneeName: senderName,
      });
      //console.log(`📢 Отправлено уведомление о назначении чата ${chat.id} пользователю ${senderId}`);
    }


    // Возвращаем расширенный ответ с информацией о назначении
    res.json({
      success: true,
      message: localMessage,
      chat: {
        id: chat.id,
        assigneeId: chat.assigneeId,
        wasAssigned: wasAssigned, // Был ли чат только что назначен
        assignedToMe: true, // Чат назначен текущему пользователю
      },
      maxSent: true,
      maxMessageId: messageIdFromApi || null,
    });

  } catch (e) {
    console.error('❌ ВСЯ ОШИБКА в catch:', e.message);
    console.error('❌ Stack trace:', e.stack);
    
    if (e.response) {
      console.error('❌ Данные ответа об ошибке:', e.response.data);
    }

    // // Даже если отправка в MAX не удалась, сообщаем о назначении чата
    // if (wasAssigned) {
    //   const io = getIO();
    //   io.to(`room-max-${chat.id}`).emit('max:chat-assigned', {
    //     chatId: chat.id,
    //     assigneeId: senderId,
    //     assigneeName: senderName,
    //   });
    // }

    // Возвращаем ответ с ошибкой отправки в MAX, но с информацией о назначении
    res.status(500).json({
      success: false,
      error: `Ошибка отправки в MAX: ${e.message}`,
      message: localMessage,
      chat: {
        id: chat.id,
        assigneeId: chat.assigneeId,
        wasAssigned: wasAssigned,
        assignedToMe: true,
      },
      maxSent: false,
    });

  }
};



// Функция для обработки аудио с приложения и отправки в MAX
exports.sendAudioToMax = async (req, res) => {
  let stage = 'init';
  try {
    // console.log('🎤 [1] Начало обработки аудио');
    const botToken = process.env.MAX_TOKEN;

    const { id } = req.params;
    const file = req.file;
    const { senderName, senderId, replyToMessageId } = req.body;
    
    // console.log('📁 Файл:', file.filename, 'размер:', file.size);

    // Находим чат
    const chat = await MaxChat.findByPk(id);
    if (!chat) {
      fs.unlinkSync(file.path);
      return res.status(404).json({ error: 'Чат не найден' });
    }
    const reply = await resolveMaxReply(chat.id, replyToMessageId);

    // console.log('🔗 [2] Запрашиваю upload URL у MAX...');
    
    // 1. Получаем URL для загрузки + ТОКЕН (для аудио токен приходит здесь!)
    stage = 'max:uploads:get-url';
    const uploadUrlResponse = await axios.post(
      'https://platform-api2.max.ru/uploads?type=audio',
      {},
      {
        headers: {
          'Authorization': `${botToken}`,
        },
        timeout: 30000,
      }
    );

    const uploadUrl = uploadUrlResponse.data.url;
    const audioToken = uploadUrlResponse.data.token; // ВАЖНО: токен здесь!
    
    // console.log('✅ [2] Получен upload URL:', uploadUrl);
    // console.log('🔑 [2] Получен аудио-токен:', audioToken);
    // console.log('📦 Полный ответ:', JSON.stringify(uploadUrlResponse.data, null, 2));

    if (!audioToken) {
      throw new Error('Токен не получен в ответе на POST /uploads');
    }

    // 2. Подготавливаем FormData для загрузки файла
    // console.log('⬆️ [3] Готовлю FormData для загрузки файла на CDN...');
    const formData = new FormData();
    
    // Поле должно называться "data" как в документации
    const originalName = String(file.originalname || 'voice_message.m4a');
    const isM4a = originalName.toLowerCase().endsWith('.m4a');
    const normalizedAudioMime = isM4a ? 'audio/m4a' : (file.mimetype || 'audio/mp4');
    formData.append('data', fs.createReadStream(file.path), {
      filename: originalName,
      contentType: normalizedAudioMime,
    });

    // console.log('📤 [4] Загружаю файл на MAX CDN...');
    
    // 3. Загружаем файл на MAX CDN (ожидаем retval ответ)
    const uploadAudioToCdn = async () => {
      const cdnFormData = new FormData();
      cdnFormData.append('data', fs.createReadStream(file.path), {
        filename: originalName,
        contentType: normalizedAudioMime,
      });
      return axios.post(uploadUrl, cdnFormData, {
        headers: {
          ...cdnFormData.getHeaders(),
          'Authorization': `${botToken}`,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        responseType: 'text',
        timeout: 120000,
      });
    };

    stage = 'max:uploads:cdn-push';
    let uploadResponse;
    try {
      uploadResponse = await uploadAudioToCdn();
    } catch (firstUploadErr) {
      console.warn('[MAX][audio][cdn-upload][retry-1]', {
        message: firstUploadErr?.message,
        status: firstUploadErr?.response?.status,
      });
      await sleep(1200);
      uploadResponse = await uploadAudioToCdn();
    }

    // console.log('✅ [4] Файл загружен на MAX CDN');
    // console.log('📦 Ответ от CDN (raw):', uploadResponse.data);
    
    // Проверяем ответ от CDN - должен содержать <retval>1</retval>
    if (uploadResponse.data.includes('<retval>1</retval>')) {
      //console.log('✅ CDN подтвердил успешную загрузку файла');
    } else {
      console.warn('⚠️ Неожиданный ответ от CDN:', uploadResponse.data);
      // Продолжаем, так как токен у нас уже есть
    }

    // 4. Пауза перед отправкой сообщения (обработка файла на стороне MAX)
    //console.log('⏳ [5] Жду обработку файла на стороне MAX (3 секунды)...');
    await new Promise(resolve => setTimeout(resolve, 1500));


    // 5. Создаем локальное сообщение с токеном
    //console.log('💾 [6] Создаю локальное сообщение...');
    const localMessage = await MaxMessage.create({
      mChatId: chat.id,
      maxMessageId: `local-audio-${Date.now()}`,
      text: '',
      fromMe: true,
      messageType: 'audio',
      senderName, // Сохраняем имя отправителя
      senderId,   // Сохраняем ID отправителя
      attachments: {
        ...(reply ? { _reply: reply.meta } : {}),
        audio: {
          token: audioToken,
          localPath: file.path,
          // Сохраняем также uploadUrl для отладки
          uploadUrl: uploadUrl,
        }
      }
    });

    // 6. Формируем тело сообщения для MAX API
    //console.log('📝 [7] Формирую тело сообщения для MAX API...');
    const messageBody = {
      text: '', // Можно оставить пустым или добавить текст
      ...(reply?.externalMessageId ? { link: { type: 'reply', mid: reply.externalMessageId } } : {}),
      attachments: [
        {
          type: 'audio',
          payload: {
            token: audioToken // Используем токен из первого шага
          }
        }
      ]
    };

    // console.log('📨 [8] Отправляю сообщение в MAX API...');
    // console.log('📄 Тело сообщения:', JSON.stringify(messageBody, null, 2));

    // 7. Отправляем сообщение с аудио через MAX API
    const recipientQuery = getMaxRecipientQuery(chat.maxUserId);
    if (!recipientQuery) {
      return res.status(400).json({
        success: false,
        error: 'MAX API не поддерживает отправку по номеру телефона. Нужен user_id или chat_id (клиент должен сначала написать боту).',
      });
    }
    stage = 'max:messages:send';
    const messageResponse = await postMessageWithAttachmentRetry({
      recipientQuery,
      messageBody,
      botToken,
      maxAttempts: 7,
      initialDelayMs: 1500,
      maxDelayMs: 8000,
      requestTimeoutMs: 12000,
      backoffFactor: 1.7,
      maxTotalMs: 50000,
    });

    //console.log('✅ [8] Сообщение отправлено в MAX API');
    //console.log('📦 Ответ от /messages:', 
     // JSON.stringify(messageResponse.data, null, 2));

    // 8. Обновляем с реальным mid
    const messageIdFromApi = messageResponse.data?.message?.body?.mid;
    if (messageIdFromApi) {
      await localMessage.update({ 
        maxMessageId: messageIdFromApi,
      });
      //console.log('🆔 [9] Обновлен maxMessageId:', messageIdFromApi);
      
      // Также обновим attachments с дополнительными данными из ответа, если есть
      if (messageResponse.data?.message?.body?.attachments?.[0]?.payload) {
        await localMessage.update({
          attachments: {
            audio: {
              ...localMessage.attachments.audio,
              ...messageResponse.data.message.body.attachments[0].payload
            }
          }
        });
      }
    }

    // // 9. Эмитим через сокеты
    // const io = getIO();
    // io.to(`room-max-${chat.id}`).emit('max:new-message', {
    //   chatId: chat.id,
    //   message: localMessage,
    // });

    //console.log('📨 [10] Сообщение эмитнуто в комнату');

    // 10. Удаляем временный файл
    fs.unlink(file.path, (err) => {
      if (err) console.error('Ошибка удаления файла:', err);
    //   else//console.log('🧹 Временный файл удален');
    });

    // 11. Отправляем ответ клиенту
    res.json(localMessage);

  } catch (error) {
    console.error('❌ Критическая ошибка при отправке аудио:');
    console.error('❌ Этап:', stage);
    console.error('❌ Сообщение:', error.message);
    
    if (error.response) {
      console.error('❌ Статус:', error.response.status);
      console.error('❌ Данные ошибки:', 
        typeof error.response.data === 'string' 
          ? error.response.data 
          : JSON.stringify(error.response.data, null, 2));
      console.error('❌ URL запроса:', error.config?.url);
      
      if (error.response.status === 400 && error.response.data?.code === 'proto.payload') {
        console.error('🔍 ВАЖНО: Проверьте структуру attachments в теле сообщения');
      }
    }
    
    // Удаляем временный файл при ошибке
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
      //console.log('🧹 Временный файл удален при ошибке');
    }
    
    res.status(500).json({ 
      error: 'Ошибка отправки аудио',
      details: error.response?.data || error.message,
      step: error.response?.data?.code === 'proto.payload' 
        ? 'Проверьте структуру attachments: {type: "audio", payload: {token: "..."}}' 
        : 'Смотрите логи сервера'
    });
  }
};


// Функция для обработки изображения с приложения и отправки в MAX
exports.sendImageToMax = async (req, res) => {
  try {
   //console.log('🖼️ [1] Начало обработки изображения');
    const botToken = process.env.MAX_TOKEN;

    const { id } = req.params;
    const { text, senderName, senderId, replyToMessageId } = req.body; // Подпись к изображению (если есть)
    const file = req.file;
    
   //console.log('📁 Изображение:', file.filename, 'размер:', file.size);

    // Находим чат
    const chat = await MaxChat.findByPk(id);
    if (!chat) {
      fs.unlinkSync(file.path);
      return res.status(404).json({ error: 'Чат не найден' });
    }
    const reply = await resolveMaxReply(chat.id, replyToMessageId);

   //console.log('🔗 [2] Запрашиваю upload URL у MAX...');
    
    // 0. Получаем URL для загрузки + ТОКЕН для изображения
    const uploadUrlResponse = await axios.post(
      'https://platform-api2.max.ru/uploads?type=image', // Тип image!
      {},
      {
        headers: {
          'Authorization': `${botToken}`,
        },
      }
    );

   //console.log('📦 Полный ответ от /uploads:', JSON.stringify(uploadUrlResponse.data, null, 2));


    const uploadUrl = uploadUrlResponse.data.url;
    // 1. Извлекаем photoIds из URL
    const urlObj = new URL(uploadUrl);
    const photoIds = urlObj.searchParams.get('photoIds');

   //console.log('✅ [2] Получен upload URL:', uploadUrl);
   //console.log('🔑 [2] Извлечен photoIds из URL:', photoIds);

    // 2. Убираем проверку на imageToken и используем photoIds
    if (!photoIds) {
      throw new Error('Параметр photoIds не найден в URL для загрузки');
    }

    // 3. Загружаем файл на полученный URL (ваш существующий код с FormData должен работать)
   //console.log('⬆️ [3] Загружаю изображение на MAX CDN...');
    const formData = new FormData();
    formData.append('data', fs.createReadStream(file.path), {
      filename: file.originalname || 'image.jpg',
      contentType: file.mimetype || 'image/jpeg',
    });

    const uploadResponse = await axios.post(uploadUrl, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `${botToken}`,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      responseType: 'json',
    });

   //console.log('✅ [4] Изображение загружено на MAX CDN');
   //console.log('📦 Ответ от CDN:', JSON.stringify(uploadResponse.data, null, 2));

    // 3.1. Извлекаем реальный токен из ответа CDN
    // Ответ имеет структуру: {"photos": {"photoIds": {"token": "real_token_here"}}}
    let imageToken;

    try {
      // Находим первый ключ в объекте 'photos' (это ваш photoIds)
      const photoIdsKey = Object.keys(uploadResponse.data.photos)[0];
      // Извлекаем токен для этого photoIds
      imageToken = uploadResponse.data.photos[photoIdsKey].token;
      
      if (!imageToken) {
        throw new Error('Токен не найден в ответе CDN');
      }
      
     //console.log('🔑 [4] Извлечен реальный токен из ответа CDN:', imageToken);
    } catch (error) {
      console.error('❌ Ошибка при извлечении токена из ответа CDN:', error);
      throw new Error('Не удалось получить токен изображения после загрузки');
    }

    // 4. Пауза перед отправкой сообщения (обработка файла на стороне MAX)
    //console.log('⏳ [5] Жду обработку изображения на стороне MAX (2 секунды)...');
    await new Promise(resolve => setTimeout(resolve, 2000));



    // 4. В локальном сообщении сохраняем photoIds
    const localMessage = await MaxMessage.create({
      mChatId: chat.id,
      maxMessageId: `local-image-${Date.now()}`,
      text: text || '',
      fromMe: true,
      messageType: 'image',
      senderName, // Сохраняем имя отправителя
      senderId,   // Сохраняем ID отправителя
      attachments: {
        ...(reply ? { _reply: reply.meta } : {}),
        image: {
          // Ключевое изменение: сохраняем photoIds, а не token
          photoIds: photoIds,
          localPath: file.path,
          filename: file.filename,
          mimeType: file.mimetype,
          uploadUrl: uploadUrl,
          tempUrl: `/uploads/images/${file.filename}`
        }
      }
    });

    //console.log('localMessage = ', localMessage)

    // 5. Формируем тело сообщения для MAX API с photoIds
   //console.log('📝 [7] Формирую тело сообщения для MAX API...');
    const messageBody = {
      text: text || '',
      ...(reply?.externalMessageId ? { link: { type: 'reply', mid: reply.externalMessageId } } : {}),
      attachments: [
        {
          type: 'image',
          payload: {
            // Используем photoIds в качестве токена
            token: imageToken
          }
        }
      ]
    };



   //console.log('📨 [8] Отправляю сообщение в MAX API...');
   //console.log('📄 Тело сообщения:', JSON.stringify(messageBody, null, 2));

    // 7. Отправляем сообщение с изображением через MAX API
    const recipientQuery = getMaxRecipientQuery(chat.maxUserId);
    if (!recipientQuery) {
      return res.status(400).json({
        success: false,
        error: 'MAX API не поддерживает отправку по номеру телефона. Нужен user_id или chat_id (клиент должен сначала написать боту).',
      });
    }
    const messageResponse = await axios.post(
      `https://platform-api2.max.ru/messages?${recipientQuery}`,
      messageBody,
      {
        headers: {
          'Authorization': `${botToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

   //console.log('✅ [8] Сообщение отправлено в MAX API');
   //console.log('📦 Ответ от /messages:', JSON.stringify(messageResponse.data, null, 2));

    // 8. Обновляем с реальным mid
    const messageIdFromApi = messageResponse.data?.message?.body?.mid;
    if (messageIdFromApi) {
      await localMessage.update({ 
        maxMessageId: messageIdFromApi,
      });
     //console.log('🆔 [9] Обновлен maxMessageId:', messageIdFromApi);
      
      // Также обновим attachments с дополнительными данными из ответа, если есть
      if (messageResponse.data?.message?.body?.attachments?.[0]?.payload) {
        const imagePayload = messageResponse.data.message.body.attachments[0].payload;
        
        await localMessage.update({
          attachments: {
            image: {
              ...localMessage.attachments.image,
              ...imagePayload, // Может содержать photo_id, sizes и т.д.
              // Обновляем URL, если MAX вернул свой CDN URL
              url: imagePayload.url || localMessage.attachments.image.tempUrl
            }
          }
        });
      }
    }

    // 9. Формируем ответ для клиента
   //console.log('📤 [10] Формирую ответ для клиента...');
    
    // Получаем обновленное сообщение
    const updatedMessage = await MaxMessage.findByPk(localMessage.id);
    
    // Форматируем ответ аналогично аудио
    const response = {
      id: updatedMessage.id,
      text: updatedMessage.text,
      fromMe: updatedMessage.fromMe,
      createdAt: updatedMessage.createdAt,
      messageType: 'image',
      senderName: updatedMessage.senderName, // Сохраняем имя отправителя
      senderId: updatedMessage.senderId,   // Сохраняем ID отправителя
      attachments: {
        image: {
          url: `https://${req.headers.host}${updatedMessage.attachments.image.tempUrl}`,
          token: updatedMessage.attachments.image.token,
          photo_id: updatedMessage.attachments.image.photo_id || null
        }
      }
    };

   //console.log('✅ [10] Изображение успешно отправлено');
    res.json(response);

  } catch (error) {
    console.error('❌ Ошибка в sendImageToMax:', error);
    
    // Удаляем загруженный файл в случае ошибки
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка при отправке изображения',
      error: error.response?.data || error.message
    });
  }
};

// Отправка видео в MAX
exports.sendVideoToMax = async (req, res) => {
  try {
    const botToken = process.env.MAX_TOKEN;
    const { id } = req.params;
    const { text, senderName, senderId, replyToMessageId } = req.body;
    const file = req.file;

    const chat = await MaxChat.findByPk(id);
    if (!chat) {
      if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(404).json({ error: 'Чат не найден' });
    }
    const reply = await resolveMaxReply(chat.id, replyToMessageId);

    const uploadUrlResponse = await axios.post(
      'https://platform-api2.max.ru/uploads?type=video',
      {},
      {
        headers: {
          Authorization: `${botToken}`,
        },
      }
    );

    const uploadUrl = uploadUrlResponse.data.url;
    let uploadToken = uploadUrlResponse.data.token || null;

    const formData = new FormData();
    formData.append('data', fs.createReadStream(file.path), {
      filename: file.originalname || 'video.mp4',
      contentType: file.mimetype || 'video/mp4',
    });

    const uploadResponse = await axios.post(uploadUrl, formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `${botToken}`,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      responseType: 'json',
    });

    const videosObj = uploadResponse?.data?.videos;
    if (videosObj && typeof videosObj === 'object') {
      const firstKey = Object.keys(videosObj)[0];
      if (firstKey && videosObj[firstKey]?.token) {
        uploadToken = videosObj[firstKey].token;
      }
    }
    if (!uploadToken && uploadResponse?.data?.video?.token) {
      uploadToken = uploadResponse.data.video.token;
    }
    if (!uploadToken && uploadResponse?.data?.token) {
      uploadToken = uploadResponse.data.token;
    }

    if (!uploadToken) {
      throw new Error('Не удалось получить токен видео после загрузки');
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const localMessage = await MaxMessage.create({
      mChatId: chat.id,
      maxMessageId: `local-video-${Date.now()}`,
      text: text || '',
      fromMe: true,
      messageType: 'video',
      senderName,
      senderId,
      attachments: {
        ...(reply ? { _reply: reply.meta } : {}),
        video: {
          token: uploadToken,
          localPath: file.path,
          filename: file.filename,
          mimeType: file.mimetype,
          uploadUrl,
          tempUrl: `/uploads/videos/${file.filename}`,
        },
      },
    });

    const messageBody = {
      text: text || '',
      ...(reply?.externalMessageId ? { link: { type: 'reply', mid: reply.externalMessageId } } : {}),
      attachments: [
        {
          type: 'video',
          payload: {
            token: uploadToken,
          },
        },
      ],
    };

    const recipientQuery = getMaxRecipientQuery(chat.maxUserId);
    if (!recipientQuery) {
      return res.status(400).json({
        success: false,
        error: 'MAX API не поддерживает отправку по номеру телефона. Нужен user_id или chat_id (клиент должен сначала написать боту).',
      });
    }

    const messageResponse = await postMessageWithAttachmentRetry({
      recipientQuery,
      messageBody,
      botToken,
      maxAttempts: 5,
      initialDelayMs: 1500,
    });

    const messageIdFromApi = messageResponse.data?.message?.body?.mid;
    if (messageIdFromApi) {
      await localMessage.update({ maxMessageId: messageIdFromApi });
      if (messageResponse.data?.message?.body?.attachments?.[0]?.payload) {
        const videoPayload = messageResponse.data.message.body.attachments[0].payload;
        await localMessage.update({
          attachments: {
            video: {
              ...localMessage.attachments.video,
              ...videoPayload,
              url: videoPayload.url || localMessage.attachments.video.tempUrl,
            },
          },
        });
      }
    }

    const updatedMessage = await MaxMessage.findByPk(localMessage.id);
    const response = {
      id: updatedMessage.id,
      text: updatedMessage.text,
      fromMe: updatedMessage.fromMe,
      createdAt: updatedMessage.createdAt,
      messageType: 'video',
      senderName: updatedMessage.senderName,
      senderId: updatedMessage.senderId,
      attachments: {
        video: {
          url: `https://${req.headers.host}${updatedMessage.attachments.video.tempUrl}`,
          token: updatedMessage.attachments.video.token,
          id: updatedMessage.attachments.video.id || null,
          duration: updatedMessage.attachments.video.duration || null,
        },
      },
    };

    res.json(response);
  } catch (error) {
    console.error('❌ Ошибка в sendVideoToMax:', error);
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      success: false,
      message: 'Ошибка при отправке видео',
      error: error.response?.data || error.message,
    });
  }
};

// Функция для обработки документа/файла с приложения и отправки в MAX
exports.sendFileToMax = async (req, res) => {
  try {
    const botToken = process.env.MAX_TOKEN;
    const { id } = req.params;
    const file = req.file;
    const { text, senderName, senderId, replyToMessageId } = req.body;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'Файл не передан',
      });
    }

    const chat = await MaxChat.findByPk(id);
    if (!chat) {
      if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(404).json({ error: 'Чат не найден' });
    }
    const reply = await resolveMaxReply(chat.id, replyToMessageId);

    const uploadUrlResponse = await axios.post(
      'https://platform-api2.max.ru/uploads?type=file',
      {},
      {
        headers: {
          Authorization: `${botToken}`,
        },
        timeout: 30000,
      }
    );

    const uploadUrl = uploadUrlResponse?.data?.url;
    if (!uploadUrl) {
      throw new Error('Не удалось получить upload URL для файла');
    }

    const formData = new FormData();
    formData.append('data', fs.createReadStream(file.path), {
      filename: file.originalname || 'document.bin',
      contentType: file.mimetype || 'application/octet-stream',
    });

    const uploadResponse = await axios.post(uploadUrl, formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `${botToken}`,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 120000,
    });

    let uploadToken = null;
    const filesObj = uploadResponse?.data?.files;
    if (filesObj && typeof filesObj === 'object') {
      const firstKey = Object.keys(filesObj)[0];
      if (firstKey && filesObj[firstKey]?.token) {
        uploadToken = filesObj[firstKey].token;
      }
    }
    if (!uploadToken && uploadResponse?.data?.document?.token) {
      uploadToken = uploadResponse.data.document.token;
    }
    if (!uploadToken && uploadResponse?.data?.file?.token) {
      uploadToken = uploadResponse.data.file.token;
    }
    if (!uploadToken && uploadResponse?.data?.token) {
      uploadToken = uploadResponse.data.token;
    }

    if (!uploadToken) {
      throw new Error('Не удалось получить токен файла после загрузки');
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const localMessage = await MaxMessage.create({
      mChatId: chat.id,
      maxMessageId: `local-document-${Date.now()}`,
      text: text || '',
      fromMe: true,
      messageType: 'document',
      senderName,
      senderId,
      attachments: {
        ...(reply ? { _reply: reply.meta } : {}),
        document: {
          token: uploadToken,
          localPath: file.path,
          filename: file.originalname || file.filename,
          mimeType: file.mimetype,
          size: file.size,
          uploadUrl,
          tempUrl: `/uploads/files/${file.filename}`,
        },
        file: {
          token: uploadToken,
          localPath: file.path,
          name: file.originalname || file.filename,
          mimeType: file.mimetype,
          size: file.size,
          tempUrl: `/uploads/files/${file.filename}`,
        },
      },
    });

    const messageBody = {
      text: text || '',
      ...(reply?.externalMessageId ? { link: { type: 'reply', mid: reply.externalMessageId } } : {}),
      attachments: [
        {
          type: 'document',
          payload: {
            token: uploadToken,
          },
        },
      ],
    };

    const recipientQuery = getMaxRecipientQuery(chat.maxUserId);
    if (!recipientQuery) {
      return res.status(400).json({
        success: false,
        error: 'MAX API не поддерживает отправку по номеру телефона. Нужен user_id или chat_id (клиент должен сначала написать боту).',
      });
    }

    let messageResponse;
    try {
      messageResponse = await postMessageWithAttachmentRetry({
        recipientQuery,
        messageBody,
        botToken,
        maxAttempts: 7,
        initialDelayMs: 1200,
        maxDelayMs: 8000,
        requestTimeoutMs: 12000,
        backoffFactor: 1.7,
        maxTotalMs: 50000,
      });
    } catch (err) {
      const status = Number(err?.response?.status);
      const code = String(err?.response?.data?.code || '');
      const shouldTryFileAttachment = status === 400 && code === 'proto.payload';
      if (!shouldTryFileAttachment) throw err;

      const altBody = {
        text: text || '',
        attachments: [
          {
            type: 'file',
            payload: { token: uploadToken },
          },
        ],
      };

      messageResponse = await postMessageWithAttachmentRetry({
        recipientQuery,
        messageBody: altBody,
        botToken,
        maxAttempts: 5,
        initialDelayMs: 1200,
        maxDelayMs: 6000,
        requestTimeoutMs: 12000,
        backoffFactor: 1.6,
        maxTotalMs: 35000,
      });
    }

    const messageIdFromApi = messageResponse.data?.message?.body?.mid;
    if (messageIdFromApi) {
      await localMessage.update({ maxMessageId: messageIdFromApi });
      if (messageResponse.data?.message?.body?.attachments?.[0]?.payload) {
        const payload = messageResponse.data.message.body.attachments[0].payload;
        await localMessage.update({
          attachments: {
            document: {
              ...localMessage.attachments.document,
              ...payload,
              url: payload.url || localMessage.attachments.document.tempUrl,
            },
            file: {
              ...localMessage.attachments.file,
              ...payload,
              url: payload.url || localMessage.attachments.file.tempUrl,
            },
          },
        });
      }
    }

    const updatedMessage = await MaxMessage.findByPk(localMessage.id);
    const publicLocalUrl = `https://${req.headers.host}${updatedMessage.attachments.document.tempUrl}`;
    const response = {
      id: updatedMessage.id,
      text: updatedMessage.text,
      fromMe: updatedMessage.fromMe,
      createdAt: updatedMessage.createdAt,
      messageType: 'document',
      senderName: updatedMessage.senderName,
      senderId: updatedMessage.senderId,
      attachments: {
        document: {
          url: updatedMessage.attachments.document.url || publicLocalUrl,
          token: updatedMessage.attachments.document.token,
          id: updatedMessage.attachments.document.id || null,
          filename: updatedMessage.attachments.document.filename || file.originalname || file.filename,
          size: updatedMessage.attachments.document.size || file.size || null,
        },
        file: {
          url: updatedMessage.attachments.file?.url || updatedMessage.attachments.document.url || publicLocalUrl,
          token: updatedMessage.attachments.file?.token || updatedMessage.attachments.document.token,
          id: updatedMessage.attachments.file?.id || updatedMessage.attachments.document.id || null,
          name: updatedMessage.attachments.file?.name || updatedMessage.attachments.document.filename || file.originalname || file.filename,
          size: updatedMessage.attachments.file?.size || updatedMessage.attachments.document.size || file.size || null,
        },
      },
      fileName: updatedMessage.attachments.document.filename || file.originalname || file.filename,
      fileSize: updatedMessage.attachments.document.size || file.size || null,
    };

    res.json(response);
  } catch (error) {
    console.error('❌ Ошибка в sendFileToMax:', error);
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      success: false,
      message: 'Ошибка при отправке файла',
      error: error.response?.data || error.message,
    });
  }
};



// Для получения общего числа непрочитанных
exports.getTotalUnreadCount = async (req, res) => {
  try {
    // Вариант 1: Через агрегацию сообщений
    const totalUnread = await MaxMessage.count({
      where: {
        fromMe: false,
        isRead: false
      }
    });

    // Или вариант 2: Сумма unreadCount из всех чатов
    const totalUnreadFromChats = await MaxChat.sum('unreadCount');

    res.json({
      success: true,
      totalUnread,
      totalUnreadFromChats,
      // Отправляем большее значение на всякий случай
      count: Math.max(totalUnread, totalUnreadFromChats)
    });
  } catch (error) {
    console.error('Error getting total unread count:', error);
    res.status(500).json({ error: 'Failed to get total unread count' });
  }
};



// // GET /api/max/chats/:id/status
// exports.getChatStatus = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const chat = await MaxChat.findByPk(id, {
//       attributes: ['id', 'maxChatId', 'username', 'assigneeId', 'createdAt', 'updatedAt'],
//       include: [{
//         model: User, // Предполагается, что у вас есть модель User
//         as: 'assignee',
//         attributes: ['id', 'name']
//       }]
//     });

//     if (!chat) {
//       return res.status(404).json({ error: 'Чат не найден' });
//     }

//     res.json({
//       success: true,
//       chat,
//       canReply: !chat.assigneeId || chat.assigneeId === req.user.id, // req.user.id - ID текущего пользователя
//       isAssigned: !!chat.assigneeId,
//       assignedToMe: chat.assigneeId === req.user.id,
//     });
//   } catch (error) {
//     console.error('❌ Ошибка при получении статуса чата:', error);
//     res.status(500).json({ error: 'Ошибка сервера' });
//   }
// };



// controllers/maxChatController.js
exports.unassignChat = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.id;
    const chat = await MaxChat.findByPk(id, {
      include: [
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'name', 'phone'],
          required: false
        }
      ]
    });
    
    if (!chat) {
      return res.status(404).json({ error: 'Чат не найден' });
    }

    const participants = normalizeParticipantIds(chat.participantIds);
    const isOwner = Number(chat.assigneeId || 0) === Number(currentUserId);
    const isParticipant = participants.includes(Number(currentUserId));

    if (!isOwner && !isParticipant) {
      return res.status(403).json({
        error: 'Вы не участвуете в этом чате',
        assigneeId: chat.assigneeId
      });
    }

    const previousAssigneeId = chat.assigneeId;
    const previousAssigneeName = chat.assignee ? chat.assignee.name : null;
    let messageText = 'Вы вышли из чата';

    if (isOwner) {
      chat.assigneeId = null;
      chat.participantIds = participants.filter((uid) => uid !== Number(currentUserId));
      messageText = 'Чат успешно освобожден';
    } else {
      chat.participantIds = participants.filter((uid) => uid !== Number(currentUserId));
    }
    await chat.save();

    const io = getIO();
    io.emit('max:chat-membership-updated', {
      chatId: chat.id,
      assigneeId: chat.assigneeId || null,
      participantIds: normalizeParticipantIds(chat.participantIds),
      timestamp: new Date(),
    });
    io.to(`room-max-${chat.id}`).emit('max:chat-membership-updated', {
      chatId: chat.id,
      assigneeId: chat.assigneeId || null,
      participantIds: normalizeParticipantIds(chat.participantIds),
      timestamp: new Date(),
    });

    res.json({
      success: true,
      message: messageText,
      chat: {
        id: chat.id,
        assigneeId: chat.assigneeId,
        assigneeName: chat.assigneeId ? (chat.assignee ? chat.assignee.name : null) : null,
        participantIds: normalizeParticipantIds(chat.participantIds),
        isClosed: chat.isClosed,
      }
    });
    
  } catch (error) {
    console.error('❌ Ошибка при освобождении чата:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

exports.assignChat = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.id;
    const currentUserName = req.user.name || null;

    const chat = await MaxChat.findByPk(id, {
      include: [
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'name', 'phone'],
          required: false
        }
      ]
    });

    if (!chat) {
      return res.status(404).json({ error: 'Чат не найден' });
    }

    const participants = normalizeParticipantIds(chat.participantIds);
    let isOwner = Number(chat.assigneeId || 0) === Number(currentUserId);
    const alreadyParticipant = participants.includes(Number(currentUserId));

    if (!chat.assigneeId) {
      chat.assigneeId = Number(currentUserId);
      chat.participantIds = participants.filter((uid) => uid !== Number(currentUserId));
      isOwner = true;
      await chat.save();
    } else if (!isOwner && !alreadyParticipant) {
      participants.push(Number(currentUserId));
      chat.participantIds = normalizeParticipantIds(participants);
      await chat.save();
    }

    const membership = computeMaxMembership(chat, currentUserId);
    const io = getIO();
    io.emit('max:chat-membership-updated', {
      chatId: chat.id,
      assigneeId: chat.assigneeId || null,
      participantIds: normalizeParticipantIds(chat.participantIds),
      timestamp: new Date(),
    });
    io.to(`room-max-${chat.id}`).emit('max:chat-membership-updated', {
      chatId: chat.id,
      assigneeId: chat.assigneeId || null,
      participantIds: normalizeParticipantIds(chat.participantIds),
      timestamp: new Date(),
    });

    return res.json({
      success: true,
      message: membership.isOwner ? 'Вы владелец чата' : 'Вы присоединились к чату',
      chat: {
        id: chat.id,
        assigneeId: chat.assigneeId,
        assigneeName: chat.assignee ? chat.assignee.name : currentUserName,
        participantIds: membership.participants,
        isOwner: membership.isOwner,
        isParticipant: membership.isParticipant,
        isClosed: chat.isClosed,
      }
    });
  } catch (error) {
    console.error('❌ Ошибка при присоединении к MAX чату:', error);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
};

exports.inviteUser = async (req, res) => {
  try {
    const currentUserId = Number(req.user?.id || 0);
    const targetUserId = Number(req.body?.userId || req.body?.employeeId || 0);
    if (!targetUserId) return res.status(400).json({ error: 'Выберите сотрудника' });
    if (targetUserId === currentUserId) return res.status(400).json({ error: 'Нельзя пригласить себя' });
    if (req.user?.canMax === false) return res.status(403).json({ error: 'Доступ к MAX чатам отключен' });

    const chat = await MaxChat.findByPk(req.params.id, {
      include: [{ model: User, as: 'assignee', attributes: ['id', 'name'], required: false }],
    });
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });
    if (!canAccessMaxChat(chat, currentUserId)) return res.status(404).json({ error: 'Чат не найден' });
    if (isPersonalMaxChat(chat)) {
      return res.status(400).json({ error: 'В личный MAX-чат нельзя приглашать сотрудников' });
    }
    if (Number(chat.assigneeId || 0) !== currentUserId) {
      return res.status(403).json({ error: 'Приглашать сотрудников может только владелец чата' });
    }

    const target = await User.findOne({
      where: { id: targetUserId, isActive: true, canMax: true, system: false },
      attributes: ['id', 'name'],
    });
    if (!target) return res.status(404).json({ error: 'Сотрудник недоступен для MAX-чата' });

    const participants = normalizeParticipantIds(chat.participantIds);
    const wasAlreadyParticipant = participants.includes(targetUserId);
    if (!wasAlreadyParticipant) {
      participants.push(targetUserId);
      chat.participantIds = normalizeParticipantIds(participants);
      await chat.save();
    }

    const payload = {
      chatId: chat.id,
      assigneeId: chat.assigneeId || null,
      participantIds: normalizeParticipantIds(chat.participantIds),
      invitedUserId: targetUserId,
      invitedUserName: target.name,
      timestamp: new Date(),
    };
    const io = getIO();
    io.emit('max:chat-membership-updated', payload);
    io.to(`room-max-${chat.id}`).emit('max:chat-membership-updated', payload);
    if (!wasAlreadyParticipant) {
      const inviteRoom = 'user:' + targetUserId;
      io.to(inviteRoom).emit('external-chat:invited', {
        kind: 'max',
        chatId: chat.id,
        chatTitle: chat.username || 'MAX чат',
        inviterId: currentUserId,
        inviterName: req.user?.name || null,
      });
    }

    const membership = computeMaxMembership(chat, currentUserId);
    return res.json({
      success: true,
      chat: {
        id: chat.id,
        assigneeId: chat.assigneeId || null,
        assigneeName: chat.assignee ? chat.assignee.name : null,
        participantIds: membership.participants,
        isOwner: membership.isOwner,
        isParticipant: membership.isParticipant,
        isClosed: chat.isClosed,
      },
      invitedUser: target,
    });
  } catch (error) {
    console.error('❌ Ошибка при приглашении в MAX чат:', error);
    return res.status(500).json({ error: 'Не удалось пригласить сотрудника' });
  }
};
exports.renameChat = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = Number(req.user?.id || 0);
    const nextNameRaw = String(req.body?.username || req.body?.title || '').trim();
    const nextName = nextNameRaw.replace(/\s+/g, ' ').slice(0, 120);

    if (!nextName) {
      return res.status(400).json({ error: 'Укажите название чата' });
    }

    const chat = await MaxChat.findByPk(id, {
      include: [
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'name'],
          required: false,
        },
      ],
    });

    if (!chat) {
      return res.status(404).json({ error: 'Чат не найден' });
    }

    const isOwner = Number(chat.assigneeId || 0) === currentUserId;
    if (!isOwner) {
      return res.status(403).json({ error: 'Переименовать чат может только владелец' });
    }

    chat.username = nextName;
    await chat.save();

    const io = getIO();
    const payload = {
      chatId: chat.id,
      username: chat.username,
      updatedAt: chat.updatedAt,
      assigneeId: chat.assigneeId || null,
      assigneeName: chat.assignee ? chat.assignee.name : null,
      participantIds: normalizeParticipantIds(chat.participantIds),
    };
    io.emit('max:chat-renamed', payload);
    io.to(`room-max-${chat.id}`).emit('max:chat-renamed', payload);

    return res.json({
      success: true,
      message: 'Название чата обновлено',
      chat: payload,
    });
  } catch (error) {
    console.error('❌ Ошибка при переименовании MAX-чата:', error);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
};

exports.archiveChat = async (req, res) => {
  try {
    const currentUserId = Number(req.user?.id || 0);
    const chat = await MaxChat.findByPk(req.params.id);
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });
    if (Number(chat.assigneeId || 0) !== currentUserId) {
      return res.status(403).json({ error: 'Архивировать чат может только владелец' });
    }

    const archived = Boolean(req.body?.archived);
    chat.archivedAt = archived ? new Date() : null;
    await chat.save();

    const payload = {
      chatId: chat.id,
      archived,
      archivedAt: chat.archivedAt,
      updatedAt: chat.updatedAt,
    };
    const io = getIO();
    io.emit('max:chat-archived', payload);
    io.to(`room-max-${chat.id}`).emit('max:chat-archived', payload);

    return res.json({ success: true, chat: payload });
  } catch (error) {
    console.error('❌ Ошибка архивации MAX-чата:', error);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
};

exports.deleteMessage = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const currentUserId = Number(req.user?.id || 0);
    if (!currentUserId) {
      await transaction.rollback();
      return res.status(401).json({ error: 'Не авторизован' });
    }

    const chat = await MaxChat.findByPk(req.params.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!chat) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Чат не найден' });
    }
    if (!canAccessMaxChat(chat, currentUserId)) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Доступ к личному MAX-чату есть только у владельца' });
    }

    const messageId = Number(req.params.messageId || 0);
    const message = await MaxMessage.findOne({
      where: { id: messageId, mChatId: chat.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!message) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }
    if (!message.fromMe || Number(message.senderId || 0) !== currentUserId) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Можно удалить только своё сообщение' });
    }

    await message.destroy({ transaction });

    const [unreadCount, latestMessage] = await Promise.all([
      MaxMessage.count({
        where: { mChatId: chat.id, fromMe: false, isRead: false },
        transaction,
      }),
      MaxMessage.findOne({
        where: { mChatId: chat.id },
        order: [['createdAt', 'DESC']],
        transaction,
      }),
    ]);
    await chat.update({
      unreadCount,
      lastMessageText: latestMessage?.text || null,
      lastMessageTime: latestMessage?.createdAt || null,
    }, { transaction });

    await transaction.commit();

    const payload = {
      chatId: chat.id,
      messageId,
      unreadCount,
      lastMessageText: latestMessage?.text || null,
      lastMessageTime: latestMessage?.createdAt || null,
    };
    const io = getIO();
    io.emit('max:message-deleted', payload);
    io.to(`room-max-${chat.id}`).emit('max:message-deleted', payload);
    return res.json({ success: true, ...payload });
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Ошибка удаления MAX-сообщения:', error);
    return res.status(500).json({ error: 'Не удалось удалить сообщение' });
  }
};

exports.deleteChat = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const currentUserId = Number(req.user?.id || 0);
    const chat = await MaxChat.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!chat) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Чат не найден' });
    }
    if (Number(chat.assigneeId || 0) !== currentUserId) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Удалить чат может только владелец' });
    }

    await MaxMessage.destroy({ where: { mChatId: chat.id }, transaction });
    await chat.destroy({ transaction });
    await transaction.commit();

    const payload = { chatId: Number(req.params.id), deletedAt: new Date().toISOString() };
    const io = getIO();
    io.emit('max:chat-deleted', payload);
    io.to(`room-max-${payload.chatId}`).emit('max:chat-deleted', payload);
    return res.json({ success: true });
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Ошибка удаления MAX-чата:', error);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
};

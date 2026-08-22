// controllers/chatController.js


const ChatMessage = require('../models/ChatMessage');
const UserConsultChat = require('../models/UserConsultChat');
const PushToken = require('../models/PushToken');
const User = require('../models/User');
const Record = require('../models/Record');
const { sequelize } = require('../models');
const { v4: uuidv4 } = require('uuid');
const { getIO } = require('../socket');
const { Op } = require('sequelize');
const { sendPushNotification } = require('../services/sendPushNotification');

const CHAT_TRACE_LOGS = String(process.env.CHAT_TRACE_LOGS || '').trim().toLowerCase() === 'true';
const chatTraceLog = (...args) => {
  if (CHAT_TRACE_LOGS) console.log(...args);
};

const normalizeUserId = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const userHasConsultAccess = async (userId) => {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return false;

  const record = await UserConsultChat.findOne({
    where: { userId: normalizedUserId },
    attributes: ['userId'],
  });

  return !!record;
};


const getOpenConsultCount = async (days = 14) => {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Источник истины для статуса консультации — таблица records.
  // Считаем только "не взята в работу" (statusId = 15), активные, за последние N дней.
  return Record.count({
    where: {
      active: true,
      requestDate: { [Op.gte]: cutoff },
      statusId: 15,
    },
  });
};


// router.get('/chat', authMiddleware, getChatHistory);
const getChatHistory = async (req, res) => {
  chatTraceLog('[chatController] getChatHistory start' )
  try {
    const userId = req.user?.id;
    const hasAccess = await userHasConsultAccess(userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Нет доступа к чату консультаций' });
    }

    const messages = await ChatMessage.findAll({
      order: [['createdAt', 'DESC']],
      limit: 100,
    });
    res.json(messages);
  } catch (e) {
    console.error('Ошибка в sendFormToChat:', e.stack || e);
    return res.status(500).json({ error: 'Не удалось отправить форму в чат' });
  }
};


// router.get('/chat-summary', authMiddleware, getChatSummary) - Для получения данных с чата консультаций
const getChatSummary = async (req, res) => {
  chatTraceLog('[chatController] getChatSummary start' )
  try { 

    // userId из запроса
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const record = await UserConsultChat.findOne({ where: { userId } });
    if (!record) {
      return res.json({
        lastMessage: null,
        unreadCount: 0,
        openConsultCount: 0,
        hasAccess: false,
      });
    }

    const [lastMessage, openConsultCount] = await Promise.all([
      ChatMessage.findOne({
        order: [['createdAt', 'DESC']],
      }),
      getOpenConsultCount(14),
    ]);

    // const lastReadId = record?.lastReadChatMessageId || 0;
    // Если записи нет — оставляем null, не 0
    const lastReadId = record?.lastReadChatMessageId ?? null;

    // Если lastReadId корректный (строка/UUID) — получаем createdAt, иначе null
    let lastReadMsg = null;
    if (lastReadId && lastReadId !== '0') {
      lastReadMsg = await ChatMessage.findOne({
        where: { _id: lastReadId },
        attributes: ['createdAt'],
      });
    }

    // // Сначала получим createdAt последнего прочитанного
    // const lastReadMsg = await ChatMessage.findOne({
    //   where: { _id: lastReadId },
    //   attributes: ['createdAt'],
    // });

    //console.log('lastReadMsg = ', lastReadMsg)  

    let unreadCount = 0;

    if (lastReadMsg?.createdAt) {
      unreadCount = await ChatMessage.count({
        where: {
          createdAt: { [Op.gt]: lastReadMsg.createdAt },
          userId: { [Op.ne]: String(userId) },
        },
      });
    } else {
      unreadCount = await ChatMessage.count({
        where: {
        userId: { [Op.ne]: String(userId) },
      },
    }); // если не найдено
    }

    // console.log('res = ', res)  

    return res.json({
      lastMessage,
      unreadCount,
      openConsultCount,
      hasAccess: true,
    });

  } catch (err) {
    console.error('Ошибка в getChatSummary 18-47:', err);
    res.status(500).json({ error: 'Не удалось получить данные чата' });
  }
};


const saveChatMessage = async (req, res) => {
  console.log('📥 Получено сообщение:', req.body);
  try {
    const senderId = req.user?.id;
    const hasAccess = await userHasConsultAccess(senderId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Нет доступа к чату консультаций' });
    }

    const { _id, user, text, metadata, createdAt } = req.body;
    const resolvedUser = user || {
      _id: senderId,
      name: req.user?.name || `User ${senderId}`,
    };
    const savedMessage = await ChatMessage.create({
      _id,
      userId: resolvedUser._id,
      userName: resolvedUser.name,
      text,
      metadata,
      createdAt,
    });

    console.log('✅ Сообщение сохранено, id:', savedMessage._id);

    const io = getIO();
    io.to('consult').emit('message', savedMessage);
    console.log('📢 Сообщение разослано в комнату consult');

    res.sendStatus(201);
  } catch (err) {
    console.error('Ошибка при сохранении сообщения чата:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};


const sendFormToChat = async (req, res) => {
  try {
    const io = getIO();
    const data = req.body;
    //console.log('Полученные данные для отправки в чат:', data);

    const date = new Date(data.requestDate).toLocaleString('ru-RU', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });

    const dt = new Date(data.serviceDate); // 2025-06-22T14:00:00.000Z

    const serviceDateStr = dt.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Vladivostok'
    });

    // 1) Автор — берем из req.user, установленного authMiddleware
    const sender = req.user ? Number(req.user.id) : null; // authMiddleware должен положить сюда user
    // fallback на 'system'
    // console.log('Отправитель:', sender);

    const textLines = [
      `🆕 Новая консультация от ${date.split(',')[0]}:`,
      `📞 Телефон: ${data.clientPhone}`,
      `👤 Клиент: ${data.clientName}`,
      `🏠 Адрес: ${data.address}`,
      `💡 Требуется: ${data.serviceRequired}`,
      `📦 Кол-во изделий: ${data.numberObjects}`,
      `🗓 Дата: ${serviceDateStr}`,
      `⏰ Время: ${data.serviceTime}`,
      `💼 Технолог: ${data.technicName || '–'}`,
      `💬 Комментарий: ${data.comment || '–'}`,
      `💰 Оплата: ${data.paymentAmount}`,    
      `🔗 Источник: ${data.source || '–'}`,
    ].join('\n');


    // если есть числовой id -> запишем userRefId
    const userRefId = Number.isInteger(sender) ? sender : null;
    // console.log('userRefId:', userRefId);

    const user = req.user || {}; // если есть авторизация, берем из нее
    const userName = user.name || data.technicName || 'Система'; // если нет имени, берем технику

    const created = await ChatMessage.create({
      _id: uuidv4(),
      text: textLines,
      createdAt: new Date(),
      userId: 'system',
      userName: userName,
      metadata: data,
      type: 'form',
      userRefId: userRefId || null, // если есть userRefId, то используем его
    });

    // const message = created.get({ plain: true });

    const message = created.toJSON();
    //console.log('Отправляемое сообщение в чат:', message);

    // Рассылаем
    // io.emit('message', message);

    // отправляем новое сообщение всем клиентам
    io.emit('newChatMessage', message);

    // дополнительно — шлём обновление для списка чатов (home)
    io.emit('special-chat-updated', {
      text: message.fileName ?? message.text ?? '',
      createdAt: message.createdAt,
      userName: message.userName,
      metadata: message.metadata ?? {},
      fileName: message.fileName ?? '',
      type: message.type ?? 'text',
    });



    // Берём всех участников (у вас один чат — просто все записи)
    const participants = await UserConsultChat.findAll({
      include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
    });

    // Получаем уникальные userId (фильтруем null/undefined)
    const recipientIds = Array.from(new Set(
      participants.map(p => p.user?.id).filter(id => id && (!sender || Number(id) !== sender))
    ));

    if (recipientIds.length === 0) {
      // никто не подписан — ничего не шлём
      return res.status(200).json({ success: true });
    }

    // Берём push-токены
    const tokens = await PushToken.findAll({
      where: { userId: { [Op.in]: recipientIds } }
    });

    // Дедуплицируем токены и фильтруем пустые
    const uniqueTokens = Array.from(new Set(tokens.map(t => t.token).filter(Boolean)));

    if (uniqueTokens.length === 0) {
      return res.status(200).json({ success: true });
    }

    // Формируем короткий текст пуша
    const title = `Новая консультация — ${data.clientName || 'Клиент'}`;
    let body = (data.comment && String(data.comment).trim()) ? String(data.comment).trim() : (textLines.split('\n')[0] || 'Новая консультация');
    if (body.length > 100) body = body.slice(0, 100) + '...';

    const pushData = {
      screen: 'consultChat',
      messageId: message._id,
    };

    // Отправляем параллельно, но безопасно
    await Promise.allSettled(uniqueTokens.map(tokenStr =>
      sendPushNotification(tokenStr, title, body, pushData).catch(err => {
        console.error('sendPushNotification error for token', tokenStr, err);
      })
    ));



    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('Ошибка в sendFormToChat:', e);
    return res.status(500).json({ error: 'Не удалось отправить форму в чат' });
  }
};


const sendTakeNotification  = async (req, res) => {
  try {
    const io = getIO();
    const { technicName, id } = req.body;

    if (!technicName || !id) {
      return res.status(400).json({ error: 'technicName и id обязательны' });
    }

    const message = await ChatMessage.create({
      _id: uuidv4(),
      text: `🚀 Взял: ${technicName}`,
      createdAt: new Date(),
      userId: technicName,
      userName: technicName,
      metadata: {
        id,
        type: 'notification',
      },
    });

    io.emit('message', message);
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('Ошибка в sendTakeNotification:', e);
    return res.status(500).json({ error: 'Не удалось отправить уведомление в чат' });
  }
};


const updateFormToChat = async (req, res) => {
  try {
    const io = getIO();
    const data = req.body || {};
    const formId = data.id != null ? String(data.id).trim() : '';

    if (!formId) {
      return res.status(400).json({ error: 'id обязателен для обновления формы в чате' });
    }

    // Преобразуем дату для отображения
    const date = new Date(data.requestDate).toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    const dt = new Date(data.serviceDate);
    const serviceDateStr = dt.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Vladivostok',
    });

    // Формируем текст обновлённой формы
    const textLines = [
      `🆕 Новая консультация от ${date.split(',')[0]}:`,
      `📞 Телефон: ${data.clientPhone}`,
      `👤 Клиент: ${data.clientName}`,
      `🏠 Адрес: ${data.address}`,
      `💡 Требуется: ${data.serviceRequired}`,
      `📦 Кол-во изделий: ${data.numberObjects}`,
      `🗓 Дата: ${serviceDateStr}`,
      `⏰ Время: ${data.serviceTime}`,
      `💼 Технолог: ${data.technicName || '–'}`,
      `💬 Комментарий: ${data.comment || '–'}`,
      `💰 Оплата: ${data.paymentAmount}`,
      `🔗 Источник: ${data.source || '–'}`,
    ].join('\n');

    // Надёжный поиск формы по metadata.id (как текст), чтобы не зависеть от типа (number/string)
    let existing = await ChatMessage.findOne({
      where: {
        type: 'form',
        [Op.and]: [sequelize.literal(`metadata->>'id' = ${sequelize.escape(formId)}`)],
      },
      order: [['createdAt', 'DESC']],
    });

    // Фолбэк: если клиент прислал конкретный chatMessageId
    if (!existing && data.chatMessageId) {
      existing = await ChatMessage.findByPk(String(data.chatMessageId));
    }

    if (!existing) {
      // Не валим сценарий "взять в работу" — возвращаем success, чтобы фронт мог деактивировать кнопку локально.
      console.warn(`❗ Form message for metadata.id=${formId} not found — skipping chat message update.`);
      return res.status(200).json({ success: true, skipped: true, reason: 'chat_message_not_found' });
    }

    // Обновляем данные сообщения
    existing.text = textLines;
    existing.userName = data.technicName;
    existing.metadata = data;
    await existing.save();

    const plain = existing.get({ plain: true });

    // Отправляем обновлённое сообщение в сокет
    io.emit('message', plain);

    // Обновляем карточку special-чата в home
    io.emit('special-chat-updated', {
      text: plain.fileName ?? plain.text ?? '',
      createdAt: plain.createdAt,
      userName: plain.userName,
      metadata: plain.metadata ?? {},
      fileName: plain.fileName ?? '',
      type: plain.type ?? 'text',
    });

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('Ошибка в updateFormToChat:', e);
    return res.status(500).json({ error: 'Не удалось обновить форму в чате' });
  }
};
const getConsultAccessForApp = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const hasAccess = await userHasConsultAccess(userId);
    return res.json({ hasAccess });
  } catch (error) {
    console.error('Ошибка в getConsultAccessForApp:', error);
    return res.status(500).json({ error: 'Не удалось получить доступ к консультациям' });
  }
};

const listConsultUsersForAdmin = async (req, res) => {
  try {
    const [users, participants] = await Promise.all([
      User.findAll({
        attributes: ['id', 'name', 'roleId', 'isActive', 'canChat'],
        order: [['name', 'ASC']],
      }),
      UserConsultChat.findAll({ attributes: ['userId'] }),
    ]);

    const allowedIds = new Set(participants.map((item) => Number(item.userId)).filter(Boolean));

    const rows = users.map((u) => ({
      id: Number(u.id),
      name: u.name,
      roleId: Number(u.roleId),
      isActive: Boolean(u.isActive),
      canChat: Boolean(u.canChat),
      hasAccess: allowedIds.has(Number(u.id)),
    }));

    return res.json(rows);
  } catch (error) {
    console.error('Ошибка в listConsultUsersForAdmin:', error);
    return res.status(500).json({ error: 'Не удалось получить список доступа консультаций' });
  }
};

const updateConsultUsersForAdmin = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const participantsRaw = Array.isArray(req.body?.participants) ? req.body.participants : [];
    const participantIds = Array.from(
      new Set(
        participantsRaw
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      )
    );

    const existingUsers = await User.findAll({
      where: { id: { [Op.in]: participantIds } },
      attributes: ['id'],
      transaction,
    });

    const validIds = new Set(existingUsers.map((u) => Number(u.id)));
    const targetIds = participantIds.filter((id) => validIds.has(id));

    const currentRows = await UserConsultChat.findAll({
      attributes: ['userId'],
      transaction,
    });
    const currentIds = new Set(currentRows.map((r) => Number(r.userId)).filter(Boolean));

    const targetIdSet = new Set(targetIds);
    const idsToDelete = Array.from(currentIds).filter((id) => !targetIdSet.has(id));
    const idsToCreate = targetIds.filter((id) => !currentIds.has(id));

    if (idsToDelete.length > 0) {
      await UserConsultChat.destroy({
        where: { userId: { [Op.in]: idsToDelete } },
        transaction,
      });
    }

    for (const userId of idsToCreate) {
      await UserConsultChat.create(
        { userId, lastReadChatMessageId: null },
        { transaction }
      );
    }

    await transaction.commit();
    return res.json({ success: true, participants: targetIds });
  } catch (error) {
    await transaction.rollback();
    console.error('Ошибка в updateConsultUsersForAdmin:', error);
    return res.status(500).json({ error: 'Не удалось сохранить доступ к консультациям' });
  }
};

module.exports = {
  getChatHistory,
  saveChatMessage,
  sendFormToChat,
  sendTakeNotification,
  getChatSummary,
  updateFormToChat,
  getConsultAccessForApp,
  listConsultUsersForAdmin,
  updateConsultUsersForAdmin,
};





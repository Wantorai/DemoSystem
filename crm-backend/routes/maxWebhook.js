// routes/maxWebhook.js
const express = require('express');
const router = express.Router();
require('dotenv').config();
const { MaxChat, MaxMessage, PushToken } = require('../models');
const { getIO } = require('../socket');
const { sendPushNotification } = require('../services/sendPushNotification');
const { verifyPersonalInvitePayload } = require('../services/maxInvite');
const { maybeSendMaxClientAutoReply } = require('../services/clientAutoReply');
const { handleMaxRoomInviteStart, createRoomMessageFromMaxParticipant } = require('../services/roomExternalParticipants');
const MAX_ROOM_DEBUG = false;
const maxRoomDebug = (event, payload = {}) => {
  if (!MAX_ROOM_DEBUG) return;
  try { console.log(`[MAX:room][debug] ${event}`, payload); } catch {}
};

const extractRoomInvitePayloadFromMaxMessage = (msg) => {
  const body = msg?.body || {};
  const candidates = [
    body.text,
    body.payload,
    body.start_payload,
    body.startPayload,
    msg?.payload,
    msg?.start_payload,
    msg?.startPayload,
  ];
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (!value) continue;
    const match = /(?:^|\s)(r_[A-Za-z0-9_-]+)\b/i.exec(value);
    if (match) return match[1];
  }
  return null;
};

const decodeFileNameSafe = (value) => {
  const src = String(value || '');
  if (!src) return src;
  try {
    return decodeURIComponent(src);
  } catch {
    return src;
  }
};


//console.log('✅ maxWebhook router loaded');

// JSON-парсер для POST
router.post('/webhooks/max', express.json(), async (req, res) => {
  try {
    const secret = req.headers['x-max-bot-api-secret'];

    if (secret !== process.env.MAX_WEBHOOK_SECRET) {
      console.warn('❌ Invalid MAX webhook secret');
      return res.sendStatus(403);
    }

    //console.log('🔥 MAX WEBHOOK RECEIVED');
    //console.log(JSON.stringify(req.body, null, 2));

    const update = req.body;

    // Проверка типа обновления
    if (!update || update.update_type !== 'message_created') {
      //console.log('⚠️ Not a message_created update, skipping');
      return res.sendStatus(200);
    }

    const msg = update.message;
    const maxChatId = String(msg.recipient.chat_id);
    const maxUserId = String(msg.sender.user_id);
    const messageBody = msg.body;
    const rawStartText = String(messageBody?.text || '').trim();
    const roomStartMatch = /^\/start\s+(r_[A-Za-z0-9_-]+)\b/i.exec(rawStartText);
    if (roomStartMatch) {
      const roomInviteResult = await handleMaxRoomInviteStart({
        payload: roomStartMatch[1],
        maxChatId,
        maxUserId,
        username: msg.sender?.name || 'Клиент MAX',
      });
      if (roomInviteResult?.handled) return res.sendStatus(200);
    }

    // 1️⃣ Чат
    const [chat] = await MaxChat.findOrCreate({
      where: { maxChatId },
      defaults: { maxUserId, username: msg.sender.name },
    });

    // 2️⃣ Проверка дубля
    const exists = await MaxMessage.findOne({
      where: { maxMessageId: messageBody.mid },
    });

    if (exists) {
      //console.log('⚠️ Duplicate message, skipped');
      return res.sendStatus(200);
    }

    // 3️⃣ Определяем тип сообщения и вложения
    let messageType = 'text';
    let attachments = null;
    let text = messageBody.text || '';
    const startMatch = /^\/start\s+(p_[0-9a-z]+_[0-9a-z]+_[0-9a-f]{20})\b/i.exec(String(text || '').trim());
    const maxPersonalInvite = startMatch ? verifyPersonalInvitePayload(startMatch[1]) : null;
    if (maxPersonalInvite?.userId) {
      chat.botType = 'personal';
      chat.assigneeId = Number(maxPersonalInvite.userId);
      chat.participantIds = [];
      chat.isClosed = false;
      if (!chat.username || /^MAX\s/i.test(String(chat.username))) {
        chat.username = msg.sender?.name || chat.username || 'Клиент MAX';
      }
      await chat.save();
      text = 'Здравствуйте! Я перешел по приглашению в личный чат.';
    }
    let fileName = null;
    let mediaUrl = null;

    // Проверяем наличие вложений
    if (messageBody.attachments && messageBody.attachments.length > 0) {
      const firstAttachment = messageBody.attachments[0];
      
      //console.log(`📎 Вложение получено: тип ${firstAttachment.type}`);
      
      switch (firstAttachment.type) {
        case 'audio':
          messageType = 'audio';
          attachments = {
            audio: {
              url: firstAttachment.payload.url,
              token: firstAttachment.payload.token,
              id: firstAttachment.payload.id,
              // duration может приходить отдельно, если есть в API
              duration: firstAttachment.payload.duration || 0,
            }
          };
          break;
          
        case 'image':
          messageType = 'image';
          attachments = {
            image: {
              url: firstAttachment.payload.url,
              token: firstAttachment.payload.token,
              id: firstAttachment.payload.id,
              width: firstAttachment.payload.width,
              height: firstAttachment.payload.height,
            }
          };
          break;
          
        case 'document':
          messageType = 'document';
          attachments = {
            document: {
              url: firstAttachment.payload.url,
              token: firstAttachment.payload.token,
              id: firstAttachment.payload.id,
              filename: decodeFileNameSafe(firstAttachment.payload.filename),
              size: firstAttachment.payload.size,
            }
          };
          break;
          
        case 'video':
          messageType = 'video';
          attachments = {
            video: {
              url: firstAttachment.payload.url,
              token: firstAttachment.payload.token,
              id: firstAttachment.payload.id,
              duration: firstAttachment.payload.duration,
              width: firstAttachment.payload.width,
              height: firstAttachment.payload.height,
            }
          };
          break;
          
        default:
          //console.log(`⚠️ Неизвестный тип вложения: ${firstAttachment.type}`);
          messageType = 'text'; // оставляем как текст
      }
    }

    if (msg.link?.type === 'reply') {
      const linked = msg.link.message?.body || msg.link.message || {};
      attachments = {
        ...(attachments || {}),
        _reply: {
          externalMessageId: String(msg.link.mid || linked.mid || ''),
          authorName: msg.link.message?.sender?.name || 'MAX',
          content: String(linked.text || '').trim() || 'Вложение',
        },
      };
    }

    // 4️⃣ Сохраняем сообщение с типом и вложениями
    const message = await MaxMessage.create({
      mChatId: chat.id,
      maxMessageId: messageBody.mid,
      text, // может быть пустым для аудио/медиа
      fromMe: false,
      messageType, // 'text', 'audio', 'image', 'video', 'document'
      attachments, // JSON с данными вложения
      senderName: msg.sender?.name || chat.username || 'Клиент MAX',
      senderId: maxUserId,
    });

    // console.log(`✅ Сообщение сохранено (тип: ${messageType}):`, {
    //   id: message.id,
    //   text: message.text,
    //   messageType: message.messageType,
    //   hasAttachments: !!attachments,
    // });

    // 5️⃣ Отправляем через сокеты
    const io = getIO();
    io.to(`room-max-${chat.id}`).emit('max:new-message', {
      chatId: chat.id,
      message,
    });
    //console.log('📨 Эмит в комнату', `room-max-${chat.id}`);

    await maybeSendMaxClientAutoReply({ chat, io });




    // 🔔 6️⃣ ОТПРАВКА PUSH-УВЕДОМЛЕНИЙ ВСЕМ ПОЛЬЗОВАТЕЛЯМ
    (async () => {
      try {
        //console.log(`📢 Отправка push для Max чата ${chat.id}`);


      // Если чат закрыт, не отправляем уведомления
      if (chat.isClosed) {
        //console.log(`⏸️ Чат ${chat.id} закрыт, уведомления не отправляются`);
        return;
      }


      let tokens = [];
      let targetUsers = [];
      
      // Проверяем, назначен ли уже ответственный за чат
      if (chat.assigneeId) {
        // Чат уже закреплен за сотрудником - отправляем только ему
        //console.log(`📌 Чат ${chat.id} уже закреплен за сотрудником ${chat.assigneeId}`);
        targetUsers = [chat.assigneeId];
        
        const tokenRows = await PushToken.findAll({
          where: { userId: chat.assigneeId },
          attributes: ['token'],
        });
        
        tokens = tokenRows.map(row => row.token).filter(token => token);

        if (tokens.length === 0) {
          //console.log(`⚠️ У назначенного сотрудника (${chat.assigneeId}) нет активных токенов`);
        }


      } else {
        // Чат свободен - отправляем всем активным пользователям, кроме тех, кто заблокирован
        //console.log(`📢 Чат ${chat.id} свободен, рассылка всем сотрудникам`);
        
        // Получаем всех активных пользователей (можно добавить фильтр по роли)
        const tokenRows = await PushToken.findAll({
          attributes: ['token', 'userId'],
        });
        
        tokens = tokenRows.map(row => row.token).filter(token => token);
        targetUsers = tokenRows.map(row => row.userId).filter(id => id);
      }

        
        // // Получаем ВСЕ активные push-токены из БД
        // const tokenRows = await PushToken.findAll({
        //   attributes: ['token', 'userId'],
        // });

        // // Собираем все токены
        // const tokens = tokenRows
        //   .map(row => row.token)
        //   .filter(token => token); // Фильтруем пустые токены

        // Убираем дубликаты
        const uniqueTokens = [...new Set(tokens)];

        if (uniqueTokens.length === 0) {
          //console.log('⚠️ Нет активных push-токенов для рассылки');
          return;
        }

        // Формируем заголовок
        const senderName = msg.sender.name || 'клиент с Max';
        const title = `[MAX] Сообщение от ${senderName}`;

        // Формируем текст уведомления в зависимости от типа сообщения
        let body = text;
        if (!body && fileName) {
          body = fileName;
        } else if (!body && mediaUrl) {
          switch (messageType) {
            case 'audio':
              body = 'Аудиосообщение';
              break;
            case 'image':
              body = 'Изображение';
              break;
            case 'video':
              body = 'Видео';
              break;
            case 'document':
              body = 'Документ';
              break;
            default:
              body = 'Новое сообщение';
          }
        } else if (!body) {
          body = 'Новое сообщение';
        }

        // Обрезаем слишком длинный текст
        if (body && body.length > 100) {
          body = body.substring(0, 97) + '...';
        }

        // Формируем данные для навигации
        const data = {
          screen: 'MaxChatScreen',
          chatType: 'max',
          chatId: String(chat.id),
          messageType: messageType,
          messageText: text || '',
          mediaUrl: mediaUrl || null,
          fileName: fileName || null,
          senderName: senderName,
          messageId: String(message.id),
          assigneeId: chat.assigneeId || null, // добавляем информацию о назначении
          targetUsers: targetUsers, // Кому отправлено уведомление
        };

        //console.log(`📤 Отправка push ${uniqueTokens.length} пользователям для Max чата ${chat.id}`);

        // Отправляем push-уведомление
        await sendPushNotification(uniqueTokens, title, body, data);
        
        //console.log(`✅ Push отправлен для Max чата ${chat.id}`);

      } catch (pushError) {
        console.error('❌ Ошибка при отправке push-уведомления для Max чата:', pushError);
      }
    })();


    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error in webhook:', err);
    res.sendStatus(500);
  }
});


router.post('/webhooks/max-room', express.json(), async (req, res) => {
  try {
    const secret = req.headers['x-max-bot-api-secret'];
    const expectedSecret = process.env.MAX_ROOM_WEBHOOK_SECRET || process.env.MAX_WEBHOOK_SECRET;
    if (secret !== expectedSecret) {
      console.warn('Invalid MAX room webhook secret');
      return res.sendStatus(403);
    }

    const update = req.body;
    maxRoomDebug('received', { updateType: update?.update_type, keys: Object.keys(update || {}) });
    if (!update || update.update_type !== 'message_created') return res.sendStatus(200);

    const msg = update.message;
    const maxChatId = String(msg?.recipient?.chat_id || '');
    const maxUserId = String(msg?.sender?.user_id || '');
    const messageBody = msg?.body || {};
    const text = String(messageBody?.text || '').trim();
    maxRoomDebug('message', {
      maxChatId,
      maxUserId,
      senderName: msg?.sender?.name || null,
      text,
      bodyKeys: Object.keys(messageBody || {}),
    });

    const roomInvitePayload = extractRoomInvitePayloadFromMaxMessage(msg);
    if (roomInvitePayload) {
      maxRoomDebug('invite:start', { maxChatId, maxUserId, payloadPreview: roomInvitePayload.slice(0, 18) });
      const inviteResult = await handleMaxRoomInviteStart({
        payload: roomInvitePayload,
        maxChatId,
        maxUserId,
        username: msg?.sender?.name || 'Клиент MAX',
      });
      maxRoomDebug('invite:done', {
        handled: inviteResult?.handled,
        ok: inviteResult?.ok,
        reason: inviteResult?.reason || null,
        roomId: inviteResult?.room?.id || null,
      });
      return res.sendStatus(200);
    }

    const createResult = await createRoomMessageFromMaxParticipant({
      maxChatId,
      maxUserId,
      username: msg?.sender?.name || 'Клиент MAX',
      text,
      maxMessageId: messageBody?.mid || msg?.id || null,
      rawMessage: messageBody,
    });
    maxRoomDebug('message:done', { ok: createResult?.ok, reason: createResult?.reason || null, roomId: createResult?.roomId || null });
    return res.sendStatus(200);
  } catch (error) {
    console.error('[MAX:room] webhook failed', error);
    return res.sendStatus(200);
  }
});

module.exports = router;





















// const express = require('express');
// const router = express.Router();

// router.post('/webhooks/max', async (req, res) => {
//   console.log('🔥 MAX WEBHOOK RECEIVED');
//   console.log(JSON.stringify(req.body, null, 2));

//   res.sendStatus(200);
// });

// module.exports = router;


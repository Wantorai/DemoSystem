const express = require('express');
const router = express.Router();
const { TelegramChat, TelegramMessage, User } = require('../models');
const { getIO } = require('../socket');
const { sendPushNotification } = require('../services/sendPushNotification');
const { displayNameFromTelegram, parseTelegramMessage } = require('../services/telegramMessageParser');
const {
  getTelegramWebhookSecret,
  sendTelegramText,
  verifyPersonalInvitePayload,
} = require('../services/telegramApi');
const { maybeSendTelegramClientAutoReply } = require('../services/clientAutoReply');
const {
  handleTelegramRoomInviteStart,
  createRoomMessageFromTelegramParticipant,
} = require('../services/roomExternalParticipants');

const handleTelegramWebhook = (botType) => async (req, res) => {
  try {
    const isPersonal = botType === 'personal';

    const configuredSecret = getTelegramWebhookSecret(botType);
    const receivedSecret = String(req.headers['x-telegram-bot-api-secret-token'] || '');
    if (configuredSecret && receivedSecret !== configuredSecret) {
      console.warn(`[Telegram:${botType}] invalid webhook secret`);
      return res.sendStatus(403);
    }

    const message = req.body?.message;
    if (!message?.chat?.id || !message?.message_id) {
      return res.sendStatus(200);
    }
    if (message.from?.is_bot) return res.sendStatus(200);

    const telegramChatId = String(message.chat.id);
    const telegramUserId = message.from?.id != null ? String(message.from.id) : null;
    const username = displayNameFromTelegram(message.from || message.chat);
    const rawText = String(message.text || '').trim();
    const startMatch = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]+)\s*$/i.exec(rawText);
    if (startMatch?.[1]?.startsWith('r_')) {
      const roomInviteResult = await handleTelegramRoomInviteStart({
        payload: startMatch[1],
        telegramChatId,
        telegramUserId,
        username,
        botType,
      });
      if (roomInviteResult?.handled) return res.sendStatus(200);
    }
    let personalOwnerId = 0;
    let chat = await TelegramChat.findOne({ where: { botType, telegramChatId } });
    let created = false;

    if (isPersonal) {
      personalOwnerId = Number(chat?.assigneeId || 0);
      if (!personalOwnerId) {
        const invite = verifyPersonalInvitePayload(startMatch?.[1]);
        if (!invite?.userId) {
          await sendTelegramText(
            telegramChatId,
            'Для начала личного чата откройте персональную ссылку, которую вам прислал сотрудник.',
            'personal'
          ).catch(() => {});
          return res.sendStatus(200);
        }
        const owner = await User.findOne({
          where: { id: invite.userId, isActive: true, canTelegram: true },
          attributes: ['id'],
        });
        if (!owner) {
          await sendTelegramText(
            telegramChatId,
            'Эта ссылка больше недоступна. Попросите сотрудника создать новую.',
            'personal'
          ).catch(() => {});
          return res.sendStatus(200);
        }
        personalOwnerId = Number(owner.id);
      }
    }

    if (!chat) {
      try {
        [chat, created] = await TelegramChat.findOrCreate({
          where: { botType, telegramChatId },
          defaults: {
            botType,
            telegramUserId,
            username,
            assigneeId: isPersonal ? personalOwnerId : null,
            participantIds: [],
          },
        });
      } catch (error) {
        const isUniqueRace = error?.name === 'SequelizeUniqueConstraintError'
          || error?.original?.code === '23505'
          || error?.parent?.code === '23505';
        if (!isUniqueRace) throw error;
        chat = await TelegramChat.findOne({ where: { botType, telegramChatId } });
        if (!chat) throw error;
        created = false;
      }
    }
    if (!created) {
      const updates = {};
      if (!chat.username || chat.username === 'Telegram') updates.username = username;
      if (!chat.telegramUserId && telegramUserId) updates.telegramUserId = telegramUserId;
      if (isPersonal && !chat.assigneeId && personalOwnerId) {
        updates.assigneeId = personalOwnerId;
        updates.participantIds = [];
      }
      if (Object.keys(updates).length > 0) await chat.update(updates);
      personalOwnerId = Number(chat.assigneeId || personalOwnerId || 0);
    }

    const telegramMessageId = String(message.message_id);
    const existing = await TelegramMessage.findOne({
      where: { tChatId: chat.id, telegramMessageId },
    });
    if (existing) return res.sendStatus(200);

    const parsed = parseTelegramMessage(
      isPersonal && /^\/start(?:@\w+)?\b/i.test(String(message.text || ''))
        ? { ...message, text: 'Личный чат создан' }
        : message,
      botType
    );
    const saved = await TelegramMessage.create({
      tChatId: chat.id,
      telegramMessageId,
      text: parsed.text,
      fromMe: false,
      messageType: parsed.messageType,
      attachments: parsed.attachments,
      senderName: username,
      senderId: telegramUserId,
    });

    const io = getIO();
    const payload = { chatId: chat.id, message: saved };
    const emit = (event, eventPayload) => {
      if (isPersonal) {
        io.to(`user:${personalOwnerId}`).emit(event, eventPayload);
      } else {
        io.emit(event, eventPayload);
      }
    };
    emit('telegram:new-message', payload);
    if (created) {
      emit('telegram:new-chat', {
        id: chat.id,
        username: chat.username,
        unreadCount: chat.unreadCount,
        telegramChatId,
        botType,
        isPersonal,
      });
    }
    await maybeSendTelegramClientAutoReply({ chat, emit });

    const participantIds = Array.isArray(chat.participantIds)
      ? chat.participantIds.map(Number).filter(Boolean)
      : [];
    let targetUserIds = isPersonal
      ? [personalOwnerId]
      : chat.assigneeId
      ? [Number(chat.assigneeId), ...participantIds]
      : (await User.findAll({
          where: { isActive: true, canTelegram: true },
          attributes: ['id'],
        })).map((user) => Number(user.id));
    targetUserIds = [...new Set(targetUserIds.filter(Boolean))];
    if (!chat.isClosed && targetUserIds.length > 0) {
      const body = parsed.text || ({
        audio: 'Голосовое сообщение',
        image: 'Изображение',
        video: 'Видео',
        document: 'Документ',
      }[parsed.messageType] || 'Новое сообщение');
      try {
        await sendPushNotification(
          targetUserIds,
          `[Telegram] ${username}`,
          body.slice(0, 100),
          {
            screen: 'TelegramChatScreen',
            chatType: 'telegram',
            chatId: String(chat.id),
            messageId: String(saved.id),
          }
        );
      } catch (pushError) {
        console.error(`[Telegram:${botType}] push failed`, pushError);
      }
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error(`[Telegram:${botType}] webhook failed`, error);
    return res.sendStatus(500);
  }
};


const handleTelegramRoomWebhook = async (req, res) => {
  try {
    const botType = 'room';
    const configuredSecret = getTelegramWebhookSecret(botType);
    const receivedSecret = String(req.headers['x-telegram-bot-api-secret-token'] || '');
    if (configuredSecret && receivedSecret !== configuredSecret) {
      console.warn('[Telegram:room] invalid webhook secret');
      return res.sendStatus(403);
    }

    const message = req.body?.message;
    if (!message?.chat?.id || !message?.message_id) return res.sendStatus(200);
    if (message.from?.is_bot) return res.sendStatus(200);

    const telegramChatId = String(message.chat.id);
    const telegramUserId = message.from?.id != null ? String(message.from.id) : null;
    const username = displayNameFromTelegram(message.from || message.chat);
    const rawText = String(message.text || '').trim();
    const startMatch = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]+)\s*$/i.exec(rawText);

    if (startMatch?.[1]?.startsWith('r_')) {
      const roomInviteResult = await handleTelegramRoomInviteStart({
        payload: startMatch[1],
        telegramChatId,
        telegramUserId,
        username,
        botType,
      });
      if (roomInviteResult?.handled) return res.sendStatus(200);
    }

    const result = await createRoomMessageFromTelegramParticipant({
      telegramChatId,
      telegramUserId,
      username,
      text: rawText,
      telegramMessageId: String(message.message_id),
      rawMessage: message,
    });

    if (!result.ok && result.reason === 'not_linked') {
      await sendTelegramText(
        telegramChatId,
        'Откройте ссылку приглашения в группу, которую вам прислал сотрудник.',
        botType
      ).catch(() => {});
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error('[Telegram:room] webhook failed', error);
    return res.sendStatus(500);
  }
};
router.post('/webhooks/telegram', express.json(), handleTelegramWebhook('business'));
router.post('/webhooks/telegram-personal', express.json(), handleTelegramWebhook('personal'));
router.post('/webhooks/telegram-room', express.json(), handleTelegramRoomWebhook);

module.exports = router;

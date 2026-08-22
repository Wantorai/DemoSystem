const express = require('express');
const router = express.Router();
const { WhatsAppChat, WhatsAppMessage, User } = require('../models');
const { getIO } = require('../socket');
const { sendPushNotification } = require('../services/sendPushNotification');
const { displayNameFromWhatsApp, parseWhatsAppMessage } = require('../services/whatsappMessageParser');
const {
  getWhatsAppWebhookVerifyToken,
  sendWhatsAppText,
  verifyPersonalInvitePayload,
  verifyWebhookSignature,
} = require('../services/whatsappApi');

const jsonWithRawBody = express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
});

const extractMessages = (body = {}) => {
  const result = [];
  const entries = Array.isArray(body.entry) ? body.entry : [];
  entries.forEach((entry) => {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    changes.forEach((change) => {
      const value = change.value || {};
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const contactByWaId = new Map(contacts.map((contact) => [String(contact.wa_id || ''), contact]));
      (Array.isArray(value.messages) ? value.messages : []).forEach((message) => {
        result.push({
          message,
          contact: contactByWaId.get(String(message.from || '')) || contacts[0] || {},
          phoneNumberId: value.metadata?.phone_number_id || null,
        });
      });
    });
  });
  return result;
};

const buildPushBody = (parsed) => parsed.text || ({
  audio: 'Голосовое сообщение',
  image: 'Изображение',
  video: 'Видео',
  document: 'Документ',
}[parsed.messageType] || 'Новое сообщение');

const handleIncomingWhatsAppMessage = async ({ message, contact }) => {
  const whatsappChatId = String(message.from || contact?.wa_id || '').replace(/[^\d]/g, '');
  if (!whatsappChatId || !message.id) return;

  const rawText = String(message.text?.body || '').trim();
  const startMatch = /^\/start\s+([A-Za-z0-9_-]+)\s*$/i.exec(rawText);
  let botType = 'business';
  let personalOwnerId = 0;
  let chat = await WhatsAppChat.findOne({
    where: { botType: 'personal', whatsappChatId },
  });

  if (chat) {
    botType = 'personal';
    personalOwnerId = Number(chat.assigneeId || 0);
  } else if (startMatch?.[1]) {
    const invite = verifyPersonalInvitePayload(startMatch[1]);
    if (invite?.userId) {
      const owner = await User.findOne({
        where: { id: invite.userId, isActive: true, canWhatsApp: true },
        attributes: ['id'],
      });
      if (owner) {
        botType = 'personal';
        personalOwnerId = Number(owner.id);
      }
    }
  }

  const username = displayNameFromWhatsApp(contact, whatsappChatId);
  let created = false;
  if (!chat) {
    [chat, created] = await WhatsAppChat.findOrCreate({
      where: { botType, whatsappChatId },
      defaults: {
        botType,
        whatsappUserId: whatsappChatId,
        username,
        assigneeId: botType === 'personal' ? personalOwnerId : null,
        participantIds: [],
      },
    });
  }

  const updates = {};
  if (!chat.username || chat.username === 'WhatsApp') updates.username = username;
  if (!chat.whatsappUserId) updates.whatsappUserId = whatsappChatId;
  if (botType === 'personal' && !chat.assigneeId && personalOwnerId) {
    updates.assigneeId = personalOwnerId;
    updates.participantIds = [];
  }
  if (Object.keys(updates).length > 0) await chat.update(updates);
  personalOwnerId = Number(chat.assigneeId || personalOwnerId || 0);

  if (botType === 'personal' && !personalOwnerId) {
    await sendWhatsAppText(
      whatsappChatId,
      'Для начала личного чата откройте персональную ссылку, которую вам прислал сотрудник.'
    ).catch(() => {});
    return;
  }

  const existing = await WhatsAppMessage.findOne({
    where: { wChatId: chat.id, whatsappMessageId: String(message.id) },
  });
  if (existing) return;

  const parsed = parseWhatsAppMessage(
    botType === 'personal' && /^\/start\b/i.test(rawText)
      ? { type: 'text', text: { body: 'Личный чат создан' } }
      : message
  );
  const saved = await WhatsAppMessage.create({
    wChatId: chat.id,
    whatsappMessageId: String(message.id),
    text: parsed.text,
    fromMe: false,
    messageType: parsed.messageType,
    attachments: parsed.attachments,
    senderName: username,
    senderId: whatsappChatId,
  });

  const io = getIO();
  const emit = (event, payload) => {
    if (botType === 'personal') {
      io.to(`user:${personalOwnerId}`).emit(event, payload);
    } else {
      io.emit(event, payload);
    }
  };

  emit('whatsapp:new-message', { chatId: chat.id, message: saved });
  if (created) {
    emit('whatsapp:new-chat', {
      id: chat.id,
      username: chat.username,
      unreadCount: chat.unreadCount,
      whatsappChatId,
      botType,
      isPersonal: botType === 'personal',
    });
  }

  const participantIds = Array.isArray(chat.participantIds)
    ? chat.participantIds.map(Number).filter(Boolean)
    : [];
  let targetUserIds = botType === 'personal'
    ? [personalOwnerId]
    : chat.assigneeId
      ? [Number(chat.assigneeId), ...participantIds]
      : (await User.findAll({
          where: { isActive: true, canWhatsApp: true },
          attributes: ['id'],
        })).map((user) => Number(user.id));
  targetUserIds = [...new Set(targetUserIds.filter(Boolean))];
  if (!chat.isClosed && targetUserIds.length > 0) {
    await sendPushNotification(
      targetUserIds,
      `[WhatsApp] ${username}`,
      buildPushBody(parsed).slice(0, 100),
      {
        screen: 'WhatsAppChatScreen',
        chatType: 'whatsapp',
        chatId: String(chat.id),
        messageId: String(saved.id),
      }
    ).catch((error) => console.error('[WhatsApp] push failed', error));
  }
};

router.get('/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === getWhatsAppWebhookVerifyToken()) {
    return res.status(200).send(String(challenge || ''));
  }
  return res.sendStatus(403);
});

router.post('/webhooks/whatsapp', jsonWithRawBody, async (req, res) => {
  try {
    if (!verifyWebhookSignature(req)) return res.sendStatus(403);
    const messages = extractMessages(req.body);
    for (const item of messages) {
      await handleIncomingWhatsAppMessage(item);
    }
    return res.sendStatus(200);
  } catch (error) {
    console.error('[WhatsApp] webhook failed', error?.response?.data || error);
    return res.sendStatus(500);
  }
});

module.exports = router;

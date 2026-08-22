const axios = require('axios');
const { Op } = require('sequelize');
const db = require('../models');
const { sendTelegramText } = require('./telegramApi');

const {
  MaxMessage,
  TelegramMessage,
} = db;

const UserSetting = db.sequelize.models.UserSetting;

const CLIENT_AUTO_REPLY_KEY = 'client_auto_reply';
const DEFAULT_PRIVACY_POLICY_URL = 'https://artcoupe.pro/privacy-policy.html';
const DEFAULT_CLIENT_AUTO_REPLY_TEXT = [
  'Здравствуйте! 👋',
  'Спасибо! Мы получили сообщение и уже смотрим 👀',
  '',
  'Чтобы помочь быстрее, в чат могут подключаться разные сотрудники.',
  '',
  'Продолжая диалог, вы соглашаетесь с обработкой персональных данных:',
  '',
  '{{policyUrl}}',
].join('\n');

const normalizeClientAutoReply = (raw) => {
  const text = String(raw?.text || '').trim() || DEFAULT_CLIENT_AUTO_REPLY_TEXT;
  const policyUrl = String(
    raw?.policyUrl || process.env.PRIVACY_POLICY_URL || process.env.privacyPolicyUrl || DEFAULT_PRIVACY_POLICY_URL
  ).trim();
  return {
    enabled: raw?.enabled !== false,
    text,
    policyUrl,
  };
};

const renderClientAutoReplyText = (state) => {
  const policyUrl = String(state?.policyUrl || process.env.PRIVACY_POLICY_URL || process.env.privacyPolicyUrl || DEFAULT_PRIVACY_POLICY_URL).trim();
  return String(state?.text || DEFAULT_CLIENT_AUTO_REPLY_TEXT)
    .replace(/Ссылка\s+отсутствует/gi, policyUrl)
    .replace(/\{\{\s*policyUrl\s*\}\}/gi, policyUrl)
    .trim();
};

const getClientAutoReply = async (userId) => {
  const ownerId = Number(userId || 0);
  const row = ownerId
    ? await UserSetting.findOne({
        where: { userId: ownerId, key: CLIENT_AUTO_REPLY_KEY },
        attributes: ['value', 'userId'],
      })
    : await UserSetting.findOne({
        where: { key: CLIENT_AUTO_REPLY_KEY },
        attributes: ['value', 'userId'],
        order: [['updatedAt', 'DESC']],
      });
  return {
    ownerId: Number(row?.userId || ownerId || 0),
    ...normalizeClientAutoReply(row?.value || {}),
  };
};

const shouldSendForMax = async (chatId) => {
  const [incomingCount, existingAutoReply] = await Promise.all([
    MaxMessage.count({ where: { mChatId: chatId, fromMe: false } }),
    MaxMessage.findOne({
      where: {
        mChatId: chatId,
        fromMe: true,
        text: { [Op.like]: '%Продолжая диалог, вы соглашаетесь%' },
      },
      attributes: ['id'],
    }),
  ]);
  return incomingCount === 1 && !existingAutoReply;
};

const shouldSendForTelegram = async (chatId) => {
  const [incomingCount, existingAutoReply] = await Promise.all([
    TelegramMessage.count({ where: { tChatId: chatId, fromMe: false } }),
    TelegramMessage.findOne({
      where: {
        tChatId: chatId,
        fromMe: true,
        text: { [Op.like]: '%Продолжая диалог, вы соглашаетесь%' },
      },
      attributes: ['id'],
    }),
  ]);
  return incomingCount === 1 && !existingAutoReply;
};

const sendMaxText = async (chat, text) => {
  const maxUserId = String(chat?.maxUserId || '');
  if (!maxUserId || maxUserId.startsWith('phone:')) return null;
  return axios.post(
    `https://platform-api2.max.ru/messages?user_id=${encodeURIComponent(maxUserId)}`,
    { text },
    {
      headers: {
        Authorization: `${process.env.MAX_TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: 12000,
    }
  );
};

const maybeSendMaxClientAutoReply = async ({ chat, io }) => {
  try {
    if (!(await shouldSendForMax(chat.id))) return null;

    const settings = await getClientAutoReply(chat?.assigneeId);
    if (!settings?.enabled) return null;

    const text = renderClientAutoReplyText(settings);
    if (!text) return null;

    const response = await sendMaxText(chat, text);
    const maxMessageId = response?.data?.message?.body?.mid || `auto-${Date.now()}`;
    const message = await MaxMessage.create({
      mChatId: chat.id,
      maxMessageId: String(maxMessageId),
      text,
      fromMe: true,
      messageType: 'text',
      senderName: 'Автоответ',
      senderId: String(settings.ownerId || 'auto'),
    });

    io?.to(`room-max-${chat.id}`).emit('max:new-message', {
      chatId: chat.id,
      message,
    });
    return message;
  } catch (error) {
    console.error('[ClientAutoReply][max] failed', error?.response?.data || error);
    return null;
  }
};

const maybeSendTelegramClientAutoReply = async ({ chat, emit }) => {
  try {
    if (!(await shouldSendForTelegram(chat.id))) return null;

    const settings = await getClientAutoReply(chat?.assigneeId);
    if (!settings?.enabled) return null;

    const text = renderClientAutoReplyText(settings);
    if (!text) return null;

    const sent = await sendTelegramText(chat.telegramChatId, text, chat.botType);
    const message = await TelegramMessage.create({
      tChatId: chat.id,
      telegramMessageId: String(sent.message_id),
      text,
      fromMe: true,
      messageType: 'text',
      senderName: 'Автоответ',
      senderId: String(settings.ownerId || 'auto'),
    });

    emit?.('telegram:new-message', { chatId: chat.id, message });
    return message;
  } catch (error) {
    console.error('[ClientAutoReply][telegram] failed', error?.response?.data || error);
    return null;
  }
};

module.exports = {
  maybeSendMaxClientAutoReply,
  maybeSendTelegramClientAutoReply,
};

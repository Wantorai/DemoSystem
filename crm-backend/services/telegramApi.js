const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');

const normalizeBotType = (botType) => {
  if (botType === 'personal') return 'personal';
  if (botType === 'room') return 'room';
  return 'business';
};
const getToken = (botType = 'business') => {
  const normalizedBotType = normalizeBotType(botType);
  return String((
    normalizedBotType === 'personal'
      ? process.env.TELEGRAM_PERSONAL_TOKEN
      : normalizedBotType === 'room'
      ? process.env.TELEGRAM_ROOM_TOKEN
      : process.env.TELEGRAM_TOKEN
  ) || '').trim();
};
const getBaseUrl = (botType = 'business') => {
  const normalizedBotType = normalizeBotType(botType);
  const token = getToken(normalizedBotType);
  if (!token) throw new Error(
    normalizedBotType === 'personal'
      ? 'TELEGRAM_PERSONAL_TOKEN is not configured'
      : normalizedBotType === 'room'
      ? 'TELEGRAM_ROOM_TOKEN is not configured'
      : 'TELEGRAM_TOKEN is not configured'
  );
  return `https://api.telegram.org/bot${token}`;
};
const telegramHttpsAgent = new https.Agent({
  keepAlive: true,
  family: 4,
});
const getTelegramWebhookSecret = (botType = 'business') => {
  const normalizedBotType = normalizeBotType(botType);
  const configured = String((
    normalizedBotType === 'personal'
      ? process.env.TELEGRAM_PERSONAL_WEBHOOK_SECRET
      : normalizedBotType === 'room'
      ? process.env.TELEGRAM_ROOM_WEBHOOK_SECRET
      : process.env.TELEGRAM_WEBHOOK_SECRET
  ) || '').trim();
  if (configured) return configured;
  const token = getToken(normalizedBotType);
  return token ? crypto.createHash('sha256').update(token).digest('hex') : '';
};

const getTelegramWebhookUrl = (botType = 'business') => {
  const normalizedBotType = normalizeBotType(botType);
  const configured = String((
    normalizedBotType === 'personal'
      ? process.env.TELEGRAM_PERSONAL_WEBHOOK_URL
      : normalizedBotType === 'room'
      ? process.env.TELEGRAM_ROOM_WEBHOOK_URL
      : process.env.TELEGRAM_WEBHOOK_URL
  ) || '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  const candidates = [process.env.API_BASE_URL, process.env.SOCKET_BASE_URL]
    .map((value) => String(value || '').trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const publicBase = candidates.find((value) => /^https:\/\//i.test(value));
  if (!publicBase) return '';
  const webhookPath = normalizedBotType === 'personal'
    ? 'webhooks/telegram-personal'
    : normalizedBotType === 'room'
    ? 'webhooks/telegram-room'
    : 'webhooks/telegram';
  return /\/api$/i.test(publicBase)
    ? `${publicBase}/${webhookPath}`
    : `${publicBase}/api/${webhookPath}`;
};

const telegramRequest = async (method, payload = {}, options = {}) => {
  let response;
  try {
    response = await axios.post(`${getBaseUrl(options.botType)}/${method}`, payload, {
      timeout: options.timeout || 30000,
      headers: options.headers,
      httpsAgent: telegramHttpsAgent,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  } catch (error) {
    const description = error?.response?.data?.description;
    if (description) {
      error.message = description;
      error.telegramDescription = description;
    }
    throw error;
  }
  if (!response.data?.ok) {
    throw new Error(response.data?.description || `Telegram ${method} failed`);
  }
  return response.data.result;
};

const sendTelegramText = (chatId, text, botType = 'business', replyToMessageId = null, options = {}) =>
  telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    ...(options.parseMode ? { parse_mode: options.parseMode } : {}),
    ...(replyToMessageId ? {
      reply_parameters: { message_id: Number(replyToMessageId), allow_sending_without_reply: true },
    } : {}),
  }, { botType });

const sendTelegramFile = async ({
  chatId,
  filePath,
  fileName,
  mimeType,
  method,
  field,
  caption,
  extraFields = {},
  botType = 'business',
  replyToMessageId = null,
  parseMode = null,
}) => {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) form.append('caption', String(caption));
  if (parseMode) form.append('parse_mode', String(parseMode));
  if (replyToMessageId) {
    form.append('reply_parameters', JSON.stringify({
      message_id: Number(replyToMessageId),
      allow_sending_without_reply: true,
    }));
  }
  Object.entries(extraFields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      form.append(key, String(value));
    }
  });
  form.append(field, fs.createReadStream(filePath), {
    filename: fileName,
    contentType: mimeType || 'application/octet-stream',
  });
  return telegramRequest(method, form, {
    timeout: 120000,
    headers: form.getHeaders(),
    botType,
  });
};

const getTelegramFile = async (fileId, botType = 'business') =>
  telegramRequest('getFile', { file_id: fileId }, { botType });

const getTelegramFileUrl = (filePath, botType = 'business') => {
  const token = getToken(botType);
  return `https://api.telegram.org/file/bot${token}/${String(filePath || '').replace(/^\/+/, '')}`;
};

const getPersonalInviteSecret = () => String(
  process.env.TELEGRAM_PERSONAL_INVITE_SECRET
  || process.env.TELEGRAM_PERSONAL_WEBHOOK_SECRET
  || getToken('personal')
  || ''
).trim();

const signPersonalInvite = (body) =>
  crypto.createHmac('sha256', getPersonalInviteSecret()).update(body).digest('hex').slice(0, 20);

const createPersonalInvitePayload = (userId, ttlDays = 30) => {
  const numericUserId = Number(userId || 0);
  if (!numericUserId || !getPersonalInviteSecret()) return null;
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + Math.max(1, Number(ttlDays || 30)) * 86400;
  const body = `${numericUserId.toString(36)}_${expiresAtSeconds.toString(36)}`;
  return {
    payload: `p_${body}_${signPersonalInvite(body)}`,
    expiresAt: new Date(expiresAtSeconds * 1000),
  };
};

const verifyPersonalInvitePayload = (payload) => {
  const match = /^p_([0-9a-z]+)_([0-9a-z]+)_([0-9a-f]{20})$/i.exec(String(payload || ''));
  if (!match || !getPersonalInviteSecret()) return null;
  const body = `${match[1]}_${match[2]}`;
  const expected = signPersonalInvite(body);
  const received = match[3].toLowerCase();
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) return null;
  const userId = parseInt(match[1], 36);
  const expiresAtSeconds = parseInt(match[2], 36);
  if (!userId || !expiresAtSeconds || expiresAtSeconds < Math.floor(Date.now() / 1000)) return null;
  return { userId, expiresAt: new Date(expiresAtSeconds * 1000) };
};

let personalBotUsernameCache = '';
const getPersonalBotUsername = async () => {
  const configured = String(process.env.TELEGRAM_PERSONAL_BOT_USERNAME || '')
    .trim()
    .replace(/^@/, '');
  if (configured) return configured;
  if (personalBotUsernameCache) return personalBotUsernameCache;
  const me = await telegramRequest('getMe', {}, { botType: 'personal' });
  personalBotUsernameCache = String(me?.username || '').trim().replace(/^@/, '');
  return personalBotUsernameCache;
};

module.exports = {
  getToken,
  normalizeBotType,
  getTelegramWebhookSecret,
  getTelegramWebhookUrl,
  telegramRequest,
  sendTelegramText,
  sendTelegramFile,
  getTelegramFile,
  getTelegramFileUrl,
  createPersonalInvitePayload,
  verifyPersonalInvitePayload,
  getPersonalBotUsername,
};

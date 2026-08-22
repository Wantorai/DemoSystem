const {
  telegramRequest,
  getToken,
  getTelegramWebhookSecret,
  getTelegramWebhookUrl,
} = require('./services/telegramApi');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const CHAT_TRACE_LOGS = String(process.env.CHAT_TRACE_LOGS || '').trim().toLowerCase() === 'true';
const chatTraceLog = (...args) => {
  if (CHAT_TRACE_LOGS) console.log(...args);
};

async function registerOneTelegramWebhook(botType) {
  const label = botType === 'personal' ? 'TelegramPersonal' : botType === 'room' ? 'TelegramRoom' : 'Telegram';
  if (!getToken(botType)) {
    chatTraceLog(`[${label}] token is empty, integration disabled`);
    return;
  }
  const webhookUrl = getTelegramWebhookUrl(botType);
  if (!webhookUrl) {
    console.warn('[Telegram] public HTTPS webhook URL was not found; set TELEGRAM_WEBHOOK_URL or public API_BASE_URL/SOCKET_BASE_URL');
    return;
  }
  const secretToken = getTelegramWebhookSecret(botType);
  if (!/^https:\/\/[^\s]+$/i.test(webhookUrl)) {
    console.error(`[${label}] invalid webhook URL`, { webhookUrl });
    return;
  }
  if (secretToken && !/^[A-Za-z0-9_-]{1,256}$/.test(secretToken)) {
    console.error(`[${label}] invalid webhook secret format`, {
      length: secretToken.length,
      allowedCharacters: 'A-Z a-z 0-9 _ -',
    });
    return;
  }
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await telegramRequest('setWebhook', {
        url: webhookUrl,
        allowed_updates: ['message'],
        ...(secretToken ? { secret_token: secretToken } : {}),
      }, { botType });
      chatTraceLog(`[${label}] webhook registered`, { webhookUrl });
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[${label}] webhook registration attempt failed`, {
        attempt,
        code: error?.code || null,
        status: error?.response?.status || null,
        message: error?.telegramDescription
          || error?.response?.data?.description
          || error?.message
          || 'Unknown error',
        telegramResponse: error?.response?.data
          ? {
              ok: error.response.data.ok,
              errorCode: error.response.data.error_code,
              description: error.response.data.description,
            }
          : null,
      });
      if (attempt < 3) await sleep(attempt * 3000);
    }
  }
  throw lastError || new Error('Telegram webhook registration failed');
}

async function registerTelegramWebhook() {
  const results = await Promise.allSettled([
    registerOneTelegramWebhook('business'),
    registerOneTelegramWebhook('personal'),
    registerOneTelegramWebhook('room'),
  ]);
  const failed = results.find((result) => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
}

module.exports = registerTelegramWebhook;

const axios = require('axios');
require('dotenv').config();

const UPDATE_TYPES = ['message_created'];

async function registerMaxRoomWebhook() {
  const token = String(process.env.MAX_ROOM_TOKEN || '').trim();
  const webhookUrl = String(process.env.MAX_ROOM_WEBHOOK_URL || '').trim();
  const secret = String(process.env.MAX_ROOM_WEBHOOK_SECRET || '').trim();

  console.log('[MAX:room][register] config', {
    hasToken: Boolean(token),
    hasWebhookUrl: Boolean(webhookUrl),
    webhookUrl: webhookUrl || null,
    hasSecret: Boolean(secret),
  });

  if (!token || !webhookUrl || !secret) {
    console.warn('[MAX:room][register] skipped: missing env');
    return;
  }

  const headers = {
    Authorization: token,
    'Content-Type': 'application/json',
  };

  const res = await axios.get('https://platform-api2.max.ru/subscriptions', { headers });
  const subscriptions = res.data.subscriptions || [];
  console.log('[MAX:room][register] subscriptions:loaded', {
    count: subscriptions.length,
    urls: subscriptions.map((sub) => sub.url).filter(Boolean).slice(0, 10),
  });

  const exists = subscriptions.some((sub) =>
    sub.url === webhookUrl &&
    UPDATE_TYPES.every((type) => Array.isArray(sub.update_types) && sub.update_types.includes(type))
  );

  if (exists) {
    console.log('[MAX:room][register] already-exists', { webhookUrl });
    return;
  }

  const createRes = await axios.post(
    'https://platform-api2.max.ru/subscriptions',
    {
      url: webhookUrl,
      update_types: UPDATE_TYPES,
      secret,
    },
    { headers }
  );
  console.log('[MAX:room][register] created', {
    webhookUrl,
    status: createRes.status,
    data: createRes.data || null,
  });
}

module.exports = registerMaxRoomWebhook;
// /registerMaxWebhook.js
const axios = require('axios');
require('dotenv').config();

const MAX_BOT_TOKEN = process.env.MAX_TOKEN;
const WEBHOOK_URL = process.env.MAX_WEBHOOK_URL;
const UPDATE_TYPES = ['message_created'];
const WEBHOOK_SECRET = process.env.MAX_WEBHOOK_SECRET;

const headers = {
  Authorization: MAX_BOT_TOKEN,
  'Content-Type': 'application/json',
};

async function registerWebhook() {
  const res = await axios.get(
    'https://platform-api2.max.ru/subscriptions',
    { headers }
  );

  const subscriptions = res.data.subscriptions || [];
  const exists = subscriptions.some(sub =>
    sub.url === WEBHOOK_URL &&
    UPDATE_TYPES.every(t => sub.update_types.includes(t))
  );

  if (exists) {
    // console.log('✅ MAX webhook already exists');
    return;
  }

    //   const createRes = await axios.post(
    await axios.post(
    'https://platform-api2.max.ru/subscriptions',
    {
      url: WEBHOOK_URL,
      update_types: UPDATE_TYPES,
      secret: WEBHOOK_SECRET,
    },
    { headers }
  );

  //console.log('✅ MAX webhook registered:', createRes.data);
}

module.exports = registerWebhook;


const crypto = require('crypto');

const getPersonalInviteSecret = () => String(
  process.env.MAX_PERSONAL_INVITE_SECRET
  || process.env.MAX_WEBHOOK_SECRET
  || process.env.MAX_TOKEN
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
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) return null;
  } catch {
    return null;
  }
  const userId = parseInt(match[1], 36);
  const expiresAtSeconds = parseInt(match[2], 36);
  if (!userId || !expiresAtSeconds || expiresAtSeconds < Math.floor(Date.now() / 1000)) return null;
  return { userId, expiresAt: new Date(expiresAtSeconds * 1000) };
};

const buildConfiguredMaxBotLink = (payload, linkKeys, usernameKeys) => {
  const configuredLink = linkKeys.map((key) => String(process.env[key] || '').trim()).find(Boolean) || '';
  if (configuredLink) {
    const sep = configuredLink.includes('?') ? '&' : '?';
    return `${configuredLink}${sep}start=${encodeURIComponent(payload)}`;
  }
  const username = usernameKeys.map((key) => String(process.env[key] || '').trim().replace(/^@/, '')).find(Boolean) || '';
  if (username) return `https://max.ru/${encodeURIComponent(username)}?start=${encodeURIComponent(payload)}`;
  return '';
};

const buildMaxBotLink = (payload) =>
  buildConfiguredMaxBotLink(payload, ['MAX_BOT_LINK', 'MAX_PERSONAL_BOT_LINK'], ['MAX_BOT_USERNAME', 'MAX_PERSONAL_BOT_USERNAME']);

const buildMaxRoomBotLink = (payload) =>
  buildConfiguredMaxBotLink(payload, ['MAX_ROOM_BOT_LINK', 'MAX_ROOM_LINK', 'MAX_BOT_LINK'], ['MAX_ROOM_BOT_USERNAME', 'MAX_BOT_USERNAME']);

module.exports = {
  createPersonalInvitePayload,
  verifyPersonalInvitePayload,
  buildMaxBotLink,
  buildMaxRoomBotLink,
};

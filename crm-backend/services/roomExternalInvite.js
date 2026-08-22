const crypto = require('crypto');

const getRoomExternalInviteSecret = () => String(
  process.env.ROOM_EXTERNAL_INVITE_SECRET
  || process.env.TELEGRAM_ROOM_INVITE_SECRET
  || process.env.TELEGRAM_PERSONAL_INVITE_SECRET
  || process.env.MAX_PERSONAL_INVITE_SECRET
  || process.env.MAX_WEBHOOK_SECRET
  || process.env.TELEGRAM_PERSONAL_WEBHOOK_SECRET
  || ''
).trim();

const signRoomInvite = (body) =>
  crypto.createHmac('sha256', getRoomExternalInviteSecret()).update(body).digest('hex').slice(0, 20);

const normalizeKind = (kind) => {
  const value = String(kind || '').trim().toLowerCase();
  if (value === 'telegram' || value === 'tg' || value === 't') return 'telegram';
  if (value === 'max' || value === 'm') return 'max';
  return null;
};

const kindToCode = (kind) => (normalizeKind(kind) === 'telegram' ? 't' : normalizeKind(kind) === 'max' ? 'm' : '');
const codeToKind = (code) => (String(code || '').toLowerCase() === 't' ? 'telegram' : String(code || '').toLowerCase() === 'm' ? 'max' : null);

const createRoomExternalInvitePayload = ({ roomId, inviterId, kind, ttlDays = 30 }) => {
  const normalizedKind = normalizeKind(kind);
  const numericRoomId = Number(roomId || 0);
  const numericInviterId = Number(inviterId || 0);
  if (!normalizedKind || !numericRoomId || !numericInviterId || !getRoomExternalInviteSecret()) return null;
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + Math.max(1, Number(ttlDays || 30)) * 86400;
  const body = `${kindToCode(normalizedKind)}_${numericRoomId.toString(36)}_${numericInviterId.toString(36)}_${expiresAtSeconds.toString(36)}`;
  return {
    payload: `r_${body}_${signRoomInvite(body)}`,
    expiresAt: new Date(expiresAtSeconds * 1000),
  };
};

const verifyRoomExternalInvitePayload = (payload) => {
  const match = /^r_([tm])_([0-9a-z]+)_([0-9a-z]+)_([0-9a-z]+)_([0-9a-f]{20})$/i.exec(String(payload || ''));
  if (!match || !getRoomExternalInviteSecret()) return null;
  const body = `${match[1].toLowerCase()}_${match[2]}_${match[3]}_${match[4]}`;
  const expected = signRoomInvite(body);
  const received = match[5].toLowerCase();
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) return null;
  } catch {
    return null;
  }
  const kind = codeToKind(match[1]);
  const roomId = parseInt(match[2], 36);
  const inviterId = parseInt(match[3], 36);
  const expiresAtSeconds = parseInt(match[4], 36);
  if (!kind || !roomId || !inviterId || !expiresAtSeconds || expiresAtSeconds < Math.floor(Date.now() / 1000)) return null;
  return { kind, roomId, inviterId, expiresAt: new Date(expiresAtSeconds * 1000) };
};

module.exports = {
  createRoomExternalInvitePayload,
  verifyRoomExternalInvitePayload,
  normalizeKind,
};


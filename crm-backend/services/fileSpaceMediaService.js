const crypto = require('crypto');

const secret = () => String(
  process.env.FILESPACE_MEDIA_SECRET || process.env.JWT_SECRET || process.env.BAZIS_API_KEY || ''
).trim();

const signatureFor = (fileId) => {
  if (!secret()) throw new Error('Не задан FILESPACE_MEDIA_SECRET или JWT_SECRET');
  return crypto.createHmac('sha256', secret()).update(String(fileId)).digest('base64url');
};

const createMediaPath = (fileId) => `/api/filespace/media/${fileId}?signature=${signatureFor(fileId)}`;

const verifyMediaSignature = (fileId, provided) => {
  const expected = signatureFor(fileId);
  const actual = String(provided || '');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
};

module.exports = { createMediaPath, verifyMediaSignature };

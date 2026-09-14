const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const RoomUsers = require('../models/RoomUsers');
const RoomMessage = require('../models/RoomMessage');
const { getIO } = require('../socket');

async function authorize(req, res) {
  const roomId = Number(req.params.roomId);
  const userId = Number(req.user?.id);
  if (!Number.isSafeInteger(roomId) || roomId <= 0 || !Number.isSafeInteger(userId) || userId <= 0) {
    res.status(400).json({ error: 'Некорректный чат или пользователь' });
    return null;
  }
  const member = await RoomUsers.findOne({ where: { roomId, userId, deletedAt: null }, attributes: ['userId'] });
  if (!member) { res.status(403).json({ error: 'Нет доступа к чату' }); return null; }
  return { roomId, userId };
}

exports.getUnplayedVoices = async (req, res, next) => {
  try {
    const scope = await authorize(req, res);
    if (!scope) return;
    const before = req.query.before == null ? null : Number(req.query.before);
    if (before != null && (!Number.isSafeInteger(before) || before <= 0)) return res.status(400).json({ error: 'Некорректный ID сообщения' });
    // Count and navigation target come from the same snapshot. No text or media is loaded.
    const [row] = await sequelize.query(`
      SELECT COUNT(*)::integer AS count,
        COALESCE(MAX(m.id) FILTER (WHERE (:before IS NULL OR m.id < :before)), MAX(m.id)) AS "nextMessageId"
      FROM "RoomMessages" m
      WHERE m."roomId" = :roomId AND m.type = 'audio' AND m."mediaUrl" IS NOT NULL
        AND m."createdAt" >= (SELECT "startedAt" FROM room_voice_tracking_start WHERE id = 1)
        AND m."userId" IS DISTINCT FROM :userId
        AND NOT EXISTS (SELECT 1 FROM room_voice_plays p WHERE p."userId" = :userId AND p."messageId" = m.id)
    `, { replacements: { ...scope, before }, type: QueryTypes.SELECT });
    res.set('Cache-Control', 'no-store').json({ count: Number(row.count), nextMessageId: row.nextMessageId == null ? null : Number(row.nextMessageId) });
  } catch (error) { next(error); }
};

exports.markVoicePlayed = async (req, res, next) => {
  try {
    const scope = await authorize(req, res);
    if (!scope) return;
    const messageId = Number(req.params.messageId);
    if (!Number.isSafeInteger(messageId) || messageId <= 0) return res.status(400).json({ error: 'Некорректный ID сообщения' });
    const message = await RoomMessage.findOne({ where: { id: messageId, roomId: scope.roomId, type: 'audio' }, attributes: ['id', 'userId', 'mediaUrl'] });
    if (!message?.mediaUrl || Number(message.userId) === scope.userId) return res.status(404).json({ error: 'Входящее голосовое не найдено' });
    await sequelize.query(`INSERT INTO room_voice_plays ("userId", "messageId", "playedAt")
      VALUES (:userId, :messageId, NOW()) ON CONFLICT ("userId", "messageId") DO NOTHING`, {
      replacements: { userId: scope.userId, messageId },
    });
    // Only this user's devices receive the listening receipt.
    try { getIO().to(`user:${scope.userId}`).emit('roomVoicePlayed', { roomId: scope.roomId, messageId }); } catch {}
    res.json({ ok: true, messageId });
  } catch (error) { next(error); }
};

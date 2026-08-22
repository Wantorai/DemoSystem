const { Op } = require('sequelize');
const db = require('../models');

const CrossCompanyChatRequest = db.sequelize.models.CrossCompanyChatRequest;

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isAcceptedWithRoom(row) {
  if (!row) return false;
  return String(row.status || '') === 'accepted' && toNum(row.roomId) > 0;
}

function canUserSeeRow(row, userId) {
  const uid = toNum(userId);
  if (!uid) return false;
  return toNum(row.requesterUserId) === uid || toNum(row.targetUserId) === uid;
}

function isCreator(row, userId) {
  const uid = toNum(userId);
  if (!uid) return false;
  return toNum(row.requesterUserId) === uid;
}

function isArchivedRow(row) {
  return Boolean(row?.chatArchivedAt);
}

async function findLatestAcceptedRowByRoom(roomId) {
  const rid = toNum(roomId);
  if (!rid) return null;
  return CrossCompanyChatRequest.findOne({
    where: {
      roomId: rid,
      status: 'accepted',
    },
    order: [['updatedAt', 'DESC'], ['id', 'DESC']],
  });
}

async function ensureRoomChatNotArchived(roomId) {
  const row = await findLatestAcceptedRowByRoom(roomId);
  if (!isAcceptedWithRoom(row)) return null;
  if (!isArchivedRow(row)) return row;
  const err = new Error('Чат в архиве у создателя. Отправка сообщений временно недоступна');
  err.status = 403;
  err.code = 'CROSS_CHAT_ARCHIVED';
  throw err;
}

async function listCrossChatRoomStatesForUser(userId, roomIds = null) {
  const uid = toNum(userId);
  if (!uid) return [];

  const where = {
    status: 'accepted',
    roomId: { [Op.ne]: null },
    [Op.or]: [{ requesterUserId: uid }, { targetUserId: uid }],
  };

  const parsedRoomIds = Array.isArray(roomIds)
    ? roomIds.map((v) => toNum(v)).filter((v) => v > 0)
    : [];
  if (parsedRoomIds.length > 0) {
    where.roomId = { [Op.in]: parsedRoomIds };
  }

  const rows = await CrossCompanyChatRequest.findAll({
    where,
    order: [['updatedAt', 'DESC'], ['id', 'DESC']],
    limit: 2000,
  });

  const byRoom = new Map();
  for (const row of rows) {
    const rid = toNum(row.roomId);
    if (!rid || byRoom.has(rid)) continue;
    if (!canUserSeeRow(row, uid)) continue;
    byRoom.set(rid, {
      roomId: rid,
      archived: isArchivedRow(row),
      canToggleArchive: isCreator(row, uid),
      isCreator: isCreator(row, uid),
      requestId: toNum(row.id),
    });
  }
  return Array.from(byRoom.values());
}

module.exports = {
  findLatestAcceptedRowByRoom,
  ensureRoomChatNotArchived,
  listCrossChatRoomStatesForUser,
  isCreator,
  isArchivedRow,
};


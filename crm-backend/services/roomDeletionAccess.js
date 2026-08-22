'use strict';

const db = require('../models');

const Room = db.sequelize.models.Room;
const RoomUsers = db.sequelize.models.RoomUsers;

function accessError(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

async function ensureRoomAllowsMessage(roomId, userId) {
  const room = await Room.findByPk(roomId, { attributes: ['id', 'type'] });
  if (!room) {
    throw accessError('Чат не найден', 'ROOM_NOT_FOUND', 404);
  }

  const memberships = await RoomUsers.findAll({
    where: { roomId },
    attributes: ['userId', 'deletedAt'],
  });
  const senderMembership = memberships.find(
    (membership) => Number(membership.userId) === Number(userId)
  );
  if (!senderMembership || senderMembership.deletedAt) {
    throw accessError('Вы удалили этот чат', 'ROOM_DELETED_FOR_USER', 403);
  }

  if (
    room.type === 'personal' &&
    memberships.some(
      (membership) =>
        Number(membership.userId) !== Number(userId) &&
        Boolean(membership.deletedAt)
    )
  ) {
    throw accessError(
      'Этот чат удалён у пользователя. Отправка сообщений недоступна.',
      'ROOM_DELETED_BY_PARTICIPANT',
      409
    );
  }

  return room;
}

module.exports = { ensureRoomAllowsMessage };

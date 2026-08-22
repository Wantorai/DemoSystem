const { Op } = require('sequelize');
const db = require('../models');
const { sendPushNotification } = require('../services/sendPushNotification');
const {
  normalizeDomain,
  getOwnDomain,
  verifyBridgeSignature,
  sendBridgePost,
} = require('../services/crossChatBridge');
const {
  ensureRoomChatNotArchived,
  listCrossChatRoomStatesForUser,
  isCreator,
} = require('../services/crossChatArchiveAccess');

const CrossCompanyChatRequest = db.sequelize.models.CrossCompanyChatRequest;
const User = db.sequelize.models.User;
const Room = db.sequelize.models.Room;
const RoomUsers = db.sequelize.models.RoomUsers;
const RoomMessage = db.sequelize.models.RoomMessage;
const RoomPinnedMessage = db.sequelize.models.RoomPinnedMessage;
const RoomPinnedArchive = db.sequelize.models.RoomPinnedArchive;
const RoomExternalParticipant = db.sequelize.models.RoomExternalParticipant;
const ScheduledMessage = db.sequelize.models.ScheduledMessage;
const Role = db.sequelize.models.Role;
const getIO = require('../socket').getIO;
const transcriptionQueue = require('../queues/transcriptionQueue');

function emitCrossChatArchiveUpdated(roomId, archived) {
  try {
    const io = getIO();
    io.to(`room-${Number(roomId)}`).emit('crossChatArchiveUpdated', {
      roomId: Number(roomId),
      archived: Boolean(archived),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[cross-chat] emit archive updated failed:', err?.message || err);
  }
}

let syncPromise = null;
function ensureCrossChatTables() {
  if (!syncPromise) {
    syncPromise = CrossCompanyChatRequest.sync().catch((err) => {
      syncPromise = null;
      throw err;
    });
  }
  return syncPromise;
}

function normalizePhone(raw) {
  const value = String(raw || '').replace(/\D/g, '');
  if (!value) return '';
  if (value.length === 11 && value.startsWith('8')) return `7${value.slice(1)}`;
  if (value.length === 10) return `7${value}`;
  return value;
}

function normalizeAvatarPath(value) {
  const raw = String(value || '').trim().replace(/\\/g, '/');
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const uploadsIndex = raw.indexOf('/uploads/');
  if (uploadsIndex >= 0) return raw.slice(uploadsIndex);
  if (raw.startsWith('uploads/')) return `/${raw}`;
  if (raw.startsWith('/')) return raw;
  return `/uploads/avatars/${raw.split('/').pop()}`;
}

function toAbsoluteAvatarUrl(value, domain) {
  const normalized = normalizeAvatarPath(value);
  if (!normalized) return null;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  const host = normalizeDomain(domain || '');
  return host ? `https://${host}${normalized}` : normalized;
}

function toAbsoluteMediaUrl(value, domain) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const host = normalizeDomain(domain || '');
  if (!host) return raw;
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  return `https://${host}${path}`;
}

async function createAcceptedGroupJoinMessage({ row, userId, userName }) {
  const roomId = Number(row?.roomId);
  const actorUserId = Number(userId);
  if (!Number.isFinite(roomId) || roomId <= 0 || !Number.isFinite(actorUserId) || actorUserId <= 0) return null;
  if (!isRoomInviteMeta(row?.bridgeMeta?.roomInvite)) return null;

  const clientId = `cross-join:${Number(row.id)}:${actorUserId}`;
  const existing = await RoomMessage.findOne({ where: { clientId } });
  if (existing?.id) return existing;

  const displayName = String(userName || 'Пользователь').trim() || 'Пользователь';
  const message = await RoomMessage.create({
    roomId,
    userId: actorUserId,
    content: `${displayName} присоединился к чату`,
    type: 'text',
    clientId,
    deliveryStatus: 'sent',
    readStatus: null,
  });

  const full = await RoomMessage.findByPk(message.id, {
    include: [{ model: User, attributes: ['id', 'name', 'avatar', 'phone'] }],
  });

  try {
    getIO().to(`room-${roomId}`).emit('newRoomMessage', full || message);
  } catch (err) {
    console.warn('[cross-chat][bridge][join-message] emit failed:', err?.message || err);
  }

  return full || message;
}

async function relayAcceptedGroupJoinMessage({ row, message, responderUser, ownDomain }) {
  if (!message?.id || !isRoomInviteMeta(row?.bridgeMeta?.roomInvite)) return;
  const targetDomain = normalizeDomain(row?.requesterDomain || '');
  const targetPhone = normalizePhone(row?.requesterPhone || '');
  if (!targetDomain || !targetPhone) return;

  const payload = {
    externalMessageId: `join:${Number(row.id)}:${Number(message.id)}`,
    sender: {
      userId: Number(responderUser?.id || row.targetUserId) || null,
      name: String(responderUser?.name || row.targetUserName || 'Сотрудник'),
      phone: String(row.targetPhone || '').replace(/\D/g, ''),
      domain: ownDomain,
      avatar: toAbsoluteMediaUrl(responderUser?.avatar, ownDomain),
    },
    target: {
      domain: targetDomain,
      phone: targetPhone,
    },
    message: {
      content: String(message.content || ''),
      type: String(message.type || 'text'),
      clientId: String(message.clientId || ''),
      createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : new Date().toISOString(),
      mediaUrl: toAbsoluteMediaUrl(message.mediaUrl, ownDomain),
      thumbnailUrl: toAbsoluteMediaUrl(message.thumbnailUrl, ownDomain),
      fileName: message.fileName || null,
      fileSize: Number.isFinite(Number(message.fileSize)) ? Number(message.fileSize) : null,
      duration: Number.isFinite(Number(message.duration)) ? Number(message.duration) : null,
      mediaMimeType: message.mediaMimeType || null,
      transcriptionText: message.transcriptionText || null,
      transcriptionStatus: message.transcriptionStatus || null,
    },
  };

  try {
    const result = await sendBridgePost(targetDomain, '/api/cross-chat/bridge/message', payload, ownDomain);
    console.log('[cross-chat][bridge][join-message] relay:ok', {
      requestId: Number(row.id) || null,
      roomId: Number(row.roomId) || null,
      messageId: Number(message.id),
      remoteRoomId: result?.roomId ?? null,
      remoteMessageId: result?.messageId ?? null,
      dedup: Boolean(result?.dedup),
    });
  } catch (err) {
    console.warn('[cross-chat][bridge][join-message] relay:failed', {
      requestId: Number(row.id) || null,
      roomId: Number(row.roomId) || null,
      messageId: Number(message.id),
      targetDomain,
      status: err?.response?.status || null,
      message: err?.message || String(err),
    });
  }
}

async function relayAcceptedGroupRoomMessages({ row, bridgeContactUserId, ownDomain, since }) {
  const roomId = Number(row?.roomId);
  const targetDomain = normalizeDomain(row?.targetDomain || '');
  const targetPhone = normalizePhone(row?.targetPhone || '');
  const bridgeUserId = Number(bridgeContactUserId);
  if (!Number.isFinite(roomId) || roomId <= 0 || !targetDomain || !targetPhone) return;

  const sinceDate = since instanceof Date && !Number.isNaN(since.getTime())
    ? since
    : new Date(Date.now() - 30000);

  const messages = await RoomMessage.findAll({
    where: {
      roomId,
      createdAt: { [Op.gte]: sinceDate },
      ...(Number.isFinite(bridgeUserId) && bridgeUserId > 0 ? { userId: { [Op.ne]: bridgeUserId } } : {}),
    },
    include: [{ model: User, attributes: ['id', 'name', 'phone', 'avatar'] }],
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
    limit: 50,
  });

  console.log('[cross-chat][bridge][catchup] start', {
    requestId: Number(row.id) || null,
    roomId,
    targetDomain,
    targetPhoneTail: targetPhone.slice(-4),
    since: sinceDate.toISOString(),
    count: messages.length,
  });

  for (const msg of messages) {
    const sender = msg.User || {};
    const payload = {
      externalMessageId: String(msg.id),
      sender: {
        userId: Number(sender.id || msg.userId) || null,
        name: String(sender.name || row.requesterName || 'Сотрудник'),
        phone: String(sender.phone || row.requesterPhone || '').replace(/\D/g, ''),
        domain: ownDomain,
        avatar: toAbsoluteMediaUrl(sender.avatar, ownDomain),
      },
      target: {
        domain: targetDomain,
        phone: targetPhone,
      },
      message: {
        content: String(msg.content || ''),
        type: String(msg.type || 'text'),
        clientId: String(msg.clientId || ''),
        createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : new Date().toISOString(),
        mediaUrl: toAbsoluteMediaUrl(msg.mediaUrl, ownDomain),
        thumbnailUrl: toAbsoluteMediaUrl(msg.thumbnailUrl, ownDomain),
        fileName: msg.fileName || null,
        fileSize: Number.isFinite(Number(msg.fileSize)) ? Number(msg.fileSize) : null,
        duration: Number.isFinite(Number(msg.duration)) ? Number(msg.duration) : null,
        mediaMimeType: msg.mediaMimeType || null,
        transcriptionText: msg.transcriptionText || null,
        transcriptionStatus: msg.transcriptionStatus || null,
      },
    };

    try {
      const result = await sendBridgePost(targetDomain, '/api/cross-chat/bridge/message', payload, ownDomain);
      console.log('[cross-chat][bridge][catchup] relay:ok', {
        requestId: Number(row.id) || null,
        roomId,
        messageId: Number(msg.id),
        remoteRoomId: result?.roomId ?? null,
        remoteMessageId: result?.messageId ?? null,
        dedup: Boolean(result?.dedup),
      });
    } catch (err) {
      console.warn('[cross-chat][bridge][catchup] relay:failed', {
        requestId: Number(row.id) || null,
        roomId,
        messageId: Number(msg.id),
        targetDomain,
        status: err?.response?.status || null,
        message: err?.message || String(err),
      });
    }
  }
}

async function findLocalUserByPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return User.findOne({
    where: {
      phone: {
        [Op.or]: [normalized, normalized.replace(/^7/, '8')],
      },
    },
    attributes: ['id', 'name', 'phone', 'avatar', 'isActive', 'roleId'],
  });
}

async function findOrCreatePersonalRoom(userAId, userBId) {
  const ids = [Number(userAId), Number(userBId)].filter((v) => Number.isFinite(v) && v > 0);
  if (ids.length !== 2 || ids[0] === ids[1]) return null;

  const rooms = await Room.findAll({
    where: { type: 'personal' },
    include: [{ model: User, attributes: ['id'], through: { attributes: [] }, where: { id: { [Op.in]: ids } } }],
    order: [['updatedAt', 'DESC']],
  });

  for (const room of rooms) {
    const users = await room.getUsers({ attributes: ['id'], through: { attributes: [] } });
    const userIds = users.map((u) => Number(u.id)).sort((a, b) => a - b);
    const expected = [...ids].sort((a, b) => a - b);
    if (userIds.length === 2 && userIds[0] === expected[0] && userIds[1] === expected[1]) {
      return room;
    }
  }

  const room = await Room.create({
    name: `personal-${Math.min(...ids)}-${Math.max(...ids)}`,
    type: 'personal',
    creatorUserId: ids[0],
  });

  await RoomUsers.bulkCreate([
    { roomId: room.id, userId: ids[0] },
    { roomId: room.id, userId: ids[1] },
  ]);

  return room;
}

function isRoomInviteMeta(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (
      Number(value.roomId) > 0 ||
      Number(value.sourceRoomId) > 0 ||
      String(value.mode || '') === 'group' ||
      String(value.roomName || '').trim()
    )
  );
}

async function findOrCreateInboundBridgeGroupRoom({ row, targetUserId, bridgeContactUserId }) {
  const existingRoomId = Number(row?.roomId);
  if (Number.isFinite(existingRoomId) && existingRoomId > 0) {
    const existingRoom = await Room.findByPk(existingRoomId);
    if (existingRoom?.id && String(existingRoom.type || '') === 'group') {
      await addUserToRoomIfMissing(Number(existingRoom.id), Number(targetUserId));
      await addUserToRoomIfMissing(Number(existingRoom.id), Number(bridgeContactUserId));
      return existingRoom;
    }
  }

  const roomInvite = row?.bridgeMeta?.roomInvite || {};
  const roomName = String(roomInvite.roomName || '').trim();
  const requesterName = String(row?.requesterName || '').trim();
  const requesterDomain = normalizeDomain(row?.requesterDomain || '');
  const name = roomName
    ? `${roomName} @${requesterDomain}`.slice(0, 160)
    : `Bridge ${requesterName || requesterDomain || 'group'}`.slice(0, 160);

  const room = await Room.create({
    name,
    type: 'group',
    creatorUserId: Number(targetUserId),
  });
  await RoomUsers.bulkCreate([
    { roomId: Number(room.id), userId: Number(targetUserId) },
    { roomId: Number(room.id), userId: Number(bridgeContactUserId) },
  ], { ignoreDuplicates: true }).catch(async () => {
    await addUserToRoomIfMissing(Number(room.id), Number(targetUserId));
    await addUserToRoomIfMissing(Number(room.id), Number(bridgeContactUserId));
  });
  if (row && Number(row.roomId) !== Number(room.id)) {
    row.roomId = Number(room.id);
    row.bridgeMeta = {
      ...(row.bridgeMeta || {}),
      localGroupRoom: {
        roomId: Number(room.id),
        createdAt: new Date().toISOString(),
      },
    };
    await row.save();
  }
  return room;
}

async function findOwnedGroupRoom(roomId, ownerUserId) {
  const id = Number(roomId);
  const userId = Number(ownerUserId);
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(userId) || userId <= 0) return null;
  return Room.findOne({
    where: {
      id,
      type: 'group',
      creatorUserId: userId,
    },
    attributes: ['id', 'name', 'type', 'creatorUserId'],
  });
}

async function addUserToRoomIfMissing(roomId, userId) {
  const id = Number(roomId);
  const memberId = Number(userId);
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(memberId) || memberId <= 0) return false;
  const existing = await RoomUsers.findOne({ where: { roomId: id, userId: memberId } });
  if (existing) return false;
  await RoomUsers.create({ roomId: id, userId: memberId });
  return true;
}

async function emitRoomParticipantsUpdated(roomId) {
  const id = Number(roomId);
  if (!Number.isFinite(id) || id <= 0) return;
  try {
    const fullRoom = await Room.findByPk(id, {
      include: [
        { model: User, attributes: ['id', 'name', 'roleId', 'avatar', 'phone', 'lastSeenAt'] },
        RoomExternalParticipant
          ? { model: RoomExternalParticipant, as: 'externalParticipants', required: false, where: { status: 'active' } }
          : null,
      ].filter(Boolean),
    });
    if (!fullRoom?.id) return;
    getIO().to(`room-${id}`).emit('room:participants_updated', {
      roomId: id,
      creatorUserId: fullRoom.creatorUserId || null,
      participantIds: Array.isArray(fullRoom.Users) ? fullRoom.Users.map((user) => Number(user.id)) : [],
      Users: fullRoom.Users || [],
      externalParticipants: fullRoom.externalParticipants || [],
    });
  } catch (err) {
    console.warn('[cross-chat] emit participants updated failed:', err?.message || err);
  }
}

async function resolveDefaultRoleId(preferredRoleId) {
  const preferred = Number(preferredRoleId);
  if (Number.isFinite(preferred) && preferred > 0) return preferred;

  try {
    if (Role?.findOne) {
      const role = await Role.findOne({ attributes: ['id'], order: [['id', 'ASC']] });
      const roleId = Number(role?.id);
      if (Number.isFinite(roleId) && roleId > 0) return roleId;
    }
  } catch (err) {
    console.warn('[cross-chat] resolve default role failed:', err?.message || err);
  }

  return 1;
}

async function ensureBridgeContactUser({ remoteDomain, remotePhone, displayName, preferredRoleId, remoteAvatar }) {
  const domain = normalizeDomain(remoteDomain || 'external');
  const phone = normalizePhone(remotePhone || '') || 'unknown';
  const bridgePhone = `xbridge:${domain}:${phone}`;
  const avatar = toAbsoluteAvatarUrl(remoteAvatar, domain);

  const existingByPhone = await User.findOne({
    where: { phone: bridgePhone },
    attributes: ['id', 'name', 'phone', 'avatar'],
  });
  if (existingByPhone?.id) {
    if (avatar && existingByPhone.avatar !== avatar) {
      existingByPhone.avatar = avatar;
      await existingByPhone.save();
    }
    return existingByPhone;
  }

  const roleId = await resolveDefaultRoleId(preferredRoleId);
  const hint = String(displayName || '').trim() || phone;
  const baseNameRaw = `${hint} @${domain}`;
  const baseName = baseNameRaw.slice(0, 110);

  let candidateName = baseName;
  for (let i = 1; i <= 20; i += 1) {
    const byName = await User.findOne({ where: { name: candidateName }, attributes: ['id'] });
    if (!byName) break;
    candidateName = `${baseName} #${i}`.slice(0, 120);
  }

  const created = await User.create({
    name: candidateName,
    password: `bridge-contact-${Date.now()}`,
    roleId,
    phone: bridgePhone,
    avatar,
    isActive: false,
    canChat: true,
    canMax: false,
    canTelegram: false,
  });

  return created;
}

async function createCrossChatRequest(req, res) {
  try {
    await ensureCrossChatTables();

    const requesterUserId = Number(req.user?.id);
    if (!Number.isFinite(requesterUserId) || requesterUserId <= 0) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const ownDomain = getOwnDomain(req);
    const requesterUser = await User.findByPk(requesterUserId, {
      attributes: ['id', 'name', 'phone', 'avatar'],
    });
    const requesterName = String(requesterUser?.name || req.user?.name || '').trim() || `User ${requesterUserId}`;
    const requesterPhone = normalizePhone(requesterUser?.phone || req.user?.phone || '');
    const requesterAvatar = toAbsoluteAvatarUrl(requesterUser?.avatar || req.user?.avatar, ownDomain);
    const targetDomain = normalizeDomain(req.body?.domain);
    const targetPhone = normalizePhone(req.body?.phone);
    const requestedRoomId = Number(req.body?.roomId) || null;
    const invitedRoom = requestedRoomId ? await findOwnedGroupRoom(requestedRoomId, requesterUserId) : null;

    if (!targetDomain) return res.status(400).json({ message: 'Укажите домен' });
    if (!targetPhone || targetPhone.length < 10) return res.status(400).json({ message: 'Укажите корректный телефон' });
    if (requestedRoomId && !invitedRoom?.id) {
      return res.status(403).json({ message: 'Приглашать в группу может только владелец группы' });
    }

    // Same-domain путь (локальный).
    if (targetDomain === ownDomain) {
      const targetUser = await findLocalUserByPhone(targetPhone);
      if (!targetUser?.id) {
        return res.status(404).json({ message: 'Сотрудник с таким номером не найден' });
      }
      if (Number(targetUser.id) === requesterUserId) {
        return res.status(400).json({ message: 'Нельзя отправить запрос самому себе' });
      }

      const existingPending = await CrossCompanyChatRequest.findOne({
        where: {
          requesterUserId,
          targetUserId: Number(targetUser.id),
          status: 'pending',
          targetDomain: ownDomain,
        },
        order: [['createdAt', 'DESC']],
      });
      if (existingPending) {
        return res.status(200).json({ message: 'Запрос уже отправлен', request: existingPending });
      }

      const row = await CrossCompanyChatRequest.create({
        requesterUserId,
        requesterName,
        requesterPhone,
        requesterDomain: ownDomain,
        targetDomain,
        targetPhone,
        targetUserId: Number(targetUser.id),
        targetUserName: String(targetUser.name || ''),
        status: 'pending',
        direction: 'outbound',
        roomId: invitedRoom?.id || null,
        bridgeMeta: invitedRoom?.id
          ? { mode: 'same-domain', roomInvite: { roomId: Number(invitedRoom.id), roomName: String(invitedRoom.name || '') } }
          : { mode: 'same-domain' },
      });

      const invitePushBody = invitedRoom?.id
        ? `${requesterName} (${ownDomain}) приглашает вас в группу ${String(invitedRoom.name || '').trim() || 'чат'}`
        : `${requesterName} (${ownDomain}) хочет создать чат`;
      sendPushNotification(
        [Number(targetUser.id)],
        'Запрос на чат',
        invitePushBody,
        {
          type: 'cross_chat_request',
          requestId: row.id,
          action: 'incoming',
          roomInvite: invitedRoom?.id ? '1' : undefined,
          roomName: invitedRoom?.id ? String(invitedRoom.name || '') : undefined,
        },
        { traceId: `cross-invite-${row.id}-${Date.now()}`, enableUnifiedParallel: true }
      ).catch((err) => console.warn('[cross-chat] push incoming failed:', err?.message || err));

      return res.status(201).json({ message: 'Запрос отправлен', request: row, mode: 'same-domain' });
    }

    // Cross-domain bridge путь.
    const outbound = await CrossCompanyChatRequest.create({
      requesterUserId,
      requesterName,
      requesterPhone,
      requesterDomain: ownDomain,
      targetDomain,
      targetPhone,
      status: 'pending',
      direction: 'outbound',
      roomId: invitedRoom?.id || null,
      bridgeMeta: {
        mode: 'bridge',
        stage: 'created',
        requesterAvatar,
        roomInvite: invitedRoom?.id
          ? { roomId: Number(invitedRoom.id), roomName: String(invitedRoom.name || '') }
          : null,
      },
    });

    const payload = {
      externalRequestId: String(outbound.id),
      requester: {
        userId: requesterUserId,
        name: requesterName,
        phone: requesterPhone,
        domain: ownDomain,
        avatar: requesterAvatar,
      },
      target: {
        domain: targetDomain,
        phone: targetPhone,
      },
      room: invitedRoom?.id
        ? {
            mode: 'group',
            name: String(invitedRoom.name || ''),
            sourceRoomId: Number(invitedRoom.id),
          }
        : null,
      sentAt: new Date().toISOString(),
    };

    try {
      const bridgeResult = await sendBridgePost(targetDomain, '/api/cross-chat/bridge/request', payload, ownDomain);
      outbound.bridgeMeta = {
        ...(outbound.bridgeMeta || {}),
        stage: 'bridge-sent',
        remoteResponse: bridgeResult || null,
        updatedAt: new Date().toISOString(),
      };
      await outbound.save();

      return res.status(201).json({
        message: 'Запрос отправлен в другую компанию',
        request: outbound,
        mode: 'bridge',
      });
    } catch (bridgeErr) {
      outbound.status = 'cancelled';
      outbound.decisionReason = 'bridge-send-failed';
      outbound.bridgeMeta = {
        ...(outbound.bridgeMeta || {}),
        stage: 'bridge-failed',
        error: bridgeErr?.message || String(bridgeErr),
        updatedAt: new Date().toISOString(),
      };
      outbound.decidedAt = new Date();
      await outbound.save();

      return res.status(502).json({
        message: 'Не удалось доставить запрос в целевую компанию',
        code: 'CROSS_CHAT_BRIDGE_SEND_FAILED',
        details: bridgeErr?.message || String(bridgeErr),
      });
    }
  } catch (err) {
    console.error('createCrossChatRequest error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function createInboundBridgeRequest(req, res) {
  try {
    await ensureCrossChatTables();

    const verified = verifyBridgeSignature(req);
    if (!verified.ok) {
      return res.status(401).json({ message: 'Bridge signature invalid', code: verified.code });
    }

    const ownDomain = getOwnDomain(req);
    const senderDomain = normalizeDomain(verified.senderDomain);
    const externalRequestId = String(req.body?.externalRequestId || '').trim();
    const requester = req.body?.requester || {};
    const target = req.body?.target || {};
    const roomInvite = req.body?.room && String(req.body.room?.mode || '') === 'group'
      ? {
          mode: 'group',
          sourceRoomId: Number(req.body.room?.sourceRoomId) || null,
          roomName: String(req.body.room?.name || '').trim(),
        }
      : null;
    const targetDomain = normalizeDomain(target.domain || '');
    const targetPhone = normalizePhone(target.phone || '');
    const requesterAvatar = toAbsoluteAvatarUrl(requester.avatar, senderDomain);

    if (!externalRequestId) {
      return res.status(400).json({ message: 'externalRequestId required' });
    }
    if (!targetDomain || targetDomain !== ownDomain) {
      return res.status(400).json({ message: 'Target domain mismatch' });
    }
    if (!targetPhone) {
      return res.status(400).json({ message: 'Target phone required' });
    }

    const existing = await CrossCompanyChatRequest.findOne({
      where: {
        direction: 'inbound',
        requesterDomain: senderDomain,
        externalRequestId,
      },
      order: [['createdAt', 'DESC']],
    });
    if (existing) {
      return res.json({ ok: true, requestId: existing.id, dedup: true });
    }

    const targetUser = await findLocalUserByPhone(targetPhone);
    if (!targetUser?.id) {
      return res.status(404).json({ message: 'Target user not found', code: 'TARGET_USER_NOT_FOUND' });
    }

    const row = await CrossCompanyChatRequest.create({
      requesterUserId: null,
      requesterName: String(requester.name || 'Сотрудник').trim(),
      requesterPhone: normalizePhone(requester.phone || ''),
      requesterDomain: senderDomain,
      targetDomain: ownDomain,
      targetPhone,
      targetUserId: Number(targetUser.id),
      targetUserName: String(targetUser.name || ''),
      status: 'pending',
      direction: 'inbound',
      externalRequestId,
      bridgeMeta: {
        mode: 'bridge',
        sourceDomain: senderDomain,
        sourceUserId: Number(requester.userId) || null,
        requesterAvatar,
        roomInvite,
      },
    });

    const inboundInvitePushBody = roomInvite
      ? `${row.requesterName} (${senderDomain}) приглашает вас в группу ${String(roomInvite.roomName || '').trim() || 'чат'}`
      : `${row.requesterName} (${senderDomain}) хочет создать чат`;
    sendPushNotification(
      [Number(targetUser.id)],
      'Запрос на чат',
      inboundInvitePushBody,
      {
        type: 'cross_chat_request',
        requestId: row.id,
        action: 'incoming',
        bridge: true,
        roomInvite: roomInvite ? '1' : undefined,
        roomName: roomInvite ? String(roomInvite.roomName || '') : undefined,
      },
      { traceId: `cross-invite-${row.id}-${Date.now()}`, enableUnifiedParallel: true }
    ).catch((err) => console.warn('[cross-chat] inbound bridge push failed:', err?.message || err));

    return res.status(201).json({ ok: true, requestId: row.id });
  } catch (err) {
    console.error('createInboundBridgeRequest error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

function parseBridgePhone(rawPhone) {
  const value = String(rawPhone || '').trim();
  const m = /^xbridge:([^:]+):(.+)$/i.exec(value);
  if (!m) return null;
  return {
    domain: normalizeDomain(String(m[1] || '')),
    phone: normalizePhone(String(m[2] || '')),
  };
}

async function fanOutInboundBridgeGroupMessage({ room, created, full, senderDomain, senderPhone, senderName, sourceRoomId, ownDomain }) {
  if (!room?.id || !created?.id) return;
  const sourcePhone = normalizePhone(senderPhone || '');
  const roomId = Number(room.id);
  const roomWithUsers = await Room.findByPk(roomId, {
    include: [{ model: User, attributes: ['id', 'name', 'phone', 'avatar'] }],
  });
  const bridgeUsers = (Array.isArray(roomWithUsers?.Users) ? roomWithUsers.Users : [])
    .map((user) => ({ user, peer: parseBridgePhone(user?.phone) }))
    .filter(({ peer }) => peer?.domain && peer?.phone)
    .filter(({ peer }) => !(peer.domain === senderDomain && peer.phone === sourcePhone));

  console.log('[cross-chat][bridge][fanout] start', {
    roomId,
    messageId: Number(created.id),
    senderDomain,
    senderPhoneTail: sourcePhone ? sourcePhone.slice(-4) : null,
    bridgeUsersCount: bridgeUsers.length,
    targets: bridgeUsers.map(({ user, peer }) => ({ userId: Number(user.id) || null, domain: peer.domain, phoneTail: peer.phone.slice(-4) })),
  });

  const messageSource = full || created;
  await Promise.allSettled(bridgeUsers.map(async ({ user, peer }) => {
    const payload = {
      externalMessageId: String(created.id),
      sender: {
        userId: Number(messageSource.userId || created.userId) || null,
        name: String(senderName || messageSource.externalAuthorName || 'Сотрудник'),
        phone: sourcePhone,
        domain: ownDomain,
        avatar: toAbsoluteMediaUrl(messageSource.User?.avatar || null, ownDomain),
      },
      target: {
        domain: peer.domain,
        phone: peer.phone,
      },
      room: {
        mode: 'group',
        sourceRoomId: roomId,
        name: String(room.name || ''),
        fanout: true,
      },
      message: {
        content: String(created.content || ''),
        type: String(created.type || 'text'),
        clientId: String(created.clientId || ''),
        createdAt: created.createdAt instanceof Date ? created.createdAt.toISOString() : new Date().toISOString(),
        mediaUrl: toAbsoluteMediaUrl(created.mediaUrl, ownDomain),
        thumbnailUrl: toAbsoluteMediaUrl(created.thumbnailUrl, ownDomain),
        fileName: created.fileName || null,
        fileSize: Number.isFinite(Number(created.fileSize)) ? Number(created.fileSize) : null,
        duration: Number.isFinite(Number(created.duration)) ? Number(created.duration) : null,
        mediaMimeType: created.mediaMimeType || null,
        transcriptionText: created.transcriptionText || null,
        transcriptionStatus: created.transcriptionStatus || null,
      },
    };

    try {
      const result = await sendBridgePost(peer.domain, '/api/cross-chat/bridge/message', payload, ownDomain);
      console.log('[cross-chat][bridge][fanout] relay:ok', {
        roomId,
        messageId: Number(created.id),
        targetUserId: Number(user.id) || null,
        targetDomain: peer.domain,
        remoteRoomId: result?.roomId ?? null,
        remoteMessageId: result?.messageId ?? null,
        dedup: Boolean(result?.dedup),
      });
    } catch (err) {
      console.warn('[cross-chat][bridge][fanout] relay:failed', {
        roomId,
        messageId: Number(created.id),
        targetUserId: Number(user.id) || null,
        targetDomain: peer.domain,
        status: err?.response?.status || null,
        data: err?.response?.data || null,
        message: err?.message || String(err),
      });
    }
  }));
}
async function findAcceptedBridgeGroupInvite({ senderDomain, senderPhone, targetUserId, sourceRoomId }) {
  const normalizedSourceRoomId = Number(sourceRoomId || 0);
  const baseWhere = {
    status: 'accepted',
    roomId: { [Op.ne]: null },
    [Op.or]: [
      {
        direction: 'inbound',
        requesterDomain: senderDomain,
        requesterPhone: senderPhone,
        targetUserId: Number(targetUserId),
      },
      {
        direction: 'outbound',
        targetDomain: senderDomain,
        targetPhone: senderPhone,
        requesterUserId: Number(targetUserId),
      },
    ],
  };

  const direct = await CrossCompanyChatRequest.findOne({
    where: baseWhere,
    order: [['updatedAt', 'DESC'], ['id', 'DESC']],
  });
  if (direct?.id) return direct;

  if (!Number.isFinite(normalizedSourceRoomId) || normalizedSourceRoomId <= 0) return null;

  const candidates = await CrossCompanyChatRequest.findAll({
    where: {
      status: 'accepted',
      roomId: { [Op.ne]: null },
      [Op.or]: [
        {
          direction: 'inbound',
          requesterDomain: senderDomain,
          targetUserId: Number(targetUserId),
        },
        {
          direction: 'outbound',
          targetDomain: senderDomain,
          requesterUserId: Number(targetUserId),
        },
      ],
    },
    order: [['updatedAt', 'DESC'], ['id', 'DESC']],
    limit: 30,
  });

  return candidates.find((row) => {
    const roomInvite = row?.bridgeMeta?.roomInvite;
    return isRoomInviteMeta(roomInvite) && Number(roomInvite.sourceRoomId || 0) === normalizedSourceRoomId;
  }) || null;
}
async function createInboundBridgeMessage(req, res) {
  try {
    await ensureCrossChatTables();

    const verified = verifyBridgeSignature(req);
    if (!verified.ok) {
      return res.status(401).json({ message: 'Bridge signature invalid', code: verified.code });
    }

    const senderDomain = normalizeDomain(verified.senderDomain);
    const externalMessageId = String(req.body?.externalMessageId || '').trim();
    const sender = req.body?.sender || {};
    const target = req.body?.target || {};
    const message = req.body?.message || {};
    const sourceRoomId = Number(req.body?.room?.sourceRoomId || 0) || null;
    const isBridgeFanout = req.body?.room?.fanout === true || req.body?.room?.fanout === '1';

    const targetPhone = normalizePhone(target.phone || '');
    const senderPhone = normalizePhone(sender.phone || '');
    const senderName = String(sender.name || 'Сотрудник').trim() || 'Сотрудник';
    const senderAvatar = toAbsoluteAvatarUrl(sender.avatar, senderDomain);
    const content = String(message.content || '');
    const type = String(message.type || 'text').trim() || 'text';
    const mediaUrl = String(message.mediaUrl || '').trim();
    const thumbnailUrl = String(message.thumbnailUrl || '').trim();
    const fileName = String(message.fileName || '').trim();
    const mediaMimeType = String(message.mediaMimeType || '').trim();
    const fileSize = Number(message.fileSize);
    const duration = Number(message.duration);
    const transcriptionText = typeof message.transcriptionText === 'string' ? message.transcriptionText : null;
    const transcriptionStatus = String(message.transcriptionStatus || '').trim() || null;
    const typeLower = String(type || '').toLowerCase();
    const shouldTranscribe = Boolean(mediaUrl) && (typeLower === 'audio' || typeLower === 'voice');

    console.log('[cross-chat][bridge][message] received', {
      senderDomain,
      externalMessageId,
      targetPhone,
      senderPhone,
      senderName,
      type,
      hasMedia: Boolean(mediaUrl),
      hasTranscriptionText: Boolean(transcriptionText),
      transcriptionStatus,
    });

    if (!externalMessageId) {
      return res.status(400).json({ message: 'externalMessageId required' });
    }
    if (!targetPhone) {
      return res.status(400).json({ message: 'Target phone required' });
    }
    if (!content.trim() && !mediaUrl) {
      return res.status(400).json({ message: 'Message payload required' });
    }

    const targetUser = await findLocalUserByPhone(targetPhone);
    if (!targetUser?.id) {
      return res.status(404).json({ message: 'Target user not found', code: 'TARGET_USER_NOT_FOUND' });
    }

    const bridgeContactUser = await ensureBridgeContactUser({
      remoteDomain: senderDomain,
      remotePhone: senderPhone || sender.userId || externalMessageId,
      displayName: senderName,
      preferredRoleId: targetUser.roleId,
      remoteAvatar: senderAvatar,
    });
    if (!bridgeContactUser?.id) {
      return res.status(500).json({ message: 'Bridge contact create failed' });
    }

    const acceptedGroupInvite = await findAcceptedBridgeGroupInvite({
      senderDomain,
      senderPhone,
      targetUserId: Number(targetUser.id),
      sourceRoomId,
    });

    const shouldUseGroupRoom = isRoomInviteMeta(acceptedGroupInvite?.bridgeMeta?.roomInvite);
    const room = shouldUseGroupRoom
      ? (
          String(acceptedGroupInvite.direction || '') === 'inbound'
            ? await findOrCreateInboundBridgeGroupRoom({
                row: acceptedGroupInvite,
                targetUserId: Number(targetUser.id),
                bridgeContactUserId: Number(bridgeContactUser.id),
              })
            : await Room.findByPk(Number(acceptedGroupInvite.roomId))
        )
      : await findOrCreatePersonalRoom(Number(bridgeContactUser.id), Number(targetUser.id));
    if (!room?.id) {
      return res.status(500).json({ message: 'Bridge room create failed' });
    }
    if (shouldUseGroupRoom) {
      const added = await addUserToRoomIfMissing(Number(room.id), Number(bridgeContactUser.id));
      if (added) await emitRoomParticipantsUpdated(Number(room.id));
    }
    try {
      await ensureRoomChatNotArchived(Number(room.id));
    } catch (archiveErr) {
      if (archiveErr?.status === 403) {
        return res.status(403).json({
          message: archiveErr.message || 'Cross-chat is archived',
          code: archiveErr.code || 'CROSS_CHAT_ARCHIVED',
        });
      }
      throw archiveErr;
    }

    const bridgeClientId = String(`bridge:${senderDomain}:${targetPhone}:${externalMessageId}`).slice(0, 190);
    const existing = await RoomMessage.findOne({ where: { roomId: room.id, clientId: bridgeClientId } });
    if (existing?.id) {
      return res.json({ ok: true, dedup: true, roomId: room.id, messageId: existing.id });
    }

    const createPayload = {
      roomId: room.id,
      userId: Number(bridgeContactUser.id),
      content,
      type,
      clientId: bridgeClientId,
      deliveryStatus: 'sent',
      readStatus: null,
      externalAuthorKind: 'cross',
      externalAuthorName: senderName,
      externalAuthorId: senderPhone || String(sender.userId || ''),
    };
    if (mediaUrl) createPayload.mediaUrl = mediaUrl;
    if (thumbnailUrl) createPayload.thumbnailUrl = thumbnailUrl;
    if (fileName) createPayload.fileName = fileName;
    if (mediaMimeType) createPayload.mediaMimeType = mediaMimeType;
    if (Number.isFinite(fileSize) && fileSize > 0) createPayload.fileSize = fileSize;
    if (Number.isFinite(duration) && duration >= 0) createPayload.duration = duration;
    if (transcriptionText) createPayload.transcriptionText = transcriptionText;
    if (transcriptionStatus) createPayload.transcriptionStatus = transcriptionStatus;
    if (!transcriptionText && shouldTranscribe) createPayload.transcriptionStatus = 'pending';

    const created = await RoomMessage.create(createPayload);
    console.log('[cross-chat][bridge][message] created', {
      roomId: Number(room.id),
      messageId: Number(created.id),
      userId: Number(bridgeContactUser.id),
      externalAuthorKind: createPayload.externalAuthorKind,
      externalAuthorName: createPayload.externalAuthorName,
      transcriptionStatus: createPayload.transcriptionStatus || null,
      shouldTranscribe,
    });

    if (!transcriptionText && shouldTranscribe && transcriptionQueue) {
      console.log('[cross-chat][bridge][transcription] enqueue', {
        roomId: Number(room.id),
        messageId: Number(created.id),
        senderDomain,
        type,
        mediaUrl,
      });
      transcriptionQueue.add(
        {
          messageId: created.id,
          model: 'RoomMessage',
          mediaUrl,
          context: { roomId: Number(room.id) },
          userId: Number(bridgeContactUser.id),
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, timeout: 60000 }
      ).catch(async (qErr) => {
        console.warn('[cross-chat][bridge][transcription] enqueue failed:', qErr?.message || qErr);
        await created.update({ transcriptionStatus: 'failed', transcriptionError: String(qErr?.message || qErr).slice(0, 1000) }).catch(() => {});
      });
    }

    const full = await RoomMessage.findByPk(created.id, {
      include: [{ model: User, attributes: ['id', 'name', 'avatar', 'phone'] }],
    });

    try {
      const io = getIO();
      io.to(`room-${room.id}`).emit('newRoomMessage', full);
    } catch (err) {
      console.warn('[cross-chat] inbound bridge message emit failed:', err?.message || err);
    }

    if (shouldUseGroupRoom && !isBridgeFanout) {
      fanOutInboundBridgeGroupMessage({
        room,
        created,
        full,
        senderDomain,
        senderPhone,
        senderName,
        sourceRoomId,
        ownDomain: getOwnDomain(req),
      }).catch((fanoutErr) => {
        console.warn('[cross-chat][bridge][fanout] unexpected:', fanoutErr?.message || fanoutErr);
      });
    }

    const pushBody = (() => {
      const text = content.trim();
      if (text) return text;
      const typeLower = String(type || '').toLowerCase();
      if (typeLower === 'audio' || typeLower === 'voice') return 'Аудио';
      if (typeLower === 'video') return 'Видео';
      if (typeLower === 'image') return 'Фото';
      if (typeLower === 'document') return 'Документ';
      if (typeLower === 'file') return fileName || 'Файл';
      return fileName || 'Вложение';
    })();

    const pushTraceId = `cross-bridge-msg-${created.id}-${Date.now()}`;
    console.log('[cross-chat] inbound bridge message push:start', {
      traceId: pushTraceId,
      roomId: Number(room.id),
      messageId: Number(created.id),
      targetUserId: Number(targetUser.id),
      senderDomain,
      senderName,
      type,
    });

    sendPushNotification(
      [Number(targetUser.id)],
      `От ${senderName}`,
      pushBody,
      {
        type: 'messages',
        screen: 'room',
        roomId: room.id,
        messageId: created.id,
        url: `mobileapp://room/${encodeURIComponent(String(room.id))}`,
      },
      { traceId: pushTraceId }
    )
      .then((pushResult) => {
        console.log('[cross-chat] inbound bridge message push:done', {
          traceId: pushTraceId,
          roomId: Number(room.id),
          messageId: Number(created.id),
          targetUserId: Number(targetUser.id),
          expoSent: Number(pushResult?.sent || 0),
          unifiedSent: Number(pushResult?.unified?.sent || 0),
          unifiedOk: pushResult?.unified ? pushResult.unified.ok !== false : null,
        });
      })
      .catch((err) => console.warn('[cross-chat] inbound bridge message push failed:', {
        traceId: pushTraceId,
        roomId: Number(room.id),
        messageId: Number(created.id),
        targetUserId: Number(targetUser.id),
        message: err?.message || String(err),
      }));

    return res.status(201).json({ ok: true, roomId: room.id, messageId: created.id });
  } catch (err) {
    console.error('createInboundBridgeMessage error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function createInboundBridgeRead(req, res) {
  try {
    await ensureCrossChatTables();

    const verified = verifyBridgeSignature(req);
    if (!verified.ok) {
      return res.status(401).json({ message: 'Bridge signature invalid', code: verified.code });
    }

    const senderDomain = normalizeDomain(verified.senderDomain);
    const externalMessageId = String(req.body?.externalMessageId || '').trim();
    const sender = req.body?.sender || {};
    const target = req.body?.target || {};
    const sourceRoomId = Number(req.body?.room?.sourceRoomId || 0) || null;

    const targetPhone = normalizePhone(target.phone || '');
    const senderPhone = normalizePhone(sender.phone || '');
    const senderName = String(sender.name || 'Сотрудник').trim() || 'Сотрудник';
    const senderAvatar = toAbsoluteAvatarUrl(sender.avatar, senderDomain);

    if (!externalMessageId) {
      return res.status(400).json({ message: 'externalMessageId required' });
    }
    if (!targetPhone) {
      return res.status(400).json({ message: 'Target phone required' });
    }

    const targetUser = await findLocalUserByPhone(targetPhone);
    if (!targetUser?.id) {
      return res.status(404).json({ message: 'Target user not found', code: 'TARGET_USER_NOT_FOUND' });
    }

    const bridgeContactUser = await ensureBridgeContactUser({
      remoteDomain: senderDomain,
      remotePhone: senderPhone || sender.userId || externalMessageId,
      displayName: senderName,
      preferredRoleId: targetUser.roleId,
      remoteAvatar: senderAvatar,
    });
    if (!bridgeContactUser?.id) {
      return res.status(500).json({ message: 'Bridge contact create failed' });
    }

    const acceptedGroupInvite = await findAcceptedBridgeGroupInvite({
      senderDomain,
      senderPhone,
      targetUserId: Number(targetUser.id),
      sourceRoomId,
    });

    const shouldUseGroupRoom = isRoomInviteMeta(acceptedGroupInvite?.bridgeMeta?.roomInvite);
    const room = shouldUseGroupRoom
      ? (
          String(acceptedGroupInvite.direction || '') === 'inbound'
            ? await findOrCreateInboundBridgeGroupRoom({
                row: acceptedGroupInvite,
                targetUserId: Number(targetUser.id),
                bridgeContactUserId: Number(bridgeContactUser.id),
              })
            : await Room.findByPk(Number(acceptedGroupInvite.roomId))
        )
      : await findOrCreatePersonalRoom(Number(bridgeContactUser.id), Number(targetUser.id));
    if (!room?.id) {
      return res.status(500).json({ message: 'Bridge room create failed' });
    }
    if (shouldUseGroupRoom) {
      const added = await addUserToRoomIfMissing(Number(room.id), Number(bridgeContactUser.id));
      if (added) await emitRoomParticipantsUpdated(Number(room.id));
    }

    const externalMessageIdNum = Number(externalMessageId);
    let mirroredMessage = null;

    if (Number.isFinite(externalMessageIdNum) && externalMessageIdNum > 0) {
      // Главный путь: externalMessageId — это id исходного сообщения на домене-отправителе.
      // Для read-синка нам нужно найти это локальное сообщение по id в той же комнате.
      mirroredMessage = await RoomMessage.findOne({
        where: { roomId: room.id, id: externalMessageIdNum },
        attributes: ['id', 'roomId', 'clientId'],
      });
    }

    if (!mirroredMessage?.id) {
      // Fallback на старую схему по bridge clientId (если payload пришел в legacy-формате).
      const bridgeClientId = String(`bridge:${senderDomain}:${targetPhone}:${externalMessageId}`).slice(0, 190);
      mirroredMessage = await RoomMessage.findOne({
        where: { roomId: room.id, clientId: bridgeClientId },
        attributes: ['id', 'roomId', 'clientId'],
      });
    }

    if (!mirroredMessage?.id) {
      console.warn('[cross-chat][bridge][read] message-not-found', {
        senderDomain,
        roomId: Number(room.id),
        externalMessageId: String(externalMessageId),
        externalMessageIdNum: Number.isFinite(externalMessageIdNum) ? externalMessageIdNum : null,
      });
      return res.status(404).json({ message: 'Mirrored message not found' });
    }

    const safeLastRead = Number(mirroredMessage.id) || 0;
    if (!safeLastRead) {
      return res.status(400).json({ message: 'Invalid mirrored message id' });
    }

    const [roomUser, created] = await RoomUsers.findOrCreate({
      where: { roomId: Number(room.id), userId: Number(bridgeContactUser.id) },
      defaults: { lastReadMessageId: safeLastRead },
    });

    if (!created && Number(roomUser.lastReadMessageId || 0) < safeLastRead) {
      roomUser.lastReadMessageId = safeLastRead;
      await roomUser.save();
    }

    console.log('[cross-chat][bridge][read] applied', {
      senderDomain,
      roomId: Number(room.id),
      targetUserId: Number(targetUser.id),
      bridgeContactUserId: Number(bridgeContactUser.id),
      externalMessageId: String(externalMessageId),
      localMessageId: Number(mirroredMessage.id),
      savedLastRead: safeLastRead,
    });

    try {
      const io = getIO();
      io.emit('readStatusUpdated', {
        roomId: Number(room.id),
        userId: Number(bridgeContactUser.id),
        lastReadMessageId: safeLastRead,
      });
      io.to(`user:${Number(targetUser.id)}`).emit('read_updated', {
        userId: Number(bridgeContactUser.id),
        roomId: Number(room.id),
        lastReadMessageId: safeLastRead,
      });
    } catch (err) {
      console.warn('[cross-chat] inbound bridge read emit failed:', err?.message || err);
    }

    return res.json({ ok: true, roomId: Number(room.id), lastReadMessageId: safeLastRead });
  } catch (err) {
    console.error('createInboundBridgeRead error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function processInboundBridgeCallback(req, res) {
  try {
    await ensureCrossChatTables();

    const verified = verifyBridgeSignature(req);
    if (!verified.ok) {
      return res.status(401).json({ message: 'Bridge signature invalid', code: verified.code });
    }

    const externalRequestId = Number(req.body?.externalRequestId);
    const status = String(req.body?.status || '').trim();
    const responderName = String(req.body?.responderName || '').trim();
    const responderAvatar = toAbsoluteAvatarUrl(req.body?.responderAvatar, verified.senderDomain);
    const decisionReason = String(req.body?.decisionReason || '').trim() || null;
    const remoteRoomId = Number(req.body?.roomId) || null;

    if (!Number.isFinite(externalRequestId) || externalRequestId <= 0) {
      return res.status(400).json({ message: 'Invalid externalRequestId' });
    }
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const row = await CrossCompanyChatRequest.findByPk(externalRequestId);
    if (!row) return res.status(404).json({ message: 'Request not found' });
    if (row.direction !== 'outbound') {
      return res.status(400).json({ message: 'Request direction mismatch' });
    }

    row.status = status;
    row.decidedAt = req.body?.decidedAt ? new Date(req.body.decidedAt) : new Date();
    row.decisionReason = decisionReason;

    const rowRoomInvite = row.bridgeMeta?.roomInvite;
    if (status === 'accepted' && Number.isFinite(Number(row.requesterUserId)) && Number(row.requesterUserId) > 0) {
      const bridgeContactUser = await ensureBridgeContactUser({
        remoteDomain: row.targetDomain,
        remotePhone: row.targetPhone,
        displayName: responderName || row.targetUserName || row.targetPhone,
        remoteAvatar: responderAvatar,
      });
      if (Number.isFinite(Number(bridgeContactUser?.id)) && Number(bridgeContactUser.id) > 0) {
        if (isRoomInviteMeta(rowRoomInvite) && Number(row.roomId) > 0) {
          const added = await addUserToRoomIfMissing(Number(row.roomId), Number(bridgeContactUser.id));
          if (added) await emitRoomParticipantsUpdated(Number(row.roomId));
          const catchupSince = row.decidedAt instanceof Date && !Number.isNaN(row.decidedAt.getTime())
            ? new Date(row.decidedAt.getTime() - 30000)
            : new Date(Date.now() - 30000);
          relayAcceptedGroupRoomMessages({
            row,
            bridgeContactUserId: Number(bridgeContactUser.id),
            ownDomain: getOwnDomain(req),
            since: catchupSince,
          }).catch((catchupErr) => {
            console.warn('[cross-chat][bridge][catchup] unexpected:', catchupErr?.message || catchupErr);
          });
        } else {
          const localRoom = await findOrCreatePersonalRoom(Number(row.requesterUserId), Number(bridgeContactUser.id));
          if (localRoom?.id) row.roomId = Number(localRoom.id);
        }
      }
    }

    row.bridgeMeta = {
      ...(row.bridgeMeta || {}),
      callback: {
        receivedAt: new Date().toISOString(),
        senderDomain: verified.senderDomain,
        responderName: responderName || null,
        responderAvatar: responderAvatar || null,
        remoteRoomId: remoteRoomId || null,
        payload: req.body || {},
      },
    };
    await row.save();

    if (Number.isFinite(Number(row.requesterUserId)) && Number(row.requesterUserId) > 0) {
      sendPushNotification(
        [Number(row.requesterUserId)],
        status === 'accepted' ? 'Запрос на чат принят' : 'Запрос на чат отклонен',
        status === 'accepted'
          ? `${responderName || 'Сотрудник'} принял(а) ваш запрос`
          : `${responderName || 'Сотрудник'} отклонил(а) ваш запрос`,
        {
          type: 'cross_chat_request',
          requestId: row.id,
          action: status,
          bridge: true,
          roomId: row.roomId || null,
          screen: status === 'accepted' && row.roomId ? 'room' : undefined,
          url: status === 'accepted' && row.roomId
            ? `mobileapp://room/${encodeURIComponent(String(row.roomId))}`
            : undefined,
        }
      ).catch((err) => console.warn('[cross-chat] callback push failed:', err?.message || err));
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('processInboundBridgeCallback error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function listIncomingCrossChatRequests(req, res) {
  try {
    await ensureCrossChatTables();
    const userId = Number(req.user?.id);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(401).json({ message: 'Unauthorized' });

    const rows = await CrossCompanyChatRequest.findAll({
      where: { targetUserId: userId, status: 'pending' },
      order: [['createdAt', 'DESC']],
      limit: 100,
    });
    return res.json(rows);
  } catch (err) {
    console.error('listIncomingCrossChatRequests error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function listOutgoingCrossChatRequests(req, res) {
  try {
    await ensureCrossChatTables();
    const userId = Number(req.user?.id);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(401).json({ message: 'Unauthorized' });

    const rows = await CrossCompanyChatRequest.findAll({
      where: { requesterUserId: userId },
      order: [['createdAt', 'DESC']],
      limit: 100,
    });
    return res.json(rows);
  } catch (err) {
    console.error('listOutgoingCrossChatRequests error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function listCrossChatRoomStates(req, res) {
  try {
    await ensureCrossChatTables();
    const userId = Number(req.user?.id);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(401).json({ message: 'Unauthorized' });

    const roomIds = String(req.query?.roomIds || '')
      .split(',')
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v > 0);

    const states = await listCrossChatRoomStatesForUser(userId, roomIds.length ? roomIds : null);
    return res.json({ states });
  } catch (err) {
    console.error('listCrossChatRoomStates error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function setCrossChatRoomArchive(req, res) {
  try {
    await ensureCrossChatTables();
    const userId = Number(req.user?.id);
    const roomId = Number(req.params?.roomId);
    const archived = Boolean(req.body?.archived);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(401).json({ message: 'Unauthorized' });
    if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json({ message: 'Invalid roomId' });

    const row = await CrossCompanyChatRequest.findOne({
      where: {
        roomId,
        status: 'accepted',
        [Op.or]: [{ requesterUserId: userId }, { targetUserId: userId }],
      },
      order: [['updatedAt', 'DESC'], ['id', 'DESC']],
    });
    if (!row) return res.status(404).json({ message: 'Cross-chat room not found' });
    if (!isCreator(row, userId)) {
      return res.status(403).json({ message: 'Только создатель чата может менять архив' });
    }

    const shouldArchive = archived;
    const isCrossDomain = String(row.requesterDomain || '') !== String(row.targetDomain || '');

    if (isCrossDomain && String(row.direction || '') === 'outbound') {
      const ownDomain = getOwnDomain(req);
      try {
        await sendBridgePost(
          row.targetDomain,
          '/api/cross-chat/bridge/archive',
          {
            externalRequestId: Number(row.id),
            archived: shouldArchive,
            archivedAt: shouldArchive ? new Date().toISOString() : null,
            actorUserId: Number(userId),
            actorName: String(req.user?.name || ''),
          },
          ownDomain
        );
      } catch (bridgeErr) {
        return res.status(502).json({
          message: 'Не удалось синхронизировать архив со второй компанией',
          code: 'CROSS_CHAT_ARCHIVE_SYNC_FAILED',
          details: bridgeErr?.message || String(bridgeErr),
        });
      }
    }

    row.chatArchivedAt = shouldArchive ? new Date() : null;
    row.bridgeMeta = {
      ...(row.bridgeMeta || {}),
      archiveState: {
        archived: shouldArchive,
        updatedAt: new Date().toISOString(),
        actorUserId: Number(userId),
        actorName: String(req.user?.name || ''),
      },
    };
    await row.save();
    emitCrossChatArchiveUpdated(roomId, shouldArchive);

    return res.json({
      ok: true,
      roomId,
      archived: Boolean(row.chatArchivedAt),
      canToggleArchive: true,
    });
  } catch (err) {
    console.error('setCrossChatRoomArchive error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function createInboundBridgeArchive(req, res) {
  try {
    await ensureCrossChatTables();

    const verified = verifyBridgeSignature(req);
    if (!verified.ok) {
      return res.status(401).json({ message: 'Bridge signature invalid', code: verified.code });
    }

    const senderDomain = normalizeDomain(verified.senderDomain);
    const externalRequestId = Number(req.body?.externalRequestId);
    const archived = Boolean(req.body?.archived);

    if (!Number.isFinite(externalRequestId) || externalRequestId <= 0) {
      return res.status(400).json({ message: 'Invalid externalRequestId' });
    }

    const row = await CrossCompanyChatRequest.findOne({
      where: {
        direction: 'inbound',
        requesterDomain: senderDomain,
        externalRequestId: String(externalRequestId),
      },
      order: [['updatedAt', 'DESC'], ['id', 'DESC']],
    });

    if (!row) return res.status(404).json({ message: 'Request not found' });
    if (String(row.status || '') !== 'accepted' || !Number.isFinite(Number(row.roomId))) {
      return res.status(400).json({ message: 'Request has no active room' });
    }

    row.chatArchivedAt = archived ? new Date() : null;
    row.bridgeMeta = {
      ...(row.bridgeMeta || {}),
      archiveState: {
        archived,
        updatedAt: new Date().toISOString(),
        actorUserId: Number(req.body?.actorUserId) || null,
        actorName: String(req.body?.actorName || ''),
        sourceDomain: senderDomain,
      },
    };
    await row.save();
    emitCrossChatArchiveUpdated(Number(row.roomId), archived);

    return res.json({ ok: true, roomId: Number(row.roomId), archived });
  } catch (err) {
    console.error('createInboundBridgeArchive error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function deleteCrossChatRoomData(row, transaction) {
  const roomId = Number(row?.roomId);
  if (!Number.isFinite(roomId) || roomId <= 0) return;
  if (RoomPinnedArchive) await RoomPinnedArchive.destroy({ where: { roomId }, transaction });
  if (RoomPinnedMessage) await RoomPinnedMessage.destroy({ where: { roomId }, transaction });
  if (ScheduledMessage) await ScheduledMessage.destroy({ where: { roomId }, transaction });
  await RoomUsers.destroy({ where: { roomId }, transaction });
  await RoomMessage.destroy({ where: { roomId }, transaction });
  await Room.destroy({ where: { id: roomId }, transaction });
  row.status = 'cancelled';
  row.decisionReason = 'chat-deleted';
  row.roomId = null;
  row.chatArchivedAt = null;
  row.bridgeMeta = {
    ...(row.bridgeMeta || {}),
    deletedAt: new Date().toISOString(),
  };
  await row.save({ transaction });
  await CrossCompanyChatRequest.update(
    {
      status: 'cancelled',
      decisionReason: 'chat-deleted',
      roomId: null,
      chatArchivedAt: null,
    },
    {
      where: {
        roomId,
        id: { [Op.ne]: row.id },
      },
      transaction,
    }
  );
}

async function deleteCrossChatRoom(req, res) {
  try {
    await ensureCrossChatTables();
    const userId = Number(req.user?.id);
    const roomId = Number(req.params?.roomId);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(401).json({ message: 'Unauthorized' });
    if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json({ message: 'Invalid roomId' });

    const row = await CrossCompanyChatRequest.findOne({
      where: {
        roomId,
        status: 'accepted',
        [Op.or]: [{ requesterUserId: userId }, { targetUserId: userId }],
      },
      order: [['updatedAt', 'DESC'], ['id', 'DESC']],
    });
    if (!row) return res.status(404).json({ message: 'Cross-chat room not found' });
    if (!isCreator(row, userId)) {
      return res.status(403).json({ message: 'Удалить чат может только создатель' });
    }

    const isCrossDomain = String(row.requesterDomain || '') !== String(row.targetDomain || '');
    if (isCrossDomain && String(row.direction || '') === 'outbound') {
      try {
        await sendBridgePost(
          row.targetDomain,
          '/api/cross-chat/bridge/delete',
          {
            externalRequestId: Number(row.id),
            actorUserId: userId,
            actorName: String(req.user?.name || ''),
          },
          getOwnDomain(req)
        );
      } catch (bridgeErr) {
        return res.status(502).json({
          message: 'Не удалось удалить чат во второй компании',
          code: 'CROSS_CHAT_DELETE_SYNC_FAILED',
          details: bridgeErr?.message || String(bridgeErr),
        });
      }
    }

    await db.sequelize.transaction(async (transaction) => {
      await deleteCrossChatRoomData(row, transaction);
    });
    try {
      getIO().to(`room-${roomId}`).emit('crossChatDeleted', { roomId });
    } catch {}
    return res.json({ ok: true, roomId });
  } catch (err) {
    console.error('deleteCrossChatRoom error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function createInboundBridgeDelete(req, res) {
  try {
    await ensureCrossChatTables();
    const verified = verifyBridgeSignature(req);
    if (!verified.ok) {
      return res.status(401).json({ message: 'Bridge signature invalid', code: verified.code });
    }
    const externalRequestId = Number(req.body?.externalRequestId);
    const senderDomain = normalizeDomain(verified.senderDomain);
    const row = await CrossCompanyChatRequest.findOne({
      where: {
        direction: 'inbound',
        requesterDomain: senderDomain,
        externalRequestId: String(externalRequestId),
        status: 'accepted',
      },
      order: [['updatedAt', 'DESC'], ['id', 'DESC']],
    });
    if (!row) return res.status(404).json({ message: 'Request not found' });
    const roomId = Number(row.roomId);
    await db.sequelize.transaction(async (transaction) => {
      await deleteCrossChatRoomData(row, transaction);
    });
    try {
      getIO().to(`room-${roomId}`).emit('crossChatDeleted', { roomId });
    } catch {}
    return res.json({ ok: true, roomId });
  } catch (err) {
    console.error('createInboundBridgeDelete error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function acceptCrossChatRequest(req, res) {
  try {
    await ensureCrossChatTables();
    const userId = Number(req.user?.id);
    const id = Number(req.params?.id);
    if (!Number.isFinite(userId) || userId <= 0) return res.status(401).json({ message: 'Unauthorized' });
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });

    const row = await CrossCompanyChatRequest.findOne({
      where: { id, targetUserId: userId, status: 'pending' },
    });
    if (!row) return res.status(404).json({ message: 'Запрос не найден' });

    const ownDomain = getOwnDomain(req);
    const responderUser = await User.findByPk(userId, {
      attributes: ['id', 'name', 'avatar'],
    });
    const responderAvatar = toAbsoluteAvatarUrl(responderUser?.avatar || req.user?.avatar, ownDomain);

    let room = null;
    const roomInvite = row.bridgeMeta?.roomInvite;
    if (Number.isFinite(Number(row.requesterUserId)) && Number(row.requesterUserId) > 0) {
      if (isRoomInviteMeta(roomInvite) && Number(row.roomId) > 0) {
        const added = await addUserToRoomIfMissing(Number(row.roomId), Number(row.targetUserId));
        if (added) await emitRoomParticipantsUpdated(Number(row.roomId));
        room = await Room.findByPk(Number(row.roomId));
      } else {
        room = await findOrCreatePersonalRoom(Number(row.requesterUserId), Number(row.targetUserId));
      }
    } else if (row.direction === 'inbound') {
      const bridgeContactUser = await ensureBridgeContactUser({
        remoteDomain: row.requesterDomain,
        remotePhone: row.requesterPhone,
        displayName: row.requesterName,
        preferredRoleId: req.user?.roleId,
        remoteAvatar: row.bridgeMeta?.requesterAvatar,
      });
      if (Number.isFinite(Number(bridgeContactUser?.id)) && Number(bridgeContactUser.id) > 0) {
        if (isRoomInviteMeta(roomInvite)) {
          room = await findOrCreateInboundBridgeGroupRoom({
            row,
            targetUserId: Number(row.targetUserId),
            bridgeContactUserId: Number(bridgeContactUser.id),
          });
          if (room?.id) await emitRoomParticipantsUpdated(Number(room.id));
        } else {
          room = await findOrCreatePersonalRoom(Number(bridgeContactUser.id), Number(row.targetUserId));
        }
      }
    }

    row.status = 'accepted';
    row.decidedAt = new Date();
    row.roomId = room?.id || null;
    row.bridgeMeta = {
      ...(row.bridgeMeta || {}),
      decision: 'accepted',
      decisionBy: Number(req.user?.id) || null,
      decisionByName: String(req.user?.name || ''),
      decisionAt: row.decidedAt.toISOString(),
    };
    await row.save();

    const joinMessage = await createAcceptedGroupJoinMessage({
      row,
      userId,
      userName: responderUser?.name || req.user?.name || row.targetUserName,
    });

    const isBridgeInbound = row.direction === 'inbound' && !!row.externalRequestId;
    if (isBridgeInbound) {
      let callbackDelivered = false;
      try {
        await sendBridgePost(
          row.requesterDomain,
          '/api/cross-chat/bridge/callback',
          {
            externalRequestId: Number(row.externalRequestId),
            status: 'accepted',
            decidedAt: row.decidedAt.toISOString(),
            responderName: String(responderUser?.name || req.user?.name || 'Сотрудник'),
            responderAvatar,
            roomId: row.roomId || null,
          },
          ownDomain
        );
        callbackDelivered = true;
      } catch (bridgeErr) {
        row.bridgeMeta = {
          ...(row.bridgeMeta || {}),
          callbackError: bridgeErr?.message || String(bridgeErr),
          callbackErrorAt: new Date().toISOString(),
        };
        await row.save();
      }
      if (callbackDelivered && joinMessage?.id) {
        await relayAcceptedGroupJoinMessage({
          row,
          message: joinMessage,
          responderUser: responderUser || req.user,
          ownDomain,
        });
      }
    } else if (Number.isFinite(Number(row.requesterUserId)) && Number(row.requesterUserId) > 0) {
      sendPushNotification(
        [Number(row.requesterUserId)],
        'Запрос на чат принят',
        `${String(req.user?.name || 'Сотрудник')} принял(а) запрос`,
        {
          type: 'cross_chat_request',
          requestId: row.id,
          action: 'accepted',
          roomId: row.roomId || null,
          screen: row.roomId ? 'room' : undefined,
          url: row.roomId ? `mobileapp://room/${encodeURIComponent(String(row.roomId))}` : undefined,
        }
      ).catch((err) => console.warn('[cross-chat] push accepted failed:', err?.message || err));
    }

    return res.json({ message: 'Запрос принят', request: row, roomId: row.roomId || null });
  } catch (err) {
    console.error('acceptCrossChatRequest error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function rejectCrossChatRequest(req, res) {
  try {
    await ensureCrossChatTables();
    const userId = Number(req.user?.id);
    const id = Number(req.params?.id);
    const decisionReason = String(req.body?.reason || '').trim() || null;
    if (!Number.isFinite(userId) || userId <= 0) return res.status(401).json({ message: 'Unauthorized' });
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });

    const row = await CrossCompanyChatRequest.findOne({
      where: { id, targetUserId: userId, status: 'pending' },
    });
    if (!row) return res.status(404).json({ message: 'Запрос не найден' });

    row.status = 'rejected';
    row.decidedAt = new Date();
    row.decisionReason = decisionReason;
    row.bridgeMeta = {
      ...(row.bridgeMeta || {}),
      decision: 'rejected',
      decisionBy: Number(req.user?.id) || null,
      decisionByName: String(req.user?.name || ''),
      decisionAt: row.decidedAt.toISOString(),
    };
    await row.save();

    const isBridgeInbound = row.direction === 'inbound' && !!row.externalRequestId;
    if (isBridgeInbound) {
      try {
        const ownDomain = getOwnDomain(req);
        await sendBridgePost(
          row.requesterDomain,
          '/api/cross-chat/bridge/callback',
          {
            externalRequestId: Number(row.externalRequestId),
            status: 'rejected',
            decidedAt: row.decidedAt.toISOString(),
            responderName: String(req.user?.name || 'Сотрудник'),
            decisionReason,
          },
          ownDomain
        );
      } catch (bridgeErr) {
        row.bridgeMeta = {
          ...(row.bridgeMeta || {}),
          callbackError: bridgeErr?.message || String(bridgeErr),
          callbackErrorAt: new Date().toISOString(),
        };
        await row.save();
      }
    } else if (Number.isFinite(Number(row.requesterUserId)) && Number(row.requesterUserId) > 0) {
      sendPushNotification(
        [Number(row.requesterUserId)],
        'Запрос на чат отклонен',
        `${String(req.user?.name || 'Сотрудник')} отклонил(а) запрос`,
        { type: 'cross_chat_request', requestId: row.id, action: 'rejected' }
      ).catch((err) => console.warn('[cross-chat] push rejected failed:', err?.message || err));
    }

    return res.json({ message: 'Запрос отклонен', request: row });
  } catch (err) {
    console.error('rejectCrossChatRequest error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  ensureCrossChatTables,
  createCrossChatRequest,
  createInboundBridgeRequest,
  createInboundBridgeMessage,
  createInboundBridgeRead,
  createInboundBridgeArchive,
  createInboundBridgeDelete,
  processInboundBridgeCallback,
  listIncomingCrossChatRequests,
  listOutgoingCrossChatRequests,
  listCrossChatRoomStates,
  setCrossChatRoomArchive,
  deleteCrossChatRoom,
  acceptCrossChatRequest,
  rejectCrossChatRequest,
};

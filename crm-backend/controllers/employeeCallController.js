const db = require('../models');
const { getIO } = require('../socket');
const { sendPushNotification } = require('../services/sendPushNotification');
const {
  answerCall,
  assertLiveKitConfigured,
  createCall,
  createParticipantToken,
  finishCall,
  getActiveCallForUser,
  getCallForUser,
  selectLiveKitProvider,
} = require('../services/employeeCallService');

const Room = db.sequelize.models.Room;
const RoomUsers = db.sequelize.models.RoomUsers;
const User = db.sequelize.models.User;

const emitToParticipants = (call, event, extra = {}) => {
  if (!call) return;
  const payload = { ...call, ...extra };
  const io = getIO();
  io.to(`user:${call.caller.id}`).emit(event, payload);
  io.to(`user:${call.callee.id}`).emit(event, payload);
};

const sendCallEventPush = async (call, action, targetIds) => {
  if (!call) return;
  const targets = targetIds || [call.caller.id, call.callee.id];
  const data = {
    type: 'employee_call',
    action,
    callId: call.callId,
    roomId: String(call.roomId),
    callerId: String(call.caller.id),
    callerName: call.caller.name,
    expiresAt: call.expiresAt,
    status: call.status,
    mediaType: call.mediaType || 'audio',
  };
  const commonOptions = {
    disableUnifiedParallel: true,
    ttl: action === 'incoming' ? 60 : action === 'missed' ? 86400 : 120,
  };

  try {
    if (action !== 'incoming') {
      await sendPushNotification(targets, null, null, data, {
        ...commonOptions,
        traceId: `employee-call-${action}-${call.callId}`,
        dataOnly: true,
      });
      return;
    }

    // Incoming calls must stay data-only. Expo can start the registered
    // Android headless task for this payload even when the app is terminated;
    // a title/body notification would be rendered by the OS without starting
    // CallKeep, leaving sleeping Xiaomi devices with only a short-lived push.
    await sendPushNotification(targets, null, null, data, {
      ...commonOptions,
      traceId: `employee-call-${action}-background-${call.callId}`,
      dataOnly: true,
    });
  } catch (error) {
    console.error(`[employee-calls] ${action} push failed:`, error);
  }
};

const announceEndedCall = (call) => {
  emitToParticipants(call, 'call:ended');
  if (call?.status === 'missed') {
    // Keep the existing terminal event for both participants so older APKs
    // still clear their ringing UI. Newer Android clients additionally turn
    // the callee-only event into a persistent callback notification.
    sendCallEventPush(call, 'ended');
    sendCallEventPush(call, 'missed', [call.callee.id]);
    return;
  }
  sendCallEventPush(call, 'ended');
};

const fail = (res, error) => {
  const code = String(error?.code || '');
  if (code === 'CALL_BUSY') return res.status(409).json({ error: 'Пользователь уже разговаривает', code });
  if (code === 'LIVEKIT_NOT_CONFIGURED') return res.status(503).json({ error: 'Сервис звонков ещё не настроен', code });
  if (['CALL_NOT_FOUND', 'CALL_NOT_AVAILABLE', 'CALL_ENDED'].includes(code)) {
    return res.status(410).json({ error: 'Звонок уже завершён или недоступен', code });
  }
  if (code === 'CALL_FORBIDDEN') return res.status(403).json({ error: 'Нет доступа к звонку', code });
  console.error('[employee-calls] request failed:', error);
  return res.status(500).json({ error: 'Не удалось выполнить операцию со звонком', code: code || 'CALL_ERROR' });
};

const resolvePersonalPeer = async (roomId, callerId) => {
  const room = await Room.findByPk(Number(roomId), { attributes: ['id', 'type'] });
  if (!room || room.type !== 'personal') return null;
  const memberships = await RoomUsers.findAll({
    where: { roomId: room.id, deletedAt: null },
    attributes: ['userId'],
  });
  const ids = Array.from(new Set(memberships.map((row) => Number(row.userId)).filter(Boolean)));
  if (!ids.includes(Number(callerId)) || ids.length !== 2) return null;
  const calleeId = ids.find((id) => id !== Number(callerId));
  const users = await User.findAll({
    where: { id: [Number(callerId), calleeId], isActive: true, canChat: true, system: false },
    attributes: ['id', 'name', 'isActive', 'canChat', 'system'],
  });
  if (users.length !== 2) return null;
  return {
    room,
    caller: users.find((user) => Number(user.id) === Number(callerId)),
    callee: users.find((user) => Number(user.id) === Number(calleeId)),
  };
};

const startCall = async (req, res) => {
  try {
    // Validate configuration before ringing another employee.
    assertLiveKitConfigured();
    const peer = await resolvePersonalPeer(req.body?.roomId, req.user.id);
    if (!peer) return res.status(400).json({ error: 'Звонки доступны только в личном чате сотрудников' });

    const requestedMediaType = String(req.body?.mediaType || 'audio').trim().toLowerCase();
    if (!['audio', 'video'].includes(requestedMediaType)) {
      return res.status(400).json({ error: 'Неподдерживаемый тип звонка' });
    }
    const mediaProvider = await selectLiveKitProvider();
    const call = createCall({
      roomId: peer.room.id,
      caller: peer.caller,
      callee: peer.callee,
      mediaProvider,
      mediaType: requestedMediaType,
      onTimeout: announceEndedCall,
    });

    emitToParticipants(call, 'call:incoming');
    sendCallEventPush(call, 'incoming', [call.callee.id]);

    return res.status(201).json(call);
  } catch (error) {
    return fail(res, error);
  }
};

const getActiveCall = (req, res) => {
  const call = getActiveCallForUser(req.user.id);
  if (!call) return res.status(404).json({ error: 'Активный звонок не найден' });
  return res.json(call);
};

const getCall = async (req, res) => {
  const call = getCallForUser(req.params.callId, req.user.id);
  if (!call) return res.status(404).json({ error: 'Звонок не найден' });
  return res.json(call);
};

const acceptCall = async (req, res) => {
  try {
    const call = answerCall(req.params.callId, req.user.id, announceEndedCall);
    emitToParticipants(call, 'call:accepted');
    return res.json(call);
  } catch (error) {
    return fail(res, error);
  }
};

const rejectCall = async (req, res) => {
  try {
    const existing = getCallForUser(req.params.callId, req.user.id);
    if (!existing || Number(existing.callee.id) !== Number(req.user.id)) {
      return res.status(404).json({ error: 'Звонок не найден' });
    }
    const call = finishCall(req.params.callId, 'rejected', 'rejected', req.user.id);
    announceEndedCall(call);
    return res.json(call);
  } catch (error) {
    return fail(res, error);
  }
};

const endCall = async (req, res) => {
  try {
    const existing = getCallForUser(req.params.callId, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Звонок не найден' });
    const callerCancelledBeforeAnswer =
      existing.status === 'ringing' &&
      Number(existing.caller.id) === Number(req.user.id);
    const call = finishCall(
      req.params.callId,
      callerCancelledBeforeAnswer ? 'missed' : 'ended',
      callerCancelledBeforeAnswer
        ? 'caller_cancelled'
        : req.body?.reason || 'hangup',
      req.user.id
    );
    if (!call) return res.status(404).json({ error: 'Звонок не найден' });
    announceEndedCall(call);
    return res.json(call);
  } catch (error) {
    return fail(res, error);
  }
};

const tokenForCall = async (req, res) => {
  try {
    return res.json(await createParticipantToken(req.params.callId, req.user));
  } catch (error) {
    return fail(res, error);
  }
};

module.exports = {
  acceptCall,
  endCall,
  getActiveCall,
  getCall,
  rejectCall,
  startCall,
  tokenForCall,
};


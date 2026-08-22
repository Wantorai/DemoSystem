const { randomUUID } = require('crypto');
const axios = require('axios');
const { AccessToken, TrackSource } = require('livekit-server-sdk');

const CALL_RING_TIMEOUT_MS = Math.max(
  15000,
  Number(process.env.CALL_RING_TIMEOUT_MS || 45000)
);
const CALL_MAX_DURATION_MS = Math.max(
  60000,
  Number(process.env.CALL_MAX_DURATION_MS || 8 * 60 * 60 * 1000)
);
const TOKEN_TTL = '10m';
const LIVEKIT_PROVIDER_CLOUD = 'cloud';
const LIVEKIT_PROVIDER_SELF_HOSTED = 'self_hosted';
const PROVIDER_HEALTH_CACHE_MS = Math.max(
  5000,
  Number(process.env.LIVEKIT_PROVIDER_HEALTH_CACHE_MS || 15000)
);

const calls = new Map();
const activeCallByUserId = new Map();
const providerHealthCache = new Map();

const readProviderConfig = (provider) => {
  const selfHosted = provider === LIVEKIT_PROVIDER_SELF_HOSTED;
  const prefix = selfHosted ? 'LIVEKIT_SELF_HOSTED' : 'LIVEKIT';
  return {
    provider: selfHosted
      ? LIVEKIT_PROVIDER_SELF_HOSTED
      : LIVEKIT_PROVIDER_CLOUD,
    url: String(process.env[`${prefix}_URL`] || '').trim(),
    apiKey: String(process.env[`${prefix}_API_KEY`] || '').trim(),
    apiSecret: String(process.env[`${prefix}_API_SECRET`] || '').trim(),
  };
};

const isCompleteProviderConfig = (config) =>
  Boolean(config?.url && config?.apiKey && config?.apiSecret);

const liveKitConfig = (provider) => {
  const config = readProviderConfig(provider);
  if (!isCompleteProviderConfig(config)) {
    const error = new Error('LiveKit is not configured');
    error.code = 'LIVEKIT_NOT_CONFIGURED';
    throw error;
  }
  return config;
};

const assertLiveKitConfigured = () => {
  const cloud = readProviderConfig(LIVEKIT_PROVIDER_CLOUD);
  const selfHosted = readProviderConfig(LIVEKIT_PROVIDER_SELF_HOSTED);
  if (
    !isCompleteProviderConfig(cloud) &&
    !isCompleteProviderConfig(selfHosted)
  ) {
    const error = new Error('LiveKit is not configured');
    error.code = 'LIVEKIT_NOT_CONFIGURED';
    throw error;
  }
};

const providerHttpUrl = (rawUrl) => {
  const parsed = new URL(rawUrl);
  if (parsed.protocol === 'wss:') parsed.protocol = 'https:';
  if (parsed.protocol === 'ws:') parsed.protocol = 'http:';
  return parsed.toString();
};

const isProviderReachable = async (config) => {
  const cached = providerHealthCache.get(config.provider);
  if (cached && Date.now() - cached.checkedAt < PROVIDER_HEALTH_CACHE_MS) {
    return cached.reachable;
  }

  let reachable = false;
  try {
    const response = await axios.get(providerHttpUrl(config.url), {
      timeout: 2500,
      maxRedirects: 0,
      validateStatus: () => true,
    });
    reachable = response.status >= 200 && response.status < 300;
  } catch {
    reachable = false;
  }
  providerHealthCache.set(config.provider, {
    checkedAt: Date.now(),
    reachable,
  });
  return reachable;
};

const selectLiveKitProvider = async () => {
  const cloud = readProviderConfig(LIVEKIT_PROVIDER_CLOUD);
  const selfHosted = readProviderConfig(LIVEKIT_PROVIDER_SELF_HOSTED);
  const configured = {
    [LIVEKIT_PROVIDER_CLOUD]: isCompleteProviderConfig(cloud),
    [LIVEKIT_PROVIDER_SELF_HOSTED]: isCompleteProviderConfig(selfHosted),
  };
  const requestedPrimary = String(
    process.env.LIVEKIT_PRIMARY_PROVIDER ||
      (configured[LIVEKIT_PROVIDER_SELF_HOSTED]
        ? LIVEKIT_PROVIDER_SELF_HOSTED
        : LIVEKIT_PROVIDER_CLOUD)
  )
    .trim()
    .toLowerCase();
  const primary =
    requestedPrimary === LIVEKIT_PROVIDER_SELF_HOSTED
      ? LIVEKIT_PROVIDER_SELF_HOSTED
      : LIVEKIT_PROVIDER_CLOUD;
  const fallback =
    primary === LIVEKIT_PROVIDER_SELF_HOSTED
      ? LIVEKIT_PROVIDER_CLOUD
      : LIVEKIT_PROVIDER_SELF_HOSTED;

  if (configured[primary]) {
    const primaryConfig =
      primary === LIVEKIT_PROVIDER_SELF_HOSTED ? selfHosted : cloud;
    if (await isProviderReachable(primaryConfig)) return primary;
  }
  if (configured[fallback]) {
    console.warn(
      `[employee-calls] LiveKit provider "${primary}" is unavailable; using "${fallback}"`
    );
    return fallback;
  }

  assertLiveKitConfigured();
  return primary;
};

const publicCall = (call) => ({
  callId: call.callId,
  roomId: call.roomId,
  roomName: call.roomName,
  caller: call.caller,
  callee: call.callee,
  status: call.status,
  createdAt: call.createdAt,
  expiresAt: call.expiresAt,
  answeredAt: call.answeredAt || null,
  endedAt: call.endedAt || null,
  endedReason: call.endedReason || null,
  mediaType: call.mediaType || 'audio',
  mediaProvider: call.mediaProvider || LIVEKIT_PROVIDER_CLOUD,
});

const clearCall = (call) => {
  if (!call) return;
  if (call.timeout) clearTimeout(call.timeout);
  if (activeCallByUserId.get(call.caller.id) === call.callId) {
    activeCallByUserId.delete(call.caller.id);
  }
  if (activeCallByUserId.get(call.callee.id) === call.callId) {
    activeCallByUserId.delete(call.callee.id);
  }
};

const finishCall = (callId, status, reason, actorUserId) => {
  const call = calls.get(String(callId));
  if (!call || ['ended', 'rejected', 'missed', 'failed'].includes(call.status)) {
    return call ? publicCall(call) : null;
  }
  const actorId = Number(actorUserId);
  if (actorId && actorId !== call.caller.id && actorId !== call.callee.id) {
    const error = new Error('Call participant required');
    error.code = 'CALL_FORBIDDEN';
    throw error;
  }
  call.status = status;
  call.endedReason = reason || status;
  call.endedAt = new Date().toISOString();
  clearCall(call);
  setTimeout(() => calls.delete(call.callId), 5 * 60 * 1000).unref?.();
  return publicCall(call);
};

const createCall = ({
  roomId,
  caller,
  callee,
  mediaProvider,
  mediaType = 'audio',
  onTimeout,
}) => {
  const callerId = Number(caller?.id);
  const calleeId = Number(callee?.id);
  if (!callerId || !calleeId || callerId === calleeId) {
    const error = new Error('Invalid call participants');
    error.code = 'CALL_BAD_PARTICIPANTS';
    throw error;
  }
  if (activeCallByUserId.has(callerId) || activeCallByUserId.has(calleeId)) {
    const error = new Error('One of the users is already in a call');
    error.code = 'CALL_BUSY';
    throw error;
  }

  const now = Date.now();
  const callId = randomUUID();
  const call = {
    callId,
    roomId: Number(roomId),
    roomName: `employee-call-${callId}`,
    caller: { id: callerId, name: String(caller.name || `User ${callerId}`) },
    callee: { id: calleeId, name: String(callee.name || `User ${calleeId}`) },
    status: 'ringing',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CALL_RING_TIMEOUT_MS).toISOString(),
    answeredAt: null,
    endedAt: null,
    endedReason: null,
    mediaType: mediaType === 'video' ? 'video' : 'audio',
    mediaProvider:
      mediaProvider === LIVEKIT_PROVIDER_SELF_HOSTED
        ? LIVEKIT_PROVIDER_SELF_HOSTED
        : LIVEKIT_PROVIDER_CLOUD,
    timeout: null,
  };
  call.timeout = setTimeout(() => {
    const ended = finishCall(call.callId, 'missed', 'timeout', 0);
    if (ended && typeof onTimeout === 'function') onTimeout(ended);
  }, CALL_RING_TIMEOUT_MS);
  call.timeout.unref?.();

  calls.set(callId, call);
  activeCallByUserId.set(callerId, callId);
  activeCallByUserId.set(calleeId, callId);
  return publicCall(call);
};

const getCallForUser = (callId, userId) => {
  const call = calls.get(String(callId));
  const id = Number(userId);
  if (!call || (call.caller.id !== id && call.callee.id !== id)) return null;
  return publicCall(call);
};

const getActiveCallForUser = (userId) => {
  const callId = activeCallByUserId.get(Number(userId));
  return callId ? getCallForUser(callId, userId) : null;
};

const answerCall = (callId, userId, onTimeout) => {
  const call = calls.get(String(callId));
  const id = Number(userId);
  if (!call || call.callee.id !== id || call.status !== 'ringing') {
    const error = new Error('Call is no longer available');
    error.code = 'CALL_NOT_AVAILABLE';
    throw error;
  }
  call.status = 'active';
  call.answeredAt = new Date().toISOString();
  if (call.timeout) clearTimeout(call.timeout);
  call.timeout = setTimeout(() => {
    const ended = finishCall(call.callId, 'ended', 'duration_limit', 0);
    if (ended && typeof onTimeout === 'function') onTimeout(ended);
  }, CALL_MAX_DURATION_MS);
  call.timeout.unref?.();
  return publicCall(call);
};

const createParticipantToken = async (callId, user) => {
  const call = calls.get(String(callId));
  const userId = Number(user?.id);
  if (!call || (call.caller.id !== userId && call.callee.id !== userId)) {
    const error = new Error('Call not found');
    error.code = 'CALL_NOT_FOUND';
    throw error;
  }
  if (!['ringing', 'active'].includes(call.status)) {
    const error = new Error('Call has ended');
    error.code = 'CALL_ENDED';
    throw error;
  }
  const {
    provider,
    url,
    apiKey,
    apiSecret,
  } = liveKitConfig(call.mediaProvider);
  const token = new AccessToken(apiKey, apiSecret, {
    identity: String(userId),
    name: String(user.name || `User ${userId}`),
    ttl: TOKEN_TTL,
    metadata: JSON.stringify({
      callId: call.callId,
      roomId: call.roomId,
      mediaType: call.mediaType || 'audio',
    }),
  });
  token.addGrant({
    roomJoin: true,
    room: call.roomName,
    canPublish: true,
    canPublishSources:
      call.mediaType === 'video'
        ? [TrackSource.MICROPHONE, TrackSource.CAMERA]
        : [TrackSource.MICROPHONE],
    canSubscribe: true,
    canPublishData: false,
  });
  return {
    call: publicCall(call),
    mediaProvider: provider,
    serverUrl: url,
    token: await token.toJwt(),
  };
};

module.exports = {
  CALL_MAX_DURATION_MS,
  CALL_RING_TIMEOUT_MS,
  answerCall,
  assertLiveKitConfigured,
  createCall,
  createParticipantToken,
  finishCall,
  getActiveCallForUser,
  getCallForUser,
  selectLiveKitProvider,
};

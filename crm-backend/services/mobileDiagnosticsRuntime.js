'use strict';

const activeUserSocketIds = new Map();
const mobileUpdateRequests = [];
const MAX_UPDATE_REQUESTS = 500;

const nowIso = () => new Date().toISOString();

const socketConnected = (userId, socketId) => {
  const userKey = String(userId);
  const socketIds = activeUserSocketIds.get(userKey) || new Set();
  const wasOffline = socketIds.size === 0;
  socketIds.add(socketId);
  activeUserSocketIds.set(userKey, socketIds);
  return { wasOffline, connectionCount: socketIds.size };
};

const socketDisconnected = (userId, socketId) => {
  const userKey = String(userId);
  const current = activeUserSocketIds.get(userKey);
  if (!current) return { wasOnline: false, isOffline: true, connectionCount: 0 };
  current.delete(socketId);
  if (current.size > 0) {
    return { wasOnline: true, isOffline: false, connectionCount: current.size };
  }
  activeUserSocketIds.delete(userKey);
  return { wasOnline: true, isOffline: true, connectionCount: 0 };
};

const isUserOnline = (userId) => (activeUserSocketIds.get(String(userId))?.size || 0) > 0;

const getSocketSnapshot = () => {
  const byUser = Array.from(activeUserSocketIds.entries()).map(([userId, socketIds]) => ({
    userId: Number(userId),
    sockets: socketIds.size,
  }));

  return {
    onlineUsers: byUser.length,
    socketConnections: byUser.reduce((sum, row) => sum + row.sockets, 0),
    byUser,
  };
};

const recordMobileUpdateRequest = ({
  type,
  appKey,
  runtimeVersion,
  platform,
  releaseId = null,
  statusCode = null,
  userAgent = '',
  ip = '',
}) => {
  mobileUpdateRequests.push({
    type,
    appKey,
    runtimeVersion,
    platform,
    releaseId,
    statusCode,
    userAgent: String(userAgent || '').slice(0, 220),
    ip: String(ip || '').slice(0, 80),
    at: nowIso(),
  });

  if (mobileUpdateRequests.length > MAX_UPDATE_REQUESTS) {
    mobileUpdateRequests.splice(0, mobileUpdateRequests.length - MAX_UPDATE_REQUESTS);
  }
};

const getMobileUpdateSnapshot = () => {
  const byApp = new Map();
  for (const request of mobileUpdateRequests) {
    const key = request.appKey || 'unknown';
    const row = byApp.get(key) || {
      appKey: key,
      total: 0,
      manifest: 0,
      asset: 0,
      errors: 0,
      lastSeenAt: null,
      platforms: {},
      runtimeVersions: {},
    };
    row.total += 1;
    if (request.type === 'asset') row.asset += 1;
    else row.manifest += 1;
    if (Number(request.statusCode || 0) >= 400) row.errors += 1;
    row.lastSeenAt = request.at;
    if (request.platform) row.platforms[request.platform] = (row.platforms[request.platform] || 0) + 1;
    if (request.runtimeVersion) {
      row.runtimeVersions[request.runtimeVersion] = (row.runtimeVersions[request.runtimeVersion] || 0) + 1;
    }
    byApp.set(key, row);
  }

  return {
    recent: mobileUpdateRequests.slice(-80).reverse(),
    byApp: Array.from(byApp.values()).sort((a, b) => b.total - a.total),
  };
};

module.exports = {
  socketConnected,
  socketDisconnected,
  isUserOnline,
  getSocketSnapshot,
  recordMobileUpdateRequest,
  getMobileUpdateSnapshot,
};

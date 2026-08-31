'use strict';

const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');
const { Op } = require('sequelize');
const auth = require('../middleware/authMiddleware');
const {
  AppVersion,
  MobileDiagnosticEvent,
  PushToken,
  UnifiedPushSubscription,
  User,
} = require('../models');
const {
  getSocketSnapshot,
  getMobileUpdateSnapshot,
} = require('../services/mobileDiagnosticsRuntime');
const { getApiPerformanceSnapshot } = require('../services/apiPerformanceRuntime');

const router = express.Router();
const routeStartedAt = new Date().toISOString();
const MOBILE_DIAGNOSTICS_LOGS = String(process.env.MOBILE_DIAGNOSTICS_LOGS || '').toLowerCase() === 'true';
const mobileDiagnosticsLog = (...args) => {
  if (MOBILE_DIAGNOSTICS_LOGS) console.log(...args);
};

const updatesRoot = path.resolve(
  process.env.MOBILE_UPDATES_ROOT ||
    (process.platform === 'win32'
      ? path.join(__dirname, '..', 'mobile-updates')
      : '/home/nodeapp/mobile-updates')
);

const parseIdSet = (raw, fallback = '') =>
  new Set(
    String(raw || fallback)
      .split(',')
      .map((x) => Number(String(x || '').trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
  );

const ADMIN_ROLE_IDS = parseIdSet(process.env.ADMIN_ROLE_IDS, '1,2');
const INTERNAL_HOSTS = new Set(
  String(process.env.MOBILE_DIAGNOSTICS_ALLOWED_HOSTS || 'orderspace.ru,www.orderspace.ru,localhost,127.0.0.1')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
);
const INGEST_SECRET = String(process.env.MOBILE_DIAGNOSTICS_INGEST_SECRET || '').trim();
const INGEST_SECRET_HEADER = 'x-mobile-diagnostics-secret';
const CENTRAL_INGEST_URL = String(
  process.env.MOBILE_DIAGNOSTICS_CENTRAL_INGEST_URL ||
    'https://orderspace.ru/api/mobile-diagnostics/ingest'
).trim();
const CENTRAL_INGEST_SECRET = String(
  process.env.MOBILE_DIAGNOSTICS_CENTRAL_INGEST_SECRET ||
    process.env.MOBILE_DIAGNOSTICS_INGEST_SECRET ||
    ''
).trim();
const APP_KEY_ALIASES = new Map(
  String(process.env.MOBILE_DIAGNOSTICS_APP_KEY_ALIASES || 'mobile-app:orderspace,bf-mobile-app:buhfinance')
    .split(',')
    .map((pair) => pair.split(':').map((x) => String(x || '').trim().toLowerCase()))
    .filter(([from, to]) => from && to)
);
let mobileDiagnosticTableReady = false;
let ingestStats = {
  attempts: 0,
  accepted: 0,
  failed: 0,
  lastAcceptedAt: null,
  lastFailedAt: null,
  lastError: null,
};
let relayStats = {
  attempts: 0,
  forwarded: 0,
  failed: 0,
  lastForwardedAt: null,
  lastFailedAt: null,
  lastError: null,
};

mobileDiagnosticsLog('[mobile-diagnostics] route loaded', {
  pid: process.pid,
  routeStartedAt,
  adminRoleIds: Array.from(ADMIN_ROLE_IDS),
  internalHosts: Array.from(INTERNAL_HOSTS),
  externalIngestEnabled: Boolean(INGEST_SECRET),
  centralRelayEnabled: Boolean(CENTRAL_INGEST_URL && CENTRAL_INGEST_SECRET),
});

const requestInfo = (req) => ({
  pid: process.pid,
  method: req.method,
  path: req.originalUrl || req.url,
  host: req.headers.host || null,
  forwardedHost: req.headers['x-forwarded-host'] || null,
  origin: req.headers.origin || null,
  userId: req.user?.id || null,
  roleId: req.user?.roleId || null,
  userAgent: String(req.headers['user-agent'] || '').slice(0, 120),
});

const logRequest = (event, req, extra = {}) => {
  mobileDiagnosticsLog(`[mobile-diagnostics] ${event}`, {
    ...requestInfo(req),
    ...extra,
  });
};

const hostFromRequest = (req) =>
  String(req.headers['x-forwarded-host'] || req.headers.origin || req.headers.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');

const isCentralHost = (host) => INTERNAL_HOSTS.has(String(host || '').toLowerCase());

const requireInternalAdmin = (req, res, next) => {
  const host = hostFromRequest(req);
  const isAllowedHost = INTERNAL_HOSTS.has(host);
  const isAdmin = ADMIN_ROLE_IDS.has(Number(req.user?.roleId));
  const isActiveUser = req.user?.isActive !== false;
  if (!isAllowedHost || !isActiveUser) {
    logRequest('forbidden', req, {
      normalizedHost: host,
      isAllowedHost,
      isAdmin,
      isActiveUser,
      adminRoleIds: Array.from(ADMIN_ROLE_IDS),
      internalHosts: Array.from(INTERNAL_HOSTS),
    });
    return res.status(403).json({
      error: 'Диагностика доступна только внутренним администраторам orderspace',
      backend: {
        pid: process.pid,
        routeStartedAt,
        roleId: Number(req.user?.roleId) || null,
        normalizedHost: host,
        isAllowedHost,
        isAdmin,
        isActiveUser,
        adminRoleIds: Array.from(ADMIN_ROLE_IDS),
        internalHosts: Array.from(INTERNAL_HOSTS),
      },
    });
  }
  return next();
};

const safeReadJson = async (filePath, fallback = null) => {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
};

const statOrNull = async (filePath) => {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
};

const ensureMobileDiagnosticTable = async () => {
  if (mobileDiagnosticTableReady || !MobileDiagnosticEvent) return;
  await MobileDiagnosticEvent.sync();
  mobileDiagnosticTableReady = true;
  mobileDiagnosticsLog('[mobile-diagnostics] table ready', { pid: process.pid, table: 'mobile_diagnostic_events' });
};

const safeText = (value, max = 160) => {
  const text = String(value || '').trim();
  return text ? text.slice(0, max) : null;
};

const safeObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
};

const safeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const incrementMapValue = (map, key) => {
  const normalized = safeText(key, 120) || 'unknown';
  map.set(normalized, (map.get(normalized) || 0) + 1);
};

const mapToSortedObject = (map) =>
  Object.fromEntries(
    Array.from(map.entries())
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
  );

const networkContextFromEvent = (plain, metrics = null, state = null) => {
  const safeState = state || safeObject(plain.state);
  const safeMetrics = metrics || safeObject(plain.metrics);
  return {
    networkType: safeText(plain.networkType || safeState.networkType, 60),
    appState: safeText(safeState.appState, 40),
    isConnected: typeof safeState.isConnected === 'boolean' ? safeState.isConnected : null,
    isInternetReachable: typeof safeState.isInternetReachable === 'boolean' ? safeState.isInternetReachable : null,
    isConnectionExpensive: typeof safeState.isConnectionExpensive === 'boolean' ? safeState.isConnectionExpensive : null,
    cellularGeneration: safeText(safeState.cellularGeneration, 40),
    carrier: safeText(safeState.carrier, 120),
    apiInFlightAtStart: safeNumber(safeMetrics.apiInFlightAtStart ?? safeState.apiInFlightAtStart),
    apiAppStateAtStart: safeText(safeState.apiAppStateAtStart, 40),
    apiAppStateAtFinish: safeText(safeState.apiAppStateAtFinish, 40),
    apiAppStateChangedDuringRequest:
      typeof safeState.apiAppStateChangedDuringRequest === 'boolean'
        ? safeState.apiAppStateChangedDuringRequest
        : null,
    apiBackgroundedDuringRequest:
      typeof safeState.apiBackgroundedDuringRequest === 'boolean'
        ? safeState.apiBackgroundedDuringRequest
        : null,
    apiStartedInBackground:
      typeof safeState.apiStartedInBackground === 'boolean'
        ? safeState.apiStartedInBackground
        : null,
  };
};

const socketContextFromEvent = (plain, metrics = null, state = null) => {
  const safeState = state || safeObject(plain.state);
  const safeMetrics = metrics || safeObject(plain.metrics);
  return {
    socketConnected: typeof safeState.socketConnected === 'boolean' ? safeState.socketConnected : null,
    socketId: safeText(safeState.socketId, 120),
    socketUrl: safeText(safeState.socketUrl, 220),
    socketTransport: safeText(safeState.socketTransport, 40),
    socketDisconnectReason: safeText(safeState.socketDisconnectReason, 120),
    socketErrorMessage: safeText(safeState.socketErrorMessage, 220),
    socketReconnectAttempt: safeNumber(safeState.socketReconnectAttempt),
    socketSwitchedToBackup: typeof safeState.socketSwitchedToBackup === 'boolean' ? safeState.socketSwitchedToBackup : null,
    socketUsingBackup: typeof safeState.socketUsingBackup === 'boolean' ? safeState.socketUsingBackup : null,
    socketConnectMs: safeNumber(safeMetrics.socketConnectMs),
    socketConnectMsIgnored: safeNumber(safeState.socketConnectMsIgnored),
    socketSessionAgeMs: safeNumber(safeMetrics.socketSessionAgeMs),
    socketReconnectMs: safeNumber(safeMetrics.socketReconnectMs),
    socketReconnectMsIgnored: safeNumber(safeState.socketReconnectMsIgnored),
    socketDisconnectedForMs: safeNumber(safeMetrics.socketDisconnectedForMs),
    socketDisconnectedForMsIgnored: safeNumber(safeState.socketDisconnectedForMsIgnored),
    socketBackgroundedDuringDisconnect:
      typeof safeState.socketBackgroundedDuringDisconnect === 'boolean'
        ? safeState.socketBackgroundedDuringDisconnect
        : null,
    socketAppStateAtDisconnect: safeText(safeState.socketAppStateAtDisconnect, 40),
    socketAppStateAtReconnect: safeText(
      safeState.socketAppStateAtReconnect ||
        safeState.socketAppStateAtReconnectAttempt ||
        safeState.socketAppStateAtReconnectError ||
        safeState.socketAppStateAtReconnectFailed,
      40
    ),
  };
};

const canonicalAppKey = (appKey) => APP_KEY_ALIASES.get(String(appKey || '').toLowerCase()) || appKey || 'unknown';

const socketReconnectMsFromEvent = (plain, metrics) => {
  if (plain.eventType !== 'state' || plain.message !== 'socket-connected') return null;
  const value = safeNumber(metrics.socketReconnectMs);
  if (value == null || value < 0 || value > 5 * 60 * 1000) return null;
  return value;
};

const apiEndpointFromEvent = (plain) => {
  const state = safeObject(plain.state);
  const method = safeText(state.apiMethod, 12);
  const pathValue = safeText(state.apiPath, 180);
  if (method && pathValue) {
    return {
      method: method.toUpperCase(),
      path: pathValue.replace(/^https?:\/\/[^/]+/i, '') || pathValue,
    };
  }

  const match = String(plain.message || '').match(/^slow-api:([A-Z]+)\s+(.+?)\s+\d+ms$/);
  if (!match) return null;
  return {
    method: match[1],
    path: match[2],
  };
};

const maxValue = (values) => {
  const clean = values.map(safeNumber).filter((value) => value != null);
  return clean.length ? Math.max(...clean) : null;
};

const normalizeComparePath = (value) => String(value || '')
  .replace(/^\/api(?=\/)/, '')
  .replace(/\/\d+(?=\/|$)/g, '/:id')
  .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, '/:uuid');

const apiPerformanceKey = (method, pathValue) =>
  `${String(method || '').toUpperCase()} ${normalizeComparePath(pathValue)}`;

const normalizeDiagnosticPayload = (body, userId = null) => {
  const appKey = safeText(body.appKey || body.clientKey || body.applicationId || 'orderspace', 80);
  const deviceId = safeText(body.deviceId || body.installationId || body.sessionId, 160);
  if (!appKey || !deviceId) {
    const error = new Error('appKey и deviceId обязательны');
    error.status = 400;
    error.code = 'missing_appKey_or_deviceId';
    throw error;
  }

  const eventType = ['heartbeat', 'metric', 'error', 'state'].includes(body.eventType)
    ? body.eventType
    : 'metric';
  const severity = ['info', 'warning', 'critical'].includes(body.severity)
    ? body.severity
    : (eventType === 'error' ? 'critical' : 'info');
  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();

  return {
    userId,
    appKey,
    eventType,
    severity,
    deviceId,
    platform: safeText(body.platform, 24),
    runtimeVersion: safeText(body.runtimeVersion, 80),
    appVersion: safeText(body.appVersion, 80),
    buildNumber: safeText(body.buildNumber, 80),
    deviceModel: safeText(body.deviceModel, 160),
    osVersion: safeText(body.osVersion, 80),
    networkType: safeText(body.networkType || body.state?.networkType, 60),
    screen: safeText(body.screen || body.state?.screen, 160),
    metrics: safeObject(body.metrics),
    state: safeObject(body.state),
    message: safeText(body.message, 2000),
    occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
  };
};

const shouldRelayToCentral = (req, source) => {
  if (source !== 'auth') return false;
  if (!CENTRAL_INGEST_URL || !CENTRAL_INGEST_SECRET) return false;
  return !isCentralHost(hostFromRequest(req));
};

const relayToCentral = async (req, payload) => {
  relayStats.attempts += 1;
  try {
    const response = await axios.post(CENTRAL_INGEST_URL, payload, {
      timeout: 5000,
      headers: {
        [INGEST_SECRET_HEADER]: CENTRAL_INGEST_SECRET,
        'content-type': 'application/json',
      },
      validateStatus: (status) => status >= 200 && status < 300,
    });
    relayStats.forwarded += 1;
    relayStats.lastForwardedAt = new Date().toISOString();
    relayStats.lastError = null;
    logRequest('central relay ok', req, {
      appKey: payload.appKey,
      status: response.status,
      centralUrl: CENTRAL_INGEST_URL,
    });
  } catch (error) {
    relayStats.failed += 1;
    relayStats.lastFailedAt = new Date().toISOString();
    relayStats.lastError = error?.response?.data?.error || error?.message || 'unknown';
    logRequest('central relay failed', req, {
      appKey: payload.appKey,
      error: relayStats.lastError,
      status: error?.response?.status || null,
      centralUrl: CENTRAL_INGEST_URL,
    });
  }
};

const createDiagnosticEvent = async (req, body, { userId = null, source = 'auth' } = {}) => {
  await ensureMobileDiagnosticTable();
  const payload = normalizeDiagnosticPayload(body, userId);
  const event = await MobileDiagnosticEvent.create(payload);

  ingestStats.accepted += 1;
  ingestStats.lastAcceptedAt = new Date().toISOString();
  ingestStats.lastError = null;
  logRequest('metrics accepted', req, {
    source,
    eventId: event.id,
    appKey: payload.appKey,
    eventType: payload.eventType,
    severity: payload.severity,
    deviceId: payload.deviceId,
  });
  if (shouldRelayToCentral(req, source)) {
    relayToCentral(req, payload).catch((error) => {
      console.warn('[mobile-diagnostics] central relay unexpected failure:', error?.message || error);
    });
  }
  return event;
};

const average = (values) => {
  const clean = values.map(safeNumber).filter((value) => value != null);
  if (!clean.length) return null;
  return Math.round((clean.reduce((sum, value) => sum + value, 0) / clean.length) * 10) / 10;
};

const percentile = (values, p) => {
  const clean = values.map(safeNumber).filter((value) => value != null).sort((a, b) => a - b);
  if (!clean.length) return null;
  const index = Math.min(clean.length - 1, Math.max(0, Math.ceil((p / 100) * clean.length) - 1));
  return Math.round(clean[index] * 10) / 10;
};

const telemetryWhere = (from, to) => ({
  appKey: { [Op.ne]: 'orderspace-test' },
  occurredAt: { [Op.gte]: from, [Op.lt]: to },
});

const buildTelemetrySummary = (events, apiPerformance = null) => {
  const now = Date.now();
  const fiveMinutesAgo = now - 5 * 60 * 1000;
  const oneHourAgo = now - 60 * 60 * 1000;
  const byAppMap = new Map();
  const activeDevices = new Set();
  const activeUsers = new Set();
  const allDevices = new Set();
  const errorEvents = [];
  const slowApiMap = new Map();

  for (const event of events) {
    const plain = event.toJSON ? event.toJSON() : event;
    const occurredMs = new Date(plain.occurredAt || plain.createdAt).getTime();
    const metrics = safeObject(plain.metrics);
    const appKey = canonicalAppKey(plain.appKey);
    const socketReconnectMs = socketReconnectMsFromEvent(plain, metrics);
    const app = byAppMap.get(appKey) || {
      appKey,
      events24h: 0,
      events1h: 0,
      activeDevices5m: new Set(),
      devices24h: new Set(),
      users5m: new Set(),
      errors1h: 0,
      warnings1h: 0,
      socketReconnects1h: 0,
      avgApiLatencyMs: [],
      p95ApiLatencyMs: [],
      avgSocketLatencyMs: [],
      avgFps: [],
      avgMemoryMb: [],
      avgStartupMs: [],
      diagnosticsVersions: new Set(),
      lastSeenAt: null,
    };

    app.events24h += 1;
    app.devices24h.add(plain.deviceId);
    allDevices.add(plain.deviceId);
    app.lastSeenAt = !app.lastSeenAt || occurredMs > new Date(app.lastSeenAt).getTime()
      ? plain.occurredAt
      : app.lastSeenAt;

    if (occurredMs >= fiveMinutesAgo) {
      app.activeDevices5m.add(plain.deviceId);
      activeDevices.add(plain.deviceId);
      if (plain.userId) {
        app.users5m.add(plain.userId);
        activeUsers.add(plain.userId);
      }
    }

    if (occurredMs >= oneHourAgo) {
      app.events1h += 1;
      if (plain.eventType === 'error' || plain.severity === 'critical') app.errors1h += 1;
      if (plain.severity === 'warning') app.warnings1h += 1;
      app.avgApiLatencyMs.push(metrics.apiLatencyMs);
      app.p95ApiLatencyMs.push(metrics.apiLatencyMs);
      if (socketReconnectMs != null) {
        app.socketReconnects1h += 1;
        app.avgSocketLatencyMs.push(socketReconnectMs);
      }
      const apiLatencyMs = safeNumber(metrics.apiLatencyMs);
      const apiEndpoint = apiLatencyMs != null && ['metric', 'error'].includes(plain.eventType)
        ? apiEndpointFromEvent(plain)
        : null;
      if (apiEndpoint) {
        const endpointKey = `${apiEndpoint.method} ${apiEndpoint.path}`;
        const row = slowApiMap.get(endpointKey) || {
          appKey,
          method: apiEndpoint.method,
          path: apiEndpoint.path,
          count: 0,
          latencies: [],
          serverLatencies: [],
          pairedClientLatencies: [],
          clientOverheads: [],
          inFlightAtStart: [],
          maxInFlight: [],
          queueWaits: [],
          networkTypes: new Map(),
          appStates: new Map(),
          cellularGenerations: new Map(),
          carriers: new Map(),
          disconnectedCount: 0,
          unreachableCount: 0,
          expensiveCount: 0,
          apiStartedInBackgroundCount: 0,
          apiBackgroundedDuringRequestCount: 0,
          apiAppStateChangedDuringRequestCount: 0,
          diagnosticsVersions: new Set(),
          devices: new Set(),
          users: new Set(),
          statuses: new Set(),
          lastSeenAt: null,
        };
        row.count += 1;
        row.latencies.push(apiLatencyMs);
        const serverDurationMs = safeNumber(metrics.serverDurationMs ?? safeObject(plain.state).apiServerDurationMs);
        const state = safeObject(plain.state);
        if (serverDurationMs != null) {
          row.serverLatencies.push(serverDurationMs);
          row.pairedClientLatencies.push(apiLatencyMs);
          row.clientOverheads.push(Math.max(0, apiLatencyMs - serverDurationMs));
        }
        const inFlightAtStart = safeNumber(metrics.apiInFlightAtStart ?? state.apiInFlightAtStart);
        const maxInFlight = safeNumber(metrics.apiMaxInFlight ?? state.apiMaxInFlight);
        const queueWaitMs = safeNumber(metrics.apiQueueWaitMs ?? state.apiQueueWaitMs);
        const diagnosticsSchemaVersion = safeNumber(state.diagnosticsSchemaVersion);
        const networkContext = networkContextFromEvent(plain, metrics, state);
        if (inFlightAtStart != null) row.inFlightAtStart.push(inFlightAtStart);
        if (maxInFlight != null) row.maxInFlight.push(maxInFlight);
        if (queueWaitMs != null) row.queueWaits.push(queueWaitMs);
        incrementMapValue(row.networkTypes, networkContext.networkType);
        incrementMapValue(row.appStates, networkContext.appState);
        if (networkContext.cellularGeneration) incrementMapValue(row.cellularGenerations, networkContext.cellularGeneration);
        if (networkContext.carrier) incrementMapValue(row.carriers, networkContext.carrier);
        if (networkContext.isConnected === false) row.disconnectedCount += 1;
        if (networkContext.isInternetReachable === false) row.unreachableCount += 1;
        if (networkContext.isConnectionExpensive === true) row.expensiveCount += 1;
        if (networkContext.apiStartedInBackground === true) row.apiStartedInBackgroundCount += 1;
        if (networkContext.apiBackgroundedDuringRequest === true) row.apiBackgroundedDuringRequestCount += 1;
        if (networkContext.apiAppStateChangedDuringRequest === true) row.apiAppStateChangedDuringRequestCount += 1;
        if (diagnosticsSchemaVersion != null) row.diagnosticsVersions.add(diagnosticsSchemaVersion);
        if (plain.deviceId) row.devices.add(plain.deviceId);
        if (plain.userId) row.users.add(plain.userId);
        const apiStatus = safeNumber(state.apiStatus);
        if (apiStatus != null) row.statuses.add(apiStatus);
        row.lastSeenAt = !row.lastSeenAt || occurredMs > new Date(row.lastSeenAt).getTime()
          ? plain.occurredAt
          : row.lastSeenAt;
        slowApiMap.set(endpointKey, row);
      }
      app.avgFps.push(metrics.fps ?? metrics.jsFps);
      app.avgMemoryMb.push(metrics.memoryUsedMb);
      app.avgStartupMs.push(metrics.startupMs);
      const diagnosticsSchemaVersion = safeNumber(safeObject(plain.state).diagnosticsSchemaVersion);
      if (diagnosticsSchemaVersion != null) app.diagnosticsVersions.add(diagnosticsSchemaVersion);
    }

    if (plain.eventType === 'error' || plain.severity !== 'info') {
      errorEvents.push({
        appKey,
        severity: plain.severity,
        eventType: plain.eventType,
        deviceId: plain.deviceId,
        screen: plain.screen,
        message: plain.message,
        occurredAt: plain.occurredAt,
      });
    }

    byAppMap.set(appKey, app);
  }

  const byApp = Array.from(byAppMap.values())
    .map((app) => ({
      appKey: app.appKey,
      events24h: app.events24h,
      events1h: app.events1h,
      activeDevices5m: app.activeDevices5m.size,
      devices24h: app.devices24h.size,
      users5m: app.users5m.size,
      errors1h: app.errors1h,
      warnings1h: app.warnings1h,
      socketReconnects1h: app.socketReconnects1h,
      avgApiLatencyMs: average(app.avgApiLatencyMs),
      p95ApiLatencyMs: percentile(app.p95ApiLatencyMs, 95),
      avgSocketLatencyMs: average(app.avgSocketLatencyMs),
      avgFps: average(app.avgFps),
      avgMemoryMb: average(app.avgMemoryMb),
      avgStartupMs: average(app.avgStartupMs),
      diagnosticsVersions: Array.from(app.diagnosticsVersions).sort((a, b) => b - a),
      lastSeenAt: app.lastSeenAt,
    }))
    .sort((a, b) => b.activeDevices5m - a.activeDevices5m || b.events1h - a.events1h);
  const backendEndpointMap = new Map(
    (apiPerformance?.endpoints || []).map((row) => [apiPerformanceKey(row.method, row.path), row])
  );
  const slowApiEndpoints = Array.from(slowApiMap.values())
    .map((row) => ({
      ...row,
      backendEndpoint: backendEndpointMap.get(apiPerformanceKey(row.method, row.path)) || null,
    }))
    .map((row) => {
      const avgServerDurationMs = average(row.serverLatencies);
      const p95ServerDurationMs = percentile(row.serverLatencies, 95);
      const maxServerDurationMs = maxValue(row.serverLatencies);
      const hasMobileServerSamples = row.serverLatencies.length > 0;
      const hasBackendFallback = !hasMobileServerSamples && row.backendEndpoint;
      return {
        appKey: row.appKey,
        method: row.method,
        path: row.path,
        count: row.count,
        diagnosticsVersions: Array.from(row.diagnosticsVersions).sort((a, b) => b - a),
        avgLatencyMs: average(row.latencies),
        p95LatencyMs: percentile(row.latencies, 95),
        maxLatencyMs: maxValue(row.latencies),
        avgServerDurationMs: avgServerDurationMs ?? row.backendEndpoint?.avgLatencyMs ?? null,
        p95ServerDurationMs: p95ServerDurationMs ?? row.backendEndpoint?.p95LatencyMs ?? null,
        maxServerDurationMs: maxServerDurationMs ?? row.backendEndpoint?.maxLatencyMs ?? null,
        serverSamples: hasMobileServerSamples ? row.serverLatencies.length : row.backendEndpoint?.count || 0,
        avgPairedClientLatencyMs: average(row.pairedClientLatencies),
        avgClientOverheadMs: average(row.clientOverheads),
        p95ClientOverheadMs: percentile(row.clientOverheads, 95),
        avgInFlightAtStart: average(row.inFlightAtStart),
        maxInFlight: maxValue(row.maxInFlight.length ? row.maxInFlight : row.inFlightAtStart),
        avgQueueWaitMs: average(row.queueWaits),
        maxQueueWaitMs: maxValue(row.queueWaits),
        networkTypes: mapToSortedObject(row.networkTypes),
        appStates: mapToSortedObject(row.appStates),
        cellularGenerations: mapToSortedObject(row.cellularGenerations),
        carriers: mapToSortedObject(row.carriers),
        disconnectedCount: row.disconnectedCount,
        unreachableCount: row.unreachableCount,
        expensiveConnectionCount: row.expensiveCount,
        apiStartedInBackgroundCount: row.apiStartedInBackgroundCount,
        apiBackgroundedDuringRequestCount: row.apiBackgroundedDuringRequestCount,
        apiAppStateChangedDuringRequestCount: row.apiAppStateChangedDuringRequestCount,
        serverDurationSource: hasMobileServerSamples ? 'mobile-header' : (hasBackendFallback ? 'backend-session' : null),
        devices: row.devices.size,
        users: row.users.size,
        statuses: Array.from(row.statuses).sort((a, b) => a - b),
        lastSeenAt: row.lastSeenAt,
      };
    })
    .sort((a, b) =>
      (b.p95LatencyMs || 0) - (a.p95LatencyMs || 0) ||
      (b.avgLatencyMs || 0) - (a.avgLatencyMs || 0) ||
      b.count - a.count
    )
    .slice(0, 20);

  return {
    activeDevices5m: activeDevices.size,
    activeUsers5m: activeUsers.size,
    devices24h: allDevices.size,
    events24h: events.length,
    errors1h: byApp.reduce((sum, app) => sum + app.errors1h, 0),
    warnings1h: byApp.reduce((sum, app) => sum + app.warnings1h, 0),
    socketReconnects1h: byApp.reduce((sum, app) => sum + app.socketReconnects1h, 0),
    avgApiLatencyMs: average(byApp.map((app) => app.avgApiLatencyMs)),
    p95ApiLatencyMs: percentile(byApp.map((app) => app.p95ApiLatencyMs), 95),
    avgSocketLatencyMs: average(byApp.map((app) => app.avgSocketLatencyMs)),
    avgFps: average(byApp.map((app) => app.avgFps)),
    avgMemoryMb: average(byApp.map((app) => app.avgMemoryMb)),
    byApp,
    slowApiEndpoints,
    recentIssues: errorEvents
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 30),
  };
};

const startOfDay = (date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const bucketStart = (date, bucket) => {
  const next = new Date(date);
  if (bucket === 'hour') {
    next.setMinutes(0, 0, 0);
    return next;
  }
  next.setHours(0, 0, 0, 0);
  return next;
};

const buildHistory = (events, bucket) => {
  const buckets = new Map();
  for (const event of events) {
    const plain = event.toJSON ? event.toJSON() : event;
    const key = bucketStart(plain.occurredAt || plain.createdAt, bucket).toISOString();
    const row = buckets.get(key) || {
      bucket: key,
      events: 0,
      devices: new Set(),
      users: new Set(),
      errors: 0,
      warnings: 0,
      apiLatencyMs: [],
      socketLatencyMs: [],
      fps: [],
      memoryMb: [],
    };
    const metrics = safeObject(plain.metrics);
    const socketReconnectMs = socketReconnectMsFromEvent(plain, metrics);
    row.events += 1;
    if (plain.deviceId) row.devices.add(plain.deviceId);
    if (plain.userId) row.users.add(plain.userId);
    if (plain.eventType === 'error' || plain.severity === 'critical') row.errors += 1;
    if (plain.severity === 'warning') row.warnings += 1;
    row.apiLatencyMs.push(metrics.apiLatencyMs);
    if (socketReconnectMs != null) row.socketLatencyMs.push(socketReconnectMs);
    row.fps.push(metrics.fps ?? metrics.jsFps);
    row.memoryMb.push(metrics.memoryUsedMb);
    buckets.set(key, row);
  }

  return Array.from(buckets.values())
    .sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)))
    .map((row) => ({
      bucket: row.bucket,
      events: row.events,
      devices: row.devices.size,
      users: row.users.size,
      errors: row.errors,
      warnings: row.warnings,
      avgApiLatencyMs: average(row.apiLatencyMs),
      p95ApiLatencyMs: percentile(row.apiLatencyMs, 95),
      avgSocketLatencyMs: average(row.socketLatencyMs),
      avgFps: average(row.fps),
      avgMemoryMb: average(row.memoryMb),
    }));
};

const comparePeriods = (events) => {
  const todayStart = startOfDay(new Date());
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const today = buildTelemetrySummary(events.filter((event) => {
    const occurredAt = new Date(event.occurredAt || event.createdAt).getTime();
    return occurredAt >= todayStart.getTime() && occurredAt < tomorrowStart.getTime();
  }));
  const yesterday = buildTelemetrySummary(events.filter((event) => {
    const occurredAt = new Date(event.occurredAt || event.createdAt).getTime();
    return occurredAt >= yesterdayStart.getTime() && occurredAt < todayStart.getTime();
  }));

  return {
    today: {
      events: today.events24h,
      devices: today.devices24h,
      errors: today.errors1h,
      warnings: today.warnings1h,
      avgApiLatencyMs: today.avgApiLatencyMs,
    },
    yesterday: {
      events: yesterday.events24h,
      devices: yesterday.devices24h,
      errors: yesterday.errors1h,
      warnings: yesterday.warnings1h,
      avgApiLatencyMs: yesterday.avgApiLatencyMs,
    },
  };
};

const hasDiagnosticsVersionAtLeast = (event, minVersion) => {
  const version = safeNumber(safeObject(event.state).diagnosticsSchemaVersion);
  return version != null && version >= minVersion;
};

const buildPeriodApiExport = (events) => {
  const byAppMap = new Map();
  const endpointMap = new Map();
  const issues = [];
  const socketEvents = [];

  for (const event of events) {
    const plain = event.toJSON ? event.toJSON() : event;
    const metrics = safeObject(plain.metrics);
    const state = safeObject(plain.state);
    const appKey = canonicalAppKey(plain.appKey);
    const occurredAt = plain.occurredAt || plain.createdAt;
    const app = byAppMap.get(appKey) || {
      appKey,
      events: 0,
      devices: new Set(),
      users: new Set(),
      errors: 0,
      warnings: 0,
      apiLatencies: [],
      socketReconnects: [],
      diagnosticsVersions: new Set(),
      lastSeenAt: null,
    };

    app.events += 1;
    if (plain.deviceId) app.devices.add(plain.deviceId);
    if (plain.userId) app.users.add(plain.userId);
    if (plain.eventType === 'error' || plain.severity === 'critical') app.errors += 1;
    if (plain.severity === 'warning') app.warnings += 1;
    app.apiLatencies.push(metrics.apiLatencyMs);
    const socketReconnectMs = socketReconnectMsFromEvent(plain, metrics);
    if (socketReconnectMs != null) app.socketReconnects.push(socketReconnectMs);
    const diagnosticsSchemaVersion = safeNumber(state.diagnosticsSchemaVersion);
    if (diagnosticsSchemaVersion != null) app.diagnosticsVersions.add(diagnosticsSchemaVersion);
    app.lastSeenAt = !app.lastSeenAt || new Date(occurredAt).getTime() > new Date(app.lastSeenAt).getTime()
      ? occurredAt
      : app.lastSeenAt;
    byAppMap.set(appKey, app);

    if (plain.eventType === 'error' || plain.severity !== 'info') {
      const networkContext = networkContextFromEvent(plain, metrics, state);
      const socketContext = socketContextFromEvent(plain, metrics, state);
      issues.push({
        appKey,
        severity: plain.severity,
        eventType: plain.eventType,
        screen: plain.screen || null,
        message: plain.message || null,
        networkType: networkContext.networkType,
        appState: networkContext.appState,
        isConnected: networkContext.isConnected,
        isInternetReachable: networkContext.isInternetReachable,
        isConnectionExpensive: networkContext.isConnectionExpensive,
        cellularGeneration: networkContext.cellularGeneration,
        carrier: networkContext.carrier,
        socketConnected: socketContext.socketConnected,
        socketTransport: socketContext.socketTransport,
        socketDisconnectReason: socketContext.socketDisconnectReason,
        socketErrorMessage: socketContext.socketErrorMessage,
        socketReconnectAttempt: socketContext.socketReconnectAttempt,
        socketUsingBackup: socketContext.socketUsingBackup,
        socketConnectMs: socketContext.socketConnectMs,
        socketConnectMsIgnored: socketContext.socketConnectMsIgnored,
        socketSessionAgeMs: socketContext.socketSessionAgeMs,
        socketReconnectMs: socketContext.socketReconnectMs,
        socketReconnectMsIgnored: socketContext.socketReconnectMsIgnored,
        socketDisconnectedForMs: socketContext.socketDisconnectedForMs,
        socketDisconnectedForMsIgnored: socketContext.socketDisconnectedForMsIgnored,
        socketBackgroundedDuringDisconnect: socketContext.socketBackgroundedDuringDisconnect,
        socketAppStateAtDisconnect: socketContext.socketAppStateAtDisconnect,
        socketAppStateAtReconnect: socketContext.socketAppStateAtReconnect,
        apiAppStateAtStart: networkContext.apiAppStateAtStart,
        apiAppStateAtFinish: networkContext.apiAppStateAtFinish,
        apiAppStateChangedDuringRequest: networkContext.apiAppStateChangedDuringRequest,
        apiBackgroundedDuringRequest: networkContext.apiBackgroundedDuringRequest,
        apiStartedInBackground: networkContext.apiStartedInBackground,
        occurredAt,
      });
    }

    if (
      plain.eventType === 'state' &&
      typeof plain.message === 'string' &&
      plain.message.startsWith('socket-')
    ) {
      const networkContext = networkContextFromEvent(plain, metrics, state);
      const socketContext = socketContextFromEvent(plain, metrics, state);
      socketEvents.push({
        appKey,
        severity: plain.severity,
        message: plain.message,
        screen: plain.screen || null,
        networkType: networkContext.networkType,
        appState: networkContext.appState,
        isConnected: networkContext.isConnected,
        isInternetReachable: networkContext.isInternetReachable,
        isConnectionExpensive: networkContext.isConnectionExpensive,
        cellularGeneration: networkContext.cellularGeneration,
        carrier: networkContext.carrier,
        socketConnected: socketContext.socketConnected,
        socketId: socketContext.socketId,
        socketUrl: socketContext.socketUrl,
        socketTransport: socketContext.socketTransport,
        socketDisconnectReason: socketContext.socketDisconnectReason,
        socketErrorMessage: socketContext.socketErrorMessage,
        socketReconnectAttempt: socketContext.socketReconnectAttempt,
        socketSwitchedToBackup: socketContext.socketSwitchedToBackup,
        socketUsingBackup: socketContext.socketUsingBackup,
        socketConnectMs: socketContext.socketConnectMs,
        socketConnectMsIgnored: socketContext.socketConnectMsIgnored,
        socketSessionAgeMs: socketContext.socketSessionAgeMs,
        socketReconnectMs: socketContext.socketReconnectMs,
        socketReconnectMsIgnored: socketContext.socketReconnectMsIgnored,
        socketDisconnectedForMs: socketContext.socketDisconnectedForMs,
        socketDisconnectedForMsIgnored: socketContext.socketDisconnectedForMsIgnored,
        socketBackgroundedDuringDisconnect: socketContext.socketBackgroundedDuringDisconnect,
        socketAppStateAtDisconnect: socketContext.socketAppStateAtDisconnect,
        socketAppStateAtReconnect: socketContext.socketAppStateAtReconnect,
        occurredAt,
      });
    }

    const apiLatencyMs = safeNumber(metrics.apiLatencyMs);
    const apiEndpoint = apiLatencyMs != null && ['metric', 'error'].includes(plain.eventType)
      ? apiEndpointFromEvent(plain)
      : null;
    if (!apiEndpoint) continue;

    const endpointKey = `${appKey} ${apiEndpoint.method} ${apiEndpoint.path}`;
    const row = endpointMap.get(endpointKey) || {
      appKey,
      method: apiEndpoint.method,
      path: apiEndpoint.path,
      count: 0,
      latencies: [],
      serverLatencies: [],
      overheads: [],
      inFlightAtStart: [],
      maxInFlight: [],
      queueWaits: [],
      networkTypes: new Map(),
      appStates: new Map(),
      cellularGenerations: new Map(),
      carriers: new Map(),
      disconnectedCount: 0,
      unreachableCount: 0,
      expensiveCount: 0,
      apiStartedInBackgroundCount: 0,
      apiBackgroundedDuringRequestCount: 0,
      apiAppStateChangedDuringRequestCount: 0,
      devices: new Set(),
      users: new Set(),
      statuses: new Set(),
      diagnosticsVersions: new Set(),
      firstSeenAt: null,
      lastSeenAt: null,
    };

    row.count += 1;
    row.latencies.push(apiLatencyMs);
    const serverDurationMs = safeNumber(metrics.serverDurationMs ?? state.apiServerDurationMs);
    if (serverDurationMs != null) {
      row.serverLatencies.push(serverDurationMs);
      row.overheads.push(Math.max(0, apiLatencyMs - serverDurationMs));
    }
    const inFlightAtStart = safeNumber(metrics.apiInFlightAtStart ?? state.apiInFlightAtStart);
    const maxInFlight = safeNumber(metrics.apiMaxInFlight ?? state.apiMaxInFlight);
    const queueWaitMs = safeNumber(metrics.apiQueueWaitMs ?? state.apiQueueWaitMs);
    const apiStatus = safeNumber(state.apiStatus);
    const networkContext = networkContextFromEvent(plain, metrics, state);
    if (inFlightAtStart != null) row.inFlightAtStart.push(inFlightAtStart);
    if (maxInFlight != null) row.maxInFlight.push(maxInFlight);
    if (queueWaitMs != null) row.queueWaits.push(queueWaitMs);
    incrementMapValue(row.networkTypes, networkContext.networkType);
    incrementMapValue(row.appStates, networkContext.appState);
    if (networkContext.cellularGeneration) incrementMapValue(row.cellularGenerations, networkContext.cellularGeneration);
    if (networkContext.carrier) incrementMapValue(row.carriers, networkContext.carrier);
    if (networkContext.isConnected === false) row.disconnectedCount += 1;
    if (networkContext.isInternetReachable === false) row.unreachableCount += 1;
    if (networkContext.isConnectionExpensive === true) row.expensiveCount += 1;
    if (networkContext.apiStartedInBackground === true) row.apiStartedInBackgroundCount += 1;
    if (networkContext.apiBackgroundedDuringRequest === true) row.apiBackgroundedDuringRequestCount += 1;
    if (networkContext.apiAppStateChangedDuringRequest === true) row.apiAppStateChangedDuringRequestCount += 1;
    if (apiStatus != null) row.statuses.add(apiStatus);
    if (diagnosticsSchemaVersion != null) row.diagnosticsVersions.add(diagnosticsSchemaVersion);
    if (plain.deviceId) row.devices.add(plain.deviceId);
    if (plain.userId) row.users.add(plain.userId);
    row.firstSeenAt = !row.firstSeenAt || new Date(occurredAt).getTime() < new Date(row.firstSeenAt).getTime()
      ? occurredAt
      : row.firstSeenAt;
    row.lastSeenAt = !row.lastSeenAt || new Date(occurredAt).getTime() > new Date(row.lastSeenAt).getTime()
      ? occurredAt
      : row.lastSeenAt;
    endpointMap.set(endpointKey, row);
  }

  return {
    byApp: Array.from(byAppMap.values())
      .map((app) => ({
        appKey: app.appKey,
        events: app.events,
        devices: app.devices.size,
        users: app.users.size,
        errors: app.errors,
        warnings: app.warnings,
        avgApiLatencyMs: average(app.apiLatencies),
        p95ApiLatencyMs: percentile(app.apiLatencies, 95),
        avgSocketReconnectMs: average(app.socketReconnects),
        diagnosticsVersions: Array.from(app.diagnosticsVersions).sort((a, b) => b - a),
        lastSeenAt: app.lastSeenAt,
      }))
      .sort((a, b) => b.events - a.events),
    slowApiEndpoints: Array.from(endpointMap.values())
      .map((row) => ({
        appKey: row.appKey,
        method: row.method,
        path: row.path,
        count: row.count,
        diagnosticsVersions: Array.from(row.diagnosticsVersions).sort((a, b) => b - a),
        avgLatencyMs: average(row.latencies),
        p95LatencyMs: percentile(row.latencies, 95),
        maxLatencyMs: maxValue(row.latencies),
        avgServerDurationMs: average(row.serverLatencies),
        p95ServerDurationMs: percentile(row.serverLatencies, 95),
        maxServerDurationMs: maxValue(row.serverLatencies),
        serverSamples: row.serverLatencies.length,
        avgClientOverheadMs: average(row.overheads),
        p95ClientOverheadMs: percentile(row.overheads, 95),
        maxClientOverheadMs: maxValue(row.overheads),
        avgInFlightAtStart: average(row.inFlightAtStart),
        maxInFlight: maxValue(row.maxInFlight.length ? row.maxInFlight : row.inFlightAtStart),
        avgQueueWaitMs: average(row.queueWaits),
        maxQueueWaitMs: maxValue(row.queueWaits),
        networkTypes: mapToSortedObject(row.networkTypes),
        appStates: mapToSortedObject(row.appStates),
        cellularGenerations: mapToSortedObject(row.cellularGenerations),
        carriers: mapToSortedObject(row.carriers),
        disconnectedCount: row.disconnectedCount,
        unreachableCount: row.unreachableCount,
        expensiveConnectionCount: row.expensiveCount,
        apiStartedInBackgroundCount: row.apiStartedInBackgroundCount,
        apiBackgroundedDuringRequestCount: row.apiBackgroundedDuringRequestCount,
        apiAppStateChangedDuringRequestCount: row.apiAppStateChangedDuringRequestCount,
        devices: row.devices.size,
        users: row.users.size,
        statuses: Array.from(row.statuses).sort((a, b) => a - b),
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
      }))
      .sort((a, b) =>
        (b.p95LatencyMs || 0) - (a.p95LatencyMs || 0) ||
        (b.avgLatencyMs || 0) - (a.avgLatencyMs || 0) ||
        b.count - a.count
      ),
    issues: issues
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 200),
    socketEvents: socketEvents
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 300),
  };
};

const readUpdateClients = async () => {
  const rootStat = await statOrNull(updatesRoot);
  if (!rootStat?.isDirectory()) {
    return { root: updatesRoot, available: false, clients: [] };
  }

  const appDirs = await fs.readdir(updatesRoot, { withFileTypes: true });
  const clients = [];

  for (const appDir of appDirs.filter((entry) => entry.isDirectory())) {
    const appKey = appDir.name;
    const appRoot = path.join(updatesRoot, appKey);
    const runtimeDirs = await fs.readdir(appRoot, { withFileTypes: true }).catch(() => []);
    const runtimes = [];

    for (const runtimeDir of runtimeDirs.filter((entry) => entry.isDirectory())) {
      const runtimeVersion = runtimeDir.name;
      const runtimeRoot = path.join(appRoot, runtimeVersion);
      const current = await safeReadJson(path.join(runtimeRoot, 'current.json'), {});
      const releaseId = current?.releaseId || null;
      const releaseRoot = releaseId ? path.join(runtimeRoot, releaseId) : null;
      const releaseInfo = releaseRoot ? await safeReadJson(path.join(releaseRoot, 'release.json'), {}) : {};
      const metadata = releaseRoot ? await safeReadJson(path.join(releaseRoot, 'metadata.json'), {}) : {};
      const releaseStat = releaseRoot ? await statOrNull(releaseRoot) : null;
      const platforms = Object.keys(metadata?.fileMetadata || {});

      runtimes.push({
        runtimeVersion,
        releaseId,
        message: releaseInfo?.message || '',
        createdAt: releaseInfo?.createdAt || (releaseStat ? releaseStat.mtime.toISOString() : null),
        platforms,
      });
    }

    clients.push({
      appKey,
      runtimes: runtimes.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
    });
  }

  return { root: updatesRoot, available: true, clients: clients.sort((a, b) => a.appKey.localeCompare(b.appKey)) };
};

router.post('/mobile-diagnostics/metrics', auth, async (req, res) => {
  ingestStats.attempts += 1;
  try {
    const event = await createDiagnosticEvent(req, req.body || {}, {
      userId: req.user?.id || null,
      source: 'auth',
    });
    return res.status(201).json({ ok: true, id: event.id });
  } catch (error) {
    ingestStats.failed += 1;
    ingestStats.lastFailedAt = new Date().toISOString();
    ingestStats.lastError = error?.code || error?.message || 'unknown';
    logRequest('metrics failed', req, { error: ingestStats.lastError });
    console.error('[mobile-diagnostics] metrics ingest failed:', error);
    return res.status(error?.status || 500).json({ error: error?.status ? error.message : 'Не удалось сохранить мобильную метрику' });
  }
});

router.post('/mobile-diagnostics/ingest', async (req, res) => {
  ingestStats.attempts += 1;
  try {
    if (!INGEST_SECRET) {
      const error = new Error('MOBILE_DIAGNOSTICS_INGEST_SECRET не настроен');
      error.status = 503;
      error.code = 'ingest_secret_not_configured';
      throw error;
    }
    const providedSecret = String(req.headers[INGEST_SECRET_HEADER] || '').trim();
    if (!providedSecret || providedSecret !== INGEST_SECRET) {
      const error = new Error('Неверный секрет диагностики');
      error.status = 403;
      error.code = 'invalid_ingest_secret';
      throw error;
    }

    const event = await createDiagnosticEvent(req, req.body || {}, {
      userId: null,
      source: 'external',
    });
    return res.status(201).json({ ok: true, id: event.id });
  } catch (error) {
    ingestStats.failed += 1;
    ingestStats.lastFailedAt = new Date().toISOString();
    ingestStats.lastError = error?.code || error?.message || 'unknown';
    logRequest('external ingest failed', req, { error: ingestStats.lastError });
    if (!error?.status || error.status >= 500) {
      console.error('[mobile-diagnostics] external ingest failed:', error);
    }
    return res.status(error?.status || 500).json({ error: error?.status ? error.message : 'Не удалось сохранить внешнюю мобильную метрику' });
  }
});

router.get('/mobile-diagnostics/summary', auth, requireInternalAdmin, async (_req, res) => {
  try {
    await ensureMobileDiagnosticTable();
    const now = Date.now();
    const stalePushDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const staleUserDate = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [
      updateClients,
      versions,
      pushTokenCount,
      pushUsers,
      stalePushTokens,
      unifiedTotal,
      unifiedEnabled,
      staleUnified,
      totalUsers,
      recentlySeenUsers,
      staleUsersWithTokens,
      telemetryEvents,
    ] = await Promise.all([
      readUpdateClients(),
      AppVersion.findAll({ order: [['id', 'DESC'], ['createdAt', 'DESC']], limit: 20 }),
      PushToken.count(),
      PushToken.count({ distinct: true, col: 'userId' }),
      PushToken.count({ where: { updatedAt: { [Op.lt]: stalePushDate } } }),
      UnifiedPushSubscription ? UnifiedPushSubscription.count() : Promise.resolve(0),
      UnifiedPushSubscription ? UnifiedPushSubscription.count({ where: { enabled: true } }) : Promise.resolve(0),
      UnifiedPushSubscription
        ? UnifiedPushSubscription.count({ where: { updatedAt: { [Op.lt]: stalePushDate } } })
        : Promise.resolve(0),
      User.count(),
      User.count({ where: { lastSeenAt: { [Op.gte]: staleUserDate } } }),
      User.count({
        include: [{ model: PushToken, as: 'pushTokens', required: true, attributes: [] }],
        where: {
          [Op.or]: [
            { lastSeenAt: null },
            { lastSeenAt: { [Op.lt]: staleUserDate } },
          ],
        },
        distinct: true,
      }),
      MobileDiagnosticEvent.findAll({
        where: telemetryWhere(new Date(now - 24 * 60 * 60 * 1000), new Date(now + 1000)),
        order: [['occurredAt', 'DESC']],
        limit: 3000,
      }),
    ]);

    const sockets = getSocketSnapshot();
    const ota = getMobileUpdateSnapshot();
    const apiPerformance = getApiPerformanceSnapshot();
    const telemetry = buildTelemetrySummary(telemetryEvents, apiPerformance);
    const releaseClientKeys = new Set(updateClients.clients.map((client) => client.appKey));

    const payload = {
      generatedAt: new Date().toISOString(),
      backend: {
        pid: process.pid,
        routeStartedAt,
        nodeEnv: process.env.NODE_ENV || null,
        roleId: Number(_req.user?.roleId) || null,
        normalizedHost: hostFromRequest(_req),
        externalIngestEnabled: Boolean(INGEST_SECRET),
        centralRelayEnabled: Boolean(CENTRAL_INGEST_URL && CENTRAL_INGEST_SECRET),
        centralIngestUrl: CENTRAL_INGEST_URL || null,
        adminRoleIds: Array.from(ADMIN_ROLE_IDS),
        internalHosts: Array.from(INTERNAL_HOSTS),
      },
      sockets,
      ota,
      apiPerformance,
      telemetry,
      ingest: {
        ...ingestStats,
        tableReady: mobileDiagnosticTableReady,
      },
      relay: relayStats,
      updateClients,
      versions: versions.map((row) => ({
        id: row.id,
        type: row.type,
        version: row.version,
        status: row.status,
        createdAt: row.createdAt,
      })),
      push: {
        expoTokens: pushTokenCount,
        expoUsers: pushUsers,
        staleExpoTokens: stalePushTokens,
        unifiedSubscriptions: unifiedTotal,
        unifiedEnabled,
        staleUnifiedSubscriptions: staleUnified,
      },
      users: {
        total: totalUsers,
        seenLast7Days: recentlySeenUsers,
        staleWithPushTokens: staleUsersWithTokens,
      },
      alerts: [
        ...ota.byApp
          .filter((row) => row.errors > 0)
          .map((row) => ({
            level: 'warning',
            title: `Ошибки OTA у ${row.appKey}`,
            details: `${row.errors} ошибочных запросов в последних ${row.total} OTA-запросах`,
          })),
        ...(releaseClientKeys.size === 0
          ? [{
              level: 'info',
              title: 'Нет опубликованных OTA-клиентов',
              details: `Папка обновлений: ${updateClients.root}`,
            }]
          : []),
        ...(stalePushTokens > 0
          ? [{
              level: 'warning',
              title: 'Есть старые Expo push-токены',
              details: `${stalePushTokens} токенов не обновлялись больше 30 дней`,
            }]
          : []),
        ...(telemetry.errors1h > 0
          ? [{
              level: 'critical',
              title: 'Ошибки мобильных клиентов',
              details: `${telemetry.errors1h} ошибок за последний час`,
            }]
          : []),
        ...(telemetry.avgApiLatencyMs != null && telemetry.avgApiLatencyMs > 1200
          ? [{
              level: 'warning',
              title: 'Высокая задержка API',
              details: `Средняя задержка API за час: ${telemetry.avgApiLatencyMs} мс`,
            }]
          : []),
      ],
    };
    logRequest('summary ok', _req, {
      telemetryEvents: telemetry.events24h,
      ingestAccepted: ingestStats.accepted,
      ingestAttempts: ingestStats.attempts,
    });
    return res.json(payload);
  } catch (error) {
    logRequest('summary failed', _req, { error: error?.message || 'unknown' });
    console.error('[mobile-diagnostics] summary failed:', error);
    return res.status(500).json({ error: 'Не удалось собрать диагностику мобильных приложений' });
  }
});

router.get('/mobile-diagnostics/history', auth, requireInternalAdmin, async (req, res) => {
  try {
    await ensureMobileDiagnosticTable();
    const days = Math.min(Math.max(Number.parseInt(String(req.query.days || '7'), 10) || 7, 1), 30);
    const bucket = String(req.query.bucket || (days <= 2 ? 'hour' : 'day')) === 'hour' ? 'hour' : 'day';
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const events = await MobileDiagnosticEvent.findAll({
      where: telemetryWhere(from, to),
      order: [['occurredAt', 'ASC']],
      limit: 20000,
    });

    const payload = {
      generatedAt: new Date().toISOString(),
      range: { from: from.toISOString(), to: to.toISOString(), days, bucket },
      buckets: buildHistory(events, bucket),
      compare: comparePeriods(events),
    };
    logRequest('history ok', req, {
      days,
      bucket,
      events: events.length,
      buckets: payload.buckets.length,
    });
    return res.json(payload);
  } catch (error) {
    logRequest('history failed', req, { error: error?.message || 'unknown' });
    console.error('[mobile-diagnostics] history failed:', error);
    return res.status(500).json({ error: 'Не удалось собрать историю мобильных метрик' });
  }
});

router.get('/mobile-diagnostics/export', auth, requireInternalAdmin, async (req, res) => {
  try {
    await ensureMobileDiagnosticTable();
    const days = Math.min(Math.max(Number.parseInt(String(req.query.days || '7'), 10) || 7, 1), 30);
    const bucket = String(req.query.bucket || (days <= 2 ? 'hour' : 'day')) === 'hour' ? 'hour' : 'day';
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || '50000'), 10) || 50000, 1000), 100000);
    const minDiagVersion = Math.min(Math.max(Number.parseInt(String(req.query.minDiagVersion || '0'), 10) || 0, 0), 20);
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const loadedEvents = await MobileDiagnosticEvent.findAll({
      where: telemetryWhere(from, to),
      order: [['occurredAt', 'ASC']],
      limit,
    });
    const events = minDiagVersion > 0
      ? loadedEvents.filter((event) => hasDiagnosticsVersionAtLeast(event.toJSON ? event.toJSON() : event, minDiagVersion))
      : loadedEvents;
    const apiExport = buildPeriodApiExport(events);
    const payload = {
      generatedAt: new Date().toISOString(),
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
        days,
        bucket,
        limit,
        loadedEvents: loadedEvents.length,
        returnedEvents: events.length,
        minDiagVersion: minDiagVersion || null,
      },
      totals: {
        events: events.length,
        apps: apiExport.byApp.length,
        slowApiEndpoints: apiExport.slowApiEndpoints.length,
        issues: apiExport.issues.length,
        socketEvents: apiExport.socketEvents.length,
      },
      byApp: apiExport.byApp,
      slowApiEndpoints: apiExport.slowApiEndpoints.slice(0, 200),
      history: buildHistory(events, bucket),
      compare: comparePeriods(events),
      issues: apiExport.issues,
      socketEvents: apiExport.socketEvents,
      notes: [
        'slowApiEndpoints агрегированы за весь выбранный период, а не только за последний час.',
        'minDiagVersion фильтрует события по state.diagnosticsSchemaVersion.',
        'Client latency - полное время на мобильном устройстве.',
        'Server duration - время backend handler из x-api-duration-ms.',
        'Overhead - client latency минус server duration.',
        'Queue wait - ожидание клиентского лимитера безопасных API-запросов.',
        'Diag 6 добавляет networkTypes, appStates, cellularGenerations, carriers и net flags для отличия backend тормозов от проблем сети/VPN.',
        'Diag 7 добавляет socketEvents: reason, transport, reconnect duration, connect errors и fallback details.',
        'Diag 8 добавляет apiBackgroundedDuringRequest и socketBackgroundedDuringDisconnect, чтобы отделять реальные задержки от сна/background телефона.',
      ],
    };

    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader(
      'content-disposition',
      `attachment; filename="mobile-diagnostics-${days}d-${new Date().toISOString().slice(0, 10)}.json"`
    );
    logRequest('export ok', req, {
      days,
      bucket,
      minDiagVersion,
      loadedEvents: loadedEvents.length,
      events: events.length,
      endpoints: payload.slowApiEndpoints.length,
    });
    return res.send(JSON.stringify(payload, null, 2));
  } catch (error) {
    logRequest('export failed', req, { error: error?.message || 'unknown' });
    console.error('[mobile-diagnostics] export failed:', error);
    return res.status(500).json({ error: 'Не удалось выгрузить мобильную диагностику' });
  }
});

module.exports = router;

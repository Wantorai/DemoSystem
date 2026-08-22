'use strict';

const DEFAULT_SLOW_THRESHOLD_MS = 1200;
const MAX_RECENT = 120;
const MAX_ENDPOINTS = 200;
const API_PERFORMANCE_LOGS = String(process.env.API_PERFORMANCE_LOGS || '').trim().toLowerCase() === 'true';
const apiPerformanceLog = (...args) => {
  if (API_PERFORMANCE_LOGS) console.log(...args);
};

const slowThresholdMs = Number.parseInt(
  String(process.env.API_PERFORMANCE_SLOW_THRESHOLD_MS || DEFAULT_SLOW_THRESHOLD_MS),
  10
) || DEFAULT_SLOW_THRESHOLD_MS;

const endpointStats = new Map();
const recentSlowRequests = [];

const safeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

const normalizePath = (rawPath) => String(rawPath || '')
  .split('?')[0]
  .replace(/\/\d+(?=\/|$)/g, '/:id')
  .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, '/:uuid');

const clientSourceFromUserAgent = (userAgent) => {
  const value = String(userAgent || '');
  if (/okhttp|expo|reactnative|android|iphone|ipad/i.test(value)) return 'mobile';
  if (/mozilla|chrome|safari|firefox|edge/i.test(value)) return 'web';
  if (!value) return 'unknown';
  return 'other';
};

const shouldTrack = (req) => {
  if (!String(req.originalUrl || req.url || '').startsWith('/api/')) return false;
  const path = normalizePath(req.originalUrl || req.url || '');
  if (path.startsWith('/api/mobile-diagnostics/summary')) return false;
  if (path.startsWith('/api/mobile-diagnostics/history')) return false;
  return true;
};

const recordApiRequest = ({ method, path, statusCode, durationMs, userId, userAgent }) => {
  if (durationMs == null || durationMs < slowThresholdMs) return null;
  const endpoint = `${method} ${path}`;
  const clientSource = clientSourceFromUserAgent(userAgent);
  const row = endpointStats.get(endpoint) || {
    method,
    path,
    count: 0,
    statuses: new Set(),
    users: new Set(),
    sources: new Map(),
    userAgents: new Map(),
    latencies: [],
    lastSeenAt: null,
  };

  row.count += 1;
  row.latencies.push(durationMs);
  if (row.latencies.length > 300) row.latencies.shift();
  if (statusCode) row.statuses.add(statusCode);
  if (userId) row.users.add(userId);
  row.sources.set(clientSource, (row.sources.get(clientSource) || 0) + 1);
  const userAgentText = String(userAgent || '').slice(0, 120) || 'unknown';
  row.userAgents.set(userAgentText, (row.userAgents.get(userAgentText) || 0) + 1);
  row.lastSeenAt = new Date().toISOString();
  endpointStats.set(endpoint, row);

  if (endpointStats.size > MAX_ENDPOINTS) {
    const oldestKey = endpointStats.keys().next().value;
    if (oldestKey) endpointStats.delete(oldestKey);
  }

  const recent = {
    at: row.lastSeenAt,
    method,
    path,
    statusCode,
    durationMs,
    userId: userId || null,
    clientSource,
    userAgent: String(userAgent || '').slice(0, 120),
  };
  recentSlowRequests.unshift(recent);
  if (recentSlowRequests.length > MAX_RECENT) recentSlowRequests.pop();
  return recent;
};

const apiPerformanceMiddleware = (req, res, next) => {
  if (!shouldTrack(req)) return next();
  const startedAt = process.hrtime.bigint();
  const durationMs = () => Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);
  const originalWriteHead = res.writeHead;
  res.writeHead = function writeHeadWithDuration(...args) {
    if (!res.headersSent) {
      res.setHeader('x-api-duration-ms', String(durationMs()));
    }
    return originalWriteHead.apply(this, args);
  };
  res.on('finish', () => {
    const finishedDurationMs = durationMs();
    const path = normalizePath(req.originalUrl || req.url || '');
    const recent = recordApiRequest({
      method: req.method,
      path,
      statusCode: res.statusCode,
      durationMs: finishedDurationMs,
      userId: req.user?.id || null,
      userAgent: req.headers['user-agent'],
    });
    if (recent) {
      apiPerformanceLog('[ApiPerformance][slow]', {
        method: recent.method,
        path: recent.path,
        statusCode: recent.statusCode,
        durationMs: recent.durationMs,
        userId: recent.userId,
        clientSource: recent.clientSource,
      });
    }
  });
  return next();
};

const getApiPerformanceSnapshot = () => ({
  slowThresholdMs,
  endpoints: Array.from(endpointStats.values())
    .map((row) => ({
      method: row.method,
      path: row.path,
      count: row.count,
      avgLatencyMs: average(row.latencies),
      p95LatencyMs: percentile(row.latencies, 95),
      maxLatencyMs: row.latencies.length ? Math.max(...row.latencies) : null,
      statuses: Array.from(row.statuses).sort((a, b) => a - b),
      users: row.users.size,
      sources: Array.from(row.sources.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count),
      topUserAgents: Array.from(row.userAgents.entries())
        .map(([userAgent, count]) => ({ userAgent, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
      lastSeenAt: row.lastSeenAt,
    }))
    .sort((a, b) =>
      (b.p95LatencyMs || 0) - (a.p95LatencyMs || 0) ||
      (b.avgLatencyMs || 0) - (a.avgLatencyMs || 0) ||
      b.count - a.count
    )
    .slice(0, 30),
  recent: recentSlowRequests.slice(0, 30),
});

module.exports = {
  apiPerformanceMiddleware,
  getApiPerformanceSnapshot,
};

'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const { performance } = require('node:perf_hooks');
const context = new AsyncLocalStorage();
const startedAt = new Date().toISOString();
const slow = [], baseline = [], lastBaseline = new Map();
const pending = new WeakMap();
let readPool = () => null;
const round = n => Math.round(n * 100) / 100;
function install(sequelize) {
  readPool = () => {
    const pool = sequelize.connectionManager?.pool;
    if (!pool) return null;
    return Object.fromEntries(['size', 'available', 'using', 'waiting'].map(key => [key, Number.isFinite(pool[key]) ? pool[key] : null]));
  };
  sequelize.addHook('beforePoolAcquire', 'targeted-pauses', options => {
    const trace = context.getStore();
    if (trace && !trace.finished) pending.set(options, { trace, start: performance.now() });
  });
  sequelize.addHook('afterPoolAcquire', 'targeted-pauses', (_connection, options) => {
    const entry = pending.get(options);
    if (!entry) return;
    pending.delete(options);
    if (entry.trace.finished) return;
    entry.trace.poolAcquires++;
    entry.trace.poolAcquireMs += performance.now() - entry.start;
  });
}
function run(req, res, next) {
  const path = String(req.originalUrl || req.url || '').split('?')[0].replace(/\/+$/, '');
  if (req.method !== 'GET' || !['/api/user-settings/auto-reply', '/api/chat-pins'].includes(path)) return next();
  const start = performance.now(), cpu = process.cpuUsage(), elu = performance.eventLoopUtilization();
  const trace = { phases: [], poolAcquires: 0, poolAcquireMs: 0, sqlCount: 0, sqlMs: 0, finished: false };
  const poolBefore = readPool();
  const complete = outcome => {
    if (trace.finished) return;
    trace.finished = true;
    const durationMs = round(performance.now() - start);
    const usage = process.cpuUsage(cpu);
    const row = { at: new Date().toISOString(), path, statusCode: res.statusCode, outcome, durationMs,
      phases: trace.phases, sqlCount: trace.sqlCount, sqlMs: round(trace.sqlMs),
      poolAcquires: trace.poolAcquires, poolAcquireMs: round(trace.poolAcquireMs), poolBefore, poolAfter: readPool(),
      processCpuMs: round((usage.user + usage.system) / 1000),
      eventLoopUtilization: round(performance.eventLoopUtilization(elu).utilization),
      rssMb: round(process.memoryUsage().rss / 1048576) };
    if (durationMs >= 1200 || outcome !== 'finish' || res.statusCode >= 500) {
      slow.push(row); if (slow.length > 120) slow.shift();
    } else if (Date.now() - (lastBaseline.get(path) || 0) >= 60000) {
      lastBaseline.set(path, Date.now()); baseline.push(row); if (baseline.length > 30) baseline.shift();
    }
  };
  res.once('finish', () => complete('finish'));
  res.once('close', () => complete('close'));
  return context.run(trace, next);
}
async function phase(name, work) {
  const trace = context.getStore();
  if (!trace || trace.finished) return work();
  const start = performance.now();
  try { return await work(); }
  finally { if (!trace.finished) trace.phases.push({ name, durationMs: round(performance.now() - start) }); }
}
function queryOptions() {
  const trace = context.getStore();
  if (!trace || trace.finished) return {};
  return { benchmark: true, logging: (_sql, ms) => {
    if (!trace.finished && Number.isFinite(ms)) { trace.sqlCount++; trace.sqlMs += ms; }
  } };
}
function snapshot(from = 0, to = Date.now()) {
  const inRange = row => Date.parse(row.at) >= Number(from) && Date.parse(row.at) <= Number(to);
  return { version: 1, pid: process.pid, startedAt, slowThresholdMs: 1200,
    retention: 'This process only, reset on restart; latest 120 slow/error/closed requests and 30 baseline samples (at most one per endpoint per minute). Not full-period statistics.',
    interpretation: 'Phase times overlap SQL and pool acquisition: do not add them. Pool time covers successful acquisitions only, including connection creation; SQL time includes DB execution and transport. CPU/ELU are process-wide during the request, including concurrent work; not host CPU. No SQL text, parameters, tokens or message content are stored.',
    slow: slow.filter(inRange), baseline: baseline.filter(inRange) };
}
module.exports = { install, run, phase, queryOptions, snapshot };

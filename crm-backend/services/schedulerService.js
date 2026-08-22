const { Op } = require('sequelize');
const { spawn } = require('child_process');
const db = require('../models');

const ScheduledJob = db.sequelize.models.ScheduledJob;
const ScheduledJobRun = db.sequelize.models.ScheduledJobRun;

const DEFAULT_TZ = process.env.SCHEDULER_TIMEZONE || 'Europe/Moscow';
const DEFAULT_VOICE_RETENTION_DAYS = 60;
const DEFAULT_UPLOADS_RETENTION_DAYS = 60;
const DEFAULT_BACKUP_RETENTION_DAYS = 30;
const DEFAULT_MOBILE_UPDATES_KEEP_RELEASES = 5;

const JOB_PRESETS = [
  {
    code: 'clean_logs_weekly',
    title: 'Очистка логов (воскресенье 02:00)',
    description: 'Запуск workers/cleanup-old-order-logs.js',
    command: 'node /home/nodeapp/crm-backend/workers/cleanup-old-order-logs.js',
    minute: 0,
    hour: 2,
    daysOfWeek: '0',
    isEnabled: true,
    timezone: DEFAULT_TZ,
  },
  {
    code: 'clean_voice_daily',
    title: 'Очистка старых голосовых (ежедневно 05:00)',
    description: 'Запуск workers/cleanup-old-voice-messages.js (scope=voice)',
    command: `CLEANUP_SCOPE='voice' node /home/nodeapp/crm-backend/workers/cleanup-old-voice-messages.js`,
    minute: 0,
    hour: 5,
    daysOfWeek: '*',
    isEnabled: true,
    timezone: DEFAULT_TZ,
    retentionDays: DEFAULT_VOICE_RETENTION_DAYS,
  },
  {
    code: 'clean_uploads_daily',
    title: 'Очистка старых файлов uploads (ежедневно 05:30)',
    description: 'Запуск workers/cleanup-old-voice-messages.js (scope=uploads)',
    command: `CLEANUP_SCOPE='uploads' node /home/nodeapp/crm-backend/workers/cleanup-old-voice-messages.js`,
    minute: 30,
    hour: 5,
    daysOfWeek: '*',
    isEnabled: true,
    timezone: DEFAULT_TZ,
    retentionDays: DEFAULT_UPLOADS_RETENTION_DAYS,
  },
  {
    code: 'clean_boss_messages_daily',
    title: 'Очистка истории boss-чатов (ежедневно 06:00)',
    description: 'Запуск workers/cleanup-old-boss-messages.js (по retentionDays каждого чата)',
    command: `node /home/nodeapp/crm-backend/workers/cleanup-old-boss-messages.js`,
    minute: 0,
    hour: 6,
    daysOfWeek: '*',
    isEnabled: true,
    timezone: DEFAULT_TZ,
  },
  {
    code: 'clean_mobile_updates_daily',
    title: 'Очистка старых mobile-updates (ежедневно 06:30)',
    description: 'Запуск workers/cleanup-mobile-updates.js (хранит последние релизы приложения)',
    command: `node /home/nodeapp/crm-backend/workers/cleanup-mobile-updates.js`,
    minute: 30,
    hour: 6,
    daysOfWeek: '*',
    isEnabled: true,
    timezone: DEFAULT_TZ,
    retentionDays: DEFAULT_MOBILE_UPDATES_KEEP_RELEASES,
  },
  {
    code: 'backup_pgsql_morning',
    title: 'Бэкап БД+файлов (будни 08:00)',
    description: 'Скрипт backup_pgsql.sh (утро)',
    command: '/home/nodeapp/backup_pgsql.sh',
    minute: 0,
    hour: 8,
    daysOfWeek: '1,2,3,4,5',
    isEnabled: true,
    timezone: DEFAULT_TZ,
    retentionDays: DEFAULT_BACKUP_RETENTION_DAYS,
  },
  {
    code: 'backup_pgsql_evening',
    title: 'Бэкап БД+файлов (будни 20:00)',
    description: 'Скрипт backup_pgsql.sh (вечер)',
    command: '/home/nodeapp/backup_pgsql.sh',
    minute: 0,
    hour: 20,
    daysOfWeek: '1,2,3,4,5',
    isEnabled: true,
    timezone: DEFAULT_TZ,
    retentionDays: DEFAULT_BACKUP_RETENTION_DAYS,
  },
  {
    code: 'backup_template_daily',
    title: 'Бэкап шаблонов БД (ежедневно 04:00)',
    description: 'Скрипт backup_template_pgsql.sh',
    command: '/home/nodeapp/backup_template_pgsql.sh',
    minute: 0,
    hour: 4,
    daysOfWeek: '*',
    isEnabled: true,
    timezone: DEFAULT_TZ,
    retentionDays: DEFAULT_BACKUP_RETENTION_DAYS,
  },
];

function normalizeRetentionDays(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

function buildRetentionEnvPrefix(job) {
  const retentionDays = normalizeRetentionDays(job?.retentionDays);
  if (retentionDays == null) return '';
  if (job?.code === 'clean_voice_daily' || job?.code === 'clean_uploads_daily') {
    return `CLEANUP_AGE_INTERVAL='${retentionDays} days' `;
  }
  if (job?.code === 'clean_mobile_updates_daily') {
    const keepReleases = Math.max(1, retentionDays || DEFAULT_MOBILE_UPDATES_KEEP_RELEASES);
    return `MOBILE_UPDATES_KEEP_RELEASES='${keepReleases}' `;
  }
  if (String(job?.code || '').startsWith('backup_')) {
    return `BACKUP_RETENTION_DAYS='${retentionDays}' BACKUP_KEEP_DAYS='${retentionDays}' BACKUP_DAYS_TO_KEEP='${retentionDays}' `;
  }
  return '';
}

function parseDaysOfWeek(raw) {
  const value = String(raw || '*').trim();
  if (!value || value === '*') return null;
  const set = new Set();
  for (const partRaw of value.split(',')) {
    const part = String(partRaw || '').trim();
    if (!part) continue;
    if (part.includes('-')) {
      const [fromRaw, toRaw] = part.split('-');
      const from = Number(fromRaw);
      const to = Number(toRaw);
      if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
      const start = Math.max(0, Math.min(6, from));
      const end = Math.max(0, Math.min(6, to));
      const step = start <= end ? 1 : -1;
      for (let i = start; step > 0 ? i <= end : i >= end; i += step) set.add(i);
      continue;
    }
    const n = Number(part);
    if (Number.isFinite(n) && n >= 0 && n <= 6) set.add(n);
  }
  return set.size ? set : null;
}

function normalizeSchedule(input = {}) {
  const minute = Math.max(0, Math.min(59, Number(input.minute ?? 0) || 0));
  const hour = Math.max(0, Math.min(23, Number(input.hour ?? 0) || 0));
  const daysOfWeek = String(input.daysOfWeek ?? '*').trim() || '*';
  const timezone = String(input.timezone || DEFAULT_TZ).trim() || DEFAULT_TZ;
  return { minute, hour, daysOfWeek, timezone };
}

function computeNextRunAt({ minute, hour, daysOfWeek }, fromDate = new Date()) {
  const days = parseDaysOfWeek(daysOfWeek);
  const cursor = new Date(fromDate.getTime() + 60 * 1000);
  cursor.setSeconds(0, 0);

  for (let i = 0; i < 60 * 24 * 14; i += 1) {
    if (cursor.getMinutes() === minute && cursor.getHours() === hour) {
      const dow = cursor.getDay();
      if (!days || days.has(dow)) return new Date(cursor);
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return null;
}

function trimOutput(text, limit = 12000) {
  const value = String(text || '');
  if (value.length <= limit) return value;
  return value.slice(value.length - limit);
}

async function ensureSchedulerTables() {
  // Таблицы создаются только миграциями sequelize-cli.
  return;
}

async function ensureSchedulerSeed() {
  for (const item of JOB_PRESETS) {
    const schedule = normalizeSchedule(item);
    const nextRunAt = computeNextRunAt(schedule, new Date());
    const existing = await ScheduledJob.findOne({ where: { code: item.code } });
    if (existing) {
      const presetRetentionDays = normalizeRetentionDays(item.retentionDays);
      const patch = {};
      if (existing.retentionDays == null && presetRetentionDays != null) {
        patch.retentionDays = presetRetentionDays;
      }
      // Keep critical cleanup commands aligned with one-shot worker script.
      if (
        existing.code === 'clean_logs_weekly' ||
        existing.code === 'clean_voice_daily' ||
        existing.code === 'clean_uploads_daily' ||
        existing.code === 'clean_boss_messages_daily' ||
        existing.code === 'clean_mobile_updates_daily'
      ) {
        if (String(existing.command || '').trim() !== String(item.command || '').trim()) {
          patch.command = item.command;
        }
        if (String(existing.description || '').trim() !== String(item.description || '').trim()) {
          patch.description = item.description;
        }
      }
      if (Object.keys(patch).length > 0) {
        await existing.update(patch);
      }
      continue;
    }
    await ScheduledJob.create({
      ...item,
      ...schedule,
      nextRunAt,
      lastStatus: 'idle',
      retentionDays: normalizeRetentionDays(item.retentionDays),
    });
  }
}

function runShellCommand(command) {
  return new Promise((resolve) => {
    const child = spawn('/bin/bash', ['-lc', command], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      resolve({
        exitCode: Number.isFinite(code) ? code : null,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        success: Number(code) === 0,
      });
    });

    child.on('error', (err) => {
      resolve({
        exitCode: null,
        stdout: trimOutput(stdout),
        stderr: trimOutput(`${stderr}\n${err?.message || err}`),
        success: false,
      });
    });
  });
}

async function executeScheduledJob(job, trigger = 'schedule') {
  const startedAt = new Date();
  const run = await ScheduledJobRun.create({
    jobId: Number(job.id),
    startedAt,
    status: 'running',
  });

  await job.update({
    lastRunAt: startedAt,
    lastStatus: 'running',
    lastMessage: `Запуск (${trigger})`,
  });

  const t0 = Date.now();
  const command = `${buildRetentionEnvPrefix(job)}${String(job.command || '')}`.trim();
  const result = await runShellCommand(command);
  const durationMs = Date.now() - t0;
  const finishedAt = new Date();
  const isSuccess = Boolean(result.success);

  await run.update({
    finishedAt,
    durationMs,
    status: isSuccess ? 'success' : 'failed',
    output: result.stdout || null,
    error: result.stderr || null,
    exitCode: result.exitCode,
  });

  const schedule = normalizeSchedule(job);
  const nextRunAt = computeNextRunAt(schedule, finishedAt);
  await job.update({
    lastStatus: isSuccess ? 'success' : 'failed',
    lastSuccessAt: isSuccess ? finishedAt : job.lastSuccessAt,
    lastMessage: isSuccess ? 'Успешно' : `Ошибка: ${trimOutput(result.stderr || 'unknown error', 500)}`,
    lastDurationMs: durationMs,
    nextRunAt,
  });

  return { runId: Number(run.id), success: isSuccess, durationMs, exitCode: result.exitCode };
}

async function listSchedulerJobs() {
  return ScheduledJob.findAll({ order: [['title', 'ASC']] });
}

async function listSchedulerRuns(jobId, limit = 50) {
  return ScheduledJobRun.findAll({
    where: { jobId: Number(jobId) },
    order: [['startedAt', 'DESC']],
    limit: Math.max(1, Math.min(200, Number(limit) || 50)),
  });
}

async function updateSchedulerJob(jobId, patch = {}) {
  const job = await ScheduledJob.findByPk(Number(jobId));
  if (!job) return null;

  const next = {
    title: patch.title != null ? String(patch.title).trim() : job.title,
    description: patch.description != null ? String(patch.description) : job.description,
    command: patch.command != null ? String(patch.command).trim() : job.command,
    retentionDays: Object.prototype.hasOwnProperty.call(patch, 'retentionDays')
      ? normalizeRetentionDays(patch.retentionDays)
      : job.retentionDays,
    isEnabled: patch.isEnabled != null ? Boolean(patch.isEnabled) : job.isEnabled,
    ...normalizeSchedule({
      minute: patch.minute != null ? patch.minute : job.minute,
      hour: patch.hour != null ? patch.hour : job.hour,
      daysOfWeek: patch.daysOfWeek != null ? patch.daysOfWeek : job.daysOfWeek,
      timezone: patch.timezone != null ? patch.timezone : job.timezone,
    }),
  };

  next.nextRunAt = next.isEnabled ? computeNextRunAt(next, new Date()) : null;

  await job.update(next);
  return job;
}

async function runSchedulerJobNow(jobId) {
  const job = await ScheduledJob.findByPk(Number(jobId));
  if (!job) return null;
  return executeScheduledJob(job, 'manual');
}

async function processDueSchedulerJobs(limit = 5) {
  const now = new Date();
  const jobs = await ScheduledJob.findAll({
    where: {
      isEnabled: true,
      nextRunAt: { [Op.lte]: now },
      lastStatus: { [Op.ne]: 'running' },
    },
    order: [['nextRunAt', 'ASC']],
    limit: Math.max(1, Math.min(20, Number(limit) || 5)),
  });

  let processed = 0;
  for (const job of jobs) {
    processed += 1;
    await executeScheduledJob(job, 'schedule');
  }

  return { processed };
}

module.exports = {
  ensureSchedulerTables,
  ensureSchedulerSeed,
  listSchedulerJobs,
  listSchedulerRuns,
  updateSchedulerJob,
  runSchedulerJobNow,
  processDueSchedulerJobs,
};


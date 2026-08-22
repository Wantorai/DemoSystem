const {
  listSchedulerJobs,
  listSchedulerRuns,
  updateSchedulerJob,
  runSchedulerJobNow,
} = require('../services/schedulerService');

function parseAdminRoleIds() {
  const rawAdmin = String(process.env.ADMIN_ROLE_IDS || '').trim();
  const rawSuper = String(process.env.SUPER_ADMIN_ROLE_IDS || '').trim();
  const merged = [rawAdmin, rawSuper].filter(Boolean).join(',');
  if (!merged) return [2, 1];
  const ids = merged
    .split(',')
    .map((v) => Number(String(v).trim()))
    .filter((v, idx, arr) => Number.isFinite(v) && v > 0 && arr.indexOf(v) === idx);
  return ids.length ? ids : [2, 1];
}

function parseAdminUserIds() {
  const rawSuper = String(process.env.SUPER_ADMIN_USER_IDS || '').trim();
  const rawAdmin = String(process.env.ADMIN_USER_IDS || '').trim();
  const merged = [rawSuper, rawAdmin].filter(Boolean).join(',');
  if (!merged) return [1];
  const ids = merged
    .split(',')
    .map((v) => Number(String(v).trim()))
    .filter((v, idx, arr) => Number.isFinite(v) && v > 0 && arr.indexOf(v) === idx);
  return ids.length ? ids : [1];
}

function ensureAdmin(req, res) {
  const userId = Number(req?.user?.id || 0);
  const userRoleId = Number(req?.user?.roleId || 0);
  const allowedRoles = parseAdminRoleIds();
  const allowedUserIds = parseAdminUserIds();
  const allowed = allowedRoles.includes(userRoleId) || allowedUserIds.includes(userId);
  if (!allowed) {
    res.status(403).json({
      error: 'Недостаточно прав',
      debug: {
        userId,
        userRoleId,
        allowedRoles,
        allowedUserIds,
      },
    });
    return false;
  }
  return true;
}

async function getJobs(req, res) {
  try {
    if (!ensureAdmin(req, res)) return;
    const rows = await listSchedulerJobs();
    res.json(rows);
  } catch (err) {
    console.error('[scheduler][getJobs] error:', err);
    res.status(500).json({ error: 'Ошибка получения задач' });
  }
}

async function patchJob(req, res) {
  try {
    if (!ensureAdmin(req, res)) return;
    const jobId = Number(req.params.jobId);
    if (!jobId) return res.status(400).json({ error: 'Некорректный jobId' });
    const updated = await updateSchedulerJob(jobId, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Задача не найдена' });
    res.json(updated);
  } catch (err) {
    console.error('[scheduler][patchJob] error:', err);
    res.status(500).json({ error: 'Ошибка обновления задачи' });
  }
}

async function runJobNow(req, res) {
  try {
    if (!ensureAdmin(req, res)) return;
    const jobId = Number(req.params.jobId);
    if (!jobId) return res.status(400).json({ error: 'Некорректный jobId' });
    const result = await runSchedulerJobNow(jobId);
    if (!result) return res.status(404).json({ error: 'Задача не найдена' });
    res.json({ ok: true, result });
  } catch (err) {
    console.error('[scheduler][runJobNow] error:', err);
    res.status(500).json({ error: 'Ошибка запуска задачи' });
  }
}

async function getJobRuns(req, res) {
  try {
    if (!ensureAdmin(req, res)) return;
    const jobId = Number(req.params.jobId);
    if (!jobId) return res.status(400).json({ error: 'Некорректный jobId' });
    const limit = Number(req.query.limit || 50);
    const rows = await listSchedulerRuns(jobId, limit);
    res.json(rows);
  } catch (err) {
    console.error('[scheduler][getJobRuns] error:', err);
    res.status(500).json({ error: 'Ошибка получения истории запусков' });
  }
}

module.exports = {
  getJobs,
  patchJob,
  runJobNow,
  getJobRuns,
};




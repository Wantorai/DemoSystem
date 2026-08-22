'use strict';

const { processDueSchedulerJobs } = require('../services/schedulerService');

let started = false;
let timer = null;

function startSchedulerWorker(options = {}) {
  if (started) return;
  started = true;

  const intervalMs = Number(options.intervalMs || process.env.SCHEDULER_WORKER_MS || 30000);
  const limit = Number(options.limit || process.env.SCHEDULER_WORKER_LIMIT || 5);

  const tick = async () => {
    try {
      const result = await processDueSchedulerJobs(limit);
      if (result?.processed > 0) {
        console.log(`[scheduler-worker] processed=${result.processed}`);
      }
    } catch (err) {
      console.error('[scheduler-worker] tick error:', err);
    }
  };

  timer = setInterval(() => {
    tick().catch(() => {});
  }, intervalMs);

  tick().catch(() => {});
  console.log(`[scheduler-worker] started interval=${intervalMs}ms limit=${limit}`);
}

function stopSchedulerWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

module.exports = {
  startSchedulerWorker,
  stopSchedulerWorker,
};

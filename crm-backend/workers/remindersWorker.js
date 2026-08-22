const { processDueReminders } = require('../services/reminderDispatcher');

let started = false;
let timer = null;

function startRemindersWorker(options = {}) {
  if (started) return;
  started = true;

  const intervalMs = Number(options.intervalMs || process.env.REMINDERS_WORKER_MS || 5000);
  const limit = Number(options.limit || process.env.REMINDERS_WORKER_LIMIT || 20);

  const tick = async () => {
    try {
      const result = await processDueReminders(limit);
      if (result && result.processed > 0) {
        console.log(`[reminders-worker] processed=${result.processed}`);
      }
    } catch (err) {
      console.error('[reminders-worker] tick error:', err);
    }
  };

  timer = setInterval(() => {
    tick().catch(() => {});
  }, intervalMs);

  tick().catch(() => {});
  console.log(`[reminders-worker] started interval=${intervalMs}ms limit=${limit}`);
}

function stopRemindersWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

module.exports = {
  startRemindersWorker,
  stopRemindersWorker,
};


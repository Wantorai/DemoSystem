const { processDueAlerts } = require('../services/alertDispatcher');

let started = false;
let timer = null;

function startAlertsWorker(options = {}) {
  if (started) return;
  started = true;

  const intervalMs = Number(options.intervalMs || process.env.ALERTS_WORKER_MS || 5000);
  const limit = Number(options.limit || process.env.ALERTS_WORKER_LIMIT || 20);

  const tick = async () => {
    try {
      const result = await processDueAlerts(limit);
      if (result && result.processed > 0) {
        console.log(`[alerts-worker] processed=${result.processed}`);
      }
    } catch (err) {
      console.error('[alerts-worker] tick error:', err);
    }
  };

  timer = setInterval(() => {
    tick().catch(() => {});
  }, intervalMs);

  tick().catch(() => {});
  console.log(`[alerts-worker] started interval=${intervalMs}ms limit=${limit}`);
}

function stopAlertsWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

module.exports = {
  startAlertsWorker,
  stopAlertsWorker,
};


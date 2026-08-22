'use strict';

const { processPendingScans } = require('../services/fileSpaceAntivirusService');

let started = false;
let running = false;

const startFileSpaceAntivirusWorker = (options = {}) => {
  if (started) return;
  started = true;
  const intervalMs = Math.max(Number(options.intervalMs || process.env.FILESPACE_AV_WORKER_MS || 15000), 5000);
  const limit = Math.max(Number(options.limit || process.env.FILESPACE_AV_WORKER_LIMIT || 2), 1);
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await processPendingScans(limit);
      if (result.processed) console.log(`[filespace:av] processed=${result.processed}`);
    } catch (error) { console.error('[filespace:av] worker error:', error); }
    finally { running = false; }
  };
  setInterval(() => tick().catch(() => {}), intervalMs);
  tick().catch(() => {});
  console.log(`[filespace:av] worker started interval=${intervalMs}ms limit=${limit}`);
};

module.exports = { startFileSpaceAntivirusWorker };

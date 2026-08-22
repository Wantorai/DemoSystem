'use strict';

const { processDueScheduledMessages } = require('../services/scheduledMessageDispatcher');

let started = false;
let timer = null;

function startScheduledMessagesWorker(options = {}) {
  if (started) return;
  started = true;

  const intervalMs = Number(options.intervalMs || process.env.SCHEDULED_MESSAGES_WORKER_MS || 5000);
  const limit = Number(options.limit || process.env.SCHEDULED_MESSAGES_WORKER_LIMIT || 20);

  const tick = async () => {
    try {
      const result = await processDueScheduledMessages(limit);
      if (result && result.processed > 0) {
        console.log(`[scheduled-worker] processed=${result.processed}`);
      }
    } catch (err) {
      console.error('[scheduled-worker] tick error:', err);
    }
  };

  timer = setInterval(() => {
    tick().catch(() => {});
  }, intervalMs);

  tick().catch(() => {});
  console.log(`[scheduled-worker] started interval=${intervalMs}ms limit=${limit}`);
}

function stopScheduledMessagesWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

module.exports = {
  startScheduledMessagesWorker,
  stopScheduledMessagesWorker,
};


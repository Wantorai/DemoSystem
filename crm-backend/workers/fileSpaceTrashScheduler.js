const cron = require('node-cron');
const { purgeExpiredFileSpaceTrash } = require('../services/fileSpaceTrashCleanupService');

const startFileSpaceTrashScheduler = () => cron.schedule('15 3 * * *', async () => {
  try {
    const result = await purgeExpiredFileSpaceTrash();
    if (result.files || result.folders || result.auditEntries || result.syncEvents || result.incompleteVersions) console.log('[filespace:cleanup] completed', result);
  } catch (error) {
    console.error('[filespace:cleanup] failed:', error);
  }
}, { noOverlap: true });

module.exports = { startFileSpaceTrashScheduler };

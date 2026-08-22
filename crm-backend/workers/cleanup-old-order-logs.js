// workers/cleanup-old-order-logs.js
require('dotenv').config();
const { Op } = require('sequelize');
const { OrderLog } = require('../models');

function parseRetentionMonths(input) {
  if (input == null || input === '') return 36;
  const n = Number(input);
  if (!Number.isFinite(n)) return 36;
  return Math.max(0, Math.floor(n));
}

async function main() {
  const retentionMonths = parseRetentionMonths(process.env.LOGS_RETENTION_MONTHS);
  const thresholdDate = new Date();
  thresholdDate.setMonth(thresholdDate.getMonth() - retentionMonths);

  console.log('[cleanup-order-logs] start', {
    ts: new Date().toISOString(),
    retentionMonths,
    thresholdDate: thresholdDate.toISOString(),
  });

  const matchedCount = await OrderLog.count({
    where: {
      timestamp: {
        [Op.lt]: thresholdDate,
      },
    },
  });

  const deletedCount = await OrderLog.destroy({
    where: {
      timestamp: {
        [Op.lt]: thresholdDate,
      },
    },
  });

  console.log('[cleanup-order-logs] done', {
    ts: new Date().toISOString(),
    matchedCount,
    deletedCount,
  });

  console.log(
    '[cleanup-order-logs][summary]',
    JSON.stringify({
      ts: new Date().toISOString(),
      retentionMonths,
      thresholdDate: thresholdDate.toISOString(),
      matchedCount,
      deletedCount,
      noOp: deletedCount === 0,
    })
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[cleanup-order-logs] error', error);
    process.exit(1);
  });

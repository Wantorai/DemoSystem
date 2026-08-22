const path = require('path');
const dotenv = require('dotenv');

const envResult = dotenv.config({
  path: path.resolve(__dirname, '..', '.env'),
});

// PM2 can retain an older process-level value across restarts. For this flag,
// prefer the value explicitly written in crm-backend/.env.
const configuredValue = Object.prototype.hasOwnProperty.call(
  envResult.parsed || {},
  'UNIFIED_PUSH_LOGS'
)
  ? envResult.parsed.UNIFIED_PUSH_LOGS
  : process.env.UNIFIED_PUSH_LOGS;

const enabled = String(configuredValue || '').trim().toLowerCase() === 'true';

const log = (...args) => {
  if (enabled) console.log(...args);
};

const warn = (...args) => {
  if (enabled) console.warn(...args);
};

const error = (...args) => {
  if (enabled) console.error(...args);
};

module.exports = { enabled, log, warn, error };

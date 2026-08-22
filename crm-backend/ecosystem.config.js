const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const backendDirectory = __dirname;

module.exports = {
  apps: [
    {
      name: 'crm-backend',
      script: 'server.js',
      cwd: backendDirectory,
      env: { NODE_ENV: process.env.NODE_ENV || 'production' },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      time: true,
      max_restarts: 10,
      restart_delay: 5000,
      min_uptime: '10s',
      max_memory_restart: '500M',
    },
    {
      name: 'transcription-worker',
      script: 'workers/transcriptionWorker.js',
      cwd: backendDirectory,
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production',
        PYTHON_PATH: process.env.PYTHON_PATH || path.join(backendDirectory, '.venv', 'bin', 'python3'),
        TRANSCRIBE_PY: process.env.TRANSCRIBE_PY || path.join(backendDirectory, 'transcribe.py'),
        INTERNAL_API_BASE: process.env.INTERNAL_API_BASE || 'http://127.0.0.1:5000',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      time: true,
      max_restarts: 10,
      restart_delay: 5000,
      min_uptime: '10s',
      max_memory_restart: '500M',
      exp_backoff_restart_delay: 1000,
      kill_timeout: 15000,
      shutdown_with_message: true,
    },
  ],
};

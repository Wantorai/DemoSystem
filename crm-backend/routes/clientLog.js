// routes/clientLog.js


// ------------------------ Это для проверки мобильного приложения !!! ------------------------ //


const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'client-logs.log');

// ensure logs folder exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// simple rate limiter to avoid spam
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // max 30 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
});

function maskSensitive(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const masked = Array.isArray(obj) ? [] : {};
  const SENSITIVE_KEYS = ['password', 'pass', 'token', 'authorization', 'auth', 'accessToken'];
  for (const k of Object.keys(obj)) {
    try {
      const v = obj[k];
      if (v && typeof v === 'object') masked[k] = maskSensitive(v);
      else if (SENSITIVE_KEYS.includes(k.toLowerCase())) masked[k] = '<<masked>>';
      else if (typeof v === 'string' && /^(?:\+?\d{7,})$/.test(v)) {
        // mask phone-ish strings (keep last 4 digits)
        masked[k] = v.replace(/\d(?=\d{4})/g, '*');
      } else masked[k] = v;
    } catch (e) {
      masked[k] = '<<error masking>>';
    }
  }
  return masked;
}

router.post('/api/client-log', limiter, express.json({ limit: '16kb' }), (req, res) => {
  try {
    const body = req.body || {};
    // Expected shape: { level, msg, extra, ts }
    const level = (body.level || 'info').toString().slice(0, 20);
    const msg = (body.msg || '').toString().slice(0, 2000);
    const extra = maskSensitive(body.extra || {});
    const ts = body.ts || new Date().toISOString();
    const remoteIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';

    const entry = {
      ts,
      level,
      msg,
      extra,
      remoteIp,
      url: req.originalUrl,
      userAgent: req.get('User-Agent'),
    };

    // 1) console
    //console.log('[CLIENT LOG]', JSON.stringify(entry));

    // 2) append to file (one JSON per line)
    const line = JSON.stringify(entry) + '\n';
    fs.appendFile(LOG_FILE, line, (err) => {
      if (err) {
        console.warn('Failed to write client log file', err);
      }
    });

    // 3) respond with no content
    return res.status(204).end();
  } catch (err) {
    console.error('client-log error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;

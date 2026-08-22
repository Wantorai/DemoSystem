'use strict';

const crypto = require('crypto');
const express = require('express');
const auth = require('../middleware/authMiddleware');

const router = express.Router();
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const normalizeSize = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, MAX_DOWNLOAD_BYTES);
};

router.get('/connection-speed/ping', auth, (_req, res) => {
  res.set('cache-control', 'no-store');
  res.json({ ok: true, serverTime: Date.now() });
});

router.get('/connection-speed/download', auth, (req, res) => {
  const bytes = normalizeSize(req.query.bytes, 1024 * 1024);
  const payload = crypto.randomBytes(bytes);

  res.set({
    'cache-control': 'no-store, no-cache, must-revalidate',
    'content-type': 'application/octet-stream',
    'content-length': String(payload.length),
    'content-encoding': 'identity',
    'x-content-type-options': 'nosniff',
  });
  res.send(payload);
});

router.post(
  '/connection-speed/upload',
  auth,
  express.raw({ type: 'application/octet-stream', limit: MAX_UPLOAD_BYTES }),
  (req, res) => {
    const bytesReceived = Buffer.isBuffer(req.body) ? req.body.length : 0;
    res.set('cache-control', 'no-store');
    res.json({ ok: true, bytesReceived, serverTime: Date.now() });
  }
);

module.exports = router;

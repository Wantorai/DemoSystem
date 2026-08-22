const crypto = require('crypto');
const axios = require('axios');

const DEFAULT_CLOCK_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 10000;

function normalizeDomain(raw) {
  let value = String(raw || '').trim().toLowerCase();
  value = value.replace(/^https?:\/\//, '');
  value = value.split('/')[0];
  value = value.split(':')[0];
  return value;
}

function getOwnDomain(req) {
  if (process.env.CROSS_CHAT_BRIDGE_DOMAIN) {
    return normalizeDomain(process.env.CROSS_CHAT_BRIDGE_DOMAIN);
  }
  const forwarded = String(req.headers['x-forwarded-host'] || '').trim();
  const host = forwarded || String(req.headers.host || '');
  return normalizeDomain(host);
}

function canonicalize(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonicalize(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function toCanonicalString(payload) {
  return JSON.stringify(canonicalize(payload || {}));
}

function computeSignature({ secret, timestamp, senderDomain, payload }) {
  const canonical = toCanonicalString(payload);
  const base = `${timestamp}.${normalizeDomain(senderDomain)}.${canonical}`;
  return crypto.createHmac('sha256', String(secret || '')).update(base).digest('hex');
}

function getBridgeSecret() {
  return String(process.env.CROSS_CHAT_BRIDGE_SECRET || '').trim();
}

function verifyBridgeSignature(req) {
  const secret = getBridgeSecret();
  if (!secret) {
    return { ok: false, code: 'bridge-secret-missing' };
  }

  const timestampRaw = req.headers['x-cross-bridge-ts'];
  const senderRaw = req.headers['x-cross-bridge-sender'];
  const signatureRaw = req.headers['x-cross-bridge-signature'];

  const timestamp = Number(timestampRaw);
  const senderDomain = normalizeDomain(senderRaw);
  const signature = String(signatureRaw || '').trim().toLowerCase();

  if (!Number.isFinite(timestamp) || !senderDomain || !signature) {
    return { ok: false, code: 'bridge-signature-headers-missing' };
  }

  const now = Date.now();
  if (Math.abs(now - timestamp) > DEFAULT_CLOCK_SKEW_MS) {
    return { ok: false, code: 'bridge-signature-expired' };
  }

  const expected = computeSignature({
    secret,
    timestamp,
    senderDomain,
    payload: req.body || {},
  });

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) {
    return { ok: false, code: 'bridge-signature-invalid' };
  }

  const ok = crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  if (!ok) {
    return { ok: false, code: 'bridge-signature-invalid' };
  }

  return { ok: true, senderDomain, timestamp };
}

function buildBridgeHeaders(senderDomain, payload) {
  const secret = getBridgeSecret();
  if (!secret) {
    throw new Error('CROSS_CHAT_BRIDGE_SECRET is not configured');
  }

  const ts = Date.now();
  const signature = computeSignature({
    secret,
    timestamp: ts,
    senderDomain,
    payload,
  });

  return {
    'x-cross-bridge-ts': String(ts),
    'x-cross-bridge-sender': normalizeDomain(senderDomain),
    'x-cross-bridge-signature': signature,
  };
}

async function sendBridgePost(targetDomain, path, payload, ownDomain) {
  const domain = normalizeDomain(targetDomain);
  if (!domain) throw new Error('target domain is empty');

  const url = `https://${domain}${path}`;
  const headers = buildBridgeHeaders(ownDomain, payload);
  const timeout = Number(process.env.CROSS_CHAT_BRIDGE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  const response = await axios.post(url, payload, {
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });

  return response.data;
}

module.exports = {
  normalizeDomain,
  getOwnDomain,
  verifyBridgeSignature,
  sendBridgePost,
};

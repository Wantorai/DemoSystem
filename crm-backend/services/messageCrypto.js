const crypto = require('crypto');

const PREFIX = 'enc:v1';

function parseEncryptionKey() {
  const raw = String(process.env.MESSAGE_ENCRYPTION_KEY || '').trim();
  if (!raw) return null;

  try {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      return Buffer.from(raw, 'hex');
    }
    if (/^[A-Za-z0-9+/=]+$/.test(raw)) {
      const b64 = Buffer.from(raw, 'base64');
      if (b64.length === 32) return b64;
    }
    const utf = Buffer.from(raw, 'utf8');
    if (utf.length === 32) return utf;
    return crypto.createHash('sha256').update(raw).digest();
  } catch (_) {
    return null;
  }
}

const ENCRYPTION_KEY = parseEncryptionKey();

function isMessageEncryptionEnabled() {
  const explicit = String(process.env.MESSAGE_ENCRYPTION_ENABLED || '').trim().toLowerCase();
  if (explicit === '0' || explicit === 'false' || explicit === 'off') return false;
  return Boolean(ENCRYPTION_KEY);
}

function isEncryptedValue(value) {
  return typeof value === 'string' && value.startsWith(`${PREFIX}:`);
}

function encryptString(plainText) {
  if (!isMessageEncryptionEnabled()) return plainText;
  if (plainText == null) return plainText;

  const text = String(plainText);
  if (!text.length || isEncryptedValue(text)) return text;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptString(cipherText) {
  if (!isMessageEncryptionEnabled()) return cipherText;
  if (cipherText == null) return cipherText;

  const value = String(cipherText);
  if (!isEncryptedValue(value)) return value;

  const parts = value.split(':');
  if (parts.length !== 5) return value;

  try {
    const iv = Buffer.from(parts[2], 'base64');
    const tag = Buffer.from(parts[3], 'base64');
    const encrypted = Buffer.from(parts[4], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    return plain;
  } catch (_) {
    return value;
  }
}

function encryptInstanceFields(instance, fields) {
  if (!instance || !Array.isArray(fields) || !fields.length) return;
  if (!isMessageEncryptionEnabled()) return;

  fields.forEach((field) => {
    const current = instance.getDataValue(field);
    if (current == null) return;
    const next = encryptString(current);
    if (next !== current) {
      instance.setDataValue(field, next);
    }
  });
}

function decryptInstanceFields(instance, fields) {
  if (!instance || !Array.isArray(fields) || !fields.length) return;
  if (!isMessageEncryptionEnabled()) return;

  fields.forEach((field) => {
    const current = instance.getDataValue(field);
    if (current == null) return;
    const next = decryptString(current);
    if (next !== current) {
      instance.setDataValue(field, next);
    }
  });
}

function decryptResult(payload, fields) {
  if (!payload || !fields?.length || !isMessageEncryptionEnabled()) return;
  if (Array.isArray(payload)) {
    payload.forEach((item) => decryptResult(item, fields));
    return;
  }
  if (typeof payload.getDataValue === 'function') {
    decryptInstanceFields(payload, fields);
  }
}

function attachMessageEncryptionHooks(model, fields) {
  if (!model || !fields?.length) return;
  model.addHook('beforeCreate', (instance) => encryptInstanceFields(instance, fields));
  model.addHook('beforeUpdate', (instance) => encryptInstanceFields(instance, fields));
  model.addHook('beforeSave', (instance) => encryptInstanceFields(instance, fields));
  model.addHook('beforeBulkCreate', (instances) => {
    if (!Array.isArray(instances)) return;
    instances.forEach((instance) => encryptInstanceFields(instance, fields));
  });
  model.addHook('beforeBulkUpdate', (options) => {
    if (!isMessageEncryptionEnabled()) return;
    if (!options || typeof options !== 'object') return;
    const attrs = options.attributes || {};
    fields.forEach((field) => {
      if (attrs[field] == null) return;
      attrs[field] = encryptString(attrs[field]);
    });
    options.attributes = attrs;
  });
  model.addHook('afterFind', (result) => decryptResult(result, fields));
}

module.exports = {
  PREFIX,
  isMessageEncryptionEnabled,
  isEncryptedValue,
  encryptString,
  decryptString,
  attachMessageEncryptionHooks,
};

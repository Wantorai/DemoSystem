'use strict';

const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { createReadStream } = require('fs');

const CHUNK_BYTES = 128 * 1024;
const MAX_BYTES = 512 * 1024 * 1024;
const TTL_MS = 48 * 60 * 60 * 1000;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = (status, code) => Object.assign(new Error(code), { status, code });
const readJson = async file => {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};
async function writeJson(file, value) {
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  try { await fs.writeFile(temp, JSON.stringify(value)); await fs.rename(temp, file); }
  finally { await fs.unlink(temp).catch(() => {}); }
}

// Parts remain outside express.static('/uploads'). PostgreSQL locks coordinate
// Node workers sharing this disk and are released automatically on process exit.
module.exports = function createResumableRouter({ auth, models, handleUpload,
  ensureRoomAllowsMessage, ensureRoomChatNotArchived, isMediaUploadCancelled,
  root = path.resolve('.upload-sessions'), uploadRoot = 'uploads', enabled = () => process.env.RESUMABLE_UPLOADS_ENABLED !== 'false',
}) {
  const router = express.Router();
  const lock = (key, work, existingTransaction) => {
    const run = async transaction => {
      await models.sequelize.query("SET LOCAL lock_timeout = '5s'", { transaction });
      const digest = crypto.createHash('sha256').update(key).digest();
      await models.sequelize.query('SELECT pg_advisory_xact_lock(:a, :b)', {
        transaction, replacements: { a: digest.readInt32BE(0), b: digest.readInt32BE(4) },
      });
      return work(transaction);
    };
    return existingTransaction ? run(existingTransaction) : models.sequelize.transaction(run);
  };
  const owner = req => {
    const id = Number(req.user?.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw fail(401, 'UPLOAD_UNAUTHORIZED');
    return id;
  };
  const sessionDir = (userId, id) => {
    if (!/^[a-f0-9]{64}$/.test(String(id))) throw fail(400, 'INVALID_UPLOAD_SESSION');
    return path.join(root, String(userId), id);
  };
  async function authorize(userId, meta) {
    const boss = meta.chatId != null;
    const id = Number(boss ? meta.chatId : meta.roomId);
    const model = boss ? models.BossChatUsers : models.RoomUsers;
    if (!await model.findOne({ where: { userId, [boss ? 'chatId' : 'roomId']: id } })) {
      throw fail(403, 'UPLOAD_CHAT_FORBIDDEN');
    }
    if (!boss) {
      await ensureRoomAllowsMessage(id, userId);
      await ensureRoomChatNotArchived(id);
    }
    if (isMediaUploadCancelled(boss ? 'boss' : 'room', id, meta.clientId)) throw fail(409, 'UPLOAD_CANCELLED');
    const existing = await (boss ? models.BossMessage : models.RoomMessage).findOne({ where: { clientId: meta.clientId } });
    if (existing && (Number(existing.userId) !== userId || Number(existing[boss ? 'chatId' : 'roomId']) !== id)) {
      throw fail(409, 'UPLOAD_CLIENT_ID_CONFLICT');
    }
  }
  function normalize(input, userId) {
    const size = Number(input?.size);
    const meta = input?.metadata || {};
    const clientId = String(meta.clientId || '');
    const room = Number(meta.roomId), chat = Number(meta.chatId);
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_BYTES ||
        !clientId || clientId.length > 128 || Boolean(room) === Boolean(chat) ||
        !Number.isSafeInteger(room || chat) || (room || chat) <= 0 ||
        !['audio', 'video', 'image', 'file', 'document'].includes(meta.messageType) ||
        typeof input.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.fingerprint) ||
        typeof input.filename !== 'string' || input.filename.length > 512 ||
        typeof input.mimeType !== 'string' || !/^[\w.+-]+\/[\w.+-]+$/.test(input.mimeType)) {
      throw fail(400, 'INVALID_UPLOAD_METADATA');
    }
    const metadata = { clientId, userId: String(userId), messageType: meta.messageType,
      [chat ? 'chatId' : 'roomId']: String(chat || room), fileSize: String(size), deliveryStatus: 'sent' };
    for (const field of ['replyToMessageId', 'replyToMessage', 'duration', 'originalFileName', 'messageText']) {
      if (meta[field] != null) {
        const value = String(meta[field]);
        if (value.length > (field === 'messageText' ? 16000 : 512)) throw fail(400, 'INVALID_UPLOAD_METADATA');
        metadata[field] = value;
      }
    }
    return { size, metadata, filename: path.basename(input.filename), mimeType: input.mimeType, fingerprint: input.fingerprint };
  }
  const describe = (id, session) => ({ protocol: 1, id, offset: session.offset, size: session.size, chunkBytes: CHUNK_BYTES,
    ...(session.response ? { message: session.response } : {}) });
  const route = fn => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { await fn(req, res); }
    catch (error) {
      if (res.headersSent) return;
      const busy = error?.original?.code === '55P03' || error?.code === '55P03';
      const status = busy ? 503 : Number(error.status) || 500;
      res.status(status).json({ code: busy ? 'UPLOAD_BUSY' : error.code || 'UPLOAD_SESSION_ERROR', message: status < 500 ? error.message : 'Upload temporarily unavailable' });
    }
  };
  router.use(auth);
  router.get('/capabilities', route(async (_req, res) => {
    res.json({ protocol: 1, enabled: enabled(), chunkBytes: CHUNK_BYTES, maxBytes: MAX_BYTES });
  }));
  router.post('/init', express.json({ limit: '24kb' }), route(async (req, res) => {
    if (!enabled()) throw fail(503, 'UPLOAD_DISABLED');
    const userId = owner(req);
    const data = normalize(req.body, userId);
    await authorize(userId, data.metadata);
    const id = hash(`${userId}:${data.metadata.clientId}`);
    await lock(`upload-init:${userId}`, async transaction => {
      const dir = sessionDir(userId, id);
      await lock(`upload:${id}`, async () => {
        const previous = await readJson(path.join(dir, 'session.json'));
        if (previous) {
          if (previous.signature !== hash(JSON.stringify(data))) throw fail(409, 'UPLOAD_SOURCE_CHANGED');
          previous.touchedAt = Date.now();
          await writeJson(path.join(dir, 'session.json'), previous);
          return res.json(describe(id, previous));
        }
        const userDir = path.join(root, String(userId));
        await fs.mkdir(userDir, { recursive: true });
        let reserved = 0, count = 0;
        for (const name of await fs.readdir(userDir)) {
          if (!/^[a-f0-9]{64}$/.test(name)) continue;
          const otherDir = sessionDir(userId, name);
          const other = await readJson(path.join(otherDir, 'session.json'));
          if (!other) continue;
          // The per-session lock also protects cleanup from an active writer.
          if (Date.now() - other.touchedAt > TTL_MS) {
            await lock(`upload:${name}`, async () => {
              const fresh = await readJson(path.join(otherDir, 'session.json'));
              if (fresh && Date.now() - fresh.touchedAt > TTL_MS) await fs.rm(otherDir, { recursive: true, force: true });
            }, transaction);
          } else if (!other.response) { reserved += other.size; count++; }
        }
        if (count >= 8 || reserved + data.size > 1024 * 1024 * 1024) throw fail(429, 'UPLOAD_QUOTA');
        await fs.mkdir(dir, { recursive: true });
        const session = { ...data, signature: hash(JSON.stringify(data)), offset: 0, touchedAt: Date.now() };
        await writeJson(path.join(dir, 'session.json'), session);
        res.json(describe(id, session));
      }, transaction);
    });
  }));
  async function withSession(req, action) {
    const userId = owner(req), id = String(req.params.id);
    const dir = sessionDir(userId, id);
    const beforeLock = await readJson(path.join(dir, 'session.json'));
    if (!beforeLock) throw fail(410, 'UPLOAD_SESSION_EXPIRED');
    // Access checks use the normal ORM pool before acquiring a lock connection.
    await authorize(userId, beforeLock.metadata);
    return lock(`upload:${id}`, async () => {
      const session = await readJson(path.join(dir, 'session.json'));
      if (!session) throw fail(410, 'UPLOAD_SESSION_EXPIRED');
      return action(session, dir, id);
    });
  }
  router.put('/:id/chunk', express.raw({ type: 'application/octet-stream', limit: CHUNK_BYTES, inflate: false }), route(async (req, res) => {
    await withSession(req, async (session, dir, id) => {
      if (session.response) return res.json(describe(id, session));
      const offset = Number(req.get('Upload-Offset'));
      if (!req.get('Upload-Offset') || !Number.isSafeInteger(offset) || offset !== session.offset) throw fail(409, 'UPLOAD_OFFSET_MISMATCH');
      if (!Buffer.isBuffer(req.body) || req.body.length !== Math.min(CHUNK_BYTES, session.size - offset) || req.body.length === 0) throw fail(400, 'INVALID_UPLOAD_CHUNK');
      const part = path.join(dir, 'data.part');
      const file = await fs.open(part, offset === 0 ? 'w+' : 'r+');
      try {
        // Manifest is the committed offset. Any tail left by a crash is overwritten.
        await file.truncate(offset);
        let written = 0;
        while (written < req.body.length) {
          const result = await file.write(req.body, written, req.body.length - written, offset + written);
          if (!result.bytesWritten) throw fail(500, 'UPLOAD_WRITE_FAILED');
          written += result.bytesWritten;
        }
        await file.sync();
      } finally { await file.close(); }
      session.offset += req.body.length;
      session.touchedAt = Date.now();
      await writeJson(path.join(dir, 'session.json'), session);
      res.json(describe(id, session));
    });
  }));
  router.post('/:id/complete', route(async (req, res) => {
    const savedResponse = await withSession(req, async (session, dir) => {
      if (session.response) return session.response;
      if (session.offset !== session.size) throw fail(409, 'UPLOAD_INCOMPLETE');
      if (!session.finalReady) {
      const digest = crypto.createHash('sha256');
      for await (const chunk of createReadStream(path.join(dir, 'data.part'))) digest.update(chunk);
      if (digest.digest('hex') !== session.fingerprint) throw fail(409, 'UPLOAD_CHECKSUM_MISMATCH');
      const ext = path.extname(session.filename).toLowerCase();
      const safeExt = /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : '';
      if (!session.finalPath) {
        session.finalPath = path.join(uploadRoot, 'resumable', `${crypto.randomUUID()}${safeExt}`);
        await writeJson(path.join(dir, 'session.json'), session);
      }
      await fs.mkdir(path.dirname(session.finalPath), { recursive: true });
      // Reuse the existing message creation, reply handling, postprocessing and sockets.
      // Keep the staged bytes until a successful response has been saved durably.
      await fs.copyFile(path.join(dir, 'data.part'), session.finalPath);
        session.finalReady = true;
        session.touchedAt = Date.now();
        await writeJson(path.join(dir, 'session.json'), session);
      }
      req.body = session.metadata;
      req.file = { path: session.finalPath, destination: path.dirname(session.finalPath), filename: path.basename(session.finalPath),
        fieldname: 'file', encoding: '7bit', originalname: session.filename, mimetype: session.mimeType, size: session.size };
      return null;
    });
    if (savedResponse) return res.json(savedResponse);
    // Do not reserve an ORM connection while the existing handler performs its
    // own queries/postprocessing. It already handles clientId uniqueness/races.
      let status = 200, result;
      const captured = Object.create(res);
      captured.status = value => { status = value; return captured; };
      captured.json = value => { result = JSON.parse(JSON.stringify(value)); return captured; };
      await handleUpload(req, captured);
      if (result === undefined) throw fail(500, 'UPLOAD_FINALIZE_FAILED');
      if (status >= 200 && status < 300 && result.id) {
        await withSession(req, async (session, dir) => {
        session.response = result;
        session.touchedAt = Date.now();
        await writeJson(path.join(dir, 'session.json'), session);
        await fs.unlink(path.join(dir, 'data.part')).catch(() => {});
        });
      }
      res.status(status).json(result);
  }));
  return router;
};

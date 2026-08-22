// routes/uploadRoutes.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const { Room, RoomMessage, User, ChatMessage, BossMessage, BossChat, UserConsultChat, PushToken, RoomUsers, BossChatUsers } = require("../models");      // модель для сообщений
const { ensureRoomAllowsMessage } = require('../services/roomDeletionAccess');
const getIO = require("../socket").getIO;          // функция-­геттер для io
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const { sendPushNotification } = require('../services/sendPushNotification');
const { getOwnDomain, sendBridgePost } = require('../services/crossChatBridge');
const { ensureRoomChatNotArchived } = require('../services/crossChatArchiveAccess');
const { Buffer } = require('buffer');
const transcriptionQueue = require('../queues/transcriptionQueue');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const { isMediaUploadCancelled } = require('../services/mediaUploadCancellation');
const { relayRoomMessageToExternalParticipants } = require('../services/roomExternalParticipants');
const CHAT_TRACE_LOGS = String(process.env.CHAT_TRACE_LOGS || '').toLowerCase() === 'true';
const chatTraceLog = (...args) => {
  if (CHAT_TRACE_LOGS) console.log(...args);
};

// Конфигурация хранения файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Определяем папку в зависимости от mime типа
    const mime = file.mimetype;

    let folder = 'uploads/others'; // папка по умолчанию

    if (mime.startsWith('image/')) {
      folder = 'uploads/images';
    } else if (mime.startsWith('video/')) {
      folder = 'uploads/videos';
    } else if (mime.startsWith('audio/')) {
      folder = 'uploads/audio';
    } else if (
      mime === 'application/pdf' ||
      mime === 'application/msword' ||
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/vnd.ms-excel' ||
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mime === 'application/vnd.ms-powerpoint' ||
      mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ) {
      folder = 'uploads/docs';
    }

    cb(null, folder);
  },

  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

async function cleanupCancelledUpload(file, msgData = {}) {
  const candidates = new Set();
  if (file?.path) candidates.add(path.resolve(file.path));
  for (const value of [msgData.mediaUrl, msgData.originalMediaUrl, msgData.thumbnailUrl]) {
    const normalized = String(value || '').replace(/^\/+/, '');
    if (normalized.startsWith('uploads/')) {
      candidates.add(path.resolve(normalized));
    }
  }
  await Promise.all(
    [...candidates].map((filePath) => fs.promises.unlink(filePath).catch(() => {}))
  );
}

async function optimizeVideoForStreaming(videoPath) {
  const ext = path.extname(videoPath) || '.mp4';
  const tempPath = `${videoPath}.faststart-${Date.now()}${ext}`;

  await new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions(['-c copy', '-movflags +faststart'])
      .output(tempPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });

  await fs.promises.rename(tempPath, videoPath);
}

function parseBridgePhone(rawPhone) {
  const value = String(rawPhone || '').trim();
  const m = /^xbridge:([^:]+):(.+)$/i.exec(value);
  if (!m) return null;
  return {
    domain: String(m[1] || '').trim().toLowerCase(),
    phone: String(m[2] || '').replace(/\D/g, ''),
  };
}

function toAbsoluteMediaUrl(url, domain) {
  const value = String(url || '').trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const normalizedDomain = String(domain || '').trim().toLowerCase();
  if (!normalizedDomain) return value;
  const prefixed = value.startsWith('/') ? value : `/${value}`;
  return `https://${normalizedDomain}${prefixed}`;
}


function fixFilenameEncoding(name) {
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
}

let ffprobeStatic;
try {
  ffprobeStatic = require('ffprobe-static');
  if (ffprobeStatic && ffprobeStatic.path) {
    ffmpeg.setFfprobePath(ffprobeStatic.path);
  }
} catch (e) {
  // ffprobe-static не установлен/недоступен - fluent-ffmpeg будет использовать системный ffprobe
  console.warn('ffprobe-static not available, using system ffprobe if present');
}





// Контроллер для записи логов (без файла)
router.post("/log", async (req, res) => {
  try {
    const { source, apiKey, message, eventType } = req.body;

    // Проверка API-ключа (как и в /file)
    if (source === 'bazis' && apiKey !== process.env.BAZIS_API_KEY) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Определяем chatId и userId из лога (та же логика, что в /file)
    const logText = message ?? '';
    //console.log('logText uploadRoutes= ', logText);
    let chatIdNum = await findChatIdByLog(logText);
        if (!/yandexdisk/i.test(String(logText || ''))) {
          chatIdNum = 10;
        }
        const userIdNum = await findUserIdByLog(logText);

    if (!userIdNum) {
      return res.status(400).json({ message: 'Пользователь не найден' });
    }
    if (!chatIdNum) {
      return res.status(400).json({ message: 'Не удалось определить чат из лога' });
    }

    // Создаём сообщение как текстовое (type = 'text')
    const bossMsg = await BossMessage.create({
      content: logText,
      type: 'text',
      chatId: chatIdNum,
      userId: userIdNum,
      createdAt: new Date(),
    });

    const bossMsgWithUser = await BossMessage.findByPk(bossMsg.id, {
      include: [{ model: User, attributes: ['id','name', 'avatar'] }],
    });

    const msgData = bossMsgWithUser.get({ plain: true });
    getIO().to(`chat-${chatIdNum}`).emit('newBossChatMessage', msgData);

    return res.json(msgData);
  } catch (err) {
    console.error('[upload:log] error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});




// Контроллер для загрузки файлов
router.post("/file", upload.single("file"), async (req, res) => {

  //console.log('[UPLOADROUTES] start');

  try {
    const traceId = `upl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const trace = (stage, extra = {}) => {
      try {
        chatTraceLog('[ChatTrace][upload:file]', { traceId, stage, ...extra });
      } catch {}
    };
    // console.log("BODY:", req.body);
    // console.log("FILE:", req.file);

    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    // console.log('[upload] req.body =', req.body);
    // console.log('[upload] file =', file && { path: file.path, originalname: file.originalname, mimetype: file.mimetype });

    // Для кирилицы
    const rawFileName = file.originalname;
    const decodedFileName = fixFilenameEncoding(rawFileName);
    const rawOriginalFileName = (req.body?.originalFileName ?? '').toString().trim();
    const decodedOriginalFileName = rawOriginalFileName ? fixFilenameEncoding(rawOriginalFileName) : '';
    const finalFileName = decodedOriginalFileName || decodedFileName;
    const incomingFileSize = Number(req.body?.fileSize);
    const finalFileSize = Number.isFinite(incomingFileSize) && incomingFileSize > 0
      ? incomingFileSize
      : (Number(file?.size) > 0 ? Number(file.size) : null);

    // Формируем относительный URL
    const mediaUrl = file.path.replace(/^uploads/, '/uploads').replace(/\\/g, '/');

    const { deliveryStatus, clientId, duration } = req.body;
    trace('incoming', {
      source: String(req.body.source || '').toLowerCase(),
      chatId: req.body.chatId ?? null,
      roomId: req.body.roomId ?? null,
      userId: req.body.userId ?? null,
      messageType: req.body.messageType ?? null,
      clientId: clientId ?? null,
      fileName: decodedFileName,
      mediaUrl,
    });
    const rawReplyToMessageId = req.body.replyToMessageId ?? req.body.replyToMessage ?? null;
    const parsedReplyToMessageId =
      rawReplyToMessageId != null && String(rawReplyToMessageId).trim() !== ''
        ? Number(rawReplyToMessageId)
        : null;

    const source = String(req.body.source || '').toLowerCase();
    //console.log('[UPLOADROUTES] payload snapshot', {
    //   source,
    //   chatId: req.body.chatId ?? null,
    //   roomId: req.body.roomId ?? null,
    //   userId: req.body.userId ?? null,
    //   messageType: req.body.messageType ?? null,
    //   hasMessage: Boolean(req.body.message),
    // });

    // === обработка для room/boss chat  ===
    if ((req.body.chatId || req.body.roomId) && source !== 'bazis' && req.body.chatId !== 5) {
      //console.log('[UPLOADROUTES] branch=generic-chat-upload');

      try {
        // Конфиги для двух типов чатов
        const configs = {
          boss: {
            triggerField: 'chatId',
            idKey: 'chatId',
            model: BossMessage,
            participantsModel: BossChatUsers,
            socketPrefix: 'chat-',
            socketEvent: 'newBossChatMessage',
            workerModelName: 'BossMessage',
            pushScreen: 'BossChat',
            includeCreatedAt: true, // в исходнике вы задавали createdAt только для boss
          },
          room: {
            triggerField: 'roomId',
            idKey: 'roomId',
            model: RoomMessage,
            participantsModel: RoomUsers,
            socketPrefix: 'room-',
            socketEvent: 'newRoomMessage',
            workerModelName: 'RoomMessage',
            pushScreen: 'room',
            includeCreatedAt: false,
          }
        };

        // Выбираем конфиг: сначала boss, потом room
        const kind = req.body.chatId ? 'boss' : (req.body.roomId ? 'room' : null);
        if (!kind) return res.status(400).json({ error: "Missing chatId or roomId" });

        const cfg = configs[kind];
        const idNum = parseInt(req.body[cfg.triggerField], 10);
        const userIdNum = parseInt(req.body.userId, 10);
        if (Number.isNaN(idNum) || Number.isNaN(userIdNum)) {
          return res.status(400).json({ error: `Invalid ${cfg.triggerField} or userId` });
        }
        if (clientId && isMediaUploadCancelled(kind, idNum, clientId)) {
          await cleanupCancelledUpload(file);
          return res.status(409).json({
            error: 'Upload cancelled',
            code: 'UPLOAD_CANCELLED',
          });
        }
        if (kind === 'room') {
          try {
            await ensureRoomAllowsMessage(idNum, userIdNum);
          } catch (accessErr) {
            return res.status(accessErr?.status || 403).json({
              message: accessErr?.message || 'Отправка сообщений недоступна',
              code: accessErr?.code || 'ROOM_SEND_FORBIDDEN',
            });
          }
          try {
            await ensureRoomChatNotArchived(idNum);
          } catch (archiveErr) {
            if (archiveErr?.status === 403) {
              return res.status(403).json({
                error: archiveErr.message || 'Чат в архиве',
                code: archiveErr.code || 'CROSS_CHAT_ARCHIVED',
              });
            }
            throw archiveErr;
          }
        }
        trace('target:resolved', {
          kind,
          triggerField: cfg.triggerField,
          targetId: idNum,
          socketRoom: `${cfg.socketPrefix}${idNum}`,
          socketEvent: cfg.socketEvent,
          userId: userIdNum,
        });

        // Собираем данные сообщения
        const now = new Date();
        const msgData = {
          [cfg.idKey]: idNum,
          userId: userIdNum,
          type: req.body.messageType || 'text',
          mediaUrl,
          fileName: finalFileName,
          fileSize: finalFileSize,
          clientId: clientId,
          deliveryStatus: deliveryStatus || 'sent',
          duration: duration || null
        };
        if (Number.isFinite(parsedReplyToMessageId) && parsedReplyToMessageId > 0) {
          msgData.replyToMessageId = parsedReplyToMessageId;
        }

        if (cfg.includeCreatedAt) msgData.createdAt = now;

        const typeLower = (req.body.messageType || '').toLowerCase();

        if (typeLower === 'audio' || typeLower === 'voice') {
          msgData.transcriptionStatus = 'pending';
          msgData.mediaMimeType = file.mimetype || 'audio/mpeg';
        }

        const audioPostProcess = (typeLower === 'audio' || typeLower === 'voice') && file
          ? (() => {
              const inputPath = file.path;
              const inputExt = path.extname(file.filename).toLowerCase();
              if (inputExt === '.mp3') return null;
              const baseName = path.basename(file.filename, inputExt);
              const outDir = path.join('uploads', 'audio');
              const outFilename = `${baseName}.mp3`;
              const outPath = path.join(outDir, outFilename);
              return { inputPath, inputExt, outDir, outPath, originalMediaUrl: mediaUrl, originalMediaMimeType: file.mimetype };
            })()
          : null;

        const videoPostProcess = file && file.mimetype && file.mimetype.startsWith('video/')
          ? (() => {
              const videoPath = path.isAbsolute(file.path) ? file.path : path.join(process.cwd(), file.path);
              const ext = path.extname(videoPath);
              const baseName = path.basename(videoPath, ext);
              const folder = path.dirname(videoPath);
              const thumbFilename = `${baseName}.jpg`;
              const thumbPath = path.join(folder, thumbFilename);
              return { videoPath, folder, thumbFilename, thumbPath };
            })()
          : null;

        if (videoPostProcess) {
          trace('video:postprocess:deferred', {
            kind,
            targetId: idNum,
            clientId: clientId ?? null,
            videoPath: videoPostProcess.videoPath,
          });
        }

        let newMsg;

        if (clientId && isMediaUploadCancelled(kind, idNum, clientId)) {
          await cleanupCancelledUpload(file, msgData);
          return res.status(409).json({
            error: 'Upload cancelled',
            code: 'UPLOAD_CANCELLED',
          });
        }

        // Идемпотентность по clientId:
        // если клиент ретраит тот же запрос (с тем же clientId), возвращаем уже созданное сообщение.
        if (clientId) {
          const existingByClientId = await cfg.model.findOne({
            where: { clientId: clientId },
          });
          if (existingByClientId) {
            trace('idempotent:reuse-existing', {
              kind,
              targetId: idNum,
              existingMessageId: existingByClientId.id,
              clientId,
            });
            //console.log(`[UPLOADROUTES][idempotent] reused existing message by clientId=${clientId}`);
            await existingByClientId.reload({
              include: [
                { model: User, attributes: ['id', 'name', 'avatar'] },
                {
                  model: cfg.model,
                  as: 'replyToMessage',
                  include: [{ model: User, attributes: ['id', 'name', 'avatar'] }],
                },
              ]
            });
            return res.status(200).json(existingByClientId);
          }
        }


        // Создаём сообщение
        try {
          newMsg = await cfg.model.create(msgData);
        } catch (createErr) {
          // Гонка дублей: в параллельном запросе запись уже успели создать с тем же clientId.
          if (clientId && createErr?.name === 'SequelizeUniqueConstraintError') {
            const existingByClientId = await cfg.model.findOne({
              where: { clientId: clientId },
            });
            if (existingByClientId) {
              trace('idempotent:race-reuse-existing', {
                kind,
                targetId: idNum,
                existingMessageId: existingByClientId.id,
                clientId,
              });
              //console.log(`[UPLOADROUTES][idempotent-race] reused existing message by clientId=${clientId}`);
              await existingByClientId.reload({
                include: [
                  { model: User, attributes: ['id', 'name', 'avatar'] },
                  {
                    model: cfg.model,
                    as: 'replyToMessage',
                    include: [{ model: User, attributes: ['id', 'name', 'avatar'] }],
                  },
                ]
              });
              return res.status(200).json(existingByClientId);
            }
          }
          console.error('Ошибка создания сообщения:', createErr);
          return res.status(500).json({ error: 'Failed to create message' });
        }

        if (clientId && isMediaUploadCancelled(kind, idNum, clientId)) {
          await newMsg.destroy().catch(() => {});
          await cleanupCancelledUpload(file, msgData);
          return res.status(409).json({
            error: 'Upload cancelled',
            code: 'UPLOAD_CANCELLED',
          });
        }

        // Подгружаем User для ответа/пуша
        await newMsg.reload({
          include: [
            { model: User, attributes: ['id', 'name', 'avatar'] },
            {
              model: cfg.model,
              as: 'replyToMessage',
              include: [{ model: User, attributes: ['id', 'name', 'avatar'] }],
            },
          ]
        });
        trace('message:created', {
          kind,
          targetId: idNum,
          messageId: newMsg.id,
          messageRoomId: newMsg.roomId ?? null,
          messageChatId: newMsg.chatId ?? null,
          userId: newMsg.userId ?? null,
          type: newMsg.type ?? null,
          clientId: newMsg.clientId ?? null,
        });

        // External room participants relay: mirror media/file/audio/video/image messages
        // to Telegram/MAX participants connected to this room.
        if (kind === 'room') {
          relayRoomMessageToExternalParticipants({
              roomId: idNum,
              senderName: newMsg?.User?.name || `User ${userIdNum}`,
              content: String(req.body?.messageText || ''),
              message: newMsg,
          }).catch((relayExternalErr) => {
            console.warn('[room-external][relay:upload] failed:', relayExternalErr?.message || relayExternalErr);
          });
        }
        // Cross-domain bridge relay: mirror media/file/audio/video/image messages
        // for personal chats where peer is synthetic xbridge user.
        try {
          const relayAllowed = !req.body?.bridgeRelay;
          if (relayAllowed && kind === 'room') {
            const roomForBridge = await Room.findByPk(idNum, {
              include: [{ model: User, through: { attributes: [] }, attributes: ['id', 'name', 'phone'] }],
            });
            if (['personal', 'group'].includes(String(roomForBridge?.type || '')) && Array.isArray(roomForBridge.Users)) {
              const selfUser = roomForBridge.Users.find((u) => Number(u.id) === Number(userIdNum));
              const peerUsers = String(roomForBridge.type || '') === 'personal'
                ? [roomForBridge.Users.find((u) => Number(u.id) !== Number(userIdNum))]
                : roomForBridge.Users.filter((u) => Number(u.id) !== Number(userIdNum) && parseBridgePhone(u?.phone));
              for (const peerUser of peerUsers) {
                const bridgePeer = parseBridgePhone(peerUser?.phone);
                if (!bridgePeer?.domain || !bridgePeer?.phone) continue;
                const ownDomain = getOwnDomain(req);
                const payload = {
                  externalMessageId: String(newMsg.id),
                  sender: {
                    userId: Number(userIdNum) || null,
                    name: String(selfUser?.name || `User ${userIdNum}`),
                    phone: String(selfUser?.phone || '').replace(/\D/g, ''),
                    domain: ownDomain,
                  },
                  target: {
                    domain: bridgePeer.domain,
                    phone: bridgePeer.phone,
                  },
                  message: {
                    content: String(req.body?.messageText || ''),
                    type: String(newMsg.type || req.body.messageType || 'file'),
                    clientId: String(newMsg.clientId || ''),
                    createdAt: new Date().toISOString(),
                    mediaUrl: toAbsoluteMediaUrl(newMsg.mediaUrl, ownDomain),
                    thumbnailUrl: toAbsoluteMediaUrl(newMsg.thumbnailUrl, ownDomain),
                    fileName: newMsg.fileName || null,
                    fileSize: Number.isFinite(Number(newMsg.fileSize)) ? Number(newMsg.fileSize) : null,
                    duration: Number.isFinite(Number(newMsg.duration)) ? Number(newMsg.duration) : null,
                    mediaMimeType: newMsg.mediaMimeType || null,
                    transcriptionText: newMsg.transcriptionText || null,
                    transcriptionStatus: newMsg.transcriptionStatus || null,
                  },
                };

                sendBridgePost(bridgePeer.domain, '/api/cross-chat/bridge/message', payload, ownDomain)
                  .then(() => {
                    trace('bridge:relay:ok', {
                      kind,
                      targetId: idNum,
                      peerDomain: bridgePeer.domain,
                      messageId: newMsg.id,
                    });
                  })
                  .catch((relayErr) => {
                    console.warn('[cross-chat][bridge][relay] failed:', relayErr?.message || relayErr);
                    trace('bridge:relay:fail', {
                      kind,
                      targetId: idNum,
                      peerDomain: bridgePeer.domain,
                      messageId: newMsg.id,
                      error: relayErr?.message || String(relayErr),
                    });
                  });
              }
            }
          }
        } catch (relayErr) {
          console.warn('[cross-chat][bridge][relay] unexpected:', relayErr?.message || relayErr);
        }

        // Эмитим новое сообщение по socket.io
        const io = getIO();
        io.to(`${cfg.socketPrefix}${idNum}`).emit(cfg.socketEvent, newMsg);
        trace('emit:new-message', {
          kind,
          targetId: idNum,
          socketRoom: `${cfg.socketPrefix}${idNum}`,
          socketEvent: cfg.socketEvent,
          messageId: newMsg.id,
          messageRoomId: newMsg.roomId ?? null,
          messageChatId: newMsg.chatId ?? null,
          clientId: newMsg.clientId ?? null,
        });
        //console.log(`[UPLOADROUTES] ${cfg.socketPrefix}${idNum} emit ${cfg.socketEvent} msg ${newMsg}`);

        if (audioPostProcess) {
          (async () => {
            const audioStartedAt = Date.now();
            try {
              trace('audio:postprocess:start', {
                kind,
                targetId: idNum,
                messageId: newMsg.id,
                clientId: newMsg.clientId ?? null,
                inputPath: audioPostProcess.inputPath,
                outPath: audioPostProcess.outPath,
              });
              console.warn('[upload:file][audio:postprocess:start]', {
                messageId: newMsg.id,
                clientId: newMsg.clientId ?? null,
                inputPath: audioPostProcess.inputPath,
                outPath: audioPostProcess.outPath,
              });

              await fs.promises.mkdir(audioPostProcess.outDir, { recursive: true }).catch(() => {});
              if (!fs.existsSync(audioPostProcess.outPath)) {
                await new Promise((resolve, reject) => {
                  ffmpeg(audioPostProcess.inputPath)
                    .noVideo()
                    .audioBitrate('96k')
                    .toFormat('mp3')
                    .on('error', reject)
                    .on('end', resolve)
                    .save(audioPostProcess.outPath);
                });
              }

              const playableRel = audioPostProcess.outPath.replace(/^uploads/, '/uploads').replace(/\\/g, '/');
              await newMsg.update({
                mediaUrl: playableRel,
                mediaMimeType: 'audio/mpeg',
                originalMediaUrl: audioPostProcess.originalMediaUrl,
                originalMediaMimeType: audioPostProcess.originalMediaMimeType,
                transcodeStatus: null,
              });
              const updated = await cfg.model.findByPk(newMsg.id, {
                include: [
                  { model: User, attributes: ['id', 'name', 'avatar'] },
                  {
                    model: cfg.model,
                    as: 'replyToMessage',
                    include: [{ model: User, attributes: ['id', 'name', 'avatar'] }],
                  },
                ],
              });
              if (updated) {
                io.to(`${cfg.socketPrefix}${idNum}`).emit(cfg.socketEvent, updated);
              }
              trace('audio:postprocess:updated', {
                kind,
                targetId: idNum,
                messageId: newMsg.id,
                mediaUrl: playableRel,
                durationMs: Date.now() - audioStartedAt,
              });
              console.warn('[upload:file][audio:postprocess:ok]', {
                messageId: newMsg.id,
                clientId: newMsg.clientId ?? null,
                mediaUrl: playableRel,
                durationMs: Date.now() - audioStartedAt,
              });
            } catch (err) {
              console.error('[upload] audio postprocess failed, using original file', err);
              try {
                await newMsg.update({
                  mediaUrl: audioPostProcess.originalMediaUrl,
                  mediaMimeType: audioPostProcess.originalMediaMimeType,
                  transcodeStatus: 'failed',
                });
              } catch {}
              trace('audio:postprocess:fail', {
                kind,
                targetId: idNum,
                messageId: newMsg.id,
                durationMs: Date.now() - audioStartedAt,
                error: err?.message || String(err),
              });
            }
          })();
        }

        if (videoPostProcess) {
          (async () => {
            const ffprobeAsync = (filePath) => new Promise((resolve, reject) => {
              ffmpeg.ffprobe(filePath, (err, metadata) => {
                if (err) return reject(err);
                return resolve(metadata);
              });
            });

            const makeScreenshotAsync = (video, filename, folderPath) => new Promise((resolve, reject) => {
              ffmpeg(video)
                .screenshots({
                  timestamps: ['1.0'],
                  filename,
                  folder: folderPath,
                  size: '640x?'
                })
                .on('end', () => resolve())
                .on('error', (err) => reject(err));
            });

            try {
              await optimizeVideoForStreaming(videoPostProcess.videoPath)
                .then(() => {
                  trace('video:faststart:ok', {
                    kind,
                    targetId: idNum,
                    messageId: newMsg.id,
                    videoPath: videoPostProcess.videoPath,
                  });
                })
                .catch(async (err) => {
                  const tempPrefix = `${videoPostProcess.videoPath}.faststart-`;
                  const folder = path.dirname(videoPostProcess.videoPath);
                  const base = path.basename(videoPostProcess.videoPath);
                  const files = await fs.promises.readdir(folder).catch(() => []);
                  await Promise.all(
                    files
                      .filter((name) => name.startsWith(`${base}.faststart-`))
                      .map((name) => fs.promises.unlink(path.join(folder, name)).catch(() => {}))
                  );
                  console.warn('video faststart optimization failed', err);
                  trace('video:faststart:fail', {
                    kind,
                    targetId: idNum,
                    messageId: newMsg.id,
                    videoPath: videoPostProcess.videoPath,
                    tempPrefix,
                    error: err?.message || String(err),
                  });
                });

              const [, metadata] = await Promise.all([
                makeScreenshotAsync(
                  videoPostProcess.videoPath,
                  videoPostProcess.thumbFilename,
                  videoPostProcess.folder
                ).catch((err) => {
                  console.warn('thumbnail generation failed', err);
                  return null;
                }),
                ffprobeAsync(videoPostProcess.videoPath).catch((err) => {
                  console.warn('ffprobe failed', err);
                  return null;
                }),
              ]);

              const patch = {};
              if (fs.existsSync(videoPostProcess.thumbPath)) {
                const thumbRel = videoPostProcess.thumbPath.replace(/\\/g, '/').match(/uploads\/.*/i);
                if (thumbRel) patch.thumbnailUrl = `/${thumbRel[0]}`;
              }

              if (metadata && metadata.format && typeof metadata.format.duration === 'number') {
                patch.duration = Math.round(metadata.format.duration);
              }

              if (Object.keys(patch).length === 0) return;

              await newMsg.update(patch);
              const updated = await cfg.model.findByPk(newMsg.id, {
                include: [
                  { model: User, attributes: ['id', 'name', 'avatar'] },
                  {
                    model: cfg.model,
                    as: 'replyToMessage',
                    include: [{ model: User, attributes: ['id', 'name', 'avatar'] }],
                  },
                ],
              });

              if (updated) {
                io.to(`${cfg.socketPrefix}${idNum}`).emit(cfg.socketEvent, updated);
                trace('video:postprocess:updated', {
                  kind,
                  targetId: idNum,
                  socketRoom: `${cfg.socketPrefix}${idNum}`,
                  socketEvent: cfg.socketEvent,
                  messageId: updated.id,
                  thumbnailUrl: updated.thumbnailUrl ?? null,
                  duration: updated.duration ?? null,
                });
              }
            } catch (err) {
              console.warn('Video post-processing failed (thumbnail/duration):', err);
            }
          })();
        }

        // --- отправка push'ей ---
        (async () => {
          try {
            const senderId = userIdNum;

            // participants (с include user)
            const participants = await cfg.participantsModel.findAll({
              where: { [cfg.idKey]: idNum },
              include: [{ model: User, as: 'user', attributes: ['id', 'name', 'phone'] }],
            });

            const recipientUserIds = Array.from(new Set(
              participants
                .map((p) => p.user)
                .filter((u) => u?.id != null && Number(u.id) !== Number(senderId) && !parseBridgePhone(u.phone))
                .map((u) => Number(u.id))
            ));

            if (recipientUserIds.length === 0) {
              // нет получателей
              return;
            }

            const senderName = newMsg.User?.name || (`User ${senderId}`);
            const title = `От ${senderName}`;
            const bodyByType = (() => {
              switch (String(typeLower || '').toLowerCase()) {
                case 'audio':
                case 'voice':
                  return 'Аудио';
                case 'video':
                  return 'Видео';
                case 'image':
                  return 'Фото';
                case 'document':
                  return 'Документ';
                case 'file':
                  return 'Файл';
                default:
                  return null;
              }
            })();
            const body = bodyByType || req.body.messageText || 'НС:';
            const data = {
              screen: cfg.pushScreen,
              [cfg.idKey]: String(idNum),
              messageId: String(newMsg.id),
              mediaUrl: newMsg.mediaUrl || null,
              fileName: decodedFileName || null,
            };

            await sendPushNotification(recipientUserIds, title, body, data);
          } catch (pushErr) {
            console.error(`Ошибка при отправке push-уведомлений (${kind}):`, pushErr);
          }
        })();

        // console.log('[UPLOADROUTES] newMsg = ', newMsg)
        // console.log('[UPLOADROUTES] typeLower = ', typeLower )

        // --- добавляем задачу транскрибации в очередь (только для аудио), но не держим HTTP upload ---
        if ((typeLower === 'audio' || typeLower === 'voice') && newMsg.mediaUrl) {
          (async () => {
            try {
              const fileSystemPath = path.isAbsolute(file.path) ? file.path : path.join(process.cwd(), file.path);
              trace('transcription:queue:add:start', {
                kind,
                targetId: idNum,
                messageId: newMsg.id,
                clientId: newMsg.clientId ?? null,
              });

              await transcriptionQueue.add(
                {
                  messageId: newMsg.id,
                  model: cfg.workerModelName,
                  mediaUrl: newMsg.mediaUrl,
                  mediaPath: fileSystemPath,
                  context: { [cfg.idKey]: idNum },
                  userId: userIdNum
                },
                { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, timeout: 60000 }
              );
              trace('transcription:queue:add:ok', {
                kind,
                targetId: idNum,
                messageId: newMsg.id,
              });
            } catch (qErr) {
              console.error('Ошибка добавления транскрипции в очередь для message', newMsg.id, qErr);
              // гарантируем, что статус не останется подвешенным навсегда
              try {
                await newMsg.update({ transcriptionStatus: 'failed', transcriptionError: String(qErr).slice(0, 1000) });
                const updated = await cfg.model.findByPk(newMsg.id, {
                  include: [
                    { model: User, attributes: ['id', 'name', 'avatar'] },
                    {
                      model: cfg.model,
                      as: 'replyToMessage',
                      include: [{ model: User, attributes: ['id', 'name', 'avatar'] }],
                    },
                  ]
                });
                // ВАЖНО: эмитим тот же эвент/рум, что и при создании (в исходнике для boss была опечатка с room- — здесь исправлено)
                io.to(`${cfg.socketPrefix}${idNum}`).emit(cfg.socketEvent, updated);
                trace('emit:transcription-update', {
                  kind,
                  targetId: idNum,
                  socketRoom: `${cfg.socketPrefix}${idNum}`,
                  socketEvent: cfg.socketEvent,
                  messageId: updated.id,
                  transcriptionStatus: updated.transcriptionStatus ?? null,
                });
              } catch (uErr) {
                console.error('Ошибка при установке failed статусa для message', newMsg.id, uErr);
              }
            }
          })();
        }

        // Возвращаем созданное сообщение (с инклудом User)
        if (typeLower === 'audio' || typeLower === 'voice') {
          console.warn('[upload:file][audio:response]', {
            messageId: newMsg.id,
            clientId: newMsg.clientId ?? null,
            mediaUrl: newMsg.mediaUrl ?? null,
            fileSize: Number.isFinite(Number(newMsg.fileSize)) ? Number(newMsg.fileSize) : null,
          });
        }
        return res.json(newMsg);
      } catch (err) {
        console.error('Ошибка в /file upload route:', err);
        return res.status(500).json({ error: 'Server error' });
      }
    }

        // Если пришло из Базиса
    if (source === 'bazis') {

        // (1) — валидация apiKey
        if (req.body.apiKey !== process.env.BAZIS_API_KEY) {
            console.warn('[upload:bazis] invalid api key');
            return res.status(401).json({ error: 'Invalid API key' });
        }

        // Определяем chatId для которого сохраняем сообщение
        const logText = req.body.message ?? ''
        //console.log('logText uploadRoutes = ', logText);
        let chatIdNum = await findChatIdByLog(logText);
        if (!/yandexdisk/i.test(String(logText || ''))) {
          chatIdNum = 10;
        }
        const userIdNum = await findUserIdByLog(logText);

        if (!userIdNum) {
          console.warn('[upload:bazis] user not found by machineId', {
            machineId: extractMachineIdFromLog(logText),
            logPreview: String(logText).slice(0, 160),
          });
          return res.status(400).json({ message: 'Пользователь не найден' });
        }

        if (!chatIdNum) {
          console.warn('[upload:bazis] chat not resolved from log', {
            logPreview: String(logText).slice(0, 160),
          });
          return res.status(400).json({ message: 'Не удалось определить чат из лога' });
        }

        const targetUser = await User.findByPk(userIdNum, {
          attributes: ['id', 'name', 'machineId', 'isActive'],
        });
        if (!targetUser || !targetUser.isActive) {
          return res.status(400).json({ message: 'Пользователь не найден или отключён' });
        }

        const msgPayload = {
            content: logText || '', 
            type: req.body.messageType || 'document',
            mediaUrl,                          // файл Базиса хранится только как вложение чата
            fileName: logText,                 // подпись под медиа
            fileSize: finalFileSize,
            mediaMimeType: file.mimetype,
            chatId: chatIdNum,
            userId: userIdNum,
            createdAt: new Date(),
        };

        const bossMsg = await BossMessage.create(msgPayload);
        // console.log('[upload:bazis] message created', {
        //   bossMessageId: bossMsg.id,
        //   chatId: chatIdNum,
        //   userId: userIdNum,
        //   type: msgPayload.type,
        // });
        const bossMsgWithUser = await BossMessage.findByPk(bossMsg.id, {
          include: [{ model: User, attributes: ['id','name', 'avatar'] }],
        });
        const msgData = bossMsgWithUser.get({ plain: true });

        getIO().to(`chat-${chatIdNum}`).emit('newBossChatMessage', msgData);

        // // --- отправка push'ей для ветки bazis ---
        // (async () => {
        //   try {
        //     const senderId = Number(userIdNum);

        //     const participants = await BossChatUsers.findAll({
        //       where: { chatId: Number(chatIdNum) },
        //       include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
        //     });

        //     const recipientUserIds = Array.from(new Set(
        //       participants
        //         .map((p) => p.user?.id)
        //         .filter((id) => id != null && Number(id) !== senderId)
        //     ));

        //     if (recipientUserIds.length === 0) return;

        //     const tokenRows = await PushToken.findAll({
        //       where: { userId: { [Op.in]: recipientUserIds } },
        //       attributes: ['token', 'userId'],
        //     });

        //     const tokens = Array.from(new Set(
        //       tokenRows
        //         .filter((r) => r.token && Number(r.userId) !== senderId)
        //         .map((r) => r.token)
        //     ));

        //     if (tokens.length === 0) return;

        //     const senderName = bossMsgWithUser?.User?.name || (`User ${senderId}`);
        //     const title = `От ${senderName}`;
        //     const body = decodedFileName
        //       ? `Файл из Базиса: ${decodedFileName}`
        //       : (isSpecialChat4 ? (logText || 'НС:') : 'Новое сообщение');

        //     const data = {
        //       screen: 'BossChat',
        //       chatId: String(chatIdNum),
        //       messageId: String(bossMsg.id),
        //       mediaUrl: bossMsg.mediaUrl || null,
        //       fileName: bossMsg.fileName || null,
        //     };

        //     await sendPushNotification(tokens, title, body, data);
        //   } catch (pushErr) {
        //     console.error('Ошибка при отправке push-уведомлений (bazis):', pushErr);
        //   }
        // })();

        // (5) — возвращаем созданное сообщение
        return res.json(msgData);
    }


    // Иначе — обработка для консалтового чата
    // Ожидаем поля userId и userName
    const { userId, userName, messageType } = req.body;
    if (!userId || !userName) {
      return res.status(400).json({ error: "Missing userId or userName for chat message" });
    }

    
    const msgData = {
      _id: uuidv4(),  // генерируем UUID
      userId: userId.toString(),
      userName: userName.toString(),
      type: messageType || 'text',
      mediaUrl,
      fileName: finalFileName,
      fileSize: finalFileSize,
      text: null,
      createdAt: new Date(),
      duration: duration || null
    }

    const typeLower = (req.body.messageType || '').toLowerCase();
    if (typeLower === 'audio' || typeLower === 'voice') {
      msgData.transcriptionStatus = 'pending';
    }

    const chatMsg = await ChatMessage.create(msgData);

    const payload = chatMsg.toJSON();  

    // Эмитим через socket.io в канал consult
    const io = getIO();
    io.emit('newChatMessage', payload);

    // Транскрибация для консультаций
    if (typeLower === 'audio' || typeLower === 'voice') {

      try {
        if (chatMsg.mediaUrl) {
          //console.log('chatMsg.mediaUrl = ', chatMsg.mediaUrl)
          const fileSystemPath = path.isAbsolute(file.path) ? file.path : path.join(process.cwd(), file.path);
          const userIdNum = parseInt(req.body.userId, 10);


          await transcriptionQueue.add(
            {
              messageId: chatMsg._id,
              model: 'ChatMessage',
              mediaUrl: chatMsg.mediaUrl,
              mediaPath: fileSystemPath,
              context: 'consult',
              userId: userIdNum
          },
            { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
          );
        }
      } catch (qErr) {
        console.error('Ошибка добавления транскрипции в очередь для message', chatMsg.id, qErr);
        // гарантируем, что статус не останется подвешенным навсегда
        try {
          await chatMsg.update({ transcriptionStatus: 'failed', transcriptionError: String(qErr).slice(0, 1000) });
          const updated = await ChatMessage.findByPk(chatMsg._id, {
            include: [{ model: User, attributes: ['id', 'name', 'avatar'] }]
          });
          // ВАЖНО: эмитим тот же эвент/рум
          io.emit('newChatMessage', updated);
        } catch (uErr) {
          console.error('Ошибка при установке failed статусa для message', chatMsg.id, uErr);
        }
      }

    }





    // Получаем отправителя из тела (лучше — из req.user, если используешь authMiddleware)
    const senderIdNum = userId ? Number(userId) : null;

    // Получаем всех участников consult-чата (модель UserConsultChat должна иметь ассоциацию к User с alias 'user')
    const participants = await UserConsultChat.findAll({
      include: [{ model: User, as: 'user', attributes: ['id','name', 'avatar'] }],
    });

    // Список id получателей (уникальный), исключая отправителя
    const recipientUserIds = Array.from(new Set(
      participants.map(p => p.user?.id).filter(id => id && (!senderIdNum || Number(id) !== senderIdNum))
    ));

    if (recipientUserIds.length === 0) {
      //console.log('Push: нет получателей (consult chat).');
    } else {
      // Берём push-токены для получателей
      const tokenRows = await PushToken.findAll({
        where: { userId: { [Op.in]: recipientUserIds } },
        attributes: ['token', 'userId'],
      });

      // Дедуплицируем токены и исключаем токены отправителя
      const tokens = Array.from(new Set(
        tokenRows
          .filter(r => r.token && (!senderIdNum || Number(r.userId) !== senderIdNum))
          .map(r => r.token)
      ));

      if (tokens.length === 0) {
        //console.log('Push: токены не найдены для получателей.');
      } else {
        // title/body — делаем информативно: кто отправил и имя файла
        const title = `${chatMsg.userName || 'Коллега'} отправил файл`;
        const body = decodedFileName || 'Файл';

        // Доп. данные (можно читать на клиенте из notification.data)
        const data = {
          screen: 'consultChat',
          messageId: payload._id,
          mediaUrl: payload.mediaUrl,
          fileName: decodedFileName,
        };

        //console.log('Push: отправляю', tokens.length, 'токенов, recipients:', recipientUserIds.length);
        await sendPushNotification(tokens, title, body, data);
        //console.log('Push: отправлено');
      }

    }


    return res.json(payload);
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ error: err.message });
  }
});


// Функция для поиска chatId по тексту лога из БАЗИСА
async function findChatIdByLog(logText) {
  if (typeof logText !== 'string') return null;

  // Сплит по разделителю '|' и берём третий элемент
  const parts = logText.split('|').map(s => s.trim());
  if (parts.length < 3) return null;

  // const chatName = parts[2];
  // if (!chatName) return null;

  // // Ищем чат с таким именем
  // const chat = await BossChat.findOne({
  //   where: {
  //     name: { [Op.iLike]: chatName }
  //   }
  // });

  // return chat ? chat.id : null;

  const chatId = Number(parts[2]); // Преобразуем строку в число
  // Проверяем, что получилось валидное число (не NaN) и, возможно, целое
  if (isNaN(chatId) || !Number.isInteger(chatId)) return null;

  return chatId;



}


// Функция для поиска userId по тексту лога из БАЗИСА
function extractMachineIdFromLog(logText) {
  if (typeof logText !== 'string') return null;

  const parts = logText
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return null;
  return parts[parts.length - 1] || null;
}

async function findUserIdByLog(logText) {
  const machineIdRaw = extractMachineIdFromLog(logText);
  if (!machineIdRaw) return null;

  const needle = String(machineIdRaw).trim().toLowerCase();
  if (!needle) return null;

  const users = await User.findAll({
    where: {
      machineId: { [Op.ne]: null },
    },
    attributes: ['id', 'machineId'],
  });

  for (const u of users) {
    const raw = String(u.machineId || '');
    const ids = raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (ids.includes(needle)) {
      return u.id;
    }
  }

  return null;
}

function slugifyBazisUserFolder(value) {
  const translit = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };

  return String(value || 'user')
    .trim()
    .toLowerCase()
    .split('')
    .map((ch) => Object.prototype.hasOwnProperty.call(translit, ch) ? translit[ch] : ch)
    .join('')
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_ .-]+|[_ .-]+$/g, '') || 'user';
}

router.post('/resolve-bazis-user', async (req, res) => {
  try {
    const { source, apiKey, logText, message } = req.body || {};

    if (source === 'bazis' && apiKey !== process.env.BAZIS_API_KEY) {
      return res.status(401).json({ ok: false, error: 'Invalid API key' });
    }

    const resolvedLogText = typeof logText === 'string' ? logText : (typeof message === 'string' ? message : '');
    const userIdNum = await findUserIdByLog(resolvedLogText);

    if (!userIdNum) {
      return res.status(404).json({ ok: false, error: 'User not found by MachineGuid' });
    }

    const user = await User.findByPk(userIdNum, {
      attributes: ['id', 'name'],
    });

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    return res.json({
      ok: true,
      userId: user.id,
      userName: user.name,
      userFolder: slugifyBazisUserFolder(user.name),
    });
  } catch (err) {
    console.error('Bazis user resolve error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;


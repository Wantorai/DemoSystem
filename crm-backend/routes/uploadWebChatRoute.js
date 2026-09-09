// routes/uploadWebChatRoute.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Room, RoomMessage, User, BossMessage, BossChat, PushToken, RoomUsers, BossChatUsers } = require('../models'); // модель для сообщений
const getIO = require('../socket').getIO;
const transcriptionQueue = require('../queues/transcriptionQueue');
const { sendPushNotification } = require('../services/sendPushNotification');
const { getOwnDomain, sendBridgePost } = require('../services/crossChatBridge');
const { ensureRoomChatNotArchived } = require('../services/crossChatArchiveAccess');
const { relayRoomMessageToExternalParticipants } = require('../services/roomExternalParticipants');
const { Op } = require('sequelize');
const ffmpeg = require('fluent-ffmpeg');
const { Buffer } = require('buffer');

try {
  ffmpeg.setFfmpegPath(require('ffmpeg-static'));
} catch (error) {
  console.warn('ffmpeg-static not available, using system ffmpeg if present:', error?.message || error);
}

const DEBUG = false;
const log = (...a) => DEBUG && console.log('[uploadWebChatRoute]', ...a);

const uploadExtensionFromMime = (value) => {
  const mime = String(value || '').trim().toLowerCase().split(';')[0];
  const extensions = {
    'audio/mp4': '.m4a',
    'video/mp4': '.mp4',
    'audio/webm': '.webm',
    'video/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
  };
  return extensions[mime] || '';
};

// Корень папки uploads (относительно корня проекта)
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_ROOT)) fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

// Конфигурация хранения файлов (с созданием подпапок)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const mime = file.mimetype || '';
    let subfolder = 'others';

    if (mime.startsWith('image/')) subfolder = 'images';
    else if (mime.startsWith('video/')) subfolder = 'videos';
    else if (mime.startsWith('audio/')) subfolder = 'audio';
    else if (
      mime === 'application/pdf' ||
      mime === 'application/msword' ||
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/vnd.ms-excel' ||
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mime === 'application/vnd.ms-powerpoint' ||
      mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ) {
      subfolder = 'docs';
    }

    const folder = path.join(UPLOAD_ROOT, subfolder);
    // убедимся, что папка существует
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
    cb(null, folder); // абсолютный путь -> multer сохранит туда
  },

  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const originalExt = path.extname(String(file.originalname || '')).toLowerCase();
    const mimeExt = uploadExtensionFromMime(file.mimetype);
    const ext = mimeExt || (/^\.[a-z0-9]{1,10}$/.test(originalExt) ? originalExt : '');
    cb(null, uniqueSuffix + ext);
  },
});

const upload = multer({ storage });
const compatibleAudioJobs = new Map();

function resolveUploadedFile(rawPath) {
  const relativePath = String(rawPath || '')
    .trim()
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/?uploads\/?/i, '')
    .replace(/^[/\\]+/, '');
  const absolutePath = path.resolve(UPLOAD_ROOT, relativePath);
  const relativeToRoot = path.relative(UPLOAD_ROOT, absolutePath);
  if (!relativePath || relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) return null;
  return absolutePath;
}

function createSafariCompatibleAudio(inputPath, outputPath) {
  const existingJob = compatibleAudioJobs.get(outputPath);
  if (existingJob) return existingJob;

  const job = new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('96k')
      .toFormat('mp3')
      .on('error', reject)
      .on('end', resolve)
      .save(outputPath);
  }).finally(() => compatibleAudioJobs.delete(outputPath));
  compatibleAudioJobs.set(outputPath, job);
  return job;
}

function fixFilenameEncoding(name) {
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
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

router.get('/download', (req, res) => {
  const rawPath = String(req.query.path || '').trim();
  const requestedName = String(req.query.name || '').trim();
  const relativePath = rawPath
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/?uploads\/?/i, '')
    .replace(/^[/\\]+/, '');
  const absolutePath = path.resolve(UPLOAD_ROOT, relativePath);
  const relativeToRoot = path.relative(UPLOAD_ROOT, absolutePath);

  if (
    !relativePath ||
    relativeToRoot.startsWith('..') ||
    path.isAbsolute(relativeToRoot)
  ) {
    return res.status(400).json({ error: 'Invalid file path' });
  }

  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return res.status(404).json({ error: 'File not found' });
  }

  const fallbackName = path.basename(absolutePath);
  const downloadName = path.basename(requestedName || fallbackName);
  return res.download(absolutePath, downloadName, (error) => {
    if (!error || res.headersSent) return;
    console.error('[uploadWebChatRoute] download failed', error);
    res.status(500).json({ error: 'Download failed' });
  });
});

// A single playback format for recordings created by the native app, Safari,
// Chrome/Android and desktop browsers. It also repairs old WebM/OGG recordings
// lazily, so existing messages do not need a database migration.
router.get('/audio-compatible', async (req, res) => {
  const inputPath = resolveUploadedFile(req.query.path);
  if (!inputPath) return res.status(400).json({ error: 'Invalid file path' });
  if (!fs.existsSync(inputPath) || !fs.statSync(inputPath).isFile()) {
    return res.status(404).json({ error: 'File not found' });
  }

  const extension = path.extname(inputPath).toLowerCase();
  const directlyPlayable = new Set(['.mp3', '.m4a', '.mp4', '.aac', '.wav']);
  if (directlyPlayable.has(extension)) return res.sendFile(inputPath);

  const outputPath = `${inputPath}.ios.mp3`;
  try {
    if (!fs.existsSync(outputPath)) await createSafariCompatibleAudio(inputPath, outputPath);
    res.type('audio/mpeg');
    return res.sendFile(outputPath);
  } catch (error) {
    console.error('[uploadWebChatRoute] compatible audio conversion failed', error);
    return res.status(500).json({ error: 'Audio conversion failed' });
  }
});



router.post('/fileFromWebchat', upload.single('file'), async (req, res) => {


  log('[UPLOADWEBCHATROUTES] start');

  try {
    const file = req.file;
    //log('file = ', file);

    // if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // Параметры из формы
    const { roomId, chatId, userId: bodyUserId, messageType } = req.body;
    const clientTempId = String(req.body?.tempId || '').trim().slice(0, 120) || null;
    const messageText = String(req.body?.messageText ?? req.body?.content ?? req.body?.caption ?? '').trim();
    const parsedReplyToMessageId = (() => {
      const raw = req.body?.replyToMessageId ?? req.body?.replyToMessage ?? null;
      if (raw == null || raw === '') return null;
      const num = Number(raw);
      return Number.isFinite(num) && num > 0 ? num : null;
    })();
    log('req.body = ', req.body);

    // Получение пользователя: попробуй req.user (если есть auth middleware), иначе по body.userId
    let user = null;
    if (req.user) {
      user = req.user;
    } else if (bodyUserId) {
      user = await User.findByPk(bodyUserId).catch(() => null);
    }
    //log('user = ', user);

    let cfg = {}; 

    const rawName = file.originalname || file.filename;
    const decodedName = fixFilenameEncoding(rawName);
    //log('decodedName = ', decodedName);


    // Формирование mediaUrl: нужно вернуть путь, который совпадает с express.static('/uploads')
    // file.path может быть абсолютным, убедимся что путь внутри UPLOAD_ROOT
    // Получим путь относительно UPLOAD_ROOT и добавим префикс /uploads/
    let rel = path.relative(UPLOAD_ROOT, file.path).replace(/\\/g, '/'); // e.g. "audio/12345.webm"
    if (!rel) {
      // На случай, если path.relative вернул пустую строку (маловероятно), fallback на filename
      rel = file.filename;
    }
    const mediaUrl = `/uploads/${rel}`;
    //log('mediaUrl = ', mediaUrl);

    const requestSource = String(req.body.source || '').trim().toLowerCase();
    if (requestSource === 'bazis') {
      if (req.body.apiKey !== process.env.BAZIS_API_KEY) {
        await fs.promises.unlink(file.path).catch(() => {});
        return res.status(401).json({ error: 'Invalid API key' });
      }
      return await handleBazisUpload({ req, res, file, mediaUrl });
    }

    // Определяем тип сообщения
    const normalizedMessageType = String(messageType || '').trim().toLowerCase();
    const mimeTypeLower = String(file.mimetype || '').trim().toLowerCase();
    const lowerName = String(decodedName || rawName || '').trim().toLowerCase();
    const voiceNameHint = /(record|voice|audio|mic|microphone|голос|аудио|запись)/i.test(lowerName);
    const isVoiceWebm =
      mimeTypeLower === 'video/webm' &&
      (normalizedMessageType === 'audio' || normalizedMessageType === 'voice' || voiceNameHint);
    let type = normalizedMessageType || (mimeTypeLower.startsWith('audio/') ? 'audio' : 'file');
    if (normalizedMessageType === 'voice') {
      type = 'audio';
    }
    if (!normalizedMessageType && isVoiceWebm) {
      type = 'audio';
    }
    log('type = ', type);

    // Собираем payload для записи в БД
    const messagePayload = {
      content: messageText,
      type,
      mediaUrl,
      mediaMimeType: file.mimetype,
      mediaName: decodedName,
      fileSize: file.size,
      userId: user ? user.id : (bodyUserId ? Number(bodyUserId) : null),
      createdAt: new Date(),
      updatedAt: new Date(),
      fileName: decodedName,
    };
    if (parsedReplyToMessageId) {
      messagePayload.replyToMessageId = parsedReplyToMessageId;
    }


    // Транскрибация 
    if (type === 'audio' || type === 'voice') {
      messagePayload.transcriptionStatus = 'pending'; // или 'queued' / 'processing' — как у вас принято
      messagePayload.transcriptionText = null;
      try {
        const audioMetadata = await new Promise((resolve, reject) => {
          ffmpeg.ffprobe(file.path, (err, metadata) => {
            if (err) return reject(err);
            resolve(metadata);
          });
        });
        if (
          audioMetadata &&
          audioMetadata.format &&
          typeof audioMetadata.format.duration === 'number'
        ) {
          // Храним в миллисекундах, чтобы мобильный UI сразу показывал корректно.
          messagePayload.duration = Math.max(0, Math.round(audioMetadata.format.duration * 1000));
        }
      } catch (err) {
        console.warn('Audio duration ffprobe failed:', err);
      }
    }



        // Если это видео — попробуем сгенерировать thumbnail и добавить thumbnailUrl в msgData
    if (type === 'video') {
        // Путь к сохранённому видео (multer положил файл.path)
        const videoPath = path.isAbsolute(file.path) ? file.path : path.join(process.cwd(), file.path);
        const folder = path.dirname(videoPath);

        // Название миниатюры
        const thumbFilename = `thumb_${Date.now()}_${Math.floor(Math.random() * 1e9)}.jpg`;
        const thumbPath = path.join(folder, thumbFilename);


        // helper: promisified ffprobe
            const ffprobeAsync = (filePath) => new Promise((resolve, reject) => {
            // fluent-ffmpeg предоставляет ffprobe
            ffmpeg.ffprobe(filePath, (err, metadata) => {
                if (err) return reject(err);
                return resolve(metadata);
            });
            });

            // helper: promisified screenshots
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
            // выполняем параллельно: создание скриншота и запрос метаданных
            const [ , metadata ] = await Promise.all([
                makeScreenshotAsync(videoPath, thumbFilename, folder).catch(err => {
                console.warn('thumbnail generation failed', err);
                // не бросаем — хотим, чтобы ffprobe всё равно мог выполниться
                return null;
                }),
                ffprobeAsync(videoPath).catch(err => {
                console.warn('ffprobe failed', err);
                return null;
                })
            ]);

            // thumbnailUrl — только если скриншот создался
            let thumbnailUrl = null;
            const thumbRel = thumbPath.replace(/\\/g, '/').match(/uploads\/.*/i);
            if (thumbRel) thumbnailUrl = `/${thumbRel[0]}`;
            else {
                // если скриншот не создан, thumbPath возможно не существует, но мы не падаем
                // можно попытаться сформировать fallback или оставить null
                // thumbnailUrl = null;
            }

            if (thumbnailUrl) {
                messagePayload.thumbnailUrl = thumbnailUrl;
            }

            // duration: берём из metadata.format.duration (секунды, float)
            if (metadata && metadata.format && typeof metadata.format.duration === 'number') {
                const durationSeconds = Math.round(metadata.format.duration); // округлённо в секундах
                messagePayload.duration = durationSeconds;
                // если хочешь хранить миллисекунды:
                // msgData.durationMillis = Math.round(metadata.format.duration * 1000);
            }

            } catch (err) {
            // общий fallback: логируем, но не прерываем создание сообщения
            console.warn('Video post-processing failed (thumbnail/duration):', err);
            }

    }





    let savedMessage = null;
    if (roomId) {
      try {
        await ensureRoomChatNotArchived(Number(roomId));
      } catch (archiveErr) {
        if (archiveErr?.status === 403) {
          return res.status(403).json({
            error: archiveErr.message || 'Чат в архиве',
            code: archiveErr.code || 'CROSS_CHAT_ARCHIVED',
          });
        }
        throw archiveErr;
      }
      messagePayload.roomId = Number(roomId);
      savedMessage = await RoomMessage.create(messagePayload);
      if (user) savedMessage.setDataValue('User', { id: user.id, name: user.name || user.username || null });
    } else if (chatId) {
      messagePayload.chatId = Number(chatId);
      savedMessage = await BossMessage.create(messagePayload);
      if (user) savedMessage.setDataValue('User', { id: user.id, name: user.name || user.username || null });
    } else {
      // Не указано — удаляем загруженный файл и возвращаем ошибку
      try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
      return res.status(400).json({ error: 'Either chatId or roomId must be provided' });
    }
    if (clientTempId) savedMessage.setDataValue('tempId', clientTempId);

    // Cross-domain bridge relay: mirror media/file/audio/video/image messages
    // for personal chats where peer is synthetic xbridge user.
    void (async () => {
    try {
      const relayAllowed = !req.body?.bridgeRelay;
      if (relayAllowed && roomId) {
        const roomIdNum = Number(roomId);
        const senderId = Number(user ? user.id : bodyUserId);
        const roomForBridge = await Room.findByPk(roomIdNum, {
          include: [{ model: User, through: { attributes: [] }, attributes: ['id', 'name', 'phone'] }],
        });

        if (['personal', 'group'].includes(String(roomForBridge?.type || '')) && Array.isArray(roomForBridge.Users)) {
          const selfUser = roomForBridge.Users.find((u) => Number(u.id) === senderId);
          const peerUsers = String(roomForBridge.type || '') === 'personal'
            ? [roomForBridge.Users.find((u) => Number(u.id) !== senderId)]
            : roomForBridge.Users.filter((u) => Number(u.id) !== senderId && parseBridgePhone(u?.phone));

          for (const peerUser of peerUsers) {
            const bridgePeer = parseBridgePhone(peerUser?.phone);
            if (!bridgePeer?.domain || !bridgePeer?.phone) continue;
            const ownDomain = getOwnDomain(req);
            const payload = {
              externalMessageId: String(savedMessage.id),
              sender: {
                userId: Number.isFinite(senderId) ? senderId : null,
                name: String(selfUser?.name || user?.name || `User ${bodyUserId || ''}`),
                phone: String(selfUser?.phone || user?.phone || '').replace(/\D/g, ''),
                domain: ownDomain,
              },
              target: {
                domain: bridgePeer.domain,
                phone: bridgePeer.phone,
              },
              message: {
                content: '',
                type: String(savedMessage.type || messageType || 'file'),
                clientId: String(savedMessage.clientId || ''),
                createdAt: new Date().toISOString(),
                mediaUrl: toAbsoluteMediaUrl(savedMessage.mediaUrl, ownDomain),
                thumbnailUrl: toAbsoluteMediaUrl(savedMessage.thumbnailUrl, ownDomain),
                fileName: savedMessage.fileName || null,
                fileSize: Number.isFinite(Number(savedMessage.fileSize)) ? Number(savedMessage.fileSize) : null,
                duration: Number.isFinite(Number(savedMessage.duration)) ? Number(savedMessage.duration) : null,
                mediaMimeType: savedMessage.mediaMimeType || file.mimetype || null,
                transcriptionText: savedMessage.transcriptionText || null,
                transcriptionStatus: savedMessage.transcriptionStatus || null,
              },
            };

            sendBridgePost(bridgePeer.domain, '/api/cross-chat/bridge/message', payload, ownDomain)
              .catch((relayErr) => {
                console.warn('[cross-chat][bridge][relay] failed:', relayErr?.message || relayErr);
              });
          }
        }
      }
    } catch (relayErr) {
      console.warn('[cross-chat][bridge][relay] unexpected:', relayErr?.message || relayErr);
    }
    })();



    if (roomId) {
      relayRoomMessageToExternalParticipants({
          roomId,
          senderName: user?.name || user?.username || `User ${bodyUserId || ''}` || 'Сотрудник',
          content: savedMessage?.content || '',
          message: savedMessage,
        })
        .catch((relayExternalErr) => {
        console.warn('[room-external][relay:upload-webchat] failed:', relayExternalErr?.message || relayExternalErr);
        });
    }
    // Сначала дадим upload-запросу завершиться. Если отправить socket-событие
    // синхронно, вкладка отправителя начинает тяжёлый рендер изображения раньше,
    // чем успевает обработать XHR.onload (особенно заметно на телефонах).
    const io = getIO();
    if (io) {
      setImmediate(() => {
        if (roomId) {
          io.to(`room-${roomId}`).emit('newRoomMessage', savedMessage);
        }
        if (chatId) {
          io.to(`chat-${chatId}`).emit('newBossChatMessage', savedMessage);
        }
      });
    } else {
      console.warn('[upload/file] io not found — no socket emit');
    }


    // --- Добавляем задачу транскрибации в очередь (только для аудио) ---
    try {
      const typeLower = (type || '').toLowerCase();
      if ((typeLower === 'audio' || typeLower === 'voice') && savedMessage.mediaUrl && transcriptionQueue) {
        const fileSystemPath = path.isAbsolute(file.path) ? file.path : path.join(process.cwd(), file.path);

        // подготовим контекст, чтобы воркер понимал, где message живёт
        const context = {};
        let workerModelName = ''
        if (roomId) {
            context.roomId = Number(roomId);
            workerModelName = 'RoomMessage'
        };
        
        if (chatId) {
            context.chatId = Number(chatId);
            workerModelName = 'BossMessage'
        }

        await transcriptionQueue.add(
          {
            messageId: savedMessage.id,
            model: workerModelName,
            mediaUrl: savedMessage.mediaUrl,
            mediaPath: fileSystemPath,
            context,
            userId: user ? Number(user.id) : null
          },
          { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
        );

        //log('transcription job added for message', savedMessage.id);
      }
    } catch (qErr) {
      console.error('Ошибка добавления транскрибации в очередь для message', savedMessage.id, qErr);

      // Гарантируем, что статус не останется подвешенным навсегда
      try {
        const Model = roomId ? RoomMessage : BossMessage;
        await Model.update(
          { transcriptionStatus: 'failed', transcriptionError: String(qErr).slice(0, 1000) },
          { where: { id: savedMessage.id } }
        );

        const updated = await Model.findByPk(savedMessage.id, {
          include: [{ model: User, attributes: ['id', 'name'] }]
        });

        if (io) {
          if (roomId) {
            io.to(`room-${roomId}`).emit('newRoomMessage', updated);
            log('emitted updated newRoomMessage (failed transcription) to', roomId);
          }
          if (chatId) {
            io.to(`chat-${chatId}`).emit('newBossChatMessage', updated);
            log('emitted updated newBossChatMessage (failed transcription) to', chatId);
          }
        }
      } catch (uErr) {
        console.error('Ошибка при установке failed статусa для message', savedMessage.id, uErr);
      }
    }







    // --- отправка push'ей ---
    let userIdNum = parseInt(req.body.userId, 10);
    (async () => {
        try {
        const senderId = userIdNum;          

        if (roomId) {
            cfg = {
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
        
        if (chatId) {
            cfg = {
            triggerField: 'chatId',
            idKey: 'chatId',
            model: BossMessage,
            participantsModel: BossChatUsers,
            socketPrefix: 'chat-',
            socketEvent: 'newBossChatMessage',
            workerModelName: 'BossMessage',
            pushScreen: 'BossChat',
            includeCreatedAt: true, // в исходнике вы задавали createdAt только для boss
          }
        }    

        log('senderId = ', senderId, 'cfg = ', cfg)

        const idNum = parseInt(req.body[cfg.triggerField], 10);

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
            log('нет получателей')
            return;
        }

        log('savedMessage = ', savedMessage);

        const full = await cfg.model.findByPk(savedMessage.id, { include: [{ model: User, attributes: ['id','name'] }] });

        const senderName = full.User?.name || (`User ${senderId}`);
        const title = `От ${senderName}`;
        const body = decodedName ? `Файл: ${decodedName}` : (req.body.messageText || 'НС:');

        const data = {
            screen: cfg.pushScreen,
            [cfg.idKey]: String(idNum),
            messageId: String(full.id),
            mediaUrl: full.mediaUrl || null,
            fileName: decodedName || null,
        };

        //log('tokens = ', tokens, 'title = ', title, 'body = ', body, 'data = ', data)

        await sendPushNotification(recipientUserIds, title, body, data);
        } catch (pushErr) {
        console.error(`Ошибка при отправке push-уведомлений (${cfg}):`, pushErr);
        }
    })();    


    return res.status(201).json(savedMessage);
  } catch (err) {
    console.error('[upload/file] error', err);
    return res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

async function handleBazisUpload({ req, res, file, mediaUrl }) {
  const logText = String(req.body.message || '');
  let chatIdNum = await findChatIdByLog(logText);
  if (!/yandexdisk/i.test(logText)) chatIdNum = 10;

  const resolvedUser = await resolveBazisUser(req.body.userId, logText);
  const userIdNum = resolvedUser?.id || null;

  if (!userIdNum || !chatIdNum) {
    return res.status(400).json({ error: 'Не удалось определить пользователя или чат из лога' });
  }
  if (!resolvedUser.isActive) return res.status(400).json({ error: 'Пользователь для сохранения файла отключён' });

  const isSpecialChat4 = chatIdNum === 4;

  const msgPayload = {
    content: logText,
    type: isSpecialChat4 ? 'text' : (req.body.messageType || 'document'),
    mediaUrl: isSpecialChat4 ? null : mediaUrl,
    fileName: isSpecialChat4 ? null : logText,
    fileSize: isSpecialChat4 ? null : file.size,
    mediaMimeType: isSpecialChat4 ? null : file.mimetype,
    chatId: chatIdNum,
    userId: userIdNum,
    createdAt: new Date(),
  };
  const bossMsg = await BossMessage.create(msgPayload);
  const bossMsgWithUser = await BossMessage.findByPk(bossMsg.id, {
    include: [{ model: User, attributes: ['id', 'name'] }],
  });
  const msgData = bossMsgWithUser.get({ plain: true });
  getIO().to(`chat-${chatIdNum}`).emit('newBossChatMessage', msgData);

  await sendPushNotification(
    userIdNum,
    `Новый файл из Базиса от ${resolvedUser.name}`,
    msgPayload.type || 'НС',
    { screen: 'bossChat' }
  );
  return res.json(msgData);
}


// Функция для поиска chatId по тексту лога из БАЗИСА
async function findChatIdByLog(logText) {
  if (typeof logText !== 'string') return null;

  // Сплит по разделителю '|' и берём третий элемент
  const parts = logText.split('|').map(s => s.trim());
  if (parts.length < 3) return null;

  const chatName = parts[2];
  if (!chatName) return null;

  // Ищем чат с таким именем
  const chat = await BossChat.findOne({
    where: {
      name: { [Op.iLike]: chatName }
    }
  });

  return chat ? chat.id : null;
}


// Функция для поиска userId по тексту лога из БАЗИСА
async function findUserIdByLog(logText) {
  if (typeof logText !== 'string') return null;

  // Берём часть до первой '|'
  const prefix = logText.split('|', 1)[0].trim();
  if (!prefix) return null;
  if (/^(user|пользователь)$/i.test(prefix)) return null;

  // 2) специальный кейс для конкретного системного пользователя Базиса
  if (prefix.includes('User-3810019848')) {
    return 2;
  }

  // Подгружаем всех пользователей (только name + id)
  const users = await User.findAll({
    attributes: ['id', 'name']
  });

  const normalize = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/\(.*?\)/g, ' ')
      .replace(/[^a-zа-я0-9]+/gi, ' ')
      .trim();

  const prefixNorm = normalize(prefix);
  if (!prefixNorm) return null;

  // 1) точный матч по нормализованному имени
  const exact = users.find((u) => normalize(u.name) === prefixNorm);
  if (exact) return exact.id;

  // 2) префикс/вхождение: "Иван" -> "Иван (тех)"
  const starts = users.find((u) => normalize(u.name).startsWith(prefixNorm));
  if (starts) return starts.id;

  const includes = users.find((u) => normalize(u.name).includes(prefixNorm) || prefixNorm.includes(normalize(u.name)));
  return includes ? includes.id : null;
}

async function resolveBazisUser(rawBodyUserId, logText) {
  const bodyValue = String(rawBodyUserId || '').trim();
  const bodyUserIdNum = Number(bodyValue);
  if (Number.isInteger(bodyUserIdNum) && bodyUserIdNum > 0) {
    const byId = await User.findByPk(bodyUserIdNum, { attributes: ['id', 'name', 'machineId', 'isActive'] });
    if (byId) return byId;
  }

  if (bodyValue) {
    const byBodyIdentity = await User.findOne({
      where: {
        [Op.or]: [
          { name: { [Op.iLike]: bodyValue } },
          { machineId: { [Op.iLike]: bodyValue } },
        ],
      },
      attributes: ['id', 'name', 'machineId', 'isActive'],
    });
    if (byBodyIdentity) return byBodyIdentity;
  }

  const machineIdFromLog = String(logText || '').match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i)?.[0];
  if (machineIdFromLog) {
    const byMachine = await User.findOne({
      where: { machineId: { [Op.iLike]: machineIdFromLog } },
      attributes: ['id', 'name', 'machineId', 'isActive'],
    });
    if (byMachine) return byMachine;
  }

  const legacyUserId = await findUserIdByLog(logText);
  return legacyUserId
    ? User.findByPk(legacyUserId, { attributes: ['id', 'name', 'machineId', 'isActive'] })
    : null;
}



module.exports = router;


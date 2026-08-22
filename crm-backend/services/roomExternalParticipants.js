const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const FormData = require('form-data');
const db = require('../models');
const { verifyRoomExternalInvitePayload } = require('./roomExternalInvite');
const { parseTelegramMessage } = require('./telegramMessageParser');
const transcriptionQueue = require('../queues/transcriptionQueue');
const {
  sendTelegramText,
  sendTelegramFile,
  getTelegramFile,
  getTelegramFileUrl,
} = require('./telegramApi');

const Room = db.sequelize.models.Room;
const RoomUsers = db.sequelize.models.RoomUsers;
const RoomExternalParticipant = db.sequelize.models.RoomExternalParticipant;
const RoomMessage = db.sequelize.models.RoomMessage;
const User = db.sequelize.models.User;

const sanitizeFileName = (value, fallback = 'file') => {
  const name = String(value || fallback).trim() || fallback;
  return Array.from(name)
    .map((char) => (char.charCodeAt(0) < 32 || /[\\/:*?"<>|]/.test(char) ? '_' : char))
    .join('')
    .slice(0, 140);
};

const extensionFromMime = (mimeType, fallback = '') => {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('jpeg')) return '.jpg';
  if (mime.includes('png')) return '.png';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('gif')) return '.gif';
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('mpeg')) return '.mp3';
  if (mime.includes('mp4')) return '.mp4';
  if (mime.includes('pdf')) return '.pdf';
  return fallback || '';
};

const folderForMedia = (type, mimeType) => {
  const mime = String(mimeType || '').toLowerCase();
  if (type === 'image' || mime.startsWith('image/')) return path.join('uploads', 'images');
  if (type === 'video' || mime.startsWith('video/')) return path.join('uploads', 'videos');
  if (type === 'audio' || mime.startsWith('audio/')) return path.join('uploads', 'audio');
  if (mime === 'application/pdf' || type === 'document') return path.join('uploads', 'docs');
  return path.join('uploads', 'others');
};

const primaryAttachment = (parsed) => {
  if (!parsed?.attachments) return null;
  return parsed.attachments.image || parsed.attachments.video || parsed.attachments.audio || parsed.attachments.document || null;
};

const downloadTelegramAttachment = async (attachment, messageType, botType = 'room') => {
  const fileId = String(attachment?.fileId || '').trim();
  if (!fileId) return null;
  const fileInfo = await getTelegramFile(fileId, botType);
  const tgFilePath = String(fileInfo?.file_path || '').trim();
  if (!tgFilePath) return null;

  const mimeType = String(attachment?.mimeType || '').trim() || (
    messageType === 'image' ? 'image/jpeg' :
    messageType === 'video' ? 'video/mp4' :
    messageType === 'audio' ? 'audio/ogg' :
    'application/octet-stream'
  );
  const originalName = sanitizeFileName(
    attachment?.filename || path.basename(tgFilePath) || `${messageType}${extensionFromMime(mimeType)}`
  );
  const ext = path.extname(originalName) || path.extname(tgFilePath) || extensionFromMime(mimeType);
  const base = path.basename(originalName, path.extname(originalName)) || messageType;
  const folder = folderForMedia(messageType, mimeType);
  await fs.promises.mkdir(path.resolve(folder), { recursive: true });
  const filename = sanitizeFileName(`${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${base}${ext}`);
  const relativePath = path.join(folder, filename).replace(/\\/g, '/');
  const absolutePath = path.resolve(relativePath);
  const url = getTelegramFileUrl(tgFilePath, botType);
  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: 120000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  await new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(absolutePath);
    response.data.pipe(stream);
    response.data.on('error', reject);
    stream.on('error', reject);
    stream.on('finish', resolve);
  });
  const stat = await fs.promises.stat(absolutePath).catch(() => null);
  return {
    mediaUrl: `/${relativePath}`,
    fileName: originalName,
    fileSize: Number(attachment?.size || stat?.size || 0) || null,
    duration: Number(attachment?.duration || 0) || null,
    mimeType,
    isVoice: Boolean(attachment?.voice),
  };
};

const absoluteUploadPath = (mediaUrl) => {
  const value = String(mediaUrl || '').trim();
  if (!value || /^https?:\/\//i.test(value)) return null;
  const normalized = value.replace(/^\/+/, '');
  if (!normalized.startsWith('uploads/')) return null;
  return path.resolve(normalized);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const telegramMethodForRoomMessage = (message) => {
  const type = String(message?.type || '').toLowerCase();
  const mime = String(message?.mediaMimeType || message?.mimeType || '').toLowerCase();
  const name = String(message?.fileName || message?.mediaUrl || '').toLowerCase();
  if (type === 'image' || mime.startsWith('image/')) return { method: 'sendPhoto', field: 'photo' };
  if (type === 'video' || mime.startsWith('video/')) return { method: 'sendVideo', field: 'video' };
  if (type === 'audio' || type === 'voice' || mime.startsWith('audio/')) {
    if (message?.isVoice || /\.ogg(\?.*)?$/i.test(name)) return { method: 'sendVoice', field: 'voice' };
    return { method: 'sendAudio', field: 'audio' };
  }
  return { method: 'sendDocument', field: 'document' };
};

const getMaxRoomToken = () => String(process.env.MAX_ROOM_TOKEN || process.env.MAX_TOKEN || '').trim();

const sendMaxText = async (maxUserId, text) => {
  const userId = String(maxUserId || '').trim();
  if (!userId || userId.startsWith('phone:')) return null;
  return axios.post(
    `https://platform-api2.max.ru/messages?user_id=${encodeURIComponent(userId)}`,
    { text },
    {
      headers: {
        Authorization: getMaxRoomToken(),
        'Content-Type': 'application/json',
      },
      timeout: 12000,
    }
  );
};

const maxMessageTypeFromAttachment = (attachment) => {
  const type = String(attachment?.type || '').toLowerCase();
  if (type === 'image' || type === 'video' || type === 'audio') return type;
  if (type === 'document' || type === 'file') return 'document';
  return 'file';
};

const downloadMaxAttachment = async (attachment, messageType) => {
  const payload = attachment?.payload || {};
  const url = String(payload.url || '').trim();
  if (!url) return null;
  const originalName = sanitizeFileName(
    payload.filename || payload.name || `${messageType}${extensionFromMime(payload.mime_type || payload.mimeType || '')}`,
    messageType || 'file'
  );
  const mimeType = String(payload.mime_type || payload.mimeType || '').trim() || (
    messageType === 'image' ? 'image/jpeg' :
    messageType === 'video' ? 'video/mp4' :
    messageType === 'audio' ? 'audio/mp4' :
    'application/octet-stream'
  );
  const ext = path.extname(originalName) || extensionFromMime(mimeType);
  const base = path.basename(originalName, path.extname(originalName)) || messageType || 'file';
  const folder = folderForMedia(messageType, mimeType);
  await fs.promises.mkdir(path.resolve(folder), { recursive: true });
  const filename = sanitizeFileName(`${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${base}${ext}`);
  const relativePath = path.join(folder, filename).replace(/\\/g, '/');
  const absolutePath = path.resolve(relativePath);
  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: 120000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    headers: getMaxRoomToken() ? { Authorization: getMaxRoomToken() } : undefined,
  });
  await new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(absolutePath);
    response.data.pipe(stream);
    response.data.on('error', reject);
    stream.on('error', reject);
    stream.on('finish', resolve);
  });
  const stat = await fs.promises.stat(absolutePath).catch(() => null);
  return {
    mediaUrl: `/${relativePath}`,
    fileName: originalName,
    fileSize: Number(payload.size || stat?.size || 0) || null,
    duration: Number(payload.duration || 0) || null,
    mimeType,
    absolutePath,
  };
};

const maxUploadTypeForRoomMessage = (message) => {
  const type = String(message?.type || '').toLowerCase();
  const mime = String(message?.mediaMimeType || message?.mimeType || '').toLowerCase();
  if (type === 'image' || mime.startsWith('image/')) return 'image';
  if (type === 'video' || mime.startsWith('video/')) return 'video';
  if (type === 'audio' || type === 'voice' || mime.startsWith('audio/')) return 'audio';
  return 'file';
};

const extractMaxUploadToken = (data, uploadType) => {
  if (!data) return null;
  if (data.token) return data.token;
  if (uploadType === 'image' && data.photos && typeof data.photos === 'object') {
    const key = Object.keys(data.photos)[0];
    if (key && data.photos[key]?.token) return data.photos[key].token;
  }
  const plural = uploadType === 'file' ? 'files' : `${uploadType}s`;
  const obj = data[plural];
  if (obj && typeof obj === 'object') {
    const key = Object.keys(obj)[0];
    if (key && obj[key]?.token) return obj[key].token;
  }
  if (data[uploadType]?.token) return data[uploadType].token;
  if (data.document?.token) return data.document.token;
  if (data.file?.token) return data.file.token;
  return null;
};

const postMaxMessageWithAttachmentRetry = async ({
  userId,
  token,
  messageBody,
  maxAttempts = 5,
  initialDelayMs = 1200,
  maxDelayMs = 8000,
}) => {
  let attempt = 0;
  let delayMs = initialDelayMs;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await axios.post(
        `https://platform-api2.max.ru/messages?user_id=${encodeURIComponent(userId)}`,
        messageBody,
        { headers: { Authorization: token, 'Content-Type': 'application/json' }, timeout: 12000 }
      );
    } catch (error) {
      const status = Number(error?.response?.status);
      const code = String(error?.response?.data?.code || '');
      if (!(status === 400 && code === 'attachment.not.ready') || attempt >= maxAttempts) {
        throw error;
      }
      await sleep(delayMs);
      delayMs = Math.min(Math.round(delayMs * 1.7), maxDelayMs);
    }
  }
  return null;
};

const sendMaxFile = async ({ maxUserId, filePath, fileName, mimeType, text, message }) => {
  const userId = String(maxUserId || '').trim();
  const token = getMaxRoomToken();
  if (!userId || !token || !filePath) return null;
  const uploadType = maxUploadTypeForRoomMessage(message);
  const uploadUrlResponse = await axios.post(
    `https://platform-api2.max.ru/uploads?type=${encodeURIComponent(uploadType)}`,
    {},
    { headers: { Authorization: token }, timeout: 30000 }
  );
  const uploadUrl = uploadUrlResponse.data?.url;
  let uploadToken = uploadUrlResponse.data?.token || null;
  if (!uploadUrl) throw new Error('MAX upload URL missing');

  const formData = new FormData();
  formData.append('data', fs.createReadStream(filePath), {
    filename: fileName || path.basename(filePath),
    contentType: mimeType || 'application/octet-stream',
  });
  const uploadResponse = await axios.post(uploadUrl, formData, {
    headers: { ...formData.getHeaders(), Authorization: token },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    responseType: uploadType === 'audio' ? 'text' : 'json',
    timeout: 120000,
  });
  if (!uploadToken && typeof uploadResponse.data === 'object') {
    uploadToken = extractMaxUploadToken(uploadResponse.data, uploadType);
  }
  if (!uploadToken) throw new Error('MAX upload token missing');

  await sleep(uploadType === 'image' ? 2000 : uploadType === 'audio' ? 1500 : 1000);

  const attachmentType = uploadType === 'file' ? 'document' : uploadType;
  const messageBody = {
    text: text || '',
    attachments: [{ type: attachmentType, payload: { token: uploadToken } }],
  };
  try {
    return await postMaxMessageWithAttachmentRetry({ userId, token, messageBody });
  } catch (error) {
    const status = Number(error?.response?.status);
    const code = String(error?.response?.data?.code || '');
    if (!(uploadType === 'file' && status === 400 && code === 'proto.payload')) throw error;
    return postMaxMessageWithAttachmentRetry({
      userId,
      token,
      messageBody: {
        text: text || '',
        attachments: [{ type: 'file', payload: { token: uploadToken } }],
      },
      maxAttempts: 4,
    });
  }
};

const linkRoomExternalParticipant = async ({ payload, kind, externalChatId, externalUserId, displayName }) => {
  const invite = verifyRoomExternalInvitePayload(payload);
  if (!invite || invite.kind !== kind) return { handled: false, reason: 'invalid_invite' };

  const room = await Room.findByPk(invite.roomId, {
    attributes: ['id', 'name', 'type', 'creatorUserId'],
  });
  if (!room || room.type !== 'group') return { handled: true, ok: false, reason: 'room_not_found' };

  const owner = await User.findOne({
    where: { id: invite.inviterId, isActive: true },
    attributes: ['id', 'name'],
  });
  if (!owner || Number(room.creatorUserId || 0) !== Number(owner.id)) {
    return { handled: true, ok: false, reason: 'owner_not_found' };
  }

  const ownerMembership = await RoomUsers.findOne({
    where: { roomId: room.id, userId: owner.id },
    attributes: ['roomId', 'userId'],
  });
  if (!ownerMembership) return { handled: true, ok: false, reason: 'owner_not_member' };

  const normalizedName = String(displayName || '').trim() || (kind === 'telegram' ? 'Telegram пользователь' : 'MAX пользователь');
  const [participant, created] = await RoomExternalParticipant.findOrCreate({
    where: {
      roomId: room.id,
      kind,
      externalChatId: String(externalChatId),
    },
    defaults: {
      externalUserId: externalUserId != null ? String(externalUserId) : null,
      displayName: normalizedName,
      invitedByUserId: owner.id,
      status: 'active',
      linkedAt: new Date(),
    },
  });

  if (!created) {
    await participant.update({
      externalUserId: externalUserId != null ? String(externalUserId) : participant.externalUserId,
      displayName: normalizedName,
      invitedByUserId: owner.id,
      status: 'active',
      linkedAt: participant.linkedAt || new Date(),
    });
  }

  const io = require('../socket').getIO?.();
  if (io) {
    io.to(`room-${room.id}`).emit('room:external_participants_updated', {
      roomId: Number(room.id),
      participant: participant.toJSON ? participant.toJSON() : participant,
    });
  }

  return {
    handled: true,
    ok: true,
    room,
    participant,
    created,
    text: `Вы подключены к группе «${room.name}». Теперь ваши сообщения боту будут попадать в этот общий чат.`,
  };
};

const handleTelegramRoomInviteStart = async ({ payload, telegramChatId, telegramUserId, username, botType = 'room' }) => {
  const result = await linkRoomExternalParticipant({
    payload,
    kind: 'telegram',
    externalChatId: telegramChatId,
    externalUserId: telegramUserId,
    displayName: username,
  });
  if (!result.handled) return result;
  const text = result.ok
    ? result.text
    : 'Эта ссылка больше недоступна. Попросите сотрудника создать новую.';
  await sendTelegramText(telegramChatId, text, botType).catch(() => {});
  return result;
};

const createRoomMessageFromTelegramParticipant = async ({ telegramChatId, telegramUserId, username, text, telegramMessageId, rawMessage }) => {
  const participant = await RoomExternalParticipant.findOne({
    where: {
      kind: 'telegram',
      externalChatId: String(telegramChatId),
      status: 'active',
    },
    include: [{ model: Room, as: 'room', attributes: ['id', 'name', 'type'] }],
    order: [['linkedAt', 'DESC'], ['updatedAt', 'DESC']],
  });

  if (!participant?.roomId) return { ok: false, reason: 'not_linked' };

  const displayName = String(username || participant.displayName || 'Telegram пользователь').trim();
  if (displayName && displayName !== participant.displayName) {
    await participant.update({
      externalUserId: telegramUserId != null ? String(telegramUserId) : participant.externalUserId,
      displayName,
    }).catch(() => {});
  }

  const parsed = parseTelegramMessage(rawMessage || { text }, 'room');
  const cleanText = String(parsed.text || text || '').trim();
  const attachment = primaryAttachment(parsed);
  const downloaded = attachment ? await downloadTelegramAttachment(attachment, parsed.messageType, 'room') : null;
  if (!cleanText && !downloaded?.mediaUrl) return { ok: false, reason: 'empty' };

  const clientId = telegramMessageId ? `telegram-room:${telegramChatId}:${telegramMessageId}` : null;
  let message;
  try {
    message = await RoomMessage.create({
      roomId: Number(participant.roomId),
      userId: Number(participant.invitedByUserId || 0) || null,
      content: cleanText,
      type: downloaded?.mediaUrl ? parsed.messageType : 'text',
      mediaUrl: downloaded?.mediaUrl || null,
      fileName: downloaded?.fileName || null,
      fileSize: downloaded?.fileSize || null,
      duration: downloaded?.duration || null,
      mediaMimeType: downloaded?.mimeType || null,
      externalAuthorKind: 'telegram',
      externalAuthorName: displayName,
      externalAuthorId: telegramUserId != null ? String(telegramUserId) : String(telegramChatId),
      clientId,
      deliveryStatus: 'sent',
      transcriptionStatus: downloaded?.mediaUrl && parsed.messageType === 'audio' ? 'pending' : null,
    });
  } catch (error) {
    if (clientId && error?.name === 'SequelizeUniqueConstraintError') {
      const existing = await RoomMessage.findOne({ where: { clientId } });
      if (existing) return { ok: true, duplicate: true, message: existing, roomId: Number(participant.roomId) };
    }
    throw error;
  }

  if (downloaded?.mediaUrl && parsed.messageType === 'audio') {
    transcriptionQueue.add(
      {
        messageId: message.id,
        model: 'RoomMessage',
        mediaUrl: downloaded.mediaUrl,
        mediaPath: downloaded.absolutePath,
        context: { roomId: Number(participant.roomId) },
        userId: Number(participant.invitedByUserId || 0) || null,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, timeout: 60000 }
    ).catch(async (qErr) => {
      console.error('[room-external][telegram][transcription] enqueue failed', qErr);
      await message.update({ transcriptionStatus: 'failed', transcriptionError: String(qErr).slice(0, 1000) }).catch(() => {});
    });
  }

  const full = await RoomMessage.findByPk(message.id, {
    include: [{ model: User, attributes: ['id', 'name', 'avatar'] }],
  });
  const io = require('../socket').getIO?.();
  if (io) io.to(`room-${participant.roomId}`).emit('newRoomMessage', full || message);
  return { ok: true, message: full || message, roomId: Number(participant.roomId) };
};


const createRoomMessageFromMaxParticipant = async ({ maxChatId, maxUserId, username, text, maxMessageId, rawMessage }) => {
  const participant = await RoomExternalParticipant.findOne({
    where: {
      kind: 'max',
      externalChatId: String(maxChatId),
      status: 'active',
    },
    include: [{ model: Room, as: 'room', attributes: ['id', 'name', 'type'] }],
    order: [['linkedAt', 'DESC'], ['updatedAt', 'DESC']],
  });

  if (!participant?.roomId) return { ok: false, reason: 'not_linked' };

  const displayName = String(username || participant.displayName || 'MAX пользователь').trim();
  if (displayName && displayName !== participant.displayName) {
    await participant.update({
      externalUserId: maxUserId != null ? String(maxUserId) : participant.externalUserId,
      displayName,
    }).catch(() => {});
  }

  const cleanText = String(text || '').trim();
  const firstAttachment = Array.isArray(rawMessage?.attachments) ? rawMessage.attachments[0] : null;
  const messageType = firstAttachment ? maxMessageTypeFromAttachment(firstAttachment) : 'text';
  const downloaded = firstAttachment ? await downloadMaxAttachment(firstAttachment, messageType) : null;
  if (!cleanText && !downloaded?.mediaUrl) return { ok: false, reason: 'empty' };

  const clientId = maxMessageId ? `max-room:${maxChatId}:${maxMessageId}` : null;
  let message;
  try {
    message = await RoomMessage.create({
      roomId: Number(participant.roomId),
      userId: Number(participant.invitedByUserId || 0) || null,
      content: cleanText,
      type: downloaded?.mediaUrl ? messageType : 'text',
      mediaUrl: downloaded?.mediaUrl || null,
      fileName: downloaded?.fileName || null,
      fileSize: downloaded?.fileSize || null,
      duration: downloaded?.duration || null,
      mediaMimeType: downloaded?.mimeType || null,
      externalAuthorKind: 'max',
      externalAuthorName: displayName,
      externalAuthorId: maxUserId != null ? String(maxUserId) : String(maxChatId),
      clientId,
      deliveryStatus: 'sent',
      transcriptionStatus: downloaded?.mediaUrl && messageType === 'audio' ? 'pending' : null,
    });
  } catch (error) {
    if (clientId && error?.name === 'SequelizeUniqueConstraintError') {
      const existing = await RoomMessage.findOne({ where: { clientId } });
      if (existing) return { ok: true, duplicate: true, message: existing, roomId: Number(participant.roomId) };
    }
    throw error;
  }

  if (downloaded?.mediaUrl && messageType === 'audio') {
    transcriptionQueue.add(
      {
        messageId: message.id,
        model: 'RoomMessage',
        mediaUrl: downloaded.mediaUrl,
        mediaPath: downloaded.absolutePath,
        context: { roomId: Number(participant.roomId) },
        userId: Number(participant.invitedByUserId || 0) || null,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, timeout: 60000 }
    ).catch(async (qErr) => {
      console.error('[room-external][max][transcription] enqueue failed', qErr);
      await message.update({ transcriptionStatus: 'failed', transcriptionError: String(qErr).slice(0, 1000) }).catch(() => {});
    });
  }

  const full = await RoomMessage.findByPk(message.id, {
    include: [{ model: User, attributes: ['id', 'name', 'avatar'] }],
  });
  const io = require('../socket').getIO?.();
  if (io) io.to(`room-${participant.roomId}`).emit('newRoomMessage', full || message);
  return { ok: true, message: full || message, roomId: Number(participant.roomId) };
};
const handleMaxRoomInviteStart = async ({ payload, maxChatId, maxUserId, username }) => {
  const result = await linkRoomExternalParticipant({
    payload,
    kind: 'max',
    externalChatId: maxChatId,
    externalUserId: maxUserId,
    displayName: username,
  });
  if (!result.handled) return result;
  const text = result.ok
    ? result.text
    : 'Эта ссылка больше недоступна. Попросите сотрудника создать новую.';
  await sendMaxText(maxUserId, text).catch(() => {});
  return result;
};

const relayRoomMessageToExternalParticipants = async ({ roomId, senderName, content, message }) => {
  const rid = Number(roomId || 0);
  const text = String(content || '').trim();
  const mediaUrl = String(message?.mediaUrl || '').trim();
  if (!rid || (!text && !mediaUrl)) return;

  const participants = await RoomExternalParticipant.findAll({
    where: { roomId: rid, status: 'active' },
  });
  if (!participants.length) return;

  const prefix = String(senderName || 'Сотрудник').trim() || 'Сотрудник';
  const outgoing = text ? `${prefix}: ${text}` : prefix;
  const mediaPath = absoluteUploadPath(mediaUrl);
  const results = await Promise.allSettled(participants.map((participant) => {
    if (participant.kind === 'telegram') {
      if (mediaPath) {
        const { method, field } = telegramMethodForRoomMessage(message);
        const rawFileName = String(message?.fileName || path.basename(mediaPath) || '').trim();
        const isVoiceLike =
          field === 'voice' ||
          Boolean(message?.isVoice) ||
          /^recording[-_]/i.test(rawFileName) ||
          /^voice[-_]/i.test(rawFileName);
        const ext = path.extname(rawFileName) || (field === 'audio' ? '.mp3' : field === 'voice' ? '.ogg' : '');
        const displayFileName = isVoiceLike ? `Голосовое сообщение${ext || ''}` : (rawFileName || path.basename(mediaPath));
        return sendTelegramFile({
          chatId: participant.externalChatId,
          filePath: mediaPath,
          fileName: displayFileName,
          mimeType: message?.mediaMimeType || undefined,
          method,
          field,
          caption: outgoing,
          extraFields: field === 'audio' && isVoiceLike
            ? { title: 'Голосовое сообщение', performer: prefix }
            : {},
          botType: 'room',
        });
      }
      return sendTelegramText(participant.externalChatId, outgoing, 'room');
    }
    if (participant.kind === 'max') {
      if (mediaPath) {
        return sendMaxFile({
          maxUserId: participant.externalUserId || participant.externalChatId,
          filePath: mediaPath,
          fileName: String(message?.fileName || path.basename(mediaPath) || '').trim(),
          mimeType: message?.mediaMimeType || undefined,
          text: outgoing,
          message,
        });
      }
      return sendMaxText(participant.externalUserId || participant.externalChatId, outgoing);
    }
    return Promise.resolve(null);
  }));
  results.forEach((result, index) => {
    if (result.status !== 'rejected') return;
    const participant = participants[index];
    console.error('[room-external][relay] failed', {
      roomId: rid,
      kind: participant?.kind,
      externalChatId: participant?.externalChatId,
      externalUserId: participant?.externalUserId,
      messageId: message?.id,
      type: message?.type,
      error: result.reason?.response?.data || result.reason?.message || result.reason,
    });
  });
};

module.exports = {
  linkRoomExternalParticipant,
  handleTelegramRoomInviteStart,
  createRoomMessageFromTelegramParticipant,
  createRoomMessageFromMaxParticipant,
  handleMaxRoomInviteStart,
  relayRoomMessageToExternalParticipants,
};

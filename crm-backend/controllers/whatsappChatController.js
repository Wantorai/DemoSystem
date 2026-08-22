const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const {
  WhatsAppChat,
  WhatsAppMessage,
  User,
  sequelize,
} = require('../models');
const { getIO } = require('../socket');
const {
  sendWhatsAppText,
  sendWhatsAppFile,
  getWhatsAppFile,
  downloadWhatsAppFile,
  createPersonalInvitePayload,
  getToken,
  getPhoneNumberId,
  getBusinessPhoneNumber,
} = require('../services/whatsappApi');
const { parseWhatsAppMessage } = require('../services/whatsappMessageParser');

const normalizeParticipantIds = (value) => Array.from(new Set(
  (Array.isArray(value) ? value : [])
    .map(Number)
    .filter((id) => Number.isFinite(id) && id > 0)
));

const isPersonalChat = (chat) => String(chat?.botType || 'business') === 'personal';
const canAccessChat = (chat, userId) =>
  !isPersonalChat(chat)
  || Number(chat?.assigneeId || 0) === Number(userId || 0);

const ensureChatAccess = (chat, userId, res) => {
  if (canAccessChat(chat, userId)) return true;
  res.status(404).json({ error: 'Чат не найден' });
  return false;
};

const visibleChatsWhere = (userId) => ({
  [Op.or]: [
    { botType: 'business' },
    { botType: 'personal', assigneeId: Number(userId || 0) },
  ],
});

const normalizeUploadedFilename = (value) => {
  const source = String(value || '').trim();
  if (!source) return '';
  const cyrillicMojibakeMarkers = source.match(/[РС]/g) || [];
  const looksMojibake = /[ÃÐÑ]/.test(source)
    || (cyrillicMojibakeMarkers.length >= 2 && /[РС][А-Яа-яЁё]/.test(source));
  if (!looksMojibake) return source;
  try {
    const cp1251SpecialBytes = {
      '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87,
      '‰': 0x89, '‹': 0x8B, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94,
      '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99, '›': 0x9B, '№': 0xB9,
    };
    const bytes = Array.from(source, (char) => {
      if (cp1251SpecialBytes[char] !== undefined) return cp1251SpecialBytes[char];
      const code = char.charCodeAt(0);
      if (code >= 0x0410 && code <= 0x044F) return code - 0x0350;
      if (code === 0x0401) return 0xA8;
      if (code === 0x0451) return 0xB8;
      return code & 0xFF;
    });
    const restored = Buffer.from(bytes).toString('utf8');
    return restored.includes('\uFFFD') ? source : restored;
  } catch {
    return source;
  }
};

const isWhatsAppVoiceCompatibleFile = (file) => {
  const mime = String(file?.mimetype || '').toLowerCase();
  const name = String(file?.originalname || file?.filename || '').toLowerCase();
  return (
    mime.includes('ogg')
    || mime.includes('opus')
    || mime.includes('webm')
    || /\.(ogg|oga|opus|webm)$/i.test(name)
  );
};

const convertAudioToWhatsAppVoice = (inputPath, outputPath) => new Promise((resolve, reject) => {
  ffmpeg(inputPath)
    .noVideo()
    .audioCodec('libopus')
    .audioChannels(1)
    .audioFrequency(48000)
    .audioBitrate('32k')
    .format('ogg')
    .outputOptions(['-application voip'])
    .on('end', resolve)
    .on('error', reject)
    .save(outputPath);
});

const sendWhatsAppAudioFile = async ({
  chatId,
  file,
  fileName,
  caption,
  botType,
  duration,
}) => {
  let convertedPath = null;
  let voicePath = file.path;
  let voiceFileName = fileName || file.filename || 'voice.ogg';
  let voiceMimeType = file.mimetype || 'application/octet-stream';

  if (!isWhatsAppVoiceCompatibleFile(file)) {
    convertedPath = path.join(
      path.dirname(file.path),
      `${path.parse(file.filename || file.originalname || 'recording').name}-${Date.now()}.ogg`
    );
    try {
      await convertAudioToWhatsAppVoice(file.path, convertedPath);
      voicePath = convertedPath;
      voiceFileName = `${path.parse(fileName || file.filename || 'recording').name}.ogg`;
      voiceMimeType = 'audio/ogg';
    } catch (error) {
      console.warn('[WhatsApp] audio conversion to voice failed, falling back to sendAudio', {
        message: error?.message || String(error),
      });
    }
  }

  const extraFields = duration > 0 ? { duration } : {};

  try {
    if (voicePath === convertedPath || isWhatsAppVoiceCompatibleFile(file)) {
      return await sendWhatsAppFile({
        chatId,
        filePath: voicePath,
        fileName: voiceFileName,
        mimeType: voiceMimeType,
        method: 'sendVoice',
        field: 'voice',
        caption,
        botType,
        extraFields,
      });
    }
  } catch (error) {
    console.warn('[WhatsApp] sendVoice failed, falling back to sendAudio', {
      description: error?.whatsappDescription || error?.response?.data?.description || error?.message || String(error),
    });
  } finally {
    if (convertedPath && fs.existsSync(convertedPath)) {
      try { fs.unlinkSync(convertedPath); } catch {}
    }
  }

  return sendWhatsAppFile({
    chatId,
    filePath: file.path,
    fileName,
    mimeType: file.mimetype,
    method: 'sendAudio',
    field: 'audio',
    caption,
    botType,
    extraFields,
  });
};

const membershipFor = (chat, userId) => {
  const ownerId = Number(chat?.assigneeId || 0);
  const me = Number(userId || 0);
  const participantIds = normalizeParticipantIds(chat?.participantIds);
  return {
    participantIds,
    isOwner: ownerId > 0 && ownerId === me,
    isParticipant: ownerId !== me && participantIds.includes(me),
  };
};

const ensureWhatsAppAccess = (req, res) => {
  if (!String(process.env.WHATSAPP_TOKEN || '').trim()) {
    res.status(503).json({ error: 'WhatsApp не подключен на этом сервере' });
    return false;
  }
  if (req.user?.canWhatsApp === false) {
    res.status(403).json({ error: 'Доступ к WhatsApp чатам отключен' });
    return false;
  }
  return true;
};

const emitWhatsApp = (event, _chatId, payload, botType = 'business', personalOwnerId = null) => {
  const io = getIO();
  if (botType === 'personal') {
    const ownerId = Number(personalOwnerId || 0);
    if (ownerId > 0) io.to(`user:${ownerId}`).emit(event, payload);
    return;
  }
  io.emit(event, payload);
};

const formatChat = (chat, currentUserId) => {
  const plain = chat.get ? chat.get({ plain: true }) : chat;
  const membership = membershipFor(plain, currentUserId);
  return {
    id: plain.id,
    username: plain.username,
    lastMessage: plain.lastMessage || plain.lastMessageText || 'Медиафайл',
    lastMessageText: plain.lastMessageText || '',
    lastMessageTime: plain.lastMessageTime || plain.updatedAt,
    unreadCount: Number(plain.unreadCount || 0),
    updatedAt: plain.updatedAt,
    createdAt: plain.createdAt,
    assigneeId: plain.assigneeId || null,
    assigneeName: plain.assignee?.name || null,
    participantIds: membership.participantIds,
    isOwner: membership.isOwner,
    isParticipant: membership.isParticipant,
    isAssignedToMe: membership.isOwner,
    archived: Boolean(plain.archivedAt),
    archivedAt: plain.archivedAt || null,
    isClosed: Boolean(plain.isClosed),
    whatsappChatId: plain.whatsappChatId,
    whatsappUserId: plain.whatsappUserId,
    botType: plain.botType || 'business',
    isPersonal: String(plain.botType || 'business') === 'personal',
  };
};

exports.getWhatsAppChats = async (req, res) => {
  try {
    if (!ensureWhatsAppAccess(req, res)) return;
    const chats = await WhatsAppChat.findAll({
      where: visibleChatsWhere(req.user?.id),
      order: [['updatedAt', 'DESC']],
      include: [{
        model: User,
        as: 'assignee',
        attributes: ['id', 'name'],
        required: false,
      }],
    });
    return res.json(chats.map((chat) => formatChat(chat, req.user?.id)));
  } catch (error) {
    console.error('[WhatsApp] get chats failed', error);
    return res.status(500).json({ error: 'Не удалось получить WhatsApp чаты' });
  }
};

exports.getChat = async (req, res) => {
  try {
    if (!ensureWhatsAppAccess(req, res)) return;
    const chat = await WhatsAppChat.findByPk(req.params.id, {
      include: [{
        model: User,
        as: 'assignee',
        attributes: ['id', 'name', 'phone'],
        required: false,
      }],
    });
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });
    if (!ensureChatAccess(chat, req.user?.id, res)) return;
    return res.json(formatChat(chat, req.user?.id));
  } catch (error) {
    console.error('[WhatsApp] get chat failed', error);
    return res.status(500).json({ error: 'Не удалось получить WhatsApp чат' });
  }
};

exports.getMessagesByChat = async (req, res) => {
  try {
    if (!ensureWhatsAppAccess(req, res)) return;
    const chat = await WhatsAppChat.findByPk(req.params.id);
    if (!chat || !ensureChatAccess(chat, req.user?.id, res)) return;
    const messages = await WhatsAppMessage.findAll({
      where: { wChatId: req.params.id },
      order: [['createdAt', 'ASC']],
    });
    return res.json(messages);
  } catch (error) {
    console.error('[WhatsApp] get messages failed', error);
    return res.status(500).json({ error: 'Не удалось получить сообщения' });
  }
};

exports.markChatAsRead = async (req, res) => {
  try {
    if (!ensureWhatsAppAccess(req, res)) return;
    const chat = await WhatsAppChat.findByPk(req.params.id);
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });
    if (!ensureChatAccess(chat, req.user?.id, res)) return;
    const [markedAsRead] = await WhatsAppMessage.update(
      { isRead: true },
      { where: { wChatId: chat.id, fromMe: false, isRead: false } }
    );
    await chat.update({ unreadCount: 0 });
    emitWhatsApp(
      'whatsapp:chat-read',
      chat.id,
      { chatId: chat.id, unreadCount: 0 },
      chat.botType,
      chat.assigneeId
    );
    return res.json({ success: true, markedAsRead, unreadCount: 0 });
  } catch (error) {
    console.error('[WhatsApp] mark read failed', error);
    return res.status(500).json({ error: 'Не удалось отметить чат прочитанным' });
  }
};

const ensureCanSend = async (chat, senderId) => {
  const numericSenderId = Number(senderId || 0);
  if (isPersonalChat(chat)) {
    if (Number(chat.assigneeId || 0) !== numericSenderId) {
      const error = new Error('Чат не найден');
      error.status = 404;
      throw error;
    }
    return false;
  }
  const participantIds = normalizeParticipantIds(chat.participantIds);
  let wasAssigned = false;
  if (!chat.assigneeId) {
    chat.assigneeId = numericSenderId;
    chat.participantIds = participantIds.filter((id) => id !== numericSenderId);
    await chat.save();
    wasAssigned = true;
  } else if (
    Number(chat.assigneeId) !== numericSenderId &&
    !participantIds.includes(numericSenderId)
  ) {
    const error = new Error('Чат уже взят другим сотрудником');
    error.status = 403;
    throw error;
  }
  return wasAssigned;
};

exports.createPersonalInvite = async (req, res) => {
  try {
    if (!ensureWhatsAppAccess(req, res)) return;
    const userId = Number(req.user?.id || 0);
    const businessPhone = getBusinessPhoneNumber();
    if (!businessPhone) {
      return res.status(503).json({ error: 'Номер WhatsApp Business не настроен' });
    }
    const invite = createPersonalInvitePayload(userId);
    if (!invite) {
      return res.status(503).json({ error: 'Секрет личных WhatsApp-приглашений не настроен' });
    }
    const text = `/start ${invite.payload}`;
    return res.json({
      success: true,
      url: `https://wa.me/${businessPhone}?text=${encodeURIComponent(text)}`,
      expiresAt: invite.expiresAt,
      phone: businessPhone,
    });
  } catch (error) {
    console.error('[WhatsAppPersonal] create invite failed', error?.response?.data || error);
    return res.status(500).json({ error: 'Не удалось создать ссылку личного чата' });
  }
};

exports.getPersonalStatus = async (req, res) => {
  try {
    if (!ensureWhatsAppAccess(req, res)) return;
    const tokenConfigured = Boolean(getToken());
    const phoneNumberIdConfigured = Boolean(getPhoneNumberId());
    const businessPhone = getBusinessPhoneNumber();
    const inviteSecretConfigured = Boolean(
      process.env.WHATSAPP_PERSONAL_INVITE_SECRET
      || process.env.WHATSAPP_WEBHOOK_SECRET
    );
    const [personalChatsCount] = await Promise.all([
      WhatsAppChat.count({
        where: {
          botType: 'personal',
          assigneeId: Number(req.user?.id || 0),
        },
      }),
    ]);
    return res.json({
      success: true,
      tokenConfigured,
      phoneNumberIdConfigured,
      inviteSecretConfigured,
      phone: businessPhone,
      personalChatsCount,
      webhook: null,
    });
  } catch (error) {
    console.error('[WhatsAppPersonal][status] failed', error?.response?.data || error);
    return res.status(500).json({ error: 'Не удалось проверить личного WhatsApp-бота' });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    if (!ensureWhatsAppAccess(req, res)) return;
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Введите сообщение' });
    const chat = await WhatsAppChat.findByPk(req.params.id);
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });
    if (!ensureChatAccess(chat, req.user?.id, res)) return;
    const senderId = Number(req.user?.id || req.body?.senderId || 0);
    const senderName = req.user?.name || req.body?.senderName || null;
    const wasAssigned = await ensureCanSend(chat, senderId);
    const sent = await sendWhatsAppText(chat.whatsappChatId, text);
    const message = await WhatsAppMessage.create({
      wChatId: chat.id,
      whatsappMessageId: String(sent.message_id),
      text,
      fromMe: true,
      messageType: 'text',
      senderName,
      senderId: String(senderId),
    });
    emitWhatsApp('whatsapp:new-message', chat.id, { chatId: chat.id, message }, chat.botType, chat.assigneeId);
    if (wasAssigned) {
      emitWhatsApp('whatsapp:chat-membership-updated', chat.id, {
        chatId: chat.id,
        assigneeId: senderId,
        participantIds: normalizeParticipantIds(chat.participantIds),
      }, chat.botType, chat.assigneeId);
    }
    return res.json({
      success: true,
      message,
      whatsappSent: true,
      maxSent: true,
      chat: {
        ...formatChat(chat, senderId),
        wasAssigned,
      },
    });
  } catch (error) {
    console.error('[WhatsApp] send text failed', error?.response?.data || error);
    return res.status(error.status || 500).json({ error: error.message || 'Не удалось отправить сообщение' });
  }
};

const sendMedia = (method, field, messageType) => async (req, res) => {
  const file = req.file;
  try {
    if (!ensureWhatsAppAccess(req, res)) return;
    if (!file) return res.status(400).json({ error: 'Файл не получен' });
    const chat = await WhatsAppChat.findByPk(req.params.id);
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });
    if (!ensureChatAccess(chat, req.user?.id, res)) return;
    const senderId = Number(req.user?.id || req.body?.senderId || 0);
    const senderName = req.user?.name || req.body?.senderName || null;
    const uploadedFileName = normalizeUploadedFilename(file.originalname || file.filename);
    const wasAssigned = await ensureCanSend(chat, senderId);
    const duration = Math.max(0, Math.round(Number(req.body?.duration || 0)));
    const sent = messageType === 'audio'
      ? await sendWhatsAppAudioFile({
          chatId: chat.whatsappChatId,
          file,
          fileName: uploadedFileName || file.filename,
          caption: req.body?.text || '',
          botType: chat.botType,
          duration,
        })
      : await sendWhatsAppFile({
          chatId: chat.whatsappChatId,
          filePath: file.path,
          fileName: uploadedFileName || file.filename,
          mimeType: file.mimetype,
          method,
          field,
          caption: req.body?.text || '',
          botType: chat.botType,
          extraFields: duration > 0 && method === 'sendVideo'
            ? { duration }
            : {},
        });
    const parsed = parseWhatsAppMessage(sent, chat.botType);
    const message = await WhatsAppMessage.create({
      wChatId: chat.id,
      whatsappMessageId: String(sent.message_id),
      text: parsed.text,
      fromMe: true,
      messageType: parsed.messageType || messageType,
      attachments: parsed.attachments,
      senderName,
      senderId: String(senderId),
    });
    emitWhatsApp('whatsapp:new-message', chat.id, { chatId: chat.id, message }, chat.botType, chat.assigneeId);
    if (wasAssigned) {
      emitWhatsApp('whatsapp:chat-membership-updated', chat.id, {
        chatId: chat.id,
        assigneeId: senderId,
        participantIds: normalizeParticipantIds(chat.participantIds),
      }, chat.botType, chat.assigneeId);
    }
    return res.json(message);
  } catch (error) {
    console.error(`[WhatsApp] ${method} failed`, error?.response?.data || error);
    return res.status(error.status || 500).json({ error: error.message || 'Не удалось отправить файл' });
  } finally {
    if (file?.path && fs.existsSync(file.path)) {
      try { fs.unlinkSync(file.path); } catch {}
    }
  }
};

exports.sendAudio = sendMedia('sendVoice', 'voice', 'audio');
exports.sendImage = sendMedia('sendPhoto', 'photo', 'image');
exports.sendVideo = sendMedia('sendVideo', 'video', 'video');
exports.sendDocument = sendMedia('sendDocument', 'document', 'document');

exports.proxyFile = async (req, res) => {
  try {
    const file = await getWhatsAppFile(req.params.fileId);
    if (!file?.url) return res.status(404).json({ error: 'Файл не найден' });
    const response = await downloadWhatsAppFile(file.url);
    const requestedName = String(req.query?.filename || '').trim();
    const fallbackName = `whatsapp-${req.params.fileId}`;
    const filename = (requestedName || fallbackName || 'whatsapp-file')
      .replace(/[\r\n"]/g, '_');
    const disposition = req.query?.download === '1' ? 'attachment' : 'inline';
    const encodedFilename = encodeURIComponent(filename);
    const extension = path.extname(filename).toLowerCase();
    const mimeByExtension = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.mp3': 'audio/mpeg',
      '.ogg': 'audio/ogg',
      '.webm': 'audio/webm',
      '.mp4': 'video/mp4',
    };
    const upstreamType = String(response.headers?.['content-type'] || file.mime_type || '');
    const contentType = !upstreamType || upstreamType === 'application/octet-stream'
      ? (mimeByExtension[extension] || 'application/octet-stream')
      : upstreamType;
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${filename.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodedFilename}`
    );
    if (response.headers?.['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }
    res.setHeader('Cache-Control', 'private, max-age=3600');
    response.data.pipe(res);
  } catch (error) {
    console.error('[WhatsApp] proxy file failed', error?.response?.data || error);
    res.status(502).json({ error: 'Не удалось загрузить файл из WhatsApp' });
  }
};

exports.getTotalUnreadCount = async (req, res) => {
  try {
    if (!ensureWhatsAppAccess(req, res)) return;
    const count = await WhatsAppMessage.count({
      where: { fromMe: false, isRead: false },
      include: [{
        model: WhatsAppChat,
        required: true,
        where: visibleChatsWhere(req.user?.id),
        attributes: [],
      }],
    });
    return res.json({ success: true, count });
  } catch (error) {
    return res.status(500).json({ error: 'Не удалось получить непрочитанные' });
  }
};

exports.assignChat = async (req, res) => {
  try {
    if (!ensureWhatsAppAccess(req, res)) return;
    const chat = await WhatsAppChat.findByPk(req.params.id);
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });
    if (!ensureChatAccess(chat, req.user?.id, res)) return;
    if (isPersonalChat(chat)) {
      return res.status(400).json({ error: 'Личный чат уже закреплен за владельцем' });
    }
    const userId = Number(req.user.id);
    const participants = normalizeParticipantIds(chat.participantIds);
    const isOwner = Number(chat.assigneeId || 0) === userId;
    if (!chat.assigneeId) {
      chat.assigneeId = userId;
      chat.participantIds = participants.filter((id) => id !== userId);
      await chat.save();
    } else if (!isOwner && !participants.includes(userId)) {
      participants.push(userId);
      chat.participantIds = participants;
      await chat.save();
    }
    const payload = {
      chatId: chat.id,
      assigneeId: chat.assigneeId || null,
      participantIds: normalizeParticipantIds(chat.participantIds),
    };
    emitWhatsApp('whatsapp:chat-membership-updated', chat.id, payload, chat.botType, chat.assigneeId);
    return res.json({ success: true, chat: formatChat(chat, userId) });
  } catch (error) {
    return res.status(500).json({ error: 'Не удалось присоединиться к чату' });
  }
};

exports.unassignChat = async (req, res) => {
  try {
    if (!ensureWhatsAppAccess(req, res)) return;
    const chat = await WhatsAppChat.findByPk(req.params.id);
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });
    if (!ensureChatAccess(chat, req.user?.id, res)) return;
    if (isPersonalChat(chat)) {
      return res.status(400).json({ error: 'Личный чат нельзя освободить' });
    }
    const userId = Number(req.user.id);
    const participants = normalizeParticipantIds(chat.participantIds);
    const isOwner = Number(chat.assigneeId || 0) === userId;
    if (!isOwner && !participants.includes(userId)) {
      return res.status(403).json({ error: 'Вы не участвуете в этом чате' });
    }
    if (isOwner) chat.assigneeId = null;
    chat.participantIds = participants.filter((id) => id !== userId);
    await chat.save();
    const payload = {
      chatId: chat.id,
      assigneeId: chat.assigneeId || null,
      participantIds: normalizeParticipantIds(chat.participantIds),
    };
    emitWhatsApp('whatsapp:chat-membership-updated', chat.id, payload, chat.botType, chat.assigneeId);
    return res.json({ success: true, chat: formatChat(chat, userId) });
  } catch (error) {
    return res.status(500).json({ error: 'Не удалось выйти из чата' });
  }
};

exports.renameChat = async (req, res) => {
  try {
    if (!ensureWhatsAppAccess(req, res)) return;
    const chat = await WhatsAppChat.findByPk(req.params.id);
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });
    if (!ensureChatAccess(chat, req.user?.id, res)) return;
    if (Number(chat.assigneeId || 0) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Переименовать чат может только владелец' });
    }
    const username = String(req.body?.username || req.body?.title || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (!username) return res.status(400).json({ error: 'Укажите название чата' });
    await chat.update({ username });
    const payload = { chatId: chat.id, username, updatedAt: chat.updatedAt };
    emitWhatsApp('whatsapp:chat-renamed', chat.id, payload, chat.botType, chat.assigneeId);
    return res.json({ success: true, chat: payload });
  } catch (error) {
    return res.status(500).json({ error: 'Не удалось переименовать чат' });
  }
};

exports.archiveChat = async (req, res) => {
  try {
    if (!ensureWhatsAppAccess(req, res)) return;
    const chat = await WhatsAppChat.findByPk(req.params.id);
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });
    if (!ensureChatAccess(chat, req.user?.id, res)) return;
    if (Number(chat.assigneeId || 0) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Архивировать чат может только владелец' });
    }
    const archived = req.body?.archived === true;
    await chat.update({ archivedAt: archived ? new Date() : null });
    const payload = { chatId: chat.id, archived, archivedAt: chat.archivedAt };
    emitWhatsApp('whatsapp:chat-archived', chat.id, payload, chat.botType, chat.assigneeId);
    return res.json({ success: true, chat: payload });
  } catch (error) {
    return res.status(500).json({ error: 'Не удалось изменить архив' });
  }
};

exports.deleteChat = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    if (!ensureWhatsAppAccess(req, res)) {
      await transaction.rollback();
      return;
    }
    const chat = await WhatsAppChat.findByPk(req.params.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!chat) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Чат не найден' });
    }
    if (!ensureChatAccess(chat, req.user?.id, res)) {
      await transaction.rollback();
      return;
    }
    if (Number(chat.assigneeId || 0) !== Number(req.user.id)) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Удалить чат может только владелец' });
    }
    const deletedBotType = chat.botType;
    const deletedAssigneeId = chat.assigneeId;
    await WhatsAppMessage.destroy({ where: { wChatId: chat.id }, transaction });
    await chat.destroy({ transaction });
    await transaction.commit();
    emitWhatsApp('whatsapp:chat-deleted', Number(req.params.id), {
      chatId: Number(req.params.id),
    }, deletedBotType, deletedAssigneeId);
    return res.json({ success: true });
  } catch (error) {
    await transaction.rollback();
    console.error('[WhatsApp] delete chat failed', error);
    return res.status(500).json({ error: 'Не удалось удалить чат' });
  }
};


const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const {
  TelegramChat,
  TelegramMessage,
  User,
  sequelize,
} = require('../models');
const { getIO } = require('../socket');
const {
  sendTelegramText,
  sendTelegramFile,
  getTelegramFile,
  getTelegramFileUrl,
  createPersonalInvitePayload,
  getPersonalBotUsername,
  getToken,
  telegramRequest,
} = require('../services/telegramApi');
const { parseTelegramMessage } = require('../services/telegramMessageParser');
const { withReactions, toggleReaction } = require('../services/externalMessageReactions');

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

const escapeTelegramHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const formatPersonalOutgoingText = (text, senderName) => {
  const name = String(senderName || 'Сотрудник').trim() || 'Сотрудник';
  const body = String(text || '').trim();
  return `🔹 <b>${escapeTelegramHtml(name)}</b>${body ? `\n\n${escapeTelegramHtml(body)}` : ''}`;
};

const personalOutgoingOptions = (chat, senderName, text) => {
  if (!isPersonalChat(chat)) {
    return { text: String(text || ''), parseMode: null };
  }
  return {
    text: formatPersonalOutgoingText(text, senderName),
    parseMode: 'HTML',
  };
};

const isTelegramVoiceCompatibleFile = (file) => {
  const mime = String(file?.mimetype || '').toLowerCase();
  const name = String(file?.originalname || file?.filename || '').toLowerCase();
  return (
    mime.includes('ogg')
    || mime.includes('opus')
    || mime.includes('webm')
    || /\.(ogg|oga|opus|webm)$/i.test(name)
  );
};

const convertAudioToTelegramVoice = (inputPath, outputPath) => new Promise((resolve, reject) => {
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

const sendTelegramAudioFile = async ({
  chatId,
  file,
  fileName,
  caption,
  botType,
  duration,
  replyToMessageId,
  parseMode = null,
}) => {
  let convertedPath = null;
  let voicePath = file.path;
  let voiceFileName = fileName || file.filename || 'voice.ogg';
  let voiceMimeType = file.mimetype || 'application/octet-stream';

  if (!isTelegramVoiceCompatibleFile(file)) {
    convertedPath = path.join(
      path.dirname(file.path),
      `${path.parse(file.filename || file.originalname || 'recording').name}-${Date.now()}.ogg`
    );
    try {
      await convertAudioToTelegramVoice(file.path, convertedPath);
      voicePath = convertedPath;
      voiceFileName = `${path.parse(fileName || file.filename || 'recording').name}.ogg`;
      voiceMimeType = 'audio/ogg';
    } catch (error) {
      console.warn('[Telegram] audio conversion to voice failed, falling back to sendAudio', {
        message: error?.message || String(error),
      });
    }
  }

  const extraFields = duration > 0 ? { duration } : {};

  try {
    if (voicePath === convertedPath || isTelegramVoiceCompatibleFile(file)) {
      return await sendTelegramFile({
        chatId,
        filePath: voicePath,
        fileName: voiceFileName,
        mimeType: voiceMimeType,
        method: 'sendVoice',
        field: 'voice',
        caption,
        botType,
        extraFields,
        replyToMessageId,
        parseMode,
      });
    }
  } catch (error) {
    console.warn('[Telegram] sendVoice failed, falling back to sendAudio', {
      description: error?.telegramDescription || error?.response?.data?.description || error?.message || String(error),
    });
  } finally {
    if (convertedPath && fs.existsSync(convertedPath)) {
      try { fs.unlinkSync(convertedPath); } catch {}
    }
  }

  return sendTelegramFile({
    chatId,
    filePath: file.path,
    fileName,
    mimeType: file.mimetype,
    method: 'sendAudio',
    field: 'audio',
    caption,
    botType,
    extraFields,
    replyToMessageId,
    parseMode,
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

const ensureTelegramAccess = (req, res) => {
  if (!String(process.env.TELEGRAM_TOKEN || '').trim()) {
    res.status(503).json({ error: 'Telegram не подключен на этом сервере' });
    return false;
  }
  if (req.user?.canTelegram === false) {
    res.status(403).json({ error: 'Доступ к Telegram чатам отключен' });
    return false;
  }
  return true;
};

const emitTelegram = (event, _chatId, payload, botType = 'business', personalOwnerId = null) => {
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
    telegramChatId: plain.telegramChatId,
    telegramUserId: plain.telegramUserId,
    botType: plain.botType || 'business',
    isPersonal: String(plain.botType || 'business') === 'personal',
  };
};

const telegramUnreadCountAttribute = [
  sequelize.literal(`(
    SELECT COUNT(*)
    FROM telegram_messages
    WHERE "tChatId" = "TelegramChat"."id"
      AND "fromMe" = false
      AND "isRead" = false
  )`),
  'unreadCount',
];

exports.getTelegramChats = async (req, res) => {
  try {
    if (!ensureTelegramAccess(req, res)) return;
    const chats = await TelegramChat.findAll({
      where: visibleChatsWhere(req.user?.id),
      order: [['updatedAt', 'DESC']],
      attributes: {
        include: [telegramUnreadCountAttribute],
      },
      include: [{
        model: User,
        as: 'assignee',
        attributes: ['id', 'name'],
        required: false,
      }],
    });
    return res.json(chats.map((chat) => formatChat(chat, req.user?.id)));
  } catch (error) {
    console.error('[Telegram] get chats failed', error);
    return res.status(500).json({ error: 'Не удалось получить Telegram чаты' });
  }
};

exports.getChat = async (req, res) => {
  try {
    if (!ensureTelegramAccess(req, res)) return;
    const chat = await TelegramChat.findByPk(req.params.id, {
      attributes: {
        include: [telegramUnreadCountAttribute],
      },
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
    console.error('[Telegram] get chat failed', error);
    return res.status(500).json({ error: 'Не удалось получить Telegram чат' });
  }
};

exports.getMessagesByChat = async (req, res) => {
  try {
    if (!ensureTelegramAccess(req, res)) return;
    const chat = await TelegramChat.findByPk(req.params.id);
    if (!chat || !ensureChatAccess(chat, req.user?.id, res)) return;
    const messages = await TelegramMessage.findAll({
      where: { tChatId: req.params.id },
      order: [['createdAt', 'ASC']],
    });
    return res.json(await withReactions(messages, 'telegram', req.user?.id));
  } catch (error) {
    console.error('[Telegram] get messages failed', error);
    return res.status(500).json({ error: 'Не удалось получить сообщения' });
  }
};

exports.toggleMessageReaction = async (req, res) => {
  try {
    if (!ensureTelegramAccess(req, res)) return;
    const userId = Number(req.user?.id || 0);
    const chat = await TelegramChat.findByPk(req.params.id);
    if (!chat || !ensureChatAccess(chat, userId, res)) return;
    const message = await TelegramMessage.findOne({ where: { id: req.params.messageId, tChatId: chat.id } });
    if (!message) return res.status(404).json({ error: 'Сообщение не найдено' });
    const updated = await toggleReaction({ channel: 'telegram', message, userId, emoji: String(req.body?.emoji || '') });
    emitTelegram('telegram:message-reaction-updated', chat.id, { chatId: chat.id, message: updated }, chat.botType, chat.assigneeId);
    return res.json({ message: updated });
  } catch (error) {
    console.error('[Telegram] toggle reaction failed', error);
    return res.status(error.status || 500).json({ error: error.message || 'Не удалось обновить реакцию' });
  }
};

exports.markChatAsRead = async (req, res) => {
  try {
    if (!ensureTelegramAccess(req, res)) return;
    const chat = await TelegramChat.findByPk(req.params.id);
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });
    if (!ensureChatAccess(chat, req.user?.id, res)) return;
    const [markedAsRead] = await TelegramMessage.update(
      { isRead: true },
      { where: { tChatId: chat.id, fromMe: false, isRead: false } }
    );
    await chat.update({ unreadCount: 0 });
    emitTelegram(
      'telegram:chat-read',
      chat.id,
      { chatId: chat.id, unreadCount: 0 },
      chat.botType,
      chat.assigneeId
    );
    return res.json({ success: true, markedAsRead, unreadCount: 0 });
  } catch (error) {
    console.error('[Telegram] mark read failed', error);
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

const resolveTelegramReply = async (chatId, replyToMessageId) => {
  const localId = Number(replyToMessageId || 0);
  if (!localId) return null;
  const replied = await TelegramMessage.findOne({ where: { id: localId, tChatId: chatId } });
  if (!replied) return null;
  return {
    externalMessageId: String(replied.telegramMessageId || ''),
    meta: {
      messageId: replied.id,
      externalMessageId: String(replied.telegramMessageId || ''),
      authorName: replied.senderName || (replied.fromMe ? 'Вы' : 'Telegram'),
      content: String(replied.text || '').trim() || 'Вложение',
    },
  };
};

exports.createPersonalInvite = async (req, res) => {
  try {
    if (!ensureTelegramAccess(req, res)) return;
    const userId = Number(req.user?.id || 0);
    if (!String(process.env.TELEGRAM_PERSONAL_TOKEN || '').trim()) {
      return res.status(503).json({ error: 'Личный Telegram-бот не подключен' });
    }
    const invite = createPersonalInvitePayload(userId);
    if (!invite) {
      return res.status(503).json({ error: 'Секрет личных Telegram-приглашений не настроен' });
    }
    const botUsername = await getPersonalBotUsername();
    if (!botUsername) return res.status(503).json({ error: 'Не удалось определить имя Telegram-бота' });
    return res.json({
      success: true,
      url: `https://t.me/${botUsername}?start=${invite.payload}`,
      expiresAt: invite.expiresAt,
      botUsername,
    });
  } catch (error) {
    console.error('[TelegramPersonal] create invite failed', error?.response?.data || error);
    return res.status(500).json({ error: 'Не удалось создать ссылку личного чата' });
  }
};

exports.getPersonalStatus = async (req, res) => {
  try {
    if (!ensureTelegramAccess(req, res)) return;
    const tokenConfigured = Boolean(getToken('personal'));
    const inviteSecretConfigured = Boolean(
      process.env.TELEGRAM_PERSONAL_INVITE_SECRET
      || process.env.TELEGRAM_PERSONAL_WEBHOOK_SECRET
    );
    const [webhookInfo, botUsername, personalChatsCount] = await Promise.all([
      tokenConfigured
        ? telegramRequest('getWebhookInfo', {}, { botType: 'personal' }).catch((error) => ({
            error: error?.message || 'getWebhookInfo failed',
          }))
        : null,
      tokenConfigured
        ? getPersonalBotUsername().catch(() => '')
        : '',
      TelegramChat.count({
        where: {
          botType: 'personal',
          assigneeId: Number(req.user?.id || 0),
        },
      }),
    ]);
    return res.json({
      success: true,
      tokenConfigured,
      inviteSecretConfigured,
      botUsername,
      personalChatsCount,
      webhook: webhookInfo ? {
        url: webhookInfo.url || '',
        pendingUpdateCount: Number(webhookInfo.pending_update_count || 0),
        lastErrorDate: webhookInfo.last_error_date || null,
        lastErrorMessage: webhookInfo.last_error_message || webhookInfo.error || null,
        allowedUpdates: webhookInfo.allowed_updates || [],
      } : null,
    });
  } catch (error) {
    console.error('[TelegramPersonal][status] failed', error?.response?.data || error);
    return res.status(500).json({ error: 'Не удалось проверить личного Telegram-бота' });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    if (!ensureTelegramAccess(req, res)) return;
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Введите сообщение' });
    const chat = await TelegramChat.findByPk(req.params.id);
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });
    if (!ensureChatAccess(chat, req.user?.id, res)) return;
    const senderId = Number(req.user?.id || req.body?.senderId || 0);
    const senderName = req.user?.name || req.body?.senderName || null;
    const wasAssigned = await ensureCanSend(chat, senderId);
    const reply = await resolveTelegramReply(chat.id, req.body?.replyToMessageId);
    const outgoing = personalOutgoingOptions(chat, senderName, text);
    const sent = await sendTelegramText(
      chat.telegramChatId,
      outgoing.text,
      chat.botType,
      reply?.externalMessageId,
      outgoing.parseMode ? { parseMode: outgoing.parseMode } : {}
    );
    const message = await TelegramMessage.create({
      tChatId: chat.id,
      telegramMessageId: String(sent.message_id),
      text,
      fromMe: true,
      messageType: 'text',
      senderName,
      senderId: String(senderId),
      attachments: reply ? { _reply: reply.meta } : null,
    });
    emitTelegram('telegram:new-message', chat.id, { chatId: chat.id, message }, chat.botType, chat.assigneeId);
    if (wasAssigned) {
      emitTelegram('telegram:chat-membership-updated', chat.id, {
        chatId: chat.id,
        assigneeId: senderId,
        participantIds: normalizeParticipantIds(chat.participantIds),
      }, chat.botType, chat.assigneeId);
    }
    return res.json({
      success: true,
      message,
      telegramSent: true,
      maxSent: true,
      chat: {
        ...formatChat(chat, senderId),
        wasAssigned,
      },
    });
  } catch (error) {
    console.error('[Telegram] send text failed', error?.response?.data || error);
    return res.status(error.status || 500).json({ error: error.message || 'Не удалось отправить сообщение' });
  }
};

const sendMedia = (method, field, messageType) => async (req, res) => {
  const file = req.file;
  try {
    if (!ensureTelegramAccess(req, res)) return;
    if (!file) return res.status(400).json({ error: 'Файл не получен' });
    const chat = await TelegramChat.findByPk(req.params.id);
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });
    if (!ensureChatAccess(chat, req.user?.id, res)) return;
    const senderId = Number(req.user?.id || req.body?.senderId || 0);
    const senderName = req.user?.name || req.body?.senderName || null;
    const uploadedFileName = normalizeUploadedFilename(file.originalname || file.filename);
    const wasAssigned = await ensureCanSend(chat, senderId);
    const duration = Math.max(0, Math.round(Number(req.body?.duration || 0)));
    const reply = await resolveTelegramReply(chat.id, req.body?.replyToMessageId);
    const rawCaption = String(req.body?.text || '').trim();
    const outgoing = personalOutgoingOptions(chat, senderName, rawCaption);
    const sent = messageType === 'audio'
      ? await sendTelegramAudioFile({
          chatId: chat.telegramChatId,
          file,
          fileName: uploadedFileName || file.filename,
          caption: outgoing.text,
          botType: chat.botType,
          duration,
          replyToMessageId: reply?.externalMessageId,
          parseMode: outgoing.parseMode,
        })
      : await sendTelegramFile({
          chatId: chat.telegramChatId,
          filePath: file.path,
          fileName: uploadedFileName || file.filename,
          mimeType: file.mimetype,
          method,
          field,
          caption: outgoing.text,
          botType: chat.botType,
          extraFields: duration > 0 && method === 'sendVideo'
            ? { duration }
            : {},
          replyToMessageId: reply?.externalMessageId,
          parseMode: outgoing.parseMode,
        });
    const parsed = parseTelegramMessage(sent, chat.botType);
    const message = await TelegramMessage.create({
      tChatId: chat.id,
      telegramMessageId: String(sent.message_id),
      text: rawCaption,
      fromMe: true,
      messageType: parsed.messageType || messageType,
      attachments: reply
        ? { ...(parsed.attachments || {}), _reply: reply.meta }
        : parsed.attachments,
      senderName,
      senderId: String(senderId),
    });
    emitTelegram('telegram:new-message', chat.id, { chatId: chat.id, message }, chat.botType, chat.assigneeId);
    if (wasAssigned) {
      emitTelegram('telegram:chat-membership-updated', chat.id, {
        chatId: chat.id,
        assigneeId: senderId,
        participantIds: normalizeParticipantIds(chat.participantIds),
      }, chat.botType, chat.assigneeId);
    }
    return res.json(message);
  } catch (error) {
    console.error(`[Telegram] ${method} failed`, error?.response?.data || error);
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
    const botType = req.query?.botType === 'personal' ? 'personal' : 'business';
    const file = await getTelegramFile(req.params.fileId, botType);
    if (!file?.file_path) return res.status(404).json({ error: 'Файл не найден' });
    const response = await axios.get(getTelegramFileUrl(file.file_path, botType), {
      responseType: 'stream',
      timeout: 60000,
    });
    const requestedName = String(req.query?.filename || '').trim();
    const fallbackName = path.basename(file.file_path);
    const filename = (requestedName || fallbackName || 'telegram-file')
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
    const upstreamType = String(response.headers['content-type'] || '');
    const contentType = !upstreamType || upstreamType === 'application/octet-stream'
      ? (mimeByExtension[extension] || 'application/octet-stream')
      : upstreamType;
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${filename.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodedFilename}`
    );
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }
    res.setHeader('Cache-Control', 'private, max-age=3600');
    response.data.pipe(res);
  } catch (error) {
    console.error('[Telegram] proxy file failed', error?.response?.data || error);
    res.status(502).json({ error: 'Не удалось загрузить файл из Telegram' });
  }
};

exports.getTotalUnreadCount = async (req, res) => {
  try {
    if (!ensureTelegramAccess(req, res)) return;
    const count = await TelegramMessage.count({
      where: { fromMe: false, isRead: false },
      include: [{
        model: TelegramChat,
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
    if (!ensureTelegramAccess(req, res)) return;
    const chat = await TelegramChat.findByPk(req.params.id);
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
    emitTelegram('telegram:chat-membership-updated', chat.id, payload, chat.botType, chat.assigneeId);
    return res.json({ success: true, chat: formatChat(chat, userId) });
  } catch (error) {
    return res.status(500).json({ error: 'Не удалось присоединиться к чату' });
  }
};

exports.inviteUser = async (req, res) => {
  try {
    if (!ensureTelegramAccess(req, res)) return;
    const currentUserId = Number(req.user?.id || 0);
    const targetUserId = Number(req.body?.userId || req.body?.employeeId || 0);
    if (!targetUserId) return res.status(400).json({ error: 'Выберите сотрудника' });
    if (targetUserId === currentUserId) return res.status(400).json({ error: 'Нельзя пригласить себя' });

    const chat = await TelegramChat.findByPk(req.params.id);
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });
    if (!ensureChatAccess(chat, currentUserId, res)) return;
    if (isPersonalChat(chat)) {
      return res.status(400).json({ error: 'В личный Telegram-чат нельзя приглашать сотрудников' });
    }
    if (Number(chat.assigneeId || 0) !== currentUserId) {
      return res.status(403).json({ error: 'Приглашать сотрудников может только владелец чата' });
    }

    const target = await User.findOne({
      where: { id: targetUserId, isActive: true, canTelegram: true, system: false },
      attributes: ['id', 'name'],
    });
    if (!target) return res.status(404).json({ error: 'Сотрудник недоступен для Telegram-чата' });

    const participants = normalizeParticipantIds(chat.participantIds);
    const wasAlreadyParticipant = participants.includes(targetUserId);
    if (!wasAlreadyParticipant) {
      participants.push(targetUserId);
      chat.participantIds = normalizeParticipantIds(participants);
      await chat.save();
    }

    const payload = {
      chatId: chat.id,
      assigneeId: chat.assigneeId || null,
      participantIds: normalizeParticipantIds(chat.participantIds),
      invitedUserId: targetUserId,
      invitedUserName: target.name,
    };
    emitTelegram('telegram:chat-membership-updated', chat.id, payload, chat.botType, chat.assigneeId);
    if (!wasAlreadyParticipant) {
      const io = getIO();
      const inviteRoom = 'user:' + targetUserId;
      io.to(inviteRoom).emit('external-chat:invited', {
        kind: 'telegram',
        chatId: chat.id,
        chatTitle: chat.username || 'Telegram чат',
        inviterId: currentUserId,
        inviterName: req.user?.name || null,
      });
    }
    return res.json({ success: true, chat: formatChat(chat, currentUserId), invitedUser: target });
  } catch (error) {
    console.error('[Telegram] invite user failed', error);
    return res.status(500).json({ error: 'Не удалось пригласить сотрудника' });
  }
};
exports.unassignChat = async (req, res) => {
  try {
    if (!ensureTelegramAccess(req, res)) return;
    const chat = await TelegramChat.findByPk(req.params.id);
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
    emitTelegram('telegram:chat-membership-updated', chat.id, payload, chat.botType, chat.assigneeId);
    return res.json({ success: true, chat: formatChat(chat, userId) });
  } catch (error) {
    return res.status(500).json({ error: 'Не удалось выйти из чата' });
  }
};

exports.renameChat = async (req, res) => {
  try {
    if (!ensureTelegramAccess(req, res)) return;
    const chat = await TelegramChat.findByPk(req.params.id);
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });
    if (!ensureChatAccess(chat, req.user?.id, res)) return;
    if (Number(chat.assigneeId || 0) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Переименовать чат может только владелец' });
    }
    const username = String(req.body?.username || req.body?.title || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (!username) return res.status(400).json({ error: 'Укажите название чата' });
    await chat.update({ username });
    const payload = { chatId: chat.id, username, updatedAt: chat.updatedAt };
    emitTelegram('telegram:chat-renamed', chat.id, payload, chat.botType, chat.assigneeId);
    return res.json({ success: true, chat: payload });
  } catch (error) {
    return res.status(500).json({ error: 'Не удалось переименовать чат' });
  }
};

exports.archiveChat = async (req, res) => {
  try {
    if (!ensureTelegramAccess(req, res)) return;
    const chat = await TelegramChat.findByPk(req.params.id);
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });
    if (!ensureChatAccess(chat, req.user?.id, res)) return;
    if (Number(chat.assigneeId || 0) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Архивировать чат может только владелец' });
    }
    const archived = req.body?.archived === true;
    await chat.update({ archivedAt: archived ? new Date() : null });
    const payload = { chatId: chat.id, archived, archivedAt: chat.archivedAt };
    emitTelegram('telegram:chat-archived', chat.id, payload, chat.botType, chat.assigneeId);
    return res.json({ success: true, chat: payload });
  } catch (error) {
    return res.status(500).json({ error: 'Не удалось изменить архив' });
  }
};

exports.deleteMessage = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    if (!ensureTelegramAccess(req, res)) {
      await transaction.rollback();
      return;
    }
    const chat = await TelegramChat.findByPk(req.params.id, {
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

    const messageId = Number(req.params.messageId || 0);
    const message = await TelegramMessage.findOne({
      where: { id: messageId, tChatId: chat.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!message) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }
    if (!message.fromMe || Number(message.senderId || 0) !== Number(req.user.id)) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Можно удалить только своё сообщение' });
    }

    await message.destroy({ transaction });

    const [unreadCount, latestMessage] = await Promise.all([
      TelegramMessage.count({
        where: { tChatId: chat.id, fromMe: false, isRead: false },
        transaction,
      }),
      TelegramMessage.findOne({
        where: { tChatId: chat.id },
        order: [['createdAt', 'DESC']],
        transaction,
      }),
    ]);
    await chat.update({
      unreadCount,
      lastMessageText: latestMessage?.text || null,
      lastMessageTime: latestMessage?.createdAt || null,
    }, { transaction });

    await transaction.commit();

    const payload = {
      chatId: chat.id,
      messageId,
      unreadCount,
      lastMessageText: latestMessage?.text || null,
      lastMessageTime: latestMessage?.createdAt || null,
    };
    emitTelegram('telegram:message-deleted', chat.id, payload, chat.botType, chat.assigneeId);
    return res.json({ success: true, ...payload });
  } catch (error) {
    await transaction.rollback();
    console.error('[Telegram] delete message failed', error);
    return res.status(500).json({ error: 'Не удалось удалить сообщение' });
  }
};

exports.deleteChat = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    if (!ensureTelegramAccess(req, res)) {
      await transaction.rollback();
      return;
    }
    const chat = await TelegramChat.findByPk(req.params.id, {
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
    await TelegramMessage.destroy({ where: { tChatId: chat.id }, transaction });
    await chat.destroy({ transaction });
    await transaction.commit();
    emitTelegram('telegram:chat-deleted', Number(req.params.id), {
      chatId: Number(req.params.id),
    }, deletedBotType, deletedAssigneeId);
    return res.json({ success: true });
  } catch (error) {
    await transaction.rollback();
    console.error('[Telegram] delete chat failed', error);
    return res.status(500).json({ error: 'Не удалось удалить чат' });
  }
};


// routes/internal.js
const express = require('express');
const router = express.Router();
const db = require('../models');
const models = db.sequelize.models;
const { getIO } = require('../socket');
const { sendPushNotification } = require('../services/sendPushNotification');
const { Op } = require('sequelize');

// Опционально: защита заголовком
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || '';
const SITE_CALLBACK_LOGS_ENABLED = String(process.env.SITE_CALLBACK_LOGS_ENABLED || '').toLowerCase() === 'true';

const siteCallbackLog = (event, payload = {}) => {
  if (!SITE_CALLBACK_LOGS_ENABLED) return;
  console.log(`[site-callback-alert] ${event}`, {
    ...payload,
    ts: new Date().toISOString(),
  });
};

siteCallbackLog('route:loaded', {
  pid: process.pid,
  hasInternalSecret: Boolean(INTERNAL_API_SECRET),
});
// EMIT_MAP: легко расширяется под новые типы
// channelFn получает объект message (Sequelize instance or plain) и возвращает имя канала
// events: [eventForTranscriptionStatus, eventForNewMessage]
const EMIT_MAP = {
  RoomMessage: {
    channelFn: (msg) => `room-${msg.roomId}`,
    events: ['room:message_transcription', 'newRoomMessage'],
  },
  BossMessage: {
    channelFn: (msg) => `chat-${msg.chatId}`,
    events: ['boss:message_transcription', 'newBossChatMessage'],
  },
  ChatMessage: {
    channelFn: (msg) => `consult`, // или `consult-${msg.consultId}` если нужно конкретнее
    events: ['chat:message_transcription', 'newChatMessage'],
  },
  // добавляй сюда новые модели по мере роста
};



async function findMessageByModels(messageId, preferredModelName) {
  // Если явно указана модель — попробуем её сначала
  if (preferredModelName) {
    const Model = models[preferredModelName] || models[preferredModelName + 'Message'];
    if (Model) {
      const m = await Model.findByPk(messageId, { include: [getUserInclude(Model)] });
      if (m) return { modelName: preferredModelName, model: Model, message: m };
    }
  }

  // Auto-detect: пробегаем по известным моделям (ключи EMIT_MAP)
  for (const modelName of Object.keys(EMIT_MAP)) {
    const Model = models[modelName];
    if (!Model) continue;
    const m = await Model.findByPk(messageId, { include: [getUserInclude(Model)] });
    if (m) return { modelName, model: Model, message: m };
  }

  // fallback: попробуем все модели в sequelize (медленнее)
  for (const name of Object.keys(models)) {
    if (['sequelize', 'Sequelize'].includes(name)) continue;
    const Model = models[name];
    try {
      const m = await Model.findByPk(messageId);
      if (m) return { modelName: name, model: Model, message: m };
    } catch (e) {
      // игнор — не все модели поддерживают findByPk с таким id
    }
  }

  return null;
}


// Так как разные аасоциации для чатов и консультации
function getUserInclude(Model) {
  // Проверяем все ассоциации модели
  for (const assocName in Model.associations) {
    const assoc = Model.associations[assocName];
    if (assoc.target === models.User) {
      // нашли ассоциацию к User
      return {
        model: models.User,
        as: assoc.as,          // используем правильный alias
        attributes: ['id', 'name'],
        required: false,
      };
    }
  }
  // fallback: просто include без as (для моделей без alias)
  return { model: models.User, attributes: ['id', 'name'], required: false };
}

function sanitizeIds(ids) {
  const raw = Array.isArray(ids) ? ids : [];
  return Array.from(new Set(raw.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)));
}

function parseIdsCsv(value) {
  return sanitizeIds(String(value || '').split(',').map((v) => v.trim()));
}

function parseIdSet(value, fallback = '') {
  return new Set(parseIdsCsv(value || fallback));
}

function normalizePhone(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D+/g, '');
  if (!digits) return { raw, digits: '' };
  if (digits.length === 10) return { raw: `+7${digits}`, digits: `7${digits}` };
  if (digits.length === 11 && digits.startsWith('8')) return { raw: `+7${digits.slice(1)}`, digits: `7${digits.slice(1)}` };
  if (digits.length === 11 && digits.startsWith('7')) return { raw: `+${digits}`, digits };
  return { raw: raw || `+${digits}`, digits };
}

function trimText(value, maxLength = 2000) {
  return String(value || '').trim().slice(0, maxLength);
}

async function resolveSystemAlertCreatorUserId() {
  const configuredUserId = Number(process.env.SYSTEM_USER);
  if (String(process.env.SYSTEM_USER || '').trim()) {
    if (!Number.isInteger(configuredUserId) || configuredUserId <= 0) {
      return { userId: null, source: 'system-user-env-invalid' };
    }

    const configuredUser = await models.User.findOne({
      where: {
        id: configuredUserId,
        isActive: true,
      },
      attributes: ['id'],
    });
    return configuredUser?.id
      ? { userId: Number(configuredUser.id), source: 'system-user-env' }
      : { userId: null, source: 'system-user-env-not-found' };
  }

  const systemUser = await models.User.findOne({
    where: { system: true, isActive: true },
    attributes: ['id'],
    order: [['id', 'ASC']],
  });
  if (systemUser?.id) {
    return { userId: Number(systemUser.id), source: 'system-flag' };
  }

  const namedSystem = await models.User.findOne({
    where: {
      isActive: true,
      name: { [Op.in]: ['Система', 'System', 'system'] },
    },
    attributes: ['id'],
    order: [['id', 'ASC']],
  });
  if (namedSystem?.id) {
    return { userId: Number(namedSystem.id), source: 'system-name' };
  }

  const superAdminUserIds = parseIdSet(process.env.SUPER_ADMIN_USER_IDS);
  if (superAdminUserIds.size > 0) {
    const superAdminUser = await models.User.findOne({
      where: {
        id: { [Op.in]: Array.from(superAdminUserIds) },
        isActive: true,
      },
      attributes: ['id'],
      order: [['id', 'ASC']],
    });
    if (superAdminUser?.id) {
      return { userId: Number(superAdminUser.id), source: 'super-admin-user-id' };
    }
  }

  const privilegedRoleIds = Array.from(new Set([
    ...parseIdSet(process.env.SUPER_ADMIN_ROLE_IDS, '1'),
    ...parseIdSet(process.env.ADMIN_ROLE_IDS, '2'),
  ]));
  if (privilegedRoleIds.length > 0) {
    const adminUser = await models.User.findOne({
      where: {
        roleId: { [Op.in]: privilegedRoleIds },
        isActive: true,
      },
      attributes: ['id'],
      order: [['roleId', 'ASC'], ['id', 'ASC']],
    });
    if (adminUser?.id) {
      return { userId: Number(adminUser.id), source: 'admin-role' };
    }
  }

  return { userId: null, source: 'not-found' };
}

function resolveSiteCallbackChatId() {
  const chatId = Number(process.env.CHAT_ZAKAZ_ZVONKA);
  return Number.isInteger(chatId) && chatId > 0 ? chatId : null;
}

const siteCallbackAlertHandler = async (req, res) => {
  const requestId = req.headers['x-request-id'] || `site-callback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    siteCallbackLog('request:start', {
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      contentType: req.headers['content-type'] || null,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 160),
      bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body).slice(0, 20) : [],
      hasSecretHeader: Boolean(req.headers['x-internal-secret']),
    });

    if (INTERNAL_API_SECRET) {
      const auth = req.headers['x-internal-secret'];
      if (auth !== INTERNAL_API_SECRET) {
        siteCallbackLog('request:unauthorized', {
          requestId,
          hasSecretHeader: Boolean(auth),
          secretLength: auth ? String(auth).length : 0,
        });
        return res.status(401).json({ error: 'unauthorized' });
      }
    }

    const phoneInput = req.body?.phone ?? req.body?.tel ?? req.body?.telephone;
    const { raw: phone, digits } = normalizePhone(phoneInput);
    const comment = trimText(req.body?.comment ?? req.body?.message ?? req.body?.text, 2000);
    const name = trimText(req.body?.name ?? req.body?.clientName, 200);
    const source = trimText(req.body?.source ?? req.body?.site ?? req.body?.page ?? 'site', 300);
    const pageUrl = trimText(req.body?.pageUrl ?? req.body?.url ?? req.body?.referer, 500);

    siteCallbackLog('request:parsed', {
      requestId,
      hasPhone: Boolean(phoneInput),
      normalizedPhone: phone || null,
      phoneDigitsLength: digits.length,
      hasComment: Boolean(comment),
      hasName: Boolean(name),
      source: source || null,
      hasPageUrl: Boolean(pageUrl),
    });

    if (!digits || digits.length < 10) {
      siteCallbackLog('request:invalid-phone', {
        requestId,
        phoneDigitsLength: digits.length,
      });
      return res.status(400).json({ error: 'valid phone required' });
    }

    const creator = await resolveSystemAlertCreatorUserId();
    const creatorUserId = Number(creator?.userId);
    siteCallbackLog('creator:resolved', {
      requestId,
      creatorUserId: Number.isFinite(creatorUserId) && creatorUserId > 0 ? creatorUserId : null,
      source: creator?.source || null,
    });

    if (!creatorUserId) {
      return res.status(500).json({
        error: process.env.SYSTEM_USER
          ? 'configured SYSTEM_USER is invalid or inactive'
          : 'system or admin user not found',
        hint: process.env.SYSTEM_USER
          ? 'Set SYSTEM_USER to the ID of an active user'
          : 'Set SYSTEM_USER or create an active system/admin user',
      });
    }

    const chatId = resolveSiteCallbackChatId();
    if (!chatId) {
      return res.status(500).json({
        error: 'CHAT_ZAKAZ_ZVONKA is not configured',
        hint: 'Set CHAT_ZAKAZ_ZVONKA to a valid boss chat ID',
      });
    }

    const chat = await models.Room.findByPk(chatId, { attributes: ['id', 'name', 'type'] });
    if (!chat) {
      siteCallbackLog('chat:not-found', { requestId, chatId, chatKind: 'room' });
      return res.status(500).json({
        error: 'callback chat not found',
        chatId,
        chatKind: 'room',
      });
    }
    siteCallbackLog('chat:resolved', {
      requestId,
      chatId,
      chatKind: 'room',
      chatName: chat.name,
      chatType: chat.type,
    });

    const participantRows = await models.RoomUsers.findAll({
      where: { roomId: chatId, deletedAt: null },
      attributes: ['userId'],
    });
    const recipientUserIds = sanitizeIds(
      participantRows.map((participant) => participant.userId).filter((userId) => Number(userId) !== creatorUserId)
    );
    siteCallbackLog('recipients:resolved', {
      requestId,
      chatId,
      count: recipientUserIds.length,
      sampleUserIds: recipientUserIds.slice(0, 20),
    });

    const now = new Date();
    const contentLines = [
      'Заказ обратного звонка с сайта',
      name ? `Имя: ${name}` : null,
      `Телефон: ${phone}`,
      comment ? `Комментарий: ${comment}` : null,
      source ? `Источник: ${source}` : null,
      pageUrl ? `Страница: ${pageUrl}` : null,
    ].filter(Boolean);

    const message = await models.RoomMessage.create({
      roomId: chatId,
      userId: creatorUserId,
      content: contentLines.join('\n'),
      type: 'text',
      createdAt: now,
    });

    const fullMessage = await models.RoomMessage.findByPk(message.id, {
      include: [{ model: models.User, attributes: ['id', 'name', 'avatar'] }],
    });
    siteCallbackLog('message:created', {
      requestId,
      chatId,
      messageId: Number(message.id),
      creatorUserId,
      recipients: recipientUserIds.length,
    });

    getIO()?.to(`room-${chatId}`).emit('newRoomMessage', fullMessage || message);
    siteCallbackLog('socket:emitted', {
      requestId,
      chatId,
      messageId: Number(message.id),
      targetUsers: sanitizeIds([creatorUserId, ...recipientUserIds]).length,
    });

    if (recipientUserIds.length > 0) {
      sendPushNotification(
        recipientUserIds,
        'Заказ звонка с сайта',
        phone,
        {
          screen: 'room',
          roomId: String(chatId),
          messageId: String(message.id),
          type: 'messages',
          url: `mobileapp://room/${encodeURIComponent(String(chatId))}`,
        }
      ).then((result) => {
        siteCallbackLog('push:done', {
          requestId,
          chatId,
          messageId: Number(message.id),
          sent: Number(result?.sent ?? 0),
          traceId: result?.traceId ?? null,
          hasUnified: Boolean(result?.unified),
        });
      }).catch((err) => {
        console.error('[site-callback-alert] push:error', {
          requestId,
          chatId,
          messageId: Number(message.id),
          message: err?.message || String(err),
        });
      });
      siteCallbackLog('push:queued', {
        requestId,
        chatId,
        messageId: Number(message.id),
        targetUsers: recipientUserIds.length,
      });
    } else {
      siteCallbackLog('push:skipped-no-recipients', { requestId, chatId, messageId: Number(message.id) });
    }

    return res.status(201).json({
      ok: true,
      chatId,
      messageId: message.id,
      recipients: recipientUserIds.length,
      requestId,
    });
  } catch (err) {
    console.error('[site-callback-alert] error', {
      requestId,
      message: err?.message || String(err),
      stack: err?.stack || null,
    });
    return res.status(500).json({ error: err.message || 'server error', requestId });
  }
};

router.post('/site-callback-alert', siteCallbackAlertHandler);
router.siteCallbackAlertHandler = siteCallbackAlertHandler;





router.post('/emit-transcription', async (req, res) => {
  try {
    if (INTERNAL_API_SECRET) {
      const auth = req.headers['x-internal-secret'];
      if (auth !== INTERNAL_API_SECRET) {
        return res.status(401).json({ error: 'unauthorized' });
      }
    }

    const { messageId, model: preferredModel } = req.body;
    if (!messageId) return res.status(400).json({ error: 'messageId required' });

    const found = await findMessageByModels(messageId, preferredModel);
    if (!found) return res.status(404).json({ error: 'Message not found for given id' });

    const { modelName, message } = found;

    // Решаем канал и события по EMIT_MAP (если определено), иначе fallback: глобальный emit
    const map = EMIT_MAP[modelName];

    // console.log('modelName = ', modelName)
    // console.log('message = ', message)

    const io = getIO();
    if (!io) {
      console.warn('[internal] getIO() returned empty — socket not initialized in this process');
      // Можно вернуть 500, но всё-таки скажем ok:false
      return res.status(500).json({ error: 'socket not initialized' });
    }

    if (map) {
      try {
        const channel = map.channelFn(message);
        // 1) emit статус/транскрипцию
        //console.log('channel = ', channel, 'map.events[0] =', map.events[0])
        io.to(channel).emit(map.events[0], {
          messageId: message.id || message._id,
          transcriptionStatus: message.transcriptionStatus,
          transcriptionText: message.transcriptionText || null,
        });
        //console.log('[internal] emitted messageId = ', messageId)
        // 2) emit полное сообщение (чтобы клиенты могли обновить UI)
        // io.to(channel).emit(map.events[1], message);
        // console.log(`[internal] emitted ${map.events[0]}, ${map.events[1]} -> ${channel} (model ${modelName}, id ${messageId}), message ${message}`);
        // // глобальный резервный эмит (опционально)
        // io.emit('message_transcription', {
        //   messageId: message.id,
        //   transcriptionStatus: message.transcriptionStatus,
        //   transcriptionText: message.transcriptionText || null,
        //   model: modelName,
        // });
        return res.json({ ok: true, model: modelName, channel: map.channelFn(message) });
      } catch (e) {
        console.error('[internal] emit error', e);
        return res.status(500).json({ error: e.message || 'emit failed' });
      }
    } else {
      // fallback: если нет маппинга — делаем глобальный emit + возвращаем info
      io.emit('message_transcription', {
        messageId: message.id,
        transcriptionStatus: message.transcriptionStatus,
        transcriptionText: message.transcriptionText || null,
        model: modelName,
      });
      //console.log(`[internal] fallback emit for model ${modelName}, id ${messageId}`);
      return res.json({ ok: true, model: modelName, fallback: true });
    }
  } catch (err) {
    console.error('internal emit error', err);
    return res.status(500).json({ error: err.message || 'server error' });
  }
});

module.exports = router;


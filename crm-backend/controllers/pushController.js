const db = require('../models');
const PushToken = db.sequelize.models.PushToken;
const { sendPushNotification } = require('../services/sendPushNotification');
const { sendUnifiedPushToUserIds } = require('../services/sendUnifiedPushNotification');
const UnifiedPushSubscription = db.sequelize.models.UnifiedPushSubscription;
const PUSH_TRACE_ENABLED = String(process.env.PUSH_TRACE_ENABLED || '').toLowerCase() === 'true';
const {
  log: unifiedPushLog,
  error: unifiedPushError,
} = require('../services/unifiedPushLogger');

const pushTraceLog = (...args) => {
  if (PUSH_TRACE_ENABLED) console.log(...args);
};

const pushTraceWarn = (...args) => {
  if (PUSH_TRACE_ENABLED) console.warn(...args);
};

const pushTraceError = (...args) => {
  if (PUSH_TRACE_ENABLED) console.error(...args);
};

const maskToken = (value) => {
  if (!value || typeof value !== 'string') return null;
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
};

const maskEndpoint = (value) => {
  if (!value || typeof value !== 'string') return null;
  if (value.length <= 24) return value;
  return `${value.slice(0, 20)}...`;
};

const toInt = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const ageSec = (value) => {
  if (!value) return null;
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / 1000));
};

// POST /push/register
const push = async (req, res) => {
  const userId = req.user.id;
  const {
    token,
    provider = 'unknown',
    platform = 'unknown',
    manufacturer = null,
    modelName = null,
    osVersion = null,
  } = req.body || {};
  const requestId = req.headers['x-request-id'] || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  pushTraceLog('[PushTrace][register] start', {
    requestId,
    userId: Number(userId),
    hasToken: Boolean(token),
    tokenPreview: maskToken(token),
    provider,
    platform,
    manufacturer,
    modelName,
    osVersion,
  });

  if (!token) {
    pushTraceWarn('[PushTrace][register] bad-request:no-token', { requestId, userId: Number(userId) });
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    // Upsert can be unreliable across dialect/config for models without timestamps.
    // Do deterministic token registration: token is globally unique, so move it to current user.
    let pushToken = await PushToken.findOne({ where: { token } });
    let created = false;
    if (pushToken) {
      await PushToken.update(
        {
          userId,
          provider,
          platform,
          manufacturer,
          modelName,
          osVersion,
          updatedAt: new Date(),
        },
        { where: { id: pushToken.id } }
      );
      pushToken = await PushToken.findByPk(pushToken.id);
    } else {
      pushToken = await PushToken.create({
        userId,
        token,
        provider,
        platform,
        manufacturer,
        modelName,
        osVersion,
        updatedAt: new Date(),
      });
      created = true;
    }

    pushTraceLog('[PushTrace][register] ok', {
      requestId,
      userId: Number(userId),
      created: Boolean(created),
      tokenPreview: maskToken(token),
      provider,
      platform,
      manufacturer,
      modelName,
      osVersion,
    });

    res.json({
      success: true,
      message: created ? 'Token registered' : 'Token updated',
      data: pushToken
    });
  } catch (err) {
    pushTraceError('[PushTrace][register] error', {
      requestId,
      userId: Number(userId),
      message: err?.message || String(err),
    });
    res.status(500).json({ error: 'Failed to register token' });
  }
};

// POST /push/test
// body: { userId?: number, title?: string, body?: string, data?: object }
const pushTest = async (req, res) => {
  const actorUserId = Number(req.user?.id);
  const {
    userId,
    title = 'Тестовое уведомление',
    body = 'Проверка доставки push',
    data = {},
  } = req.body || {};
  const targetUserId = Number(userId || actorUserId);
  const requestId = req.headers['x-request-id'] || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  try {
    const rows = await PushToken.findAll({
      where: { userId: targetUserId },
      attributes: ['token'],
    });
    const tokens = Array.from(new Set(rows.map((r) => r.token).filter(Boolean)));

    pushTraceLog('[PushTrace][test] start', {
      requestId,
      actorUserId,
      targetUserId,
      tokensCount: tokens.length,
      title: title || null,
      hasBody: Boolean(body),
      dataKeys: data && typeof data === 'object' ? Object.keys(data).slice(0, 10) : [],
    });

    if (tokens.length === 0) {
      pushTraceWarn('[PushTrace][test] no-fcm-tokens:continue-with-userid-target', {
        requestId,
        actorUserId,
        targetUserId,
      });
    }

    const pushTarget = tokens.length > 0 ? tokens : [targetUserId];
    const result = await sendPushNotification(pushTarget, title, body, data, {
      traceId: `push-test-${requestId}`,
    });

    pushTraceLog('[PushTrace][test] done', {
      requestId,
      actorUserId,
      targetUserId,
      sent: Number(result?.sent ?? 0),
      traceId: result?.traceId ?? null,
    });

    return res.json({
      success: true,
      requestId,
      actorUserId,
      targetUserId,
      tokensCount: tokens.length,
      usedUserIdFallback: tokens.length === 0,
      result,
    });
  } catch (err) {
    pushTraceError('[PushTrace][test] error', {
      requestId,
      actorUserId,
      targetUserId,
      message: err?.message || String(err),
    });
    return res.status(500).json({ error: 'Failed to send test push', requestId });
  }
};

// POST /push/unified/test-direct
// body: { userId?: number, title?: string, body?: string, data?: object }
const unifiedPushTestDirect = async (req, res) => {
  const actorUserId = Number(req.user?.id);
  const {
    userId,
    title = 'UnifiedPush test',
    body = 'Проверка прямой доставки UnifiedPush',
    data = {},
  } = req.body || {};
  const targetUserId = Number(userId || actorUserId);
  const requestId = req.headers['x-request-id'] || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  try {
    unifiedPushLog('[UnifiedPush][test-direct] start', {
      requestId,
      actorUserId,
      targetUserId,
      title: title || null,
      hasBody: Boolean(body),
      dataKeys: data && typeof data === 'object' ? Object.keys(data).slice(0, 10) : [],
    });

    const result = await sendUnifiedPushToUserIds([targetUserId], title, body, data, {
      traceId: `unified-test-${requestId}`,
    });

    unifiedPushLog('[UnifiedPush][test-direct] done', {
      requestId,
      actorUserId,
      targetUserId,
      sent: Number(result?.sent ?? 0),
      errorCount: Number(result?.errorCount ?? 0),
      traceId: result?.traceId ?? null,
    });

    return res.json({
      success: true,
      requestId,
      actorUserId,
      targetUserId,
      result,
    });
  } catch (err) {
    unifiedPushError('[UnifiedPush][test-direct] error', {
      requestId,
      actorUserId,
      targetUserId,
      message: err?.message || String(err),
    });
    return res.status(500).json({ error: 'Failed to send direct unified push', requestId });
  }
};

// POST /push/unified/register
const registerUnifiedPush = async (req, res) => {
  const userId = Number(req.user?.id);
  const {
    endpoint,
    p256dh,
    auth,
    instance = null,
    distributorId = null,
  } = req.body || {};
  const requestId = req.headers['x-request-id'] || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  unifiedPushLog('[UnifiedPush][register] start', {
    requestId,
    userId,
    endpoint: maskEndpoint(endpoint),
    hasP256dh: Boolean(p256dh),
    hasAuth: Boolean(auth),
    instance: instance ?? null,
    distributorId: distributorId ?? null,
  });

  if (!UnifiedPushSubscription) {
    return res.status(500).json({ error: 'UnifiedPush model is not available' });
  }
  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: 'endpoint, p256dh and auth are required' });
  }

  try {
    await UnifiedPushSubscription.sync();
    const existing = await UnifiedPushSubscription.findOne({
      where: {
        userId,
        endpoint,
        instance: instance ?? null,
      },
    });

    if (existing) {
      await UnifiedPushSubscription.update(
        {
          p256dh,
          auth,
          distributorId: distributorId ?? null,
          enabled: true,
          updatedAt: new Date(),
        },
        { where: { id: existing.id } }
      );
      unifiedPushLog('[UnifiedPush][register] updated', { requestId, userId, subId: existing.id });
      return res.json({ success: true, updated: true, id: existing.id });
    }

    const created = await UnifiedPushSubscription.create({
      userId,
      endpoint,
      p256dh,
      auth,
      instance: instance ?? null,
      distributorId: distributorId ?? null,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    unifiedPushLog('[UnifiedPush][register] created', { requestId, userId, subId: created.id });
    return res.json({ success: true, created: true, id: created.id });
  } catch (err) {
    unifiedPushError('[UnifiedPush][register] error', {
      requestId,
      userId,
      message: err?.message || String(err),
    });
    return res.status(500).json({ error: 'Failed to register UnifiedPush subscription' });
  }
};

// POST /push/unified/unregister
const unregisterUnifiedPush = async (req, res) => {
  const userId = Number(req.user?.id);
  const { endpoint, instance = null } = req.body || {};
  const requestId = req.headers['x-request-id'] || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (!UnifiedPushSubscription) {
    return res.status(500).json({ error: 'UnifiedPush model is not available' });
  }
  if (!endpoint) {
    return res.status(400).json({ error: 'endpoint is required' });
  }

  try {
    await UnifiedPushSubscription.sync();
    const deleted = await UnifiedPushSubscription.destroy({
      where: {
        userId,
        endpoint,
        instance: instance ?? null,
      },
    });
    unifiedPushLog('[UnifiedPush][unregister] done', {
      requestId,
      userId,
      endpoint: maskEndpoint(endpoint),
      instance: instance ?? null,
      deleted,
    });
    return res.json({ success: true, deleted });
  } catch (err) {
    unifiedPushError('[UnifiedPush][unregister] error', {
      requestId,
      userId,
      message: err?.message || String(err),
    });
    return res.status(500).json({ error: 'Failed to unregister UnifiedPush subscription' });
  }
};

// GET /push/health?userId=22
const pushHealth = async (req, res) => {
  const actorUserId = Number(req.user?.id);
  const requestedUserId = toInt(req.query?.userId);
  const targetUserId = requestedUserId && requestedUserId > 0 ? requestedUserId : actorUserId;
  const requestId = req.headers['x-request-id'] || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
    return res.status(400).json({ error: 'Invalid target userId', requestId });
  }

  try {
    const tokenRows = await PushToken.findAll({
      where: { userId: targetUserId },
      attributes: ['id', 'userId', 'token', 'updatedAt', 'createdAt'],
      order: [['id', 'DESC']],
    });
    const expoTokens = Array.from(
      new Set(
        tokenRows
          .map((r) => String(r?.token || ''))
          .filter((t) => t.startsWith('ExponentPushToken') || t.startsWith('ExpoPushToken'))
      )
    );

    const unifiedRowsRaw = UnifiedPushSubscription
      ? await UnifiedPushSubscription.findAll({
          where: { userId: targetUserId, enabled: true },
          attributes: ['id', 'userId', 'endpoint', 'instance', 'distributorId', 'enabled', 'createdAt', 'updatedAt'],
          order: [['id', 'DESC']],
        })
      : [];

    const dedupMap = new Map();
    for (const row of unifiedRowsRaw) {
      const key = `${toInt(row.userId)}|${String(row.instance || '')}|${String(row.distributorId || '')}`;
      const prev = dedupMap.get(key);
      if (!prev) {
        dedupMap.set(key, row);
        continue;
      }
      const prevTs = new Date(prev.updatedAt || prev.createdAt || 0).getTime();
      const rowTs = new Date(row.updatedAt || row.createdAt || 0).getTime();
      if (rowTs >= prevTs) dedupMap.set(key, row);
    }
    const unifiedRowsDedup = Array.from(dedupMap.values());

    const effectiveRoute = expoTokens.length > 0 && unifiedRowsDedup.length > 0
      ? 'fcm+unified'
      : expoTokens.length > 0
        ? 'fcm-only'
        : unifiedRowsDedup.length > 0
          ? 'unified-only'
          : 'none';
    const canDeliverNow = effectiveRoute !== 'none';

    const response = {
      ok: true,
      requestId,
      actorUserId,
      targetUserId,
      summary: {
        expoTokensCount: expoTokens.length,
        unifiedSubscriptionsRawCount: unifiedRowsRaw.length,
        unifiedSubscriptionsDedupCount: unifiedRowsDedup.length,
        effectiveRoute,
        canDeliverNow,
      },
      expo: {
        sampleTokens: expoTokens.slice(0, 5).map(maskToken),
        tokens: tokenRows.slice(0, 10).map((r) => ({
          id: Number(r.id),
          token: maskToken(r.token),
          updatedAgeSec: ageSec(r.updatedAt || r.createdAt),
        })),
      },
      unified: {
        raw: unifiedRowsRaw.slice(0, 20).map((r) => ({
          id: Number(r.id),
          instance: r.instance ?? null,
          distributorId: r.distributorId ?? null,
          endpoint: maskEndpoint(r.endpoint),
          updatedAgeSec: ageSec(r.updatedAt || r.createdAt),
          enabled: Boolean(r.enabled),
        })),
        dedup: unifiedRowsDedup.slice(0, 20).map((r) => ({
          id: Number(r.id),
          instance: r.instance ?? null,
          distributorId: r.distributorId ?? null,
          endpoint: maskEndpoint(r.endpoint),
          updatedAgeSec: ageSec(r.updatedAt || r.createdAt),
          enabled: Boolean(r.enabled),
        })),
      },
    };

    pushTraceLog('[PushTrace][health] ok', {
      requestId,
      actorUserId,
      targetUserId,
      effectiveRoute,
      expoTokensCount: expoTokens.length,
      unifiedRaw: unifiedRowsRaw.length,
      unifiedDedup: unifiedRowsDedup.length,
    });

    return res.json(response);
  } catch (err) {
    pushTraceError('[PushTrace][health] error', {
      requestId,
      actorUserId,
      targetUserId,
      message: err?.message || String(err),
    });
    return res.status(500).json({ error: 'Failed to build push health', requestId });
  }
};

module.exports = {
  push,
  pushTest,
  pushHealth,
  unifiedPushTestDirect,
  registerUnifiedPush,
  unregisterUnifiedPush,
};

const db = require('../models');
const {
  log: unifiedPushLog,
  warn: unifiedPushWarn,
} = require('./unifiedPushLogger');

let webpush = null;
try {
  // Optional dependency. Service will be skipped if not installed.
  // npm i web-push
  webpush = require('web-push');
} catch (e) {
  webpush = null;
}

let vapidConfigured = false;
const ensureVapid = () => {
  if (!webpush) return false;
  if (vapidConfigured) return true;
  const publicKey = process.env.UNIFIED_PUSH_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || null;
  const privateKey = process.env.UNIFIED_PUSH_VAPID_PRIVATE_KEY || process.env.VAPID_PRIVATE_KEY || null;
  const subject = process.env.UNIFIED_PUSH_VAPID_SUBJECT || process.env.VAPID_SUBJECT || 'mailto:push@orderspace.ru';
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
};

const toInt = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const maskEndpoint = (endpoint) => {
  const value = String(endpoint || '');
  if (!value) return null;
  return value.length <= 40 ? value : `${value.slice(0, 40)}...`;
};

const ageSec = (value) => {
  if (!value) return null;
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / 1000));
};
const withChannelPrefix = (prefix, rawTitle) => {
  const title = String(rawTitle || '').trim();
  if (!title) return `(${prefix})`;
  if (/^\((F|N)\)\s*/i.test(title)) return title;
  return `(${prefix}) ${title}`;
};

const toPushImageUrl = (value) => {
  const url = String(value || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return url;
};

const buildDeepLinkUrl = (data) => {
  const payload = (data && typeof data === 'object') ? data : {};
  if (payload.url) return String(payload.url);

  const scheme = process.env.APP_SCHEME || 'mobileapp';
  const screen = String(payload.screen || '');
  const roomId = payload.roomId ?? null;
  const chatId = payload.chatId ?? null;

  if (screen === 'room' && roomId != null) {
    return `${scheme}://room/${encodeURIComponent(String(roomId))}`;
  }
  if (screen === 'admin' && chatId != null) {
    return `${scheme}://bossChats/${encodeURIComponent(String(chatId))}`;
  }
  if (screen === 'alerts' || String(payload.alerts || '') === '1') {
    return `${scheme}://bossChats/alerts`;
  }
  return undefined;
};

const sendUnifiedPushToUserIds = async (userIds, title, body, data = {}, options = {}) => {
  const traceId = options.traceId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const unifiedTitle = withChannelPrefix('N', title);
  const pushImageUrl = toPushImageUrl(data?.avatarUrl || data?.avatar || data?.imageUrl);
  const UnifiedPushSubscription = db.sequelize.models.UnifiedPushSubscription;
  if (!UnifiedPushSubscription) {
    unifiedPushLog('[UnifiedPush][send] skip:model-missing', { traceId });
    return { ok: true, sent: 0, traceId, reason: 'model-missing' };
  }
  if (!webpush) {
    unifiedPushWarn('[UnifiedPush][send] skip:web-push-missing', { traceId });
    return { ok: false, sent: 0, traceId, reason: 'web-push-missing' };
  }
  if (!ensureVapid()) {
    unifiedPushWarn('[UnifiedPush][send] skip:vapid-missing', { traceId });
    return { ok: false, sent: 0, traceId, reason: 'vapid-missing' };
  }

  const uniqueUserIds = Array.from(
    new Set((Array.isArray(userIds) ? userIds : [userIds]).map(toInt).filter((v) => Number.isFinite(v) && v > 0))
  );
  if (uniqueUserIds.length === 0) return { ok: true, sent: 0, traceId, reason: 'empty-targets' };

  await UnifiedPushSubscription.sync();
  const rawRows = await UnifiedPushSubscription.findAll({
    where: { userId: uniqueUserIds, enabled: true },
    attributes: ['id', 'userId', 'endpoint', 'p256dh', 'auth', 'instance', 'distributorId', 'createdAt', 'updatedAt'],
  });
  // Deduplicate stale subscriptions:
  // keep only the newest row for each (userId, instance, distributorId).
  const dedupMap = new Map();
  for (const row of rawRows) {
    const userId = Number(row.userId);
    const instance = String(row.instance || '');
    const distributorId = String(row.distributorId || '');
    const key = `${userId}|${instance}|${distributorId}`;
    const prev = dedupMap.get(key);
    if (!prev) {
      dedupMap.set(key, row);
      continue;
    }
    const prevTs = new Date(prev.updatedAt || prev.createdAt || 0).getTime();
    const rowTs = new Date(row.updatedAt || row.createdAt || 0).getTime();
    if (rowTs >= prevTs) dedupMap.set(key, row);
  }
  const rows = Array.from(dedupMap.values());

  if (rows.length === 0) {
    const allRows = await UnifiedPushSubscription.findAll({
      where: { userId: uniqueUserIds },
      attributes: ['id', 'userId', 'endpoint', 'instance', 'distributorId', 'enabled', 'createdAt', 'updatedAt'],
      order: [['id', 'DESC']],
      limit: 20,
    });
    unifiedPushWarn('[UnifiedPush][send] no-active-subscriptions', {
      traceId,
      targetUserIds: uniqueUserIds,
      totalRows: allRows.length,
      rows: allRows.map((r) => ({
        id: r.id,
        userId: r.userId,
        instance: r.instance ?? null,
        distributorId: r.distributorId ?? null,
        enabled: Boolean(r.enabled),
        endpoint: maskEndpoint(r.endpoint),
        updatedAt: r.updatedAt ?? null,
      })),
    });
  }

  const now = Date.now();
  // Android NotificationManager uses Int id; keep it in positive 32-bit range.
  const notificationId = Math.floor(now % 2147483647);
  const payload = JSON.stringify({
    // expo-unified-push Android service requires "id" to render notification
    id: notificationId,
    title: unifiedTitle || undefined,
    body: body || undefined,
    // Some distributors/services expect "message" key for visible notification text.
    message: body || undefined,
    avatarUrl: pushImageUrl || undefined,
    imageUrl: pushImageUrl || undefined,
    // optional channel-ish marker visible in native service as notification channel suffix
    type: (data && typeof data === 'object' && data.type) ? String(data.type) : 'messages',
    // optional deep link
    url: buildDeepLinkUrl(data),
    // keep custom data for foreground handlers
    data: data || {},
  });

  unifiedPushLog('[UnifiedPush][send] payload', {
    traceId,
    id: notificationId,
    hasTitle: Boolean(unifiedTitle),
    hasBody: Boolean(body),
    hasImage: Boolean(pushImageUrl),
    hasUrl: Boolean(buildDeepLinkUrl(data)),
    type: (data && typeof data === 'object' && data.type) ? String(data.type) : 'messages',
    payloadSize: payload.length,
  });

  unifiedPushLog('[UnifiedPush][send] start', {
    traceId,
    targetUsers: uniqueUserIds.length,
    targetUserIds: uniqueUserIds,
    subscriptionsCount: rows.length,
    rawSubscriptionsCount: rawRows.length,
    subscriptionUserIds: Array.from(new Set(rows.map((r) => toInt(r.userId)).filter((v) => Number.isFinite(v)))),
    sampleEndpoints: rows.slice(0, 3).map((r) => maskEndpoint(r.endpoint)).filter(Boolean),
    sampleSubscriptions: rows.slice(0, 3).map((r) => ({
      id: r.id,
      userId: r.userId,
      instance: r.instance ?? null,
      distributorId: r.distributorId ?? null,
      createdAt: r.createdAt ?? null,
      updatedAt: r.updatedAt ?? null,
      updatedAgeSec: ageSec(r.updatedAt),
    })),
    title: unifiedTitle || null,
    hasBody: Boolean(body),
  });

  let sent = 0;
  let errorCount = 0;
  for (const row of rows) {
    const subscription = {
      endpoint: row.endpoint,
      keys: {
        p256dh: row.p256dh,
        auth: row.auth,
      },
    };
    try {
      const response = await webpush.sendNotification(subscription, payload, { TTL: 120 });
      sent += 1;
      unifiedPushLog('[UnifiedPush][send] delivery:ok', {
        traceId,
        subId: row.id,
        userId: row.userId,
        endpoint: maskEndpoint(row.endpoint),
        statusCode: response?.statusCode ?? null,
        bodyLength: response?.body ? String(response.body).length : 0,
      });
    } catch (err) {
      errorCount += 1;
      const statusCode = Number(err?.statusCode ?? 0);
      unifiedPushWarn('[UnifiedPush][send] error', {
        traceId,
        subId: row.id,
        userId: row.userId,
        statusCode: statusCode || null,
        message: err?.message || String(err),
      });
      // Gone / invalid subscription => disable it.
      if (statusCode === 404 || statusCode === 410) {
        try {
          await UnifiedPushSubscription.update(
            { enabled: false, updatedAt: new Date() },
            { where: { id: row.id } }
          );
        } catch (e) {
          unifiedPushWarn('[UnifiedPush][send] disable-error', {
            traceId,
            subId: row.id,
            message: e?.message || String(e),
          });
        }
      }
    }
  }

  unifiedPushLog('[UnifiedPush][send] done', { traceId, sent, errorCount });
  return { ok: true, sent, errorCount, traceId };
};

module.exports = { sendUnifiedPushToUserIds };


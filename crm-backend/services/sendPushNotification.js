const db = require('../models');
const { Expo } = require('expo-server-sdk');
const { sendUnifiedPushToUserIds } = require('./sendUnifiedPushNotification');

const expo = new Expo();
const PUSH_TRACE_ENABLED = String(process.env.PUSH_TRACE_ENABLED || '').toLowerCase() === 'true';

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

const shortList = (arr, limit = 5) => {
  const list = Array.isArray(arr) ? arr : [];
  return list.slice(0, limit);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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

/**
 * sendPushNotification(target, title, body, data, options)
 */
async function sendPushNotification(target, title, body, data = {}, options = {}) {
  const traceId = options?.traceId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fcmTitle = withChannelPrefix('F', title);
  const pushImageUrl = toPushImageUrl(data?.avatarUrl || data?.avatar || data?.imageUrl);

  try {
    const PushToken = db.sequelize.models.PushToken;
    const { Op } = require('sequelize');

    let tokens = [];
    const tokenToUserId = new Map();
    const targetUserIdsSet = new Set();

    pushTraceLog('[PushTrace][send] start', {
      traceId,
      targetType: Array.isArray(target) ? 'array' : typeof target,
      targetCount: Array.isArray(target) ? target.length : 1,
      title: title || null,
      hasBody: Boolean(body),
      hasImage: Boolean(pushImageUrl),
      dataKeys: data && typeof data === 'object' ? Object.keys(data).slice(0, 10) : [],
    });

    if (Array.isArray(target)) {
      const arr = target;
      const maybeTokens = arr.filter(
        (a) => typeof a === 'string' && (a.startsWith('ExponentPushToken') || a.startsWith('ExpoPushToken'))
      );
      const maybeIds = arr.filter((a) => !maybeTokens.includes(a));
      tokens.push(...maybeTokens);
      maybeIds.forEach((v) => {
        const parsed = Number(v);
        if (Number.isFinite(parsed) && parsed > 0) targetUserIdsSet.add(parsed);
      });

      if (maybeIds.length > 0) {
        const rows = await PushToken.findAll({
          where: { userId: { [Op.in]: maybeIds } },
          attributes: ['token', 'userId'],
        });
        for (const row of rows) {
          const token = row?.token;
          if (!token) continue;
          tokens.push(token);
          tokenToUserId.set(token, row?.userId ?? null);
          if (Number.isFinite(Number(row?.userId)) && Number(row.userId) > 0) {
            targetUserIdsSet.add(Number(row.userId));
          }
        }
      }
    } else if (typeof target === 'string') {
      if (target.startsWith('ExponentPushToken') || target.startsWith('ExpoPushToken')) {
        tokens.push(target);
      } else if (!isNaN(Number(target))) {
        const rows = await PushToken.findAll({
          where: { userId: Number(target) },
          attributes: ['token', 'userId'],
        });
        targetUserIdsSet.add(Number(target));
        for (const row of rows) {
          const token = row?.token;
          if (!token) continue;
          tokens.push(token);
          tokenToUserId.set(token, row?.userId ?? null);
          if (Number.isFinite(Number(row?.userId)) && Number(row.userId) > 0) {
            targetUserIdsSet.add(Number(row.userId));
          }
        }
      } else {
        tokens.push(target);
      }
    } else if (typeof target === 'number') {
      const rows = await PushToken.findAll({
        where: { userId: target },
        attributes: ['token', 'userId'],
      });
      targetUserIdsSet.add(Number(target));
      for (const row of rows) {
        const token = row?.token;
        if (!token) continue;
        tokens.push(token);
        tokenToUserId.set(token, row?.userId ?? null);
        if (Number.isFinite(Number(row?.userId)) && Number(row.userId) > 0) {
          targetUserIdsSet.add(Number(row.userId));
        }
      }
    }

    const dedupTokens = Array.from(new Set(tokens.filter(Boolean)));
    if (dedupTokens.length > 0) {
      const tokenRows = await PushToken.findAll({
        where: { token: { [Op.in]: dedupTokens } },
        attributes: ['token', 'userId'],
      });
      for (const row of tokenRows) {
        const userId = Number(row?.userId);
        if (Number.isFinite(userId) && userId > 0) {
          targetUserIdsSet.add(userId);
          if (row?.token) tokenToUserId.set(row.token, userId);
        }
      }
    }

    const expoTokens = dedupTokens.filter((t) => Expo.isExpoPushToken(t));

    pushTraceLog('[PushTrace][send] resolved-targets', {
      traceId,
      rawTokensCount: tokens.length,
      dedupTokensCount: dedupTokens.length,
      expoTokensCount: expoTokens.length,
      targetUserIdsCount: targetUserIdsSet.size,
      sampleTokens: shortList(expoTokens.map(maskToken), 3),
    });

    let unifiedResult = null;

    if (expoTokens.length === 0) {
      pushTraceLog('[PushTrace][send] skip:no-expo-tokens', { traceId });
      if (targetUserIdsSet.size > 0) {
        try {
          unifiedResult = await sendUnifiedPushToUserIds(
            Array.from(targetUserIdsSet),
            title,
            body,
            data,
            { traceId: `${traceId}:unified` }
          );
        } catch (unifiedErr) {
          pushTraceWarn('[PushTrace][send] unified:error', {
            traceId,
            message: unifiedErr?.message || String(unifiedErr),
          });
        }
      } else {
        pushTraceLog('[PushTrace][send] unified:skip:no-target-users', { traceId });
      }
      return { ok: true, sent: 0, traceId, unified: unifiedResult };
    }

    const dataOnly = options?.dataOnly === true;
    const requestedTtl = Number(options?.ttl);
    const ttl = Number.isFinite(requestedTtl)
      ? Math.max(0, Math.floor(requestedTtl))
      : null;
    const messages = expoTokens.map((t) => ({
      to: t,
      ...(dataOnly ? {} : {
        title: fcmTitle || undefined,
        body: body || undefined,
        channelId: options?.channelId || 'chat-messages-v2',
        sound: options?.sound === undefined ? 'default' : options.sound,
        ...(options?.categoryId ? { categoryId: options.categoryId } : {}),
      }),
      data: data || {},
      priority: 'high',
      ...(ttl !== null ? { ttl } : {}),
      ...(dataOnly ? { _contentAvailable: true } : {}),
      ...(!dataOnly && pushImageUrl ? { richContent: { image: pushImageUrl } } : {}),
    }));

    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];
    const receiptIdToMeta = new Map();
    const receiptOkUserIds = new Set();
    const deviceNotRegisteredUserIds = new Set();
    let globalMessageOffset = 0;
    let expoTicketsOkCount = 0;
    let expoTicketErrorCount = 0;
    let expoChunkErrorCount = 0;

    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
        const chunkErrors = [];
        for (let j = 0; j < ticketChunk.length; j += 1) {
          const ticket = ticketChunk[j];
          const message = chunk[j];
          const token = message?.to || null;
          if (ticket?.id && token) {
            receiptIdToMeta.set(ticket.id, {
              token,
              userId: tokenToUserId.get(token) ?? null,
              messageIndex: globalMessageOffset + j,
            });
          }
          if (ticket?.status === 'error') {
            const ticketError = ticket?.details?.error || ticket?.message || 'unknown';
            const ticketUserId = Number(tokenToUserId.get(token));
            chunkErrors.push({
              token: maskToken(token),
              userId: Number.isFinite(ticketUserId) && ticketUserId > 0 ? ticketUserId : null,
              error: ticketError,
              message: ticket?.message || null,
            });
            if (ticketError === 'DeviceNotRegistered' && token) {
              if (Number.isFinite(ticketUserId) && ticketUserId > 0) {
                deviceNotRegisteredUserIds.add(ticketUserId);
              }
              try {
                const deleted = await PushToken.destroy({ where: { token } });
                pushTraceWarn('[PushTrace][send] ticket:token-removed', {
                  traceId,
                  token: maskToken(token),
                  userId: Number.isFinite(ticketUserId) && ticketUserId > 0 ? ticketUserId : null,
                  deleted,
                });
              } catch (cleanupErr) {
                pushTraceError('[PushTrace][send] ticket:cleanup-error', {
                  traceId,
                  token: maskToken(token),
                  userId: Number.isFinite(ticketUserId) && ticketUserId > 0 ? ticketUserId : null,
                  message: cleanupErr?.message || String(cleanupErr),
                });
              }
            }
          }
        }
        globalMessageOffset += chunk.length;

        const okCount = ticketChunk.filter((t) => t?.status === 'ok').length;
        const errorCount = ticketChunk.filter((t) => t?.status === 'error').length;
        expoTicketsOkCount += okCount;
        expoTicketErrorCount += errorCount;
        pushTraceLog('[PushTrace][send] chunk:result', {
          traceId,
          chunkIndex: i,
          chunkSize: chunk.length,
          okCount,
          errorCount,
          errorsSample: shortList(chunkErrors, 5),
        });
      } catch (e) {
        pushTraceError('[PushTrace][send] chunk:error', {
          traceId,
          chunkIndex: i,
          chunkSize: chunk.length,
          message: e?.message || String(e),
        });
        expoChunkErrorCount += 1;
      }
    }

    // UnifiedPush is normally a fallback channel. Parallel FCM+Unified delivery can
    // create duplicate system notifications because the native distributor may show
    // the NTFY notification while JS is asleep and cannot deduplicate it.
    const disableUnifiedParallel = options?.disableUnifiedParallel === true;
    const envEnableUnifiedParallel = String(process.env.PUSH_UNIFIED_PARALLEL || '').toLowerCase() === 'true';
    const optionEnableUnifiedParallel = options?.enableUnifiedParallel === true;
    const shouldSendUnifiedParallel = !disableUnifiedParallel && (envEnableUnifiedParallel || optionEnableUnifiedParallel);
    const shouldSendUnifiedFallback = expoTicketsOkCount === 0 && (expoTicketErrorCount > 0 || expoChunkErrorCount > 0);
    const shouldSendUnified =
      targetUserIdsSet.size > 0 && (shouldSendUnifiedParallel || shouldSendUnifiedFallback);

    if (shouldSendUnified) {
      pushTraceLog('[PushTrace][send] unified:start', {
        traceId,
        mode: shouldSendUnifiedParallel ? 'parallel' : 'fallback',
        expoTicketsOkCount,
        expoTicketErrorCount,
        expoChunkErrorCount,
        targetUserIdsCount: targetUserIdsSet.size,
      });
      try {
        unifiedResult = await sendUnifiedPushToUserIds(
          Array.from(targetUserIdsSet),
          title,
          body,
          data,
          { traceId: `${traceId}:unified` }
        );
      } catch (unifiedErr) {
        pushTraceWarn('[PushTrace][send] unified:error', {
          traceId,
          message: unifiedErr?.message || String(unifiedErr),
        });
      }
    } else {
      pushTraceLog('[PushTrace][send] unified:skip', {
        traceId,
        reason: targetUserIdsSet.size <= 0 ? 'no-target-users' : 'expo-accepted-or-parallel-disabled',
        disableUnifiedParallel,
        envEnableUnifiedParallel,
        optionEnableUnifiedParallel,
        expoTicketsOkCount,
        expoTicketErrorCount,
        expoChunkErrorCount,
      });
    }

    const receiptIds = tickets.filter((t) => t.id).map((t) => t.id);
    pushTraceLog('[PushTrace][send] tickets', {
      traceId,
      ticketsCount: tickets.length,
      receiptIdsCount: receiptIds.length,
    });

    if (receiptIds.length) {
      const pendingReceiptIds = new Set(receiptIds);
      const pollDelaysMs = [0, 4000, 12000];

      for (let pollIndex = 0; pollIndex < pollDelaysMs.length && pendingReceiptIds.size > 0; pollIndex += 1) {
        const delayMs = pollDelaysMs[pollIndex];
        if (delayMs > 0) {
          await sleep(delayMs);
        }

        const idsToPoll = Array.from(pendingReceiptIds);
        const receiptIdChunks = expo.chunkPushNotificationReceiptIds(idsToPoll);

        pushTraceLog('[PushTrace][receipt] poll:start', {
          traceId,
          pollAttempt: pollIndex + 1,
          pollDelayMs: delayMs,
          pendingBefore: pendingReceiptIds.size,
          chunkCount: receiptIdChunks.length,
        });

        for (let i = 0; i < receiptIdChunks.length; i += 1) {
          const chunk = receiptIdChunks[i];
          try {
            const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
            let okCount = 0;
            let errorCount = 0;
            let stillPendingCount = 0;

            for (const receiptId of chunk) {
              const receipt = receipts?.[receiptId];
              if (!receipt || receipt.status === 'pending') {
                stillPendingCount += 1;
                continue;
              }

              pendingReceiptIds.delete(receiptId);
              const meta = receiptIdToMeta.get(receiptId) || {};

              if (receipt.status === 'ok') {
                okCount += 1;
                const receiptUserId = Number(meta?.userId);
                if (Number.isFinite(receiptUserId) && receiptUserId > 0) {
                  receiptOkUserIds.add(receiptUserId);
                }
                continue;
              }

              errorCount += 1;
              const detailsError = receipt?.details?.error || null;
              pushTraceWarn('[PushTrace][receipt] error', {
                traceId,
                receiptId,
                status: receipt?.status || null,
                detailsError,
                token: maskToken(meta?.token || null),
                userId: meta?.userId ?? null,
              });

              if (detailsError === 'DeviceNotRegistered' && meta?.token) {
                const failedUserId = Number(meta?.userId);
                if (Number.isFinite(failedUserId) && failedUserId > 0) {
                  deviceNotRegisteredUserIds.add(failedUserId);
                }
                try {
                  const deleted = await PushToken.destroy({ where: { token: meta.token } });
                  pushTraceWarn('[PushTrace][receipt] cleanup:token-removed', {
                    traceId,
                    receiptId,
                    token: maskToken(meta.token),
                    userId: meta?.userId ?? null,
                    deleted,
                  });
                } catch (cleanupErr) {
                  pushTraceError('[PushTrace][receipt] cleanup-error', {
                    traceId,
                    receiptId,
                    token: maskToken(meta.token),
                    userId: meta?.userId ?? null,
                    message: cleanupErr?.message || String(cleanupErr),
                  });
                }
              }
            }

            pushTraceLog('[PushTrace][receipt] chunk:result', {
              traceId,
              pollAttempt: pollIndex + 1,
              chunkIndex: i,
              chunkSize: chunk.length,
              okCount,
              errorCount,
              stillPendingCount,
            });
          } catch (e) {
            pushTraceError('[PushTrace][receipt] chunk:error', {
              traceId,
              pollAttempt: pollIndex + 1,
              chunkIndex: i,
              chunkSize: chunk.length,
              message: e?.message || String(e),
            });
          }
        }

        pushTraceLog('[PushTrace][receipt] poll:done', {
          traceId,
          pollAttempt: pollIndex + 1,
          pendingAfter: pendingReceiptIds.size,
        });
      }

      if (pendingReceiptIds.size > 0) {
        pushTraceWarn('[PushTrace][receipt] unresolved', {
          traceId,
          pendingCount: pendingReceiptIds.size,
          sampleReceiptIds: shortList(Array.from(pendingReceiptIds), 5),
        });
      }
    }

    const receiptFallbackUserIds = Array.from(deviceNotRegisteredUserIds).filter(
      (userId) => !receiptOkUserIds.has(userId)
    );
    if (receiptFallbackUserIds.length > 0 && !unifiedResult) {
      pushTraceWarn('[PushTrace][receipt] unified-fallback:start', {
        traceId,
        targetUserIds: receiptFallbackUserIds,
        reason: 'device-not-registered',
      });
      try {
        unifiedResult = await sendUnifiedPushToUserIds(
          receiptFallbackUserIds,
          title,
          body,
          data,
          { traceId: `${traceId}:receipt-fallback` }
        );
        pushTraceWarn('[PushTrace][receipt] unified-fallback:done', {
          traceId,
          targetUserIds: receiptFallbackUserIds,
          sent: Number(unifiedResult?.sent || 0),
          ok: unifiedResult?.ok !== false,
        });
      } catch (unifiedErr) {
        pushTraceError('[PushTrace][receipt] unified-fallback:error', {
          traceId,
          targetUserIds: receiptFallbackUserIds,
          message: unifiedErr?.message || String(unifiedErr),
        });
      }
    }

    pushTraceLog('[PushTrace][send] done', {
      traceId,
      sent: expoTokens.length,
      ticketsCount: tickets.length,
    });

    return { ok: true, sent: expoTokens.length, tickets, traceId, unified: unifiedResult };
  } catch (err) {
    pushTraceError('[PushTrace][send] fatal', {
      traceId,
      message: err?.message || String(err),
    });
    throw err;
  }
}

module.exports = { sendPushNotification };


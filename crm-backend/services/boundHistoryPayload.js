'use strict';
// Opt-in only. Never cut text, a transcription, or an individual message in half.
module.exports = function boundHistoryPayload(payload, query) {
  const requested = Number(query.maxResponseBytes);
  if (!Number.isFinite(requested) || requested <= 0 || query.query || query.recovery) return payload;
  const budget = Math.min(512 * 1024, Math.max(16 * 1024, Math.floor(requested)));
  const source = payload.messages || [];
  let rows = source.slice();
  const make = () => {
    const ids = new Set(rows.map(row => Number(row.id)));
    return {
      ...payload,
      messages: rows,
      ...(Array.isArray(payload.deliveredMessageIds) ? { deliveredMessageIds: payload.deliveredMessageIds.filter(id => ids.has(Number(id))) } : {}),
      page: {
        version: 1, byteLimited: rows.length < source.length,
        nextBeforeId: rows[0]?.id ?? null, nextAfterId: rows[rows.length - 1]?.id ?? null,
        oversized: false,
      },
    };
  };
  const count = largestFit(source.length ? 1 : 0, source.length, count => {
    rows = query.afterId != null ? source.slice(0, count) : source.slice(source.length - count);
    return Buffer.byteLength(JSON.stringify(make()), 'utf8') <= budget;
  });
  rows = query.afterId != null ? source.slice(0, count) : source.slice(source.length - count);
  const result = make();
  result.page.oversized = Buffer.byteLength(JSON.stringify(result), 'utf8') > budget;
  return result;
};

function largestFit(minimum, maximum, fits) {
  let low = minimum, high = maximum;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(middle)) low = middle;
    else high = middle - 1;
  }
  return low;
}

module.exports.boundRecoveryPayload = function(payload, query, freshIds, after) {
  const requested = Number(query.maxResponseBytes);
  if (!Number.isFinite(requested) || requested <= 0) return payload;
  const budget = Math.min(512 * 1024, Math.max(16 * 1024, requested));
  const known = payload.recovery.checkedIds;
  const make = (freshCount, knownCount) => {
    const fresh = after == null ? freshIds.slice(freshIds.length - freshCount) : freshIds.slice(0, freshCount);
    const checked = known.slice(0, knownCount);
    const ids = new Set([...fresh, ...checked]);
    const messages = payload.messages.filter(row => ids.has(Number(row.id)));
    const included = new Set(messages.map(row => Number(row.id)));
    return {
      ...payload, messages,
      ...(payload.deliveredMessageIds ? { deliveredMessageIds: payload.deliveredMessageIds.filter(id => included.has(Number(id))) } : {}),
      recovery: {
        ...payload.recovery, version: 2,
        cursor: after == null ? payload.recovery.ceiling : fresh[fresh.length - 1] ?? after,
        hasMore: after != null && (payload.recovery.hasMore || freshCount < freshIds.length),
        checkedIds: checked,
        missingIds: payload.recovery.missingIds.filter(id => checked.includes(id)),
        // Preserve an initial latest window even if only part fits this response.
        pendingIds: after == null ? freshIds.filter(id => !ids.has(id)) : [],
        oversized: false,
      },
    };
  };
  const minimumKnown = known.length ? 1 : 0;
  const minimumFresh = !minimumKnown && freshIds.length ? 1 : 0;
  const freshCount = largestFit(minimumFresh, freshIds.length, count =>
    Buffer.byteLength(JSON.stringify(make(count, minimumKnown)), 'utf8') <= budget);
  const knownCount = largestFit(minimumKnown, known.length, count =>
    Buffer.byteLength(JSON.stringify(make(freshCount, count)), 'utf8') <= budget);
  const result = make(freshCount, knownCount);
  result.recovery.oversized = Buffer.byteLength(JSON.stringify(result), 'utf8') > budget;
  return result;
};

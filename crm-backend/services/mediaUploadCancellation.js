const CANCEL_TTL_MS = 30 * 60 * 1000;
const cancelledUploads = new Map();

function keyOf(kind, targetId, clientId) {
  return `${String(kind || '').trim()}:${Number(targetId)}:${String(clientId || '').trim()}`;
}

function prune() {
  const now = Date.now();
  for (const [key, cancelledAt] of cancelledUploads.entries()) {
    if (now - cancelledAt > CANCEL_TTL_MS) {
      cancelledUploads.delete(key);
    }
  }
}

function markMediaUploadCancelled(kind, targetId, clientId) {
  const normalizedClientId = String(clientId || '').trim();
  if (!normalizedClientId || !Number.isFinite(Number(targetId))) return;
  prune();
  cancelledUploads.set(keyOf(kind, targetId, normalizedClientId), Date.now());
}

function clearMediaUploadCancellation(kind, targetId, clientId) {
  const normalizedClientId = String(clientId || '').trim();
  if (!normalizedClientId) return;
  cancelledUploads.delete(keyOf(kind, targetId, normalizedClientId));
}

function isMediaUploadCancelled(kind, targetId, clientId) {
  const normalizedClientId = String(clientId || '').trim();
  if (!normalizedClientId) return false;
  prune();
  return cancelledUploads.has(keyOf(kind, targetId, normalizedClientId));
}

module.exports = {
  clearMediaUploadCancellation,
  isMediaUploadCancelled,
  markMediaUploadCancelled,
};


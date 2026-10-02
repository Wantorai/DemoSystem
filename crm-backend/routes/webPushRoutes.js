const express = require('express');
const crypto = require('crypto');
const auth = require('../middleware/authMiddleware');
const { UnifiedPushSubscription: Subscription } = require('../models');
const { sendUnifiedPushToUserIds } = require('../services/sendUnifiedPushNotification');
const router = express.Router();
const distributorId = 'web-browser';
const publicKey = () => process.env.UNIFIED_PUSH_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
const configured = () => Boolean(publicKey() && (process.env.UNIFIED_PUSH_VAPID_PRIVATE_KEY || process.env.VAPID_PRIVATE_KEY));

function validEndpoint(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (url.hostname.endsWith('.push.apple.com') ||
        ['fcm.googleapis.com', 'updates.push.services.mozilla.com'].includes(url.hostname));
  } catch { return false; }
}

router.get('/push/web/config', auth, (req, res) => {
  res.set('Cache-Control', 'no-store').json({ enabled: configured(), publicKey: configured() ? publicKey() : null });
});

router.post('/push/web/subscribe', auth, async (req, res, next) => {
  try {
    if (!configured()) return res.status(503).json({ error: 'Push-уведомления ещё не настроены на сервере' });
    const { endpoint, keys } = req.body || {};
    if (typeof endpoint !== 'string' || endpoint.length > 2048 || !validEndpoint(endpoint) ||
        !/^[A-Za-z0-9_-]{87}=?$/.test(keys?.p256dh || '') || !/^[A-Za-z0-9_-]{22}={0,2}$/.test(keys?.auth || '')) {
      return res.status(400).json({ error: 'Некорректная подписка браузера' });
    }
    const instance = crypto.createHash('sha256').update(endpoint).digest('hex');
    await Subscription.sync();
    // One browser subscription belongs to one signed-in account.
    await Subscription.destroy({ where: { endpoint, distributorId } });
    await Subscription.create({ userId: req.user.id, endpoint, instance, distributorId,
      p256dh: keys.p256dh, auth: keys.auth, enabled: true, createdAt: new Date(), updatedAt: new Date() });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.post('/push/web/unsubscribe', auth, async (req, res, next) => {
  try {
    if (typeof req.body?.endpoint !== 'string') return res.sendStatus(400);
    await Subscription.destroy({ where: { userId: req.user.id, endpoint: req.body.endpoint, distributorId } });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.post('/push/web/test', auth, async (req, res, next) => {
  try {
    const result = await sendUnifiedPushToUserIds([req.user.id], 'Уведомления включены',
      'Теперь новые сообщения будут приходить сюда.', { screen: 'webchats' }, { browserOnly: true });
    res.status(result.sent > 0 ? 200 : 503).json({ ok: result.sent > 0 });
  } catch (error) { next(error); }
});
module.exports = router;

/* Push only: authenticated pages and API responses are never cached. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

function chatPath(data = {}) {
  const id = value => encodeURIComponent(String(value));
  if (data.screen === 'alerts' || String(data.alerts) === '1') return '/webchats/alerts';
  if (data.screen === 'room' && data.roomId != null) return '/webchats/room/' + id(data.roomId);
  if (data.chatType === 'telegram' || data.screen === 'TelegramChatScreen')
    return data.chatId != null ? '/webchats/telegram/' + id(data.chatId) : '/webchats';
  if (data.chatType === 'max' || data.screen === 'MaxChatScreen')
    return data.chatId != null ? '/webchats/max/' + id(data.chatId) : '/webchats';
  if (['admin', 'BossChat', 'BossChatScreen'].includes(data.screen) && data.chatId != null)
    return String(data.chatId) === '5' ? '/webchats/alerts' : '/webchats/boss/' + id(data.chatId);
  return '/webchats';
}
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch {}
  const path = chatPath(payload.data);
  event.waitUntil(self.registration.showNotification(payload.title || 'Новое сообщение', {
    body: payload.body || 'Откройте чаты, чтобы прочитать сообщение.',
    icon: '/icons/apple-touch-icon.png',
    tag: path + ':' + (payload.data?.messageId || 'message'),
    data: { path },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const path = event.notification.data?.path;
  const url = new URL(typeof path === 'string' && /^\/webchats(?:\/|$)/.test(path) ? path : '/webchats', self.location.origin);
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = clients.find(client => new URL(client.url).origin === url.origin);
    if (existing) {
      // Focus synchronously with the click before navigation on iOS.
      await existing.focus();
      await existing.navigate(url.href);
    } else {
      await self.clients.openWindow(url.href);
    }
  })());
});

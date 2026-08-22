// notifications.js

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (e) {
    console.warn('Notification.requestPermission error', e);
    return false;
  }
}

export function showNotification({ title, body, icon, tag, data }) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const n = new Notification(title, {
      body: body || '',
      icon: icon || '/icons/chat-icon-192.png', // поправьте путь
      badge: icon || '/icons/chat-badge.png',
      tag: tag || undefined,      // используйте tag, чтобы обновлять уведомления одного чата
      renotify: true,
      data: data || {},
    });

    n.onclick = () => {
      // фокусируем окно и пробуем открыть чат (можно заменить на ваш роутер)
      try {
        window.focus?.();
        const chatId = n.data?.chatId;
        if (chatId) {
          // если у вас SPA — используйте ваш роутер, например:
          // window.location.href = `/chat/${chatId}`;
          // или вызовите функцию навигации
          window.location.href = `/chat/${chatId}`;
        }
      } catch (err) { console.error(err); }
      n.close();
    };

    // опционально: автозакрыть через 8 секунд
    setTimeout(() => { try { n.close(); } catch(e){console.error(e)} }, 8000);

    return n;
  } catch (err) {
    console.error('showNotification error', err);
  }
}

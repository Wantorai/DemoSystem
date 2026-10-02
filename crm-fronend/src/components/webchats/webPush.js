export async function pushRequest(path, token, body) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/push/web/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Не удалось настроить уведомления. Попробуйте ещё раз.');
  return result;
}

export async function disableWebPush(token) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration?.active?.scriptURL.endsWith('/webchat-sw.js')) return;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    // Invalidate the browser endpoint even if the backend is temporarily unreachable.
    await subscription.unsubscribe();
    if (token) await pushRequest('unsubscribe', token, { endpoint: subscription.endpoint }).catch(() => {});
  }
  const notifications = await registration.getNotifications();
  notifications.forEach(notification => notification.close());
  localStorage.removeItem('webchat-push-user');
}

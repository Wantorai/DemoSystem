'use client';
import { useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IoNotificationsOutline } from 'react-icons/io5';
import { AuthContext } from '../../context/AuthContext';
import { disableWebPush, pushRequest } from './webPush';

export default function WebPushControl({ buttonStyle }) {
  const { token, user } = useContext(AuthContext);
  const [open, setOpen] = useState(false);
  const [setup, setSetup] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [install, setInstall] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    setInstall(ios && !standalone);
    if (!token || !user?.id) return;
    if (ios && !standalone) return;
    if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setMessage('Этот браузер не поддерживает push-уведомления. На iPhone нужна iOS 16.4 или новее и запуск с экрана «Домой».');
      return;
    }
    (async () => {
      const config = await pushRequest('config', token);
      if (!config.enabled) throw new Error('Уведомления ещё не настроены администратором на сервере.');
      await navigator.serviceWorker.register('/webchat-sw.js', { scope: '/', updateViaCache: 'none' });
      const registration = await navigator.serviceWorker.ready;
      if (cancelled) return;
      const previousUser = localStorage.getItem('webchat-push-user');
      if (previousUser && previousUser !== String(user.id)) await disableWebPush(token);
      let subscription = await registration.pushManager.getSubscription();
      if (subscription && Notification.permission === 'granted') {
        await pushRequest('subscribe', token, subscription.toJSON());
        localStorage.setItem('webchat-push-user', String(user.id));
      } else subscription = null;
      if (cancelled) return;
      setEnabled(Boolean(subscription));
      setSetup({ registration, publicKey: config.publicKey });
    })().catch(error => { if (!cancelled) setMessage(error.message); });
    return () => { cancelled = true; };
  }, [token, user?.id]);

  const enable = async () => {
    // Request directly from the button gesture, before any network awaits (iOS).
    const permissionRequest = Notification.requestPermission();
    setBusy(true);
    setMessage('');
    try {
      const permission = await permissionRequest;
      if (permission !== 'granted') throw new Error('Разрешите уведомления для «Чаты» в настройках iPhone или настройках этого сайта.');
      const base64 = setup.publicKey.replace(/-/g, '+').replace(/_/g, '/');
      const applicationServerKey = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
      const subscription = await setup.registration.pushManager.getSubscription() ||
        await setup.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      await pushRequest('subscribe', token, subscription.toJSON());
      localStorage.setItem('webchat-push-user', String(user.id));
      setEnabled(true);
      setMessage('Уведомления включены на этом устройстве.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
 const action = async (type) => {
   setBusy(true);
   setMessage('');
   try {
     if (type === 'off') { await disableWebPush(token); setEnabled(false); }
     else { await pushRequest('test', token, {}); setMessage('Тестовое уведомление отправлено.'); }
   } catch (error) { setMessage(error.message); }
   finally { setBusy(false); }
 };

  const requestMediaAccess = async () => {
    setBusy(true);
    setMessage('');
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Safari не разрешает доступ к микрофону и камере на этой странице. Откройте сайт по HTTPS.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach(track => track.stop());
      setMessage('Доступ к микрофону и камере разрешён для этого сайта.');
    } catch (error) {
      const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
      setMessage(denied
        ? 'Доступ запрещён. Разрешите микрофон и камеру в настройках Safari для этого сайта.'
        : (error?.message || 'Не удалось получить доступ к микрофону и камере.'));
    } finally { setBusy(false); }
  };

  const mediaPermissionBlock = (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #e5e7eb' }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Микрофон и камера</h3>
      <p style={{ margin: 0 }}>Разрешение действует только для текущего сайта и нужно для голосовых сообщений и звонков.</p>
      <button disabled={busy} type="button" onClick={requestMediaAccess} style={{ marginTop: 10 }}>
        Разрешить микрофон и камеру
      </button>
    </div>
  );

 return <>
    <button type="button" onClick={() => setOpen(true)} style={buttonStyle}
      title="Уведомления о сообщениях" aria-label="Уведомления о сообщениях">
      <IoNotificationsOutline size={21} />
      {enabled && <span aria-hidden="true" style={{ position: 'absolute', right: 3, top: 3, width: 7, height: 7, borderRadius: '50%', background: '#16a34a' }} />}
    </button>
    {open && createPortal(
      <div role="dialog" aria-modal="true" aria-label="Уведомления"
        onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}
        onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}
        style={{ position: 'fixed', inset: 0, zIndex: 20000, background: '#0007', display: 'grid', placeItems: 'center', padding: 16 }}>
        <div style={{ background: 'white', color: '#111827', padding: 20, borderRadius: 14, width: '100%', maxWidth: 420, maxHeight: '85dvh', overflowY: 'auto', boxSizing: 'border-box' }}>
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>Уведомления о сообщениях</h2>
          {install ? <p>На iPhone откройте «Поделиться» → «На экран Домой». Затем запустите «Чаты» с новой иконки, войдите в аккаунт и нажмите здесь «Включить уведомления».</p>
            : <p>{enabled ? 'Уведомления включены на этом устройстве.' : 'Получайте новые сообщения, даже когда чаты закрыты.'}</p>}
          <p role="status" style={{ marginTop: 12, overflowWrap: 'anywhere' }}>{message}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {!install && setup && (!enabled
              ? <button disabled={busy} type="button" onClick={enable}>Включить уведомления</button>
              : <><button disabled={busy} type="button" onClick={() => action('test')}>Проверить</button>
                <button disabled={busy} type="button" onClick={() => action('off')}>Отключить</button></>)}
          </div>
          {mediaPermissionBlock}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <button autoFocus type="button" onClick={() => setOpen(false)}>Закрыть</button>
          </div>
        </div>
      </div>, document.body)}
  </>;
}

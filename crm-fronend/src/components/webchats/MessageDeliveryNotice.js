'use client';
import { useEffect, useState } from 'react';

export default function MessageDeliveryNotice({ message }) {
  const [offline, setOffline] = useState(false);
  const [missingUrl, setMissingUrl] = useState(null);
  const missing = Boolean(message.localFileUnavailable || (missingUrl && missingUrl === message.mediaUrl));
  useEffect(() => {
    let active = true;
    // A cached blob URL expires after closing the tab. Never probe remote media here.
    if (!message.sending && message.mediaUrl?.startsWith('blob:')) {
      fetch(message.mediaUrl).then(response => {
        if (active && !response.ok) setMissingUrl(message.mediaUrl);
      }).catch(() => { if (active) setMissingUrl(message.mediaUrl); });
    }
    return () => { active = false; };
  }, [message.sending, message.mediaUrl, message.localFileUnavailable]);
  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  const failed = message.deliveryStatus === 'failed';
  const label = missing ? 'Не отправлено. Файл недоступен, выберите его заново'
    : failed ? 'Не отправлено'
    : offline ? 'Ожидает подключения'
    : message.sending ? 'Отправляется…' : 'Ожидает повторной отправки';
  return <div role="status" style={{ marginTop: 6, padding: 8, borderRadius: 6, background: failed ? '#fef2f2' : '#fff7ed', color: failed ? '#b91c1c' : '#9a3412', fontSize: 13, whiteSpace: 'normal' }}>
    <strong>{label}</strong>
    {!message.sending && message.localText && <div>Повторите отправку через поле ввода после проверки подключения. При необходимости скопируйте текст сообщения.</div>}
    {!message.sending && !message.localText && !missing && <div>Для повторной отправки выберите вложение заново.</div>}
  </div>;
}

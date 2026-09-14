'use client';

import { useEffect, useRef, useState } from 'react';
import { IoArrowUp } from 'react-icons/io5';
import { toast } from 'react-toastify';

export default function RoomVoiceCounter({ apiBase, roomId, userId, token, socket, onJump }) {
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const cursor = useRef(null);
  const controller = useRef(null);

  useEffect(() => {
    let active = true;
    let flushing = false;
    let timer = null;
    let sequence = 0;
    const observed = new Set();
    const pending = new Set();
    const prefix = `room:voice:pending:v1:${apiBase}:${userId}:${roomId}:`;
    const base = `${apiBase}/rooms/${roomId}/voices`;
    const headers = { Authorization: `Bearer ${token}` };
    const request = async (url, method = 'GET') => {
      const res = await fetch(url, { method, headers, cache: 'no-store' });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
      return res.json();
    };
    const restore = () => {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key?.startsWith(prefix)) continue;
          const id = Number(key.slice(prefix.length));
          if (Number.isSafeInteger(id) && id > 0) { pending.add(id); observed.add(id); }
        }
      } catch {}
    };
    const refresh = async () => {
      const seq = ++sequence;
      try {
        const data = await request(`${base}/unplayed`);
        if (active && seq === sequence) setCount(Number(data.count) || 0);
      } catch {}
    };
    const flush = async () => {
      if (flushing || !active) return;
      flushing = true;
      try {
        restore();
        for (const messageId of pending) {
          if (!active) break;
          try { await request(`${base}/${messageId}/played`, 'PUT'); }
          catch (error) { if (error.status !== 404) break; }
          pending.delete(messageId);
          try { localStorage.removeItem(prefix + messageId); } catch {}
        }
        if (active) await refresh();
      } finally { flushing = false; }
    };
    const schedule = () => {
      if (timer || !active) return;
      timer = setTimeout(() => { timer = null; void refresh(); }, 400);
    };
    const onChanged = (event) => {
      if (Number(event?.roomId ?? event?.message?.roomId) === Number(roomId)) schedule();
    };
    const onPlaying = (event) => {
      if (Number(event.detail?.roomId) !== Number(roomId)) return;
      const messageId = Number(event.detail?.messageId);
      if (!Number.isSafeInteger(messageId) || messageId <= 0 || observed.has(messageId)) return;
      observed.add(messageId);
      pending.add(messageId);
      try { localStorage.setItem(prefix + messageId, '1'); } catch {}
      void flush();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void flush(); };
    const onStorage = (event) => { if (event.key?.startsWith(prefix)) void flush(); };
    const onReconnect = () => { void flush(); };
    controller.current = async () => {
      sequence++;
      const data = await request(`${base}/unplayed${cursor.current ? `?before=${cursor.current}` : ''}`);
      if (!active) return null;
      setCount(Number(data.count) || 0);
      cursor.current = data.nextMessageId || null;
      return cursor.current;
    };
    window.addEventListener('room-voice-playing', onPlaying);
    window.addEventListener('online', onReconnect);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    socket?.on('connect', onReconnect);
    for (const event of ['roomVoicePlayed', 'newRoomMessage', 'messageUpdated']) socket?.on(event, onChanged);
    void flush();
    return () => {
      active = false;
      controller.current = null;
      if (timer) clearTimeout(timer);
      window.removeEventListener('room-voice-playing', onPlaying);
      window.removeEventListener('online', onReconnect);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
      socket?.off('connect', onReconnect);
      for (const event of ['roomVoicePlayed', 'newRoomMessage', 'messageUpdated']) socket?.off(event, onChanged);
    };
  }, [apiBase, roomId, userId, token, socket]);

  if (!count) return null;
  return (
    <button type="button" disabled={busy}
      title={`Непрослушанных голосовых: ${count}. Перейти к следующему`}
      aria-label={`Непрослушанных голосовых: ${count}. Перейти к следующему`}
      className="shadow-md transition-transform hover:scale-105 disabled:cursor-wait"
      style={{ position: 'absolute', top: 12, right: 12, zIndex: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, width: 48, height: 48, margin: 0, padding: 0, border: 'none', borderRadius: '50%', background: '#1e40af', color: '#fff', opacity: busy ? 0.65 : 1 }}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          const messageId = await controller.current?.();
          if (messageId) await onJump(messageId);
        } catch { toast.info('Не удалось найти голосовое. Проверьте соединение.'); }
        finally { setBusy(false); }
      }}>
      <IoArrowUp size={18} aria-hidden="true" />
      <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1 }}>{count > 999 ? '+999…' : `+${count}`}</span>
    </button>
  );
}

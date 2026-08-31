'use client';

import React, { useEffect, useMemo, useState } from 'react';

export default function ForwardToRoomModal({
  visible = false,
  apiBase = '',
  token = '',
  busy = false,
  title = 'Переслать сообщение',
  onClose = () => {},
  onSelectRoom = () => {},
}) {
  const [rooms, setRooms] = useState([]);
  const [roomsRequestKey, setRoomsRequestKey] = useState('');
  const [errorByRequestKey, setErrorByRequestKey] = useState({});
  const [query, setQuery] = useState('');
  const [selectingRoomId, setSelectingRoomId] = useState(null);
  const activeRequestKey = visible && apiBase ? `${apiBase}|${token}` : '';
  const actionBusy = busy || selectingRoomId != null;
  const loading = Boolean(activeRequestKey && roomsRequestKey !== activeRequestKey);
  const error = activeRequestKey ? (errorByRequestKey[activeRequestKey] || '') : '';

  useEffect(() => {
    if (!activeRequestKey) return;
    let cancelled = false;
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    Promise.all([
      ['room', '/web/rooms'],
      ['boss', '/web/boss/chats'],
      ['max', '/max/chats'],
      ['telegram', '/telegram/chats'],
    ].map(async ([kind, path]) => {
      const response = await fetch(`${apiBase}${path}`, { method: 'GET', headers, credentials: token ? 'omit' : 'include' });
      if (!response.ok) return [];
      const data = await response.json().catch(() => []);
      const rows = Array.isArray(data) ? data : (Array.isArray(data?.chats) ? data.chats : []);
      return rows.map((room) => ({ ...room, forwardKind: kind }));
    }))
      .then((groups) => {
        const data = groups.flat();
        if (!cancelled) {
          setRooms(Array.isArray(data) ? data : []);
          setErrorByRequestKey((current) => ({ ...current, [activeRequestKey]: '' }));
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setErrorByRequestKey((current) => ({
            ...current,
            [activeRequestKey]: requestError?.message || 'Не удалось загрузить чаты',
          }));
        }
      })
      .finally(() => {
        if (!cancelled) setRoomsRequestKey(activeRequestKey);
      });
    return () => {
      cancelled = true;
    };
  }, [activeRequestKey, apiBase, token]);

  useEffect(() => {
    if (!visible) setSelectingRoomId(null);
  }, [visible]);

  const filteredRooms = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (rooms || [])
      .filter((room) => {
        const id = String(room?.rawId ?? room?.id ?? '').replace(/^(room-|boss-|max-|telegram-)/, '');
        return id.length > 0;
      })
      .filter((room) => {
        if (!needle) return true;
        const haystack = [
          room?.title,
          room?.name,
          room?.partnerName,
          room?.lastMessage,
          room?.id,
          room?.rawId,
        ].map((value) => String(value ?? '').toLowerCase()).join(' ');
        return haystack.includes(needle);
      });
  }, [query, rooms]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 12000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !actionBusy) onClose();
      }}
    >
      <div
        style={{
          width: 'min(520px, 100%)',
          maxHeight: 'min(680px, 90vh)',
          background: '#fff',
          borderRadius: 10,
          border: '1px solid rgba(15,23,42,0.12)',
          boxShadow: '0 20px 55px rgba(15,23,42,0.28)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            disabled={actionBusy}
            style={{ border: 'none', background: 'transparent', fontSize: 24, lineHeight: 1, cursor: actionBusy ? 'default' : 'pointer', margin: 0 }}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div style={{ padding: 12, borderBottom: '1px solid #eef2f7' }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск чата"
            autoFocus
            style={{
              width: '100%',
              height: 38,
              border: '1px solid #d1d5db',
              borderRadius: 8,
              padding: '0 12px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ overflowY: 'auto', padding: 8 }}>
          {loading ? (
            <div style={{ padding: 20, color: '#6b7280', textAlign: 'center' }}>Загрузка чатов...</div>
          ) : error ? (
            <div style={{ padding: 20, color: '#dc2626', textAlign: 'center' }}>{error}</div>
          ) : filteredRooms.length === 0 ? (
            <div style={{ padding: 20, color: '#6b7280', textAlign: 'center' }}>Чаты не найдены</div>
          ) : (
            filteredRooms.map((room) => {
              const rawId = String(room?.rawId ?? room?.id ?? '').replace(/^(room-|boss-|max-|telegram-)/, '');
              const roomId = Number(rawId);
              const label = room?.title || room?.name || room?.partnerName || `Room #${roomId}`;
              const meta = room?.forwardKind === 'telegram' ? 'Telegram' : room?.forwardKind === 'max' ? 'MAX' : room?.forwardKind === 'boss' ? 'Админ-чат' : room?.roomType === 'personal' ? 'Личный чат' : 'Группа';
              return (
                <button
                  key={`forward-${room?.forwardKind || 'room'}-${rawId}`}
                  type="button"
                  disabled={actionBusy}
                  onMouseDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!Number.isFinite(roomId) || roomId <= 0 || actionBusy) return;
                    setSelectingRoomId(roomId);
                    try {
                      await onSelectRoom({ ...room, id: rawId, forwardKind: room?.forwardKind || 'room' });
                    } finally {
                      setSelectingRoomId(null);
                    }
                  }}
                  style={{
                    width: '100%',
                    minHeight: 52,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    border: 'none',
                    borderRadius: 8,
                    background: 'transparent',
                    padding: '8px 10px',
                    margin: 0,
                    cursor: actionBusy ? 'default' : 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      flexShrink: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#e0f2fe',
                      color: '#0369a1',
                      fontWeight: 800,
                    }}
                  >
                    {String(label).trim().slice(0, 1).toUpperCase() || '#'}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontWeight: 650, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: '#6b7280' }}>{meta}</span>
                  </span>
                  {selectingRoomId === roomId && (
                    <span style={{ color: '#2563eb', fontSize: 12, fontWeight: 700 }}>...</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {actionBusy ? (
          <div style={{ padding: '10px 16px', borderTop: '1px solid #e5e7eb', color: '#2563eb', fontSize: 13 }}>
            Пересылаю...
          </div>
        ) : null}
      </div>
    </div>
  );
}

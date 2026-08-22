'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { formatChatDateTime } from './dateFormat';

const DAY_MS = 24 * 60 * 60 * 1000;
const STATIC_BASE_URL = process.env.NEXT_PUBLIC_STATIC_URL;

const safeDecodeText = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let current = raw;
  for (let i = 0; i < 4; i += 1) {
    const normalized = current.replace(/\+/g, ' ');
    try {
      const decoded = decodeURIComponent(normalized);
      if (!decoded || decoded === current) break;
      current = decoded;
      continue;
    } catch {
      break;
    }
  }
  return current;
};

const getPinPreview = (pin) => {
  const message = pin?.message || {};
  const type = String(message?.type || '').toLowerCase();
  if (type === 'audio') return 'Голосовое сообщение';
  if (type === 'video') return 'Видео';
  if (type === 'image') return 'Фото';
  if (type === 'file' || type === 'document') {
    const fileName = safeDecodeText(message?.fileName);
    return fileName ? `Файл: ${fileName}` : 'Файл';
  }
  const text = safeDecodeText(message?.content);
  if (text.startsWith('enc:v1:')) return 'Зашифрованное текстовое сообщение';
  return text || 'Закрепленное сообщение';
};

const resolveMediaUrl = (message) => {
  const raw = String(
    message?.mediaUrl ||
    message?.fileUrl ||
    message?.url ||
    ''
  ).trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${STATIC_BASE_URL}${raw}`;
  return `${STATIC_BASE_URL}/${raw}`;
};

const getMessageType = (message) => String(message?.type || '').toLowerCase();

const getPinTimestamp = (pin) => formatChatDateTime(pin?.message?.createdAt || pin?.createdAt);

const getPinAgeDays = (pin) => {
  const raw = pin?.createdAt || pin?.message?.createdAt;
  if (!raw) return 0;
  const ts = new Date(raw).getTime();
  if (!Number.isFinite(ts)) return 0;
  return Math.max(0, Math.floor((Date.now() - ts) / DAY_MS));
};

const getArchiveDaysLeft = (item) => {
  const raw = item?.archivedUntil;
  if (!raw) return 0;
  const ts = new Date(raw).getTime();
  if (!Number.isFinite(ts)) return 0;
  return Math.max(0, Math.ceil((ts - Date.now()) / DAY_MS));
};

export default function AllPinsView({ token, currentUserId, apiBase, onOpenRoom }) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [archiveItems, setArchiveItems] = useState([]);
  const [expandedRoomIds, setExpandedRoomIds] = useState({});
  const [archiveExpanded, setArchiveExpanded] = useState(false);
  const [pendingUnpin, setPendingUnpin] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingArchiveId, setDeletingArchiveId] = useState(0);
  const [lastActiveKey, setLastActiveKey] = useState('');
  const [expandedTextKeys, setExpandedTextKeys] = useState({});
  const [mediaModal, setMediaModal] = useState(null); // { type, src, title }
  const [activeAudio, setActiveAudio] = useState({ key: '', src: '' });

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }),
    [token]
  );

  const loadPins = useCallback(async () => {
    if (!token || !apiBase) {
      setGroups([]);
      setArchiveItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const roomsRes = await fetch(`${apiBase}/app/rooms`, { headers: authHeaders });
      const rooms = roomsRes.ok ? await roomsRes.json() : [];
      const personalRooms = (Array.isArray(rooms) ? rooms : []).filter(
        (room) => String(room?.type || '') === 'personal'
      );

      const pinResults = await Promise.allSettled(
        personalRooms.map(async (room) => {
          const res = await fetch(`${apiBase}/room_chats/${room.id}/pinned`, { headers: authHeaders });
          const data = res.ok ? await res.json() : {};
          return { room, pins: Array.isArray(data?.pinned) ? data.pinned : [] };
        })
      );

      const prepared = pinResults
        .filter((r) => r.status === 'fulfilled')
        .map((r) => r.value)
        .filter((x) => x.pins.length > 0)
        .map(({ room, pins }) => {
          const users = Array.isArray(room?.Users) ? room.Users : [];
          const partner = room?.partner;
          const fallbackUser = users.find((u) => Number(u?.id) !== Number(currentUserId));
          const employeeName = String(
            partner?.name || fallbackUser?.name || room?.name || `Чат #${room?.id}`
          );
          const sortedPins = [...pins].sort((a, b) => {
            const aTs = new Date(a?.message?.createdAt || a?.createdAt || 0).getTime();
            const bTs = new Date(b?.message?.createdAt || b?.createdAt || 0).getTime();
            return bTs - aTs;
          });
          const latestAt = new Date(sortedPins[0]?.message?.createdAt || sortedPins[0]?.createdAt || 0).getTime();
          return {
            roomId: Number(room.id),
            roomName: String(room?.name || `Чат #${room?.id}`),
            employeeName,
            pins: sortedPins,
            latestAt: Number.isFinite(latestAt) ? latestAt : 0,
          };
        })
        .sort((a, b) => b.latestAt - a.latestAt);

      const archiveRes = await fetch(`${apiBase}/room_chats/pinned/archive`, { headers: authHeaders });
      const archiveData = archiveRes.ok ? await archiveRes.json() : {};

      setGroups(prepared);
      setExpandedRoomIds((prev) => {
        const next = {};
        prepared.forEach((g) => { next[String(g.roomId)] = Boolean(prev[String(g.roomId)]); });
        return next;
      });
      setArchiveItems(Array.isArray(archiveData?.archived) ? archiveData.archived : []);
    } catch (e) {
      console.error('[AllPinsView] load error', e);
      setGroups([]);
      setArchiveItems([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders, currentUserId, token]);

  useEffect(() => {
    void loadPins();
  }, [loadPins]);

  const totalPins = useMemo(() => groups.reduce((sum, g) => sum + g.pins.length, 0), [groups]);

  const setPinActive = useCallback((key) => {
    setLastActiveKey(String(key || ''));
  }, []);

  const resetUnpinFlow = useCallback(() => {
    setPendingUnpin(null);
    setShowConfirm(false);
    setShowComment(false);
    setComment('');
    setSubmitting(false);
  }, []);

  const openUnpinFlow = useCallback((group, pin) => {
    setPinActive(`pin:${group.roomId}:${pin.id}`);
    const ownerId = Number(pin?.pinnedByUserId || pin?.pinnedBy?.id || 0);
    if (Number.isFinite(ownerId) && ownerId > 0 && ownerId !== Number(currentUserId)) {
      window.alert('Открепить может только тот, кто закрепил это сообщение.');
      return;
    }
    setPendingUnpin({ group, pin });
    setShowConfirm(true);
  }, [currentUserId, setPinActive]);

  const submitUnpin = useCallback(async () => {
    if (!pendingUnpin) {
      resetUnpinFlow();
      return;
    }
    setSubmitting(true);
    try {
      const roomId = Number(pendingUnpin.group.roomId);
      const pin = pendingUnpin.pin;
      const res = await fetch(`${apiBase}/room_chats/${roomId}/unpin`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          pinnedId: pin.id,
          messageId: pin.messageId,
          archiveComment: String(comment || '').trim(),
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      await loadPins();
      resetUnpinFlow();
    } catch (e) {
      console.error('[AllPinsView] unpin error', e);
      setSubmitting(false);
      window.alert('Не удалось открепить закреп');
    }
  }, [apiBase, authHeaders, comment, loadPins, pendingUnpin, resetUnpinFlow]);

  const deleteArchiveItem = useCallback(async (archiveId) => {
    const id = Number(archiveId);
    if (!Number.isFinite(id) || id <= 0) return;
    const ok = window.confirm('Удалить этот элемент из архива?');
    if (!ok) return;
    setDeletingArchiveId(id);
    try {
      const res = await fetch(`${apiBase}/room_chats/pinned/archive/${id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      setArchiveItems((prev) => prev.filter((x) => Number(x?.id) !== id));
    } catch (e) {
      console.error('[AllPinsView] delete archive error', e);
      window.alert('Не удалось удалить элемент из архива');
    } finally {
      setDeletingArchiveId(0);
    }
  }, [apiBase, authHeaders]);

  const toggleTextExpand = useCallback((key) => {
    setExpandedTextKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const stopAudioIfOther = useCallback((nextKey) => {
    if (!activeAudio.key || activeAudio.key === nextKey) return;
    const el = document.getElementById(`all-pins-audio-${activeAudio.key}`);
    if (el && typeof el.pause === 'function') el.pause();
  }, [activeAudio.key]);

  const handlePrimaryAction = useCallback((itemKey, message, pinContext) => {
    setPinActive(itemKey);
    const type = getMessageType(message);
    const src = resolveMediaUrl(message);

    if (type === 'text' || !type) {
      toggleTextExpand(itemKey);
      return;
    }
    if (type === 'audio') {
      stopAudioIfOther(itemKey);
      setActiveAudio((prev) => {
        if (prev.key === itemKey) return { key: '', src: '' };
        return { key: itemKey, src };
      });
      return;
    }
    if (type === 'video' || type === 'image') {
      stopAudioIfOther(itemKey);
      setActiveAudio({ key: '', src: '' });
      setMediaModal({
        type,
        src,
        title: getPinPreview(pinContext),
      });
      return;
    }
    if (type === 'file' || type === 'document') {
      if (src) window.open(src, '_blank', 'noopener,noreferrer');
      return;
    }
    toggleTextExpand(itemKey);
  }, [setPinActive, stopAudioIfOther, toggleTextExpand]);

  if (loading) {
    return <div style={{ padding: 16, color: '#666' }}>Загрузка закрепов...</div>;
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#f7f9fc' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', background: '#fff', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ color: '#374151', fontWeight: 600 }}>Сотрудников: {groups.length}</div>
        <div style={{ color: '#374151', fontWeight: 600 }}>Закрепов: {totalPins}</div>
      </div>
      <div style={{ padding: 12, overflow: 'auto' }}>
        {groups.map((group) => {
          const open = Boolean(expandedRoomIds[String(group.roomId)]);
          return (
            <div key={`room-${group.roomId}`} style={{ background: '#fff', border: '1px solid #ececec', borderRadius: 10, marginBottom: 10 }}>
              <button
                type="button"
                onClick={() => setExpandedRoomIds((prev) => ({ ...prev, [String(group.roomId)]: !prev[String(group.roomId)] }))}
                style={{ width: '100%', textAlign: 'left', border: 0, background: 'transparent', padding: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
              >
                <div style={{ fontWeight: 700, color: '#1f2937' }}>{group.employeeName}</div>
                <div style={{ color: '#6b7280' }}>{group.pins.length} {open ? '▴' : '▾'}</div>
              </button>
              {open && (
                <div style={{ borderTop: '1px solid #f0f0f0', padding: 8 }}>
                  {group.pins.map((pin) => (
                    <div key={`pin-${group.roomId}-${pin.id}-${pin.messageId}`} style={{ border: lastActiveKey === `pin:${group.roomId}:${pin.id}` ? '2px solid #2563eb' : '1px solid #f1f5f9', borderRadius: 8, padding: 8, marginBottom: 8, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <button
                          type="button"
                          onClick={() => handlePrimaryAction(`pin:${group.roomId}:${pin.id}`, pin?.message || {}, pin)}
                          style={{ border: 0, background: 'transparent', padding: 0, margin: 0, textAlign: 'left', cursor: 'pointer', color: '#111827', fontSize: 14, lineHeight: '18px', width: '100%' }}
                        >
                          {(() => {
                            const full = getPinPreview(pin);
                            const openText = Boolean(expandedTextKeys[`pin:${group.roomId}:${pin.id}`]);
                            if (openText) return full;
                            return full.length > 120 ? `${full.slice(0, 120)}...` : full;
                          })()}
                        </button>
                        <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>{getPinTimestamp(pin)}</div>
                        {activeAudio.key === `pin:${group.roomId}:${pin.id}` && activeAudio.src ? (
                          <div style={{ marginTop: 6 }}>
                            <audio
                              id={`all-pins-audio-pin:${group.roomId}:${pin.id}`}
                              src={activeAudio.src}
                              controls
                              autoPlay
                              onEnded={() => setActiveAudio({ key: '', src: '' })}
                              style={{ width: '100%' }}
                            />
                          </div>
                        ) : null}
                        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => {
                              setPinActive(`pin:${group.roomId}:${pin.id}`);
                              onOpenRoom?.(group.roomId, Number(pin?.messageId || pin?.message?.id || 0));
                            }}
                            style={{ border: '1px solid #d1d5db', background: '#fff', color: '#111827', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}
                          >
                            К сообщению
                          </button>
                          <button type="button" onClick={() => openUnpinFlow(group, pin)} style={{ border: '1px solid #fca5a5', background: '#fff', color: '#b91c1c', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>Открепить</button>
                        </div>
                      </div>
                      <div style={{ minWidth: 32, textAlign: 'center', color: '#6b7280' }}>
                        <div style={{ fontWeight: 700, color: '#111827' }}>{getPinAgeDays(pin)}</div>
                        <div style={{ fontSize: 11 }}>дн</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div style={{ background: '#fff', border: '1px solid #ececec', borderRadius: 10 }}>
          <button
            type="button"
            onClick={() => setArchiveExpanded((v) => !v)}
            style={{ width: '100%', textAlign: 'left', border: 0, background: 'transparent', padding: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
          >
            <div style={{ fontWeight: 700, color: '#1f2937' }}>АРХИВ</div>
            <div style={{ color: '#6b7280' }}>{archiveItems.length} {archiveExpanded ? '▴' : '▾'}</div>
          </button>
          {archiveExpanded && (
            <div style={{ borderTop: '1px solid #f0f0f0', padding: 8 }}>
              {archiveItems.length === 0 ? (
                <div style={{ color: '#6b7280', fontStyle: 'italic' }}>Архив пуст</div>
              ) : (
                archiveItems.map((item) => (
                  <div key={`arch-${item.id}`} style={{ border: lastActiveKey === `arch:${item.id}` ? '2px solid #2563eb' : '1px solid #f1f5f9', borderRadius: 8, padding: 8, marginBottom: 8, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <button
                        type="button"
                        onClick={() => handlePrimaryAction(`arch:${item.id}`, item?.message || {}, { message: item?.message })}
                        style={{ border: 0, background: 'transparent', padding: 0, margin: 0, textAlign: 'left', cursor: 'pointer', color: '#111827', fontSize: 14, lineHeight: '18px', width: '100%' }}
                      >
                        {(() => {
                          const full = getPinPreview({ message: item.message });
                          const openText = Boolean(expandedTextKeys[`arch:${item.id}`]);
                          if (openText) return full;
                          return full.length > 120 ? `${full.slice(0, 120)}...` : full;
                        })()}
                      </button>
                      <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
                        {String(item?.room?.name || `Чат #${item.roomId}`)} • {item.unpinnedAt ? formatChatDateTime(item.unpinnedAt) : ''}
                      </div>
                      {activeAudio.key === `arch:${item.id}` && activeAudio.src ? (
                        <div style={{ marginTop: 6 }}>
                          <audio
                            id={`all-pins-audio-arch:${item.id}`}
                            src={activeAudio.src}
                            controls
                            autoPlay
                            onEnded={() => setActiveAudio({ key: '', src: '' })}
                            style={{ width: '100%' }}
                          />
                        </div>
                      ) : null}
                      {String(item.comment || '').trim().length > 0 ? (
                        <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>Комментарий: {String(item.comment)}</div>
                      ) : null}
                    </div>
                    <div style={{ minWidth: 56, textAlign: 'center', color: '#6b7280', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => { void deleteArchiveItem(item.id); }}
                        title="Удалить из архива"
                        disabled={deletingArchiveId === Number(item.id)}
                        style={{
                          border: '1px solid #fca5a5',
                          color: '#b91c1c',
                          background: '#fff',
                          borderRadius: 999,
                          width: 30,
                          height: 30,
                          lineHeight: '28px',
                          cursor: deletingArchiveId === Number(item.id) ? 'default' : 'pointer',
                          fontWeight: 700,
                          fontSize: 42,
                          padding: 0,
                          marginLeft: 10,
                          opacity: deletingArchiveId === Number(item.id) ? 0.5 : 1,
                        }}
                      >
                        ×
                      </button>
                      <div style={{ fontWeight: 700, color: '#111827' }}>{getArchiveDaysLeft(item)}</div>
                      <div style={{ fontSize: 11 }}>дн</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {showConfirm && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Хотите открепить?</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={resetUnpinFlow} style={ghostBtnStyle}>НЕТ</button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirm(false);
                  setShowComment(true);
                }}
                style={primaryBtnStyle}
              >
                ДА
              </button>
            </div>
          </div>
        </div>
      )}

      {showComment && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Комментарий</div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Введите комментарий (необязательно)"
              rows={4}
              style={{ width: '100%', resize: 'vertical', border: '1px solid #e5e7eb', borderRadius: 8, padding: 8 }}
              disabled={submitting}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button type="button" onClick={resetUnpinFlow} style={ghostBtnStyle} disabled={submitting}>Отмена</button>
              <button type="button" onClick={() => { void submitUnpin(); }} style={primaryBtnStyle} disabled={submitting}>
                {submitting ? 'Сохранение...' : 'ОК'}
              </button>
            </div>
          </div>
        </div>
      )}

      {mediaModal && (
        <div style={overlayStyle} onClick={() => setMediaModal(null)}>
          <div style={{ ...modalStyle, maxWidth: 920 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>{mediaModal.title || 'Медиа'}</div>
            {mediaModal.type === 'image' && mediaModal.src ? (
              <Image
                src={mediaModal.src}
                alt=""
                width={1200}
                height={900}
                unoptimized
                style={{ maxWidth: '100%', maxHeight: '70vh', width: 'auto', height: 'auto', objectFit: 'contain' }}
              />
            ) : null}
            {mediaModal.type === 'video' && mediaModal.src ? (
              <video src={mediaModal.src} controls autoPlay style={{ width: '100%', maxHeight: '70vh' }} />
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" onClick={() => setMediaModal(null)} style={ghostBtnStyle}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000,
};

const modalStyle = {
  width: '100%',
  maxWidth: 440,
  background: '#fff',
  borderRadius: 12,
  padding: 14,
  border: '1px solid #ececec',
};

const ghostBtnStyle = {
  minWidth: 90,
  height: 36,
  borderRadius: 8,
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#111827',
  cursor: 'pointer',
  fontWeight: 600,
};

const primaryBtnStyle = {
  minWidth: 90,
  height: 36,
  borderRadius: 8,
  border: 'none',
  background: '#2f7bff',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 700,
};

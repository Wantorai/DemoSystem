'use client';

import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ChatLayout from '@/components/webchats/ChatLayout';
import { SocketProvider } from '@/components/webchats/SocketProvider';
import { useWebSocket } from '@/components/webchats/SocketProvider';
import { AuthContext } from '@/context/AuthContext';
import { formatChatDateTime } from '@/components/webchats/dateFormat';

const ALERTS_BOSS_CHAT_ID = 5;

function formatDateTime(value) {
  return formatChatDateTime(value) || '—';
}

function toDatetimeLocalInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function AlertsContent() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  const { token, user } = useContext(AuthContext);
  const { socket } = useWebSocket();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [tab, setTab] = useState('inbox');
  const [defaultTabResolved, setDefaultTabResolved] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [inboxUnreadTotal, setInboxUnreadTotal] = useState(0);
  const [inbox, setInbox] = useState([]);
  const [sent, setSent] = useState([]);
  const [options, setOptions] = useState({ employees: [], bossChats: [], groups: [] });

  const [createOpen, setCreateOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [targetKind, setTargetKind] = useState('users');
  const [selectedTargetIds, setSelectedTargetIds] = useState([]);
  const [scheduledFor, setScheduledFor] = useState(() => new Date());
  const [editOpen, setEditOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const headers = useMemo(() => {
    const h = { Accept: 'application/json', 'Content-Type': 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  const readJson = useCallback(async (url, opts = {}) => {
    const resp = await fetch(url, opts);
    if (!resp.ok) return { ok: false, status: resp.status, data: null };
    try {
      const data = await resp.json();
      return { ok: true, status: resp.status, data };
    } catch {
      return { ok: false, status: resp.status, data: null };
    }
  }, []);

  const normalizeOptions = useCallback((raw) => ({
    employees: Array.isArray(raw?.employees) ? raw.employees : [],
    bossChats: Array.isArray(raw?.bossChats) ? raw.bossChats : [],
    groups: Array.isArray(raw?.groups) ? raw.groups : [],
  }), []);

  const loadFallbackOptions = useCallback(async () => {
    const authOnlyHeaders = token
      ? { Accept: 'application/json', Authorization: `Bearer ${token}` }
      : { Accept: 'application/json' };
    const common = { method: 'GET', credentials: 'include' };

    const [usersResp, bossResp, roomsResp] = await Promise.allSettled([
      readJson(`${apiBase}/admin/users`, { ...common, headers: authOnlyHeaders }),
      readJson(`${apiBase}/web/boss/chats`, { ...common, headers: authOnlyHeaders }),
      readJson(`${apiBase}/web/rooms`, { ...common, headers: authOnlyHeaders }),
    ]);

    const usersData = usersResp.status === 'fulfilled' && usersResp.value.ok ? usersResp.value.data : [];
    const bossData = bossResp.status === 'fulfilled' && bossResp.value.ok ? bossResp.value.data : [];
    const roomsData = roomsResp.status === 'fulfilled' && roomsResp.value.ok ? roomsResp.value.data : [];

    const employees = (Array.isArray(usersData) ? usersData : [])
      .filter((u) => {
        if (u?.isActive === false) return false;
        if (Object.prototype.hasOwnProperty.call(u || {}, 'canChat')) return Boolean(u.canChat);
        return true;
      })
      .map((u) => ({ id: Number(u.id), name: String(u.name || `User ${u.id}`) }))
      .filter((u) => Number.isFinite(u.id) && u.id > 0);

    const bossChats = (Array.isArray(bossData) ? bossData : [])
      .map((c) => ({
        id: Number(c.id),
        name: String(c.name || c.title || `Чат ${c.id}`),
      }))
      .filter((c) => Number.isFinite(c.id) && c.id > 0);

    const groups = (Array.isArray(roomsData) ? roomsData : [])
      .filter((r) => String(r?.roomType || r?.type || '').toLowerCase() === 'group')
      .map((r) => ({ id: Number(r.id), name: String(r.name || `Группа ${r.id}`) }))
      .filter((r) => Number.isFinite(r.id) && r.id > 0);

    return { employees, bossChats, groups };
  }, [apiBase, readJson, token]);

  const fetchAll = useCallback(async () => {
    const alertsResp = await fetch(`${apiBase}/admin/alerts`, {
      method: 'GET',
      headers,
      credentials: token ? 'omit' : 'include',
    });
    if (!alertsResp.ok) throw new Error(`Не удалось загрузить оповещения (${alertsResp.status})`);

    const payload = await alertsResp.json();
    const nextCanCreate = Boolean(payload?.canCreate);
    const nextInbox = Array.isArray(payload?.inbox) ? payload.inbox : [];
    const nextSent = Array.isArray(payload?.sent) ? payload.sent : [];

    setCanCreate(nextCanCreate);
    setInbox(nextInbox);
    setSent(nextSent);
    setInboxUnreadTotal(Number(payload?.inboxUnreadTotal || 0));

    if (!defaultTabResolved) {
      setTab(nextInbox.length > 0 || !nextCanCreate ? 'inbox' : 'sent');
      setDefaultTabResolved(true);
    }

    if (nextCanCreate) {
      let resolved = { employees: [], bossChats: [], groups: [] };
      const primary = await readJson(`${apiBase}/admin/alerts/options`, {
        method: 'GET',
        headers,
        credentials: token ? 'omit' : 'include',
      });

      if (primary.ok) {
        resolved = normalizeOptions(primary.data);
      } else {
        const retryNoBearer = await readJson(`${apiBase}/admin/alerts/options`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'include',
        });
        if (retryNoBearer.ok) {
          resolved = normalizeOptions(retryNoBearer.data);
        }
      }

      const emptyAll = !resolved.employees.length && !resolved.bossChats.length && !resolved.groups.length;
      if (emptyAll) {
        const fallback = await loadFallbackOptions();
        const stillEmpty = !fallback.employees.length && !fallback.bossChats.length && !fallback.groups.length;
        if (stillEmpty) {
          setError('Не удалось загрузить получателей для оповещений');
        } else {
          resolved = fallback;
        }
      }

      setOptions(resolved);
    } else {
      setOptions({ employees: [], bossChats: [], groups: [] });
      setCreateOpen(false);
    }
  }, [apiBase, headers, token, defaultTabResolved, readJson, normalizeOptions, loadFallbackOptions]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await fetchAll();
    } catch (e) {
      setError(e?.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [fetchAll]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    const id = setInterval(() => {
      fetchAll().catch(() => {});
    }, 10000);
    return () => clearInterval(id);
  }, [fetchAll]);

  useEffect(() => {
    if (!socket || !user?.id) return undefined;

    const onAlertsChanged = (payload) => {
      try {
        const me = Number(user.id);
        const target = Array.isArray(payload?.targetUserIds)
          ? payload.targetUserIds.map((v) => Number(v)).filter((v) => Number.isFinite(v))
          : [];
        if (target.length > 0 && !target.includes(me)) return;
        fetchAll().catch(() => {});
      } catch (e) {
        console.warn('[alerts-page] socket handler failed', e);
      }
    };

    socket.on('alerts:changed', onAlertsChanged);
    return () => {
      socket.off('alerts:changed', onAlertsChanged);
    };
  }, [socket, user?.id, fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setError('');
    try {
      await fetchAll();
    } catch (e) {
      setError(e?.message || 'Ошибка обновления');
    } finally {
      setRefreshing(false);
    }
  }, [fetchAll]);

  const markRead = useCallback(async (alertId) => {
    try {
      const resp = await fetch(`${apiBase}/admin/alerts/${alertId}/read`, {
        method: 'POST',
        headers,
        credentials: token ? 'omit' : 'include',
      });
      if (!resp.ok) throw new Error('mark read failed');
      setInbox((prev) => prev.map((row) => (
        Number(row?.alert?.id) === Number(alertId)
          ? { ...row, isRead: true, readAt: new Date().toISOString() }
          : row
      )));
      setInboxUnreadTotal((v) => Math.max(0, Number(v || 0) - 1));
    } catch {
      await onRefresh();
    }
  }, [apiBase, headers, token, onRefresh]);

  const targetList = useMemo(() => {
    if (targetKind === 'users') return options.employees;
    if (targetKind === 'boss') return options.bossChats;
    return options.groups;
  }, [options, targetKind]);

  const toggleTarget = useCallback((id) => {
    setSelectedTargetIds((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
  }, []);

  const submitCreate = useCallback(async () => {
    const title = String(draftTitle || '').trim();
    const content = String(draftContent || '').trim();
    if (!title || !content || selectedTargetIds.length === 0) return;

    setSending(true);
    try {
      const resp = await fetch(`${apiBase}/admin/alerts`, {
        method: 'POST',
        headers,
        credentials: token ? 'omit' : 'include',
        body: JSON.stringify({
          title,
          content,
          targetKind,
          targetIds: selectedTargetIds,
          scheduledFor: scheduledFor.toISOString(),
        }),
      });
      if (!resp.ok) throw new Error('create failed');
      setCreateOpen(false);
      setDraftTitle('');
      setDraftContent('');
      setTargetKind('users');
      setSelectedTargetIds([]);
      await onRefresh();
    } catch (e) {
      setError(e?.message || 'Не удалось отправить оповещение');
    } finally {
      setSending(false);
    }
  }, [apiBase, headers, token, draftTitle, draftContent, selectedTargetIds, targetKind, scheduledFor, onRefresh]);

  const openEdit = useCallback((item) => {
    setEditingAlert(item);
    setEditTitle(String(item?.title || ''));
    setEditContent(String(item?.content || ''));
    setEditOpen(true);
  }, []);

  const submitEdit = useCallback(async () => {
    const alertId = Number(editingAlert?.id);
    if (!Number.isFinite(alertId) || alertId <= 0) return;
    const title = String(editTitle || '').trim();
    const content = String(editContent || '').trim();
    if (!title || !content) return;
    setSavingEdit(true);
    try {
      const resp = await fetch(`${apiBase}/admin/alerts/${alertId}`, {
        method: 'PATCH',
        headers,
        credentials: token ? 'omit' : 'include',
        body: JSON.stringify({ title, content }),
      });
      if (!resp.ok) throw new Error('update failed');
      setEditOpen(false);
      setEditingAlert(null);
      await onRefresh();
    } catch (e) {
      setError(e?.message || 'Не удалось обновить оповещение');
    } finally {
      setSavingEdit(false);
    }
  }, [apiBase, editingAlert?.id, editTitle, editContent, headers, token, onRefresh]);

  const removeAlert = useCallback(async (alertId) => {
    const id = Number(alertId);
    if (!Number.isFinite(id) || id <= 0) return;
    setDeletingId(id);
    try {
      const resp = await fetch(`${apiBase}/admin/alerts/${id}`, {
        method: 'DELETE',
        headers,
        credentials: token ? 'omit' : 'include',
      });
      if (!resp.ok) throw new Error('delete failed');
      await onRefresh();
    } catch (e) {
      setError(e?.message || 'Не удалось удалить оповещение');
    } finally {
      setDeletingId(null);
    }
  }, [apiBase, headers, token, onRefresh]);

  const visibleItems = tab === 'inbox' ? inbox : sent;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setTab('inbox')} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: tab === 'inbox' ? '#007AFF' : '#fff', color: tab === 'inbox' ? '#fff' : '#333' }}>
            Входящие ({inboxUnreadTotal})
          </button>
          <button type="button" onClick={() => setTab('sent')} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: tab === 'sent' ? '#007AFF' : '#fff', color: tab === 'sent' ? '#fff' : '#333' }}>
            Отправленные
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onRefresh} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #bbb', background: '#fff', color: '#111', fontWeight: 600 }}>
            {refreshing ? 'Обновление...' : 'Обновить'}
          </button>
          {canCreate && (
            <button
              type="button"
              onClick={() => {
                setScheduledFor(new Date());
                setCreateOpen(true);
              }}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #0f6ad9', background: '#0f6ad9', color: '#fff' }}
            >
              + Создать
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 16 }}>Загрузка оповещений...</div>
      ) : error ? (
        <div style={{ padding: 16, color: '#b00020' }}>{error}</div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {visibleItems.length === 0 ? (
            <div style={{ color: '#666' }}>Пока пусто</div>
          ) : (
            visibleItems.map((item) => {
              if (tab === 'inbox') {
                const row = item;
                const isRead = Boolean(row?.isRead);
                return (
                  <div
                    key={`inbox-${row?.recipientId}`}
                    onClick={() => { if (!isRead) markRead(row?.alert?.id); }}
                    role="button"
                    tabIndex={0}
                    style={{
                      border: `1px solid ${isRead ? '#e5e5e5' : '#ffd6a5'}`,
                      background: isRead ? '#fff' : '#fff7ed',
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 10,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{row?.alert?.title || 'Оповещение'}</div>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
                      От: {row?.alert?.creator?.name || 'Система'} · {formatDateTime(row?.alert?.createdAt)}
                    </div>
                    <div>{row?.alert?.content || ''}</div>
                    {!isRead && <div style={{ marginTop: 8, fontSize: 12, color: '#b45309' }}>Нажмите, чтобы отметить прочитанным</div>}
                  </div>
                );
              }

              const row = item;
              const pending = Number(row?.pendingRecipients || 0);
              return (
                <div
                  key={`sent-${row?.id}`}
                  style={{
                    border: `1px solid ${pending > 0 ? '#ffd6a5' : '#e5e5e5'}`,
                    background: pending > 0 ? '#fff7ed' : '#fff',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{row?.title || 'Оповещение'}</div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
                    {formatDateTime(row?.createdAt)} · Прочитали {Number(row?.readRecipients || 0)}/{Number(row?.totalRecipients || 0)}
                  </div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
                    {row?.publishedAt ? `Опубликовано: ${formatDateTime(row.publishedAt)}` : `Запланировано: ${formatDateTime(row?.scheduledFor)}`}
                  </div>
                  <div>{row?.content || ''}</div>
                  {canCreate && (
                    <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        style={{ padding: '6px 10px', border: '1px solid #bbb', borderRadius: 8, background: '#fff', color: '#111', fontWeight: 600 }}
                      >
                        Редактировать
                      </button>
                      <button
                        type="button"
                        onClick={() => removeAlert(row?.id)}
                        disabled={deletingId === Number(row?.id)}
                        style={{ padding: '6px 10px', border: '1px solid #d14343', borderRadius: 8, background: '#fff5f5', color: '#a92a2a', fontWeight: 600, opacity: deletingId === Number(row?.id) ? 0.6 : 1 }}
                      >
                        {deletingId === Number(row?.id) ? 'Удаление...' : 'Удалить'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {createOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{ width: 'min(680px, 95vw)', maxHeight: '85vh', overflow: 'auto', background: '#fff', borderRadius: 12, padding: 16, color: '#111' }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 12, color: '#111' }}>Новое оповещение</div>

            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Заголовок"
              style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 8, marginBottom: 10, color: '#111', background: '#fff' }}
            />
            <textarea
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              placeholder="Текст оповещения"
              rows={4}
              style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 8, marginBottom: 10, resize: 'vertical', color: '#111', background: '#fff' }}
            />

            <div style={{ marginBottom: 10, fontWeight: 600, color: '#111' }}>Тип получателей</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {[
                { id: 'users', label: 'Сотрудники' },
                { id: 'boss', label: 'Чаты' },
                { id: 'group', label: 'Группы' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTargetKind(item.id);
                    setSelectedTargetIds([]);
                  }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid #ddd',
                    background: targetKind === item.id ? '#007AFF' : '#fff',
                    color: targetKind === item.id ? '#fff' : '#111',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 10, fontWeight: 600, color: '#111' }}>Дата и время отправки</div>
            <input
              type="datetime-local"
              value={toDatetimeLocalInputValue(scheduledFor)}
              onChange={(e) => {
                const next = new Date(e.target.value);
                if (!Number.isNaN(next.getTime())) setScheduledFor(next);
              }}
              style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 8, marginBottom: 12, color: '#111', background: '#fff' }}
            />

            <div style={{ marginBottom: 8, fontWeight: 600, color: '#111' }}>Получатели</div>
            <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid #eee', borderRadius: 8, marginBottom: 12 }}>
              {targetList.map((u) => {
                const selected = selectedTargetIds.includes(u.id);
                return (
                  <button
                    key={`${targetKind}-${u.id}`}
                    type="button"
                    onClick={() => toggleTarget(u.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      border: 'none',
                      borderBottom: '1px solid #f2f2f2',
                      background: selected ? '#eaf3ff' : '#fff',
                      cursor: 'pointer',
                      color: '#111',
                      fontWeight: 500,
                    }}
                  >
                    {selected ? '☑ ' : '☐ '}
                    {u.name}
                  </button>
              );
              })}
              {targetList.length === 0 && (
                <div style={{ padding: 10, color: '#666', background: '#fff' }}>Нет получателей для этого типа</div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setCreateOpen(false)} style={{ padding: '8px 12px', border: '1px solid #bbb', borderRadius: 8, background: '#fff', color: '#111', fontWeight: 600 }}>
                Отмена
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={submitCreate}
                style={{ padding: '8px 12px', border: '1px solid #0f6ad9', borderRadius: 8, background: '#0f6ad9', color: '#fff', opacity: sending ? 0.6 : 1, fontWeight: 600 }}
              >
                {sending ? 'Отправка...' : 'Отправить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001,
        }}>
          <div style={{ width: 'min(680px, 95vw)', maxHeight: '85vh', overflow: 'auto', background: '#fff', borderRadius: 12, padding: 16, color: '#111' }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 12, color: '#111' }}>Редактировать оповещение</div>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Заголовок"
              style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 8, marginBottom: 10, color: '#111', background: '#fff' }}
            />
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Текст оповещения"
              rows={5}
              style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 8, marginBottom: 12, resize: 'vertical', color: '#111', background: '#fff' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  setEditingAlert(null);
                }}
                style={{ padding: '8px 12px', border: '1px solid #bbb', borderRadius: 8, background: '#fff', color: '#111', fontWeight: 600 }}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={savingEdit}
                onClick={submitEdit}
                style={{ padding: '8px 12px', border: '1px solid #0f6ad9', borderRadius: 8, background: '#0f6ad9', color: '#fff', opacity: savingEdit ? 0.6 : 1, fontWeight: 600 }}
              >
                {savingEdit ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WebAlertsPage() {
  return (
    <SocketProvider>
      <ChatLayout chatId={ALERTS_BOSS_CHAT_ID}>
        <AlertsContent />
      </ChatLayout>
    </SocketProvider>
  );
}

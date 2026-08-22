'use client';

import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthContext } from '../../context/AuthContext';

export default function CrossChatEntry({ onOpenRoom = null, trigger = null }) {
  const router = useRouter();
  const { token, user } = useContext(AuthContext);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  const hasChatAccess = user?.canChat !== false;

  const [isOpen, setIsOpen] = useState(false);
  const [domain, setDomain] = useState('');
  const [phone, setPhone] = useState('');
  const [incoming, setIncoming] = useState([]);
  const [incomingCount, setIncomingCount] = useState(0);
  const [outgoing, setOutgoing] = useState([]);
  const [loadingIncoming, setLoadingIncoming] = useState(false);
  const [loadingOutgoing, setLoadingOutgoing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState(false);
  const [incomingError, setIncomingError] = useState('');
  const [busyById, setBusyById] = useState({});

  const headers = useMemo(() => {
    if (!token) return null;
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }, [token]);

  const loadIncoming = useCallback(async (opts = {}) => {
    if (!headers || !apiBase) return;
    const silent = Boolean(opts?.silent);
    if (!silent) {
      setLoadingIncoming(true);
      setIncomingError('');
    }
    try {
      const res = await fetch(`${apiBase}/cross-chat/requests/incoming`, {
        method: 'GET',
        headers,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || `HTTP ${res.status}`);
      const safeRows = Array.isArray(payload) ? payload : [];
      setIncoming(safeRows);
      setIncomingCount(safeRows.length);
    } catch (err) {
      console.error('cross-chat incoming load failed:', err);
      if (!silent) {
        setIncomingError(String(err?.message || 'Ошибка загрузки входящих запросов'));
      }
    } finally {
      if (!silent) {
        setLoadingIncoming(false);
      }
    }
  }, [apiBase, headers]);

  const loadOutgoing = useCallback(async (opts = {}) => {
    if (!headers || !apiBase) return;
    const silent = Boolean(opts?.silent);
    if (!silent) {
      setLoadingOutgoing(true);
    }
    try {
      const res = await fetch(`${apiBase}/cross-chat/requests/outgoing`, {
        method: 'GET',
        headers,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || `HTTP ${res.status}`);
      setOutgoing(Array.isArray(payload) ? payload : []);
    } catch (err) {
      console.error('cross-chat outgoing load failed:', err);
    } finally {
      if (!silent) {
        setLoadingOutgoing(false);
      }
    }
  }, [apiBase, headers]);

  useEffect(() => {
    loadIncoming({ silent: true });
    loadOutgoing({ silent: true });
  }, [loadIncoming, loadOutgoing]);

  useEffect(() => {
    if (!headers || !apiBase) return undefined;
    const timer = setInterval(() => {
      loadIncoming({ silent: true });
      loadOutgoing({ silent: true });
    }, 10000);
    return () => clearInterval(timer);
  }, [apiBase, headers, loadIncoming, loadOutgoing]);

  useEffect(() => {
    if (!isOpen) return;
    loadIncoming({ silent: true });
    loadOutgoing({ silent: true });
  }, [isOpen, loadIncoming, loadOutgoing]);

  const openRoom = useCallback((roomId) => {
    const value = Number(roomId);
    if (!Number.isFinite(value) || value <= 0) return;
    if (typeof onOpenRoom === 'function') {
      onOpenRoom(value);
      return;
    }
    router.push(`/webchats/room/${encodeURIComponent(String(value))}`);
  }, [onOpenRoom, router]);

  const onSubmitCreate = useCallback(async (e) => {
    e.preventDefault();
    if (!hasChatAccess) return;
    if (!headers || !apiBase) return;

    setSubmitting(true);
    setMessage('');
    setMessageError(false);
    try {
      const res = await fetch(`${apiBase}/cross-chat/requests`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          domain: String(domain || '').trim(),
          phone: String(phone || '').trim(),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || `HTTP ${res.status}`);
      }
      setMessage(String(payload?.message || 'Запрос отправлен'));
      setMessageError(false);
      setDomain(String(domain || '').trim());
      setPhone('');
      await loadIncoming({ silent: true });
      await loadOutgoing({ silent: true });
    } catch (err) {
      setMessage(String(err?.message || 'Не удалось отправить запрос'));
      setMessageError(true);
    } finally {
      setSubmitting(false);
    }
  }, [apiBase, domain, hasChatAccess, headers, loadIncoming, loadOutgoing, phone]);

  const actOnRequest = useCallback(async (id, action) => {
    if (!headers || !apiBase) return;
    const requestId = Number(id);
    if (!Number.isFinite(requestId) || requestId <= 0) return;

    setBusyById((prev) => ({ ...prev, [requestId]: true }));
    setMessage('');
    setMessageError(false);
    try {
      const endpoint = action === 'accept'
        ? `${apiBase}/cross-chat/requests/${requestId}/accept`
        : `${apiBase}/cross-chat/requests/${requestId}/reject`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || `HTTP ${res.status}`);
      }

      if (action === 'accept' && Number(payload?.roomId) > 0) {
        openRoom(Number(payload.roomId));
      }
      await loadIncoming({ silent: true });
      setMessage(String(payload?.message || (action === 'accept' ? 'Запрос принят' : 'Запрос отклонен')));
      setMessageError(false);
    } catch (err) {
      setMessage(String(err?.message || 'Операция не выполнена'));
      setMessageError(true);
    } finally {
      setBusyById((prev) => ({ ...prev, [requestId]: false }));
    }
  }, [apiBase, headers, loadIncoming, openRoom]);

  return (
    <>
      {typeof trigger === 'function' ? (
        trigger({
          open: () => setIsOpen(true),
          disabled: !hasChatAccess,
          incomingCount,
          title: hasChatAccess ? 'Межкомпанейские чаты' : 'Доступ к чатам отключен',
        })
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          disabled={!hasChatAccess}
          title={hasChatAccess ? 'Межкомпанейские чаты' : 'Доступ к чатам отключен'}
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            border: '1px solid #d1d5db',
            background: hasChatAccess ? '#fff' : '#f5f5f5',
            cursor: hasChatAccess ? 'pointer' : 'not-allowed',
            fontSize: 22,
            fontWeight: 700,
            lineHeight: '20px',
            color: '#111827',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            flexShrink: 0,
            marginTop: 0,
          }}
        >
          +
          {incomingCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -7,
                right: -7,
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                background: '#ef4444',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                padding: '0 5px',
              }}
            >
              {incomingCount > 99 ? '99+' : incomingCount}
            </span>
          )}
        </button>
      )}

      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            zIndex: 3000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 700,
              maxHeight: '85vh',
              overflow: 'auto',
              background: '#fff',
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              boxShadow: '0 20px 45px rgba(0,0,0,0.25)',
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Межкомпанейский чат</div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{ border: 'none', background: 'transparent', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>

            <form onSubmit={onSubmitCreate} style={{ marginTop: 14, display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Отправить запрос</div>
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="Домен (например vl.ru)"
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #d1d5db' }}
                required
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Телефон сотрудника (79025067004)"
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #d1d5db' }}
                required
              />
              <div>
                <button
                  type="submit"
                  disabled={submitting || !hasChatAccess}
                  style={{
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 14px',
                    background: submitting || !hasChatAccess ? '#9ca3af' : '#2563eb',
                    color: '#fff',
                    cursor: submitting || !hasChatAccess ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {submitting ? 'Отправка...' : 'Отправить запрос'}
                </button>
              </div>
              {message ? (
                <div
                  style={{
                    color: messageError ? '#b91c1c' : '#166534',
                    background: messageError ? '#fee2e2' : '#dcfce7',
                    border: `1px solid ${messageError ? '#fca5a5' : '#86efac'}`,
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {message}
                </div>
              ) : null}
            </form>

            <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  Входящие запросы {incomingCount > 0 ? `(${incomingCount})` : ''}
                </div>
                <button
                  type="button"
                  onClick={loadIncoming}
                  disabled={loadingIncoming}
                  style={{
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    background: '#fff',
                    padding: '6px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#111827',
                    cursor: loadingIncoming ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loadingIncoming ? 'Обновление...' : 'Обновить'}
                </button>
              </div>
              <div style={{ fontSize: 12, color: '#4b5563' }}>
                Текущий пользователь: {String(user?.name || '—')} {user?.phone ? `• ${String(user.phone)}` : ''}
              </div>
              {incomingError ? (
                <div
                  style={{
                    color: '#b91c1c',
                    background: '#fee2e2',
                    border: '1px solid #fca5a5',
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {incomingError}
                </div>
              ) : null}

              {loadingIncoming && incoming.length === 0 ? (
                <div style={{ color: '#6b7280' }}>Загрузка...</div>
              ) : incoming.length === 0 ? (
                <div style={{ color: '#6b7280' }}>Нет входящих запросов</div>
              ) : (
                incoming.map((row) => {
                  const rowId = Number(row?.id);
                  const busy = Boolean(busyById[rowId]);
                  return (
                    <div
                      key={String(row?.id)}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: 10,
                        padding: 10,
                        display: 'grid',
                        gap: 8,
                      }}
                    >
                      <div style={{ fontWeight: 600, color: '#111827' }}>
                        {String(row?.requesterName || 'Сотрудник')}
                      </div>
                      <div style={{ fontSize: 13, color: '#4b5563' }}>
                        {String(row?.requesterDomain || '')} {row?.requesterPhone ? `• ${row.requesterPhone}` : ''}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => actOnRequest(rowId, 'accept')}
                          style={{
                            border: 'none',
                            borderRadius: 8,
                            padding: '8px 12px',
                            background: busy ? '#9ca3af' : '#16a34a',
                            color: '#fff',
                            cursor: busy ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          Создать
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => actOnRequest(rowId, 'reject')}
                          style={{
                            border: '1px solid #d1d5db',
                            borderRadius: 8,
                            padding: '8px 12px',
                            background: '#fff',
                            color: '#111827',
                            cursor: busy ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          Запретить
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Исходящие запросы (последние 5)</div>
              {loadingOutgoing && outgoing.length === 0 ? (
                <div style={{ color: '#6b7280' }}>Загрузка...</div>
              ) : outgoing.length === 0 ? (
                <div style={{ color: '#6b7280' }}>Нет исходящих запросов</div>
              ) : (
                outgoing.slice(0, 5).map((row) => (
                  <div
                    key={`out-${String(row?.id)}`}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 10,
                      padding: 10,
                      display: 'grid',
                      gap: 6,
                    }}
                  >
                    <div style={{ fontSize: 13, color: '#111827', fontWeight: 600 }}>
                      {String(row?.targetDomain || '—')} • {String(row?.targetPhone || '—')}
                    </div>
                    <div style={{ fontSize: 12, color: '#4b5563' }}>
                      Статус: {String(row?.status || '—')}
                    </div>
                  </div>
                ))
              )}
            </div>

          </div>
        </div>
      )}
    </>
  );
}

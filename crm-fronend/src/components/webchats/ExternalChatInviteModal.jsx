'use client';

import React, { useEffect, useMemo, useState } from 'react';

export default function ExternalChatInviteModal({
  visible,
  channel,
  apiBase,
  token,
  excludedUserIds = [],
  busy = false,
  onClose,
  onInvite,
}) {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const loadUsers = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await fetch(`${apiBase}/rooms/available-users`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: token ? 'omit' : 'include',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || 'Не удалось загрузить сотрудников');
        const list = Array.isArray(data) ? data : (Array.isArray(data?.users) ? data.users : []);
        if (!cancelled) setUsers(list);
      } catch (requestError) {
        if (!cancelled) setError(requestError.message || 'Не удалось загрузить сотрудников');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadUsers();
    return () => { cancelled = true; };
  }, [apiBase, token, visible]);

  const excluded = useMemo(() => new Set((excludedUserIds || []).map((id) => Number(id)).filter(Boolean)), [excludedUserIds]);
  const title = channel === 'telegram' ? 'Telegram' : 'MAX';
  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (users || [])
      .filter((user) => {
        const id = Number(user?.id || 0);
        if (!id || excluded.has(id)) return false;
        if (channel === 'telegram' && user?.canTelegram === false) return false;
        if (channel === 'max' && user?.canMax === false) return false;
        if (!needle) return true;
        const name = String(user?.name || user?.username || user?.email || '').toLowerCase();
        return name.includes(needle) || String(id).includes(needle);
      })
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'ru'));
  }, [channel, excluded, query, users]);

  if (!visible) return null;

  return (
    <div style={styles.backdrop} onMouseDown={onClose}>
      <div style={styles.modal} onMouseDown={(event) => event.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>Пригласить в {title}</div>
            <div style={styles.subtitle}>Выберите сотрудника, которому откроется доступ к этому чату</div>
          </div>
          <button type="button" onClick={onClose} style={styles.closeButton}>x</button>
        </div>

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск сотрудника"
          style={styles.search}
          autoFocus
        />

        {error && <div style={styles.error}>{error}</div>}
        {loading ? (
          <div style={styles.empty}>Загрузка...</div>
        ) : filteredUsers.length === 0 ? (
          <div style={styles.empty}>Подходящих сотрудников нет</div>
        ) : (
          <div style={styles.list}>
            {filteredUsers.map((user) => (
              <button
                key={user.id}
                type="button"
                disabled={busy}
                onClick={() => onInvite?.(user)}
                style={{ ...styles.row, opacity: busy ? 0.65 : 1 }}
              >
                <span style={styles.avatar}>{String(user?.name || '?').trim().slice(0, 1).toUpperCase()}</span>
                <span style={styles.userText}>
                  <span style={styles.userName}>{user?.name || `ID ${user.id}`}</span>
                  {user?.email ? <span style={styles.userEmail}>{user.email}</span> : null}
                </span>
                <span style={styles.inviteText}>Пригласить</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: 'rgba(17, 24, 39, 0.45)',
  },
  modal: {
    width: 'min(460px, 100%)',
    maxHeight: 'min(680px, calc(100vh - 48px))',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: 12,
    background: '#fff',
    boxShadow: '0 20px 50px rgba(0,0,0,0.22)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    padding: '18px 18px 12px',
    borderBottom: '1px solid #eef0f3',
  },
  title: { fontSize: 18, fontWeight: 700, color: '#111827' },
  subtitle: { marginTop: 4, fontSize: 13, color: '#6b7280' },
  closeButton: {
    width: 34,
    height: 34,
    border: 0,
    borderRadius: 8,
    background: '#f3f4f6',
    color: '#374151',
    fontSize: 24,
    lineHeight: '30px',
    cursor: 'pointer',
  },
  search: {
    margin: 14,
    marginBottom: 8,
    height: 38,
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '0 12px',
    fontSize: 14,
    outline: 'none',
  },
  error: { margin: '0 14px 8px', color: '#c62828', fontSize: 13 },
  empty: { padding: 24, color: '#6b7280', textAlign: 'center' },
  list: { overflow: 'auto', padding: '6px 8px 12px' },
  row: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    border: 0,
    borderRadius: 10,
    background: 'transparent',
    padding: '10px 8px',
    textAlign: 'left',
    cursor: 'pointer',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    background: '#e8f2ff',
    color: '#1d4ed8',
    fontWeight: 700,
  },
  userText: { minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' },
  userName: { fontSize: 14, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  userEmail: { fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  inviteText: { flexShrink: 0, color: '#16a34a', fontSize: 13, fontWeight: 700 },
};

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { FaTelegramPlane } from 'react-icons/fa';
import {
  IoAddOutline,
  IoBusinessOutline,
  IoChevronDownOutline,
  IoChevronForwardOutline,
  IoChatbubbleEllipsesOutline,
  IoCopyOutline,
  IoSendOutline,
  IoTrashOutline,
} from 'react-icons/io5';

const normalizeKind = (value) => String(value || '').trim().toLowerCase();

function ExternalKindIcon({ kind, size = 18, zoom = false }) {
  const normalized = normalizeKind(kind);
  if (normalized === 'telegram') return <FaTelegramPlane size={size} />;
  if (normalized === 'max') {
    const scale = zoom ? 2.2 : 1;
    return (
      <Image
        src="/images/max-logo.png"
        alt=""
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          maxWidth: 'none',
          objectFit: 'cover',
          display: 'block',
          transform: `scale(${scale})`,
        }}
      />
    );
  }
  if (normalized === 'cross') return <IoBusinessOutline size={size} />;
  return <IoChatbubbleEllipsesOutline size={size} />;
}

const isBridgeUser = (user) => /^xbridge:/i.test(String(user?.phone || '').trim());

export default function RoomParticipantsModal({
  visible,
  apiBase,
  token,
  roomId,
  ownerUserId,
  currentUsers = [],
  externalParticipants = [],
  busy = false,
  onClose,
  onSave,
  onExternalParticipantRemoved,
  onExternalParticipantsLoaded,
}) {
  const [users, setUsers] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inviteBusy, setInviteBusy] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [removingExternalId, setRemovingExternalId] = useState(null);
  const [externalOpen, setExternalOpen] = useState(false);
  const [crossInviteOpen, setCrossInviteOpen] = useState(false);
  const [crossDomain, setCrossDomain] = useState('');
  const [crossPhone, setCrossPhone] = useState('');
  const onExternalParticipantsLoadedRef = useRef(onExternalParticipantsLoaded);

  useEffect(() => {
    if (!visible) return;
    const ids = new Set((Array.isArray(currentUsers) ? currentUsers : []).map((u) => Number(u?.id)).filter(Boolean));
    if (Number(ownerUserId) > 0) ids.add(Number(ownerUserId));
    setSelectedIds(ids);
    setInviteLink('');
    setCopied(false);
    setExternalOpen(false);
    setCrossInviteOpen(false);
  }, [currentUsers, ownerUserId, visible]);

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
        if (!cancelled) setUsers(Array.isArray(data) ? data : []);
      } catch (requestError) {
        if (!cancelled) setError(requestError.message || 'Не удалось загрузить сотрудников');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadUsers();
    return () => { cancelled = true; };
  }, [apiBase, token, visible]);
  useEffect(() => {
    if (!visible || !roomId) return;
    let cancelled = false;
    const loadRoomExternalParticipants = async () => {
      try {
        const id = Number(roomId || 0);
        if (!id) return;
        const response = await fetch(`${apiBase}/admin/rooms/${encodeURIComponent(String(id))}`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: token ? 'omit' : 'include',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return;
        if (!cancelled && Array.isArray(data?.externalParticipants)) {
          onExternalParticipantsLoadedRef.current?.(data.externalParticipants);
        }
      } catch {}
    };
    loadRoomExternalParticipants();
    return () => { cancelled = true; };
  }, [apiBase, roomId, token, visible]);

  const activeExternalParticipants = useMemo(() => {
    const botParticipants = (Array.isArray(externalParticipants) ? externalParticipants : [])
      .filter((item) => Number(item?.id || 0) > 0 && String(item?.status || 'active') === 'active')
      .map((item) => ({ ...item, source: 'external' }));
    const crossParticipants = (Array.isArray(currentUsers) ? currentUsers : [])
      .map((user) => {
        const match = /^xbridge:([^:]+):(.+)$/i.exec(String(user?.phone || '').trim());
        if (!match || Number(user?.id || 0) <= 0) return null;
        const domain = String(match[1] || '').trim();
        const phone = String(match[2] || '').trim();
        return {
          id: Number(user.id),
          kind: 'cross',
          displayName: String(user?.name || '').trim() || `${phone} @${domain}`,
          externalUserId: phone,
          externalChatId: domain,
          status: 'active',
          source: 'cross-user',
        };
      })
      .filter(Boolean);
    return [...botParticipants, ...crossParticipants]
      .sort((a, b) => {
        const ak = normalizeKind(a?.kind);
        const bk = normalizeKind(b?.kind);
        if (ak !== bk) return ak.localeCompare(bk);
        return String(a?.displayName || '').localeCompare(String(b?.displayName || ''), 'ru');
      });
  }, [currentUsers, externalParticipants]);

  const mergedUsers = useMemo(() => {
    const map = new Map();
    for (const user of Array.isArray(currentUsers) ? currentUsers : []) {
      const id = Number(user?.id || 0);
      if (id) map.set(id, user);
    }
    for (const user of users) {
      const id = Number(user?.id || 0);
      if (id) map.set(id, user);
    }
    return Array.from(map.values()).sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'ru'));
  }, [currentUsers, users]);

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const localUsers = mergedUsers.filter((user) => !isBridgeUser(user));
    if (!needle) return localUsers;
    return localUsers.filter((user) => String(user?.name || user?.email || '').toLowerCase().includes(needle));
  }, [mergedUsers, query]);

  const toggleUser = (userId) => {
    const id = Number(userId || 0);
    if (!id || busy || id === Number(ownerUserId)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (Number(ownerUserId) > 0) next.add(Number(ownerUserId));
      return next;
    });
  };

  const createExternalInvite = useCallback(async (kind) => {
    const id = Number(roomId || 0);
    if (!id || inviteBusy) return;
    try {
      setInviteBusy(kind);
      setError('');
      setCopied(false);
      const response = await fetch(`${apiBase}/rooms/group/${encodeURIComponent(String(id))}/external-invite`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: token ? 'omit' : 'include',
        body: JSON.stringify({ kind }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || data?.message || 'Не удалось создать приглашение');
      const url = String(data?.url || '').trim();
      const command = String(data?.command || '').trim();
      const text = String(data?.text || url || command || '').trim();
      const link = kind === 'max' && command
        ? [
            url || text,
            '',
            'Если чат открылся без подключения к группе, отправьте боту команду:',
            command,
          ].filter(Boolean).join('\n')
        : (url || text);
      if (!link) throw new Error('Ссылка приглашения не получена');
      setInviteLink(link);
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      } catch {}
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось создать приглашение');
    } finally {
      setInviteBusy('');
    }
  }, [apiBase, inviteBusy, roomId, token]);

  const copyInvite = useCallback(async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('Не удалось скопировать ссылку');
    }
  }, [inviteLink]);

  const createCrossInvite = useCallback(async () => {
    const id = Number(roomId || 0);
    const domain = crossDomain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
    const phone = crossPhone.replace(/\D/g, '');
    if (!id || inviteBusy) return;
    if (!domain) {
      setError('Укажите домен компании');
      return;
    }
    if (phone.length < 10) {
      setError('Укажите телефон сотрудника');
      return;
    }
    try {
      setInviteBusy('cross');
      setError('');
      const response = await fetch(`${apiBase}/cross-chat/requests`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: token ? 'omit' : 'include',
        body: JSON.stringify({ domain, phone, roomId: id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || data?.message || 'Не удалось отправить приглашение');
      setCrossInviteOpen(false);
      setCrossDomain('');
      setCrossPhone('');
      setInviteLink('Приглашение в другую компанию отправлено');
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось отправить приглашение');
    } finally {
      setInviteBusy('');
    }
  }, [apiBase, crossDomain, crossPhone, inviteBusy, roomId, token]);

  const removeCrossParticipant = useCallback((participant) => {
    const participantId = Number(participant?.id || 0);
    if (!participantId || busy) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(participantId);
      if (Number(ownerUserId) > 0) next.add(Number(ownerUserId));
      return next;
    });
    setError('Участник будет удален после сохранения');
  }, [busy, ownerUserId]);

  const removeExternalParticipant = useCallback(async (participant) => {
    const participantId = Number(participant?.id || 0);
    const id = Number(roomId || 0);
    if (!id || !participantId || busy || removingExternalId) return;
    try {
      setRemovingExternalId(participantId);
      setError('');
      const response = await fetch(`${apiBase}/rooms/group/${encodeURIComponent(String(id))}/external-participants/${encodeURIComponent(String(participantId))}`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: token ? 'omit' : 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || data?.message || 'Не удалось удалить внешнего участника');
      onExternalParticipantRemoved?.(participantId, Array.isArray(data?.externalParticipants) ? data.externalParticipants : undefined);
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось удалить внешнего участника');
    } finally {
      setRemovingExternalId(null);
    }
  }, [apiBase, busy, onExternalParticipantRemoved, removingExternalId, roomId, token]);

  if (!visible) return null;

  return (
    <div style={styles.backdrop} onMouseDown={onClose}>
      <div style={styles.modal} onMouseDown={(event) => event.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>Участники группы</div>
            <div style={styles.subtitle}>Сотрудники, Telegram/MAX участники и приглашения</div>
          </div>
          <button type="button" onClick={onClose} style={styles.closeButton} disabled={busy}>x</button>
        </div>

        <div style={styles.externalBlock}>
          <button
            type="button"
            onClick={() => setExternalOpen((value) => !value)}
            style={styles.externalToggle}
            aria-expanded={externalOpen}
          >
            <span style={styles.externalToggleIcon}>
              {externalOpen ? <IoChevronDownOutline size={18} /> : <IoChevronForwardOutline size={18} />}
            </span>
            <div>
              <div style={styles.sectionTitle}>Внешние участники</div>
              <div style={styles.sectionHint}>
                {activeExternalParticipants.length > 0
                  ? `${activeExternalParticipants.length} подключено`
                  : 'Клиенты, подключенные по ссылке приглашения'}
              </div>
            </div>
          </button>

          {externalOpen && activeExternalParticipants.length > 0 ? (
            <div style={styles.externalList}>
              {activeExternalParticipants.map((item) => {
                const participantId = Number(item?.id || 0);
                const kind = normalizeKind(item?.kind);
                const isCross = kind === 'cross';
                const name = String(item?.displayName || '').trim() || (isCross ? 'Сотрудник другой компании' : kind === 'max' ? 'MAX пользователь' : 'Telegram пользователь');
                const identity = String(item?.externalUserId || item?.externalChatId || '').trim();
                const removing = removingExternalId === participantId;
                return (
                  <div key={participantId} style={styles.externalRow}>
                    <span style={{ ...styles.externalIcon, ...(kind === 'telegram' ? styles.telegramIcon : kind === 'max' ? styles.maxIcon : styles.crossIcon) }}>
                      <ExternalKindIcon kind={kind} zoom={kind === 'max'} />
                    </span>
                    <span style={styles.userText}>
                      <span style={styles.userName}>{name}</span>
                      {identity ? <span style={styles.userEmail}>{identity}</span> : null}
                    </span>
                    <button
                      type="button"
                      disabled={busy || Boolean(removingExternalId)}
                      onClick={() => isCross ? removeCrossParticipant(item) : removeExternalParticipant(item)}
                      style={styles.removeExternalButton}
                      title="Удалить внешнего участника"
                    >
                      {removing && !isCross ? '...' : <IoTrashOutline size={18} />}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : externalOpen ? (
            <div style={styles.externalEmpty}>Пока нет внешних участников</div>
          ) : null}
        </div>

        <div style={styles.searchRow}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск сотрудника"
            style={styles.search}
            disabled={busy}
            autoFocus
          />
          <div style={styles.inviteButtons}>
            <button
              type="button"
              disabled={Boolean(inviteBusy)}
              onClick={() => createExternalInvite('telegram')}
              style={styles.telegramInviteButton}
              title="Создать приглашение Telegram"
              aria-label="Создать приглашение Telegram"
            >
              <IoAddOutline size={17} />
              <FaTelegramPlane size={16} />
            </button>
            <button
              type="button"
              disabled={Boolean(inviteBusy)}
              onClick={() => createExternalInvite('max')}
              style={styles.maxInviteButton}
              title="Создать приглашение MAX"
              aria-label="Создать приглашение MAX"
            >
              <IoAddOutline size={17} />
              <ExternalKindIcon kind="max" size={24} />
            </button>
            <button
              type="button"
              disabled={Boolean(inviteBusy)}
              onClick={() => setCrossInviteOpen((value) => !value)}
              style={styles.crossInviteButton}
              title="Пригласить сотрудника из другой компании"
              aria-label="Пригласить сотрудника из другой компании"
            >
              <IoAddOutline size={17} />
              <IoBusinessOutline size={17} />
            </button>
          </div>
        </div>

        {crossInviteOpen ? (
          <div style={styles.crossInviteForm}>
            <input
              value={crossDomain}
              onChange={(event) => setCrossDomain(event.target.value)}
              placeholder="domain.ru"
              style={{ ...styles.crossInviteInput, flex: 1.15 }}
              disabled={busy || inviteBusy === 'cross'}
            />
            <input
              value={crossPhone}
              onChange={(event) => setCrossPhone(event.target.value)}
              placeholder="Телефон"
              style={styles.crossInviteInput}
              disabled={busy || inviteBusy === 'cross'}
            />
            <button
              type="button"
              onClick={createCrossInvite}
              disabled={busy || Boolean(inviteBusy)}
              style={styles.crossInviteSubmit}
              title="Отправить приглашение"
            >
              {inviteBusy === 'cross' ? '...' : <IoSendOutline size={17} />}
            </button>
          </div>
        ) : null}

        {inviteLink ? (
          <div style={styles.inviteLinkRow}>
            <div style={styles.inviteLinkText}>{inviteLink}</div>
            <button type="button" onClick={copyInvite} style={styles.copyButton}>
              <IoCopyOutline size={17} />
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
        ) : null}

        {error && <div style={styles.error}>{error}</div>}
        {loading ? (
          <div style={styles.empty}>Загрузка...</div>
        ) : filteredUsers.length === 0 ? (
          <div style={styles.empty}>Сотрудники не найдены</div>
        ) : (
          <div style={styles.list}>
            {filteredUsers.map((user) => {
              const id = Number(user?.id || 0);
              const checked = selectedIds.has(id);
              const isOwner = id === Number(ownerUserId);
              return (
                <button
                  key={id}
                  type="button"
                  disabled={busy || isOwner}
                  onClick={() => toggleUser(id)}
                  style={{ ...styles.row, opacity: busy || isOwner ? 0.65 : 1 }}
                >
                  <span style={{ ...styles.checkbox, ...(checked ? styles.checkboxChecked : {}) }}>{checked ? '✓' : ''}</span>
                  <span style={styles.avatar}>{String(user?.name || '?').trim().slice(0, 1).toUpperCase()}</span>
                  <span style={styles.userText}>
                    <span style={styles.userName}>{user?.name || `ID ${id}`}</span>
                    {user?.email ? <span style={styles.userEmail}>{user.email}</span> : null}
                  </span>
                  {isOwner ? <span style={styles.ownerText}>владелец</span> : null}
                </button>
              );
            })}
          </div>
        )}

        <div style={styles.footer}>
          <button type="button" onClick={onClose} disabled={busy} style={styles.secondaryButton}>Отмена</button>
          <button type="button" onClick={() => onSave(Array.from(selectedIds))} disabled={busy || loading} style={styles.primaryButton}>
            {busy ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(17,24,39,0.45)' },
  modal: { width: 'min(540px, 100%)', maxHeight: 'min(760px, calc(100vh - 48px))', display: 'flex', flexDirection: 'column', borderRadius: 12, background: '#fff', boxShadow: '0 20px 50px rgba(0,0,0,0.22)', overflow: 'hidden' },
  header: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '18px 18px 12px', borderBottom: '1px solid #eef0f3' },
  title: { fontSize: 18, fontWeight: 700, color: '#111827' },
  subtitle: { marginTop: 4, fontSize: 13, color: '#6b7280' },
  closeButton: { width: 34, height: 34, border: 0, borderRadius: 8, background: '#f3f4f6', color: '#374151', fontSize: 24, lineHeight: '30px', cursor: 'pointer' },
  externalBlock: { margin: 14, marginBottom: 8, border: '1px solid #e5e7eb', borderRadius: 10, background: '#f8fafc', padding: 8 },
  externalToggle: { width: '100%', border: 0, background: 'transparent', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', cursor: 'pointer', padding: '4px 2px', margin: 0 },
  externalToggleIcon: { width: 22, height: 22, color: '#64748b', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { fontSize: 14, fontWeight: 800, color: '#111827' },
  sectionHint: { marginTop: 2, fontSize: 12, color: '#64748b' },
  inviteButtons: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  telegramInviteButton: { width: 38, height: 38, border: 0, borderRadius: 9, background: '#2AABEE', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 1, fontWeight: 800, cursor: 'pointer', margin: 0, padding: 0 },
  maxInviteButton: { width: 38, height: 38, border: 0, borderRadius: 9, background: '#2563eb', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 1, fontWeight: 800, cursor: 'pointer', margin: 0, padding: 0 },
  crossInviteButton: { width: 38, height: 38, border: 0, borderRadius: 9, background: '#0f766e', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 1, fontWeight: 800, cursor: 'pointer', margin: 0, padding: 0 },
  searchRow: { display: 'flex', alignItems: 'center', gap: 8, margin: 14, marginBottom: 8 },
  crossInviteForm: { display: 'flex', alignItems: 'center', gap: 8, margin: '0 14px 10px', padding: 8, borderRadius: 10, border: '1px solid #99f6e4', background: '#f0fdfa' },
  crossInviteInput: { minWidth: 0, flex: 1, height: 36, border: '1px solid #99f6e4', borderRadius: 8, padding: '0 10px', fontSize: 13, outline: 'none', background: '#fff', color: '#0f172a' },
  crossInviteSubmit: { width: 36, height: 36, border: 0, borderRadius: 8, background: '#0f766e', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', margin: 0, padding: 0 },
  inviteLinkRow: { display: 'flex', alignItems: 'center', gap: 8, margin: '0 14px 10px' },
  inviteLinkText: { minWidth: 0, flex: 1, border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', padding: '8px 10px', fontSize: 12, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  copyButton: { height: 34, border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', color: '#334155', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 10px', fontWeight: 700, cursor: 'pointer', margin: 0 },
  externalList: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, maxHeight: 190, overflowY: 'auto', paddingRight: 2 },
  externalRow: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, borderRadius: 8, background: '#fff', padding: '7px 8px' },
  externalIcon: { width: 32, height: 32, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', overflow: 'hidden' },
  telegramIcon: { background: '#2AABEE' },
  maxIcon: { background: 'transparent', overflow: 'hidden' },
  crossIcon: { background: '#0f766e' },
  removeExternalButton: { width: 32, height: 32, border: 0, borderRadius: 8, background: '#fee2e2', color: '#dc2626', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', margin: 0, padding: 0 },
  externalEmpty: { marginTop: 8, padding: '8px 4px 2px', color: '#64748b', fontSize: 13 },
  search: { minWidth: 0, flex: 1, height: 38, border: '1px solid #d1d5db', borderRadius: 8, padding: '0 12px', fontSize: 14, outline: 'none' },
  error: { margin: '0 14px 8px', color: '#c62828', fontSize: 13 },
  empty: { padding: 24, color: '#6b7280', textAlign: 'center' },
  list: { overflow: 'auto', padding: '6px 8px 12px' },
  row: { width: '100%', display: 'flex', alignItems: 'center', gap: 10, border: 0, borderRadius: 10, background: 'transparent', padding: '10px 8px', textAlign: 'left', cursor: 'pointer' },
  checkbox: { width: 24, height: 24, borderRadius: 6, border: '1px solid #cbd5e1', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, flexShrink: 0 },
  checkboxChecked: { background: '#16a34a', borderColor: '#16a34a' },
  avatar: { width: 34, height: 34, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: '#e8f2ff', color: '#1d4ed8', fontWeight: 700 },
  userText: { minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' },
  userName: { fontSize: 14, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  userEmail: { fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  ownerText: { flexShrink: 0, color: '#64748b', fontSize: 12, fontWeight: 700 },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 14, borderTop: '1px solid #eef0f3' },
  secondaryButton: { height: 36, padding: '0 14px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', color: '#374151', fontWeight: 700, cursor: 'pointer' },
  primaryButton: { height: 36, padding: '0 14px', border: 0, borderRadius: 8, background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer' },
};

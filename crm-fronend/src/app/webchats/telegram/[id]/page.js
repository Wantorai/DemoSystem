'use client';

import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ChatLayout from '@/components/webchats/ChatLayout';
import MaxChatMessages from '@/components/webchats/MaxChatMessages';
import ExternalChatInviteModal from '@/components/webchats/ExternalChatInviteModal';
import { SocketProvider } from '@/components/webchats/SocketProvider';
import { AuthContext } from '@/context/AuthContext';
import { IoArchiveOutline, IoCreateOutline, IoLogOutOutline, IoPersonAddOutline, IoTrashOutline } from 'react-icons/io5';

export default function TelegramChatPage() {
  const { id } = useParams();
  const router = useRouter();
  const { token, user } = useContext(AuthContext);
  const apiBase = process.env.NEXT_PUBLIC_API_URL;
  const [chat, setChat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [error, setError] = useState('');
  const hasAccess = user?.canTelegram !== false;

  const loadChat = useCallback(async () => {
    if (!id || !token || !hasAccess) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await fetch(`${apiBase}/telegram/chats/${id}`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Не удалось загрузить чат');
      setChat(data);
      setError('');
      await fetch(`${apiBase}/telegram/chats/${id}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (requestError) {
      setError(requestError.message || 'Не удалось загрузить чат');
    } finally {
      setLoading(false);
    }
  }, [apiBase, hasAccess, id, token]);

  useEffect(() => {
    loadChat();
  }, [loadChat]);

  useEffect(() => {
    if (chat?.username) {
      document.title = `Telegram: ${chat.username}`;
    }
  }, [chat?.username]);

  const membershipAction = useCallback(async (action) => {
    try {
      setBusy(true);
      const response = await fetch(`${apiBase}/telegram/chats/${id}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Операция не выполнена');
      await loadChat();
    } catch (requestError) {
      setError(requestError.message || 'Операция не выполнена');
    } finally {
      setBusy(false);
    }
  }, [apiBase, id, loadChat, token]);

  const inviteUser = useCallback(async (employee) => {
    const userId = Number(employee?.id || 0);
    if (!userId) return;
    try {
      setBusy(true);
      const response = await fetch(`${apiBase}/telegram/chats/${id}/invite-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Не удалось пригласить сотрудника');
      setInviteModalVisible(false);
      setError('');
      await loadChat();
    } catch (requestError) {
      setError(requestError.message || 'Не удалось пригласить сотрудника');
    } finally {
      setBusy(false);
    }
  }, [apiBase, id, loadChat, token]);

  const renameChat = useCallback(async () => {
    const username = window.prompt('Новое название чата', chat?.username || '');
    if (!username?.trim()) return;
    const response = await fetch(`${apiBase}/telegram/chats/${id}/rename`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ username: username.trim() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.error || 'Не удалось переименовать чат');
      return;
    }
    await loadChat();
  }, [apiBase, chat?.username, id, loadChat, token]);

  const toggleArchive = useCallback(async () => {
    const response = await fetch(`${apiBase}/telegram/chats/${id}/archive`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ archived: !chat?.archived }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.error || 'Не удалось изменить архив');
      return;
    }
    await loadChat();
  }, [apiBase, chat?.archived, id, loadChat, token]);

  const deleteChat = useCallback(async () => {
    if (!window.confirm('Удалить Telegram-чат и всю его историю?')) return;
    const response = await fetch(`${apiBase}/telegram/chats/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.error || 'Не удалось удалить чат');
      return;
    }
    router.replace('/webchats');
  }, [apiBase, id, router, token]);

  const content = (() => {
    if (!hasAccess) {
      return <div style={centerStyle}>Доступ к Telegram чатам отключен.</div>;
    }
    if (loading) {
      return <div style={centerStyle}>Загрузка Telegram-чата...</div>;
    }
    if (error && !chat) {
      return <div style={{ ...centerStyle, color: '#c62828' }}>{error}</div>;
    }

    const owner = Boolean(chat?.isOwner);
    const participant = Boolean(chat?.isParticipant);
    const isPersonal = Boolean(chat?.isPersonal || chat?.botType === 'personal');
    const participantIds = Array.isArray(chat?.participantIds) ? chat.participantIds : [];
    const excludedInviteUserIds = [user?.id, chat?.assigneeId, ...participantIds].map(Number).filter(Boolean);
    const ownerLabel = isPersonal
      ? 'Личный чат'
      : owner
      ? 'Вы владелец'
      : participant
        ? 'Вы участник'
        : chat?.assigneeId
          ? `Владелец: ${chat.assigneeName || chat.assigneeId}`
          : 'Чат свободен';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <div style={chatHeaderStyle}>
          <div style={chatTitleBlockStyle}>
            <div style={chatTitleStyle}>
              {chat?.username || `Telegram ${chat?.telegramChatId || id}`}
            </div>
            <div style={chatSubtitleStyle}>{ownerLabel}</div>
          </div>
          {!isPersonal && !owner && !participant && (
            <button
              type="button"
              disabled={busy}
              onClick={() => membershipAction('assign')}
              style={{ ...headerTextButtonStyle, ...primaryTextButtonStyle, opacity: busy ? 0.65 : 1 }}
            >
              {chat?.assigneeId ? 'Присоединиться' : 'Взять чат'}
            </button>
          )}
          {!isPersonal && participant && (
            <button
              type="button"
              disabled={busy}
              onClick={() => membershipAction('unassign')}
              style={{ ...headerTextButtonStyle, ...dangerTextButtonStyle, opacity: busy ? 0.65 : 1 }}
            >
              Выйти
            </button>
          )}
          {owner && (
            <div style={headerActionsStyle}>
              {!isPersonal && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setInviteModalVisible(true)}
                  style={{ ...headerIconButtonStyle, ...successIconButtonStyle, opacity: busy ? 0.65 : 1 }}
                  title="Пригласить сотрудника"
                  aria-label="Пригласить сотрудника"
                >
                  <IoPersonAddOutline size={19} />
                </button>
              )}
              {!isPersonal && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => membershipAction('unassign')}
                  style={{ ...headerIconButtonStyle, ...dangerIconButtonStyle, opacity: busy ? 0.65 : 1 }}
                  title="Освободить чат"
                  aria-label="Освободить чат"
                >
                  <IoLogOutOutline size={19} />
                </button>
              )}
              <button type="button" onClick={renameChat} style={headerIconButtonStyle} title="Переименовать" aria-label="Переименовать">
                <IoCreateOutline size={18} />
              </button>
              <button type="button" onClick={toggleArchive} style={headerIconButtonStyle} title={chat?.archived ? 'Вернуть из архива' : 'В архив'} aria-label={chat?.archived ? 'Вернуть из архива' : 'В архив'}>
                <IoArchiveOutline size={18} />
              </button>
              <button type="button" onClick={deleteChat} style={{ ...headerIconButtonStyle, ...dangerIconButtonStyle }} title="Удалить" aria-label="Удалить">
                <IoTrashOutline size={18} />
              </button>
            </div>
          )}
        </div>
        {error && <div style={{ padding: '6px 12px', color: '#c62828', fontSize: 13 }}>{error}</div>}
        <ExternalChatInviteModal
          visible={inviteModalVisible}
          channel="telegram"
          apiBase={apiBase}
          token={token}
          excludedUserIds={excludedInviteUserIds}
          busy={busy}
          onClose={() => setInviteModalVisible(false)}
          onInvite={inviteUser}
        />
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <MaxChatMessages internalId={id} chatInfo={chat} provider="telegram" />
        </div>
      </div>
    );
  })();

  return (
    <SocketProvider>
      <ChatLayout telegramId={id}>{content}</ChatLayout>
    </SocketProvider>
  );
}

const centerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  padding: 20,
  color: '#666',
};

const chatHeaderStyle = {
  padding: '10px 14px',
  borderBottom: '1px solid #e5e7eb',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  background: '#fafafa',
  minHeight: 58,
};

const chatTitleBlockStyle = {
  minWidth: 0,
  flex: '1 1 auto',
};

const chatTitleStyle = {
  fontSize: 15,
  lineHeight: '20px',
  fontWeight: 700,
  color: '#111827',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const chatSubtitleStyle = {
  marginTop: 2,
  color: '#6b7280',
  fontSize: 12,
  lineHeight: '16px',
};

const headerActionsStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 8,
  flex: '0 0 auto',
};

const headerIconButtonStyle = {
  width: 34,
  height: 34,
  minWidth: 34,
  border: '1px solid #d1d5db',
  borderRadius: 8,
  background: '#fff',
  color: '#374151',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: 0,
  padding: 0,
  cursor: 'pointer',
  lineHeight: 1,
};

const successIconButtonStyle = {
  borderColor: '#86efac',
  background: '#dcfce7',
  color: '#15803d',
};

const dangerIconButtonStyle = {
  borderColor: '#fecaca',
  background: '#fff1f2',
  color: '#c62828',
};

const headerTextButtonStyle = {
  height: 34,
  borderRadius: 8,
  padding: '0 12px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  margin: 0,
};

const primaryTextButtonStyle = {
  border: '1px solid #229ED9',
  background: '#229ED9',
  color: '#fff',
};

const dangerTextButtonStyle = {
  border: '1px solid #fecaca',
  background: '#fff1f2',
  color: '#c62828',
};

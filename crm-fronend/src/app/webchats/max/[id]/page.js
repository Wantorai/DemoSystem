// crm-frontend/src/app/webchats/max/[id]/page.js
'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ChatLayout from '@/components/webchats/ChatLayout';
import MaxChatMessages from '@/components/webchats/MaxChatMessages';
import ExternalChatInviteModal from '@/components/webchats/ExternalChatInviteModal';
import { SocketProvider } from '@/components/webchats/SocketProvider';
import { AuthContext } from '@/context/AuthContext';
import { IoArchiveOutline, IoCreateOutline, IoLogOutOutline, IoPersonAddOutline, IoTrashOutline } from 'react-icons/io5';


export default function MaxChatPage() {
  const params = useParams();
  const router = useRouter();
  const { id: internalId } = params;
  const { token, user } = React.useContext(AuthContext);
  const hasMaxAccess = user?.canMax !== false;
  
  const [chatInfo, setChatInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const apiBase = process.env.NEXT_PUBLIC_API_URL

  // Загружаем информацию о Max чате
  useEffect(() => {
    if (!hasMaxAccess) {
      setLoading(false);
      return;
    }
    if (!internalId) return;

    const loadChatInfo = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(`${apiBase}/max/chats/${internalId}`, {
          method: 'GET',
          headers: token
            ? { Accept: 'application/json', Authorization: `Bearer ${token}` }
            : { Accept: 'application/json' },
          credentials: token ? 'omit' : 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          setChatInfo(data);
        } else if (response.status === 404) {
          setError('Чат не найден');
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      } catch (err) {
        console.error('Ошибка загрузки информации о чате Max:', err);
        setError('Не удалось загрузить информацию о чате');
      } finally {
        setLoading(false);
      }
    };

    loadChatInfo();
  }, [internalId, apiBase, token, hasMaxAccess]);

  const myIdNum = Number(user?.id || 0);
  const assigneeIdNum = Number(chatInfo?.assigneeId || 0);
  const isOwner = Boolean(chatInfo?.isOwner ?? (myIdNum > 0 && assigneeIdNum > 0 && myIdNum === assigneeIdNum));
  const isParticipant = Boolean(chatInfo?.isParticipant);
  const isAssignedToOther = assigneeIdNum > 0 && !isOwner;
  const isPersonal = Boolean(chatInfo?.isPersonal || chatInfo?.botType === 'personal' || chatInfo?.type === 'personal');
  const participantIds = Array.isArray(chatInfo?.participantIds) ? chatInfo.participantIds : [];
  const excludedInviteUserIds = [user?.id, chatInfo?.assigneeId, ...participantIds].map(Number).filter(Boolean);
  const ownerLabel = isPersonal
    ? 'Личный чат'
    : isOwner
      ? 'Вы владелец'
      : isParticipant
        ? 'Вы участник'
        : isAssignedToOther
          ? `Владелец: ${chatInfo?.assigneeName || `ID ${chatInfo?.assigneeId}`}`
          : 'Чат свободен';

  const refreshChatInfo = React.useCallback(async () => {
    const response = await fetch(`${apiBase}/max/chats/${internalId}`, {
      method: 'GET',
      headers: token
        ? { Accept: 'application/json', Authorization: `Bearer ${token}` }
        : { Accept: 'application/json' },
      credentials: token ? 'omit' : 'include',
    });
    if (!response.ok) return;
    const data = await response.json();
    setChatInfo(data);
  }, [apiBase, internalId, token]);

  const handleJoin = React.useCallback(async () => {
    if (!token || !internalId) return;
    try {
      setMembershipBusy(true);
      const response = await fetch(`${apiBase}/max/chats/${internalId}/assign`, {
        method: 'POST',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        credentials: 'omit',
      });
      if (!response.ok) {
        let msg = 'Не удалось присоединиться к чату';
        try {
          const err = await response.json();
          if (err?.error) msg = err.error;
        } catch {}
        setError(msg);
        return;
      }
      setError(null);
      await refreshChatInfo();
    } catch (e) {
      console.error('join max chat failed', e);
      setError('Не удалось присоединиться к чату');
    } finally {
      setMembershipBusy(false);
    }
  }, [token, internalId, apiBase, refreshChatInfo]);

  const handleLeave = React.useCallback(async () => {
    if (!token || !internalId) return;
    try {
      setMembershipBusy(true);
      const response = await fetch(`${apiBase}/max/chats/${internalId}/unassign`, {
        method: 'POST',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        credentials: 'omit',
      });
      if (!response.ok) {
        let msg = 'Не удалось выйти из чата';
        try {
          const err = await response.json();
          if (err?.error) msg = err.error;
        } catch {}
        setError(msg);
        return;
      }
      setError(null);
      await refreshChatInfo();
    } catch (e) {
      console.error('leave max chat failed', e);
      setError('Не удалось выйти из чата');
    } finally {
      setMembershipBusy(false);
    }
  }, [token, internalId, apiBase, refreshChatInfo]);

  // Обновляем заголовок страницы
  const handleInviteUser = React.useCallback(async (employee) => {
    const userId = Number(employee?.id || 0);
    if (!token || !internalId || !userId) return;
    try {
      setMembershipBusy(true);
      const response = await fetch(`${apiBase}/max/chats/${internalId}/invite-user`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'omit',
        body: JSON.stringify({ userId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Не удалось пригласить сотрудника');
      setInviteModalVisible(false);
      setError(null);
      await refreshChatInfo();
    } catch (e) {
      console.error('invite max chat user failed', e);
      setError(e.message || 'Не удалось пригласить сотрудника');
    } finally {
      setMembershipBusy(false);
    }
  }, [token, internalId, apiBase, refreshChatInfo]);
  const renameChat = React.useCallback(async () => {
    const username = window.prompt('Новое название чата', chatInfo?.username || '');
    if (!username?.trim() || !token || !internalId) return;
    const response = await fetch(`${apiBase}/max/chats/${internalId}/rename`, {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      credentials: 'omit',
      body: JSON.stringify({ username: username.trim() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.error || 'Не удалось переименовать чат');
      return;
    }
    setError(null);
    await refreshChatInfo();
  }, [apiBase, chatInfo?.username, internalId, refreshChatInfo, token]);

  const toggleArchive = React.useCallback(async () => {
    if (!token || !internalId) return;
    const response = await fetch(`${apiBase}/max/chats/${internalId}/archive`, {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      credentials: 'omit',
      body: JSON.stringify({ archived: !chatInfo?.archived }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.error || 'Не удалось изменить архив');
      return;
    }
    setError(null);
    await refreshChatInfo();
  }, [apiBase, chatInfo?.archived, internalId, refreshChatInfo, token]);

  const deleteChat = React.useCallback(async () => {
    if (!token || !internalId) return;
    if (!window.confirm('Удалить MAX-чат и всю его историю?')) return;
    const response = await fetch(`${apiBase}/max/chats/${internalId}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      credentials: 'omit',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.error || 'Не удалось удалить чат');
      return;
    }
    router.replace('/webchats');
  }, [apiBase, internalId, router, token]);


  useEffect(() => {
    if (chatInfo?.username) {
      document.title = `Max: ${chatInfo.username} | Max Чат`;
    }
  }, [chatInfo]);

  //console.log('chatInfo = ', chatInfo)

  if (loading) {
    return (
      <SocketProvider>
        <ChatLayout maxId={internalId}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            backgroundColor: '#fafafa'
          }}>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              border: '3px solid #f3f3f3',
              borderTop: '3px solid #007AFF',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '16px'
            }} />
            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
            <div style={{ color: '#666', fontSize: '16px' }}>
              Загрузка чата Max...
            </div>
          </div>
        </ChatLayout>
      </SocketProvider>
    );
  }

  if (!hasMaxAccess) {
    return (
      <SocketProvider>
        <ChatLayout>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            backgroundColor: '#fafafa',
            padding: '20px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
            <h2 style={{ margin: '0 0 12px 0', color: '#333' }}>Доступ закрыт</h2>
            <p style={{ color: '#666', maxWidth: '420px' }}>
              У вашей учетной записи отключен доступ к MAX чатам.
            </p>
          </div>
        </ChatLayout>
      </SocketProvider>
    );
  }

  if (error) {
    return (
      <SocketProvider>
        <ChatLayout maxId={internalId}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            backgroundColor: '#fafafa',
            padding: '20px',
            textAlign: 'center'
          }}>
            <div style={{ 
              fontSize: '48px',
              marginBottom: '16px',
              color: '#ff3b30'
            }}>
              ⚠️
            </div>
            <h2 style={{ margin: '0 0 16px 0', color: '#333' }}>Ошибка</h2>
            <p style={{ color: '#666', marginBottom: '24px', maxWidth: '400px' }}>
              {error}
            </p>
          </div>
        </ChatLayout>
      </SocketProvider>
    );
  }

  return (
    <SocketProvider>
      <ChatLayout maxId={internalId}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          backgroundColor: 'white'
        }}>
          <div style={chatHeaderStyle}>
            <div style={chatTitleBlockStyle}>
              <div style={chatTitleStyle}>
                {chatInfo?.username || `MAX ${chatInfo?.maxChatId || internalId}`}
              </div>
              <div style={chatSubtitleStyle}>{ownerLabel}</div>
            </div>
            <div style={headerActionsStyle}>
              {isOwner && !isPersonal && (
                <button
                  type="button"
                  disabled={membershipBusy}
                  onClick={() => setInviteModalVisible(true)}
                  title="Пригласить сотрудника"
                  aria-label="Пригласить сотрудника"
                  style={{ ...headerIconButtonStyle, ...successIconButtonStyle, opacity: membershipBusy ? 0.65 : 1 }}
                >
                  <IoPersonAddOutline size={19} />
                </button>
              )}
              {!isOwner && !isParticipant && (
                <button
                  type="button"
                  disabled={membershipBusy}
                  onClick={handleJoin}
                  style={{ ...headerTextButtonStyle, ...primaryTextButtonStyle, opacity: membershipBusy ? 0.65 : 1 }}
                >
                  {membershipBusy ? '...' : 'Присоединиться'}
                </button>
              )}
              {isOwner && !isPersonal && (
                <button
                  type="button"
                  disabled={membershipBusy}
                  onClick={handleLeave}
                  style={{ ...headerIconButtonStyle, ...dangerIconButtonStyle, opacity: membershipBusy ? 0.65 : 1 }}
                  title="Освободить чат"
                  aria-label="Освободить чат"
                >
                  <IoLogOutOutline size={19} />
                </button>
              )}
              {isOwner && (
                <button type="button" onClick={renameChat} style={headerIconButtonStyle} title="Переименовать" aria-label="Переименовать">
                  <IoCreateOutline size={18} />
                </button>
              )}
              {isOwner && (
                <button type="button" onClick={toggleArchive} style={headerIconButtonStyle} title={chatInfo?.archived ? 'Вернуть из архива' : 'В архив'} aria-label={chatInfo?.archived ? 'Вернуть из архива' : 'В архив'}>
                  <IoArchiveOutline size={18} />
                </button>
              )}
              {isOwner && (
                <button type="button" onClick={deleteChat} style={{ ...headerIconButtonStyle, ...dangerIconButtonStyle }} title="Удалить" aria-label="Удалить">
                  <IoTrashOutline size={18} />
                </button>
              )}
              {!isOwner && isParticipant && (
                <button
                  type="button"
                  disabled={membershipBusy}
                  onClick={handleLeave}
                  style={{ ...headerTextButtonStyle, ...dangerTextButtonStyle, opacity: membershipBusy ? 0.65 : 1 }}
                >
                  {membershipBusy ? '...' : 'Выйти'}
                </button>
              )}
            </div>
          </div>
          <ExternalChatInviteModal
            visible={inviteModalVisible}
            channel="max"
            apiBase={apiBase}
            token={token}
            excludedUserIds={excludedInviteUserIds}
            busy={membershipBusy}
            onClose={() => setInviteModalVisible(false)}
            onInvite={handleInviteUser}
          />

          {/* Основной контент - сообщения */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <MaxChatMessages
              internalId={internalId}
              chatInfo={chatInfo}
            />
          </div>
        </div>
      </ChatLayout>
    </SocketProvider>
  );
}
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
  border: '1px solid #007AFF',
  background: '#007AFF',
  color: '#fff',
};

const dangerTextButtonStyle = {
  border: '1px solid #fecaca',
  background: '#fff1f2',
  color: '#c62828',
};

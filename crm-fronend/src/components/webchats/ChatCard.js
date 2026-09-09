// components/webchats/ChatCard.js
'use client';
import React, { useCallback, useContext, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  IoImageOutline, IoAttachOutline, IoVideocamOutline,
  IoDocumentOutline, IoMicOutline, IoMusicalNoteOutline, IoPeopleOutline,
  IoShieldCheckmarkOutline, IoAlertCircleOutline, IoCheckmark, IoCheckmarkDone, IoTimeOutline, IoPin
} from 'react-icons/io5';
import ChatAvatar from './ChatAvatar';
import { formatChatTimeOrDate } from './dateFormat';
import { AuthContext } from '../../context/AuthContext';

const AVATAR_DEBUG = false;
const avatarDebug = (event, payload) => {
  if (!AVATAR_DEBUG) return;
  try {
    console.log(`[AvatarDebug][web][ChatCard] ${event}`, payload);
  } catch {}
};

export default function ChatCard({ chat, lastMessage, isActive = false, onContextMenu = null, isPinned = false, isImportant = false, titleAction = null }) {
  const { user } = useContext(AuthContext);
  const router = useRouter();
  const bg = isActive ? '#007AFF' : 'white';
  const leftBorder = isActive ? '4px solid #060606ff' : '4px solid transparent';

  //console.log('chat = ', chat)

  let { kind, rawId, id, title, lastMessageTime, updatedAt, unread } = chat;

  if ((!kind || !rawId) && id) {
    const parts = String(id).split('-');
    if (parts.length >= 2) {
      kind = kind || parts[0];
      rawId = rawId ?? parts.slice(1).join('-');
    } else {
      kind = kind || 'room';
      rawId = rawId ?? String(id);
    }
  }

  kind = kind || 'room';
  rawId = rawId ?? '0';

  // Цвета зависят от состояния isActive
  const iconAccent = isActive ? '#ffffff' : '#007AFF';
  const titleColor = isActive ? '#ffffff' : '#000000';
  const timeColor = isActive ? '#ffffff' : '#888888';
  const lastMsgColor = isActive ? '#ffffff' : '#666666';

  const formatLastMessage = (msg) => {
    if (!msg) return null;

    const type = msg.type ?? "text";
    const isDeleted = type === 'deleted' || msg.isDeleted || msg.is_deleted || msg.deletedAt || msg.deleted_at;
    if (isDeleted) {
      return <span style={{ color: lastMsgColor, fontStyle: 'italic' }}>Сообщение удалено</span>;
    }
    const text =
      msg.content ?? msg.transcriptionText ?? msg.text ?? msg.body ?? "";
    const fileName = msg.fileName ?? "";

    switch (type) {
      case 'text': {
        const short = text.length > 30 ? text.slice(0, 30) + '…' : text;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', transform: 'translateY(1px)', color: lastMsgColor }}>
              {short}
            </span>
          </span>
        );
      }

      case "image":
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', gap: 6, color: lastMsgColor }}>
            <IoImageOutline size={16} color={iconAccent} style={{ display: 'block' }}/>
            <span style={{ display: 'inline-block', verticalAlign: 'middle' }}> Фото</span>
          </span>
        );

      case "file":
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', gap: 6, color: lastMsgColor }}>
            <IoAttachOutline size={16} color={iconAccent} style={{ display: 'block' }}/>
            <span style={{ display: 'inline-block', verticalAlign: 'middle' }}> {fileName || "Файл"}</span>
          </span>
        );

      case "video":
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', gap: 6, color: lastMsgColor }}>
            <IoVideocamOutline size={16} color={iconAccent} style={{ display: 'block' }}/>
            <span style={{ display: 'inline-block', verticalAlign: 'middle' }}> Видео</span>
          </span>
        );

      case "document":
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', gap: 6, color: lastMsgColor }}>
            <IoDocumentOutline size={16} color={iconAccent} style={{ display: 'block' }}/>
            <span style={{ display: 'inline-block', verticalAlign: 'middle' }}> Документ</span>
          </span>
        );

      case "audio":
        if (fileName?.toLowerCase().startsWith("record"))
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', gap: 6, color: lastMsgColor }}>
              <IoMicOutline size={16} color={iconAccent} style={{ display: 'block' }}/>
              <span style={{ display: 'inline-block', verticalAlign: 'middle' }}> Голосовое сообщение</span>
            </span>
          );
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', gap: 6, color: lastMsgColor }}>
            <IoMusicalNoteOutline size={16} color={iconAccent} style={{ display: 'block' }}/>
            <span style={{ display: 'inline-block', verticalAlign: 'middle' }}> Аудио</span>
          </span>
        );

      default:
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', gap: 6, color: lastMsgColor }}>
            <IoAttachOutline size={16} color={iconAccent} style={{ display: 'block' }}/>
            <span style={{ display: 'inline-block', verticalAlign: 'middle' }}> Вложение</span>
          </span>
        );
    }
  };

  const last = formatLastMessage(lastMessage);

  let author = '';

  if (chat.kind != 'max') {
    author = chat.lastMessageRaw?.User?.name || lastMessage?.User?.name;
  }

  // const author = lastMessage?.User?.name;

  //console.log('author = ', author)

  const timePart = formatTimeOrWeekday(lastMessageTime ?? updatedAt);
  const lastSenderId = lastMessage?.userId ?? lastMessage?.User?.id ?? null;
  const isLastMessageMine = lastSenderId != null && String(lastSenderId) === String(user?.id ?? '');
  const lastMessageStatus = String(chat?.lastMessageStatus || lastMessage?.readStatus || lastMessage?.deliveryStatus || '').toLowerCase();
  const renderLastMessageStatus = () => {
    if (!isLastMessageMine || !lastMessageStatus) return null;
    if (lastMessageStatus === 'sending' || lastMessageStatus === 'pending') {
      return <IoTimeOutline title="Отправляется" size={16} color={timeColor} />;
    }
    if (lastMessageStatus === 'read') {
      return <IoCheckmarkDone title="Прочитано" size={17} color={isActive ? '#fff' : '#2c44f9'} />;
    }
    if (lastMessageStatus === 'delivered') {
      return <IoCheckmarkDone title="Доставлено" size={17} color={timeColor} />;
    }
    return <IoCheckmark title="Отправлено" size={17} color={timeColor} />;
  };
  const isGroupRoom = kind === 'room' && String(chat?.roomType || '').toLowerCase() !== 'personal';
  const isBossChat = kind === 'boss';

  const routeId = String(rawId ?? id ?? '').replace(/^(?:room-|boss-)/, '');
  const avatarUrl = chat.partnerAvatar || chat.avatarUrl || chat.avatar || null;
  const avatarColor = chat.partnerAvatarColor || chat.avatarColor || null;
  const avatarColorSeed = chat.partnerId ?? chat.userId ?? rawId;
  avatarDebug('render', {
    kind,
    id,
    rawId,
    title,
    roomType: chat.roomType ?? null,
    partnerName: chat.partnerName ?? null,
    partnerAvatar: chat.partnerAvatar ?? null,
    avatarUrl,
  });
  const href = `/webchats/${encodeURIComponent(kind)}/${encodeURIComponent(routeId)}`;
  const longPressRef = useRef(null);
  const suppressNextClickRef = useRef(false);

  const cancelLongPress = useCallback(() => {
    if (!longPressRef.current) return;
    clearTimeout(longPressRef.current.timer);
    longPressRef.current = null;
  }, []);

  const handlePointerDown = useCallback((event) => {
    if (!onContextMenu || event.pointerType === 'mouse') return;
    cancelLongPress();
    const startX = event.clientX;
    const startY = event.clientY;
    const timer = window.setTimeout(() => {
      longPressRef.current = null;
      suppressNextClickRef.current = true;
      window.setTimeout(() => { suppressNextClickRef.current = false; }, 1000);
      onContextMenu({
        clientX: startX,
        clientY: startY,
        preventDefault() {},
        stopPropagation() {},
      });
    }, 500);
    longPressRef.current = { timer, startX, startY };
  }, [cancelLongPress, onContextMenu]);

  const handlePointerMove = useCallback((event) => {
    const pending = longPressRef.current;
    if (!pending) return;
    if (Math.abs(event.clientX - pending.startX) > 10 || Math.abs(event.clientY - pending.startY) > 10) {
      cancelLongPress();
    }
  }, [cancelLongPress]);

  const onActivate = useCallback(() => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    try {
      localStorage.setItem('orderSpace:lastChat', JSON.stringify({ kind, rawId: routeId }));
    } catch (e) {
      console.warn(e);
    }
    router.push(href);
  }, [kind, routeId, href, router]);

  return (
    <div
      className={`webchat-card ${isPinned ? 'webchat-card-pinned' : ''} ${isActive ? 'webchat-card-active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onContextMenu={onContextMenu || undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(); } }}
      aria-current={isActive ? 'true' : undefined}
      style={{
        padding: '15px 12px',
        borderBottom: '1px solid #f5f5f5',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: bg,
        borderLeft: leftBorder,
        transition: 'background .12s ease, border-left .12s ease'
      }}
      aria-label={`Открыть чат ${title}`}
    >
      <ChatAvatar
        title={title}
        avatarUrl={avatarUrl}
        avatarColor={avatarColor}
        colorSeed={avatarColorSeed}
        size={44}
        borderRadius={999}
      />

      <div className="webchat-card-content" style={{ flex: 1, minWidth: 0 }}>
        <div className="webchat-card-heading-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="webchat-card-title-area" style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', marginRight: 12 }}>
            {isGroupRoom && (
              <span style={{ position: 'relative', flexShrink: 0, width: 20, height: 16, marginRight: 6, display: 'inline-flex', alignItems: 'center' }}>
                <IoPeopleOutline size={18} color={iconAccent} />
                <span style={{ position: 'absolute', right: -1, top: -5, fontSize: 12, lineHeight: 1, fontWeight: 700, color: iconAccent }}>+</span>
              </span>
            )}
            <strong
              className="webchat-card-title"
              style={{
                fontSize: 14,
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                color: titleColor
              }}
            >
              {title}
            </strong>
            {titleAction ? (
              <span style={{ flexShrink: 0, marginLeft: 6, marginTop: 0, display: 'inline-flex', alignItems: 'center', fontSize: 12, color: isActive ? '#ffffff' : '#7c3aed' }}>
                {titleAction}
              </span>
            ) : null}
          </div>
          <div className="webchat-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8, flexShrink: 0 }}>
            <div className="webchat-card-indicators" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {renderLastMessageStatus()}
              {isPinned && (
                <IoPin
                  title="Закрепленный чат"
                  aria-label="Закрепленный чат"
                  size={16}
                  color={isActive ? '#ffffff' : '#dc2626'}
                  style={{ flexShrink: 0 }}
                />
              )}
              {isBossChat && (
                <IoShieldCheckmarkOutline
                  title="Админ чат"
                  size={15}
                  color={isActive ? '#fff' : '#7c3aed'}
                  style={{ flexShrink: 0 }}
                />
              )}
              {isImportant && (
                <IoAlertCircleOutline
                  title="Отмеченный чат"
                  size={16}
                  color={isActive ? '#fff' : '#f59e0b'}
                  style={{ flexShrink: 0 }}
                />
              )}
            </div>
            <div className="webchat-card-time" style={{ fontSize: 12, color: timeColor }}>{timePart}</div>
          </div>
        </div>

        <div className="webchat-card-preview" style={{
          color: lastMsgColor,
          marginTop: 6,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div className="webchat-card-preview-text" style={{ fontSize: 13, color: lastMsgColor }}>
            {last && (
              <>
              {author ? (
                <span style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 6, fontWeight: 600, color: lastMsgColor }}>
                  {author}:
                </span>
              ) : null}
              {last}
              </>
            )}
          </div>

          {unread > 0 && (
            <div className="webchat-card-unread" style={{
              marginLeft: 8,
              background: '#ff3b30',
              color: 'white',
              borderRadius: 12,
              padding: '2px 8px',
              fontSize: 12,
              flexShrink: 0
            }}>
              {unread}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



function formatTimeOrWeekday(isoOrNull) {
  return formatChatTimeOrDate(isoOrNull);
}





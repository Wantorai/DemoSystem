// components/webchats/PinnedBar.jsx
'use client';
import React, { useMemo } from 'react';
import {
  IoBookmarksOutline,
  IoImageOutline,
  IoAttachOutline,
  IoVideocamOutline,
  IoDocumentOutline,
  IoMicOutline,
  IoMusicalNoteOutline,
  IoPeopleOutline,
  IoClose,
} from 'react-icons/io5';
import { FaTelegramPlane } from 'react-icons/fa';
import Image from 'next/image';

/**
 * Props:
 *  - pinnedMap: object { messageId: pinnedEntry } (default {})
 *  - chatUsers: array (default [])
 *  - chatName: string
 *  - onJumpToMessage(messageId) - async or sync
 *  - onOpenPinnedModal()
 *  - userColor: color string for icons (optional)
 */
export default function PinnedBarOneLine({
  pinnedMap = {},
  messagesById = {},
  chatUsers = [],
  externalParticipants = [],
  chatName = '',
  onJumpToMessage = () => {},
  pinnedPanelOpen = false,           // <- булево
//   setPinnedPanelOpen,                 // <- функция для изменения
  openPinnedPanel,                    // <- опционально, если нужна логика highlight
  closePinnedPanel,                   // <- опционально
  userColor = '#6b7280',
    loadingPinnedId = null,   // NEW
  disabled = false,        // NEW (если хотите блокировать клик)
  displayedPinnedId = null, // NEW - id записи pinned (not messageId)
}) {

  const isEncryptedMessageValue = (value) =>
    typeof value === 'string' && value.startsWith('enc:v1:');

  const getReadableMessageText = (message) => {
    if (!message || typeof message !== 'object') return '';
    const candidates = [
      message.transcriptionText,
      message.text,
      message.body,
      message.content,
    ];
    for (const candidate of candidates) {
      if (candidate == null) continue;
      const text = String(candidate).trim();
      if (!text) continue;
      if (isEncryptedMessageValue(text)) continue;
      return text;
    }
    return '';
  };

    const pinnedList = useMemo(() => Object.values(pinnedMap || []), [pinnedMap]);
    const hasPinned = pinnedList.length > 0;

    // ordered by messageId DESC (largest messageId first)
    const ordered = useMemo(() => {
        return pinnedList.slice().sort((a, b) => {
        const am = Number(a.messageId ?? a.message?.id ?? NaN);
        const bm = Number(b.messageId ?? b.message?.id ?? NaN);
        if (Number.isNaN(am) || Number.isNaN(bm)) return 0;
        return bm - am;
        });
    }, [pinnedList]);

    // determine which pinned entry to actually display: if displayedPinnedId provided use it,
    // else default to ordered[0] (max messageId)
    const last = useMemo(() => {
        if (!ordered.length) return null;
        if (displayedPinnedId) {
        const found = ordered.find(p => String(p.id) === String(displayedPinnedId));
        if (found) return found;
        // fallback to first if id not found
        }
        return ordered[0];
    }, [ordered, displayedPinnedId]);



  const renderPreview = (m) => {
    if (!m) return null;
    const resolvedMessage = (m?.id != null && messagesById[String(m.id)])
      ? { ...m, ...messagesById[String(m.id)] }
      : m;
    const type = resolvedMessage.type ?? 'text';
    const text = getReadableMessageText(resolvedMessage);
    const common = 'inline-flex items-center gap-1 text-sm text-gray-600';
    switch (type) {
      case 'text':
        return <span className="text-sm text-gray-700 block truncate">{text}</span>;
      case 'image':
        return <span className={common}><IoImageOutline size={16} color={userColor} />Фото</span>;
      case 'file':
        return <span className={common}><IoAttachOutline size={16} color={userColor} />{m.fileName || 'Файл'}</span>;
      case 'video':
        return <span className={common}><IoVideocamOutline size={16} color={userColor} />Видео</span>;
      case 'document':
        return <span className={common}><IoDocumentOutline size={16} color={userColor} />Документ</span>;
      case 'audio':
        if ((m.fileName ?? '').toLowerCase().startsWith('record')) {
          return <span className={common}><IoMicOutline size={16} color={userColor} />Голосовое сообщение</span>;
        }
        return <span className={common}><IoMusicalNoteOutline size={16} color={userColor} />Аудио</span>;
      default:
        return <span className={common}><IoAttachOutline size={16} color={userColor} />Вложение</span>;
    }
  };

  const activeExternalParticipants = (Array.isArray(externalParticipants) ? externalParticipants : [])
    .filter((item) => Number(item?.id || 0) > 0 && String(item?.status || 'active') === 'active');
  const participantItems = [
    ...(Array.isArray(chatUsers) ? chatUsers : []).map((user) => ({
      key: `user-${user?.id}`,
      type: 'user',
      name: user?.name ?? `#${user?.id}`,
    })),
    ...activeExternalParticipants.map((item) => ({
      key: `external-${item?.id}`,
      type: String(item?.kind || '').trim().toLowerCase() || 'external',
      name: String(item?.displayName || '').trim() || (String(item?.kind || '').toLowerCase() === 'max' ? 'MAX пользователь' : 'Telegram пользователь'),
    })),
  ];
  const staffText = participantItems.length ? participantItems.map((item) => item.name).join(', ') : 'не указаны';

  const renderParticipantInline = () => {
    if (!participantItems.length) return <span>не указаны</span>;
    return participantItems.map((item, index) => (
      <React.Fragment key={item.key || `${item.type}-${index}`}>
        {index > 0 ? <span>, </span> : null}
        {item.type === 'telegram' ? (
          <span className="inline-flex items-center gap-1 align-middle">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#2AABEE] text-white"><FaTelegramPlane size={11} /></span>
            <span>{item.name}</span>
          </span>
        ) : item.type === 'max' ? (
          <span className="inline-flex items-center gap-1 align-middle">
            <span className="inline-flex h-4 w-4 items-center justify-center overflow-hidden rounded-full">
              <Image src="/images/max-logo.png" alt="" width={24} height={24} style={{ width: 24, height: 24, maxWidth: 'none', objectFit: 'cover', display: 'block' }} />
            </span>
            <span>{item.name}</span>
          </span>
        ) : (
          <span>{item.name}</span>
        )}
      </React.Fragment>
    ));
  };

  // shared classes for halves
  const halfBase = 'flex items-center gap-3 p-2 rounded bg-white border border-gray-100 shadow-sm min-w-0';

  const isLoadingThis = last?.message?.id && String(loadingPinnedId) === String(last.message.id);

    //     useEffect(() => {
    //   console.log('pinnedList raw', pinnedList.map(p => ({ id: p.id, messageId: p.message?.id, orderIndex: p.orderIndex, pinnedAt: p.pinnedAt })));
    // }, [pinnedList]);

  

  return (
    <div className="w-full">
      {/* grid 2 columns -> ровно пополам */}
      <div className="grid grid-cols-2 gap-3 items-center">
        {/* LEFT half — staff */}
        <div
          className={`${halfBase} col-span-1`}
          aria-label="Список сотрудников"
          role="group"
        >
          <div className="flex items-center">
            <IoPeopleOutline size={18} color={userColor} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">{chatName || 'Чат'}</div>
            <div className="text-sm text-gray-500 mt-0.5 truncate" title={staffText}>В чате: {renderParticipantInline()}</div>
          </div>
        </div>
        

        {/* RIGHT half — pinned */}
        <div className={`${halfBase} col-span-1 flex justify-between items-center`}>
            {hasPinned ? (
                <div
                    className="flex items-center gap-3 w-full"
                    // onClick={async () => { if (!disabled && last?.message?.id) onJumpToMessage(last.message.id); }}
                    onClick={() => {
                        const msgIdToJump = last?.messageId ?? last?.message?.id;
                        if (msgIdToJump) onJumpToMessage(msgIdToJump);
                        }}
                    role="button"
                    tabIndex={0}
                    aria-label={last ? `Закреплённое сообщение ${last.id}` : 'Нет закреплённых'}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !disabled) onJumpToMessage(last.message.id); }}
                    style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                >
                    <div className="flex items-center">
                    <IoBookmarksOutline size={18} color={userColor} />
                    </div>

                    <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-900 truncate">Закреплённое сообщение №{last.id}</div>
                    <div className="text-sm text-gray-500 mt-0.5 truncate">{renderPreview(last.message)}</div>
                    </div>

                    <div className="flex items-center gap-2">
                    {isLoadingThis ? (
                        <div className="text-sm text-blue-600 px-2">Переход…</div>
                    ) : (

                        <button
                        className="ml-2 p-1 rounded flex items-center gap-1
                            bg-white hover:bg-yellow-100 focus:bg-yellow-100 active:bg-yellow-100
                            outline-none border-none"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (pinnedPanelOpen) {
                            closePinnedPanel();
                            } else {
                            openPinnedPanel();
                            }
                        }}
                        aria-label={pinnedPanelOpen ? "Закрыть панель закрепов" : "Открыть панель закрепов"}
                        >
                        {pinnedPanelOpen ? (
                            <IoClose size={16} color="#6b7280" />
                        ) : (
                            <>
                            <span className="text-sm text-gray-500">{pinnedList.length}</span>
                            <IoBookmarksOutline size={16} color="#6b7280" />
                            </>
                        )}
                        </button>

                    )}
                    </div>
                </div>
                ) : (
                <div className="w-full flex items-center gap-3 opacity-60">
                <div className="flex items-center">
                    <IoBookmarksOutline size={18} color={userColor} />
                </div>
                <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">Нет закреплённых</div>
                    <div className="text-sm text-gray-500 mt-0.5">—</div>
                </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}

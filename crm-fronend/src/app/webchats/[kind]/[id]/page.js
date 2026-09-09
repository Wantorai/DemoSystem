// crm-fronend\src\app\webchats\[kind]\[id]\page.js
'use client';
import React, { useEffect, useLayoutEffect, useRef, useState, useContext, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SocketProvider, useWebSocket } from '@/components/webchats/SocketProvider';
import { AuthContext } from '../../../../context/AuthContext';
import ChatList from '@/components/webchats/ChatList';
import RoomParticipantsModal from '@/components/webchats/RoomParticipantsModal';
import ChatFooter from '@/components/webchats/ChatFooter';
import ChatAvatar from '@/components/webchats/ChatAvatar';
import {
  IoDocumentTextOutline, IoDocumentAttachSharp, IoArrowDownCircleOutline, IoImageOutline, IoAttachOutline, IoVideocamOutline,
  IoDocumentOutline, IoMicOutline, IoMusicalNoteOutline, IoTimeOutline, IoCheckmark, IoCheckmarkDone,
  IoFolderOpenOutline, IoListOutline, IoChevronBack, IoChevronDown, IoChevronUp, IoTrendingDown, IoTrendingUp,
  IoChatbubbleEllipsesOutline, IoPeopleOutline, IoPaperPlaneOutline, IoBusinessOutline, IoPinOutline,
  IoSearchOutline, IoCloseOutline, IoPeopleCircleOutline
} from 'react-icons/io5';
import Spinner from '../../../../components/Spinner';
import { toast } from 'react-toastify';
import Image from 'next/image';
import MessageContextMenu from '@/components/webchats/MessageContextMenu'; 
import ForwardToRoomModal from '@/components/webchats/ForwardToRoomModal';
import { usePinnedApi } from '@/components/webchats/pinnedApi';
import PinnedBar from '@/components/webchats/PinnedBar';
import DropZone from '@/components/webchats/DropZone';
import { showNotification } from '@/components/webchats/notifications';
import CrossChatEntry from '@/components/webchats/CrossChatEntry';
import AllPinsView from '@/components/webchats/AllPinsView';
import WebchatFontScaleControl from '@/components/webchats/WebchatFontScaleControl';
import { formatChatDateTime, formatChatTime, formatChatTimeOrDate } from '@/components/webchats/dateFormat';
import { FaTelegramPlane } from 'react-icons/fa';
// import ChatLayout from '@/components/webchats/ChatLayout';


/**
 * Установка файла: src/app/webchats/[kind]/[id]/page.js
 * (маршрут: /webchats/{kind}/{id})
 */
const REACTION_EMOJIS = ['👍', '❤️', '🔥', '⚡️', '😂', '😢', '😡', '🚀', '🤝', '💪', '💯', '✅', '🆗'];
const AUDIO_SPEED_OPTIONS = [1.0, 1.25, 1.5];
const OUTGOING_BUBBLE_COLOR_DEFAULT = '#FEF0D1';
const INITIAL_MESSAGES_LIMIT = 30;
const CHAT_MESSAGES_CACHE_VERSION = 1;
const CHAT_MESSAGES_CACHE_MAX_AGE_MS = 30 * 60 * 1000;
function chatMessagesCacheKey(userId, kind, id) {
  return `webchats:messages:v${CHAT_MESSAGES_CACHE_VERSION}:${String(userId)}:${String(kind)}:${String(id)}`;
}

function readChatMessagesCache(userId, kind, id) {
  if (typeof window === 'undefined' || !userId || !kind || !id) return null;
  try {
    const raw = sessionStorage.getItem(chatMessagesCacheKey(userId, kind, id));
    const cached = raw ? JSON.parse(raw) : null;
    if (!cached || !Array.isArray(cached.messages)) return null;
    if (!Number.isFinite(cached.savedAt) || Date.now() - cached.savedAt > CHAT_MESSAGES_CACHE_MAX_AGE_MS) {
      sessionStorage.removeItem(chatMessagesCacheKey(userId, kind, id));
      return null;
    }
    return cached.messages.slice(-INITIAL_MESSAGES_LIMIT);
  } catch {
    return null;
  }
}

function writeChatMessagesCache(userId, kind, id, messages) {
  if (typeof window === 'undefined' || !userId || !kind || !id || !Array.isArray(messages)) return;
  try {
    sessionStorage.setItem(chatMessagesCacheKey(userId, kind, id), JSON.stringify({
      savedAt: Date.now(),
      messages: messages.slice(-INITIAL_MESSAGES_LIMIT),
    }));
  } catch {
    // Cache is an optional acceleration; storage limits must not break the chat.
  }
}

function normalizeHexColor(value) {
  const raw = String(value ?? '').trim().replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw.toUpperCase()}` : null;
}

function renderTextWithLinks(value) {
  const source = String(value || '');
  if (!source) return null;
  const urlRegex = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
  const exactUrlRegex = /^(?:https?:\/\/|www\.)[^\s<]+$/i;
  const lines = source.split('\n');
  return lines.map((line, lineIndex) => {
    const chunks = line.split(urlRegex);
    return (
      <React.Fragment key={`line-${lineIndex}`}>
        {chunks.map((chunk, chunkIndex) => {
          if (!chunk) return null;
          if (exactUrlRegex.test(chunk)) {
            const href = chunk.startsWith('www.') ? `https://${chunk}` : chunk;
            return (
              <a
                key={`url-${lineIndex}-${chunkIndex}`}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="underline text-blue-700"
              >
                {chunk}
              </a>
            );
          }
          return <React.Fragment key={`txt-${lineIndex}-${chunkIndex}`}>{chunk}</React.Fragment>;
        })}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </React.Fragment>
    );
  });
}

function parseSiteCallbackMessage(value) {
  const lines = String(value || '').split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== 'Заказ обратного звонка с сайта') return null;

  const fields = {};
  for (const line of lines.slice(1)) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex < 1) continue;
    fields[line.slice(0, separatorIndex).trim()] = line.slice(separatorIndex + 1).trim();
  }
  return fields;
}

function SiteCallbackCard({ content }) {
  const fields = parseSiteCallbackMessage(content);
  if (!fields) return null;

  const phoneHref = fields['Телефон'] ? `tel:${fields['Телефон'].replace(/[^\d+]/g, '')}` : null;
  return (
    <div className="mt-1 overflow-hidden rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-orange-100 bg-orange-100/70 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500 text-lg text-white">☎</span>
        <div>
          <div className="font-semibold text-orange-950">Заказ звонка с сайта</div>
          <div className="text-xs text-orange-700">Новая заявка на обратный звонок</div>
        </div>
      </div>
      <div className="grid gap-3 px-4 py-3 text-sm">
        {fields['Имя'] && <div><div className="text-xs text-gray-500">Имя</div><div className="font-medium text-gray-900">{fields['Имя']}</div></div>}
        {fields['Телефон'] && <div><div className="text-xs text-gray-500">Телефон</div><a className="font-semibold text-blue-700 hover:underline" href={phoneHref}>{fields['Телефон']}</a></div>}
        {fields['Комментарий'] && <div><div className="text-xs text-gray-500">Комментарий</div><div className="whitespace-pre-wrap text-gray-800">{fields['Комментарий']}</div></div>}
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-gray-100 pt-3 text-xs">
          {fields['Источник'] && <div><span className="text-gray-500">Источник: </span><span className="text-gray-700">{fields['Источник']}</span></div>}
          {fields['Страница'] && <a className="max-w-full truncate text-blue-700 hover:underline" href={fields['Страница']} target="_blank" rel="noreferrer">Открыть страницу ↗</a>}
        </div>
      </div>
    </div>
  );
}

function isEncryptedMessageValue(value) {
  return typeof value === 'string' && value.startsWith('enc:v1:');
}

function getReadableMessageText(message, fallback = '') {
  if (!message || typeof message !== 'object') return fallback;

  let encryptedCandidate = '';
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
    if (isEncryptedMessageValue(text)) {
      if (!encryptedCandidate) encryptedCandidate = text;
      continue;
    }
    return text;
  }

  if (encryptedCandidate) return encryptedCandidate;
  return fallback;
}

function wasMessageEdited(message) {
  if (!message?.createdAt || !message?.updatedAt) return false;
  const createdAt = new Date(message.createdAt).getTime();
  const updatedAt = new Date(message.updatedAt).getTime();
  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) return false;

  // Sequelize can assign slightly different timestamps during the initial insert.
  return updatedAt - createdAt > 2000;
}

function mergeMessageKeepingFileMeta(prevMessage, nextMessage) {
  if (!prevMessage) return nextMessage;
  const merged = { ...prevMessage, ...nextMessage };
  if ((merged.fileSize == null) && (prevMessage.fileSize != null)) {
    merged.fileSize = prevMessage.fileSize;
  }
  if ((merged.displayFileName == null) && (prevMessage.displayFileName != null)) {
    merged.displayFileName = prevMessage.displayFileName;
  }
  if ((merged.fileName == null) && (prevMessage.fileName != null)) {
    merged.fileName = prevMessage.fileName;
  }
  if ((merged.mimeType == null) && (prevMessage.mimeType != null)) {
    merged.mimeType = prevMessage.mimeType;
  }
  return merged;
}


export default function ChatPageWrapper() {
  const params = useParams();
  const router = useRouter();
  const kind = params?.kind;
  const id = Number(params?.id);
  const { user, initialized } = useContext(AuthContext);
  const ALERTS_BOSS_CHAT_ID = 5;

  useEffect(() => {
    if (String(kind) === 'boss' && Number(id) === ALERTS_BOSS_CHAT_ID) {
      router.replace('/webchats/alerts');
    }
  }, [kind, id, router]);

  // не давать рендериться, пока route некорректный
  if (!params?.id || Number.isNaN(id)) return null;
  if (!kind || !id) return <div style={{ padding: 20 }}>Неверный путь чата</div>;
  if (String(kind) === 'boss' && Number(id) === ALERTS_BOSS_CHAT_ID) return null;

  // если пользователь явно не авторизован — редиректим (или показываем спиннер если ещё инициализируется)
  if (initialized && !user) {
    // можно навигировать, либо вернуть null/спиннер
    // router.replace('/login'); // можно, но осторожно — может конфликтовать с другими эффектами
    return null;
  }

  return (
    <SocketProvider>
      <ChatPage kind={kind} id={id} />
    </SocketProvider>
  );
};






function ChatPage({ kind, id, API_BASE = process.env.NEXT_PUBLIC_API_URL || '' }) {
  const { socket } = useWebSocket();
  const { user, token, isLoading: authLoading } = useContext(AuthContext);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialScrollReady, setInitialScrollReady] = useState(false);
  const initialScrollReadyRef = useRef(false);
  const stabilizedChatRef = useRef('');
  const historySyncedChatRef = useRef('');
  const loadedMessagesChatRef = useRef('');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const textRef = useRef('');
  useEffect(() => { textRef.current = text; }, [text]);
  const bottomRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [chatName, setChatName] = useState('');
  const [chatUsers, setChatUsers] = useState([]); 
  const [roomChatType, setRoomChatType] = useState(null);
  const [roomPartnerName, setRoomPartnerName] = useState('');
  const [roomCreatorUserId, setRoomCreatorUserId] = useState(null);
  const [roomParticipantsModalOpen, setRoomParticipantsModalOpen] = useState(false);
  const [roomParticipantsSaving, setRoomParticipantsSaving] = useState(false);
  const [roomExternalParticipants, setRoomExternalParticipants] = useState([]);
  const [forwardSelectionMode, setForwardSelectionMode] = useState(false);
  const [forwardSelectedIds, setForwardSelectedIds] = useState(() => new Set());
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [forwardBusy, setForwardBusy] = useState(false);
  const [bossFolderMode, setBossFolderMode] = useState(false);
  const [bossFolders, setBossFolders] = useState([]);
  const [activeBossFolder, setActiveBossFolder] = useState(null);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [performanceExpanded, setPerformanceExpanded] = useState(false);
  const [outgoingBubbleColor, setOutgoingBubbleColor] = useState(OUTGOING_BUBBLE_COLOR_DEFAULT);
  const PAGE_LIMIT = 90; // 
  const containerRef = useRef(null);      // Элемент с overflow:auto — прокрутчик (вставим в div ниже)
  const messagesContentRef = useRef(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const olderHistoryIntentAtRef = useRef(0);
  const [hasMore, setHasMore] = useState(true);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const BOTTOM_THRESHOLD = 60;
  const [searchQuery, setSearchQuery] = useState('');
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchEverywhere, setSearchEverywhere] = useState(true);
  const chatListActionsRef = useRef(null);
  const [chatListView, setChatListView] = useState(() => {
    if (typeof window === 'undefined') return 'list';
    try {
      return localStorage.getItem('webchats:listView') || 'list';
    } catch {
      return 'list';
    }
  });
  const [showAllPinsView, setShowAllPinsView] = useState(false);
  const mainRef = useRef(null); // контейнер правой части
  const layoutRef = useRef(null); // корневой контейнер чата
  const [replyDraft, setReplyDraft] = useState(null);
  const audioPlaybackRateStorageKey = `webchats:audioPlaybackRate:${String(kind)}:${String(id)}`;
  const [audioPlaybackRate, setAudioPlaybackRate] = useState(() => {
    if (typeof window === 'undefined') return 1.0;
    try {
      const saved = Number(
        localStorage.getItem(audioPlaybackRateStorageKey) ||
        localStorage.getItem('webchats:audioPlaybackRate') ||
        1
      );
      return AUDIO_SPEED_OPTIONS.includes(saved) ? saved : 1.0;
    } catch {
      return 1.0;
    }
  });
  const audioElementsRef = useRef(new Map());
  const router = useRouter();
  const fileSpaceSendRef = useRef(false);

  const isRoomGroupOwner = kind === 'room' && roomChatType === 'group' && Number(roomCreatorUserId || 0) === Number(user?.id || 0);
  const isPersonalRoom = kind === 'room' && roomChatType === 'personal';
  const personalPartnerName = useMemo(() => {
    if (!isPersonalRoom) return '';
    const currentUserId = String(user?.id ?? '');
    const partner = (Array.isArray(chatUsers) ? chatUsers : []).find((chatUser) => (
      String(chatUser?.id ?? '') !== currentUserId
    ));
    return String(roomPartnerName || partner?.name || '').trim();
  }, [chatUsers, isPersonalRoom, roomPartnerName, user?.id]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia('(max-width: 768px)').matches) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overflow = 'hidden';
    window.scrollTo(0, 0);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [kind, id]);

  useEffect(() => {
    const layout = layoutRef.current;
    if (!layout || typeof window === 'undefined') return undefined;

    const mobileQuery = window.matchMedia('(max-width: 768px)');
    let frameId = null;
    const updateVisibleHeight = () => {
      if (!mobileQuery.matches) {
        layout.style.removeProperty('--webchat-visible-height');
        return;
      }
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const viewport = window.visualViewport;
        const visibleBottom = viewport
          ? viewport.height + viewport.offsetTop
          : window.innerHeight;
        const globalHeaderHeight = document.querySelector('.header')?.getBoundingClientRect().height || 0;
        layout.style.setProperty('--webchat-visible-height', `${Math.round(visibleBottom)}px`);
        layout.style.setProperty('--webchat-global-header-height', `${Math.round(globalHeaderHeight)}px`);
      });
    };

    updateVisibleHeight();
    window.addEventListener('resize', updateVisibleHeight);
    window.visualViewport?.addEventListener('resize', updateVisibleHeight);
    window.visualViewport?.addEventListener('scroll', updateVisibleHeight);
    mobileQuery.addEventListener?.('change', updateVisibleHeight);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updateVisibleHeight);
      window.visualViewport?.removeEventListener('resize', updateVisibleHeight);
      window.visualViewport?.removeEventListener('scroll', updateVisibleHeight);
      mobileQuery.removeEventListener?.('change', updateVisibleHeight);
      layout.style.removeProperty('--webchat-visible-height');
      layout.style.removeProperty('--webchat-global-header-height');
    };
  }, []);

  const toggleChatListView = useCallback(() => {
    setChatListView((current) => {
      const next = current === 'folders' ? 'list' : 'folders';
      try {
        localStorage.setItem('webchats:listView', next);
      } catch {}
      return next;
    });
  }, []);


  // refs для стабильного доступа внутри колбеков / слушателей
  const apiBaseRef = useRef(API_BASE);
  useEffect(() => { apiBaseRef.current = API_BASE; }, [API_BASE]);

  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  // Не показываем список, пока его высота на старте ещё меняется из-за медиа,
  // шрифтов и дочерних компонентов. Всё это время удерживаем нижнюю позицию,
  // чтобы пользователь увидел уже полностью собранный чат без скачков.
  useLayoutEffect(() => {
    const chatKey = `${kind}:${id}`;
    if (loadedMessagesChatRef.current !== chatKey) {
      initialScrollReadyRef.current = false;
      setInitialScrollReady(false);
      return;
    }

    if (messages.length === 0 && loading) return;
    if (stabilizedChatRef.current === chatKey) return;

    const el = containerRef.current;
    const content = messagesContentRef.current;
    if (!el) return;

    initialScrollReadyRef.current = false;
    setInitialScrollReady(false);

    let quietTimer = null;
    let maxTimer = null;
    let firstFrame = null;
    let secondFrame = null;
    let disposed = false;

    const pinToBottom = () => {
      el.scrollTop = el.scrollHeight;
    };
    const reveal = () => {
      if (disposed) return;
      pinToBottom();
      stabilizedChatRef.current = chatKey;
      initialScrollReadyRef.current = true;
      setInitialScrollReady(true);
    };
    const waitForQuietLayout = () => {
      pinToBottom();
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(reveal, 80);
    };

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(waitForQuietLayout)
      : null;
    resizeObserver?.observe(el);
    if (content) resizeObserver?.observe(content);

    firstFrame = requestAnimationFrame(() => {
      pinToBottom();
      secondFrame = requestAnimationFrame(waitForQuietLayout);
    });
    maxTimer = setTimeout(reveal, 450);

    document.fonts?.ready.then(() => {
      if (!disposed) waitForQuietLayout();
    }).catch(() => {});

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      if (quietTimer) clearTimeout(quietTimer);
      if (maxTimer) clearTimeout(maxTimer);
      if (firstFrame) cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
    };
  }, [kind, id, loading, messages.length]);

  const hasMoreRef = useRef(hasMore);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);

  const loadingOlderRef = useRef(loadingOlder);
  useEffect(() => { loadingOlderRef.current = loadingOlder; }, [loadingOlder]);

  const bossFolderModeRef = useRef(bossFolderMode);
  useEffect(() => { bossFolderModeRef.current = bossFolderMode; }, [bossFolderMode]);

  const activeBossFolderRef = useRef(activeBossFolder);
  useEffect(() => { activeBossFolderRef.current = activeBossFolder; }, [activeBossFolder]);

  // prev last id to detect append vs prepend
  const prevLastIdRef = useRef(null);

  // seen set to avoid duplicates (socket + fetch + optimistic)
  const seenRef = useRef(new Set());

  const pendingTemp = useRef(new Map());
  const pendingUploadTempIdsRef = useRef(new Set());

  const [userMap, setUserMap] = useState({});
  const [roomDeliveredMessageIds, setRoomDeliveredMessageIds] = useState([]);
  const [roomOtherLastReadId, setRoomOtherLastReadId] = useState(0);
  const [roomMinOtherLastReadId, setRoomMinOtherLastReadId] = useState(0);
  const [roomReadByUser, setRoomReadByUser] = useState({});
  const [bossReadByUser, setBossReadByUser] = useState({});
  const [freshMessageIds, setFreshMessageIds] = useState({});

  const messagesById = useMemo(() => {
    const index = {};
    for (const m of Array.isArray(messages) ? messages : []) {
      if (!m?.id) continue;
      index[String(m.id)] = m;
    }
    return index;
  }, [messages]);

  const markFreshMessageIds = useCallback((ids = []) => {
    const normalized = (Array.isArray(ids) ? ids : [])
      .map((v) => String(v ?? '').trim())
      .filter(Boolean);
    if (!normalized.length) return;
    const now = Date.now();
    setFreshMessageIds((prev) => {
      const next = { ...prev };
      normalized.forEach((id) => { next[id] = now; });
      return next;
    });
  }, []);

  const clearFreshMessageId = useCallback((id) => {
    const key = String(id ?? '').trim();
    if (!key) return;
    setFreshMessageIds((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const clearFreshUpToReadId = useCallback((readId) => {
    const maxReadId = Number(readId) || 0;
    if (!maxReadId) return;
    const me = Number(user?.id) || 0;
    setFreshMessageIds((prev) => {
      const keys = Object.keys(prev || {});
      if (!keys.length) return prev;
      let changed = false;
      const next = { ...prev };
      for (const key of keys) {
        const idNum = Number(key) || 0;
        if (!idNum || idNum > maxReadId) continue;
        const msg = messagesById[key];
        const senderId = Number(msg?.userId ?? msg?.User?.id ?? 0) || 0;
        if (senderId && senderId === me) continue;
        if (next[key]) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [messagesById, user?.id]);

  useEffect(() => {
    const ttlMs = 8 * 60 * 1000;
    const timer = setInterval(() => {
      const now = Date.now();
      setFreshMessageIds((prev) => {
        let changed = false;
        const next = {};
        for (const [id, ts] of Object.entries(prev || {})) {
          if ((now - Number(ts || 0)) < ttlMs) next[id] = ts;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setRoomDeliveredMessageIds([]);
    setRoomOtherLastReadId(0);
    setRoomMinOtherLastReadId(0);
    setRoomReadByUser({});
    setBossReadByUser({});
    setRoomChatType(null);
    setRoomExternalParticipants([]);
  }, [kind, id]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/crm-config`)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return response.json();
      })
      .then((configs) => {
        if (cancelled) return;
        const row = Array.isArray(configs)
          ? configs.find((item) => item?.field === 'outgoingBubbleColor')
          : null;
        setOutgoingBubbleColor(normalizeHexColor(row?.value) || OUTGOING_BUBBLE_COLOR_DEFAULT);
      })
      .catch((err) => {
        console.warn('Failed to load outgoing bubble color', err);
        if (!cancelled) setOutgoingBubbleColor(OUTGOING_BUBBLE_COLOR_DEFAULT);
      });

    return () => {
      cancelled = true;
    };
  }, [API_BASE]);

  useEffect(() => {
    // Используем участников текущего чата. Полный /admin/users недоступен
    // обычным пользователям и раньше создавал 403 + ошибку users.forEach.
    const map = {};
    for (const chatUser of Array.isArray(chatUsers) ? chatUsers : []) {
      if (chatUser?.id == null) continue;
      const name = String(chatUser.name || '').trim();
      const initials = name
        ? name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase()
        : '?';
      map[chatUser.id] = { ...chatUser, initials };
    }
    setUserMap(map);
  }, [chatUsers]);

  useEffect(() => {
    try {
      const saved = Number(
        localStorage.getItem(audioPlaybackRateStorageKey) ||
        localStorage.getItem('webchats:audioPlaybackRate') ||
        1
      );
      setAudioPlaybackRate(AUDIO_SPEED_OPTIONS.includes(saved) ? saved : 1.0);
    } catch {}
  }, [audioPlaybackRateStorageKey]);

  const cycleAudioPlaybackRate = useCallback(() => {
    setAudioPlaybackRate((prev) => {
      const currentIndex = AUDIO_SPEED_OPTIONS.indexOf(prev);
      const nextIndex = (currentIndex + 1) % AUDIO_SPEED_OPTIONS.length;
      const nextRate = AUDIO_SPEED_OPTIONS[nextIndex];
      try {
        localStorage.setItem(audioPlaybackRateStorageKey, String(nextRate));
      } catch {}
      return nextRate;
    });
  }, [audioPlaybackRateStorageKey]);

  const registerAudioElement = useCallback((messageId, element) => {
    const key = String(messageId ?? '');
    if (!key) return;
    if (element) audioElementsRef.current.set(key, element);
    else audioElementsRef.current.delete(key);
  }, []);

  const handleAudioPlay = useCallback((messageId, element) => {
    const activeKey = String(messageId ?? '');
    audioElementsRef.current.forEach((audio, key) => {
      if (key !== activeKey && audio && !audio.paused) audio.pause();
    });
    if (element) element.playbackRate = audioPlaybackRate;
  }, [audioPlaybackRate]);

  const handleAudioEnded = useCallback((messageId) => {
    const currentIndex = messages.findIndex((item) => String(item?.id ?? '') === String(messageId ?? ''));
    if (currentIndex < 0) return;
    const nextMessage = messages[currentIndex + 1];
    const nextAudio = (
      String(nextMessage?.type || '').toLowerCase() === 'audio' &&
      Boolean(nextMessage?.mediaUrl)
    ) ? nextMessage : null;
    if (!nextAudio?.id) return;
    const nextElement = audioElementsRef.current.get(String(nextAudio.id));
    if (!nextElement) return;
    nextElement.currentTime = 0;
    nextElement.playbackRate = audioPlaybackRate;
    const playResult = nextElement.play();
    if (playResult?.catch) playResult.catch((error) => console.warn('Не удалось автоматически включить следующее голосовое сообщение', error));
  }, [audioPlaybackRate, messages]);



  // -------------------------------- PIN ---------------------------------------------- //

  // const { list: listPinned, pin: apiPin, unpin: apiUnpin, position: apiPosition} = usePinnedApi(API_BASE);
  const { list: listPinned, pin: apiPin, unpin: apiUnpin} = usePinnedApi(API_BASE);
  const [pinnedMap, setPinnedMap] = useState({}); // { [messageId]: pinnedEntry }
  const [jumpingPinnedId, setJumpingPinnedId] = useState(null);
  const [displayedPinnedId, setDisplayedPinnedId] = useState(null);
  const [pinnedPanelOpen, setPinnedPanelOpen] = useState(false);
  const [pinnedPanelHighlightId, setPinnedPanelHighlightId] = useState(null);
  const pinnedListContainerRef = useRef(null);
  const pinnedItemRefs = useRef({});
  

  // функция, вызываемая при клике "open pinned" (из header или иконки)
  const openPinnedPanel = useCallback((highlightMessageId = null) => {
    setPinnedPanelHighlightId(highlightMessageId);
    setPinnedPanelOpen(true);
  }, []);

  // функция закрытия
  const closePinnedPanel = useCallback(() => {
    setPinnedPanelOpen(false);
    setPinnedPanelHighlightId(null);
  }, []);


  // 1) Load pinned on mount / when kind/id changes
  useEffect(() => {
    let mounted = true;
    if (!kind || !id) return;
    if (!user || !token) return; // <- ключевой момент
    listPinned(kind, id)
      .then(res => {
        if (!mounted) return;
        const map = {};
        const pinnedItems = Array.isArray(res?.pinned)
          ? res.pinned
          : (Array.isArray(res) ? res : []);
        pinnedItems.forEach(p => {
          if (p.message && p.message.id) map[p.message.id] = p;
        });
        setPinnedMap(map);
      })
      .catch(e => {
        console.error('load pinned failed', e);
      });
    return () => { mounted = false; };
  }, [kind, id, listPinned, user, token]);

  // 2) Socket listeners for pinned/unpinned
  useEffect(() => {
    if (!socket || !kind || !id) return;
    const pinnedEvent = kind === 'room' ? 'room:message_pinned' : 'boss:message_pinned';
    const unpinnedEvent = kind === 'room' ? 'room:message_unpinned' : 'boss:message_unpinned';

    const onPinned = (payload) => {
      // payload: { roomId/pinned: ... } or { chatId, pinned }
      const pinned = payload.pinned ?? payload;
      const messageId = pinned?.message?.id;
      if (!messageId) return;
      setPinnedMap(prev => ({ ...prev, [messageId]: pinned }));
    };

    const onUnpinned = (payload) => {
      const messageId = payload.messageId ?? payload.pinned?.message?.id;
      const pinnedId = payload.pinnedId ?? payload.pinned?.id;
      setPinnedMap(prev => {
        const copy = { ...prev };
        if (messageId) delete copy[messageId];
        else if (pinnedId) {
          // fallback: remove by value match
          Object.keys(copy).forEach(k => { if (copy[k]?.id === pinnedId) delete copy[k]; });
        }
        return copy;
      });
    };

    socket.on(pinnedEvent, onPinned);
    socket.on(unpinnedEvent, onUnpinned);

    return () => {
      socket.off(pinnedEvent, onPinned);
      socket.off(unpinnedEvent, onUnpinned);
    };
  }, [socket, kind, id]);




  // toggle pin — вызывает API и даёт ожидаемое поведение
  const handleTogglePin = useCallback(async ({ message }) => {
    if (!message) return;
    const messageId = message.id;
    try {
      const existingPinned = pinnedMap[messageId];
      if (existingPinned) {
        // unpin by pinnedId (точнее и стабильнее), messageId оставляем как fallback
        await apiUnpin(kind, id, { pinnedId: existingPinned?.id, messageId });
        // socket скорее всего придёт и обновит map, но можно оптимистично удалить:
        setPinnedMap(prev => { const c = { ...prev }; delete c[messageId]; return c; });
        toast.info('Сообщение откреплено');
      } else {
        const res = await apiPin(kind, id, { messageId });
        // res.pinned — полная запись
        if (res?.pinned?.message?.id) {
          setPinnedMap(prev => ({ ...prev, [res.pinned.message.id]: res.pinned }));
        }
        toast.success('Сообщение закреплено');
      }
    } catch (err) {
      console.error('toggle pin error', err);
      const errMessage = String(err?.message || '');
      toast.error(errMessage ? `Ошибка при (от)закреплении: ${errMessage}` : 'Ошибка при (от)закреплении');
    }
  }, [apiPin, apiUnpin, kind, id, pinnedMap]);




  // ----------------------- ДЛЯ РЕСАЙЗА левого меню ---------------------------- //

  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startPercentRef = useRef(0);
  const asidePercentRef = useRef(null); // <-- синхронное текущее значение
  const LAYOUT_KEY = 'chat:asideWidthPercent';

  const DEFAULT_ASIDE_PX = 400; // дефолтная ширина в px 
  const MIN_PERCENT = 15; // минимальная ширина aside в процентах
  const MAX_PERCENT = 60; // максимальная ширина aside в процентах

  const [asideWidthPercent, setAsideWidthPercent] = useState(null);

  // при монтировании — читаем сохранённое значение или устанавливаем дефолт
  useEffect(() => {
    const saved = localStorage.getItem(LAYOUT_KEY);
    const containerWidth = layoutRef.current?.clientWidth || window.innerWidth;
    let initial;
    if (saved) {
      const val = parseFloat(saved);
      if (!Number.isNaN(val)) initial = val;
      else initial = Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, (DEFAULT_ASIDE_PX / containerWidth) * 100));
    } else {
      initial = Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, (DEFAULT_ASIDE_PX /containerWidth) * 100));
    }
    setAsideWidthPercent(initial);
    asidePercentRef.current = initial; // <-- важно!

    // сохраняем при начале навигации (Next.js)
    const handleRouteStart = () => {
      try { saveAsidePercent(asidePercentRef.current); } catch(e){console.warn(e)}
    };

    // depending on next version: if using 'next/router' you use router.events.on(...)
    // For app router with useRouter() from 'next/navigation' there is no events; 
    // in that case skip this or use beforeunload fallback. I'll add both safe handlers:
    window.addEventListener('beforeunload', handleRouteStart);
    // If you use next/router (pages router) uncomment:
    // router.events?.on('routeChangeStart', handleRouteStart);

    return () => {
      // save on unmount
      try { saveAsidePercent(asidePercentRef.current); } catch(e) { console.warn(e) }
      window.removeEventListener('beforeunload', handleRouteStart);
      // if using router.events:
      // router.events?.off('routeChangeStart', handleRouteStart);
    };
  }, []);

  // вспомогательная функция - сохраняет в локалсторадж
  const saveAsidePercent = (p) => {
    try {
      if (p == null) return;
      localStorage.setItem(LAYOUT_KEY, String(p));
    } catch (e) { console.warn(e) }
  };

  // handler для начала перетаскивания (на resizer)
  const onResizerPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const container = layoutRef.current;
    if (!container) return;
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startPercentRef.current = asideWidthPercent ?? ((DEFAULT_ASIDE_PX / container.clientWidth) * 100);
    // навесим глобальные слушатели
    window.addEventListener('pointermove', onResizerPointerMove);
    window.addEventListener('pointerup', onResizerPointerUp);
    document.body.style.userSelect = 'none';
  };

  const onResizerPointerMove = (e) => {
    if (!isDraggingRef.current) return;
    const container = layoutRef.current;
    if (!container) return;
    const dx = e.clientX - startXRef.current;
    const containerWidth = container.clientWidth || window.innerWidth;
    const deltaPercent = (dx / containerWidth) * 100;
    let next = startPercentRef.current + deltaPercent;
    // clamp
    next = Math.max(MIN_PERCENT, Math.min(MAX_PERCENT, next));

    // обновляем состояние и синхронный ref
    asidePercentRef.current = next;
    setAsideWidthPercent(next);
  };

  const onResizerPointerUp = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    window.removeEventListener('pointermove', onResizerPointerMove);
    window.removeEventListener('pointerup', onResizerPointerUp);
    document.body.style.userSelect = '';
    // save from ref (синхронно)
    saveAsidePercent(asidePercentRef.current);
  };


  // keyboard access on resizer: arrows change width, dblclick reset
  const onResizerKeyDown = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      setAsideWidthPercent(p => {
        const cur = p ?? asidePercentRef.current ?? 30;
        const next = Math.max(MIN_PERCENT, cur - 2);
        asidePercentRef.current = next; // update ref
        saveAsidePercent(next);
        return next;
      });
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      setAsideWidthPercent(p => {
        const cur = p ?? asidePercentRef.current ?? 30;
        const next = Math.min(MAX_PERCENT, cur + 2);
        asidePercentRef.current = next;
        saveAsidePercent(next);
        return next;
      });
    } else if (e.key === 'Home') {
      e.preventDefault();
      const next = MIN_PERCENT; asidePercentRef.current = next; saveAsidePercent(next); setAsideWidthPercent(next);
    } else if (e.key === 'End') {
      e.preventDefault();
      const next = MAX_PERCENT; asidePercentRef.current = next; saveAsidePercent(next); setAsideWidthPercent(next);
    }
  };

  const onResizerDoubleClick = () => {
    const containerWidth = layoutRef.current?.clientWidth || window.innerWidth;
    const defaultPercent = Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, (DEFAULT_ASIDE_PX / containerWidth) * 100));
    asidePercentRef.current = defaultPercent;
    setAsideWidthPercent(defaultPercent);
    saveAsidePercent(defaultPercent);
  };


  // ---------------------------------------------------------------------------------------------- //








  // ------------------ helper TYPE FILE ---------------------------------- //
  // 👇 Универсальный определитель типа файла
  function detectFileType(file) {
    var mime = (file.type || '').toLowerCase();
    var name = (file.name || '').toLowerCase();

    // --- Проверка по MIME ---
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';

    // --- Проверка по расширению ---
    if (name.match(/\.(jpg|jpeg|png|gif|bmp|webp|heic|heif)$/)) return 'image';
    if (name.match(/\.(mp4|mov|avi|mkv|webm|m4v)$/)) return 'video';
    if (name.match(/\.(mp3|wav|ogg|m4a|aac)$/)) return 'audio';
    if (name.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|rtf)$/)) return 'document';

    // --- По умолчанию ---
    return 'file';
  }


  // ------- helper: normalize ASC (oldest -> newest) -------
  const normalizeAsc = useCallback((arr) => {
    const copy = Array.isArray(arr) ? [...arr] : [];
    copy.sort((a, b) => {
      const ta = Date.parse(a.createdAt ?? a.updatedAt ?? 0) || 0;
      const tb = Date.parse(b.createdAt ?? b.updatedAt ?? 0) || 0;
      return ta - tb;
    });
    return copy;
  }, []);


  // ------- stable helpers (useCallback) -------
  const historyCandidates = useCallback((kindArg, idArg) => {
    const base = apiBaseRef.current || '';
    if (kindArg === 'room') {
      return [
        `${base}/admin/rooms/${idArg}/messages`,
        `${base}/web/rooms/${idArg}/messages`,
      ];
    }
    if (kindArg === 'boss') {
      return [
        `${base}/admin/boss/chats/${idArg}/messages`,
        `${base}/web/boss/chats/${idArg}/messages`,
      ];
    }
    return [
      `${base}/app/rooms/${idArg}/messages`,
      `${base}/app/boss/chats/${idArg}/messages`
    ];
  }, []);


  // ------------------ helper ------------------------------- //
  const tryEndpoints = useCallback(async (urls, options = {}) => {
    if (!Array.isArray(urls)) throw new Error('tryEndpoints: expected array of urls');
    let lastErr = null;
    for (const url of urls) {
      try {
        const res = await fetch(url, options);
        if (res.status === 401) throw new Error('401');
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(`${res.status} ${txt || res.statusText}`);
        }
        return res;
      } catch (err) {
        lastErr = err;
        console.warn('tryEndpoints: failed for', url, err);
      }
    }
    throw lastErr ?? new Error('No endpoints succeeded');
  }, []);


  // ------- belongsToKindAndId helper -------
  function belongsToKindAndId(msg, kindArg, idArg) {
    if (!msg) return false;
    const rId = String(idArg ?? '');
    const roomCandidate =
      msg.roomId ??
      msg.RoomId ??
      msg.room_id ??
      msg.room ??
      null;
    const chatCandidate =
      msg.chatId ??
      msg.ChatId ??
      msg.chat_id ??
      msg.chat ??
      null;
    if (kindArg === 'room') {
      return String(roomCandidate ?? '') === rId;
    } else if (kindArg === 'boss') {
      return String(chatCandidate ?? '') === rId;
    }
    return String(roomCandidate ?? chatCandidate ?? '') === rId;
  }


  // ---------------- helper Compose POST candidate endpoints for sending message------------- //
  function postMessageCandidates(kind, id) {
    if (kind === 'room') {
      return [
        `${API_BASE}/admin/rooms/${id}/messages`,
      ];
    }
    return [
      `${API_BASE}/admin/boss/chats/${id}/messages`,
    ];
  }


  // helper: build PATCH/PUT endpoint for an existing message
  function putMessageEndpoint(kind, id, messageId) {
    // console.log('putMessageEndpoint', { kind, id, messageId });
    if (kind === 'room') {
      return `${API_BASE}/admin/rooms/${id}/messages/${messageId}`;
    }
    return `${API_BASE}/admin/boss/chats/${id}/messages/${messageId}`;
  }



  // ------- initial load: load latest PAGE_LIMIT messages -------
  useEffect(() => {
    let mounted = true;
    // если auth ещё загружается — не делаем запрос
    if (authLoading) return;

    const chatKey = `${kind}:${id}`;
    historySyncedChatRef.current = '';
    setFreshMessageIds({});
    const cachedMessages = readChatMessagesCache(user?.id, kind, id);
    if (cachedMessages?.length) {
      const cachedPage = normalizeAsc(cachedMessages);
      loadedMessagesChatRef.current = chatKey;
      seenRef.current = new Set(cachedPage.map((message) => String(message?.id)).filter(Boolean));
      messagesRef.current = cachedPage;
      prevLastIdRef.current = cachedPage.length ? String(cachedPage[cachedPage.length - 1]?.id ?? '') : null;
      setMessages(cachedPage);
      setHasMore(true);
      setLoading(false);
    }

    (async () => {
      setLoading(!cachedMessages?.length);
      setError(null);
      try {
        const headers = { Accept: 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const opts = { method: 'GET', headers, credentials: token ? 'omit' : 'include' };

        const baseUrls = historyCandidates(kind, id);
        const urls = baseUrls.map(u => {
          const p = new URLSearchParams();
          p.set('limit', String(INITIAL_MESSAGES_LIMIT));
          return `${u}?${p.toString()}`;
        });

        const res = await tryEndpoints(urls, opts);
        const data = await res.json();
        const envelope = Array.isArray(data) ? null : (data && typeof data === 'object' ? data : null);

        // console.log('Initial messages load:', data);  

        // backend возвращает newest-first -> приводим к ASC
        const pageRaw = Array.isArray(data)
          ? data
          : (Array.isArray(envelope?.messages) ? envelope.messages : []);
        const page = normalizeAsc(pageRaw);

        // mark seen ids
        page.forEach(m => { if (m?.id) seenRef.current.add(String(m.id)); });

        if (!mounted) return;
        if (kind === 'room' && envelope) {
          const otherLastRead = Number(envelope.otherUserLastReadId) || 0;
          if (otherLastRead > 0) setRoomOtherLastReadId(otherLastRead);
          const minOtherLastRead = Number(envelope.minOtherUserLastReadId) || 0;
          if (minOtherLastRead > 0) setRoomMinOtherLastReadId(minOtherLastRead);
          const delivered = Array.isArray(envelope.deliveredMessageIds)
            ? envelope.deliveredMessageIds.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)
            : [];
          if (delivered.length > 0) {
            setRoomDeliveredMessageIds((prev) => {
              const merged = new Set([...(Array.isArray(prev) ? prev : []), ...delivered]);
              return Array.from(merged);
            });
          }
        }
        loadedMessagesChatRef.current = `${kind}:${id}`;
        historySyncedChatRef.current = `${kind}:${id}`;
        writeChatMessagesCache(user?.id, kind, id, page);
        messagesRef.current = page;
        setMessages(page);
        setHasMore(page.length === INITIAL_MESSAGES_LIMIT);

        prevLastIdRef.current = page.length ? String(page[page.length - 1]?.id) : null;


        // Получаем имя чата по kind/id (используем контроллеры из админки)
        try {

          let infoUrl = null;

            if (kind === 'room') {
              infoUrl = `${API_BASE}/admin/rooms/${id}`;
            } else if (kind === 'boss') {
              infoUrl = `${API_BASE}/admin/boss/chats/${id}`;
            } else {
              // универсальный fallback на случай других kind
              infoUrl = `${API_BASE}/admin/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`;
            }

            if (infoUrl) {
              const infoRes = await fetch(infoUrl, opts);
              if (infoRes && infoRes.ok) {
                const info = await infoRes.json();
                if (mounted) {
                  const name = info?.name ?? info?.title ?? info?.chatName ?? info?.roomName ?? '';
                  setChatName(name || '');
                  if (kind === 'room') {
                    const rawType = String(info?.type ?? '').toLowerCase();
                    if (rawType === 'group' || rawType === 'personal') {
                      setRoomChatType(rawType);
                    } else {
                      setRoomChatType(null);
                    }
                    setRoomPartnerName(String(info?.partner?.name ?? info?.partnerName ?? '').trim());
                    setRoomCreatorUserId(info?.creatorUserId ?? null);
                    setRoomExternalParticipants(Array.isArray(info?.externalParticipants) ? info.externalParticipants : []);
                    if (Array.isArray(info?.Users)) {
                      setChatUsers(info.Users.map((u) => ({
                        id: u?.id ?? u?._id ?? u?.userId ?? u?.UserId ?? u?.user_id,
                        name: u?.name ?? u?.username ?? u?.User?.name ?? null,
                        avatar: u?.avatar ?? u?.User?.avatar ?? null,
                      })).filter(Boolean));
                    }
                  } else if (kind === 'boss') {
                    const folderMode = Boolean(info?.mode);
                    setBossFolderMode(folderMode);
                    setActiveBossFolder(null);
                    if (folderMode) {
                      setFoldersLoading(true);
                      try {
                        const foldersRes = await fetch(
                          `${API_BASE}/web/boss/chats/${encodeURIComponent(id)}/folders`,
                          opts
                        );
                        if (!foldersRes.ok) throw new Error(`${foldersRes.status} ${foldersRes.statusText}`);
                        const foldersData = await foldersRes.json();
                        if (mounted) setBossFolders(Array.isArray(foldersData) ? foldersData : []);
                      } catch (foldersErr) {
                        console.warn('Failed to load boss folders', foldersErr);
                        if (mounted) setBossFolders([]);
                      } finally {
                        if (mounted) setFoldersLoading(false);
                      }
                    } else {
                      setBossFolders([]);
                    }
                  }
                }
              } else {
                // 404 или другая ошибка — очищаем имя или оставляем пустым
                if (infoRes && infoRes.status === 404) {
                  if (mounted) setChatName('');
                } else {
                  // логируем детали если нужно
                  console.warn('Failed to load chat info', infoRes && `${infoRes.status} ${infoRes.statusText}`);
                  if (mounted) setChatName('');
                }
              }
            }
          } catch (e) {
            console.warn('Error while fetching chat info', e);
            if (mounted) setChatName('');
          }


        // --- получить список пользователей чата и вызвать setChatUsers ---
        try {

          let usersUrl = null;

          if (kind === 'room') {
            // если у тебя есть отдельный endpoint /admin/rooms/:id/users — используем его
            usersUrl = `${API_BASE}/admin/rooms/${id}/users`;
          } else if (kind === 'boss') {
            usersUrl = `${API_BASE}/admin/boss/chats/${id}/users`;
          } else {
            // универсальный fallback: попробуем /admin/<kind>/:id (в нём может быть Users)
            usersUrl = `${API_BASE}/admin/${encodeURIComponent(kind)}/${id}/users`;
          }

          let users = [];

          // 1) Попробуем прямой endpoint /admin/.../users
          try {
            const r = await fetch(usersUrl, opts);
            if (r && r.ok) {
              const j = await r.json();
              // Ожидаем массив пользователей, но нормализуем разные формы
              if (Array.isArray(j)) {
                users = j;
              } else if (Array.isArray(j.Users)) {
                users = j.Users;
              } else if (Array.isArray(j.data)) {
                users = j.data;
              } else if (Array.isArray(j.rows)) {
                users = j.rows;
              } else {
                // если вернулся объект, но содержит Users
                users = j.Users ? j.Users : [];
              }
            }
          } catch (e) {
            // если прямой endpoint недоступен — пробуем получить через основной ресурс /admin/rooms/:id
            console.warn('users endpoint failed, fallback to resource fetch', e);
            try {
              const fallbackUrl = kind === 'room'
                ? `${API_BASE}/admin/rooms/${id}`
                : kind === 'boss'
                ? `${API_BASE}/admin/boss/chats/${id}`
                : `${API_BASE}/admin/${encodeURIComponent(kind)}/${id}`;
              const rf = await fetch(fallbackUrl, opts);
              if (rf && rf.ok) {
                const jf = await rf.json();
                if (Array.isArray(jf.Users)) users = jf.Users;
                else if (Array.isArray(jf.users)) users = jf.users;
                else if (Array.isArray(jf.data)) users = jf.data;
              }
            } catch (e2) {
              console.warn('fallback fetch also failed', e2);
            }
          }

          // Нормализуем элементы в { id, name } (подстраховка на разные поля)
          const normalized = (users || []).map(u => {
            // возможные формы: { id, name }, { userId }, { User: { id, name } }
            if (!u) return null;
            if (u.User && (u.User.id || u.User.name)) {
              return { id: u.User.id ?? u.User._id, name: u.User.name ?? null };
            }
            const idVal = u.id ?? u._id ?? u.userId ?? u.UserId ?? u.user_id;
            const nameVal = u.name ?? u.username ?? (u.User && u.User.name) ?? null;
            const avatarVal = u.avatar ?? (u.User && u.User.avatar) ?? null;
            return { id: idVal, name: nameVal, avatar: avatarVal };
          }).filter(Boolean);

          // Если нет имён — можно опционально дозапросить их пачкой (см. ниже). Для простоты — сразу setChatUsers.
          if (mounted) {
            setChatUsers(normalized);
          }
        } catch (err) {
          console.warn('Failed to load chat users', err);
          if (mounted) setChatUsers([]);
        }

      } catch (err) {
        console.error('load history failed', err);
        loadedMessagesChatRef.current = `${kind}:${id}`;
        historySyncedChatRef.current = `${kind}:${id}`;
        if (mounted && !cachedMessages?.length) setError(String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [authLoading, historyCandidates, tryEndpoints, normalizeAsc, token, kind, id, API_BASE, user?.id]);

  const closeRoomParticipantsModal = useCallback(() => {
    if (roomParticipantsSaving) return;
    setRoomParticipantsModalOpen(false);
  }, [roomParticipantsSaving]);

  const saveRoomParticipants = useCallback(async (selectedIds) => {
    if (kind !== 'room' || !token || !id) return;
    try {
      setRoomParticipantsSaving(true);
      const response = await fetch(`${API_BASE}/rooms/group/${encodeURIComponent(String(id))}/participants`, {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'omit',
        body: JSON.stringify({ participants: selectedIds }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || data?.message || 'Не удалось обновить состав группы');
      const nextUsers = Array.isArray(data?.Users)
        ? data.Users
        : (Array.isArray(data?.room?.Users) ? data.room.Users : []);
      if (nextUsers.length > 0) {
        setChatUsers(nextUsers.map((u) => ({
          id: u?.id ?? u?._id ?? u?.userId ?? u?.UserId ?? u?.user_id,
          name: u?.name ?? u?.username ?? u?.User?.name ?? null,
          avatar: u?.avatar ?? u?.User?.avatar ?? null,
        })).filter(Boolean));
      }
      setRoomCreatorUserId(data?.creatorUserId ?? data?.room?.creatorUserId ?? roomCreatorUserId);
      setRoomParticipantsModalOpen(false);
      toast.success('Состав группы обновлен');
    } catch (saveError) {
      console.error('save room participants failed', saveError);
      toast.error(saveError?.message || 'Не удалось обновить состав группы');
    } finally {
      setRoomParticipantsSaving(false);
    }
  }, [API_BASE, id, kind, roomCreatorUserId, token]);

  const openBossFolder = useCallback(async (folder) => {
    const folderUserId = Number(folder?.userId);
    if (!Number.isFinite(folderUserId) || folderUserId <= 0) return;

    setLoading(true);
    setError(null);
    setPerformanceExpanded(false);
    try {
      const headers = { Accept: 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const params = new URLSearchParams({
        limit: String(PAGE_LIMIT),
        userId: String(folderUserId),
      });
      const res = await fetch(
        `${API_BASE}/web/boss/chats/${encodeURIComponent(id)}/messages?${params.toString()}`,
        { method: 'GET', headers, credentials: token ? 'omit' : 'include' }
      );
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

      const data = await res.json();
      const pageRaw = Array.isArray(data) ? data : (Array.isArray(data?.messages) ? data.messages : []);
      const page = normalizeAsc(pageRaw);
      seenRef.current = new Set(page.map((message) => String(message.id)).filter(Boolean));
      messagesRef.current = page;
      setMessages(page);
      setHasMore(page.length === PAGE_LIMIT);
      setActiveBossFolder(folder);

      requestAnimationFrame(() => {
        const el = containerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    } catch (err) {
      console.error('Failed to load boss folder', err);
      setError('Не удалось загрузить сообщения сотрудника');
    } finally {
      setLoading(false);
    }
  }, [API_BASE, id, normalizeAsc, token]);



  // ------- loadOlder (prepend) -------
  const loadOlder = useCallback(async () => {
    if (!hasMoreRef.current || loadingOlderRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    const firstMsg = messagesRef.current?.[0];
    if (!firstMsg?.id) return;

    setLoadingOlder(true);
    try {
      const headers = { Accept: 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const opts = { method: 'GET', headers, credentials: token ? 'omit' : 'include' };

      const baseUrls = historyCandidates(kind, id);
      const urlsWithParams = baseUrls.map(u => {
        const p = new URLSearchParams();
        p.set('limit', String(PAGE_LIMIT));
        p.set('beforeId', String(firstMsg.id));
        if (kind === 'boss' && activeBossFolderRef.current?.userId) {
          p.set('userId', String(activeBossFolderRef.current.userId));
        }
        return `${u}?${p.toString()}`;
      });


      // --- перед запросом:
      const prevScrollHeight = el.scrollHeight;
      const prevScrollTop = el.scrollTop;

      const res = await tryEndpoints(urlsWithParams, opts);
      const data = await res.json();
      const pageRaw = Array.isArray(data)
        ? data
        : (Array.isArray(data?.messages) ? data.messages : []);
      const page = normalizeAsc(pageRaw);
      if (!page.length) { setHasMore(false); return; }

      // prepend with dedup
      setMessages(prev => {
        const existing = new Set(prev.map(m => String(m.id)));
        const filtered = page.filter(m => !existing.has(String(m.id)));
        const next = [...filtered, ...prev];
        messagesRef.current = next;
        return next;
      });

      // mark seen...
      page.forEach(m => { if (m?.id) seenRef.current.add(String(m.id)); });

      // Подождём рендера и пересчитаем scrollTop
      // rAF один раз обычно OK; при проблемах — используем двойной rAF
      requestAnimationFrame(() => {
        // DOM уже отрисован — получим новую высоту
        const newScrollHeight = el.scrollHeight;
        const diff = newScrollHeight - prevScrollHeight;
        el.scrollTop = prevScrollTop + diff;
      });

      if (page.length < PAGE_LIMIT) setHasMore(false);
    } catch (err) {
      console.warn('loadOlder failed', err);
    } finally {
      setLoadingOlder(false);
    }
  }, [historyCandidates, tryEndpoints, normalizeAsc, token, kind, id]);

  const resyncInFlightRef = useRef(false);
  const lastResyncAtRef = useRef(0);

  const resyncLatestMessages = useCallback(async (reason = 'manual') => {
    if (authLoading) return;
    if (!kind || !id) return;
    if (resyncInFlightRef.current) return;

    resyncInFlightRef.current = true;
    try {
      const headers = { Accept: 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const opts = { method: 'GET', headers, credentials: token ? 'omit' : 'include' };

      const baseUrls = historyCandidates(kind, id);
      const urls = baseUrls.map((u) => {
        const p = new URLSearchParams();
        // Resync only refreshes the visible tail. Loading history here would
        // silently expand a cached 30-message window to 90 and move the user.
        p.set('limit', String(INITIAL_MESSAGES_LIMIT));
        if (kind === 'boss' && activeBossFolderRef.current?.userId) {
          p.set('userId', String(activeBossFolderRef.current.userId));
        }
        return `${u}?${p.toString()}`;
      });

      const res = await tryEndpoints(urls, opts);
      const data = await res.json();
      const envelope = Array.isArray(data) ? null : (data && typeof data === 'object' ? data : null);
      const pageRaw = Array.isArray(data)
        ? data
        : (Array.isArray(envelope?.messages) ? envelope.messages : []);
      const page = normalizeAsc(pageRaw);
      if (!page.length) return;

      const meId = Number(user?.id) || 0;
      const addedForeignIds = [];
      page.forEach((m) => { if (m?.id) seenRef.current.add(String(m.id)); });

      setMessages((prev) => {
        const byId = new Map();
        (Array.isArray(prev) ? prev : []).forEach((m) => {
          if (!m?.id) return;
          byId.set(String(m.id), m);
        });

        let changed = false;
        page.forEach((m) => {
          if (!m?.id) return;
          const sid = String(m.id);
          if (byId.has(sid)) {
            const prevExisting = byId.get(sid);
            const merged = mergeMessageKeepingFileMeta(prevExisting, m);
            byId.set(sid, merged);
            if (JSON.stringify(merged) !== JSON.stringify(prevExisting)) changed = true;
            return;
          }
          byId.set(sid, m);
          changed = true;
          const authorId = Number(m.userId ?? m.User?.id ?? m.senderId ?? 0) || 0;
          if (authorId && meId && authorId !== meId) addedForeignIds.push(sid);
        });

        const next = normalizeAsc(Array.from(byId.values()));
        messagesRef.current = next;
        return changed ? next : prev;
      });

      if (addedForeignIds.length && historySyncedChatRef.current === `${kind}:${id}`) {
        markFreshMessageIds(addedForeignIds);
      }

    } catch (err) {
      console.warn('[resyncLatestMessages] failed', reason, err);
    } finally {
      resyncInFlightRef.current = false;
    }
  }, [authLoading, token, historyCandidates, kind, id, tryEndpoints, normalizeAsc, user?.id, markFreshMessageIds]);

  const requestResync = useCallback((reason = 'manual') => {
    const now = Date.now();
    if ((now - lastResyncAtRef.current) < 1200) return;
    lastResyncAtRef.current = now;
    resyncLatestMessages(reason).catch((e) => console.warn('[requestResync] failed', e));
  }, [resyncLatestMessages]);
  const readEmitTimerRef = useRef(null);
  const READ_EMIT_DELAY_MS = 2200;

  const emitReadForCurrentChat = useCallback((_reason = 'manual', opts = {}) => {
    void _reason;
    const requireNearBottom = opts?.requireNearBottom !== false;
    if (!socket) return;
    if (typeof document !== 'undefined') {
      if (document.hidden) return;
      if (typeof document.hasFocus === 'function' && !document.hasFocus()) return;
    }
    if (requireNearBottom) {
      const el = containerRef.current;
      if (!el) return;
      const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
      if (distanceFromBottom > BOTTOM_THRESHOLD) return;
    }
    const me = Number(user?.id) || 0;
    if (!me) return;
    const currentMessages = Array.isArray(messagesRef.current) ? messagesRef.current : [];
    if (!currentMessages.length) return;
    const lastMessage = currentMessages[currentMessages.length - 1];
    if (!lastMessage?.id) return;

    const routeChatId = Number(id);
    const routeRoomId = Number(id);
    if (kind === 'room') {
      socket.emit('markAsRead', {
        roomId: Number(lastMessage?.roomId) || routeRoomId,
        lastReadMessageId: Number(lastMessage.id),
        userId: me,
      });
    } else {
      socket.emit('markAsReadChat', {
        chatId: Number(lastMessage?.chatId) || routeChatId,
        lastReadAt: new Date(lastMessage.createdAt),
        lastReadMessageId: Number(lastMessage.id),
        userId: me,
      });
    }
    clearFreshUpToReadId(lastMessage?.id);
  }, [socket, kind, user?.id, id, clearFreshUpToReadId]);

  const scheduleReadForCurrentChat = useCallback((reason = 'manual', opts = {}) => {
    if (readEmitTimerRef.current) clearTimeout(readEmitTimerRef.current);
    const delayMs = Number(opts?.delayMs);
    const safeDelayMs = Number.isFinite(delayMs) ? Math.max(0, delayMs) : READ_EMIT_DELAY_MS;
    readEmitTimerRef.current = setTimeout(() => {
      readEmitTimerRef.current = null;
      emitReadForCurrentChat(reason, opts);
    }, safeDelayMs);
  }, [emitReadForCurrentChat]);

  useEffect(() => {
    return () => {
      if (readEmitTimerRef.current) {
        clearTimeout(readEmitTimerRef.current);
        readEmitTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    const onFocus = () => {
      requestResync('window:focus');
      scheduleReadForCurrentChat('window:focus:post-resync', { requireNearBottom: true });
    };
    const onVisibility = () => {
      if (!document.hidden) {
        requestResync('document:visible');
        scheduleReadForCurrentChat('document:visible:post-resync', { requireNearBottom: true });
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [authLoading, requestResync, scheduleReadForCurrentChat]);

  // keep refs in sync (already done above, but safe)
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { loadingOlderRef.current = loadingOlder; }, [loadingOlder]);



  // ------- scroll listener: attach once and use refs -------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let ticking = false;
    let touchStartY = null;
    let touchTravel = 0;
    let previousScrollTop = el.scrollTop;
    olderHistoryIntentAtRef.current = 0;

    const onWheel = (event) => {
      if (event.deltaY < 0) olderHistoryIntentAtRef.current = Date.now();
    };
    const onTouchStart = (event) => {
      touchStartY = event.touches?.[0]?.clientY ?? null;
      touchTravel = 0;
    };
    const onTouchMove = (event) => {
      const nextY = event.touches?.[0]?.clientY ?? null;
      if (touchStartY != null && nextY != null) {
        touchTravel += Math.max(0, nextY - touchStartY);
        if (touchTravel >= 24) olderHistoryIntentAtRef.current = Date.now();
      }
      touchStartY = nextY;
    };
    const onKeyDown = (event) => {
      if (event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'Home') {
        olderHistoryIntentAtRef.current = Date.now();
      }
    };

    const onScroll = () => {
      if (!initialScrollReadyRef.current) return;
      const currentScrollTop = el.scrollTop;
      const movedUp = currentScrollTop < previousScrollTop - 1;
      previousScrollTop = currentScrollTop;
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const threshold = 120;
        const hasRecentUserIntent = Date.now() - olderHistoryIntentAtRef.current < 1000;
        const isActuallyScrollable = el.scrollHeight > el.clientHeight + 1;
        const shouldLoad = movedUp && isActuallyScrollable && hasRecentUserIntent && el.scrollTop <= threshold && hasMoreRef.current && !loadingOlderRef.current;
        if (shouldLoad) {
          // call stable loadOlder
          loadOlder().catch(err => console.warn('loadOlder error', err));
        }
        ticking = false;
      });
    };

    el.addEventListener('scroll', onScroll);
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('keydown', onKeyDown);
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('keydown', onKeyDown);
    };
    // empty deps: listener uses refs and stable callbacks
  }, [loadOlder, kind, id]);



  // ----------------------- Кнопка "проскроллить вниз" ---------------------------- //
  // Вызывать при скролле контейнера
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const { scrollTop, clientHeight, scrollHeight } = el;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

    setShowScrollDown(distanceFromBottom > BOTTOM_THRESHOLD);
  }, []);

  // Функция плавного скролла вниз
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior });
    } else if (containerRef.current) {
      // fallback
      containerRef.current.scrollTo({ top: containerRef.current.scrollHeight, behavior });
    }
    setShowScrollDown(false);
  }, []);

  // Если пришли новые сообщения — скрываем кнопку, если мы и так внизу.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const { scrollTop, clientHeight, scrollHeight } = el;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

    // Если новые сообщения, и мы близко к низу — автоматически прокрутить к низу и скрыть кнопку.
    if (distanceFromBottom <= BOTTOM_THRESHOLD) {
      // плавно, но можно и instant
      scrollToBottom('auto');
      setShowScrollDown(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]); // реагируем на количество сообщений

  // При монтировании — повесим слушатель скролла (вдруг используешь внешние либы)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });

    // initial check
    handleScroll();

    return () => {
      el.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);



  // ------- socket subscription: append incoming messages -------
  useEffect(() => {
    if (!socket) return;
    if (!kind || !id) return;

    // --- cleanup старых слушателей ---
    try {
      socket.off('room:message_transcription');
      socket.off('boss:message_transcription');
      socket.off('chat:message_transcription');
      socket.off('message_transcription');
    } catch (e) {
      console.warn('[chat] off() error (ignored)', e);
    }

    // join логика как у вас
    const doJoin = () => {
      try {
        if(kind === 'room') socket.emit('joinRoom', id);
        if(kind === 'boss') socket.emit('joinBossChat', id);
      } catch (err) {
        console.error('[chat] join emit error', err);
      }
    };
    if (socket.connected) {
      doJoin();
      requestResync('socket:already-connected');
    }
    const onConnect = () => {
      doJoin();
      requestResync('socket:reconnect');
    };
    socket.on('connect', onConnect);

    // ==========================
    // 1) handler для уведомлений — ВСЕ сообщения
    // ==========================
    const notifyHandler = (msg) => {
      try {
        if (!msg) return;

        // не показываем уведомления, если сообщение от текущего пользователя
        const myUserId = user?.id ?? null; // возьмите user из контекста/пропсов
        const msgUserId = msg.userId ?? msg.User?.id ?? msg.senderId;
        if (String(msgUserId) === String(myUserId)) return;

        // определяем incoming kind/id
        const incomingKind = msg.chatId ? 'boss' : 'room';
        const incomingId = msg.chatId ?? msg.roomId;

        // current chat id/key
        const currentChatKey = `${kind}${String(id)}`;
        const incomingChatKey = `${incomingKind}${String(incomingId)}`;

        // если вкладка свернута — уведомляем всегда
        // если вкладка видна — уведомить только когда сообщение в другом чате
        const shouldNotify = document.hidden || (incomingChatKey !== currentChatKey);

        if (!shouldNotify) return;

        const from = msg.User?.name || msg.userName || msg.fromName || `Пользователь ${msgUserId ?? ''}`;
        const text = String(msg.content ?? msg.text ?? '').slice(0, 180);



        showNotification({
          title: `Сообщение от ${from}`,
          body: text || 'Новое сообщение',
          icon: '/icons/apple-touch-icon.png',
          tag: `${incomingKind}-${incomingId}`,
          data: { kind: incomingKind, id: incomingId, messageId: msg.id }
        });
      } catch (err) {
        console.warn('[notifyHandler] error', err, msg);
      }
    };

    // подписываем notifyHandler на оба типа (чтобы один и тот же код покрывал room и boss)
    socket.on('newRoomMessage', notifyHandler);
    socket.on('newBossChatMessage', notifyHandler);

    // ==========================
    // 2) handleIncoming — для обновления текущего чата (ваша логика), фильтрует belongsToKindAndId
    // ==========================
    const handleIncoming = (incomingPayload) => {
      try {
        if (!incomingPayload) return;
        const msg = (incomingPayload && typeof incomingPayload === 'object' && incomingPayload.message && typeof incomingPayload.message === 'object')
          ? incomingPayload.message
          : incomingPayload;
        if (!msg || typeof msg !== 'object') return;

        const payloadRoomId = incomingPayload?.roomId ?? incomingPayload?.RoomId ?? msg?.roomId ?? msg?.RoomId ?? null;
        const payloadChatId = incomingPayload?.chatId ?? incomingPayload?.ChatId ?? msg?.chatId ?? msg?.ChatId ?? null;

        // принадлежность чату
        if (!belongsToKindAndId({ ...msg, roomId: payloadRoomId ?? msg?.roomId, chatId: payloadChatId ?? msg?.chatId }, kind, id)) {
          // console.log('[handleIncoming] ignored: not for this chat', { msgId: msg?.id, kind, id });
          return;
        }

        // join/reconnect может повторно прислать backlog непрочитанных сообщений.
        // Сообщение старше нижней границы уже загруженного окна — это история,
        // а не новое событие; добавлять его в конец списка нельзя.
        const currentMessages = Array.isArray(messagesRef.current) ? messagesRef.current : [];
        const newestLoadedMessage = [...currentMessages].reverse().find((item) => item?.id != null);
        const incomingNumericId = Number(msg.id);
        const newestNumericId = Number(newestLoadedMessage?.id);
        const incomingCreatedAt = new Date(msg.createdAt || 0).getTime();
        const newestCreatedAt = new Date(newestLoadedMessage?.createdAt || 0).getTime();
        const isHistoricalReplay = Boolean(
          msg.id && newestLoadedMessage?.id && (
            (Number.isFinite(incomingNumericId) && Number.isFinite(newestNumericId) && incomingNumericId < newestNumericId) ||
            (!Number.isFinite(incomingNumericId) && incomingCreatedAt > 0 && newestCreatedAt > 0 && incomingCreatedAt < newestCreatedAt)
          )
        );
        if (isHistoricalReplay) {
          seenRef.current.add(String(msg.id));
          return;
        }

        const msgUserId = Number(msg.userId ?? msg.User?.id ?? msg.senderId ?? 0) || 0;
        const myUserId = Number(user?.id) || 0;
        if (
          kind === 'room' &&
          msg.id &&
          msgUserId &&
          myUserId &&
          msgUserId !== myUserId
        ) {
          socket.emit('message_delivered', { messageId: msg.id });
        }

        // console.log('[handleIncoming] raw', { id: msg.id, tempId: msg.tempId, userId: msg.userId ?? msg.User?.id, createdAt: msg.createdAt, snippet: String(msg.content ?? '').slice(0,80) });

        // 1) дедуп по id (если уже обработали/пометили)
        if (msg.id && seenRef.current.has(String(msg.id))) {
          // console.log('[handleIncoming] skip — seenRef has id', msg.id);
          return;
        }
        if (!msg.id && !msg.tempId) {
          // Иногда прилетает envelope без полноценного message — подтягиваем историю с сервера.
          requestResync('incoming:envelope-without-id');
          return;
        }

        // Собственную загрузку завершает HTTP-ответ. Не даём socket-событию,
        // которое может прийти раньше, запускать тяжёлый рендер изображения.
        if (msg.tempId && pendingUploadTempIdsRef.current.has(String(msg.tempId))) {
          if (msg.id) seenRef.current.add(String(msg.id));
          return;
        }

        if (kind === 'boss' && bossFolderModeRef.current && msgUserId > 0) {
          const authorName = msg.User?.name || msg.user?.name || `Пользователь ${msgUserId}`;
          setBossFolders((prev) => {
            const index = prev.findIndex((folder) => Number(folder.userId) === msgUserId);
            if (index === -1) {
              return [{
                userId: msgUserId,
                name: authorName,
                messageCount: 1,
                lastMessageAt: msg.createdAt || new Date().toISOString(),
              }, ...prev];
            }
            const next = [...prev];
            next[index] = {
              ...next[index],
              name: authorName,
              messageCount: Number(next[index].messageCount || 0) + 1,
              lastMessageAt: msg.createdAt || new Date().toISOString(),
            };
            const [updated] = next.splice(index, 1);
            return [updated, ...next];
          });

          const openedUserId = Number(activeBossFolderRef.current?.userId) || 0;
          if (!openedUserId || openedUserId !== msgUserId) {
            if (msg.id) seenRef.current.add(String(msg.id));
            return;
          }
        }

        // 2) если сервер вернул tempId — заменяем temp-элемент однозначно
        if (msg.tempId) {
          setMessages(prev => {
            const hasTemp = prev.some(m => m?.tempId === msg.tempId);
            if (hasTemp) {
              // console.log('[handleIncoming] replace optimistic by saved via tempId', msg.tempId);
              const next = prev.map(m => (m?.tempId === msg.tempId ? mergeMessageKeepingFileMeta(m, msg) : m));
              if (msg.id) seenRef.current.add(String(msg.id));
              return next;
            }
            // если temp не найден — просто append с защитой по id
            if (msg.id && prev.some(m => String(m.id) === String(msg.id))) return prev;
            if (msg.id) seenRef.current.add(String(msg.id));
            return [...prev, msg];
          });
          if (msg.id && msgUserId && myUserId && msgUserId !== myUserId && historySyncedChatRef.current === `${kind}:${id}`) {
            markFreshMessageIds([msg.id]);
          }
          return;
        }

        // 3) попытка совпадения по matchKey (createdAt + user + snippet)
        // matchKey формируется в sendMessage как `${userId}::${createdAt}::${snippet}`
        const snippet = String(msg.content ?? '').slice(0, 150);
        const userIdForKey = msg.userId ?? msg.User?.id ?? (msg.senderId ?? null);
        const matchKey = `${userIdForKey ?? 'anon'}::${msg.createdAt ?? ''}::${snippet}`;
        const tempId = pendingTemp.current.get(matchKey);

        if (tempId) {
          // console.log('[handleIncoming] found pendingTemp match -> replace temp', { matchKey, tempId, msgId: msg.id });
          setMessages(prev => {
            const replaced = prev.map(m => (m?.tempId === tempId ? mergeMessageKeepingFileMeta(m, msg) : m));
            return replaced;
          });
          pendingTemp.current.delete(matchKey);
          if (msg.id) seenRef.current.add(String(msg.id));
          if (msg.id && msgUserId && myUserId && msgUserId !== myUserId && historySyncedChatRef.current === `${kind}:${id}`) {
            markFreshMessageIds([msg.id]);
          }
          return;
        }

        // 4) fallback — просто append с проверкой по id (чтобы не добавить дубль)
        setMessages(prev => {
          if (msg.id && prev.some(m => String(m.id) === String(msg.id))) {
            // console.log('[handleIncoming] append skipped — already present id', msg.id);
            return prev;
          }
          // console.log('[handleIncoming] append new msg', { id: msg.id, tempId: msg.tempId });
          if (msg.id) seenRef.current.add(String(msg.id));
          return [...prev, msg];
        });
        if (msg.id && msgUserId && myUserId && msgUserId !== myUserId && historySyncedChatRef.current === `${kind}:${id}`) {
          markFreshMessageIds([msg.id]);
        }

        // const currentChat = `${kind}${id}`; 
        // const webchatId = msg.chatId ?? msg.roomId;
        // let webchatKind;
        // if (msg.chatId) {webchatKind = 'boss'} else {webchatKind = 'room'};
        // const webChat = `${webchatKind}${webchatId}`

        // console.log('msg = ', msg)
        // console.log('webChat = ', webChat)
        // console.log('currentChat = ', currentChat)

        // // Всплывающие уведомления
        // if (document.hidden || webChat !== currentChat) {
        //   const from = msg.User?.name || msg.userId || 'Новый пользователь';
        //   const text = msg.content;
        //   const Id = msg.chatId ?? msg.roomId;

        //   showNotification({
        //     title: `Сообщение от ${from}`,
        //     body: text,
        //     icon: '/icons/chat-192.png',
        //     tag: `${kind}-${Id}`, // заметка: объединяет нотификации одного чата
        //     data: { Id, messageId: msg.id }
        //   });
        // }  



      } catch (err) {
        console.warn('[handleIncoming] error', err, incomingPayload);
      }
    };



    // --- NEW: обработчик транскрибации (легкий эвент) ---
    const handleTranscription = (payload) => {
      try {
        if (!payload) return;
        // payload может быть { messageId, transcriptionText, transcriptionStatus? } или full message
        // если пришёл полный message — используем его напрямую
        if (payload && payload.id) {
          // пришёл полный объект сообщения — реиспользуем handleIncoming для корректной вставки/замены
          handleIncoming(payload);
          return;
        }

        const messageId = payload?.messageId ?? payload?.id;
        const transcriptionText = payload?.transcriptionText ?? null;
        const transcriptionStatus = payload?.transcriptionStatus ?? (transcriptionText != null ? 'done' : undefined);

        // console.log('[handleTranscription] update', { messageId, transcriptionStatus, snippet: String(transcriptionText ?? '').slice(0,80) });

        if (!messageId) return;

        // Обновляем существующее сообщение в списке (не создаём нового)
        setMessages(prev =>
          prev.map(m => {
            if (String(m.id) !== String(messageId)) return m;
            // merge transcription fields
            const next = { ...m };
            if (transcriptionText !== undefined) next.transcriptionText = transcriptionText;
            if (transcriptionStatus) next.transcriptionStatus = transcriptionStatus;
            return next;
          })
        );

        // пометка seenRef для защиты от дублей (если ещё не отмечено)
        if (messageId && !seenRef.current.has(String(messageId))) {
          // не добавляем в seen, т.к. сообщение могло не существовать локально, но safe to add
          seenRef.current.add(String(messageId));
        }

      } catch (err) {
        console.warn('[handleTranscription] error', err, payload);
      }
    };


    // удаление сообщений
    const handleMessageUpdated = (payload) => {
      const id = payload.id;
      setMessages(prev => prev.map(m => {
        if (String(m.id) === String(id)) {
          return {
            ...m,
            content: payload.content,
            type: payload.type,
            mediaUrl: null,
            fileName: null,
            is_deleted: true,
            deletedByName: payload.deletedByName,
          };
        }
        return m;
      }));
    };


    // подписываемся на минимальный набор событий
    if(kind === 'room') socket.on('newRoomMessage', handleIncoming);
    if(kind === 'boss') socket.on('newBossChatMessage', handleIncoming);

    const handleDeliveryUpdated = (payload) => {
      if (kind !== 'room') return;
      const messageId = Number(payload?.messageId) || 0;
      if (!messageId) return;
      setRoomDeliveredMessageIds((prev) => (prev.includes(messageId) ? prev : [...prev, messageId]));
    };

    const handleReadUpdated = (payload) => {
      if (kind !== 'room') return;
      const payloadRoomId = Number(payload?.roomId) || 0;
      if (!payloadRoomId || payloadRoomId !== Number(id)) return;
      const who = Number(payload?.userId) || 0;
      const me = Number(user?.id) || 0;
      const lastRead = Number(payload?.lastReadMessageId) || 0;
      if (!who || !me || !lastRead) return;
      if (who === me) {
        clearFreshUpToReadId(lastRead);
        return;
      }
      if (!lastRead) return;
      setRoomOtherLastReadId((prev) => (lastRead > prev ? lastRead : prev));
      setRoomReadByUser((prev) => ({
        ...prev,
        [who]: Math.max(Number(prev[who]) || 0, lastRead),
      }));
    };

    const handleReadStatusUpdated = (payload) => {
      handleReadUpdated(payload);
    };

    const handleReadStatusUpdatedChat = (payload) => {
      if (kind !== 'boss') return;
      const payloadChatId = Number(payload?.chatId) || 0;
      if (!payloadChatId || payloadChatId !== Number(id)) return;
      const who = Number(payload?.userId) || 0;
      const me = Number(user?.id) || 0;
      const lastRead = Number(payload?.lastReadMessageId) || 0;
      if (!who || !me || !lastRead) return;
      if (who === me) {
        clearFreshUpToReadId(lastRead);
        return;
      }
      setBossReadByUser((prev) => ({
        ...prev,
        [who]: Math.max(Number(prev[who]) || 0, lastRead),
      }));
    };

    const handleExternalParticipantsUpdated = (payload) => {
      if (kind !== 'room') return;
      const payloadRoomId = Number(payload?.roomId) || 0;
      if (!payloadRoomId || payloadRoomId !== Number(id)) return;
      if (Array.isArray(payload?.externalParticipants)) {
        setRoomExternalParticipants(payload.externalParticipants);
        return;
      }
      const participant = payload?.participant;
      const participantId = Number(participant?.id || 0);
      if (!participantId) return;
      if (String(participant?.status || 'active') !== 'active') {
        setRoomExternalParticipants((prev) => (Array.isArray(prev) ? prev : []).filter((item) => Number(item?.id || 0) !== participantId));
        return;
      }
      setRoomExternalParticipants((prev) => {
        const current = Array.isArray(prev) ? prev : [];
        const index = current.findIndex((item) => Number(item?.id || 0) === participantId);
        if (index >= 0) {
          const next = current.slice();
          next[index] = participant;
          return next;
        }
        return [...current, participant];
      });
    };
    socket.on('delivery_updated', handleDeliveryUpdated);
    socket.on('read_updated', handleReadUpdated);
    socket.on('readStatusUpdated', handleReadStatusUpdated);
    socket.on('readStatusUpdatedChat', handleReadStatusUpdatedChat);
    socket.on('room:external_participants_updated', handleExternalParticipantsUpdated);

    // подписываемся на транскрибационные эвенты (универсально)
    socket.on('room:message_transcription', handleTranscription);
    socket.on('boss:message_transcription', handleTranscription);
    socket.on('chat:message_transcription', handleTranscription);
    socket.on('message_transcription', handleTranscription); // fallback / dev

    socket.on('messageUpdated', handleMessageUpdated);  



    // CLEANUP
    return () => {
      try {
        socket.off('connect', onConnect);
        socket.off('newRoomMessage', notifyHandler);
        socket.off('newBossChatMessage', notifyHandler);
        socket.off('newRoomMessage', handleIncoming);
        socket.off('newBossChatMessage', handleIncoming);
        socket.off('delivery_updated', handleDeliveryUpdated);
        socket.off('read_updated', handleReadUpdated);
        socket.off('readStatusUpdated', handleReadStatusUpdated);
        socket.off('readStatusUpdatedChat', handleReadStatusUpdatedChat);
        socket.off('room:external_participants_updated', handleExternalParticipantsUpdated);
        socket.off('room:message_transcription', handleTranscription);
        socket.off('boss:message_transcription', handleTranscription);
        socket.off('chat:message_transcription', handleTranscription);
        socket.off('message_transcription', handleTranscription);
        socket.emit('leaveRoom', id);
        socket.off('messageUpdated', handleMessageUpdated);
      } catch (err) {
        console.warn('[chat] cleanup error (ignored)', err);
      }
    };
  }, [socket, kind, id, user, requestResync, markFreshMessageIds, clearFreshUpToReadId]);

  const getMessageStatus = useCallback((message) => {
    const myId = Number(user?.id) || 0;
    const senderId = Number(message?.userId ?? message?.User?.id ?? 0) || 0;
    const isMine = myId && senderId && myId === senderId;
    if (!isMine) return undefined;

    const rawId = message?.id;
    const isTemp = typeof rawId === 'string' && rawId.startsWith('temp-');
    const messageId = Number(rawId);
    const deliveryRaw = String(message?.deliveryStatus ?? '').toLowerCase();
    const readRaw = String(message?.readStatus ?? '').toLowerCase();
    const isSending = !!message?.sending || isTemp || deliveryRaw === 'pending' || deliveryRaw === 'sending' || !Number.isFinite(messageId) || messageId <= 0;

    if (isSending) return 'sending';
    if (readRaw === 'read') return 'read';
    if (readRaw === 'delivered') return 'delivered';

    if (kind === 'room') {
      if (message?.seen) return 'read';
      const expectedOthers = (Array.isArray(chatUsers) ? chatUsers : [])
        .map((u) => Number(u?.id ?? u?.userId ?? u?.UserId ?? u?.User?.id ?? 0))
        .filter((uid) => uid > 0 && uid !== myId);
      const roomReadsByUser = Object.entries(roomReadByUser).reduce((acc, [uid, raw]) => {
        const nUid = Number(uid) || 0;
        const nRead = Number(raw) || 0;
        if (nUid > 0 && nUid !== myId && nRead > 0) acc[nUid] = nRead;
        return acc;
      }, {});
      const reads = expectedOthers.map((uid) => Number(roomReadsByUser[uid]) || 0);
      const hasAnyRead = reads.some((v) => v > 0);
      const allReadKnown = expectedOthers.length > 0 && reads.every((v) => v > 0);
      const isGroupRoom = roomChatType === 'group' || (!roomChatType && Array.isArray(chatUsers) && chatUsers.length > 2);
      const isPersonalRoom = roomChatType === 'personal';
      if (isGroupRoom) {
        if (allReadKnown) {
          const minRead = Math.min(...reads);
          const maxRead = Math.max(...reads);
          if (messageId <= minRead) return 'read';
          if (messageId <= maxRead) return 'delivered';
        } else {
          if (roomMinOtherLastReadId > 0 && messageId <= roomMinOtherLastReadId) return 'read';
          if (hasAnyRead && messageId <= Math.max(...reads)) return 'delivered';
        }
      } else if (isPersonalRoom && roomOtherLastReadId > 0 && messageId <= roomOtherLastReadId) {
        return 'read';
      }
      if (roomDeliveredMessageIds.includes(messageId)) return 'delivered';
      return 'sent';
    }

    if (kind === 'boss') {
      const others = Object.entries(bossReadByUser)
        .filter(([uid]) => Number(uid) !== myId)
        .map(([, v]) => Number(v) || 0)
        .filter((v) => Number.isFinite(v) && v > 0);
      if (others.length > 0) {
        const minRead = Math.min(...others);
        const maxRead = Math.max(...others);
        if (messageId <= minRead) return 'read';
        if (messageId <= maxRead) return 'delivered';
      }
      return 'sent';
    }

    return 'sent';
  }, [user?.id, kind, roomOtherLastReadId, roomMinOtherLastReadId, roomDeliveredMessageIds, roomReadByUser, chatUsers, roomChatType, bossReadByUser]);

  // ------- smart autoscroll: scroll down only when last message changes (append/initial) -------
  useEffect(() => {
    const lastId = messages.length ? String(messages[messages.length - 1]?.id) : null;
    const prevLast = prevLastIdRef.current;

    if (lastId !== prevLast) {
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' }));
      prevLastIdRef.current = lastId;
    }
  }, [messages]);



  // Непрочитанные
  useEffect(() => {
    if (!messages.length || !socket) return;
    scheduleReadForCurrentChat('messages:changed', { requireNearBottom: true });

    // // локально можно сразу обнулить unread
    // setChats(prev => prev.map(c => c.id === chat.id ? { ...c, unread: 0 } : c));

  }, [messages, socket, scheduleReadForCurrentChat]);





  // ---------------------------- ОТПРАВКА, ЗАГРУЗКА ------------------------------ //

  // 1) Универсальный upload (File | Blob)
  const uploadFile = useCallback(async (fileOrBlob, opts) => {

    const fd = new FormData();

    let file = fileOrBlob;
    if (fileOrBlob instanceof Blob && !(fileOrBlob instanceof File)) {
      const rawMimeType = String(fileOrBlob.type || '').trim().toLowerCase();
      const mimeType = rawMimeType.split(';')[0] || 'application/octet-stream';
      const audioExtensionByMime = {
        'audio/mp4': 'm4a',
        'video/mp4': 'm4a',
        'audio/webm': 'webm',
        'video/webm': 'webm',
        'audio/ogg': 'ogg',
        'audio/mpeg': 'mp3',
        'audio/wav': 'wav',
        'audio/x-wav': 'wav',
      };
      const ext = audioExtensionByMime[mimeType] || 'webm';
      file = new File([fileOrBlob], `recording-${Date.now()}.${ext}`, { type: mimeType });
    }
    const optimisticId = `temp-upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // 👇 Определяем тип файла
    // const type = detectFileType(file);

    // console.log('opts = ', opts)

    fd.append('file', file);
    if (kind === 'room') fd.append('roomId', String(id));
    else fd.append('chatId', String(id));
    const effectiveReplyToMessageId = opts?.replyToMessageId ?? replyDraft?.messageId ?? null;

    fd.append('userId', String(user?.id ?? '0'));
    fd.append('messageType', opts.messageType || 'file');
    fd.append('type', opts.messageType );
    fd.append('tempId', optimisticId);
    if (effectiveReplyToMessageId != null) {
      fd.append('replyToMessageId', String(effectiveReplyToMessageId));
      fd.append('replyToMessage', String(effectiveReplyToMessageId));
    }

    const optimisticMediaUrl = file.type?.startsWith('image/') ? URL.createObjectURL(file) : null;
    const optimisticMessage = {
      id: optimisticId,
      tempId: optimisticId,
      content: '',
      type: opts.messageType || 'file',
      mediaUrl: optimisticMediaUrl,
      mediaMimeType: file.type || 'application/octet-stream',
      fileName: file.name || 'Файл',
      fileSize: file.size || null,
      userId: user?.id ?? null,
      User: user?.id ? { id: user.id, name: user.name || user.username || null } : null,
      roomId: kind === 'room' ? Number(id) : null,
      chatId: kind === 'boss' ? Number(id) : null,
      createdAt: new Date().toISOString(),
      sending: true,
      replyToMessageId: effectiveReplyToMessageId,
    };

    setMessages(prev => [...prev, optimisticMessage]);
    pendingUploadTempIdsRef.current.add(optimisticId);
    setIsUploading(true);
    try {
      const response = await fetch(`${API_BASE}/uploadfiles/fileFromWebchat`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: token ? 'omit' : 'include',
        body: fd,
      });

      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(responseData.error || `Upload failed ${response.status}`);

      let newMsg = responseData;

      if (effectiveReplyToMessageId != null && newMsg && !newMsg.replyToMessageId) {
        newMsg = { ...newMsg, replyToMessageId: effectiveReplyToMessageId };
      }

      // Сокет может доставить сохранённое сообщение раньше HTTP-ответа. Всегда
      // заменяем optimistic-элемент и одновременно удаляем возможный дубль.
      if (newMsg?.id) seenRef.current.add(String(newMsg.id));
      setMessages(prev => {
        const withoutServerDuplicate = newMsg?.id
          ? prev.filter(message => String(message?.id) !== String(newMsg.id))
          : prev;
        const optimisticIndex = withoutServerDuplicate.findIndex(message => message?.id === optimisticId);
        if (optimisticIndex < 0) return [...withoutServerDuplicate, newMsg];
        const next = [...withoutServerDuplicate];
        next[optimisticIndex] = newMsg;
        return next;
      });
      if (effectiveReplyToMessageId != null) {
        setReplyDraft(null);
      }

      if (optimisticMediaUrl) setTimeout(() => URL.revokeObjectURL(optimisticMediaUrl), 0);

      return newMsg;
    } catch (err) {
      console.error('uploadFile error', err);
      setMessages(prev => prev.filter(message => message?.id !== optimisticId));
      if (optimisticMediaUrl) URL.revokeObjectURL(optimisticMediaUrl);
      throw err;
    } finally {
      pendingUploadTempIdsRef.current.delete(optimisticId);
      setIsUploading(false);
    }
  },[API_BASE, id, kind, token, user?.id, user?.name, user?.username, replyDraft]);

  useEffect(() => {
    if (fileSpaceSendRef.current || !token || !user?.id || !kind || !id) return;
    let pending = null;
    try { pending = JSON.parse(sessionStorage.getItem('filespace:sendToChat') || 'null'); } catch { pending = null; }
    if (!pending?.fileId) return;
    if (!['room', 'boss'].includes(String(kind))) {
      fileSpaceSendRef.current = true;
      toast.info('Выберите внутренний чат или админ-чат для отправки файла');
      router.replace('/webchats?filespaceSend=1');
      return;
    }
    fileSpaceSendRef.current = true;
    setIsUploading(true);
    fetch(`${API_BASE}/filespace/files/${encodeURIComponent(pending.fileId)}/send-to-chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, chatId: id }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Ошибка ${response.status}`);
        sessionStorage.removeItem('filespace:sendToChat');
        toast.success(`Файл «${pending.name || 'без названия'}» отправлен`);
      })
      .catch((error) => {
        fileSpaceSendRef.current = false;
        toast.error(`Не удалось отправить файл: ${error.message}`);
      })
      .finally(() => setIsUploading(false));
  }, [API_BASE, id, kind, router, token, user?.id]);

  const getForwardMessageKey = useCallback((message) => String(message?.id ?? ''), []);

  const openForwardModal = useCallback(({ message }) => {
    const key = getForwardMessageKey(message);
    if (!key) return;
    setForwardSelectedIds(new Set([key]));
    setForwardSelectionMode(true);
    setForwardModalOpen(false);
  }, [getForwardMessageKey]);

  const toggleForwardMessage = useCallback((message) => {
    const key = getForwardMessageKey(message);
    if (!key) return;
    setForwardSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else if (next.size < 50) next.add(key);
      else toast.info('Можно переслать не более 50 сообщений');
      return next;
    });
  }, [getForwardMessageKey]);

  const cancelForwardSelection = useCallback(() => {
    if (forwardBusy) return;
    setForwardModalOpen(false);
    setForwardSelectionMode(false);
    setForwardSelectedIds(new Set());
  }, [forwardBusy]);

  const closeForwardModal = useCallback(() => {
    if (!forwardBusy) setForwardModalOpen(false);
  }, [forwardBusy]);

  const forwardDraftToRoom = useCallback(async (room) => {
    const targetKind = String(room?.forwardKind || 'room').toLowerCase();
    const targetId = String(room?.id ?? room?.rawId ?? '').replace(/^(room-|boss-|max-|telegram-)/, '');
    const targetRoomId = Number(targetId);
    if (!targetId || (targetKind === 'room' && (!Number.isFinite(targetRoomId) || targetRoomId <= 0))) {
      toast.error('Не удалось определить чат получателя');
      return;
    }
    const selectedMessages = messages
      .filter((message) => forwardSelectedIds.has(getForwardMessageKey(message)))
      .slice()
      .sort((left, right) => new Date(left?.createdAt || 0) - new Date(right?.createdAt || 0));
    if (!selectedMessages.length) {
      toast.error('Выберите сообщения для пересылки');
      return;
    }
    try {
      setForwardBusy(true);
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const snapshots = selectedMessages.map((message) => ({
        content: String(message?.content ?? getReadableMessageText(message, '') ?? ''),
        type: String(message?.type || (message?.mediaUrl ? 'file' : 'text')),
        mediaUrl: message?.mediaUrl || message?.media_url || message?.fileUrl || null,
        thumbnailUrl: message?.thumbnailUrl || null,
        fileName: message?.displayFileName || message?.originalFileName || message?.fileName || null,
        fileSize: message?.fileSize ?? message?.size ?? null,
        duration: message?.duration ?? null,
        mediaMimeType: message?.mediaMimeType || message?.mimeType || null,
      }));
      if (targetKind === 'room') {
      const response = await fetch(`${API_BASE}/admin/rooms/${encodeURIComponent(String(targetRoomId))}/messages/forward`, {
        method: 'POST',
        headers,
        credentials: token ? 'omit' : 'include',
        body: JSON.stringify({
          batchId: `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
          messages: snapshots,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || payload?.error || 'Не удалось переслать сообщения');
      } else {
        for (const snapshot of snapshots) {
          const content = String(snapshot.content || '').trim();
          if (content) {
            const textUrl = targetKind === 'boss'
              ? `${API_BASE}/admin/boss/chats/${encodeURIComponent(targetId)}/messages`
              : `${API_BASE}/${targetKind}/chats/${encodeURIComponent(targetId)}/send`;
            const textResponse = await fetch(textUrl, {
              method: 'POST', headers, credentials: token ? 'omit' : 'include',
              body: JSON.stringify(targetKind === 'boss' ? { content, type: 'text' } : { text: content, type: 'text', senderName: user?.name, senderId: user?.id }),
            });
            if (!textResponse.ok) throw new Error('Не удалось переслать текст');
          }
          if (snapshot.mediaUrl) {
            const rawSourceUrl = String(snapshot.mediaUrl);
            const sourceUrl = /^https?:\/\//i.test(rawSourceUrl)
              ? rawSourceUrl
              : `${String(API_BASE || '').replace(/\/api\/?$/i, '').replace(/\/$/, '')}/${rawSourceUrl.replace(/^\//, '')}`;
            const sourceResponse = await fetch(sourceUrl, { credentials: 'omit' });
            if (!sourceResponse.ok) throw new Error('Не удалось получить вложение');
            const blob = await sourceResponse.blob();
            const mime = snapshot.mediaMimeType || blob.type || 'application/octet-stream';
            const file = new File([blob], snapshot.fileName || `forward-${Date.now()}`, { type: mime });
            const form = new FormData();
            let uploadUrl = `${API_BASE}/uploadfiles/fileFromWebchat`;
            let field = 'file';
            if (targetKind === 'boss') {
              form.append('chatId', targetId);
              form.append('userId', String(user?.id ?? '0'));
              form.append('messageType', snapshot.type || 'file');
              form.append('type', snapshot.type || 'file');
            } else {
              if (mime.startsWith('image/')) field = 'image';
              else if (mime.startsWith('video/')) field = 'video';
              else if (mime.startsWith('audio/')) field = 'audio';
              const endpoint = field === 'file' ? 'send-file' : `send-${field}`;
              uploadUrl = `${API_BASE}/${targetKind}/chats/${encodeURIComponent(targetId)}/${endpoint}`;
              form.append('senderName', user?.name || '');
              form.append('senderId', String(user?.id ?? ''));
            }
            form.append(field, file);
            const uploadResponse = await fetch(uploadUrl, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: token ? 'omit' : 'include', body: form });
            if (!uploadResponse.ok) throw new Error('Не удалось переслать вложение');
          }
        }
      }
      toast.success(selectedMessages.length === 1 ? 'Сообщение переслано' : `Переслано сообщений: ${selectedMessages.length}`);
      setForwardModalOpen(false);
      setForwardSelectionMode(false);
      setForwardSelectedIds(new Set());
    } catch (error) {
      console.error('forward to room failed', error);
      toast.error(error?.message || 'Не удалось переслать сообщение');
    } finally {
      setForwardBusy(false);
    }
  }, [API_BASE, forwardSelectedIds, getForwardMessageKey, messages, token, user?.id, user?.name]);

  // 2) onFile для ChatFooter (вызывается with File)
  const onFile = async (file) => {
    try {
      if (!file) return;
      //const messageType = file.type?.startsWith('audio/') ? 'audio' : 'file';
      const messageType = detectFileType(file);
      //console.log('onFile messageType=', messageType);
      await uploadFile(file, { messageType, replyToMessageId: replyDraft?.messageId ?? null });
    } catch (err) {
      console.error('onFile error', err);
      toast.info('Ошибка загрузки файла: ' + String(err));
    }
  };

  // 3) onSendVoice для ChatFooter (вызывается с Blob)
  const onSendVoice = async (blob) => {
    try {
      if (!blob) return;
      await uploadFile(blob, { messageType: 'audio', replyToMessageId: replyDraft?.messageId ?? null });
    } catch (err) {
      console.error('onSendVoice error', err);
      toast.info('Ошибка отправки голосового сообщения: ' + String(err));
    }
  };


  const onCancelReply = useCallback(() => setReplyDraft(null), []);



  // обновлённый sendMessage (с учетом редактирования сообщений)
  const sendMessage = async () => {
    const trimmed = (text || '').trim();
    if (!trimmed && !editingMessage) return;
    setSending(true);

    try {
      // --- РЕЖИМ РЕДАКТИРОВАНИЯ ---
      if (editingMessage) {
        const messageId = editingMessage.id;
        // оптимистично обновляем локально: content + edited flag + isUpdating
        let prevMessage = null;
        setMessages(prev => {
          return prev.map(m => {
            if (String(m.id) === String(messageId)) {
              prevMessage = m;
              return { ...m, content: trimmed, edited: true, isUpdating: true };
            }
            return m;
          });
        });

        const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const opts = {
          method: 'PUT', 
          headers,
          credentials: token ? 'omit' : 'include',
          body: JSON.stringify({ content: trimmed })
        };

        const url = putMessageEndpoint(kind, id, messageId);

        try {
          const res = await fetch(url, opts);
          if (!res.ok) {
            const textErr = await res.text().catch(() => '');
            throw new Error(`Update failed: ${res.status} ${res.statusText} ${textErr}`);
          }
          const updated = await res.json();

          // Применяем окончательно ответ сервера (заменяем объект)
          setMessages(prev => prev.map(m => (String(m.id) === String(updated.id) ? updated : m)));

          // очистка режима редактирования
          setEditingMessage(null);
          setOriginalTextBeforeEdit('');
          setText('');
          setReplyDraft(null);
        } catch (err) {
          // откат при ошибке
          console.error('[sendMessage] update error', err);
          toast.info('Ошибка обновления сообщения: ' + String(err));
          setMessages(prev => prev.map(m => (String(m.id) === String(messageId) ? { ...prevMessage, isUpdating: false } : m)));
          // не очищаем editingMessage — оставляем, чтобы пользователь мог попробовать снова или отменить
        } finally {
          setSending(false);
        }
        return;
      }

      // --- РЕЖИМ ОТПРАВКИ НОВОГО СООБЩЕНИЯ ---
      setText('');
      const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const body = {
        content: trimmed,
        type: 'text',
        ...(kind === 'room' ? { roomId: id } : { chatId: id }),
        userId: user?.id,
        ...(replyDraft?.messageId ? { replyToMessageId: replyDraft.messageId } : {})
      };

      const opts = {
        method: 'POST',
        headers,
        credentials: token ? 'omit' : 'include',
        body: JSON.stringify(body)
      };

      const urls = postMessageCandidates(kind, id);
      const res = await fetch(urls[0], opts);

      let saved;
      try {
        saved = await res.json();
        setReplyDraft(null);
      } catch (e) {
        console.error('[sendMessage] failed parsing json', e);
        throw e;
      }

      if (!saved) {
        console.warn('[sendMessage] server returned empty body');
        return;
      }

      if (saved?.id) {
        const sid = String(saved.id);
        if (seenRef.current.has(sid)) {
          // duplicate - skip
        } else {
          seenRef.current.add(sid);
          setMessages(prev => [...prev, saved]);
        }
      } else {
        const fallback = {
          ...saved,
          id: `noid-${Date.now()}`,
          createdAt: saved?.createdAt ?? new Date().toISOString()
        };
        setMessages(prev => [...prev, fallback]);
      }
    } catch (err) {
      console.error('[sendMessage] error', err);
      toast.info('Ошибка отправки: ' + String(err));
    } finally {
      setSending(false);
    }
  };




  // onFiles будет принимать массив File и отправлять их
  const handleDropFiles = useCallback(async (files) => {
    // пример: отправляем последовательно, чтобы проще контролировать прогресс
    for (const file of files) {
      try {
        // можно использовать существующий onFile(file) который у вас есть:
        // await onFile(file);

        // либо напрямую вызывать uploadFile, чтобы задать messageType
        const messageType = detectFileType(file);
        await uploadFile(file, { messageType });
      } catch (err) {
        console.error('Ошибка при отправке файла через drag&drop', err);
        // можно показывать toast
      }
    }
  }, [uploadFile]);



  // Вставка из буфера обмена
  useEffect(() => {
    // helper: dataURL -> File
    const dataURLtoFile = (dataurl, filename) => {
      const arr = dataurl.split(',');
      const mime = arr[0].match(/:(.*?);/)[1];
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) u8arr[n] = bstr.charCodeAt(n);
      return new File([u8arr], filename, { type: mime });
    };

    // helper: ClipboardItem -> File (supports image types)
    const clipboardItemToFile = async (item, preferName = '') => {
      try {
        // ClipboardItem has .types and getType(type)
        for (const type of item.types) {
          if (type.startsWith('image/') || type === 'application/octet-stream') {
            const blob = await item.getType(type);
            const ext = (type.split('/')[1] || 'png').split(';')[0];
            const name = preferName || `pasted-${Date.now()}.${ext}`;
            // File constructor keeps mime type
            return new File([blob], name, { type: blob.type || type });
          }
        }
      } catch (e) {
        console.warn('clipboardItemToFile getType error', e);
      }
      return null;
    };

    // основной обработчик items (DataTransferItemList или ClipboardItem[])
    const processClipboardItems = async (items) => {
      const files = [];
      // items может быть DataTransferItemList (paste event) или ClipboardItem[] (navigator.clipboard.read)
      for (let i = 0; i < items.length; i++) {
        const it = items[i];

        // DataTransferItem (paste): kind === 'file'
        if (it && it.kind === 'file' && typeof it.getAsFile === 'function') {
          const f = it.getAsFile();
          if (f) files.push(f);
          continue;
        }

        // ClipboardItem from navigator.clipboard.read()
        if (typeof ClipboardItem !== 'undefined' && it instanceof ClipboardItem) {
          const file = await clipboardItemToFile(it);
          if (file) files.push(file);
          continue;
        }

        // DataTransferItem with image as dataURL (some browsers)
        if (it && it.type && it.type.startsWith('image/')) {
          try {
            const f = it.getAsFile ? it.getAsFile() : null;
            if (f) files.push(f);
          } catch (e) {
            console.warn('processClipboardItems read item error', e);
          }
        }

        // sometimes get a plain string containing a dataURL in 'text/plain'
        if (it && it.kind === 'string' && typeof it.getAsString === 'function') {
          // try to read synchronously (rare)
          await new Promise(resolve => it.getAsString((str) => {
            if (typeof str === 'string' && str.startsWith('data:')) {
              try {
                const file = dataURLtoFile(str, `pasted-${Date.now()}.png`);
                files.push(file);
              } catch (e) { console.warn(e) }
            }
            resolve();
          }));
        }
      }

      if (files.length === 0) return false;

      // используем ваш общий обработчик отправки файлов
      // предполагаем, что handleDropFiles принимает массив File
      try {
        await handleDropFiles(files);
        return true;
      } catch (e) {
        console.error('handleDropFiles failed for clipboard files', e);
        return false;
      }
    };

    // paste event handler
    const onPaste = async (e) => {
      try {
        if (!e || !e.clipboardData) return;
        // сначала пробуем синхронно из paste event
        const items = e.clipboardData.items;
        if (items && items.length) {
          const handled = await processClipboardItems(items);
          if (handled) {
            e.preventDefault(); // не вставлять изображение/текст в поле
            return;
          }
        }

        // если не обработали файлы, попробуем обычный текст
        const text = e.clipboardData.getData && e.clipboardData.getData('text/plain');
        if (text) {
          // опционально: вставить текст в draft (если у вас есть такая функция)
          if (typeof onTextPaste === 'function') {
            onTextPaste(text);
            e.preventDefault();
            return;
          }
        }

        // fallback: navigator.clipboard.read() — требует разрешения и https
        if (navigator.clipboard && navigator.clipboard.read) {
          try {
            const clipboardItems = await navigator.clipboard.read(); // ClipboardItem[]
            const handled = await processClipboardItems(clipboardItems);
            if (handled) {
              e.preventDefault();
              return;
            }
          } catch (err) {
            // возможно нет разрешения — игнорируем
            console.warn(err)
          }
        }
      } catch (err) {
        console.error('onPaste error', err);
      }
    };

    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('paste', onPaste);
    };
  }, [
    handleDropFiles, // используем вашу функцию
    // onTextPaste,     // опц. функция вставки текста в draft
  ]);



  // --------------------------- ПОИСК ------------------------------ //


  // apiBase, token — из контекста/props
  const fetchContextAndPrepend = useCallback(
    async (messageId, chatKind, chatId, before = 90, after = 10, pivotRaw = null) => {
      try {
        if (!messageId || !chatKind || !chatId) return false;
        const base = API_BASE;

        // helper paths
        const roomPath = (params) => `${base}/web/rooms/${encodeURIComponent(chatId)}/messages?${params}`;
        const bossPath = (params) => `${base}/web/boss/chats/${encodeURIComponent(chatId)}/messages?${params}`;

        const beforeParams = `beforeId=${encodeURIComponent(messageId)}&limit=${encodeURIComponent(before)}`;
        const afterParams  = `afterId=${encodeURIComponent(messageId)}&limit=${encodeURIComponent(after)}`;

        const urlBefore = chatKind === 'room' ? roomPath(beforeParams) : bossPath(beforeParams);
        const urlAfter  = chatKind === 'room' ? roomPath(afterParams)  : bossPath(afterParams);

        const headers = token ? { Accept: 'application/json', Authorization: `Bearer ${token}` } : { Accept: 'application/json' };

        const [resBefore, resAfter] = await Promise.all([
          fetch(urlBefore, { headers }),
          fetch(urlAfter,  { headers }),
        ]);

        // если оба запроса упали — ничего не делаем
        if (!resBefore.ok && !resAfter.ok) {
          console.warn('context endpoints failed', resBefore.status, resAfter.status);
          return false;
        }

        const dataBefore = resBefore.ok ? await resBefore.json() : [];
        const dataAfter  = resAfter.ok  ? await resAfter.json()  : [];

        // dataBefore – returned newest-first (DESC). Нам нужно oldest->newest for prepend order.
        const beforeItems = Array.isArray(dataBefore) ? dataBefore.slice().reverse() : (Array.isArray(dataBefore.items) ? dataBefore.items.slice().reverse() : []);
        const afterItems  = Array.isArray(dataAfter)  ? dataAfter : (Array.isArray(dataAfter.items) ? dataAfter.items : []);

        // we will insert real backend objects (don't strip fields)
        // Build combined: older... + pivot + newer...
        // Avoid duplicates by checking id strings
        setMessages(prev => {
          const existingIds = new Set(prev.map(x => String(x.id)));

          const toPrepend = [];
          for (const m of beforeItems) {
            if (!existingIds.has(String(m.id))) {
              toPrepend.push(m);
              existingIds.add(String(m.id));
            }
          }

          // pivot: use provided pivotRaw (full object) if available, otherwise try to find in afterItems/beforeItems
          let pivot = null;
          if (pivotRaw) pivot = pivotRaw;
          else {
            pivot = beforeItems.find(x => String(x.id) === String(messageId))
                || afterItems.find(x => String(x.id) === String(messageId))
                || null;
          }

          if (pivot && !existingIds.has(String(pivot.id))) {
            // ensure pivot is included between older and newer
            toPrepend.push(pivot);
            existingIds.add(String(pivot.id));
          }

          // Now we want newer items (those after pivot) to appear *after* pivot but before existing prev head
          const newerToInsert = [];
          for (const m of afterItems) {
            if (!existingIds.has(String(m.id))) {
              newerToInsert.push(m);
              existingIds.add(String(m.id));
            }
          }

          // final: prepend older+pivot, then existing prev, but insert newerToInsert right after pivot position
          // Simpler: we'll create next = [...toPrepend, ...newerToInsert, ...prev] — maintains chronological order around pivot
          const next = [...toPrepend, ...newerToInsert, ...prev];
          return next;
        });

        // wait DOM update and try to find element
        await new Promise(r => setTimeout(r, 80));
        const container = containerRef.current;
        if (container) {
          const sel = `[data-message-id="${messageId}"]`;
          const el = container.querySelector(sel) || document.getElementById(`msg-${messageId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('search-highlight');
            setTimeout(() => el.classList.remove('search-highlight'), 2200);
            return true;
          }
        }

        return false;
      } catch (err) {
        console.error('fetchContextAndPrepend error', err);
        return false;
      }
    },
    [API_BASE, token, containerRef, setMessages]
  );




  // helper: прокрутка к сообщению внутри контейнера
  const scrollToMessageInContainer = useCallback((container, messageId, chatKind, chatId, offset = -120) => {
    if (!container || !messageId) return false;

    // ищем элемент внутри контейнера
    const selectors = [
      `[data-message-id="${messageId}"][data-chat-kind="${chatKind}"]`,
      `[data-message-id="${messageId}"][data-room-id="${chatId}"]`,
      `[data-message-id="${messageId}"][data-chat-id="${chatId}"]`,
      `[data-message-id="${messageId}"]`,
      `#msg-${messageId}`
    ];

    let el = null;
    for (const sel of selectors) {
      el = container.querySelector(sel) || document.querySelector(sel);
      if (el) break;
    }

    if (!el) return false;

    // позиция прокрутки
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const currentScroll = container.scrollTop;
    const topRelative = elRect.top - containerRect.top + currentScroll;
    const targetScrollTop = Math.max(0, topRelative + offset);

    container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });

    // временная подсветка найденного сообщения
    el.classList.add('search-highlight');
    setTimeout(() => el.classList.remove('search-highlight'), 2200);

    return true;
  }, []);

  const handleMessageClick = useCallback(async (item) => {
    if (!item || !item.id) return;

    // определяем тип и id чата сообщения
    const itemKind = item.roomId ? 'room' : (item.chatId ? 'boss' : null);
    const itemId = item.roomId ?? item.chatId ?? null;

    // если сообщение принадлежит текущему открытому чату
    if (itemKind === kind && String(itemId) === String(id)) {
      const container = containerRef.current || document.querySelector('.chat-messages-container');
      const ok = scrollToMessageInContainer(container, item.id, kind, id, -120);
      if (!ok) {
        // элемент ещё не загружен
        // сначала попытаться серверный контекст
        const ctxOk = await fetchContextAndPrepend(item.id, itemKind, itemId, 90, 10, item.raw ?? null);
        if (ctxOk) return;
        // // fallback: iterative loadOlder
        // const iterOk = await loadOlderUntilFound({ messageId: item.id, chatKind: itemKind, chatId: itemId, maxAttempts: 12 });
        // if (!iterOk) {
        //   toast.info('Невозможно автоматически загрузить это сообщение — оно слишком старое.');
        // }

        try {
          sessionStorage.setItem('orderSpace:scrollToMessage', JSON.stringify({ messageId: item.id, chatKind: kind, chatId: id }));
        } catch (e) {
          console.warn('sessionStorage setItem failed', e);
        }
      }
      return;
    }

    // если сообщение из другого чата — сохраняем и переходим
    try {
      sessionStorage.setItem('orderSpace:scrollToMessage', JSON.stringify({
        messageId: item.id,
        chatKind: itemKind,
        chatId: itemId
      }));
    } catch (e) {
      console.warn('sessionStorage setItem failed', e);
    }

    // Навигация в нужный чат
    if (itemKind && itemId) {
      router.push(`/webchats/${itemKind}/${itemId}`);
    }
  }, [kind, id, scrollToMessageInContainer, fetchContextAndPrepend, router] );


  // -------------------------- Для меню правой кнопки --------------------------- //

  const toggleMessageReaction = useCallback(async ({ message, emoji }) => {
    const messageId = Number(message?.id) || 0;
    if (!messageId || !emoji) return;
    try {
      const endpoint = kind === 'room'
        ? `${API_BASE}/admin/rooms/${id}/messages/${messageId}/reaction`
        : `${API_BASE}/admin/boss/chats/${id}/messages/${messageId}/reaction`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ emoji }),
        credentials: token ? 'omit' : 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Не удалось поставить реакцию');

      const nextMessage = data?.message;
      if (nextMessage?.id) {
        setMessages((prev) => prev.map((m) => (
          String(m.id) === String(nextMessage.id) ? mergeMessageKeepingFileMeta(m, nextMessage) : m
        )));
      } else {
        setMessages((prev) => prev.map((m) => (
          String(m.id) === String(messageId)
            ? {
                ...m,
                reactions: Array.isArray(data?.reactions) ? data.reactions : m.reactions,
              }
            : m
        )));
      }
    } catch (err) {
      console.warn('toggle reaction failed', err);
      toast.error('Не удалось поставить реакцию');
    }
  }, [API_BASE, id, kind, token]);

  // вызываем при клике "Ответить" из MessageItem
  const handleReply = useCallback(({ message }) => {
    // Для reply-превью приоритет: локально найденное исходное сообщение (уже в том виде,
    // как отображается в чате) -> relation replyToMessage -> текущее message.
    const replyToId =
      message.replyToMessageId ??
      message.replyToMessage?.id ??
      (typeof message.replyToMessage === 'number' ? message.replyToMessage : null) ??
      message.id;

    const localOriginal = (replyToId != null) ? messagesById[String(replyToId)] : null;
    const originalMessage =
      localOriginal ??
      (typeof message.replyToMessage === 'object' ? message.replyToMessage : null) ??
      message;

    const preview =
      originalMessage?.content ??
      originalMessage?.transcriptionText ??
      originalMessage?.text ??
      originalMessage?.body ??
      '';
    const previewAuthor =
      originalMessage?.User?.name ??
      originalMessage?.userName ??
      message.User?.name ??
      '—';

    // Если меню вызывают на том же сообщении, которое хотят ответить — ставим именно его id
    setReplyDraft({
      messageId: replyToId,
      previewText: preview,
      authorName: previewAuthor,
      previewType: originalMessage?.type ?? 'text',
      originalRaw: originalMessage // best-effort
    });
  }, [messagesById]);




  // client-side handleDelete
  const handleDelete = useCallback(async ({ message }) => {
    // console.log('delmess = ', message)
    // console.log('kind = ', kind)
    // console.log('id чата = ', id)

    if (!message?.id) return;
    const ok = confirm('Удалить сообщение? Оно будет помечено как удалённое.');
    if (!ok) return;

    const messageId = message.id;
    // const kind = message.chatId ? 'boss' : 'room';
    // const chatId = message.chatId ?? message.roomId ?? currentChatId; // currentChatId — prop/context

    // optimistic UI: пометим локально как удаляется
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isDeleting: true } : m));

    try {
      const url = kind === 'room'
        ? `${API_BASE}/rooms/${id}/messages/${messageId}`
        : `${API_BASE}/boss/chats/${id}/messages/${messageId}`;

      const res = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: token ? 'omit' : 'include',
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Delete failed');

      const payload = data.payload || {
        id: messageId,
        content: `Сообщение удалено пользователем ${user?.name || user?.id}`,
        type: 'deleted',
        is_deleted: true,
        deletedByName: user?.name
       };



      // применяем обновление локально (сервер и так пришлёт socket, но делаем на случай задержки)
      setMessages(prev => prev.map(m => m.id === payload.id ? {
        ...m,
        content: payload.content,
        type: payload.type,
        mediaUrl: null,
        fileName: null,
        fileSize: null,
        is_deleted: true,
        deletedByName: payload.deletedByName,
        isDeleting: false,
      } : m));

      toast.success('Сообщение помечено как удалённое');
    } catch (err) {
      console.error('delete error', err);
      toast.error('Не удалось удалить сообщение: ' + String(err));
      // откат optimistic
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isDeleting: false } : m));
    }


  },[API_BASE, id, kind, token, user?.id, user?.name]);



  // ----------------------------- PIN ----------------------------------------------- //

  // Вернёт true если загрузка добавила сообщения (даже если часть оказалась дубликатом),
  // вернёт false если сервер вернул пустой массив или произошла ошибка.
  const fetchOlderBlockBefore = useCallback(async (beforeId) => {
    if (!beforeId) {
      // console.log('[fetchOlderBlockBefore] no beforeId provided');
      return false;
    }
    try {
      const headers = { Accept: 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const opts = { method: 'GET', headers, credentials: token ? 'omit' : 'include' };

      // Используем те же historyCandidates / PAGE_LIMIT что и loadOlder
      const baseUrls = historyCandidates(kind, id);
      const urlsWithParams = baseUrls.map(u => {
        const p = new URLSearchParams();
        p.set('limit', String(PAGE_LIMIT));
        p.set('beforeId', String(beforeId));
        return `${u}?${p.toString()}`;
      });

      // console.log('[fetchOlderBlockBefore] requesting', urlsWithParams[0]);

      const res = await tryEndpoints(urlsWithParams, opts);
      const data = await res.json();
      const pageRaw = Array.isArray(data)
        ? data
        : (Array.isArray(data?.messages) ? data.messages : []);
      const page = normalizeAsc(pageRaw);

      if (!page.length) {
        // console.log('[fetchOlderBlockBefore] server returned empty page');
        return false;
      }

      // вставляем так же как loadOlder: prepend с дедупом
      setMessages(prev => {
        const existing = new Set(prev.map(m => String(m.id)));
        const filtered = page.filter(m => !existing.has(String(m.id)));
        const next = [...filtered, ...prev];
        messagesRef.current = next;
        return next;
      });

      // отметить как прочитанные/seen, если нужно
      page.forEach(m => { if (m?.id) seenRef.current.add(String(m.id)); });

      // скорректируем scrollTop аналогично loadOlder
      requestAnimationFrame(() => {
        const el = containerRef.current;
        if (!el) return;
        // prevScrollHeight и prevScrollTop точнее вычислять в caller, но простая корректировка:
        // Здесь мы не имеем prevScrollHeight — но requestAnimationFrame позволит DOM отрисоваться.
        // Если хочется — можно вычислять prevScrollHeight в caller и передавать.
      });

      return true;
    } catch (err) {
      console.warn('[fetchOlderBlockBefore] failed', err);
      return false;
    }
  }, [historyCandidates, tryEndpoints, normalizeAsc, token, kind, id, PAGE_LIMIT]);



  // targetMessageId — id сообщения, к которому нужно прыгнуть
  const jumpToPageAndScrollForPinned = useCallback(async (targetMessageId, opts = {}) => {
    const { maxAttempts = 40, debug = flase } = opts;
    const container = containerRef.current || document.querySelector('.chat-messages-container');
    if (!container) {
      if (debug) console.warn('[jumpToPageAndScroll] no container');
      return false;
    }
    if (!targetMessageId) return false;

    if (debug) console.log('[jumpToPageAndScroll] targetMessage=', targetMessageId);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // 1) Проверяем, есть ли сообщение в уже загруженных
      const foundMsg = messagesRef.current.find(m => String(m.id) === String(targetMessageId));
      if (foundMsg) {
        if (debug) console.log('[jumpToPageAndScroll] found in messagesRef (attempt', attempt, ')');
        // ждём отрисовки DOM
        await new Promise(r => requestAnimationFrame(r));
        const el = container.querySelector(`[data-message-id="${targetMessageId}"]`) || document.querySelector(`#msg-${targetMessageId}`);
        if (el) {
          // прокрутка и подсветка
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('search-highlight');
          setTimeout(() => el.classList.remove('search-highlight'), 2200);
          return true;
        } else {
          if (debug) console.log('[jumpToPageAndScroll] message present in state but DOM element not yet rendered - waiting next frame');
          await new Promise(r => setTimeout(r, 120));
          continue;
        }
      }

      // 2) Если не найден — подгружаем ещё блоки до текущего first message
      const first = messagesRef.current[0];
      if (!first || !first.id) {
        if (debug) console.log('[jumpToPageAndScroll] no first message to use as beforeId (attempt', attempt, ')');
        break;
      }

      if (debug) console.log(`[jumpToPageAndScroll] attempt ${attempt}: fetchOlderBlockBefore beforeId=${first.id}`);

      const loaded = await fetchOlderBlockBefore(first.id);
      if (!loaded) {
        if (debug) console.log('[jumpToPageAndScroll] no more messages to load from server (attempt', attempt, ')');
        break; // дальше подгрузить нельзя — прекращаем
      }

      // небольшой таймаут/ждём render
      await new Promise(r => requestAnimationFrame(r));
    }

    if (debug) console.warn('[jumpToPageAndScroll] targetMessage not found after max attempts');
    return false;
  }, [fetchOlderBlockBefore, containerRef, messagesRef]);


  // helper: получить ordered array (messageId DESC) — можно reuse logic used for PinnedBar
  const getOrderedPinnedArray = useCallback(() => {
    const arr = Object.values(pinnedMap || []).slice();
    arr.sort((a, b) => {
      const am = Number(a.messageId ?? a.message?.id ?? NaN);
      const bm = Number(b.messageId ?? b.message?.id ?? NaN);
      if (Number.isNaN(am) || Number.isNaN(bm)) return 0;
      return bm - am;
    });
    return arr;
  }, [pinnedMap]);


  const handlePinnedHeaderClick = useCallback(async (messageIdToJump) => {
    if (!messageIdToJump) return;
    // find pinned record that corresponds to this messageId (if any)
    const ordered = getOrderedPinnedArray();
    if (!ordered.length) return;

    // determine the pinned record currently displayed - if displayedPinnedId set use it,
    // otherwise assume it's ordered[0]
    const currentDisplayed = displayedPinnedId
      ? ordered.find(p => String(p.id) === String(displayedPinnedId)) ?? ordered[0]
      : ordered[0];

    try {
      setJumpingPinnedId(currentDisplayed?.messageId ?? currentDisplayed?.message?.id ?? null);

      // call your existing jump function (returns true/false)
      const ok = await jumpToPageAndScrollForPinned(messageIdToJump, { maxAttempts: 40, debug: false });

      if (!ok) {
        toast.info('Невозможно автоматически загрузить это сообщение — оно слишком старое.');
        return;
      }

      // SUCCESS: compute next index to display in header (next older pin)
      const idx = ordered.findIndex(p => {
        const mid = Number(p.messageId ?? p.message?.id ?? NaN);
        return mid === Number(messageIdToJump);
      });

      // If not found by messageId, try match by pinned record id (currentDisplayed)
      let newIndex;
      if (idx >= 0) {
        newIndex = (idx + 1) % ordered.length; // next (older) one
      } else {
        // fallback: find index of currentDisplayed record (by id)
        const curIndex = ordered.findIndex(p => String(p.id) === String(currentDisplayed?.id));
        if (curIndex >= 0) newIndex = (curIndex + 1) % ordered.length;
        else newIndex = 0;
      }

      const nextPinned = ordered[newIndex];
      if (nextPinned) {
        // Set displayed to next pinned record id (so header now shows the next pin)
        setDisplayedPinnedId(nextPinned.id);
      }
    } catch (err) {
      console.error('Pinned jump error', err);
      toast.error('Ошибка при переходе к закрепу');
    } finally {
      setJumpingPinnedId(null);
    }
  }, [displayedPinnedId, getOrderedPinnedArray, jumpToPageAndScrollForPinned]);

  const runPinnedTargetJump = useCallback(async (targetMessageId) => {
    const msgId = Number(targetMessageId);
    if (!Number.isFinite(msgId) || msgId <= 0) return false;
    try {
      const ctxOk = await fetchContextAndPrepend(msgId, kind, id, 90, 10, null);
      if (ctxOk) return true;
    } catch (err) {
      console.warn('[PinnedNav]', 'context-error', { kind, id, messageId: msgId, err: String(err?.message || err) });
    }
    const jumpOk = await jumpToPageAndScrollForPinned(msgId, { maxAttempts: 40, debug: false });
    return jumpOk;
  }, [fetchContextAndPrepend, jumpToPageAndScrollForPinned, kind, id]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('orderSpace:openPinnedTarget');
      if (!raw) return;
      const payload = JSON.parse(raw);
      const targetKind = String(payload?.chatKind || '');
      const targetId = Number(payload?.chatId || 0);
      const targetMessageId = Number(payload?.messageId || 0);
      if (targetKind !== String(kind) || targetId !== Number(id) || !targetMessageId) return;
      sessionStorage.removeItem('orderSpace:openPinnedTarget');
      setTimeout(() => {
        void runPinnedTargetJump(targetMessageId);
      }, 120);
    } catch {
      // ignore parse/storage errors
    }
  }, [kind, id, messages.length, runPinnedTargetJump]);


   // --------------------------- Изменение текстовых сообщений -------------------------- //


  const [editingMessage, setEditingMessage] = useState(null); // { id, content }
  const [originalTextBeforeEdit, setOriginalTextBeforeEdit] = useState('');
  const inputRef = useRef(null); // ref на ваш composer input (например <textarea ref={inputRef} 

  const onEditMessage = useCallback((msg) => {
    if (!msg || msg.type !== 'text') {
      // только текстовые сообщения можно редактировать (по вашему требованию)
      return;
    }

    setEditingMessage({ id: msg.id, content: msg.content });
    setOriginalTextBeforeEdit(textRef.current); // текущее содержимое composer
    setText(msg.content);             // заполняем composer текстом сообщения
    // небольшая задержка для гарантии рендера, затем фокус
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);


  const cancelEdit = () => {
    setEditingMessage(null);
    setText(originalTextBeforeEdit ?? '');
    setOriginalTextBeforeEdit('');
    inputRef.current?.focus();
  };


  // // Определяем какие ID передавать в ChatLayout
  // const roomId = kind === 'room' ? id : null;
  // const chatId = kind === 'boss' ? id : null;


  const isBossFolderRoot = kind === 'boss' && bossFolderMode && !activeBossFolder;
  const sidebarActionButtonStyle = {
    width: 38,
    height: 38,
    borderRadius: 10,
    border: '1px solid #d1d5db',
    background: '#fff',
    color: '#374151',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flex: '0 0 auto',
    position: 'relative',
    margin: 0,
    padding: 0,
  };
  const sidebarActiveActionButtonStyle = {
    ...sidebarActionButtonStyle,
    border: '1px solid #2563eb',
    background: '#eff6ff',
    color: '#1d4ed8',
  };
  const runChatListAction = (actionName) => {
    const fn = chatListActionsRef.current?.[actionName];
    if (typeof fn === 'function') fn();
  };
  const openSearchModal = () => {
    setSearchDraft(searchQuery);
    setSearchModalOpen(true);
  };
  const submitSearch = () => {
    setSearchQuery(searchDraft);
    setSearchModalOpen(false);
  };
  const clearSearch = () => {
    setSearchDraft('');
    setSearchQuery('');
    setSearchModalOpen(false);
  };

  return (
    <div ref={layoutRef} className="webchat-layout webchat-room-layout" style={{ display: 'flex', height: 'calc(90vh)', minHeight: 0, overflow: 'hidden' }}>

    {/* ASIDE (ширина в процентах) */}
    <aside
      className="webchat-sidebar"
      style={{
        width: asideWidthPercent ? `${asideWidthPercent}%` : `${DEFAULT_ASIDE_PX}px`,
        borderRight: '1px solid #eee',
        overflow: 'auto',
        minWidth: 0,
      }}
      aria-hidden={false}
    >
      <div style={{ padding: 12 }}>
        <div style={{ color: '#666', fontSize: 13 }}></div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 8,
          padding: 8,
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          background: '#f9fafb',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            title={searchQuery ? `Поиск: ${searchQuery}` : 'Поиск'}
            onClick={openSearchModal}
            style={searchQuery ? sidebarActiveActionButtonStyle : sidebarActionButtonStyle}
            aria-label="Поиск"
          >
            <IoSearchOutline size={21} />
            {searchQuery && (
              <span style={{
                position: 'absolute',
                top: 5,
                right: 5,
                width: 7,
                height: 7,
                borderRadius: 4,
                background: '#2563eb',
              }} />
            )}
          </button>
          <WebchatFontScaleControl
            token={token}
            apiBase={API_BASE}
            buttonStyle={sidebarActionButtonStyle}
            activeButtonStyle={sidebarActiveActionButtonStyle}
          />
          <button
            type="button"
            title="Создать личный чат"
            onClick={() => runChatListAction('openPersonalRoomCreate')}
            style={{ ...sidebarActionButtonStyle, color: '#2563eb' }}
            aria-label="Создать личный чат"
          >
            <IoChatbubbleEllipsesOutline size={20} />
          </button>
          <button
            type="button"
            title="Создать группу"
            onClick={() => runChatListAction('openGroupRoomCreate')}
            style={{ ...sidebarActionButtonStyle, color: '#16a34a' }}
            aria-label="Создать группу"
          >
            <span style={{ position: 'relative', width: 22, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <IoPeopleOutline size={22} />
              <span style={{ position: 'absolute', right: -2, top: -6, fontSize: 13, lineHeight: 1, fontWeight: 800 }}>+</span>
            </span>
          </button>
          <button
            type="button"
            title="Пригласить в личный Telegram чат"
            onClick={() => runChatListAction('createTelegramPersonalInvite')}
            style={{ ...sidebarActionButtonStyle, color: '#229ED9' }}
            aria-label="Пригласить в личный Telegram чат"
          >
            <IoPaperPlaneOutline size={21} />
          </button>
          <button
            type="button"
            title="Пригласить в личный MAX чат"
            onClick={() => runChatListAction('createMaxPersonalInvite')}
            style={{ ...sidebarActionButtonStyle, color: '#111827' }}
            aria-label="Пригласить в личный MAX чат"
          >
            <span
              aria-hidden="true"
              style={{
                width: 23,
                height: 23,
                display: 'inline-block',
                backgroundImage: 'url(/images/max-logo.png)',
                backgroundSize: '170%',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }}
            />
          </button>
          <CrossChatEntry
            onOpenRoom={(roomValue) => {
              router.push(`/webchats/room/${encodeURIComponent(String(roomValue))}`);
            }}
            trigger={({ open, disabled, incomingCount, title }) => (
              <button
                type="button"
                onClick={open}
                disabled={disabled}
                title={title}
                style={{
                  ...sidebarActionButtonStyle,
                  color: '#7c3aed',
                  background: disabled ? '#f3f4f6' : '#fff',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.65 : 1,
                }}
                aria-label={title}
              >
                <IoBusinessOutline size={21} />
                {incomingCount > 0 && (
                  <span style={{
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
                  }}>
                    {incomingCount > 99 ? '99+' : incomingCount}
                  </span>
                )}
              </button>
            )}
          />
          <button
            type="button"
            title={showAllPinsView ? 'Вернуться к чату' : 'Все закрепы'}
            onClick={() => setShowAllPinsView((v) => !v)}
            style={showAllPinsView ? sidebarActiveActionButtonStyle : sidebarActionButtonStyle}
            aria-label={showAllPinsView ? 'Вернуться к чату' : 'Открыть все закрепы'}
          >
            <IoPinOutline size={20} />
          </button>
          <button
            type="button"
            title={chatListView === 'folders' ? 'Показать все чаты одним списком' : 'Показать чаты по папкам'}
            onClick={toggleChatListView}
            style={chatListView === 'folders' ? sidebarActiveActionButtonStyle : sidebarActionButtonStyle}
            aria-label={chatListView === 'folders' ? 'Показать все чаты одним списком' : 'Показать чаты по папкам'}
          >
            {chatListView === 'folders'
              ? <IoListOutline size={20} />
              : <IoFolderOpenOutline size={20} />}
          </button>
          </div>
        </div>
        {searchModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Поиск чатов и сообщений"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSearchModalOpen(false);
            }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10000,
              background: 'rgba(15,23,42,0.35)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              paddingTop: 90,
            }}
          >
            <div
              style={{
                width: 'min(520px, calc(100vw - 32px))',
                background: '#fff',
                borderRadius: 14,
                boxShadow: '0 18px 50px rgba(15,23,42,0.25)',
                border: '1px solid rgba(229,231,235,0.95)',
                padding: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Поиск</div>
                <button
                  type="button"
                  onClick={() => setSearchModalOpen(false)}
                  aria-label="Закрыть поиск"
                  style={{ ...sidebarActionButtonStyle, width: 34, height: 34, borderRadius: 9 }}
                >
                  <IoCloseOutline size={22} />
                </button>
              </div>
              <input
                autoFocus
                placeholder="Введите текст для поиска"
                style={{
                  width: '100%',
                  height: 42,
                  padding: '0 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 10,
                  outline: 'none',
                  background: '#fff',
                  fontSize: 15,
                  boxSizing: 'border-box',
                }}
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitSearch();
                  if (event.key === 'Escape') setSearchModalOpen(false);
                }}
              />
              <label className="webchat-search-scope" style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, color: '#374151', fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={searchEverywhere}
                  onChange={(event) => setSearchEverywhere(event.target.checked)}
                  style={{ width: 17, height: 17, accentColor: '#2563eb' }}
                />
                <span>Везде</span>
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={clearSearch}
                  style={{ ...sidebarActionButtonStyle, width: 'auto', padding: '0 12px' }}
                >
                  Очистить
                </button>
                <button
                  type="button"
                  onClick={submitSearch}
                  style={{
                    ...sidebarActionButtonStyle,
                    width: 'auto',
                    padding: '0 14px',
                    border: '1px solid #2563eb',
                    background: '#2563eb',
                    color: '#fff',
                  }}
                >
                  Искать
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
        <ChatList
          searchQuery={searchQuery}
          searchEverywhere={searchEverywhere}
          roomId={kind === 'room' ? id : null}
          chatId={kind === 'boss' ? id : null}
          maxId={kind === 'max' ? id : null}
          telegramId={kind === 'telegram' ? id : null}
          listView={chatListView}
          onMessageClick={handleMessageClick}
          onActionsReady={(actions) => {
            chatListActionsRef.current = actions;
          }}
        />
    </aside>


    {/* <SocketProvider>
      <ChatLayout 
        roomId={roomId}
        chatId={chatId}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      >

    <div style={{ display: 'flex', height: '100%' }}>   */}


      {/* Ресайзер — узкая полоса, которую можно перетаскивать */}
      <div
        className="webchat-resizer"
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        onPointerDown={onResizerPointerDown}
        onKeyDown={onResizerKeyDown}
        onDoubleClick={onResizerDoubleClick}
        title="Перетащите, чтобы изменить ширину. Стрелки влево/вправо для тонкой подстройки. Двойной клик — сброс."
        style={{
          width: 10,
          cursor: 'col-resize',
          background: 'transparent',
          display: 'flex',
          alignItems: 'stretch',
        }}
      >
        {/* видимый хит-таргет - тонкая линия в центре */}
        <div style={{ margin: 'auto 0', width: 2, background: '#e5e7eb', borderRadius: 2, alignSelf: 'stretch' }} />
      </div>




      {/* MAIN */}
        <main ref={mainRef} className="webchat-main"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}>
          {showAllPinsView ? (
            <AllPinsView
              token={token}
              currentUserId={user?.id}
              apiBase={API_BASE}
              onOpenRoom={(roomId, messageId) => {
                const targetRoomId = Number(roomId);
                const targetMessageId = Number(messageId);
                const isCurrentRoom = String(kind) === 'room' && Number(id) === targetRoomId;
                // Если это уже открытый чат — не делаем router.push, прыгаем сразу.
                if (isCurrentRoom && targetMessageId > 0) {
                  setShowAllPinsView(false);
                  void runPinnedTargetJump(targetMessageId);
                  return;
                }

                if (Number(messageId) > 0) {
                  try {
                    sessionStorage.setItem(
                      'orderSpace:openPinnedTarget',
                      JSON.stringify({
                        chatKind: 'room',
                        chatId: targetRoomId,
                        messageId: targetMessageId,
                      })
                    );
                  } catch {
                    // ignore storage errors
                  }
                }
                setShowAllPinsView(false);
                router.push(`/webchats/room/${encodeURIComponent(String(targetRoomId))}`);
              }}
            />
          ) : (
            <>

          {/* HEADER — одна строка, поделена пополам */}
          <div className="webchat-room-header" style={{ padding: 12, borderBottom: '1px solid #eee', flex: '0 0 auto' }}>
          {isBossFolderRoot ? (
            <div className="text-base font-semibold text-gray-800">Сотрудники</div>
          ) : (
            <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push('/webchats')}
              className="webchat-mobile-back"
              aria-label="Вернуться к списку чатов"
              title="Назад к чатам"
            >
              <IoChevronBack size={23} />
            </button>
            {kind === 'boss' && bossFolderMode && activeBossFolder && (
              <button
                type="button"
                onClick={() => {
                  setActiveBossFolder(null);
                  setPerformanceExpanded(false);
                  setMessages([]);
                  messagesRef.current = [];
                  setHasMore(false);
                }}
                className="h-9 w-9 shrink-0 inline-flex items-center justify-center border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                style={{
                  width: 36,
                  height: 36,
                  minWidth: 36,
                  padding: 0,
                  margin: 0,
                  border: '1px solid #1d4ed8',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  lineHeight: 1,
                }}
                title="Назад к сотрудникам"
                aria-label="Назад к сотрудникам"
              >
                <IoChevronBack size={20} />
              </button>
            )}
            <div className="min-w-0 flex-1">
            <PinnedBar
              pinnedMap={pinnedMap}
              messagesById={messagesById}
              chatUsers={chatUsers}
              externalParticipants={roomExternalParticipants}
              chatName={activeBossFolder?.name || personalPartnerName || chatName}
              titleAction={(
                <button
                  type="button"
                  onClick={cycleAudioPlaybackRate}
                  title="Скорость голосовых сообщений"
                  aria-label={`Скорость голосовых сообщений ${audioPlaybackRate.toFixed(2)}`}
                  style={{
                    flexShrink: 0,
                    minWidth: 42,
                    height: 24,
                    margin: 0,
                    padding: '0 7px',
                    border: '1px solid #1d4ed8',
                    borderRadius: 12,
                    background: '#2563eb',
                    color: '#ffffff',
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: 1,
                    cursor: 'pointer',
                  }}
                >
                  {audioPlaybackRate.toFixed(2)}×
                </button>
              )}
              userColor="#6b7280"
              onJumpToMessage={handlePinnedHeaderClick}
              displayedPinnedId={displayedPinnedId}
              pinnedPanelOpen={pinnedPanelOpen}
              openPinnedPanel={openPinnedPanel}     // <-- новый пропс
              closePinnedPanel={closePinnedPanel}   // <-- новый пропс
              loadingPinnedId={jumpingPinnedId}
              disabled={Boolean(jumpingPinnedId)}
            />
            </div>
            {isRoomGroupOwner && (
              <>
                <button
                  type="button"
                  onClick={() => setRoomParticipantsModalOpen(true)}
                  title="Участники группы"
                  aria-label="Участники группы"
                  className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                  style={{ margin: 0, padding: 0 }}
                >
                  <IoPeopleCircleOutline size={22} />
                </button>
              </>
            )}
            </div>
          )}
          </div>

          <DropZone
            onFiles={handleDropFiles}
            multiple={true}
            disabled={isBossFolderRoot}
            className="chat-dropzone-wrapper flex min-h-0 flex-1 flex-col"
          >

          {/* messages container (one- or two-column depending on pinnedPanelOpen) */}
          <div
            className="webchat-conversation-surface flex-1 overflow-hidden flex flex-col bg-[#ede8e8]"
            style={{ backgroundColor: '#ede8e8', color: '#111827' }}
          >
            {/* wrapper for either single-column messages or 2-column split */}
            <div
              className={pinnedPanelOpen && !isBossFolderRoot ? 'flex h-full min-w-0 gap-4 p-3' : 'h-full min-w-0 p-3'}
            >
              {/* LEFT: messages column */}
              <div className="flex min-w-0 flex-1 flex-col h-full">
                {!isBossFolderRoot && kind === 'boss' && bossFolderMode && activeBossFolder && (
                  <div className="mb-2 shrink-0 overflow-hidden border border-gray-200 bg-white shadow-sm">
                    <button
                      type="button"
                      onClick={() => setPerformanceExpanded((value) => !value)}
                      className="flex min-h-11 w-full items-center justify-between bg-gray-50 px-3 py-2 text-left text-gray-900 hover:bg-gray-100"
                      style={{ margin: 0, lineHeight: 1.25 }}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        Производительность
                        {activeBossFolder.trendUp ? (
                          <IoTrendingUp size={17} className="text-green-600" />
                        ) : (
                          <IoTrendingDown size={17} className="text-red-600" />
                        )}
                      </span>
                      {performanceExpanded ? <IoChevronUp size={18} /> : <IoChevronDown size={18} />}
                    </button>
                    {performanceExpanded && (
                      <div className="max-h-60 overflow-auto px-3 py-1">
                        {(activeBossFolder.performanceRows || []).map((row) => (
                          <div
                            key={row.key}
                            className="flex items-center justify-between border-b border-gray-100 py-1.5 text-sm last:border-b-0"
                          >
                            <span className="text-gray-600">{row.label}</span>
                            <span className="font-semibold text-gray-900">{Number(row.count) || 0}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div
                  ref={containerRef}
                  className="chat-messages-container webchat-messages flex-1 overflow-auto p-3"
                  style={{
                    visibility: initialScrollReady ? 'visible' : 'hidden',
                    overflowAnchor: 'none',
                  }}
                >
                  <div ref={messagesContentRef} className="flex flex-col gap-2 pb-6">
                    {isBossFolderRoot ? (
                      <div className="mx-auto w-full max-w-4xl py-2">
                        {foldersLoading && <div className="text-sm text-gray-500">Загрузка сотрудников...</div>}
                        {!foldersLoading && bossFolders.length === 0 && (
                          <div className="text-sm text-gray-500">Пока нет сообщений для группировки.</div>
                        )}
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {bossFolders.map((folder) => (
                            <button
                              key={folder.userId}
                              type="button"
                              onClick={() => openBossFolder(folder)}
                              className="flex min-h-20 items-center gap-3 border border-gray-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
                              style={{ margin: 0 }}
                            >
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-blue-50 text-blue-600">
                                <IoFolderOpenOutline size={23} />
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-gray-900">
                                  {folder.name}
                                </span>
                                <span className="mt-1 block text-xs text-gray-500">
                                  {`${Number(folder.todayCount) || 0} за ${folder.dayLabel || ''} / ${Number(folder.monthCount) || 0} за ${folder.monthLabel || ''}`}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                    <>
                    {loading && <div>Загрузка сообщений...</div>}
                    {hasMore && (
                      <div className="text-center">
                        <button
                          type="button"
                          disabled={loadingOlder}
                          onClick={() => loadOlder().catch(err => console.warn('loadOlder error', err))}
                          className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs text-gray-600 shadow-sm hover:bg-gray-50 disabled:cursor-wait disabled:opacity-70"
                          style={{ margin: 0 }}
                        >
                          {loadingOlder ? 'Загрузка старых сообщений…' : 'Показать предыдущие сообщения'}
                        </button>
                      </div>
                    )}
                    {error && <div className="text-red-600">{error}</div>}

                    {messages.map(m => (
                      (() => {
                        const pinEntry = pinnedMap[m.id];
                        const pinOwnerId = String(pinEntry?.pinnedByUserId ?? pinEntry?.pinnedBy?.id ?? '');
                        const isPinnedMine = Boolean(pinEntry) && pinOwnerId && String(pinOwnerId) === String(user?.id ?? '');
                        return (
                      <MessageItem
                        key={m.id ?? m.createdAt}
                        message={m}
                        messagesById={messagesById}
                        isFresh={Boolean(freshMessageIds[String(m.id)])}
                        onSeenFresh={clearFreshMessageId}
                        messageStatus={getMessageStatus(m)}
                        currentUserId={user?.id}
                        currentUserName={user?.name}
                        currentChatKind={kind}
                        currentChatId={id}
                        isPersonalRoom={isPersonalRoom}
                        outgoingBubbleColor={outgoingBubbleColor}
                        onReply={handleReply}
                        onForward={openForwardModal}
                        forwardSelectionMode={forwardSelectionMode}
                        selectedForForward={forwardSelectedIds.has(getForwardMessageKey(m))}
                        onToggleForwardSelection={toggleForwardMessage}
                        onDelete={handleDelete}
                        onToggleReaction={toggleMessageReaction}
                        reactionEmojis={REACTION_EMOJIS}
                        audioPlaybackRate={audioPlaybackRate}
                        onRegisterAudioElement={registerAudioElement}
                        onAudioPlay={handleAudioPlay}
                        onAudioEnded={handleAudioEnded}
                        onTogglePin={handleTogglePin}
                        isPinned={Boolean(pinEntry)}
                        isPinnedMine={isPinnedMine}
                        userById={userMap[m.userId ?? m.User?.id] || chatUsers.find((chatUser) => String(chatUser?.id) === String(m.userId ?? m.User?.id))}
                        onEdit={onEditMessage}
                      />
                        );
                      })()
                    ))}

                    <div ref={bottomRef} />
                    </>
                    )}
                  </div>
                </div>
              </div>

              {/* RIGHT: pinned sidebar — видна только если pinnedPanelOpen */}

              {pinnedPanelOpen && !isBossFolderRoot && (
                <div className="flex-1 flex flex-col h-full">
                  <div className="w-full h-full bg-[#ede8e8] border border-gray-100 rounded p-2 shadow-sm flex flex-col">

                    {/* list container (scrollable) */}
                    <div ref={pinnedListContainerRef} className="overflow-auto divide-y divide-gray-100">
                      {Object.keys(pinnedMap).length === 0 && (
                        <div className="text-sm text-gray-500 p-3">Нет закреплённых сообщений</div>
                      )}

                      { /* подготовим упорядоченный массив pinned */ }
                      {(() => {
                        const raw = Object.values(pinnedMap || []);
                        // order by messageId desc (change if you want another order)
                        const ordered = raw.slice().sort((a, b) => {
                          const am = Number(a.messageId ?? a.message?.id ?? NaN);
                          const bm = Number(b.messageId ?? b.message?.id ?? NaN);
                          if (Number.isNaN(am) || Number.isNaN(bm)) return 0;
                          return am - bm;
                        });

                        

                        return ordered.map((p) => {
                          const rawMsgId = p.message?.id ?? p.messageId ?? null;
                          const sourceFromList = rawMsgId != null ? messagesById[String(rawMsgId)] : null;
                          const mergedMessage = p.message
                            ? { ...p.message, ...(sourceFromList || {}) }
                            : (sourceFromList || null);
                          const msg = mergedMessage ? { ...mergedMessage, pinnedByName: p.pinnedBy?.name } : null;
                          const msgId = msg?.id ?? p.messageId ?? null;
                          const isHighlighted = String(msgId) === String(pinnedPanelHighlightId);
                          const userById = userMap[msg.userId]

                          // console.log('userById = ', userById)

                          if (!msg || !msg.id) {
                            // fallback if full message not available
                            return (
                              <div key={`pin-fallback-${p.id}`} className={`p-3 ${isHighlighted ? 'bg-yellow-50' : ''}`}>
                                <div className="text-sm font-medium text-gray-800">Сообщение #{p.messageId}</div>
                                <div className="text-xs text-gray-500 mt-1">{p.pinnedBy?.name ?? '—'} · {formatChatDateTime(p.pinnedAt)}</div>
                              </div>
                            );
                          }

                          // wrapper to catch plain clicks (but not clicks on inner buttons/links)
                          return (
                            <div
                              key={`pin-${p.id}`}
                              // ref={el => { if (msg && msg.id) pinnedItemRefs.current[String(msg.id)] = el; }}
                              ref={el => { 
                                // очистка: если el === null, удаляем
                                if (!msg || !msg.id) return;
                                if (el) pinnedItemRefs.current[String(msg.id)] = el;
                                else delete pinnedItemRefs.current[String(msg.id)];
                              }}
                              className={`${isHighlighted ? 'bg-yellow-50' : ''} hover:bg-gray-50`}
                              onClick={(e) => {
                                const tag = e.target?.tagName?.toLowerCase?.();
                                if (tag === 'button' || tag === 'a' || e.target?.closest?.('button, a')) return;
                                handlePinnedHeaderClick(msg.id);
                              }}
                            >
                              <MessageItem
                                message={msg}
                                messagesById={messagesById}
                                isFresh={Boolean(freshMessageIds[String(msg.id)])}
                                onSeenFresh={clearFreshMessageId}
                                messageStatus={getMessageStatus(msg)}
                                currentUserId={user?.id}
                                currentUserName={user?.name}
                                currentChatKind={kind}
                                currentChatId={id}
                                isPersonalRoom={isPersonalRoom}
                                outgoingBubbleColor={outgoingBubbleColor}
                                onReply={handleReply}
                                onForward={openForwardModal}
                                forwardSelectionMode={forwardSelectionMode}
                                selectedForForward={forwardSelectedIds.has(getForwardMessageKey(msg))}
                                onToggleForwardSelection={toggleForwardMessage}
                                onToggleReaction={toggleMessageReaction}
                                reactionEmojis={REACTION_EMOJIS}
                                audioPlaybackRate={audioPlaybackRate}
                                onTogglePin={handleTogglePin}
                                isPinned={true}
                                isPinnedMine={String(p?.pinnedByUserId ?? p?.pinnedBy?.id ?? '') === String(user?.id ?? '')}
                                userById={userById}
                              />
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>



          {/* Кнопка "вниз" — позиционируется поверх контейнера внизу-справа */}
          {showScrollDown && !isBossFolderRoot && (
            <button
              onClick={() => scrollToBottom("smooth")}
              aria-label="Прокрутить вниз"
              className="absolute right-9 bottom-12 z-50 p-1 rounded-full bg-white shadow-md hover:scale-105 transition-transform"
            >
              <IoArrowDownCircleOutline size={28} color="#007AFF" />
            </button>
          )}        

          {!isBossFolderRoot && (
          <>
            {/* footer */}
            <ChatFooter
              text={text}
              setText={setText}
              sendMessage={sendMessage}
              onFile={onFile}
              onSendVoice={onSendVoice}
              sending={sending}
              isUploading={isUploading}
              replyDraft={replyDraft}
              onCancelReply={onCancelReply}
              editingMessage={editingMessage}
              cancelEdit={cancelEdit} 
            />
          </>
          )}
          </DropZone>
            </>
          )}

        
          <RoomParticipantsModal
            visible={roomParticipantsModalOpen}
            apiBase={API_BASE}
            token={token}
            roomId={id}
            ownerUserId={Number(roomCreatorUserId || 0)}
            currentUsers={Array.isArray(chatUsers) ? chatUsers : []}
            externalParticipants={roomExternalParticipants}
            busy={roomParticipantsSaving}
            onClose={closeRoomParticipantsModal}
            onSave={saveRoomParticipants}
            onExternalParticipantRemoved={(participantId, externalParticipants) => {
              if (Array.isArray(externalParticipants)) setRoomExternalParticipants(externalParticipants);
              else setRoomExternalParticipants((prev) => (Array.isArray(prev) ? prev : []).filter((item) => Number(item?.id || 0) !== Number(participantId)));
            }}
          />
          {forwardSelectionMode && (
            <div className="fixed inset-x-0 bottom-0 z-[80] flex items-center justify-center gap-4 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.12)]">
              <button
                type="button"
                onClick={cancelForwardSelection}
                disabled={forwardBusy}
                className="flex h-11 w-11 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                aria-label="Отменить выбор"
              >
                <span aria-hidden="true" style={{ display: 'block', fontSize: 32, lineHeight: '30px', fontWeight: 400, color: '#475569' }}>×</span>
              </button>
              <div className="min-w-28 text-center text-sm font-semibold text-gray-800">
                Выбрано: {forwardSelectedIds.size}
              </div>
              <button
                type="button"
                onClick={() => setForwardModalOpen(true)}
                disabled={forwardBusy || forwardSelectedIds.size === 0}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300"
                aria-label="Переслать выбранные сообщения"
              >
                <span aria-hidden="true" style={{ display: 'block', fontSize: 25, lineHeight: '25px', fontWeight: 700, color: '#ffffff', transform: 'translateX(1px)' }}>➤</span>
              </button>
            </div>
          )}
          <ForwardToRoomModal
            visible={forwardModalOpen}
            apiBase={API_BASE}
            token={token}
            busy={forwardBusy}
            title={`Переслать (${forwardSelectedIds.size})`}
            onClose={closeForwardModal}
            onSelectRoom={forwardDraftToRoom}
          />

        </main>

    {/* </div>
      </ChatLayout>
    </SocketProvider>       */}

    </div>

  );


}


const MessageItem = React.memo(function MessageItem({ message, messagesById = {}, isFresh = false, onSeenFresh = null, messageStatus, currentUserId, currentUserName = '', currentChatKind = null, currentChatId = null, onReply = null,
  onForward = null, onOpenPinned = null, onTogglePin = null, onToggleReaction = null, reactionEmojis = [],
  forwardSelectionMode = false, selectedForForward = false, onToggleForwardSelection = null,
  audioPlaybackRate = 1.0, onRegisterAudioElement = null, onAudioPlay = null, onAudioEnded = null,
  outgoingBubbleColor = OUTGOING_BUBBLE_COLOR_DEFAULT,
  isPinned = false, isPinnedMine = true, isPersonalRoom = false, userById, onDelete = null, onEdit = null }) {

  const STATIC_BASE_URL = process.env.STATIC_BASE_URL;
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';


  // определяем откуда брать id комнаты/чата:
  // предпочтение — props currentChat*, затем поля в message (message.roomId / message.chatId)
  const roomId = currentChatKind === 'room' ? currentChatId : (message.roomId ?? null);
  const chatId = currentChatKind === 'boss' ? currentChatId : (message.chatId ?? null);

  const kind = currentChatKind || (roomId ? 'room' : (chatId ? 'boss' : (message.kind ?? null)));
  const audioRef = useRef(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = audioPlaybackRate;
    }
  }, [audioPlaybackRate]);


  // --------------- helper  ПОЛУЧЕНИЕ ПУТИ ДЛЯ IMAGE ---------------------- //
  function getImageSrc(messageMediaUrl) {
    if (!messageMediaUrl) return '/placeholder.jpg';

    // 1) если уже относительный — возвращаем как есть (лучше всего для next/image)
    if (messageMediaUrl.startsWith('/')) return messageMediaUrl;

    // 2) если это абсолютный URL, и он принадлежит нашему STATIC_BASE_URL — вернём относительный путь
    try {
      const u = new URL(messageMediaUrl);
      if (STATIC_BASE_URL) {
        const base = new URL(STATIC_BASE_URL);
        if (u.hostname === base.hostname) return u.pathname;
      }
      // 3) иначе — внешний хост, вернём абсолютный URL (убедись, что он разрешён в next.config.js)
      return messageMediaUrl;
    } catch (e) {
      console.warn(e)
      return messageMediaUrl;
    }
  }

  const bridgePhone = String(message.User?.phone || message.user?.phone || '').trim();
  const bridgeMatch = /^xbridge:([^:]+):(.+)$/i.exec(bridgePhone);
  const bridgeDomain = String(bridgeMatch?.[1] || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/[^a-z0-9.-]/gi, '');
  const bridgeCompanyIconSrc = bridgeDomain === 'orderspace.ru' || bridgeDomain.endsWith('.orderspace.ru')
    ? '/images/company-icons/orderspace-adaptive-icon.png'
    : bridgeDomain === 'buhfinancevl.ru' || bridgeDomain.endsWith('.buhfinancevl.ru')
      ? '/images/company-icons/buhfinance-adaptive-icon.png'
      : null;
  const externalAuthorKind = String(message.externalAuthorKind || '').trim().toLowerCase() || (bridgeMatch ? 'cross' : '');
  const isExternalAuthor = Boolean(externalAuthorKind);
  const senderId = message.userId ?? message.User?.id ?? null;
  const author = isExternalAuthor
    ? (
        message.externalAuthorName ||
        message.externalAuthorId ||
        (bridgeMatch ? (message.User?.name || `${bridgeMatch[2]} @${bridgeMatch[1]}`) : '') ||
        (externalAuthorKind === 'cross' ? 'Сотрудник другой компании' : externalAuthorKind === 'max' ? 'MAX пользователь' : 'Telegram пользователь')
      )
    : (message.User?.name || userById?.name || (String(senderId) === String(currentUserId) ? currentUserName : '') || 'System');

  // определяем, моё ли сообщение. Внешний участник может хранить userId пригласившего,
  // но визуально это всегда входящее сообщение от клиента.
  const isMine = !isExternalAuthor && String(senderId) === String(currentUserId);
  // временное сообщение (temp) или пометка отправки
  const isTemp = typeof message.id === 'string' && message.id.startsWith('temp-');
  const isSending = !!message.sending || isTemp;

  // media src
  const src = getImageSrc(message.mediaUrl);
  const audioSrc = useMemo(() => {
    if (message?.type !== 'audio' || !src || !src.startsWith('/uploads/')) return src;
    const apiBase = String(API_BASE_URL || '').replace(/\/$/, '');
    return `${apiBase}/uploadfiles/audio-compatible?path=${encodeURIComponent(src)}`;
  }, [API_BASE_URL, message?.type, src]);
  const resolvedFileName = useMemo(() => {
    const raw = safeDecodeFilename(
      message?.displayFileName ??
      message?.originalFileName ??
      message?.fileName ??
      message?.attachments?.file?.name ??
      message?.attachments?.document?.name ??
      message?.attachments?.video?.filename ??
      message?.attachments?.image?.filename ??
      ''
    ).trim();
    if (!raw) return '';

    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(\.[a-z0-9]+)?$/i.test(raw);
    if (!uuidLike) return raw;

    const fallbackFromUrl = safeDecodeFilename((message?.mediaUrl || '').split('/').pop() || '');
    return fallbackFromUrl || raw;
  }, [message]);
  const imageDescription = useMemo(() => {
    if (message?.type !== 'image' || kind !== 'boss') return '';

    const content = getReadableMessageText(message, '');
    if (content) return content;

    const legacyLog = safeDecodeFilename(message?.fileName ?? '').trim();
    return legacyLog.includes('|') ? legacyLog : '';
  }, [kind, message]);
  const resolvedFileSize = useMemo(() => {
    const candidates = [
      message?.fileSize,
      message?.size,
      message?.attachments?.file?.size,
      message?.attachments?.document?.size,
      message?.attachments?.video?.size,
      message?.attachments?.image?.size,
    ];
    for (const v of candidates) {
      const num = Number(v);
      if (Number.isFinite(num) && num > 0) return num;
    }
    return null;
  }, [message]);
  const isFileAttachment = Boolean(resolvedFileName || message.fileName)
    && message.type !== 'audio'
    && message.type !== 'image'
    && message.type !== 'video';

  // Единый вид пузырьков с Telegram/MAX чатами.
  const isCompactMediaBubble = message.type === 'audio' || isFileAttachment;
  const bubbleCommon = `inline-block ${isCompactMediaBubble ? 'w-full py-1' : 'py-2'} overflow-hidden px-[10px] break-words`;
  const mineBubble = 'text-gray-900';
  const otherBubble = 'bg-white text-gray-900';



  // max width (у тебя ранее было maxWidth: 560)
  const maxWidthClass = isCompactMediaBubble ? 'w-full max-w-[576px]' : 'max-w-[560px]';
  const freshBubbleStyle = isFresh
    ? {
        boxShadow: '0 0 0 2px rgba(245, 158, 11, 0.85), 0 8px 22px rgba(245, 158, 11, 0.30)',
        backgroundColor: 'rgba(255, 229, 153, 0.62)',
        transition: 'background-color 220ms ease, box-shadow 220ms ease',
      }
    : undefined;
  const bubbleStyle = {
    border: '0.5px solid rgba(107, 114, 128, 0.55)',
    borderRadius: isMine ? '18px 18px 0 18px' : '18px 18px 18px 0',
    boxShadow: 'none',
    ...(isMine ? { backgroundColor: normalizeHexColor(outgoingBubbleColor) || OUTGOING_BUBBLE_COLOR_DEFAULT } : {}),
    ...(freshBubbleStyle || {}),
  };

  const transcriptionStatus = message.transcriptionStatus || null;
  const transcriptionText = message.transcriptionText || null;
  const showTranscriptionToast = (event) => {
    event.stopPropagation();
    const hasText = typeof transcriptionText === 'string' && transcriptionText.trim().length > 0;
    if (transcriptionStatus === 'pending' || transcriptionStatus === 'processing') {
      toast.info('Транскрибация в обработке…', { autoClose: 2000 });
    } else if (transcriptionStatus === 'failed') {
      toast.error('Транскрибация не удалась.', { autoClose: 2000 });
    } else if (hasText) {
      toast(<div style={{ whiteSpace: 'pre-wrap', maxWidth: 600 }}>{transcriptionText}</div>, { autoClose: 20000 });
    } else if (transcriptionStatus === 'done') {
      toast.info('Транскрибация не существует.', { autoClose: 2000 });
    } else {
      toast.info('Транскрибация недоступна.', { autoClose: 2000 });
    }
  };

  // ----------------- helper Get filesize --------------------------- //
  function formatFileSize(bytes) {
    if (bytes == null || Number.isNaN(Number(bytes))) return '';
    if (Number(bytes) === 0) return '0 B';
    const safeBytes = Number(bytes);
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(safeBytes) / Math.log(k));
    const value = (safeBytes / Math.pow(k, i)).toFixed(2);
    return `${value} ${sizes[i]}`;
  }

  function getAttachmentKindLabel(message) {
    const type = String(message?.type ?? '').toLowerCase();
    const mime = String(message?.mimeType ?? '').toLowerCase();
    const name = String(message?.displayFileName ?? message?.fileName ?? '').toLowerCase();

    if (
      type === 'video' ||
      mime.startsWith('video/') ||
      /\.(mp4|mov|avi|mkv|webm|m4v|3gp)$/.test(name)
    ) return 'Видео файл';

    if (
      type === 'audio' ||
      mime.startsWith('audio/') ||
      /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/.test(name)
    ) return 'Аудио файл';

    if (
      type === 'document' ||
      /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|rtf|csv)$/.test(name)
    ) return 'Документ';

    return 'Файл';
  }

  // Функция для нормализации кирилицы в названиях файлов
  function safeDecodeFilename(name){
    if (!name) return '';
    try {
      let s = name.replace(/\+/g, ' ');
      for (let i = 0; i < 3; i++) {
        if (!/%[0-9A-Fa-f]{2}/.test(s)) break;
        const decoded = decodeURIComponent(s);
        if (decoded === s) break;
        s = decoded;
      }
      return s;
    } catch (err) {
      console.warn(err);
      return name;
    }
  }




  // ----------------------------- Меню правой кнопкой ----------------------------- //

  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const messageRootRef = useRef(null);
  const messageLongPressRef = useRef(null);
  const suppressMessageClickRef = useRef(false);

  useEffect(() => {
    // если меню открыто и пользователь кликает в любое место — закрыть
    const onGlobalClick = () => {
      if (!menuVisible) return;
      // если клик вне нашей карточки и вне меню — закроем
      // menu itself stops propagation, so this acts as outside click
      setMenuVisible(false);
    };
    document.addEventListener('click', onGlobalClick);
    return () => document.removeEventListener('click', onGlobalClick);
  }, [menuVisible]);

  const onContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // позиционируем меню у курсора (немного смещаем)
    const x = e.clientX + 6;
    const y = e.clientY + 6;
    setMenuPos({ x, y });
    setMenuVisible(true);
  };

  const cancelMessageLongPress = () => {
    if (!messageLongPressRef.current) return;
    clearTimeout(messageLongPressRef.current.timer);
    messageLongPressRef.current = null;
  };

  const onMessagePointerDown = (event) => {
    if (event.pointerType === 'mouse') return;
    cancelMessageLongPress();
    const startX = event.clientX;
    const startY = event.clientY;
    const timer = window.setTimeout(() => {
      messageLongPressRef.current = null;
      suppressMessageClickRef.current = true;
      window.setTimeout(() => { suppressMessageClickRef.current = false; }, 1000);
      onContextMenu({
        clientX: startX,
        clientY: startY,
        preventDefault() {},
        stopPropagation() {},
      });
    }, 500);
    messageLongPressRef.current = { timer, startX, startY };
  };

  const onMessagePointerMove = (event) => {
    const pending = messageLongPressRef.current;
    if (!pending) return;
    if (Math.abs(event.clientX - pending.startX) > 10 || Math.abs(event.clientY - pending.startY) > 10) {
      cancelMessageLongPress();
    }
  };

  // handlers for menu actions
  const handleCopy = async () => {
    try {
      const text = getReadableMessageText(message, '');
      if (!text) {
        // optionally copy file URL or media text
        // for non-text messages, copy mediaUrl if exists
        const media = message.mediaUrl ?? message.media_url ?? message.mediaUrlAttachment ?? '';
        if (media) {
          await navigator.clipboard.writeText(media);
          toast?.info('Ссылка в буфер обмена');
          return;
        }
        toast?.info('Нет текста для копирования');
        return;
      }
      await navigator.clipboard.writeText(String(text));
      toast?.info('Скопировано');
    } catch (e) {
      console.warn('copy failed', e);
      toast?.error?.('Не удалось скопировать');
    }
  };

  const handlePaste = async () => {
    try {
      if (!navigator.clipboard) {
        toast?.info?.('Буфер обмена недоступен');
        return;
      }
      const text = await navigator.clipboard.readText();
      // вызываем callback родителя, чтобы вставить в input (ChatFooter)
      if (typeof onReply === 'function') {
        // some apps allow paste directly into reply; but here we forward paste text
        onReply({ type: 'paste', text, message }); // условный контракт
      } else {
        // fallback: show toast
        toast?.info?.('Текст из буфера: ' + (text?.slice(0, 200) ?? ''));
      }
    } catch (e) {
      console.warn('paste failed', e);
      toast?.error?.('Ошибка буфера обмена');
    }
  };

  const handleShare = async () => {
    try {
      const text = getReadableMessageText(message, '');
      const isAbsolute = typeof src === 'string' && /^https?:\/\//i.test(src);
      const fileUrl = isAbsolute ? src : `${STATIC_BASE_URL}${src || ''}`;
      const hasFile = Boolean(fileUrl && !fileUrl.endsWith('placeholder.jpg') && (message.mediaUrl || message.fileName));

      if (hasFile) {
        const fileName = safeDecodeFilename(
          resolvedFileName ||
          message.fileName ||
          String(fileUrl).split('?')[0].split('/').pop() ||
          `message-${message.id || Date.now()}`
        );
        let blob = null;
        try {
          const response = await fetch(fileUrl, { credentials: 'include' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          blob = await response.blob();
        } catch (fetchErr) {
          console.warn('share file fetch failed', fetchErr);
        }

        if (blob && typeof File !== 'undefined') {
          const file = new File([blob], fileName, { type: blob.type || message.mimeType || 'application/octet-stream' });
          if (navigator.share && navigator.canShare?.({ files: [file] })) {
            await navigator.share({
              title: fileName,
              text: text || undefined,
              files: [file],
            });
            return;
          }
        }

        if (navigator.share) {
          await navigator.share({
            title: fileName,
            text: text || fileName,
            url: fileUrl,
          });
          return;
        }

        await navigator.clipboard.writeText(fileUrl);
        toast?.info?.('Ссылка на файл скопирована в буфер');
        return;
      }

      if (navigator.share) {
        await navigator.share({
          title: 'Сообщение',
          text: text || window.location.href + `#msg-${message.id}`,
        });
      } else {
        await navigator.clipboard.writeText(text || window.location.href + `#msg-${message.id}`);
        toast?.info?.(text ? 'Текст скопирован в буфер' : 'Ссылка скопирована в буфер');
      }
    } catch (e) {
      console.warn('share failed', e);
      toast?.error?.('Не удалось поделиться');
    }
  };


  const handleSave = async () => {
    try {
      const isAbsolute = typeof src === 'string' && /^https?:\/\//i.test(src);
      const fileUrl = isAbsolute ? src : `${STATIC_BASE_URL}${src || ''}`;
      if (!fileUrl || fileUrl.endsWith('placeholder.jpg')) {
        toast?.info?.('Нет файла для сохранения');
        return;
      }

      const guessedName = resolvedFileName || message.fileName || `message-${message.id || Date.now()}`;
      const fileName = safeDecodeFilename(guessedName);
      const supportsSavePicker = typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
      const localUploadPath = typeof src === 'string' && /^\/uploads\//i.test(src)
        ? src
        : null;

      const triggerDownload = (href, name, openInNewTab = false) => {
        const a = document.createElement('a');
        a.href = href;
        if (name) a.download = name;
        if (openInNewTab) a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        a.remove();
      };

      if (localUploadPath) {
        const downloadUrl = `${API_BASE_URL}/uploadfiles/download?path=${encodeURIComponent(localUploadPath)}&name=${encodeURIComponent(fileName)}`;
        triggerDownload(downloadUrl, '');
        toast?.success?.('Скачивание началось');
        return;
      }

      try {
        const response = await fetch(fileUrl, { credentials: 'include' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (supportsSavePicker) {
          try {
            const fileHandle = await window.showSaveFilePicker({
              id: 'webchats-save-file',
              suggestedName: fileName,
            });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            toast?.success?.('Файл сохранен');
            return;
          } catch (pickerErr) {
            if (pickerErr?.name === 'AbortError') {
              toast?.info?.('Сохранение отменено');
              return;
            }
          }
        }
        const objectUrl = URL.createObjectURL(blob);
        triggerDownload(objectUrl, fileName);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
        toast?.success?.('Скачивание началось');
      } catch (downloadError) {
        console.warn('direct file download failed, opening source URL', downloadError);
        triggerDownload(fileUrl, '', true);
        toast?.info?.('Файл открыт в новой вкладке. Сохраните его через меню браузера');
      }
    } catch (e) {
      console.warn('save failed', e);
      toast?.error?.('Не удалось сохранить файл');
    }
  };

  const handleOpenPinned = () => {
    if (typeof onOpenPinned === 'function') onOpenPinned({ message });
  };

  const handleTogglePin = () => {
    if (typeof onTogglePin === 'function') onTogglePin({ message });
  };

  

  const handleReply = () => {
    if (typeof onReply === 'function') {
      onReply({ message });
    }
  };

  const handleForward = () => {
    if (typeof onForward === 'function') {
      onForward({ message });
    }
  };


  const handleDelete = () => {
    if (typeof onDelete === 'function') {
      onDelete({ message });
    }
  };

  const handleReaction = (emoji) => {
    if (!emoji || typeof onToggleReaction !== 'function') return;
    onToggleReaction({ message, emoji });
  };

  const activeReactionsByMe = (Array.isArray(message?.reactions) ? message.reactions : [])
    .filter((reaction) => Boolean(reaction?.reactedByMe))
    .map((reaction) => String(reaction?.emoji || ''))
    .filter(Boolean);
  const isExternalContextMenu = kind === 'telegram' || kind === 'max';


  // determine disabled flags
  const hasText = Boolean(getReadableMessageText(message, ''));
  const editId = message.userId ?? message.User?.id ?? null;
  const isMineMessage = !isExternalAuthor && String(editId) === String(currentUserId);
  const disabled = {
    copy: !hasText && !(message.mediaUrl || message.fileName),
    paste: !navigator.clipboard,
    forward: !hasText && !(message.mediaUrl || message.fileName),
    share: !navigator.share && !(window && window.location),
    save: !(message.mediaUrl || message.fileName),
    edit: !isMineMessage
  };


  // Форматируем текст последнего сообщения
  const formatReplyMessage = (msg) => {
    if (!msg) return null;

    const type = msg.type ?? "text";
    const text = getReadableMessageText(msg, "");
    const fileName = safeDecodeFilename(msg.displayFileName ?? msg.originalFileName ?? msg.fileName ?? "") ?? "";

    switch (type) {
      case "text":
        return <span className="text-gray-700">{text}</span>;

      case "image":
        return (
          <span className="flex items-center gap-1 text-gray-500">
            <IoImageOutline size={16} color={userColor} /> Фото
          </span>
        );

      case "file":
        return (
          <span className="flex items-center gap-1 text-gray-500">
            <IoAttachOutline size={16} color={userColor} /> {fileName || "Файл"}
          </span>
        );

      case "video":
        return (
          <span className="flex items-center gap-1 text-gray-500">
            <IoVideocamOutline size={16} color={userColor} /> Видео
          </span>
        );

      case "document":
        return (
          <span className="flex items-center gap-1 text-gray-500">
            <IoDocumentOutline size={16} color={userColor} /> Документ
          </span>
        );

      case "audio":
        if (fileName?.toLowerCase().startsWith("record"))
          return (
            <span className="flex items-center gap-1 text-gray-500">
              <IoMicOutline size={16} color={userColor} /> Голосовое сообщение
            </span>
          );
        return (
          <span className="flex items-center gap-1 text-gray-500">
            <IoMusicalNoteOutline size={16} color={userColor} /> Аудио
          </span>
        );

      default:
        return (
          <span className="flex items-center gap-1 text-gray-500">
            <IoAttachOutline size={16} color={userColor} /> Вложение
          </span>
        );
    }
  };



  // --------------------- расскраски ---------------------------------- //

  const PALETTE = [
    '#0198fdff', '#13fc02ff', '#fc0408ff', '#ff7f00',
    '#7a02faff', '#f730d3ff', '#fb9a99', '#28f5bbff',
    '#29e0f8ff', '#fce703ff'
  ];

  function hashString(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  function getUserColor(seed) {
    if (!seed) return PALETTE[0];
    const idx = hashString(String(seed)) % PALETTE.length;
    return PALETTE[idx];
  }

  function getInitials(name) {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    // первая буква имени + первая буква фамилии (если есть)
    return (parts[0][0] + ' ' + (parts[1]?.[0] ?? '')).slice(0, 2).toUpperCase();
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  }

  function hexToRgba(hex, alpha = 0.08) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const user = message.User || {};
  const avatarUrl = message.externalAuthorAvatar
    || message.externalAvatar
    || user.avatar
    || message.user?.avatar
    || userById?.avatar
    || null;
  const seed = isExternalAuthor
    ? `${externalAuthorKind}:${message.externalAuthorId || message.externalAuthorName || message.id || ''}`
    : (user.id ?? userById?.id ?? user.name ?? String(user.email ?? ''));
  const userColor = getUserColor(seed);
  const initials = isExternalAuthor
    ? (externalAuthorKind === 'telegram' ? 'TG' : externalAuthorKind === 'max' ? 'MX' : externalAuthorKind === 'cross' ? 'BC' : getInitials(externalAuthorKind || 'EX'))
    : getInitials(user.name || userById?.name || currentUserName || user.login || '??');

  // в теле JSX, внутри пузырька перед основным текстом:
  const replyToId =
    message.replyToMessageId ??
    message.replyToMessage?.id ??
    (typeof message.replyToMessage === 'number' ? message.replyToMessage : null) ??
    null;
  const repliedFromList = replyToId != null ? messagesById[String(replyToId)] : null;
  const replied =
    repliedFromList ??
    (typeof message.replyToMessage === 'object' ? message.replyToMessage : null) ??
    null;

  // sometimes backend returns replyToMessage as relation; sometimes you stored only id.
  const showReplyBlock = Boolean(replyToId || replied);

  const replyMessage = formatReplyMessage(replied);

  const repliedUser = replied?.User || {};
  const repliedUserSeed = repliedUser?.id ?? repliedUser?.name ?? String(repliedUser.email ?? '');
  const repliedUserColor = getUserColor(repliedUserSeed);

  // цвет имени
  const nameStyle = { color: userColor, fontWeight: 600, fontSize: 13 };
  

  // тонкий левый бордер у ответа / пузыря (если нужно)
  const leftStripStyle = { borderLeft: `4px solid ${repliedUserColor}`, paddingLeft: 8 };

  // если нужно подсветить фон ответа этим цветом (легкая заливка)
  const replyBgStyle = {
    background: hexToRgba(repliedUserColor, 0.2),
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '8px 10px',
  };

  const timePart = formatTimeOrWeekday(message.createdAt);

  function formatTimeOrWeekday(isoOrNull) {
    return formatChatTimeOrDate(isoOrNull);
  }

  const renderReactionBadges = () => {
    if (!message.reactions?.length) return null;
    return (
      <span className="inline-flex min-w-0 items-center gap-1">
        {(message.reactions || []).map((reaction) => (
          <button
            key={`${message.id}-reaction-${reaction.emoji}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleReaction(reaction.emoji);
            }}
            className="inline-flex min-h-[22px] shrink-0 items-center justify-center rounded-full border px-[7px] py-[2px] text-xs leading-none transition-colors hover:bg-gray-100"
            style={{
              margin: 0,
              marginRight: 0,
              border: `1px solid ${reaction.reactedByMe ? '#60a5fa' : 'rgba(107, 114, 128, 0.30)'}`,
              background: reaction.reactedByMe ? '#eff6ff' : 'rgba(255,255,255,0.72)',
              color: '#000000',
              fontWeight: 500,
            }}
            title={`Реакция ${reaction.emoji}`}
          >
            {reaction.emoji} {reaction.count}
          </button>
        ))}
      </span>
    );
  };

  const renderMessageStatus = ({ audioControls = false } = {}) => {
    if (!isMine) return null;
    return (
      <span className={`inline-flex shrink-0 items-center justify-center text-gray-400 ${
        audioControls ? 'ml-auto h-[30px] w-[30px] rounded-md border border-blue-400 bg-white text-blue-600' : 'ml-auto h-5 align-bottom'
      }`}>
        {messageStatus === 'sending' && <IoTimeOutline size={14} color={audioControls ? '#2563eb' : 'gray'} />}
        {messageStatus === 'sent' && <IoCheckmark size={15} color={audioControls ? '#2563eb' : 'gray'} />}
        {messageStatus === 'delivered' && <IoCheckmarkDone size={15} color={audioControls ? '#2563eb' : 'gray'} />}
        {messageStatus === 'read' && <IoCheckmarkDone size={15} color="#2c44f9" />}
      </span>
    );
  };

  const renderInlineMessageMeta = () => {
    if (!(message.reactions?.length > 0 || isMine)) return null;
    return (
      <span className="inline-flex w-full max-w-full items-center justify-between gap-1 align-bottom whitespace-normal">
        {renderReactionBadges()}
        {renderMessageStatus()}
      </span>
    );
  };


  // console.log('message= ', message)
  // console.log('replied = ', replied)
  // console.log('showReplyBlock = ', showReplyBlock)
  // console.log('src = ', src)

  return (
    <div 
      ref={messageRootRef}
      onContextMenuCapture={onContextMenu}
      onContextMenu={onContextMenu}
      onPointerDown={onMessagePointerDown}
      onPointerMove={onMessagePointerMove}
      onPointerUp={cancelMessageLongPress}
      onPointerCancel={cancelMessageLongPress}
      onClick={() => {
        if (suppressMessageClickRef.current) {
          suppressMessageClickRef.current = false;
          return;
        }
        if (forwardSelectionMode && typeof onToggleForwardSelection === 'function') {
          onToggleForwardSelection(message);
          return;
        }
        if (isFresh && typeof onSeenFresh === 'function' && message?.id) {
          onSeenFresh(message.id);
        }
      }}
      className={`webchat-message-row ${isPersonalRoom ? 'webchat-personal-message' : ''} ${isMine ? 'webchat-message-mine-row' : 'webchat-message-other-row'} relative flex items-end gap-3 my-2 ${forwardSelectionMode ? 'pl-11' : ''} ${isMine ? 'justify-end' : 'justify-start'}`}
      data-message-id={message.id}
      data-chat-kind={kind || ''}
      data-room-id={roomId ?? ''}
      data-chat-id={chatId ?? ''}
      id={message.id ? `msg-${message.id}` : undefined}
    >

      {forwardSelectionMode && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleForwardSelection?.(message);
          }}
          className="absolute flex h-7 w-7 items-center justify-center rounded-full border-2"
          style={{
            left: 4,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 3,
            minWidth: 28,
            minHeight: 28,
            padding: 0,
            margin: 0,
            borderColor: selectedForForward ? '#2563eb' : '#94a3b8',
            backgroundColor: selectedForForward ? '#2563eb' : '#ffffff',
            color: selectedForForward ? '#ffffff' : 'transparent',
          }}
          aria-label={selectedForForward ? 'Убрать сообщение из выбранных' : 'Выбрать сообщение'}
          aria-pressed={selectedForForward}
        >
          <span aria-hidden="true" style={{ display: 'block', fontSize: 19, lineHeight: '19px', fontWeight: 900, color: selectedForForward ? '#ffffff' : 'transparent' }}>✓</span>
        </button>
      )}

      {/* если нужно показывать аватар слева для чужих — можно вставить здесь */}
      {!isMine && currentChatKind !== 'room' && (() => {
        // стили, используемые в нескольких местах:
        const avatarStyle = {
          width: 44,
          height: 44,
          borderRadius: 9999,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: userColor,
          color: '#fff',
          fontWeight: 600,
          fontSize: 16,
          flexShrink: 0,
          userSelect: 'none',
          marginBottom: 5,
          letterSpacing: '0.08em',
        };
        const externalMaxAvatarStyle = {
          ...avatarStyle,
          background: 'transparent',
          color: 'inherit',
          overflow: 'hidden',
          padding: 0,
        };
        const externalTelegramAvatarStyle = {
          ...avatarStyle,
          background: 'transparent',
          color: '#2AABEE',
        };
        const externalCrossAvatarStyle = {
          ...avatarStyle,
          background: 'transparent',
          color: 'inherit',
          overflow: 'hidden',
          padding: 0,
        };

        return (
          <div className="flex items-start gap-3">
            {avatarUrl ? (
              <ChatAvatar title={author} avatarUrl={avatarUrl} size={44} borderRadius={9999} />
            ) : (
              <div
                style={
                  isExternalAuthor && externalAuthorKind === 'max'
                    ? externalMaxAvatarStyle
                    : isExternalAuthor && externalAuthorKind === 'telegram'
                      ? externalTelegramAvatarStyle
                      : isExternalAuthor && externalAuthorKind === 'cross'
                        ? externalCrossAvatarStyle
                      : avatarStyle
                }
                aria-hidden="true"
              >
                {isExternalAuthor && externalAuthorKind === 'telegram' ? (
                  <FaTelegramPlane size={34} />
                ) : isExternalAuthor && externalAuthorKind === 'max' ? (
                  <Image src="/images/max-logo.png" alt="" width={44} height={44} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : isExternalAuthor && externalAuthorKind === 'cross' ? (
                  bridgeCompanyIconSrc ? (
                    <Image src={bridgeCompanyIconSrc} alt="" width={44} height={44} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                  ) : initials
                ) : initials}
              </div>
            )}
          </div>
        );
      })()}

      
      {(message.type === 'deleted' || message.is_deleted) ? (

        <div className="text-sm italic text-gray-500 px-3 py-2">
          {/* show deletedByName if available */}
          {message.content || `Сообщение удалено${message.deletedByName ? ` пользователем ${message.deletedByName}` : ''}`}
        </div>
        
      ) : (

        <div className={`webchat-message-body ${isCompactMediaBubble ? 'webchat-message-media' : ''} flex flex-col ${isMine ? 'items-end' : 'items-start'} ${maxWidthClass}`}>


        {/* пузырёк */}
        <div
          className={`webchat-message-bubble ${isMine ? 'webchat-message-mine' : 'webchat-message-other'} ${bubbleCommon} ${isMine ? mineBubble : otherBubble} ${isSending ? 'opacity-70 italic' : ''}`}
          style={bubbleStyle}
        >


          {/* подпись (имя и время) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            borderRadius: 'inherit', overflow: 'hidden'
            // если контейнер внутри flex-элемента, убедись, что у родителя есть flex:1 и minWidth:0
          }}>
            <span style={{
              ...nameStyle,
              flex: '1 1 0',       // занимает оставшееся пространство
              minWidth: 0,         // важно для корректного ellipsis внутри flex
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {isExternalAuthor && externalAuthorKind === 'telegram' ? (
                <FaTelegramPlane size={15} style={{ flexShrink: 0, color: '#2AABEE' }} />
              ) : isExternalAuthor && externalAuthorKind === 'max' ? (
                <Image src="/images/max-logo.png" alt="" width={17} height={17} style={{ objectFit: 'contain', display: 'block', flexShrink: 0 }} />
              ) : isExternalAuthor && externalAuthorKind === 'cross' ? (
                bridgeCompanyIconSrc ? (
                  <Image src={bridgeCompanyIconSrc} alt="" width={16} height={16} style={{ width: 16, height: 16, objectFit: 'contain', display: 'block', flexShrink: 0 }} />
                ) : (
                  <span style={{ width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 9, fontWeight: 800, color: userColor }}>
                    {initials.slice(0, 1)}
                  </span>
                )
              ) : null}
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{author}</span>
            </span>

            <span style={{ margin: '0 8px', flexShrink: 0, color: '#bbb' }}>·</span>

            <span style={{
              fontSize: 12,
              flexShrink: 0,       // не сжимать
              marginLeft: 0
            }}>
              {timePart}
            </span>

            {isPinned && (
              isPinnedMine ? (
                <span style={{ marginLeft: 6, fontSize: 17, color: '#dc2626' }} title="Мой закреп">
                  📌
                </span>
              ) : (
                <span
                  title="Закреплено другим пользователем"
                  // style={{
                  //   marginLeft: 6,
                  //   fontSize: 12,
                  //   lineHeight: '14px',
                  //   color: '#0369a1',
                  //   background: '#e0f2fe',
                  //   borderRadius: 10,
                  //   padding: '1px 4px',
                  //   display: 'inline-flex',
                  //   alignItems: 'center',
                  // }}
                >
                  📌📌
                </span>
              )
            )}


          </div>




          {showReplyBlock && (
          <div
            className="mb-2 rounded"
            style={ replyBgStyle }
            onClick={(e) => {
              e.stopPropagation();
              // Попытаемся скроллить к оригинальному сообщению если он в DOM
              const origId = replied?.id ?? replyToId ?? message.replyToMessageId;
              if (!origId) return;
              try {
                const container = document.querySelector('.chat-messages-container') || document;
                const el = container.querySelector(`[data-message-id="${origId}"]`) || document.getElementById(`msg-${origId}`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.classList.add('search-highlight');
                  setTimeout(() => el.classList.remove('search-highlight'), 1800);
                } else {
                  // если не в DOM — можно показать toast или инициировать загрузку контекста
                  // toast.info('Оригинальное сообщение не загружено');
                }
              } catch (err) { console.warn(err); }
            }}
          > 
            <div style={{ ...leftStripStyle }}>
              <div style={{ fontSize: 12, color: repliedUserColor, marginBottom: 4, fontWeight: 600 }}>
                {replied?.User?.name ?? replied?.userName ?? 'System'}
              </div>
              <div style={{ fontSize: 13, color: '#333' }}>
                {replyMessage ?? '«Исходное сообщение недоступно»'}
              </div>
            </div>  
          </div>
          )}



          {/* Контент в зависимости от типа */}
          {message.type === 'text' && (
            <div className="text-sm">
              <div className="flex w-full items-end gap-1">
                <div className="min-w-0 flex-1 whitespace-pre-wrap">
                  {parseSiteCallbackMessage(getReadableMessageText(message, "")) ? (
                    <SiteCallbackCard content={getReadableMessageText(message, "")} />
                  ) : (
                    renderTextWithLinks(getReadableMessageText(message, ""))
                  )}
                  {wasMessageEdited(message) && (
                    <span className="ml-1 text-xs text-gray-400">
                      (изменено: {formatChatTime(message.updatedAt)})
                    </span>
                  )}
                </div>
                {renderMessageStatus()}
              </div>
              {message.reactions?.length > 0 && (
                <div style={{ display: 'flex', marginTop: 2 }}>
                  {renderReactionBadges()}
                </div>
              )}
            </div>
          )}




          {message.type === 'audio' && src && (
            <div
              className="webchat-simple-audio mt-1 w-full"
              style={{
                minWidth: 0,
                maxWidth: '100%',
                boxSizing: 'border-box',
                display: 'grid',
                gridTemplateColumns: isMine ? 'minmax(0, 1fr) 30px 30px' : 'minmax(0, 1fr) 30px',
                alignItems: 'center',
                gap: 6,
              }}
              onClick={(event) => event.stopPropagation()}
            >
                  <audio
                    ref={(element) => {
                      audioRef.current = element;
                      if (typeof onRegisterAudioElement === 'function') onRegisterAudioElement(message?.id, element);
                    }}
                    controls
                    src={audioSrc}
                    preload="metadata"
                    style={{ display: 'block', width: '100%', minWidth: 0, maxWidth: '100%' }}
                    onLoadedMetadata={() => {
                      if (audioRef.current) {
                        audioRef.current.playbackRate = audioPlaybackRate;
                      }
                    }}
                    onPlay={(event) => {
                      if (typeof onAudioPlay === 'function') onAudioPlay(message?.id, event.currentTarget);
                    }}
                    onEnded={() => {
                      if (typeof onAudioEnded === 'function') onAudioEnded(message?.id);
                    }}
                  />
                    <button
                      type="button"
                      onClick={showTranscriptionToast}
                      title={transcriptionStatus === 'done' ? 'Показать транскрибацию' : 'Статус транскрибации'}
                      aria-label={transcriptionStatus === 'done' ? 'Показать транскрибацию' : 'Статус транскрибации'}
                      style={{
                        width: 30,
                        height: 30,
                        margin: 0,
                        padding: 0,
                        border: '1px solid #60a5fa',
                        borderRadius: 6,
                        background: '#ffffff',
                        color: '#2563eb',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      {transcriptionStatus === 'pending' || transcriptionStatus === 'processing'
                        ? <Spinner />
                        : <IoDocumentTextOutline size={19} />}
                    </button>
                  {renderMessageStatus({ audioControls: true })}
                  {message.reactions?.length > 0 && (
                    <span className="mt-0.5 inline-flex w-full items-center" style={{ gridColumn: '1 / -1' }}>
                      {renderReactionBadges()}
                    </span>
                  )}
            </div>
          )}  

          {message.type === 'image' && src && (
            <div className="mt-1" onClick={(e) => e.stopPropagation()}>
              <a href={src} target="_blank" rel="noreferrer">
                <Image
                  src={src}
                  alt={resolvedFileName || message.fileName || 'image'}
                  width={300}     // ✅ обязательно
                  height={400}    // ✅ обязательно
                  className="rounded-md shadow-sm object-cover"
                  style={{
                    maxWidth: '320px',
                    maxHeight: '320px',
                    display: 'block',
                  }}
                  unoptimized
                />
              </a>
              {!!imageDescription && (
                <div className="mt-2 text-sm whitespace-pre-wrap break-words">
                  {renderTextWithLinks(imageDescription)}
                </div>
              )}
            </div>
          )}

          {message.type === 'video' && src && (
            <div className="mt-1" onClick={(e) => e.stopPropagation()}>  
              <video
                controls
                src={src}
                preload="metadata"
                className="rounded-md shadow-sm"
                style={{
                  maxWidth: '480px',
                  maxHeight: '320px',
                  width: '100%',
                  aspectRatio: '16 / 9',
                  objectFit: 'contain',
                  backgroundColor: '#000',
                }}
              />
              {!!resolvedFileName && (
                <div className="text-xs text-gray-500 mt-1">
                  {resolvedFileName}
                </div>
              )}
            </div>
          )}

          {/* Универсальный рендер для остальных типов файлов (pdf, docx, zip...) */}
          {isFileAttachment && (
            <div
              className="mt-1 flex w-full flex-wrap items-center gap-1.5 rounded-md border border-gray-400 px-1.5 py-1"
              style={{ minWidth: 0, boxSizing: 'border-box', backgroundColor: '#D1D5DB' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border border-gray-400 bg-white">
                <IoDocumentAttachSharp size={21} color="#2563eb" />
              </div>

              <div className="min-w-0 flex-1 leading-tight">
                <a className="block truncate text-sm font-semibold text-gray-900 underline" href={src} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                  {resolvedFileName || safeDecodeFilename(message.fileName)}
                </a>
                <div className="text-[11px] leading-tight text-gray-600">
                  {(() => {
                    const size = formatFileSize(resolvedFileSize);
                    const label = getAttachmentKindLabel(message);
                    return size ? `${label} ${size}` : label;
                  })()}
                </div>
              </div>

              {renderMessageStatus({ audioControls: true })}
              {message.reactions?.length > 0 && (
                <span className="order-last mt-0.5 inline-flex w-full basis-full items-center">
                  {renderReactionBadges()}
                </span>
              )}
            </div>
          )}

          {message.type !== 'text' && message.type !== 'audio' && !isFileAttachment && (
            <div className="text-left" style={{ marginTop: 2 }}>
              {renderInlineMessageMeta()}
            </div>
          )}
        </div>
        </div>
      )}


      {/* Контекстное меню */}
      <MessageContextMenu
        x={menuPos.x}
        y={menuPos.y}
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onReply={handleReply}
        onForward={handleForward}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onShare={handleShare}
        onSave={handleSave}
        onEdit={() => onEdit?.(message)}
        onDelete={handleDelete}
        onReact={handleReaction}
        onOpenPinned={handleOpenPinned}
        onTogglePin={handleTogglePin}
        reactionEmojis={reactionEmojis}
        activeReactions={activeReactionsByMe}
        isPinned={isPinned}
        disabled={disabled}
        variant={isExternalContextMenu ? 'external' : 'default'}
      />
    </div>
  );

}, (previous, next) => {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  keys.delete('messagesById');
  for (const key of keys) {
    if (previous[key] !== next[key]) return false;
  }

  const replyId = previous.message?.replyToMessageId
    ?? previous.message?.replyToMessage?.id
    ?? (typeof previous.message?.replyToMessage === 'number' ? previous.message.replyToMessage : null);
  if (replyId == null) return true;
  return previous.messagesById?.[String(replyId)] === next.messagesById?.[String(replyId)];
});


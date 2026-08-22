// components/webchats/ChatList.js
'use client';

import React, { useEffect, useState, useContext, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { IoAlertCircleOutline, IoPaperPlaneOutline, IoPeopleOutline, IoPeopleCircleOutline, IoPersonAddOutline } from 'react-icons/io5';
import ChatCard from './ChatCard';
import ExternalChatInviteModal from './ExternalChatInviteModal';
import RoomParticipantsModal from './RoomParticipantsModal';
import { formatChatDate, formatChatTime, formatChatTimeOrDate } from './dateFormat';
import { AuthContext } from '../../context/AuthContext';
import { useWebSocket } from '../../components/webchats/SocketProvider';

/**
 * Компонент ChatList: загружает комнаты и boss-чаты, мержит их и рендерит список.
 * Теперь: суммирует unread и обновляет document.title = `🔔 N MyApp` при изменении данных.
 */

export default function ChatList({ onFirstLoaded, searchQuery = '', roomId = null, chatId = null, onMessageClick = null, maxId = null, telegramId = null, listView = 'list', onActionsReady = null }) {
  const { user, token, isLoading: authLoading } = useContext(AuthContext);
  const router = useRouter();
  const pathname = usePathname();
  const [maxAccessOverride, setMaxAccessOverride] = useState(null);
  const hasMaxAccess = (maxAccessOverride ?? user?.canMax) !== false;
  const [telegramAccessOverride, setTelegramAccessOverride] = useState(null);
  const hasTelegramAccess = (telegramAccessOverride ?? user?.canTelegram) !== false;
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { socket } = useWebSocket();

  // --- поиск ---
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const DEBOUNCE_MS = 300;

  useEffect(() => {
    let cancelled = false;

    const refreshMaxAccess = async () => {
      if (!token) {
        if (!cancelled) setMaxAccessOverride(null);
        return;
      }
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setMaxAccessOverride(data?.user?.canMax);
          setTelegramAccessOverride(data?.user?.canTelegram);
        }
      } catch {
        // no-op: leave current state
      }
    };

    refreshMaxAccess();
    return () => {
      cancelled = true;
    };
  }, [token, pathname]);

  // ---------------- H O O K S  — всегда вверху (не условно) ----------------
  const originalTitleRef = useRef(typeof document !== 'undefined' ? document.title : 'MyChatApp');
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  const ALERTS_BOSS_CHAT_ID = 5;
  const AVATAR_DEBUG = false;
  const avatarDebug = useCallback((event, payload) => {
    if (!AVATAR_DEBUG) return;
    try {
      console.log(`[AvatarDebug][web][ChatList] ${event}`, payload);
    } catch {}
  }, [AVATAR_DEBUG]);

  const pickNewestAlert = useCallback((alertsPayload) => {
    try {
      const inbox = Array.isArray(alertsPayload?.inbox) ? alertsPayload.inbox : [];
      const sent = Array.isArray(alertsPayload?.sent) ? alertsPayload.sent : [];

      const inboxItems = inbox
        .map((row) => row?.alert ? {
          id: row.alert.id,
          title: row.alert.title,
          content: row.alert.content,
          createdAt: row.alert.createdAt,
          creator: row.alert.creator ?? null,
        } : null)
        .filter(Boolean);

      const sentItems = sent
        .map((row) => ({
          id: row?.id,
          title: row?.title,
          content: row?.content,
          createdAt: row?.publishedAt ?? row?.scheduledFor ?? row?.createdAt,
          creator: null,
        }))
        .filter(Boolean);

      const all = [...inboxItems, ...sentItems];
      if (!all.length) return null;
      all.sort((a, b) => {
        const ta = a?.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b?.createdAt ? Date.parse(b.createdAt) : 0;
        return tb - ta;
      });
      return all[0] || null;
    } catch (e) {
      console.warn('[alerts] pickNewestAlert failed', e);
      return null;
    }
  }, []);

  // ---------------- Max integration ----------------------------
  const [maxChatsExpanded, setMaxChatsExpanded] = useState(false);
  const [maxOtherChatsExpanded, setMaxOtherChatsExpanded] = useState(false);
  const [maxOwnerChatsExpanded, setMaxOwnerChatsExpanded] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('webchats:max:ownerExpanded') === '1';
    } catch {
      return false;
    }
  });
  const [maxChats, setMaxChats] = useState([]);
  const [loadingMaxChats, setLoadingMaxChats] = useState(false);
  const [maxInviteBusy, setMaxInviteBusy] = useState(false);
  const [maxMembershipBusyById, setMaxMembershipBusyById] = useState({});
  const [telegramChatsExpanded, setTelegramChatsExpanded] = useState(false);
  const [telegramChats, setTelegramChats] = useState([]);
  const [loadingTelegramChats, setLoadingTelegramChats] = useState(false);
  const [telegramInviteBusy, setTelegramInviteBusy] = useState(false);
  const [telegramMembershipBusyById, setTelegramMembershipBusyById] = useState({});
  const [externalInviteModal, setExternalInviteModal] = useState(null);
  const [externalInviteBusy, setExternalInviteBusy] = useState(false);
  const [roomParticipantsModal, setRoomParticipantsModal] = useState(null);
  const [roomParticipantsSaving, setRoomParticipantsSaving] = useState(false);
  const [roomCreateModal, setRoomCreateModal] = useState(null);
  const [roomCreateUsers, setRoomCreateUsers] = useState([]);
  const [roomCreateSelectedIds, setRoomCreateSelectedIds] = useState([]);
  const [roomCreateName, setRoomCreateName] = useState('');
  const [roomCreateLoading, setRoomCreateLoading] = useState(false);
  const [roomCreateSaving, setRoomCreateSaving] = useState(false);
  const [roomCreateError, setRoomCreateError] = useState('');
  const [telegramSectionsExpanded, setTelegramSectionsExpanded] = useState(() => {
    const defaults = {
      personal: false,
      owner: false,
      participant: false,
      other: false,
      archive: false,
    };
    if (typeof window === 'undefined') return defaults;
    try {
      const saved = JSON.parse(localStorage.getItem('webchats:telegram:sections:v1') || '{}');
      return { ...defaults, ...saved };
    } catch {
      return defaults;
    }
  });
  const [personalRoomsExpanded, setPersonalRoomsExpanded] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('webchats:rooms:personalExpanded') === '1';
    } catch {
      return false;
    }
  });
  const [groupRoomsExpanded, setGroupRoomsExpanded] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('webchats:rooms:groupExpanded') === '1';
    } catch {
      return false;
    }
  });
  const [adminChatsExpanded, setAdminChatsExpanded] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('webchats:boss:adminExpanded') === '1';
    } catch {
      return false;
    }
  });
  const [roomArchiveExpanded, setRoomArchiveExpanded] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('webchats:rooms:archiveExpanded') === '1';
    } catch {
      return false;
    }
  });
  const [pinnedChatKeys, setPinnedChatKeys] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem('webchats:pinnedChats');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
    } catch {
      return [];
    }
  });
  const [importantChatKeys, setImportantChatKeys] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem('webchats:importantChats');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
    } catch {
      return [];
    }
  });
  const [chatContextMenu, setChatContextMenu] = useState(null);
  const [flatArchiveExpanded, setFlatArchiveExpanded] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('webchats:flat:archiveExpanded') === '1';
    } catch {
      return false;
    }
  });
  const [flatOtherWorkExpanded, setFlatOtherWorkExpanded] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('webchats:flat:otherWorkExpanded') === '1';
    } catch {
      return false;
    }
  });
  const lastFetchTimeRef = useRef(null);
  const seenIncomingRef = useRef(new Set());
  const UNREAD_DEBUG = false;
  const logUnread = useCallback((event, payload) => {
    if (!UNREAD_DEBUG) return;
    try {
      console.log(`[WebUnreadDebug] ${event}`, payload);
    } catch (e) {
      console.warn('[WebUnreadDebug] log failed', e);
    }
  }, [UNREAD_DEBUG]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('webchats:rooms:personalExpanded', personalRoomsExpanded ? '1' : '0');
    } catch {}
  }, [personalRoomsExpanded]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('webchats:rooms:groupExpanded', groupRoomsExpanded ? '1' : '0');
    } catch {}
  }, [groupRoomsExpanded]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('webchats:boss:adminExpanded', adminChatsExpanded ? '1' : '0');
    } catch {}
  }, [adminChatsExpanded]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('webchats:rooms:archiveExpanded', roomArchiveExpanded ? '1' : '0');
    } catch {}
  }, [roomArchiveExpanded]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('webchats:telegram:sections:v1', JSON.stringify(telegramSectionsExpanded));
    } catch {}
  }, [telegramSectionsExpanded]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('webchats:max:ownerExpanded', maxOwnerChatsExpanded ? '1' : '0');
    } catch {}
  }, [maxOwnerChatsExpanded]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('webchats:pinnedChats', JSON.stringify(pinnedChatKeys));
    } catch {}
  }, [pinnedChatKeys]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('webchats:importantChats', JSON.stringify(importantChatKeys));
    } catch {}
  }, [importantChatKeys]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('webchats:flat:archiveExpanded', flatArchiveExpanded ? '1' : '0');
    } catch {}
  }, [flatArchiveExpanded]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('webchats:flat:otherWorkExpanded', flatOtherWorkExpanded ? '1' : '0');
    } catch {}
  }, [flatOtherWorkExpanded]);

  useEffect(() => {
    const closeMenu = () => setChatContextMenu(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, []);



  // подсчитать суммарный unread
  const calcTotalUnread = useCallback((list) => {
    if (!Array.isArray(list)) return 0;
    return list.reduce((s, c) => s + (Number(c?.unread || 0)), 0);
  }, []);

  // установить title с эмодзи бейджем
  // 1) safer setTitleWithBadge — strip existing badge from base title
  const setTitleWithBadge = useCallback((total) => {
    // Берём оригинальный base (который мы сохранили при mount), но на всякий случай
    // очищаем его от уже существующих префиксов "🔔 ... "
    let base = originalTitleRef.current || 'MyChatApp';
    try {
      // удаляем возможный уже стоящий бейдж в начале строки (например: "🔔 2 MyApp")
      base = String(base).replace(/^\s*🔔\s*\S+\s*/u, '').trim();
    } catch (err) { console.warn(err)}

    try {
      if (total && total > 0) {
        const display = total > 99 ? '99+' : String(total);
        document.title = `🔔 ${display} ${base}`;
      } else {
        document.title = base;
      }
    } catch (e) { console.warn('setTitleWithBadge error', e); }
  }, []); // в зависимостях: ничего (originalTitleRef неизменен)

  const refreshAlertsBadge = useCallback(async () => {
    if (authLoading) return;
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      const resp = await fetch(`${apiBase}/admin/alerts`, {
        method: 'GET',
        headers,
        credentials: token ? 'omit' : 'include',
      });
      if (!resp.ok) return;
      const payload = await resp.json();
      const alertsUnread = Math.max(0, Number(payload?.inboxUnreadTotal || 0));
      const latestAlert = pickNewestAlert(payload);

      setChats((prev) => {
        if (!Array.isArray(prev) || prev.length === 0) return prev;

        const next = prev.map((c) => {
          const rawNum = Number(String(c?.rawId ?? c?.id ?? '').replace(/^(?:room-|boss-)/, ''));
          if (!(c?.kind === 'boss' && rawNum === ALERTS_BOSS_CHAT_ID)) return c;
          const alertsPreviewText = latestAlert?.content || latestAlert?.title || c?.lastMessage || 'Нет оповещений';
          return {
            ...c,
            unread: alertsUnread,
            lastMessage: alertsPreviewText,
            lastMessageRaw: {
              type: 'text',
              content: alertsPreviewText,
              createdAt: latestAlert?.createdAt ?? c?.lastMessageTime ?? c?.updatedAt ?? null,
              User: latestAlert?.creator ?? c?.lastMessageRaw?.User ?? null,
            },
            lastMessageTime: latestAlert?.createdAt ?? c?.lastMessageTime ?? c?.updatedAt ?? null,
            updatedAt: latestAlert?.createdAt ?? c?.updatedAt ?? null,
          };
        });

        try {
          const total = calcTotalUnread(next);
          setTitleWithBadge(total);
        } catch (e) {
          console.warn('refreshAlertsBadge title update error', e);
        }
        return next;
      });
    } catch (e) {
      console.warn('refreshAlertsBadge failed', e);
    }
  }, [authLoading, token, apiBase, pickNewestAlert, calcTotalUnread, setTitleWithBadge, ALERTS_BOSS_CHAT_ID]);



  // fetchChats: вынесенный fetch, возвращает merged chats
  const fetchChats = useCallback(async (opts = {}) => {
    const silent = Boolean(opts?.silent);
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    const headers = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const [roomsResp, bossResp, alertsResp] = await Promise.allSettled([
        fetch(`${apiBase}/web/rooms`, { method: 'GET', headers, credentials: token ? 'omit' : 'include' }),
        fetch(`${apiBase}/web/boss/chats`, { method: 'GET', headers, credentials: token ? 'omit' : 'include' }),
        fetch(`${apiBase}/admin/alerts`, { method: 'GET', headers, credentials: token ? 'omit' : 'include' })
      ]);

      const handleResp = async (res, kind) => {
        if (res.status !== 'fulfilled') {
          console.warn(`${kind} fetch failed`, res.reason);
          return [];
        }
        const r = res.value;
        if (!r.ok) {
          console.warn(`${kind} fetch not ok`, r.status);
          return [];
        }
        const data = await r.json();
        return Array.isArray(data) ? data : [];
      };

      const roomsRaw = await handleResp(roomsResp, 'rooms');
      avatarDebug('fetchChats:roomsRaw', {
        count: roomsRaw.length,
        apiBase,
        personalSample: roomsRaw
          .filter((room) => room?.roomType === 'personal')
          .slice(0, 8)
          .map((room) => ({
            id: room.id,
            title: room.title,
            partnerName: room.partnerName,
            partnerAvatar: room.partnerAvatar ?? null,
          })),
      });
      const rooms = roomsRaw.filter((room) => {
        const title = String(room?.title ?? '');
        const hasLastMessage =
          Boolean(room?.lastMessageRaw?.id) ||
          Boolean(room?.lastMessageTime) ||
          Boolean(String(room?.lastMessage ?? '').trim());
        const unread = Number(room?.unread ?? 0);

        // Скрываем пустые удалённые/технические personal-чаты вида personal-2-36.
        // Это "призрачные" записи, которые не должны отображаться в списке.
        const isGhostPersonal =
          /^personal-\d+-\d+$/i.test(title) &&
          !hasLastMessage &&
          unread <= 0;

        return !isGhostPersonal;
      });
      const bosses = await handleResp(bossResp, 'boss');
      let alertsPayload = null;
      if (alertsResp.status === 'fulfilled' && alertsResp.value?.ok) {
        try {
          alertsPayload = await alertsResp.value.json();
        } catch (e) {
          console.warn('alerts parse failed', e);
        }
      }
      const alertsUnread = Math.max(0, Number(alertsPayload?.inboxUnreadTotal || 0));
      const latestAlert = pickNewestAlert(alertsPayload);

      let merged = [...rooms, ...bosses].sort((a, b) => {
        const ta = a.lastMessageTime ?? a.updatedAt ?? 0;
        const tb = b.lastMessageTime ?? b.updatedAt ?? 0;
        return (tb ? Date.parse(tb) : 0) - (ta ? Date.parse(ta) : 0);
      });

      const normalizeNumId = (val) => {
        const n = Number(String(val ?? '').replace(/^(?:room-|boss-)/, ''));
        return Number.isFinite(n) ? n : NaN;
      };

      const alertsIdx = merged.findIndex((c) => c?.kind === 'boss' && normalizeNumId(c?.rawId ?? c?.id) === ALERTS_BOSS_CHAT_ID);
      const alertsPreviewText = latestAlert?.content || latestAlert?.title || 'Нет оповещений';

      if (alertsIdx >= 0) {
        const existing = merged[alertsIdx];
        merged[alertsIdx] = {
          ...existing,
          title: existing?.title || 'ОПОВЕЩЕНИЯ',
          unread: alertsUnread,
          lastMessage: alertsPreviewText,
          lastMessageRaw: {
            type: 'text',
            content: alertsPreviewText,
            createdAt: latestAlert?.createdAt ?? existing?.lastMessageTime ?? existing?.updatedAt ?? null,
            User: latestAlert?.creator ?? null,
          },
          lastMessageTime: latestAlert?.createdAt ?? existing?.lastMessageTime ?? existing?.updatedAt ?? null,
          updatedAt: latestAlert?.createdAt ?? existing?.updatedAt ?? null,
        };
      } else if (alertsPayload) {
        merged = [
          {
            id: `boss-${ALERTS_BOSS_CHAT_ID}`,
            rawId: `boss-${ALERTS_BOSS_CHAT_ID}`,
            kind: 'boss',
            title: 'ОПОВЕЩЕНИЯ',
            unread: alertsUnread,
            lastMessage: alertsPreviewText,
            lastMessageRaw: {
              type: 'text',
              content: alertsPreviewText,
              createdAt: latestAlert?.createdAt ?? null,
              User: latestAlert?.creator ?? null,
            },
            lastMessageTime: latestAlert?.createdAt ?? null,
            updatedAt: latestAlert?.createdAt ?? null,
          },
          ...merged,
        ];
      }
      logUnread('fetchChats:merged', {
        total: merged.length,
        sample: merged.slice(0, 10).map(c => ({
          id: c.id,
          rawId: c.rawId,
          kind: c.kind,
          unread: c.unread,
          unreadCount: c.unreadCount,
          title: c.title,
        })),
      });

      setChats(merged);

      // оповестим родителя, если нужно
      if (typeof onFirstLoaded === 'function') {
        try { onFirstLoaded(merged); } catch (err) { console.warn(err); }
      }

      // обновляем title на основе authoritative server data
      const total = calcTotalUnread(merged);
      logUnread('fetchChats:totalUnread', { total });
      setTitleWithBadge(total);

      return merged;
    } catch (err) {
      console.error('load chats error', err);
      if (!silent) setError(String(err));
      return [];
    } finally {
      if (!silent) setLoading(false);
    }
  }, [apiBase, token, calcTotalUnread, setTitleWithBadge, onFirstLoaded, pickNewestAlert, logUnread, avatarDebug]);

  const openRoomCreateModal = useCallback(async (mode) => {
    setRoomCreateModal(mode);
    setRoomCreateSelectedIds([]);
    setRoomCreateName('');
    setRoomCreateError('');
    setRoomCreateLoading(true);
    try {
      const response = await fetch(`${apiBase}/rooms/available-users`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json().catch(() => []);
      if (!response.ok) throw new Error(data?.error || 'Не удалось получить список сотрудников');
      setRoomCreateUsers(Array.isArray(data) ? data : []);
    } catch (createError) {
      setRoomCreateUsers([]);
      setRoomCreateError(createError?.message || 'Не удалось получить список сотрудников');
    } finally {
      setRoomCreateLoading(false);
    }
  }, [apiBase, token]);

  const closeRoomCreateModal = useCallback(() => {
    if (!roomCreateSaving) setRoomCreateModal(null);
  }, [roomCreateSaving]);

  const submitRoomCreate = useCallback(async () => {
    if (!roomCreateModal || roomCreateSaving) return;
    if (roomCreateSelectedIds.length === 0) {
      setRoomCreateError('Выберите сотрудника');
      return;
    }
    if (roomCreateModal === 'group' && !roomCreateName.trim()) {
      setRoomCreateError('Введите название группы');
      return;
    }

    setRoomCreateSaving(true);
    setRoomCreateError('');
    try {
      const response = roomCreateModal === 'personal'
        ? await fetch(`${apiBase}/personal/${encodeURIComponent(roomCreateSelectedIds[0])}`, {
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${token}`,
            },
          })
        : await fetch(`${apiBase}/rooms/group`, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              name: roomCreateName.trim(),
              participants: roomCreateSelectedIds,
            }),
          });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || data?.error || 'Не удалось создать чат');

      setRoomCreateModal(null);
      if (roomCreateModal === 'personal') setPersonalRoomsExpanded(true);
      else setGroupRoomsExpanded(true);
      await fetchChats({ silent: true });
      const createdRoomId = Number(data?.id);
      if (Number.isFinite(createdRoomId) && createdRoomId > 0) {
        router.push(`/webchats/room/${createdRoomId}`);
      }
    } catch (createError) {
      setRoomCreateError(createError?.message || 'Не удалось создать чат');
    } finally {
      setRoomCreateSaving(false);
    }
  }, [
    apiBase,
    fetchChats,
    roomCreateModal,
    roomCreateName,
    roomCreateSaving,
    roomCreateSelectedIds,
    router,
    token,
  ]);



  // Загружаем Мах чаты
  const fetchMaxChats = useCallback(async (force = false) => {
    if (authLoading) return;
    if (!hasMaxAccess) {
      setMaxChats([]);
      return;
    }
    if (!token) {
      setError('Требуется авторизация для загрузки чатов Max');
      return;
    }
    // Кэшируем на 30 секунд, если не форсированная загрузка
    const now = Date.now();
    if (!force && lastFetchTimeRef.current && (now - lastFetchTimeRef.current) < 30000) {
      return;
    }

    try {
      setLoadingMaxChats(true);
      setError(null);
      
      const response = await fetch(`${apiBase}/max/chats`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        }
        ,
        credentials: 'omit'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const maxChatsResponse = await response.json();
      //console.log('max chats = ', maxChatsResponse);

      const formattedMaxChats = maxChatsResponse.map(chat => ({
        id: `max-${chat.id}`,
        kind: 'max',
        rawId: String(chat.id),
        title: chat.username || `Max Чат ${chat.maxChatId}`,
        
        // Данные из бэкенда
        maxChatId: chat.maxChatId,
        maxUserId: chat.maxUserId,
        username: chat.username,
        unreadCount: chat.unreadCount,
        assigneeId: chat.assigneeId ?? null,
        assigneeName: chat.assigneeName ?? null,
        participantIds: Array.isArray(chat.participantIds) ? chat.participantIds : [],
        isOwner: Boolean(chat.isOwner),
        isParticipant: Boolean(chat.isParticipant),
        isAssignedToMe: Boolean(chat.isAssignedToMe),
        botType: chat.botType === 'personal' ? 'personal' : 'business',
        isPersonal: Boolean(chat.isPersonal || chat.botType === 'personal'),
        archived: Boolean(chat.archived || chat.archivedAt),
        archivedAt: chat.archivedAt || null,
        lastMessageText: chat.lastMessageText,
        lastMessageTime: chat.lastMessageTime,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,

        
        // Для ChatCard
        unread: parseInt(chat.unreadCount) || 0,
        lastMessageRaw: {
          type: 'text',
          content: chat.lastMessageText || chat.lastMessage || '',
          text: chat.lastMessageText || chat.lastMessage || '',
          body: chat.lastMessageText || chat.lastMessage || '',
          transcriptionText: chat.lastMessageText || chat.lastMessage || '',
          timestamp: chat.lastMessageTime || chat.updatedAt,
          User: { name: chat.username }
        },
        
        isMaxChat: true,
        source: 'max',
        updatedAt: chat.lastMessageTime || chat.updatedAt || chat.createdAt
      }));
      
      setMaxChats(formattedMaxChats);
      try {
        const total = calcTotalUnread(chats) + calcTotalUnread(formattedMaxChats);
        setTitleWithBadge(total);
      } catch (e) { console.warn('fetchMaxChats title update error', e); }
      logUnread('fetchMaxChats:formatted', {
        total: formattedMaxChats.length,
        sample: formattedMaxChats.slice(0, 10).map(c => ({
          id: c.id,
          rawId: c.rawId,
          kind: c.kind,
          unread: c.unread,
          title: c.title,
        })),
      });
      lastFetchTimeRef.current = Date.now();
    } catch (err) {
      console.error('Ошибка загрузки Max чатов:', err);
      setError('Не удалось загрузить чаты Max');
    } finally {
      setLoadingMaxChats(false);
    }
  }, [apiBase, authLoading, token, logUnread, chats, calcTotalUnread, setTitleWithBadge, hasMaxAccess]);

  const fetchTelegramChats = useCallback(async () => {
    if (authLoading || !token || !hasTelegramAccess) {
      setTelegramChats([]);
      return;
    }
    try {
      setLoadingTelegramChats(true);
      const response = await fetch(`${apiBase}/telegram/chats`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rows = await response.json();
      setTelegramChats((Array.isArray(rows) ? rows : []).map((chat) => ({
        id: `telegram-${chat.id}`,
        kind: 'telegram',
        rawId: String(chat.id),
        title: chat.username || `Telegram ${chat.telegramChatId}`,
        unread: Number(chat.unreadCount || 0),
        unreadCount: Number(chat.unreadCount || 0),
        lastMessageText: chat.lastMessageText || chat.lastMessage || '',
        lastMessageTime: chat.lastMessageTime || chat.updatedAt,
        assigneeId: chat.assigneeId ?? null,
        assigneeName: chat.assigneeName ?? null,
        isOwner: Boolean(chat.isOwner),
        isParticipant: Boolean(chat.isParticipant),
        botType: chat.botType || 'business',
        isPersonal: Boolean(chat.isPersonal || chat.botType === 'personal'),
        archived: Boolean(chat.archived),
      })));
    } catch (error) {
      console.error('Ошибка загрузки Telegram чатов:', error);
    } finally {
      setLoadingTelegramChats(false);
    }
  }, [apiBase, authLoading, token, hasTelegramAccess]);

  useEffect(() => {
    if (!authLoading && token && hasTelegramAccess) {
      fetchTelegramChats();
    }
  }, [authLoading, token, hasTelegramAccess, fetchTelegramChats]);

  useEffect(() => {
    if (telegramId) setTelegramChatsExpanded(true);
  }, [telegramId]);

  const setTelegramMembershipBusy = useCallback((chatId, busy) => {
    const key = String(chatId);
    setTelegramMembershipBusyById((prev) => ({ ...prev, [key]: busy }));
  }, []);

  const changeTelegramMembership = useCallback(async (chatId, action) => {
    if (!token) return;
    const key = String(chatId);
    try {
      setTelegramMembershipBusy(chatId, true);
      const response = await fetch(
        `${apiBase}/telegram/chats/${encodeURIComponent(chatId)}/${action}`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Не удалось изменить участие в чате');
      }
      setError(null);
      await fetchTelegramChats();
    } catch (membershipError) {
      console.error('telegram membership action failed', membershipError);
      setError(membershipError.message || 'Не удалось изменить участие в чате');
    } finally {
      setTelegramMembershipBusy(key, false);
    }
  }, [apiBase, fetchTelegramChats, setTelegramMembershipBusy, token]);

  const createExternalPersonalInvite = useCallback(async (provider) => {
    if (!token) return;
    const isMax = provider === 'max';
    const busy = isMax ? maxInviteBusy : telegramInviteBusy;
    if (busy) return;

    const setBusy = isMax ? setMaxInviteBusy : setTelegramInviteBusy;
    const label = isMax ? 'MAX' : 'Telegram';
    try {
      setBusy(true);
      const response = await fetch(`${apiBase}/${provider}/personal-invite`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json().catch(() => ({}));
      const inviteText = String(data?.url || data?.text || '').trim();
      if (!response.ok || !inviteText) {
        throw new Error(data?.error || 'Не удалось создать ссылку');
      }
      try {
        await navigator.clipboard.writeText(inviteText);
      } catch {}
      const promptText = data?.url
        ? `Ссылка личного ${label}-чата. Она также скопирована в буфер обмена:`
        : `Команда для личного ${label}-чата. Она также скопирована в буфер обмена:`;
      window.prompt(promptText, inviteText);
    } catch (inviteError) {
      setError(inviteError.message || `Не удалось создать личный ${label}-чат`);
    } finally {
      setBusy(false);
    }
  }, [apiBase, maxInviteBusy, telegramInviteBusy, token]);

  const createTelegramPersonalInvite = useCallback(() => {
    createExternalPersonalInvite('telegram');
  }, [createExternalPersonalInvite]);

  const createMaxPersonalInvite = useCallback(() => {
    createExternalPersonalInvite('max');
  }, [createExternalPersonalInvite]);

  useEffect(() => {
    if (typeof onActionsReady !== 'function') return undefined;
    onActionsReady({
      openPersonalRoomCreate: () => openRoomCreateModal('personal'),
      openGroupRoomCreate: () => openRoomCreateModal('group'),
      createTelegramPersonalInvite,
      createMaxPersonalInvite,
    });
    return () => onActionsReady(null);
  }, [createMaxPersonalInvite, createTelegramPersonalInvite, onActionsReady, openRoomCreateModal]);

  useEffect(() => {
    if (!socket || !hasTelegramAccess) return undefined;
    const refresh = () => fetchTelegramChats();
    socket.on('telegram:new-message', refresh);
    socket.on('telegram:new-chat', refresh);
    socket.on('telegram:chat-membership-updated', refresh);
    socket.on('telegram:chat-renamed', refresh);
    socket.on('telegram:chat-archived', refresh);
    socket.on('telegram:chat-deleted', refresh);
    return () => {
      socket.off('telegram:new-message', refresh);
      socket.off('telegram:new-chat', refresh);
      socket.off('telegram:chat-membership-updated', refresh);
      socket.off('telegram:chat-renamed', refresh);
      socket.off('telegram:chat-archived', refresh);
      socket.off('telegram:chat-deleted', refresh);
    };
  }, [socket, hasTelegramAccess, fetchTelegramChats]);

  // Загружаем Max чаты при раскрытии
  useEffect(() => {
    if (hasMaxAccess && maxChatsExpanded) {
      fetchMaxChats();
    }
  }, [maxChatsExpanded, fetchMaxChats, hasMaxAccess]);

  // Подгружаем Max чаты сразу после авторизации,
  // чтобы unread бейдж в свернутой папке обновлялся мгновенно.
  useEffect(() => {
    if (authLoading || !token || !hasMaxAccess) return;
    fetchMaxChats();
  }, [authLoading, token, fetchMaxChats, hasMaxAccess]);

  // Автоматически раскрываем Max чаты, если мы уже находимся в Max чате
  useEffect(() => {
    if (hasMaxAccess && maxId) {
      setMaxChatsExpanded(true);
    }
  }, [maxId, hasMaxAccess]);

  useEffect(() => {
    if (!hasMaxAccess) {
      setMaxChats([]);
      setMaxChatsExpanded(false);
      setMaxOtherChatsExpanded(false);
    }
  }, [hasMaxAccess]);


  // Функция обновления списка Max чатов
  const handleRefreshMaxChats = useCallback(() => {
    fetchMaxChats(true);
  }, [fetchMaxChats]);

  const setMaxMembershipBusy = useCallback((chatId, busy) => {
    const key = String(chatId);
    setMaxMembershipBusyById((prev) => ({ ...prev, [key]: busy }));
  }, []);

  const handleJoinMaxChat = useCallback(async (chatId) => {
    if (!token) return;
    const key = String(chatId);
    try {
      setMaxMembershipBusy(chatId, true);
      const resp = await fetch(`${apiBase}/max/chats/${encodeURIComponent(chatId)}/assign`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'omit',
      });
      if (!resp.ok) {
        let msg = 'Не удалось присоединиться к чату';
        try {
          const err = await resp.json();
          if (err?.error) msg = err.error;
        } catch {}
        setError(msg);
        return;
      }
      setError(null);
      await fetchMaxChats(true);
    } catch (e) {
      console.error('join max chat failed', e);
      setError('Не удалось присоединиться к чату');
    } finally {
      setMaxMembershipBusy(key, false);
    }
  }, [apiBase, token, fetchMaxChats, setMaxMembershipBusy]);

  const handleLeaveMaxChat = useCallback(async (chatId) => {
    if (!token) return;
    const key = String(chatId);
    try {
      setMaxMembershipBusy(chatId, true);
      const resp = await fetch(`${apiBase}/max/chats/${encodeURIComponent(chatId)}/unassign`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'omit',
      });
      if (!resp.ok) {
        let msg = 'Не удалось выйти из чата';
        try {
          const err = await resp.json();
          if (err?.error) msg = err.error;
        } catch {}
        setError(msg);
        return;
      }
      setError(null);
      await fetchMaxChats(true);
    } catch (e) {
      console.error('leave max chat failed', e);
      setError('Не удалось выйти из чата');
    } finally {
      setMaxMembershipBusy(key, false);
    }
  }, [apiBase, token, fetchMaxChats, setMaxMembershipBusy]);

  const openRoomParticipantsModal = useCallback((chat) => {
    const rawId = chat?.rawId ?? chat?.id;
    const roomIdValue = String(rawId || '').replace(/^room-/, '');
    setRoomParticipantsModal({ ...chat, externalParticipants: Array.isArray(chat?.externalParticipants) ? chat.externalParticipants : [] });

    if (!token || !roomIdValue) return;
    fetch(`${apiBase}/admin/rooms/${encodeURIComponent(roomIdValue)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      credentials: 'omit',
    })
      .then((response) => response.ok ? response.json() : null)
      .then((roomInfo) => {
        if (!roomInfo) return;
        setRoomParticipantsModal((prev) => {
          const prevRawId = prev?.rawId ?? prev?.id;
          const prevRoomId = String(prevRawId || '').replace(/^room-/, '');
          if (prevRoomId !== roomIdValue) return prev;
          return {
            ...prev,
            ...roomInfo,
            rawId: prev?.rawId ?? roomIdValue,
            id: prev?.id ?? `room-${roomIdValue}`,
            Users: Array.isArray(roomInfo?.Users) ? roomInfo.Users : (Array.isArray(prev?.Users) ? prev.Users : []),
            externalParticipants: Array.isArray(roomInfo?.externalParticipants) ? roomInfo.externalParticipants : [],
          };
        });
      })
      .catch((error) => console.warn('load room participants info failed', error));
  }, [apiBase, token]);

  const closeRoomParticipantsModal = useCallback(() => {
    if (roomParticipantsSaving) return;
    setRoomParticipantsModal(null);
  }, [roomParticipantsSaving]);

  const saveRoomParticipants = useCallback(async (selectedIds) => {
    const rawId = roomParticipantsModal?.rawId ?? roomParticipantsModal?.id;
    const roomIdValue = String(rawId || '').replace(/^room-/, '');
    if (!token || !roomIdValue) return;
    try {
      setRoomParticipantsSaving(true);
      const response = await fetch(`${apiBase}/rooms/group/${encodeURIComponent(roomIdValue)}/participants`, {
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
      setError(null);
      setRoomParticipantsModal(null);
      await fetchChats({ silent: true });
    } catch (saveError) {
      console.error('save room participants failed', saveError);
      setError(saveError.message || 'Не удалось обновить состав группы');
    } finally {
      setRoomParticipantsSaving(false);
    }
  }, [apiBase, fetchChats, roomParticipantsModal, token]);

  const openExternalInviteModal = useCallback((channel, chat) => {
    setExternalInviteModal({ channel, chat });
  }, []);

  const closeExternalInviteModal = useCallback(() => {
    if (externalInviteBusy) return;
    setExternalInviteModal(null);
  }, [externalInviteBusy]);

  const inviteExternalChatUser = useCallback(async (employee) => {
    const modal = externalInviteModal;
    const userId = Number(employee?.id || 0);
    const chatId = modal?.chat?.rawId ?? modal?.chat?.id;
    const channel = modal?.channel;
    if (!token || !channel || !chatId || !userId) return;
    try {
      setExternalInviteBusy(true);
      if (channel === 'telegram') setTelegramMembershipBusy(chatId, true);
      if (channel === 'max') setMaxMembershipBusy(chatId, true);
      const response = await fetch(`${apiBase}/${channel}/chats/${encodeURIComponent(String(chatId))}/invite-user`, {
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
      setError(null);
      setExternalInviteModal(null);
      if (channel === 'telegram') await fetchTelegramChats();
      if (channel === 'max') await fetchMaxChats(true);
    } catch (inviteError) {
      console.error('external chat invite failed', inviteError);
      setError(inviteError.message || 'Не удалось пригласить сотрудника');
    } finally {
      if (channel === 'telegram') setTelegramMembershipBusy(chatId, false);
      if (channel === 'max') setMaxMembershipBusy(chatId, false);
      setExternalInviteBusy(false);
    }
  }, [apiBase, externalInviteModal, fetchMaxChats, fetchTelegramChats, setMaxMembershipBusy, setTelegramMembershipBusy, token]);



  // ---------------- Effects (хуки вызываются всегда, логика внутри учитывает authLoading) ----------------

  // 1) начальная загрузка (и при изменении token/user)
  useEffect(() => {
    let mounted = true;
    if (authLoading) {
      // не выходим из-за хуков — просто не запускаем fetch пока авторизация грузится
      return undefined;
    }

    (async () => {
      if (!mounted) return;
      await fetchChats();
    })();

    return () => { mounted = false; };
  }, [authLoading, fetchChats]);

  // 1.5) пересинхронизируем список чатов после reconnect сокета,
  // чтобы unread в свернутых папках не "залипал" до ручного обновления.
  useEffect(() => {
    if (!socket) return undefined;

    const syncOnReconnect = () => {
      // Не показываем глобальный лоадер при reconnect, чтобы не было двойного мигания списка.
      fetchChats({ silent: true }).catch(() => {});
      if (hasMaxAccess) {
        fetchMaxChats(true).catch(() => {});
      }
    };

    socket.on('connect', syncOnReconnect);
    return () => {
      socket.off('connect', syncOnReconnect);
    };
  }, [socket, fetchChats, fetchMaxChats, hasMaxAccess]);
  // 2) join rooms on socket (использует chats state)
  useEffect(() => {
    if (!socket || !chats.length) return undefined;

    const toNumId = (val) => Number(String(val ?? '').replace(/^(?:room-|boss-|chat-|max-)/, '')) || 0;

    const joinRooms = () => {
      chats.forEach(c => {
        const rid = toNumId(c?.rawId ?? c?.id);

        if (!rid) return;

        if (c.kind === 'room') socket.emit('joinRoom', rid);
        if (c.kind === 'boss') socket.emit('joinBossChat', rid);
      });
    };

    if (socket.connected) {
      joinRooms();
    } else {
      socket.on('connect', joinRooms);
    }

    return () => {
      socket.off('connect', joinRooms);
    };
  }, [socket, chats]);
  // 2.5) join max rooms on socket (for realtime max:new-message in sidebar)
  useEffect(() => {
    if (!socket || !Array.isArray(maxChats) || maxChats.length === 0) return undefined;

    const joinMaxRooms = () => {
      maxChats.forEach((c) => {
        const maxChatNum = Number(String(c?.rawId ?? c?.id ?? '').replace(/^max-/, ''));
        if (!maxChatNum) return;
        socket.emit('max:join', maxChatNum);
      });
    };

    const leaveMaxRooms = () => {
      maxChats.forEach((c) => {
        const maxChatNum = Number(String(c?.rawId ?? c?.id ?? '').replace(/^max-/, ''));
        if (!maxChatNum) return;
        socket.emit('max:leave', maxChatNum);
      });
    };

    if (socket.connected) joinMaxRooms();
    else socket.on('connect', joinMaxRooms);

    return () => {
      socket.off('connect', joinMaxRooms);
      leaveMaxRooms();
    };
  }, [socket, maxChats]);

  // 2.6) when max chat is opened, optimistically clear its unread and sync to backend
  useEffect(() => {
    if (maxId == null) return;
    const maxChatNum = Number(maxId);
    if (!maxChatNum) return;

    setMaxChats((prev) => prev.map((c) => {
      const cId = Number(String(c?.rawId ?? c?.id ?? '').replace(/^max-/, ''));
      if (cId !== maxChatNum) return c;
      return { ...c, unread: 0, unreadCount: 0 };
    }));

    fetch(`${apiBase}/max/chats/${maxChatNum}/read`, {
      method: 'PUT',
      headers: token
        ? { Accept: 'application/json', Authorization: `Bearer ${token}` }
        : { Accept: 'application/json' },
      credentials: token ? 'omit' : 'include',
    })
      .then(() => fetchMaxChats(true).catch(() => {}))
      .catch(() => {});
  }, [maxId, apiBase, token, fetchMaxChats]);

  // 3) socket handlers: new messages и readStatusUpdated
  useEffect(() => {
    if (!socket || !user) return undefined;

    const normalizeIdToNumber = (val) => {
      if (val == null) return NaN;
      return Number(String(val).replace(/^(?:room-|boss-|chat-|max-)/, ''));
    };

    const handleNewMessage = (payload) => {
      try {
        let kind, chatId, message;
        if (!payload) return;
        const payloadObj = typeof payload === 'object' ? payload : null;
        const payloadRoomId =
          payloadObj?.roomId ??
          payloadObj?.RoomId ??
          payloadObj?.dataValues?.roomId ??
          payloadObj?.dataValues?.RoomId;
        const payloadChatId =
          payloadObj?.chatId ??
          payloadObj?.ChatId ??
          payloadObj?.dataValues?.chatId ??
          payloadObj?.dataValues?.ChatId;

        if (typeof payload === 'object' && (payload.kind !== undefined || payload.chatId !== undefined || payload.roomId !== undefined)) {
          message = payload.message ?? payload;
          kind = payload.kind ?? (payload.chatId != null ? 'boss' : (payload.roomId != null ? 'room' : undefined));
          if (!kind && message) {
            if (message.chatId != null) kind = 'boss';
            else if (message.roomId != null) kind = 'room';
          }
          chatId = payload.chatId ?? payload.roomId ?? (message?.chatId ?? message?.roomId);
        } else {
          message = payload;
          if (message?.chatId != null || message?.ChatId != null || payloadChatId != null) {
            kind = 'boss';
            chatId = message?.chatId ?? message?.ChatId ?? payloadChatId;
          } else if (message?.roomId != null || message?.RoomId != null || payloadRoomId != null) {
            kind = 'room';
            chatId = message?.roomId ?? message?.RoomId ?? payloadRoomId;
          }
        }

        if (!kind) {
          if (payloadChatId != null) kind = 'boss';
          else if (payloadRoomId != null) kind = 'room';
        }
        if (chatId == null) {
          chatId = kind === 'boss' ? payloadChatId : payloadRoomId;
        }

        if (!chatId || !kind) {
          console.warn('[handleNewMessage] cannot determine kind/chatId from payload', payload);
          return;
        }

        const chatIdNum = normalizeIdToNumber(chatId);
        if (Number.isNaN(chatIdNum)) {
          console.warn('[handleNewMessage] bad chatId', chatId);
          return;
        }

        const messageIdNum = Number(message?.id) || 0;
        if (messageIdNum > 0) {
          const dedupeKey = `${kind}:${chatIdNum}:${messageIdNum}`;
          if (seenIncomingRef.current.has(dedupeKey)) {
            logUnread('socket:newMessage:dedupe-skip', {
              dedupeKey,
              messageId: messageIdNum,
            });
            return;
          }
          seenIncomingRef.current.add(dedupeKey);
          // Защита от бесконечного роста памяти
          if (seenIncomingRef.current.size > 5000) {
            const keys = Array.from(seenIncomingRef.current);
            for (let i = 0; i < 1000; i += 1) {
              const k = keys[i];
              if (k) seenIncomingRef.current.delete(k);
            }
          }
        }

        logUnread('socket:newMessage:received', {
          payloadKind: payload?.kind,
          resolvedKind: kind,
          chatId,
          chatIdNum,
          messageId: message?.id,
          messageRoomId: message?.roomId,
          messageChatId: message?.chatId,
          messageUserId: message?.userId ?? message?.User?.id ?? null,
          currentUserId: user?.id ?? null,
        });

        const msgUserId = Number(
          message?.userId ??
          message?.UserId ??
          message?.User?.id ??
          message?.dataValues?.userId ??
          message?.dataValues?.UserId ??
          0
        );
        const meId = Number(user?.id ?? 0);
        const isFromMe = msgUserId && (msgUserId === meId);
        const createdAt = message?.createdAt ? new Date(message.createdAt) : null;
        const tabIsActive = (() => {
          if (typeof document === 'undefined') return true;
          if (document.hidden) return false;
          if (typeof document.hasFocus === 'function' && !document.hasFocus()) return false;
          return true;
        })();

        setChats(prev => {
          try {
            let matched = false;
            const next = prev.map(c => {
              try {
                const cIdNum = normalizeIdToNumber(c.rawId ?? c.id);
                if (cIdNum !== chatIdNum || c.kind !== kind) return c;
                matched = true;

                const unreadPrev = Number(c.unread || 0);

                let routeOpen = false;
                // Надежный источник: текущий route, который пришел через props.
                if (kind === 'room') {
                  routeOpen = roomId != null && String(roomId) === String(chatIdNum);
                } else if (kind === 'boss') {
                  routeOpen = chatId != null && String(chatId) === String(chatIdNum);
                } else if (kind === 'max') {
                  routeOpen = maxId != null && String(maxId) === String(chatIdNum);
                }

                // Fallback только если route-пропсы пустые (например, на прямом открытии без синхронизации),
                // и только если URL реально указывает на текущий чат.
                if (!routeOpen) {
                  try {
                    const path = typeof window !== 'undefined' ? window.location?.pathname || '' : '';
                    const m = path.match(/^\/webchats\/([^/]+)\/([^/]+)/);
                    if (m) {
                      const pathKind = String(m[1] || '').toLowerCase();
                      const pathIdNum = normalizeIdToNumber(m[2]);
                      routeOpen = (pathKind === String(kind).toLowerCase() && pathIdNum === chatIdNum);
                    }
                  } catch (e) {
                    console.warn('[handleNewMessage] parse location error', e);
                  }
                }

                const display = message?.content ?? message?.transcriptionText ?? message?.text ?? message?.body
                  ?? (message?.fileName ? message.fileName : (message?.type ? `[${message.type}]` : ''));

                const updated = {
                  ...c,
                  lastMessage: typeof display === 'string' ? display : String(display ?? ''),
                  lastMessageRaw: message,
                  lastMessageAuthor: message?.User?.name ?? c.lastMessageAuthor,
                  lastMessageTime: message?.createdAt ?? message?.updatedAt ?? c.lastMessageTime,
                  updatedAt: message?.createdAt ?? c.updatedAt ?? c.updatedAt,
                };

                const routeOpenActive = routeOpen && tabIsActive;

                if (isFromMe) {
                  updated.unread = unreadPrev;
                  logUnread('socket:newMessage:update:fromMe', {
                    kind,
                    chatIdNum,
                    routeOpen,
                    routeOpenActive,
                    unreadPrev,
                    unreadNext: updated.unread,
                    messageId: message?.id,
                  });
                  return updated;
                }

                if (kind === 'boss') {
                  const lastReadMsgId = Number(c.lastReadMessageId ?? c.lastReadMessageIdRaw ?? 0) || 0;

                  if (lastReadMsgId > 0 && message?.id != null) {
                    const shouldInc = Number(message.id) > lastReadMsgId;
                    updated.unread = shouldInc ? (unreadPrev + 1) : unreadPrev;
                    logUnread('socket:newMessage:update:boss:lastReadId', {
                      kind,
                      chatIdNum,
                      routeOpen,
                      routeOpenActive,
                      unreadPrev,
                      unreadNext: updated.unread,
                      lastReadMsgId,
                      messageId: message?.id,
                      shouldInc,
                    });
                    return updated;
                  }

                  const lastReadAtIso = c.lastReadAt ?? c.lastReadAtRaw ?? null;
                  const lastReadAt = lastReadAtIso ? new Date(lastReadAtIso) : null;
                  const shouldIncByTime = !lastReadAt || (createdAt && createdAt > lastReadAt);

                  updated.unread = shouldIncByTime ? (unreadPrev + 1) : unreadPrev;
                  logUnread('socket:newMessage:update:boss:lastReadAt', {
                    kind,
                    chatIdNum,
                    routeOpen,
                    routeOpenActive,
                    unreadPrev,
                    unreadNext: updated.unread,
                    lastReadAtIso,
                    messageId: message?.id,
                    shouldIncByTime,
                  });
                  return updated;
                }

                updated.unread = unreadPrev + 1;
                logUnread('socket:newMessage:update:room', {
                  kind,
                  chatIdNum,
                  routeOpen,
                  routeOpenActive,
                  unreadPrev,
                  unreadNext: updated.unread,
                  messageId: message?.id,
                });
                return updated;
              } catch (inner) {
                console.error('[handleNewMessage] error in map callback for chat', c, inner);
                return c;
              }
            });

            if (!matched) {
              logUnread('socket:newMessage:chat-not-found', {
                kind,
                chatIdNum,
                messageId: message?.id ?? null,
              });
              fetchChats({ silent: true }).catch(() => {});
              return prev;
            }

            try {
              const total = calcTotalUnread(next);
              logUnread('socket:newMessage:totalUnreadAfter', { total });
              setTitleWithBadge(total);
            } catch (e) { console.warn('update title after handleNewMessage', e); }


            return next;
          } catch (mapErr) {
            console.error('[handleNewMessage] error while mapping prev->next', mapErr);
            return prev;
          }
        });
      } catch (e) {
        console.error('handleNewMessage top-level error', e);
      }
    };

    const handleReadStatusUpdated = (payload) => {
      try {
        if (!payload) return;
        const { roomId, chatId, userId: who } = payload;
        logUnread('socket:readStatusUpdated:received', {
          roomId,
          chatId,
          who,
          me: user?.id ?? null,
        });
        const targetId = roomId ?? chatId;
        if (!targetId) return;

        if (Number(who) === Number(user.id)) {
          setChats(prev => {
            const next = prev.map(c => {
              const cid = normalizeIdToNumber(c.rawId ?? c.id);
              if (String(cid) !== String(targetId)) return c;
              return { ...c, unread: 0 };
            });
            try {
            const total = calcTotalUnread(next);
            logUnread('socket:readStatusUpdated:totalUnreadAfter', {
              targetId,
              total,
            });
            setTitleWithBadge(total);
          } catch (e) { console.warn('update title after readStatusUpdated', e); }
            return next;
          });
        }
      } catch (e) {
        console.error('handleReadStatusUpdated error', e);
      }
    };

    socket.on('newRoomMessage', handleNewMessage);
    socket.on('newBossChatMessage', handleNewMessage);
    socket.on('readStatusUpdated', handleReadStatusUpdated);
    socket.on('readStatusUpdatedChat', handleReadStatusUpdated);

    return () => {
      try {
        socket.off('newRoomMessage', handleNewMessage);
        socket.off('newBossChatMessage', handleNewMessage);
        socket.off('readStatusUpdated', handleReadStatusUpdated);
        socket.off('readStatusUpdatedChat', handleReadStatusUpdated);
      } catch (e) { console.error('Socket cleanup error', e); }
    };
  }, [socket, user, calcTotalUnread, setTitleWithBadge, logUnread, roomId, chatId, maxId, fetchChats]); 


  // 3.5) socket handler для MAX чатов
  useEffect(() => {
    if (!socket || !user) return undefined;

    const onMaxNewMessage = (payload) => {
      try {
        const chatIdNum = Number(payload?.chatId || 0);
        const message = payload?.message;
        if (!chatIdNum || !message) return;

        logUnread('socket:max:new-message:received', {
          chatIdNum,
          messageId: message?.id,
          fromMe: message?.fromMe,
          senderId: message?.senderId,
          myId: user?.id,
          routeMaxId: maxId,
        });

        const meId = Number(user?.id || 0);
        const msgSenderId = Number(message?.senderId || 0);
        const isFromMe = message?.fromMe === true || (msgSenderId > 0 && msgSenderId === meId);
        const routeOpen = maxId != null && String(maxId) === String(chatIdNum);

        setMaxChats((prev) => {
          if (!Array.isArray(prev) || prev.length === 0) {
            fetchMaxChats(true).catch(() => {});
            return prev;
          }
          const existsInList = prev.some((c) => Number(String(c?.rawId ?? c?.id ?? '').replace(/^max-/, '')) === chatIdNum);
          if (!existsInList) {
            fetchMaxChats(true).catch(() => {});
            return prev;
          }

          const next = prev.map((c) => {
            const cId = Number(String(c?.rawId ?? c?.id ?? '').replace(/^max-/, ''));
            if (cId !== chatIdNum) return c;

            const unreadPrev = Number(c?.unread || 0);
            const textPreview =
              message?.text ||
              message?.content ||
              (message?.messageType === 'audio' ? 'Голосовое сообщение' :
                message?.messageType === 'image' ? 'Фото' :
                message?.messageType === 'video' ? 'Видео' :
                message?.messageType === 'document' ? 'Документ' :
                'Новое сообщение');

            return {
              ...c,
              unread: routeOpen || isFromMe ? 0 : (unreadPrev + 1),
              unreadCount: routeOpen || isFromMe ? 0 : (unreadPrev + 1),
              lastMessageText: textPreview,
              lastMessage: textPreview,
              lastMessageTime: message?.createdAt || c?.lastMessageTime || c?.updatedAt,
              updatedAt: message?.createdAt || c?.updatedAt,
              lastMessageRaw: {
                type: message?.messageType || 'text',
                content: textPreview,
                text: textPreview,
                body: textPreview,
                timestamp: message?.createdAt || null,
                User: { name: c?.username || c?.title || 'MAX' },
              },
            };
          });

          try {
            const total = calcTotalUnread(chats) + calcTotalUnread(next);
            setTitleWithBadge(total);
          } catch (e) {
            console.warn('[socket:max:new-message] title update error', e);
          }

          return next;
        });

        if (routeOpen && !isFromMe) {
          fetch(`${apiBase}/max/chats/${chatIdNum}/read`, {
            method: 'PUT',
            headers: token
              ? { Accept: 'application/json', Authorization: `Bearer ${token}` }
              : { Accept: 'application/json' },
            credentials: token ? 'omit' : 'include',
          }).catch(() => {});
        }
      } catch (e) {
        console.error('onMaxNewMessage error', e);
      }
    };

    socket.on('max:new-message', onMaxNewMessage);
    return () => {
      socket.off('max:new-message', onMaxNewMessage);
    };
  }, [socket, user, maxId, chats, calcTotalUnread, setTitleWithBadge, logUnread, apiBase, token, fetchMaxChats]);

  useEffect(() => {
    if (!socket) return undefined;
    const syncMembership = () => {
      fetchMaxChats(true).catch(() => {});
    };
    socket.on('max:chat-membership-updated', syncMembership);
    socket.on('max:chat-assigned', syncMembership);
    socket.on('max:chat-unassigned', syncMembership);
    return () => {
      socket.off('max:chat-membership-updated', syncMembership);
      socket.off('max:chat-assigned', syncMembership);
      socket.off('max:chat-unassigned', syncMembership);
    };
  }, [socket, fetchMaxChats]);
  // 4) Search effect (оставляем вашу логику)
  useEffect(() => {
    const normalizedQuery = (searchQuery || '').trim();
    let timer = null;
    const controller = new AbortController();

    if (!normalizedQuery) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(null);
      return () => { controller.abort(); clearTimeout(timer); };
    }

    setSearchLoading(true);
    setSearchError(null);

    timer = setTimeout(async () => {
      try {
        const apiBaseLocal = process.env.NEXT_PUBLIC_API_URL || '';
        let url = null;

        if (roomId) {
          url = `${apiBaseLocal}/web/rooms/${encodeURIComponent(roomId)}/messages?query=${encodeURIComponent(normalizedQuery)}`;
        } else if (chatId) {
          url = `${apiBaseLocal}/web/boss/chats/${encodeURIComponent(chatId)}/messages?query=${encodeURIComponent(normalizedQuery)}`;
        } else {
          url = `${apiBaseLocal}/web/messages/search?query=${encodeURIComponent(normalizedQuery)}`;
        }

        const res = await fetch(url, {
          method: 'GET',
          headers: token ? { Accept: 'application/json', Authorization: `Bearer ${token}` } : { Accept: 'application/json' },
          signal: controller.signal,
          credentials: token ? 'omit' : 'include',
        });

        if (!res.ok) throw new Error(`Search error ${res.status}`);
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.items || []);
        const normalizedItems = items.map(m => ({
          id: m.id ?? m._id ?? (m.messageId || null),
          roomId: m.roomId ?? m.room?.id ?? null,
          chatId: m.chatId ?? m.chat?.id ?? null,
          userName: m.User?.name ?? m.userName ?? m.author ?? (m.user?.name) ?? '—',
          date: m.createdAt ?? m.created_at ?? m.date ?? m.ts ?? null,
          text: m.content ?? m.text ?? m.body ?? m.message ?? '',
          raw: m,
        }));

        setSearchResults(normalizedItems);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('search fetch error', err);
        setSearchError(String(err));
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [searchQuery, roomId, chatId, token]);

  // ---------------- effect: следим за changes в chats и обновляем title ----------------
  useEffect(() => {
    const total = calcTotalUnread(chats) + calcTotalUnread(maxChats) + calcTotalUnread(telegramChats);
    logUnread('state:chats:changed', {
      totalUnread: total,
      totalChats: chats.length,
      sample: chats.slice(0, 10).map(c => ({
        id: c.id,
        rawId: c.rawId,
        kind: c.kind,
        unread: c.unread,
        title: c.title,
      })),
    });
    setTitleWithBadge(total);
  }, [chats, maxChats, telegramChats, calcTotalUnread, setTitleWithBadge, logUnread]);

  // ---------------- visibility: при возвращении в вкладку подгружаем authoritative данные ----------------
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        fetchChats().catch(e => console.warn('refresh on visible error', e));
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [fetchChats]);

  // ---------------- fallback sync: для room/boss unread без ручного F5 ----------------
  useEffect(() => {
    if (authLoading) return undefined;

    let isSyncing = false;
    const sync = async () => {
      if (isSyncing) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      isSyncing = true;
      try {
        await fetchChats({ silent: true });
      } catch (e) {
        console.warn('periodic chats sync failed', e);
      } finally {
        isSyncing = false;
      }
    };

    const onFocus = () => { sync().catch(() => {}); };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
      window.addEventListener('pageshow', onFocus);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('pageshow', onFocus);
      }
    };
  }, [authLoading, fetchChats]);

  useEffect(() => {
    if (!socket || !user?.id) return undefined;

    const onAlertsChanged = (payload) => {
      try {
        const me = Number(user.id);
        const target = Array.isArray(payload?.targetUserIds)
          ? payload.targetUserIds.map((v) => Number(v)).filter((v) => Number.isFinite(v))
          : [];
        if (target.length > 0 && !target.includes(me)) return;
        refreshAlertsBadge().catch(() => {});
      } catch (e) {
        console.warn('[alerts] socket handler failed', e);
      }
    };

    socket.on('alerts:changed', onAlertsChanged);
    return () => {
      socket.off('alerts:changed', onAlertsChanged);
    };
  }, [socket, user?.id, refreshAlertsBadge]);

  // ---------------- cleanup: восстановим оригинальный title при unmount ----------------
  useEffect(() => {
    const originalTitle = originalTitleRef.current;
    //console.log('originalTitle =  ', originalTitle)
    return () => {
      try { document.title = originalTitle || 'MyChatApp'; } catch (err) { console.warn(err) }
    };
  }, []);

  // ---------------- РЕНДЕР ----------------
  if (authLoading) return <div style={{ padding: 12 }}>Проверка авторизации...</div>;
  if (loading) return <div style={{ padding: 12 }}>Загрузка чатов...</div>;
  if (error) return <div style={{ padding: 12, color: 'red' }}>Ошибка: {error}</div>;

  if ((searchQuery || '').trim().length > 0) {
    const normalizedSearchQuery = (searchQuery || '').trim().toLowerCase();
    const getSearchTitle = (chat) => String(chat?.title || chat?.name || chat?.username || '').trim();
    const chatTitleResults = [
      ...chats.map((chat) => ({ type: String(chat?.kind || 'room'), id: String(chat?.rawId ?? chat?.id ?? '').replace(/^(?:room-|boss-|chat-)/, ''), title: getSearchTitle(chat), chat })),
      ...maxChats.map((chat) => ({ type: 'max', id: String(chat?.rawId ?? chat?.id ?? '').replace(/^max-/, ''), title: getSearchTitle(chat), chat })),
      ...telegramChats.map((chat) => ({ type: 'telegram', id: String(chat?.rawId ?? chat?.id ?? '').replace(/^telegram-/, ''), title: getSearchTitle(chat), chat })),
    ]
      .filter((item) => item.title.toLowerCase().includes(normalizedSearchQuery))
      .sort((a, b) => a.title.localeCompare(b.title, 'ru'));

    const openSearchChat = (item) => {
      const routeKind = item.type === 'boss' ? 'boss' : item.type;
      try {
        localStorage.setItem('orderSpace:lastChat', JSON.stringify({ kind: routeKind, rawId: String(item.id) }));
      } catch {}
      router.push(`/webchats/${encodeURIComponent(routeKind)}/${encodeURIComponent(String(item.id))}`);
    };

    if (searchLoading && chatTitleResults.length === 0) return <div style={{ padding: 12 }}>Идёт поиск...</div>;
    if (searchError && chatTitleResults.length === 0) return <div style={{ padding: 12, color: 'crimson' }}>Ошибка поиска: {searchError}</div>;
    if (!chatTitleResults.length && !searchResults.length) return <div style={{ padding: 12, color: '#666' }}>Ничего не найдено</div>;

    return (
      <div style={{ flex: 1, height: '100%', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
        {chatTitleResults.length > 0 && (
          <div>
            <div style={{ padding: '8px 12px', fontSize: 12, color: '#6b7280', background: '#f9fafb', borderBottom: '1px solid #eee' }}>
              Чаты
            </div>
            {chatTitleResults.map((item) => (
              <div
                key={`search-chat-${item.type}-${item.id}`}
                role="button"
                tabIndex={0}
                onClick={() => openSearchChat(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openSearchChat(item);
                  }
                }}
                style={{ padding: 12, borderBottom: '1px solid #eee', cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 700, color: '#111827' }}>{item.title}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>
                  {item.type === 'telegram' ? 'Telegram чат' : item.type === 'max' ? 'MAX чат' : item.type === 'boss' ? 'Админ чат' : 'Чат'}
                </div>
              </div>
            ))}
          </div>
        )}
        {searchResults.length > 0 && (
          <div style={{ padding: '8px 12px', fontSize: 12, color: '#6b7280', background: '#f9fafb', borderBottom: '1px solid #eee' }}>
            Сообщения
          </div>
        )}
        {searchResults.map(item => <SearchCard key={String(item.id) || Math.random()} item={item} />)}
        {searchLoading && (
          <div style={{ padding: 12, color: '#6b7280' }}>Идёт поиск в сообщениях...</div>
        )}
        {searchError && (
          <div style={{ padding: 12, color: 'crimson' }}>Ошибка поиска: {searchError}</div>
        )}
      </div>
    );
  }

  if (!chats.length && !maxChats.length && !telegramChats.length) return <div style={{ padding: 12, color: '#666' }}>Чатов не найдено</div>;

  const normalizeRawToKindAndId = (c) => {
    const rawString = String(c?.rawId ?? c?.id ?? '');
    const kind = c.kind
      ?? (rawString.startsWith('boss-') || rawString.startsWith('chat-') ? 'boss' : 'room');
    const raw = String(c.rawId ?? c.id ?? '');
    const m = raw.match(/(?:room-|boss-|chat-|max-)?(.+)$/);
    const id = m ? m[1] : raw;
    return { kind, id };
  };

  const getChatPinKey = (c) => {
    const { kind, id } = normalizeRawToKindAndId(c);
    return `${String(kind)}:${String(id)}`;
  };
  const parseNumericChatId = (val) => {
    const n = Number(String(val ?? '').replace(/^(?:room-|boss-|chat-|max-)/, ''));
    return Number.isFinite(n) ? n : NaN;
  };
  const pinnedSet = new Set(pinnedChatKeys);
  const importantSet = new Set(importantChatKeys);
  const pinnedSort = (a, b) => pinnedChatKeys.indexOf(getChatPinKey(a)) - pinnedChatKeys.indexOf(getChatPinKey(b));
  const isPinnedChat = (c) => pinnedSet.has(getChatPinKey(c));
  const isImportantChat = (c) => importantSet.has(getChatPinKey(c));

  const openChatContextMenu = (event, chat) => {
    event.preventDefault();
    event.stopPropagation();
    const pinKey = getChatPinKey(chat);
    setChatContextMenu({
      x: event.clientX,
      y: event.clientY,
      pinKey,
      isPinned: pinnedSet.has(pinKey),
      isImportant: importantSet.has(pinKey),
      canRename: String(chat?.kind || '') === 'room',
      canArchive: String(chat?.kind || '') === 'room',
      canDelete: String(chat?.kind || '') === 'room',
      archived: Boolean(chat?.archived),
      chatNumericId: parseNumericChatId(chat?.rawId ?? chat?.id),
      currentTitle: String(chat?.title || chat?.name || '').trim(),
    });
  };

  const openExternalChatContextMenu = (event, provider, chat) => {
    event.preventDefault();
    event.stopPropagation();

    const isTelegramChat = provider === 'telegram';
    const rawId = String(chat?.rawId ?? chat?.id ?? '').replace(/^(?:max-|telegram-)/, '');
    const isOwner = Boolean(chat?.isOwner ?? chat?.isAssignedToMe);
    const isParticipant = Boolean(chat?.isParticipant);
    const isPersonal = Boolean(chat?.isPersonal);
    const canManage = isOwner || isParticipant || isPersonal;
    if (!canManage) return;

    setChatContextMenu({
      x: event.clientX,
      y: event.clientY,
      type: provider,
      pinKey: `${provider}:${rawId}`,
      isPinned: pinnedSet.has(`${provider}:${rawId}`),
      isImportant: importantSet.has(`${provider}:${rawId}`),
      canPin: true,
      canRename: true,
      canArchive: true,
      canDelete: true,
      archived: Boolean(chat?.archived),
      chatNumericId: Number(rawId),
      rawId,
      currentTitle: String(chat?.title || chat?.username || (isTelegramChat ? 'Telegram чат' : 'MAX чат')).trim(),
    });
  };

  const togglePinByKey = (pinKey) => {
    setPinnedChatKeys((prev) => {
      const exists = prev.includes(pinKey);
      if (exists) return prev.filter((k) => k !== pinKey);
      return [pinKey, ...prev];
    });
    setChatContextMenu(null);
  };

  const toggleImportantByKey = (pinKey) => {
    setImportantChatKeys((prev) => {
      const exists = prev.includes(pinKey);
      if (exists) return prev.filter((k) => k !== pinKey);
      return [pinKey, ...prev];
    });
    setChatContextMenu(null);
  };

  const renameChatFromContextMenu = async () => {
    const menu = chatContextMenu;
    if (!menu || !menu.canRename) return;

    const roomId = Number(menu.chatNumericId);
    if (!Number.isFinite(roomId) || roomId <= 0) {
      setChatContextMenu(null);
      return;
    }

    const currentTitle = String(menu.currentTitle || '').trim();
    const nextTitleRaw = window.prompt('Новое название чата', currentTitle || '');
    if (nextTitleRaw == null) {
      setChatContextMenu(null);
      return;
    }

    const nextTitle = String(nextTitleRaw || '').trim();
    if (!nextTitle) {
      window.alert('Введите название чата');
      return;
    }
    if (nextTitle === currentTitle) {
      setChatContextMenu(null);
      return;
    }

    try {
      const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const resp = await fetch(`${apiBase}/admin/rooms/${encodeURIComponent(String(roomId))}`, {
        method: 'PUT',
        headers,
        credentials: token ? 'omit' : 'include',
        body: JSON.stringify({ name: nextTitle }),
      });

      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(payload?.message || `HTTP ${resp.status}`);
      }

      setChats((prev) =>
        prev.map((c) => {
          const cKind = String(c?.kind || '');
          const cId = parseNumericChatId(c?.rawId ?? c?.id);
          if (cKind !== 'room' || Number(cId) !== roomId) return c;
          return {
            ...c,
            title: nextTitle,
            name: nextTitle,
          };
        })
      );
      setChatContextMenu(null);
    } catch (err) {
      console.error('rename chat failed', err);
      window.alert(String(err?.message || 'Не удалось переименовать чат'));
    }
  };

  const archiveRoomFromContextMenu = async () => {
    const menu = chatContextMenu;
    if (!menu || !menu.canArchive) return;

    const roomId = Number(menu.chatNumericId);
    if (!Number.isFinite(roomId) || roomId <= 0) {
      setChatContextMenu(null);
      return;
    }

    const nextArchived = !Boolean(menu.archived);

    try {
      const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const resp = await fetch(`${apiBase}/app/rooms/${encodeURIComponent(String(roomId))}/archive`, {
        method: 'PUT',
        headers,
        credentials: token ? 'omit' : 'include',
        body: JSON.stringify({ archived: nextArchived }),
      });

      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(payload?.message || payload?.error || `HTTP ${resp.status}`);
      }

      setChats((prev) =>
        prev.map((c) => {
          const cKind = String(c?.kind || '');
          const cId = parseNumericChatId(c?.rawId ?? c?.id);
          if (cKind !== 'room' || Number(cId) !== roomId) return c;
          return { ...c, archived: nextArchived };
        })
      );
      if (nextArchived) setRoomArchiveExpanded(true);
      setChatContextMenu(null);
      if (nextArchived && pathname === `/webchats/room/${roomId}`) router.push('/webchats');
    } catch (err) {
      console.error('archive room chat failed', err);
      window.alert(String(err?.message || 'Не удалось изменить архив чата'));
    }
  };

  const deleteRoomFromContextMenu = async () => {
    const menu = chatContextMenu;
    if (!menu || !menu.canDelete) return;

    const roomId = Number(menu.chatNumericId);
    if (!Number.isFinite(roomId) || roomId <= 0) {
      setChatContextMenu(null);
      return;
    }

    const title = String(menu.currentTitle || 'чат').trim();
    const confirmed = window.confirm(`Удалить "${title}"?\n\nЧат будет скрыт у вас. История сохранится для других участников.`);
    if (!confirmed) {
      setChatContextMenu(null);
      return;
    }

    try {
      const headers = { Accept: 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const resp = await fetch(`${apiBase}/app/rooms/${encodeURIComponent(String(roomId))}`, {
        method: 'DELETE',
        headers,
        credentials: token ? 'omit' : 'include',
      });

      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(payload?.message || payload?.error || `HTTP ${resp.status}`);
      }

      setChats((prev) =>
        prev.filter((c) => {
          const cKind = String(c?.kind || '');
          const cId = parseNumericChatId(c?.rawId ?? c?.id);
          return !(cKind === 'room' && Number(cId) === roomId);
        })
      );
      setChatContextMenu(null);
      if (pathname === `/webchats/room/${roomId}`) router.push('/webchats');
    } catch (err) {
      console.error('delete room chat failed', err);
      window.alert(String(err?.message || 'Не удалось удалить чат'));
    }
  };

  const updateExternalChatState = (provider, rawId, updater) => {
    const setter = provider === 'telegram' ? setTelegramChats : setMaxChats;
    setter((prev) => prev.map((chat) => {
      const chatId = String(chat?.rawId ?? chat?.id ?? '').replace(/^(?:max-|telegram-)/, '');
      if (String(chatId) !== String(rawId)) return chat;
      return updater(chat);
    }));
  };

  const removeExternalChatState = (provider, rawId) => {
    const setter = provider === 'telegram' ? setTelegramChats : setMaxChats;
    setter((prev) => prev.filter((chat) => {
      const chatId = String(chat?.rawId ?? chat?.id ?? '').replace(/^(?:max-|telegram-)/, '');
      return String(chatId) !== String(rawId);
    }));
  };

  const getExternalEndpointPrefix = (provider) => provider === 'telegram' ? 'telegram' : 'max';

  const renameExternalChatFromContextMenu = async () => {
    const menu = chatContextMenu;
    if (!menu || !menu.type || !menu.canRename) return;
    const rawId = menu.rawId || menu.chatNumericId;
    if (!rawId) {
      setChatContextMenu(null);
      return;
    }

    const currentTitle = String(menu.currentTitle || '').trim();
    const nextTitleRaw = window.prompt('Новое название чата', currentTitle || '');
    if (nextTitleRaw == null) {
      setChatContextMenu(null);
      return;
    }

    const nextTitle = String(nextTitleRaw || '').trim();
    if (!nextTitle) {
      window.alert('Введите название чата');
      return;
    }
    if (nextTitle === currentTitle) {
      setChatContextMenu(null);
      return;
    }

    try {
      const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const prefix = getExternalEndpointPrefix(menu.type);
      const resp = await fetch(`${apiBase}/${prefix}/chats/${encodeURIComponent(String(rawId))}/rename`, {
        method: 'PUT',
        headers,
        credentials: token ? 'omit' : 'include',
        body: JSON.stringify({ username: nextTitle, title: nextTitle }),
      });

      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(payload?.error || payload?.message || `HTTP ${resp.status}`);
      }

      updateExternalChatState(menu.type, rawId, (chat) => ({
        ...chat,
        title: nextTitle,
        username: nextTitle,
      }));
      setChatContextMenu(null);
    } catch (err) {
      console.error('rename external chat failed', err);
      window.alert(String(err?.message || 'Не удалось переименовать чат'));
    }
  };

  const archiveExternalChatFromContextMenu = async () => {
    const menu = chatContextMenu;
    if (!menu || !menu.type || !menu.canArchive) return;
    const rawId = menu.rawId || menu.chatNumericId;
    if (!rawId) {
      setChatContextMenu(null);
      return;
    }

    const nextArchived = !Boolean(menu.archived);

    try {
      const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const prefix = getExternalEndpointPrefix(menu.type);
      const resp = await fetch(`${apiBase}/${prefix}/chats/${encodeURIComponent(String(rawId))}/archive`, {
        method: 'PUT',
        headers,
        credentials: token ? 'omit' : 'include',
        body: JSON.stringify({ archived: nextArchived }),
      });

      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(payload?.error || payload?.message || `HTTP ${resp.status}`);
      }

      updateExternalChatState(menu.type, rawId, (chat) => ({ ...chat, archived: nextArchived }));
      if (nextArchived) setFlatArchiveExpanded(true);
      setChatContextMenu(null);
      if (nextArchived && pathname === `/webchats/${menu.type}/${rawId}`) router.push('/webchats');
    } catch (err) {
      console.error('archive external chat failed', err);
      window.alert(String(err?.message || 'Не удалось изменить архив чата'));
    }
  };

  const deleteExternalChatFromContextMenu = async () => {
    const menu = chatContextMenu;
    if (!menu || !menu.type || !menu.canDelete) return;
    const rawId = menu.rawId || menu.chatNumericId;
    if (!rawId) {
      setChatContextMenu(null);
      return;
    }

    const title = String(menu.currentTitle || 'чат').trim();
    const confirmed = window.confirm(`Удалить "${title}"?\n\nЭто действие нельзя отменить.`);
    if (!confirmed) {
      setChatContextMenu(null);
      return;
    }

    try {
      const headers = { Accept: 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const prefix = getExternalEndpointPrefix(menu.type);
      const resp = await fetch(`${apiBase}/${prefix}/chats/${encodeURIComponent(String(rawId))}`, {
        method: 'DELETE',
        headers,
        credentials: token ? 'omit' : 'include',
      });

      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(payload?.error || payload?.message || `HTTP ${resp.status}`);
      }

      removeExternalChatState(menu.type, rawId);
      setChatContextMenu(null);
      if (pathname === `/webchats/${menu.type}/${rawId}`) router.push('/webchats');
    } catch (err) {
      console.error('delete external chat failed', err);
      window.alert(String(err?.message || 'Не удалось удалить чат'));
    }
  };

  const normalizeNumericId = (val) => {
    const n = Number(String(val ?? '').replace(/^(?:room-|boss-|chat-|max-)/, ''));
    return Number.isFinite(n) ? n : NaN;
  };

  const getChatNumericId = (chat) => {
    const parsedRaw = normalizeNumericId(chat?.rawId ?? chat?.id);
    if (!Number.isNaN(parsedRaw)) return parsedRaw;
    const parsedId = normalizeNumericId(chat?.id);
    return parsedId;
  };

  const archivedRoomChats = chats
    .filter((c) => c?.kind === 'room' && Boolean(c?.archived))
    .sort((a, b) => {
      const ta = Date.parse(b?.lastMessageTime || b?.updatedAt || b?.createdAt || '') || 0;
      const tb = Date.parse(a?.lastMessageTime || a?.updatedAt || a?.createdAt || '') || 0;
      return ta - tb;
    });
  const activeMainChats = chats.filter((c) => !(c?.kind === 'room' && Boolean(c?.archived)));
  const pinnedChats = activeMainChats.filter((c) => isPinnedChat(c)).sort(pinnedSort);
  const unpinnedChats = activeMainChats.filter((c) => !isPinnedChat(c));
  const roomPersonalChats = unpinnedChats.filter((c) => c?.kind === 'room' && String(c?.roomType || '').toLowerCase() === 'personal');
  const roomGroupChats = unpinnedChats.filter((c) => c?.kind === 'room' && String(c?.roomType || '').toLowerCase() !== 'personal');
  const nonRoomChats = unpinnedChats.filter((c) => c?.kind !== 'room');
  const alertsChat = nonRoomChats.find((c) => c?.kind === 'boss' && getChatNumericId(c) === ALERTS_BOSS_CHAT_ID) || null;
  const regularNonRoomChats = nonRoomChats.filter((c) => !(c?.kind === 'boss' && getChatNumericId(c) === ALERTS_BOSS_CHAT_ID));
  const adminBossChats = regularNonRoomChats.filter((c) => c?.kind === 'boss');
  const personalUnreadTotal = roomPersonalChats.reduce((s, c) => s + (Number(c?.unread || 0)), 0);
  const groupUnreadTotal = roomGroupChats.reduce((s, c) => s + (Number(c?.unread || 0)), 0);
  const adminBossUnreadTotal = adminBossChats.reduce((s, c) => s + (Number(c?.unread || 0)), 0);
  const archiveUnreadTotal = archivedRoomChats.reduce((s, c) => s + (Number(c?.unread || 0)), 0);
  const maxUnreadTotal = maxChats.reduce((s, c) => s + (Number(c?.unread || 0)), 0);
  const telegramUnreadTotal = telegramChats.reduce((s, c) => s + (Number(c?.unread || 0)), 0);
  const hasAnyRoomChats = roomPersonalChats.length > 0 || roomGroupChats.length > 0;
  const isOwnedRoomGroup = (chat) => (
    chat?.kind === 'room' &&
    String(chat?.roomType || '').toLowerCase() !== 'personal' &&
    (
      Number(chat?.creatorUserId || 0) === Number(user?.id || 0) ||
      Boolean(chat?.canDelete)
    )
  );
  const renderRoomParticipantsTitleAction = (chat) => {
    if (!isOwnedRoomGroup(chat)) return null;
    return (
      <button
        type="button"
        title="Участники группы"
        aria-label="Участники группы"
        onClick={(event) => {
          event.stopPropagation();
          openRoomParticipantsModal(chat);
        }}
        style={{
          width: 24,
          height: 24,
          border: 0,
          borderRadius: 999,
          background: '#eef2ff',
          color: '#4f46e5',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0,
          marginTop: 0,
          boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
        }}
      >
        <IoPeopleCircleOutline size={18} />
      </button>
    );
  };
  const parseRecentTs = (v) => {
    const t = Date.parse(v || '');
    return Number.isFinite(t) ? t : 0;
  };
  const getRecentSortValue = (item) => {
    const chat = item?.chat || item;
    return parseRecentTs(
      chat?.lastMessageTime ||
      chat?.updatedAt ||
      chat?.createdAt ||
      chat?.lastMessageRaw?.createdAt
    );
  };
  const sortedMaxChats = [...maxChats].sort(
    (a, b) => parseRecentTs(b?.lastMessageTime || b?.updatedAt || b?.createdAt) - parseRecentTs(a?.lastMessageTime || a?.updatedAt || a?.createdAt)
  );
  const archivedMaxChats = sortedMaxChats.filter((chat) => Boolean(chat?.archived));
  const activeMaxChats = sortedMaxChats.filter((chat) => !Boolean(chat?.archived));
  const personalMaxChats = activeMaxChats.filter((chat) => Boolean(chat?.isPersonal || chat?.botType === 'personal'));
  const sharedMaxChats = activeMaxChats.filter((chat) => !Boolean(chat?.isPersonal || chat?.botType === 'personal'));
  const ownerMaxChats = sharedMaxChats.filter((chat) => Boolean(chat?.isOwner ?? chat?.isAssignedToMe));
  const participantMaxChats = sharedMaxChats.filter((chat) => !Boolean(chat?.isOwner ?? chat?.isAssignedToMe) && Boolean(chat?.isParticipant));
  const otherMaxChats = sharedMaxChats.filter((chat) => !Boolean(chat?.isOwner ?? chat?.isAssignedToMe) && !Boolean(chat?.isParticipant));
  const managedMaxChats = activeMaxChats.filter((chat) => Boolean(chat?.isOwner ?? chat?.isAssignedToMe) || Boolean(chat?.isParticipant));
  const sortedTelegramChats = [...telegramChats].sort(
    (a, b) => parseRecentTs(b?.lastMessageTime || b?.updatedAt || b?.createdAt) - parseRecentTs(a?.lastMessageTime || a?.updatedAt || a?.createdAt)
  );
  const activeTelegramChats = sortedTelegramChats.filter((chat) => !chat?.archived);
  const archivedTelegramChats = sortedTelegramChats.filter((chat) => Boolean(chat?.archived));
  const sharedTelegramChats = activeTelegramChats.filter((chat) => !chat?.isPersonal);
  const isTelegramOwner = (chat) => Boolean(chat?.isOwner ?? chat?.isAssignedToMe);
  const otherWorkTelegramChats = sharedTelegramChats.filter((chat) => !isTelegramOwner(chat) && !chat?.isParticipant);
  const managedTelegramChats = activeTelegramChats.filter((chat) => Boolean(chat?.isPersonal) || isTelegramOwner(chat) || Boolean(chat?.isParticipant));
  const flatArchivedEntries = [
    ...archivedRoomChats.map((chat) => ({ type: 'chat', key: `archive-room-${getChatPinKey(chat)}`, chat, pinned: false })),
    ...archivedMaxChats.map((chat) => ({ type: 'max', key: `archive-max-${chat.rawId || chat.id}`, chat, pinned: false })),
    ...archivedTelegramChats.map((chat) => ({ type: 'telegram', key: `archive-telegram-${chat.rawId || chat.id}`, chat, pinned: false })),
  ].sort((a, b) => getRecentSortValue(b) - getRecentSortValue(a));
  const otherWorkEntries = [
    ...otherMaxChats.map((chat) => ({ type: 'max', key: `other-max-${chat.rawId || chat.id}`, chat, pinned: false })),
    ...otherWorkTelegramChats.map((chat) => ({ type: 'telegram', key: `other-telegram-${chat.rawId || chat.id}`, chat, pinned: false })),
  ].sort((a, b) => getRecentSortValue(b) - getRecentSortValue(a));
  const flatArchiveUnreadTotal = flatArchivedEntries.reduce((sum, entry) => sum + Number(entry?.chat?.unread || 0), 0);
  const otherWorkUnreadTotal = otherWorkEntries.reduce((sum, entry) => sum + Number(entry?.chat?.unread || 0), 0);
  const telegramChatSections = [
    {
      key: 'personal',
      title: 'Личные чаты',
      chats: activeTelegramChats.filter((chat) => Boolean(chat?.isPersonal)),
    },
    {
      key: 'participant',
      title: 'Вы участник',
      chats: sharedTelegramChats.filter((chat) => !isTelegramOwner(chat) && Boolean(chat?.isParticipant)),
    },
    {
      key: 'other',
      title: 'Остальные чаты',
      chats: otherWorkTelegramChats,
    },
    {
      key: 'owner',
      title: 'Вы владелец',
      chats: sharedTelegramChats.filter(isTelegramOwner),
    },
    {
      key: 'archive',
      title: 'Архив',
      chats: archivedTelegramChats,
    },
  ].filter((section) => section.chats.length > 0);
  const toggleTelegramSection = (sectionKey) => {
    setTelegramSectionsExpanded((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }));
  };

  const formatAlertsTime = (value) => formatChatTimeOrDate(value);

  const getAlertsSubtitle = (chat) => {
    if (!chat) return 'Нет оповещений';
    const raw = chat.lastMessageRaw || {};
    const text = raw.content ?? raw.transcriptionText ?? raw.text ?? raw.body ?? chat.lastMessage;
    if (typeof text === 'string' && text.trim()) return text.trim();
    if (raw.type === 'image') return 'Фото';
    if (raw.type === 'audio') return 'Голосовое сообщение';
    if (raw.type === 'file') return raw.fileName ? `Файл: ${raw.fileName}` : 'Файл';
    return 'Нет оповещений';
  };

  const openAlerts = () => {
    try {
      localStorage.setItem('orderSpace:lastChat', JSON.stringify({ kind: 'boss', rawId: String(ALERTS_BOSS_CHAT_ID) }));
    } catch (e) {
      console.warn('save lastChat alerts failed', e);
    }
    router.push('/webchats/alerts');
  };

  const renderProviderIcon = (provider, active = false) => {
    const isTelegram = provider === 'telegram';
    const bg = isTelegram ? '#229ED9' : 'linear-gradient(135deg, #1aa7ff 0%, #6b5cff 52%, #9b4dff 100%)';
    return (
      <div style={{
        width: isTelegram ? 42 : 44,
        height: isTelegram ? 42 : 44,
        borderRadius: isTelegram ? '50%' : 8,
        background: isTelegram ? bg : 'transparent',
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: active ? '0 0 0 2px rgba(255,255,255,0.42)' : 'none',
        overflow: 'hidden',
      }}>
        {isTelegram ? (
          <IoPaperPlaneOutline size={23} />
        ) : (
          <span
            aria-hidden="true"
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              backgroundImage: 'url(/images/max-logo.png)',
              backgroundSize: '170%',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
          />
        )}
      </div>
    );
  };

  const renderMaxChatRow = (chat) => {
    const { id: cId } = normalizeRawToKindAndId(chat);
    const isActive = maxId != null && String(maxId) === String(cId);
    const rawNumericId = Number(String(chat?.rawId ?? chat?.id ?? '').replace(/^max-/, ''));
    const importantKey = `max:${String(rawNumericId)}`;
    const isPinned = pinnedSet.has(importantKey);
    const isImportant = importantSet.has(importantKey);
    const busy = Boolean(maxMembershipBusyById[String(rawNumericId)]);
    const isOwner = Boolean(chat?.isOwner ?? chat?.isAssignedToMe);
    const isParticipant = Boolean(chat?.isParticipant);
    const isPersonal = Boolean(chat?.isPersonal || chat?.botType === 'personal');
    const hasAssignee = Number(chat?.assigneeId || 0) > 0;
    const assigneeLabel = isPersonal
      ? 'Личный чат'
      : isOwner
      ? 'Вы владелец'
      : (isParticipant
        ? 'Вы участник'
        : (hasAssignee ? `Владелец: ${chat?.assigneeName || `ID ${chat.assigneeId}`}` : 'Чат свободен'));
    const timePart = (() => {
      const v = chat?.lastMessageTime || chat?.updatedAt || null;
      if (!v) return '';
      return formatChatTimeOrDate(v);
    })();
    const statusBg = isPersonal ? '#111827' : (isOwner ? '#2e7d32' : (isParticipant ? '#2b7de9' : (hasAssignee ? '#6b7280' : '#9ca3af')));
    const rolePillStyle = {
      height: 28,
      padding: '0 12px',
      borderRadius: 999,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 12,
      fontWeight: 600,
      whiteSpace: 'nowrap',
      background: statusBg,
      color: '#fff',
    };
    const actionBtnBaseStyle = {
      height: 28,
      padding: '0 12px',
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 600,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      whiteSpace: 'nowrap',
      cursor: busy ? 'default' : 'pointer',
      opacity: busy ? 0.7 : 1,
      marginTop: '0px',
    };

    const openMaxChat = () => {
      try {
        localStorage.setItem('orderSpace:lastChat', JSON.stringify({ kind: 'max', rawId: String(rawNumericId) }));
      } catch {}
      router.push(`/webchats/max/${encodeURIComponent(String(rawNumericId))}`);
    };

    return (
      <div
        key={`max-${rawNumericId}`}
        role="button"
        tabIndex={0}
        onClick={openMaxChat}
        onContextMenu={(event) => openExternalChatContextMenu(event, 'max', chat)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openMaxChat();
          }
        }}
        style={{
          padding: 12,
          borderBottom: '1px solid #f5f5f5',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: isActive ? '#007AFF' : 'white',
          borderLeft: isActive ? '4px solid #060606ff' : '4px solid transparent',
          transition: 'background .12s ease, border-left .12s ease'
        }}
      >
        {renderProviderIcon('max', isActive)}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
              {!isPersonal && (
                <span style={{ position: 'relative', flexShrink: 0, width: 20, height: 16, marginRight: 6, display: 'inline-flex', alignItems: 'center' }}>
                  <IoPeopleOutline size={18} color={isActive ? '#fff' : '#007AFF'} />
                  <span style={{ position: 'absolute', right: -1, top: -5, fontSize: 12, lineHeight: 1, fontWeight: 700, color: isActive ? '#fff' : '#007AFF' }}>+</span>
                </span>
              )}
              <strong style={{
                fontSize: 14,
                color: isActive ? '#fff' : '#000',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {chat?.title || `MAX ${rawNumericId}`}
              </strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {isPinned && (
                <span title="Закрепленный чат" style={{ fontSize: 14, lineHeight: 1 }}>
                  📌
                </span>
              )}
              {isImportant && (
                <IoAlertCircleOutline
                  title="Отмеченный чат"
                  size={16}
                  color={isActive ? '#fff' : '#f59e0b'}
                  style={{ flexShrink: 0 }}
                />
              )}
              <span style={{ fontSize: 12, color: isActive ? '#fff' : '#888' }}>
                {timePart}
              </span>
            </div>
          </div>
          <div style={{
            marginTop: 6,
            fontSize: 13,
            color: isActive ? '#fff' : '#666',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {chat?.lastMessage || chat?.lastMessageText || 'Нет сообщений'}
          </div>
          <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={rolePillStyle}>
              {assigneeLabel}
            </span>
            {!isPersonal && !isOwner && !isParticipant && (
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  handleJoinMaxChat(rawNumericId);
                }}
                style={{
                  ...actionBtnBaseStyle,
                  border: 'none',
                  background: '#007AFF',
                  color: '#fff',
                  marginTop: '0px',
                }}
              >
                {busy ? '...' : 'Присоединиться'}
              </button>
            )}
            {!isPersonal && isParticipant && (
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  handleLeaveMaxChat(rawNumericId);
                }}
                style={{
                  ...actionBtnBaseStyle,
                  border: '1px solid #d33',
                  background: '#fff',
                  color: '#d33',
                }}
              >
                {busy ? '...' : 'Выйти'}
                </button>
              )}
            {!isPersonal && isOwner && (
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  openExternalInviteModal('max', chat);
                }}
                title="Пригласить сотрудника"
                style={{display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...actionBtnBaseStyle,
                  width: 28,
                  minWidth: 28,
                  padding: 0,
                  border: 0,
                  background: '#16a34a',
                  color: '#fff',
                  marginTop: '0px',
                  marginRight: '0px',
                }}
              >
                <IoPersonAddOutline size={18} />
              </button>
            )}

            {!isPersonal && isOwner && (
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  handleLeaveMaxChat(rawNumericId);
                }}
                style={{
                  ...actionBtnBaseStyle,
                  border: '1px solid #d9822b',
                  background: '#fff',
                  color: '#d9822b',
                  marginTop: '0px',
                }}
              >
                {busy ? '...' : 'Освободить чат'}
              </button>
            )}
          </div>
        </div>
        {Number(chat?.unread || 0) > 0 && (
          <div style={{
            marginLeft: 8,
            background: '#ff3b30',
            color: 'white',
            borderRadius: 12,
            padding: '2px 8px',
            fontSize: 12,
            flexShrink: 0
          }}>
            {Number(chat.unread)}
          </div>
        )}
      </div>
    );
  };

  const renderTelegramChatRow = (chat) => {
    const active = telegramId != null && String(telegramId) === String(chat.rawId);
    const busy = Boolean(telegramMembershipBusyById[String(chat.rawId)]);
    const hasAssignee = Number(chat.assigneeId || 0) > 0;
    const role = chat.isPersonal
      ? 'Личный чат'
      : chat.isOwner
        ? 'Вы владелец'
        : chat.isParticipant
          ? 'Вы участник'
          : hasAssignee
            ? `Владелец: ${chat.assigneeName || `ID ${chat.assigneeId}`}`
            : 'Чат свободен';
    const statusBg = chat.isPersonal
      ? '#0f766e'
      : chat.isOwner
        ? '#15803d'
        : chat.isParticipant
          ? '#2563eb'
          : hasAssignee
            ? '#6b7280'
            : '#9ca3af';
    const actionStyle = {
      height: 28,
      padding: '0 12px',
      borderRadius: 999,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 12,
      fontWeight: 600,
      whiteSpace: 'nowrap',
      cursor: busy ? 'default' : 'pointer',
      opacity: busy ? 0.7 : 1,
    };
    const timePart = (() => {
      const v = chat?.lastMessageTime || chat?.updatedAt || null;
      if (!v) return '';
      return formatChatTimeOrDate(v);
    })();
    const openTelegramChat = () => {
      try {
        localStorage.setItem('orderSpace:lastChat', JSON.stringify({ kind: 'telegram', rawId: String(chat.rawId) }));
      } catch {}
      router.push(`/webchats/telegram/${encodeURIComponent(String(chat.rawId))}`);
    };
    const importantKey = `telegram:${String(chat.rawId ?? chat.id).replace(/^telegram-/, '')}`;
    const isPinned = pinnedSet.has(importantKey);
    const isImportant = importantSet.has(importantKey);

    return (
      <div
        key={`telegram-${chat.id}`}
        role="button"
        tabIndex={0}
        onClick={openTelegramChat}
        onContextMenu={(event) => openExternalChatContextMenu(event, 'telegram', chat)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openTelegramChat();
          }
        }}
        style={{
          padding: 12,
          borderBottom: '1px solid #f5f5f5',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: active ? '#007AFF' : 'white',
          borderLeft: active ? '4px solid #060606ff' : '4px solid transparent',
          transition: 'background .12s ease, border-left .12s ease',
          color: active ? '#fff' : '#111827',
        }}
      >
        {renderProviderIcon('telegram', active)}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
              {!chat.isPersonal && (
                <span style={{ position: 'relative', flexShrink: 0, width: 20, height: 16, marginRight: 6, display: 'inline-flex', alignItems: 'center' }}>
                  <IoPeopleOutline size={18} color={active ? '#fff' : '#007AFF'} />
                  <span style={{ position: 'absolute', right: -1, top: -5, fontSize: 12, lineHeight: 1, fontWeight: 700, color: active ? '#fff' : '#007AFF' }}>+</span>
                </span>
              )}
              <strong style={{
                fontSize: 14,
                color: active ? '#fff' : '#111827',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {chat.title}
              </strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {isPinned && (
                <span title="Закрепленный чат" style={{ fontSize: 14, lineHeight: 1 }}>
                  📌
                </span>
              )}
              {isImportant && (
                <IoAlertCircleOutline
                  title="Отмеченный чат"
                  size={16}
                  color={active ? '#fff' : '#f59e0b'}
                  style={{ flexShrink: 0 }}
                />
              )}
              <span style={{ fontSize: 12, color: active ? '#fff' : '#888' }}>
                {timePart}
              </span>
            </div>
          </div>
          <div style={{
            marginTop: 6,
            fontSize: 13,
            color: active ? '#fff' : '#666',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {chat.archived ? '[Архив] ' : ''}{chat.lastMessageText || 'Нет сообщений'}
            </span>
            {chat.unread > 0 && (
              <span style={{
                width: 22,
                height: 22,
                minWidth: 22,
                color: '#fff',
                background: '#ff3b30',
                borderRadius: '50%',
                padding: 0,
                fontSize: 11,
                fontWeight: 700,
                lineHeight: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                {chat.unread > 99 ? '99+' : chat.unread}
              </span>
            )}
          </div>
          {!chat.isPersonal && (
          <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              ...actionStyle,
              cursor: 'default',
              opacity: 1,
              color: '#fff',
              background: statusBg,
            }}>
              {role}
            </span>
            {!chat.isPersonal && !chat.isOwner && !chat.isParticipant && (
              <button
                type="button"
                disabled={busy}
                onClick={(event) => {
                  event.stopPropagation();
                  changeTelegramMembership(chat.rawId, 'assign');
                }}
                style={{
                  ...actionStyle,
                  border: 0,
                  color: '#fff',
                  background: '#229ED9',
                  marginTop: '0px',
                }}
              >
                {busy ? '...' : (hasAssignee ? 'Присоединиться' : 'Взять чат')}
              </button>
            )}
            {!chat.isPersonal && chat.isParticipant && (
              <button
                type="button"
                disabled={busy}
                onClick={(event) => {
                  event.stopPropagation();
                  changeTelegramMembership(chat.rawId, 'unassign');
                }}
                style={{
                  ...actionStyle,
                  border: '1px solid #d33',
                  color: '#d33',
                  background: '#fff',
                }}
              >
                {busy ? '...' : 'Выйти'}
              </button>
            )}
            {!chat.isPersonal && chat.isOwner && (
              <button
                type="button"
                disabled={busy}
                onClick={(event) => {
                  event.stopPropagation();
                  openExternalInviteModal('telegram', chat);
                }}
                title="Пригласить сотрудника"
                style={{display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...actionStyle,
                  width: 28,
                  minWidth: 28,
                  padding: 0,
                  border: 0,
                  color: '#fff',
                  background: '#16a34a',
                  marginTop: '0px',
                  marginRight: 0,
                }}
              >
                <IoPersonAddOutline size={18} />
              </button>
            )}

            {!chat.isPersonal && chat.isOwner && (
              <button
                type="button"
                disabled={busy}
                onClick={(event) => {
                  event.stopPropagation();
                  changeTelegramMembership(chat.rawId, 'unassign');
                }}
                style={{
                  ...actionStyle,
                  border: '1px solid #d9822b',
                  color: '#d9822b',
                  background: '#fff',
                  marginTop: '0px',
                }}
              >
                {busy ? '...' : 'Освободить чат'}
              </button>
            )}
          </div>
          )}
        </div>
      </div>
    );
  };

  // SearchCard defined inline below (moved here to avoid hoisting issues)
  function SearchCard({ item }) {
    const date = item.date ? new Date(item.date) : null;
    const timeStr = date ? formatChatTime(date) : '';
    const dateStr = date ? formatChatDate(date) : '';

    const highlight = (text, q) => {
      if (!q) return text;
      const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
      return text.split(re).map((part, i) => re.test(part) ? <mark key={i} style={{ background: '#ffe58f' }}>{part}</mark> : <span key={i}>{part}</span>);
    };

    const handleClick = () => {
      if (typeof onMessageClick === 'function') {
        onMessageClick({ id: item.id, roomId: item.roomId, chatId: item.chatId, raw: item.raw });
      } else {
        try {
          const sel = `[data-message-id="${item.id}"]`;
          const el = document.querySelector(sel) || document.getElementById(`msg-${item.id}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('search-highlight');
            setTimeout(() => el.classList.remove('search-highlight'), 2200);
          }
        } catch (e) { console.warn('scroll to message error', e); }
      }
    };

    return (
      <div onClick={handleClick} style={{ padding: 10, borderBottom: '1px solid #eee', cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontWeight: 600 }}>{item.userName}</div>
          <div style={{ fontSize: 12, color: '#888' }}>{dateStr} {timeStr}</div>
        </div>
        <div style={{ color: '#333' }}>{highlight(item.text, (searchQuery || '').trim())}</div>
      </div>
    );
  }

  const flatChatEntries = [
    ...activeMainChats.map((chat) => ({
      type: 'chat',
      key: `chat-${getChatPinKey(chat)}`,
      chat,
      pinned: isPinnedChat(chat),
    })),
    ...managedMaxChats.map((chat) => ({
      type: 'max',
      key: `max-${chat.rawId || chat.id}`,
      chat,
      pinned: pinnedSet.has(`max:${String(chat.rawId || chat.id).replace(/^max-/, '')}`),
    })),
    ...managedTelegramChats.map((chat) => ({
      type: 'telegram',
      key: `telegram-flat-${chat.rawId || chat.id}`,
      chat,
      pinned: pinnedSet.has(`telegram:${String(chat.rawId || chat.id).replace(/^telegram-/, '')}`),
    })),
  ].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return getRecentSortValue(b) - getRecentSortValue(a);
  });

  const renderFlatChatEntry = (entry) => {
    if (entry.type === 'max') return renderMaxChatRow(entry.chat);
    if (entry.type === 'telegram') return renderTelegramChatRow(entry.chat);

    const c = entry.chat;
    const { kind: cKind, id: cId } = normalizeRawToKindAndId(c);
    const isActive =
      (cKind === 'room' && roomId != null && String(roomId) === String(cId)) ||
      (cKind === 'boss' && chatId != null && String(chatId) === String(cId)) ||
      (cKind === 'max' && maxId != null && String(maxId) === String(cId));
    return (
      <ChatCard
        key={entry.key}
        chat={c}
        lastMessage={c.lastMessageRaw ?? null}
        isActive={isActive}
        isPinned={entry.pinned}
        isImportant={isImportantChat(c)}
        onContextMenu={(event) => openChatContextMenu(event, c)}
        titleAction={renderRoomParticipantsTitleAction(c)}
      />
    );
  };

  const renderFlatSectionHeader = ({ title, count, unreadTotal, expanded, onToggle }) => (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggle();
        }
      }}
      style={{
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer',
        backgroundColor: expanded ? '#f5f5f5' : 'white',
        borderTop: '1px solid #e0e0e0',
        borderBottom: '1px solid #e0e0e0',
        fontWeight: 700,
        fontSize: '13px',
        textTransform: 'uppercase',
        letterSpacing: 0,
      }}
      aria-expanded={expanded}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <span style={{ fontSize: 12, color: '#888', textTransform: 'none' }}>({count})</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {unreadTotal > 0 && (
          <span style={{
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: '#ff3b30',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 6px',
            fontSize: 11,
            fontWeight: 700,
          }}>
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        )}
        <span style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: 11 }}>
          ▼
        </span>
      </div>
    </div>
  );


  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Основной список чатов */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {listView !== 'folders' ? (
          flatChatEntries.length > 0 || flatArchivedEntries.length > 0 || otherWorkEntries.length > 0 ? (
            <>
              {flatArchivedEntries.length > 0 && (
                <>
                  {renderFlatSectionHeader({
                    title: 'Архив',
                    count: flatArchivedEntries.length,
                    unreadTotal: flatArchiveUnreadTotal,
                    expanded: flatArchiveExpanded,
                    onToggle: () => setFlatArchiveExpanded((value) => !value),
                  })}
                  {flatArchiveExpanded && flatArchivedEntries.map(renderFlatChatEntry)}
                </>
              )}
              {otherWorkEntries.length > 0 && (
                <>
                  {renderFlatSectionHeader({
                    title: 'Другие рабочие чаты',
                    count: otherWorkEntries.length,
                    unreadTotal: otherWorkUnreadTotal,
                    expanded: flatOtherWorkExpanded,
                    onToggle: () => setFlatOtherWorkExpanded((value) => !value),
                  })}
                  {flatOtherWorkExpanded && otherWorkEntries.map(renderFlatChatEntry)}
                </>
              )}
              {flatChatEntries.map(renderFlatChatEntry)}
            </>
          ) : (
            <div style={{ padding: 12, color: '#666' }}>Чатов не найдено</div>
          )
        ) : (
          <>
        {pinnedChats.length > 0 && (
          <>
            <div
              style={{
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#f5f5f5',
                borderTop: '1px solid #e0e0e0',
                borderBottom: '1px solid #e0e0e0',
                fontWeight: 600,
                fontSize: '14px',
              }}
            >
              <span>Закрепленные</span>
              <span style={{ fontSize: '12px', color: '#888' }}>({pinnedChats.length})</span>
            </div>
            {pinnedChats.map((c) => {
              const { kind: cKind, id: cId } = normalizeRawToKindAndId(c);
              const isActive =
                (cKind === 'room' && roomId != null && String(roomId) === String(cId)) ||
                (cKind === 'boss' && chatId != null && String(chatId) === String(cId)) ||
                (cKind === 'max' && maxId != null && String(maxId) === String(cId));
              return (
                <ChatCard
                  key={`pinned-${c.id}`}
                  chat={c}
                  lastMessage={c.lastMessageRaw ?? null}
                  isActive={isActive}
                  isPinned
                  isImportant={isImportantChat(c)}
                  onContextMenu={(event) => openChatContextMenu(event, c)}
                  titleAction={renderRoomParticipantsTitleAction(c)}
                />
              );
            })}
          </>
        )}

        {/* Папка: Личные чаты */}
        {token && (
          <>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setPersonalRoomsExpanded((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setPersonalRoomsExpanded((v) => !v);
                }
              }}
              style={{
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                backgroundColor: personalRoomsExpanded ? '#f5f5f5' : 'white',
                borderTop: '1px solid #e0e0e0',
                borderBottom: '1px solid #e0e0e0',
                fontWeight: 600,
                fontSize: '14px',
              }}
              aria-expanded={personalRoomsExpanded}
              aria-label={personalRoomsExpanded ? 'Свернуть личные чаты' : 'Развернуть личные чаты'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Личные чаты</span>
                <span style={{ fontSize: '12px', color: '#888' }}>({roomPersonalChats.length})</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openRoomCreateModal('personal');
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                  style={{
                    height: 26,
                    padding: '0 9px',
                    border: 0,
                    borderRadius: 5,
                    background: '#2563eb',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    marginTop: '0px',
                  }}
                >
                  + Создать чат
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {personalUnreadTotal > 0 && (
                  <span style={{
                    minWidth: '18px',
                    height: '18px',
                    borderRadius: '9px',
                    backgroundColor: '#ff3b30',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 6px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}>
                    {personalUnreadTotal > 99 ? '99+' : personalUnreadTotal}
                  </span>
                )}
                <span style={{ transform: personalRoomsExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '11px' }}>
                  ▼
                </span>
              </div>
            </div>
            {personalRoomsExpanded && roomPersonalChats.map((c) => {
              const { kind: cKind, id: cId } = normalizeRawToKindAndId(c);
              const isActive =
                (cKind === 'room' && roomId != null && String(roomId) === String(cId)) ||
                (cKind === 'boss' && chatId != null && String(chatId) === String(cId)) ||
                (cKind === 'max' && maxId != null && String(maxId) === String(cId));
              return (
                <ChatCard
                  key={c.id}
                  chat={c}
                  lastMessage={c.lastMessageRaw ?? null}
                  isActive={isActive}
                  isPinned={isPinnedChat(c)}
                  isImportant={isImportantChat(c)}
                  onContextMenu={(event) => openChatContextMenu(event, c)}
                />
              );
            })}
          </>
        )}

        {/* Папка: Группы */}
        {token && (
          <>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setGroupRoomsExpanded((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setGroupRoomsExpanded((v) => !v);
                }
              }}
              style={{
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                backgroundColor: groupRoomsExpanded ? '#f5f5f5' : 'white',
                borderTop: '1px solid #e0e0e0',
                borderBottom: '1px solid #e0e0e0',
                fontWeight: 600,
                fontSize: '14px',
              }}
              aria-expanded={groupRoomsExpanded}
              aria-label={groupRoomsExpanded ? 'Свернуть группы' : 'Развернуть группы'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Группы</span>
                <span style={{ fontSize: '12px', color: '#888' }}>({roomGroupChats.length})</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openRoomCreateModal('group');
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                  style={{
                    height: 26,
                    padding: '0 9px',
                    border: 0,
                    borderRadius: 5,
                    background: '#16a34a',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    marginTop: '0px',
                  }}
                >
                  + Создать группу
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {groupUnreadTotal > 0 && (
                  <span style={{
                    minWidth: '18px',
                    height: '18px',
                    borderRadius: '9px',
                    backgroundColor: '#ff3b30',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 6px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}>
                    {groupUnreadTotal > 99 ? '99+' : groupUnreadTotal}
                  </span>
                )}
                <span style={{ transform: groupRoomsExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '11px' }}>
                  ▼
                </span>
              </div>
            </div>
            {groupRoomsExpanded && roomGroupChats.map((c) => {
              const { kind: cKind, id: cId } = normalizeRawToKindAndId(c);
              const isActive =
                (cKind === 'room' && roomId != null && String(roomId) === String(cId)) ||
                (cKind === 'boss' && chatId != null && String(chatId) === String(cId)) ||
                (cKind === 'max' && maxId != null && String(maxId) === String(cId));
              return (
                <div key={c.id} style={{ position: 'relative' }}>
                  <ChatCard
                    chat={c}
                    lastMessage={c.lastMessageRaw ?? null}
                    isActive={isActive}
                    isPinned={isPinnedChat(c)}
                    isImportant={isImportantChat(c)}
                    onContextMenu={(event) => openChatContextMenu(event, c)}
                    titleAction={renderRoomParticipantsTitleAction(c)}
                  />
                </div>
              );
            })}
          </>
        )}

        {/* Папка: Админ чаты */}
        {token && adminBossChats.length > 0 && (
          <>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setAdminChatsExpanded((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setAdminChatsExpanded((v) => !v);
                }
              }}
              style={{
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                backgroundColor: adminChatsExpanded ? '#f5f5f5' : 'white',
                borderTop: '1px solid #e0e0e0',
                borderBottom: '1px solid #e0e0e0',
                fontWeight: 600,
                fontSize: '14px',
              }}
              aria-expanded={adminChatsExpanded}
              aria-label={adminChatsExpanded ? 'Свернуть админ чаты' : 'Развернуть админ чаты'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Админ чаты</span>
                <span style={{ fontSize: '12px', color: '#888' }}>({adminBossChats.length})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {adminBossUnreadTotal > 0 && (
                  <span style={{
                    minWidth: '18px',
                    height: '18px',
                    borderRadius: '9px',
                    backgroundColor: '#ff3b30',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 6px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}>
                    {adminBossUnreadTotal > 99 ? '99+' : adminBossUnreadTotal}
                  </span>
                )}
                <span style={{ transform: adminChatsExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '11px' }}>
                  ▼
                </span>
              </div>
            </div>
            {adminChatsExpanded && adminBossChats.map((c) => {
              const { kind: cKind, id: cId } = normalizeRawToKindAndId(c);
              const isActive =
                (cKind === 'boss' && chatId != null && String(chatId) === String(cId));
              return (
                <ChatCard
                  key={c.id}
                  chat={c}
                  lastMessage={c.lastMessageRaw ?? null}
                  isActive={isActive}
                  isPinned={isPinnedChat(c)}
                  isImportant={isImportantChat(c)}
                  onContextMenu={(event) => openChatContextMenu(event, c)}
                />
              );
            })}
          </>
        )}

        {alertsChat && (
          <div
            role="button"
            tabIndex={0}
            onClick={openAlerts}
            onContextMenu={(event) => openChatContextMenu(event, alertsChat)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openAlerts();
              }
            }}
            aria-current={pathname === '/webchats/alerts' ? 'true' : undefined}
            style={{
              padding: 12,
              borderBottom: '1px solid #f5f5f5',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: pathname === '/webchats/alerts' ? '#007AFF' : 'white',
              borderLeft: pathname === '/webchats/alerts' ? '4px solid #060606ff' : '4px solid transparent',
              transition: 'background .12s ease, border-left .12s ease'
            }}
          >
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              backgroundColor: pathname === '/webchats/alerts' ? '#ffffff33' : '#e97b28',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: 20,
            }}>
              🔔
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <strong style={{
                    fontSize: 14,
                    color: pathname === '/webchats/alerts' ? '#fff' : '#000',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {alertsChat.title || 'ОПОВЕЩЕНИЯ'}
                  </strong>
                  {Number(alertsChat.unread || 0) > 0 && (
                    <span style={{
                      background: '#ff3b30',
                      color: 'white',
                      borderRadius: 12,
                      padding: '2px 8px',
                      fontSize: 12,
                      flexShrink: 0
                    }}>
                      {Number(alertsChat.unread || 0)}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: pathname === '/webchats/alerts' ? '#fff' : '#888' }}>
                  {isImportantChat(alertsChat) && (
                    <IoAlertCircleOutline
                      title="Отмеченный чат"
                      size={16}
                      color={pathname === '/webchats/alerts' ? '#fff' : '#f59e0b'}
                      style={{ flexShrink: 0 }}
                    />
                  )}
                  <span>{formatAlertsTime(alertsChat.lastMessageTime ?? alertsChat.updatedAt)}</span>
                </div>
              </div>
              <div style={{
                marginTop: 6,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8
              }}>
                <span style={{
                  fontSize: 13,
                  color: pathname === '/webchats/alerts' ? '#fff' : '#666',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {getAlertsSubtitle(alertsChat)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Папка: Архив room-чатов */}
        {token && archivedRoomChats.length > 0 && (
          <>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setRoomArchiveExpanded((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setRoomArchiveExpanded((v) => !v);
                }
              }}
              style={{
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                backgroundColor: roomArchiveExpanded ? '#f5f5f5' : 'white',
                borderTop: '1px solid #e0e0e0',
                borderBottom: '1px solid #e0e0e0',
                fontWeight: 600,
                fontSize: '14px',
              }}
              aria-expanded={roomArchiveExpanded}
              aria-label={roomArchiveExpanded ? 'Свернуть архив' : 'Развернуть архив'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Архив</span>
                <span style={{ fontSize: '12px', color: '#888' }}>({archivedRoomChats.length})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {archiveUnreadTotal > 0 && (
                  <span style={{
                    minWidth: '18px',
                    height: '18px',
                    borderRadius: '9px',
                    backgroundColor: '#ff3b30',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 6px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}>
                    {archiveUnreadTotal > 99 ? '99+' : archiveUnreadTotal}
                  </span>
                )}
                <span style={{ transform: roomArchiveExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '11px' }}>
                  ▼
                </span>
              </div>
            </div>
            {roomArchiveExpanded && archivedRoomChats.map((c) => {
              const { kind: cKind, id: cId } = normalizeRawToKindAndId(c);
              const isActive =
                cKind === 'room' && roomId != null && String(roomId) === String(cId);
              return (
                <ChatCard
                  key={`archive-${c.id}`}
                  chat={c}
                  lastMessage={c.lastMessageRaw ?? null}
                  isActive={isActive}
                  isPinned={isPinnedChat(c)}
                  isImportant={isImportantChat(c)}
                  onContextMenu={(event) => openChatContextMenu(event, c)}
                  titleAction={renderRoomParticipantsTitleAction(c)}
                />
              );
            })}
          </>
        )}

        {/* Папка: ЧАТЫ TELEGRAM */}
        {hasTelegramAccess && (
          <>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setTelegramChatsExpanded((value) => !value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setTelegramChatsExpanded((value) => !value);
                }
              }}
              style={{
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                backgroundColor: telegramChatsExpanded ? '#f5f5f5' : '#fff',
                borderTop: '1px solid #e0e0e0',
                borderBottom: '1px solid #e0e0e0',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>ЧАТЫ TELEGRAM</span>
                <span style={{ fontSize: 12, color: '#888' }}>({telegramChats.length})</span>
                <button
                  type="button"
                  disabled={telegramInviteBusy}
                  onClick={(event) => {
                    event.stopPropagation();
                    createTelegramPersonalInvite();
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                  style={{
                    height: 26,
                    padding: '0 9px',
                    border: 0,
                    borderRadius: 5,
                    background: '#7c3aed',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: telegramInviteBusy ? 'default' : 'pointer',
                    opacity: telegramInviteBusy ? 0.7 : 1,
                    whiteSpace: 'nowrap',
                    marginTop: 0,
                  }}
                >
                  {telegramInviteBusy ? '...' : '+ Создать личный чат'}
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {telegramUnreadTotal > 0 && (
                  <span style={{
                    minWidth: 18,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: '#ff3b30',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}>
                    {telegramUnreadTotal > 99 ? '99+' : telegramUnreadTotal}
                  </span>
                )}
                <span style={{
                  transform: telegramChatsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                  fontSize: 11,
                }}>
                  ▼
                </span>
              </div>
            </div>
            {telegramChatsExpanded && (
              <div>
                {loadingTelegramChats ? (
                  <div style={{ padding: 16, textAlign: 'center', color: '#888' }}>
                    Загрузка чатов Telegram...
                  </div>
                ) : telegramChats.length === 0 ? (
                  <div style={{ padding: 16, textAlign: 'center', color: '#888' }}>
                    Нет чатов Telegram
                  </div>
                ) : telegramChatSections.map((section) => {
                  const sectionExpanded = Boolean(telegramSectionsExpanded[section.key]);
                  return (
                    <React.Fragment key={`telegram-section-${section.key}`}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleTelegramSection(section.key)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            toggleTelegramSection(section.key);
                          }
                        }}
                        aria-expanded={sectionExpanded}
                        style={{
                          padding: '7px 12px',
                          borderTop: '1px solid #eee',
                          borderBottom: '1px solid #eee',
                          background: '#fafafa',
                          color: '#666',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>{section.title} ({section.chats.length})</span>
                        <span style={{
                          transform: sectionExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s',
                          fontSize: 10,
                        }}>
                          ▼
                        </span>
                      </div>
                      {sectionExpanded && section.chats.map((chat) => {
                    const active = telegramId != null && String(telegramId) === String(chat.rawId);
                    const busy = Boolean(telegramMembershipBusyById[String(chat.rawId)]);
                    const hasAssignee = Number(chat.assigneeId || 0) > 0;
                    const role = chat.isPersonal
                      ? 'Личный чат'
                      : chat.isOwner
                      ? 'Вы владелец'
                      : chat.isParticipant
                        ? 'Вы участник'
                        : chat.assigneeId
                          ? `Владелец: ${chat.assigneeName || chat.assigneeId}`
                          : 'Чат свободен';
                    const openTelegramChat = () => {
                      try {
                        localStorage.setItem('orderSpace:lastChat', JSON.stringify({
                          kind: 'telegram',
                          rawId: String(chat.rawId),
                        }));
                      } catch {}
                      router.push(`/webchats/telegram/${encodeURIComponent(chat.rawId)}`);
                    };
                    const statusBg = chat.isPersonal
                      ? '#7c3aed'
                      : chat.isOwner
                      ? '#2e7d32'
                      : (chat.isParticipant ? '#2b7de9' : (hasAssignee ? '#6b7280' : '#9ca3af'));
                    const actionStyle = {
                      height: 28,
                      padding: '0 12px',
                      borderRadius: 999,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      cursor: busy ? 'default' : 'pointer',
                      opacity: busy ? 0.7 : 1,
                    };
                    return (
                      <div
                        key={`telegram-${chat.id}`}
                        role="button"
                        tabIndex={0}
                        onClick={openTelegramChat}
                        onContextMenu={(event) => openExternalChatContextMenu(event, 'telegram', chat)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openTelegramChat();
                          }
                        }}
                        style={{
                          width: '100%',
                          borderBottom: '1px solid #eee',
                          background: active ? '#eaf4ff' : '#fff',
                          padding: '10px 14px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          color: '#111827',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
                            {!chat.isPersonal && (
                              <span style={{ position: 'relative', flexShrink: 0, width: 20, height: 16, marginRight: 6, display: 'inline-flex', alignItems: 'center' }}>
                                <IoPeopleOutline size={18} color="#007AFF" />
                                <span style={{ position: 'absolute', right: -1, top: -5, fontSize: 12, lineHeight: 1, fontWeight: 700, color: '#007AFF' }}>+</span>
                              </span>
                            )}
                            <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#111827' }}>{chat.title}</strong>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            {importantSet.has(`telegram:${String(chat.rawId ?? chat.id).replace(/^telegram-/, '')}`) && (
                              <IoAlertCircleOutline
                                title="Отмеченный чат"
                                size={16}
                                color="#f59e0b"
                                style={{ flexShrink: 0 }}
                              />
                            )}
                            {pinnedSet.has(`telegram:${String(chat.rawId ?? chat.id).replace(/^telegram-/, '')}`) && (
                              <span title="Закрепленный чат" style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>
                                📌
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ marginTop: 4, color: '#666', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {chat.archived ? '[Архив] ' : ''}{chat.lastMessageText || 'Нет сообщений'}
                          </span>
                          {chat.unread > 0 && (
                            <span style={{
                              width: 22,
                              height: 22,
                              minWidth: 22,
                              color: '#fff',
                              background: '#ff3b30',
                              borderRadius: '50%',
                              padding: 0,
                              fontSize: 11,
                              fontWeight: 700,
                              lineHeight: 1,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}>
                              {chat.unread > 99 ? '99+' : chat.unread}
                            </span>
                          )}
                        </div>
                        {!chat.isPersonal && (
                        <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{
                            ...actionStyle,
                            cursor: 'default',
                            opacity: 1,
                            color: '#fff',
                            background: statusBg,
                          }}>
                            {role}
                          </span>
                          {!chat.isPersonal && !chat.isOwner && !chat.isParticipant && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={(event) => {
                                event.stopPropagation();
                                changeTelegramMembership(chat.rawId, 'assign');
                              }}
                              style={{
                                ...actionStyle,
                                border: 0,
                                color: '#fff',
                                background: '#229ED9',
                                marginTop: 0,
                              }}
                            >
                              {busy ? '...' : (hasAssignee ? 'Присоединиться' : 'Взять чат')}
                            </button>
                          )}
                          {!chat.isPersonal && chat.isParticipant && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={(event) => {
                                event.stopPropagation();
                                changeTelegramMembership(chat.rawId, 'unassign');
                              }}
                              style={{
                                ...actionStyle,
                                border: '1px solid #d33',
                                color: '#d33',
                                background: '#fff',
                              }}
                            >
                              {busy ? '...' : 'Выйти'}
                            </button>
                          )}
            {!chat.isPersonal && chat.isOwner && (
              <button
                type="button"
                disabled={busy}
                onClick={(event) => {
                  event.stopPropagation();
                  openExternalInviteModal('telegram', chat);
                }}
                title="Пригласить сотрудника"
                style={{display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...actionStyle,
                  width: 28,
                  minWidth: 28,
                  padding: 0,
                  border: 0,
                  color: '#fff',
                  background: '#16a34a',
                  marginTop: '0px',
                  marginRight: 0,
                }}
              >
                <IoPersonAddOutline size={18} />
              </button>
            )}

                          {!chat.isPersonal && chat.isOwner && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={(event) => {
                                event.stopPropagation();
                                changeTelegramMembership(chat.rawId, 'unassign');
                              }}
                              style={{
                                ...actionStyle,
                                border: '1px solid #d9822b',
                                color: '#d9822b',
                                background: '#fff',
                                marginTop: 0,
                              }}
                            >
                              {busy ? '...' : 'Освободить чат'}
                            </button>
                          )}
                        </div>
                        )}
                      </div>
                    );
                      })}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Папка: ЧАТЫ MAX */}
        {hasMaxAccess && (hasAnyRoomChats || nonRoomChats.length > 0 || maxChats.length > 0) && (
          <>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setMaxChatsExpanded((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setMaxChatsExpanded((v) => !v);
                }
              }}
              style={{
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                backgroundColor: maxChatsExpanded ? '#f5f5f5' : 'white',
                borderTop: '1px solid #e0e0e0',
                borderBottom: '1px solid #e0e0e0',
                fontWeight: 600,
                fontSize: '14px',
              }}
              aria-expanded={maxChatsExpanded}
              aria-label={maxChatsExpanded ? 'Свернуть чаты Max' : 'Развернуть чаты Max'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>ЧАТЫ MAX</span>
                <span style={{ fontSize: '12px', color: '#888' }}>({maxChats.length})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {maxUnreadTotal > 0 && (
                  <span style={{
                    minWidth: '18px',
                    height: '18px',
                    borderRadius: '9px',
                    backgroundColor: '#ff3b30',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 6px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}>
                    {maxUnreadTotal > 99 ? '99+' : maxUnreadTotal}
                  </span>
                )}
                <span style={{ transform: maxChatsExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '11px' }}>
                  ▼
                </span>
              </div>
            </div>

            {maxChatsExpanded && (
              <>
                {loadingMaxChats ? (
                  <div style={{ 
                    padding: '16px', 
                    textAlign: 'center', 
                    color: '#888',
                    fontSize: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <div style={{ 
                      width: '20px', 
                      height: '20px', 
                      border: '2px solid #f3f3f3',
                      borderTop: '2px solid #007AFF',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }} />
                    <style>{`
                      @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                      }
                    `}</style>
                    Загрузка чатов Max...
                  </div>
                ) : error ? (
                  <div style={{ 
                    padding: '16px', 
                    textAlign: 'center', 
                    color: '#ff3b30',
                    fontSize: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div>{error}</div>
                    <button 
                      onClick={handleRefreshMaxChats}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#007AFF',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        alignSelf: 'center',
                      }}
                    >
                      Повторить попытку
                    </button>
                  </div>
                ) : maxChats.length === 0 ? (
                  <div style={{ 
                    padding: '16px', 
                    textAlign: 'center', 
                    color: '#888',
                    fontSize: '14px'
                  }}>
                    Нет доступных чатов Max
                  </div>
                ) : (
                  <>
                    {personalMaxChats.length > 0 && (
                      <>
                        <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700, color: '#666', background: '#fafafa', borderTop: '1px solid #eee', borderBottom: '1px solid #eee' }}>
                          Личные чаты ({personalMaxChats.length})
                        </div>
                        {personalMaxChats.map(renderMaxChatRow)}
                      </>
                    )}

                    {participantMaxChats.length > 0 && (
                      <>
                        <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700, color: '#666', background: '#fafafa', borderTop: '1px solid #eee', borderBottom: '1px solid #eee' }}>
                          Вы участник ({participantMaxChats.length})
                        </div>
                        {participantMaxChats.map(renderMaxChatRow)}
                      </>
                    )}
                    {otherMaxChats.length > 0 && (
                      <>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setMaxOtherChatsExpanded((v) => !v)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setMaxOtherChatsExpanded((v) => !v);
                            }
                          }}
                          style={{
                            padding: '8px 12px',
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#666',
                            background: '#fafafa',
                            borderTop: '1px solid #eee',
                            borderBottom: '1px solid #eee',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <span>Остальные чаты ({otherMaxChats.length})</span>
                          <span style={{ fontSize: 10 }}>{maxOtherChatsExpanded ? '▼' : '▶'}</span>
                        </div>
                        {maxOtherChatsExpanded && otherMaxChats.map(renderMaxChatRow)}
                      </>
                    )}
                    {ownerMaxChats.length > 0 && (
                      <>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setMaxOwnerChatsExpanded((value) => !value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setMaxOwnerChatsExpanded((value) => !value);
                            }
                          }}
                          aria-expanded={maxOwnerChatsExpanded}
                          style={{
                            padding: '8px 12px',
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#666',
                            background: '#fafafa',
                            borderTop: '1px solid #eee',
                            borderBottom: '1px solid #eee',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <span>Вы владелец ({ownerMaxChats.length})</span>
                          <span style={{ fontSize: 10 }}>{maxOwnerChatsExpanded ? '▼' : '▶'}</span>
                        </div>
                        {maxOwnerChatsExpanded && ownerMaxChats.map(renderMaxChatRow)}
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
          </>
        )}
      </div>

      {roomCreateModal && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRoomCreateModal();
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2100,
            background: 'rgba(0,0,0,0.38)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div style={{
            width: 'min(460px, 100%)',
            maxHeight: '80vh',
            background: '#fff',
            borderRadius: 8,
            boxShadow: '0 18px 48px rgba(0,0,0,0.22)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '14px 16px',
              borderBottom: '1px solid #e5e7eb',
              fontSize: 16,
              fontWeight: 700,
              color: '#111827',
            }}>
              {roomCreateModal === 'personal' ? 'Создать личный чат' : 'Создать группу'}
            </div>

            {roomCreateModal === 'group' && (
              <div style={{ padding: '12px 16px 0' }}>
                <input
                  value={roomCreateName}
                  onChange={(event) => setRoomCreateName(event.target.value)}
                  placeholder="Название группы"
                  maxLength={80}
                  style={{
                    width: '100%',
                    height: 40,
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    padding: '0 11px',
                    fontSize: 14,
                    color: '#111827',
                  }}
                />
              </div>
            )}

            <div style={{ padding: '12px 16px 8px', color: '#6b7280', fontSize: 13 }}>
              {roomCreateModal === 'personal'
                ? 'Выберите сотрудника'
                : 'Выберите участников группы'}
            </div>

            <div style={{ overflowY: 'auto', padding: '0 16px', minHeight: 80 }}>
              {roomCreateLoading ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>
                  Загрузка сотрудников...
                </div>
              ) : roomCreateUsers.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>
                  Нет доступных сотрудников
                </div>
              ) : roomCreateUsers.map((createUser) => {
                const userId = Number(createUser.id);
                const selected = roomCreateSelectedIds.includes(userId);
                return (
                  <label
                    key={userId}
                    style={{
                      minHeight: 42,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      borderBottom: '1px solid #f0f0f0',
                      cursor: 'pointer',
                      color: '#111827',
                    }}
                  >
                    <input
                      type={roomCreateModal === 'personal' ? 'radio' : 'checkbox'}
                      name={roomCreateModal === 'personal' ? 'personal-room-user' : undefined}
                      checked={selected}
                      onChange={() => {
                        setRoomCreateSelectedIds((current) => roomCreateModal === 'personal'
                          ? [userId]
                          : current.includes(userId)
                            ? current.filter((id) => id !== userId)
                            : [...current, userId]);
                      }}
                    />
                    <span>{createUser.name}</span>
                  </label>
                );
              })}
            </div>

            {roomCreateError && (
              <div style={{ padding: '10px 16px 0', color: '#dc2626', fontSize: 13 }}>
                {roomCreateError}
              </div>
            )}

            <div style={{
              padding: 16,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              borderTop: '1px solid #e5e7eb',
              marginTop: 12,
            }}>
              <button
                type="button"
                disabled={roomCreateSaving}
                onClick={closeRoomCreateModal}
                style={{
                  height: 36,
                  padding: '0 14px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  background: '#fff',
                  color: '#374151',
                  cursor: 'pointer',
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={roomCreateLoading || roomCreateSaving}
                onClick={submitRoomCreate}
                style={{
                  height: 36,
                  padding: '0 14px',
                  border: 0,
                  borderRadius: 6,
                  background: roomCreateModal === 'personal' ? '#2563eb' : '#16a34a',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: roomCreateSaving ? 'default' : 'pointer',
                  opacity: roomCreateLoading || roomCreateSaving ? 0.65 : 1,
                }}
              >
                {roomCreateSaving ? 'Создание...' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}

      <RoomParticipantsModal
        visible={Boolean(roomParticipantsModal)}
        apiBase={apiBase}
        token={token}
        roomId={String(roomParticipantsModal?.rawId ?? roomParticipantsModal?.id ?? '').replace(/^room-/, '')}
        ownerUserId={Number(roomParticipantsModal?.creatorUserId || 0)}
        currentUsers={Array.isArray(roomParticipantsModal?.Users) ? roomParticipantsModal.Users : []}
        externalParticipants={Array.isArray(roomParticipantsModal?.externalParticipants) ? roomParticipantsModal.externalParticipants : []}
        busy={roomParticipantsSaving}
        onClose={closeRoomParticipantsModal}
        onSave={saveRoomParticipants}
        onExternalParticipantsLoaded={(externalParticipants) => {
          if (!Array.isArray(externalParticipants)) return;
          setRoomParticipantsModal((prev) => prev ? { ...prev, externalParticipants } : prev);
        }}
        onExternalParticipantRemoved={(participantId, externalParticipants) => {
          setRoomParticipantsModal((prev) => {
            if (!prev) return prev;
            if (Array.isArray(externalParticipants)) return { ...prev, externalParticipants };
            return {
              ...prev,
              externalParticipants: (Array.isArray(prev.externalParticipants) ? prev.externalParticipants : [])
                .filter((item) => Number(item?.id || 0) !== Number(participantId)),
            };
          });
        }}
      />

      <ExternalChatInviteModal
        visible={Boolean(externalInviteModal)}
        channel={externalInviteModal?.channel}
        apiBase={apiBase}
        token={token}
        excludedUserIds={[
          user?.id,
          externalInviteModal?.chat?.assigneeId,
          ...(Array.isArray(externalInviteModal?.chat?.participantIds) ? externalInviteModal.chat.participantIds : []),
        ].map(Number).filter(Boolean)}
        busy={externalInviteBusy}
        onClose={closeExternalInviteModal}
        onInvite={inviteExternalChatUser}
      />

      {chatContextMenu && (
        <div
          style={{
            position: 'fixed',
            top: chatContextMenu.y,
            left: chatContextMenu.x,
            zIndex: 2000,
            background: '#fff',
            border: '1px solid #d1d5db',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(15,23,42,0.16)',
            width: 'max-content',
            minWidth: 190,
            maxWidth: 280,
            padding: 4,
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {chatContextMenu.canPin !== false && (
            <button
              type="button"
              onClick={() => togglePinByKey(chatContextMenu.pinKey)}
              style={{
                width: '100%',
                height: 38,
                border: 'none',
                borderRadius: 7,
                background: 'transparent',
                textAlign: 'left',
                padding: '0 12px',
                cursor: 'pointer',
                color: '#111',
                fontWeight: 500,
                fontSize: 14,
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              {chatContextMenu.isPinned ? 'Открепить' : 'Закрепить'}
            </button>
          )}
          <button
            type="button"
            onClick={() => toggleImportantByKey(chatContextMenu.pinKey)}
            style={{
              width: '100%',
              height: 38,
              border: 'none',
              borderRadius: 7,
              background: 'transparent',
              textAlign: 'left',
              padding: '0 12px',
              cursor: 'pointer',
              color: '#111',
              fontWeight: 500,
              fontSize: 14,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            {chatContextMenu.isImportant ? 'Снять отметку' : 'Отметить чат'}
          </button>
          {chatContextMenu.canRename && (
            <button
              type="button"
              onClick={chatContextMenu.type ? renameExternalChatFromContextMenu : renameChatFromContextMenu}
              style={{
                width: '100%',
                height: 38,
                border: 'none',
                borderRadius: 7,
                background: 'transparent',
                textAlign: 'left',
                padding: '0 12px',
                cursor: 'pointer',
                color: '#111',
                fontWeight: 500,
                fontSize: 14,
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              Переименовать
            </button>
          )}
          {chatContextMenu.canArchive && (
            <button
              type="button"
              onClick={chatContextMenu.type ? archiveExternalChatFromContextMenu : archiveRoomFromContextMenu}
              style={{
                width: '100%',
                height: 38,
                border: 'none',
                borderRadius: 7,
                background: 'transparent',
                textAlign: 'left',
                padding: '0 12px',
                cursor: 'pointer',
                color: '#111',
                fontWeight: 500,
                fontSize: 14,
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              {chatContextMenu.archived ? 'Вернуть из архива' : 'Убрать в архив'}
            </button>
          )}
          {chatContextMenu.canDelete && (
            <button
              type="button"
              onClick={chatContextMenu.type ? deleteExternalChatFromContextMenu : deleteRoomFromContextMenu}
              style={{
                width: '100%',
                height: 38,
                border: 'none',
                borderRadius: 7,
                background: 'transparent',
                textAlign: 'left',
                padding: '0 12px',
                cursor: 'pointer',
                color: '#dc2626',
                fontWeight: 600,
                fontSize: 14,
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                whiteSpace: 'nowrap',
                marginTop: 0,
              }}
            >
              Удалить чат
            </button>
          )}
        </div>
      )}
    </div>
  );


}








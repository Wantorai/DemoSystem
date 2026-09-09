// components/webchats/ChatLayout.jsx
'use client';

import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ChatList from './ChatList';
import CrossChatEntry from './CrossChatEntry';
import AllPinsView from './AllPinsView';
import { applyWebChatFontScale } from '../AppStyleLoader';
import { AuthContext } from '../../context/AuthContext';
import {
  IoBusinessOutline,
  IoChatbubbleEllipsesOutline,
  IoCloseOutline,
  IoFolderOpenOutline,
  IoListOutline,
  IoPaperPlaneOutline,
  IoPeopleOutline,
  IoPinOutline,
  IoSearchOutline,
} from 'react-icons/io5';

export default function ChatLayout({ 
  children, 
  searchQuery: initialSearchQuery = '',
  roomId = null, 
  chatId = null,
  maxId = null,
  telegramId = null,
  onSearchQueryChange = null
}) {
  const router = useRouter();
  const { user, token } = useContext(AuthContext);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(initialSearchQuery);
  const [searchEverywhere, setSearchEverywhere] = useState(true);
  const [showAllPinsView, setShowAllPinsView] = useState(false);
  const [fontScaleMode] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches ? 'mobile' : 'desktop'
  ));
  const [fontScaleModalOpen, setFontScaleModalOpen] = useState(false);
  const [fontScale, setFontScale] = useState(100);
  const [fontScaleDraft, setFontScaleDraft] = useState(100);
  const [fontScaleSaving, setFontScaleSaving] = useState(false);
  const [fontScaleError, setFontScaleError] = useState('');
  const chatListActionsRef = useRef(null);
  const layoutRef = useRef(null);
  const toolbarRef = useRef(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startPercentRef = useRef(0);
  const asidePercentRef = useRef(null);
  const onResizerPointerUpRef = useRef(null);
  const LAYOUT_KEY = 'chat:asideWidthPercent';
  const DEFAULT_ASIDE_PX = 400;
  const MIN_PERCENT = 15;
  const MAX_PERCENT = 60;
  const MIN_ASIDE_EXTRA_PX = 48;
  const [asideWidthPercent, setAsideWidthPercent] = useState(null);
  const [minAsidePx, setMinAsidePx] = useState(DEFAULT_ASIDE_PX);
  const [chatListView, setChatListView] = useState(() => {
    if (typeof window === 'undefined') return 'list';
    try {
      return localStorage.getItem('webchats:listView') || 'list';
    } catch {
      return 'list';
    }
  });

  const applySearchQuery = (value) => {
    setSearchQuery(value);
    if (onSearchQueryChange) {
      onSearchQueryChange(value);
    }
  };

  const openSearchModal = () => {
    setSearchDraft(searchQuery);
    setSearchModalOpen(true);
  };

  const submitSearch = () => {
    applySearchQuery(searchDraft);
    setSearchModalOpen(false);
  };

  const clearSearch = () => {
    setSearchDraft('');
    applySearchQuery('');
    setSearchModalOpen(false);
  };

  const toggleChatListView = () => {
    setChatListView((current) => {
      const next = current === 'folders' ? 'list' : 'folders';
      try {
        localStorage.setItem('webchats:listView', next);
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    if (!token) {
      setFontScale(100);
      setFontScaleDraft(100);
      return;
    }
    let cancelled = false;
    fetch(`${apiBase}/user-settings/webchat-text-scale?mode=${fontScaleMode}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Не удалось загрузить размер текста');
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        const percent = Math.min(160, Math.max(80, Math.round(Number(data?.percent) || 100)));
        setFontScale(percent);
        setFontScaleDraft(percent);
        applyWebChatFontScale(percent);
      })
      .catch(() => {
        if (cancelled) return;
        setFontScale(100);
        setFontScaleDraft(100);
        applyWebChatFontScale(100);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, fontScaleMode, token]);

  const openFontScaleModal = () => {
    setFontScaleDraft(fontScale);
    setFontScaleError('');
    setFontScaleModalOpen(true);
  };

  const closeFontScaleModal = () => {
    applyWebChatFontScale(fontScale);
    setFontScaleDraft(fontScale);
    setFontScaleError('');
    setFontScaleModalOpen(false);
  };

  const saveFontScale = async () => {
    const percent = Math.min(160, Math.max(80, Math.round(Number(fontScaleDraft) || 100)));
    setFontScaleSaving(true);
    setFontScaleError('');
    try {
      const response = await fetch(`${apiBase}/user-settings/webchat-text-scale`, {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mode: fontScaleMode, percent }),
      });
      if (!response.ok) throw new Error('Не удалось сохранить размер текста');
      setFontScale(percent);
      setFontScaleDraft(percent);
      applyWebChatFontScale(percent);
      window.dispatchEvent(new CustomEvent('webchat-font-scale-changed', {
        detail: { mode: fontScaleMode, percent },
      }));
      setFontScaleModalOpen(false);
    } catch (error) {
      setFontScaleError(error?.message || 'Не удалось сохранить размер текста');
    } finally {
      setFontScaleSaving(false);
    }
  };

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

  const saveAsidePercent = useCallback((value) => {
    try {
      if (value == null) return;
      localStorage.setItem(LAYOUT_KEY, String(value));
    } catch {}
  }, []);

  const getMinAsidePercent = useCallback(() => {
    const containerWidth = layoutRef.current?.clientWidth || window.innerWidth || DEFAULT_ASIDE_PX;
    const measuredToolbarWidth = toolbarRef.current?.scrollWidth || 0;
    const toolbarMinPx = measuredToolbarWidth > 0
      ? measuredToolbarWidth + MIN_ASIDE_EXTRA_PX
      : (minAsidePx || DEFAULT_ASIDE_PX);
    const toolbarPercent = (toolbarMinPx / containerWidth) * 100;
    return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, toolbarPercent));
  }, [minAsidePx]);

  const clampAsidePercent = useCallback((value) => {
    const minPercent = getMinAsidePercent();
    return Math.max(minPercent, Math.min(MAX_PERCENT, value));
  }, [getMinAsidePercent]);

  useEffect(() => {
    const measureToolbar = () => {
      const toolbarWidth = toolbarRef.current?.scrollWidth || 0;
      if (toolbarWidth > 0) {
        setMinAsidePx(toolbarWidth + MIN_ASIDE_EXTRA_PX);
      }
    };

    measureToolbar();
    window.addEventListener('resize', measureToolbar);
    return () => window.removeEventListener('resize', measureToolbar);
  }, [searchQuery]);

  useEffect(() => {
    const saved = localStorage.getItem(LAYOUT_KEY);
    const containerWidth = layoutRef.current?.clientWidth || window.innerWidth;
    const defaultPercent = clampAsidePercent((DEFAULT_ASIDE_PX / containerWidth) * 100);
    const parsed = saved ? Number.parseFloat(saved) : NaN;
    const initial = Number.isFinite(parsed)
      ? clampAsidePercent(parsed)
      : defaultPercent;
    asidePercentRef.current = initial;
    const frame = window.requestAnimationFrame(() => {
      setAsideWidthPercent(initial);
    });

    const handleBeforeUnload = () => saveAsidePercent(asidePercentRef.current);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.cancelAnimationFrame(frame);
      saveAsidePercent(asidePercentRef.current);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [clampAsidePercent, saveAsidePercent]);

  const onResizerPointerMove = useCallback((event) => {
    if (!isDraggingRef.current) return;
    const container = layoutRef.current;
    if (!container) return;
    const deltaPercent = ((event.clientX - startXRef.current) / (container.clientWidth || window.innerWidth)) * 100;
    const next = clampAsidePercent(startPercentRef.current + deltaPercent);
    asidePercentRef.current = next;
    setAsideWidthPercent(next);
  }, [clampAsidePercent]);

  const onResizerPointerUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    window.removeEventListener('pointermove', onResizerPointerMove);
    const pointerUpHandler = onResizerPointerUpRef.current;
    if (pointerUpHandler) {
      window.removeEventListener('pointerup', pointerUpHandler);
    }
    document.body.style.userSelect = '';
    saveAsidePercent(asidePercentRef.current);
  }, [onResizerPointerMove, saveAsidePercent]);

  useEffect(() => {
    onResizerPointerUpRef.current = onResizerPointerUp;
    return () => {
      if (onResizerPointerUpRef.current === onResizerPointerUp) {
        onResizerPointerUpRef.current = null;
      }
    };
  }, [onResizerPointerUp]);

  const onResizerPointerDown = useCallback((event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const container = layoutRef.current;
    if (!container) return;
    isDraggingRef.current = true;
    startXRef.current = event.clientX;
    startPercentRef.current = asideWidthPercent ?? ((DEFAULT_ASIDE_PX / container.clientWidth) * 100);
    window.addEventListener('pointermove', onResizerPointerMove);
    window.addEventListener('pointerup', onResizerPointerUp);
    document.body.style.userSelect = 'none';
  }, [asideWidthPercent, onResizerPointerMove, onResizerPointerUp]);

  const onResizerKeyDown = useCallback((event) => {
    const setNext = (next) => {
      asidePercentRef.current = next;
      saveAsidePercent(next);
      setAsideWidthPercent(next);
    };
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      const current = asideWidthPercent ?? asidePercentRef.current ?? 30;
      setNext(clampAsidePercent(current - 2));
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      const current = asideWidthPercent ?? asidePercentRef.current ?? 30;
      setNext(clampAsidePercent(current + 2));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setNext(getMinAsidePercent());
    } else if (event.key === 'End') {
      event.preventDefault();
      setNext(MAX_PERCENT);
    }
  }, [asideWidthPercent, clampAsidePercent, getMinAsidePercent, saveAsidePercent]);

  const onResizerDoubleClick = useCallback(() => {
    const containerWidth = layoutRef.current?.clientWidth || window.innerWidth;
    const defaultPercent = clampAsidePercent((DEFAULT_ASIDE_PX / containerWidth) * 100);
    asidePercentRef.current = defaultPercent;
    setAsideWidthPercent(defaultPercent);
    saveAsidePercent(defaultPercent);
  }, [clampAsidePercent, saveAsidePercent]);

  return (
    <div ref={layoutRef} className="webchat-layout webchat-list-layout" style={{
      display: 'flex', 
      height: 'calc(90vh)', 
      minHeight: 0, 
      overflow: 'hidden' 
    }}>
      {/* Левая панель - список чатов (фиксированная ширина) */}
      <aside className="webchat-sidebar" style={{
        width: asideWidthPercent ? `${asideWidthPercent}%` : `${DEFAULT_ASIDE_PX}px`,
        borderRight: '1px solid #eee', 
        overflow: 'hidden',
        minWidth: `${minAsidePx}px`,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0
      }}>
        <div className="webchat-sidebar-header" style={{ padding: 12 }}>
          <div style={{ color: '#666', fontSize: 13 }}></div>
          <div className="webchat-sidebar-toolbar" style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 8,
            padding: 8,
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            background: '#f9fafb',
          }}>
            <div ref={toolbarRef} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
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
              <button
                type="button"
                title="Размер текста в чатах"
                onClick={openFontScaleModal}
                style={fontScale !== 100 ? sidebarActiveActionButtonStyle : sidebarActionButtonStyle}
                aria-label="Настроить размер текста в чатах"
              >
                <span aria-hidden="true" style={{ fontSize: 21, lineHeight: 1, fontWeight: 700 }}>A</span>
              </button>
              {searchQuery && (
                <button
                  type="button"
                  title="Отменить поиск"
                  aria-label="Отменить поиск"
                  onClick={clearSearch}
                  style={{
                    ...sidebarActionButtonStyle,
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    borderColor: '#bfdbfe',
                    color: '#1d4ed8',
                    background: '#eff6ff',
                  }}
                >
                  <IoCloseOutline size={19} />
                </button>
              )}
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
                onClick={() => setShowAllPinsView((value) => !value)}
                style={showAllPinsView ? sidebarActiveActionButtonStyle : sidebarActionButtonStyle}
                aria-label={showAllPinsView ? 'Вернуться к чату' : 'Открыть все закрепы'}
              >
                <IoPinOutline size={20} />
              </button>
              <button
                type="button"
                onClick={toggleChatListView}
                title={chatListView === 'folders' ? 'Показать все чаты одним списком' : 'Показать чаты по папкам'}
                aria-label={chatListView === 'folders' ? 'Показать все чаты одним списком' : 'Показать чаты по папкам'}
                style={chatListView === 'folders' ? sidebarActiveActionButtonStyle : sidebarActionButtonStyle}
              >
                {chatListView === 'folders'
                  ? <IoListOutline size={20} />
                  : <IoFolderOpenOutline size={20} />}
              </button>
            </div>
          </div>
          {searchQuery && (
            <div style={{
              marginTop: 8,
              minHeight: 32,
              padding: '6px 8px',
              border: '1px solid #bfdbfe',
              borderRadius: 10,
              background: '#eff6ff',
              color: '#1e3a8a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              fontSize: 13,
            }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Поиск: {searchQuery}
              </span>
              <button
                type="button"
                onClick={clearSearch}
                title="Отменить поиск"
                aria-label="Отменить поиск"
                style={{
                  width: 24,
                  height: 24,
                  border: 0,
                  borderRadius: 7,
                  background: 'transparent',
                  color: '#1d4ed8',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                  margin: 0,
                  flexShrink: 0,
                }}
              >
                <IoCloseOutline size={18} />
              </button>
            </div>
          )}
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
        {fontScaleModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Размер текста в чатах"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeFontScaleModal();
            }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10000,
              background: 'rgba(15,23,42,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            <div style={{
              width: 'min(420px, calc(100vw - 32px))',
              background: '#fff',
              color: '#111827',
              borderRadius: 14,
              boxShadow: '0 18px 50px rgba(15,23,42,0.25)',
              border: '1px solid rgba(229,231,235,0.95)',
              padding: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>
                  Размер текста — {fontScaleMode === 'mobile' ? 'телефон' : 'компьютер'}
                </div>
                <button
                  type="button"
                  onClick={closeFontScaleModal}
                  aria-label="Закрыть"
                  style={{ ...sidebarActionButtonStyle, width: 34, height: 34, borderRadius: 9 }}
                >
                  <IoCloseOutline size={22} />
                </button>
              </div>
              <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>A</span>
                <input
                  type="range"
                  min="80"
                  max="160"
                  step="5"
                  value={fontScaleDraft}
                  onChange={(event) => {
                    const percent = Number(event.target.value);
                    setFontScaleDraft(percent);
                    applyWebChatFontScale(percent);
                  }}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <span style={{ fontSize: 21, fontWeight: 700 }}>A</span>
              </div>
              <div style={{ marginTop: 10, textAlign: 'center', fontSize: 15, fontWeight: 700 }}>
                {fontScaleDraft}%
              </div>
              {fontScaleError && (
                <div style={{ marginTop: 10, color: '#dc2626', fontSize: 13 }}>{fontScaleError}</div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 18 }}>
                <button
                  type="button"
                  onClick={() => {
                    setFontScaleDraft(100);
                    applyWebChatFontScale(100);
                  }}
                  disabled={fontScaleSaving}
                  style={{ ...sidebarActionButtonStyle, width: 'auto', padding: '0 12px' }}
                >
                  По умолчанию
                </button>
                <button
                  type="button"
                  onClick={saveFontScale}
                  disabled={fontScaleSaving || !token}
                  style={{
                    ...sidebarActionButtonStyle,
                    width: 'auto',
                    padding: '0 16px',
                    borderColor: '#2563eb',
                    background: '#2563eb',
                    color: '#fff',
                    opacity: fontScaleSaving || !token ? 0.65 : 1,
                  }}
                >
                  {fontScaleSaving ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* ChatList с поддержкой всех типов чатов */}
        <ChatList 
          searchQuery={searchQuery}
          searchEverywhere={searchEverywhere}
          roomId={roomId}
          chatId={chatId}
          maxId={maxId}
          telegramId={telegramId}
          listView={chatListView}
          onActionsReady={(actions) => {
            chatListActionsRef.current = actions;
          }}
        />
      </aside>

      <div
        className="webchat-resizer"
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        onPointerDown={onResizerPointerDown}
        onKeyDown={onResizerKeyDown}
        onDoubleClick={onResizerDoubleClick}
        title="Перетащите, чтобы изменить ширину. Стрелки влево/вправо для тонкой подстройки. Двойной клик - сброс."
        style={{
          width: 10,
          cursor: 'col-resize',
          background: 'transparent',
          display: 'flex',
          alignItems: 'stretch',
          flex: '0 0 auto',
        }}
      >
        <div style={{ margin: 'auto 0', width: 2, background: '#e5e7eb', borderRadius: 2, alignSelf: 'stretch' }} />
      </div>

      {/* Правая панель - контент чата */}
      <main className="webchat-main" style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden'
      }}>
        {showAllPinsView ? (
          <AllPinsView
            token={token}
            currentUserId={user?.id}
            apiBase={apiBase}
            onOpenRoom={(targetRoomId) => {
              setShowAllPinsView(false);
              router.push(`/webchats/room/${encodeURIComponent(String(targetRoomId))}`);
            }}
          />
        ) : children}
      </main>
    </div>
  );
}


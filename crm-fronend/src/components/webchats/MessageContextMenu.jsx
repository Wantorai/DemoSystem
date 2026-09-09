// components\webchats\MessageContextMenu.jsx
'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  IoReturnDownBackOutline,
  IoChevronDownOutline,
  IoChevronUpOutline,
  IoCopyOutline,
  IoTrashOutline,
  IoShareOutline,
  IoDownloadOutline,
  IoPencilOutline,
} from 'react-icons/io5';

/**
 * props:
 *  - x, y: координаты для позиционирования
 *  - visible: boolean
 *  - onClose: () => void
 *  - onReply, onCopy, onShare, onSave, onTogglePin: callbacks
 *  - isPinned: boolean
 *  - reactionEmojis: string[]
 *  - activeReactions: string[]
 *  - onReact: (emoji) => void
 *  - disabled: { copy, share, save, edit } (опционально)
 */
export default function MessageContextMenu({
  x = 0,
  y = 0,
  visible = false,
  onClose = () => {},
  onReply = () => {},
  onCopy = () => {},
  onDelete = () => {},
  onForward = () => {},
  onShare = () => {},
  onSave = () => {},
  onEdit = () => {},
  onReact = () => {},
  onTogglePin = () => {},
  isPinned = false,
  reactionEmojis = [],
  activeReactions = [],
  disabled = {},
  variant = 'default',
  allowReply = false,
  allowReactions = false,
}) {
  const menuRef = useRef(null);
  const [showAllReactions, setShowAllReactions] = useState(false);
  const emojiList = useMemo(
    () => (Array.isArray(reactionEmojis) ? reactionEmojis.filter(Boolean) : []),
    [reactionEmojis]
  );
  const activeSet = useMemo(() => new Set(Array.isArray(activeReactions) ? activeReactions : []), [activeReactions]);
  const INLINE_LIMIT = 4;
  const inlineReactions = emojiList.slice(0, INLINE_LIMIT);
  const extraReactions = emojiList.slice(INLINE_LIMIT);
  const closeMenu = useCallback(() => {
    setShowAllReactions(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        closeMenu();
      }
    };

    const onKey = (e) => {
      if (e.key === 'Escape') closeMenu();
    };

    const onScroll = (e) => {
      const target = e?.target;
      if (menuRef.current && target instanceof Node && menuRef.current.contains(target)) {
        return;
      }
      closeMenu();
    };
    const onContextMenu = () => closeMenu();

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('contextmenu', onContextMenu);
    }, 0);

    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [visible, closeMenu]);

  if (!visible) return null;
  const isExternalVariant = variant === 'external';
  const canShowReactions = !isExternalVariant || allowReactions;

  const PADDING = 8;
  const MENU_W = 240;
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1000;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;

  let left = x;
  if (left + MENU_W > viewportW) {
    left = Math.max(PADDING, viewportW - MENU_W - PADDING);
  }

  let top = y;
  if (y > viewportH / 2) {
    top = y;
  }

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Message actions"
      className="z-50"
      style={{
        position: 'fixed',
        zIndex: 10000,
        left,
        top,
        width: MENU_W,
        boxShadow: '0 10px 30px rgba(2,6,23,0.2)',
        background: '#fff',
        borderRadius: 10,
        padding: 4,
        border: '1px solid rgba(0,0,0,0.04)',
        backdropFilter: 'saturate(120%) blur(4px)',
        maxHeight: `calc(100vh - ${PADDING * 2}px)`,
        overflowY: 'auto',
        transform: y > viewportH / 2 ? 'translateY(-100%)' : 'none',
        pointerEvents: 'auto',
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {(!isExternalVariant || allowReply) && (
          <MenuItem icon={<IoReturnDownBackOutline size={18} color="#007AFF" />} label="Ответить" onClick={() => { onReply(); closeMenu(); }} />
        )}
        <MenuItem icon={<IoCopyOutline size={18} color="#007AFF" />} label="Скопировать" onClick={() => { onCopy(); closeMenu(); }} disabled={disabled.copy} />
        {(!isExternalVariant || !disabled.delete) && (
          <MenuItem icon={<IoTrashOutline size={18} color="#fc0808ff" />} label="Удалить" onClick={() => { onDelete(); closeMenu(); }} disabled={disabled.delete} />
        )}
        <MenuItem icon={<IoShareOutline size={18} color="#007AFF" />} label="Переслать" onClick={() => { onForward(); closeMenu(); }} disabled={disabled.forward} />
        <MenuItem icon={<IoShareOutline size={18} color="#007AFF" />} label="Поделиться" onClick={() => { onShare(); closeMenu(); }} disabled={disabled.share} />
        <MenuItem icon={<IoDownloadOutline size={18} color="#007AFF" />} label="Сохранить" onClick={() => { onSave(); closeMenu(); }} disabled={disabled.save} />
        {!isExternalVariant && (
          <MenuItem icon={<IoPencilOutline size={18} color="#007AFF" />} label="Изменить" onClick={() => { onEdit(); closeMenu(); }} disabled={disabled.edit} />
        )}
        {!isExternalVariant && <div style={{ background: 'rgba(0,0,0,0.04)' }} />}
        {!isExternalVariant && (
          <MenuItem icon={'📌'} label={isPinned ? 'Открепить' : 'Закрепить'} onClick={() => { onTogglePin(); closeMenu(); }} />
        )}
        {canShowReactions && inlineReactions.length > 0 && <div style={{ height: 1, background: 'rgba(0,0,0,0.06)' }} />}
        {canShowReactions && inlineReactions.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'nowrap',
              overflow: 'visible',
              padding: '2px 2px 0 2px',
            }}
          >
            {inlineReactions.map((emoji) => (
              <button
                key={`react-inline-${emoji}`}
                type="button"
                onClick={() => { onReact(emoji); closeMenu(); }}
                className="rounded-md transition-colors hover:bg-gray-100"
                style={{
                  minWidth: 30,
                  height: 30,
                  border: 'none',
                  boxShadow: 'none',
                  background: activeSet.has(emoji) ? '#eff6ff' : 'transparent',
                  fontSize: 18,
                  lineHeight: 1,
                }}
                title={`Реакция ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        {canShowReactions && extraReactions.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAllReactions((v) => !v)}
            className="rounded-md transition-colors hover:bg-gray-100"
            style={{
              marginTop: 2,
              width: '100%',
              minHeight: 28,
              border: 'none',
              boxShadow: 'none',
              background: 'transparent',
              color: '#4b5563',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              padding: '0 4px',
            }}
            title={showAllReactions ? 'Скрыть' : 'Показать больше'}
          >
            {showAllReactions ? <IoChevronUpOutline size={14} /> : <IoChevronDownOutline size={14} />}
            {showAllReactions ? 'Скрыть реакции' : `Ещё реакции (+${extraReactions.length})`}
          </button>
        )}
        {canShowReactions && showAllReactions && extraReactions.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'nowrap',
              gap: 4,
              padding: '2px 2px 4px 2px',
              overflowX: 'auto',
              overflowY: 'hidden',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {extraReactions.map((emoji) => (
              <button
                key={`react-extra-${emoji}`}
                type="button"
                onClick={() => { onReact(emoji); onClose(); }}
                className="rounded-md transition-colors hover:bg-gray-100"
                style={{
                  minWidth: 30,
                  height: 30,
                  border: 'none',
                  boxShadow: 'none',
                  background: activeSet.has(emoji) ? '#eff6ff' : 'transparent',
                  fontSize: 18,
                  lineHeight: 1,
                }}
                title={`Реакция ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(menu, document.body);
}

function MenuItem({ icon, label, onClick, disabled = false }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      role="menuitem"
      className={`flex items-center gap-2 w-full text-left rounded px-2 py-1 transition-colors ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-50'}`}
      style={{ border: 'none', background: 'transparent' }}
    >
      <div style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <div style={{ flex: 1, fontSize: 14, color: '#111' }}>{label}</div>
    </button>
  );
}



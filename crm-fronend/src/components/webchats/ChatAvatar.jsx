import React from 'react';

import Image from 'next/image';

/**
 * ChatAvatar
 * props:
 *  - title: string (имя/название чата)
 *  - size: number (px), default 44
 *  - borderRadius: number (px), default 8
 *  - avatarUrl: string | null
 */
export default function ChatAvatar({ title = '', size = 44, borderRadius = 8, avatarUrl = null }) {
  const str = String(title || '').trim();
  const resolvedAvatarUrl = resolveMediaUrl(avatarUrl);
  avatarDebug('render', {
    title: str,
    rawAvatarUrl: avatarUrl || null,
    resolvedAvatarUrl: resolvedAvatarUrl || null,
    hasImage: Boolean(resolvedAvatarUrl),
  });

  // Получаем 2 буквы: либо первые буквы двух слов, либо первые два символа слова
  const getInitials = (s) => {
    if (!s) return 'C';
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    const t = words[0];
    if (!t) return 'C';
    return t.slice(0, 2).toUpperCase();
  };

  // Детеминированный хэш -> hue (0..359)
  const stringToHue = (s) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = s.charCodeAt(i) + ((h << 5) - h);
      h = h & h; // to 32bit int
    }
    return Math.abs(h) % 360;
  };

  // Генерация приятного, неяркого HSL цвета по строке
  const hue = stringToHue(str || 'chat');
  const saturation = 36; // % — умеренная насыщенность (неярко)
  const lightness = 46;  // % — достаточно тёмный, чтобы белый текст читался хорошо
  const bg = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

  const initials = getInitials(str);

  const outerStyle = {
    width: size,
    height: size,
    borderRadius: borderRadius,
    background: bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    color: '#ffffff',
    flexShrink: 0,
    userSelect: 'none',
    overflow: 'hidden',
    boxShadow: '0 1px 0 rgba(0,0,0,0.06)',
    // тонкая граница, если нужно чуть глубже отделить от белого фона:
    border: '1px solid rgba(0,0,0,0.04)'
  };

  const textStyle = {
    fontSize: Math.round(size * 0.42), // масштабируем размер шрифта от размера аватара
    lineHeight: 1,
    letterSpacing: '-0.02em',
  };

  return (
    <div
      aria-hidden="true"
      title={str || 'Chat'}
      style={outerStyle}
    >
      {resolvedAvatarUrl ? (
        <Image
          src={resolvedAvatarUrl}
          alt=""
          width={size}
          height={size}
          unoptimized
          draggable={false}
          onLoad={() => avatarDebug('image:load', { title: str, resolvedAvatarUrl })}
          onError={(event) => {
            avatarDebug('image:error', {
              title: str,
              rawAvatarUrl: avatarUrl || null,
              resolvedAvatarUrl,
              naturalWidth: event.currentTarget?.naturalWidth ?? null,
              naturalHeight: event.currentTarget?.naturalHeight ?? null,
            });
          }}
          style={{
            width: '100%',
            height: '100%',
            borderRadius,
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        <span style={textStyle}>{initials}</span>
      )}
    </div>
  );
}

const AVATAR_DEBUG = false;
const avatarDebug = (event, payload) => {
  if (!AVATAR_DEBUG) return;
  try {
    console.log(`[AvatarDebug][web][ChatAvatar] ${event}`, payload);
  } catch {}
};

function resolveMediaUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(?:https?:|data:|blob:)/i.test(raw)) return raw;
  const apiBase = String(process.env.NEXT_PUBLIC_API_URL || '')
    .replace(/\/api\/?$/i, '')
    .replace(/\/$/, '');
  if (!apiBase) return raw;
  return `${apiBase}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

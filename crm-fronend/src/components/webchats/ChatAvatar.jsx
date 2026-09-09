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
export default function ChatAvatar({ title = '', size = 44, borderRadius = 999, avatarUrl = null, avatarColor = null, colorSeed = null }) {
  const str = String(title || '').trim();
  const resolvedAvatarUrl = resolveMediaUrl(avatarUrl);
  avatarDebug('render', {
    title: str,
    rawAvatarUrl: avatarUrl || null,
    resolvedAvatarUrl: resolvedAvatarUrl || null,
    hasImage: Boolean(resolvedAvatarUrl),
  });

  // В компактном списке используем одну букву, как в мобильном приложении.
  const getInitials = (s) => {
    if (!s) return 'C';
    return Array.from(s.trim())[0]?.toUpperCase() || 'C';
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
  const mobileColors = ['#e57373', '#64b5f6', '#81c784', '#ffb74d', '#9575cd', '#4db6ac'];
  const seed = String(colorSeed ?? str ?? 'chat');
  const hue = stringToHue(seed);
  const bg = avatarColor || mobileColors[hue % mobileColors.length];

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
      className="webchat-avatar"
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

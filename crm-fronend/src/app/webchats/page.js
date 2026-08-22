// crm-frontend/src/app/webchats/page.js
'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import ChatLayout from '@/components/webchats/ChatLayout';
import { SocketProvider } from '@/components/webchats/SocketProvider';
import { usePathname, useRouter } from 'next/navigation';

export default function WebChatsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const navigatedRef = useRef(false);
  const LS_KEY = 'orderSpace:lastChat';
  const ALERTS_BOSS_CHAT_ID = '5';
  const [pendingFile] = useState(() => {
    if (typeof window === 'undefined') return null;
    try { return JSON.parse(sessionStorage.getItem('filespace:sendToChat') || 'null'); } catch { return null; }
  });

  useEffect(() => {
    if (pendingFile?.fileId) return;
    if (pathname?.match(/^\/webchats\/[^\/]+\/[^\/]+/)) {
      navigatedRef.current = true;
      return;
    }

    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
      if (raw) {
        let parsed = null;
        try {
          parsed = JSON.parse(raw);
        } catch (err) {
          parsed = raw;
          console.warn(err);
        }

        let kind = null, rawId = null;

        if (parsed && typeof parsed === 'object' && parsed.kind && parsed.rawId) {
          kind = String(parsed.kind);
          rawId = String(parsed.rawId);
        } else if (typeof parsed === 'string') {
          if (parsed.includes('-') && !parsed.includes('/')) {
            const [k, ...rest] = parsed.split('-');
            kind = k;
            rawId = rest.join('-');
          } else {
            const m = parsed.match(/\/?webchats\/([^\/]+)\/([^\/]+)/);
            if (m) {
              kind = m[1];
              rawId = m[2];
              if (rawId.startsWith(`${kind}-`)) {
                rawId = rawId.slice(kind.length + 1);
              }
            }
          }
        }

        if (kind && rawId) {
          navigatedRef.current = true;
          if (String(kind) === 'boss' && String(rawId) === ALERTS_BOSS_CHAT_ID) {
            router.replace('/webchats/alerts');
          } else {
            router.replace(`/webchats/${encodeURIComponent(kind)}/${encodeURIComponent(rawId)}`);
          }
          return;
        }
      }
    } catch (e) {
      console.warn('Ошибка при чтении lastChat:', e);
    }
  }, [pathname, router, pendingFile]);

  const handleFirstLoaded = useCallback((chats) => {
    if (navigatedRef.current || pendingFile?.fileId) return;
    if (!Array.isArray(chats) || chats.length === 0) return;

    const first = chats[0];
    const kind = first.kind;
    const rawId = first.rawId;
    if (kind && rawId) {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({ kind, rawId }));
      } catch (err) { 
        console.warn('Ошибка сохранения lastChat:', err); 
      }
      navigatedRef.current = true;
      if (String(kind) === 'boss' && String(rawId) === ALERTS_BOSS_CHAT_ID) {
        router.replace('/webchats/alerts');
      } else {
        router.replace(`/webchats/${kind}/${rawId}`);
      }
    }
  }, [router, pendingFile]);

  return (
    <SocketProvider>
      <ChatLayout onFirstLoaded={handleFirstLoaded}>
        <div style={{ 
          flex: '1 1 auto', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          padding: 12, 
          overflow: 'auto',
          backgroundColor: '#fafafa'
        }}>
          <div style={{ 
            textAlign: 'center', 
            color: '#666',
            maxWidth: '400px'
          }}>
            <div style={{ fontSize: '24px', marginBottom: '16px' }}>{pendingFile?.fileId ? '📎' : '👋'}</div>
            <h3 style={{ margin: '0 0 8px 0', color: '#333' }}>{pendingFile?.fileId ? 'Куда отправить файл?' : 'Выберите чат'}</h3>
            <p style={{ margin: 0, fontSize: '14px' }}>
              {pendingFile?.fileId ? <>Выберите внутренний чат слева, чтобы отправить<br /><strong>{pendingFile.name}</strong></> : <>Выберите чат слева для начала общения.
              <br />
              Доступны комнаты, админ-чаты и чаты Max Messenger.</>}
            </p>
          </div>
        </div>
      </ChatLayout>
    </SocketProvider>
  );
}














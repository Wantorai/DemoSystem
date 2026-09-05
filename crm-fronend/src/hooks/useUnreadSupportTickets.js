'use client';

import { useCallback, useEffect, useState } from 'react';

export const SUPPORT_TICKETS_VIEWED_EVENT = 'support-tickets-viewed';

const isSupportAdminHost = () => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return (
    host === 'orderspace.ru' ||
    host === 'www.orderspace.ru' ||
    host === 'localhost' ||
    host === '127.0.0.1'
  );
};

export default function useUnreadSupportTickets(token, user) {
  const [count, setCount] = useState(0);
  const roleId = Number(user?.roleId);
  const canManageSupportTickets = roleId === 1 || roleId === 2;

  const refresh = useCallback(async () => {
    if (!token || !canManageSupportTickets || !isSupportAdminHost()) {
      setCount(0);
      return;
    }

    try {
      const apiBase = String(process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
      const response = await fetch(`${apiBase}/admin/support/tickets/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) {
        setCount(0);
        return;
      }
      const data = await response.json();
      setCount(Math.max(0, Number(data?.count) || 0));
    } catch {
      setCount(0);
    }
  }, [canManageSupportTickets, token]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(refresh, 0);
    const interval = window.setInterval(refresh, 60_000);
    const handleFocus = () => void refresh();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const handleViewed = (event) => {
      setCount(Math.max(0, Number(event?.detail?.count) || 0));
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener(SUPPORT_TICKETS_VIEWED_EVENT, handleViewed);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener(SUPPORT_TICKETS_VIEWED_EVENT, handleViewed);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refresh]);

  return count;
}

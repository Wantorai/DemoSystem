// components/webchats/pinnedApi.js
import { useContext, useCallback, useMemo } from 'react';
import { AuthContext } from '../../context/AuthContext'; // поправьте путь, если нужно

export function usePinnedApi(API_BASE = process.env.NEXT_PUBLIC_API_URL || '') {
  const { token } = useContext(AuthContext);

  // headers — мемоизируются по token
  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token]);

  const listPinned = useCallback(async (kind, id) => {
    if (!kind || !id) throw new Error('Missing kind/id');
    const url = kind === 'room'
      ? `${API_BASE}/room_chats/${id}/pinned`
      : `${API_BASE}/boss_chats/${id}/pinned`;
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`Failed to load pinned: ${r.status}`);
    return r.json();
  }, [API_BASE, headers]);

  const pin = useCallback(async (kind, id, body = {}) => {
    if (!kind || !id) throw new Error('Missing kind/id');
    const url = kind === 'room'
      ? `${API_BASE}/room_chats/${id}/pin`
      : `${API_BASE}/boss_chats/${id}/pin`;
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(`Pin failed: ${r.status}${txt ? ` ${txt}` : ''}`);
    }
    return r.json();
  }, [API_BASE, headers]);

  const unpin = useCallback(async (kind, id, body = {}) => {
    if (!kind || !id) throw new Error('Missing kind/id');
    const url = kind === 'room'
      ? `${API_BASE}/room_chats/${id}/unpin`
      : `${API_BASE}/boss_chats/${id}/unpin`;
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(`Unpin failed: ${r.status}${txt ? ` ${txt}` : ''}`);
    }
    return r.json();
  }, [API_BASE, headers]);

  const position = useCallback(async (kind, id, messageId, pageSize = 30) => {
    if (!kind || !id || !messageId) throw new Error('Missing kind/id/messageId');
    const url = kind === 'room'
      ? `${API_BASE}/rooms/${id}/messages/${messageId}/position`
      : `${API_BASE}/boss_chats/${id}/messages/${messageId}/position`;
    const r = await fetch(url + `?pageSize=${pageSize}`, { headers });
    if (!r.ok) throw new Error('Position query failed');
    return r.json();
  }, [API_BASE, headers]);

  // возвращаем стабильный объект
  return useMemo(() => ({
    list: listPinned,      // совместимость со старым кодом
    listPinned,            // новое имя — можно использовать тоже
    pin,
    unpin,
    position
    }), [listPinned, pin, unpin, position]);
}






// // /pinnedApi.js
// import { useContext } from 'react';
// import { AuthContext } from '../../context/AuthContext';

// function useAuthHeaders() {
//   const { token } = useContext(AuthContext);
//   return { 
//     'Content-Type': 'application/json',
//     ...(token ? { Authorization: `Bearer ${token}` } : {}),
//   };
// }

// export function usePinnedApi() {
//   const headers = useAuthHeaders();
//   const base = ''; // если API на том же домене, иначе укажите FULL URL

//   const endpoints = {
//     room: {
//       list: (id) => `${base}/room_chats/${id}/pinned`,
//       pin: (id) => `${base}/room_chats/${id}/pin`,
//       unpin: (id) => `${base}/room_chats/${id}/unpin`,
//       position: (roomId, messageId) => `${base}/rooms/${roomId}/messages/${messageId}/position`,
//     },
//     boss: {
//       list: (id) => `${base}/boss_chats/${id}/pinned`,
//       pin: (id) => `${base}/boss_chats/${id}/pin`,
//       unpin: (id) => `${base}/boss_chats/${id}/unpin`,
//       position: (chatId, messageId) => `${base}/boss_chats/${chatId}/messages/${messageId}/position`,
//     }
//   };

//   async function list(kind, id) {
//     const url = endpoints[kind].list(id);
//     const r = await fetch(url, { headers });
//     if (!r.ok) throw new Error(`Failed to load pinned (${r.status})`);
//     return r.json(); // { pinned: [...] }
//   }

//   async function pin(kind, id, { messageId, expiresAt = null, orderIndex = null }) {
//     const url = endpoints[kind].pin(id);
//     const r = await fetch(url, {
//       method: 'POST',
//       headers,
//       body: JSON.stringify({ messageId, expiresAt, orderIndex }),
//     });
//     if (!r.ok) {
//       const txt = await r.text();
//       throw new Error(`Pin failed: ${r.status} ${txt}`);
//     }
//     return r.json(); // { pinned: {...} }
//   }

//   async function unpin(kind, id, { pinnedId = null, messageId = null }) {
//     const url = endpoints[kind].unpin(id);
//     const r = await fetch(url, {
//       method: 'POST',
//       headers,
//       body: JSON.stringify({ pinnedId, messageId }),
//     });
//     if (!r.ok) {
//       const txt = await r.text();
//       throw new Error(`Unpin failed: ${r.status} ${txt}`);
//     }
//     return r.json(); // { ok: true }
//   }

//   async function position(kind, id, messageId, pageSize = 30) {
//     const url = endpoints[kind].position(id, messageId) + `?pageSize=${pageSize}`;
//     const r = await fetch(url, { headers });
//     if (!r.ok) throw new Error('Position query failed');
//     return r.json(); // { indexInAll, page, indexInPage, totalMessages }
//   }

//   return { list, pin, unpin, position };
// }

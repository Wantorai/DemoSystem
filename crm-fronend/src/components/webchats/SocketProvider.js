// src/components/webchats/SocketProvider.js
'use client';
import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';
import { AuthContext } from '../../context/AuthContext';

const Ctx = createContext({ socket: null });

export function SocketProvider({ children }) {
  const { token } = useContext(AuthContext);

  const socket = useMemo(() => {
    if (!token) return null;
    const URL = process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin;

    return io(URL, {
      path: '/socket.io',
      transports: ['websocket'],
      withCredentials: true,
      auth: { token },
    });
  }, [token]);

  useEffect(() => {
    if (!socket) return undefined;
    // Подписки (если хочешь оставить — можно включить обратно для дебага)
    // const onConnect = () => {console.log('[client socket] connected id=%s', s.id)};
    // const onDisconnect = (reason) => {console.log('[client socket] disconnected', reason)};
    // const onConnectError = (err) => {console.error('[client socket] connect_error', err)};

    const onConnect = () => {};
    const onDisconnect = () => {};
    const onConnectError = () => {};

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    return () => {
      try {
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
        socket.off('connect_error', onConnectError);
        socket.disconnect();
      } catch {}
    };
  }, [socket]);

  return (
    <Ctx.Provider value={{ socket }}>
      {children}
    </Ctx.Provider>
  );
}

export const useWebSocket = () => useContext(Ctx);




// Версия с логами
// src/components/webchats/SocketProvider.js
// 'use client';
// import React, { createContext, useContext, useEffect, useState } from 'react';
// import { io } from 'socket.io-client';

// const Ctx = createContext({ socket: null });

// export function SocketProvider({ children }) {
//   const [socket, setSocket] = useState(null);

//   useEffect(() => {
//     // Определите URL сокета: можно отдельную переменную, либо window.location.origin
//     const URL = process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin;
//     // console.info('[SocketProvider] connecting to', URL);

//     const s = io(URL, {
//       path: '/socket.io',
//       transports: ['websocket'],
//       withCredentials: true,
//       // если нужен токен: auth: { token }
//     });

//     // Сохраняем в state — это приведёт к ререндеру и обновлению контекста
//     setSocket(s);
//     // console.info('[SocketProvider] created socket (client)', s);

//     // Логи событий
//     const onConnect = () => console.info('[SocketProvider] socket connected', s.id);
//     const onDisconnect = (reason) => console.info('[SocketProvider] socket disconnected', reason);
//     const onConnectError = (err) => console.error('[SocketProvider] connect_error', err);

//     s.on('connect', onConnect);
//     s.on('disconnect', onDisconnect);
//     s.on('connect_error', onConnectError);

//     // Очистка
//     return () => {
//       try {
//         s.off('connect', onConnect);
//         s.off('disconnect', onDisconnect);
//         s.off('connect_error', onConnectError);
//         s.disconnect();
//         // console.info('[SocketProvider] socket disconnected (cleanup)');
//       } catch (e) {
//         console.warn('[SocketProvider] cleanup error', e);
//       }
//       setSocket(null);
//     };
//   }, []);

//   return (
//     <Ctx.Provider value={{ socket }}>
//       {children}
//     </Ctx.Provider>
//   );
// }

// export const useWebSocket = () => useContext(Ctx);

    

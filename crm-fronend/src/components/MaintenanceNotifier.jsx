'use client';

import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import styles from './MaintenanceNotifier.module.css';

export default function MaintenanceNotifier() {
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [visible, setVisible] = useState(false);
  const manuallyClosed = useRef(false); // не сбрасывается при ререндере

  useEffect(() => {
    const socket = io({
      path: '/socket.io',
      transports: ['websocket'],
    });

    socket.on('maintenance:warning', ({ secondsLeft }) => {
      setSecondsLeft(secondsLeft);

      // Показываем окно только если пользователь не закрывал его вручную
      if (!manuallyClosed.current) {
        setVisible(true);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleClose = () => {
    setVisible(false);
    manuallyClosed.current = true;
  };

  if (!visible || secondsLeft === null || secondsLeft < 0) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h2>⚠ Внимание!</h2>
        <p>Сайт будет закрыт через <strong>{secondsLeft}</strong> сек.</p>
        <button onClick={handleClose}>Понял, сохраняюсь.</button>
      </div>
    </div>
  );
}








// 'use client';

// import { useEffect, useState } from 'react';
// import { io } from 'socket.io-client';
// import styles from './MaintenanceNotifier.module.css';

// export default function MaintenanceNotifier() {
//   const [secondsLeft, setSecondsLeft] = useState(null);

//   useEffect(() => {
//     // Подключение к сокет-серверу
//     const socket = io({
//     path: '/socket.io',
//     transports: ['websocket'],
//     });

//     socket.on('maintenance:warning', ({ secondsLeft }) => {
//       setSecondsLeft(secondsLeft);
//     });

//     return () => {
//       socket.disconnect();
//     };
//   }, []);

//   if (secondsLeft === null || secondsLeft < 0) return null;

//   return (
//     <div className={styles.modalOverlay}>
//       <div className={styles.modal}>
//         <h2>⚠ Внимание!</h2>
//         <p>Сайт будет не доступен через <strong>{secondsLeft}</strong> сек.</p>
//       </div>
//     </div>
//   );
// }

// // app/admin/templates/page.js

'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';

export default function BackupTemplateManager() {
  const [backups, setBackups] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [customName, setCustomName] = useState(''); // состояние для имени бэкапа
  const getAuthHeaders = (extra = {}) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    };
  };

  // Функция загрузки списка шаблонов-бэкапов
  const fetchBackups = useCallback(async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/templates`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setBackups(data);
    } catch (err) {
      console.error("Ошибка загрузки бэкапов:", err);
    }
  }, []);

  // Загружаем список при первой отрисовке
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBackups();
  }, [fetchBackups]);

  // Функция восстановления бэкапа
  const handleRestore = async (fileName) => {
    if (!confirm(`Вы действительно хотите восстановить шаблон из ${fileName}? Это перезапишет текущие данные.`)) return;

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/templates`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ fileName }),
    });
    const result = await res.json();
    if (res.ok) {
      setMessage(`Восстановление успешно: ${result.message}`);
    } else {
      setMessage(`Ошибка: ${result.error}`);
    }
  };

  // Функция создания нового бэкапа с обновлением списка
  const createBackup = async () => {
    setLoading(true);
    try {
      // Передаем имя бэкапа в теле запроса
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/templates`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ fileName: customName })
      });
      const data = await response.json();
      toast(data.message);
      await fetchBackups(); // После создания обновляем список
    } catch (error) {
      console.error("Ошибка при создании бэкапа:", error);
      toast("Ошибка при создании бэкапа");
    }
    setLoading(false);
  };

  return (
    <div>
      <h1>Управление бэкапами шаблонов</h1>

      {/* Поле для ввода имени бэкапа */}
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="backupName">Имя шаблона (буквы (a-z, A-Z), цифры (0-9), дефис (-) и подчёркивание (_)): </label>
        <input
          id="backupName"
          type="text"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder="Введите имя..."
        />
      </div>

      <button onClick={createBackup} disabled={loading}>
        {loading ? "Создание..." : "Создать шаблон-бэкап"}
      </button>

      <p></p>
      <hr />

      <h3>Существующие бэкапы шаблонов</h3>
      {message && <p>{message}</p>}
      <table border="1">
        <thead>
          <tr>
            <th>Имя файла</th>
            <th>Размер (байт)</th>
            <th>Дата создания</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {backups.map((backup) => (
            <tr key={backup.name}>
              <td>{backup.name}</td>
              <td>{backup.size}</td>
              <td>{new Date(backup.createdAt).toLocaleString()}</td>
              <td>
                <button onClick={() => handleRestore(backup.name)}>Восстановить</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}



// 'use client';
// import { useCallback, useEffect, useState } from 'react';

// export default function BackupTemplateManager() {
//   const [backups, setBackups] = useState([]);
//   const [message, setMessage] = useState('');
//   const [loading, setLoading] = useState(false);

//   // Функция загрузки списка шаблонов-бэкапов
//   const fetchBackups = useCallback(async () => {
//     try {
//       const res = await fetch('/api/backups?type=template');
//       const data = await res.json();
//       setBackups(data);
//     } catch (err) {
//       console.error("Ошибка загрузки бэкапов:", err);
//     }
//   };

//   // Загружаем список при первой отрисовке
//   useEffect(() => {
//     fetchBackups();
//   }, []);

//   // Функция восстановления бэкапа
//   const handleRestore = async (fileName) => {
//     if (!confirm(`Вы действительно хотите восстановить шаблон из ${fileName}? Это перезапишет текущие данные.`)) return;

//     const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/templates`, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ fileName }),
//     });
//     const result = await res.json();
//     if (res.ok) {
//       setMessage(`Восстановление успешно: ${result.message}`);
//     } else {
//       setMessage(`Ошибка: ${result.error}`);
//     }
//   };

//   // Функция создания нового бэкапа с обновлением списка
//   const createBackup = async () => {
//     setLoading(true);
//     try {
//       const response = await fetch('/api/backups/create?type=template', { method: 'POST' });
//       const data = await response.json();
//       toast(data.message);
//       await fetchBackups(); // 🔄 После создания обновляем список
//     } catch (error) {
//       console.error("Ошибка при создании бэкапа:", error);
//       toast("Ошибка при создании бэкапа");
//     }
//     setLoading(false);
//   };

//   return (
//     <div>
//       <h1>Управление бэкапами шаблонами-базы данных</h1>

//       <button onClick={createBackup} disabled={loading}>
//         {loading ? "Создание..." : "Создать шаблон-бэкап"}
//       </button>

//       <p></p>
//       <hr />

//       <h3>Существующие бэкапы шаблоны-базы данных</h3>
//       {message && <p>{message}</p>}
//       <table border="1">
//         <thead>
//           <tr>
//             <th>Имя файла</th>
//             <th>Размер (байт)</th>
//             <th>Дата создания</th>
//             <th>Действия</th>
//           </tr>
//         </thead>
//         <tbody>
//           {backups.map((backup) => (
//             <tr key={backup.name}>
//               <td>{backup.name}</td>
//               <td>{backup.size}</td>
//               <td>{new Date(backup.createdAt).toLocaleString()}</td>
//               <td>
//                 <button onClick={() => handleRestore(backup.name)}>Восстановить</button>
//               </td>
//             </tr>
//           ))}
//         </tbody>
//       </table>
//     </div>
//   );
// }







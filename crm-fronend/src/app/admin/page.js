// app/admin/page.js

'use client';
import { useCallback, useEffect, useState } from 'react';
import Spinner from "../../components/Spinner";
import { toast } from 'react-toastify';

export default function BackupManager() {
  const [backups, setBackups] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Параметры пагинации
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  // Функция загрузки списка бэкапов
  const fetchBackups = useCallback(async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin`);
      const data = await res.json();
      // console.log("Получаем бэкапы = ", data);
      // Сортируем бэкапы по дате создания в порядке убывания (самые новые первыми)
      const sortedData = data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setBackups(sortedData);
    } catch (err) {
      console.error("Ошибка загрузки бэкапов:", err);
    }
  }, []);
  

  // Загружаем список при первой отрисовке
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchBackups();
    }, 0);

    return () => clearTimeout(timer);
  }, [fetchBackups]);

  // Функция восстановления бэкапа
  const handleRestore = async (fileName) => {
    if (!confirm(`Вы действительно хотите восстановить базу из ${fileName}? Это перезапишет текущие данные.`)) return;

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Здесь можно указать нужное имя файла; если не требуется, можно отправить пустой объект или удалить body
        body: JSON.stringify({ fileName: 'backup_' })
      });
      const data = await response.json();
      toast(data.message);
      await fetchBackups(); // 🔄 После создания обновляем список
    } catch (error) {
      console.error("Ошибка при создании бэкапа:", error);
      toast("Ошибка при создании бэкапа");
    }
    setLoading(false);
  };

  if (loading) {
    return <Spinner />;
  }

  // Пагинация
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = backups.slice(indexOfFirstRow, indexOfLastRow);
  const totalPages = Math.ceil(backups.length / rowsPerPage);

  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  const handleRowsPerPageChange = (e) => {
    setRowsPerPage(Number(e.target.value));
    setCurrentPage(1); // Сбросить текущую страницу на первую при изменении количества строк на странице
  };


  return (
    <div>
      <h1>Управление бэкапами базы данных</h1>

      <button onClick={createBackup} disabled={loading}>
        {loading ? "Создание..." : "Создать бэкап"}
      </button>

      <p></p>
      <hr />

      <h3>Существующие бэкапы базы данных</h3>
      {message && <p>{message}</p>}

      <div style={{ marginBottom: '10px' }}>
        <label>Строк на странице: </label>
        <select value={rowsPerPage} onChange={handleRowsPerPageChange}>
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>

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
          {currentRows.map((backup) => (
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

      {/* Пагинация */}
      <div style={{ marginTop: '20px' }}>
        {Array.from({ length: totalPages }, (_, index) => index + 1).map(number => (
          <button
            key={number}
            onClick={() => handlePageChange(number)}
            style={{
              margin: '0 5px',
              padding: '5px 10px',
              backgroundColor: number === currentPage ? '#007bff' : '#f0f0f0',
              color: number === currentPage ? '#fff' : '#000',
              border: '1px solid #ccc',
              borderRadius: '3px',
              cursor: 'pointer'
            }}
          >
            {number}
          </button>
        ))}
      </div>
    </div>
  );
}








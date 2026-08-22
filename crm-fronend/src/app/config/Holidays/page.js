// app/config/Holidays/page.js

'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';

// Функция заполнения Субботы и воскресенья
function generateWeekendsForYear(year) {
  const weekends = [];
  const start = new Date(`${year}-01-01`);
  const end = new Date(`${year}-12-31`);
  
  // Создадим копию даты для итерации, чтобы не изменять start
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day === 6 || day === 0) {
      // Форматируем дату в формат YYYY-MM-DD
      const dateStr = d.toISOString().split('T')[0];
      weekends.push({
        date: dateStr,
        isHoliday: true,
        label: 'Выходной'
      });
    }
  }
  return weekends;
}





const HolidayConfigsAdmin = () => {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Состояния для создания новой записи
  const [newDate, setNewDate] = useState('');
  const [newIsHoliday, setNewIsHoliday] = useState(true);
  const [newLabel, setNewLabel] = useState('');

  // Состояние для редактирования существующей записи
  const [editingConfig, setEditingConfig] = useState(null);

  // Функция загрузки конфигураций
  const fetchConfigs = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/holidays`);
      if (res.ok) {
        const data = await res.json();
        setConfigs(data);
      } else {
        console.error('Ошибка получения конфигураций', res.status);
      }
    } catch (error) {
      console.error('Ошибка при загрузке конфигураций:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  // Функция для предзаполнения всех суббот и воскресений для текущего года
  const handlePrepopulate = async () => {
    const currentYear = new Date().getFullYear();
    const weekends = generateWeekendsForYear(currentYear);

    for (let weekend of weekends) {
      try {
        // Проверяем, существует ли запись для данной даты
        const exists = configs.find(cfg => cfg.date === weekend.date);
        if (!exists) {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/holidays`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(weekend),
          });
          if (!res.ok) {
            console.error(`Ошибка добавления для даты ${weekend.date}:`, res.status);
          }
        }
      } catch (error) {
        console.error(`Ошибка добавления для даты ${weekend.date}:`, error);
      }
    }
    await fetchConfigs();
  };

  // Функция для добавления новой записи вручную
  const handleAddNew = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/holidays`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newDate, isHoliday: newIsHoliday, label: newLabel }),
      });
      if (res.ok) {
        const added = await res.json();
        setConfigs([...configs, added]);
        // Сброс полей
        setNewDate('');
        setNewIsHoliday(true);
        setNewLabel('');
        toast('Дата добавлена')
      } else {
        console.error('Ошибка добавления новой записи:', res.status);
      }
    } catch (error) {
      console.error('Ошибка добавления новой записи:', error);
    }
  };

  // Функция для удаления записи
  const handleDelete = async (id) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/holidays/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setConfigs(configs.filter(cfg => cfg.id !== id));
      } else {
        console.error('Ошибка удаления записи:', res.status);
      }
    } catch (error) {
      console.error('Ошибка удаления записи:', error);
    }
  };


  // Функция для удаления выходного через календарь
  const handleRemoveHoliday = async () => {
    const holiday = configs.find(cfg => cfg.date === newDate); // Ищем дату в массиве
  
    if (!holiday) {
      console.error("Выбранная дата не является выходным днем.");
      return;
    }
  
    await handleDelete(holiday.id); // Удаляем по найденному ID
    toast('Дата удалена')
  };
    


  // Функция для начала редактирования
  const handleEdit = (config) => {
    setEditingConfig({ ...config });
  };

  // Функция для сохранения изменений в редактируемой записи
  const handleSaveEdit = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/holidays/${editingConfig.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingConfig),
      });
      if (res.ok) {
        const updated = await res.json();
        setConfigs(configs.map(cfg => (cfg.id === updated.id ? updated : cfg)));
        setEditingConfig(null);
      } else {
        console.error('Ошибка сохранения изменений:', res.status);
      }
    } catch (error) {
      console.error('Ошибка сохранения изменений:', error);
    }
  };


  // Функция удаление выходных за весь год
  const handleClearYearHolidays = async (year) => {
    if (!window.confirm(`Удалить все выходные за ${year} год?`)) return;
  
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/holidays/clear/${year}`, {
        method: "DELETE",
      });
  
      if (res.ok) {
        toast(`Выходные за ${year} год удалены!`);
        setConfigs(configs.filter(cfg => !cfg.date.startsWith(`${year}-`))); // Убираем удалённые даты
      } else {
        console.error("Ошибка удаления выходных:", res.status);
      }
    } catch (error) {
      console.error("Ошибка:", error);
      toast("Не удалось удалить выходные.");
    }
  };
  

  



  if (loading) {
    return <div>Загрузка конфигураций...</div>;
  }

  return (
    <div>
      <div className="details">
      <h3>Изменить выходной/рабочий</h3>
      <label className="labelClient">
        Дата:
        <input className="valueClient"
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
        />
      </label>
      <br />
      <label className="labelClient">
        Выходной?
        <select  className="valueClient"
          value={newIsHoliday ? "true" : "false"}
          onChange={(e) => setNewIsHoliday(e.target.value === "true")}
        >
          <option value="true">Да</option>
          <option value="false">Нет</option>
        </select>
      </label>
      <br />
      <label className="labelClient">
        Метка:
        <input className="valueClient"
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
      </label>
      <br />
      <button onClick={handleAddNew}>Добавить выходной</button>
      <button className="deleteButton" onClick={handleRemoveHoliday}>Удалить выходной</button>
      <p></p>
      <hr></hr>
      </div>
      <h2>Конфигурация выходных дней</h2>
      <button onClick={handlePrepopulate}>
        Предзаполнить выходными (Сб, Вс)
      </button>
      <button onClick={() => handleClearYearHolidays(2025)} className="btn btn-danger">
      Очистить выходные за год
      </button>
      <table border="1" cellPadding="5" style={{ marginTop: '20px', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Дата</th>
            <th>Выходной?</th>
            <th>Метка</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {configs.map(cfg => (
            <tr key={cfg.id}>
              <td>{editingConfig && editingConfig.id === cfg.id ? (
                <input
                  type="date"
                  value={editingConfig.date}
                  onChange={(e) => setEditingConfig({ ...editingConfig, date: e.target.value })}
                />
              ) : (
                cfg.date
              )}</td>
              <td>{editingConfig && editingConfig.id === cfg.id ? (
                <select
                  value={editingConfig.isHoliday ? "true" : "false"}
                  onChange={(e) =>
                    setEditingConfig({ ...editingConfig, isHoliday: e.target.value === "true" })
                  }
                >
                  <option value="true">Да</option>
                  <option value="false">Нет</option>
                </select>
              ) : (
                cfg.isHoliday ? 'Да' : 'Нет'
              )}</td>
              <td>{editingConfig && editingConfig.id === cfg.id ? (
                <input
                  type="text"
                  value={editingConfig.label || ""}
                  onChange={(e) => setEditingConfig({ ...editingConfig, label: e.target.value })}
                />
              ) : (
                cfg.label
              )}</td>
              <td>
                {editingConfig && editingConfig.id === cfg.id ? (
                  <>
                    <button onClick={handleSaveEdit}>Сохранить</button>
                    <button onClick={() => setEditingConfig(null)} style={{ marginLeft: '5px' }}>Отмена</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => handleEdit(cfg)}>Редактировать</button>
                    <button onClick={() => handleDelete(cfg.id)} style={{ marginLeft: '5px' }}>Удалить</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

    </div>
  );
};

export default HolidayConfigsAdmin;


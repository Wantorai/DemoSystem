'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';

export default function ManagersPage() {
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchManagers = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/managers`);
        if (!response.ok) {
          throw new Error('Failed to fetch managers');
        }
        const data = await response.json();
        setManagers(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchManagers();
  }, []);

  const handleChange = (id, field, value) => {
    setManagers((prev) =>
      prev.map((man) =>
        man.id === id ? { ...man, [field]: value } : man
      )
    );
  };

  const handleSave = async (manager) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/managers/${manager.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: manager.phone,
          viewAll: manager.viewAll,
        }),
      });

      if (!response.ok) {
        throw new Error('Ошибка при сохранении');
      }

      toast('Сохранено!');
    } catch (err) {
      console.error('Ошибка:', err);
      toast('Ошибка при сохранении');
    }
  };

  if (loading) return <div>Загрузка...</div>;
  if (error) return <div>Ошибка: {error}</div>;

  return (
    <div>
      <h1>Список</h1>
      <table>
        <thead>
          <tr>
            <th>Имя</th>
            <th>Телефон</th>
            <th>Видеть всё</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {managers.map((man) => (
            <tr key={man.id}>
              <td>{man.name}</td>
              <td>
                <input
                  type="text"
                  value={man.phone || ''}
                  onChange={(e) =>
                    handleChange(man.id, 'phone', e.target.value)
                  }
                />
              </td>
              <td>
                  <input
                    type="checkbox"
                    checked={man.viewAll || false}
                    onChange={(e) =>
                      handleChange(man.id, 'viewAll', e.target.checked)
                    }
                  />
              </td>
              <td>
                <button onClick={() => handleSave(man)}>Сохранить</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

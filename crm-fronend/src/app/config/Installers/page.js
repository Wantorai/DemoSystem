'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';

export default function InstallersPage() {
  const [installers, setInstallers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchInstallers = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/installers`);
        if (!response.ok) {
          throw new Error('Failed to fetch installers');
        }
        const data = await response.json();
        const sorted = data.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setInstallers(sorted);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchInstallers();
  }, []);

  const handleChange = (id, field, value) => {
    setInstallers((prev) =>
      prev.map((inst) =>
        inst.id === id ? { ...inst, [field]: value } : inst
      )
    );
  };

  const handleSave = async (installer) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/installers/${installer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          color: installer.color,
          active: installer.active,
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


  const move = async (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= installers.length) return;

    const newInstallers = [...installers];
    const tempOrder = newInstallers[index].order;
    newInstallers[index].order = newInstallers[newIndex].order;
    newInstallers[newIndex].order = tempOrder;

    // Сохраняем изменения на сервере
    await Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/installers/${newInstallers[index].id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newInstallers[index].order }),
      }),
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/installers/${newInstallers[newIndex].id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newInstallers[newIndex].order }),
      }),
    ]);

    setInstallers(newInstallers.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
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
            <th>Работает</th>
            <th>Телефон</th>
            <th>Цвет</th>
            <th>Порядок</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {installers.map((inst, index) => (
            <tr key={inst.id}>
              <td>{inst.name}</td>
              <td>
                  <input
                    type="checkbox"
                    checked={inst.active || false}
                    onChange={async (e) => {
                      const newValue = e.target.checked;
                      handleChange(inst.id, 'active', newValue);
                      // Сразу шлём на сервер
                      await handleSave({ ...inst, active: newValue });
                    }}
                  />
              </td>
              <td>
                {inst.phone || '—'}
              </td>
              <td>
                <input
                  type="color"
                  value={inst.color  || "#ffffff"}
                  onChange={e => handleChange(inst.id, 'color', e.target.value)}
                />
              </td>
              <td>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <button onClick={() => move(index, -1)} style={{margin:0}}>↑</button>
                  <span>{inst.order ?? ''}</span>
                  <button onClick={() => move(index, 1)}  style={{margin:0}}>↓</button>
                </div>
              </td>
              <td>
                <button onClick={() => handleSave(inst)}>Сохранить</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';

export default function TechnicsPage() {
  const [technics, setTechnics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTechnics = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/technics`);
        if (!response.ok) {
          throw new Error('Failed to fetch technics');
        }
        const data = await response.json();
        setTechnics(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTechnics();
  }, []);

  const handleChange = (id, field, value) => {
    setTechnics((prev) =>
      prev.map((tech) =>
        tech.id === id ? { ...tech, [field]: value } : tech
      )
    );
  };

  const handleSave = async (technic) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/technics/${technic.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: technic.phone,
          viewAll: technic.viewAll,
          viewAllCRM: technic.viewAllCRM,
          color: technic.color,
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
            <th>Цвет</th>
            <th>Видеть все заказы</th>
            <th>Видеть всех в CRM</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {technics.map((tech) => (
            <tr key={tech.id}>
              <td>{tech.name}</td>
              <td>
                <input
                  type="text"
                  value={tech.phone || ''}
                  onChange={(e) =>
                    handleChange(tech.id, 'phone', e.target.value)
                  }
                />
              </td>

              <td>
                <input
                  type="color"
                  value={tech.color || "#ffffff"}
                  onChange={(e) => handleChange(tech.id, 'color', e.target.value)}
                  className="w-10 h-10 p-0 border-0"
                />
              </td>

              <td>
                  <input
                    type="checkbox"
                    checked={tech.viewAll || false}
                    onChange={(e) =>
                      handleChange(tech.id, 'viewAll', e.target.checked)
                    }
                  />
              </td>
              <td>
                  <input
                    type="checkbox"
                    checked={tech.viewAllCRM || false}
                    onChange={(e) =>
                      handleChange(tech.id, 'viewAllCRM', e.target.checked)
                    }
                  />
              </td>
              <td>
                <button onClick={() => handleSave(tech)}>Сохранить</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

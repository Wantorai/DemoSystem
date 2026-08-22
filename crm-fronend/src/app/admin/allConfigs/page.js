'use client';

import { useEffect, useState, useContext } from 'react';
import { AuthContext } from "../../../context/AuthContext";

export default function ConfigLinksPage() {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // Для обработки ошибок
  const { user } = useContext(AuthContext);  


  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/config-links?roleId=${user.roleId}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error('Ошибка при загрузке данных');
        }
        return res.json();
      })
      .then((data) => {
        // Сортируем данные по id после загрузки
        const sortedData = data.sort((a, b) => a.id - b.id);
        setLinks(sortedData);
        // console.log('Полученные данные после сортировки:', sortedData);
      })
      .catch((err) => {
        console.error('Ошибка:', err); // Логируем ошибку
        setError(err.message); // Устанавливаем сообщение об ошибке
      })
      .finally(() => setLoading(false));
  }, [user.roleId]);

  const handleChange = (id, newLabel, newStyle) => {
    setLinks(links.map(link => {
      if (link.id === id) {
        return {
          ...link,
          label: newLabel !== undefined ? newLabel : link.label,
          style: newStyle !== undefined ? newStyle : link.style
        };
      }
      return link;
    }));
  };

  const handleSave = async (id, label, style) => {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/config-links/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, label, style })
    });
  };

  if (loading) return <p>Загрузка...</p>;
  if (error) return <p className="text-red-500">{error}</p>; // Выводим ошибку, если она есть

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Редактирование конфигурации ссылок</h1>
      <table className="w-full border">
        <thead>
          <tr className="bg-gray-200">
            <th className="border p-2">Путь</th>
            <th className="border p-2">Название</th>
            <th className="border p-2">Стиль</th>
            <th className="border p-2">Действие</th>
          </tr>
        </thead>
        <tbody>
          {links.map(link => (
            <tr key={link.id} className="border">
              <td className="border p-2">{link.path}</td>
              <td className="border p-2">
                <input
                  className="border p-1 w-full"
                  value={link.label || ''}
                  onChange={(e) => handleChange(link.id, e.target.value, link.style)}
                />
              </td>
              <td className="border p-2">
                <input
                  className="border p-1 w-full"
                  value={link.style || ''}
                  onChange={(e) => handleChange(link.id, link.label, e.target.value)}
                />
              </td>
              <td className="border p-2">
                <button
                  className="bg-blue-500 text-white px-4 py-1 rounded"
                  onClick={() => handleSave(link.id, link.label, link.style)}
                >
                  Сохранить
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

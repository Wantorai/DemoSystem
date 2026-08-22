'use client';

import { useState, useEffect } from "react";




const statuses = ["defected", "default", "raskroi", 
  "kromka", "furnitura", "fasad_default", "fasad_ready", "workers", "name_raskroi", "name_kromka",
  "name_furnitura", "name_fasad", "name_workers"
];

export default function StatusColorsConfig() {
  const [colors, setColors] = useState({});
  const [dynamicStatuses, setDynamicStatuses] = useState([]); // Храним статусы из API



  // Получаем статусы
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/statuses`)
      .then((res) => res.json())
      .then((data) => {
        const filteredStatuses = data
        setDynamicStatuses(filteredStatuses);

      });
  }, []);


  // Получаем цвета
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/status-colors`)
      .then((res) => res.json())
      .then((data) => {
        const mappedColors = data.reduce((acc, item) => {
          acc[item.status] = item.color;
          return acc;
        }, {});
        setColors(mappedColors);
      });
  }, []);




  

  const handleChange = (status, color) => {
    setColors((prev) => ({ ...prev, [status]: color }));
  };

  const saveColor = (status) => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/status-colors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, color: colors[status] }),
    });
  };


  // // Использовать эту функцию для получения цвета !!
  // const getColorForStatus = async (status) => {
  //   const record = await StatusColor.findOne({ where: { status } });
  //   return record ? record.color : "#ccc"; // Цвет по умолчанию
  // };
  

  const statusLabels = {
    "default": "Цвет по умолчанию",
    "raskroi": "Раскрой",
    "kromka": "Кромкование",
    "furnitura": "Фурнитура",
    "fasad_default": "Фасады не готовы",
    "fasad_ready": "Фасады готовы",
    "workers": "Подрядчики"
  };


  const nameStatus = {
    "name_raskroi": "Раскрой",
    "name_kromka": "Кромкование",
    "name_furnitura": "Фурнитура",
    "name_fasad": "Фасады",
    "name_workers": "Подрядчики"
  }

  return (
    <div className="space-y-10 p-6">
      {/* Настройка цветов состояний */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Настройка цветов состояний</h2>
        <table className="min-w-full bg-white border border-gray-200 rounded-lg overflow-hidden">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 border-b text-left">Состояние</th>
              <th className="px-4 py-2 border-b text-left">Цвет</th>
              <th className="px-4 py-2 border-b text-left">Действие</th>
            </tr>
          </thead>
          <tbody>
            {dynamicStatuses.map((status, idx) => (
              <tr key={status.key} className={idx % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                <td className="px-4 py-2 border-b">{status.name}</td>
                <td className="px-4 py-2 border-b">
                  <input
                    type="color"
                    value={colors[status.key] || "#ffffff"}
                    onChange={(e) => handleChange(status.key, e.target.value)}
                    className="w-10 h-10 p-0 border-0"
                  />
                </td>
                <td className="px-4 py-2 border-b">
                  <button
                    onClick={() => saveColor(status.key)}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition duration-200"
                  >
                    Сохранить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  
      {/* Настройка коротких обозначений */}
      <div>
        <hr className="my-6 border-gray-300" />
        <h2 className="text-2xl font-bold mb-4">Настройка коротких обозначений</h2>
        <table className="min-w-full bg-white border border-gray-200 rounded-lg overflow-hidden">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 border-b text-left">Название</th>
              <th className="px-4 py-2 border-b text-left">Обозначение</th>
              <th className="px-4 py-2 border-b text-left">Действие</th>
            </tr>
          </thead>
          <tbody>
            {statuses
              .filter((status) => status.startsWith("name_"))
              .map((status, idx) => (
                <tr key={status} className={idx % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                  <td className="px-4 py-2 border-b">{nameStatus[status] || status}</td>
                  <td className="px-4 py-2 border-b">
                    <input
                      type="text"
                      value={colors[status] || ""}
                      onChange={(e) => handleChange(status, e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-4 py-2 border-b">
                    <button
                      onClick={() => saveColor(status)}
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition duration-200"
                    >
                      Сохранить
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
  
      {/* Настройка цветов статусов */}
      <div>
        <hr className="my-6 border-gray-300" />
        <h2 className="text-2xl font-bold mb-4">Настройка цветов статусов</h2>
        <table className="min-w-full bg-white border border-gray-200 rounded-lg overflow-hidden">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 border-b text-left">Состояние</th>
              <th className="px-4 py-2 border-b text-left">Цвет</th>
              <th className="px-4 py-2 border-b text-left">Действие</th>
            </tr>
          </thead>
          <tbody>
            {statuses
              .filter((status) =>
                ["default", "raskroi", "kromka", "furnitura", "fasad_default", "fasad_ready", "workers"].includes(status)
              )
              .map((status, idx) => (
                <tr key={status} className={idx % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                  <td className="px-4 py-2 border-b">{statusLabels[status] || status}</td>
                  <td className="px-4 py-2 border-b">
                    <input
                      type="color"
                      value={colors[status] || "#ffffff"}
                      onChange={(e) => handleChange(status, e.target.value)}
                      className="w-10 h-10 p-0 border-0"
                    />
                  </td>
                  <td className="px-4 py-2 border-b">
                    <button
                      onClick={() => saveColor(status)}
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition duration-200"
                    >
                      Сохранить
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
  

}

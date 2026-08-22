// // // src/app/admin/addons/create/page.js

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { toast } from 'react-toastify';

const CreateAddonPage = () => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultLoad, setDefaultLoad] = useState(false); // Состояние для чекбокса
  const router = useRouter();

  const handleSubmit = async () => {
    try {
      // Создаем надстройку, отправляя также значение чекбокса
      const addonResponse = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/addons`, { 
        name, 
        description,
        defaultLoad, // передаем значение чекбокса
      });

      const addonId = addonResponse.data.id;

      // Создание конфигурации для новой надстройки
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/addons/${addonId}/config/init`);

      router.push(`/admin/addons/${addonId}/edit`);

    } catch (error) {
      console.error("Ошибка при создании надстройки:", error);
      toast("Не удалось создать надстройку. Попробуйте снова.");
    }
  };

  return (
    <div className="details">
      <h1>Создание надстройки</h1>

      <div className="details">
        <label className="detail-row">
          <input
            className="valueClient"
            type="text"
            placeholder="Имя"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </div>

      <div className="details">
        <label className="detail-row">
          <textarea
            className="valueClient"
            placeholder="Описание"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>

      {/* Добавляем чекбокс для поля defaultLoad */}
      <div className="details">
        <label className="detail-row">
          <input
            type="checkbox"
            checked={defaultLoad}
            onChange={(e) => setDefaultLoad(e.target.checked)} // Меняем состояние чекбокса
          />
          Загрузка по умолчанию
        </label>
      </div>

      <div className="details">
        <label className="detail-row">
          <button onClick={handleSubmit}>Сохранить</button>
        </label>
      </div>
    </div>
  );
};

export default CreateAddonPage;





//  src/app/admin/addons/[addonId]/edit/page.js


"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import axios from "axios";
import { toast } from 'react-toastify';

const EditAddonPage = () => {
  const { addonId } = useParams();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [configId, setConfigId] = useState(null); // ID конфигурации
  const [defaultLoad, setDefaultLoad] = useState(false); // Состояние чекбокса
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAddonAndConfig = async () => {
      try {
        // Получение информации о надстройке
        const addonResponse = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/addons/${addonId}`
        );
        setName(addonResponse.data.name);
        setDescription(addonResponse.data.description);
        setDefaultLoad(addonResponse.data.defaultLoad); // Устанавливаем значение чекбокса

        // Получение конфигурации
        const configResponse = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/addons/${addonId}/configs`
        );

        // console.log("Ответ конфигурации из API:", configResponse.data);

        if (configResponse.data && configResponse.data.id) {
          setConfigId(configResponse.data.id); // Конфигурация существует
        }
      } catch (error) {
        if (error.response && error.response.status === 404) {
          setConfigId(null); // Конфигурация отсутствует
        } else {
          console.error("Ошибка при загрузке данных:", error);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchAddonAndConfig();
  }, [addonId]);




  const handleSaveAddon = async () => {

    try {
      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/addons/${addonId}`, {
        name,
        description,
        defaultLoad, // Добавляем значение чекбокса для сохранения
      });
      toast("Надстройка обновлена!");
    } catch (error) {
      console.error("Ошибка при сохранении надстройки:", error);
      toast("Ошибка при сохранении надстройки.");
    }
  };

  const handleCreateConfig = async () => {
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/addons/${addonId}/config/init`
      );
      setConfigId(response.data.configId); // Устанавливаем ID конфигурации
      toast("Конфигурация успешно создана!");
      router.push(`/admin/addons/${addonId}/configurations/edit`);
    } catch (error) {
      console.error("Ошибка при создании конфигурации:", error);
      toast("Ошибка при создании конфигурации.");
    }
  };

  const handleEditConfig = () => {
    router.push(`/admin/addons/${addonId}/configurations/edit`);
  };

  return (
    <div className="details">
      <h1>Редактирование надстройки</h1>
      {loading ? (
        <p>Загрузка...</p>
      ) : (
        <>
          <div className="detail-row">
            <label className="labelClient">
              Имя:
              <input className="valueClient"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          </div>
          <div className="detail-row">
            <label className="labelClient">
              Описание:
              <textarea className="valueClient"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </div>
          <div className="detail-row">
            <label className="labelClient">
              Загрузка по умолчанию:
              <input
                type="checkbox"
                checked={defaultLoad}
                onChange={() => setDefaultLoad(!defaultLoad)} // Обновляем значение при изменении чекбокса
              />
            </label>
          </div>
          <button onClick={handleSaveAddon}>Сохранить надстройку</button>
          <hr />
          <h2>Конфигурация надстройки</h2>
          {configId ? (
            <div className="detail-row">
              <p>Конфигурация (ID: {configId}).   </p>
              <button onClick={handleEditConfig}>Редактировать конфигурацию</button>
            </div>
          ) : (
            <div className="detail-row">
              <p>Конфигурация отсутствует.</p>
              <button onClick={handleCreateConfig}>Создать конфигурацию</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EditAddonPage;



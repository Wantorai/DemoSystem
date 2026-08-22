// src/app/admin/addons/[addonId]/configurations/edit/page.js

"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import axios from "axios";


const EditConfigPage = () => {
  const { addonId } = useParams();
  const [structData, setStructData] = useState([]);
  const [paramName, setParamName] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState("string");
  const [source, setSource] = useState(""); // Для привязки к списку
  const [editingId, setEditingId] = useState(null);
  const [orderChanged, setOrderChanged] = useState(false); // Флаг для отслеживания изменений
  const [isSaving, setIsSaving] = useState(false);
  const [addonName, setAddonName] = useState("");
  const [width, setWidth] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [active, setActive] = useState(true);



  // Функция для получения данных о надстройке
  const fetchAddonDetails = async (addonId) => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/addons/${addonId}`
      );
      return response.data;
    } catch (error) {
      console.error("Ошибка при получении данных надстройки:", error);
      throw error;
    }
  };




  // Загрузка конфигурации
  useEffect(() => {
    let isMounted = true;
  
    const fetchConfig = async () => {
      try {
        const { name } = await fetchAddonDetails(addonId);
        if (isMounted) setAddonName(name);
    
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/addons/${addonId}/configs`
        );
    
        if (isMounted) {
          const sortedParams = (response.data.params || []).sort(
            (a, b) => a.sorting - b.sorting
          );
          setStructData(sortedParams);
        }
      } catch (error) {
        if (isMounted) setStructData([]);
        console.error("Ошибка при загрузке конфигурации:", error);
      }
    };
    
  
    fetchConfig();
  
    return () => {
      isMounted = false; // Отменяем обновления состояния при размонтировании
    };
  }, [addonId]);





  // Сохранение параметра
  const handleSave = async () => {
    setIsSaving(true);
  
    try {
      const newParam = {
        paramName,
        label,
        type,
        source: type === "list" ? source : null, // Только для типа list
        width: width ? parseInt(width, 10) : null,
        newLabel: newLabel || null,
        active,
      };

      const updatedParams = editingId
      ? structData.map((param) =>
          param.id === editingId ? { ...param, ...newParam } : param
        )
      : [...structData, newParam]; // Добавляем новый параметр без `id`
    
  
      const payload = {
        addonId: parseInt(addonId, 10),
        params: updatedParams.map(param => 
          param.id ? param : { ...param } // У новых параметров `id` не должно быть
        ),
      };

  
      // console.log("Отправляемый payload:", payload);
  
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/addons/${addonId}/config/params`,
        payload
      );

      // console.log("Сохранение прошло успешно:", response.data);
  
      // Обновляем локальные данные
      setStructData(response.data.params);
      setParamName("");
      setLabel("");
      setType("string");
      setSource("");
      setEditingId(null);
      setWidth("");
      setNewLabel("");
      setActive(true); // Сбрасываем состояние
    } catch (error) {
      console.error("Ошибка при сохранении параметра:", error.response || error);
    } finally {
      setIsSaving(false);
    }
  };

  // Редактирование параметра
  const handleEdit = (param) => {
    setParamName(param.paramName);
    setLabel(param.label);
    setType(param.type);
    setSource(param.source || "");
    setEditingId(param.id);
    setWidth(param.width || "");
    setNewLabel(param.newLabel || "");
    setActive(param.active !== false); 
  };

  // Удаление параметра
  const handleDelete = async (id) => {
    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/addons/${addonId}/config/${id}`
      );
      setStructData((prev) => prev.filter((param) => param.id !== id));
    } catch (error) {
      console.error("Ошибка при удалении параметра:", error);
    }
  };


  // Двигаем
  const moveItem = (index, direction) => {
    const updatedStructData = [...structData];
    const targetIndex = index + direction;
  
    if (targetIndex >= 0 && targetIndex < updatedStructData.length) {
      [updatedStructData[index], updatedStructData[targetIndex]] = [
        updatedStructData[targetIndex],
        updatedStructData[index],
      ];
      setStructData(updatedStructData);
      setOrderChanged(true); // Устанавливаем флаг изменения
    }
  };
  


  // Сохраняем расположение
  const saveOrder = async () => {
    const orderedParams = structData.map((param, index) => ({
      id: param.id,
      sorting: index,
    }));
  
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/addons/${addonId}/config/order`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: orderedParams }),
      });
      setOrderChanged(false); // Сбрасываем флаг
    } catch (error) {
      console.error("Ошибка при сохранении порядка параметров:", error);
    }
  };

 

  // ------------------------------------------------------------
  // Обработчик смены типа для селекта
  // ------------------------------------------------------------
  const handleTypeChange = (newType) => {
    // обновляем селект
    setType(newType);

    // если редактируем существующий параметр — мигрируем значение
    if (editingId !== null) {
      setStructData((current) =>
        current.map((param) => {
          if (param.id !== editingId) return param;

          const oldType = param.type;
          const oldValue = param.value;
          let newValue = oldValue;

          // при входе в check_text_admin
          if (newType === "check_text_admin" && typeof oldValue === "string") {
            newValue = {
              adminText: oldValue,
              adminChecked: false,
              adminHasEdited: false,
            };
          }
          // при выходе из check_text_admin
          else if (oldType === "check_text_admin" && newType !== "check_text_admin") {
            newValue = oldValue && oldValue.adminText ? oldValue.adminText : "";
          }


          const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD


          // -------------------------
          // Вход в text_date_admin
          // -------------------------
          if (newType === "text_date_admin") {
            // если было просто строкой — оборачиваем
            if (typeof oldValue === "string") {
              newValue = {
                adminText: oldValue,
                date: oldValue ? today : "",
                adminChecked: Boolean(oldValue),
                adminHasEdited: true,
              };
            }
            // если был объект (возможно это был text_date)
            else if (oldValue && typeof oldValue === "object") {
              newValue = {
                adminText: oldValue.text || "",
                date: oldValue.date || (oldValue.text ? today : ""),
                adminChecked:
                  typeof oldValue.checked === "boolean"
                    ? oldValue.checked
                    : Boolean(oldValue.text),
                adminHasEdited: oldValue.hasEdited || true,
              };
            } else {
              // пустой случай
              newValue = { adminText: "", date: "", adminChecked: false, adminHasEdited: true };
            }
          }

          // -------------------------
          // Выход из text_date_admin -> text_date (или string)
          // -------------------------
          else if (oldType === "text_date_admin" && newType === "text_date") {
            // если в старом формате был объект — переносим в объект для text_date
            if (oldValue && typeof oldValue === "object") {
              newValue = {
                text: oldValue.adminText || "",
                date: oldValue.date || "",
                // можно сохранить hasEdited, но text_date не обязательно его использует
                hasEdited: oldValue.adminHasEdited || false,
              };
            } else if (typeof oldValue === "string") {
              // если вдруг был string — оборачиваем
              newValue = { text: oldValue, date: oldValue ? today : "", hasEdited: false };
            } else {
              newValue = { text: "", date: "", hasEdited: false };
            }
          }

          // -------------------------
          // Другие миграции (пример: string -> text_date)
          // -------------------------
          else if (newType === "text_date" && typeof oldValue === "string") {
            newValue = {
              text: oldValue,
              date: oldValue ? today : "",
              hasEdited: false,
            };
          }

          return {
            ...param,
            type: newType,
            value: newValue,
          };
        })
      );
    }
  };


  
  return (
    <div>
      <h1>Редактирование конфигурации для надстройки: {addonName}</h1>

      <div className="spacer">
        <h2>Параметры готовности не должны содержать _ </h2>
        <h3>Все другие параметры обязаны содержать _ </h3>
        <h4>Настройки для всех надстроек</h4>        
        <input className="newValueConfig"
          type="text"
          value={paramName}
          onChange={(e) => setParamName(e.target.value)}
          placeholder="Название параметра"
        />
        <input className="newValueConfig"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Отображение"
        />
        <select className="newValueConfig" value={type} onChange={e => handleTypeChange(e.target.value) }>
          <option value="string">Текст</option>
          <option value="number">Число</option>
          <option value="date">Дата</option>
          <option value="text_date">Текст + дата</option>
          <option value="text_date_admin">Текст + дата (Админ)</option>
          <option value="boolean">Чекбокс</option>
          <option value="boolean_admin">Чекбокс (Админ)</option>
          <option value="check_text">Чекбокс + текст</option>
          <option value="check_text_admin">Чекбокс + текст (Админ)</option>           
          <option value="check_date">Чекбокс + дата</option>
          <option value="check_date_admin">Чекбокс + дата (Админ)</option>
          <option value="list">Список</option>
          <option value="pay_list">Список оплат</option>
        </select>

        <div>
        <h4>Настройки только для Готовности</h4>

        <input className="newValueConfig"
          type="number"
          value={width}
          onChange={(e) => setWidth(e.target.value)}
          placeholder="Ширина столбца (px)"
        />

        <input className="newValueConfig"
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Короткое название"
        />

        <label>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Показать в таблице
        </label>

        </div>

        {type === "list" && (
          <>
            <select className="newValueConfig" 
              value={source}
              onChange={(e) => {
                // console.log("Selected source:", e.target.value); // Логируем выбранное значение
                setSource(e.target.value); // Обновляем состояние
              }}
            > <option value="">Выберите источник</option>
              <option value="fields">Ячейки</option>
              <option value="orders">Заказы</option>
              <option value="installers">Установщики</option>
              <option value="technics">Технологи</option>
              <option value="furnVendors">Поставщики фурнитуры</option>
              <option value="fasadVendors">Поставщики фасадов</option>
              <option value="workVendors">Подрядчики</option>
            </select>
          </>
        )}

        <button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Сохранение..." : editingId ? "Обновить" : "Создать"}
        </button>
      </div>

      <div>
        <h4>Созданные параметры</h4>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ border: "1px solid #ccc", padding: "8px" }}>
                Имя параметра
              </th>
              <th style={{ border: "1px solid #ccc", padding: "8px" }}>
                Отображение
              </th>
              <th style={{ border: "1px solid #ccc", padding: "8px" }}>
                Тип данных
              </th>
              <th style={{ border: "1px solid #ccc", padding: "8px" }}>Источник</th>
              <th style={{ border: "1px solid #ccc", padding: "8px" }}>Ширина</th>
              <th style={{ border: "1px solid #ccc", padding: "8px" }}>Лэйбл</th>
              <th style={{ border: "1px solid #ccc", padding: "8px" }}>Видимость</th>
            </tr>
          </thead>


          <tbody>
            {Array.isArray(structData) && structData.length > 0 ? (
              structData.map((param, index) => (
                <tr key={param.id || index}>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                    {param.paramName}
                  </td>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                    {param.label}
                  </td>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                    {param.type}
                  </td>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                    {param.source || "❌"}
                  </td>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                    {param.width || "❌"}
                  </td>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                    {param.newLabel || "❌"}
                  </td>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                    {param.active ? "✅" : "❌"}
                  </td>


                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                    <button onClick={() => handleEdit(param)}>Редактировать</button>
                    <button onClick={() => handleDelete(param.id)}>Удалить</button>
                    <button
                      onClick={() => moveItem(index, -1)}
                      disabled={index === 0}
                    >
                      Вверх
                    </button>
                    <button
                      onClick={() => moveItem(index, 1)}
                      disabled={index === structData.length - 1}
                    >
                      Вниз
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" style={{ textAlign: "center" }}>
                  Нет параметров
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {orderChanged && (
          <button onClick={saveOrder}>Сохранить порядок</button>
        )}
      </div>
    </div>
  );
};



export default EditConfigPage;

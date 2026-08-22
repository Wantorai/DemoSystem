// app/config/MainModel/page.js
"use client";

import React, { useState, useEffect, useRef } from "react";
import { toast } from 'react-toastify';

const ConfigPage = () => {
  const [models, setModels] = useState([]);
  const [paramName, setParamName] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState("string");
  const [source, setSource] = useState(""); // Для привязки к списку
  const [editingId, setEditingId] = useState(null);
  const [orderChanged, setOrderChanged] = useState(false); // Флаг для отслеживания изменений
  const [addons, setAddons] = useState([]);
  const [width, setWidth] = useState("")
  const [dataParams, setDataParams] = useState([]);
  const isFetched = useRef(false);
  const getAuthHeaders = (extra = {}) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    };
  };


  // Загрузка установщиков, технологов
  useEffect(() => {
    const fetchAddons = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/addons`
        );
        const data = await response.json();
        setAddons(data);
      } catch (error) {
        console.error("Ошибка при загрузке надстроек:", error);
      }
    };
    fetchAddons();
  }, []); // Выполняем только при монтировании


  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/mainModel`
        );
        const data = await response.json();
        setModels(data.sort((a, b) => a.order - b.order));
        // console.log("data", data)
      } catch (error) {
        console.error("Ошибка при загрузке моделей:", error);
      }
    };
    fetchModels();
  }, []); // Выполняем только при монтировании
  


  // Загрузка всех существующих параметров (dataParams)
  useEffect(() => {
    if (isFetched.current) return;
    isFetched.current = true;

    const fetchParams = async () => {
      try {
        const [mainModelData, configData] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/mainModel`).then((res) => res.json()),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/config`).then((res) => res.json()),
        ]);

        const combinedData = mainModelData.concat(configData);

        // console.log("combinedData = ", combinedData)

        // Формируем параметры для отправки
        const transformedData = combinedData.map(({ paramName, label }) => ({
          paramName,
          label,
        }));

        // Загружаем уже существующие записи из permissionParams
        const existingRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/permissionParams`, {
          headers: getAuthHeaders(),
        });
        let existingData = await existingRes.json();

        // Находим новые параметры, которых ещё нет в базе (сравниваем по paramName)
        const newParams = transformedData.filter(
          (newParam) =>
            !existingData.some(
              (existingParam) => existingParam.paramName === newParam.paramName
            )
        );

        if (newParams.length > 0) {
          await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/permissionParams`, {
            method: "POST",
            headers: getAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ params: newParams }),
          });

          // Повторный запрос, чтобы получить новые id
          const updatedRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/permissionParams`, {
            headers: getAuthHeaders(),
          });
          existingData = await updatedRes.json();
        }

        setDataParams(existingData);
      } catch (error) {
        console.error("Ошибка при загрузке моделей:", error);
      }
    };

    fetchParams();
  }, []);



  const handleSave = async () => {

    if (!paramName.trim() || !label.trim()) return;

    // Проверка на уникальность paramName и label в models и dataParams
    const isParamNameExists = dataParams.some((param) => param.param === paramName);

    const isLabelExists = dataParams.some((param) => param.label === label);

    if (isParamNameExists) {
      toast("Внимание! Параметр с таким 'paramName' уже существует. Если вы создаете новый, то пожалуйста, выберите другое имя.");
    }

    if (isLabelExists) {
      toast("Параметр с таким 'label' уже существует.");
    }

    const method = editingId ? "PUT" : "POST";
    const url = editingId
      ? `${process.env.NEXT_PUBLIC_API_URL}/mainModel/${editingId}`
      : `${process.env.NEXT_PUBLIC_API_URL}/mainModel`;
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paramName, label, type, source, width }),
    });
    const data = await response.json();
    
    setModels((prevModels) =>
      editingId
        ? prevModels.map((model) => (model.id === editingId ? data : model))
        : [...prevModels, data]
    );
    setParamName("");
    setLabel("");
    setType("string");
    setSource(""); // Очистка source
    setEditingId(null);
    setWidth("");
  };

  const handleEdit = (model) => {
    setParamName(model.paramName);
    setLabel(model.label);
    setType(model.type);
    setSource(model.source || ""); // Устанавливаем source, если есть
    setEditingId(model.id);
    setWidth(model.width || "");
  };

  const handleDelete = async (id) => {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/mainModel/${id}`, {
      method: "DELETE",
    });
    setModels(models.filter((model) => model.id !== id));
  };

  const moveItem = (index, direction) => {
    const newModels = [...models];
    const targetIndex = index + direction;

    if (targetIndex >= 0 && targetIndex < newModels.length) {
      [newModels[index], newModels[targetIndex]] = [
        newModels[targetIndex],
        newModels[index],
      ];
      setModels(newModels);
      setOrderChanged(true); // Устанавливаем флаг изменения
    }
  };

  const saveOrder = async () => {
    const orderedModels = models.map((model, index) => ({
      id: model.id,
      order: index,
    }));
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/mainModel`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: orderedModels }),
    });
    // console.log('orderedModels:', JSON.stringify(orderedModels, null, 2));
    setOrderChanged(false); // Сбрасываем флаг  
  };




  return (
    <div>
      <h1>Конфигурация модели</h1>
      <div>
        <h4>Добавить новый параметр</h4>
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
        <select className="newValueConfig" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="string">Текст</option>
          <option value="number">Число</option>
          <option value="boolean">Чекбокс</option>
          <option value="boolean_admin">Чекбокс (Админ)</option>
          <option value="date">Дата</option>
          <option value="date_admin">Дата (Админ)</option>
          <option value="list">Список</option>
          <option value="check_text">Чекбокс + текст</option>
          <option value="check_text_admin">Чекбокс + текст (Админ)</option>
          <option value="many_text_date_admin">Много строк + дата (Админ)</option>         
          {/* <option value="pay_list">Список оплат</option> */}
          <option value="addon">Надстройка</option>
        </select>



        {type === "list" && (
          <>
            <select className="newValueConfig"
              value={source}
              onChange={(e) => setSource(e.target.value)} // Обновляем источник
            >
              <option value="">Выберите источник</option>
              <option value="clients">Клиенты</option>  
              <option value="installers">Установщики</option>
              <option value="technics">Технологи</option>
              <option value="paylists">Типы оплат</option>
            </select>
          </>
        )}

        {type === "addon" && (
          <>
            <select className="newValueConfig"
              value={source}
              onChange={(e) => setSource(e.target.value)} // Обновляем источник
            >
              <option value="">Выберите источник</option>
              {addons.map((addon) => (
                <option key={addon.id} value={addon.id}>
                  {addon.name}
                </option>
              ))}
            </select>
          </>
        )}

        <input className="newValueConfig"
          type="text"
          value={width}
          onChange={(e) => setWidth(e.target.value)}
          placeholder="Ширина"
        />

        <button onClick={handleSave}>{editingId ? "Обновить" : "Создать"}</button>
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
              <th style={{ border: "1px solid #ccc", padding: "8px" }}>
                Действия
              </th>
            </tr>
          </thead>
          <tbody>
            {models.map((model, index) => (
              <tr key={model.id}>
                <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                  {model.paramName}
                </td>
                <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                  {model.label}
                </td>
                <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                  {model.type}
                </td>
                <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                  {model.source || "—"}
                </td>
                <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                  {model.width || ""}
                </td>
                <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                  <button onClick={() => handleEdit(model)}>Редактировать</button>
                  <button onClick={() => handleDelete(model.id)}>Удалить</button>
                  <button
                    onClick={() => moveItem(index, -1)}
                    disabled={index === 0}
                  >
                    Вверх
                  </button>
                  <button
                    onClick={() => moveItem(index, 1)}
                    disabled={index === models.length - 1}
                  >
                    Вниз
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orderChanged && (
          <button onClick={saveOrder}>Сохранить порядок</button>
        )}
      </div>
    </div>
  );
};

export default ConfigPage;

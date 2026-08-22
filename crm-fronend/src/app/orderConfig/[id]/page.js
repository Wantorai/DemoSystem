// src/app/orderConfig/[id]/page.js

"use client";

import React, { useState, useEffect, useContext } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthContext } from "../../../context/AuthContext";
import { toast } from 'react-toastify';
import Spinner from "../../../components/Spinner";

const OrderConfigPage = () => {

    const { id } = useParams(); // Получаем ID из URL
    // const [addonId, setAddonId] = useState(null); // Для хранения addonId
    const [nameFromAddon, setAddonName] = useState(null); // Для хранения addonId
    const [orderConfig, setOrderConfig] = useState(null);
    const [oldOrderConfig, setOldOrderConfig] = useState(null);
    const [configConfig, setConfigConfig] = useState([]);
    const [fields, setFields] = useState([]);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [furnVendors, setFurnVendors] = useState([]);
    const [fasadVendors, setFasadVendors] = useState([]);
    const [workVendors, setWorkVendors] = useState([]);
    const router = useRouter();
    const { user } = useContext(AuthContext);
    const [accessibleParams, setAccessibleParams] = useState(new Set());
  
    let currentRoleId;
    if (user) {currentRoleId = user.roleId} // Получаем роль юзера)



    useEffect(() => {
      const fetchData = async () => {
        try {
          // 1. Загрузка объекта OrderConfig
          const orderConfigResponse = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/orderConfigs/${id}`
          );
          // console.log(
          //   "Запрос к серверу на готовность:",
          //   `${process.env.NEXT_PUBLIC_API_URL}/orderConfigs/${id}`
          // );
  
          if (!orderConfigResponse.ok) {
            throw new Error("Не удалось загрузить объект конфигурации");
          }
          const orderData = await orderConfigResponse.json();
          // console.log("Полученные данные OrderConfig:", orderData);
  
          setOrderConfig(orderData);
          setOldOrderConfig(JSON.parse(JSON.stringify(orderData)));
  
          // Извлекаем addon_id из OrderConfig
          const addonIdFromOrder = orderData?.addon_id;
          const nameFromAddon = orderData?.addon?.name;
          setAddonName(nameFromAddon);
          // console.log('nameFromAddon = ' + nameFromAddon)
          // console.log("addonId:", addonIdFromOrder);

          if (!addonIdFromOrder) {
            throw new Error("Не удалось найти addon_id в OrderConfig");
          }
          // setAddonId(addonIdFromOrder);
  
          // 2. Загрузка конфигурации Config
          const configResponse = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/addons/${addonIdFromOrder}/configs`
          );
          if (!configResponse.ok) {
            throw new Error("Ошибка при загрузке конфигурации Config");
          }
          const configData = await configResponse.json();

          // console.log("Полученные данные Config:", configData);

          setConfigConfig(configData);
  
          // 3. Загрузка списка ячеек (fields)
          const fieldsResponse = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/fields`
          );
          const fieldsData = await fieldsResponse.json();
          setFields(fieldsData);
  
          // 4. Загрузка списка заказов
          const ordersResponse = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/orders`
          );
          const ordersData = await ordersResponse.json();
          setOrders(ordersData);


          // 5. Загрузка данных объектов конфигураций
          const furnVendorsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/furnVendors`);
          setFurnVendors(await furnVendorsResponse.json());

          // 6. Загрузка данных объектов конфигураций
          const fasadVendorsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/fasadVendors`);
          setFasadVendors(await fasadVendorsResponse.json());
          
          // 7. Загрузка данных объектов конфигураций
          const workVendorsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/workVendors`);
          setWorkVendors(await workVendorsResponse.json());    
          
          // 8. Загрузка разрешенных параметров
          const permissionParamsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/role_permissionParams/${currentRoleId}`);

          const dataParams = await permissionParamsResponse.json();
          // console.log("dataParams = ", dataParams)
          setAccessibleParams(dataParams); // Сохраняем разрешенные параметры в Set для быстрого поиска


        } catch (err) {
          console.error("Ошибка при загрузке данных:", err.message);
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };
  
      fetchData();
    }, [id, currentRoleId]); // Зависимость от id

  // Изменяем
  const handleChange = (paramName, value) => {
    setOrderConfig((prevOrder) => ({
      ...prevOrder,
      data: {
        ...prevOrder.data,
        [paramName]: value,
      },
    }));
  };

  // Сохраняем
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orderConfigs/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderConfig),
      });

      if (!response.ok) {
        throw new Error("Ошибка при сохранении готовности");
      }

      await saveOrderConfigLogs(oldOrderConfig, orderConfig);

      // После успешного сохранения — делаем редирект
      if (orderConfig.addon_id === 7) {
        router.push(`/readys`);
      } else {
        router.push(`/details`);
      }

      // toast("Готовность успешно сохранена!");
    } catch (err) {
      toast(`Ошибка: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };


  const handleDelete = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orderConfigs/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.push('/orderConfigs');
      } else {
        throw new Error('Ошибка при удалении готовности');
      }
    } catch (error) {
      console.error(error);
      toast('Не удалось удалить готовность.');
    }
  };

  const getLabel = (paramName) => {
    if (!configConfig || !configConfig.params) {
      return "—"; // Обработка случая, когда params отсутствует
    }
  
    const param = configConfig.params.find((param) => param.paramName === paramName);
    return param ? param.label : "—";
  };

  const formatLogDate = (dateStr) => {
    const date = new Date(dateStr);
    if (isNaN(date)) return "";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const getSimpleLogValue = (field, value) => {
    if (field.type?.startsWith("check_date")) {
      return `активность: [${Boolean(value?.checked)}] , дата: [${formatLogDate(value?.date)}]`;
    }
    if (field.type?.startsWith("check_text")) {
      return `активность: [${Boolean(value?.checked)}] , текст: [${value?.text ?? ""}]`;
    }
    if (field.type?.startsWith("date")) {
      return formatLogDate(value);
    }
    if (value == null) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const valuesEqualForLog = (field, oldValue, newValue) => {
    if (field.type?.startsWith("check_date")) {
      return (
        Boolean(oldValue?.checked) === Boolean(newValue?.checked) &&
        String(oldValue?.date || "") === String(newValue?.date || "")
      );
    }
    return JSON.stringify(oldValue ?? "") === JSON.stringify(newValue ?? "");
  };

  const saveOrderConfigLogs = async (previousConfig, nextConfig) => {
    if (!previousConfig || !nextConfig?.order_id || !Array.isArray(configConfig?.params)) return;

    const changedParams = configConfig.params.filter((field) => (
      !valuesEqualForLog(field, previousConfig?.data?.[field.paramName], nextConfig?.data?.[field.paramName])
    ));

    await Promise.all(changedParams.map((field) => {
      const oldSimple = getSimpleLogValue(field, previousConfig?.data?.[field.paramName]);
      const newSimple = getSimpleLogValue(field, nextConfig?.data?.[field.paramName]);
      return fetch(`${process.env.NEXT_PUBLIC_API_URL}/orderLogs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: nextConfig.order_id,
          action: `"${field.label}": [${oldSimple}] → [${newSimple}]`,
          user: user?.name || "",
          timestamp: new Date().toISOString(),
        }),
      });
    }));
  };


  // Новая функция для получения имени надстройки
  const getOrderNumber = (order_id) => {
    // console.log('order_id = ' + order_id)
    // console.log('orders = ' + orders)
    const order = orders?.find(a => a.id === order_id);
    return order?.data.order_number || "❌";
  };  
  

  const getOptionsForList = (source) => {
    if (source === "fields") return fields;
    if (source === "technics") return technics;
    if (source === "installers") return installers;
    if (source === "furnVendors") return furnVendors;
    if (source === "fasadVendors") return fasadVendors;
    if (source === "workVendors") return workVendors;
    return [];
  };

  if (loading) {return <Spinner />;}

  if (error) {
    return <p>Ошибка: {error}</p>;
  }

  if (!orderConfig) {
    return <p>Не найдено</p>;
  }

  const { data } = orderConfig;

  const orderInHeader = orders.find(order => Number(order.id) === Number(orderConfig.order_id)) || {};

  // console.log('All DATA: ', orderConfig)

  return (
    <div>
      <h1>{nameFromAddon} для заказа: {getOrderNumber(orderConfig.order_id)}</h1>
      <h2>
        Адрес: {orderInHeader.data.param5} | Изделие: {orderInHeader.data.param9}
      </h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {/* <th style={{ border: "1px solid #ccc", padding: "8px" }}>Параметр</th> */}
            <th style={{ border: "1px solid #ccc", padding: "8px", width: "50%" }}>Отображение</th>
            <th style={{ border: "1px solid #ccc", padding: "8px", width: "50%" }}>Значение</th>
          </tr>
        </thead>
        <tbody>
          {/* {Object.entries(data)
          .filter(([key]) => accessibleParams.some(p => p.param === key)) 
          .map(([key, value]) => { */}
          {configConfig.params
            .filter(param => data.hasOwnProperty(param.paramName) && accessibleParams.some(p => p.param === param.paramName))
            .sort((a, b) => a.sorting - b.sorting)
            .map(param => {
            const key = param.paramName;
            const value = data[key];
            const type = param.type || "string";
            const source = param.source;
            const access = accessibleParams.find(p => p.param === key);
            const canEdit = access?.canEdit ?? false;
            const canCheck = access?.canCheck ?? false;

            // console.log('data = ' + JSON.stringify(data, null, 2))
            // console.log("accessibleParams = ", accessibleParams)

            return (
              <tr key={key}>
                {/* <td style={{ border: "1px solid #ccc", padding: "8px" }}>{key}</td> */}
                <td style={{ border: "1px solid #ccc", padding: "8px" }}>{getLabel(key)}</td>
                <td style={{ border: "1px solid #ccc", padding: "8px" }}>

                  {type === "string" && (
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => handleChange(key, e.target.value)}
                      disabled={!canEdit}
                    />
                  )}
                  {type === "number" && (
                    <input
                      type="number"
                      value={value}
                      onChange={(e) => handleChange(key, e.target.value)}
                      disabled={!canEdit}
                      // onChange={(e) => {
                      //   console.log('type: number, value:', e.target.value);
                      //   handleChange(key, e.target.value);
                      // }}
                    />
                  )}
                  {type === "boolean" && (
                  <input
                    type="checkbox"
                    checked={Boolean(value)} // Учитываем структуру value
                    onChange={(e) => handleChange(key, e.target.checked)}
                    disabled={!canEdit}
                  />
                  )}
                  {type === "date" && (
                    <input
                      className="valueClient"
                      type="date"
                      value={value}
                          onChange={(e) => handleChange(key, e.target.value)}
                          disabled={!canEdit}
                    />
                  )}
                  {type === "list" && (
                    <select
                    value={
                      getOptionsForList(source).find((option) => String(option.id) === String(value) || String(option.name) === String(value))?.id || ""
                    }
                      onChange={(e) => {
                        const selectedOption = getOptionsForList(source).find(
                          (option) => String(option.id) === e.target.value
                        );
                        handleChange(key, selectedOption?.name || ""); // Сохраняем имя, если найдено
                        
                      }}
                      disabled={!canEdit}
                    >
                      <option value="">Выберите значение</option>
                      {getOptionsForList(source).map((option) => (
                        <option key={option.id} value={String(option.id)}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {type === "list" && source === "orders" && (
                    <select
                      value={
                        String(
                          getOptionsForList(source).find((option) => String(option.id) === String(value))?.id || ""
                        )
                      }
                      onChange={(e) => {
                        const selectedOption = getOptionsForList(source).find(
                          (option) => String(option.id) === e.target.value
                        );
                        handleChange(key, selectedOption?.id || ""); // Сохраняем id, если найдено
                      }}
                      disabled={!canEdit}
                    >
                      <option value="">Выберите значение</option>
                      {getOptionsForList(source).map((option) => (
                        <option key={option.id} value={String(option.id)}>
                          {option.order_number}
                        </option>
                      ))}
                    </select>
                  )}
                  {type === "check_date" && (
                    <div>
                      <input
                        type="checkbox"
                        checked={Boolean(value?.checked)} // Учитываем структуру value
                        disabled={!canEdit}
                        onChange={(e) =>{
                          const checkedValue = e.target.checked;
                          const dateValue = checkedValue ? new Date().toISOString().split("T")[0] : ""; // Получаем текущую дату в формате yyyy-mm-dd
                          // handleChange(key, { ...value, checked: e.target.checked })
                          handleChange(key, {
                            ...value,
                            checked: checkedValue,
                            date: dateValue,
                            user: checkedValue ? user?.name || "" : "",
                          })
                        }}
                      />
                      {value?.checked && (
                        <input
                          type="date"
                          value={value?.date || ""} // Значение даты
                          onChange={(e) =>
                            handleChange(key, { ...value, date: e.target.value })
                          }
                          placeholder="Выберите дату"
                          disabled={!canEdit}
                        />
                      )}
                    </div>
                  )}
                  {type === "text_date" && (() => {
                    const raw = value;
                    const val = typeof raw === "object" && raw !== null
                      ? raw
                      : { text: "", date: "" };

                    return (
                      <div className="flex gap-2 items-center w-full">
                        {/* Текстовое поле */}
                        <input
                          type="text"
                          value={val.text || ""}
                          onChange={(e) => {
                            const newText = e.target.value;
                            handleChange(key, {
                              text: newText,
                              date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
                            });
                          }}
                          disabled={!canEdit}
                          className="flex-1 p-[6px] border border-gray-300 rounded-md"
                          placeholder="Введите текст"
                        />

                        {/* Поле даты (только для отображения и ручной правки) */}
                        <input
                          type="date"
                          value={val.date || ""}
                          onChange={(e) =>
                            handleChange(key, {
                              ...val,
                              date: e.target.value,
                            })
                          }
                          disabled={!canEdit}
                          className="w-[140px] p-[6px] border border-gray-300 rounded-md"
                        />
                      </div>
                    );
                  })()}

                  {type === "text_date_admin" && (() => {
                    // Нормализуем incoming value, добавляя поле date
                    const raw = value;
                    let val;
                    if (typeof raw === "string") {
                      // Старый формат — строка
                      val = {
                        adminText: raw,
                        adminChecked: Boolean(raw),
                        adminHasEdited: false,
                        date: "", // пока нет даты
                      };
                    } else {
                      // Новый формат — объект или undefined
                      const obj = raw || {};
                      val = {
                        adminText: obj.adminText || "",
                        adminChecked:
                          typeof obj.adminChecked === "boolean"
                            ? obj.adminChecked
                            : Boolean(obj.adminText),
                        adminHasEdited: obj.adminHasEdited || false,
                        date: obj.date || "",
                      };
                    }

                    return (
                      <div className="flex items-center gap-2 w-full">
                        {/* Текстовое поле */}
                        <input
                          type="text"
                          value={val.adminText}
                          disabled={val.adminChecked && !canCheck}
                          onChange={(e) =>
                            handleChange(key, {
                              ...val,
                              adminText: e.target.value,
                            })
                          }
                          placeholder="Введите комментарий"
                          className="flex-1 p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                        />


                        {/* Чекбокс */}
                        <input
                          type="checkbox"
                          checked={val.adminChecked}
                          disabled={!val.adminText || (val.adminChecked && !canCheck)}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            // Если ставим галочку, добавляем текущую дату; если снимаем — очищаем дату
                            const newDate = isChecked
                              ? new Date().toISOString().slice(0, 10)
                              : "";
                            handleChange(key, {
                              ...val,
                              adminChecked: isChecked,
                              adminHasEdited: true,
                              date: newDate,
                            });
                          }}
                          className="rounded focus:ring-2 focus:ring-blue-500"
                        />
                              {/* Поле даты (отображает дату при установке галочки) */}
                        <input
                          type="date"
                          value={val.date || ""}
                          onChange={(e) =>
                            handleChange(key, {
                              ...val,
                              date: e.target.value,
                            })
                          }
                          disabled={!canEdit}
                          // className="w-[140px] p-[6px] border border-gray-300 rounded-md bg-gray-100 text-gray-600"
                          className="w-[140px] p-[6px] border border-gray-300 rounded-md"
                        />
                      </div>
                    );
                  })()}
                  {type === "check_date_admin" && (
                    <div>
                      <input
                        type="checkbox"
                        checked={Boolean(value?.checked)} // Учитываем структуру value
                        disabled={!canCheck && value?.checked} // Запрещаем снимать галочку, если canCheck запрещает
                        onChange={(e) =>{
                          const checkedValue = e.target.checked;
                          const dateValue = checkedValue ? new Date().toISOString().split("T")[0] : ""; // Получаем текущую дату в формате yyyy-mm-dd
                          // handleChange(key, { ...value, checked: e.target.checked })
                          handleChange(key, {
                            ...value,
                            checked: checkedValue,
                            date: dateValue,
                            user: checkedValue ? user?.name || "" : "",
                          })
                        }}
                      />
                      {value?.checked && (
                        <input
                          type="date"
                          value={value?.date || ""} // Значение даты
                          onChange={(e) =>
                            handleChange(key, { ...value, date: e.target.value })
                          }
                          placeholder="Выберите дату"
                          disabled={!canCheck && value?.checked}
                        />
                      )}
                    </div>
                  )}
                  {type === "boolean_admin" && (
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(e) => {
                        const newValue = e.target.checked;

                        // Если уже true и canCheck запрещен — не даем снять галочку
                        if (canCheck || newValue) {
                          handleChange(key, newValue);
                        }
                      
                      }}
                      className="rounded focus:ring-2 focus:ring-blue-500"
                      disabled={!canCheck && value === true} // Запрещаем снимать галочку, если canCheck запрещает
                      title={!canCheck && value === true ? "Нельзя снять галочку после установки" : ""}
                    />
                  )}
                  {type === "check_text_admin" && (() => {
                    // Нормализуем incoming value:
                    // — если это просто строка (до миграции), оборачиваем её в новый объект
                    let val;
                    if (typeof value === "string") {
                      // Старый формат — строка: превращаем её в объект
                      val = {
                        adminText: value,
                        // ставим чек, раз уже есть текст
                        adminChecked: Boolean(value),
                        adminHasEdited: false,
                      };
                    } else {
                      // Новый формат — объект или undefined
                      const obj = value || {};
                      val = {
                        adminText: obj.adminText || "",
                        // если в объекте уже было свойство adminChecked — используем его,
                        // иначе ставим чек, если есть adminText
                        adminChecked:
                          typeof obj.adminChecked === "boolean"
                            ? obj.adminChecked
                            : Boolean(obj.adminText),
                        adminHasEdited: obj.adminHasEdited || false,
                      };
                    }
                    return (
                      <div className="flex items-center gap-2 w-full">

                        {/* Чекбокс */}
                        <input
                          type="checkbox"
                          checked={val.adminChecked}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            // Отменить нельзя, если canCheck = false
                            if (!isChecked && !canCheck) return;
                            handleChange(key, {
                              ...val,
                              adminChecked: isChecked,
                              adminHasEdited: true,
                            });
                          }}
                          disabled={!val.adminText || (val.adminChecked && !canCheck)}
                          className="rounded focus:ring-2 focus:ring-blue-500"
                        />

                        {/* Текстовое поле */}
                        <input
                          type="text"
                          value={val.adminText}
                          onChange={(e) =>
                            handleChange(key, {
                              ...val,
                              adminText: e.target.value,
                            })
                          }
                          disabled={val.adminChecked && !canCheck}
                          placeholder="Введите текст"
                          className={`p-[6px] border rounded-md ${
                            val.adminChecked && !canCheck
                              ? "bg-gray-100 text-gray-500"
                              : "border-gray-300 focus:ring focus:ring-blue-300"
                          }`}
                        />

                      </div>
                    );
                  })()}
                  {/* {type === "list" && source === "fields" && (
                    <select
                      value={
                        getOptionsForList(source).find((option) => option.name === value)?.id || ""
                      }
                      onChange={(e) => {
                        const selectedOption = getOptionsForList(source).find(
                          (option) => String(option.id) === e.target.value
                        );
                        handleChange(key, selectedOption?.name || ""); // Сохраняем имя, если найдено
                      }}
                    >
                      <option value="">Выберите значение</option>
                      {getOptionsForList(source).map((option) => (
                        <option key={option.id} value={String(option.id)}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  )} */}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>



      {/* <button onClick={handleSave} disabled={isSaving}>
        {isSaving ? "Сохранение..." : "Сохранить"}
      </button>
      <button onClick={handleDelete}>Удалить</button>
      <button onClick={() => router.push(`/order/${orderConfig.order_id}`)}>Перейти в заказ</button> */}

      {/** Блок вывода кнопок */}
      {accessibleParams.some(p => p.param === "buttonsAddons") && (() => {
        const canEdit = accessibleParams.find(p => p.param === "buttonsAddons")?.canEdit ?? false;

        return (
          <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-6 mt-6 border border-gray-200">
            <div className="flex space-x-4">
              <div className="w-full">
                <button 
                  onClick={handleSave} 
                  disabled={!canEdit || isSaving} 
                  className={`px-4 py-2 rounded-lg ${canEdit ? "os-primary-bg text-white" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}
                >
                  {isSaving ? "Сохранение..." : "Сохранить"}                 
                </button>
              </div>      

              <div className="w-full">
                <button  
                  type="button" 
                  onClick={() => router.push(`/order/${orderConfig.order_id}`)}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                >
                  Перейти в заказ
                </button>
              </div>

              <div className="w-full">
                <button 
                  onClick={handleDelete} 
                  disabled={!canEdit} 
                  className={`px-4 py-2 rounded-lg ${canEdit ? "bg-red-500 text-white hover:bg-red-600" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}
                >
                  Удалить
                </button>
              </div>
            </div>        
          </div>
        );
      })()}    


    </div>
  );
};

export default OrderConfigPage;



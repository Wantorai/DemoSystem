// components/AddOrderConfig.js

'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { useRouter, useSearchParams  } from 'next/navigation';
import axios from "axios";
import Spinner from "../components/Spinner";
import { toast } from 'react-toastify';

export default function AddOrderStruct({ addonId, addonName}) {
    const [configConfig, setConfigConfig] = useState([]);
    const [structData, setStructData] = useState({});
    const [loading, setLoading] = useState(true);
    const [fields, setFields] = useState([]);
    const [furnVendors, setFurnVendors] = useState([]);
    const [fasadVendors, setFasadVendors] = useState([]);
    const [workVendors, setWorkVendors] = useState([]);
    const [orders, setOrders] = useState([]);
    const [installers, setInstallers] = useState([]);
    const [technics, setTechnics] = useState([]);
    const router = useRouter();
    const searchParams = useSearchParams();
    const [search, setSearch] = useState(""); // Состояние для поиска
    const [showOptions, setShowOptions] = useState(false); // Управление отображением списка заказов

    const orderIdFromQuery = searchParams.get('orderId');
    // console.log("orderId :", orderId )

    // Загрузка списка установщиков и технологов, ячеек и заказов
    useEffect(() => {
      
      const fetchData = async () => {
        const installersResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/installers`);
        const technicsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/technics`);
        const fieldsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/fields`);
        const ordersResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders`);
        const furnVendorsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/furnVendors`);
        const fasadVendorsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/fasadVendors`);
        const workVendorsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/workVendors`);
        setInstallers(await installersResponse.json());
        setTechnics(await technicsResponse.json());
        setFields(await fieldsResponse.json());
        setOrders(await ordersResponse.json());
        setFurnVendors(await furnVendorsResponse.json());
        setFasadVendors(await fasadVendorsResponse.json());
        setWorkVendors(await workVendorsResponse.json());

        // console.log('orderReadysResponse:', JSON.stringify(orderReadysResponse, null, 2)) 
        // console.log('technicsResponse:', JSON.stringify(technicsResponse, null, 2))  

      };
      fetchData();
    }, []);



    // Загрузка конфигурации
    useEffect(() => {
     if (!addonId) return;
        // console.log("useEffect вызывается для addonId:", addonId);

        const fetchConfig = async () => {

        // console.log("Запрос на получение конфигурации отправлен...");
        setLoading(true);
        try {
            const response = await axios.get(
            `${process.env.NEXT_PUBLIC_API_URL}/addons/${addonId}/configs`
            );

            // console.log("Ответ от API:", response.data);

            if (response.data && response.data.params) {
              setConfigConfig(response.data.params); // Заполняем configConfig

              // Инициализация formData с пустыми значениями
              const initialFormData = {};
              response.data.params.forEach((field) => {
                  initialFormData[field.paramName] = "";
              });

              // console.log("Инициализированные данные формы: ", initialFormData); // Логируем инициализированные данные

              // // Устанавливаем дефолтное значение для нужных date-полей, если они есть в конфигурации
              // const defaultDate = new Date().toISOString().split("T")[0];
              // ["furn_param2", "fasad_param2", "work_param2"].forEach((key) => {
              //   if (key in initialFormData) {
              //     // Если параметр есть — проверяем, если пустой, то ставим дефолтную дату
              //     if (!initialFormData[key]) {
              //       initialFormData[key] = defaultDate;
              //     }
              //   }
              // });

              setStructData(initialFormData);

            } else {
            console.warn("Конфигурация отсутствует.");
            setStructData([]);  // Обнуляем данные, если конфигурация не найдена
            }
        } catch (error) {
            console.error("Ошибка при загрузке конфигурации:", error);
            setStructData([]);  // Обнуляем данные в случае ошибки
        } finally {
            setLoading(false);
          }
        };

        fetchConfig();
    }, [addonId]);






    const handleChange = useCallback((paramName, value) => {
      setStructData((prevData) => {
        const updatedData = { ...prevData, [paramName]: value };
        // console.log("Измененные данные формы: ", updatedData);
        return updatedData;
      });
    }, []); // Если handleChange не зависит от каких-либо переменных, пустой массив зависимостей подойдет
  
    useEffect(() => {
      if (!structData.order_id && orderIdFromQuery) {
        handleChange("order_id", orderIdFromQuery);
      }
    }, [orderIdFromQuery, structData.order_id, handleChange]);

    const handleCheckDateChange = (paramName, isChecked) => {
      setStructData({
        ...structData,
        [paramName]: {
          checked: isChecked,
          date: isChecked ? new Date().toISOString().split("T")[0] : "", // Устанавливаем текущую дату в формате YYYY-MM-DD
        },
      });
    };
    
    const handleSubmit = async (e) => {
      try {
        if (e) e.preventDefault();
    
        const configData = {
          order_id: structData.order_id ? parseInt(structData.order_id, 10) : undefined,
          addon_id: addonId ? parseInt(addonId, 10) : null,
          data: Object.keys(structData).length > 0 ? structData : null,
        };
    
        if (configData.data) {
          delete configData.data.order_id;
        }
    
        //console.log("Отправляемые данные: ", configData);
    
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orderConfigs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(configData),
        });
    
        //console.log("Ответ от сервера: ", response);
    
        if (!response.ok) {
          const textResponse = await response.text();
          //console.error("Текст ошибки от сервера: ", textResponse);
          throw new Error(textResponse);
        }
    
        // console.log("Объект конфигурации успешно создан!");
        setStructData(
          configConfig.reduce((acc, field) => {
            acc[field.paramName] = field.type === "check_date" ? { checked: false, date: "" } : "";
            return acc;
          }, {})
        );
      } catch (error) {
        console.error("Ошибка в handleSubmit:", error);
        toast(error.message);
      }
    };
        

    // Для выбора из списка
    const getOptions = (source) => {
      if (source === "fields") return fields;
      if (source === "technics") return technics;
      if (source === "installers") return installers;
      if (source === "furnVendors") return furnVendors;
      if (source === "fasadVendors") return fasadVendors;
      if (source === "workVendors") return workVendors;
      return [];
    };




    // Фильтруем заказы по введенному значению
    const filteredOrders = orders.filter((order) => {
      // console.log("Проверяем order.id:", order.id, "с order_number:", order.data?.order_number);
      return order.data?.order_number?.toString().includes(search);
    });


    // Новая функция для получения номера заказа
    const getOrderNumber = useCallback((order_id) => {
      // console.log("order_id =", order_id); // Теперь логирует правильно
      const order = orders?.find(a => a.id === parseInt(order_id, 10)); // Преобразование order_id в число для точного сравнения
      return order?.data?.order_number || "❌";
    }, [orders]);

    useEffect(() => {
      // console.log("structData.order_id изменился:", structData.order_id);
      // console.log("orders загружены:", orders);

      if (structData.order_id && orders.length > 0) {
        const orderNumber = getOrderNumber(structData.order_id); // Теперь вызываем функцию корректно
        setSearch(orderNumber);
      }
    }, [structData.order_id, orders, getOrderNumber]); 




    if (loading) {
      return <Spinner />;
    }
  
    // console.log('structData.order_id : ' + structData.order_id)

    

    return (
      
      <form onSubmit={handleSubmit}>
        <div className="details">
        <h1>Заказная позиция {addonName} </h1>
          {/* Выпадающий список для выбора номера заказа */}

          <div className="detail-row">
            <label className="labelClient">Номер заказа:</label>
  
              <input
                type="text"
                className="valueClient"
                placeholder="Введите номер заказа..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setShowOptions(true);  // Показываем список при вводе
                }}
                onFocus={() => setShowOptions(true)} // Показываем список при фокусе на поле

                // disabled={!accessibleParams.find(p => p.param === "order_id")?.canEdit ?? false}
              />
              {showOptions && search && (
                <div>
                  {filteredOrders.length > 0 ? (
                    
                    filteredOrders.map((order) => (
                      <div
                        key={order.id}
                        // className="p-2 cursor-pointer hover:bg-gray-200"
                        onClick={() => {
                          // if (accessibleParams.find(p => p.param === "order_id")?.canEdit) {
                            handleChange("order_id", order.id);
                            setShowOptions(false);  // Скрываем список после выбора
                          //}
                        }}
                      > 
                        {getOrderNumber(order.id)}
                      </div>
                    ))
                  ) : (
                    <div className="p-2 text-gray-500">Не найдено</div>
                  )}
                </div>
              )}
            
          </div>


          {/* Рендер параметров из configConfig */}        
          {configConfig.length > 0 && configConfig.map((field) => (
          <div key={field.paramName} className="detail-row">

            <label className="labelClient">{field.label}: </label>

            

            {field.type === "string" && (
              <input
                className="valueClient"
                type="text"
                placeholder=""
                value={structData[field.paramName] || ""}
                onChange={(e) => handleChange(field.paramName, e.target.value)}
                
              />
            )}

            {field.type === "number" && (
              <input
                className="valueClient"
                type="number"
                placeholder=""
                value={structData[field.paramName] || ""}
                onChange={(e) => handleChange(field.paramName, e.target.value)}
                
              />
            )}

            {field.type === "boolean" && (
                <input
                  className="valueClient"
                  type="checkbox"
                  checked={structData[field.paramName]}
                  onChange={(e) => handleChange(field.paramName, e.target.checked)}
                />
              )}

            {field.type === "date" && (
                <input
                  className="valueClient"
                  type="date"
                  value={structData[field.paramName]}
                  onChange={(e) => handleChange(field.paramName, e.target.value)}
                />
            )}


            {/* {field.type === "date" &&
                ["furn_param2", "fasad_param2", "work_param2"].includes(field.paramName) && (
                <input
                  type="date"
                  value={structData[field.paramName] || new Date().toISOString().split("T")[0]}
                  onChange={(e) => handleChange(field.paramName, e.target.value)}
                  className="valueClient"
                />
              )} */}



            {field.type === "list" && (
              <select
                className="valueClient"
                value={structData[field.paramName] || ""}
                onChange={(e) => handleChange(field.paramName, e.target.value)}
              >
                <option value="">Выберите...</option>
                {getOptions(field.source).map((option) => (
                  <option key={option.id} value={option.name}>
                    {option.name}
                  </option>
                ))}
              </select>
            )}

            {field.type === "check_date" && (
              <div className="details">
                <label className="labelClient">
                  <input
                    className="valueClient"
                    type="checkbox"
                    checked={structData[field.paramName]?.checked || false}
                    onChange={(e) =>
                      handleCheckDateChange(field.paramName, e.target.checked)
                    }
                  />
                </label>
                {structData[field.paramName]?.checked && (
                  <span style={{ marginLeft: "8px" }}>
                    {structData[field.paramName]?.date}
                  </span>
                )}
              </div>
            )}

            <p></p>
          </div>
        ))}

        </div>
        <button onClick={() => router.push(`/order/${structData.order_id}`)} type=" ">Сохранить и перейти в заказ</button>
        <button onClick={() => router.push('/details')} type=" ">Сохранить и перейти в заказные позиции</button>
        <button onClick={() => router.push('/main')} type=" ">Сохранить и перейти в график</button>
        <button  type="button" onClick={() => router.back()}>Отмена</button>
      </form>
    );
    
};



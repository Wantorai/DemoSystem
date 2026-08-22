// // components/AddOrderConfigs.js


import React, { useState, useEffect, useMemo, useContext } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { AuthContext } from "../context/AuthContext";

export default function AddOrderConfigsForm({ addonId, addonName, allAddons, orderId, orderNumber }) {
  const [orderConfigs, setOrderConfigs] = useState([]);
  const [configConfig, setConfigConfig] = useState({ params: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const router = useRouter();
  const [furnVendors, setFurnVendors] = useState([]);
  const [fasadVendors, setFasadVendors] = useState([]);
  const [workVendors, setWorkVendors] = useState([]);
  const [fields, setFields] = useState([]);
  const [orders, setOrders] = useState([]); // Заказы
  const { user } = useContext(AuthContext);
  const [accessibleParams, setAccessibleParams] = useState(new Set());

  let currentRoleId;
  if (user) {currentRoleId = user.roleId} // Получаем роль юзера)

  


  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const ordersResponse = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/orders`);
        setOrders(ordersResponse.data);

        const permissionParamsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/role_permissionParams/${currentRoleId}`);

        const dataParams = await permissionParamsResponse.json();
        // console.log("dataParams = ", dataParams)
        setAccessibleParams(dataParams); // Сохраняем разрешенные параметры в Set для быстрого поиска

      } catch (error) {
        console.error('Ошибка загрузки данных:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, [currentRoleId]);



  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        if (addonId) {
          const configResponse = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/addons/${addonId}/configs`
          );
          if (!configResponse.ok) throw new Error("Ошибка загрузки конфигурации");
          const configData = await configResponse.json();
          setConfigConfig(configData);
        } else {
          setConfigConfig({ params: [] });
        }

        const url = addonId
          ? `${process.env.NEXT_PUBLIC_API_URL}/orderConfigs?addonId=${addonId}`
          : `${process.env.NEXT_PUBLIC_API_URL}/orderConfigs`;

        const response = await fetch(url);
        if (!response.ok) throw new Error("Ошибка загрузки объектов");
        const data = await response.json();
        setOrderConfigs(data);

        const [furnVendorsRes, fasadVendorsRes, workVendorsRes, fieldsRes] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/furnVendors`),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/fasadVendors`),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/workVendors`),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/fields`),
        ]);

        setFurnVendors(await furnVendorsRes.json());
        setFasadVendors(await fasadVendorsRes.json());
        setWorkVendors(await workVendorsRes.json());
        setFields(await fieldsRes.json());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [addonId]);

  // Фильтрация по orderId
  const filteredOrderConfigs = useMemo(() => {
    return orderConfigs
      .filter((orderConfig) => !orderId || Number(orderConfig.order_id) === Number(orderId))
      .filter((orderConfig) => !addonId || Number(orderConfig.addon_id) === Number(addonId))
  }, [orderConfigs, orderId, addonId]);

  const handleOrderConfigClick = (id) => {
    router.push(`/orderConfig/${id}`);
  };

  // Новая функция для получения имени надстройки
  const getAddonName = (addonId) => {
    // console.log('allAddons = ' + allAddons)
    // console.log('addonId = ' + addonId)
    const addon = allAddons?.find(a => a.id === addonId);
    return addon?.name || "❌";
  };  


  // Новая функция для получения номера заказа
  const getOrderNumber = (order_id) => {
    // console.log('order_id = ' + order_id)
    // console.log('orders = ' + orders)
    const order = orders?.find(a => a.id === order_id);
    return order?.data.order_number || "❌";
  };  


  if (loading) return <div>Загрузка...</div>;
  if (error) return <div>Ошибка: {error}</div>;

  if (accessibleParams && typeof accessibleParams[Symbol.iterator] === 'function') {
    var canEdit = Array.from(accessibleParams).find(p => p.param === "сreateObjectAddon")?.canEdit ?? false;
  }
  

  return (
    <div>

       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
         <h2>
           {addonName 
             ? `Надстройка: ${addonName}`
             : 'Все объекты'}
         </h2>
         <button onClick={() => router.push(`/orderConfigs/add${addonId ? `?addonId=${addonId}` : ''}`)}
          disabled={!canEdit}
          className={`px-4 py-2 rounded-lg ${canEdit ? "os-primary-bg text-white" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}
          >
           ➕ Новый объект
         </button>
       </div>

       <table className="tasks" style={{ width: "100%", borderCollapse: "collapse" }}>
         <thead>
           <tr>
             {/* Добавляем колонку "Надстройка" только в режиме всех объектов */}
             {!addonId && (
              <th style={{ border: "1px solid #ccc", padding: "8px" }}>Надстройка</th>
             )}
             <th style={{ border: "1px solid #ccc", padding: "8px" }}>Номер заказа</th>
             {configConfig.params.map((config) => (
               <th key={config.paramName} style={{ border: "1px solid #ccc", padding: "8px" }}>
                 {config.label}
               </th>
             ))}
           </tr>
         </thead>
         <tbody>

           {filteredOrderConfigs.map((orderConfig) => (
             <tr key={orderConfig.id} onClick={() => handleOrderConfigClick(orderConfig.id)} style={{ cursor: 'pointer' }}>
               {/* Новый столбец для номера заказа */}
                 {/* Колонка с названием надстройки */}
                 {!addonId && (
                   <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                     {getAddonName(orderConfig.addon_id)
                    
                     }
                   </td>
                 )}
                    <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                      {getOrderNumber(orderConfig.order_id)}
                    </td>
               {configConfig.params.map((config) => {
                 const value = orderConfig.data[config.paramName];
                 const source = config?.source; // Получаем источник (если есть)
                 // console.log(" source:", source); // Логируем значение source
                 let displayValue = value;

                 // console.log('config.paramName:', config.paramName); // Логируем название параметра
                 // console.log('value:', value); // Логируем значение, которое ищем
                 // console.log('source:', source); // Логируем источник (например, furnVendors)

                 // Динамическая загрузка списка по названию source
                 let options = [];
                 if (source === "furnVendors") {
                   options = furnVendors;
                 } else if (source === "fields") {
                   options = fields;
                 } else if (source === "fasadVendors") {
                   options = fasadVendors;
                 } else if (source === "workVendors") {
                   options = workVendors;
                 }

                 // console.log('options:', options); // Логируем доступный список для поиска

                 // Обработка формата данных
                 if (config.type === "check_date" && value) {
                   // Если поле 'checked' активно, форматируем дату
                     if (value.checked) {
                       const date = new Date(value.date);
                       displayValue = date.toLocaleDateString("ru-RU", {
                         day: "2-digit",
                         month: "2-digit",
                         year: "numeric",
                       });
                     } else {
                       displayValue = "—"; // Если чекбокс не выбран, то отображаем пустую строку
                     }
                 } else if (config.type === "boolean") {
                   displayValue = value ? "ДА" : "❌";
                 } else if (config.type === "check_text" && value) {
                   // Обработка check_text типа
                   displayValue = value.checked ? value.text : "❌";
                 } else if (config.type === "list" && source === 'orders' && value) {
                   // Если источник - заказы, то отображаем номер заказа
                   displayValue = value ? orderNumber : "❌";
                 } else if (config.type === "list" && source != 'orders' && options.length > 0) {
                   //console.log('orderConfig = ', orderConfig)
                   displayValue = value;
                   //console.log('value = ', value)
                 }

                return (
                  <td key={config.paramName} style={{ border: "1px solid #ccc", padding: "8px" }}>
                     {displayValue || "❌"}
                   </td>
                 );
               })}
             </tr>
           ))}








        </tbody>
      </table>
    </div>
  );
}







// 'use client';

// import React, { useState, useEffect } from 'react';
// import { useRouter } from 'next/navigation';

// export default function AddOrderConfigsForm({ addonId, addonName, allAddons  }) {
//   const [orderConfigs, setOrderConfigs] = useState([]);
//   const [configConfig, setConfigConfig] = useState({ params: [] });
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(null);
//   const router = useRouter();
//   const [furnVendors, setFurnVendors] = useState([]);
//   const [fasadVendors, setFasadVendors] = useState([]);
//   const [workVendors, setWorkVendors] = useState([]);
//   const [fields, setFields] = useState([]);

//   useEffect(() => {
//     const fetchData = async () => {
//       setLoading(true);
//       setError(null);

//       try {
//         // Загрузка конфигурации только если выбран addon
//         if (addonId) {
//           const configResponse = await fetch(
//             `${process.env.NEXT_PUBLIC_API_URL}/addons/${addonId}/configs`
//           );
//           if (!configResponse.ok) throw new Error("Ошибка загрузки конфигурации");
//           const configData = await configResponse.json();
//           setConfigConfig(configData);
//         } else {
//           setConfigConfig({ params: [] });
//         }

//         // Загрузка объектов
//         const url = addonId
//           ? `${process.env.NEXT_PUBLIC_API_URL}/orderConfigs?addonId=${addonId}`
//           : `${process.env.NEXT_PUBLIC_API_URL}/orderConfigs`;
        
//         const response = await fetch(url);
//         if (!response.ok) throw new Error("Ошибка загрузки объектов");
//         const data = await response.json();
//         setOrderConfigs(data);

//         // console.log('data = ' + JSON.stringify(data, null, 2))

//         // Загрузка справочников
//         const [furnVendorsRes, fasadVendorsRes, workVendorsRes, fieldsRes] = await Promise.all([
//           fetch(`${process.env.NEXT_PUBLIC_API_URL}/furnVendors`),
//           fetch(`${process.env.NEXT_PUBLIC_API_URL}/fasadVendors`),
//           fetch(`${process.env.NEXT_PUBLIC_API_URL}/workVendors`),
//           fetch(`${process.env.NEXT_PUBLIC_API_URL}/fields`),
//         ]);
        
//         setFurnVendors(await furnVendorsRes.json());
//         setFasadVendors(await fasadVendorsRes.json());
//         setWorkVendors(await workVendorsRes.json());
//         setFields(await fieldsRes.json());

//       } catch (err) {
//         setError(err.message);
//       } finally {
//         setLoading(false);
//       }
//     };

//     fetchData();
//   }, [addonId]);

//   const handleOrderConfigClick = (id) => {
//     router.push(`/orderConfig/${id}`); // Переход на страницу объекта по id
//   };



//   // Новая функция для получения имени надстройки
//   const getAddonName = (addonId) => {
//     // console.log('allAddons = ' + allAddons)
//     // console.log('addonId = ' + addonId)
//     const addon = allAddons?.find(a => a.id === addonId);
//     return addon?.name || "Неизвестно";
//   };  

//   if (loading) return <div>Загрузка...</div>;
//   if (error) return <div>Ошибка: {error}</div>;

//   return (
//     <div>
//       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//         <h2>
//           {addonName 
//             ? `Надстройка: ${addonName}`
//             : 'Все объекты'}
//         </h2>
//         <button onClick={() => router.push(`/orderConfigs/add${addonId ? `?addonId=${addonId}` : ''}`)}>
//           + Новый объект
//         </button>
//       </div>

//       <table className="tasks" style={{ width: "100%", borderCollapse: "collapse" }}>
//         <thead>
//           <tr>
//             {/* Добавляем колонку "Надстройка" только в режиме всех объектов */}
//             {!addonId && (
//               <th style={{ border: "1px solid #ccc", padding: "8px" }}>Надстройка</th>
//             )}
//             <th style={{ border: "1px solid #ccc", padding: "8px" }}>Номер заказа</th>
//             {configConfig.params.map((config) => (
//               <th key={config.paramName} style={{ border: "1px solid #ccc", padding: "8px" }}>
//                 {config.label}
//               </th>
//             ))}
//           </tr>
//         </thead>
//         <tbody>

            
//           {orderConfigs.map((orderConfig) => (
//             <tr key={orderConfig.id} onClick={() => handleOrderConfigClick(orderConfig.id)} style={{ cursor: 'pointer' }}>
//               {/* Новый столбец для номера заказа */}
//                 {/* Колонка с названием надстройки */}
//                 {!addonId && (
//                   <td style={{ border: "1px solid #ccc", padding: "8px" }}>
//                     {getAddonName(orderConfig.addon_id)
                    
//                     }
//                   </td>
//                 )}
//               <td style={{ border: "1px solid #ccc", padding: "8px" }}>
//                 {orderConfig.order_id ? `ART-${1000 + orderConfig.order_id}` : "—"}
//               </td>
//               {configConfig.params.map((config) => {
//                 const value = orderConfig.data[config.paramName];
//                 const source = config?.source; // Получаем источник (если есть)
//                 // console.log(" source:", source); // Логируем значение source
//                 let displayValue = value;

//                 // console.log('config.paramName:', config.paramName); // Логируем название параметра
//                 // console.log('value:', value); // Логируем значение, которое ищем
//                 // console.log('source:', source); // Логируем источник (например, furnVendors)

//                 // Динамическая загрузка списка по названию source
//                 let options = [];
//                 if (source === "furnVendors") {
//                   options = furnVendors;
//                 } else if (source === "fields") {
//                   options = fields;
//                 } else if (source === "fasadVendors") {
//                   options = fasadVendors;
//                 } else if (source === "workVendors") {
//                   options = workVendors;
//                 }

//                 // console.log('options:', options); // Логируем доступный список для поиска

//                 // Обработка формата данных
//                 if (config.type === "check_date" && value) {
//                   // Если поле 'checked' активно, форматируем дату
//                     if (value.checked) {
//                       const date = new Date(value.date);
//                       displayValue = date.toLocaleDateString("ru-RU", {
//                         day: "2-digit",
//                         month: "2-digit",
//                         year: "numeric",
//                       });
//                     } else {
//                       displayValue = "—"; // Если чекбокс не выбран, то отображаем пустую строку
//                     }
//                 } else if (config.type === "boolean") {
//                   displayValue = value ? "ДА" : "НЕТ";
//                 } else if (config.type === "check_text" && value) {
//                   // Обработка check_text типа
//                   displayValue = value.checked ? value.text : "Нет";
//                 } else if (config.type === "list" && source === 'orders' && value) {
//                   // Если источник - заказы, то отображаем номер заказа
//                   displayValue = value ? `ART-${1000 + value}` : "-";
//                 } else if (config.type === "list" && source != 'orders' && options.length > 0) {
//                   // console.log('value = ' + value)
//                   displayValue = value;
//                 }

//                 return (
//                   <td key={config.paramName} style={{ border: "1px solid #ccc", padding: "8px" }}>
//                     {displayValue || "—"}
//                   </td>
//                 );
//               })}
//             </tr>
//           ))}
//           </tbody>
//       </table>
//     </div>
//   );
// }




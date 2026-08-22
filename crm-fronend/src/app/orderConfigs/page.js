// // // app/orderConfigs/page.js


'use client';

import { Suspense } from 'react';
import OrderConfigsClient from '../../components/OrderConfigsClient';

export default function OrderConfigsPage() {
  return (
    <Suspense fallback={<div>Загрузка страницы...</div>}>
      <OrderConfigsClient />
    </Suspense>
  );
}









// 'use client';

// import { useState, useEffect } from 'react';
// import { useSearchParams } from 'next/navigation';
// import AddOrderConfigsForm from '../../components/AddOrderConfigs';
// import axios from 'axios';

// export default function AddOrderConfigsPage() {
//   const [addons, setAddons] = useState([]);
//   const [orderConfigs, setOrderConfigs] = useState([]); // Объекты конфигураций заказов
//   const [selectedAddon, setSelectedAddon] = useState(null);
//   const [loading, setLoading] = useState(true);
//   const [orderIdFilter, setOrderIdFilter] = useState(''); // Фильтр по номеру заказа

//   const searchParams = useSearchParams();
//   const orderIdFromQuery = searchParams.get('orderId'); // Из URL, если есть
//   const addonId = searchParams.get('addonId'); // Из URL, если есть

//   // При монтировании устанавливаем orderIdFilter из URL (если есть)
//   useEffect(() => {
//     if (orderIdFromQuery) {
//       setOrderIdFilter(orderIdFromQuery);
//     }
//   }, [orderIdFromQuery]);

//   useEffect(() => {
//     const fetchData = async () => {
//       try {
//         // Загружаем список надстроек
//         const addonsResponse = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/addons`);
//         setAddons(addonsResponse.data);

//         // Загружаем список объектов конфигураций заказов
//         const orderConfigsResponse = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/orderConfigs`);
//         setOrderConfigs(orderConfigsResponse.data);
//       } catch (error) {
//         console.error('Ошибка загрузки данных:', error);
//       } finally {
//         setLoading(false);
//       }
//     };
//     fetchData();
//   }, []);
  
//   // Преобразуем введённый номер заказа к реальному orderId
//   const realOrderId = orderIdFilter ? (orderIdFilter - 1000) : '';

//   // Фильтруем объекты конфигураций по номеру заказа, если он задан
//   const filteredOrderConfigs = realOrderId
//     ? orderConfigs.filter(cfg => Number(cfg.order_id) === Number(realOrderId))
//     : orderConfigs;

//   // console.log("filteredOrderConfigs:", filteredOrderConfigs)  

//   // Фильтруем надстройки: если задан orderId, оставляем только те, для которых существует объект конфигурации с данным addon_id
//   const filteredAddons = addons.filter((addon) => {
//     if (!realOrderId) return true;
//     return filteredOrderConfigs.some(
//       (config) => Number(config.addon_id) === Number(addon.id)
//     );
//   });

//   // Если в URL передан addonId, устанавливаем его как выбранный вариант
//   useEffect(() => {
//     if (filteredAddons.length > 0 && addonId) {
//       const selected = filteredAddons.find((a) => a.id === Number(addonId));
//       if (selected) {
//         setSelectedAddon(selected);
//       }
//     }
//   }, [filteredAddons, addonId]);

//   if (loading) {
//     return <p>Загрузка данных...</p>;
//   }


//   return (
//     <div>
//       <h1>Объекты конфигурации</h1>

//       {/* Фильтр по надстройке */}
//       <div>
//         <label className="labelClient" htmlFor="addon-select">Фильтр по надстройке:</label>
//         <select
//           className="newValueConfig"
//           id="addon-select"
//           value={selectedAddon?.id || ''}
//           onChange={(e) => {
//             const selectedId = e.target.value;
//             setSelectedAddon(
//               selectedId
//                 ? filteredAddons.find((a) => a.id === Number(selectedId))
//                 : null
//             );
//           }}
//         >
//           <option value="">Все надстройки</option>
//           {filteredAddons.map((addon) => (
//             <option key={addon.id} value={addon.id}>
//               {addon.name}
//             </option>
//           ))}
//         </select>
//       </div>

//       {/* Фильтр по заказу */}
//       <div>
//         <label className="labelClient" htmlFor="order-id">Фильтр по заказу:</label>
//         <input
//           className="newValueConfig"
//           id="order-id"
//           type="text"
//           value={orderIdFilter || ''}
//           onChange={(e) => {
//             const newOrderId = e.target.value;
//             setOrderIdFilter(newOrderId);
//             // Обновляем URL без перезагрузки страницы:
//             const newUrl = new URL(window.location.href);
//             if (newOrderId) {
//               newUrl.searchParams.set('orderId', newOrderId);
//             } else {
//               newUrl.searchParams.delete('orderId');
//             }
//             window.history.pushState({}, '', newUrl);
//           }}
//           placeholder="Введите только цифры заказа..."
//         />
//       </div>


//       {/* Передаем данные в форму (если нужно) */}  
//       <AddOrderConfigsForm 
//         addonId={selectedAddon?.id} 
//         addonName={selectedAddon?.name}
//         orderId={realOrderId}
//         allAddons={filteredAddons}
//       />
//     </div>
//   );
// }















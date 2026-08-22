// // app/orderConfigs/add/page.js


'use client';

import { Suspense } from 'react';
import AddOrderConfigClient from '../../../components/AddOrderConfigClient';

export default function AddOrderConfigPage() {
  return (
    <Suspense fallback={<div>Загрузка страницы...</div>}>
      <AddOrderConfigClient />
    </Suspense>
  );
}







// 'use client';

// import { useState, useEffect, Suspense } from 'react';
// import { useSearchParams } from 'next/navigation';
// import AddOrderConfigForm from '../../../components/AddOrderConfig';
// import axios from 'axios';

// export default function AddOrderConfigPage() {
//   const searchParams = useSearchParams();
//   const initialAddonId = searchParams.get('addonId'); // Получаем addonId из URL

//   const [addons, setAddons] = useState([]); // Список надстроек
//   const [selectedAddon, setSelectedAddon] = useState(initialAddonId || null); // Выбранная надстройка
//   const [loading, setLoading] = useState(!initialAddonId); // Статус загрузки (если addonId передан, пропускаем загрузку списка)
//   const [addonName, setAddonName] = useState('');

//   // Загружаем список надстроек, если addonId не передан
//   useEffect(() => {
//     if (!initialAddonId) {
//       const fetchAddons = async () => {
//         try {
//           const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/addons`);
//           setAddons(response.data);
//         } catch (error) {
//           console.error('Ошибка загрузки списка надстроек:', error);
//         } finally {
//           setLoading(false);
//         }
//       };
//       fetchAddons();
//     }
//   }, [initialAddonId]);

//   // Если addonId передан, загружаем имя надстройки
//   useEffect(() => {
//     if (initialAddonId) {
//       const fetchAddonName = async () => {
//         try {
//           const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/addons/${initialAddonId}`);
//           setAddonName(response.data.name);
//         } catch (error) {
//           console.error('Ошибка загрузки имени надстройки:', error);
//           setAddonName('Неизвестно');
//         }
//       };
//       fetchAddonName();
//     }
//   }, [initialAddonId]);

//   if (!initialAddonId && loading) {
//     return <p>Загрузка списка надстроек...</p>;
//   }

//   return (
//     <Suspense fallback={<div>Загрузка страницы...</div>}>
//       <div>
//         {/* Если addonId не передан, показываем выпадающий список */}
//         {!initialAddonId && (
//           <div>
//             <label className="labelClient" htmlFor="addon-select">
//               Выберите надстройку:
//             </label>
//             <select
//               className="newValueConfig"
//               id="addon-select"
//               value={selectedAddon || ''}
//               onChange={(e) => setSelectedAddon(e.target.value)}
//             >
//               <option value="" disabled>
//                 -- Выберите --
//               </option>
//               {addons.map((addon) => (
//                 <option key={addon.id} value={addon.id}>
//                   {addon.name}
//                 </option>
//               ))}
//             </select>
//           </div>
//         )}

//         {/* Показываем форму только если выбрана надстройка */}
//         {selectedAddon && (
//           <AddOrderConfigForm addonId={selectedAddon} addonName={addonName} />
//         )}
//       </div>
//     </Suspense>
//   );
// }

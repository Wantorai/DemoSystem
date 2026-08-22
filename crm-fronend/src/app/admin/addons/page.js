// src/app/admin/addons/page.js

"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { toast } from 'react-toastify';

const AddonsList = () => {
  const [addons, setAddons] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  // Здесь columnWidths – объект вида { [columnName]: { width, sortOrder } }
  const [columnWidths, setColumnWidths] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Fetch addons from API
    const fetchAddons = async () => {
      try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/addons`);
        setAddons(response.data);

        const responseConfig = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/config`);       
        setConfigs(responseConfig.data);
      } catch (error) {
        console.error('Error fetching addons:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAddons();
  }, []);

  const handleEdit = (id) => {
    router.push(`/admin/addons/${id}/edit`);
  };

  const handleDelete = async (id) => {
    if (confirm('Уверены что хотите удалить?')) {
      try {
        await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/addons/${id}`);
        setAddons(addons.filter((addon) => addon.id !== id));
      } catch (error) {
        console.error('Error deleting addon:', error);
      }
    }
  };

  const handleCreate = () => {
    router.push('/admin/addons/create');
  };

  // Собираем названия колонок из конфигурации надстроек
  const addonColumnsMap = {};
  const filterOC = configs.filter(item => item.paramName.includes("_"));
  filterOC.forEach(item => { addonColumnsMap[item.label] = item.label });
  // addonColumns – массив имён колонок
  const addonColumns = Object.keys(addonColumnsMap);

  // Загрузка настроек ширины колонок (в виде массива объектов) из API
  useEffect(() => {
    fetchColumnWidths();
  }, []);

  const fetchColumnWidths = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/column-width`);
      // Если данных нет, response.data может быть undefined, поэтому используем [] по умолчанию
      const widths = (response.data || []).reduce((acc, { columnName, width, sortOrder }) => {
        acc[columnName] = { width, sortOrder };
        return acc;
      }, {});
      setColumnWidths(widths);
    } catch (error) {
      console.error('Ошибка при загрузке ширин колонок:', error);
    }
  };

  const handleWidthChange = (columnName, value) => {
    setColumnWidths(prev => ({
      ...prev,
      [columnName]: {
        ...prev[columnName],
        width: parseInt(value) || 0,
      }
    }));
    // console.log("columnWidths =", columnWidths);
  };

  const handleSortOrderChange = (columnName, value) => {
    setColumnWidths(prev => ({
      ...prev,
      [columnName]: {
        ...prev[columnName],
        sortOrder: parseInt(value) || 0,
      }
    }));
    // console.log("columnWidths =", columnWidths);
  };


  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Формируем payload, оставляя только ожидаемые ключи (те, что в addonColumns)
      const payload = {};
      addonColumns.forEach((columnName) => {
        if (columnWidths[columnName]) {
          payload[columnName] = columnWidths[columnName];
        }
      });
      // console.log("Отправляемые данные =", payload);
      // Отправляем записи для каждой колонки из payload
      const requests = Object.entries(payload).map(([columnName, { width, sortOrder }]) =>
        axios.post(`${process.env.NEXT_PUBLIC_API_URL}/column-width`, { columnName, width, sortOrder })
      );
      await Promise.all(requests);
      // console.log('Ширины и сортировки колонок успешно сохранены!');
    } catch (error) {
      console.error('Ошибка при сохранении настроек колонок:', error);
      toast('Ошибка при сохранении настроек колонок.');
    } finally {
      setIsSaving(false);
    }
  };
  


  // const handleSave = async () => {
  //   setIsSaving(true);
  //   try {
  //     console.log("Отправляемые данные =", columnWidths);
  //     // Отправляем записи для каждой колонки
  //     const requests = Object.entries(columnWidths).map(([columnName, { width, sortOrder }]) =>
  //       axios.post(`${process.env.NEXT_PUBLIC_API_URL}/column-width`, { columnName, width, sortOrder })
  //     );
  //     await Promise.all(requests);
  //     console.log('Ширины и сортировки колонок успешно сохранены!');
  //   } catch (error) {
  //     console.error('Ошибка при сохранении настроек колонок:', error);
  //     toast('Ошибка при сохранении настроек колонок.');
  //   } finally {
  //     setIsSaving(false);
  //   }
  // };

  // Сортируем addonColumns по sortOrder, используя данные из columnWidths
  const sortedColumns = addonColumns.slice().sort((a, b) => {
    const aOrder = columnWidths[a]?.sortOrder || 0;
    const bOrder = columnWidths[b]?.sortOrder || 0;
    return aOrder - bOrder;
  });

  if (loading) return <p>Загрузка надстроек...</p>;

  return (
    <div>
      <div>
        <h1>Управление надстройками</h1>
        <button onClick={handleCreate}>Создать новую надстройку</button>
        <p></p>
        <p></p>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Имя</th>
              <th>Описание</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {addons.map((addon) => (
              <tr key={addon.id}>
                <td>{addon.id}</td>
                <td>{addon.name}</td>
                <td>{addon.description}</td>
                <td>
                  <button onClick={() => handleEdit(addon.id)}>Редактировать</button>
                  <button onClick={() => handleDelete(addon.id)}>Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h1>Настройки ширины и порядка колонок для всех кроме Готовности ! </h1>
        <table className="table-auto w-full border-collapse border border-gray-300">
          <thead>
            <tr>
              <th className="px-4 py-2 border">Колонка</th>
              <th className="px-4 py-2 border">Ширина (px)</th>
              <th className="px-4 py-2 border">Порядок</th>
            </tr>
          </thead>
          <tbody>
            {sortedColumns.map((columnName) => {
              const colConfig = columnWidths[columnName] || { width: 100, sortOrder: 0 };
              return (
                <tr key={columnName}>
                  <td className="px-4 py-2 border">{columnName}</td>
                  <td className="px-4 py-2 border">
                    <input
                      type="number"
                      value={colConfig.width || 100}
                      onChange={(e) => handleWidthChange(columnName, e.target.value)}
                      className="border p-1 w-full"
                    />
                  </td>
                  <td className="px-4 py-2 border">
                    <input
                      type="number"
                      value={colConfig.sortOrder || 0}
                      onChange={(e) => handleSortOrderChange(columnName, e.target.value)}
                      className="border p-1 w-full"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          {isSaving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
};

export default AddonsList;









// "use client";

// import React, { useEffect, useState } from 'react';
// import { useRouter } from 'next/navigation';
// import axios from 'axios';

// const AddonsList = () => {
//   const [addons, setAddons] = useState([]);
//   const [configs, setConfigs] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const router = useRouter();
//   const [columnWidths, setColumnWidths] = useState({});
//   const [isSaving, setIsSaving] = useState(false);


//   useEffect(() => {
//     // Fetch addons from API
//     const fetchAddons = async () => {
//       try {
//         const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/addons`);
//         setAddons(response.data);

//         const responseConfig = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/config`);       
//         setConfigs(responseConfig.data);

//       } catch (error) {
//         console.error('Error fetching addons:', error);
//       } finally {
//         setLoading(false);
//       }
//     };

//     fetchAddons();
//   }, []);


//   const handleEdit = (id) => {
//     router.push(`/admin/addons/${id}/edit`);
//   };


//   const handleDelete = async (id) => {
//     if (confirm('Уверены что хотите удалить?')) {
//       try {
//         await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/addons/${id}`);
//         setAddons(addons.filter((addon) => addon.id !== id));
//       } catch (error) {
//         console.error('Error deleting addon:', error);
//       }
//     }
//   };


//   const handleCreate = () => {
//     router.push('/admin/addons/create');
//   };



//   // Собираем названия колонок из надстроек
//   const addonColumnsMap = {};
//   const filterOC = configs.filter(item => item.paramName.includes("_"))
//   filterOC.forEach(item => {addonColumnsMap[item.label] = item.label});
//   const sortedColumns = Object.keys(addonColumnsMap).sort();


//   useEffect(() => {
//     fetchColumnWidths();
//   }, []);


//   const fetchColumnWidths = async () => {
//     try {
//       const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/column-width`);
      
//       const widths = (response.data || []).reduce((acc, { columnName, width }) => {
//         acc[columnName] = width;
//         return acc;
//       }, {});
      
//       setColumnWidths(widths);
//     } catch (error) {
//       console.error('Ошибка при загрузке ширин колонок:', error);
//     }
//   };
  


//   const handleWidthChange = (columnName, value) => {
//     setColumnWidths({
//       ...columnWidths,
//       [columnName]: value
//     });
//     console.log("columnWidths = ", columnWidths)
//   };



//   const handleSave = async () => {
//     setIsSaving(true);
//     try {
//       console.log("Заливаем = ", columnWidths)
//       const requests = Object.entries(columnWidths).map(([columnName, width]) =>
//         axios.post(`${process.env.NEXT_PUBLIC_API_URL}/column-width`, { columnName, width: parseInt(width) })
//       );
//       await Promise.all(requests);
//       console.log('Ширины колонок успешно сохранены!');
//     } catch (error) {
//       console.error('Ошибка при сохранении ширин колонок:', error);
//       toast('Ошибка при сохранении ширин колонок.');
//     } finally {
//       setIsSaving(false);
//     }
//   };

  

//   // console.log("sortedColumns = ", sortedColumns)




//   if (loading) return <p>Загрузка надстроек...</p>;

//   return (
//     <div>
//       <div>
//         <h1>Управление надстройками</h1>
//         <button onClick={handleCreate}>Создать новую надстройку</button>
//         <p></p>
//         <p></p>
//         <table>
//           <thead>
//             <tr>
//               <th>ID</th>
//               <th>Имя</th>
//               <th>Описание</th>
//               <th>Действия</th>
//             </tr>
//           </thead>
//           <tbody>
//             {addons.map((addon) => (
//               <tr key={addon.id}>
//                 <td>{addon.id}</td>
//                 <td>{addon.name}</td>
//                 <td>{addon.description}</td>
//                 <td>
//                   <button onClick={() => handleEdit(addon.id)}>Редактировать</button>
//                   <button onClick={() => handleDelete(addon.id)}>Удалить</button>
//                 </td>
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       </div>
//       <div>
//         <h1>Настройки ширины колонок</h1>

//           <table className="table-auto w-full border-collapse border border-gray-300">
//           <thead>
//             <tr>
//               <th className="px-4 py-2 border">Колонка</th>
//               <th className="px-4 py-2 border">Ширина (px)</th>
//             </tr>
//           </thead>
//           <tbody>
//             {sortedColumns.map((columnName) => (
//               <tr key={columnName}>
//                 <td className="px-4 py-2 border">{columnName}</td>
//                 <td className="px-4 py-2 border">
//                   <input
//                     type="number"
//                     value={columnWidths[columnName] || 100}
//                     onChange={(e) => handleWidthChange(columnName, e.target.value)}
//                     className="border p-1 w-full"
//                   />
//                 </td>
//               </tr>
//             ))}
//           </tbody>
//         </table>
//         <button
//           onClick={handleSave}
//           disabled={isSaving}
//           className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
//         >
//           {isSaving ? 'Сохранение...' : 'Сохранить'}
//         </button>
//       </div>
//     </div>
//   );
// };

// export default AddonsList;




// // src/app/admin/addons/page.js

// "use client";

// import React, { useEffect, useState } from 'react';
// import { useRouter } from 'next/navigation';
// import axios from 'axios';

// const AddonsList = () => {
//   const [addons, setAddons] = useState([]);
//   const [configs, setConfigs] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const router = useRouter();
//   const [columnWidths, setColumnWidths] = useState({});
//   const [isSaving, setIsSaving] = useState(false);


//   useEffect(() => {
//     // Fetch addons from API
//     const fetchAddons = async () => {
//       try {
//         const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/addons`);
//         setAddons(response.data);

//         const responseConfig = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/config`);       
//         setConfigs(responseConfig.data);

//       } catch (error) {
//         console.error('Error fetching addons:', error);
//       } finally {
//         setLoading(false);
//       }
//     };

//     fetchAddons();
//   }, []);


//   const handleEdit = (id) => {
//     router.push(`/admin/addons/${id}/edit`);
//   };


//   const handleDelete = async (id) => {
//     if (confirm('Уверены что хотите удалить?')) {
//       try {
//         await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/addons/${id}`);
//         setAddons(addons.filter((addon) => addon.id !== id));
//       } catch (error) {
//         console.error('Error deleting addon:', error);
//       }
//     }
//   };


//   const handleCreate = () => {
//     router.push('/admin/addons/create');
//   };



//   // Собираем названия колонок из надстроек
//   const addonColumnsMap = {};
//   const filterOC = configs.filter(item => item.paramName.includes("_"))
//   filterOC.forEach(item => {addonColumnsMap[item.label] = item.label});
//   const sortedColumns = Object.keys(addonColumnsMap).sort();


//   useEffect(() => {
//     fetchColumnWidths();
//   }, []);


//   const fetchColumnWidths = async () => {
//     try {
//       const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/column-width`);
//       const widths = response.data.reduce((acc, { columnName, width }) => {
//         acc[columnName] = width;
//         return acc;
//       }, {});
//       setColumnWidths(widths);
//     } catch (error) {
//       console.error('Ошибка при загрузке ширин колонок:', error);
//     }
//   };


//   const handleWidthChange = (columnName, value) => {
//     setColumnWidths({
//       ...columnWidths,
//       [columnName]: value
//     });
//     console.log("columnWidths = ", columnWidths)
//   };



//   const handleSave = async () => {
//     setIsSaving(true);
//     try {
//       console.log("columnWidths = ", columnWidths)
//       const requests = Object.entries(columnWidths).map(([columnName, width]) =>
//         axios.post(`${process.env.NEXT_PUBLIC_API_URL}/column-width`, { columnName, width: parseInt(width) })
//       );
//       await Promise.all(requests);
//       console.log('Ширины колонок успешно сохранены!');
//     } catch (error) {
//       console.error('Ошибка при сохранении ширин колонок:', error);
//       toast('Ошибка при сохранении ширин колонок.');
//     } finally {
//       setIsSaving(false);
//     }
//   };

  

//   // console.log("sortedColumns = ", sortedColumns)




//   if (loading) return <p>Загрузка надстроек...</p>;

//   return (
//     <div>
//       <div>
//         <h1>Управление надстройками</h1>
//         <button onClick={handleCreate}>Создать новую надстройку</button>
//         <p></p>
//         <p></p>
//         <table>
//           <thead>
//             <tr>
//               <th>ID</th>
//               <th>Имя</th>
//               <th>Описание</th>
//               <th>Действия</th>
//             </tr>
//           </thead>
//           <tbody>
//             {addons.map((addon) => (
//               <tr key={addon.id}>
//                 <td>{addon.id}</td>
//                 <td>{addon.name}</td>
//                 <td>{addon.description}</td>
//                 <td>
//                   <button onClick={() => handleEdit(addon.id)}>Редактировать</button>
//                   <button onClick={() => handleDelete(addon.id)}>Удалить</button>
//                 </td>
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       </div>
//       <div>
//         <h1>Настройки ширины колонок</h1>

//           <table className="table-auto w-full border-collapse border border-gray-300">
//           <thead>
//             <tr>
//               <th className="px-4 py-2 border">Колонка</th>
//               <th className="px-4 py-2 border">Ширина (px)</th>
//             </tr>
//           </thead>
//           <tbody>
//             {sortedColumns.map((columnName) => (
//               <tr key={columnName}>
//                 <td className="px-4 py-2 border">{columnName}</td>
//                 <td className="px-4 py-2 border">
//                   <input
//                     type="number"
//                     value={columnWidths[columnName] || 100}
//                     onChange={(e) => handleWidthChange(columnName, e.target.value)}
//                     className="border p-1 w-full"
//                   />
//                 </td>
//               </tr>
//             ))}
//           </tbody>
//         </table>
//         <button
//           onClick={handleSave}
//           disabled={isSaving}
//           className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
//         >
//           {isSaving ? 'Сохранение...' : 'Сохранить'}
//         </button>
//       </div>
//     </div>
//   );
// };

// export default AddonsList;

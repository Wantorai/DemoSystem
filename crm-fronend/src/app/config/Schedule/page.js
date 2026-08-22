'use client';

import { useState, useEffect } from 'react';

const ScheduleConfigPage = () => {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [unsavedChanges, setUnsavedChanges] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [modelConfig, scheduleResponse] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/mainModel`).then(res => res.json()),
          // fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders`).then(res => res.json()),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/schedule`).then(res => res.json()),
        ]);
  
        const loadedConfig = { ...scheduleResponse };
  
        // Дополняем конфиг параметрами из mainModel
        modelConfig.forEach(({ paramName, label }) => {
          if (!loadedConfig[paramName]) {
            loadedConfig[paramName] = { label, checked: true };
          }
        });
  
        setConfig(loadedConfig);
        setLoading(false);
      } catch (error) {
        console.error("Ошибка при загрузке данных:", error);
        setLoading(false);
      }
    };
  
    fetchData();
  }, []);
  

  const handleCheckboxChange = (key) => {
    setConfig(prev => {
      const updatedConfig = { ...prev, [key]: { ...prev[key], checked: !prev[key].checked } };
      setUnsavedChanges(true);
      return updatedConfig;
    });
  };

  const saveConfig = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule_config: config }),
      });
      setUnsavedChanges(false);
    } catch (error) {
      console.error("Ошибка при сохранении конфигурации:", error);
    }
  };

  if (loading) return <p>Загрузка...</p>;

  // Проверка, есть ли данные в config
  if (Object.keys(config).length === 0) {
    return <p>Нет данных для отображения</p>;
  }

  return (
    <div>
      <h1>Фильтр данных для работы графика</h1>
      {unsavedChanges && <p style={{ color: 'red' }}>Есть несохраненные изменения!</p>}
      <table>
        <thead>
          <tr>
            <th>Параметр</th>
            <th>Обозначение</th>
            <th>Отображать</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(config).map(field => (
            <tr key={field}>
              <td>{field}</td>
              <td>{config[field]?.label || field}</td>
              <td>
                <input
                  type="checkbox"
                  checked={config[field]?.checked ?? false}
                  onChange={() => handleCheckboxChange(field)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={saveConfig} disabled={!unsavedChanges}>Сохранить</button>
    </div>
  );
};

export default ScheduleConfigPage;




// 'use client';

// import { useState, useEffect } from 'react';

// const ScheduleConfigPage = () => {
//   const [config, setConfig] = useState({});
//   const [loading, setLoading] = useState(true);
//   const [unsavedChanges, setUnsavedChanges] = useState(false);

//   useEffect(() => {
//     const fetchData = async () => {
//       try {
//         const [modelConfig, orders, scheduleResponse] = await Promise.all([
//           fetch(`${process.env.NEXT_PUBLIC_API_URL}/mainModel`).then(res => res.json()),
//           fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders`).then(res => res.json()),
//           fetch(`${process.env.NEXT_PUBLIC_API_URL}/schedule`).then(res => res.json()),
//         ]);

//         // Создаем конфиг из данных, полученных с сервера
//         const loadedConfig = {};
//         Object.keys(scheduleResponse).forEach(field => {
//           if (scheduleResponse[field].hasOwnProperty('checked')) {
//             loadedConfig[field] = scheduleResponse[field];
//           }
//         });

//         // Обновляем конфиг с учетом данных из API
//         setConfig(loadedConfig);
//         setLoading(false);
//       } catch (error) {
//         console.error("Ошибка при загрузке данных:", error);
//         setLoading(false);
//       }
//     };

//     fetchData();
//   }, []);

//   const handleCheckboxChange = (key) => {
//     setConfig(prev => {
//       const updatedConfig = { ...prev, [key]: { ...prev[key], checked: !prev[key].checked } };
//       setUnsavedChanges(true);
//       return updatedConfig;
//     });
//   };

//   const saveConfig = async () => {
//     try {
//       await fetch(`${process.env.NEXT_PUBLIC_API_URL}/schedule`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ schedule_config: config }),
//       });
//       setUnsavedChanges(false);
//     } catch (error) {
//       console.error("Ошибка при сохранении конфигурации:", error);
//     }
//   };

//   if (loading) return <p>Загрузка...</p>;

//   // Проверка, есть ли данные в config
//   if (Object.keys(config).length === 0) {
//     return <p>Нет данных для отображения</p>;
//   }

//   return (
//     <div>
//       <h1>Фильтр данных для работы графика</h1>
//       {unsavedChanges && <p style={{ color: 'red' }}>Есть несохраненные изменения!</p>}
//       <table>
//         <thead>
//           <tr>
//             <th>Параметр</th>
//             <th>Обозначение</th>
//             <th>Отображать</th>
//           </tr>
//         </thead>
//         <tbody>
//           {Object.keys(config).map(field => (
//             <tr key={field}>
//               <td>{field}</td>
//               <td>{config[field]?.label || field}</td>
//               <td>
//                 <input
//                   type="checkbox"
//                   checked={config[field]?.checked ?? false}
//                   onChange={() => handleCheckboxChange(field)}
//                 />
//               </td>
//             </tr>
//           ))}
//         </tbody>
//       </table>
//       <button onClick={saveConfig} disabled={!unsavedChanges}>Сохранить</button>
//     </div>
//   );
// };

// export default ScheduleConfigPage;















// 'use client';

// import { useState, useEffect } from 'react';

// const ScheduleConfigPage = () => {
//     const [config, setConfig] = useState({});
//     const [loading, setLoading] = useState(true);
//     const [availableFields, setAvailableFields] = useState([]);
//     const [fieldLabels, setFieldLabels] = useState({});
//     const [unsavedChanges, setUnsavedChanges] = useState(false);

//     useEffect(() => {
//         Promise.all([
//             fetch(`${process.env.NEXT_PUBLIC_API_URL}/mainModel`).then(res => res.json()),
//             fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders`).then(res => res.json())
//         ]).then(([modelConfig, orders]) => {
//             // Создаём мапу: paramName -> label (если label отсутствует, используем paramName)
//             const modelFieldMap = {};
//             const modelFields = modelConfig.map(field => {
//                 modelFieldMap[field.paramName] = field.label || field.paramName;
//                 return field.paramName;
//             });

//             const orderFields = new Set();
//             orders.forEach(order => {
//                 Object.keys(order).forEach(key => {
//                     if (key !== 'data') {
//                         orderFields.add(key);
//                     }
//                 });
//             });

//             const allFields = Array.from(new Set([...modelFields, ...orderFields]));
//             setAvailableFields(allFields);
//             setFieldLabels(modelFieldMap);

//             fetch(`${process.env.NEXT_PUBLIC_API_URL}/schedule`)
//                 .then(res => res.json())
//                 .then((data) => {
//                     setConfig(data);
//                     setLoading(false);
//                 });
//         });
//     }, []);

//     const handleCheckboxChange = (key) => {
//         const userConfirmed = window.confirm('НЕЛЬЗЯ ИЗМЕНЯТЬ ЭТИ ПАРАМЕТРЫ !');
//         if (userConfirmed) {
//             setConfig((prev) => ({ ...prev, [key]: !prev[key] }));
//             setUnsavedChanges(true);
//         }
//     };

//     const saveConfig = async () => {
//         await fetch(`${process.env.NEXT_PUBLIC_API_URL}/schedule`, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ schedule_config: config }),
//         });
//         setUnsavedChanges(false);
//     };

//     if (loading) return <p>Загрузка...</p>;

//     console.log("availableFields = ", availableFields);
//     console.log("fieldLabels = ", fieldLabels);

//     return (
//         <div>
//             <h1>Фильтр данных для работы графика</h1>
//             {unsavedChanges && <p style={{ color: 'red' }}>Есть несохраненные изменения!</p>}
//             <table>
//                 <thead>
//                     <tr>
//                         <th>Параметр</th>
//                         <th>Обозначение</th>
//                         <th>Отображать</th>
//                     </tr>
//                 </thead>
//                 <tbody>
//                     {availableFields.map((field) => (
//                         <tr key={field}>
//                             <td>{field}</td>
//                             <td>{fieldLabels[field] || field}</td>
//                             <td>
//                                 <input
//                                     type="checkbox"
//                                     checked={!!config[field]}
//                                     onChange={() => handleCheckboxChange(field)}
//                                 />
//                             </td>
//                         </tr>
//                     ))}
//                 </tbody>
//             </table>
//             <button onClick={saveConfig} disabled={!unsavedChanges}>Сохранить</button>
//         </div>
//     );
// };

// export default ScheduleConfigPage;

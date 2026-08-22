"use client";

import axios from "axios";
import { useState, useEffect } from "react";

const OrderStatusAdmin = () => {
  const [statuses, setStatuses] = useState([]);
  const [newStatus, setNewStatus] = useState({ name: "", key: "", defaultValue: "" });
  const [editingStatus, setEditingStatus] = useState(null);

  useEffect(() => {
    const fetchStatuses = async () => {
      const result = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/statuses`);
      setStatuses(result.data.sort((a, b) => a.sortOrder - b.sortOrder)); // Сортировка по sortOrder
    };
    fetchStatuses();
  }, []);

  const handleAddStatus = async () => {
    if (!newStatus.name || !newStatus.key) return;
    const result = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/statuses`, newStatus);
    setStatuses([...statuses, result.data].sort((a, b) => a.sortOrder - b.sortOrder));
    setNewStatus({ name: "", key: "", defaultValue: "" });
  };

  const handleDeleteStatus = async (id) => {
    await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/statuses/${id}`);
    setStatuses(statuses.filter(status => status.id !== id));
  };

  // Обновление параметров статуса кроме сортровки
  const handleUpdateStatus = async (id, updatedStatus) => {
    const result = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/statuses/${id}`, updatedStatus);
    setStatuses(statuses.map(status => (status.id === id ? result.data : status)));
    setEditingStatus(null);
  };

  const handleMoveStatus = async (id, index, direction) => {
    const newStatuses = [...statuses];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newStatuses.length) return;

    // Меняем местами sortOrder двух статусов
    [newStatuses[index].sortOrder, newStatuses[targetIndex].sortOrder] =
      [newStatuses[targetIndex].sortOrder, newStatuses[index].sortOrder];
    newStatuses.sort((a, b) => a.sortOrder - b.sortOrder);

    // Приводим sortOrder к числу
    const updatedStatuses = newStatuses.map(status => ({
      ...status,
      sortOrder: Number(status.sortOrder) || 0
    }));

    setStatuses(updatedStatuses);
    // console.log("newStatuses = ", updatedStatuses);

    // Отправляем обновленный порядок на сервер через отдельный endpoint
    await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/statuses/order-update`, { statuses: updatedStatuses });
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Управление статусами заказов</h2>
      <div className="mb-4 p-4 border rounded-lg flex gap-2">
        <input 
          type="text" 
          placeholder="Название статуса" 
          value={newStatus.name} 
          onChange={(e) => setNewStatus({ ...newStatus, name: e.target.value })}
          className="border p-2 rounded"
        />
        <input 
          type="text" 
          placeholder="Ключ статуса" 
          value={newStatus.key} 
          onChange={(e) => setNewStatus({ ...newStatus, key: e.target.value })}
          className="border p-2 rounded"
        />
        <button onClick={handleAddStatus} className="bg-blue-500 text-white p-2 rounded">Добавить</button>
      </div>

      <div className="space-y-2">
        {statuses.map((status, index) => (
          <div key={status.id} className="p-4 border rounded-lg flex justify-between items-center">
            {editingStatus === status.id ? (
              <>
                <input 
                  value={status.name} 
                  onChange={(e) => setStatuses(statuses.map(s => s.id === status.id ? { ...s, name: e.target.value } : s))}
                  className="border p-2 rounded"
                />
                <input 
                  value={status.key} 
                  onChange={(e) => setStatuses(statuses.map(s => s.id === status.id ? { ...s, key: e.target.value } : s))}
                  className="border p-2 rounded"
                />
                <button onClick={() => handleUpdateStatus(status.id, status)} className="bg-green-500 text-white p-2 rounded">Сохранить</button>
              </>
            ) : (
              <>
                <span className="text-lg">{status.name} ({status.key})</span>
                <div className="flex gap-2">
                  <button onClick={() => handleMoveStatus(status.id, index, -1)} className="bg-gray-300 p-2 rounded">⬆</button>
                  <button onClick={() => handleMoveStatus(status.id, index, 1)} className="bg-gray-300 p-2 rounded">⬇</button>
                  <button onClick={() => setEditingStatus(status.id)} className="bg-yellow-500 text-white p-2 rounded">Редактировать</button>
                  <button onClick={() => handleDeleteStatus(status.id)} className="bg-red-500 text-white p-2 rounded">Удалить</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default OrderStatusAdmin;




// "use client";

// import axios from "axios";
// import { useState, useEffect } from "react";

// const OrderStatusAdmin = () => {
//   const [statuses, setStatuses] = useState([]);
//   const [newStatus, setNewStatus] = useState({ name: "", key: "", defaultValue: "" });
//   const [editingStatus, setEditingStatus] = useState(null);

//   useEffect(() => {
//     const fetchStatuses = async () => {
//       const result = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/statuses`);
//       setStatuses(result.data.sort((a, b) => a.sortOrder - b.sortOrder)); // Сортировка по sortOrder
//     };
//     fetchStatuses();
//   }, []);

//   const handleAddStatus = async () => {
//     if (!newStatus.name || !newStatus.key) return;
//     const result = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/statuses`, newStatus);
//     setStatuses([...statuses, result.data].sort((a, b) => a.sortOrder - b.sortOrder));
//     setNewStatus({ name: "", key: "", defaultValue: "" });
//   };

//   const handleDeleteStatus = async (id) => {
//     await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/statuses/${id}`);
//     setStatuses(statuses.filter(status => status.id !== id));
//   };

//   const handleUpdateStatus = async (id, updatedStatus) => {
//     const result = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/statuses/${id}`, updatedStatus);
//     setStatuses(statuses.map(status => (status.id === id ? result.data : status)).sort((a, b) => a.sortOrder - b.sortOrder));
//     setEditingStatus(null);
//   };

//   const handleMoveStatus = async (id, index, direction) => {
//     const newStatuses = [...statuses];
//     const targetIndex = index + direction;
//     if (targetIndex < 0 || targetIndex >= newStatuses.length) return;
  
//     // Меняем местами sortOrder двух статусов
//     [newStatuses[index].sortOrder, newStatuses[targetIndex].sortOrder] =
//       [newStatuses[targetIndex].sortOrder, newStatuses[index].sortOrder];
  
//     // Сортируем массив по новому порядку и приводим sortOrder к числу
//     const updatedStatuses = newStatuses
//       .map(status => ({
//         ...status,
//         sortOrder: Number(status.sortOrder) || 0
//       }))
//       .sort((a, b) => a.sortOrder - b.sortOrder);
  
//     setStatuses(updatedStatuses);
  
//     console.log("newStatuses = ", updatedStatuses);
  
//     // Отправляем обновленный порядок на сервер по новому endpoint
//     await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/statuses/order`, { statuses: updatedStatuses });
//   };
  

//   return (
//     <div className="p-6 max-w-2xl mx-auto">
//       <h2 className="text-xl font-semibold mb-4">Управление статусами заказов</h2>
//       <div className="mb-4 p-4 border rounded-lg flex gap-2">
//         <input 
//           type="text" 
//           placeholder="Название статуса" 
//           value={newStatus.name} 
//           onChange={(e) => setNewStatus({ ...newStatus, name: e.target.value })}
//           className="border p-2 rounded"
//         />
//         <input 
//           type="text" 
//           placeholder="Ключ статуса" 
//           value={newStatus.key} 
//           onChange={(e) => setNewStatus({ ...newStatus, key: e.target.value })}
//           className="border p-2 rounded"
//         />
//         <button onClick={handleAddStatus} className="bg-blue-500 text-white p-2 rounded">Добавить</button>
//       </div>

//       <div className="space-y-2">
//         {statuses.map((status, index) => (
//           <div key={status.id} className="p-4 border rounded-lg flex justify-between items-center">
//             {editingStatus === status.id ? (
//               <>
//                 <input 
//                   value={status.name} 
//                   onChange={(e) => setStatuses(statuses.map(s => s.id === status.id ? { ...s, name: e.target.value } : s))}
//                   className="border p-2 rounded"
//                 />
//                 <input 
//                   value={status.key} 
//                   onChange={(e) => setStatuses(statuses.map(s => s.id === status.id ? { ...s, key: e.target.value } : s))}
//                   className="border p-2 rounded"
//                 />
//                 <button onClick={() => handleUpdateStatus(status.id, status)} className="bg-green-500 text-white p-2 rounded">Сохранить</button>
//               </>
//             ) : (
//               <>
//                 <span className="text-lg">{status.name} ({status.key})</span>
//                 <div className="flex gap-2">
//                   <button onClick={() => handleMoveStatus(status.id, index, -1)} className="bg-gray-300 p-2 rounded">⬆</button>
//                   <button onClick={() => handleMoveStatus(status.id, index, 1)} className="bg-gray-300 p-2 rounded">⬇</button>
//                   <button onClick={() => setEditingStatus(status.id)} className="bg-yellow-500 text-white p-2 rounded">Редактировать</button>
//                   <button onClick={() => handleDeleteStatus(status.id)} className="bg-red-500 text-white p-2 rounded">Удалить</button>
//                 </div>
//               </>
//             )}
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// };

// export default OrderStatusAdmin;
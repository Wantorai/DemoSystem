
'use client';
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function CRMStatusesPage() {
  const [statuses, setStatuses] = useState([]);
  const [newStatus, setNewStatus] = useState({ key: '', label: '', color: '#000000' });

  useEffect(() => {
    fetch(`${API_URL}/crm-statuses`)
      .then(res => res.json())
      .then(data => {
        const sorted = data.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setStatuses(sorted);
      });
  }, []);

  const handleUpdate = async (id, field, value) => {
    const updated = statuses.map(s =>
      s.id === id ? { ...s, [field]: value } : s
    );
    setStatuses(updated);

    await fetch(`${API_URL}/crm-statuses/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
  };

  const handleDelete = async (id) => {
    await fetch(`${API_URL}/crm-statuses/${id}`, { method: 'DELETE' });
    setStatuses(statuses.filter(s => s.id !== id));
  };

  const handleCreate = async () => {
    const maxOrder = statuses.reduce((max, s) => Math.max(max, s.order ?? 0), 0);
    const res = await fetch(`${API_URL}/crm-statuses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newStatus, order: maxOrder + 1 }),
    });
    const created = await res.json();
    setStatuses([...statuses, created]);
    setNewStatus({ key: '', label: '', color: '#000000' });
  };



  const move = async (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= statuses.length) return;

    const newStatuses = [...statuses];
    const tempOrder = newStatuses[index].order;
    newStatuses[index].order = newStatuses[newIndex].order;
    newStatuses[newIndex].order = tempOrder;

    // Сохраняем изменения на сервере
    await Promise.all([
      fetch(`${API_URL}/crm-statuses/${newStatuses[index].id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newStatuses[index].order }),
      }),
      fetch(`${API_URL}/crm-statuses/${newStatuses[newIndex].id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newStatuses[newIndex].order }),
      }),
    ]);

    setStatuses(newStatuses.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  };





  return (
    <div style={{ padding: 20 }}>
      <h2>Статусы CRM</h2>

      <table border={1} cellPadding={8} cellSpacing={0}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Ключ</th>
            <th>Название</th>
            <th>Цвет</th>
            <th>Пример</th>
            <th>Порядок</th>
            <th>Удалить</th>
          </tr>
        </thead>
        <tbody>
        {statuses.map((status, index) => (
            <tr key={status.id}>
              <td>{status.id}</td>
              <td>
                <input
                  value={status.key}
                  onChange={e => handleUpdate(status.id, 'key', e.target.value)}
                />
              </td>
              <td>
                <input
                  value={status.label}
                  onChange={e => handleUpdate(status.id, 'label', e.target.value)}
                />
              </td>
              <td>
                <input
                  type="color"
                  value={status.color}
                  onChange={e => handleUpdate(status.id, 'color', e.target.value)}
                />
              </td>
              <td>
                <span style={{ backgroundColor: status.color, color: '#fff', padding: '2px 6px' }}>
                  {status.label}
                </span>
              </td>
              <td>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <button onClick={() => move(index, -1)} style={{margin:0}}>↑</button>
                  <span>{status.order ?? ''}</span>
                  <button onClick={() => move(index, 1)}  style={{margin:0}}>↓</button>
                </div>
              </td>
              <td>
                <button onClick={() => handleDelete(status.id)}>Удалить</button>
              </td>
            </tr>
          ))}

          <tr>
            <td>new</td>
            <td>
              <input
                value={newStatus.key}
                onChange={e => setNewStatus({ ...newStatus, key: e.target.value })}
              />
            </td>
            <td>
              <input
                value={newStatus.label}
                onChange={e => setNewStatus({ ...newStatus, label: e.target.value })}
              />
            </td>
            <td>
              <input
                type="color"
                value={newStatus.color}
                onChange={e => setNewStatus({ ...newStatus, color: e.target.value })}
              />
            </td>
            <td colSpan={2}>
              <button onClick={handleCreate}>Создать</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}



// 'use client';

// import { useEffect, useState } from 'react';

// export default function CRMStatusesPage() {
//   const [statuses, setStatuses] = useState([]);
//   const [newStatus, setNewStatus] = useState({ label: '', key: '', color: '#000000' });

//   useEffect(() => {
//     fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm-statuses`)
//       .then(res => res.json())
//       .then(data => setStatuses(data));
//   }, []);

//   const handleSave = async () => {
//     await fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm-statuses`, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify(newStatus),
//     });
//     setNewStatus({ label: '', key: '', color: '#000000' });
//     const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm-statuses`);
//     const data = await res.json();
//     setStatuses(data);
//   };

//   const handleDelete = async (id) => {
//     await fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm-statuses/${id}`, { method: 'DELETE' });
//     setStatuses(statuses.filter(s => s.id !== id));
//   };


//   return (
//     <div className="p-6">
//       <h1 className="text-2xl font-bold mb-4">Статусы для CRM</h1>

//       <div className="mb-6">
//         <input
//           type="text"
//           placeholder="Название"
//           value={newStatus.label}
//           onChange={(e) => setNewStatus({ ...newStatus, label: e.target.value })}
//           className="border px-3 py-2 mr-2"
//         />
//         <input
//           type="text"
//           placeholder="Ключ"
//           value={newStatus.key}
//           onChange={(e) => setNewStatus({ ...newStatus, key: e.target.value })}
//           className="border px-3 py-2 mr-2"
//         />
//         <input
//           type="color"
//           value={newStatus.color}
//           onChange={(e) => setNewStatus({ ...newStatus, color: e.target.value })}
//           className="border px-3 py-2 mr-2"
//         />
//         <button onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 rounded">
//           Сохранить
//         </button>
//       </div>

//       <table className="w-full table-auto border-collapse">
//         <thead>
//           <tr>
//             <th className="border p-2">Название</th>
//             <th className="border p-2">Ключ</th>
//             <th className="border p-2">Цвет</th>
//             <th className="border p-2">Действия</th>
//           </tr>
//         </thead>
//         <tbody>
//           {statuses.map(status => (
//             <tr key={status.id}>
//               <td className="border p-2">{status.label}</td>
//               <td className="border p-2">{status.key}</td>
//               <td className="border p-2">
//                 <span className="inline-block w-6 h-6 rounded" style={{ backgroundColor: status.color }}></span>
//               </td>
//               <td className="border p-2">
//                 <button
//                   onClick={() => handleDelete(status.id)}
//                   className="bg-red-500 text-white px-3 py-1 rounded"
//                 >
//                   Удалить
//                 </button>
//               </td>
//             </tr>
//           ))}
//         </tbody>
//       </table>
//     </div>
//   );
// }

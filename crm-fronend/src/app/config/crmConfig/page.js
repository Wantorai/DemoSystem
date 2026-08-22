'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import Spinner from "../../../components/Spinner";

const DEFAULT_CRM_TYPE = 'STRING';

export default function CRMConfigPage() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newParam, setNewParam] = useState({
    field: '',
    label: '',
    width: '100px',
    order: configs.length,
    active: true,
    activeInside: true,
    type: '',
    value: '', 
  });
  

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/crm-config`);
      const sortedConfigs = response.data.sort((a, b) => (a.order || 0) - (b.order || 0));
      setConfigs(sortedConfigs);
    } catch (error) {
      console.error('Ошибка загрузки конфигурации:', error);
    } finally {
      setLoading(false);
    }
  };

  // const handleInputChange = (index, field, value) => {
  //   const updatedConfigs = [...configs];
  //   updatedConfigs[index][field] = field === 'active' ? value : (field === 'order' ? parseInt(value, 10) : value);
  //   setConfigs(updatedConfigs);
  // };


  const handleInputChange = (index, field, value) => {
    const updatedConfigs = [...configs];
    // перечисляем все булевые поля
    const booleanFields = ['active', 'activeInside'];
  
    if (booleanFields.includes(field)) {
      // если это одно из флажковых полей — сохраняем value как есть (true/false)
      updatedConfigs[index][field] = value;
    } else if (field === 'order') {
      // порядок — целое число
      updatedConfigs[index][field] = parseInt(value, 10);
    } else {
      // всё остальное — строка или что угодно
      updatedConfigs[index][field] = value;
    }
  
    setConfigs(updatedConfigs);
  };

  const handleTypeChange = (index, nextType) => {
    const prevType = configs?.[index]?.type || '';
    if (String(prevType) === String(nextType)) return;

    const confirmed = confirm(
      `Изменить тип поля "${configs?.[index]?.field}" с "${prevType || 'пусто'}" на "${nextType || 'пусто'}"?`
    );
    if (!confirmed) return;

    handleInputChange(index, 'type', nextType);
  };
  


  const moveOrder = (index, direction) => {
    const updatedConfigs = [...configs];
    const currentOrder = updatedConfigs[index].order;
    const swapIndex = direction === 'up' ? index - 1 : index + 1;

    // Убедимся, что swapIndex в пределах массива
    if (swapIndex < 0 || swapIndex >= updatedConfigs.length) return;

    // Поменяем местами порядки
    updatedConfigs[index].order = updatedConfigs[swapIndex].order;
    updatedConfigs[swapIndex].order = currentOrder;

    // Сортировка по порядку после изменения
    const sortedConfigs = updatedConfigs.sort((a, b) => a.order - b.order);
    setConfigs(sortedConfigs);
  };

  const saveConfigs = async () => {
    try {
      setSaving(true);
      const normalizedConfigs = (configs || []).map((cfg) => ({
        ...cfg,
        type: normalizeType(cfg?.type),
      }));
      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/crm-config`, { configs: normalizedConfigs });
      setConfigs(normalizedConfigs);
      toast('Конфигурация сохранена!');
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      toast('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };


  const handleDeleteConfig = async (field) => {
    if (!confirm(`Вы уверены, что хотите удалить поле "${field}"?`)) return;
  
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/crm-config/${field}`);
      // После удаления обновим список
      setConfigs(prev => prev.filter(cfg => cfg.field !== field));
    } catch (error) {
      console.error('Ошибка удаления:', error);
      alert('Ошибка при удалении поля');
    }
  };

  const TYPE_OPTIONS = [
    { value: 'STRING', label: 'текст' },
    { value: 'INTEGER', label: 'число' },
    { value: 'DATE', label: 'дата время' },
    { value: 'DATEONLY', label: 'дата' },
    { value: 'BOOLEAN', label: 'чекбокс' },
  ];

  const normalizeType = (value) => {
    const raw = String(value || '').trim().toUpperCase();
    const allowed = new Set(TYPE_OPTIONS.map((x) => x.value));
    return allowed.has(raw) ? raw : DEFAULT_CRM_TYPE;
  };
  
  

  if (loading) {return <Spinner />;}

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Настройка полей CRM</h1>

        {/* Форма добавления */}
        <div className="p-4 bg-gray-50 rounded">
          <h2 className="text-xl font-semibold mb-4">➕ Добавить новый параметр</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { key: 'field', label: 'Поле (field)', type: 'text' },
              { key: 'label', label: 'Подпись (label)', type: 'text' },
              { key: 'width', label: 'Ширина (width)', type: 'text' },
              { key: 'order', label: 'Порядок (order)', type: 'number' },
              { key: 'type', label: 'Тип (type)', type: 'text' },
              { key: 'value', label: 'Значение по умолчанию (value)', type: 'text' },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <label className="block text-sm font-medium mb-1">{label}</label>

                {key === 'type' ? (
                  <select
                    className="border rounded px-2 py-1 w-full"
                    value={newParam.type}
                    onChange={e =>
                      setNewParam(prev => ({ ...prev, type: e.target.value }))
                    }
                  >
                    <option value="">— Выберите тип —</option>
                    {TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="border rounded px-2 py-1 w-full"
                    type={type}
                    value={newParam[key] || ''}
                    onChange={e => {
                      const v = type === 'number'
                        ? parseInt(e.target.value, 10)
                        : e.target.value;
                      setNewParam(prev => ({ ...prev, [key]: v }));
                    }}
                  />
                )}
              </div>
            ))}

            <div className="flex items-center space-x-6 mt-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={newParam.active}
                  onChange={e => setNewParam(prev => ({ ...prev, active: e.target.checked }))}
                />
                <span className="ml-2">Видно в табл.</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={newParam.activeInside}
                  onChange={e => setNewParam(prev => ({ ...prev, activeInside: e.target.checked }))}
                />
                <span className="ml-2">Видно внутри</span>
              </label>
            </div>
          </div>

          <button
            onClick={async () => {
              setSaving(true);
              try {
                await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/crm-config`, newParam);
                toast.success('Параметр добавлен');
                setNewParam({
                  field: '',
                  label: '',
                  width: '100px',
                  order: configs.length,
                  type: '',
                  value: '',              // сброс поля value
                  active: true,
                  activeInside: true,
                });
                fetchConfigs();
              } catch (err) {
                console.error(err);
                toast.error('Не удалось добавить');
              } finally {
                setSaving(false);
              }
            }}
            disabled={
              saving ||
              !newParam.field ||
              !newParam.label
            }
            className="mt-4 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Сохраняем...' : 'Добавить параметр'}
          </button>
        </div>


      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border">
          <thead>
            <tr>
              <th className="border p-2">Поле</th>
              <th className="border p-2">Подпись (Label)</th>
              <th className="border p-2">Значение (Value)</th>
              <th className="border p-2">Тип (Type)</th>
              <th className="border p-2">Ширина (Width)</th>
              <th className="border p-2">Порядок (Order)</th>
              <th className="border p-2">Видно в табл.</th>
              <th className="border p-2">Видно внутри</th>
              <th className="border p-2">Порядок</th>
              <th className="border p-2">Удалить</th>
            </tr>
          </thead>
          <tbody>
            {configs.map((config, index) => (
              <tr key={config.field} className="text-center">
                <td className="border p-2">{config.field}</td>
                <td className="border p-2">
                  <input
                    type="text"
                    value={config.label}
                    onChange={(e) => handleInputChange(index, 'label', e.target.value)}
                    className="border rounded px-2 py-1 w-full"
                  />
                </td>
                <td className="border p-2">
                  <input
                    type="text"
                    value={config.value ?? ''}
                    onChange={(e) => handleInputChange(index, 'value', e.target.value)}
                    className="border rounded px-2 py-1 w-full"
                  />
                </td>
                <td className="border p-2">
                  <select
                    className="border rounded px-2 py-1 w-full"
                    value={normalizeType(config.type)}
                    onChange={(e) => handleTypeChange(index, e.target.value)}
                  >
                    {TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} ({opt.value})
                      </option>
                    ))}
                  </select>
                </td>
                <td className="border p-2">
                  <input
                    type="text"
                    value={config.width}
                    onChange={(e) => handleInputChange(index, 'width', e.target.value)}
                    className="border rounded px-2 py-1 w-full"
                  />
                </td>
                <td className="border p-2">
                  <input
                    type="number"
                    value={config.order ?? index}
                    onChange={(e) => handleInputChange(index, 'order', e.target.value)}
                    className="border rounded px-2 py-1 w-20 text-center"
                  />
                </td>
                <td className="border p-2">
                  <input
                    type="checkbox"
                    checked={config.active}
                    onChange={(e) => handleInputChange(index, 'active', e.target.checked)}
                  />
                </td>
                <td className="border p-2">
                  <input
                    type="checkbox"
                    checked={config.activeInside}
                    onChange={(e) => handleInputChange(index, 'activeInside', e.target.checked)}
                  />
                </td>
                <td className="border p-2">
                  <button
                    onClick={() => moveOrder(index, 'up')}
                    disabled={index === 0}
                    className="px-2 py-1 bg-gray-300 rounded hover:bg-gray-400 disabled:opacity-50"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveOrder(index, 'down')}
                    disabled={index === configs.length - 1}
                    className="px-2 py-1 bg-gray-300 rounded hover:bg-gray-400 disabled:opacity-50"
                  >
                    ↓
                  </button>
                </td>
                <td className="border p-2">
                  <button
                    onClick={() => handleDeleteConfig(config.field)}
                    className="text-red-600 hover:text-red-800 font-bold"
                    title="Удалить"
                  >
                    ❌
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={saveConfigs}
        disabled={saving}
        className="mt-6 bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Сохранение...' : 'Сохранить'}
      </button>
    </div>
  );
}






// 'use client';

// import { useEffect, useState } from 'react';
// import axios from 'axios';

// export default function CRMConfigPage() {
//   const [configs, setConfigs] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [saving, setSaving] = useState(false);

//   useEffect(() => {
//     fetchConfigs();
//   }, []);

//   const fetchConfigs = async () => {
//     try {
//       const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/crm-config`);
//       const sortedConfigs = response.data.sort((a, b) => (a.order || 0) - (b.order || 0));
//       setConfigs(sortedConfigs);
//     } catch (error) {
//       console.error('Ошибка загрузки конфигурации:', error);
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleInputChange = (index, field, value) => {
//     const updatedConfigs = [...configs];
//     updatedConfigs[index][field] = field === 'active' ? value : (field === 'order' ? parseInt(value, 10) : value);
//     setConfigs(updatedConfigs);
//   };

//   const saveConfigs = async () => {
//     try {
//       setSaving(true);
//       console.log('Сохранение конфигурации:', configs);
//       await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/crm-config`, { configs });
//       alert('Конфигурация сохранена!');
//     } catch (error) {
//       console.error('Ошибка сохранения:', error);
//       alert('Ошибка сохранения');
//     } finally {
//       setSaving(false);
//     }
//   };

//   if (loading) return <div>Загрузка...</div>;

//   return (
//     <div className="p-6">
//       <h1 className="text-2xl font-bold mb-6">Настройка полей CRM</h1>

//       <div className="overflow-x-auto">
//         <table className="min-w-full bg-white border">
//           <thead>
//             <tr>
//               <th className="border p-2">Поле</th>
//               <th className="border p-2">Подпись (Label)</th>
//               <th className="border p-2">Ширина (Width)</th>
//               <th className="border p-2">Порядок (Order)</th>
//               <th className="border p-2">Активен</th>
//             </tr>
//           </thead>
//           <tbody>
//             {configs.map((config, index) => (
//               <tr key={config.field} className="text-center">
//                 <td className="border p-2">{config.field}</td>
//                 <td className="border p-2">
//                   <input
//                     type="text"
//                     value={config.label}
//                     onChange={(e) => handleInputChange(index, 'label', e.target.value)}
//                     className="border rounded px-2 py-1 w-full"
//                   />
//                 </td>
//                 <td className="border p-2">
//                   <input
//                     type="text"
//                     value={config.width}
//                     onChange={(e) => handleInputChange(index, 'width', e.target.value)}
//                     className="border rounded px-2 py-1 w-full"
//                   />
//                 </td>
//                 <td className="border p-2">
//                   <input
//                     type="number"
//                     value={config.order ?? index}
//                     onChange={(e) => handleInputChange(index, 'order', e.target.value)}
//                     className="border rounded px-2 py-1 w-20 text-center"
//                   />
//                 </td>
//                 <td className="border p-2">
//                   <input
//                     type="checkbox"
//                     checked={config.active}
//                     onChange={(e) => handleInputChange(index, 'active', e.target.checked)}
//                   />
//                 </td>
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       </div>

//       <button
//         onClick={saveConfigs}
//         disabled={saving}
//         className="mt-6 bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
//       >
//         {saving ? 'Сохранение...' : 'Сохранить'}
//       </button>
//     </div>
//   );
// }

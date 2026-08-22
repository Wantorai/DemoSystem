'use client';

import { useEffect, useState } from 'react';
import Spinner from '../../../components/Spinner';
import { translate } from '../../../i18n/translations';

export default function DashboardConfigPage() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingConfig, setEditingConfig] = useState(null);
  const [fieldOptions, setFieldOptions] = useState([]); // массив { path, label }

  // 1) Загрузка списка конфигов
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard-configs`)
      .then(res => res.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        // сортируем по полю order
        arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setConfigs(arr);
        setLoading(false);
      });
  }, []);


  // // 3) Подгрузка путей полей при смене endpoint
  useEffect(() => {
    if (!editingConfig?.endpoint) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard-configs/fields/${editingConfig.endpoint}`)
      .then(r => r.json())

    .then(raw => {
      const arr = Array.isArray(raw) ? raw : [];
      setFieldOptions(arr);

      setEditingConfig(cfg => {
        if (!cfg) return cfg;

        // Если series уже есть — не трогаем
        if (Array.isArray(cfg.series) && cfg.series.length) {
          return {
            ...cfg,
            // старое поведение: обеспечить dateField/valueFields по умолчанию
            dateField: cfg.dateField || arr[0]?.path || '',
            valueFields: cfg.valueFields?.length
              ? cfg.valueFields
              : arr.slice(1, 3).map(x => x.path),
          };
        }

        // Иначе — создаём series из старого формата (минимально)
        const generated = [{
          id: `s_migr_${Date.now()}`,
          label: cfg.label || 'Серия',
          dateField: cfg.dateField || arr[0]?.path || '',
          valueFields: Array.isArray(cfg.valueFields) && cfg.valueFields.length
            ? cfg.valueFields
            : arr.slice(1, 3).map(x => x.path),
        }];

        return {
          ...cfg,
          // оставляем старые поля тоже — ничего не удаляем
          dateField: cfg.dateField || generated[0].dateField,
          valueFields: cfg.valueFields?.length ? cfg.valueFields : generated[0].valueFields,
          series: generated,
        };
      });
    });

  }, [editingConfig?.endpoint]);



  // 4) Создание нового конфига
    const handleCreate = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard-configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: 'Новый отчёт',
          key: `report_${Date.now()}`,
          endpoint: '',
          dateField: '',
          valueFields: [],
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        console.error('Ошибка создания конфига:', payload);
        alert(`Ошибка: ${payload.error || JSON.stringify(payload)}`);
        return;
      }
      setConfigs(prev => [...prev, payload]);
      setEditingConfig(payload);
    } catch (err) {
      console.error('Network error при создании конфига:', err);
      alert('Сетевая ошибка при создании конфига, см. консоль');
    }
  };


  // 5) Сохранение (PUT) редактируемого конфига
  const handleSave = async () => {
    const { id, ...body } = editingConfig;

    // защита: если цвет вдруг null/undefined — подставим дефолт
    if (body.color === null || body.color === undefined) {
      body.color = '#3182ce';
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard-configs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        console.error('Ошибка сохранения:', payload || res.statusText);
        alert(`Ошибка при сохранении: ${payload?.error || res.statusText || res.status}`);
        return;
      }

      // Используем то, что вернул сервер (чтобы взять id/updatedAt/series и т.д.)
      setConfigs(prev => prev.map(c => (c.id === id ? payload : c)));
      setEditingConfig(null);
    } catch (err) {
      console.error('Network error при сохранении конфига:', err);
      alert('Сетевая ошибка при сохранении конфига, см. консоль');
    }
  };




  // 6) Удаление
  const handleDelete = async (id) => {
    if (!confirm('Удалить этот отчёт?')) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard-configs/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setConfigs(prev => prev.filter(c => c.id !== id));
      if (editingConfig?.id === id) setEditingConfig(null);
    }
  };

  // 7) Локальное изменение полей формы
  const handleFieldChange = (field, value) => {
    setEditingConfig(cfg => ({ ...cfg, [field]: value }));
  };


  // Функция для сохранения порядка 
  const updateConfigOnServer = async (cfg) => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard-configs/${cfg.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[PUT] Ошибка сохранения ${cfg.id}:`, text);
    } else {
      // console.log(`[PUT] Успешно сохранено ${cfg.id}`);
    }
  };


  // 2) moveUp
  const moveUp = async (index) => {
    const sorted = [...configs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    if (index === 0) return;

    const curr = sorted[index];
    const prev = sorted[index - 1];

    // Назначаем уникальные order, если одинаковые или отсутствуют
    if ((curr.order ?? 0) === (prev.order ?? 0)) {
      sorted.forEach((cfg, idx) => {
        cfg.order = idx * 10; // шаг 10 для удобства
      });
    }

    // Повторно берём после возможного пересчёта
    const updatedCurr = sorted[index];
    const updatedPrev = sorted[index - 1];

    const temp = updatedCurr.order;
    updatedCurr.order = updatedPrev.order;
    updatedPrev.order = temp;

    await Promise.all([
      updateConfigOnServer(updatedCurr),
      updateConfigOnServer(updatedPrev),
    ]);

    sorted[index - 1] = updatedCurr;
    sorted[index] = updatedPrev;

    setConfigs([...sorted]);
  };


  // 3) moveDown
  const moveDown = async (index) => {
    const sorted = [...configs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    if (index >= sorted.length - 1) return;

    const curr = sorted[index];
    const next = sorted[index + 1];

    // Назначаем уникальные order, если они одинаковые или отсутствуют
    if ((curr.order ?? 0) === (next.order ?? 0)) {
      sorted.forEach((cfg, idx) => {
        cfg.order = idx * 10; // шаг 10 — удобно для вставок
      });
    }

    // Повторно берем curr и next уже с новыми order
    const updatedCurr = sorted[index];
    const updatedNext = sorted[index + 1];

    // Меняем местами
    const temp = updatedCurr.order;
    updatedCurr.order = updatedNext.order;
    updatedNext.order = temp;

    await Promise.all([
      updateConfigOnServer(updatedCurr),
      updateConfigOnServer(updatedNext),
    ]);

    // Обновлённый массив
    sorted[index] = updatedNext;
    sorted[index + 1] = updatedCurr;

    setConfigs([...sorted]);
  };


  const sortedConfigs = [...configs].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );


  const makeEmptySeries = (fieldOptions) => ({
    id: `s_${Date.now()}`,
    label: 'Серия',
    dateField: fieldOptions[0]?.path || '',
    valueFields: fieldOptions.slice(1, 2).map(x => x.path) // 1-е значение по умолчанию
  });

  // При startEdit(...) — подготовим series если его нет
  const startEdit = (cfg) => {
    const prepared = { ...cfg };
    if (!prepared.series) {
      prepared.series = [{
        id: `s_init_${prepared.id ?? 'new'}`,
        label: prepared.label || 'Серия',
        dateField: prepared.dateField || (fieldOptions[0]?.path || ''),
        valueFields: prepared.valueFields?.length ? prepared.valueFields : (fieldOptions.slice(1,2).map(x => x.path) || [])
      }];
    }
    setEditingConfig(prepared);

  };



  // add / remove series
  const addSeries = () => {
    setEditingConfig(cfg => ({
      ...cfg,
      series: [...(cfg.series || []), makeEmptySeries(fieldOptions)]
    }));
  };
  const removeSeries = (id) => {
    setEditingConfig(cfg => ({
      ...cfg,
      series: (cfg.series || []).filter(s => s.id !== id)
    }));
  };


  // handle series field change
  const handleSeriesChange = (id, key, value) => {
    setEditingConfig(cfg => ({
      ...cfg,
      series: (cfg.series || []).map(s => s.id === id ? { ...s, [key]: value } : s)
    }));
  };



  if (loading) return <Spinner />;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Конфигурация дашборда</h1>
      <button
        onClick={handleCreate}
        className="bg-blue-600 text-white px-4 py-2 rounded mb-6 hover:bg-blue-700"
      >
        + Добавить отчёт
      </button>

      {sortedConfigs.length === 0 && !editingConfig && (
        <div>Пока нет ни одного отчёта. Нажмите «Добавить отчёт».</div>
      )}

      {sortedConfigs.map((cfg, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === sortedConfigs.length - 1;
        const isEditing = editingConfig?.id === cfg.id;

        return (
          <div
            key={cfg.id || `cfg-${idx}`}
            className="border border-gray-300 rounded p-4 mb-4 bg-white shadow-sm"
          >
            {/* Если не в режиме редактирования — показываем кратко */}
            {!isEditing && (
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-medium">{translate(cfg.label)}</div>
                  <div className="text-sm text-gray-600">{cfg.endpoint}</div>
                </div>

                {/* Кнопки перемещения вверх/вниз */}
                <div className="flex gap-1 mr-4">
                  <button
                    onClick={() => moveUp(idx)}
                    disabled={isFirst}
                    className="px-2 py-1 bg-gray-600 rounded disabled:opacity-50"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveDown(idx)}
                    disabled={isLast}
                    className="px-2 py-1 bg-gray-600 rounded disabled:opacity-50"
                  >
                    ↓
                  </button>
                </div>

                {/* Кнопки редактирования и удаления */}
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(cfg)}
                    className="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600"
                  >
                    Редактировать
                  </button>
                  <button
                    onClick={() => handleDelete(cfg.id)}
                    className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            )}

            {/* Форма редактирования */}
            {isEditing && (
              <>
                {/* Label */}
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">
                    Название отчёта
                  </label>
                  <input
                    type="text"
                    value={editingConfig.label ?? ''}
                    onChange={e => handleFieldChange('label', e.target.value)}
                    className="w-full border px-3 py-2 rounded"
                  />
                </div>

                {/* Key */}
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Key</label>
                  <input
                    type="text"
                    value={editingConfig.key ?? ''}
                    onChange={e => handleFieldChange('key', e.target.value)}
                    className="w-full border px-3 py-2 rounded bg-gray-100"
                  />
                </div>

                {/* Endpoint */}
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">
                    Источник (endpoint)
                  </label>
                  <select
                    value={editingConfig.endpoint ?? ''}
                    onChange={e => handleFieldChange('endpoint', e.target.value)}
                    className="w-full border px-3 py-2 rounded bg-white"
                  >
                    <option value="">— выберите —</option>
                    <option value="orders">Заказы</option>
                    <option value="orderConfigs">Надстройки</option>
                    <option value="crm">Консультации</option>
                  </select>
                </div>

                {/* dateField */}
                {/* <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Поле даты</label>
                  <select
                    value={editingConfig.dateField ?? ''}
                    onChange={e => handleFieldChange('dateField', e.target.value)}
                    className="w-full border px-3 py-2 rounded bg-white"
                  >
                    <option value="">— выберите —</option>
                      {fieldOptions.map(opt => (
                        <option key={opt.path} value={opt.path}>
                          {opt.path} — {opt.label}
                        </option>
                      ))}
                  </select>
                </div> */}

                {/* valueFields */}
                {/* <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">
                    Поля значений
                  </label>
                  <select
                    multiple
                    value={editingConfig.valueFields || []}
                    onChange={e => {
                      const opts = Array.from(e.target.selectedOptions).map(o => o.value);
                      handleFieldChange('valueFields', opts);
                    }}
                    className="w-full h-64 border px-3 py-2 rounded bg-white"
                    size={Math.min(20, fieldPaths.length)}
                  >
                    {fieldOptions.map(opt => (
                      <option key={opt.path} value={opt.path}>
                        {opt.path} — {opt.label}
                      </option>
                    ))}
                  </select>
                </div> */}


                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">Серии (мульти-график)</label>

                  {(editingConfig.series || []).map(ser => (
                    <div key={ser.id} className="border p-3 rounded mb-2 bg-gray-50">
                      <div className="flex justify-between items-center mb-2">
                        <input
                          type="text"
                          value={ser.label}
                          onChange={e => handleSeriesChange(ser.id, 'label', e.target.value)}
                          className="border px-2 py-1 rounded mr-2"
                          placeholder="Название серии"
                        />
                        <button onClick={() => removeSeries(ser.id)} className="text-sm px-2 py-1 bg-red-500 text-white rounded">
                          Удалить
                        </button>
                      </div>

                      <div className="mb-2">
                        <label className="block text-xs mb-1">Поле даты</label>
                        <select
                          value={ser.dateField || ''}
                          onChange={e => handleSeriesChange(ser.id, 'dateField', e.target.value)}
                          className="w-full border px-2 py-1 rounded"
                        >
                          <option value="">— выберите —</option>
                          {fieldOptions.map(opt => <option key={opt.path} value={opt.path}>{opt.path} — {translate(opt.label)}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs mb-1">Поля значений</label>
                        <select
                          multiple
                          value={ser.valueFields || []}
                          onChange={e => {
                            const opts = Array.from(e.target.selectedOptions).map(o => o.value);
                            handleSeriesChange(ser.id, 'valueFields', opts);
                          }}
                          className="w-full h-36 border px-2 py-1 rounded"
                          size={Math.min(12, fieldOptions.length)}
                        >
                          {fieldOptions.map(opt => <option key={opt.path} value={opt.path}>{opt.path} — {translate(opt.label)}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}

                  <button onClick={addSeries} className="mt-2 px-3 py-1 bg-blue-600 text-white rounded">
                    + Добавить серию
                  </button>
                </div>

                {/* reference */}
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">
                    Референсное значение на день
                  </label>
                  <input
                    type="number"
                    value={editingConfig.refNumber ?? ''}
                    onChange={e => handleFieldChange('refNumber', e.target.value ? Number(e.target.value) : null)}
                    className="w-full border px-3 py-2 rounded"
                  />
                </div>

                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">
                    Референсное значение на неделю
                  </label>
                  <input
                    type="number"
                    value={editingConfig.refNumberWeek ?? ''}
                    onChange={e => handleFieldChange('refNumberWeek', e.target.value ? Number(e.target.value) : null)}
                    className="w-full border px-3 py-2 rounded"
                  />
                </div>

                {/* Цвет таба */}
                <div className="mb-3">
                  <label className="block text-sm font-medium mb-1">
                    Цвет кнопки отчёта
                  </label>
                  <input
                    type="color"
                    value={editingConfig.color || '#3182ce'}
                    onChange={e => handleFieldChange('color', e.target.value)}
                    className="w-12 h-8 p-0 border-0"
                    title="Выбрать цвет вкладки"
                  />
                </div>


                {/* Кнопки Сохранить/Отмена */}
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                  >
                    Сохранить
                  </button>
                  <button
                    onClick={() => setEditingConfig(null)}
                    className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
                  >
                    Отмена
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}







// 'use client';

// import { useEffect, useState } from 'react';
// import Spinner from '../../../components/Spinner';

// export default function DashboardConfigPage() {
//   const [configs, setConfigs] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [editingConfig, setEditingConfig] = useState(null);
//   const [fieldPaths, setFieldPaths] = useState([]);
//   const [fieldOptions, setFieldOptions] = useState([]); // массив { path, label }

//   // 1) Загрузка списка конфигов
//   useEffect(() => {
//     fetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard-configs`)
//       .then(res => res.json())
//       .then(data => {
//         const arr = Array.isArray(data) ? data : [];
//         // сортируем по полю order
//         arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
//         setConfigs(arr);
//         setLoading(false);
//       });
//   }, []);

//   // 2) Когда начинаем редактировать — сохраняем весь объект
//   const startEdit = (cfg) => {
//     setEditingConfig({ ...cfg });
//     setFieldPaths([]);  // сбросим старые пути
//   };

//   // // 3) Подгрузка путей полей при смене endpoint
//   useEffect(() => {
//     if (!editingConfig?.endpoint) return;
//     fetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard-configs/fields/${editingConfig.endpoint}`)
//       .then(r => r.json())
//       .then(raw => {
//       // console.log("raw = ", raw)  
//       // Гарантируем, что fieldOptions — это массив
//       const arr = Array.isArray(raw) ? raw : [];

//       setFieldOptions(arr);

//       setEditingConfig(cfg => ({
//         ...cfg,
//         dateField: cfg.dateField || arr[0]?.path || '',
//         valueFields: cfg.valueFields?.length
//           ? cfg.valueFields
//           : arr.slice(1, 3).map(x => x.path),
//       }));
//     });
//   }, [editingConfig?.endpoint]);



//   // 4) Создание нового конфига
//   const handleCreate = async () => {
//   try {
//     const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard-configs`, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({
//         label: 'Новый отчёт',
//         key: `report_${Date.now()}`,
//         endpoint: '',
//         dateField: '',
//         valueFields: [],
//       }),
//     });
//     const payload = await res.json();
//     if (!res.ok) {
//       console.error('Ошибка создания конфига:', payload);
//       alert(`Ошибка: ${payload.error || JSON.stringify(payload)}`);
//       return;
//     }
//     setConfigs(prev => [...prev, payload]);
//     setEditingConfig(payload);
//   } catch (err) {
//     console.error('Network error при создании конфига:', err);
//     alert('Сетевая ошибка при создании конфига, см. консоль');
//   }
// };


//   // 5) Сохранение (PUT) редактируемого конфига
//   const handleSave = async () => {
//     const { id, ...body } = editingConfig;
//     const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard-configs/${id}`, {
//       method: 'PUT',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify(body),
//     });
//     if (res.ok) {
//       // Обновим массив configs
//       setConfigs(prev =>
//         prev.map(c => (c.id === id ? editingConfig : c))
//       );
//       setEditingConfig(null);
//     }
//   };

//   // 6) Удаление
//   const handleDelete = async (id) => {
//     if (!confirm('Удалить этот отчёт?')) return;
//     const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard-configs/${id}`, { method: 'DELETE' });
//     if (res.ok) {
//       setConfigs(prev => prev.filter(c => c.id !== id));
//       if (editingConfig?.id === id) setEditingConfig(null);
//     }
//   };

//   // 7) Локальное изменение полей формы
//   const handleFieldChange = (field, value) => {
//     setEditingConfig(cfg => ({ ...cfg, [field]: value }));
//   };


//   // Функция для сохранения порядка 
//   const updateConfigOnServer = async (cfg) => {
//     const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard-configs/${cfg.id}`, {
//       method: 'PUT',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify(cfg),
//     });

//     if (!res.ok) {
//       const text = await res.text();
//       console.error(`[PUT] Ошибка сохранения ${cfg.id}:`, text);
//     } else {
//       // console.log(`[PUT] Успешно сохранено ${cfg.id}`);
//     }
//   };


//   // 2) moveUp
//   const moveUp = async (index) => {
//     const sorted = [...configs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

//     if (index === 0) return;

//     const curr = sorted[index];
//     const prev = sorted[index - 1];

//     // Назначаем уникальные order, если одинаковые или отсутствуют
//     if ((curr.order ?? 0) === (prev.order ?? 0)) {
//       sorted.forEach((cfg, idx) => {
//         cfg.order = idx * 10; // шаг 10 для удобства
//       });
//     }

//     // Повторно берём после возможного пересчёта
//     const updatedCurr = sorted[index];
//     const updatedPrev = sorted[index - 1];

//     const temp = updatedCurr.order;
//     updatedCurr.order = updatedPrev.order;
//     updatedPrev.order = temp;

//     await Promise.all([
//       updateConfigOnServer(updatedCurr),
//       updateConfigOnServer(updatedPrev),
//     ]);

//     sorted[index - 1] = updatedCurr;
//     sorted[index] = updatedPrev;

//     setConfigs([...sorted]);
//   };


//   // 3) moveDown
//   const moveDown = async (index) => {
//     const sorted = [...configs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

//     if (index >= sorted.length - 1) return;

//     const curr = sorted[index];
//     const next = sorted[index + 1];

//     // Назначаем уникальные order, если они одинаковые или отсутствуют
//     if ((curr.order ?? 0) === (next.order ?? 0)) {
//       sorted.forEach((cfg, idx) => {
//         cfg.order = idx * 10; // шаг 10 — удобно для вставок
//       });
//     }

//     // Повторно берем curr и next уже с новыми order
//     const updatedCurr = sorted[index];
//     const updatedNext = sorted[index + 1];

//     // Меняем местами
//     const temp = updatedCurr.order;
//     updatedCurr.order = updatedNext.order;
//     updatedNext.order = temp;

//     await Promise.all([
//       updateConfigOnServer(updatedCurr),
//       updateConfigOnServer(updatedNext),
//     ]);

//     // Обновлённый массив
//     sorted[index] = updatedNext;
//     sorted[index + 1] = updatedCurr;

//     setConfigs([...sorted]);
//   };

//   if (loading) return <Spinner />;

//   const sortedConfigs = [...configs].sort(
//     (a, b) => (a.order ?? 0) - (b.order ?? 0)
//   );

//   return (
//     <div className="p-6 max-w-3xl mx-auto">
//       <h1 className="text-2xl font-semibold mb-4">Конфигурация дашборда</h1>
//       <button
//         onClick={handleCreate}
//         className="bg-blue-600 text-white px-4 py-2 rounded mb-6 hover:bg-blue-700"
//       >
//         + Добавить отчёт
//       </button>

//       {sortedConfigs.length === 0 && !editingConfig && (
//         <div>Пока нет ни одного отчёта. Нажмите «Добавить отчёт».</div>
//       )}

//       {sortedConfigs.map((cfg, idx) => {
//         const isFirst = idx === 0;
//         const isLast = idx === sortedConfigs.length - 1;
//         const isEditing = editingConfig?.id === cfg.id;

//         return (
//           <div
//             key={cfg.id || `cfg-${idx}`}
//             className="border border-gray-300 rounded p-4 mb-4 bg-white shadow-sm"
//           >
//             {/* Если не в режиме редактирования — показываем кратко */}
//             {!isEditing && (
//               <div className="flex justify-between items-center">
//                 <div>
//                   <div className="font-medium">{cfg.label}</div>
//                   <div className="text-sm text-gray-600">{cfg.endpoint}</div>
//                 </div>

//                 {/* Кнопки перемещения вверх/вниз */}
//                 <div className="flex gap-1 mr-4">
//                   <button
//                     onClick={() => moveUp(idx)}
//                     disabled={isFirst}
//                     className="px-2 py-1 bg-gray-600 rounded disabled:opacity-50"
//                   >
//                     ↑
//                   </button>
//                   <button
//                     onClick={() => moveDown(idx)}
//                     disabled={isLast}
//                     className="px-2 py-1 bg-gray-600 rounded disabled:opacity-50"
//                   >
//                     ↓
//                   </button>
//                 </div>

//                 {/* Кнопки редактирования и удаления */}
//                 <div className="flex gap-2">
//                   <button
//                     onClick={() => startEdit(cfg)}
//                     className="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600"
//                   >
//                     Редактировать
//                   </button>
//                   <button
//                     onClick={() => handleDelete(cfg.id)}
//                     className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
//                   >
//                     Удалить
//                   </button>
//                 </div>
//               </div>
//             )}

//             {/* Форма редактирования */}
//             {isEditing && (
//               <>
//                 {/* Label */}
//                 <div className="mb-3">
//                   <label className="block text-sm font-medium mb-1">
//                     Название отчёта
//                   </label>
//                   <input
//                     type="text"
//                     value={editingConfig.label ?? ''}
//                     onChange={e => handleFieldChange('label', e.target.value)}
//                     className="w-full border px-3 py-2 rounded"
//                   />
//                 </div>

//                 {/* Key */}
//                 <div className="mb-3">
//                   <label className="block text-sm font-medium mb-1">Key</label>
//                   <input
//                     type="text"
//                     value={editingConfig.key ?? ''}
//                     onChange={e => handleFieldChange('key', e.target.value)}
//                     className="w-full border px-3 py-2 rounded bg-gray-100"
//                   />
//                 </div>

//                 {/* Endpoint */}
//                 <div className="mb-3">
//                   <label className="block text-sm font-medium mb-1">
//                     Источник (endpoint)
//                   </label>
//                   <select
//                     value={editingConfig.endpoint ?? ''}
//                     onChange={e => handleFieldChange('endpoint', e.target.value)}
//                     className="w-full border px-3 py-2 rounded bg-white"
//                   >
//                     <option value="">— выберите —</option>
//                     <option value="orders">Заказы</option>
//                     <option value="orderConfigs">Надстройки</option>
//                     <option value="crm">Консультации</option>
//                   </select>
//                 </div>

//                 {/* dateField */}
//                 <div className="mb-3">
//                   <label className="block text-sm font-medium mb-1">Поле даты</label>
//                   <select
//                     value={editingConfig.dateField ?? ''}
//                     onChange={e => handleFieldChange('dateField', e.target.value)}
//                     className="w-full border px-3 py-2 rounded bg-white"
//                   >
//                     <option value="">— выберите —</option>
//                       {fieldOptions.map(opt => (
//                         <option key={opt.path} value={opt.path}>
//                           {opt.path} — {opt.label}
//                         </option>
//                       ))}
//                   </select>
//                 </div>

//                 {/* valueFields */}
//                 <div className="mb-3">
//                   <label className="block text-sm font-medium mb-1">
//                     Поля значений
//                   </label>
//                   <select
//                     multiple
//                     value={editingConfig.valueFields || []}
//                     onChange={e => {
//                       const opts = Array.from(e.target.selectedOptions).map(o => o.value);
//                       handleFieldChange('valueFields', opts);
//                     }}
//                     className="w-full h-64 border px-3 py-2 rounded bg-white"
//                     size={Math.min(20, fieldPaths.length)}
//                   >
//                     {fieldOptions.map(opt => (
//                       <option key={opt.path} value={opt.path}>
//                         {opt.path} — {opt.label}
//                       </option>
//                     ))}
//                   </select>
//                 </div>

//                 {/* reference */}
//                 <div className="mb-3">
//                   <label className="block text-sm font-medium mb-1">
//                     Референсное значение на день
//                   </label>
//                   <input
//                     type="number"
//                     value={editingConfig.refNumber ?? ''}
//                     onChange={e => handleFieldChange('refNumber', e.target.value ? Number(e.target.value) : null)}
//                     className="w-full border px-3 py-2 rounded"
//                   />
//                 </div>

//                 <div className="mb-3">
//                   <label className="block text-sm font-medium mb-1">
//                     Референсное значение на неделю
//                   </label>
//                   <input
//                     type="number"
//                     value={editingConfig.refNumberWeek ?? ''}
//                     onChange={e => handleFieldChange('refNumberWeek', e.target.value ? Number(e.target.value) : null)}
//                     className="w-full border px-3 py-2 rounded"
//                   />
//                 </div>

//                 {/* Цвет таба */}
//                 <div className="mb-3">
//                   <label className="block text-sm font-medium mb-1">
//                     Цвет кнопки отчёта
//                   </label>
//                   <input
//                     type="color"
//                     value={editingConfig.color || '#3182ce'}
//                     onChange={e => handleFieldChange('color', e.target.value)}
//                     className="w-12 h-8 p-0 border-0"
//                     title="Выбрать цвет вкладки"
//                   />
//                 </div>


//                 {/* Кнопки Сохранить/Отмена */}
//                 <div className="flex gap-2">
//                   <button
//                     onClick={handleSave}
//                     className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
//                   >
//                     Сохранить
//                   </button>
//                   <button
//                     onClick={() => setEditingConfig(null)}
//                     className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
//                   >
//                     Отмена
//                   </button>
//                 </div>
//               </>
//             )}
//           </div>
//         );
//       })}
//     </div>
//   );
// }



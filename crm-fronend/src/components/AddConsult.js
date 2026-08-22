// components/AddConsult.js

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Spinner from "../components/Spinner";
import { toast } from 'react-toastify';
import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';

const STATUS_HISTORY_KEY = '__statusHistoryIds';

export default function AddConsultForm() {

  const router = useRouter();

  const [config, setConfig] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [technics, setTechnics] = useState([]);
  const [infoSources, setInfoSources] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [editedRecord, setEditedRecord] = useState({
    technicName: '',
    address: '',
    statusId: 9,
    date: new Date(),
    requestDate: new Date(),
    lastTalk: '',
    clientPhone: '',
    clientName: '',
    serviceRequired: '',
    numberObjects: '',
    serviceDate: new Date(),         
    serviceTime: "",
    paymentAmount: '',
    source: '',
    secondCallDate: new Date(),
    reminderCallDate: new Date(),
    comment: '',
    // email: "",
    newParams: {},
    active: Boolean,
  });

  // 
  useEffect(() => {

    setLoading(true);

    async function fetchData() {
      try {
        const [configRes, technicsRes, infoSourcesRes, statusesRes] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm-config`),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/technics`),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/infoSources`),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm-statuses`),
        ]);

        if (!configRes.ok) throw new Error('Ошибка загрузки конфигурации');
        if (!technicsRes.ok) throw new Error('Ошибка загрузки технологов');
        if (!infoSourcesRes.ok) throw new Error('Ошибка загрузки источников информации');
        if (!statusesRes.ok) throw new Error('Ошибка загрузки статусов');
        
        const configData = await configRes.json();
        const technicsData = await technicsRes.json();
        const infoSourcesData = await infoSourcesRes.json();
        const statusesData = await statusesRes.json();

        setTechnics(technicsData);
        setInfoSources(infoSourcesData);
        setStatuses(statusesData);
        setConfig(configData.filter(c => c.activeInside).sort((a, b) => a.order - b.order));


      } catch (error) {
        console.error('Ошибка загрузки данных:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);


  // Функция удаления
  const handleDelete = () => {
    const isConfirmed = window.confirm("Вы уверены, что хотите удалить этот объект?");
    
    if (isConfirmed) {
      // Выполняем удаление
      deleteItem();
    }
  };

  const deleteItem = async () => {
    try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm/${id}`, {
            method: 'DELETE',
        });

        if (response.ok) {
            router.push('/crm');
        } else {
            throw new Error('Ошибка при удалении');
        }
    } catch (error) {
        console.error(error);
        toast('Не удалось удалить.');
    }
  };


  const handleChange = (field, value, isDynamic = false) => {
    // console.log("value = ", value)
    setEditedRecord(prev => {
      if (isDynamic) {
        return {
          ...prev,
          newParams: {
            ...prev.newParams,
            [field]: value ?? ''
          }
        };
      }
      return {
        ...prev,
        [field]: value ?? ''
      };
    });
  };


  // helper
  function normalizePhone(input) {
    if (!input) return '';
    // Оставляем только цифры
    let d = String(input).replace(/\D/g, '');

    // Обрезаем до максимум 11 цифр (если юзер вставил длинную строку)
    if (d.length > 11) d = d.slice(-11); // берем последние 11 (чтобы сохранить локальную часть)

    // Если 11 цифр: убедимся, что первая — 7 (заменим 8 -> 7, или любую другую -> 7)
    if (d.length === 11) {
      if (d[0] === '8') d = '7' + d.slice(1);
      if (d[0] !== '7') d = '7' + d.slice(1);
      return d;
    }

    // Если 10 цифр — скорее всего пользователь ввёл без кода (пример: 9123456789)
    if (d.length === 10) {
      return '7' + d;
    }

    // Меньше 10 цифр — возвращаем текущее (но заменим ведущую 8 -> 7, если есть)
    if (d.startsWith('8')) d = '7' + d.slice(1);

    return d;
  }

  // // валидатор: true если готово к сохранению как 7XXXXXXXXXX
  // function isValidPhoneForSave(normalized) {
  //   return /^\b7\d{10}\b$/.test(normalized);
  // }

  

  const handleSave = async () => {
    // console.log('[handleSave start]')
    try {
      setSaving(true);

      const processed = { ...editedRecord };
      processed.newParams = {
        ...(processed.newParams || {}),
        iamConsult: '1',
      };
      const initialStatusId = Number(processed.statusId);
      const existingHistory = Array.isArray(processed.newParams?.[STATUS_HISTORY_KEY])
        ? processed.newParams[STATUS_HISTORY_KEY]
        : [];
      processed.newParams[STATUS_HISTORY_KEY] = Array.from(
        new Set([
          ...existingHistory.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0),
          ...(Number.isFinite(initialStatusId) && initialStatusId > 0 ? [initialStatusId] : []),
        ]),
      );

      // console.log('processed = ', processed)

      // Преобразуем даты в ISO-формат
      config.forEach(col => {
      let value = processed[col.field];

        if (col.field === 'numberObjects' && (value === '' || value == null)) {
          processed[col.field] = 1;
        }
    
        // Для всех обычных дат — штатная логика
        if (col.type === 'DATEONLY') {
          if (!value) {
            processed[col.field] = null; // или undefined
          } else if (typeof value === 'string') {
            const date = new Date(value);
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            processed[col.field] = `${yyyy}-${mm}-${dd}`; // формат DATEONLY
          }
        }
        

        if (col.type === 'DATE') {
          if (!value || isNaN(new Date(value).getTime())) {
            // Не валидная дата — явно пишем null
            processed[col.field] = null;
          } else {
            const date = new Date(value);
            date.setHours(date.getHours() + 10); // или без этого — зависит от логики
        
            const tzOffsetMin = -date.getTimezoneOffset();
            const sign = tzOffsetMin >= 0 ? '+' : '-';
            const abs = Math.abs(tzOffsetMin);
            const hh = String(Math.floor(abs / 60)).padStart(2, '0');
            const mm = String(abs % 60).padStart(2, '0');
        
            const iso = date.toISOString().slice(0, 19); // 'YYYY-MM-DDTHH:mm:ss'
            processed[col.field] = `${iso}${sign}${hh}:${mm}`;
          }
        }
        
        
      });

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(processed),
      });

      // console.log('data = ', res.data)
  
      if (!res.ok) throw new Error(`Status ${res.status}`);

      toast('Запись сохранена');
      setEditedRecord(processed);
      router.push('/crm');
    } catch (err) {
      console.error('Ошибка сохранения:', err);
      toast('Ошибка при сохранении');
    } finally {
      setSaving(false);
    }
  };

  const searchParams = useSearchParams();

  // для автозаполнения из URL-параметров
  useEffect(() => {
    if (!searchParams) return;

    // const fromOrderId = searchParams.get('fromOrderId') ?? '';
    const address = searchParams.get('address') ?? '';
    const clientPhone = searchParams.get('clientPhone') ?? '';
    const clientName = searchParams.get('clientName') ?? '';
    const serviceRequired = searchParams.get('serviceRequired') ?? '';
    const technicId = searchParams.get('technicId') ?? '';
    const dataPriema = searchParams.get('dataPriema') ?? '';

    let technicNameValue = '';
    if (technicId) {
      const t = technics.find(x => String(x.id) === String(technicId));
      technicNameValue = t ? t.name : '';
    }

    setEditedRecord(prev => ({
      ...prev,

      address,
      clientPhone,
      clientName,
      serviceRequired,
      technicName: technicNameValue,
      requestDate: dataPriema || new Date(),
      newParams: {
        ...prev.newParams,
        // если param9 используется для serviceRequired
        serviceRequired,
      },
      active: true,
    }));
  }, [searchParams, technics]);



  function toUTCString(localYMDThhmm) {
    // new Date("YYYY-MM-DDTHH:mm") парсится как local time
    const dt = new Date(localYMDThhmm);
    return dt.toISOString(); // возвращает ISO UTC
  }


  function formatToDatetimeLocal(dateInput) {
    const date = new Date(dateInput);
    const offsetMs = date.getTimezoneOffset() * 60000;
    const local = new Date(date.getTime() - offsetMs);
    return local.toISOString().slice(0, 16); // 'YYYY-MM-DDTHH:mm'
  }



  const staticCols = useMemo(() => {
    return config.map(col => ({
      ...col,
      isDynamic: Object.prototype.hasOwnProperty.call(editedRecord.newParams, col.field),
    }));
  }, [config, editedRecord.newParams]);

  const dynamicCols = useMemo(() => {
    return Object.keys(editedRecord.newParams)
      // отфильтровываем те, что уже есть в config
      .filter(field => !config.some(c => c.field === field))
      .map(field => ({
        field,
        // если у вас в newParams хранится не только значение, но и метаданные:
        label: config.find(c => c.field === field)?.label || field,
        isDynamic: true,
      }));
  }, [config, editedRecord.newParams]);

  const allCols = useMemo(() => [...staticCols, ...dynamicCols], [staticCols, dynamicCols]);

if (loading) return <Spinner />;

  return (
      <div className="p-4 sm:p-6">
        <h1 className="text-xl sm:text-2xl font-bold mb-4 text-center sm:text-left">
        Создание новой консультации:
        </h1>

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Левая колонка (данные) */}
          <div className="grid gap-4 w-full lg:w-1/2">

            {allCols.map(col => {
              // если динамическое — берём из newParams, иначе — из верхнего уровня
              const value = col.isDynamic
                ? editedRecord?.newParams[col.field]
                : editedRecord[col.field];

              const isDateField = col.type === 'DATE' || col.type === 'DATEONLY';  

              return (
                <div key={col.field} className="flex flex-col text-sm sm:text-base">
                  <label className="font-semibold mb-1">{col.label}</label>

                  {col.field === 'source' ? (
                    <select
                      value={value}
                      onChange={(e) => handleChange(col.field, e.target.value)}
                      className="border rounded px-3 py-2 text-sm sm:text-base"
                    >
                      <option value="">Не выбрано</option>
                      {infoSources.map(infoSource => (
                        <option key={infoSource.id} value={infoSource.name}>{infoSource.name}</option>
                      ))}
                    </select>
                  ) : col.field === 'technicName' ? (
                    <select
                      value={value}
                      onChange={(e) => handleChange(col.field, e.target.value)}
                      className="border rounded px-3 py-2 text-sm sm:text-base"
                    >
                      <option value="">Не выбрано</option>
                      {technics.map(technic => (
                        <option key={technic.id} value={technic.name}>{technic.name}</option>
                      ))}
                    </select>
                  ) : col.field === 'lastTalk' ? (
                        <select
                          value={editedRecord.lastTalk}
                          onChange={e => handleChange('lastTalk', e.target.value)}
                          className="border rounded px-3 py-2 text-sm sm:text-base"
                        >
                          <option value="">Не выбрано</option>
                          {technics.map(technic => (
                            <option key={technic.id} value={technic.name}>
                              {technic.name}
                            </option>
                          ))}
                        </select>
                  ) : col.field === 'statusId' ? (
                    <select
                      value={value}
                      onChange={e => handleChange(col.field, +e.target.value)}
                      className="border rounded px-3 py-2 text-sm sm:text-base"
                    >
                      {statuses
                      .sort((a, b) => a.order - b.order)
                      .map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  ) : col.field === 'clientPhone' ? (
                    <input
                      type="tel"
                      className="border rounded px-3 py-2 text-sm sm:text-base"
                      value={value ?? ''}
                      onChange={e => {
                        // сохраняем "как есть", но только цифры (чтобы не хранить пробелы/скобки)
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                        handleChange(col.field, digits);
                      }}
                      onBlur={() => {
                        const normalized = normalizePhone(value);
                        handleChange(col.field, normalized);
                      }}
                    />
                  ) : col.field === 'email' ? (
                      <input
                        type="email"
                        className="border rounded px-3 py-2 text-sm sm:text-base"
                        value={value ?? ''}
                        onChange={e => handleChange(col.field, e.target.value)}
                      />
                  ) : col.field === 'numberObjects' ? (
                      <input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        className="border rounded px-3 py-2 text-sm sm:text-base"
                        value={value && value !== '' ? value : 1}   // <-- по умолчанию 1
                        onChange={e => handleChange(col.field, e.target.value)}
                      />
                  ) : ['priceAnnouncedDate'].includes(col.field) ? (
                    <label className="inline-flex items-center gap-2 text-sm sm:text-base">
                      <input
                        type="checkbox"
                        checked={!!value}
                        onChange={(e) => {
                          const isChecked = e.target.checked;
                          handleChange(col.field, isChecked ? new Date().toISOString().split('T')[0] : '');
                        }}
                      />
                      {value ? new Date(value).toLocaleDateString() : 'Дата не установлена'}
                    </label>
                  ) : ['projectsReadyDate', 'projesctsFullReady', 'projectsFullReady'].includes(col.field) ? (
                      <div className="flex items-center gap-3">
                        {/* Чекбокс: вкл/выкл */}
                        <label className="inline-flex items-center gap-2 text-sm sm:text-base">
                          <input
                            type="checkbox"
                            checked={!!value}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              // если чек включили — ставим текущую дату в формате YYYY-MM-DD, иначе очищаем
                              handleChange(col.field, checked ? new Date().toISOString().split('T')[0] : '');
                            }}
                          />
                          {/* Отображаем короткую метку */}
                          <span>{value ? new Date(value).toLocaleDateString() : 'Дата не установлена'}</span>
                        </label>

                        {/* Поле для редактирования даты (видно только если включено / есть значение) */}
                        {(!!value) && (
                          <input
                            type="date"
                            className="border rounded px-3 py-2 text-sm sm:text-base"
                            // value ожидает строку в формате YYYY-MM-DD (как мы и сохраняем)
                            value={value ? String(value).slice(0, 10) : ''}
                            onChange={(e) => {
                              const newDateYmd = e.target.value; // "YYYY-MM-DD"
                              // сохраняем в том же формате (у тебя в коде используются такие строки для DATE/DATEONLY)
                              handleChange(col.field, newDateYmd);
                            }}
                          />
                        )}

                        {/* Кнопка очистки, если нужно быстро удалить дату */}
                        {value && (
                          <button
                            type="button"
                            onClick={() => handleChange(col.field, '')}
                            className="text-sm px-2 py-1 border rounded hover:bg-gray-100"
                            title="Очистить дату / Clear date"
                          >
                            ✖
                          </button>
                        )}
                      </div>
                  ) : ['secondCallDate','serviceDate','requestDate', 'reminderCallDate'].includes(col.field) ? (

                      <div className="flex gap-2">
                        {editedRecord[col.field] ? (
                          (() => {

                            // Локальный ISO "YYYY-MM-DDTHH:mm" для value
                            const dtLocal = editedRecord[col.field]
                              ? formatToDatetimeLocal(editedRecord[col.field])
                              : null;

                            const datePart = dtLocal ? dtLocal.slice(0, 10) : '';
                            const timePart = dtLocal ? dtLocal.slice(11, 16) : '';

                            return (
                              <>
                                <input
                                  type="date"
                                  className="border rounded px-3 py-2 text-sm sm:text-base"
                                  value={datePart}
                                  onChange={e => {
                                    const newDate = e.target.value; // "YYYY-MM-DD"
                                    // собираем локальный YMDThh:mm и приводим к UTC ISO
                                    const localYMDThhmm = `${newDate}T${timePart || '00:00'}`;
                                    handleChange(col.field, toUTCString(localYMDThhmm));
                                  }}
                                />
                                <input
                                  type="time"
                                  className="border rounded px-3 py-2 text-sm sm:text-base"
                                  value={timePart}
                                  onChange={e => {
                                    const newTime = e.target.value; // "HH:MM"
                                    const localYMDThhmm = `${datePart || new Date().toISOString().slice(0,10)}T${newTime}`;
                                    handleChange(col.field, toUTCString(localYMDThhmm));
                                  }}
                                />
                              </>
                            );
                          })()
                        ) 
                        : (
                          <input
                            type="datetime-local"
                            className="border rounded px-3 py-2 text-sm sm:text-base"
                            value=""
                            onChange={e => handleChange(col.field, e.target.value)}
                          />
                        ) 

                        }
                      </div>
                  ) : col.type === 'BOOLEAN' ? (
                    <label className="inline-flex items-center gap-2 text-sm sm:text-base">
                      <input
                        type="checkbox"
                        checked={value === true || value === 'true' || value === 1 || value === '1'}
                        onChange={(e) => handleChange(col.field, e.target.checked, col.isDynamic)}
                      />
                      <span>{(value === true || value === 'true' || value === 1 || value === '1') ? 'Да' : 'Нет'}</span>
                    </label>
                  ) : isDateField ? (
                    <input
                      type="date"
                      value={value ? new Date(value).toISOString().split('T')[0] : ''}
                      onChange={(e) => handleChange(col.field, e.target.value)}
                      className="border rounded px-3 py-2 text-sm sm:text-base"
                    />
                  ) : (
                    <input
                      type="text"
                      value={value}
                      // onChange={(e) => handleChange(col.field, e.target.value)}
                      onChange={e => handleChange(col.field, e.target.value, col.isDynamic)}
                      className="border rounded px-3 py-2 text-sm sm:text-base"
                    />
                  )
                  
                  
                  }
            
                </div>
              );
            })}
          </div>


        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="os-primary-bg mt-6 text-white px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>

        <button 
          onClick={handleDelete} 
          className="os-primary-bg mt-6 text-white px-4 py-2 rounded-lg disabled:opacity-50"
        >
          Удалить
        </button>
      </div>
  );

}

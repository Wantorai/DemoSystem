'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation'; // добавляем useParams
import { toast } from 'react-toastify';
import Spinner from "../../../components/Spinner";
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const STATUS_HISTORY_KEY = '__statusHistoryIds';

function parseStatusHistory(recordLike) {
  const historyRaw = recordLike?.newParams?.[STATUS_HISTORY_KEY];
  const historyArr = Array.isArray(historyRaw)
    ? historyRaw
    : String(historyRaw || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

  const ids = historyArr
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  const current = Number(recordLike?.statusId);
  if (Number.isFinite(current) && current > 0) ids.push(current);

  return Array.from(new Set(ids));
}


export default function ConsultPage() {
  const rawId = useParams()?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const router = useRouter()

  const [record, setRecord] = useState(null);
  // const [editedRecord, setEditedRecord] = useState({
  //   // если record сразу приходит, то заполняем его, иначе — только пустой newParams 
  //   ...(record || {}),
  //   newParams: (record && record.newParams) || {},
  // });
  const [editedRecord, setEditedRecord] = useState(null);
  const [config, setConfig] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [technics, setTechnics] = useState([]);
  const [callHistory, setCallHistory] = useState([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [callsError, setCallsError] = useState('');
  const [callsPeriodIndex, setCallsPeriodIndex] = useState(0);
  const [callsSearchStopped, setCallsSearchStopped] = useState(false);
  const [playingFile, setPlayingFile] = useState(null);
  const [infoSources, setInfoSources] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [usedStatusIds, setUsedStatusIds] = useState([]);
  const activeStatusId = useMemo(() => {
    const found = (statuses || []).find((s) => String(s?.key || '').trim().toLowerCase() === 'active');
    const idNum = Number(found?.id);
    return Number.isFinite(idNum) && idNum > 0 ? idNum : null;
  }, [statuses]);

  // 2) При смене id — сбрасываем состояние и начинаем загрузку заново
  useEffect(() => {
    setRecord(null);
    setEditedRecord(null);
    setCallHistory([]);
    setCallsError('');
    setCallsPeriodIndex(0);
    setCallsSearchStopped(false);
    setLoading(true);

    async function fetchData() {
      try {
        const [recordRes, configRes, technicsRes, infoSourcesRes, statusesRes] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm/${id}`),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm-config`),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/technics`),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/infoSources`),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm-statuses`),
        ]);

        if (!recordRes.ok) throw new Error('Ошибка загрузки записи');
        if (!configRes.ok) throw new Error('Ошибка загрузки конфигурации');
        if (!technicsRes.ok) throw new Error('Ошибка загрузки технологов');
        if (!infoSourcesRes.ok) throw new Error('Ошибка загрузки источников информации');
        if (!statusesRes.ok) throw new Error('Ошибка загрузки статусов');
        
        const recordData = await recordRes.json();
        const configData = await configRes.json();
        const technicsData = await technicsRes.json();
        const infoSourcesData = await infoSourcesRes.json();
        const statusesData = await statusesRes.json();

        setRecord(recordData);
        setEditedRecord(recordData); // копия для формы
        setUsedStatusIds(parseStatusHistory(recordData));
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

    if (id) fetchData();
  }, [id]);


  const loadCallsPeriod = useCallback(async (periodIndex) => {
    if (!record?.clientPhone) return;
    setLoadingCalls(true);
    setCallsError('');
    setCallsSearchStopped(false);
    const rawPhone = String(record.clientPhone || '');
    const normalizedPhone = rawPhone.replace(/\D/g, '');
    const requestUrl =
      `${process.env.NEXT_PUBLIC_API_URL}/calls/by-phone` +
      `?phone=${encodeURIComponent(rawPhone)}&periodIndex=${periodIndex}`;

    try {
      const response = await fetch(requestUrl);
      if (!response.ok) {
        let serverMessage = '';
        try {
          const payload = await response.json();
          serverMessage = String(payload?.message || payload?.error || '').trim();
        } catch (_) {}
        throw new Error(serverMessage || `Ошибка загрузки звонков: HTTP ${response.status}`);
      }
      const data = await response.json();
      setCallHistory(Array.isArray(data) ? data : []);
      setCallsPeriodIndex(periodIndex);
    } catch (err) {
      setCallsError(err?.message || 'Ошибка загрузки звонков');
      setCallHistory([]);
      console.error('[ConsultCalls][load:error]', {
        consultId: id,
        rawPhone,
        normalizedPhone,
        periodIndex,
        message: err?.message || String(err),
      });
    } finally {
      setLoadingCalls(false);
    }
  }, [id, record?.clientPhone]);

  // 3) Сначала загружаем только последние шесть месяцев.
  useEffect(() => {
    if (!record?.clientPhone) return;
    setCallsPeriodIndex(0);
    setCallsSearchStopped(false);
    void loadCallsPeriod(0);
  }, [loadCallsPeriod, record?.clientPhone]);

  const callsPeriodLabel = useMemo(() => {
    if (callsPeriodIndex === 0) return 'за последние 6 месяцев';
    const fromMonths = callsPeriodIndex * 6;
    const toMonths = (callsPeriodIndex + 1) * 6;
    return `за период от ${fromMonths} до ${toMonths} месяцев назад`;
  }, [callsPeriodIndex]);

  const latestCallDateIso = useMemo(() => {
    if (!Array.isArray(callHistory) || callHistory.length === 0) return null;

    const latestMs = callHistory.reduce((acc, call) => {
      const ms = new Date(call?.date).getTime();
      if (Number.isNaN(ms)) return acc;
      return Math.max(acc, ms);
    }, 0);

    if (!latestMs) return null;
    return new Date(latestMs).toISOString();
  }, [callHistory]);

  useEffect(() => {
    if (!latestCallDateIso) return;
    if (!Array.isArray(config) || config.length === 0) return;

    const lastCallConfig = config.find((c) => c.field === 'LastCall');
    if (!lastCallConfig) return;

    const nextValue =
      lastCallConfig.type === 'DATEONLY'
        ? latestCallDateIso.slice(0, 10)
        : latestCallDateIso;

    setEditedRecord((prev) => {
      if (!prev) return prev;

      const hasDynamicLastCall = Object.prototype.hasOwnProperty.call(prev.newParams || {}, 'LastCall');
      const currentValue = hasDynamicLastCall ? prev.newParams?.LastCall : prev.LastCall;

      const currentMs = currentValue ? new Date(currentValue).getTime() : 0;
      const nextMs = new Date(nextValue).getTime();

      if (Number.isFinite(currentMs) && currentMs >= nextMs) {
        return prev;
      }

      if (hasDynamicLastCall) {
        return {
          ...prev,
          newParams: {
            ...(prev.newParams || {}),
            LastCall: nextValue,
          },
        };
      }

      return {
        ...prev,
        LastCall: nextValue,
      };
    });
  }, [latestCallDateIso, config]);


    // 2) Если record придёт позже (например, из асинхронного запроса),
  //    обновляем editedRecord в useEffect
  useEffect(() => {
    if (record) {
      // const nr = record.newParams || {};
      // console.log('loaded newParams:', nr);
      setEditedRecord({
        ...record,
        newParams: record.newParams || {},
      });
    }
  }, [record]);


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


  // Функция скачивания всех записей
  async function handleDownloadAll() {
    const zip = new JSZip();
    const clientPhone = record.clientPhone || 'unknown';
  
    for (const call of callHistory) {
      const fileName = call.recordFileName;
      if (!fileName) continue;
  
      const fileUrl = `${process.env.NEXT_PUBLIC_API_URL}/calls/record/${encodeURIComponent(fileName)}`;
  
      try {
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`Ошибка загрузки: ${fileName}`);
        const blob = await response.blob();
  
        // Добавляем в архив
        zip.file(fileName, blob);
      } catch (err) {
        console.error(`Не удалось загрузить ${fileName}:`, err);
      }
    }
  
    // Создаем архив и сохраняем
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveAs(zipBlob, `records_${clientPhone}.zip`);
  }
  

  // Функция для определения сотрудника по номеру телефона
  function findEmployee(call) {
    const clientPhone = record.clientPhone || 'unknown';
    return String(call.callerNumber) === String(clientPhone)
      ? call.calleeNumber
      : call.callerNumber;
  }


  // Функция для определения имени сотрудника по номеру телефона
  function findTechnicName(phone) {
    const technicObj = technics?.find(tech => tech.phone === phone);
    return technicObj?.name || 'Не определено'
  }  


  // Функция проверки браузера на datetime-local
  // function supportsDateTimeLocal() {
  //   const input = document.createElement('input');
  //   input.setAttribute('type', 'datetime-local');
  //   return input.type === 'datetime-local';
  // }


  const handleCheckboxChange = async (e) => {
    const { name, checked } = e.target;   // e.g. name="active"
    
    // 1) Optimistically update UI
    setEditedRecord(prev => ({
      ...prev,
      [name]: checked,
    }));

    const payload = { [name]: checked };

    // console.log("payload: ", payload);

    // 2) Persist to back end
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/crm/${id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      // // 3) Check for HTTP-level errors
      // if (!res.ok) {
      //   // Try to read an error message from the response
      //   let errMsg = `Server responded ${res.status}`;
      //   try {
      //     const errData = await res.json();
      //     errMsg = errData.message || JSON.stringify(errData);
      //   } catch (_) {}
      //   throw new Error(errMsg);
        
      // }

      if (!res.ok) {
        throw new Error("HTTP-level errors");
      }


      // optionally, re-fetch entire record or show success toast
    } catch (err) {
      console.error('Failed to update record:', err);
      // rollback UI change on error
      setEditedRecord(prev => ({
        ...prev,
        [name]: !checked,
      }));
      toast('Не удалось сохранить изменение, попробуйте ещё раз.');
    }
  };

  

  const handleChange = (field, value, isDynamic = false) => {
    // console.log("value = ", value)
    setEditedRecord(prev => {
      const nextValue = value ?? '';
      if (!prev) return prev;

      if (isDynamic) {
        return {
          ...prev,
          newParams: {
            ...prev.newParams,
            [field]: nextValue
          }
        };
      }
      const nextRecord = {
        ...prev,
        [field]: nextValue
      };

      // Если изменили дату/время консультации — автоматически ставим статус "Консультация назначена" (key=active).
      if (field === 'serviceDate' && activeStatusId) {
        const prevServiceDate = prev?.serviceDate ?? '';
        if (String(prevServiceDate) !== String(nextValue)) {
          nextRecord.statusId = activeStatusId;
        }
      }

      return nextRecord;
    });
  };
  

  const handleSave = async () => {
    try {
      setSaving(true);

      const processed = { ...editedRecord };
      processed.newParams = {
        ...(processed.newParams || {}),
        iamConsult: '1',
      };
      const finalStatusId = Number(processed.statusId);
      const previousStatusId = Number(record?.statusId);
      const nextHistory = Array.from(
        new Set([
          ...parseStatusHistory(processed),
          ...(Number.isFinite(previousStatusId) && previousStatusId > 0 ? [previousStatusId] : []),
          ...(Number.isFinite(finalStatusId) && finalStatusId > 0 ? [finalStatusId] : []),
        ]),
      );
      processed.newParams[STATUS_HISTORY_KEY] = nextHistory;

      // Преобразуем даты в ISO-формат
      config.forEach(col => {
        const isDynamicField = Object.prototype.hasOwnProperty.call(processed.newParams || {}, col.field);
        const value = isDynamicField ? processed.newParams?.[col.field] : processed[col.field];

        const setFieldValue = (nextValue) => {
          if (isDynamicField) {
            processed.newParams = {
              ...(processed.newParams || {}),
              [col.field]: nextValue,
            };
            return;
          }
          processed[col.field] = nextValue;
        };
  
        // Для всех обычных дат — штатная логика
        if (col.type === 'DATEONLY') {
          if (!value) {
            setFieldValue(null); // или undefined
          } else if (typeof value === 'string') {
            const date = new Date(value);
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            setFieldValue(`${yyyy}-${mm}-${dd}`); // формат DATEONLY
          }
        }
        

        if (col.type === 'DATE') {
          if (!value || isNaN(new Date(value).getTime())) {
            // Не валидная дата — явно пишем null
            setFieldValue(null);
          } else {
            const date = new Date(value);
            date.setHours(date.getHours() + 10); // или без этого — зависит от логики
        
            const tzOffsetMin = -date.getTimezoneOffset();
            const sign = tzOffsetMin >= 0 ? '+' : '-';
            const abs = Math.abs(tzOffsetMin);
            const hh = String(Math.floor(abs / 60)).padStart(2, '0');
            const mm = String(abs % 60).padStart(2, '0');
        
            const iso = date.toISOString().slice(0, 19); // 'YYYY-MM-DDTHH:mm:ss'
            setFieldValue(`${iso}${sign}${hh}:${mm}`);
          }
        }
        
        
      });

      // console.log('Processed payload:', processed);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(processed),
      });
  
      if (!res.ok) throw new Error(`Status ${res.status}`);

      toast('Запись сохранена');
      // после успешного сохранения — обновляем original и edited
      setRecord(processed);
      setEditedRecord(processed);
      setUsedStatusIds(nextHistory);
      router.push('/crm');
    } catch (err) {
      console.error('Ошибка сохранения:', err);
      toast('Ошибка при сохранении');
    } finally {
      setSaving(false);
    }
  };


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



  // 1) Берём статичные колонки из config,
  //    но помечаем их динамическими, если они лежат в newParams
  const staticCols = config.map(col => ({
    ...col,
    isDynamic: Object.prototype.hasOwnProperty.call(editedRecord.newParams, col.field)
  })); 

  // console.log('staticCols', staticCols);

  // 2) Выбираем абсолютно новые динамические колонки,
  //    которые в config ещё не появились
  // const dynamicCols = Object
  //   .keys(editedRecord.newParams)
  //   .filter(field => !config.some(c => c.field === field))
  //   .map(field => ({
  //     field,
  //     label: config.find(c => c.field === field)?.label || field,
  //     isDynamic: true
  //   }));

  // const allCols = [...staticCols, ...dynamicCols];

  // console.log('allCols', dynamicCols);
  // console.log('editedRecord.newParams', editedRecord.newParams);
  //console.log('active = ', record.active);

  const allCols = [...staticCols];

  if (loading) return <Spinner />;

  return (
      <div className="p-4 sm:p-6">

        <h1 className="text-xl sm:text-2xl font-bold mb-4 text-center sm:text-left">
          Консультация клиента – {record?.clientName} |{' '}
          <a
            href={`tel:+${record?.clientPhone}`}
            className="text-blue-600 underline hover:text-blue-800"
          >
            📞 {record?.clientPhone}
          </a>{' '}
          |{' '}
          <label className="inline-flex items-center space-x-2">
            <input
              type="checkbox"
              name="active" 
              checked={editedRecord?.active === true}
              onChange={handleCheckboxChange}
              className="rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className={editedRecord?.active ? 'text-green-600' : 'text-red-600'}>
              {editedRecord?.active ? 'Активна' : 'В архиве'}
            </span>
          </label>
        </h1>

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Левая колонка (данные) */}
          <div className="grid gap-4 w-full lg:w-1/2">
            <h3 className="text-xl sm:text-2xl font-bold mb-4 text-center sm:text-left">Данные:</h3>
            {/* {config.map(col => {
              let value = editedRecord[col.field] ?? '';
              const isDateField = col.type === 'DATE' || col.type === 'DATEONLY'; */}

            {allCols.map(col => {
              // если динамическое — берём из newParams, иначе — из верхнего уровня
              const value = col.isDynamic
                ? editedRecord.newParams[col.field]
                : editedRecord[col.field];

              // console.log("col.field =", col.field)
              // console.log("value =", value)  
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

                      // isEditing ? (
                        <select
                          value={editedRecord.lastTalk || findTechnicName(editedRecord.lastTalk)}
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
                      // ) : (
                        // <input
                        //   type="text"
                        //   value={value || findTechnicName(editedRecord.lastTalk)}
                        //   readOnly
                        //   className="border rounded px-3 py-2 text-sm sm:text-base"
                        // />
                      //)

                  ) : col.field === 'statusId' ? (
                    <select
                      value={editedRecord.statusId}
                      onChange={e => handleChange(col.field, +e.target.value)}
                      className="border rounded px-3 py-2 text-sm sm:text-base"
                    >
                      {[...statuses]
                        .sort((a, b) => a.order - b.order)
                        .map(s => {
                          const statusId = Number(s.id);
                          const isBlocked = usedStatusIds.includes(statusId) && statusId !== Number(editedRecord.statusId);
                          return (
                            <option key={s.id} value={s.id} disabled={isBlocked}>
                              {s.label}{isBlocked ? ' (уже использован)' : ''}
                            </option>
                          );
                        })}
                    </select>
                  ) : ['projectsReadyDate', 'priceAnnouncedDate', 'projesctsFullReady', 'projectsFullReady'].includes(col.field) ? (
                    <div className="flex items-center gap-3">
                      <label className="inline-flex items-center gap-2 text-sm sm:text-base">
                        <input
                          type="checkbox"
                          checked={!!value}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            handleChange(col.field, checked ? new Date().toISOString().split('T')[0] : '', col.isDynamic);
                          }}
                        />
                        <span>{value ? new Date(value).toLocaleDateString() : 'Дата не установлена'}</span>
                      </label>

                      {!!value && (
                        <input
                          type="date"
                          className="border rounded px-3 py-2 text-sm sm:text-base"
                          value={String(value).slice(0, 10)}
                          onChange={(e) => {
                            const newDateYmd = e.target.value;
                            handleChange(col.field, newDateYmd, col.isDynamic);
                          }}
                        />
                      )}

                      {!!value && (
                        <button
                          type="button"
                          onClick={() => handleChange(col.field, '', col.isDynamic)}
                          className="text-sm px-2 py-1 border rounded hover:bg-gray-100"
                          title="Очистить дату"
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
                  ) : col.type === 'DATE' ? (
                    <input
                      type="datetime-local"
                      value={value ? formatToDatetimeLocal(value) : ''}
                      onChange={(e) => handleChange(col.field, e.target.value, col.isDynamic)}
                      className="border rounded px-3 py-2 text-sm sm:text-base"
                    />
                  ) : isDateField ? (
                    <input
                      type="date"
                      value={value ? new Date(value).toISOString().split('T')[0] : ''}
                      onChange={(e) => handleChange(col.field, e.target.value, col.isDynamic)}
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
                  )}
            
                </div>
              );
            })}
          </div>

          {/* Правая колонка (записи разговоров) */}
          <div className="w-full lg:w-1/2 max-h-[600px] overflow-y-auto pr-0 lg:pr-2">
            <h3 className="text-lg sm:text-xl font-bold mb-4 text-center sm:text-left">Записи разговоров:</h3>
            {loadingCalls ? (
              <div className="py-8 flex justify-center">
                <Spinner />
              </div>
            ) : callsError ? (
              <div className="py-8 text-center text-red-500">
                Не удалось загрузить звонки: {callsError}
              </div>
            ) : callHistory.length === 0 ? (
              <div className="py-8 text-center">
                <div className="text-gray-500">
                  Записей разговоров {callsPeriodLabel} не найдено.
                </div>
                {!callsSearchStopped ? (
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => loadCallsPeriod(callsPeriodIndex + 1)}
                      disabled={loadingCalls}
                      className="os-primary-bg text-white px-4 py-2 rounded disabled:opacity-50"
                    >
                      Искать ещё на 6 месяцев раньше
                    </button>
                    <button
                      type="button"
                      onClick={() => setCallsSearchStopped(true)}
                      className="border border-gray-400 px-4 py-2 rounded text-gray-700 hover:bg-gray-100"
                    >
                      Отмена
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-gray-500">
                    Поиск более ранних записей остановлен.
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="mb-3 text-sm text-gray-500">
                  Показаны записи {callsPeriodLabel}.
                </div>
                {[...callHistory]
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .map(call => (
                <div key={call.id} className="border p-3 sm:p-4 rounded shadow-sm text-sm mb-3">
                  <div><b>Дата:</b> {new Date(call.date).toLocaleString('ru-RU')}</div>
                  <div><b>Запись:</b> {call.recordFileName}</div>
                  <div><b>Длительность:</b> {call.callDuration} сек</div>
                  <div><b>Сотрудник:</b> {findEmployee(call)}</div>

                  {/* Кнопки: прослушать и скачать */}
                  <div className="mt-3 flex flex-wrap gap-2 justify-center sm:justify-start">
                    <button
                      onClick={() => setPlayingFile(call.recordFileName)}
                      className="os-primary-bg text-white px-4 py-1.5 rounded text-sm sm:text-base"
                    >
                      ▶️ Прослушать
                    </button>

                    <button
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = `${process.env.NEXT_PUBLIC_API_URL}/calls/record/${encodeURIComponent(call.recordFileName)}`;
                        link.download = ''; // Можно указать имя файла, если нужно: `call.recordFileName`
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      className="bg-green-500 text-white px-4 py-1.5 rounded hover:bg-green-600 text-sm sm:text-base"
                    >
                      ⬇️ Скачать
                    </button>

                  </div>

                  {playingFile === call.recordFileName && (
                    <audio controls className="mt-2 w-full">
                    <source src={`${process.env.NEXT_PUBLIC_API_URL}/calls/record/${encodeURIComponent(call.recordFileName)}`} type="audio/mpeg" />

                      Ваш браузер не поддерживает аудиоплеер.
                    </audio>
                  )}
                </div>
                  ))}
              </>
            )}
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

        <button
          onClick={handleDownloadAll}
          className="os-primary-bg mt-6 text-white px-4 py-2 rounded-lg disabled:opacity-50"
        >
          Скачать все записи
        </button>

</div>

  );
}

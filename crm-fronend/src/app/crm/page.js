'use client';

import { useEffect, useState, useContext, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AuthContext } from "../../context/AuthContext";
import Spinner from "../../components/Spinner";
import { useMask } from '../../components/MaskContext';
import { toast } from 'react-toastify';

const STATUS_HISTORY_KEY = '__statusHistoryIds';

function useIsMobile(breakpoint = 768) {
  const getMatches = () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(`(max-width: ${breakpoint}px), (hover: none) and (pointer: coarse)`).matches;
  };
  const [isMobile, setIsMobile] = useState(getMatches);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint}px), (hover: none) and (pointer: coarse)`);
    const update = () => setIsMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener?.('change', update);
    return () => mediaQuery.removeEventListener?.('change', update);
  }, [breakpoint]);

  return isMobile;
}

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


export default function CRMPage() {
  const DATE_CHECKBOX_FIELDS = ['projectsReadyDate', 'priceAnnouncedDate', 'projesctsFullReady', 'projectsFullReady'];
  const [records, setRecords] = useState([]);
  const [config, setConfig] = useState([]);
  const router = useRouter();
  const [statuses, setStatuses] = useState([]);
  const [searchQuery, setSearchQuery] = useState(""); // Поисковый запрос
  const [sortField, setSortField] = useState('serviceDate');
  const [sortOrder, setSortOrder] = useState('desc');
  const [roles, setRoles] = useState([]);
  const { user } = useContext(AuthContext);
  const [technics, setTechnics] = useState([]); // Список технологов
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isMobile = useIsMobile();
  const { isMasked } = useMask();
  const [filter, setFilter] = useState('active'); // 'active' или 'completed'
  const [errorCount, setErrorCount] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [statusErrors, setStatusErrors] = useState([]);
  const [orderErrors, setOrderErrors] = useState([]);
  const [consultNoCallErrors, setConsultNoCallErrors] = useState([]);
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [commentModalRecordId, setCommentModalRecordId] = useState(null);
  const [commentModalField, setCommentModalField] = useState('comment');
  const [commentModalValue, setCommentModalValue] = useState('');
  const [commentModalSaving, setCommentModalSaving] = useState(false);
  const [expandedMobileRecords, setExpandedMobileRecords] = useState(() => new Set());
  const modalRef = useRef(null);
  const getAuthHeaders = (extra = {}) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    };
  };

  var currentRoleId;
  var cuurentUserId;
  if (user) {
    currentRoleId = user.roleId; // Получаем роль юзера)
    cuurentUserId = user.id; // Получаем id юзера
  } 

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      setError(null);

      try {
        // Параллельно запускаем все fetch
        const [
          recordsRes,
          configRes,
          statusesRes,
          technicsRes,
          rolesRes
        ] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm`),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm-config`),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm-statuses`),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/technics`),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/roles`, { headers: getAuthHeaders() })
        ]);

        // Проверяем статус всех ответов
        if (!recordsRes.ok)     throw new Error(`crm fetch failed: ${recordsRes.status}`);
        if (!configRes.ok)      throw new Error(`crm-config fetch failed: ${configRes.status}`);
        if (!statusesRes.ok)    throw new Error(`crm-statuses fetch failed: ${statusesRes.status}`);
        if (!technicsRes.ok)    throw new Error(`technics fetch failed: ${technicsRes.status}`);
        if (!rolesRes.ok)       throw new Error(`roles fetch failed: ${rolesRes.status}`);

        // Парсим JSON
        const [recordsData, configData, statusesData, technicsData, rolesData] =
          await Promise.all([
            recordsRes.json(),
            configRes.json(),
            statusesRes.json(),
            technicsRes.json(),
            rolesRes.json()
          ]);

        // Сохраняем в стейт
        setRecords(recordsData);
        setConfig(configData);
        setStatuses(statusesData);
        setTechnics(technicsData);
        setRoles(rolesData);

      } catch (err) {
        console.error('Ошибка при загрузке данных:', err);
        setError(err.message || 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchAll();
  }, []);




  // Ошибки: заказы без консультаций
  useEffect(() => {
    const loadOrdersWithoutConsultations = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ordersforcrm`, {
          method: 'GET',
        });

        if (!res.ok) {
          throw new Error("Ошибка загрузки заказов");
        }

        const data = await res.json();

        // console.log('[ordersforcrm] data received:', data);

        const normalizedOrderErrors = (Array.isArray(data.orders) ? data.orders : []).map((order) => ({
          type: 'order_without_consult',
          id: `order-${order.id}`,
          raw: order,
          address: order?.address || order?.data?.param5 || '',
          product: order?.product || order?.data?.param9 || '',
        }));
        const normalizedConsultErrors = (Array.isArray(data.consultErrors) ? data.consultErrors : [])
          .filter((item) => item?.active === true)
          .map((item) => ({
            type: 'accepted_without_calls',
            id: `consult-${item.consultId || item.id}`,
            consultId: item.consultId || item.id,
            raw: item,
            address: item?.address || '',
            product: item?.product || '',
          }));
        setOrderErrors(normalizedOrderErrors);
        setConsultNoCallErrors(normalizedConsultErrors);

      } catch (err) {
        console.error('[ordersforcrm] error:', err);
        setOrderErrors([]);
        setConsultNoCallErrors([]);
      }
    };

    loadOrdersWithoutConsultations();
  }, []); // пустой массив — чтобы не вызывать бесконечно

  // Общий счетчик и список ошибок
  useEffect(() => {
    const merged = [...orderErrors, ...consultNoCallErrors];
    setStatusErrors(merged);
    setErrorCount(merged.length);
  }, [orderErrors, consultNoCallErrors]);



  const handleOrderClick = (id) => {
      router.push(`/order/${id}`); // Переход на страницу заказа по id
  };


  // Для открытия в новой вкладке
  const handleRowAuxClick = (e, orderId) => {
    // 0 — левая, 1 — средняя (колесо), 2 — правая кнопка
    // console.log(e.button);
    if (e.button === 2) {
      e.preventDefault();                 // остановим автоскролл
      window.open(`/order/${orderId}`, '_blank'); // откроем в новой вкладке
    }
  };




  async function handleStatusChange(recordId, newStatusId) {
    const targetRecord = records.find((r) => r.id === recordId);
    if (!targetRecord) return;

    const usedStatusIds = parseStatusHistory(targetRecord);
    if (usedStatusIds.includes(newStatusId) && newStatusId !== Number(targetRecord.statusId)) {
      toast.warn('Этот статус уже был выбран ранее для консультации');
      return;
    }

    const nextHistory = Array.from(new Set([...usedStatusIds, newStatusId]));
    const nextNewParams = {
      ...(targetRecord.newParams || {}),
      [STATUS_HISTORY_KEY]: nextHistory,
    };

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm/${recordId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ statusId: newStatusId, newParams: nextNewParams }),
    });
  
    if (res.ok) {
      // const updated = await res.json();

      // Найдём объект статуса по ID (в списке всех доступных)
      const updatedStatus = statuses.find(s => s.id === newStatusId);

      // Обновим только нужную запись в состоянии
      setRecords(prev =>
        prev.map(record =>
          record.id === recordId
            ? { ...record, statusId: newStatusId, status: updatedStatus, newParams: nextNewParams }
            : record
        )
      );

    } else {
      console.error('Ошибка обновления статуса');
    }
  }

  async function handleRemoveStatusFromHistory(recordId, statusIdToRemove) {
    const targetRecord = records.find((r) => Number(r.id) === Number(recordId));
    if (!targetRecord) return;

    const currentStatusId = Number(targetRecord.statusId);
    const usedStatusIds = parseStatusHistory(targetRecord);
    const nextHistory = usedStatusIds.filter((id) => Number(id) !== Number(statusIdToRemove));
    if (nextHistory.length === usedStatusIds.length) return;

    let nextStatusId = currentStatusId;
    if (currentStatusId === Number(statusIdToRemove)) {
      if (nextHistory.length === 0) {
        toast.warn('Нельзя удалить единственный текущий статус');
        return;
      }
      nextStatusId = Number(nextHistory[nextHistory.length - 1]);
    }

    const nextNewParams = {
      ...(targetRecord.newParams || {}),
      [STATUS_HISTORY_KEY]: nextHistory,
    };

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm/${recordId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ statusId: nextStatusId, newParams: nextNewParams }),
    });

    if (!res.ok) {
      toast.error('Не удалось удалить статус');
      return;
    }

    const updatedStatus = statuses.find((s) => Number(s.id) === Number(nextStatusId));
    setRecords((prev) =>
      prev.map((record) =>
        Number(record.id) === Number(recordId)
          ? { ...record, statusId: nextStatusId, status: updatedStatus, newParams: nextNewParams }
          : record
      )
    );
  }

  const handleDismissAcceptedWithoutCallsError = async (consultId) => {
    const id = Number(consultId);
    if (!Number.isFinite(id) || id <= 0) {
      toast.error("Некорректный ID консультации");
      return;
    }
    const confirmed = typeof window !== 'undefined'
      ? window.confirm('Убрать эту консультацию из ошибок "Заказ принят без звонков"?')
      : true;
    if (!confirmed) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ noCallsAtOrderAccepted: false }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error || 'Не удалось убрать ошибку');
        return;
      }

      setConsultNoCallErrors((prev) => prev.filter((x) => Number(x.consultId) !== id));
      setRecords((prev) =>
        prev.map((r) =>
          Number(r.id) === id ? { ...r, noCallsAtOrderAccepted: false } : r
        )
      );
      toast.success('Ошибка снята');
    } catch (error) {
      console.error('Ошибка при снятии no-calls ошибки:', error);
      toast.error('Ошибка при снятии no-calls ошибки');
    }
  };

  // Функция переключения чекбокса‑даты
  const handleDateToggle = async (recordId, field, currentlyChecked) => {
    // если стоит флажок — убираем (null), иначе ставим текущую дату
    const newValue = currentlyChecked
      ? null
      : new Date().toISOString().split('T')[0]; // yyyy-MM-dd
    const targetRecord = records.find((r) => Number(r.id) === Number(recordId));
    const hasFieldInNewParams = Boolean(targetRecord?.newParams && Object.prototype.hasOwnProperty.call(targetRecord.newParams, field));
    const hasTopLevelField = Boolean(targetRecord && Object.prototype.hasOwnProperty.call(targetRecord, field));
    const shouldUpdateNewParams = hasFieldInNewParams || !hasTopLevelField;

    const payload = shouldUpdateNewParams
      ? {
          newParams: {
            ...(targetRecord?.newParams || {}),
            [field]: newValue,
          },
        }
      : { [field]: newValue };

    // Отправляем на бэкенд
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm/${recordId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error('Ошибка обновления даты', await res.text());
      return;
    }

    // Локально обновляем records
    setRecords(prev =>
      prev.map(r =>
        r.id === recordId
          ? (shouldUpdateNewParams
              ? { ...r, newParams: { ...(r.newParams || {}), [field]: newValue } }
              : { ...r, [field]: newValue })
          : r
      )
    );
  };

  const handleInlineCommentSave = async (recordId, field, value) => {
    const targetRecord = records.find((r) => Number(r.id) === Number(recordId));
    if (!targetRecord) return;

    const nextValue = String(value ?? '');
    const currentValue = String(getCellValue(targetRecord, field, null) ?? '');
    if (nextValue === currentValue) return;

    const hasFieldInNewParams = Boolean(
      targetRecord?.newParams && Object.prototype.hasOwnProperty.call(targetRecord.newParams, field),
    );
    const hasTopLevelField = Boolean(
      targetRecord && Object.prototype.hasOwnProperty.call(targetRecord, field),
    );
    const shouldUpdateNewParams = hasFieldInNewParams || !hasTopLevelField;

    const payload = shouldUpdateNewParams
      ? {
          newParams: {
            ...(targetRecord?.newParams || {}),
            [field]: nextValue,
          },
        }
      : { [field]: nextValue };

    setCommentModalSaving(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/crm/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`save failed: ${res.status}`);

      setRecords((prev) =>
        prev.map((record) =>
          Number(record.id) === Number(recordId)
            ? shouldUpdateNewParams
              ? { ...record, newParams: { ...(record.newParams || {}), [field]: nextValue } }
              : { ...record, [field]: nextValue }
            : record,
        ),
      );
      toast.success('Комментарий сохранен');
    } catch (e) {
      console.error('Ошибка inline сохранения комментария:', e);
      toast.error('Не удалось сохранить комментарий');
    } finally {
      setCommentModalSaving(false);
    }
  };

  const openCommentModal = (recordId, field, currentValue) => {
    setCommentModalRecordId(recordId);
    setCommentModalField(field);
    setCommentModalValue(String(currentValue ?? ''));
    setCommentModalOpen(true);
  };
  

  function formatDateRU(dateStr) {
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  }

  function formatDateTimeRU(dateStr) {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  }
  

  function handleSort(field) {
    if (sortField === field) {
      setSortOrder(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  }


  function getCellValue(record, field, type) {

    let value;
    let parsedNewParams = record?.newParams;

    if (typeof parsedNewParams === 'string') {
      try {
        parsedNewParams = JSON.parse(parsedNewParams);
      } catch {
        parsedNewParams = null;
      }
    }

    if (parsedNewParams && Object.prototype.hasOwnProperty.call(parsedNewParams, field)) {
      value = parsedNewParams[field];
    } else {
      value = record[field];
    }

    // ❗️ОБРАБОТКА: если объект — сериализуем его или возвращаем плейсхолдер
    if (typeof value === 'object' && value !== null) {
      return '[object]'; // или JSON.stringify(value) для отладки
    }


  // console.log('getCellValue', field, type, value);
  
    const normalizedType = String(type || '').toUpperCase();

    // Если это дата — форматируем
    if ((normalizedType === 'DATEONLY') && value) {
      return formatDateRU(value);
    }


    if ((normalizedType === 'DATE') && value) {
      return formatDateTimeRU(value);
    }

    if (normalizedType === 'BOOLEAN') {
      return (value === true || value === 'true' || value === 1 || value === '1') ? '✅' : '❌';
    }
  
    // Специальный случай для clientName
    if (field === 'clientName') {
      return record.clientName || (record.callType !== 'OUTGOING' ? record.calleeName : record.callerName);
    }

    // Специальный случай для lastTalk
    if (field === 'lastTalk' && value) {
      const technicObj = technics?.find(tech => tech.phone === value);
      return value || technicObj?.name || 'Не определено'
    }

    // 👇 обработка статуса
    if (field === 'statusId' && record.status) {
      return {
        label: record.status.label,
        color: record.status.color
      };
    }    
    
    return value ?? '';
  }

  function getRawFieldValue(record, field) {
    let parsedNewParams = record?.newParams;
    if (typeof parsedNewParams === 'string') {
      try {
        parsedNewParams = JSON.parse(parsedNewParams);
      } catch {
        parsedNewParams = null;
      }
    }
    if (parsedNewParams && Object.prototype.hasOwnProperty.call(parsedNewParams, field)) {
      return parsedNewParams[field];
    }
    return record?.[field];
  }

  const activeColumns = config.filter(col => col.active).sort((a, b) => a.order - b.order);

  // console.log('Active columns:', activeColumns);
  // console.log('records:', records);


  // Фильтрация по статусу
  let filteredOnActive = records.filter(record => {
    if (filter === "all") return true; // Показываем все заказы
    return filter === "active" ? record.active === true : record.active === false;
  });



  // Сначала фильтруем заказы если пользователь - Технолог
  const filteredRecordsForTechnic = filteredOnActive.filter((record) => {
    // Если пользователь не технолог – никаких ограничений
    const roleTechnicId = roles.find((role) => role.name === "Технолог")?.id;

    if (currentRoleId !== roleTechnicId) return true;
  
    // Для технолога находим его запись в technics (связываем по userId)
    const currentTechnic = technics.find((tech) => tech.userId === cuurentUserId);
    if (!currentTechnic) return false; // Если не найден, ничего не показываем
  
    // Если technic.viewAllCRM === true, показываем все заказы
    if (currentTechnic.viewAllCRM) return true;
  
    // Иначе показываем только те заказы, где совпадает техник по имени
    return record.technicName === currentTechnic.name;
  });

  // Сортируем
  const filteredRecords = filteredRecordsForTechnic
    .filter(record => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return (
        String(record.clientPhone || '').toLowerCase().includes(query) ||
        String(record.address || '').toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      if (!sortField) return 0;

      if (sortField === 'serviceDate') {
        const rawDateA = getRawFieldValue(a, sortField);
        const rawDateB = getRawFieldValue(b, sortField);
        const dateA = rawDateA ? new Date(rawDateA).getTime() : Number.NaN;
        const dateB = rawDateB ? new Date(rawDateB).getTime() : Number.NaN;
        const validA = Number.isFinite(dateA);
        const validB = Number.isFinite(dateB);
        if (validA !== validB) return validA ? -1 : 1;
        if (!validA) return 0;
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      }


      // Специальная обработка для полей-переключателей (дата / null)
      if (DATE_CHECKBOX_FIELDS.includes(sortField)) {
        const aVal = a[sortField];
        const bVal = b[sortField];

        const aPresent = !!aVal; // true, если дата есть
        const bPresent = !!bVal;

        // Сначала сравниваем наличие даты
        if (aPresent !== bPresent) {
          // При возрастании (asc): пустые (false) идут первыми
          // При убывании (desc): заполненные (true) идут первыми
          let presentCompare = aPresent ? 1 : -1;
          if (sortOrder === 'desc') presentCompare *= -1;
          return presentCompare;
        } else {
          // Оба либо есть, либо нет
          if (aPresent && bPresent) {
            // Оба присутствуют — сравниваем даты
            const dateA = new Date(aVal);
            const dateB = new Date(bVal);
            let dateCompare = dateA - dateB;
            if (sortOrder === 'desc') dateCompare *= -1;
            return dateCompare;
          } else {
            // Оба отсутствуют — равны
            return 0;
          }
        }
      }


      const valA = a[sortField];
      const valB = b[sortField];

      if (valA === undefined || valB === undefined) return 0;

      let compare = 0;

      if (typeof valA === "string") {
        compare = valA.localeCompare(valB);
      } else if (valA instanceof Date || sortField.includes("Date")) {
        compare = new Date(valA) - new Date(valB);
      } else {
        compare = valA > valB ? 1 : valA < valB ? -1 : 0;
      }

      if (sortOrder === "desc") compare *= -1;

      // Лог сортировки
      // console.log(`🔧 primary sort: ${sortField}, order: ${sortOrder}, result: ${compare}`);

      // Вложенная сортировка по requestDate, если сортируем по technicName
      if (sortField === "technicName" && compare === 0) {
        const dateA = new Date(a.requestDate);
        const dateB = new Date(b.requestDate);
        const nestedCompare = dateB - dateA; // по убыванию
        // console.log(`📅 nested sort by requestDate: ${dateA} vs ${dateB} => ${nestedCompare}`);
        return nestedCompare;
      }

      return compare;
    });


    // // Обработчик клика по кнопке "Мой график"
    const handleClick = () => {

      const roleTechnicId = roles.find((role) => role.name === "Технолог")?.id;

      if (currentRoleId !== roleTechnicId) {
        toast.error('Эта функция доступна только для технологов');
        return;
      }

      const currentTechnic = technics.find(t => t.userId === user.id);

      //console.log('Текущий техник:', currentTechnic);

      if (!currentTechnic) {
        toast.error('Не удалось найти технолога для текущего пользователя');
        return;
      }

      router.push(`/crm/calendar/${currentTechnic.id}`);
    };



  if (loading) {return <Spinner />;}
  if (error)   return <div style={{ color: 'red' }}>Ошибка: {error}</div>;

    return (

        <div className="crm-page overflow-auto max-h-[90vh] px-3 pb-3 pt-2 sm:px-4">

          <div className="crm-toolbar mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">

            {/* Кнопки фильтрации и добавления */}
            <div className="crm-primary-controls flex w-full flex-col gap-2 lg:w-1/2">
              <div className="crm-filter-actions grid grid-cols-3 gap-2">
                <button onClick={() => setFilter('active')} className="os-primary-bg h-10 px-4 py-1 text-white rounded leading-none">Активные</button>
                <button onClick={() => setFilter('completed')} className="os-primary-bg h-10 px-4 py-1 text-white rounded leading-none">В архиве</button>
                <button onClick={() => setFilter('all')} className="os-primary-bg h-10 px-4 py-1 text-white rounded leading-none">Все</button>
              </div>
              <div className="crm-create-actions flex items-center gap-2">
                <button onClick={() => router.push('/crm/add')} className="h-10 px-4 py-1 bg-green-500 text-white rounded leading-none">Добавить консультацию</button>
                {/* Кнопка с ошибками */}
                <div className="flex items-center justify-center">
                <button
                  onClick={() => setModalOpen(true)}
                  className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center"
                >
                  {errorCount}
                </button>
                </div>
              </div>
            </div>

            {modalOpen && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
              
              >
                <div className="bg-white rounded-xl p-6 max-w-6xl w-full shadow-lg max-h-[60vh] overflow-y-auto"
                ref={modalRef}>

                  <button
                    onClick={() => setModalOpen(false)}
                    className="absolute top-10 right-3 text-red-500 hover:text-red-700 text-2xl font-bold"
                  >❌</button>

                  <h2 className="text-xl font-bold mb-4">Ошибки консультаций ({errorCount})</h2>

                  <table className="w-full table-auto border border-gray-300 mb-4">
                    <thead>
                      <tr className="bg-gray-100">
                        {!isMobile && <th className="border px-2 py-1 text-left">Тип</th>}
                        <th className="border px-2 py-1 text-left">Адрес</th>
                        <th className="border px-2 py-1 text-left">Изделие</th>
                        <th className="border px-2 py-1 text-left">{isMobile ? 'Заказ' : 'В заказ'}</th>
                        <th className="border px-2 py-1 text-left">{isMobile ? 'График' : 'В график'}</th>
                        <th className="border px-2 py-1 text-left">{isMobile ? 'Созд.' : 'Создать'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statusErrors
                        .slice() // делаем копию, чтобы не мутировать оригинал
                        .sort((a, b) => {
                          const addrA = String(a?.address || '').toLowerCase();
                          const addrB = String(b?.address || '').toLowerCase();
                          return addrA.localeCompare(addrB);
                        })
                      .map(item => (
                        <tr key={item.id}>
                          {!isMobile && (
                            <td className="border px-2 py-1">
                              {item.type === 'order_without_consult' ? (
                                <span className="inline-block rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-semibold">
                                  Без консультации
                                </span>
                              ) : (
                                <span className="inline-block rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs font-semibold">
                                  Заказ принят без звонков
                                </span>
                              )}
                            </td>
                          )}
                          <td className="border px-2 py-1">{item.address}</td>
                          <td className="border px-2 py-1">{item.product}</td>
                          <td className="border px-2 py-1">
                            {item.type === 'order_without_consult' ? (
                              <button
                                onClick={() => handleOrderClick(item.raw.id)}
                                onAuxClick={e => handleRowAuxClick(e, item.raw.id)}
                                className="os-primary-bg text-white px-3 py-1 rounded"
                              >
                                {isMobile ? 'Откр.' : 'перейти'}
                              </button>
                            ) : (
                              <button
                                onClick={() => router.push(`/consult/${item.consultId}`)}
                                className="os-primary-bg text-white px-3 py-1 rounded"
                              >
                                {isMobile ? 'Конс.' : 'консультация'}
                              </button>
                            )}
                          </td>
                          <td className="border px-2 py-1"> 
                            <button
                              onClick={() => {
                                    const adress = item?.address ?? '';
                                    const article = item?.product ?? '';
                                    const search = String(adress + ';' + article);
                                    const installDate = item?.raw?.data?.param15 ?? '';
                                    const dateParam = encodeURIComponent(installDate);
                                    router.push(`/main?search=${encodeURIComponent(search)}&date=${dateParam}`);
                              }} 
                              className="os-primary-bg text-white px-3 py-1 rounded"
                            >
                              {isMobile ? 'Откр.' : 'перейти'}
                            </button>
                          </td>
                          <td className="border px-2 py-1">
                          {item.type === 'order_without_consult' ? (
                            <button
                              onClick={() => {
                                const order = item.raw;
                                const address = order.data?.param5 ?? order.data?.address ?? '';
                                const clientPhone = order.data?.param2 ?? order.data?.clientPhone ?? '';
                                const clientName = order.data?.param1 ?? order.data?.clientName ?? '';
                                const serviceRequired = order.data?.param9 ?? '';
                                const technicId = order.data?.param7 ?? '';
                                const dataPriema = order.data?.param13 ?? '';

                                const params = new URLSearchParams({
                                  fromOrderId: String(order.id),
                                  address: String(address),
                                  clientPhone: String(clientPhone),
                                  clientName: String(clientName),
                                  serviceRequired: String(serviceRequired),
                                  technicId: technicId,
                                  dataPriema: dataPriema,
                                });

                                router.push(`/crm/add?${params.toString()}`);
                              }}
                              className="os-primary-bg text-white px-3 py-1 rounded"
                            >
                              {isMobile ? 'Откр.' : 'перейти'}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDismissAcceptedWithoutCallsError(item.consultId)}
                              className="text-red-600 hover:text-red-800 font-bold text-lg leading-none"
                              title="Убрать из ошибок"
                            >
                              ✖
                            </button>
                          )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}


            {/* Поиск */}
            <div className="crm-search-controls flex w-full flex-col gap-2 lg:w-1/2">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={handleClick} className="os-primary-bg h-10 px-4 py-1 text-white rounded leading-none">Мой график</button>
                <button onClick={() => router.push('/crm/calendar')} className="os-primary-bg h-10 px-4 py-1 text-white rounded leading-none">Общий график</button>
              </div>
                <input
                  type="text"
                  placeholder="Поиск..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="crm-search-input os-primary-ring h-10 w-full px-4 py-1 border border-gray-300 rounded bg-white text-sm leading-none focus:outline-none focus:ring-2"
                />
            </div>
          </div>

            {isMobile ? (
              <div className="crm-mobile-records" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredRecords.length === 0 && (
                  <div style={{ padding: '20px 12px', textAlign: 'center', color: '#6b7280' }}>
                    По выбранному фильтру записей нет
                  </div>
                )}
                {filteredRecords.map(rec => {
                  const recordKey = String(rec.id);
                  const expanded = expandedMobileRecords.has(recordKey);
                  const rawAddress = String(getCellValue(rec, 'address', null) || '').trim();
                  const address = isMasked && rawAddress
                    ? rawAddress.slice(0, 3) + '*'.repeat(Math.max(0, rawAddress.length - 3))
                    : rawAddress;
                  const technicName = String(getCellValue(rec, 'technicName', null) || '').trim();
                  const technicColor = technics.find((technic) => technic.name === rec.technicName)?.color || '';
                  return (
                  <div
                    key={recordKey}
                    className={`crm-mobile-record ${expanded ? 'crm-mobile-record-expanded' : ''}`}
                    style={{
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      overflow: 'hidden',
                      background: '#fff',
                    }}
                  >
                    <button
                      type="button"
                      className="crm-mobile-record-toggle"
                      aria-expanded={expanded}
                      onClick={() => {
                        setExpandedMobileRecords((current) => {
                          const next = new Set(current);
                          if (next.has(recordKey)) next.delete(recordKey);
                          else next.add(recordKey);
                          return next;
                        });
                      }}
                      style={{
                        width: '100%',
                        minHeight: 48,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '10px 12px',
                        border: 0,
                        background: technicColor || '#fff',
                        color: technicColor ? '#fff' : '#111827',
                        textAlign: 'left',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {technicName || 'Технолог не указан'}: {address || 'Адрес не указан'}
                      </span>
                      <span aria-hidden="true" style={{ flexShrink: 0, fontSize: 16, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease' }}>⌄</span>
                    </button>
                    {expanded && (
                    <div
                      className="crm-mobile-record-details"
                      style={{ padding: '10px', borderTop: '1px solid #e5e7eb', cursor: 'pointer' }}
                      onClick={() => router.push(`/consult/${rec.id}`)}
                    >
                    {activeColumns.map(col => {

                      // === Специальные поля с маской ===
                      if (isMasked && ['clientPhone', 'clientName', 'address'].includes(col.field)) {
                        const raw = getCellValue(rec, col.field, col.type);
                        return (
                          <div key={col.field} style={{ marginBottom: '6px' }}>
                            <strong>{col.label}:</strong> {raw.slice(0, 3) + '*'.repeat(raw.length - 3)}
                          </div>
                        );
                      }


                      // === Даты-переключатели ===
                      if (DATE_CHECKBOX_FIELDS.includes(col.field)) {
                        const rawDateValue = getRawFieldValue(rec, col.field);
                        const isChecked = !!rawDateValue;
                        return (
                          <div
                            key={col.field}
                            style={{ marginBottom: '6px', textAlign: 'left', userSelect: 'none' }}
                            onClick={e => {
                              e.stopPropagation();
                              handleDateToggle(rec.id, col.field, isChecked);
                            }}
                          >
                            <strong>{col.label}:</strong>{' '}
                            {isChecked
                              ? `✅ ${new Date(rawDateValue).toLocaleDateString()}`
                              : '❌'}
                          </div>
                        );
                      }

                      // Красим поле техника
                      if (col.field === 'technicName') {
                        const tech = technics.find(t => t.name === rec.technicName);
                        const bg = tech?.color || 'transparent';
                        return (
                          <div
                            key={col.field}
                            style={{
                              marginBottom: '6px',
                              padding: '4px',
                              backgroundColor: bg,
                              borderRadius: '4px',
                              color: '#fff',
                            }}
                          >
                            <strong>{col.label}:</strong> {rec.technicName}
                          </div>
                        );
                      }

                      // === Статус с выпадашкой ===
                      if (col.field === 'statusId') {
                        const currentStatusId = Number(rec.statusId);
                        const usedStatusIds = parseStatusHistory(rec);
                        const funnelStatuses = usedStatusIds
                          .map((sid) => statuses.find((s) => Number(s.id) === Number(sid)))
                          .filter(Boolean);
                        const currentStatus = statuses.find((s) => Number(s.id) === currentStatusId);
                        return (
                          <div
                            key={col.field}
                            style={{
                              marginBottom: '6px',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'stretch',
                              gap: '6px'
                            }}
                          >
                            <strong style={{ whiteSpace: 'nowrap' }}>{col.label}:</strong>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {funnelStatuses.map((st) => (
                                <div
                                  key={`m-status-${rec.id}-${st.id}`}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                    backgroundColor: st.color || '#64748b',
                                    color: '#fff',
                                    borderRadius: 6,
                                    padding: '2px 8px',
                                  }}
                                >
                                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                                    {st.label}
                                    {Number(st.id) === currentStatusId ? ' • текущий' : ''}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveStatusFromHistory(rec.id, Number(st.id));
                                    }}
                                    style={{
                                      border: 'none',
                                      background: 'transparent',
                                      color: '#fff',
                                      cursor: 'pointer',
                                      fontSize: 16,
                                      lineHeight: '16px',
                                      marginLeft: 'auto',
                                      padding: 0,
                                      width: 16,
                                      height: 16,
                                      marginRight: -2,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      transform: 'translateY(-3px)',
                                      marginTop: 5,
                                    }}
                                    title="Удалить статус из воронки"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                            <select
                              value={currentStatusId}
                              onChange={e => {
                                e.stopPropagation();
                                handleStatusChange(rec.id, parseInt(e.target.value, 10));
                              }}
                              onClick={e => e.stopPropagation()}
                              style={{
                                backgroundColor: currentStatus?.color || '#475569',
                                color: '#fff',
                                fontWeight: 'bold',
                                padding: '4px',
                                borderRadius: '4px',
                                flexGrow: 1
                              }}
                            >
                              <option value={currentStatusId}>
                                {currentStatus?.label || 'Текущий статус'}
                              </option>
                              {[...statuses]
                                .sort((a, b) => a.order - b.order)
                                .map(status => {
                                  const statusId = Number(status.id);
                                  if (statusId === currentStatusId) return null;
                                  const isBlocked = usedStatusIds.includes(statusId) && statusId !== currentStatusId;
                                  return (
                                    <option key={status.id} value={status.id} disabled={isBlocked}>
                                      {status.label}{isBlocked ? ' (уже использован)' : ''}
                                    </option>
                                  );
                                })}
                            </select>
                          </div>
                        );
                      }
                      // === Остальные поля ===
                      const raw = getCellValue(rec, col.field, col.type);
                      return (
                        <div key={col.field} style={{ marginBottom: '6px' }}>
                          <strong>{col.label}:</strong> {raw}
                        </div>
                      );
                    })}
                    </div>
                    )}
                  </div>
                  );
                })}
              </div>
            ) : (
          // === привычная таблица для десктопа ===
        <table className="tasks" style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead style={{ position: "sticky", top: 0, backgroundColor: "white", zIndex: 30 }}>
            <tr style={{ whiteSpace: "normal", wordWrap: "break-word" }}>
              {activeColumns.map(col => (
                <th
                  key={col.field}
                  onClick={() => handleSort(col.field)}
                  style={{
                    width: col.width,
                    border: "1px solid #ccc",
                    padding: "8px",
                    cursor: "pointer",
                    backgroundColor: sortField === col.field ? "#f0f0f0" : "white",
                  }}
                >
                  {col.label}
                  {sortField === col.field && (sortOrder === "asc" ? " 🔼" : " 🔽")}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filteredRecords.map(record => (
              <tr key={record.id} onClick={() => router.push(`/consult/${record.id}`)}>
                {activeColumns.map(col => {

                  let cellValue = getCellValue(record, col.field, col.type);

                  // === Специальные поля с маской ===
                  if (isMasked && ['clientPhone', 'clientName', 'address'].includes(col.field)) {

                    return (
                      <td key={col.field} style={{ border: "1px solid #ccc", padding: "8px", wordWrap: "break-word" }}>
                        {cellValue.slice(0, 3) + '*'.repeat(cellValue.length - 3)}
                      </td>
                    );
                  }

                  // Красим поле техника  
                  if (col.field === 'technicName') {
                    const tech = technics.find(t => t.name === record.technicName);
                    const bg = tech?.color || 'transparent';
                    return (
                      <td
                        key={col.field}
                        style={{
                          border: '1px solid #ccc',
                          padding: '8px',
                          backgroundColor: bg,
                          color: '#fff',
                        }}
                      >
                        {record.technicName}
                      </td>
                    );
                  }

                  if (DATE_CHECKBOX_FIELDS.includes(col.field)) {
                    const rawDateValue = getRawFieldValue(record, col.field);
                    const isChecked = !!rawDateValue;
                    return (
                      <td
                        key={col.field}
                        style={{
                          border: "1px solid #ccc",
                          padding: "8px",
                          wordWrap: "break-word",
                          textAlign: "center",      // выравниваем по центру
                          cursor: "pointer",        // чтобы было понятно, что кликабельно
                          userSelect: "none"        // чтобы текст не выделялся при клике
                        }}
                        onClick={e => {
                          e.stopPropagation();      // не уходим внутрь строки
                          handleDateToggle(record.id, col.field, isChecked);
                        }}
                      >
                        {isChecked
                          ? `✅ ${new Date(rawDateValue).toLocaleDateString()}`
                          : '❌'}
                      </td>
                    );
                  }
                  

                  if (col.field === 'statusId' && typeof cellValue === 'object') {
                    const currentStatusId = Number(record.statusId);
                    const usedStatusIds = parseStatusHistory(record);
                    const funnelStatuses = usedStatusIds
                      .map((sid) => statuses.find((s) => Number(s.id) === Number(sid)))
                      .filter(Boolean);
                    const currentStatus = statuses.find((s) => Number(s.id) === currentStatusId);
                    return (
                      <td key={col.field} style={{ border: "1px solid #ccc", padding: "8px" }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                          {funnelStatuses.map((st) => (
                            <div
                              key={`d-status-${record.id}-${st.id}`}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 8,
                                backgroundColor: st.color || '#64748b',
                                color: '#fff',
                                borderRadius: 6,
                                padding: '2px 8px',
                              }}
                            >
                              <span style={{ fontSize: 12, fontWeight: 600 }}>
                                {st.label}
                                {Number(st.id) === currentStatusId ? ' • текущий' : ''}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveStatusFromHistory(record.id, Number(st.id));
                                }}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  color: '#fff',
                                  cursor: 'pointer',
                                  fontSize: 16,
                                  lineHeight: '16px',
                                  marginLeft: 'auto',
                                  padding: 0,
                                  width: 16,
                                  height: 16,
                                  marginRight: -2,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transform: 'translateY(-1px)',
                                }}
                                title="Удалить статус из воронки"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                        <select
                          value={currentStatusId}
                          onChange={e => handleStatusChange(record.id, parseInt(e.target.value))}
                          onClick={e => e.stopPropagation()} // 👈 ВАЖНО: предотвратить всплытие
                          style={{
                            backgroundColor: currentStatus?.color || '#475569',
                            color: "#fff",
                            fontWeight: "bold",
                            padding: "4px",
                            borderRadius: "4px",
                            width: "100%",
                          }}
                        >
                          <option value={currentStatusId}>
                            {currentStatus?.label || 'Текущий статус'}
                          </option>
                          {[...statuses]
                            .sort((a, b) => a.order - b.order)
                            .map(status => {
                              const statusId = Number(status.id);
                              if (statusId === currentStatusId) return null;
                              const isBlocked = usedStatusIds.includes(statusId) && statusId !== currentStatusId;
                              return (
                                <option key={status.id} value={status.id} disabled={isBlocked}>
                                  {status.label}{isBlocked ? ' (уже использован)' : ''}
                                </option>
                              );
                            })}
                        </select>

                      </td>
                    );
                  }

                  if (col.field === 'comment' || /коммент/i.test(String(col.label || ''))) {
                    return (
                      <td
                        key={col.field}
                        style={{ border: "1px solid #ccc", padding: "8px", wordWrap: "break-word", cursor: "text" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openCommentModal(record.id, col.field, cellValue);
                        }}
                        title="Нажмите для редактирования"
                      >
                        <div style={{ whiteSpace: 'pre-wrap' }}>{String(cellValue ?? '')}</div>
                      </td>
                    );
                  }
                  

                  return (
                    <td key={col.field} style={{ border: "1px solid #ccc", padding: "8px", wordWrap: "break-word" }}>
                      {cellValue}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
                )}
      {commentModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] px-4">
          <div className="bg-white rounded-xl p-4 w-full max-w-2xl shadow-lg box-border max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-3">Редактировать комментарий</h3>
            <textarea
              value={commentModalValue}
              onChange={(e) => setCommentModalValue(e.target.value)}
              rows={8}
              className="w-full border border-gray-300 rounded mb-4"
              placeholder="Введите комментарий"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCommentModalOpen(false)}
                className="px-4 py-2 border rounded"
                disabled={commentModalSaving}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!commentModalRecordId) return;
                  await handleInlineCommentSave(commentModalRecordId, commentModalField, commentModalValue);
                  setCommentModalOpen(false);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded"
                disabled={commentModalSaving}
              >
                {commentModalSaving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    );
}



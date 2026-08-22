// // app/orders/page.js

'use client';

// import { console } from 'inspector';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useContext, useRef, useCallback  } from 'react';
import { AuthContext } from "../../context/AuthContext";
import Spinner from "../../components/Spinner";
import { format } from 'date-fns';
import { useMask } from '../../components/MaskContext';
import { toast } from 'react-toastify';

export default function OrdersPage() {
    const [orders, setOrders] = useState([]);
    const [mainModelConfig, setMainModelConfig] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const router = useRouter();
    const [clients, setClients] = useState([]); // Для списка клиентов
    const [installers, setInstallers] = useState([]);
    const [technics, setTechnics] = useState([]); // Список технологов
    const [filter, setFilter] = useState('active'); // 'active' или 'completed'
    const [searchQuery, setSearchQuery] = useState(""); // Поисковый запрос
    const [paylists, setPaylists] = useState([]);
    const { user } = useContext(AuthContext);
    const [accessibleParams, setAccessibleParams] = useState(new Set());
    const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
    const [statusColors, setStatusColors] = useState({});
    const [orderConfig, setOrderlConfig] = useState([]);
    const [roles, setRoles] = useState([]);
    const [errorCount, setErrorCount] = useState(0);
    const [modalOpen, setModalOpen] = useState(false);
    const [statusErrors, setStatusErrors] = useState([]);
    const { isMasked } = useMask();
    const [editedComments, setEditedComments] = useState({});
    const modalRef = useRef(null);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const getAuthHeaders = (extra = {}) => {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extra,
      };
    };

    // console.log("Загруженные заказы:", orders);
    // console.log("Конфигурация MainModel:", mainModelConfig);
    var currentRoleId;
    var cuurentUserId;
    if (user) {
      currentRoleId = user.roleId; // Получаем роль юзера)
      cuurentUserId = user.id; // Получаем id юзера
    } 

    // console.log("currentRoleId = ", currentRoleId);
    // console.log("cuurentUserId = ", cuurentUserId);


    // Пагинация
    const LIMIT = 100; // сколько грузить строк на странице
    const inflightPages = useRef(new Set());
    const pageRef = useRef(1);

    const getCurrentTechnicForServerFilter = useCallback(() => {
      const roleTechnicId = roles.find((role) => role.name === "Технолог")?.id;
      if (currentRoleId !== roleTechnicId) return null;
      const currentTechnic = technics.find((tech) => tech.userId === cuurentUserId);
      if (!currentTechnic || currentTechnic.viewAll) return null;
      return currentTechnic;
    }, [currentRoleId, cuurentUserId, roles, technics]);

    const buildOrdersQuery = useCallback((pageNumber = 1) => {
      const queryParams = new URLSearchParams({
        page: String(pageNumber),
        limit: String(LIMIT),
      });

      if (filter === 'active') queryParams.append('active', 'true');
      else if (filter === 'completed') queryParams.append('active', 'false');
      // для 'all' ничего не добавляем

      const trimmedSearch = searchQuery.trim();
      if (trimmedSearch) queryParams.append('search', trimmedSearch);

      const currentTechnic = getCurrentTechnicForServerFilter();
      if (currentTechnic?.id) queryParams.append('technologistId', String(currentTechnic.id));

      return queryParams.toString();
    }, [filter, getCurrentTechnicForServerFilter, searchQuery]);

    const loadOrders = useCallback(async (pageNumber = 1, reset = false) => {
      if (reset) {
        inflightPages.current.clear();
      } else if (inflightPages.current.has(pageNumber)) {
        return;
      }

      inflightPages.current.add(pageNumber);

      try {
        const query = buildOrdersQuery(pageNumber);
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ordersfororders?${query}`);

        if (!res.ok) throw new Error("Ошибка загрузки заказов");
        const data = await res.json();

        setOrders(prev => {
          if (reset) {
            pageRef.current = pageNumber;
            return data;
          }
          const existingIds = new Set(prev.map(o => o.id));
          const newItems = data.filter(o => !existingIds.has(o.id));
          return [...prev, ...newItems];
        });

        setPage(pageNumber);
        setHasMore(data.length >= LIMIT);
      } catch (err) {
        inflightPages.current.delete(pageNumber);
        console.error('[loadOrders] error:', err);
      }
    }, [buildOrdersQuery]);

    // Перезагружаем первую страницу при смене фильтра или поискового запроса.
    useEffect(() => {
      const timeoutId = setTimeout(() => {
        setPage(1);
        setHasMore(true);
        loadOrders(1, true);
      }, searchQuery.trim() ? 300 : 0);

      return () => clearTimeout(timeoutId);
    }, [loadOrders, searchQuery]);

    // Кнопка "Загрузить ещё"
    const handleLoadMore = () => {
      if (!hasMore) return;
      loadOrders(page + 1, false);
    };


    const handleFilterChange = (newFilter) => {
      setFilter(newFilter);
      setPage(1);
      setHasMore(true);
    };
    // КОНЕЦ БЛОКА - Пагинация




    useEffect(() => {
      const savedSortConfig = localStorage.getItem("orders_sortConfig");
      if (savedSortConfig) {
          setSortConfig(JSON.parse(savedSortConfig));
      }
    }, []);


    // эффект, который будет отслеживать клики вне модального окна
    useEffect(() => {
      const handleClickOutside = (event) => {
        if (modalRef.current && !modalRef.current.contains(event.target)) {
          setModalOpen(false);
        }
      };

      if (modalOpen) {
        document.addEventListener('mousedown', handleClickOutside);
      }

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [modalOpen]);



    // Получаем orderConfigs
    useEffect(() => {
      const fetchOrderConfig = async () => {
        try {

          const orderConfigResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orderConfigs`);
          setOrderlConfig(await orderConfigResponse.json());

      } catch (error) {
        console.error("Ошибка загрузки цветов статусов:", error);
      }
    };
  
    fetchOrderConfig();
  }, []);           


    // Зибираем нужные параметры из OrderConfig для отображения
    let orderConfigParams = orderConfig.filter(item => item.addon_id === 7);

    // Для того чтобы показывать после установщиков
    function insertParamAfter(configList, newParam, afterParamName) {
      const index = configList.findIndex(cfg => cfg.paramName === afterParamName);
      if (index === -1) return [...configList, newParam]; // если не нашли - просто добавим в конец
    
      const before = configList.slice(0, index + 1);
      const after = configList.slice(index + 1);
      return [...before, newParam, ...after];
    }
    


    // Оптимизированный useEffect для загрузки всех данных и только для активных заказов
    useEffect(() => {
      const fetchData = async () => {
        try {
          setLoading(true);

          // 1) Общие справочники
          const [
            configResponse,
            clientsResponse,
            installersResponse,
            technicsResponse,
            paylistsResponse,
            rolesResponse,
            permissionParamsResponse
          ] = await Promise.all([
            fetch(`${process.env.NEXT_PUBLIC_API_URL}/mainModel`),
            fetch(`${process.env.NEXT_PUBLIC_API_URL}/clients`),
            fetch(`${process.env.NEXT_PUBLIC_API_URL}/installers`),
            fetch(`${process.env.NEXT_PUBLIC_API_URL}/technics`),
            fetch(`${process.env.NEXT_PUBLIC_API_URL}/paylists`),
            fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/roles`, { headers: getAuthHeaders() }),
            fetch(`${process.env.NEXT_PUBLIC_API_URL}/role_permissionParams/${currentRoleId}`)
          ]);

          const dataParams = await permissionParamsResponse.json();
          setAccessibleParams(dataParams);

          const configData = await configResponse.json();
          const withOrderNumber = [
            { paramName: "order_number", label: "Номер заказа", type: "string" },
            ...configData
          ];
          const finalConfig = insertParamAfter(
            withOrderNumber,
            { paramName: "param19", label: "Спец.", type: "check_date" },
            "param17"
          );
          setMainModelConfig(finalConfig);

          setClients(await clientsResponse.json());
          setInstallers(await installersResponse.json());
          setTechnics(await technicsResponse.json());
          setPaylists(await paylistsResponse.json());
          setRoles(await rolesResponse.json());
          // Заказы грузятся отдельно через loadOrders(): с фильтром, поиском и пагинацией.

        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }, [currentRoleId]);



    // Загрузка цветов ячеек
    useEffect(() => {
      const fetchStatusColors = async () => {
        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/status-colors`);
          const data = await response.json();
          // Преобразуем массив в объект { "statusName": "color" }
          const colorsMap = {};
          data.forEach(item => {
            colorsMap[item.status] = item.color;
          });
          // console.log("colorsMap = ", colorsMap)
          setStatusColors(colorsMap);
        } catch (error) {
          console.error("Ошибка загрузки цветов статусов:", error);
        }
      };
    
      fetchStatusColors();
    }, []);   
    

    // Получаем цвет для ячейки изделия
    const getStatusColor = (order) => {
      const sd = order.data.statusData || {};
      // Приоритет: от самого «раннего» к самому «позднему»
      const sequence = [
        "reserveInSchedule",
        "orderInstalled",
        "orderPaid",
        "defected",
      ];
    
      // Оставляем только активные
      const activeKeys = sequence.filter(key => {
        const v = sd[key];
        return v !== "" && v != null;
      });
    
      // Берём последний, или возвращаем прозрачный
      const lastKey = activeKeys.length
        ? activeKeys[activeKeys.length - 1]
        : null;
    
      return lastKey ? (statusColors[lastKey] || "transparent") : "transparent";
    };
      
      

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



    // Для выбора из списка
    const getOptions = (source) => {
      if (source === "installers") return installers;
      if (source === "technics") return technics;
      if (source === "clients") return clients;
      if (source === "paylists") return paylists;
      return [];
    };

    // Проверка на ошибки статуса  
    useEffect(() => {

      const statusErrors = [];
      const now = format(new Date(), 'yyyy-MM-dd');

      orders.forEach(order => {
        // Безопасно получаем значения с опциональной цепочкой и значением по умолчанию
        const status = order.data?.statusData?.orderInstalled ?? '';
        const defected = order.data?.statusData?.defected ?? '';
        const installDate = order.data?.param15;
        const endDate = order.data?.endDate;

        // Проверяем, что endDate существует и является строкой
        if (!endDate || typeof endDate !== 'string') {
          return; // пропускаем заказ, если нет даты окончания
        }
        const formatted = endDate.slice(0, 10);

        // Пропускаем, если даты установки нет или статус не пустой (при этом дефектов нет)
        if ((!installDate || status !== '') && defected === '') return;

        // Добавляем в ошибки, если:
        // - дата окончания раньше текущей и статус пустой, ИЛИ
        // - есть дефект (defected не пустая строка)
        if ((formatted < now && status === '') || defected !== '') {
          statusErrors.push(order);
        }
      });

      const errors = statusErrors.length;
      setErrorCount(errors);
      setStatusErrors(statusErrors);

    }, [orders]);


    // Сохраняем коментарий из модалки ошибки статуса  
    const handleSaveComment = async (id) => {
      const newComment = editedComments[id];
    
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ comment2: newComment }),
        });
    
        toast('Комментарий сохранён');
      } catch (error) {
        console.error('Ошибка при сохранении комментария:', error);
        toast('Ошибка при сохранении');
      }
    };
   

    // Сначала фильтруем заказы если пользователь - Технолог
    const filteredOrdersForTechnic = orders.filter((order) => {
      // Если пользователь не технолог – никаких ограничений
      const roleTechnicId = roles.find((role) => role.name === "Технолог")?.id;

      if (currentRoleId !== roleTechnicId) return true;
    
      // Для технолога находим его запись в technics (связываем по userId)
      const currentTechnic = technics.find((tech) => tech.userId === cuurentUserId);
      if (!currentTechnic) return false; // Если не найден, ничего не показываем
    
      // Если technic.viewAll === true, показываем все заказы
      if (currentTechnic.viewAll) return true;
    
      // Иначе показываем только те заказы, где order.data.param7 равен id текущего техника
      return Number(order.data.param7) === currentTechnic.id;
    });

    // Поиск выполняется на сервере до пагинации, чтобы не искать только по уже загруженным строкам.
    const searchFilteredOrders = filteredOrdersForTechnic;
    

    // Фильтрация по статусу
    let filteredOrders = searchFilteredOrders.filter(order => {
      // console.log("status filter value:", filter);
      //       searchFilteredOrders.forEach(o => {
      //   console.log("order", o.data.order_number, "active=", o.active, typeof o.active);
      // });

      if (filter === "all") return true; // Показываем все заказы
      return filter === "active" ? order.active === true : order.active === false;
    });
      

    // 🔹 Функция для обработки клика по заголовку и изменения сортировки
    const handleSort = (key) => {
      setSortConfig((prev) => {
          let direction = "asc";
          if (prev.key === key && prev.direction === "asc") {
              direction = "desc";
          }
          const newSortConfig = { key, direction };
          
          // 🔹 Сохраняем в localStorage
          localStorage.setItem("orders_sortConfig", JSON.stringify(newSortConfig));
  
          return newSortConfig;
      });
    };
  


    // 🔹 Сортировка перед рендером
    if (sortConfig.key) {
      filteredOrders = [...filteredOrders].sort((a, b) => {
          const aValue = a.data?.[sortConfig.key] ?? a[sortConfig.key] ?? "";
          const bValue = b.data?.[sortConfig.key] ?? b[sortConfig.key] ?? "";

          if (typeof aValue === "number" && typeof bValue === "number") {
              return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
          }
          return sortConfig.direction === "asc"
              ? String(aValue).localeCompare(String(bValue), "ru")
              : String(bValue).localeCompare(String(aValue), "ru");
      });
    }
    

    // Выгрузка в Excel
    const handleExport = async () => {

    try {

      // 1. Заголовки (label) — для первой строки Excel
      // const headers = mainModelConfig
      //   .filter(config => accessibleParams.some(p => p.param === config.paramName))
      //   .filter(config => !config.paramName.startsWith('addon')) // исключаем addon*
      //   .map(config => config.label === 'order_number' ? 'Номер заказа' : config.label);
      
      // 2. Ключи (paramName) — реальные ключи
      const keys = mainModelConfig
        .filter(config => accessibleParams.some(p => p.param === config.paramName))
        .filter(config => !config.paramName.startsWith('addon')) // исключаем addon*
        .map(config => config.paramName);
      
      const rows = filteredOrders.map(order => {
        const row = {};
        keys.forEach(key => {
          const config = mainModelConfig.find(cfg => cfg.paramName === key);
          let value = key === 'order_number' ? order[key] : order.data?.[key];

          // console.log('key = ', key)
          // console.log("type of value = ", typeof value)
  
          if (config?.type === 'list' && config.source && value != null) {
            const options = getOptions(config.source);
            const selected = options.find(opt => Number(opt.id) === Number(value));
            value = selected ? selected.name : value; // если нашли объект по id — берем name
          }

          // Если тип число то приводим к числу
          if (config?.type === 'number' && value) {
            value = Number(value)
          }

          // 👉 Добавляем обработку даты
          if (config?.type === 'date' && value) {
            const date = new Date(value);
            if (!isNaN(date)) {
              value = date.toLocaleDateString('ru-RU'); // форматирует в 31.03.2025
            }
          }
  
          row[key] = typeof value === 'boolean' ? (value ? '✅' : '❌') : value || '';
        });
        return row;
      });

      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          headers: keys, // <-- теперь используем настоящие заголовки для первой строки
          orders: rows,
        }),
      });
    
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'orders.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      console.error('Ошибка при экспорте:', error);
    }
  };


    if (loading) {
      return <Spinner />;
    }

    if (error) {
        return <div>Error: {error}</div>;
    }  
    // console.log("accessibleParams", accessibleParams);


    // Блокировка для кнопок
    // if (accessibleParams && typeof accessibleParams[Symbol.iterator] === 'function') {
    //   var canEdit = [...accessibleParams].find(p => p.param === "buttonsInOrders")?.canEdit ?? false;
    // }
    const hasButtonsInOrders = Array.from(accessibleParams).some(p => p.param === "buttonsInOrders");

    // Блокировка для поиска
    const canSearch = Array.from(accessibleParams).some(p => p.param === "searchInOrders");

    // Блокировка для выгрузки
    const hasLoadOrders = Array.from(accessibleParams).some(p => p.param === "loadOrders");
    const loadOrdersParam = Array.from(accessibleParams).find(p => p.param === "loadOrders");
    const canEditLoadOrders = loadOrdersParam?.canEdit ?? false;

    
    // Блокировка для кнопки добавления заказа
    const hasAddOrders = Array.from(accessibleParams).some(p => p.param === "addOrderInOrders");
    const loadAddOrderParam = Array.from(accessibleParams).find(p => p.param === "addOrderInOrders");
    const canEditAddOrder = loadAddOrderParam?.canEdit ?? false;
    const visibleOrderColumns = mainModelConfig.filter(config =>
      !["addon2", "addon3", "addon4"].includes(config.paramName) &&
      Array.from(accessibleParams).some(p => p.param === config.paramName)
    );

    // console.log("orders:", orders);
    // console.log("after technic filter:", filteredOrdersForTechnic);
    // console.log("after search filter:", searchFilteredOrders);
    // console.log("after status filter:", filteredOrders);

    
    
    return (
      <div className="orders-page min-w-0 px-3 pb-3 pt-3 sm:px-4 sm:pt-4">
        {(hasButtonsInOrders || hasLoadOrders || canSearch || hasAddOrders) && (
          <div className="orders-toolbar flex flex-col gap-3 pb-4 sm:flex-row sm:items-start sm:justify-between">
            
            {(hasButtonsInOrders || hasLoadOrders) && (
              <div className="orders-filter-actions flex w-full flex-wrap gap-2 sm:w-auto">
                {hasButtonsInOrders && (
                  <>
                    <button onClick={() => handleFilterChange('active')} disabled={filter === 'active'}>
                      Активные
                    </button>
                    <button onClick={() => handleFilterChange('completed')} disabled={filter === 'completed'}>
                      Завершённые
                    </button>
                    <button onClick={() => handleFilterChange('all')} disabled={filter === 'all'}>
                      Все заказы
                    </button>

                    {/* <button onClick={() => router.push('/orders/add')} disabled={!canEdit}>Добавить заказ</button> */}
                  </>
                )}
    
                {hasLoadOrders && (
                  <button
                    onClick={() => handleExport()}
                    disabled={!canEditLoadOrders}
                    className={`${canEditLoadOrders ? "os-primary-bg text-white" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}
                  >
                    Выгрузка
                  </button>
                )}
              </div>
            )}


            <div className="orders-create-actions flex items-center gap-2">
            {hasAddOrders && (
                <button
                  onClick={() => router.push('/orders/add')}
                  disabled={!canEditAddOrder}
                  className="orders-add-button h-10 flex items-center justify-center"
                >
                  Добавить заказ
                </button>
            )}
            
            {/* Кнопка с ошибками и модальным окном */}
            <div className="flex items-center justify-center">
                <button
                  onClick={() => setModalOpen(true)}
                  className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center"
                >
                  {errorCount}
                </button>
            </div>
            </div>

            {modalOpen && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
              
              >
                <div className="orders-errors-modal relative mx-3 bg-white rounded-xl p-4 sm:p-6 max-w-6xl w-full shadow-lg max-h-[80vh] overflow-auto"
                ref={modalRef}>

                  <button
                    onClick={() => setModalOpen(false)}
                    className="absolute top-10 right-3 text-red-500 hover:text-red-700 text-2xl font-bold"
                  >❌</button>

                  <h2 className="text-xl font-bold mb-4">Ошибки статуса ({errorCount})</h2>

                  <table className="orders-errors-table min-w-[760px] table-auto border border-gray-300 mb-4">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border px-2 py-1 text-left">Адрес</th>
                        <th className="border px-2 py-1 text-left">Изделие</th>
                        <th className="border px-2 py-1 text-left">В заказ</th>
                        <th className="border px-2 py-1 text-left">В график</th>
                        <th className="border px-2 py-1 text-left">Комментарий 2</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statusErrors
                        .slice() // делаем копию, чтобы не мутировать оригинал
                        .sort((a, b) => {
                          const addrA = (a.data.param5 ?? '').toLowerCase();
                          const addrB = (b.data.param5 ?? '').toLowerCase();
                          return addrA.localeCompare(addrB);
                        })
                      .map(order => (
                        <tr key={order.id}>
                          <td className="border px-2 py-1">{order.data.param5}</td>
                          <td className="border px-2 py-1">{order.data.param9}</td>
                          <td className="border px-2 py-1">
                            <button
                              onClick={() => handleOrderClick(order.id)}
                              onAuxClick={e => handleRowAuxClick(e, order.id)}
                              className="os-primary-bg text-white px-3 py-1 rounded"
                            >
                              перейти
                            </button>
                          </td>
                          <td className="border px-2 py-1"> 
                            <button
                              onClick={() => {
                                    const adress = order?.data.param5 ?? '';
                                    const article = order?.data.param9 ?? '';
                                    const search = String(adress + ';' + article);
                                    const installDate = order?.data?.param15 ?? '';
                                    // console.log("order = ", order);
                                    const dateParam = encodeURIComponent(installDate);
                                    router.push(`/main?search=${encodeURIComponent(search)}&date=${dateParam}`);
                              }} 
                              className="os-primary-bg text-white px-3 py-1 rounded"
                            >
                              перейти
                            </button>
                          </td>

                          <td className="border px-2 py-1">
                            <div className="flex items-center gap-2">       
                            <textarea
                              className="flex-1 p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                              type="text"
                              value={editedComments[order.id] ?? order.comment2 ?? ''}
                              onChange={(e) => {
                                setEditedComments(prev => ({
                                  ...prev,
                                  [order.id]: e.target.value
                                }));
                              }}
                              onBlur={() => handleSaveComment(order.id, editedComments[order.id])}
                            />
                            {/* <button
                              onClick={() => handleSaveComment(order.id)}
                              className="bg-green-500 text-white px-2 py-1 rounded ml-2 hover:bg-green-600"
                              type="button"
                              style = {{
                                marginTop: "0px",
                              }}
                            >
                              💾
                            </button> */}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>

                  </table>

                </div>
              </div>
            )}

    
            {canSearch && (
              <div className="orders-search w-full sm:max-w-md">
                <input
                  id="main-search"
                  type="text"
                  data-lcp
                  placeholder="Поиск по номеру заказа, клиенту, адресу..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ padding: "7px 0px 8px 0px", width: "100%", textAlign: "center", display: "block", fontSize: "18px" }}
                />
              </div>
            )}
    
          </div>
        )}
      

    
        {/* Таблица задач */}

            {/* <p className="orders-scroll-hint mb-2 mt-4 text-center text-sm text-gray-500 sm:hidden">
              Проведите по таблице влево или вправо
            </p> */}
            <div className="orders-table-scroll overflow-auto overscroll-contain rounded-lg border border-gray-200" tabIndex={0}>
              <table
                className="tasks orders-table"
                style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}
              >
                <colgroup>
                  {visibleOrderColumns.map(config => (
                      <col
                        key={config.paramName}
                        style={{ width: `${config.width || 60}px` }}
                      />
                    ))}
                </colgroup>
                <thead
                          style={{
                            position: "sticky",
                            top: 0,
                            backgroundColor: "white",
                            zIndex: 30,
                            cursor: "pointer",
                          }}
                  >
                  <tr>
                    {visibleOrderColumns.map(config => (
                        <th
                          key={config.paramName}
                          className={config.label === "Номер заказа" ? "orders-key-column" : ""}
                          onClick={() => handleSort(config.paramName)}
                          style={{
                            border: "1px solid #ccc",
                            padding: "8px",
                            textAlign: "left",
                            cursor: "pointer",
                            visibility: config.width === 0 ? "hidden" : "visible",
                            width: config.width === 0 ? "0px" : `${config.width || 65}px`,
                            whiteSpace: config.width === 0 ? "nowrap" : "normal",
                            overflow: "hidden",
                          }}
                        >
                          {config.label}{" "}
                          {sortConfig.key === config.paramName
                            ? sortConfig.direction === "asc"
                              ? "🔼"
                              : "🔽"
                            : ""}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(order => (
                    <tr
                      key={order.id}
                      onClick={() => handleOrderClick(order.id)}
                      onAuxClick={e => handleRowAuxClick(e, order.id)}
                      style={{ cursor: "pointer" }}
                    >
                      {visibleOrderColumns.map(config => {
                          const value = order.data[config.paramName];

                          let displayValue = value;
                          const source = config?.source;

                          const orderParam19 = orderConfigParams.map(item => ({
                            order_id: item.order_id,
                            value: item.data.param19
                          }));

                          const maskParams = ['param1', 'param2', 'param5'];
                          const maskAll = ['param10', 'param11']

                          if (isMasked && maskParams.includes(config.paramName)) {
                            displayValue = value.slice(0, 3) + '*'.repeat(value.length - 3);
                          } else {
                            displayValue = value;
                          }
                          
                          if (isMasked && maskAll.includes(config.paramName)) {
                            displayValue = '***';
                          }
                          

                          if (config.paramName === "param19") {
                            const orderConfig = orderParam19.find(item => item.order_id === order.id);
                            if (orderConfig) {
                              displayValue = orderConfig.value.checked ? "✅" : "❌";
                            } else {
                              displayValue = "❌";
                            }
                          }
                      

                          // Номер заказа
                          if (config.label === "Номер заказа") {
                            displayValue = order.data[config.paramName] || value;
                          }

                          // Формат даты
                          if ((config.type === "date" || config.type === "date_admin" ) && value) {
                            const date = new Date(value);
                            displayValue = date.toLocaleDateString("ru-RU", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            });
                          }
                          else if (config.type === "many_text_date_admin" && value) {

                            // Если value не массив, превращаем его в пустой массив, чтобы map не падал
                            const entries = Array.isArray(value) ? value : [];

                            displayValue = entries
                              .map((entry) => {
                                // const dateRU = entry.date
                                //   ? new Date(entry.date).toLocaleDateString("ru-RU")
                                //   : "";
                                return `${entry.text}`;
                              })
                              .join("\n");  // или .join(", "); в зависимости от формата, нужен ли перенос строки
                          }
                          // Boolean
                          else if (config.type === "boolean" || config.type === "boolean_admin") {
                            displayValue = value ? "✅" : "❌";
                          }
                          // check_text
                          else if ((config.type === "check_text" || config.type === "check_text_admin"  || config.type === "string_admin") && value) {
                            displayValue = value.checked ? "✅" : "❌";
                          }
                          // list
                          else if (config.type === "list") {
                            const selected = getOptions(source).find(
                              item => Number(item.id) === Number(value)
                            );
                            // получаем название или самое value
                            const name = selected ? selected.name : value;

                            // если колонка в списке маскируемых — применяем маску
                            if (isMasked && maskParams.includes(config.paramName)) {
                              displayValue = name.slice(0, 3) + '*'.repeat(name.length - 3);
                            } else {
                              displayValue = name;
                            }
                          }
                          // addon
                          else if (config.type === "addon") {
                            const orderConfigs = Array.isArray(order.order_config)
                              ? order.order_config
                              : [order.order_config];
                            const matchedConfigs = orderConfigs.filter(
                              oc => Number(oc.addon_id) === Number(source)
                            );

                            if (matchedConfigs.length > 0) {
                              const allMatch =
                                matchedConfigs.every(cfg => {
                                  // console.log("cfg = , " , cfg)
                                  const sameAddon = Number(source) === Number(cfg.addon_id);
                                  return (
                                    (config.paramName === "addon1" &&
                                      sameAddon &&
                                      cfg.data?.param27?.checked === true)
                                    //    ||
                                    // (config.paramName === "addon2" &&
                                    //   sameAddon &&
                                    //   cfg.data?.furn_param8?.checked === true) ||
                                    // (config.paramName === "addon3" &&
                                    //   sameAddon &&
                                    //   cfg.data?.fasad_param8?.checked === true) ||
                                    // (config.paramName === "addon4" &&
                                    //   sameAddon &&
                                    //   cfg.data?.work_param8?.checked === true)
                                  );
                                });

                              if (allMatch) {
                                displayValue = (
                                  <a
                                    href={`/orderConfigs?orderId=${order.id}&addonId=${source}`}
                                    onClick={e => e.stopPropagation()}
                                  >
                                    ✅
                                  </a>
                                );
                              } else {
                                displayValue = (
                                  <svg
                                    className="w-6 h-6 text-green-500"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    style={{ verticalAlign: "-webkit-baseline-middle" }}
                                  >
                                    <rect
                                      x="4"
                                      y="4"
                                      width="14"
                                      height="14"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      fill="none"
                                    />
                                  </svg>
                                );
                              }
                            } else {
                              displayValue = "➖";
                            }
                          }

                          // Подсветка отдельных ячеек «Изделие»
                          const isIzdelieCell = config.label === "Изделие";
                          const bgColor = isIzdelieCell ? getStatusColor(order) : "transparent";

                          return (
                            <td
                              key={config.paramName}
                              className={config.label === "Номер заказа" ? "orders-key-column" : ""}
                              style={{
                                border: "1px solid #ccc",
                                padding: "8px",
                                visibility: config.width === 0 ? "hidden" : "visible",
                                width: config.width === 0 ? "0px" : `${config.width || 60}px`,
                                whiteSpace: config.width === 0 ? "nowrap" : "normal",
                                overflow: "hidden",
                                backgroundColor: bgColor,
                              }}
                            >
                              {displayValue || "❌"}
                            </td>
                          );
                        })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {hasMore && (
                <div style={{ textAlign: "center", padding: "10px" }}>
                  <button onClick={handleLoadMore}>Загрузить ещё</button>
                </div>
              )}
{/* {hasMore && (
  <div style={{ textAlign: "center", padding: "10px" }}>
<button
  onClick={() => {
    const nextPage = page + 1;
    setPage(nextPage);

    // Формируем query с текущим фильтром
    const params: Record<string, string> = { page: nextPage.toString(), limit: LIMIT.toString() };
    if (filter === 'active') params.active = 'true';
    else if (filter === 'completed') params.active = 'false';

    const query = new URLSearchParams(params).toString();
    loadOrdersQuery(query, false);
  }}
>
  Загрузить ещё
</button>
  </div>
)} */}

            </div>
      </div>
    );
    
}



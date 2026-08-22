
'use client';

import React, { useState, useEffect, useRef, useContext, useCallback, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import resourceTimelinePlugin from '@fullcalendar/resource-timeline';
import interactionPlugin from '@fullcalendar/interaction';
import ruLocale from '@fullcalendar/core/locales/ru';
import EventRender from '../../components/EventRender';
import { AuthContext } from "../../context/AuthContext";
import Spinner from "../../components/Spinner";
import { useSearchParams } from "next/navigation";
import { toast } from 'react-toastify';
import { useRouter } from "next/navigation";
import { format } from 'date-fns';
import {
  addCalendarDays,
  formatLocalDateOnly,
  getActiveHolidayDates,
  isWorkingDate,
} from '../../utils/workScheduleDates';


const Calendar = () => {
  const router = useRouter();
  const [events, setEvents] = useState([]);
  const [eventInfos, setEventInfos] = useState([]);
  const [resources, setResources] = useState([]);
  const [orders, setOrders] = useState([]);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [installers, setInstallers] = useState([]);
  const [technics, setTechnics] = useState([]);
  const [statusColors, setStatusColors] = useState({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isModalSimpleOpen, setIsModalSimpleOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [holidayConfigs, setHolidayConfigs] = useState([]);
  const calendarRef = useRef(null);
  const [orderConfigs, setOrderConfigs] = useState([]);
  const [statuses, setStatuses] = useState([]); // Динамические статусы
  const [accessibleParams, setAccessibleParams] = useState(new Set());
  const [paylist, setPaylist] = useState([]);
  const { user } = useContext(AuthContext);
  // const [error, setError] = useState(null);
  const [lastEventState, setLastEventState] = useState(null); // Состояние для отмены последнего перемещения
  const lastEventStateRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState(""); // Поисковый запрос
  const searchTermRef = useRef(searchTerm); // Храним актуальное значение поиска
  const currentIndexRef = useRef(-1); // Текущий индекс найденного события
  const searchResultsRef = useRef([]); // Список найденных событий
  const [simpleEvents, setSimpleEvents] = useState([]);
  const containerRef = useRef(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [attachToOrder, setAttachToOrder] = useState(false);
  const [allEvents, setAllEvents] = useState([]);
  const [multiSelectedOrderIds, setMultiSelectedOrderIds] = useState([]);
  const searchParams = useSearchParams();
  const search = searchParams.get("search") || '';
  const [searchInfo, setSearchInfo] = useState('');
  const [statusErrors, setStatusErrors] = useState([]);
  const [errorCount, setErrorCount] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [roleAccessMonths, setRoleAccessMonths] = useState(null);
  const [editedComments, setEditedComments] = useState({});
  const targetDate = searchParams.get('date');
  const [logs, setLogs] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [mainModelConfig, setMainModelConfig] = useState([]);
  const [eventDisplayConfig, setEventDisplayConfig] = useState([]);
  const adminFieldsChanged = [];
  const adminReasons = {};
  const modalRef = useRef(null);

  // Индексы для рендера событий. Они перестраиваются только при изменении
  // исходного массива, а не при отрисовке каждого отдельного события.
  const ordersById = useMemo(
    () => new Map(orders.map((order) => [String(order.id), order])),
    [orders]
  );

  const orderConfigsByOrderId = useMemo(() => {
    const index = new Map();
    orderConfigs.forEach((orderConfig) => {
      const key = String(orderConfig.order_id);
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(orderConfig);
    });
    return index;
  }, [orderConfigs]);

  const technicsLookupMap = useMemo(
    () => Object.fromEntries(technics.map((technic) => [String(technic.id), technic.name])),
    [technics]
  );

  const eventLookupMap = useMemo(
    () => ({ param7: technicsLookupMap }),
    [technicsLookupMap]
  );


  let currentUserName = '';
  let roleId;
  if (user) {roleId = user.roleId;
    currentUserName = user.name;
  } // Получаем роль юзера)
    

  // Обновляем размеры календаря только при фактическом изменении контейнера.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    let animationFrameId = null;
    const observer = new ResizeObserver(() => {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        calendarRef.current?.getApi().updateSize();
      });
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    };
  }, [loading, loadingEvents]);
  

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


  
  // // Обновляем состояние чекбокса simple
  useEffect(() => {
    if (selectedEvent && selectedEvent.event) {   
      setAttachToOrder(selectedEvent.event.sticky ?? false);
    }
  }, [selectedEvent]);



  useEffect(() => {
    lastEventStateRef.current = lastEventState; // Обновляем ref при изменении lastEventState
  }, [lastEventState]);


  // Проверяем наличие даты в URL и переходим к ней
  useEffect(() => {
    if (calendarRef.current && targetDate) {
      const calendarApi = calendarRef.current.getApi();
      calendarApi.gotoDate(targetDate);
    }
  }, [targetDate]);


  // Загрузка параметров надстроек и доступов
  useEffect(() => {
    const fetchData = async () => {
      try {
        const orderConfigsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orderConfigs`);
        const orderConfigsData = await orderConfigsResponse.json();
        setOrderConfigs(orderConfigsData);
        // console.log("orderConfigsData:", orderConfigsData)

        const permissionParamsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/role_permissionParams/${roleId}`);
        const dataParams = await permissionParamsResponse.json();
        // console.log("dataParams = ", dataParams)
        setAccessibleParams(dataParams); // Сохраняем разрешенные параметры в Set для быстрого поиска

        // Загрузка конфигурации MainModel
        const configResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/mainModel`);
        if (!configResponse.ok) {
          throw new Error("Ошибка при загрузке конфигурации MainModel");
        }
        const configData = await configResponse.json();
        // console.log('configData:', JSON.stringify(configData, null, 2))
        setMainModelConfig(configData);


      } catch {
        // setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [roleId]);
  
  

  // Загрузка параметров для модального окна
  useEffect(() => {
    const fetchEventInfo = async () => {
      try {
        const existingRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/config/eventInfos`);
        let existingData = await existingRes.json();
        // console.log("existingData = ", existingData)
        setEventInfos(existingData);  

        // Загрузка списка типов оплат (paylists)
        const paylistsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/paylists`);
        const paylistsData = await paylistsResponse.json();
        setPaylist(paylistsData);


      } catch {
        // setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchEventInfo();
  }, []);

  
  
  // Загружаем конфигурацию выходных дней из нашего API
  useEffect(() => {    
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/holidays`)
      .then(res => res.json())
      .then(data => setHolidayConfigs(data))
      .catch(err => console.error("Ошибка получения конфигурации выходных:", err));
  }, []);


  // И при изменении holidayConfigs:
  useEffect(() => {
    if (calendarRef.current) {
      setTimeout(() => {
        calendarRef.current.getApi().render();
      }, 0);
    }
  }, [holidayConfigs]);
  

  // Загрузка simple events
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/events`)
      .then((res) => res.json())
      .then((data) => {
        // console.log("Загруженные simple-события:", data);
        setSimpleEvents(data);
      })
      .catch((err) => console.error("Ошибка загрузки simple-событий:", err));
  }, []);
  

  // Загрузка конфигурации и заказов
  useEffect(() => {
    // Загружаем конфигурацию
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/schedule`)
        .then((res) => res.json())
        .then((data) => {
            // console.log('Полученная конфигурация:', data); // Проверяем, что приходит
            setConfig(data); // Загружаем сохраненные настройки
        })
        .catch((error) => console.error('Ошибка загрузки конфигурации:', error));

    // Загружаем заказы
    const fetchOrders = async () => {
        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders`);
            if (response.ok) {
                const ordersResponse = await response.json();
                setOrders(ordersResponse);
                // console.log('ordersResponse:', ordersResponse);
                setLoading(false);
            } else {
                console.error('Error fetching orders');
            }
        } catch (error) {
            console.error('Error fetching orders:', error);
        }
    };

    fetchOrders();
  }, []);


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



  // Загрузка статусов с учетом сортировки по sortOrder
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/statuses`)
      .then((res) => res.json())
      .then((data) => {
        const sortedStatuses = data.sort((a, b) => a.sortOrder - b.sortOrder);
        setStatuses(sortedStatuses.map(status => status.key));
      });
  }, []);


  // console.log("Orders:", orders);
  
  // Получаем цвет
  const getPresentationForStatus = useCallback((orderId) => {
    const activeColor = statusColors.default
    const ownOrder = ordersById.get(String(orderId));
    if (!ownOrder || !ownOrder.data?.statusData) {
      return { statusColor: activeColor, statusFontColor: 'black' };
    }
  
    // Итерируем статусы в обратном порядке – последний активный станет первым найденным
    for (let i = statuses.length - 1; i >= 0; i--) {
      const status = statuses[i];
      // Если статус активен у заказа, возвращаем его цвет
      if (ownOrder.data.statusData[status]) {
        return {
          statusColor: statusColors[status],
          statusFontColor: status === "orderInstalled" ? 'white' : 'black',
        };
      }
    }
    // console.log("statusColors = ", statusColors.default)
  
    // Если ни один статус не активен, возвращаем цвет по умолчанию
    return { statusColor: activeColor, statusFontColor: 'black' };
  }, [ordersById, statusColors, statuses]);
  

  // console.log("statusColors:", statusColors)
  
  // Загрузка установщиков
  useEffect(() => {
    const fetchInstallers = async () => {
        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/installers`);
            const data = await response.json();
            setInstallers(data);
        } catch (error) {
            console.error('Ошибка загрузки установщиков:', error);
        }
    };

    fetchInstallers();
  }, []); // Пустой массив зависимостей → выполняется только один раз при монтировании


  // Загрузка техников (технологов)
  useEffect(() => {
    const fetchTechnics = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/technics`);
        const data = await response.json();
        setTechnics(data);
      } catch (error) {
        console.error('Ошибка загрузки техников:', error);
      }
    };

    fetchTechnics();
  }, []);



  // Проверка на ошибки статуса  
  useEffect(() => {

    const statusErrors = [];
    const now = format(new Date(), 'yyyy-MM-dd');

    orders.forEach(order => {
      const status = order.data?.statusData?.orderInstalled ?? '';
      const defected = order.data?.statusData?.defected ?? '';
      const installDate = order.data?.param15;
      const endDate = order.data?.endDate;

      if (!endDate || typeof endDate !== 'string') {
        return;
      }
      const formatted = endDate.slice(0, 10);

      if ((!installDate || status !== '') && defected === '') return;

      if ((formatted < now && status === '') || defected !== '') {
        statusErrors.push(order);
      }
    });

    const errors = statusErrors.length;
    setErrorCount(errors);
    setStatusErrors(statusErrors);

  }, [orders]);


  //-------------------------   Блок поиска --------------------------//

  // Поиск по запросу в поле поиска
  const handleSearch = useCallback(() => {
    const query = searchTermRef.current.toLowerCase().trim();
    // console.log("handleSearch: query =", query);
    if (!query) return;

    const events = document.querySelectorAll('.fc-timeline-event-harness');
    // console.log("handleSearch: total events count =", events.length);

    let matchedEvents = Array.from(events).filter((eventEl) => {
      // console.log("eventEl = ", eventEl)
      // Пытаемся найти вложенный элемент, где хранится адрес
      const addressElement = eventEl.querySelector('.fc-event-main > div > div');
      const addressText = addressElement ? addressElement.textContent.toLowerCase().trim() : "";
      const contains = addressText.includes(query);
      // console.log("Проверяем событие:", addressText, "содержит query?", contains);
      return contains;
    });
    // console.log("handleSearch: matched events count =", matchedEvents.length);

    setTimeout(() => {
      if (matchedEvents.length > 0) {
        // Прокрутка и подсветка
        matchedEvents.sort((a, b) => a.offsetLeft - b.offsetLeft);
        let newIndex = currentIndexRef.current + 1;
        if (newIndex >= matchedEvents.length) newIndex = 0;
        currentIndexRef.current = newIndex;
    
        const matchedEvent = matchedEvents[newIndex];
        // console.log("Прокручиваем к событию:", matchedEvent);
    
        matchedEvent.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    
        const calendarContainer = document.querySelector('.fc-scroller-harness');
        if (calendarContainer) {
          const eventRect = matchedEvent.getBoundingClientRect();
          const containerRect = calendarContainer.getBoundingClientRect();
          const scrollLeft = matchedEvent.offsetLeft - (containerRect.width / 2) + (eventRect.width / 2);
          
          calendarContainer.scrollTo({ left: scrollLeft, behavior: 'smooth' });
        }
    
        events.forEach((el) => el.style.backgroundColor = '');
        matchedEvent.style.backgroundColor = 'red';
        searchResultsRef.current = matchedEvents;
      } 

      else {
        // console.log("handleSearch: no matched events found for query", query);
        searchResultsRef.current = [];
        currentIndexRef.current = -1;
        setSearchInfo(`Совпадений не найдено`); // setSearchInfo(`Найдено ${matchedEvents.length} событий. Текущее: ${currentIndexRef.current + 1} из ${matchedEvents.length}`);
      }

    }, 500); 
    
      
      // console.log("handleSearchById: прокрутили к найденному элементу");
     
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Если необходимо обнулить индекс при новом поиске, можно передавать true
      handleSearch(false);
    }
  }, [handleSearch]);

  useEffect(() => {
    currentIndexRef.current = 0;
  }, [searchTerm]);

  const maxAttempts = 20;
  const attemptsRef = useRef(0);

  // Поиск по Адресу и изделию 
  const handleSearchById = useCallback((decodedSearch) => {
    const [searchAddress, searchProduct] = decodedSearch
      .split(';')
      .map(item => item.trim().toLowerCase());

  
    if (!calendarRef.current) {
      // console.log("handleSearchById: calendarRef.current ещё не загружен, попытка",attemptsRef.current);
      if (attemptsRef.current >= maxAttempts) {
        //console.log("handleSearchById: Превышено максимальное количество попыток.");
        return;
      }
      attemptsRef.current++;
      setTimeout(() => handleSearchById(decodedSearch), 500);
      return;
    }
  
    // Задержка для перерисовки DOM
    setTimeout(() => {
      const events = document.querySelectorAll('.fc-timeline-event-harness');
      //console.log("handleSearchById: total events count =", events.length);
  
      let matchedEvents = Array.from(events).filter((eventEl) => {
        const addressElement = eventEl.querySelector('.fc-event-main > div > div > div > div:nth-child(1)');
        const productElement = eventEl.querySelector('.fc-event-main > div > div > div > div:nth-child(2)');
  
        const addressText = addressElement ? addressElement.textContent.toLowerCase().trim() : "";
        const productText = productElement ? productElement.textContent.toLowerCase().trim() : "";
  
        // console.log("handleSearchById: Проверка события:", {
        //   addressText,
        //   productText,
        //   searchAddress,
        //   searchProduct,
        // });
  
        const containsAddress = addressText.includes(searchAddress);
        const containsProduct = productText.includes(searchProduct);
  
        // console.log("handleSearchById: containsAddress:", containsAddress, "containsProduct:", containsProduct);
  
        return (containsAddress && containsProduct) || "";
      });
  
      // console.log("handleSearchById: matched events count =", matchedEvents.length);
  
      if (matchedEvents.length > 0) {
        // Сбросим счетчик попыток, если нашли событие
        attemptsRef.current = 0;
        
        matchedEvents.sort((a, b) => a.offsetLeft - b.offsetLeft);
        let newIndex = currentIndexRef.current + 1;
        if (newIndex >= matchedEvents.length) newIndex = 0;
        currentIndexRef.current = newIndex;
  
        const matchedEvent = matchedEvents[newIndex];
        // console.log("Прокручиваем к событию:", matchedEvent);
  
        matchedEvent.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  
        const calendarContainer = document.querySelector('.fc-scroller-harness');
        if (calendarContainer) {
          const eventRect = matchedEvent.getBoundingClientRect();
          const containerRect = calendarContainer.getBoundingClientRect();
          const scrollLeft = matchedEvent.offsetLeft - (containerRect.width / 2) + (eventRect.width / 2);
          
          calendarContainer.scrollTo({ left: scrollLeft, behavior: 'smooth' });
        }
  
        events.forEach((el) => el.style.backgroundColor = '');
        matchedEvent.style.backgroundColor = 'red';
        searchResultsRef.current = matchedEvents;
  
        // console.log("handleSearchById: прокрутили к найденному элементу");
      } else {
        attemptsRef.current++;
        // console.log("handleSearchById: элемент не найден, попытка", attemptsRef.current);
        if (attemptsRef.current >= maxAttempts) {
         // console.log("handleSearchById: Превышено максимальное количество попыток.");
          return;
        }
        setTimeout(() => handleSearchById(decodedSearch), 500);
      }
    }, 500);
  }, [calendarRef, currentIndexRef, searchResultsRef]);
  

  // Для поиска через URL по адресу и изделию
  useEffect(() => {
    if (search) {
      const decodedSearch = decodeURIComponent(search);
      if (decodedSearch) {
        handleSearchById(decodedSearch);
      } else {
        searchTermRef.current = decodedSearch;
        setSearchTerm(decodedSearch);
  
        const waitForEvents = () => {
          const events = document.querySelectorAll('.fc-timeline-event-harness');
          if (events && events.length > 0) {
            handleSearch(true);
          } else {
            setTimeout(waitForEvents, 500);
          }
        };  
        waitForEvents();
      }
    }
  }, [search, handleSearch, handleSearchById]);



  // Для поиска по полю
  useEffect(() => {
    const searchButtonSelector = '.fc-customSearch-button';
  
    const initializeSearchInput = () => {
      const searchButton = document.querySelector(searchButtonSelector);
      const existingInput = document.getElementById('fc-search-input');
      
      if (searchButton && !existingInput) {
        searchButton.innerHTML = `<input type="text" id="fc-search-input" placeholder="Поиск по адресу..." style="width:150px; border:none; outline:none;" />`;
        const searchInput = document.getElementById('fc-search-input');
        if (searchInput) {
          searchInput.value = searchTerm;
          searchInput.addEventListener('input', (e) => {
            setSearchTerm(e.target.value);
            searchTermRef.current = e.target.value;
          });
          searchInput.addEventListener('keydown', handleKeyDown);
        }
      }
    };
  
    // Инициализация поля сразу при рендере
    initializeSearchInput();
  
    // Устанавливаем таймер для периодического восстановления input
    const intervalId = setInterval(() => {
      initializeSearchInput();
    }, 1000);
  
    // MutationObserver для отслеживания изменений в кнопке
    const observer = new MutationObserver(initializeSearchInput);
    const searchButton = document.querySelector(searchButtonSelector);
  
    if (searchButton) {
      observer.observe(searchButton, { childList: true, subtree: true });
    }

    const infoSpan = document.getElementById('fc-search-info');
    if (infoSpan) {
      infoSpan.textContent = searchInfo;
    }
  
    return () => {
      clearInterval(intervalId);
      observer.disconnect();
    };
  }, [searchTerm, handleKeyDown, searchInfo]);
  
  useEffect(() => {
    const infoSpan = document.getElementById('fc-search-info');
    if (infoSpan) {
      infoSpan.textContent = searchInfo;
    }
  }, [searchInfo]);

 //-------------------------   Блок поиска (конец) --------------------------//




  // Старая! Функция (для сборки!) вычисления конечной даты заказа с учетом выходных дней
  function calculateEndDateForSborka(startDateStr, workingDays, workOnWeekendConfig = { holiday: false, saturday: false, sunday: false }, holidays = []) {

    // console.log("startDateStr", startDateStr)
    // console.log("workOnWeekendConfig2 =", workOnWeekendConfig)
    // console.log("workingDays = ", workingDays)

    if (!startDateStr) {
      throw new Error("Дата начала отсутствует!");
    }

    const startDate = new Date(startDateStr);
    if (isNaN(startDate.getTime())) {
      throw new Error("Неверная дата начала: " + startDateStr);
    }
    
    let daysCounted = 0;
    let currentDate = new Date(startDate);
  
    while (daysCounted < workingDays) {
      const currentDateStr = currentDate.toISOString();
      const day = currentDate.getDay();
      
      // Если установщик готов работать в данный день или это не выходной по умолчанию
      let isWorkingDay = true;
      if (day === 6) { // суббота
        isWorkingDay = workOnWeekendConfig.saturday;
      }
      if (day === 0) { // воскресенье
        isWorkingDay = workOnWeekendConfig.sunday;
      }

      // Если есть список праздничных дней, то их тоже можно исключить:
      if (holidays.includes(currentDateStr.split("T")[0])) {
        isWorkingDay = false;
      }

      if (workOnWeekendConfig.holiday === true) {
        isWorkingDay = workOnWeekendConfig.holiday;
      }
      
      // Если это рабочий день, увеличиваем счетчик
      if (isWorkingDay) {
        daysCounted++;
      }
      
      // Если мы еще не достигли требуемого количества рабочих дней, переходим к следующему дню
      if (daysCounted < workingDays) {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }    
    // console.log("Конечная дата:", currentDate.toISOString());    
    return currentDate.toISOString();
  }
  
  // Функция (для ресайза!) вычисления конечной даты заказа с учетом выходных дней
  function calculateEndDateForResize(
    startDateStr,               // строка "YYYY-MM-DD"
    workingDays,
    workOnWeekendConfig = { holiday: false, saturday: false, sunday: false },
    holidays = []
  ) {
    // console.log("▶ calculateEndDate вызвана с:", {
    //   startDateStr,
    //   workingDays,
    //   workOnWeekendConfig,
    //   holidaysCount: holidays.length,
    // });

    if (!startDateStr) {
      throw new Error("Дата начала отсутствует!");
    }

    // Разбираем строку YYYY-MM-DD и создаём дату в UTC 00:00
    const [year, month, day] = startDateStr.split("-").map(Number);
    let currentDate = new Date(Date.UTC(year, month - 1, day));
    // console.log("  → Начинаем с UTC-даты:", currentDate.toISOString().split("T")[0]);

    let daysCounted = 0;

    while (daysCounted < workingDays) {
      const jsDay = currentDate.getUTCDay(); // 0=Sun … 6=Sat в UTC
      const isoDay = currentDate.toISOString().split("T")[0];
      let isWorkingDay = true;

      // Суббота?
      if (jsDay === 6) {
        isWorkingDay = workOnWeekendConfig.saturday;
        //console.log(`    [${isoDay}] Суббота → рабочий?`, isWorkingDay);
      }
      // Воскресенье?
      if (jsDay === 0) {
        isWorkingDay = workOnWeekendConfig.sunday;
        //console.log(`    [${isoDay}] Воскресенье → рабочий?`, isWorkingDay);
      }
      // Праздник?
      if (holidays.includes(isoDay)) {
        const skipHolidayCheck =
          (jsDay === 6 && workOnWeekendConfig.saturday) ||
          (jsDay === 0 && workOnWeekendConfig.sunday);

        // console.log(
        //   `    [${isoDay}] Праздник, но суб/вс разрешены?`, 
        //   skipHolidayCheck
        // );

        if (!skipHolidayCheck) {
          // если это будний праздник и holiday=false — не рабочий
          isWorkingDay = workOnWeekendConfig.holiday;
          // console.log(`    [${isoDay}] Будний праздник → рабочий?`, isWorkingDay);
        }
      }

      // console.log(
      //   `    [${isoDay}] итоговый isWorkingDay =`,
      //   isWorkingDay,
      //   `(дней засчитано: ${daysCounted}/${workingDays})`
      // );

      if (isWorkingDay) {
        daysCounted++;
        // console.log(`      → засчитан день (${daysCounted}/${workingDays})`);
        if (daysCounted >= workingDays) {
          // console.log("  ❏ Достигли нужного количества дней, выходим.");
          break;
        }
      }

      // Переходим к следующему дню в UTC
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      // console.log("      → следующий день:", currentDate.toISOString().split("T")[0]);
    }

    const result = currentDate.toISOString().split("T")[0];
    // console.log("✔ calculateEndDate возвращает:", result);
    return result;
  }

  // Функция (для переноса!) вычисления конечной даты заказа с учетом выходных дней
  function calculateEndDateForDrop(startDateStr, daysCount, workOnWeekendConfig, holidayList) {
    // Генератор последовательных рабочих дат
    function genDates(startDate, count) {
      const result = [];
      let cursor = new Date(startDate);
      cursor.setHours(0,0,0,0);

      while (result.length < count) {
        const dow = cursor.getDay();
        const iso = formatLocalDate(cursor);
        const isHol = holidayList.includes(iso);

        if (isHol && !workOnWeekendConfig.holiday) {
          cursor.setDate(cursor.getDate() + 1);
          continue;
        }
        if (dow === 6 && !workOnWeekendConfig.saturday) {
          cursor.setDate(cursor.getDate() + 1);
          continue;
        }
        if (dow === 0 && !workOnWeekendConfig.sunday) {
          cursor.setDate(cursor.getDate() + 1);
          continue;
        }

        result.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      return result;
    }

    const parts = startDateStr.split('-').map(Number);
    const startDate = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0);
    const workDates = genDates(startDate, daysCount);
    const startIso = formatLocalDate(workDates[0]);
    const last = new Date(workDates[workDates.length - 1]);
    last.setDate(last.getDate() + 1);
    const endIso = formatLocalDate(last);

    return [startIso, endIso];
  }



  // 1) Синхронизация sborkaEndDate в БД
  useEffect(() => {
    // Находим заказы, которые нужно «допилить» в бэке
    const toSync = orders.filter(order =>
      Number(order.data.sborkaDays) > 0 &&
      !order.data.sborkaEndDate // ещё не записана
    );

    if (toSync.length === 0) return;

    async function syncSborkaDates() {
      const updatedOrders = [];

      for (const order of toSync) {
        // Вычисляем дату окончания сборки
        const sEndDate = calculateEndDateForSborka(
          order.data.sborkaDate,
          Number(order.data.sborkaDays),
          order.data.workOnWeekendConfig,
          holidayConfigs.map(h => h.date)
        );

        try {
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/orders/${order.id}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                updatedData: {
                  data: {
                    ...order.data,
                    sborkaEndDate: sEndDate,
                  },
                },
                comment1: order.comment1,
                comment2: order.comment2,
              }),
            }
          );

          if (!response.ok) {
            console.error("Ошибка обновления sborkaEndDate", response.status);
            continue;
          }

          const newOrder = await response.json();
          updatedOrders.push(newOrder);
        } catch (err) {
          console.error("Ошибка PUT sborkaEndDate:", err);
        }
      }

      // Записываем все единоразово
      if (updatedOrders.length > 0) {
        setOrders(prev =>
          prev.map(o => {
            const upd = updatedOrders.find(u => u.id === o.id);
            return upd ? { ...upd, data: upd.data } : o;
          })
        );
      }
    }

    syncSborkaDates();
  }, [orders, holidayConfigs]);



  // 2) Эффект — исключительно подготовка FullCalendar
  useEffect(() => {
    if (orders.length === 0 || !config || installers.length === 0) return;

    // 2.1) Группировка в ресурсы…
    const installersMap = new Map();
    orders.forEach(order => {
      const installerId = String(order.data.param17);
      const instObj = installers.find(i => Number(i.id) === Number(installerId));
      if (instObj?.active && !installersMap.has(installerId)) {
        installersMap.set(installerId, {
          groupId: installerId,
          title: instObj.name,
          order: instObj.order || 0
        });
      }
    });
    const installerGroups = Array.from(installersMap.values())
      .sort((a, b) => a.order - b.order);

    const finalResources = [];
    installerGroups.forEach(group => {
      const base = group.order * 10;
      const inst = installers.find(i => String(i.id) === group.groupId);
      const color = inst?.color || "#fff";

      finalResources.push(
        { id: `${group.groupId}_1`, groupId: group.groupId, title: group.title, subtitle: "Утро", order: base + 1, extendedProps: { color } },
        { id: `${group.groupId}_2`, groupId: group.groupId, title: group.title, subtitle: "День", order: base + 2, extendedProps: { color } },
        { id: `sep_${group.groupId}`, isSeparator: true, order: base + 5 }
      );
    });
    setResources(finalResources);

    // 2.2) Подготовка событий
    const events = [];

    orders.forEach(order => {
      const ts = order.data.timeSlot || 1;
      const resourceId = `${order.data.param17}_${ts}`;
      const orderId = order.id;

      // Фильтрация полей по config
      const filtered = {};
      Object.keys(config).forEach(key => {
        if (config[key]) {
          if (order[key] !== undefined) filtered[key] = order[key];
          else if (order.data?.[key] !== undefined) filtered[key] = order.data[key];
        }
      });

      // Основное событие
      events.push({
        id: orderId,
        title: filtered.param5,
        start: filtered.param15,
        end: order.data.endDate,
        resourceId,
        extendedProps: { order: filtered, id: orderId, comment1: order.comment1, comment2: order.comment2 }
      });

      // Если сборка — рисуем второе событие
      if (Number(order.data.sborkaDays) > 0 && order.data.sborkaEndDate) {
        events.push({
          id: `${orderId}-sborka`,
          title: `${filtered.param5} (сборка)`,
          start: order.data.sborkaDate,
          end: order.data.sborkaEndDate,
          resourceId,
          extendedProps: { order: filtered, isSborka: true },
          classNames: ["sborka-event"],
          orderId: orderId
        });
      }
    });

    setEvents(events);
  }, [orders, config, installers]);



  // Обработчик просмотра заказа при клике
  const handleViewOrder = () => {

    const canEdit = Array.from(accessibleParams).some(p => p.param === "calendar" && p.allowed && p.canEdit);
    if (canEdit) {
    // window.open(`/order/${selectedOrder.id}`, "_blank");
    router.push(`/order/${selectedOrder.id}`)
    setIsModalOpen(false); // Закрываем модальное окно
    } else {toast("Нет доступа")}
  };

  // Для модалки ошибок статуса
  const handleOrderClick = (id) => {
      router.push(`/order/${id}`); // Переход на страницу заказа по id
  };


  // Сохраняем в БД даты начала и конца заказа
  const updateOrderInDB = async (updatedOrder) => {


    // console.log("updatedOrder = ", updatedOrder)

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/${updatedOrder.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updatedData: {
            data: {
              ...updatedOrder.data,
              param15: updatedOrder.data.param15, // Обновляем дату начала
              endDate: updatedOrder.data.endDate, // Обновляем дату конца
              sborkaDate: updatedOrder.data.sborkaDate, // Обновляем дату начала
              sborkaEndDate: updatedOrder.data.sborkaEndDate, // Обновляем дату конца
            },
          },
          comment1: updatedOrder.comment1,
          comment2: updatedOrder.comment2,
        }),
      });

      // console.log(`"endDate =" ${endDate}, "sborkaEndDate =", ${sborkaEndDate}`)
  
      if (response.ok) {
        const newOrderData = await response.json();
  
        setOrders((prevOrders) =>
          prevOrders.map((o) =>
            o.id === newOrderData.id
              ? { ...newOrderData, ...newOrderData.data }
              : o
          )
        );
      } else {
        console.error("Ошибка обновления заказа в БД", response.status);
      }
    } catch (error) {
      console.error("Ошибка при сохранении изменений в БД:", error);
    }
  };

  const getOrderIdFromCalendarEvent = useCallback((calendarEvent) => {
    if (!calendarEvent) return null;
    const raw =
      calendarEvent.extendedProps?.id ??
      calendarEvent.extendedProps?.orderId ??
      (typeof calendarEvent.id === 'string' && calendarEvent.id.endsWith('-sborka')
        ? calendarEvent.id.replace('-sborka', '')
        : calendarEvent.id);
    const idNum = Number(raw);
    return Number.isFinite(idNum) && idNum > 0 ? idNum : null;
  }, []);

  // Общая конфигурация содержимого событий загружается один раз для всего
  // календаря. Раньше одинаковый запрос выполнял каждый EventRender.
  useEffect(() => {
    let isMounted = true;

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/event-config`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        const nextConfig = Array.isArray(data?.[0]?.config) ? data[0].config : [];
        if (isMounted) setEventDisplayConfig(nextConfig);
      })
      .catch((error) => console.error("Ошибка загрузки конфигурации событий:", error));

    return () => {
      isMounted = false;
    };
  }, []);

  const shiftSelectedOrdersByDays = async (days) => {
    if (!Number.isFinite(days) || days === 0) return { movedCount: 0, failedCount: 0 };
    const selectedIds = Array.from(new Set((multiSelectedOrderIds || []).map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)));
    if (!selectedIds.length) return { movedCount: 0, failedCount: 0 };

    const holidayList = holidayConfigs.map((config) => config.date);
    const planned = [];
    let planningFailures = 0;

    selectedIds.forEach((id) => {
      const currentOrder = orders.find((o) => Number(o.id) === Number(id));
      const data = currentOrder?.data;
      const installDays = Number(data?.param16);
      if (!currentOrder || !data?.param15 || !Number.isFinite(installDays) || installDays <= 0) {
        planningFailures += 1;
        return;
      }

      try {
        const requestedInstallStart = formatLocalDateOnly(addCalendarDays(data.param15, days));
        let [installStart, installEnd] = calculateEndDateForDrop(
          requestedInstallStart,
          installDays,
          data.workOnWeekendConfig,
          holidayList
        );

        // Сборка остаётся на месте. Если установка была перенесена на неё,
        // сдвигаем только установку на первый допустимый день после сборки.
        const currentAssemblyEnd = data.sborkaEndDate?.slice(0, 10);
        if (currentAssemblyEnd && currentAssemblyEnd > installStart) {
          [installStart, installEnd] = calculateEndDateForDrop(
            currentAssemblyEnd,
            installDays,
            data.workOnWeekendConfig,
            holidayList
          );
        }

        planned.push({
          id: Number(id),
          order: currentOrder,
          resourceId: `${data.param17}_${data.timeSlot || 1}`,
          install: { start: installStart, end: installEnd, days: installDays },
        });
      } catch (error) {
        planningFailures += 1;
        console.error(`Не удалось рассчитать групповой перенос заказа ${id}:`, error);
      }
    });

    const recalculateInterval = (item, kind, requestedStart) => {
      const interval = item[kind];
      const [start, end] = calculateEndDateForDrop(
        requestedStart,
        interval.days,
        item.order.data.workOnWeekendConfig,
        holidayList
      );
      item[kind] = { ...interval, start, end };
    };

    const resolveSameTypeOverlaps = (kind) => {
      const byResource = new Map();
      planned.forEach((item) => {
        if (!item[kind]) return;
        if (!byResource.has(item.resourceId)) byResource.set(item.resourceId, []);
        byResource.get(item.resourceId).push(item);
      });

      let changed = false;
      byResource.forEach((items) => {
        items.sort((a, b) =>
          a[kind].start.localeCompare(b[kind].start) || a.id - b.id
        );
        let previousEnd = null;
        items.forEach((item) => {
          if (previousEnd && item[kind].start < previousEnd) {
            recalculateInterval(item, kind, previousEnd);
            changed = true;
          }
          previousEnd = item[kind].end;
        });
      });
      return changed;
    };

    // Каскадно раздвигаем только выбранные установки. Сборки не изменяются.
    const maxPasses = Math.max(1, planned.length * 3);
    for (let pass = 0; pass < maxPasses; pass += 1) {
      const changed = resolveSameTypeOverlaps("install");
      if (!changed) break;
    }

    const results = await Promise.allSettled(
      planned.map(async (item) => {
        const updatedData = {
          ...item.order.data,
          param15: item.install.start,
          endDate: item.install.end,
        };

        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/${item.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            updatedData: { data: updatedData },
            comment1: item.order.comment1,
            comment2: item.order.comment2,
          }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
    );

    const savedById = new Map();
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        const savedOrder = result.value;
        savedById.set(Number(planned[index].id), { ...savedOrder, ...savedOrder.data });
      } else {
        console.error(`Ошибка группового сохранения заказа ${planned[index].id}:`, result.reason);
      }
    });

    if (savedById.size) {
      setOrders((prevOrders) =>
        prevOrders.map((order) => savedById.get(Number(order.id)) || order)
      );
    }

    return {
      movedCount: savedById.size,
      failedCount: planningFailures + results.filter((result) => result.status === "rejected").length,
    };
  };
  
  
  // Обработчик перетаскивания события
  const handleEventDrop = async (info) => {

    const canEdit = Array.from(accessibleParams).some(p => p.param === "calendar" && p.allowed && p.canEdit);

    // Проверяем ДОСТУП
    if (!canEdit) {
      info.revert();
      // console.log(" Нет доступа ")
    } else {

      const { event } = info;
      const eventType = event.extendedProps?.type;
      const draggedOrderId = getOrderIdFromCalendarEvent(event);

      // Вспомогательная функция для revert с логгированием
      const revertAndLog = (msg, err) => {
        console.error(msg, err);
        // toast(msg);
        info.revert();
      };

      // Логика для simpleEvents
      if (eventType === "simple") {

        const resourceId = event.getResources()[0]?.id;

        if (!resourceId) {
          revertAndLog("Ошибка: Ресурс не найден.");
          return;
        }

        // Проверка на запрещённый префикс "sep"
        if (resourceId && resourceId.includes("sep")) {
          revertAndLog("Ресурс с префиксом 'sep' недоступен для перемещения.");
          return;
        }


        try {
          const updatedEvent = {
            id: event.id,
            title: event.title,
            start: event.start,
            end: event.end,
            allDay: event.allDay,
            resourceId,
            sticky: event.sticky
          };
    
          // console.log("До обновления simpleEvents:", simpleEvents);
    
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/events/${event.id}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updatedEvent),
            }
          );
    
          if (!res.ok) {
            const errorText = await res.text();
            console.error(
              `Ошибка обновления простого события: ${res.status} - ${errorText}`
            );
            revertAndLog("Ошибка обновления простого события");
            return;
          }
      
            const updatedEventData = await res.json();
        
            setSimpleEvents((prevEvents) =>
              prevEvents.map((ev) => (ev.id === updatedEventData.id ? updatedEventData : ev))
            );
      
          // console.log("После обновления simpleEvents:", simpleEvents);
        } catch (err) {
          console.error("Ошибка обновления simple event:", err);
          revertAndLog("Ошибка обновления simple event");
        }
        return;
      }
    
      // Логика для заказов
      try {
        const selectedIds = (multiSelectedOrderIds || []).map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0);
        const isDraggedFromSelected = draggedOrderId && selectedIds.includes(Number(draggedOrderId));
        const isBatchMove = isDraggedFromSelected && selectedIds.length > 1;

        if (isBatchMove) {
          const oldStartMs = info?.oldEvent?.start ? new Date(info.oldEvent.start).getTime() : NaN;
          const newStartMs = info?.event?.start ? new Date(info.event.start).getTime() : NaN;
          const shiftDays = Number.isFinite(oldStartMs) && Number.isFinite(newStartMs)
            ? Math.round((newStartMs - oldStartMs) / 86400000)
            : Math.round((info?.delta?.milliseconds || 0) / 86400000);
          if (!Number.isFinite(shiftDays) || shiftDays === 0) {
            info.revert();
            return;
          }

          info.revert();
          const result = await shiftSelectedOrdersByDays(shiftDays);
          setMultiSelectedOrderIds([]);
          if (result.failedCount > 0) {
            toast(`Перенесено: ${result.movedCount}. Не удалось перенести: ${result.failedCount}.`);
          } else {
            toast(`Перенесено: ${result.movedCount} событий на ${shiftDays} дн.`);
          }
          return;
        }

        // Установка перемещается отдельно. Даты сборки остаются без изменений.
        if (!event.extendedProps?.isSborka) {
          const currentOrder = orders.find((item) => Number(item.id) === Number(draggedOrderId));
          if (!currentOrder) {
            revertAndLog("Ошибка: заказ для переноса не найден.");
            return;
          }

          const newResourceId = event.getResources()[0]?.id;
          if (!newResourceId || newResourceId.includes("sep")) {
            revertAndLog("Недоступный ресурс для перемещения.");
            return;
          }

          const data = currentOrder.data || {};
          const holidayDates = getActiveHolidayDates(holidayConfigs);
          const legacyHolidayList = holidayConfigs.map((config) => config.date);
          const requestedInstallStart = formatLocalDateOnly(event.start);
          const [installStart, installEnd] = calculateEndDateForDrop(
            requestedInstallStart,
            Number(data.param16),
            data.workOnWeekendConfig,
            legacyHolidayList
          );
          const installInterval = { start: installStart, end: installEnd };

          if (!installInterval) {
            toast("Не удалось рассчитать даты установки.");
            info.revert();
            return;
          }

          let finalInstallInterval = installInterval;

          const currentAssemblyEnd = data.sborkaEndDate?.slice(0, 10);
          if (currentAssemblyEnd && currentAssemblyEnd > finalInstallInterval.start) {
            const [adjustedInstallStart, adjustedInstallEnd] = calculateEndDateForDrop(
              currentAssemblyEnd,
              Number(data.param16),
              data.workOnWeekendConfig,
              legacyHolidayList
            );
            finalInstallInterval = { start: adjustedInstallStart, end: adjustedInstallEnd };
          }

          if (!isWorkingDate(finalInstallInterval.start, data.workOnWeekendConfig, holidayDates)) {
            toast("Установка не может начинаться в нерабочий день.");
            info.revert();
            return;
          }

          const [installerPart, timeSlotPart] = newResourceId.split("_");
          const updatedOrder = {
            ...currentOrder,
            data: {
              ...data,
              param15: finalInstallInterval.start,
              endDate: finalInstallInterval.end,
              param17: Number(installerPart),
              timeSlot: Number(timeSlotPart) || 1,
            },
          };

          try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/${currentOrder.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                updatedData: { data: updatedOrder.data },
                comment1: currentOrder.comment1,
                comment2: currentOrder.comment2,
              }),
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const savedOrder = await response.json();
            setOrders((previous) =>
              previous.map((item) =>
                Number(item.id) === Number(currentOrder.id)
                  ? { ...savedOrder, ...savedOrder.data }
                  : item
              )
            );
            setLastEventState({
              id: currentOrder.id,
              previousData: {
                param15: data.param15,
                endDate: data.endDate,
                param17: data.param17,
                timeSlot: data.timeSlot,
                sborkaDate: data.sborkaDate,
                sborkaEndDate: data.sborkaEndDate,
              },
            });
          } catch (error) {
            revertAndLog("Ошибка сохранения переноса заказа.", error);
          }
          return;
        }

        {

          const order = event.extendedProps.order;
          const orderId = event.extendedProps.id || event.extendedProps.orderId;

          // console.log("order = ", order)
          // console.log("orderId = ", orderId)
          
          // Находим текущий заказ из state orders
          const currentOrder = orders.find(o => o.id === orderId) || order;
          
          // console.log("currentOrder = ", currentOrder)
          // console.log("currentOrder.data.timeSlot = ", currentOrder.data.timeSlot)

          // Находим текущий ресурс
          const orderResource = `${currentOrder.data.param17}_${currentOrder.data.timeSlot}`;
          // Берем дату начала
          const oldDateStart = new Date(currentOrder.data.param15).toISOString().split("T")[0];
          // Берем дату конца
          const oldDateEnd = currentOrder.data.endDate.split("T")[0];

          // console.log("orderResource передаем = ", orderResource)

          // Проверяем simple event в этих промежутках и в этом ресурсе
          const simpleEvent = checkHereSimple(orderResource, oldDateStart, oldDateEnd)
          // console.log("simpleEvent = ", simpleEvent) 


          
          // Сохраняем предыдущее состояние для возможности Undo
          if (!lastEventState) {
            setLastEventState({
              id: orderId,
              previousData: {
                param15: currentOrder.data.param15,
                endDate: currentOrder.data.endDate,
                param17: currentOrder.data.param17,
                timeSlot: currentOrder.data.timeSlot,
                sborkaDate: currentOrder.data.sborkaDate,
                sborkaEndDate: currentOrder.data.sborkaEndDate
              },
            });
          }
          
          // Рассчитываем новую дату начала
          const newStart = formatLocalDateOnly(event.start);
          
          // Проверяем, является ли новая дата праздничным днём и корректно ли установлено время
          const activeHolidayDates = getActiveHolidayDates(holidayConfigs);
          if (!isWorkingDate(newStart, currentOrder.data.workOnWeekendConfig, activeHolidayDates)) {
            toast("Нельзя начинать заказ в нерабочий день!");
            info.revert();
            return;
          }

          if (event.extendedProps?.isSborka) {
            const [proposedAssemblyStart, proposedAssemblyEnd] = calculateEndDateForDrop(
              newStart,
              Number(currentOrder.data.sborkaDays),
              currentOrder.data.workOnWeekendConfig,
              holidayConfigs.map((config) => config.date)
            );
            if (!proposedAssemblyStart || proposedAssemblyEnd > String(currentOrder.data.param15).slice(0, 10)) {
              toast("Сборка не может пересекаться с установкой.");
              info.revert();
              return;
            }
          }
          
          // Определяем новый timeSlot на основе ресурсов
          const newResources = event.getResources();
          const newResourceId = newResources.length > 0 ? newResources[0].id : null;

          // Проверка на запрещённый префикс "sep"
          if (newResourceId && newResourceId.includes("sep")) {
            revertAndLog("Ресурс с префиксом 'sep' недоступен для перемещения.");
            return;
          }

          const newTimeSlot = newResourceId && newResourceId.includes("_") 
            ? Number(newResourceId.split("_")[1]) 
            : 1;
          
          const installerId = (order.data && order.data.param17) || order.param17 || currentOrder.param17;

          // Если это сборка
          const sborka = event.extendedProps?.isSborka

          // console.log("sborka = ", sborka)
          
          // Формируем payload для обновления заказа
          const payload = {
            updatedData: {
              data: {
                ...(order.data || {}),
                ...(sborka
                  ? { sborkaDate: newStart }
                  : { param15: newStart }
                ),
                param17: installerId || "",
                timeSlot: newTimeSlot,
              },
            },
            comment1: currentOrder.comment1,
            comment2: currentOrder.comment2,
          };
          
          // Присваиваем значения timeSlot и param17 на основании newResourceId
          payload.updatedData.data.timeSlot = newResourceId
            ? Number(newResourceId.split("_")[1]) 
            : 1;  
          payload.updatedData.data.param17 = newResourceId
            ? Number(newResourceId.split("_")[0]) 
            : 0;

          // console.log("payload =", payload)  
          
          // Отправляем обновление заказа на сервер
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/${orderId}`, {
            method: 'PUT',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          
          if (!response.ok) {
            revertAndLog("Ошибка обновления заказа", response.status);
            return;
          } else {
            // Сохраняем инфо в логи


            // Проверяем тип полей параметров для логирования нужных
            mainModelConfig.forEach(field => {
              const key = field.paramName; // например, "mainTest", "param15", "param17" и т.д.
              const oldVal = currentOrder.data[key];
              const newVal = payload.updatedData.data[key];

              let changed = false;

              if (key === 'param15' || key === 'param17') {
                // Сравниваем "старое" и "новое" напрямую, приводим undefined→''
                const oldSimple = oldVal == null ? '' : String(oldVal);
                const newSimple = newVal == null ? '' : String(newVal);
                if (oldSimple !== newSimple) {
                  changed = true;
                }
              }

              // Если нашли изменение, сохраняем саму конфигурацию field в массив
              if (changed) {
                adminFieldsChanged.push(field);
              }
            });


            // Модальное окно для ввода причины изменения
            function showModalAndAskReason(fieldLabel) {

              return new Promise((resolve) => {
                const message = `Внесите причину изменения поля "${fieldLabel}":`;
                const reason = window.prompt(message);
                if (reason && reason.trim() !== "") {
                  resolve(reason.trim());
                } else {
                  resolve(null);  // пользователь отменил или ввел пустую строку
                }
              });
            }

            // Сохраняем причину изменений
            for (const field of adminFieldsChanged) {
              const reason = await showModalAndAskReason(field.label); // модальное окно с вводом
              if (!reason) {
                adminReasons[field.paramName] = "(причина не указана)";
                continue; // переход к следующему полю           
              }

              adminReasons[field.paramName] = reason;

              await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orderLogs`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  order_id: currentOrder.id,
                  action: `Изменение поля "${field.label}". Причина: ${reason}`,
                  user: currentUserName,
                  timestamp: new Date().toISOString(),
                }),
              });
            }
          }
          
          // Обновляем заказ в state
          const updatedOrder = await response.json();
          const mergedOrder = {
            ...updatedOrder,
            ...updatedOrder.data,
            comment1: currentOrder.comment1,
            comment2: currentOrder.comment2,
          };
          
          setOrders((prevOrders) =>
            prevOrders.map(o => o.id === mergedOrder.id ? mergedOrder : o)
          );
          

          // Ключи в объекте data
          const startKey = sborka ? 'sborkaDate' : 'param15';
          const daysKey  = sborka ? 'sborkaDays' : 'param16';
          const endKey   = sborka ? 'sborkaEndDate' : 'endDate';

          // Получаем старые данные
          const data = mergedOrder.data;
          const daysCount = Number(data[daysKey]);

          // Новая дата старта в формате YYYY-MM-DD
          const newStartIso = formatLocalDate(new Date(event.start));

          // Вычисляем новый спан
          const [startIso, endIso] = calculateEndDateForDrop(
            newStartIso,
            daysCount,
            data.workOnWeekendConfig,
            holidayConfigs.map(cfg => cfg.date)
          );

          // Записываем в data
          data[startKey] = startIso;
          data[endKey]   = endIso;


          // Собираем payload — обновляем только те поля, которые менялись
          const dataToUpdate = {
            ...(mergedOrder.data),
            // для обычного: param15 + endDate
            // для sborka: sborkaDate + sborkaEndDate
            ...(sborka
              ? {
                  sborkaDate:    mergedOrder.data.sborkaDate,
                  sborkaEndDate: mergedOrder.data.sborkaEndDate,
                }
              : {
                  param15: mergedOrder.data.param15,
                  endDate: mergedOrder.data.endDate,
                }
            ),
          };

          await updateOrderInDB({
            id:   mergedOrder.id,
            data: dataToUpdate,
          });


          // Итак если есть simple и у него статус true
          if (simpleEvent && simpleEvent.sticky === true) {

            // Вычисляем длину simple в днях
            const perSimpleEvent = (new Date(simpleEvent.end) - new Date(simpleEvent.start)) / (1000 * 3600 * 24);
            // console.log("perSimpleEvent = ", perSimpleEvent)

            // Значит нужно его тоже переместить
            const startNewDate = new Date(mergedOrder.data.param15)
            const startOldDate = new Date(currentOrder.data.param15)
            const deltaDate = (startNewDate - startOldDate) / 86400000

            const newStartSimple = new Date(simpleEvent.start)
            newStartSimple.setDate(newStartSimple.getDate() + deltaDate);

            // Дату конца вычисляем как дата начало + сколько дней была длительность
            const newEndSimple = new Date(newStartSimple)
            newEndSimple.setDate(newEndSimple.getDate() + perSimpleEvent);

            // const newEndSimple = new Date(simpleEvent.end)
            // newEndSimple.setDate(newEndSimple.getDate() + deltaDate);

            // console.log("newStartSimple = ", newStartSimple)
            // console.log("newEndSimple = ", newEndSimple)

            // Берем ресурс измененного заказа
            const resourceSimple = `${mergedOrder.data.param17}_${mergedOrder.data.timeSlot}`
            // console.log("resourceSimple = ", resourceSimple)

            // Обновляем simple
            try {
              const updatedSimpleEvent = {
                id: simpleEvent.id,
                start: newStartSimple,
                end: newEndSimple,
                resourceId: resourceSimple,
                sticky: simpleEvent.sticky, 
              };
          
              // console.log("До обновления simpleEvents:", simpleEvents);
          
              const res = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/events/${simpleEvent.id}`,
                {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(updatedSimpleEvent),
                }
              );
          
              if (!res.ok) {
                const errorText = await res.text();
                console.error(
                  `Ошибка обновления простого события: ${res.status} - ${errorText}`
                );
                revertAndLog("Ошибка обновления простого события");
                return;
              }
          
              const updatedSimpleEventData = await res.json();
          
              setSimpleEvents((prevEvents) =>
                prevEvents.map((ev) => (ev.id === updatedSimpleEventData.id ? updatedSimpleEventData : ev))
              );
          
              // console.log("После обновления simpleEvents:", simpleEvents);
            } catch {
              // console.error("Ошибка обновления simple event:", err);
              revertAndLog("Ошибка обновления simple event");
            }

            return;
          }
          
          // Обновляем события в FullCalendar state (setEvents)
          setEvents((prevEvents) => {
            // console.log("prevEvents перед обновлением:", prevEvents);
            
            return prevEvents.map((ev) => {
              if (ev.id === mergedOrder.id) {
                if (ev.extendedProps?.type === "simple") {
                  // console.warn("Пропускаем обновление simple-события:", ev);
                  return ev; // не изменяем simple-события
                }

                // // Определяем поля дат
                // const startDate = sborka
                //   ? mergedOrder.data.sborkaDate
                //   : mergedOrder.data.param15;

                // const endDate = sborka
                //   ? mergedOrder.data.sborkaEndDate
                //   : mergedOrder.data.endDate;
          
                // console.log("Обновляем событие:", ev);
                // console.log(`"startDate = " ${startDate}, "endDate = " ${endDate}`)
                return {
                  ...ev,
                  start: startIso,
                  end: endIso,
                  resourceIds: [`${mergedOrder.data.param17}_${mergedOrder.data.timeSlot}`],
                  extendedProps: { order: mergedOrder },
                };
              } else {
                return ev;
              }
            });
          });
        }
        
      } catch (error) {
        revertAndLog("Ошибка при сохранении изменений:", error);
      }
    
  }  
};


// Функция проверки нахождения simple event вместе с заказом
function checkHereSimple(orderResource, oldDateStart, oldDateEnd) {

    const res = simpleEvents.filter(event => {

      // console.log("event.start = ", event.start)
      // console.log("event.end = ", event.end)
      // console.log("event.sticky = ", event.sticky)
      // console.log("sticky attachToOrder = ", attachToOrder)

      const eventStartDate = new Date(event.start)  
      eventStartDate.setDate(eventStartDate.getDate() + 1); // Включать только для сервака !!!
      const eventStartDateUTC = new Date(eventStartDate).toISOString(); 

      const eventEndDate = new Date(event.end)
      // eventEndDate.setDate(eventEndDate.getDate() - 1); // ВЫключать только для сервака !!!
      const eventEndDateUTC = new Date(eventEndDate).toISOString(); 
      // console.log("eventStartDateUTC =", eventStartDateUTC);

      const eventStartStr = eventStartDateUTC.split("T")[0]; // Обрезаем до "YYYY-MM-DD"
      const eventEndStr = eventEndDateUTC.split("T")[0]; // Обрезаем "YYYY-MM-DD" у конца

      // console.log("oldDateStart с базы =", oldDateStart);
      // console.log("oldDateEnd с базы =", oldDateEnd);
      // console.log("eventStartStr = ", eventStartStr)
      // console.log("eventEndStr = ", eventEndStr)
      // console.log("orderResource с базы= ", orderResource)
      // console.log("event.resourceId = ", event.resourceId)
  
      return eventStartStr >= oldDateStart && eventEndStr <= oldDateEnd &&
             String(event.resourceId) === String(orderResource);
    });
    return res[0]
}



  // Функция удаления simple
  const destroySimple = async (info) => {

      // console.log("info =", info)

      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/events/${info.event.id}`, {
        method: "DELETE",
      })
        .then((res) => {
          if (res.ok) {
            // Получаем доступ к календарю через реф
            const calendarApi = calendarRef.current?.getApi();

            if (calendarApi) {
              const event = calendarApi.getEventById(info.event.id);
              if (event) {
                event.remove(); // Удаляем событие из календаря
              }
            }
            setSimpleEvents((prevEvents) =>
              prevEvents.filter((ev) => String(ev.id) !== String(info.event.id))
            );
          } else {
            toast("Ошибка при удалении события");
          }
        })
        .catch((err) => {
          console.error("Ошибка при удалении:", err);
          toast("Ошибка при удалении события");
        });
        
      setIsModalSimpleOpen(false)  
  }


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



  // Обработчик изменения чекбокса в simple
  const handleCheckboxChange = async () => {
    if (!selectedEvent?.event?.id) {
      console.error("Ошибка: ID события отсутствует!");
      return;
    }

    // console.log("Меняем чеекбокс!")
  
    try {
      const newSticky = !attachToOrder;
  
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/events/${selectedEvent.event.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sticky: newSticky }),
      });
  
      if (!response.ok) {
        throw new Error("Ошибка обновления");
      }
  
      // console.log("Состояние успешно обновлено!");
  
      // 🔹 Обновляем состояние
      setAttachToOrder(newSticky);
  
      // 🔹 Пробуем получить событие из FullCalendar и обновить его
      const calendarApi = calendarRef.current?.getApi();
      const fullCalendarEvent = calendarApi?.getEventById(selectedEvent.event.id);
  
      if (fullCalendarEvent) {
        fullCalendarEvent.setExtendedProp("sticky", newSticky);
      } else {
        console.error("Ошибка: событие не найдено в FullCalendar!");
      }
    } catch (error) {
      console.error("Ошибка сохранения чекбокса:", error);
    } finally {
      setIsModalSimpleOpen(false);
      // console.log("Проверяем чекбокс! = ", newSticky)
    }


      // Обновляем состояние для simple
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/events`)
        .then((res) => res.json())
        .then((data) => {
          // console.log("Загруженные simple-события:", data);
          setSimpleEvents(data);
        })
        .catch((err) => console.error("Ошибка загрузки simple-событий:", err));
  };
  
  


  // Функция модального окна для simple
  function MySimpleModal({ isOpen, onClose, eventData, attachToOrder }) {
    if (!isOpen) return null;

    // console.log("eventData  = ", eventData.event.id)

    return (
      <div className="modal">
      <div className="modal-content">
        <h3>Операции с событием</h3>

        {/* Чекбокс с описанием */}
        <div style={{ marginBottom: "10px" }}>
          <label>
            <input
              type="checkbox"
              checked={attachToOrder}              
              onChange={(e) => handleCheckboxChange(e.target.checked)}
            />{" "}
            Прикрепить к заказу
          </label>          
        </div>

        <div style={{ marginTop: "20px" }}>
          <button onClick={() => destroySimple(eventData)} style={{ marginLeft: "10px" }}>
            Удалить
          </button>
          <button onClick={onClose} style={{ marginLeft: "10px" }}>
            Отмена
          </button>
        </div>
      </div>
      </div>
    );  
  }



  // Функция для отмены последнего перемещения
  const undoLastMove = async () => {
    // console.log("Выполняем отмену перемещения");
    if (!lastEventState) {
      // console.log("Нет сохраненного состояния");
      return;
    }
  
    const { id, previousData } = lastEventState;
    // console.log(`Идентификатор: ${id}, Данные для отката:`, previousData);
  
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/${id}`, {
        method: 'PUT',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updatedData: { data: previousData },
        }),
      });
  
      if (response.ok) {
        // console.log("Успех! Данные успешно обновлены.");
        const restoredOrder = await response.json();
  
        // Обновляем состояние заказов
        setOrders((prevOrders) =>
          prevOrders.map(o => o.id === restoredOrder.id ? restoredOrder : o)
        );
  
        // Обновляем события в календаре
        setEvents((prevEvents) =>
          prevEvents.map((ev) =>
            ev.id === restoredOrder.id
              ? {
                  ...ev,
                  start: restoredOrder.data.param15,
                  end: restoredOrder.data.endDate,
                  resourceIds: [`${restoredOrder.data.param17}_${restoredOrder.data.timeSlot}`],
                  extendedProps: { order: restoredOrder },
                }
              : ev
          )
        );
  
        // console.log("Перемещение отменено");
      } else {
        console.error("Ошибка отката изменений", response.status);
      }
    } catch (error) {
      console.error("Ошибка при откате изменений:", error);
    }
  
    setLastEventState(null); // Сбрасываем сохраненное состояние после отката
  };


  // приводим дату к нужному формату
  const formatLocalDate = (date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }



  // Обработчик изменения длительности заказа
  const handleEventResize = async (info) => {

    const canEdit = Array.from(accessibleParams).some(p => p.param === "calendar" && p.allowed && p.canEdit);

    // console.log("canEdit = ", canEdit)

    // Проверяем ДОСТУП
    if (!canEdit) {
      info.revert();
    } else {

      const { event } = info;

      // Проверяем тип события из extendedProps
      const eventType = info.event.extendedProps?.type;
    
      if (eventType === 'simple') {


        try {
          // Простая логика для изменения длительности simple events:
          const updatedEvent = {
            id: info.event.id,
            start: info.event.start,
            end: info.event.end,
            allDay: info.event.allDay,
          };
          
      
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/events/${info.event.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedEvent),
          })
      
          if (!res.ok) {
            const errorText = await res.text();
            console.error(
              `Ошибка обновления простого события: ${res.status} - ${errorText}`
            );
            revertAndLog("Ошибка обновления простого события");
            return;
          }
      
          const updatedEventData = await res.json();
      
          setSimpleEvents((prevEvents) =>
            prevEvents.map((ev) => (ev.id === updatedEventData.id ? updatedEventData : ev))
          );
      
          // console.log("После обновления simpleEvents:", simpleEvents);
        } catch (err) {
          console.error("Ошибка обновления simple event:", err);
          revertAndLog("Ошибка обновления simple event");
        }

        return;







        // // Простая логика для изменения длительности simple events:
        // const updatedEvent = {
        //   id: info.event.id,
        //   start: info.event.start,
        //   end: info.event.end,
        //   allDay: info.event.allDay,
        // };
    
        // fetch(`${process.env.NEXT_PUBLIC_API_URL}/events/${info.event.id}`, {
        //   method: "PUT",
        //   headers: { "Content-Type": "application/json" },
        //   body: JSON.stringify(updatedEvent),
        // })

        //   // .then((res) => {
        //     if (!res.ok) {
        //       toast("Ошибка обновления простого события");
        //       info.revert(); // отменяем изменение размера, если ошибка
        //     }

        //     const updatedEventData = await res.json();

        //     setSimpleEvents((prevEvents) =>
        //       prevEvents.map((ev) => (ev.id === updatedEventData.id ? updatedEventData : ev))
        //     );


        //   // })
        //   .catch((err) => {
        //     console.error("Ошибка обновления simple event:", err);
        //     toast("Ошибка обновления простого события");
        //     info.revert();
        //   });


        

      } else {

        // Берем данные заказа из extendedProps
        const order = event.extendedProps.order;
        let orderId = event.extendedProps?.id ?? order.id
        let isSborka;
        // если orderId не определился, значит это сборка
        if (!orderId) {
          orderId = event.extendedProps?.orderId;
          // Если это сборка значит есть флаг
          isSborka = event.extendedProps?.isSborka
        }

        const currentOrder = orders.find(o => o.id === orderId) || order;
        const workOnWeekendConfig = currentOrder.data.workOnWeekendConfig;
        const holidays = new Set(holidayConfigs.map(cfg => cfg.date)); // Оптимизируем поиск по праздникам
      
        // ------------------------ Логика расчета дней ------------------------------------ //

        // Новая дата начала (предполагается, что она не меняется при изменении длительности)
        const newStartDate = new Date(event.start);
        const newEndDate = new Date(event.end);

        newStartDate.setHours(0, 0, 0, 0);
        newEndDate.setHours(0, 0, 0, 0);
        newEndDate.setDate(newEndDate.getDate() - 1); // ← вычитаем 1 день, т.к. end exclusive

      
        // Функция для генерации массива дат
        const generateDateRange = (start, end) => {
          const dates = [];
          const tempDate = new Date(start);
          const lastDate = new Date(end);

          // Оба к полуночи
          tempDate.setHours(0, 0, 0, 0);
          lastDate.setHours(0, 0, 0, 0);

          // Пробегаем до < end, но без -1
          while (tempDate <= lastDate) {
            dates.push(new Date(tempDate));
            tempDate.setDate(tempDate.getDate() + 1);
          }
          return dates;
        };
        
        // Список конкретных дат
        const allDates = generateDateRange(newStartDate, newEndDate);
        // console.log("Все даты диапазона:", allDates.map(d => formatLocalDate(d)));

        // Вычисляем рабочие дни учитывая выходные
        const workingDays = allDates.filter(date => {
          const dayOfWeek = date.getDay();
          const dateStr = formatLocalDate(date);

          const isHoliday = holidays.has(dateStr);

          // Проверяем, что если это суббота или воскресенье, но для них стоит флаг "рабочий день" — то считаем рабочим
          if (dayOfWeek === 6 && workOnWeekendConfig.saturday) {
            // суббота считается рабочим — возвращаем true (рабочий день)
            return true;
          }
          if (dayOfWeek === 0 && workOnWeekendConfig.sunday) {
            // воскресенье считается рабочим — возвращаем true (рабочий день)
            return true;
          }

          // Для остальных праздничных дней смотрим флаг workOnWeekendConfig.holiday
          if (isHoliday && !workOnWeekendConfig.holiday) {
            // праздник и флаг не разрешает работать в праздники => исключаем
            return false;
          }

          // Если не суббота/воскресенье или они не рабочие, и день не праздник => работаем
          const isWeekend = (dayOfWeek === 6 || dayOfWeek === 0);
          if (isWeekend && !(workOnWeekendConfig.saturday && dayOfWeek === 6) && !(workOnWeekendConfig.sunday && dayOfWeek === 0)) {
            // выходной без разрешения работать - исключаем
            return false;
          }
          return true;
        });

        // Число рабочиих дней Итого
        const newDurationDays = workingDays.length
      
        // Формируем payload: обновляем только длительность (param16) в столбце data, а param15 (дата начала) остаётся прежней
        const payload = {
          updatedData: {
            data: {
              ...(order.data || {}),
              ...(isSborka
            ? {
                sborkaDays: newDurationDays.toString(),
              }
            : {
                param16: newDurationDays.toString(),
              }),      // сохраняем все предыдущие данные (если есть)
            },
          },
        };
      
        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/${orderId}`, {
            method: 'PUT',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      
          if (response.ok) {
            const updatedOrder = await response.json();

            let newStart;
            let newDays;
            if (isSborka) {
              newStart = updatedOrder.data.sborkaDate;
              newDays = Number(updatedOrder.data.sborkaDays)
            } else 
              { newStart = updatedOrder.data.param15;
                newDays = Number(updatedOrder.data.param16);
              }
             
            // console.log("Дата в ресайз = ", newStart)

            //console.log(`newDays = ${newDays}, work = ${work}`)  

            // Вычисляем дату конца события
            const newEnd = calculateEndDateForResize(newStart, newDays, workOnWeekendConfig, 
            holidayConfigs.map(cfg => cfg.date))

            // Прибавляем день чтобы работало правильно
            const inclusiveEnd = new Date(Date.UTC(
              ...newEnd.split("-").map((d,i) => i===1? Number(d)-1: Number(d))
            ));
            inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() + 1);
            // Итак реальная дата конца
            const endIso = inclusiveEnd.toISOString().split("T")[0];  

            if (isSborka) {
              updatedOrder.data.sborkaEndDate = endIso;
            } else {
              updatedOrder.data.endDate = endIso;
            }

            // console.log("endIso = ", endIso)
      
            // Сначала обновляем БД
            await updateOrderInDB({
              id: updatedOrder.id,
              data: {
                ...updatedOrder.data,
                ...(isSborka
                  ? {
                      sborkaEndDate: updatedOrder.data.sborkaEndDate,
                    }
                  : {
                      endDate: updatedOrder.data.endDate,
                }),  
              },
            });
            
            
            // Обновляем массив orders: заменяем обновленный заказ
            setOrders((prevOrders) =>
              prevOrders.map((o) =>
                o.id === updatedOrder.id ? updatedOrder : o
              )
            );


            // Обновляем событие как в состоянии events
            setEvents((prevEvents) =>
              prevEvents.map((ev) =>
                ev.id === updatedOrder.id
                  ? {
                      ...ev,
                      // Дата начала не меняется
                      ...(isSborka
                        ? {
                            start: updatedOrder.data.sborkaDate,
                          }
                        : {
                            start: updatedOrder.data.param15,
                      }), 
                      // Обновляем end, вычисленный по новой длительности
                      allDay: true,
                      duration: { days: newDurationDays },
                      extendedProps: { order: updatedOrder },
                    }
                  : ev
              )
            );
          } else {
            console.error("Ошибка обновления заказа", response.status);
            info.revert(); // откат изменений, если сервер вернул ошибку
          }
        } catch (error) {
          console.error("Ошибка при сохранении изменений:", error);
          info.revert(); // откат изменений при ошибке
        }
      } 
    }   
  };
  

  // Функция генерации массива ячеек для заказа
  const generateCellsForOrder = useCallback((orderId) => {
    const cells = [];
    const configsForOrder = orderConfigsByOrderId.get(String(orderId)) || [];

    // Для "Р", "КР": считаем, что они берутся из конфигурации addon_id = 7
    const config7 = configsForOrder.find(cfg => cfg.addon_id === 7);
    const param21 = config7 && config7.data ? config7.data.param21 : false; // для "Р"
    const param22 = config7 && config7.data ? config7.data.param22 : false; // для "КР"

    // Добавляем ячейки, которые всегда по одной:
    cells.push({ label: statusColors.name_raskroi, param: param21 });
    cells.push({ label: statusColors.name_kromka, param: param22 });
    // cells.push({ label: statusColors.name_furnitura, param: furnParam });

    // Для "ФУ": может быть несколько объектов с addon_id = 8
    // console.log("orderId = ", orderId)
    const configs8 = configsForOrder.filter(cfg => cfg.addon_id === 8);

    configs8.forEach((cfg) => {

      const furnParam = cfg.data ? cfg.data.furn_param8 : false;
      cells.push({ label: statusColors.name_furnitura, param: furnParam });
    });


    // Для "ФА": может быть несколько объектов с addon_id = 9
    const configs9 = configsForOrder.filter(cfg => cfg.addon_id === 9);
    configs9.forEach((cfg) => {

      const fasadParam = cfg.data ? cfg.data.fasad_param8 : false;
      cells.push({ label: statusColors.name_fasad, param: fasadParam });
    });

    // Для "П": может быть несколько объектов с addon_id = 10
    const configs10 = configsForOrder.filter(cfg => cfg.addon_id === 10);
    configs10.forEach((cfg) => {
      const workParam = cfg.data ? cfg.data.work_param8 : false;
      cells.push({ label: statusColors.name_workers, param: workParam });
    });

    return cells;
  }, [orderConfigsByOrderId, statusColors]);



  // === Финальная проверка наличия значения ===
  const hasValue = useCallback(function checkValue(v) {
    if (v === null || v === undefined) return false;

    // Примитивы
    if (typeof v === 'string') {
      const s = v.trim();
      return s !== '' && s !== '0';
    }
    if (typeof v === 'number') return !Number.isNaN(v) && v !== 0;
    if (typeof v === 'boolean') return v === true;

    // Массив: если хотя бы один элемент содержателен
    if (Array.isArray(v)) return v.some(item => checkValue(item));

    // Объект: ТРЕБУЕМ одновременно date + содержательное поле (не date)
    if (typeof v === 'object') {
      const keys = Object.keys(v);
      if (keys.length === 0) return false;

      // Служебные ключи, которые НЕ учитываем как "значение"
      const ignoredKeys = new Set(['adminChecked', 'adminHasEdited']);

      // 1) есть ли валидная дата (поле с 'date' в имени и содержит значение)
      let dateExists = false;
      for (const k of keys) {
        if (k.toLowerCase().includes('date')) {
          if (checkValue(v[k])) { // строка даты: не пустая и не "0"
            dateExists = true;
            break;
          }
        }
      }

      if (!dateExists) return false; // если даты нет — объект не считаем значимым

      // 2) есть ли ненулевая содержательная часть (исключая date-поля и ignoredKeys)
      for (const k of keys) {
        if (ignoredKeys.has(k)) continue;
        if (k.toLowerCase().includes('date')) continue; // уже обработали
        if (checkValue(v[k])) return true; // хоть одно содержательное поле — ок
      }

      // дата есть, но содержательного поля нет => false
      return false;
    }

    // всё остальное — считаем пустым
    return false;
  }, []);

  // === Цвет ячейки (закрашиваем ТОЛЬКО если есть значение) ===
  const getCellBackgroundColor = useCallback((cell, statusColors) => {
    const valueExists = hasValue(cell.param);
    if (!valueExists) return statusColors.default;

    switch (cell.label) {
      case statusColors.name_raskroi:   return statusColors.raskroi;
      case statusColors.name_kromka:   return statusColors.kromka;
      case statusColors.name_furnitura:return statusColors.furnitura;
      case statusColors.name_fasad:    return statusColors.fasad_ready ?? statusColors.fasad_default ?? statusColors.default;
      case statusColors.name_workers:  return statusColors.workers;
      default:                         return statusColors.default;
    }
  }, [hasValue]);




  // // Функция определения цвета ячейки по её свойствам
  // const getCellBackgroundColor = (cell, statusColors) => {

  //   // console.log("statusColors", statusColors.raskroi)
  //   // Используем hasValue, чтобы корректно отличать "есть данные" от "пусто"
  //   const valueExists = hasValue(cell.param);

  //   // Если значения нет, возвращаем цвет по умолчанию
  //   if (!valueExists) return statusColors.default;

  //   // Для "Р": например, если param true, окрашиваем оранжевым
  //   if (cell.label === statusColors.name_raskroi) {
  //     return valueExists ? statusColors.raskroi : statusColors.default;
  //   }
  //   // Для "КР": если param true, зелёный
  //   if (cell.label === statusColors.name_kromka) {
  //     return valueExists ? statusColors.kromka : statusColors.default;
  //   }
  //   // Для "ФУ": если param true, пурпурный
  //   if (cell.label === statusColors.name_furnitura) {
  //     return valueExists ? statusColors.furnitura : statusColors.default;
  //   }
  //   // Для "ФА": если param true – голубой, иначе по умолчанию используем цвет для defected из statusColors
  //   if (cell.label === statusColors.name_fasad) {
  //     return valueExists ? statusColors.fasad_ready : statusColors.fasad_default;
  //   }
  //   // Для "П": если param true – оранжевый, иначе оставляем, например, желтый (или другой)
  //   if (cell.label === statusColors.name_workers) {
  //     return valueExists ? statusColors.workers : statusColors.default
  //   }
  //   // По умолчанию
  //   return statusColors.default;
  // };


// // === Проверка наличия содержательного значения ===
// const hasValue = (v) => {
//   if (v === null || v === undefined) return false;

//   // строка: пустая или "0" → нет значения
//   if (typeof v === 'string') {
//     const s = v.trim();
//     return s !== '' && s !== '0';
//   }

//   // число: 0 → нет значения
//   if (typeof v === 'number') return !Number.isNaN(v) && v !== 0;

//   // boolean: false → нет значения
//   if (typeof v === 'boolean') return v === true;

//   // массив: есть, если хотя бы один элемент имеет значение
//   if (Array.isArray(v)) return v.some(item => hasValue(item));

//   // объект
//   if (typeof v === 'object') {
//     const keys = Object.keys(v);
//     if (keys.length === 0) return false;

//     // Игнорируем служебные поля
//     const ignoredKeys = ['date', 'adminText', 'adminChecked', 'adminHasEdited'];

//     // Смотрим только на содержательные поля
//     const meaningfulKeys = keys.filter(k => !ignoredKeys.includes(k));
//     if (meaningfulKeys.length === 0) return false;

//     return meaningfulKeys.some(k => hasValue(v[k]));
//   }

//   return false;
// };




  // ОБработка простого события
  const handleSelect = (info) => {

    const canEdit = Array.from(accessibleParams).some(p => p.param === "calendar" && p.allowed && p.canEdit);

    // Проверяем ДОСТУП
    if (!canEdit) {
      toast("Действие запрещено")
    } else {

      const title = prompt('Введите комментарий:');
      if (!title || !info.resource) return;

      // console.log("info = ", info)
      // console.log("events = ", events)

      const infoendDate = new Date(info.endStr)
      infoendDate.setDate(infoendDate.getDate() - 1);
      const isoInfoendDate = infoendDate.toISOString()
      // console.log("isoInfoendDate = ", isoInfoendDate)

      // Проверяем если в этом промежутке и ресурсе заказ
      const orderHere = events.find(order => 
        order.start <= info.startStr 
        && order.end.split("T")[0] >= isoInfoendDate.split("T")[0]
        && order.resourceId === info.resource.id
      );


      let createSticky;

      if (orderHere) {
        createSticky = true;
      } else {
        createSticky = false;
      }


    
      // Создаем совместимый объект события
      const newEvent = {
        title,
        start: info.startStr,
        end: info.endStr,
        allDay: info.allDay,
        resourceId: info.resource.id,
        // extendedProps: {
          type: 'simple',
        // },
        sticky: createSticky
      };
    
      calendarRef.current?.getApi().addEvent(newEvent);


      // Сохранить на сервере:
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEvent),
      })
      .then((res) => res.json())
      .then((savedEvent) => setSimpleEvents((prev) => [...prev, savedEvent]))
      .catch((err) => console.error("Ошибка сохранения Simple Event:", err));

      // 🔹 Обновляем состояние
      setAttachToOrder(createSticky);
    }  
  };

  // // Собираем заказы и простые события в один массив
  // const allEvents = [...events, ...simpleEvents];
  
  // console.log("events:", events)


  // Ограничение по месяцам загружаем только при смене роли. Раньше этот запрос
  // повторялся после каждого переноса и временно размонтировал FullCalendar.
  useEffect(() => {
    if (!roleId) return;

    let isMounted = true;
    setLoadingEvents(true);
    setRoleAccessMonths(null);

    ;(async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/roles/${roleId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { accessMonths } = await res.json();

      if (isMounted) setRoleAccessMonths(Number(accessMonths) || 0);
    })().catch((error) => {
      console.error("Ошибка загрузки ограничения календаря:", error);
      if (isMounted) {
        setRoleAccessMonths(0);
        setLoadingEvents(false);
      }
    });

    return () => { isMounted = false; };
  }, [roleId]);

  // При изменении событий обновляем только данные FullCalendar. Сам компонент
  // остаётся смонтированным и поэтому сохраняет текущую дату и прокрутку.
  useEffect(() => {
    if (roleAccessMonths === null) return;

    const dateLimit = new Date();
    dateLimit.setMonth(dateLimit.getMonth() - roleAccessMonths);

    const filteredEv = events.filter(e => new Date(e.start) >= dateLimit);
    const filteredSimple = simpleEvents.filter(e => new Date(e.start) >= dateLimit);

    setAllEvents([...filteredEv, ...filteredSimple]);
    setLoadingEvents(false);
  }, [roleAccessMonths, events, simpleEvents]);


  // Загрузка логов заказа
  useEffect(() => {
    if (isModalOpen && selectedOrder.id) {
      // Сбрасываем старые логи и collapsed‑состояние
      setExpanded(false);
      setLogs([]);

      // Запрашиваем логи по текущему orderId
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/orderLogs/order/${selectedOrder.id}`)
        .then(res => res.json())
        .then(data => setLogs(data))
        .catch(err => console.error("Ошибка при загрузке логов:", err));
    }
  }, [isModalOpen, selectedOrder]);

  const renderEventContent = useCallback((eventInfo) => {
    const isSimpleEvent = eventInfo.event.extendedProps?.type === 'simple';
    if (isSimpleEvent) {
      const backgroundColor = eventInfo.event.extendedProps.sticky ? '#f1a10d' : '#fac832';
      return (
        <div style={{
          padding: '8px',
          backgroundColor,
          borderRadius: '4px',
          border: '1px solid rgb(249, 217, 144)',
          fontSize: '14px'
        }}>
          <div style={{ fontWeight: 500, color: '#000' }}>{eventInfo.event.title}</div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>{eventInfo.timeText}</div>
        </div>
      );
    }

    try {
      const { order } = eventInfo.event.extendedProps;
      const id = eventInfo.event.extendedProps?.id ?? order.id;
      const isBulkSelected = multiSelectedOrderIds.includes(String(id));
      const { statusColor, statusFontColor } = getPresentationForStatus(id);
      const cells = generateCellsForOrder(id);
      const extendedOrder = {
        ...order,
        technicName: eventLookupMap.param7[order.param7] || 'Не указан технолог',
      };
      const isSborka = eventInfo.event.extendedProps?.isSborka;

      return (
        <div style={{
          padding: '5px',
          backgroundColor: isSborka ? '#57c5cb' : statusColor,
          color: statusFontColor,
          borderRadius: '4px',
          border: isBulkSelected ? '2px solid #1d4ed8' : '1px solid rgba(0,0,0,0.12)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxShadow: isBulkSelected ? '0 0 0 2px rgba(29,78,216,0.25)' : 'none',
        }}>
          <div>
            <EventRender
              order={extendedOrder}
              lookupMap={eventLookupMap}
              accessibleParams={accessibleParams}
              eventConfig={eventDisplayConfig}
            />
          </div>
          {!isSborka && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', width: '100%' }}>
              {cells.map((cell, index) => (
                <div
                  key={index}
                  style={{
                    flex: '1',
                    margin: '0 2px',
                    backgroundColor: getCellBackgroundColor(cell, statusColors),
                    border: '1px solid #ccc',
                    borderRadius: '2px',
                    padding: '2px',
                    textAlign: 'center',
                    fontSize: '12px'
                  }}
                >
                  {cell.label}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    } catch (error) {
      console.error('Ошибка рендеринга события:', error);
      return (
        <div style={{ padding: '8px', backgroundColor: '#ffebee', color: '#b71c1c', border: '1px solid #ffcdd2' }}>
          Ошибка отображения события
        </div>
      );
    }
  }, [
    accessibleParams,
    eventDisplayConfig,
    eventLookupMap,
    generateCellsForOrder,
    getCellBackgroundColor,
    getPresentationForStatus,
    multiSelectedOrderIds,
    statusColors,
  ]);

  

  if (loading || loadingEvents) {
    return <Spinner />;
  }


  // Доступ к модальным окнам
  const canEdit = Array.from(accessibleParams).some(p => p.param === "calendar" && p.allowed && p.canEdit);

  return (
    <div className="calendar-page">
      <div className="calendar-rotate-hint" role="note">
        Для удобной работы поверните телефон горизонтально. Календарь можно прокручивать в любом направлении.
      </div>
    <div
      id="calendar-container"
      ref={containerRef}
      className="calendar-scroll-shell"
      style={{ overflow: "auto", height: "calc(100vh - 50px)" }}
    >
      <div className="calendar-mobile-canvas">
      <FullCalendar
        ref={calendarRef}
        plugins={[resourceTimelinePlugin, interactionPlugin]}
        initialView="customTimeline"
        initialDate={targetDate ?? undefined}
        headerToolbar={{
          left: "prevWeek,nextWeek",
          center: "title",
          right: "statusEr customSearch undoMove",
        }}
        views={{
          customTimeline: {
            type: "resourceTimeline",
            duration: { days: 60 }, // Показывает 60 дней
            dateIncrement: { weeks: 1 }, // Перемещается на 1 неделю
          },
        }}
        customButtons={{
          prevWeek: {
            text: "← Неделя",
              click: () => {
                const calendarApi = calendarRef.current?.getApi();
                if (calendarApi) {
                  const currentDate = calendarApi.getDate();
                  calendarApi.gotoDate(new Date(currentDate.valueOf() - 7 * 24 * 60 * 60 * 1000));
                }
              },
          },
          nextWeek: {
            text: "Неделя →",
            click: () => {
              const calendarApi = calendarRef.current?.getApi();
              if (calendarApi) {
                const currentDate = calendarApi.getDate();
                calendarApi.gotoDate(new Date(currentDate.valueOf() + 7 * 24 * 60 * 60 * 1000));
              }
            },
          },
          customSearch: {
            text: "🔍", // Отображается иконка-лупа
            click: () => {}
          },
          statusEr: {
            text: errorCount.toString(),
            click: () => setModalOpen(true),
          },
          undoMove: {
            text: "⏪ Отменить",
            click: async () => {
              // console.log("Кнопка нажата!");
              if (!lastEventState) {
                // console.log("Нет состояния для отката");
                return;
              }
              await undoLastMove();
            }
          },
        }}

        selectable={true} 
        select={handleSelect}
        editable={true} // Включаем возможность редактирования
        eventStartEditable={true} // Разрешаем изменять дату/время начала события
        eventDurationEditable={true} // Разрешаем изменять длительность
        eventResizableFromStart={false} // Позволяет менять время начала
        eventOverlap={true} // Разрешает перекрытие событий
        locale={ruLocale}
        height="100%"
        events={allEvents}    
  // datesSet={() => {
  //   const api = calendarRef.current?.getApi();
  //   if (!api) return;
  //   console.log("FullCalendar увидел событий:", api.getEvents().length);
  // }}
        eventResourceEditable={true}
        eventDrop={handleEventDrop}
        eventResize={handleEventResize}
        eventClick={(info) => {
          const isMultiSelectClick = Boolean(info?.jsEvent?.ctrlKey || info?.jsEvent?.metaKey);
          const clickedOrderId = getOrderIdFromCalendarEvent(info.event);

          if (isMultiSelectClick && clickedOrderId) {
            setMultiSelectedOrderIds((prev) => {
              const key = String(clickedOrderId);
              if (prev.includes(key)) return prev.filter((id) => id !== key);
              return [...prev, key];
            });
            return;
          }

          // Определим SimpleEvents и обработаем их
          const eventType = info.event.extendedProps?.type;
          // console.log("info при eventClick = ", info)

          if (eventType === 'simple') {
            setMultiSelectedOrderIds([]);

            setSelectedEvent({
              event: {
                id: info.event.id, // Явно сохраняем ID
                ...info.event,
                sticky: info.event.extendedProps?.sticky ?? false,
              }
            });
            setIsModalSimpleOpen(true);

          } else {

          // Сохраняем данные события (например, order из extendedProps)  
          const orderId = info.event.extendedProps.id;  // Получаем id
          const order = info.event.extendedProps.order; // Получаем сам order
          const comment1 = info.event.extendedProps.comment1;
          const comment2 = info.event.extendedProps.comment2;
            setSelectedOrder({
            ...order, // развернем все поля заказа на верхний уровень
            id: orderId,
            comment1: comment1,
            comment2: comment2,
          });
          setMultiSelectedOrderIds(clickedOrderId ? [String(clickedOrderId)] : []);
          
          // setSelectedOrder(info.event.extendedProps.order);
          // console.log("selectedOrder при eventClick = ", selectedOrder)
          setIsModalOpen(true);
        }
        }}
        eventClassNames="custom-event" // Добавляем CSS-класс к событиям     
        resources={resources}
        resourceAreaHeaderContent="Установщики"
        slotDuration={{ days: 1 }}
        slotLabelFormat={[
          { day: 'numeric', month: '2-digit' }, // 1
          { weekday: 'short' }, // СБ          
        ]}
        slotMinWidth={60}

        // slotLabelContent={(args) => {
        //   // Преобразуем дату в строку YYYY-MM-DD
        //   const dateStr = args.date.toISOString().split("T")[0];

        
        
        //   // Подсчёт количества сепараторов
        //   const separatorIndex = resources.filter(r => r.extendedProps?.isSeparator && r.date <= dateStr).length;

        //   console.log("separatorIndex = ", separatorIndex)
        
        //   // Если достигли третьего сепаратора — вставляем заголовок дат
        //   if (separatorIndex > 0 && separatorIndex % 3 === 0) {
        //     return (
        //       <div style={{ backgroundColor: "#ccc", padding: "5px", fontWeight: "bold" }}>
        //         📅 {args.date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" })}
        //       </div>
        //     );
        //   }
        
        //   // Обычные даты
        //   return (
        //     <div style={{ textAlign: "center" }}>
        //       <div>{args.date.getDate()}</div>
        //       <div style={{ fontSize: "0.8em", textTransform: "uppercase" }}>
        //         {args.date.toLocaleDateString("ru-RU", { weekday: "short" })}
        //       </div>
        //     </div>
        //   );
        // }}
        

        slotLaneClassNames={(args) => {
          // Приводим дату к формату YYYY-MM-DD (исключая локальное время!)
          const dateStr = new Date(Date.UTC(
            args.date.getFullYear(),
            args.date.getMonth(),
            args.date.getDate()
          )).toISOString().split('T')[0]; // Формат YYYY-MM-DD
        
          // Проверяем, есть ли этот день в БД
          const config = holidayConfigs.find(cfg => cfg.date === dateStr);
        
          // console.log("Проверяем дату:", dateStr, "→", config ? "Выходной" : "Рабочий день");
        
          return config && config.isHoliday ? 'holiday-slot' : '';
        }}
        

        // Обеспечиваем сортировку ресурсов по порядку (если нужно, можно задать поле order в ресурсах)
        resourceOrder="order"
        // Кастомное рендеринг заголовков ресурсов

        resourceAreaWidth={'150px'}

        // resourceLabelContent={(args) => {
        //   if (args.resource.extendedProps.isSeparator) {
        //     return <div style={{ height: '1px', backgroundColor: '#e0e0e0' }}></div>;
        //   }
        //   return (
        //     <div style={{ display: 'flex', flexDirection: 'column', fontSize: '16px', height: '90px'
        //      }}>
        //       <div>{args.resource.title}</div>
        //       {args.resource.extendedProps.subtitle && (
        //         <div style={{ opacity: 0.7, fontSize: '10px' }}>{args.resource.extendedProps.subtitle}</div>
        //       )}
        //     </div>
        //   );
        // }}

        resourceLabelContent={(args) => {
          const isSeparator = args.resource.extendedProps?.isSeparator;
          const bgColor = args.resource.extendedProps?.color || 'transparent';

          if (isSeparator) {
            return <div style={{ height: '1px', backgroundColor: '#e0e0e0' }}></div>;
          }

          return (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: '16px',
              height: '90px',
              backgroundColor: bgColor,
              padding: '4px',
              boxSizing: 'border-box',
              borderRadius: '4px',
              color: '#000', // можно сделать автоопределение цвета текста от фона
            }}>
              <div>{args.resource.title}</div>
              {args.resource.extendedProps.subtitle && (
                <div style={{ opacity: 0.7, fontSize: '10px' }}>{args.resource.extendedProps.subtitle}</div>
              )}
            </div>
          );
        }}

        resourceLaneClassNames={(args) => {
          if (args.resource.extendedProps.isSeparator) {
            return 'separator-lane';
          }
          return '';
        }}

        // Сортируем сначала заказы, потом simple
        eventOrder={(a, b) => {
          const typeA = a.extendedProps?.type;
          const typeB = b.extendedProps?.type;
          // Если оба события одного типа — сортируем по start, если нужно
          if (typeA === typeB) {
            // Можно сортировать по start или id, если требуется
            return a.start - b.start;
          }
          // Если a — заказ, он должен идти раньше (выше)
          if (typeA != "simple") return -1;
          // Если b — заказ, он должен идти раньше
          if (typeB === "simple") return 1;
          // Если нет данных по типу, оставляем порядок по умолчанию
          return 0;
        }}

        eventContent={renderEventContent}
      />  
      </div>

          {/* Модалка для Ошибок статуса */}
          {modalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-4xl w-full shadow-lg  max-h-[60vh] overflow-y-auto"
            ref={modalRef}>
              <h2 className="text-xl font-bold mb-4">
                Ошибки статуса ({errorCount})
              </h2>

              <table className="w-full table-auto border border-gray-300 mb-4">
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
                          className="os-primary-bg text-white rounded"
                          style = {{
                            marginTop: "0px",
                          }}
                        >
                          Перейти
                        </button>
                      </td>
                      <td className="border px-2 py-1">
                        <button
                          onClick={() => {
                            const calendarApi = calendarRef.current?.getApi();
                            if (!calendarApi) return;

                            const event = calendarApi.getEventById(String(order.id));
                            if (!event || !event.start) return;

                            // 1) Закрываем модалку
                            setModalOpen(false);

                            // 2) Переходим на дату события
                            calendarApi.gotoDate(event.start);

                            // 3) Подсвечиваем событие
                            event.setProp('classNames', [...(event.extendedProps.classNames || []), 'highlighted-event']);

                            // 4) По истечении 3 секунд убираем подсветку
                            setTimeout(() => {
                              // Убираем наш класс
                              const remaining = (event.extendedProps.classNames || []).filter(c => c !== 'highlighted-event');
                              event.setProp('classNames', remaining);
                            }, 5000);

                          }}
                          className="os-primary-bg text-white rounded"
                          style = {{
                            marginTop: "0px",
                          }}
                        >
                          Перейти
                        </button>
                          </td>
                      <td className="border px-2 py-1"> 
                        <div className="flex items-center gap-2">       
                        <input
                          className="flex-1 p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                          type="text"
                          value={editedComments[order.id] ?? order.comment2 ?? ''}
                          onChange={(e) => {
                            setEditedComments(prev => ({
                              ...prev,
                              [order.id]: e.target.value
                            }));
                          }}
                        />
                        <button
                          onClick={() => handleSaveComment(order.id)}
                          className="bg-green-500 text-white px-2 py-1 rounded ml-2 hover:bg-green-600"
                          type="button"
                          style = {{
                            marginTop: "0px",
                          }}
                        >
                          💾
                        </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end">
                <button
                  onClick={() => setModalOpen(false)}
                  className="bg-gray-300 text-black px-4 py-2 rounded hover:bg-gray-400"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Модалка для Simple */}

        {isModalSimpleOpen && selectedEvent && canEdit && (
          <MySimpleModal 
            isOpen={isModalSimpleOpen} 
            onClose={() => setIsModalSimpleOpen(false)} 
            eventData={selectedEvent}
            attachToOrder={attachToOrder}
            onCheckboxChange={handleCheckboxChange} 
          />
        )}

   

        {/* {console.log("selectedOrder при открытии модалки:", selectedOrder)} */}

        {/*  адрес, изделие , имя клиента , номер телефона клиента,  технолог */}
        {isModalOpen && selectedOrder?.id && (() => {

        // Маппинг для преобразования значений параметров по их именам
        const lookupMapping = {
          // Для param7 значение является id, нужно вывести имя
          param7: (val) => {
            const technicId = String(val);
            const technicObj = technics.find(item => Number(item.id) === Number(technicId));
            return technicObj ? technicObj.name : "Не назначено";
          },
          param14: (val) => {
            const payWayId = String(val);
            const payWayObj = paylist.find(item => Number(item.id) === Number(payWayId));
            return payWayObj ? payWayObj.name : "Не назначено";
          },
        };

        // Фильтруем только разрешённые параметры, преобразуем и сортируем по алфавиту по label
        const allowedParams = eventInfos
          .filter(param => param.allowed)
          .map(param => {
            // Получаем значение из selectedOrder по ключу (например, "param7")
            const rawValue = selectedOrder[param.paramName];
            // Если для этого параметра есть функция преобразования, используем её
            const displayValue = lookupMapping[param.paramName]
              ? lookupMapping[param.paramName](rawValue)
              : (rawValue ?? "Не назначено");
            
            return {
              label: param.paramLabel,
              value: displayValue
            };
          })
          .sort((a, b) => a.label.localeCompare(b.label));

          return (
            <div className="modal">
              <div className="modal-content">
                <h3>Редактирование заказа</h3>
        
                {allowedParams.map(({ label, value }, index) => (
                  <p key={index} className="text-gray-700 font-medium text-left" style={{ margin: "3px 0" }}>
                    <strong>{label}:</strong> {value}
                  </p>
                ))}
        
                <div style={{ marginTop: "20px" }}>
                  <button onClick={handleViewOrder} style={{ marginLeft: "10px" }}>
                    В заказ
                  </button>
                  <button onClick={() => setIsModalOpen(false)} style={{ marginLeft: "10px" }}>
                    Отмена
                  </button>
                </div>
              

              {/** Блок вывода логов */}
              <div className="max-w-2xl mx-auto bg-white shadow-lg rounded-lg border border-gray-200 max-h-[60vh] overflow-y-auto">
                <button onClick={() => setExpanded(prev => !prev)} style={{ fontWeight: 'bold' }}>
                  {expanded ? 'Скрыть историю изменений ▲' : 'Показать историю изменений ▼'}
                </button>

                {expanded && logs.length > 0 && (
                  <ul style={{ marginTop: '0.2rem', paddingLeft: '1rem' }}>
                    {logs.map((log, index) => (
                      <li key={index} style={{ textAlign: "left", marginBottom: "5px" }}>
                        <div><strong>{log.user}</strong> — {new Date(log.timestamp).toLocaleString()}</div>
                        <div style={{ fontStyle: 'italic', color: '#555', textAlign: "left" }}>{log.action}</div>
                      </li>
                    ))}
                  </ul>
                )}

                {expanded && logs.length === 0 && <p>Нет логов изменений.</p>}
              </div>

            </div>
            </div>
          );
        })()}
    </div>
    </div>
  );  
};

export default Calendar;


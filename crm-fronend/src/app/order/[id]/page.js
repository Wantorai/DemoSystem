// src/app/order/[id]/page.js

"use client";

import React, { useState, useEffect, useRef, useContext } from "react";
import { AuthContext } from "../../../context/AuthContext";
import { useParams, useRouter } from "next/navigation";
import axios from 'axios';
import Spinner from "../../../components/Spinner";
import { toast } from 'react-toastify';
import { useMask } from '../../../components/MaskContext';
import { format } from 'date-fns';
import { getActiveHolidayDates, isWorkingDate } from '../../../utils/workScheduleDates';
import { MapPin, Phone } from 'lucide-react';

const AutoResizeTextarea = ({ value, onChange, className = "", ...props }) => {
  const textareaRef = useRef(null);

  const resize = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  useEffect(resize, [value]);

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      value={value}
      onChange={onChange}
      onInput={resize}
      className={`order-auto-textarea ${className}`}
      {...props}
    />
  );
};

const normalizePhoneHref = (phone) => {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  const normalized = raw.replace(/(?!^\+)\D/g, "");
  return normalized ? `tel:${normalized}` : "";
};

const OrderPage = () => {
  const { id } = useParams(); // Получаем ID из URL
  const [order, setOrder] = useState({
    data: {
      statusData: {},
    },
    active: true,
  });
  const [mainModelConfig, setMainModelConfig] = useState([]);
  const [installers, setInstallers] = useState([]);
  const [technics, setTechnics] = useState([]);
  const [clients, setClients] = useState([]);
  const [orderConfigs, setOrderConfigs] = useState([]);
  // const [orderConfig, setOrderConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const params = useParams();
  const router = useRouter();
  const [addonParams, setAddonParams] = useState({}); // {7: { param18: "Листовой мат.", param19: "Спецификации" }}
  const [addonConfigs, setAddonConfigs] = useState([]);
  // const [addonIds, setAddonIds] = useState([]);
  const [fields, setFields] = useState([]);
  const [furnVendors, setFurnVendors] = useState([]);
  const [fasadVendors, setFasadVendors] = useState([]);
  const [workVendors, setWorkVendors] = useState([]);
  const [comment1, setComment1] = useState("");
  const [comment2, setComment2] = useState("");
  const [statusColors, setStatusColors] = useState({});
  const [holidayConfigs, setHolidayConfigs] = useState([]);
  const [paylists, setPaylists] = useState([]);
  const calendarRef = useRef(null);
  const [statuses, setStatuses] = useState([]);
  const { user } = useContext(AuthContext);
  const [accessibleParams, setAccessibleParams] = useState(new Set());
  const [showOptions, setShowOptions] = useState(false); // Управление отображением списка клиентов
  const { isMasked } = useMask();
  const [logs, setLogs] = useState([]);
  const [expanded, setExpanded] = useState(false);
  let [oldOrder, setOldOrder] = useState(null);
  let [oldOrderConfigs, setOldOrderConfigs] = useState(null);
  const API = process.env.NEXT_PUBLIC_API_URL;

  let roleId;
  let currentUserName = '';
  if (user) {roleId = user.roleId;
    currentUserName = user.name;
  } // Получаем роль юзера)

  // Загружаем конфигурацию выходных дней из нашего API
  useEffect(() => {    
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/holidays`)
      .then(res => res.json())
      .then(data => setHolidayConfigs(data))
      .catch(err => console.error("Ошибка получения конфигурации выходных:", err));
  }, []);


  // Выходные
  useEffect(() => {
    const calendar = calendarRef.current;
    if (calendar && typeof calendar.getApi === "function") {
      calendar.getApi().render();
    }
  }, [holidayConfigs]);
  

  // Загрузка логов заказа
  useEffect(() => {
    if (expanded) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/orderLogs/order/${id}`)
        .then(res => res.json())
        .then(data => setLogs(data))
        .catch(err => console.error('Ошибка при загрузке логов:', err));
    }
  }, [expanded, id]);


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
        setStatusColors(colorsMap);
        //console.log("Цвета статусов загружены:", colorsMap);
      } catch (error) {
        console.error("Ошибка загрузки цветов статусов:", error);
      }
    };
  
    fetchStatusColors();
  }, []);
  

  // // Загрузки данных
  // useEffect(() => {
  //   const fetchData = async () => {
  //     try {
  //       // Загрузка конфигурации MainModel
  //       const configResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/mainModel`);
  //       if (!configResponse.ok) {
  //         throw new Error("Ошибка при загрузке конфигурации MainModel");
  //       }
  //       const configData = await configResponse.json();

  //       // console.log('configData:', JSON.stringify(configData, null, 2))

  //       setMainModelConfig(configData);

  //       // Загрузка заказа
  //       const orderResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/${id}`);
  //       if (!orderResponse.ok) {
  //         throw new Error("Не удалось загрузить заказ");
  //       }
  //       const orderData = await orderResponse.json();

  //       // console.log('orderData:', orderData)

  //       setOrder(orderData);
  //       setOldOrder(orderData); // Сохраняем старый заказ для сравнения изменений

  //       // Загрузка установщиков и технологов, объектов конфигурации
  //       const installersResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/installers`);
  //       const installersData = await installersResponse.json();
  //       setInstallers(installersData);

  //       const technicsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/technics`);
  //       const technicsData = await technicsResponse.json();
  //       setTechnics(technicsData);

  //       const orderConfigsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orderConfigs`);
  //       const orderConfigsData = await orderConfigsResponse.json();
  //       setOrderConfigs(orderConfigsData);
  //       setOldOrderConfigs(orderConfigsData); // Сохраняем старый объект надстройки для сравнения изменений

  //       const clientsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/clients`);
  //       const clientsData = await clientsResponse.json();
  //       setClients(clientsData);

  //       // Загрузка списка ячеек (fields)
  //       const fieldsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/fields`);
  //       const fieldsData = await fieldsResponse.json();
  //       setFields(fieldsData);

  //       // Загрузка списка типов оплат (paylists)
  //       const paylistsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/paylists`);
  //       const paylistsData = await paylistsResponse.json();
  //       setPaylists(paylistsData);

  //       // Загрузка данных объектов конфигураций
  //       const furnVendorsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/furnVendors`);
  //       setFurnVendors(await furnVendorsResponse.json());

  //       // Загрузка данных объектов конфигураций
  //       const fasadVendorsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/fasadVendors`);
  //       setFasadVendors(await fasadVendorsResponse.json());
        
  //       // Загрузка данных объектов конфигураций
  //       const workVendorsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/workVendors`);
  //       setWorkVendors(await workVendorsResponse.json());   

  //       // Загрузка статусов
  //       const statusesResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/statuses`);
  //       setStatuses(await statusesResponse.json());   

  //       //console.log('orderConfigsData:', JSON.stringify(orderConfigsData, null, 2))

  //       const permissionParamsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/role_permissionParams/${roleId}`);
  //       const dataParams = await permissionParamsResponse.json();  
        
  //       // console.log("dataParams = ", dataParams)
  //       setAccessibleParams(dataParams); // Сохраняем разрешенные параметры в Set для быстрого поиска

  //       // Работаем с комментариями
  //       axios.get(`${process.env.NEXT_PUBLIC_API_URL}/orders/${id}`)
  //       .then(response => {
  //         setComment1(response.data.comment1 || "");
  //         setComment2(response.data.comment2 || "");
  //       })
  //       .catch(error => console.error("Ошибка загрузки комментариев:", error));

  //     } catch (err) {
  //       setError(err.message);
  //     } finally {
  //       setLoading(false);
  //     }
  //   };

  //   fetchData();
  // }, [id, roleId]);

  


  useEffect(() => {
    const fetchData = async () => {
      try {
        const mainModelP = fetch(`${API}/mainModel`).then(r => r.json());
        const orderP = fetch(`${API}/orders/${id}`).then(r => r.json());
        const installersP = fetch(`${API}/installers`).then(r => r.json());
        const technicsP = fetch(`${API}/technics`).then(r => r.json());
        // const orderConfigsP = fetch(`${API}/orderConfigs`).then(r => r.json());
        const orderConfigsP = fetch(`${API}/orderConfigs?order_id=${id}`).then(r => r.json());
        const clientsP = fetch(`${API}/clients`).then(r => r.json());
        const fieldsP = fetch(`${API}/fields`).then(r => r.json());
        const paylistsP = fetch(`${API}/paylists`).then(r => r.json());
        const furnP = fetch(`${API}/furnVendors`).then(r => r.json());
        const fasadP = fetch(`${API}/fasadVendors`).then(r => r.json());
        const workP = fetch(`${API}/workVendors`).then(r => r.json());
        const statusesP = fetch(`${API}/statuses`).then(r => r.json());
        const permissionParamsP = fetch(`${API}/role_permissionParams/${roleId}`).then(r => r.json());

        // Дожидаемся только в одном месте
        const [
          mainModelData, orderData, installersData, technicsData,
          orderConfigsData, clientsData, fieldsData, paylistsData,
          furnData, fasadData, workData, statusesData, dataParams
        ] = await Promise.all([
          mainModelP, orderP, installersP, technicsP,
          orderConfigsP, clientsP, fieldsP, paylistsP,
          furnP, fasadP, workP, statusesP, permissionParamsP
        ]);

        setMainModelConfig(mainModelData);
        setOrder(orderData); setOldOrder(orderData);
        setInstallers(installersData);
        setTechnics(technicsData);
        setOrderConfigs(orderConfigsData); setOldOrderConfigs(orderConfigsData);
        setClients(clientsData);
        setFields(fieldsData);
        setPaylists(paylistsData);
        setFurnVendors(furnData);
        setFasadVendors(fasadData);
        setWorkVendors(workData);
        setStatuses(statusesData);
        setAccessibleParams(dataParams);
        setComment1(orderData.comment1 || "");
        setComment2(orderData.comment2 || "");

      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, roleId, API]);





  
  // Собираем параметры
  useEffect(() => { 
    const fetchAddonParams = async () => {
      // console.log('Длина orderConfigs = ' + JSON.stringify(orderConfigs, null, 2));
      try {
        const addonIds = [...new Set(orderConfigs.map(config => config.addon_id))]; // Берем уникальные addon_id
        

        const responses = await Promise.all(
          addonIds.map(id => axios.get(`${process.env.NEXT_PUBLIC_API_URL}/addons/${id}/config`))
        );
  
        const paramsMap = {};

        // console.log('responses= ' + JSON.stringify(responses, null, 2))

        // responses.forEach((response, index) => {
        //   console.log(`response[${index}].data =`, response.data);
        // });

        // Извлекаем params из всех ответов и объединяем в один массив
        const allParams = responses.flatMap(response => response.data.params);

        // console.log("allParams = " + allParams)

        // Сохраняем params в состоянии
        setAddonConfigs(allParams);


        responses.forEach(response => {
          if (response.data && response.data.params) {
            // Замените configId на addonId или другое поле, которое у вас есть в ответе
            paramsMap[response.data.params[0].configId] = response.data.params.reduce((acc, param) => {
              acc[param.paramName] = param.label;
              return acc;
            }, {});
          }
        });


        // console.log('paramsMap = ' + JSON.stringify(paramsMap, null, 2))
  
        setAddonParams(paramsMap);
      } catch (error) {
        console.error("Ошибка загрузки параметров надстроек:", error);
      }
    };
  
    fetchAddonParams();
  }, [orderConfigs]);



  // Для чекбоксов Состояний
  const handleCheckboxChange = (e) => {
    const { name, checked } = e.target;

  
    setOrder((prevOrder) => ({
      ...prevOrder,
      [name]: name === "active" ? checked : checked ? new Date().toISOString() : "",
    }));
  };


  // Для чекбоксов Статусов
  const handleCheckboxChangeStatus = (event) => {
    const { name, checked } = event.target;
    //console.log(order.data.statusData);

    const { Doplata, installmentPlan } = order.data;

    // // Проверяем, есть ли в installmentPlan незаполненные записи
    // const installmentPlanHasEmpty = installmentPlan?.some(
    //   item => !item.text || item.text.trim() === ""
    // );

    // Если installmentPlan — массив, проверяем на пустые записи, иначе считаем, что пустых записей нет
    const installmentPlanHasEmpty =
    Array.isArray(installmentPlan) &&
    installmentPlan.some(item => !item?.text || item.text.trim() === "");

    //console.log('installmentPlan raw:', JSON.stringify(installmentPlan));


    if (checked) {
      if (name === "orderPaid") {
        const doplataOk = Boolean(Doplata);
        const installmentPlanOk = !installmentPlanHasEmpty;
        // Для orderPaid достаточно одного: либо доплата, либо все installmentPlan
        if (!doplataOk && !installmentPlanOk) {
          toast("Нужно указать сумму доплаты или рассрочки!");
          return;
        }
      } 
    };  

    setOrder((prevOrder) => ({
      ...prevOrder,
      data: {
        ...prevOrder.data,
        statusData: {
          ...prevOrder.data.statusData,
          [name]: checked ? new Date().toISOString() : "", // Устанавливаем дату или очищаем
        },
      },
    }));
  };
  


  const getTypeForParam = (paramName) => {
    const param = addonConfigs.find(config => config.paramName === paramName);
    return param ? param.type : "string"; // Если не нашли, возвращаем тип по умолчанию
  };

  const getSourceForParam = (paramName) => {
    const param = addonConfigs.find(config => config.paramName === paramName);
    return param ? param.source : "string"; // Если не нашли, возвращаем тип по умолчанию
  };

  const tryArchiveLinkedConsultation = async (updatedOrder) => {
    try {
      const statusData = updatedOrder?.data?.statusData || {};
      const readyInstalled = Boolean(statusData?.orderInstalled);
      const readyPaid = Boolean(statusData?.orderPaid);
      if (!readyInstalled || !readyPaid) return;
      const updRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/${updatedOrder.id}/archive-linked-consult`, {
        method: 'POST',
      });
      if (!updRes.ok) {
        console.warn('[order:auto-archive-consult] request failed', { status: updRes.status });
        return;
      }
      const payload = await updRes.json().catch(() => ({}));
      if (payload?.archived) {
        console.log('[order:auto-archive-consult] archived', {
          consultId: payload?.consultId ?? null,
        });
      }
    } catch (e) {
      console.warn('[order:auto-archive-consult] error', e);
    }
  };

  

  const handleChange = (paramName, value) => {
    setOrder((prevOrder) => ({
      ...prevOrder,
      data: {
        ...prevOrder.data,
        [paramName]: value,
      },
    }));
  };

  

  // Для надстроек
  const handleChangeAddons = (configId, key, newValue) => {
    setOrderConfigs((prevConfigs) => {
      return prevConfigs.map((config) => {
        if (config.id === configId) {
          const updatedConfig = {
            ...config,
            data: {
              ...config.data,
              [key]: newValue,
            },
          };
          return updatedConfig;
        }
        return config;
      });
    });
  };
  
  
  // Сохранение конфигураций
  const sendUpdateToServer = async (updatedConfigs) => {
    try {
      // Предположим, что `updatedConfigs` содержит id для каждой конфигурации
      // Идем по всем конфигурациям и обновляем их по ID
      await Promise.all(updatedConfigs.map(async (config) => {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orderConfigs/${config.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(config), // отправляем полные данные для обновления
        });
  
        if (!response.ok) {
          throw new Error(`Ошибка при обновлении данных для config ID: ${config.id}`);
        }
        // const result = await response.json();
        // console.log("Данные успешно обновлены для config ID:", config.id, result);
      }));
    } catch (error) {
      console.error("Ошибка при отправке данных:", error);
    }
  };
  

  useEffect(() => {
    if (orderConfigs.length > 0) {
      sendUpdateToServer(orderConfigs);
    }
  }, [orderConfigs]);

  // Существующий расчёт конечной даты заказа. Его семантика намеренно сохранена:
  // карточка заказа и данные в БД продолжают считать даты так же, как раньше.
  function calculateEndDate(
    startDateStr,
    workingDays,
    workOnWeekendConfig = { holiday: false, saturday: false, sunday: false },
    holidays = []
  ) {
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
      const currentDateStr = currentDate.toISOString().split("T")[0];
      const dayOfWeek = currentDate.getDay();
      let isWorkingDay = true;

      if (dayOfWeek === 6 && !workOnWeekendConfig.saturday) {
        isWorkingDay = false;
      }
      if (dayOfWeek === 0 && !workOnWeekendConfig.sunday) {
        isWorkingDay = false;
      }

      if (holidays.includes(currentDateStr)) {
        if (dayOfWeek === 6 && workOnWeekendConfig.saturday) {
          isWorkingDay = true;
        } else if (dayOfWeek === 0 && workOnWeekendConfig.sunday) {
          isWorkingDay = true;
        } else {
          isWorkingDay = false;
        }
      }

      if (workOnWeekendConfig.holiday === true) {
        isWorkingDay = true;
      }

      if (isWorkingDay) {
        daysCounted++;
      }

      if (daysCounted < workingDays) {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    return currentDate.toISOString();
  }

  // // Функция вычисления конечной даты заказа с учетом выходных дней
  // function calculateEndDate(startDateStr, workingDays, workOnWeekendConfig = { holiday: false, saturday: false, sunday: false }, holidays = []) {

  //   // console.log("startDateStr", startDateStr)
  //   // console.log("workingDays", workingDays)
  //   console.log("workOnWeekendConfig =", workOnWeekendConfig)

  //   if (!startDateStr) {
  //     throw new Error("Дата начала отсутствует!");
  //   }

  //   const startDate = new Date(startDateStr);
  //   if (isNaN(startDate.getTime())) {
  //     throw new Error("Неверная дата начала: " + startDateStr);
  //   }
    
  //   let daysCounted = 0;
  //   let currentDate = new Date(startDate);
  
  //   while (daysCounted < workingDays) {
  //     const currentDateStr = currentDate.toISOString();
  //     const day = currentDate.getDay();
      
  //     // Если установщик готов работать в данный день или это не выходной по умолчанию
  //     let isWorkingDay = true;
  //     if (day === 6) { // суббота
  //       isWorkingDay = workOnWeekendConfig.saturday;
  //     }
  //     if (day === 0) { // воскресенье
  //       isWorkingDay = workOnWeekendConfig.sunday;
  //     }

  //     // Если есть список праздничных дней, то их тоже можно исключить:
  //     if (holidays.includes(currentDateStr.split("T")[0])) {
  //       isWorkingDay = false;
  //     }

  //     if (workOnWeekendConfig.holiday === true) {
  //       isWorkingDay = workOnWeekendConfig.holiday;
  //     }
      
  //     // Если это рабочий день, увеличиваем счетчик
  //     if (isWorkingDay) {
  //       daysCounted++;
  //     }
      
  //     // Если мы еще не достигли требуемого количества рабочих дней, переходим к следующему дню
  //     if (daysCounted < workingDays) {
  //       currentDate.setDate(currentDate.getDate() + 1);
  //     }
  //   }
    
  //   console.log("Конечная дата:", currentDate.toISOString());
    
  //   return currentDate.toISOString();
  // }
  

  // Сохранение
  const saveOrder = async () => {
    try {
      setIsSaving(true);
      const saved = await handleSave();
      if (saved) router.push('/orders'); // Перенаправляем только после успешного сохранения
      return saved;
    } finally {
      setIsSaving(false);
    }
  };


  // Само сохранение
  const handleSave = async () => {
    setIsSaving(true);
    try {

      // Обновляем order.data, включая чекбоксы
      const updatedData = {
        ...order.data,
        // active: order.active,
      };

      const holidayDates = getActiveHolidayDates(holidayConfigs);
      const weekendConfig = updatedData.workOnWeekendConfig;

      if (!isWorkingDate(updatedData.param15, weekendConfig, holidayDates)) {
        throw new Error("Дата установки должна быть рабочим днём для выбранного установщика");
      }

      const calculatedInstallEnd = calculateEndDate(
        updatedData.param15,
        Number(updatedData.param16),
        weekendConfig,
        holidayConfigs.map(cfg => cfg.date)
      );

      // console.log("🚀 param15:", updatedData.param15);
      // console.log("🚀 param16:", updatedData.param16);
      // console.log("🚀 workOnWeekendConfig:", updatedData.workOnWeekendConfig);
      // console.log("🚀 holidays:", holidayConfigs.map(cfg => cfg.date));

      updatedData.endDate = calculatedInstallEnd;

      if (updatedData.sborkaDays && Number(updatedData.sborkaDays) != 0)

      {
        if (!isWorkingDate(updatedData.sborkaDate, weekendConfig, holidayDates)) {
          throw new Error("Дата сборки должна быть рабочим днём для выбранного установщика");
        }
        const calculatedAssemblyEnd = calculateEndDate(
          updatedData.sborkaDate,
          Number(updatedData.sborkaDays),
          weekendConfig,
          holidayConfigs.map(cfg => cfg.date)
        );
        if (calculatedAssemblyEnd.slice(0, 10) >= String(updatedData.param15).slice(0, 10)) {
          throw new Error("Сборка не может пересекаться с установкой");
        }
        updatedData.sborkaEndDate = calculatedAssemblyEnd;
      }

      // Обновляем order с новыми данными
      const updatedOrder = {
        ...order,
        data: updatedData, // Обновленные данные
        comment1,       // новые значения комментариев из состояния
        comment2,
        active: order.active,
      };


      // -----------------------  Нормализация конфигов для логирования ----------------------- //

      // 0.1) Базовый набор полей из mainModelConfig и addonConfigs
      const mainFields  = Array.isArray(mainModelConfig)  ? mainModelConfig  : [];
      const addonFields = Array.isArray(addonConfigs)     ? addonConfigs     : [];

      // console.log( " addonFields = ", addonFields)

      // 0.3) «Виртуальные» поля (топ‑уровень)
      const commentFields = [
        { paramName: 'comment1', label: 'Комментарий 1', type: 'text', isTopLevel: true },
        { paramName: 'comment2', label: 'Комментарий 2', type: 'text', isTopLevel: true },
        { paramName: 'active', label: 'Активность', type: 'boolean', isTopLevel: true }
      ];

      // 0.4) Добавляем отдельно «Конфиг выходных»
      //      Этот объект в order.data хранится под ключом 'workOnWeekendConfig'
      const weekendField = {
        paramName: 'workOnWeekendConfig',
        label:     'Работа в выходные',
        type:  'weekend',
        // можете не указывать type, или дать type: 'weekend'
        // важно при сравнении опознавать это поле именно по paramName
      };

      // «Статусы» теперь представляем единым полем statusData
      const statusField = {
        paramName: 'statusData',
        label:     'Статусы заказа',
        type:      'statusData'
      };

      // 0.4) Собираем всё вместе
      const allFieldsConfig = [
        ...mainFields, 
        ...addonFields, 
        statusField,
        ...commentFields,
        weekendField
      ];
      // console.log("orderConfigs = ", orderConfigs)
      // ----------------------------------------------------------------------------


      // ------------------ 1) Проходим по allFieldsConfig и находим изменения ------------------ //
      const otherFieldsChanged = [];   // для обычных полей (не _admin, не статус)
      const statusFieldsChanged = [];  // для полей типа 'status'


      // Проверяем тип полей параметров для логирования нужных
      allFieldsConfig.forEach(field => {
        const key = field.paramName; // например, "installmentPlan", "param15", "param17" и т.д.
        let changed = false; 
       
        // Если поле привязано к надстройке (configId)
        if (field.configId) {
          // 1) Собираем все старые надстройки этого заказа с нужным addon_id и полем key
          const oldMatches = oldOrderConfigs.filter(item =>
            Number(item.order_id) === Number(id) &&
            Number(item.addon_id) === Number(field.configId) &&
            Object.prototype.hasOwnProperty.call(item.data, key)
          );

          // 2) Собираем все новые надстройки (orderConfigs) по тем же условиям
          const newMatches = orderConfigs.filter(item =>
            Number(item.order_id) === Number(id) &&
            Number(item.addon_id) === Number(field.configId) &&
            Object.prototype.hasOwnProperty.call(item.data, key)
          );

          // 3) Проходим по каждому старому совпадению
          for (const oldCfg of oldMatches) {
            // Ищем его «новый» аналог по уникальному id
            const newCfg = newMatches.find(nc => nc.id === oldCfg.id);

            const oldVal = oldCfg.data[key];
            const newVal = newCfg?.data?.[key];


            // 1.4) Если это «workOnWeekendConfig» (объект с keys sunday/holiday/saturday)
            if (field.paramName === 'workOnWeekendConfig') {
              // Оба oldVal и newVal ожидаем как объекты вида { sunday: bool, holiday: bool, saturday: bool }
              const days = ['sunday', 'holiday', 'saturday'];
              const diffs = days.filter(day => {
                const oldBool = Boolean(oldVal?.[day]);
                const newBool = Boolean(newVal?.[day]);
                return oldBool !== newBool;
              });
              if (diffs.length > 0) {
                changed = true;
              }  

            // 2.4) Иначе если это «чекбокс+текст» (пример: param8)
            } else if (
              oldVal !== null
              && field.type.startsWith('check_text')
            ) {
              // Считаем, что у newVal либо тоже объект {checked,text}, либо undefined/null
              const oldChecked = Boolean(oldVal?.checked);
              const newChecked = Boolean(newVal?.checked);
              const oldText    = oldVal?.text ?? "";
              const newText    = newVal?.text ?? "";
              if (oldChecked !== newChecked || oldText !== newText) {
                changed = true;
              }
              
            } else if (field.type.startsWith('check_date')) {
              // Считаем, что у newVal либо тоже объект {checked,text}, либо undefined/null
              const oldChecked = Boolean(oldVal?.checked);
              const newChecked = Boolean(newVal?.checked);
              const oldDate    = oldVal?.date ?? "";
              const newDate    = newVal?.date ?? "";
              if (oldChecked !== newChecked || oldDate !== newDate) {
                changed = true;
              }     

            } else {
              // 1.2.3) Все остальные простые поля (в том числе comment1/comment2 и обычные поля из main/addon)
              const oldSimple = oldVal == null ? '' : String(oldVal);
              const newSimple = newVal == null ? '' : String(newVal);
              // console.log("oldSimple = ", oldSimple)
              // console.log("newSimple = ", newSimple)
              if (oldSimple !== newSimple) {
                changed = true;
              }
            }

            // 5) Если изменилось — пушим в общий массив
            if (changed) {
              otherFieldsChanged.push({ field, oldVal, newVal });
              // console.log("Пушим в otherFieldsChanged", field.paramName, oldVal, newVal);
            }
          }  

          // С заказов
          } else {
            const oldVal = field.isTopLevel
              ? oldOrder[key]
              : oldOrder.data?.[key];
            const newVal = field.isTopLevel
              ? updatedOrder[key]
              : updatedOrder.data?.[key];


            if (field.type === 'statusData') {
            // 1) Получаем старое/новое состояние статусов
            const oldSD = oldVal || {};   // например, oldVal = oldOrder.data.statusData
            const newSD = newVal || {};   // newVal = updatedOrder.data.statusData

            // 2) Debug
            // console.log("=== Блок statusData ===");
            // console.log("oldSD:", oldSD);
            // console.log("newSD:", newSD);
            // console.log("statuses:", statuses);

            // 3) Проходим по каждому статусу из массива statuses
            for (const { key: statusKey, name: statusLabel } of statuses) {
              const oldDate = oldSD[statusKey] || "";
              const newDate = newSD[statusKey] || "";
              // console.log(`Сравниваем статус ${statusKey}: old="${oldDate}", new="${newDate}"`);
              if (oldDate !== newDate) {
                // console.log(`→ Статус ${statusKey} поменялся (${oldDate} → ${newDate}), пушим в статусные изменения`);
                statusFieldsChanged.push({
                  // statusKey,    // "orderPaid", "defected" и т. д.
                  label:   statusLabel,
                  oldDate,
                  newDate
                });
              }
            }

            // 4) Если хоть один статус в статусData изменился — помечаем changed = true
            if (statusFieldsChanged.length > 0) {
              changed = true;
            }
          }

          // 1.4) Если это «workOnWeekendConfig» (объект с keys sunday/holiday/saturday)
          else if (field.paramName === 'workOnWeekendConfig') {
            // Оба oldVal и newVal ожидаем как объекты вида { sunday: bool, holiday: bool, saturday: bool }
            const days = ['sunday', 'holiday', 'saturday'];
            const diffs = days.filter(day => {
              const oldBool = Boolean(oldVal?.[day]);
              const newBool = Boolean(newVal?.[day]);
              return oldBool !== newBool;
            });
            if (diffs.length > 0) {
              changed = true;
            }  

          // 2.4) Иначе если это «чекбокс+текст» (пример: param8)
          } else if (
            oldVal !== null
            && field.type.startsWith('check_text')
          ) {
            // Считаем, что у newVal либо тоже объект {checked,text}, либо undefined/null
            const oldChecked = Boolean(oldVal?.checked);
            const newChecked = Boolean(newVal?.checked);
            const oldText    = oldVal?.text ?? "";
            const newText    = newVal?.text ?? "";
            if (oldChecked !== newChecked || oldText !== newText) {
              changed = true;
            }
            
          } else if (field.type.startsWith('check_date')) {
            // Считаем, что у newVal либо тоже объект {checked,text}, либо undefined/null
            const oldChecked = Boolean(oldVal?.checked);
            const newChecked = Boolean(newVal?.checked);
            const oldDate    = oldVal?.date ?? "";
            const newDate    = newVal?.date ?? "";
            if (oldChecked !== newChecked || oldDate !== newDate) {
              changed = true;
            }     

          } else {
            // 1.2.3) Все остальные простые поля (в том числе comment1/comment2 и обычные поля из main/addon)
            const oldSimple = oldVal == null ? '' : String(oldVal);
            const newSimple = newVal == null ? '' : String(newVal);
            // console.log("oldSimple = ", oldSimple)
            // console.log("newSimple = ", newSimple)
            if (oldSimple !== newSimple) {
              changed = true;
            }
          }

          // 5) Если изменилось — пушим в общий массив
          if (changed && field.type != 'statusData') {
            otherFieldsChanged.push({ field, oldVal, newVal });
            // console.log("Пушим в otherFieldsChanged", field.paramName, oldVal, newVal);
          }

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

      // ------------------------------- 3) Логика для status-полей ------------------------------- //
      if (statusFieldsChanged.length > 0) {
        // Для каждого статуса пишем, было ли снято/поставлено или дата изменилась
        for (const { label, oldDate, newDate } of statusFieldsChanged) {

          const oldStr = oldDate ? oldDate : "-";
          const newStr = newDate ? newDate : "-";

          const oldDat = oldStr.split("T")[0];
          const newDat = newStr.split("T")[0];
          const parseAndFormatDate = (dateStr) => {
            const date = new Date(dateStr);
            return isNaN(date) ? '' : format(date, 'dd-MM-yyyy');
          };
          const formatoldDate = parseAndFormatDate(oldDat)
          const formatnewDate = parseAndFormatDate(newDat)



          await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orderLogs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order_id: updatedOrder.id,
              action: `Статус "${label}": [${formatoldDate}] → [${formatnewDate}]`,
              user: currentUserName,
              timestamp: new Date().toISOString()
            }),
          });
        }
      }  

      // ------------------------------- 4) Логика для остальных полей ------------------------------- //
      // (включая comment1/comment2, полей из mainModelConfig и addonConfigs, за исключением тех, у кого type.endsWith('_admin') или type==='status')
      if (otherFieldsChanged.length > 0) {
        
        // Поиск имени по id из списка
        function lookupFromSource(id, source) {
          if (id == null) return "";
          const obj = source.find(item => item.id === Number(id));
          return obj ? obj.name : String(id);
        }

        for (const { field, oldVal, newVal } of otherFieldsChanged) {
          let oldSimple, newSimple;
          //    console.log("field = ", field)

          // 4.1) Если это workOnWeekendConfig
          if (field.paramName === 'workOnWeekendConfig') {
            // Пройдём по каждому дню, чтобы вычленить только изменившиеся флаги
            const days = ['sunday', 'holiday', 'saturday'];

            const changeParts = [];
            days.forEach(day => {
              const oldBool = Boolean(oldVal?.[day]);
              const newBool = Boolean(newVal?.[day]);
              if (oldBool !== newBool) {
                changeParts.push(`${day}: [${oldBool}] → [${newBool}]`);
              }
            });

            // Если хотим вывести только изменившиеся, запишем их через запятую
            const joined = changeParts.join(', ');
            oldSimple = `см. изменения`;  // само «старое» значение целиком можно не дублировать
            newSimple = joined.length > 0 ? joined : '';
          }
          //  Если это «чекбокс + текст» (param8 и подобные)
          else if (field.type.startsWith('check_text')
            ) {
            // Берём старые/новые значения checked и text
            const oldChecked = Boolean(oldVal?.checked);
            const newChecked = Boolean(newVal?.checked);
            const oldText    = oldVal?.text ?? "";
            const newText    = newVal?.text ?? "";

            oldSimple = `активность: [${oldChecked}] , текст: [${oldText}]`;
            newSimple = `активность: [${newChecked}] , текст: [${newText}]`;
          } 
          else if (field.type.startsWith('check_date')
            ) {

            // Берём старые/новые значения checked и text
            const oldChecked = Boolean(oldVal?.checked);
            const newChecked = Boolean(newVal?.checked);
            const oldDate = oldVal?.date ?? "";
            const newDate = newVal?.date ?? "";
            const parseAndFormatDate = (dateStr) => {
              const date = new Date(dateStr);
              return isNaN(date) ? '' : format(date, 'dd-MM-yyyy');
            };
            const formatoldDate = parseAndFormatDate(oldDate)
            const formatnewDate = parseAndFormatDate(newDate)
            oldSimple = `активность: [${oldChecked}] , дата: [${formatoldDate}]`;
            newSimple = `активность: [${newChecked}] , дата: [${formatnewDate}]`;

            // console.log("oldSimple = ", oldSimple)
            // console.log("newSimple = ", newSimple)

          } 
          else if (field.type.startsWith('date')) {

            const oldDate = oldVal ?? "";
            const newDate = newVal ?? "";

            const parseAndFormatDate = (dateStr) => {
              const date = new Date(dateStr);
              return isNaN(date) ? '' : format(date, 'dd-MM-yyyy');
            };

            const formatoldDate = parseAndFormatDate(oldDate);
            const formatnewDate = parseAndFormatDate(newDate);

            oldSimple = `${formatoldDate}`;
            newSimple = `${formatnewDate}`;
          }

          else if (
            oldVal !== null
            && field.type === 'list'
          ) {
            const source = getOptionsForList(field.source)
            oldSimple = lookupFromSource(oldVal, source);
            newSimple = lookupFromSource(newVal, source);

          }

          else {
            // для всех остальных — просто приводим к строке
            oldSimple = oldVal == null ? '' : String(oldVal);
            newSimple = newVal == null ? '' : String(newVal);
          }

          // === базовая строчка для этого поля ===
          let actionForThisField = `"${field.label}": [${oldSimple}] → [${newSimple}]`;

          // === если поле админское, спрашиваем причину и дополняем ===
          if (field.type.endsWith('_admin')) {
            const reason = await showModalAndAskReason(field.label);
            if (!reason) {
              toast("Изменение отменено. Причина обязательна.");
              throw new Error("Причина не указана");
            }
            actionForThisField += ` Причина: ${reason}`;
          }

          // === один fetch на каждое поле ===
          await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orderLogs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order_id: updatedOrder.id,
              action:   actionForThisField,
              user:     currentUserName,
              timestamp: new Date().toISOString(),
            }),
          });
        }
      }



      // ---------------------------------------------------------------------------------- //

      // Сохраняем
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          updatedData: updatedOrder, // Отправляем обновленный объект
          active: order.active,
        }),
      });

      // console.log("Сохраняемые данные:", {
      //   active: order.active,
      // });
      // console.log('updatedOrder = ', updatedOrder)
  
      if (!response.ok) {
        throw new Error("Ошибка при сохранении заказа");
      }
  
      // Сохранение комментариев
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/orders/${id}/comments`, {
        comment1,
        comment2
      });

      // console.log("Заказ успешно сохранен!");
      await tryArchiveLinkedConsultation(updatedOrder);

    setOldOrder(JSON.parse(JSON.stringify(updatedOrder)));
    // А также обновляем локальный order, чтобы UI сразу отрисовал новые значения
    setOrder(JSON.parse(JSON.stringify(updatedOrder)));

    setOldOrderConfigs(orderConfigs);

    return true;


    } catch (err) {
      toast(`Ошибка: ${err.message}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  };
  

  const handleSaveAndRedirect = async () => {
    const saved = await saveOrder();
    if (!saved) return;
    const adress = order?.data.param5 ?? ''; // адрес
    const article = order?.data.param9 ?? ''; // изделие
    // const orderID = order?.id ?? ''; // ID заказа
    const search = String(adress + ';' + article);
    router.push(`/main?search=${encodeURIComponent(search)}`); // Передача в URL
  };


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
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/${params.id}`, {
            method: 'DELETE',
        });

        if (response.ok) {
            router.push('/orders');
        } else {
            throw new Error('Ошибка при удалении заказа');
        }
    } catch (error) {
        console.error(error);
        toast('Не удалось удалить заказ.');
    }
  };


  // Функция определения label
  const getLabel = (paramName) => {
    // console.log("paramName = ", paramName)
    if (paramName === "order_number") return "Номер заказа";
    const config = mainModelConfig.find((config) => config.paramName === paramName);
    return config ? config.label : "❌";
  };

  
  // Выбор источника
  const getOptionsForList = (source) => {
    if (source === "fields") return fields;
    if (source === "technics") return technics;
    if (source === "installers") return installers;
    if (source === "furnVendors") return furnVendors;
    if (source === "fasadVendors") return fasadVendors;
    if (source === "workVendors") return workVendors;
    if (source === "clients") return clients;
    if (source === "paylists") return paylists;
    return [];
  };


  // Функция удаления надстройки
  const destroyAddon = async (id) => {

    if (confirm('Уверены что хотите удалить?')) {

      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orderConfigs/${id}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          setOrderConfigs(prevConfigs => prevConfigs.filter(config => config.id !== id));
        } else {
          throw new Error('Ошибка при удалении объекта');
        }
      } catch (error) {
        console.error(error);
        toast('Не удалось удалить объект.');
      }
    }
  };


  // Функция проверки занятости установщика на день установки
  const isBusyDay = async (selectedDate) => {
    const installerObj = order.data.param17;
    const ordersInstaller = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/orders?installer=${Number(installerObj)}`
    );
    const ordersInstallerData = await ordersInstaller.json();

    // Приведём selectedDate к Date-объекту один раз
    const selected = new Date(selectedDate);

    // Флаг, который станет true, если selected попадёт хотя бы в один интервал
    let isBusy = false;

    for (const singleOrder of ordersInstallerData) {
      // вычисляем дату начала и конца для каждого заказа
      const startDate = new Date(singleOrder.data.param15);
      const endDate = new Date(singleOrder.data.endDate)

      const startSborka = new Date(singleOrder.data.sborkaDate)
      const daysSborka = singleOrder.data.sborkaDays || 0

      // Конец сборки = начало сборки + количество дней - 1
      // End of assembly = start + days - 1
      const endSborka = new Date(startSborka);
      endSborka.setDate(startSborka.getDate() + daysSborka);

      // Если selected попадает в [startDate, endDate], значит в этот день установщик занят
      // Проверяем попадание в любой из двух диапазонов
      const inInstallPeriod = startDate <= selected && selected < endDate;
      const inSborkaPeriod = startSborka <= selected && selected < endSborka;

      if (inInstallPeriod || inSborkaPeriod) {
        isBusy = true;
        break;
      }
    }

    // Если мы не вышли из цикла с isBusy=true, значит selected не попал ни в один из интервалов
    return isBusy;
  };

  if (loading) {
    return <Spinner />;
  }

  if (error) {
    return <p>Ошибка: {error}</p>;
  }

  if (!order) {
    return <p>Заказ не найден</p>;
  }

  const { data } = order;

  // console.log("data:", data);

  // Генерация номера заказа
  const orderNumber = order.data.order_number;

  const currentOrderId =  order.id


  return (

    <div className="order-page px-3 pb-6 sm:px-4">
      <h1 className="break-words text-center text-2xl sm:text-3xl">Заказ: {orderNumber}</h1>

      {/* Чекбоксы в одной строке */}
      {/* {accessibleParams.some(p => p.param === "statuses") && (
        
      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-6 mt-6 border border-gray-200">
        <h3 className="text-xl font-semibold text-gray-700 mb-4">Статус заказа</h3>

        <div className="flex justify-between gap-x-8">
          {[
            { label: "Активен", name: "active", value: order.active },
          ].map(({ label, name, value }) => (
            <div key={name} className="flex flex-col items-center p-3 border border-gray-300 rounded-lg shadow-sm bg-white">
              <label className="text-gray-600 text-sm mb-1">{label}:</label>
              <input
                type="checkbox"
                name={name}
                checked={value === true}
                onChange={handleCheckboxChange}
                className="rounded focus:ring-2 focus:ring-blue-500"
                disabled={!accessibleParams.find(p => p.param === "statuses")?.canEdit}
              />
              <span className="text-sm text-gray-500 mt-1 min-h-[20px]">
                {name === "active"}
              </span>

            </div>
          ))}
          {[...statuses]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map(({ name, key }) => (
              <div key={key} className="flex flex-col items-center p-3 border border-gray-300 rounded-lg shadow-sm bg-white">
                <label className="text-gray-600 text-sm mb-1">{name}</label>
                <input
                  type="checkbox"
                  name={key}
                  checked={order?.data?.statusData?.[key] !== ""}
                  onChange={handleCheckboxChangeStatus}
                  className="rounded focus:ring-2 focus:ring-blue-500"
                  disabled={!accessibleParams.find(p => p.param === "statuses")?.canEdit}
                />
                <span className="text-sm text-gray-500 mt-1 min-h-[20px]">
                  {order?.data?.statusData?.[key] ? new Date(order.data.statusData[key]).toLocaleDateString("ru-RU") : "❌"}
                </span>
              </div>
          ))}
        </div>

      </div>
      )} */}



      {/* Чекбоксы в одной строке */}
      {(Array.isArray(accessibleParams) && accessibleParams.some(p => p.param === "statuses" || p.param === "orderPaid")) && (
        <div className="max-w-5xl mx-auto bg-white shadow-lg rounded-lg p-4 sm:p-6 mt-4 sm:mt-6 border border-gray-200">
          <h4 className="text-xl font-semibold text-gray-700 mb-4">Статусы заказа</h4>

          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:justify-between sm:gap-4">

            <div className="flex flex-col items-center p-3 border border-gray-300 rounded-lg shadow-sm bg-white">
              <label className="text-gray-600 text-sm mb-1">Активен:</label>
              <input
                type="checkbox"
                name="active"
                checked={order.active === true}
                onChange={handleCheckboxChange}
                className="rounded focus:ring-2 focus:ring-blue-500"
                disabled={!accessibleParams.find(p => p.param === "statuses")?.canEdit}
              />
              <span className="text-sm text-gray-500 mt-1 min-h-[20px]">active</span>
            </div>


            {[...statuses]
              .filter(status => status.key !== "orderPaid")
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map(({ name, key }) => (
                <div
                  key={key}
                  className="flex flex-col items-center p-3 border border-gray-300 rounded-lg shadow-sm bg-white"
                >
                  <label className="text-gray-600 text-sm mb-1">{name}</label>
                  <input
                    type="checkbox"
                    name={key}
                    checked={order?.data?.statusData?.[key] !== ""}
                    onChange={handleCheckboxChangeStatus}
                    className="rounded focus:ring-2 focus:ring-blue-500"
                    disabled={!accessibleParams.find(p => p.param === "statuses")?.canEdit}
                  />
                  <span className="text-sm text-gray-500 mt-1 min-h-[20px]">
                    {order?.data?.statusData?.[key]
                      ? new Date(order.data.statusData[key]).toLocaleDateString("ru-RU")
                      : "❌"}
                  </span>
                </div>
              ))}


            {accessibleParams.some(p => p.param === "orderPaid") && (
              <div className="flex flex-col items-center p-3 border border-gray-300 rounded-lg shadow-sm bg-white">
                <label className="text-gray-600 text-sm mb-1">Заказ доплачен</label>
                <input
                  type="checkbox"
                  name="orderPaid"
                  checked={!!order?.data?.statusData?.orderPaid}
                  onChange={handleCheckboxChangeStatus}
                  disabled={!accessibleParams.find(p => p.param === "orderPaid")?.canEdit}
                  className="rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-500 mt-1 min-h-[20px]">
                  {order?.data?.statusData?.orderPaid
                    ? new Date(order.data.statusData.orderPaid).toLocaleDateString("ru-RU")
                    : "❌"}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      
      {/** Блок вывода основных данных */}      
      <div className="order-page-card max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-4 sm:p-6 mt-4 sm:mt-6 border border-gray-200">
        <h3 className="text-xl font-semibold text-gray-700 mb-4">Основные данные</h3>
        
        <table className="w-full border-collapse border border-gray-300 rounded-lg overflow-hidden">
          <thead className="bg-gray-100">
            <tr>
              <th className="border border-gray-300 px-4 py-2 text-left">Параметр</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Значение</th>
            </tr>
          </thead>
          <tbody>
            
            {accessibleParams.some((p) => p.param === "order_number") && (() => {
              const canEdit = accessibleParams.find(p => p.param === "order_number")?.canEdit ?? false;
              return (
                <tr>
                  <td className="border border-gray-300 px-4 py-2">Номер заказа</td>
                  <td className="border border-gray-300 px-4 py-2">
                    <input
                      className="w-full p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                      type="text"
                      placeholder=""
                      value={order.data["order_number"] || ""}
                      onChange={(e) => handleChange("order_number", e.target.value)}
                      disabled={!canEdit}               
                    />
                  </td>
                </tr>
              );
            })()}

              {/* {Object.entries(data)
                .filter(([key]) => {
                  const cfg = mainModelConfig.find((cfg) => cfg.paramName === key);
                  return cfg?.type !== "addon" && key !== "workOnWeekendConfig";
                })
                .filter(([key]) => accessibleParams.some(p => p.param === key)) // 🔹 Оставляем только доступные параметры
                .filter(([key]) => key !== "order_number") // 🔥 Исключаем "order_number" так как он сделан выше
                .map(([key, value], index) => {
                  const config = mainModelConfig.find((cfg) => cfg.paramName === key);
                  const type = config?.type || "string";
                  const source = config?.source;
                  const canEdit = accessibleParams.find(p => p.param === key)?.canEdit ?? false; // Проверяем право редактирования */}

              {mainModelConfig
                .filter(cfg => cfg.type !== "addon" && cfg.paramName !== "workOnWeekendConfig")
                .filter(cfg => accessibleParams.some(p => p.param === cfg.paramName)) // 🔹 Оставляем только доступные параметры
                .filter(cfg => cfg.paramName !== "order_number") // 🔥 Исключаем "order_number" так как он сделан выше
                .map((cfg, index) => {
                  const key = cfg.paramName;
                  const rawValue = data[key];
                  let value = rawValue;
                  const type = cfg.type || "string";
                  const source = cfg.source;
                  const label = getLabel(key);
                  const access = accessibleParams.find(p => p.param === key);
                  const canEdit = access?.canEdit ?? false;
                  const canCheck = access?.canCheck ?? false;
                  const selectedEmployee = (source === "technics" || source === "installers")
                    ? getOptionsForList(source).find(option =>
                        String(option.id) === String(rawValue) || String(option.name) === String(rawValue)
                      )
                    : null;
                  const isPhoneField = /^телефон(?:\s|$|\s*пр\.?)/i.test(label);
                  const isAddressField = /^адрес/i.test(label);
                  const actionPhone = isPhoneField ? rawValue : selectedEmployee?.phone;
                  const phoneHref = !isMasked ? normalizePhoneHref(actionPhone) : "";
                  const mapHref = !isMasked && isAddressField && rawValue
                    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(rawValue))}`
                    : "";


                  const maskParams = ['param1', 'param2', 'param5'];
                  const maskAll = ['param10', 'param11']

                  if (isMasked && maskParams.includes(key)) {
                    value = value.slice(0, 3) + '*'.repeat(value.length - 3);
                  }
                  
                  if (isMasked && maskAll.includes(key)) {
                    value = '***';
                  }


                  return (
                    <tr key={key} className={`${index % 2 === 0 ? "bg-gray-50" : "bg-white"} hover:bg-gray-100`}>
                      <td className="border border-gray-300 px-4 py-2">{label}</td>
                      <td className="border border-gray-300 px-4 py-2">
                                              
                      {/* Тип string */}
                      {type === "string" && (
                        <AutoResizeTextarea
                          value={value || ""}
                          onChange={(e) => handleChange(key, e.target.value)}
                          className="w-full p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                          disabled={!canEdit}
                        />
                      )}
                      {/* Тип number */}
                      {type === "number" && (
                        <input
                          type="number"
                          value={value || 0}
                          onChange={(e) => handleChange(key, e.target.value)}
                          className="w-full p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                          disabled={!canEdit}
                        />
                      )}
                      {/* Тип boolean */}
                      {type === "boolean" && (
                        <input
                          type="checkbox"
                          checked={value}
                          onChange={(e) => handleChange(key, e.target.checked)}
                          className="rounded focus:ring-2 focus:ring-blue-500"
                          disabled={!canEdit}
                        />
                      )}
                      {/* Тип date */}
                      {type === "date" && key != "param15" &&  (
                        <input
                          type="date"
                          value={value || ""}
                          onChange={(e) => {
                            const selectedDate = e.target.value;
                            if (key === "sborkaDate") {
                              const holidayDates = getActiveHolidayDates(holidayConfigs);
                              if (!isWorkingDate(selectedDate, order.data?.workOnWeekendConfig, holidayDates)) {
                                toast("Дата сборки должна быть рабочим днём для выбранного установщика.");
                                return;
                              }
                            }
                            handleChange(key, selectedDate);
                          }}
                          className="w-full p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                          disabled={!canEdit}
                        />
                      )}
                      {/* Тип date */}
                      {type === "date" && key === "param15" && (
                      <input
                        type="date"
                        value={value}
                        onChange={ async (e) => {
                          const selectedDate = e.target.value;
                          const holidayDates = getActiveHolidayDates(holidayConfigs);
                          if (!isWorkingDate(selectedDate, order.data?.workOnWeekendConfig, holidayDates)) {
                            toast("Дата установки должна быть рабочим днём для выбранного установщика.");
                            return;
                          }

                          const busy = await isBusyDay(selectedDate);  
                          if (busy) {
                            toast("Внимание! Эта дата у установщика уже занята.");
                          }                      

                          handleChange(key, selectedDate);
                        }}
                        className="w-full p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                        disabled={!canEdit}
                      />
                      )}
                      {source === "clients"  && type === "list" && (
                          <>
                          <input
                            type="text"
                            value={value || ""}
                            onChange={(e) => {
                              const inputValue = e.target.value;
                              handleChange(key, inputValue);  // Обновляем значение в форме
                              setShowOptions(true);  // Показываем список при вводе
                            }}
                            onFocus={() => setShowOptions(true)} // Показываем список при фокусе на поле
                            className="w-full p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                            placeholder="Введите имя клиента..."
                            disabled={!canEdit}
                          />
                      
                          {/* Фильтрация опций на основе ввода */}
                          {showOptions && value && (
                            <div className="filteredOptions mt-2">
                              {getOptionsForList(source)
                                .filter(option => {
                                  // Преобразуем значение в строку перед применением toLowerCase
                                  return (String(option.name) || "").toLowerCase().includes((String(value) || "").toLowerCase());
                                })
                                .map((option) => (
                                  <div
                                    key={option.id}
                                    className="optionItem p-[6px] cursor-pointer hover:bg-gray-200"
                                    onClick={() => {
                                      handleChange(key, option.name);  // При клике устанавливаем значение
                                      setShowOptions(false);  // Скрываем список после выбора
                                    }}
                                  >
                                    {option.name}
                                  </div>
                                ))}
                            </div>
                          )}
                        </>
                      )}
                      {(source === "technics" || source === "paylists") && type === "list" && (
                        <select
                          value={
                            getOptionsForList(source).find((option) => String(option.id) === String(value) || String(option.name) === String(value))?.id || ""
                          }
                          onChange={(e) => handleChange(key, e.target.value)}
                          className="w-full py-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                          disabled={!canEdit}
                        >
                          <option value="">Выберите значение</option>
                          {getOptionsForList(source).map((option) => (
                            <option key={option.id} value={String(option.id)}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {source === "installers" && type === "list" && (

                      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-[6px] border border-gray-200">
                        <div>
                        <select
                          value={
                            getOptionsForList(source).find((option) => String(option.id) === String(value) || String(option.name) === String(value))?.id || ""
                          }
                          onChange={(e) => handleChange(key, e.target.value)}
                          className="w-full p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                          disabled={!canEdit}
                        >
                          <option value="">Выберите значение</option>
                          {getOptionsForList(source).map((option) => (
                            <option key={option.id} value={String(option.id)}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                        </div>
                        <div className="flex space-x-4 mt-4" > {/* Контейнер для горизонтального расположения */}

                        <div className="w-full">
                          <label className="block text-gray-600 text-sm mb-1">
                            Работаю в праздники:
                            <input
                              type="checkbox"
                              checked={order.data?.workOnWeekendConfig?.holiday || false}
                              disabled={!canEdit}
                              onChange={(e) =>
                                setOrder((prev) => ({
                                  ...prev,
                                  data: {
                                    ...prev.data,
                                    workOnWeekendConfig: {
                                      ...prev.data?.workOnWeekendConfig,
                                      holiday: e.target.checked,
                                    },
                                  },
                                }))
                              }
                            />
                          </label>
                          </div>

                          <div className="w-full">
                          <label className="block text-gray-600 text-sm mb-1">
                            Работаю в субботу:
                            <input
                              type="checkbox"
                              checked={order.data?.workOnWeekendConfig?.saturday || false}
                              disabled={!canEdit}
                              onChange={(e) =>
                                setOrder((prev) => ({
                                  ...prev,
                                  data: {
                                    ...prev.data,
                                    workOnWeekendConfig: {
                                      ...prev.data?.workOnWeekendConfig,
                                      saturday: e.target.checked,
                                    },
                                  },
                                }))
                              }
                            />
                          </label>
                          </div>
                          <br />
                          <div className="w-full">
                          <label className="block text-gray-600 text-sm mb-1">
                            Работаю в воскресенье:
                            <input
                              type="checkbox"
                              checked={order.data?.workOnWeekendConfig?.sunday || false}
                              disabled={!canEdit}
                              onChange={(e) =>
                                setOrder((prev) => ({
                                  ...prev,
                                  data: {
                                    ...prev.data,
                                    workOnWeekendConfig: {
                                      ...prev.data?.workOnWeekendConfig,
                                      sunday: e.target.checked,
                                    },
                                  },
                                }))
                              }
                            />
                          </label>
                          </div>
                          </div>  
                      </div>  
                      )}
                      {/* Тип check_text */}
                      {type === "check_text" && (
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(value?.checked)}
                            disabled={!canEdit}
                            onChange={(e) =>
                              handleChange(key, { ...value, checked: e.target.checked })
                            }
                            className="rounded focus:ring-2 focus:ring-blue-500"
                          />
                          {value?.checked && (
                            <input
                              type="text"
                              value={value?.text || ""}
                              disabled={!canEdit}
                              onChange={(e) =>
                                handleChange(key, { ...value, text: e.target.value })
                              }
                              placeholder="Введите комментарий"
                              className="w-full p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                            />
                          )}
                        </div>
                      )}
                      {/* Тип date — стандартное поле даты */}
                      {type === "date_admin" && key !== "param15" && (
                        <input
                          type="date"
                          value={value || ""}
                          onChange={(e) => {
                            // Если уже есть значение и canCheck = false — запрещаем менять
                            if (!canCheck && value) return;

                            handleChange(key, e.target.value);
                          }}
                          className={`w-full p-[6px] border rounded-md ${
                            !canCheck && value
                              ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                              : "border-gray-300 focus:ring focus:ring-blue-300"
                          }`}
                          disabled={!canCheck && Boolean(value)}
                          title={!canCheck && value ? "Редактирование запрещено после установки даты" : ""}
                        />
                      )}
                      {/* Тип boolean — чекбокс (true/false напрямую) */}
                      {type === "boolean_admin" && (
                        <input
                          type="checkbox"
                          checked={Boolean(value)}
                          onChange={(e) => {
                            const newValue = e.target.checked;

                            // Если уже true и canCheck = false — запрещаем снимать
                            if (!canCheck && value === true && !newValue) return;

                            handleChange(key, newValue);
                          }}
                          className={`rounded ${
                            !canCheck && value === true
                              ? "text-gray-400 bg-gray-100 cursor-not-allowed"
                              : "focus:ring-2 focus:ring-blue-500"
                          }`}
                          disabled={false} // всегда доступно, но логика внутри ограничивает
                          title={!canCheck && value === true ? "Нельзя снять после установки" : ""}
                        />
                      )}
                      {type === "check_text_admin" && (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={value?.adminText || ""}
                            disabled={!canEdit || (value?.adminChecked && !canCheck)}
                            onChange={(e) =>
                              handleChange(key, {
                                ...value,
                                adminText: e.target.value,
                              })
                            }
                            placeholder="Введите комментарий"
                            className="flex-1 p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                          />
                          <input
                            type="checkbox"
                            checked={Boolean(value?.adminChecked)}
                            disabled={
                              !canEdit || !value?.adminText || (value?.adminChecked && !canCheck)
                            }
                            onChange={(e) =>
                              handleChange(key, {
                                ...value,
                                adminChecked: e.target.checked,
                              })
                            }
                            className="rounded focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      )}
                      {type === "many_text_date_admin" && (() => {
                        // Приводим value к массиву записей
                        const entries = Array.isArray(value) ? value : [];

                        // Завершённые записи (checked === true)
                        const completedEntries = entries.filter((e) => e.checked);

                        // Последняя незавершённая запись или новый шаблон
                        const lastEntry =
                          entries.length === 0 || entries[entries.length - 1].checked
                            ? { text: "", date: "", user: "", checked: false }
                            : entries[entries.length - 1];


                        // Функция для обновления конкретной завершённой записи по индексу
                        const updateCompleted = (idx, updated) => {
                          const newArray = entries.map((entry, i) => (i === idx ? updated : entry));
                          handleChange(key, newArray);
                        };

                        return (
                          <div className="flex flex-col gap-2 w-full">
                            {/* 1) Рендерим завершённые записи */}
                            {completedEntries.map((entry) => {
                              const realIndex = entries.findIndex((e) => e === entry);

                              // Отрисуем либо <span>, либо <input>
                              return (
                                <div
                                  key={realIndex}
                                  className="flex items-center gap-4 p-[6px] border border-gray-200 rounded-md bg-gray-50"
                                >
                                  {/* 1.1) Поле текста */}
                                  {canCheck ? (
                                    <input
                                      type="text"
                                      value={entry.text}
                                      onChange={(e) =>
                                        updateCompleted(realIndex, {
                                          ...entry,
                                          text: e.target.value,
                                        })
                                      }
                                      className="flex-1 p-[4px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                                    />
                                  ) : (
                                    <span className="flex-1 text-gray-700">{entry.text}</span>
                                  )}

                                  {/* 1.2) Поле даты */}
                                  {canCheck ? (
                                    <input
                                      type="date"
                                      value={entry.date}
                                      onChange={(e) =>
                                        updateCompleted(realIndex, {
                                          ...entry,
                                          date: e.target.value,
                                        })
                                      }
                                      className="w-[120px] p-[4px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                                    />
                                  ) : (
                                    <span className="w-[120px] text-gray-500">
                                      {entry.date
                                        ? new Date(entry.date).toLocaleDateString("ru-RU")
                                        : ""}
                                    </span>
                                  )}

                                  {/* 1.3) Поле пользователя */}
                                  {canCheck ? (
                                    <input
                                      type="text"
                                      value={entry.user}
                                      onChange={(e) =>
                                        updateCompleted(realIndex, {
                                          ...entry,
                                          user: e.target.value,
                                        })
                                      }
                                      className="w-[120px] p-[4px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                                    />
                                  ) : (
                                    <span className="w-[120px] text-gray-500">{entry.user}</span>
                                  )}
                                </div>
                              );
                            })}

                            {/* 2) Форма ввода для новой записи */}
                            {!lastEntry.checked && (
                              <div className="flex items-center gap-2">
                                {/* 2.1) Поле для ввода текста */}
                                <input
                                  type="text"
                                  value={lastEntry.text}
                                  onChange={(e) => {
                                    const newText = e.target.value;
                                    const newArray = [...completedEntries];
                                    if (entries.length > completedEntries.length) {
                                      // уже была незавершённая запись — просто обновляем
                                      newArray.push({
                                        ...lastEntry,
                                        text: newText,
                                        date: "",
                                        user: "",
                                        checked: false,
                                      });
                                    } else {
                                      // новой записи ещё нет — создаём
                                      newArray.push({
                                        text: newText,
                                        date: "",
                                        user: "",
                                        checked: false,
                                      });
                                    }
                                    handleChange(key, newArray);
                                  }}
                                  // если нет никакого текста, кнопка чекса и текст заблокированы
                                  disabled={!canCheck}
                                  placeholder="Введите значение"
                                  className="flex-1 p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                                />

                                {/* 2.2) Чекбокс для «фиксации» */}
                                <input
                                  type="checkbox"
                                  checked={Boolean(lastEntry.checked)}
                                  disabled={
                                    (!canCheck) ||
                                    !lastEntry.text ||
                                    (lastEntry.checked && !canCheck)
                                  }
                                  onChange={(e) => {
                                    const isChecked = e.target.checked;
                                    if (!isChecked && !canCheck) return;

                                    const todayISO = new Date().toISOString().split("T")[0];
                                    const newArray = [...completedEntries];
                                    newArray.push({
                                      text: lastEntry.text,
                                      date: isChecked ? todayISO : "",
                                      user: isChecked ? currentUserName : "",
                                      checked: isChecked,
                                    });
                                    handleChange(key, newArray);
                                  }}
                                  className="rounded focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })()}


                      {(phoneHref || mapHref) && (
                        <div className="order-field-actions mt-2 flex justify-end gap-2">
                          {phoneHref && (
                            <a href={phoneHref} aria-label={`Позвонить: ${label}`} title={`Позвонить: ${actionPhone}`}>
                              <Phone size={18} aria-hidden="true" />
                            </a>
                          )}
                          {mapHref && (
                            <a href={mapHref} target="_blank" rel="noreferrer" aria-label="Открыть адрес на карте" title="Открыть адрес на карте">
                              <MapPin size={18} aria-hidden="true" />
                            </a>
                          )}
                        </div>
                      )}

                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    


      {/** Блок вывода данных комментариев */}
      {accessibleParams.some(p => p.param === "comments") && (     
        <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-6 mt-6 border border-gray-200">
          <h3 className="text-xl font-semibold text-gray-700 mb-4">Комментарии</h3>
        
          <div className="flex flex-col gap-4 sm:flex-row"> {/* Контейнер для горизонтального расположения */}
            <div className="w-full">
              <label className="block text-gray-600 text-sm mb-1">Комментарий 1:</label>
              <textarea 
                className="w-full h-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                value={comment1} 
                onChange={(e) => setComment1(e.target.value)}
                placeholder="Введите комментарий..."
                disabled={!accessibleParams.find(p => p.param === "comments")?.canEdit}
              />
            </div>

            <div className="w-full">
              <label className="block text-gray-600 text-sm mb-1">Комментарий 2:</label>
              <textarea 
                className="w-full h-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                value={comment2} 
                onChange={(e) => setComment2(e.target.value)}
                placeholder="Введите комментарий..."
                disabled={!accessibleParams.find(p => p.param === "comments")?.canEdit}
              />
            </div>
          </div>
        </div>
      )}



      {/** Блок вывода кнопок */}
      {accessibleParams.some(p => p.param === "buttons") && (() => {
      const canEdit = accessibleParams.find(p => p.param === "buttons")?.canEdit ?? false;

      return (
        <div className="order-page-card max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-4 sm:p-6 mt-4 sm:mt-6 border border-gray-200">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex-1">
              <button 
                onClick={() => router.push(`/orderConfigs/add?addonId=8&orderId=${order.id}`)}
                disabled={!canEdit}
                className={`w-full px-4 py-2 rounded-lg ${canEdit ? "os-primary-bg text-white" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}
              >
                + Заказ для Фурнитуры
              </button>  
            </div>      
      
            <div className="flex-1">
              <button 
                onClick={() => router.push(`/orderConfigs/add?addonId=9&orderId=${order.id}`)}
                disabled={!canEdit}
                className={`w-full px-4 py-2 rounded-lg ${canEdit ? "os-primary-bg text-white" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}
              >
                + Заказ для Фасады
              </button>  
            </div>
      
            <div className="flex-1">
              <button 
                onClick={() => router.push(`/orderConfigs/add?addonId=10&orderId=${order.id}`)}
                disabled={!canEdit}
                className={`w-full px-4 py-2 rounded-lg ${canEdit ? "os-primary-bg text-white" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}
              >
                + Заказ у Подрядчиков
              </button>  
            </div>
          </div>        
        </div>
      );
      
      })()}



      {/** Блок вывода данных надстроек */}
           
      {orderConfigs
        .filter((config) => config.order_id === currentOrderId) // Оставляем только надстройки текущего заказа
        .sort((a, b) => {
          if (a.addon.id === 7) return -1; // addon1 (id 7) всегда первый
          if (b.addon.id === 7) return 1;
          return a.addon.id - b.addon.id; // Остальные сортируются по id
        })
        .map((config) => {

          // Проверяем, есть ли в accessibleParams параметр "addons"
          if (!accessibleParams.some((p) => p.param === "addons")) {
            return null; // Если нет, не рендерим данный блок
          }

        // Создаем объект cell для передачи в getCellBackgroundColor
        const cell = {
          
          label: config.addon.name, // Используем название надстройки как label
        }

        // Функция определения цвета ячейки по её свойствам
        const getCellBackgroundColor = (cell) => {
        
          // Если готовность
          if (cell && config.data.param21 && config.data.param22) {
            return statusColors.raskroi;
          }
          // Если фурнитура
          if (cell && config.data.furn_param8) {
            return config.data.furn_param8.checked ? statusColors.furnitura : statusColors.default;
          }
          // Если фасады
          if (cell && config.data.fasad_param8) {
            return config.data.fasad_param8.checked ? statusColors.fasad_ready : statusColors.fasad_default;
          }
          // Если от подрядчиков
          if (cell && config.data.work_param8) {
            return config.data.work_param8.checked ? statusColors.work : statusColors.default;
          }
          return statusColors.default;
        };
        
        const canEdit = accessibleParams.find(p => p.param === "addons")?.canEdit ?? false;
   
        return (
  
        <div key={config.id} className="order-page-card max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-4 sm:p-6 mt-4 sm:mt-6 border border-gray-200">


          {/* <h3 className="text-xl font-semibold text-gray-700 mb-4">{config.addon.name}</h3> */}
          <div className="order-addon-actions flex flex-wrap items-center gap-2">
          <button onClick={() => router.push(`/orderConfig/${config.id}`)}
            style={{backgroundColor: getCellBackgroundColor(cell),}}
            disabled={!canEdit}
            >{config.addon.name}</button>

            {config.addon.name !== "Готовность" && (
                <button 
                  onClick={() => destroyAddon(config.id)}
                  style={{ backgroundColor: "#000" }}
                  disabled={!canEdit}
                >
                  Удалить объект
                </button>
              )}
          </div>
          <p></p>
          
          <table className="w-full border-collapse border border-gray-300 rounded-lg overflow-hidden">
            <thead className="bg-gray-100">
              <tr>
                <th className="border border-gray-300 px-4 py-2 text-left">Параметр</th>
                <th className="border border-gray-300 px-4 py-2 text-left">Значение</th>
              </tr>
            </thead>
            <tbody>
              {
              config.data &&
              addonConfigs
              .filter(param => param.configId === config.addon_id && accessibleParams.some(p => p.param === param.paramName))
              .sort((a, b) => a.sorting - b.sorting)
              .map(param => {
                // Object.entries(config.data)
                // .filter(([key]) => accessibleParams.some(p => p.param === key))
                // .map(([key, value]) => {
                  const key = param.paramName;
                  const label = addonParams[config.addon.id]?.[key] || "❌";
                  // const label = param.label || "❌";
                  const value = config.data?.[key];
                  const type = getTypeForParam(key);
                  const source = getSourceForParam(key);
                  const access = accessibleParams.find(p => p.param === key);
                  const canEdit = access?.canEdit ?? false;
                  const canCheck = access?.canCheck ?? false;

                  return (
                    <tr key={key} className="bg-white border-b border-gray-300 hover:bg-gray-100">
                      <td className="border border-gray-300 px-4 py-2">{label}</td>
                      <td className="border border-gray-300 px-4 py-2">
                        {type === "string" && (
                          <AutoResizeTextarea
                            value={config.data[key] ?? ""}
                            onChange={(e) => handleChangeAddons(config.id, key, e.target.value)}
                            className="w-full p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                            disabled={!canEdit}
                          />
                        )}
                        {type === "number" && (
                          <input
                            type="number"
                            value={config.data[key] ?? ""}
                            onChange={(e) => handleChangeAddons(config.id, key, e.target.value)}
                            step="1"
                            className="w-full p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                            disabled={!canEdit}
                          />
                        )}
                        {type === "boolean" && (
                          <input
                            type="checkbox"
                            checked={Boolean(config.data[key])}
                            onChange={(e) => handleChangeAddons(config.id, key, e.target.checked)}
                            className="rounded focus:ring-2 focus:ring-blue-500"
                            disabled={!canEdit}
                          />
                        )}
                        {type === "date" && (
                          <input
                            type="date"
                            value={config.data[key] ?? ""}
                            onChange={(e) => handleChangeAddons(config.id, key, e.target.value)}
                            className="w-full p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                            disabled={!canEdit}
                          />
                        )}
                        {type === "list" && (
                          <select
                          value={
                            getOptionsForList(source).find((option) => String(option.id) === String(value) || String(option.name) === String(value))?.id || ""
                          }
                            onChange={(e) => {
                              const selectedOption = getOptionsForList(source).find(
                                (option) => String(option.id) === e.target.value
                              );
                              handleChangeAddons(config.id, key, selectedOption?.name || "");
                            }}
                            className="w-full p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                            disabled={!canEdit}
                          >
                            <option value="">Выберите значение</option>
                            {getOptionsForList(source).map((option) => (
                              <option key={option.id} value={String(option.id)}>
                                {option.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {type === "check_date" && (
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={Boolean(value?.checked)}
                              // onChange={(e) => handleChangeAddons(config.id, key, { ...value, checked: e.target.checked })}
                              onChange={(e) => {
                                const checkedValue = e.target.checked;
                                const dateValue = checkedValue ? new Date().toISOString().split("T")[0] : ""; // Получаем текущую дату в формате yyyy-mm-dd
                                handleChangeAddons(config.id, key, {
                                  ...value,
                                  checked: checkedValue,
                                  date: dateValue,
                                  user: checkedValue ? currentUserName : "",
                                });
                              }}
                              className="rounded focus:ring-2 focus:ring-blue-500"
                              disabled={!canEdit}
                            />
                            {value?.checked && (
                              <input
                                type="date"
                                value={value?.date || ""}
                                onChange={(e) => handleChangeAddons(config.id, key, { ...value, date: e.target.value })}
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                                disabled={!canEdit}
                              />
                            )}
                          </div>
                        )}
                        {type === "text_date" && (() => {
                          const raw = config.data[key];
                          const val = typeof raw === "object" && raw !== null
                            ? raw
                            : { text: "", date: "" };

                          return (
                            <div className="flex gap-2 items-center w-full">
                              {/* Текстовое поле */}
                              <input
                                type="text"
                                value={val.text || ""}
                                onChange={(e) => {
                                  const newText = e.target.value;
                                  handleChangeAddons(config.id, key, {
                                    text: newText,
                                    date: new Date().toISOString().slice(0, 10),
                                  });
                                }}
                                className="flex-1 p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                                disabled={!canEdit}
                                placeholder="Введите текст"
                              />

                              {/* Поле даты */}
                              <input
                                type="date"
                                value={val.date || ""}
                                onChange={(e) =>
                                  handleChangeAddons(config.id, key, {
                                    ...val,
                                    date: e.target.value,
                                  })
                                }
                                className="w-[140px] p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                                disabled={!canEdit}
                              />
                            </div>
                          );
                        })()}
                        {type === "text_date_admin" && (() => {
                          // Нормализуем incoming value, добавляя поле date
                          const raw = config.data[key];
                          let val;
                          if (typeof raw === "string") {
                            // Старый формат — строка
                            val = {
                              adminText: raw,
                              adminChecked: Boolean(raw),
                              adminHasEdited: false,
                              date: "", // пока нет даты
                            };
                          } else {
                            // Новый формат — объект или undefined
                            const obj = raw || {};
                            val = {
                              adminText: obj.adminText || "",
                              adminChecked:
                                typeof obj.adminChecked === "boolean"
                                  ? obj.adminChecked
                                  : Boolean(obj.adminText),
                              adminHasEdited: obj.adminHasEdited || false,
                              date: obj.date || "",
                            };
                          }

                          return (
                            <div className="flex items-center gap-2 w-full">
                              {/* Текстовое поле */}
                              <input
                                type="text"
                                value={val.adminText}
                                disabled={val.adminChecked && !canCheck}
                                onChange={(e) =>
                                  handleChangeAddons(config.id, key, {
                                    ...val,
                                    adminText: e.target.value,
                                  })
                                }
                                placeholder="Введите комментарий"
                                className="flex-1 p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                              />


                              {/* Чекбокс */}
                              <input
                                type="checkbox"
                                checked={val.adminChecked}
                                disabled={!val.adminText || (val.adminChecked && !canCheck)}
                                onChange={(e) => {
                                  const isChecked = e.target.checked;
                                  // Если ставим галочку, добавляем текущую дату; если снимаем — очищаем дату
                                  const newDate = isChecked
                                    ? new Date().toISOString().slice(0, 10)
                                    : "";
                                  handleChangeAddons(config.id, key, {
                                    ...val,
                                    adminChecked: isChecked,
                                    adminHasEdited: true,
                                    date: newDate,
                                  });
                                }}
                                className="rounded focus:ring-2 focus:ring-blue-500"
                              />
                                    {/* Поле даты (отображает дату при установке галочки) */}
                              <input
                                type="date"
                                value={val.date || ""}
                                disabled
                                className="w-[140px] p-[6px] border border-gray-300 rounded-md bg-gray-100 text-gray-600"
                              />
                            </div>
                          );
                        })()}
                        {type === "boolean_admin" && (
                          <input
                            type="checkbox"
                            checked={Boolean(config.data[key])}
                            onChange={(e) => {
                              const newValue = e.target.checked;

                              // Разрешено если заказ не сохранён или canCheck не запрещает
                              if (canCheck || newValue) {
                                handleChangeAddons(config.id, key, newValue);
                              }
                            }}
                            className="rounded focus:ring-2 focus:ring-blue-500"
                            disabled={(!canCheck && config.data[key] === true)}
                            title={!canCheck && config.data[key] === true ? "Нельзя снять галочку после установки" : ""}
                          />
                        )}
                        {type === "check_text_admin" && (() => {
                          // Нормализуем incoming value
                          const raw = config.data[key];
                          let val;
                          if (typeof raw === "string") {
                            // Старый формат — строка
                            val = {
                              adminText: raw,
                              adminChecked: Boolean(raw),
                              adminHasEdited: false,
                            };
                          } else {
                            // Новый формат — объект или undefined
                            const obj = raw || {};
                            val = {
                              adminText: obj.adminText || "",
                              adminChecked:
                                typeof obj.adminChecked === "boolean"
                                  ? obj.adminChecked
                                  : Boolean(obj.adminText),
                              adminHasEdited: obj.adminHasEdited || false,
                            };
                          }

                          return (
                            <div className="flex items-center gap-2">
                              {/* Текстовое поле */}
                              <input
                                type="text"
                                value={val.adminText}
                                disabled={
                                  (val.adminChecked && !canCheck)
                                }
                                onChange={(e) =>
                                  handleChangeAddons(config.id, key, {
                                    ...val,
                                    adminText: e.target.value,
                                  })
                                }
                                placeholder="Введите комментарий"
                                className="flex-1 p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                              />

                              {/* Чекбокс */}
                              <input
                                type="checkbox"
                                checked={val.adminChecked}
                                disabled={
                                  !val.adminText ||
                                  (val.adminChecked && !canCheck)
                                }
                                onChange={(e) =>
                                  handleChangeAddons(config.id, key, {
                                    ...val,
                                    adminChecked: e.target.checked,
                                    adminHasEdited: true,
                                  })
                                }
                                className="rounded focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          );
                        })()}
                        {type === "check_date_admin" && (
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={Boolean(value?.checked)}
                              // onChange={(e) => handleChangeAddons(config.id, key, { ...value, checked: e.target.checked })}
                              onChange={(e) => {
                                const checkedValue = e.target.checked;
                                const dateValue = checkedValue ? new Date().toISOString().split("T")[0] : ""; // Получаем текущую дату в формате yyyy-mm-dd
                                handleChangeAddons(config.id, key, { checked: checkedValue, date: dateValue });
                              }}
                              className="rounded focus:ring-2 focus:ring-blue-500"
                              disabled={!canCheck && value.checked}
                            />
                            {value?.checked && (
                              <input
                                type="date"
                                value={value?.date || ""}
                                onChange={(e) => handleChangeAddons(config.id, key, { ...value, date: e.target.value })}
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                                disabled={!canCheck && value.checked}
                              />
                            )}
                          </div>
                        )}


                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
                          
        )}
      )}
      


      {/** Блок вывода логов */}
      <div className="order-page-card max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-4 sm:p-6 mt-4 sm:mt-6 border border-gray-200">
        <button onClick={() => setExpanded(prev => !prev)} style={{ fontWeight: 'bold' }}>
          {expanded ? 'Скрыть историю изменений ▲' : 'Показать историю изменений ▼'}
        </button>

        {expanded && logs.length > 0 && (
          <ul style={{ marginTop: '0.5rem', paddingLeft: '1rem' }}>
            {logs.map((log, index) => (
              <li key={index} style={{ textAlign: "left", marginBottom: "5px" }}>
                <div><strong>{log.user}</strong> — {new Date(log.timestamp).toLocaleString()}</div>
                <div style={{ fontStyle: 'italic', color: '#555' }}>{log.action}</div>
              </li>
            ))}
          </ul>
        )}

        {expanded && logs.length === 0 && <p>Нет логов изменений.</p>}
      </div>

      {/** Блок вывода кнопок */}
      {accessibleParams.some(p => p.param === "buttonsSave" || p.param === "buttonDelete") && (() => {
      const buttonsSave = accessibleParams.find(p => p.param === "buttonsSave");
      const buttonDelete = accessibleParams.find(p => p.param === "buttonDelete");

      const canEdit = buttonsSave?.canEdit ?? false;
      const canDelete = buttonDelete?.canEdit ?? false;

      const isVisibleSave = buttonsSave?.allowed ?? false;
      const isVisibleDelete = buttonDelete?.allowed ?? false;

      // console.log('accessibleParams:', accessibleParams);
      // console.log('canEdit:', canEdit, 'canDelete:', canDelete);
      // console.log('isVisibleSave:', isVisibleSave, 'isVisibleDelete:', isVisibleDelete);

      return (
        <div className="order-page-card max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-4 sm:p-6 mt-4 sm:mt-6 border border-gray-200">
          <div className="flex space-x-4">
            <div className="order-save-actions flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap">
              {isVisibleSave && (
                <>
                  <button 
                    disabled={!canEdit || isSaving} 
                    onClick={handleSave} 
                    className={`px-4 py-2 rounded-lg ${canEdit ? "os-primary-bg text-white" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}
                  >
                    {isSaving ? "Сохранение..." : "Сохранить"}
                  </button>

                  <button 
                    onClick={saveOrder} 
                    disabled={!canEdit || isSaving} 
                    className={`px-4 py-2 rounded-lg ${canEdit ? "os-primary-bg text-white" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}
                  >
                    {isSaving ? "Сохранение..." : "Сохранить и перейти в заказы"}
                  </button>

                  <button 
                    onClick={handleSaveAndRedirect} 
                    disabled={!canEdit || isSaving} 
                    className={`px-4 py-2 rounded-lg ${canEdit ? "bg-green-500 text-white hover:bg-green-600" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}
                  >
                    {isSaving ? "Сохранение..." : "Сохранить и перейти в график"}
                  </button>
                </>
              )}

              <button  
                type="button" 
                onClick={() => router.push('/orders')}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                Отмена
              </button>

              {isVisibleDelete && (
                <button 
                  onClick={handleDelete} 
                  disabled={!canDelete} 
                  className={`px-4 py-2 rounded-lg ${canDelete ? "bg-red-500 text-white hover:bg-red-600" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}
                >
                  Удалить
                </button>
              )}
            </div>
          </div>        
        </div>
      );
    })()}
  
    </div>
  );
  

 
};

export default OrderPage;


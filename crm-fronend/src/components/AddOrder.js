// components/AddOrder.js

'use client';

import React, { useState, useEffect, useContext } from 'react';
import { useRouter } from 'next/navigation';
import axios from "axios";
import Spinner from "../components/Spinner";
import { toast } from 'react-toastify';
import { AuthContext } from "../context/AuthContext";

export default function AddOrderForm() {

    const [mainModelConfig, setMainModelConfig] = useState([]);
    const [formData, setFormData] = useState({
      param1: '', // Клиент
      param2: '', // Телефон
      param5: '', // Адрес
      param13: '', // Дата приема
      param15: '', // Дата начала
      param16: '', // Количество дней
      order_number: '',  // Номер заказа (изначально пустой)
      statusData: {}
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [errors, setErrors] = useState({}); // Ошибки для обязательных полей
    const [installers, setInstallers] = useState([]);
    const router = useRouter();
    const [technics, setTechnics] = useState([]); // Список технологов
    const [clients, setClients] = useState([]); // Для списка клиентов
    const requiredFields = ['param1', 'param2', 'param5', 'param13', 'param15', 'param16', 'param17']; // Обязательные поля
    const [paylists, setPaylists] = useState([]);
    const [statuses, setStatuses] = useState([]);
    const [clientSelected, setClientSelected] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [holidayConfigs, setHolidayConfigs] = useState([]);
    const [extraSelectedAddonNames, setExtraSelectedAddonNames] = useState([]);
    const { user } = useContext(AuthContext);

    let currentUserName = '';
    if (user) {
      currentUserName = user.name;
    } // Получаем юзера



    // Загружаем конфигурацию выходных дней из нашего API
    useEffect(() => {    
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/holidays`)
        .then(res => res.json())
        .then(data => setHolidayConfigs(data))
        .catch(err => console.error("Ошибка получения конфигурации выходных:", err));
    }, []);
  
  
    // // И при изменении holidayConfigs:
    // useEffect(() => {
    //   if (calendarRef.current) {
    //     setTimeout(() => {
    //       calendarRef.current.getApi().render();
    //     }, 0);
    //   }
    // }, [holidayConfigs]);


    // console.log('mainModelConfig = ' + JSON.stringify(mainModelConfig, null, 2))

    // Загрузка списка установщиков и технологов, готовностей
    useEffect(() => {
      
      const fetchData = async () => {
        const installersResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/installers`);
        const technicsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/technics`);
        const clientsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/clients`);
        const paylistsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/paylists`);
        const statusesResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/statuses`);
        
        // const orderConfigsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orderConfigs`);
        setInstallers(await installersResponse.json());
        setTechnics(await technicsResponse.json());
        setClients(await clientsResponse.json());
        setPaylists(await paylistsResponse.json());
        setStatuses(await statusesResponse.json());
        // setOrderConfigs(await orderConfigsResponse.json());

        // console.log("Статусы из API:", JSON.stringify(technicsResponse, null, 2)); // Проверяем, что API возвращает
        // console.log('technicsResponse:', JSON.stringify(technicsResponse, null, 2))  

      };
      fetchData();
    }, []);


    // Для статусов
    useEffect(() => {
      if (statuses.length > 0) {
        const initialStatusData = statuses.reduce((acc, status) => {
          acc[status.key] = "";
          return acc;
        }, {});
    
        setFormData(prev => ({
          ...prev,
          statusData: {
            ...initialStatusData,
            ...prev.statusData // на случай, если что-то уже было
          }
        }));
      }
    }, [statuses]);
    
    // Инициализация formData
    useEffect(() => {
      const fetchConfig = async () => {
        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/mainModel`);
          if (!response.ok) {
            throw new Error("Ошибка при загрузке конфигурации");
          }
          const configData = await response.json();
          setMainModelConfig(configData);

          // console.log('configData:', JSON.stringify(configData, null, 2))
  
          // Инициализация formData с пустыми значениями
          const initialFormData = {};
          configData.forEach((field) => {
            initialFormData[field.paramName] = "";
          });

          // Устанавливаем дефолтное значение для нужных date-полей, если они есть в конфигурации
          const defaultDate = new Date().toISOString().split("T")[0];
          if ("param13" in initialFormData) {
            // Если параметр есть — проверяем, если пустой, то ставим дефолтную дату
            if (!initialFormData["param13"]) {
              initialFormData["param13"] = defaultDate;
            }
          }

          // Устанавливаем дату установки + 4 недели
          const dateToday = new Date();
          dateToday.setDate(dateToday.getDate() + 28); // прибавить 4 недели
          const param15Start = dateToday.toISOString().split("T")[0];
          if ("param15" in initialFormData) {
            // Если параметр есть — проверяем, если пустой, то ставим дефолтную дату
            if (!initialFormData["param15"]) {
              initialFormData["param15"] = param15Start;
            }
          }


          setFormData(initialFormData);
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };
  
      fetchConfig();
    }, []);


    // Заполненние заказа изExcel
    const parseValueByType = (value, type, source) => {
      const cleanedValue = String(value ?? '').normalize("NFKC").trim();

      switch (type) {
        
        case "number":
          return Number(value) || 0;
        case "date":
          if (!value) return null;
          const [day, month, year] = value.split(".");
          return `${year}-${month}-${day}`; // Преобразуем в ISO-формат
        case "boolean":
        case "boolean_admin":
          return ["да", "yes", "true", "1", "+"].includes(cleanedValue.toLowerCase());
        case "check_text":
        case "check_text_admin":
          return { checked: cleanedValue.toLowerCase() === "да" };
        case "list":
          // Обработка для paylists
          if (source === "paylists" && cleanedValue) {

            let newValue = cleanedValue;

            if (/^\d+$/.test(cleanedValue)) {
              const selectedPaylist = paylists.find(option => String(option.id) === cleanedValue);
              return selectedPaylist ? String(selectedPaylist.id) : cleanedValue;
            }

            // console.log("cleanedValue = ", cleanedValue);

            if (cleanedValue === "Б" || cleanedValue === "Т" || cleanedValue === "Терм") {
              newValue = "2";
            } else if (cleanedValue.toLowerCase() === "карта") {
              newValue = "3";
            } else if (Number(cleanedValue) === 0 || cleanedValue === "0" || cleanedValue === "нал") {
              newValue = "1";
            } else {newValue = "4";}
            return newValue; // Возвращаем обработанное значение для paylists
          }
          
          // Обработка для других типов списков
          if (source !== "paylists" && source !== "clients" && value) {
            // console.log("value (before cleaning) = ", value);
            const cleanedValue = String(value).normalize("NFKC").trim();
            // console.log("cleanedValue = ", cleanedValue);

            const options = getOptions(source);
            // console.log("options = ", options);

            const selectedOption = options.find(option => option.name.normalize("NFKC").trim().toLowerCase() === cleanedValue.toLowerCase());

            // console.log("selectedOption = ", selectedOption);
            return selectedOption ? selectedOption.id : null;
          }

          if (source === "clients" && value) {
            // console.log("value (before cleaning) = ", value);
            const cleanedValue = String(value).normalize("NFKC").trim();
            return cleanedValue
          }
          
          // Если значение пустое, возвращаем его как есть
          return value;
        default:
          return value.replace(/[\r\n]/g, ''); // По умолчанию — строка
      }
    };
    

    const handleFillFromExcel = async () => {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        console.error("Clipboard API не поддерживается в этом окружении.");
        return;
      }
    
      let rowData = []; // Инициализируем переменную здесь, чтобы она была доступна в дальнейшем
    
      try {
        const text = await navigator.clipboard.readText();
        rowData = text.split("\t"); // Разбиваем строку по табуляции
        // console.log("Считанные данные:", rowData);
      } catch (err) {
        console.error("Ошибка при чтении из буфера обмена:", err);
        return; // Если ошибка при чтении из буфера, дальше не продолжаем
      }
    
      const labelToData = {
        "Клиент": rowData[5],
        "Адрес": rowData[3],
        "Технолог": rowData[0],
        "Диз": rowData[9],
        "Изделие": rowData[4],
        "Цена заказа": rowData[7],
        "Пред-оплата": rowData[8],
        "Устан. сразу": rowData[6],
        "Тип оплаты": rowData[10],
        "Дата установки": rowData[2],
        "Телефон": rowData[1],
        "Дней устан.": rowData[11],
        "Номер заказа": rowData[12],
        "Представитель": rowData[13],
        "Телефон пр.": rowData[14],
      };
    
      const updatedFormData = { ...formData };
    
      mainModelConfig.forEach((field) => {
        let rawValue = labelToData[field.label];
    
        // Если rawValue для поля "Дата приёма" всё ещё undefined или некорректное
        if (rawValue === undefined) {
          // console.log("Ошибка: значение для поля " + field.label + " не определено");
        } else {
          // Обрабатываем значение по типу
          // console.log("label = ", rawValue)
          updatedFormData[field.paramName] = parseValueByType(rawValue, field.type, field.source);
          // console.log("updatedFormData[field.paramName] = ", updatedFormData[field.paramName])
        }
      });
    
      // Устанавливаем текущую дату для "Дата приёма" отдельно, без обработки parseValueByType
      const dateField = mainModelConfig.find(f => f.label === "Дата приёма");
      if (dateField) {
        updatedFormData[dateField.paramName] = new Date().toISOString().split("T")[0];
      }

      const orderId = String(rowData[12] ?? '').trim(); // Номер заказа
      // console.log("orderId = ", orderId);

      updatedFormData["order_number"] = orderId; // Очищаем номер заказа

      // console.log("updatedFormData = ", updatedFormData);
      setFormData(updatedFormData);


      // 👉 Проверка на "да" для надстроек
      const addonFlags = [
        { label: "Фурнитура", value: rowData[16] },
        { label: "Фасады", value: rowData[15] },
        { label: "От подрядчиков", value: rowData[17] },
      ];

      const extraAddons = addonFlags
        .filter(item => item.value?.trim().toLowerCase() === "да")
        .map(item => item.label);

      setExtraSelectedAddonNames(extraAddons);

    };
    
  
    const handleChange = (paramName, value) => {
      setFormData({ ...formData, [paramName]: value });
      setErrors((prev) => ({ ...prev, [paramName]: '' }));
    };


    const handleCheckTextChange = (paramName, isChecked, textValue) => {
      setFormData({
          ...formData,
          [paramName]: {
              checked: isChecked,
              text: isChecked ? textValue : '',
          },
      });
    };


    // Получаем данные о надстройках
    const fetchSelectedAddons = async () => {
      try {
        // Получаем список всех надстроек из БД
        const addonsResponse = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/addons`);
        const addons = addonsResponse.data;
    
        // Фильтруем только те, у которых defaultLoad === true
        const selectedAddons = addons
          .filter(addon => addon.defaultLoad === true)
          .map(addon => ({
            name: addon.name,
            source: addon.id, // или другое поле, которое соответствует source в mainModelConfig
          }));

        // Добавляем надстройки из extraSelectedAddonNames
        extraSelectedAddonNames.forEach(name => {
          const found = addons.find(a => a.name.toLowerCase() === name.toLowerCase());
          if (found && !selectedAddons.some(a => a.source === found.id)) {
            selectedAddons.push({ name: found.name, source: found.id });
          }
        });          

        // console.log("selectedAddons:", selectedAddons.length);
    
        return selectedAddons;
      } catch (error) {
        console.error("Ошибка при получении списка надстроек:", error);
        return [];
      }
    };


    // Функция вычисления конечной даты заказа с учетом выходных дней
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

      // console.log("🚀 Начало расчёта с даты:", currentDate.toISOString());
      // console.log("🚀 Нужно рабочих дней:", workingDays);
      // console.log("🚀 Конфигурация выходных:", workOnWeekendConfig);

      while (daysCounted < workingDays) {
        const currentDateStr = currentDate.toISOString().split("T")[0];
        const dayOfWeek = currentDate.getDay(); // 0 - вс, 6 - сб
        let isWorkingDay = true;
        // let reason = "рабочий по умолчанию";

        // --- 1. Проверка субботы/воскресенья ---
        if (dayOfWeek === 6 && !workOnWeekendConfig.saturday) {
          isWorkingDay = false;
          // reason = "суббота (выходной)";
        }
        if (dayOfWeek === 0 && !workOnWeekendConfig.sunday) {
          isWorkingDay = false;
          // reason = "воскресенье (выходной)";
        }

        // --- 2. Проверка праздников ---
        if (holidays.includes(currentDateStr)) {
          // Если суббота и она рабочая — оставляем рабочей
          if (dayOfWeek === 6 && workOnWeekendConfig.saturday) {
            isWorkingDay = true;
            // reason = "суббота в праздниках, но рабочая";
          }
          // Если воскресенье и оно рабочее — оставляем рабочим
          else if (dayOfWeek === 0 && workOnWeekendConfig.sunday) {
            isWorkingDay = true;
            // reason = "воскресенье в праздниках, но рабочее";
          }
          // Обычный праздник
          else {
            isWorkingDay = false;
            // reason = "праздник";
          }
        }

        // --- 3. Спец-правило: holiday = true (работает всегда)
        if (workOnWeekendConfig.holiday === true) {
          isWorkingDay = true;
          // reason = "работа в любые выходные/праздники";
        }

        // Логируем
        // console.log(`${currentDateStr}: ${isWorkingDay ? "✅" : "❌"} (${reason})`);

        // Если это рабочий день, увеличиваем счётчик
        if (isWorkingDay) {
          daysCounted++;
        }

        // Если ещё не достигли нужного числа рабочих дней — идём дальше
        if (daysCounted < workingDays) {
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }

      // console.log("🎯 Конечная дата:", currentDate.toISOString());
      return currentDate.toISOString();
    }


    //  // Функция вычисления конечной даты заказа с учетом выходных дней
    // function calculateEndDate(startDateStr, workingDays, workOnWeekendConfig = { saturday: false, sunday: false }, holidays = []) {

    //   // console.log("startDateStr", startDateStr)
    //   // console.log("workingDays", workingDays)


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
    //     if (holidays.includes(currentDateStr)) {
    //       isWorkingDay = false;
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
      
    //   // console.log("Конечная дата:", currentDate.toISOString());
      
    //   return currentDate.toISOString();
    // }
    

    const handleSubmit = async (e) => {
      e.preventDefault();
      setIsSaving(true);

      // console.log("Formdata = " , formData)

      let newErrors = {};
    
      // Проверяем каждое обязательное поле
      requiredFields.forEach((field) => {
          if (!formData[field]) {
              newErrors[field] = 'Обязательное поле';
          }
      });
  
      if (Object.keys(newErrors).length > 0) {
          setErrors(newErrors);
          return;
      }

      try {

        await saveData();

        // Создаем статусы
        const statusData = statuses.reduce((acc, status) => {
          acc[status.key] = formData.statusData?.[status.key] ?? "";
          return acc;
        }, {});

        const startDate = formData.param15; // Дата начала (строка)
        const duration = parseInt(formData.param16, 10) || 1; // Количество дней
  
        // Вычисляем дату окончания
        let endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + duration - 1); // -1, чтобы день не перепрыгивал
        let correctEndDate = endDate.toISOString(); // Преобразуем в ISO-формат

        // Проверяем, является ли конечная дата праздничным днём
        const endDateSplit = correctEndDate.split("T")[0]; // Извлекаем только дату
        const isHoliday = holidayConfigs.some((holiday) => holiday.date === endDateSplit); // Проверяем, является ли конечная дата праздничным днём

        if (isHoliday) {
          correctEndDate = calculateEndDate(formData.param15, Number(formData.param16), formData.workOnWeekendConfig, holidayConfigs);
          // console.log("Переделываем endDate:", correctEndDate)
        }
        

        // Добавляем нашу конфигурацию работы в выходные и добавляем поле для endDate даты окончания
        const payload = {
          ...formData,
            ...(formData.data || {}), 
            workOnWeekendConfig: {
              saturday: false, 
              sunday: false,
          },
          statusData,
          endDate: correctEndDate, // Добавляем конечную дату
          timeSlot: 1,
        };

        // Проверяем есть ли такой клиент в базе
        const newClient = clients?.find(a => a.name === formData.param1);

        // console.log("newClient = ", newClient)
        // console.log("formData = ", formData)

        // Если клиент новый, значит добавляем в базу
        if (!newClient) {

          // Добавляем клиента в базу
          const name = formData.param1;
          const phone = formData.param2;
          const representative = formData.param3;
          const representativePhone = formData.param4;
          const clientData = { name, phone, representative, representativePhone};

          try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/clients`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(clientData),
            });
      
            if (response.ok) {
              // const result = await response.json();
              // console.log('Client added:', result);
            } else {
              const errorData = await response.json();
              console.error('Ошибка при добавлении клиента:', errorData);
              toast(`Ошибка: ${errorData.error}`);
            }
          } catch (error) {
            console.error('Ошибка сети:', error);
            toast('Ошибка сети. Пожалуйста, попробуйте еще раз.');
          }
        }    


        // console.log("Отправка данных на сервер:", payload);
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error("Ошибка при сохранении заказа");
        }


        let savedOrder = await response.json(); // Парсим ответ от сервера
        // console.log("savedOrder:", JSON.stringify(savedOrder, null, 2));

        const param15Date = savedOrder.data.param15;
        const installerId = Number(savedOrder.data.param17);
        const orderId = savedOrder.id;
        // console.log("Создан заказ с ID:", orderId);

        // Патчим на бэке дату установки
        const responsePatch = await axios.patch(`${process.env.NEXT_PUBLIC_API_URL}/ordersByInstaller`, {
          param15Date,
          installerId,
          orderId // чтобы знать, какой заказ менять
        });

        savedOrder = responsePatch.data; // Обновляем после патча
        // console.log("После патча savedOrder:", JSON.stringify(savedOrder, null, 2));

        // Сохраняем данные в таблицу логов
        const responseLogs = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orderLogs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: savedOrder.id,
            action: "Создание заказа",
            user: currentUserName,
            timestamp: new Date().toISOString(),
          }),
        });

        if (!responseLogs.ok) {
          throw new Error("Ошибка при сохранении логов");
        }

        // Создаем пустые orderConfigs (Готовность, Фурнитура)
        const selectedAddons = await fetchSelectedAddons();

        // console.log("selectedAddons:", selectedAddons);

        await Promise.all(

          selectedAddons.map(async (obj) => {
            const selectedAddon = mainModelConfig.find(f => Number(f.source) === Number(obj.source))?.source;
            if (!selectedAddon) return;

            const response = await axios.get(
              `${process.env.NEXT_PUBLIC_API_URL}/addons/${Number(selectedAddon)}/configs`
              );

            // console.log("Ответ от API:", response.data);

            if (response.data && response.data.params) {
              
              const initialFormData = {};

              response.data.params.forEach((field) => {
                initialFormData[field.paramName] = "";
              });

              // console.log("initialFormData:", initialFormData);

              const configData = { 
                order_id: orderId, 
                addon_id: Number(selectedAddon), 
                data: initialFormData, 
                config_id: null 
              };
  
              // console.log('configData = ' + JSON.stringify(configData, null, 2))
      
              const configResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orderConfigs`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(configData),
              });
  
      
              if (!configResponse.ok) {
                console.error(`Ошибка при создании ${obj}`);
              } else {
                // console.log(`Создана конфигурация для ${objName}`);
              }

            }  
          })
        );
    
        // console.log("Заказ и конфигурации успешно сохранены!");

        // Обновляем состояние, включая номер заказа
        setFormData({
          ...formData,
          order_number: savedOrder.order_number, // Сохраняем номер заказа
        });

        

        setFormData(mainModelConfig.reduce((acc, field) => {
                if (field.type === 'check_text') {
                    acc[field.paramName] = { checked: false, text: '' };
                } else {
                    acc[field.paramName] = '';
                }
                return acc;
        }, {}));

        // Получаем кнопку, которая вызвала сабмит
        const submitter = e.nativeEvent.submitter;
        const adress = formData?.param5 ?? ''; // адрес
        const article = formData?.param9 ?? ''; // изделие
        const search = String(adress + ';' + article)
        if (submitter && submitter.name === "saveAndRedirect") {
          // Если была нажата кнопка "Сохранить и в график"
          router.push(`/main?search=${encodeURIComponent(search)}`); // Передача в URL
        } else {
          router.push(`/orders`)
        }

      } catch (err) {
        toast(err.message);
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


    // Для чекбоксов Статусов
    const handleCheckboxChangeStatus = (e, key) => {
      const checked = e.target.checked;
      const currentDate = new Date().toISOString();
    
      setFormData(prev => ({
        ...prev,
        statusData: {
          ...prev.statusData,
          [key]: checked ? currentDate : ""
        }
      }));
    };
    

    const saveData = async () => {
      // логика сохранения данных
      return new Promise((resolve) => {
        setTimeout(() => {
          // console.log("Данные сохранены");
          resolve();
        }, 2000); // Симуляция задержки
      });
    };




    if (loading) {
      return <Spinner />;
    }
  
    if (error) {
      return <p>Ошибка: {error}</p>;
    }

    return (

      <form onSubmit={handleSubmit} className="add-order-page px-3 pb-6 sm:px-4">
        <div className="mx-auto max-w-4xl">
            <button type="button" onClick={handleFillFromExcel} className="add-order-excel-button w-full sm:w-auto">
                Заполнить из Excel
            </button>
        </div>


        <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-4 sm:p-6 mt-4 sm:mt-6 border border-gray-200">
        <h3 className="text-xl font-semibold text-gray-700 mb-4">Статус заказа</h3>

        {/* Чекбоксы в одной строке */}
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:justify-between sm:gap-4">

          {[...statuses]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map(({ name, key }) => (
              <div key={key} className="flex flex-col items-center p-3 border border-gray-300 rounded-lg shadow-sm bg-white">
                <label className="text-gray-600 text-sm mb-1">{name}:</label>
                <input
                  type="checkbox"
                  name={key}
                  checked={!!formData?.statusData?.[key]} // правильно берем статус                
                  onChange={(e) => handleCheckboxChangeStatus(e, key)}
                  className="rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-500 mt-1 min-h-[20px]">
                {formData?.statusData?.[key]
                  ? new Date(formData.statusData[key]).toLocaleDateString("ru-RU")
                  : "❌"}
                </span>
              </div>
            ))}
        </div>

      </div>



        <div className="details add-order-fields max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-4 sm:p-6 mt-4 sm:mt-6 border border-gray-200">
          <div className="detail-row">
          <label className="labelClient">
                {"Номер заказа"}: 
              </label>
              <input
                className={`valueClient`}
                type="text"
                placeholder=""
                value={formData["order_number"] || ""}
                onChange={(e) => handleChange("order_number", e.target.value)}               
              />
          </div>
          {mainModelConfig.map((field) => {
            // console.log("Field:", field);

            return (
            
            <div key={field.paramName} className="detail-row">

              <label className="labelClient">
              {field.label}: 
              {requiredFields.includes(field.paramName) && <span style={{ color: "red" }}> *</span>}
              </label>

              {field.type === "string" && field.label != "Телефон" && (
                <input
                  className={`valueClient ${errors[field.paramName] ? "error-border" : ""}`}
                  type="text"
                  placeholder=""
                  value={formData[field.paramName]}
                  onChange={(e) => handleChange(field.paramName, e.target.value)}                  
                />
              )}

              {field.type === "string" && field.label === "Телефон" && (
                <input
                  className={`valueClient ${errors[field.paramName] ? "error-border" : ""}`}
                  type="text"
                  placeholder=""
                  value={formData["param2"] || ""}
                  onChange={(e) => handleChange("param2", e.target.value)}
                  
                />
              )}
              
              {field.type === "number" && (
                <input
                  className={`valueClient ${errors[field.paramName] ? "error-border" : ""}`}
                  type="number"
                  placeholder=""
                  value={formData[field.paramName]}
                  onChange={(e) => handleChange(field.paramName, e.target.value)}
                  
                />
              )}

              {field.type === "boolean" && (
                <input
                  className={`valueClient ${errors[field.paramName] ? "error-border" : ""}`}
                  type="checkbox"
                  checked={formData[field.paramName]}
                  onChange={(e) => handleChange(field.paramName, e.target.checked)}
                />
              )}

              {/* {field.type === "date" && (
                <input
                  className={`valueClient ${errors[field.paramName] ? "error-border" : ""}`}
                  type="date"
                  value={formData[field.paramName]}
                  onChange={(e) => handleChange(field.paramName, e.target.value)}
                  
                />
              )} */}

              {field.type === "date" && field.paramName === "param13" && (
                <input
                  type="date"
                  value={formData[field.paramName] || new Date().toISOString().split("T")[0]}
                  onChange={(e) => handleChange(field.paramName, e.target.value)}
                  className={`valueClient ${errors[field.paramName] ? "error-border" : ""}`}
                />
              )}



              {/* Тип date */}
              {field.type === "date" && field.paramName === "param15" &&  (
                <input
                  type="date"
                  value={formData[field.paramName]}
                  onChange={(e) => handleChange(field.paramName, e.target.value)}
                  className={`valueClient ${errors[field.paramName] ? "error-border" : ""}`}
                />
              )}

              {/* Можно переделать этот код если понадобится на ставить в выходной */}
              {/* {type === "date" && key === "param15" && (
              <input
                type="date"
                value={value}
                onChange={(e) => {
                  const selectedDate = e.target.value;
                  const isHoliday = holidayConfigs.some(
                    (holiday) => holiday.date === selectedDate && holiday.isHoliday
                  );

                  if (isHoliday) {
                    toast("Невозможно выбрать эту дату, так как она является выходным днем.");
                    return;
                  }

                  handleChange(key, selectedDate);
                }}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                disabled={!canEdit}
              />
            )} */}

              {field.type === "list" && field.source != "clients" && (
                <select className="valueClient"
                  value={formData[field.paramName] || ""}                  
                  onChange={
                    
                    (e) => {
                      // console.log("formData[field.paramName] = " + formData[field.paramName]);
                      handleChange(field.paramName, e.target.value)}}
                >
                  <option value="">Выберите...</option>
                  {getOptions(field.source).map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              )}

              {field.type === "list" && field.source === "clients" && (
                <>
                  <input
                    type="text"
                    className="valueClient"
                    value={formData[field.paramName] || ""}
                    onChange={(e) => {
                      const inputValue = e.target.value;
                      setClientSelected(false); // сброс выбора при редактировании
                      setFormData(prev => ({
                        ...prev,
                        [field.paramName]: inputValue
                      }));
                    }}
                    placeholder="Введите имя клиента..."
                  />
                  
                  {/* Фильтрация клиентов по введённому тексту */}
                  {formData[field.paramName] && !clientSelected && (
                    <div className="filteredClients">
                      {getOptions(field.source)
                        .filter(client => client.name.toLowerCase().includes(formData[field.paramName].toLowerCase()))
                        .map((client) => (
                          <div
                            key={client.id}
                            className="clientOption"
                            onClick={() => {
                              setFormData(prev => ({
                                ...prev,
                                [field.paramName]: client.name,
                                "param2": client.phone
                              }));
                              setClientSelected(true);
                            }}
                          >
                            {client.name}
                          </div>
                        ))}
                    </div>
                  )}
                </>
              )}


              {field.type === "addon" && (
                <p>Будет привязано позже</p>
              )}

              {field.type === "check_text" && (
                <div className="add-order-check-text flex min-w-0 flex-1 items-center gap-3">
                    <label className="labelClient">
                        <input className="valueClient"
                            
                            type="checkbox"
                            checked={formData[field.paramName]?.checked || false}
                            onChange={(e) =>
                                handleCheckTextChange(
                                    field.paramName,
                                    e.target.checked,
                                    formData[field.paramName]?.text || ''
                                )
                            }
                        />
                        {/* {field.label} */}
                    </label>
                    {formData[field.paramName]?.checked && (
                        <input className="valueClient"
                            type="text"
                            value={formData[field.paramName]?.text || ''}
                            onChange={(e) =>
                                handleCheckTextChange(
                                    field.paramName,
                                    true,
                                    e.target.value
                                )
                            }
                            placeholder="Введите текст"
                        />
                    )}
                </div>
              )}

              <p></p>
              {errors[field.paramName] && <span className="error-text">{errors[field.paramName]}</span>}
            </div>
          )})}
        </div>
        <div className="add-order-submit-actions mx-auto mt-4 flex max-w-4xl flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button type="submit" name="save">Сохранить и в заказы</button>
          <button type="submit" name="saveAndRedirect">
            {isSaving ? "Сохранение..." : "Сохранить и в график"}
          </button>
        </div>
      </form>
    );
    
};



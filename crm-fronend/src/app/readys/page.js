// // app/readys/page.js


'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo, useCallback, useContext } from 'react';
import Spinner from "../../components/Spinner";
import { AuthContext } from "../../context/AuthContext";

export default function ReadysPage() {

    const [orderConfigs, setOrderConfigs] = useState([]);
    const [configs, setConfigs] = useState([]);
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [orders, setOrders] = useState([]);
    const [searchQuery, setSearchQuery] = useState(""); // Поисковый запрос
    const [filterType, setFilterType] = useState("active");
    const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
    const [technics, setTechnics] = useState([]);
    const [accessibleParams, setAccessibleParams] = useState(new Set());
    const { user } = useContext(AuthContext);

    var currentRoleId;
    if (user) {
      currentRoleId = user.roleId; // Получаем роль юзера)
    } 



    // Получаем orderConfigs и config
    useEffect(() => {
        const fetchOrderConfigs = async () => {
          try {
  
            const orderConfigResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orderConfigs`);
            setOrderConfigs(await orderConfigResponse.json());

            const configResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/config`);
            setConfigs(await configResponse.json());

            const orderResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders`);
            setOrders(await orderResponse.json());

            const technicsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/technics`);
            setTechnics(await technicsResponse.json());

            const permissionParamsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/role_permissionParams/${currentRoleId}`);

            const dataParams = await permissionParamsResponse.json();
            // console.log("dataParams = ", dataParams)
            setAccessibleParams(dataParams); // Сохраняем разрешенные параметры в Set для быстрого поиска            
  
        } catch (err) {
            setError(err.message);
          } finally {
            setLoading(false);
          }
      };
    
      fetchOrderConfigs();
    }, [currentRoleId]);         



    // Оставляем только Готовность
    let orderConfigParams = orderConfigs.filter(item => item.addon_id === 7);    


    const mergedOrderConfigs = useMemo(() => {
      return orderConfigParams.map(oc => ({
        ...oc,
        order: orders.find(o => Number(o.id) === Number(oc.order_id)) || {},
      }));
    }, [orderConfigParams, orders]);


    // console.log("orderConfigParams", orderConfigParams);
    // console.log("orderConfigs", orderConfigs);

    // Сортировка
    const handleSort = (key) => {
      setSortConfig(prev => {
        if (prev.key === key) {
          return {
            key,
            direction: prev.direction === "asc" ? "desc" : "asc",
          };
        } else {
          return { key, direction: "asc" };
        }
      });
    };


    // Функция получения корректного значения для сортировки если значение  объект
    function getSortableValue(value) {
      if (!value) return ""; // пустые значения в конец

      // Если объект и содержит дату — сортируем по ней
      if (typeof value === "object" && value.date) {
        return new Date(value.date).getTime(); // сортировка по времени
      }

      // Если просто строка или число
      return value;
    }

    const readMoneyFurnRaw = useCallback((rowItem) => {
      const dataObj = rowItem?.data || {};
      const orderDataObj = rowItem?.order?.data || {};

      // 1) Прямые ключи
      if (Object.prototype.hasOwnProperty.call(dataObj, "MoneyFurn")) return dataObj.MoneyFurn;
      if (Object.prototype.hasOwnProperty.call(dataObj, "moneyFurn")) return dataObj.moneyFurn;
      if (Object.prototype.hasOwnProperty.call(orderDataObj, "MoneyFurn")) return orderDataObj.MoneyFurn;
      if (Object.prototype.hasOwnProperty.call(orderDataObj, "moneyFurn")) return orderDataObj.moneyFurn;

      // 2) Поиск без учета регистра
      const dataKey = Object.keys(dataObj).find((k) => String(k).toLowerCase() === "moneyfurn");
      if (dataKey) return dataObj[dataKey];

      const orderDataKey = Object.keys(orderDataObj).find((k) => String(k).toLowerCase() === "moneyfurn");
      if (orderDataKey) return orderDataObj[orderDataKey];

      return undefined;
    }, []);

    const isMoneyFurnEnabled = useCallback((moneyFurnRaw) => {
      return (
        moneyFurnRaw === true ||
        (
          typeof moneyFurnRaw === "object" &&
          moneyFurnRaw !== null &&
          (moneyFurnRaw.checked === true || moneyFurnRaw.adminChecked === true)
        ) ||
        (typeof moneyFurnRaw === "string" && ["true", "1", "yes", "да"].includes(moneyFurnRaw.trim().toLowerCase())) ||
        (typeof moneyFurnRaw === "number" && moneyFurnRaw === 1)
      );
    }, []);

    // 0 = пусто, 1 = пустой квадрат на желтом, 2 = галочка на желтом
    const getParam20VisualState = useCallback((rowItem) => {
      const param20Raw = rowItem?.data?.param20;
      const param20Checked = !!(
        param20Raw &&
        typeof param20Raw === "object" &&
        (param20Raw.checked === true || param20Raw.adminChecked === true)
      );

      const moneyFurnEnabled = isMoneyFurnEnabled(readMoneyFurnRaw(rowItem));

      if (param20Checked && moneyFurnEnabled) return 2;
      if (param20Checked || moneyFurnEnabled) return 1;
      return 0;
    }, [isMoneyFurnEnabled, readMoneyFurnRaw]);
    

    // Функция форматирования даты
    const formatDate = (date) => {
      if (!date) return "";
      const d = new Date(date);
      if (isNaN(d.getTime())) return date; // если дата некорректна, вернуть оригинал
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    };    


    // Для столбца "Технолог" ищем технолога по ID
    const showTechnic = useCallback((technicId) => {
      const technic = technics.find(tech => Number(tech.id) === Number(technicId));
      return technic?.name || "Неизвестный технолог";
    }, [technics]);  


    // Хардкодим подписи для столбцов Фурнитура, Фасад, Подбор
    const showLabel = useCallback((configId) => {
      let result;
      if (configId === 8) {
        result = "Фур.";
      }
      if (configId === 9) {
        result = "Фас.";
      }
      if (configId === 10) {
        result = "Под.";
      }
      return result;
    }, []);


      // Функция переключения чекбокса‑даты
      const handleBoxToggle = async (itemId, field, currentlyChecked, rawValue) => {
      // rawValue — например { date:"2025-04-21", checked: true }
      // Новое значение: просто меняем checked или убираем объект целиком
      const newValue = currentlyChecked
        ? { date: rawValue.date, checked: false }  // сбрасываем флажок, оставляем дату
        : { date: new Date().toISOString().slice(0,10), checked: true }; // ставим сегодня

        // console.log("newValue = ", newValue)
        // console.log("field = ", field)

        // Отправляем на бэкенд
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orderConfigs/${itemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: { [field]: newValue } }),

        });
        if (!res.ok) {
          console.error('Ошибка обновления чекбокса', await res.text());
          return;
        }

        // Оптимистично обновляем локальный стейт:
        setOrderConfigs((prev) =>
          prev.map((cfg) => {
            if (cfg.id !== itemId) return cfg;
            // создаём новый объект с обновлённым data
            return {
              ...cfg,
              data: {
                ...cfg.data,
                [field]: newValue,
              },
            };
          })
        );

      }

    // Фильтрация
    const filteredOrders = mergedOrderConfigs.filter(oc => {
      const isActive = oc.order?.active === true;
    
      // фильтрация по статусу
      if (filterType === "active" && !isActive) return false;
      if (filterType === "completed" && isActive) return false;
    
      // фильтрация по строке поиска
      const searchLower = searchQuery.toLowerCase();
      const address = oc.order?.data?.param5?.toLowerCase() || "";
      const orderId = String(oc.order_id).toLowerCase();
      return (
        address.includes(searchLower) ||
        orderId.includes(searchLower)
      );
    });
    
    

    // Сортировка с заказными параметрами
    const sortedOrders = [...filteredOrders].sort((a, b) => {
      // Если сортировка по одному из комбинированных столбцов:
      const specialKeys = ["furn_param8", "fasad_param8", "work_param8"];
      if (specialKeys.includes(sortConfig.key)) {
        // 1) Определяем, к какому configId относится наш ключ:
        let configId;
        if (sortConfig.key.startsWith("furn_")) configId = 8;
        else if (sortConfig.key.startsWith("fasad_")) configId = 9;
        else if (sortConfig.key.startsWith("work_")) configId = 10;

        // 2) Вспомогательная функция: по одной записи заказа и данным orderConfigs
        //    возвращает число 1–4, соответствующее отображению:
        function getCombinedValue(item) {
          // Найдём связанный orderConfig (если есть):
          const related = orderConfigs.find(
            oc =>
              Number(oc.order_id) === Number(item.order_id) &&
              Number(oc.addon_id) === Number(configId)
          );

          // Если такого orderConfig нет → «➖» → число 1
          if (!related) return 1;

          // Вытащим все ключи из related.data, которые кончаются на _param2 или _param8
          const data = related.data || {};
          const param2Keys = Object.keys(data).filter(key => key.endsWith("_param2"));
          const param8Keys = Object.keys(data).filter(key => key.endsWith("_param8"));

          // Проверим, у всех ли param2 есть валидный объект {date: "..."}
          const allParam2Filled =
            param2Keys.length > 0 &&
            param2Keys.every(key => {
              const val = data[key];
              return (
                val &&
                typeof val === "object" &&
                typeof val.date === "string" &&
                val.date !== ""
              );
            });

          // Проверим, у всех ли param8 есть валидный объект {date: "..."}
          const allParam8Filled =
            param8Keys.length > 0 &&
            param8Keys.every(key => {
              const val = data[key];
              return (
                val &&
                typeof val === "object" &&
                typeof val.date === "string" &&
                val.date !== ""
              );
            });

          // Логика выдаёт:
          //  2 — есть related, но not allParam2Filled
          //  3 — все param2 заполнены, но не все param8
          //  4 — все param2 и все param8
          if (!allParam2Filled) return 2;
          if (allParam2Filled && !allParam8Filled) return 3;
          if (allParam2Filled && allParam8Filled) return 4;
          // На всякий случай (все остальные случаи)
          return 2;
        }

        // 3) Получаем «сортировочные» числа для a и b:
        const aVal = getCombinedValue(a);
        const bVal = getCombinedValue(b);

        // 4) Сравниваем в зависимости от направления:
        return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
      }

      // ——— Иначе (не «специальный» столбец) — оставляем прежнюю логику:
      if (sortConfig.key === "param20") {
        const aVal = getParam20VisualState(a);
        const bVal = getParam20VisualState(b);
        return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
      }

      let aVal = "";
      let bVal = "";

      // Поля, которые лежат в a.order.data:
      if (["param13", "param5", "param9"].includes(sortConfig.key)) {
        aVal = a.order?.data?.[sortConfig.key] ?? "";
        bVal = b.order?.data?.[sortConfig.key] ?? "";
      }
      // Если сортируем по технике (param7):
      else if (sortConfig.key === "param7") {
        const aTechnic = technics.find(
          tech => Number(tech.id) === Number(a.order?.data?.param7)
        );
        const bTechnic = technics.find(
          tech => Number(tech.id) === Number(b.order?.data?.param7)
        );
        aVal = aTechnic?.name ?? "";
        bVal = bTechnic?.name ?? "";
      }
      // Для всех остальных ключей берём из a.data и применяем getSortableValue так как значение может быть объектом
      else {
        aVal = getSortableValue(a.data?.[sortConfig.key] )?? "";
        bVal = getSortableValue(b.data?.[sortConfig.key]) ?? "";
      }

      return sortConfig.direction === "asc"
        ? aVal.toString().localeCompare(bVal.toString())
        : bVal.toString().localeCompare(aVal.toString());
    });


    if (loading) {
        return <Spinner />;
    }

    // Блокировка для кнопок
    if (accessibleParams && typeof accessibleParams[Symbol.iterator] === 'function') {
      var canEdit = [...accessibleParams].find(p => p.param === "buttonsInReadyes")?.canEdit ?? false;
    }
    const hasButtonsInReadyes = Array.from(accessibleParams).some(p => p.param === "buttonsInReadyes");


    return (
        <div className="wide-data-page readys-page px-3 pb-3 pt-3 sm:px-4">
        {/* {(hasButtonsInOrders || hasLoadOrders || canSearch) && ( */}
        <div className="wide-data-toolbar flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h1>Готовность</h1>

              <div className="wide-data-search w-full sm:max-w-xl">
                  <input
                      type="text"
                      placeholder="Поиск по номеру заказа, адресу..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ padding: "7px 0px 8px 0px", width: "100%", textAlign: "center", display: "block", margin: "10px auto" }}
                    />
              </div>
              {hasButtonsInReadyes && (
                <div className="wide-data-filters flex flex-wrap gap-2">
                  <button onClick={() => setFilterType("active")} disabled={filterType === "active" || !canEdit}>
                    Активные
                  </button>
                  <button onClick={() => setFilterType("completed")} disabled={filterType === "completed" || !canEdit}>
                    Завершенные
                  </button>
                  <button onClick={() => setFilterType("all")} disabled={filterType === "all" || !canEdit}>
                    Все
                  </button>
                </div>
                              )}
                </div>

          {/* <p className="wide-data-scroll-hint mb-2 mt-3 text-center text-sm text-gray-500 sm:hidden">
            Проведите по таблице влево или вправо
          </p> */}
          <div className="wide-table-scroll overflow-auto overscroll-contain rounded-lg border border-gray-200" tabIndex={0}>
          <table className="wide-data-table readys-table" style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
            <thead style={{
              position: "sticky",
              top: 0,
              backgroundColor: "white",
              zIndex: 100
            }}>
              <tr>
              <th
                onClick={() => handleSort("param13")}
                style={{
                  border: "1px solid #ccc",
                  padding: "8px",
                  textAlign: "left",
                  cursor: "pointer",
                  width: "80px", // фиксированная ширина для первого столбца
                  whiteSpace: "normal",     // ✅ разрешает перенос текста
                  wordWrap: "break-word",   // ✅ разрешает перенос слов
                }}
              >
                Дата приема {sortConfig.key === "param13" && (sortConfig.direction === "asc" ? "🔼" : "🔽")}
              </th>

              <th
                onClick={() => handleSort("param5")}
                style={{
                  border: "1px solid #ccc",
                  padding: "8px",
                  textAlign: "left",
                  cursor: "pointer",
                  width: "200px"
                }}
              >
                Адрес {sortConfig.key === "param5" && (sortConfig.direction === "asc" ? "🔼" : "🔽")}
              </th>

              <th
                onClick={() => handleSort("param9")}
                style={{
                  border: "1px solid #ccc",
                  padding: "8px",
                  textAlign: "left",
                  cursor: "pointer",
                  width: "130px" 
                }}
              >
                Изделие {sortConfig.key === "param9" && (sortConfig.direction === "asc" ? "🔼" : "🔽")}
              </th>

              <th
                onClick={() => handleSort("param7")}
                style={{
                  border: "1px solid #ccc",
                  padding: "8px",
                  textAlign: "left",
                  cursor: "pointer",
                  width: "80px" 
                }}
              >
                Технолог {sortConfig.key === "param7" && (sortConfig.direction === "asc" ? "🔼" : "🔽")}
              </th>


                  {configs
                    .filter(config => {
                      const isAllowedConfig8 = config.configId === 8 && ["furn_param8"].includes(config.paramName);
                      const isAllowedConfig9 = config.configId === 9 && ["fasad_param8"].includes(config.paramName);
                      const isAllowedConfig10 = config.configId === 10 && ["work_param8"].includes(config.paramName);
                      // console.log("config = ", config)
                      return (isAllowedConfig8 || isAllowedConfig9 || isAllowedConfig10) &&
                        config.active &&
                        accessibleParams.some(p => p.param === config.paramName);
                    })
                    .sort((a, b) => (a.configId || 0) - (b.configId || 0))
                    .map(config => (
                      <th
                        key={config.paramName}
                        onClick={() => handleSort(config.paramName)}
                        style={{
                          border: "1px solid #ccc",
                          padding: "8px",
                          width: "30px",
                          cursor: "pointer",
                          whiteSpace: "normal",
                        }}
                      >
                        {showLabel(config.configId)}
                        {sortConfig.key === config.paramName && (sortConfig.direction === "asc" ? " 🔼" : " 🔽")}
                      </th>
                  ))}


                  {configs
                    .filter(config =>
                      config.configId === 7 &&
                      config.active &&
                      accessibleParams.some(p => p.param === config.paramName) // ✅ доступ
                    )
                    .sort((a, b) => (a.sorting || 0) - (b.sorting || 0))
                    .map(config => (
                      <th
                        key={config.paramName}
                        onClick={() => handleSort(config.paramName)}
                        style={{
                          border: "1px solid #ccc",
                          padding: "8px",
                          width: config.width ? `${config.width}px` : "auto",
                          cursor: "pointer",
                          whiteSpace: "normal",
                          wordWrap: "break-word",
                        }}
                      >
                        {config.newLabel || config.label}
                        {sortConfig.key === config.paramName && (sortConfig.direction === "asc" ? " 🔼" : " 🔽")}
                      </th>
                  ))}


              </tr>
            </thead>
            <tbody>

              {sortedOrders.map((item, idx) => (
                <tr key={idx}
                onClick={() => router.push(`/orderConfig/${item.id}`)}
                style={{ cursor: "pointer", backgroundColor: idx % 2 === 0 ? "#fff" : "#f9f9f9", height: "48px" }}
                >
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                    {formatDate(item.order?.data?.param13) || ""}
                  </td>

                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                    {item.order?.data?.param5 || ""}
                  </td>
                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                    {item.order?.data?.param9 || ""}
                  </td>

                  <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                    {showTechnic(item.order?.data?.param7) || ""}
                  </td>

                  
                  {/* Ячейки заказных позиций */}
                  {[8, 9, 10].map(configId => {
                    // определяем, по какому URL кликаем внутри этой ячейки
                    const isSpecial = [8, 9, 10].includes(configId);
                    const targetUrl = isSpecial
                      ? `/order/${item.order_id}`
                      : `/orderConfig/${item.id}`;

                    const related = orderConfigs.find(
                      oc => Number(oc.order_id) === Number(item.order_id) && Number(oc.addon_id) === Number(configId)
                    );

                    const data = related?.data || {};
                    const param2Keys = Object.keys(data).filter(key => key.endsWith("_param2"));
                    const param8Keys = Object.keys(data).filter(key => key.endsWith("_param8"));

                    const allParam2Filled = param2Keys.length > 0 && param2Keys.every(key => {
                      const val = data[key];
                      return val && typeof val === "object" && typeof val.date === "string" && val.date !== "";
                    });

                    const allParam8Filled = param8Keys.length > 0 && param8Keys.every(key => {
                      const val = data[key];
                      return val && typeof val === "object" && typeof val.date === "string" && val.date !== "";
                    });

                    let content = "➖";
                    let backgroundColor = "";

                    if (related) {
                      if (allParam2Filled) {
                        backgroundColor = "yellow";
                        if (allParam8Filled) {
                          content = "✅";
                        } else {
                          content = (
                            <svg
                              className="w-6 h-6 text-green-500"
                              viewBox="0 0 24 24"
                              fill="none"
                              style={{ verticalAlign: "-webkit-baseline-middle" }}
                            >
                              <rect
                                x="4"
                                y="4"
                                width="16"
                                height="16"
                                stroke="currentColor"
                                strokeWidth="2"
                                fill="none"
                                rx="2"
                                ry="2"
                              />
                            </svg>
                          );
                        }
                      } else {
                        content = (
                          <svg
                            className="w-6 h-6 text-green-500"
                            viewBox="0 0 24 24"
                            fill="none"
                            style={{ verticalAlign: "-webkit-baseline-middle" }}
                          >
                            <rect
                              x="4"
                              y="4"
                              width="16"
                              height="16"
                              stroke="currentColor"
                              strokeWidth="2"
                              fill="none"
                              rx="2"
                              ry="2"
                            />
                          </svg>
                        );
                      }
                    }

                    return (
            <td
              key={`${item.id}-${configId}`}
              style={{
                textAlign: "center",
                backgroundColor,
                padding: "6px",
                cursor: isSpecial ? "pointer" : "default",
                border: "1px solid #ccc"
              }}
              onClick={e => {
                if (isSpecial) {
                  e.stopPropagation();
                  router.push(targetUrl);
                }
                // если не special — щёлк по <tr> сработает
              }}
            >
              {content}
            </td>
                    );
                  })}


                  {/* Ячейки готовности */}
                  {configs
                    .filter(config => config.configId === 7 && config.active
                      && accessibleParams.some(p => p.param === config.paramName) // ✅ фильтрация
                    )
                    .sort((a, b) => (a.sorting || 0) - (b.sorting || 0)) // сортировка по sorting
                    .map(config => {
                      const field = config.paramName; 
                      const value = item.data?.[field];
                      let displayValue = "";

                      if (config.type === "check_date_admin") {
                        const isChecked = !!(value && value.checked);
                        return (
                          <td
                            key={`${item.id}-${field}`}
                            style={{
                              border: "1px solid #ccc",
                              padding: "8px",
                              textAlign: "center",
                              whiteSpace: "normal",
                              wordWrap: "break-word"
                            }}
                          >
                            {isChecked ? "✅" : ""}
                          </td>
                        );
                      }



                      if (["check_text_admin", "string_admin", "boolean_admin", "string"].includes(config.type)) {

                        const isChecked = !!(value && value.checked);
                        return (
                          <td
                            key={`${item.id}-${field}`}
                            style={{
                              border: "1px solid #ccc",
                              padding: "8px",
                              textAlign: "center",
                              whiteSpace: "normal",
                              wordWrap: "break-word"
                            }}
                          >
                            {isChecked ? "✅" : ""}
                          </td>
                        );
                      }


                      if (config.type === "text_date" || config.type === "text_date_admin") {

                        const isDate = !!(value && value.date);

                        return (
                          <td
                            key={`${item.id}-${field}`}
                            style={{
                              border: "1px solid #ccc",
                              padding: "8px",
                              textAlign: "center",
                              whiteSpace: "normal",
                              wordWrap: "break-word"
                            }}
                          >
                            {isDate ? formatDate(value?.date) : ""}
                          </td>
                        );
                      }

                      if (config.type === "check_date") {
                          const isChecked = !!(value && value.checked);
                          const isParam20 = field === "param20";
                          const param20State = isParam20 ? getParam20VisualState(item) : null;
                          // Логика для "Куплен" (param20):
                          // 1) param20 != true && MoneyFurn != true -> пусто
                          // 2) param20 == true XOR MoneyFurn == true -> пустой квадрат на желтом
                          // 3) param20 == true && MoneyFurn == true -> галочка на желтом
                          const showYellowForParam20 = isParam20 && (param20State > 0);
                          const canToggle = true;

                          const emptySquare = (
                            <svg
                              className="w-6 h-6 text-green-500"
                              viewBox="0 0 24 24"
                              fill="none"
                              style={{ verticalAlign: "-webkit-baseline-middle" }}
                            >
                              <rect
                                x="4"
                                y="4"
                                width="16"
                                height="16"
                                stroke="currentColor"
                                strokeWidth="2"
                                fill="none"
                                rx="2"
                                ry="2"
                              />
                            </svg>
                          );

                          let cellContent = isChecked ? "✅" : "";
                          if (isParam20) {
                            if (param20State === 2) {
                              cellContent = "✅";
                            } else if (param20State === 1) {
                              cellContent = emptySquare;
                            } else {
                              cellContent = "";
                            }
                          }

                          // console.log("field = ", field)
                          // console.log("value.date = ", value?.date)
                          // console.log("isChecked = ", isChecked)
                            return (
                              <td
                                key={`${item.id}-${field}`}
                                style={{
                                  border: "1px solid #ccc",
                                  padding: "8px",
                                  wordWrap: "break-word",
                                  textAlign: "center",      // выравниваем по центру
                                  cursor: canToggle ? "pointer" : "default",        // чтобы было понятно, что кликабельно
                                  userSelect: "none",       // чтобы текст не выделялся при клике
                                  backgroundColor: showYellowForParam20 ? "yellow" : undefined
                                }}
                                onClick={e => {
                                  e.stopPropagation();      // не уходим внутрь строки
                                  if (!canToggle) return;
                                  handleBoxToggle(item.id, field, isChecked, value);
                                }}
                              >{cellContent}
                              </td>
                            );
                        
                      } else if (value === null || value === undefined || value === "") {
                        displayValue = "";
                      } else {
                        displayValue = value;
                       }

                      return (
                        <td
                          key={config.paramName}
                          style={{
                            border: "1px solid #ccc",
                            padding: "8px",
                            width: config.width ? `${config.width}px` : "auto",
                            textAlign: typeof displayValue === "string" && (displayValue === "✅" || displayValue === "") ? "center" : "center",
                            whiteSpace: "normal",     // ✅ разрешает перенос текста
                            wordWrap: "break-word",   // ✅ разрешает перенос слов
                          }}
                        >
                          {displayValue}
                        </td>
                      );
                    })}
                </tr>
              ))}


            </tbody>
          </table>
          </div>
        </div>
      );
}



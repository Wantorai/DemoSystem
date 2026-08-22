'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo, useCallback } from 'react';
import axios from 'axios';
import Spinner from "../../components/Spinner";

export default function DetailsPage() {
  const [orderConfigs, setOrderConfigs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [technics, setTechnics] = useState([]);
  const [statusColors, setStatusColors] = useState({});
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [filterType, setFilterType] = useState("active");
  const [columns, setColumns] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [searchQuery, setSearchQuery] = useState(""); // Поисковый запрос

  // При монтировании компонента пытаемся восстановить сортировку из localStorage
  useEffect(() => {
    const savedSortConfig = localStorage.getItem("orderconfigs_sortConfig"); 
    if (savedSortConfig) {
      setSortConfig(JSON.parse(savedSortConfig));
    }
  }, []);

  // Загружаем все данные одновременно
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ordersRes, technicsRes, orderConfigsRes, colorsRes,columnsRes, configRes] = await Promise.all([
          axios.get(`${process.env.NEXT_PUBLIC_API_URL}/orders`),
          axios.get(`${process.env.NEXT_PUBLIC_API_URL}/technics`),
          axios.get(`${process.env.NEXT_PUBLIC_API_URL}/orderConfigs`),
          axios.get(`${process.env.NEXT_PUBLIC_API_URL}/status-colors`),
          axios.get(`${process.env.NEXT_PUBLIC_API_URL}/column-width`),
          axios.get(`${process.env.NEXT_PUBLIC_API_URL}/config`),
        ]);

        setOrders(ordersRes.data);
        setTechnics(technicsRes.data);
        setOrderConfigs(orderConfigsRes.data);


        // Преобразуем массив цветов в объект вида { statusName: color }
        const colorsMap = {};
        colorsRes.data.forEach(item => {
          colorsMap[item.status] = item.color;
        });
        setStatusColors(colorsMap);
        setColumns(columnsRes.data);
        setConfigs(configRes.data);
        // console.log("columnsRes = ", columnsRes.data )
      } catch (error) {
        console.error('Ошибка загрузки данных:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Дополнительные колонки, которые берутся из item.data с ключами вида _param{номер}
  const addonColumns = useMemo(() => {
    return columns.map(item => item.columnName);
  }, [columns]);

  // console.log("addonColumns = ", addonColumns)

  const formatIfDate = (val) => {
    // Если значение строка и соответствует формату YYYY-MM-DD
    if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
      return formatDate(val);
    }
    return val;
  };
  


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
  
  

  // Функция для определения цвета ячейки по значению из item.addon.name
  const getCellBackgroundColor = (cell) => {
    if (cell === "Фурнитура") return statusColors.furnitura || statusColors.default;
    if (cell === "Фасады") return statusColors.fasad_ready || statusColors.fasad_default;
    if (cell === "От подрядчиков") return statusColors.work || statusColors.default;
    return statusColors.default;
  };

  // Ищем значение для заданного номера параметра, учитывая только ключи с нижним подчеркиванием
  const getValueByParamNumber = (dataObj, paramNumber) => {
    // console.log("dataObj:", dataObj, "paramNumber:", paramNumber);
    const key = Object.keys(dataObj).find(k => k.includes('_') && k.endsWith(`_param${paramNumber}`));
    // console.log("Found key:", key);
    return key ? dataObj[key] : undefined;
  };
  

  // Для столбца "Технолог" ищем технолога по ID
  const showTechnic = useCallback((technicId) => {
    const technic = technics.find(tech => Number(tech.id) === Number(technicId));
    return technic?.name || "Неизвестный технолог";
  }, [technics]);

  // Обработчик клика по заголовку для сортировки
  const handleSort = (key) => {
    setSortConfig((prev) => {
      let direction = "asc";
      if (prev.key === key && prev.direction === "asc") {
        direction = "desc";
      }
      const newSortConfig = { key, direction };
      localStorage.setItem("orderconfigs_sortConfig", JSON.stringify(newSortConfig));
      return newSortConfig;
    });
  };

  // Отсортированный массив orderConfigs. Если сортировка задана, сортируем либо по дополнительным столбцам,
  // либо по значениям из item.data для колонок addonColumns.
  const sortedOrderConfigs = useMemo(() => {
    if (!sortConfig.key) return orderConfigs;

    // Если сортировка по одной из дополнительных колонок:
    if (["Технолог", "Адрес", "Изделие"].includes(sortConfig.key)) {
      return [...orderConfigs].sort((a, b) => {
        // Находим соответствующий заказ для каждого orderConfig
        const orderA = orders.find(o => Number(o.id) === Number(a.order_id)) || {};
        const orderB = orders.find(o => Number(o.id) === Number(b.order_id)) || {};
        let aValue = "", bValue = "";
        if (sortConfig.key === "Технолог") {
          aValue = showTechnic(orderA.data?.param7);
          bValue = showTechnic(orderB.data?.param7);
        }
        if (sortConfig.key === "Адрес") {
          aValue = orderA.data?.param5 || "";
          bValue = orderB.data?.param5 || "";
        }
        if (sortConfig.key === "Изделие") {
          aValue = orderA.data?.param9 || "";
          bValue = orderB.data?.param9 || "";
        }
        return sortConfig.direction === "asc"
          ? String(aValue).localeCompare(String(bValue), "ru")
          : String(bValue).localeCompare(String(aValue), "ru");
      });
    }

    // Если сортировка по одной из колонок addonColumns:
    const colIndex = addonColumns.indexOf(sortConfig.key);
    if (colIndex !== -1) {
      const paramNumber = colIndex + 1;
      return [...orderConfigs].sort((a, b) => {
        const aValue = getValueByParamNumber(a.data, paramNumber) ?? "";
        const bValue = getValueByParamNumber(b.data, paramNumber) ?? "";
        // Если оба значения – числа, сравниваем как числа
        if (typeof aValue === "number" && typeof bValue === "number") {
          return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
        }
        return sortConfig.direction === "asc"
          ? String(aValue).localeCompare(String(bValue), "ru")
          : String(bValue).localeCompare(String(aValue), "ru");
      });
    }

    return orderConfigs;
  }, [orderConfigs, sortConfig, addonColumns, orders, showTechnic]);


  // Проверка чекбокса
  const renderCell = (value) => {
    // Если value существует и это объект
    if (value && typeof value === "object") {
      // Если в объекте есть свойство date и оно строка, форматируем его
      if ("checked" in value && "date" in value) {
        const formattedDate = formatIfDate(value.date);
        return (
          <div>
            {value.checked && <input type="checkbox" checked={value.checked} readOnly />}
            <span style={{ marginLeft: "8px" }}>{formattedDate}</span>
          </div>
        );
      }
      return "";
    }
    // Если value строка, проверяем, является ли она датой
    if (typeof value === "string") {
      return formatIfDate(value);
    }
    return value || "";
  };
  


  const filteredOrderConfigs = sortedOrderConfigs
  .filter(item => Object.keys(item.data).some(k => k.includes('_')))
  .filter(item => {
    // Получаем значение параметра "Готовность"
    // const readinessValue = Object.values(item.data).find(
    //   v => typeof v === "object" && v !== null && "checked" in v
    // );
  
    const orderInstall = orders.find(o => o.id === item.order_id);
    // console.log("orderInstall = ", orderInstall)
    
    if (filterType === "active") return orderInstall.data.statusData?.orderInstalled === "";
    // if (filterType === "completed") return readinessValue?.checked === true;
    if (filterType === "completed") return orderInstall.data.statusData?.orderInstalled != "";
    return true; // "all" - без фильтра
  });

  // console.log("filteredOrderConfigs = ", filteredOrderConfigs)



  // Поиск заказов по имени клиента, номеру заказа и адресу
  const searchFilteredOrders = filteredOrderConfigs.filter(item => {
    // Ищем клиента по clientId
    const vendor = item.data.work_param1 || item.data.furn_param1 || item.data.fasad_param1;
    const order = orders.find(order => Number(order.id) === Number(item.order_id))

    return searchQuery
    ? (order.data.order_number?.toString().includes(searchQuery) ||  // Поиск по номеру заказа
        order.data.param5?.toLowerCase().includes(searchQuery.toLowerCase()) || // Поиск по адресу
        (vendor?.toLowerCase().includes(searchQuery.toLowerCase()))) // Поиск по имени поставщика
    : true;
  });


  const sortedAddonColumns = addonColumns.slice().sort((a, b) => {
    const aConfig = columns.find(col => col.columnName === a);
    const bConfig = columns.find(col => col.columnName === b);
    const aOrder = aConfig ? aConfig.sortOrder : 0;
    const bOrder = bConfig ? bConfig.sortOrder : 0;
    return aOrder - bOrder;
  });
  




  if (loading) {
    return <Spinner />;
  }

  return (
    <div className="wide-data-page details-page px-3 pb-3 pt-3 sm:px-4">
    <div className="wide-data-toolbar flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <h1>Заказные позиции</h1>

      <div className="wide-data-search w-full sm:max-w-xl">
          <input
              type="text"
              placeholder="Поиск по номеру заказа, поставщику, адресу..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ padding: "7px 0px 8px 0px", width: "100%", textAlign: "center", display: "block", margin: "10px auto" }}
            />
      </div>

        <div className="wide-data-filters flex flex-wrap gap-2">
          <button onClick={() => setFilterType("active")} disabled={filterType === "active"}>
            Активные
          </button>
          <button onClick={() => setFilterType("completed")} disabled={filterType === "completed"}>
            Завершенные
          </button>
          <button onClick={() => setFilterType("all")} disabled={filterType === "all"}>
            Все
          </button>
        </div>
      </div>
      {/* <p className="wide-data-scroll-hint mb-2 mt-3 text-center text-sm text-gray-500 sm:hidden">
        Проведите по таблице влево или вправо
      </p> */}
      <div className="wide-table-scroll overflow-auto overscroll-contain rounded-lg border border-gray-200" tabIndex={0}>
      <table className="tasks wide-data-table details-table" style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead  style={{
              position: "sticky",
              top: 0,
              backgroundColor: "white",
              zIndex: 100
            }}>
          <tr>
            {/* Дополнительные колонки, сортировка по которым работает */}
            <th onClick={() => handleSort("Технолог")} style={{ border: "1px solid #ccc", padding: "8px", textAlign: "left", cursor: "pointer", width: "80px" }}>
              Технолог {sortConfig.key === "Технолог" ? (sortConfig.direction === "asc" ? "🔼" : "🔽") : ""}
            </th>
            <th onClick={() => handleSort("Адрес")} style={{ border: "1px solid #ccc", padding: "8px", textAlign: "left", cursor: "pointer", width: "200px" }}>
              Адрес {sortConfig.key === "Адрес" ? (sortConfig.direction === "asc" ? "🔼" : "🔽") : ""}
            </th>
            <th onClick={() => handleSort("Изделие")} style={{ border: "1px solid #ccc", padding: "8px", textAlign: "left", cursor: "pointer", width: "130px" }}>
              Изделие {sortConfig.key === "Изделие" ? (sortConfig.direction === "asc" ? "🔼" : "🔽") : ""}
            </th>

            {sortedAddonColumns.map((label) => {
              // Ищем в columns объект с соответствующим columnName
              const columnConfig = columns.find(col => col.columnName === label);
              return (
                <th
                  key={label}
                  onClick={() => handleSort(label)}
                  style={{
                    border: "1px solid #ccc",
                    padding: "8px",
                    textAlign: "left",
                    cursor: "pointer",
                    width: columnConfig ? `${columnConfig.width}px` : "auto",
                    whiteSpace: "normal",     // ✅ разрешает перенос текста
                    wordWrap: "break-word",   // ✅ разрешает перенос слов
                  }}
                >
                  {label} {sortConfig.key === label ? (sortConfig.direction === "asc" ? "🔼" : "🔽") : ""}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {searchFilteredOrders.map((item, rowIndex) => {
            const order = orders.find(order => Number(order.id) === Number(item.order_id)) || {};

            // Определяем, нужно ли закрасить строку (если есть чекбокс с checked === true)
            const hasCheckedCheckbox = addonColumns.some((_, colIndex) => {
              const value = getValueByParamNumber(item.data, colIndex + 1);
              // console.log("Checking value:", value);
              return value && typeof value === 'object' && 'checked' in value && value.checked;
            });

            return (
              <tr
                key={item.id || rowIndex}
                onClick={() => router.push(`/orderConfig/${item.id}`)}
                style={{
                  cursor: "pointer",
                  backgroundColor: hasCheckedCheckbox ? getCellBackgroundColor(item.addon?.name) : "transparent",
                  whiteSpace: "normal",     // ✅ разрешает перенос текста
                  wordWrap: "break-word",   // ✅ разрешает перенос слов
                  height: "48px"
                }}
              >
                <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                  {showTechnic(order.data?.param7) || "❌"}
                </td>
                <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                  {order.data?.param5 || "❌"}
                </td>
                <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                  {order.data?.param9 || "❌"}
                </td>
  
                {sortedAddonColumns.map((label, colIndex) => {
                // Ищем конфигурацию для текущего столбца по label
                const matchingConfig = configs.find(cfg => cfg.label === label);
                
                if (!matchingConfig) {
                  return (
                    <td key={colIndex} style={{ border: "1px solid #ccc", padding: "8px",
                      whiteSpace: "normal",     // ✅ разрешает перенос текста
                      wordWrap: "break-word",   // ✅ разрешает перенос слов
                     }}>
                      {/* Если конфигурация не найдена, пустая ячейка */}
                    </td>
                  );
                }
                
                // Извлекаем суффикс из paramName, например, "furn_param1" -> "_param1"
                const suffix = matchingConfig.paramName.replace(/^.*(_param\d+)$/, "$1");
                
                // Ищем ключ в item.data, который заканчивается на этот суффикс
                const matchingKey = Object.keys(item.data).find(k => k.endsWith(suffix));
                
                // Если ключ найден – получаем его значение, иначе оставляем пустую строку
                const matchingValue = matchingKey ? item.data[matchingKey] : undefined;

                // Ищем ширину для этого столбца по его label
                const columnConfig = columns.find(col => col.columnName === label);
                // console.log("columnConfig = ", columnConfig)
                
                return (
                  <td key={colIndex} style={{ border: "1px solid #ccc", padding: "8px",
                    width: columnConfig ? `${columnConfig.width}px` : "auto",
                    whiteSpace: "normal",     // ✅ разрешает перенос текста
                    wordWrap: "break-word",   // ✅ разрешает перенос слов
                   }}>
                    { matchingValue ? renderCell(matchingValue) : "" }
                  </td>
                );
              })}
  

              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}


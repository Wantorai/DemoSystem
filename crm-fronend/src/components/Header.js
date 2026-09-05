"use client";

import Link from "next/link";
import { useContext, useEffect, useState, useRef, useCallback } from "react";
import { AuthContext } from "../context/AuthContext";
import { Menu, X } from "lucide-react";
import "./header.css";
import { useMask } from '../components/MaskContext';
import { format } from 'date-fns';
import Spinner from "../components/Spinner";
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import useUnreadSupportTickets from '../hooks/useUnreadSupportTickets';


const Header = () => {
  const { user, token, logout, initialized, permissions: routePermissions } = useContext(AuthContext);
  const unreadTicketCount = useUnreadSupportTickets(token, user);
  const [allowedPermissionIds, setAllowedPermissionIds] = useState(new Set()); // Разрешенные permissionId
  const [permissionMap, setPermissionMap] = useState(new Map()); // Сопоставление resource → permissionId
  const [roleId, setRoleId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { isMasked, toggleMask } = useMask();
  const [accessibleParams, setAccessibleParams] = useState(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [statusErrors, setStatusErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [technics, setTechnics] = useState([]); // Список технологов
  const router = useRouter();
  const [errorCountOplata, setErrorCountOplata] = useState(0);
  const [statusErrorsOplata, setStatusErrorsOplata] = useState([]);
  const [modalOpenOplata, setModalOpenOplata] = useState(false);
  // Новое состояние для порогового количества дней (по умолчанию 7)
  const [thresholdDays, setThresholdDays] = useState(7);
  const modalRef = useRef(null);
  const modalRef2 = useRef(null);
  const [loadingCounts, setLoadingCounts] = useState(true);
  // кеш для страниц деталей, чтобы не фетчить повторно
  const readyCacheRef = useRef(new Map());      // key = page (or threshold) -> rows
  const paymentCacheRef = useRef(new Map());
  // системные данные
  const [sysError, setSysError] = useState(null);
  const [freePercent, setFreePercent] = useState(null);
  const [editedComments, setEditedComments] = useState({});
  const [editedOplataComments, setEditedOplataComments] = useState({});
  const [, setError] = useState(null);
  const getAuthHeaders = (extra = {}) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    };
  };

  useEffect(() => {
    if (user && user.roleId != null && user.roleId !== "undefined") {
      setRoleId(Number(user.roleId));
    } else {
      setRoleId(null);
    }
  }, [user]);


  // эффект, который будет сохранять пороговое количество дней в localStorage
  useEffect(() => {
    const saved = localStorage.getItem('thresholdDays');
    if (saved !== null) {
      setThresholdDays(Number(saved));
    }
  }, []);


  // обработчик изменения порогового количества дней
  const handleThresholdChange = (e) => {
  const val = Number(e.target.value);
  if (!isNaN(val) && val >= 0) {
    setThresholdDays(val);
    localStorage.setItem('thresholdDays', String(val));
  }
};


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


  // эффект, который будет отслеживать клики вне модального окна
  useEffect(() => {
    const handleClickOutside2 = (event) => {
      if (modalRef2.current && !modalRef2.current.contains(event.target)) {
        setModalOpenOplata(false);
      }
    };

    if (modalOpenOplata) {
      document.addEventListener('mousedown', handleClickOutside2);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside2);
    };
  }, [modalOpenOplata]);


  // Загружаем список всех permissions (permissionId → resource)
  useEffect(() => {
    async function fetchPermissionsList() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/permissions`, {
          headers: getAuthHeaders(),
        });
        const data = await res.json();

        const map = new Map();
        if (Array.isArray(data)) {
          data.forEach(({ id, resource }) => {
            map.set(resource, id);
          });
        }

        setPermissionMap(map);
      } catch (error) {
        console.error("Ошибка загрузки списка прав:", error);
      }
    }

    fetchPermissionsList();
  }, []);


  // Загружаем права доступа для текущей роли
  useEffect(() => {

    const controller = new AbortController();
    const signal = controller.signal;


    async function fetchRolePermissions() {
      // строгая проверка: roleId должен быть числом
      if (!user) return;
      const roleNum = Number(roleId);
      if (!Number.isInteger(roleNum)) return;

      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/role_permissions/${roleNum}`, {
          headers: getAuthHeaders(),
          signal,
        });
        const data = await res.json();

        const allowedPermissions = new Set();
        if (Array.isArray(data)) {
          data.forEach(({ permissionId, allowed }) => {
            if (allowed) {
              allowedPermissions.add(permissionId);
            }
          });
        }



        const permissionParamsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/role_permissionParams/${roleNum}`, { signal });
        if (!permissionParamsResponse.ok) throw new Error('Fetch failed');

        const dataParams = await permissionParamsResponse.json();
        // console.log("dataParams = ", dataParams)
        setAccessibleParams(dataParams); // Сохраняем разрешенные параметры в Set для быстрого поиска


        setAllowedPermissionIds(allowedPermissions);
      } catch (err) {
        if (err.name === 'AbortError') {
          // запрос отменён — ничего не делаем
          return;
        }
        console.error(`Ошибка загрузки прав для роли ${roleId}:`, err);
      }
    }

    fetchRolePermissions();
    return () => controller.abort();
  }, [roleId, user]);


  // загрузка системных данных один раз
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/system/system-info`)
      .then(res => res.json())
      .then(data => {
        // console.log("data", data);
        if (data.error) {
          setSysError(data.error);
        } else if (data.disk && data.disk.usagePercent) {
          const used = parseInt(data.disk.usagePercent, 10);
          setFreePercent(100 - used);
        } else {
          // Просто сбрасываем ошибку, без установки нового sysError
          setFreePercent(null);
          setSysError(null);
        }
      })
      .catch(err => {
        setSysError(err.message);
      });
  }, []);



  // Запрос ошибок заказов
    useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    const thr = Number(thresholdDays) || 7;
    const installThr = 30; // можно вынести в state, если нужно менять

    setLoadingCounts(true);

    (async () => {
        try {
        const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/system/order-errors?onlyCount=true&thresholdDays=${thr}&installThreshold=${installThr}`,
            { signal }
        );
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        setErrorCount(data.countReady ?? 0);
        setErrorCountOplata(data.countPayment ?? 0);
        } catch (err) {
        if (err.name === 'AbortError') {
            // запрос отменён — ничего не делаем
        } else {
            console.error('Ошибка загрузки счётчиков ошибок:', err);
            // опционально: setErrorCount(0); setErrorCountOplata(0);
        }
        } finally {
        setLoadingCounts(false);
        }
    })();

    return () => controller.abort();
    }, [thresholdDays]);


  // Получаем данные по технологам
  useEffect(() => {
  const fetchData = async () => {
      try {
          const technicsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/technics`);
          setTechnics(await technicsResponse.json());
          if (!technicsResponse.ok) {
            throw new Error("Ошибка при загрузке технологов");
          }
          // console.log("configResponses", configResponses);

        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
  }, [] );



  // загрузчики деталей
  const fetchReadyDetails = useCallback(async (page = 0) => {
      const PAGE_SIZE = 200; // 
      const key = `${thresholdDays}:${page}`;
      if (readyCacheRef.current.has(key)) {
          setStatusErrors(readyCacheRef.current.get(key));
          return;
      }

      setLoading(true);
      try {
          const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/system/order-errors?onlyCount=false&type=ready&thresholdDays=${thresholdDays}&limit=${PAGE_SIZE}&offset=${page*PAGE_SIZE}`);
          const data = await resp.json();
          let rows = data.readyRows || [];

          // Загружаем конфиги для всех заказов
          const configsPromises = rows.map(order => 
            fetch(`${process.env.NEXT_PUBLIC_API_URL}/orderConfigs?order_id=${order.id}`)
              .then(r => r.json())
              .then(configData => ({
                ...order,
                configs: configData.filter(config => config.addon_id === 9)
              }))
              .catch(err => {
                console.error(`Ошибка загрузки конфига для заказа ${order.id}`, err);
                return { ...order, configs: null }; // или пустой объект
              })
          );
          
          // Ждем завершения всех запросов
          const rowsWithConfigs = await Promise.all(configsPromises); 

          readyCacheRef.current.set(key, rowsWithConfigs);
          setStatusErrors(rowsWithConfigs);
          // console.log('rowsWithConfigs = ', rowsWithConfigs);


          if (data.countReady !== undefined) setErrorCount(data.countReady);
      } catch (err) {
          console.error('Ошибка загрузки ready details', err);
      } finally {
          setLoading(false);
      }
  }, [thresholdDays]);

  const fetchPaymentDetails = useCallback(async (page = 0) => {
      const PAGE_SIZE = 200;
      const installThr = 30;
      const key = `${installThr}:${page}`;
      if (paymentCacheRef.current.has(key)) {
          setStatusErrorsOplata(paymentCacheRef.current.get(key));
          return;
      }

      setLoading(true);
      try {
          const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/system/order-errors?onlyCount=false&type=payment&installThreshold=${installThr}&limit=${PAGE_SIZE}&offset=${page*PAGE_SIZE}`);
          const data = await resp.json();
          const rows = data.paymentRows || [];
          paymentCacheRef.current.set(key, rows);
          setStatusErrorsOplata(rows);
          // console.log('rows Oplata = ', rows);
          if (data.countPayment !== undefined) setErrorCountOplata(data.countPayment);
      } catch (err) {
          console.error('Ошибка загрузки payment details', err);
      } finally {
          setLoading(false);
      }
  }, []);




  // когда открывается модал с ошибками спецификаций
  useEffect(() => {
      if (modalOpen) fetchReadyDetails(0);
  }, [modalOpen, thresholdDays, fetchReadyDetails]);

  useEffect(() => {
      if (modalOpenOplata) fetchPaymentDetails(0);
  }, [modalOpenOplata, fetchPaymentDetails]);


  const handleOrderClick = (id) => {
      setModalOpen(false)
      setModalOpenOplata(false)
      router.push(`/order/${id}`); // Переход на страницу заказа по id
  };

  // const handleReadyClick = (id) => {
  //     setModalOpen(false)
  //     router.push(`/orderConfig/${id}`); // Переход на страницу готовности по id
  // };


  // Сохраняем коментарий из модалки ошибки статуса  
  const handleSaveComment = async (id) => {
    const newComment = editedComments[id];
  
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ comment1: newComment }),
      });
  
      toast('Комментарий сохранён');
    } catch (error) {
      console.error('Ошибка при сохранении комментария:', error);
      toast('Ошибка при сохранении');
    }
  };

  const handleOplataCommentChange = (orderId, field, value) => {
    setEditedOplataComments((prev) => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] || {}),
        [field]: value,
      },
    }));
  };

  const handleSaveOplataComments = async (order) => {
    const draft = editedOplataComments[order.id] || {};
    const nextComment1 = draft.comment1 ?? order.comment1 ?? '';
    const nextComment2 = draft.comment2 ?? order.comment2 ?? '';

    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/${order.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comment1: nextComment1,
          comment2: nextComment2,
        }),
      });

      setStatusErrorsOplata((prev) =>
        prev.map((item) =>
          item.id === order.id
            ? { ...item, comment1: nextComment1, comment2: nextComment2 }
            : item
        )
      );

      toast('Комментарии сохранены');
    } catch (error) {
      console.error('Ошибка при сохранении комментариев (доплаты):', error);
      toast('Ошибка при сохранении');
    }
  };
   


  // вычисляем флаг ошибки
  const hasDiskError = sysError !== null || (freePercent != null && freePercent < 15);


  // Функция проверки доступа
  const hasAccess = (resource) => {
    const normalizePath = (value) => {
      const raw = String(value || "").trim().replace(/\\/g, "/");
      if (!raw) return "/";
      const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
      const noTrailing = withLeading.replace(/\/+$/, "");
      return (noTrailing || "/").toLowerCase();
    };

    const parseIdSet = (raw, fallback = "") =>
      new Set(
        String(raw || fallback)
          .split(",")
          .map((x) => Number(String(x || "").trim()))
          .filter((n) => Number.isFinite(n) && n > 0)
      );

    const superAdminRoleIds = parseIdSet(process.env.NEXT_PUBLIC_SUPER_ADMIN_ROLE_IDS, "1");
    const superAdminUserIds = parseIdSet(process.env.NEXT_PUBLIC_SUPER_ADMIN_USER_IDS, "2");
    const isSuperAdmin =
      superAdminRoleIds.has(Number(user?.roleId || 0)) ||
      superAdminUserIds.has(Number(user?.id || 0));

    if (isSuperAdmin) return true;

    if (Array.isArray(routePermissions)) {
      const normalizedResource = normalizePath(resource);
      const normalizedPermissions = routePermissions.map((perm) => normalizePath(perm));
      return normalizedPermissions.some((perm) => {
        if (perm.includes("[") && perm.includes("]")) {
          const regex = new RegExp(`^${perm.replace(/\[.*?\]/g, ".*")}$`);
          return regex.test(normalizedResource);
        }
        return (
          perm === normalizedResource ||
          (normalizedResource !== "/" && perm.startsWith(`${normalizedResource}/`))
        );
      });
    }

    const requiredPermission = permissionMap.get(resource);
    return requiredPermission ? allowedPermissionIds.has(requiredPermission) : false;
  };


  // Блокировка для маски
  const applyMask = Array.from(accessibleParams).some(p => p.param === "applyMask");


  // Выносим функцию для вычисления isFasadReady
  const getIsFasadReady = (configs) => {
    return configs?.every(config => {
      const param8 = config?.data?.fasad_param8;
      return param8 && 
        (param8 === '' ? false : 
        typeof param8 === 'object' ? param8.checked === true : 
        true);
    }) ?? false;
  };


  //   if (loading) {
  //   return <Spinner />;
  // }

  // пока инициализация не завершена — можно возвращать Spinner (чтобы не дергался UI),
  // либо null если хотите полностью ничего не показывать
  if (!initialized || loading) return <Spinner />; // или: return <Spinner />;

  // если инициализация есть, но user нет — скрываем хидер
  if (!user) return null;


  return (
    <header className="header">
      <div className="header-container">
                {/* Кнопка-гамбургер */}
          <button
            className="hamburger"
            onClick={() => {setMenuOpen(o=>!o) }}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        <nav className="nav">
          <ul className={`menu ${menuOpen ? "open" : ""}`}>
                {hasAccess("/") && <li className="menu-item"><Link href="/"  onClick={() => setMenuOpen(false)}>Главная</Link></li>}
                {hasAccess("/config") && <li className={`menu-item rounded ${
                  hasDiskError ? 'bg-red-500 text-white' : ''
                }`}><Link
                  href="/config"
                  onClick={() => setMenuOpen(false)}

                >
                  <span className="inline-flex items-center gap-2">
                    Конфигурации
                    {unreadTicketCount > 0 && (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold leading-none text-white">
                        {unreadTicketCount > 99 ? '99+' : unreadTicketCount}
                      </span>
                    )}
                  </span>
                </Link></li>}
                {hasAccess("/config") && <li className="menu-item"><Link href="/config/3dscenes" onClick={() => setMenuOpen(false)}>Проекты</Link></li>}
                {hasAccess("/orders") && <li className="menu-item"><Link href="/orders" onClick={() => setMenuOpen(false)}>Заказы</Link></li>}
                {hasAccess("/main") && <li className="menu-item"><Link href="/main" onClick={() => setMenuOpen(false)}>График</Link></li>}
                {hasAccess("/clients") && <li className="menu-item"><Link href="/clients" onClick={() => setMenuOpen(false)}>Клиенты</Link></li>}
                {hasAccess("/readys") && <li className="menu-item"><Link href="/readys" onClick={() => setMenuOpen(false)}>Готовность</Link></li>}
                {hasAccess("/details") && <li className="menu-item"><Link href="/details" onClick={() => setMenuOpen(false)}>Заказные позиции</Link></li>}
                {hasAccess("/crm") && <li className="menu-item"><Link href="/crm" onClick={() => setMenuOpen(false)}>CRM</Link></li>}
                {hasAccess("/dashbord") && <li className="menu-item"><Link href="/dashbord" onClick={() => setMenuOpen(false)}>Дашборд</Link></li>}
                {hasAccess("/webchats") && <li className="menu-item"><Link href="/webchats" onClick={() => setMenuOpen(false)}>Чаты</Link></li>}
                {hasAccess("/filespace") && <li className="menu-item"><Link href="/filespace" onClick={() => setMenuOpen(false)}>Файлы</Link></li>}
              </ul>
        </nav>


            {/* Кнопка с ошибками доплат и модальным окном */}
            {hasAccess("/orders") && (
              <>
                <div>
                    <button
                      onClick={() => setModalOpenOplata(true)}
                      className="ml-auto w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center"
                      style={{marginTop: '0rem'}}
                    >
                      {loadingCounts ? <Spinner size={16}/> : errorCountOplata}
                    </button>
                </div>

                {modalOpenOplata && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
              >
                <div className="bg-white rounded-xl p-6 max-w-4xl w-full shadow-lg max-h-[60vh] overflow-y-auto" 
                ref={modalRef2}>

                  <button
                    onClick={() => setModalOpenOplata(false)}
                    className="absolute top-3 right-3 text-red-500 hover:text-red-700 text-2xl font-bold"
                  >❌</button>

                  <h2 className="text-xl font-bold mb-4">Ошибки доплат и рассрочки({errorCountOplata})</h2>

                  <table className="w-full table-auto border border-gray-300 mb-4">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border px-2 py-1 text-left">Технолог</th>
                        <th className="border px-2 py-1 text-left">Адрес</th>
                        <th className="border px-2 py-1 text-left">Изделие</th>
                        <th className="border px-2 py-1 text-left">Дней по доплате</th>
                        <th className="border px-2 py-1 text-left">Дней по рассрочке</th>
                        <th className="border px-2 py-1 text-left">Комментарий 1</th>
                        <th className="border px-2 py-1 text-left">Комментарий 2</th>
                        <th className="border px-2 py-1 text-left">В заказ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statusErrorsOplata
                        .slice() // делаем копию, чтобы не мутировать оригинал
                        .sort((a, b) => {
                          const addrA = (a.data.param5 ?? '').toLowerCase();
                          const addrB = (b.data.param5 ?? '').toLowerCase();
                          return addrA.localeCompare(addrB);
                        })
                      .map(order => {

                        const dateInstall = order.data?.statusData?.orderInstalled?.split("T")[0] || ''; // дата статуса установки
                        const dateNow = format(new Date(), 'yyyy-MM-dd');
                        const skipDays = new Date(dateNow) - new Date(dateInstall); // разница в днях 
                        const fullDays = Math.floor(skipDays / (1000 * 60 * 60 * 24));
                        const currentTechnic = technics.find((tech) => tech.id === Number(order.data.param7));
                        // let Rassrochka = order.data.installmentPlan
                        let Rassrochka = order.data.mainTest;
                        let lastEntry;
                        let prosrochka;  
                        if (Rassrochka && Rassrochka.length > 0) {
                          lastEntry = Rassrochka[Rassrochka.length - 1];

                          if (lastEntry.date) {
                            const prosrochkaDiff = new Date(dateNow) - new Date(lastEntry.date); // разница в днях
                            prosrochka = Math.floor(prosrochkaDiff / (1000 * 60 * 60 * 24)) - 30;
                          }
                        }

                      return (
                        
                        <tr key={order.id}>
                          <td className="border px-2 py-1">{currentTechnic?.name}</td>
                          <td className="border px-2 py-1">{order.data.param5}</td>
                          <td className="border px-2 py-1">{order.data.param9}</td>
                          <td className="border px-2 py-1">{fullDays || ""}</td>
                          <td className="border px-2 py-1">{prosrochka || ""}</td>
                          <td className="border px-2 py-1">
                            <textarea
                              className="w-full p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                              value={editedOplataComments[order.id]?.comment1 ?? order.comment1 ?? ''}
                              onChange={(e) => handleOplataCommentChange(order.id, 'comment1', e.target.value)}
                            />
                          </td>
                          <td className="border px-2 py-1">
                            <textarea
                              className="w-full p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                              value={editedOplataComments[order.id]?.comment2 ?? order.comment2 ?? ''}
                              onChange={(e) => handleOplataCommentChange(order.id, 'comment2', e.target.value)}
                            />
                          </td>
                          <td className="border px-2 py-1">
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={() => handleSaveOplataComments(order)}
                                className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
                              >
                                Сохранить
                              </button>
                              <button
                                onClick={() => handleOrderClick(order.id)}
                                className="os-primary-bg text-white px-3 py-1 rounded"
                              >
                                Перейти
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    )}
                    </tbody>

                  </table>
                </div>
              </div>
                )}
              </>
            )}    

            {/* Кнопка с ошибками спецификаций и модальным окном */}
            {hasAccess("/orders") && (
              <>
                <div>
                    <button
                      onClick={() => setModalOpen(true)}
                      className="ml-auto w-8 h-8 bg-yellow-500 text-white rounded-full flex items-center justify-center"
                      style={{marginTop: '0rem'}}
                    >
                      {loadingCounts ? <Spinner size={16}/> : errorCount}
                    </button>
                </div>

                {modalOpen && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
              >
                <div className="bg-white rounded-xl p-6 max-w-7xl w-full shadow-lg max-h-[60vh] overflow-y-auto"
                  ref={modalRef}
                >

                <button
                  onClick={() => {
                    setModalOpen(false);          // закрываем модалку
                  }}
                  className="absolute top-3 right-3 text-red-500 hover:text-red-700 text-2xl font-bold"
                >❌</button>

                  <h2 className="text-xl font-bold mb-4">
                    Ошибки спецификаций ({errorCount})
                  </h2>


                  {/* --- Новая секция: ввод порогового числа дней --- */}
                  <div className="mb-4 flex items-center">
                    <label className="mr-2 font-medium">Порог дней:</label>
                    <input
                      type="number"
                      min={0}
                      value={thresholdDays}
                      onChange={handleThresholdChange}
                      className="border px-2 py-1 rounded w-20"
                    />
                    <span className="ml-2 text-gray-600">
                      (текущий порог: {thresholdDays} дн.)
                    </span>
                  </div>

                  <table className="w-full table-auto border border-gray-300 mb-4">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border px-2 py-1 text-left">Технолог</th>
                        <th className="border px-2 py-1 text-left">Адрес</th>
                        <th className="border px-2 py-1 text-left">Изделие</th>
                        <th className="border px-2 py-1 text-left">Просрочено дней</th>
                        <th className="border px-2 py-1 text-left">В заказ</th>
                        <th className="border px-2 py-1 text-left">В график</th>
                        {/* <th className="border px-2 py-1 text-left">В готовность</th> */}
                        <th className="border px-2 py-1 text-left">Комментарий 1</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statusErrors
                        .slice() // делаем копию, чтобы не мутировать оригинал
                        .sort((a, b) => {
                          // 1. Сначала сортировка по isFasadReady
                          const fasadReadyA = getIsFasadReady(a.configs);
                          const fasadReadyB = getIsFasadReady(b.configs);
                          
                          if (fasadReadyA !== fasadReadyB) {
                            return fasadReadyA ? 1 : -1; // false первыми
                          }
                          
                          // 2. Если одинаковые isFasadReady, сортируем по близости installDate
                          const installDateA = a.data?.param15 ? new Date(a.data.param15) : new Date('9999-12-31');
                          const installDateB = b.data?.param15 ? new Date(b.data.param15) : new Date('9999-12-31');
                          const now = new Date();
                          
                          // Ближайшие к текущей дате первыми
                          const diffA = Math.abs(installDateA - now);
                          const diffB = Math.abs(installDateB - now);
                          
                          if (diffA !== diffB) {
                            return diffA - diffB;
                          }
                          
                          // 3. Если installDate одинаково близки, сортируем по адресу
                          const addrA = (a.data.param5 ?? '').toLowerCase();
                          const addrB = (b.data.param5 ?? '').toLowerCase();
                          return addrA.localeCompare(addrB);
                        })
                        .map(order => {

                          const dateGet = order.data.param13; // дата приема
                          const dateNow = format(new Date(), 'yyyy-MM-dd');
                          const allTime = new Date(dateNow) - new Date(dateGet); // разница в днях 
                          const fullDays = Math.floor(allTime / (1000 * 60 * 60 * 24));
                          const skipDays = fullDays - thresholdDays; // Сколько дней прошло с даты приема минус X дней
                          // const readyId = order.order_config?.find(item => item.addon_id === 7 || item.addon?.name === 'Готовность')?.id;
                          const currentTechnic = technics.find((tech) => tech.id === Number(order.data.param7));
                          const adress = order?.data.param5 ?? '';
                          const article = order?.data.param9 ?? '';
                          const search = String(adress + ';' + article);
                          const installDate = order?.data?.param15 ?? '';
                          const dateParam = encodeURIComponent(installDate);
                    
                          return (                      

                          <tr key={order.id}>
                            <td className="border px-2 py-1">{currentTechnic?.name}</td>
                            <td className="border px-2 py-1">{order.data.param5}</td>
                            <td className="border px-2 py-1">{order.data.param9}</td>
                            <td className="border px-2 py-1">{skipDays}</td>
                            <td className="border px-2 py-1">
                              <button
                                onClick={() => handleOrderClick(order.id)}
                                className="os-primary-bg text-white px-3 py-1 rounded"
                              >
                                Перейти
                              </button>
                            </td>
                            <td className="border px-2 py-1"> 
                              <button
                                onClick={() => {
                                        router.push(`/main?search=${encodeURIComponent(search)}&date=${dateParam}`);
                                        setModalOpen(false)
                                }} 
                                className="os-primary-bg text-white px-3 py-1 rounded"
                              >
                                Перейти
                              </button>
                            </td>

                            <td className="border px-2 py-1">
                              <div className="flex items-center gap-2">       
                              <textarea
                                className="flex-1 p-[6px] border border-gray-300 rounded-md focus:ring focus:ring-blue-300"
                                type="text"
                                value={editedComments[order.id] ?? order.comment1 ?? ''}
                                onChange={(e) => {
                                  setEditedComments(prev => ({
                                    ...prev,
                                    [order.id]: e.target.value
                                  }));
                                }}
                                onBlur={() => handleSaveComment(order.id, editedComments[order.id])}
                              />
                              </div>
                            </td>                        

                          </tr>
                        )}
                    )}
                    </tbody>
                  </table>

                  {/* <div className="flex justify-between">
                    <button
                      onClick={() => setModalOpen(false)}
                      className="bg-gray-300 text-black px-4 py-2 rounded hover:bg-gray-400"
                    >
                      Закрыть
                    </button>
                  </div> */}
                </div>
              </div>
                )}
              </>
            )}





          {applyMask && (
            <div>
              <button
                onClick={toggleMask}
                className="os-primary-bg ml-auto w-8 h-8 text-white rounded-full flex items-center justify-center"
                title={isMasked ? 'Отключить маску' : 'Включить маску'}
                style={{marginTop: '0rem'}}
              >
                {isMasked ? '🙈' : '👁️'}
              </button>
            </div>
          )}

        <div className="auth-info">
          {user ? (
            <div className="auth-details">
              {/* Инфо о пользователе */}
              {/* <span className="login-label">Логин:</span> */}
              <span className="login-name" title={user.name}>👤 {user.name}</span>
              <button
                onClick={logout}
                className="text-sm logout-btn"
                style={{ marginTop: '0rem' }}
                aria-label="Выйти"
                title="Выйти"
              >
                <span className="logout-icon" aria-hidden="true">🔓</span>
                {/* <span className="logout-text">Выйти</span> */}
              </button>
            </div>
          ) : (
            <Link href="/login">Войти</Link>
          )}
        </div>


   
      </div>
    </header>
  );
};

export default Header;



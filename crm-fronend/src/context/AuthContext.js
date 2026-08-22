"use client";

import { createContext, useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

export const AuthContext = createContext({
  user: null,
  login: () => {},
  logout: () => {},
  initialized: false,
});

const AUTH_RETRY_DELAYS_MS = [800, 2000, 5000];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isUnauthorizedStatus = (status) => status === 401 || status === 403;

const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => {
    return typeof window !== "undefined" ? localStorage.getItem("token") : null;
  });
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [initialized, setInitialized] = useState(false);

  // Реф для хранения текущего AbortController
  const controllerRef = useRef(null);

  const clearState = useCallback(() => {
    setToken(null);
    setUser(null);
    setPermissions([]);
    setLoading(false);
    setInitialized(true);
  }, []);

  const logout = useCallback(() => {
    // Отменяем все текущие запросы
    try { controllerRef.current?.abort(); } catch (e) {console.warn(e)}
    // Очищаем локальное хранилище и state
    localStorage.removeItem("token");
    clearState();
    // Навигация после очистки состояния
    router.replace("/login");
  }, [router, clearState]);

  const fetchPermissions = useCallback(async (token) => {
    // Отменяем предыдущий контроллер и создаём новый
    try { controllerRef.current?.abort(); } catch (e) {console.warn(e)}
    const controller = new AbortController();
    controllerRef.current = controller;
    const signal = controller.signal;

    try {
      setLoading(true);

      for (let attempt = 0; attempt <= AUTH_RETRY_DELAYS_MS.length; attempt += 1) {
        try {
          const ts = Date.now();
          const authHeaders = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          };

          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me?_=${ts}`, {
            headers: authHeaders,
            cache: "no-store",
            signal,
          });

          if (!res.ok) {
            if (isUnauthorizedStatus(res.status)) {
              logout();
              return;
            }
            throw new Error(`auth/me failed with status ${res.status}`);
          }

          const data = await res.json();
          const { roleId } = data.user;
          setUser(data.user);

          // Защитная проверка roleId
          const roleNum = Number(roleId);
          if (!Number.isInteger(roleNum)) {
            // Некорректный roleId — выходим
            logout();
            return;
          }

          const permissionsRes = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/role_permissions/${roleNum}?_=${ts}`,
            {
              headers: authHeaders,
              cache: "no-store",
              signal,
            }
          );

          if (!permissionsRes.ok) {
            if (isUnauthorizedStatus(permissionsRes.status)) {
              logout();
              return;
            }
            throw new Error(`role_permissions failed with status ${permissionsRes.status}`);
          }

          const permissionsData = await permissionsRes.json();
          const allowedPermissions = permissionsData.filter((p) => p.allowed);
          const permissionIds = allowedPermissions.map((p) => p.permissionId);

          const linksRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/permissions?_=${ts}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            cache: "no-store",
            signal,
          });

          if (!linksRes.ok) {
            if (isUnauthorizedStatus(linksRes.status)) {
              logout();
              return;
            }
            throw new Error(`permissions failed with status ${linksRes.status}`);
          }

          const linksData = await linksRes.json();
          const allowedLinks = linksData
            .filter((link) => permissionIds.includes(link?.id))
            .map((link) => link.resource.replace(/\\/g, "/"));

          setPermissions(allowedLinks);
          return;
        } catch (error) {
          if (error.name === "AbortError") {
            return;
          }

          const isLastAttempt = attempt === AUTH_RETRY_DELAYS_MS.length;
          if (isLastAttempt) {
            console.warn("Не удалось обновить авторизацию, сессия сохранена для повторной попытки:", error);
            return;
          }

          await wait(AUTH_RETRY_DELAYS_MS[attempt]);
        }
      }
    } catch (error) {
      // Если это была отмена — просто игнорируем
      if (error.name === "AbortError") {
        return;
      }
      console.warn("Временная ошибка загрузки разрешений, сессия сохранена:", error);
    } finally {
      setLoading(false);
      setInitialized(true);
      // Сбрасываем контроллер, т.к. задача завершена
      controllerRef.current = null;
    }
  }, [logout]);

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (storedToken) {
      setToken(storedToken);
      fetchPermissions(storedToken);
    } else {
      setLoading(false);
      setInitialized(true);
    }

    // Очистка при размонтировании: отменяем запрос
    return () => {
      try { controllerRef.current?.abort(); } catch (e) {console.warn(e)}
    };
  }, [fetchPermissions]);

  useEffect(() => {
    if (!token) return undefined;

    const refreshIfNeeded = () => {
      const currentToken = localStorage.getItem("token");
      if (!currentToken) return;
      if (document.visibilityState === "hidden") return;
      if (!user || permissions === null) {
        fetchPermissions(currentToken);
      }
    };

    window.addEventListener("online", refreshIfNeeded);
    window.addEventListener("focus", refreshIfNeeded);
    document.addEventListener("visibilitychange", refreshIfNeeded);

    return () => {
      window.removeEventListener("online", refreshIfNeeded);
      window.removeEventListener("focus", refreshIfNeeded);
      document.removeEventListener("visibilitychange", refreshIfNeeded);
    };
  }, [fetchPermissions, permissions, token, user]);

  const login = async (newToken) => {
    localStorage.setItem("token", newToken);
    setToken(newToken);
    await fetchPermissions(newToken);
    router.replace("/");
  };

  return (
    <AuthContext.Provider value={{ token, user, permissions, loading, login, logout, initialized }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;






















// "use client";

// import { createContext, useState, useEffect, useCallback } from "react";
// import { useRouter } from "next/navigation";

// export const AuthContext = createContext({
//   user: null,
//   login: () => {},
//   logout: () => {},
//   initialized: false,
// });


// const AuthProvider = ({ children }) => {
//   const [token, setToken] = useState(() => {
//     return typeof window !== "undefined" ? localStorage.getItem("token") : null;
//   });
//   const [user, setUser] = useState(null);
//   const [permissions, setPermissions] = useState(null);
//   const [loading, setLoading] = useState(true);
//   const router = useRouter();
//   const [initialized, setInitialized] = useState(false);

//   const logout = useCallback(() => {
//     localStorage.removeItem("token");
//     setToken(null);
//     setUser(null);
//     setPermissions([]); // Сбрасываем permissions
//     setLoading(false); // Завершаем загрузку
//     setInitialized(true);
//     router.replace("/login");
//   }, [router]);

//   const fetchPermissions = useCallback(async (token) => {
//     try {
//       setLoading(true);
//       const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
//         headers: {
//           Authorization: `Bearer ${token}`,
//           "Content-Type": "application/json",
//         },
//       });

//       if (res.ok) {
//         const data = await res.json();
//         const { roleId } = data.user;
//         setUser(data.user);

//         const permissionsRes = await fetch(
//           `${process.env.NEXT_PUBLIC_API_URL}/role_permissions/${roleId}`,
//           {
//             headers: {
//               Authorization: `Bearer ${token}`,
//               "Content-Type": "application/json",
//             },
//           }
//         );

//         if (permissionsRes.ok) {
//           const permissionsData = await permissionsRes.json();
//           const allowedPermissions = permissionsData.filter((p) => p.allowed);
//           const permissionIds = allowedPermissions.map((p) => p.permissionId);

//           const linksRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/permissions`, {
//             headers: {
//               Authorization: `Bearer ${token}`,
//               "Content-Type": "application/json",
//             },
//           });

//           if (linksRes.ok) {
//             const linksData = await linksRes.json();
//             // console.log('linksData = ', linksData)
//             const allowedLinks = linksData
//               .filter((link) => permissionIds.includes(link?.id))
//               .map((link) => link.resource.replace(/\\/g, "/"));

//             // console.log('allowedLinks = ', allowedLinks)  
//             setPermissions(allowedLinks);
//           } else {
//             // console.log("Ошибка при получении ссылок");
//             logout();
//           }
//         } else {
//           // console.log("Ошибка при загрузке разрешений");
//           logout();
//         }
//       } else {
//         // console.log("Ошибка при авторизации");
//         logout();
//       }
//     } catch (error) {
//       console.error("Ошибка загрузки разрешений:", error);
//       logout();
//     } finally {
//       setLoading(false);
//       setInitialized(true);
//     }
//   }, [logout]);

//   useEffect(() => {
//     const storedToken = localStorage.getItem("token");
//     if (storedToken) {
//       setToken(storedToken);
//       fetchPermissions(storedToken);
//     } else {
//       setLoading(false);
//       setInitialized(true);
//     }
//   }, [fetchPermissions]);

//   const login = async (newToken) => {
//     localStorage.setItem("token", newToken);
//     setToken(newToken);
//     await fetchPermissions(newToken);
//     router.replace("/");
//   };

//   return (
//     <AuthContext.Provider value={{ token, user, permissions, loading, login, logout, initialized }}>
//       {children}
//     </AuthContext.Provider>
//   );
// };

// export default AuthProvider;





















// "use client";

// import { createContext, useState, useEffect } from "react";
// import { useRouter } from "next/navigation";

// export const AuthContext = createContext();

// const AuthProvider = ({ children }) => {
//   const [token, setToken] = useState(() => {
//     // Сразу получаем токен из localStorage
//     return typeof window !== "undefined" ? localStorage.getItem("token") : null;
//   });
//   const [user, setUser] = useState(null);
//   const [permissions, setPermissions] = useState(null); // Изначально null
//   const [loading, setLoading] = useState(true); // Флаг загрузки
//   const router = useRouter();

//   useEffect(() => {
//     const storedToken = localStorage.getItem("token");
//     // console.log("storedToken = ", storedToken)
//     if (storedToken) {
//       setToken(storedToken);
//       fetchPermissions(storedToken);
//     } else {
//       setLoading(false); // Если токена нет, завершить загрузку
//     }
//   }, [fetchPermissions]);

//   const fetchPermissions = async (token) => {
//     try {
//       setLoading(true);
//       const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
//         headers: {
//           Authorization: `Bearer ${token}`,
//           "Content-Type": "application/json",
//         },
//       });

//       if (res.ok) {
//         const data = await res.json();
//         const { roleId } = data.user;
//         setUser(data.user);

//         // Запрашиваем разрешения для роли
//         const permissionsRes = await fetch(
//           `${process.env.NEXT_PUBLIC_API_URL}/role_permissions/${roleId}`,
//           {
//             headers: {
//               Authorization: `Bearer ${token}`,
//               "Content-Type": "application/json",
//             },
//           }
//         );

//         if (permissionsRes.ok) {
//           const permissionsData = await permissionsRes.json();
//           const allowedPermissions = permissionsData.filter((p) => p.allowed);
//           const permissionIds = allowedPermissions.map((p) => p.permissionId);

//           // Запрашиваем список страниц (ссылок), связанных с разрешениями
//           const linksRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/permissions`, {
//             headers: {
//               Authorization: `Bearer ${token}`,
//               "Content-Type": "application/json",
//             },
//           });

//           if (linksRes.ok) {
//             const linksData = await linksRes.json();
//             const allowedLinks = linksData
//               .filter((link) => permissionIds.includes(link.id))
//               .map((link) => link.resource.replace(/\\/g, "/"));

//             // console.log("allowedLinksFormat = ", allowedLinks);
//             setPermissions(allowedLinks);
//           } else {
//             console.log("Ошибка при получении ссылок");
//             logout();
//           }
//         } else {
//           console.log("Ошибка при загрузке разрешений");
//           logout();
//         }
//       } else {
//         console.log("Ошибка при авторизации");
//         logout();
//       }
//     } catch (error) {
//       console.error("Ошибка загрузки разрешений:", error);
//       logout();
//     } finally {
//       setLoading(false); // Завершаем загрузку
//     }
//   };

//   const login = async (newToken) => {
//     localStorage.setItem("token", newToken);
//     setToken(newToken);
//     await fetchPermissions(newToken);
//     router.replace("/");
//   };

//   const logout = () => {
//     localStorage.removeItem("token");
//     setToken(null);
//     setUser(null);
//     setPermissions([]); // Сбрасываем permissions
//     setLoading(false); // Завершаем загрузку
//     router.replace("/login");
//   };

//   return (
//     <AuthContext.Provider value={{ token, user, permissions, loading, login, logout }}>
//       {children}
//     </AuthContext.Provider>
//   );
// };

// export default AuthProvider;



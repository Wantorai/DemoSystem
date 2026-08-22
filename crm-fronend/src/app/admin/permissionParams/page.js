"use client";

import React, { useEffect, useState, useRef, useContext } from "react";
import { AuthContext } from "../../../context/AuthContext";
import { toast } from 'react-toastify';

export default function RolesPage() {
  const [roles, setRoles] = useState([]);
  const [dataParams, setDataParams] = useState([]);
  const [rolePermissionParams, setRolePermissionParams] = useState({});
  const isFetched = useRef(false);
  const [newParam, setNewParam] = useState({ param: "", label: "" });
  const { user } = useContext(AuthContext);

  let currentRoleId;
  if (user) {
    currentRoleId = user.roleId; // Получаем роль юзера
  }

  const getAuthHeaders = (extra = {}) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    };
  };

  // // Логируем изменения rolePermissionParams
  // useEffect(() => {
  //   console.log("Обновлённый rolePermissionParams:", rolePermissionParams);
  // }, [rolePermissionParams]);

  // Загрузка параметров (dataParams)
  useEffect(() => {
    if (isFetched.current) return;
    isFetched.current = true;

    const fetchParams = async () => {
      try {
        const [mainModelData, configData] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/mainModel`).then((res) => res.json()),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/config`).then((res) => res.json()),
        ]);

        const combinedData = mainModelData.concat(configData);

        // console.log("combinedData = ", combinedData)

        // Формируем параметры для отправки
        const transformedData = combinedData.map(({ paramName, label }) => ({
          paramName,
          label,
        }));

        // Загружаем уже существующие записи из permissionParams
        const existingRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/permissionParams`, {
          headers: getAuthHeaders(),
        });
        let existingData = await existingRes.json();

        // Находим новые параметры, которых ещё нет в базе (сравниваем по paramName)
        const newParams = transformedData.filter(
          (newParam) =>
            !existingData.some(
              (existingParam) => existingParam.paramName === newParam.paramName
            )
        );

        if (newParams.length > 0) {
          await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/permissionParams`, {
            method: "POST",
            headers: getAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ params: newParams }),
          });

          // Повторный запрос, чтобы получить новые id
          const updatedRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/permissionParams`, {
            headers: getAuthHeaders(),
          });
          existingData = await updatedRes.json();
        }

        // console.log("existingData = ", existingData)

        setDataParams(existingData);
      } catch (error) {
        console.error("Ошибка при загрузке моделей:", error);
      }
    };

    fetchParams();
  }, []);

  // Загрузка ролей
  useEffect(() => {
    async function fetchRoles() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/roles`, {
          headers: getAuthHeaders(),
        });
        const data = await res.json();
        setRoles(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Ошибка загрузки ролей:", error);
        setRoles([]);
      }
    }
    fetchRoles();
  }, []);



  // Загрузка прав доступа для каждой роли
  useEffect(() => {
    async function fetchPermissionParams() {
      const permissionParamsMap = {};
      for (const role of roles) {
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/roles/${role.id}/permissionParams`, {
            headers: getAuthHeaders(),
          });

          const data = await res.json();
          if (!Array.isArray(data)) {
            permissionParamsMap[role.id] = {};
            continue;
          }
          // console.log("Ответ от сервера:", data);

          // Формируем объект, где для каждого permissionParamId хранится объект { allowed, canEdit, canCheck }
          permissionParamsMap[role.id] = data.reduce((acc, { permissionParamId, allowed, canEdit, canCheck }) => {
            acc[permissionParamId] = {
              allowed: allowed  ?? false,
              canEdit: canEdit  ?? false,
              canCheck: canCheck ?? false,  // дефолт на false, если значение undefined
            };
            return acc;
          }, {});

        } catch (error) {
          console.error(`Ошибка загрузки прав для роли ${role.id}:`, error);
        }
      }
      // console.log("Загруженные права для всех ролей:", permissionParamsMap);
      // console.log("Финальный permissionParamsMap перед set:", JSON.stringify(permissionParamsMap, null, 2));

      setRolePermissionParams(permissionParamsMap);
    }

    if (roles.length > 0) {
      fetchPermissionParams();
    }
  }, [roles]);


  // Обработчик изменения чекбокса с логированием
  // const handleCheckboxChange = (roleId, permissionParamId, field, event) => {
  //   const newValue = event.target.checked;
  //   setRolePermissionParams(prev => {
  //     const updated = { ...prev };
  //     if (!updated[roleId]) {
  //       updated[roleId] = {};
  //     }
  //     if (!updated[roleId][permissionParamId]) {
  //       // Если записи нет, создаем объект.
  //       // Если обновляется "allowed", устанавливаем canEdit по умолчанию (например, false).
  //       // Если обновляется "canEdit", можно по умолчанию предположить, что allowed уже true или установить allowed: true.
  //       updated[roleId][permissionParamId] =
  //         field === "allowed"
  //           ? { allowed: newValue, canEdit: false, }
  //           : { allowed: true, canEdit: newValue, };
  //     } else {
  //       updated[roleId][permissionParamId] = {
  //         ...updated[roleId][permissionParamId],
  //         [field]: newValue,
  //       };
  //     }
  //     return updated;
  //   });
  // };


  const handleCheckboxChange = (roleId, permissionParamId, field, event) => {
    const newValue = event.target.checked;

    setRolePermissionParams(prev => {
      const updated = { ...prev };

      if (!updated[roleId]) {
        updated[roleId] = {};
      }

      const existing = updated[roleId][permissionParamId] || {};

      // гарантируем наличие всех ключей, даже если объект частичный
      const current = {
        allowed: existing.allowed ?? false,
        canEdit: existing.canEdit ?? false,
        canCheck: existing.canCheck ?? false,
      };

      if (field === "allowed") {
        updated[roleId][permissionParamId] = {
          ...current,
          allowed: newValue,
          canEdit: newValue ? current.canEdit : false,
          canCheck: newValue ? current.canCheck : false,
        };
      } else if (field === "canEdit") {
        updated[roleId][permissionParamId] = {
          ...current,
          allowed: true,
          canEdit: newValue,
        };
      } else if (field === "canCheck") {
        updated[roleId][permissionParamId] = {
          ...current,
          allowed: true,
          canCheck: newValue,
        };
      }
      // console.log("updated = ", updated)
      return updated;
    });
  };


  

  // Обработчик сохранения прав
  const handleSavePermissionParams = async () => {
    for (const role of roles) {
      const permissions = rolePermissionParams[role.id] || {};
      const payload = dataParams.map((param) => {
        const permission = permissions[param.id] || { allowed: false, canEdit: false, canCheck: false };
        // console.log("permission = ", permission)
        return {
          roleId: role.id,
          permissionParamId: param.id,
          allowed: permission.allowed,
          canEdit: permission.canEdit,
          canCheck: permission.canCheck  ?? false,
        };
      });

      // console.log("payload to send", payload);

      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/roles/${role.id}/permissionParams`, {
          method: "POST",
          headers: getAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ permissionParams: payload }),
        });
        // const result = await res.json();
        // console.log("Ответ от сервера:", JSON.stringify(result, null, 2));

      } catch (error) {
        console.error(`Ошибка сохранения прав для роли ${role.id}:`, error);
      }
    }
    // console.log("Права обновлены!");
  };

  // Обработчики изменения label и добавления нового параметра
  const handleLabelChange = (paramId, value) => {
    setDataParams((prev) =>
      prev.map((param) => (param.id === paramId ? { ...param, label: value } : param))
    );
  };

  const handleLabelBlur = async (paramId) => {
    const param = dataParams.find((p) => p.id === paramId);
    if (!param) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/permissionParams/${paramId}`, {
        method: "PUT",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ label: param.label }),
      });
    } catch (error) {
      console.error(`Ошибка обновления label для параметра ${paramId}:`, error);
    }
  };

  const handleAddParam = async () => {
    if (!newParam.param.trim() || !newParam.label.trim()) return;

    // Проверка на уникальность param и label в уже загруженных параметрах
    const isParamExists = dataParams.some((item) => item.param === newParam.param);
    const isLabelExists = dataParams.some((item) => item.label === newParam.label);

    if (isParamExists) {
      toast("Параметр с таким 'param' уже существует. Пожалуйста, выберите другой.");
      return;
    }

    if (isLabelExists) {
      toast("Параметр с таким 'label' уже существует. Пожалуйста, выберите другой.");
      return;
    }


    const tempId = Date.now();
    setDataParams((prev) => [
      ...prev,
      { id: tempId, param: newParam.param, label: newParam.label },
    ]);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/permissionParams`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ params: [{ paramName: newParam.param, label: newParam.label }] }),
      });
      if (!response.ok) throw new Error("Ошибка добавления параметра");

      const updatedRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/permissionParams`, {
        headers: getAuthHeaders(),
      });
      const updatedData = await updatedRes.json();
      const newAddedParam = updatedData.find(
        (item) => item.param === newParam.param && item.label === newParam.label
      );
      const newParamId = newAddedParam?.id || tempId;
      // Обновляем роль текущего пользователя, используя объект, а не Set:
      setRolePermissionParams((prev) => ({
        ...prev,
        [currentRoleId]: {
          ...(prev[currentRoleId] || {}),
          [newParamId]: true,
        },
      }));
    } catch (error) {
      console.error("Ошибка при добавлении параметра:", error);
    } finally {
      setNewParam({ param: "", label: "" });
    }
  };

  const handleDeleteParam = async (paramId) => {

    // console.log("paramId = ", paramId)
    try {
      // Удаляем из локального состояния
      const updatedParams = dataParams.filter((p) => p.id !== paramId);
      setDataParams(updatedParams);
  
      const updatedRolePermissionParams = { ...rolePermissionParams };
      Object.keys(updatedRolePermissionParams).forEach((roleId) => {
        delete updatedRolePermissionParams[roleId][paramId];
      });
      setRolePermissionParams(updatedRolePermissionParams);

      const isConfirmed = window.confirm("Вы уверены, что хотите удалить этот параметр?");
      if (!isConfirmed) return; // Отмена удаления
  
      // Отправляем запрос на сервер
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/permissionParams/${paramId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
  
      // console.log(`Параметр ${paramId} удалён`);
    } catch (error) {
      console.error("Ошибка при удалении параметра:", error);
    }
  };
  

// console.log("rolePermissionParams = ", rolePermissionParams)

return (
  <div style={{ overflow: "auto", maxHeight: "90vh" }}>
    <h1>Управление доступом к параметрам</h1>
    <div style={{ marginBottom: "20px" }}>
      <input
        type="text"
        placeholder="Имя параметра (param)"
        value={newParam.param}
        onChange={(e) => setNewParam({ ...newParam, param: e.target.value })}
      />
      <input
        type="text"
        placeholder="Обозначение (label)"
        value={newParam.label}
        onChange={(e) => setNewParam({ ...newParam, label: e.target.value })}
      />
      <button onClick={handleAddParam}>Добавить параметр</button>
    </div>

    <table  className="tasks" 
      border="1"
      style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}
     >
      <thead
          style={{
            position: "sticky",
            top: 0,
            backgroundColor: "white",
            zIndex: 100,
            cursor: "pointer",
          }}
      >
        <tr>
          <th className="sticky">Параметр</th>
          <th className="sticky-second">Обозначение</th>
          {roles.map((role) => {
            // Получаем права для конкретной роли (если нет – пустой объект)
            const perms = rolePermissionParams[role.id] || {};

            // Общий чекбокс для "Доступ" считается отмеченным, если у всех параметров allowed === true
            const allAllowed =
              Object.keys(perms).length > 0 &&
              Object.values(perms).every((item) => item.allowed === true);

            // Общий чекбокс для "Редактирование" считается отмеченным,
            // если для всех параметров, у которых allowed === true, canEdit === true.
            const allCanEdit =
              Object.keys(perms).length > 0 &&
              Object.values(perms)
                .filter((item) => item.allowed)
                .every((item) => item.canEdit === true);

            const allCanCheck =
              Object.keys(perms).length > 0 &&
              Object.values(perms)
                .filter((item) => item.allowed)
                .every((item) => item.canCheck === true);    

            return (
              <React.Fragment key={role.id}>
                <th>
                  <input
                    type="checkbox"
                    checked={allAllowed}
                    onChange={(e) => {
                      const newState = { ...rolePermissionParams };
                      // Обновляем для каждого разрешения для этой роли
                      Object.keys(newState[role.id] || {}).forEach((permId) => {
                        newState[role.id][permId] = {
                          ...newState[role.id][permId],
                          allowed: e.target.checked,
                          // Если снимаем доступ, то сбрасываем canEdit в false
                          canEdit: e.target.checked
                            ? newState[role.id][permId].canEdit
                            : false,
                          canCheck: e.target.checked
                            ? newState[role.id][permId].canCheck
                            : false,  
                        };
                      });
                      setRolePermissionParams(newState);
                    }}
                  />
                  {role.name} (Видим.)
                </th>
                <th>
                  <input
                    type="checkbox"
                    checked={allCanEdit}
                    onChange={(e) => {
                      const newState = { ...rolePermissionParams };
                      Object.keys(newState[role.id] || {}).forEach((permId) => {
                        // Обновляем canEdit только для параметров, где доступ разрешён
                        if (newState[role.id][permId].allowed) {
                          newState[role.id][permId] = {
                            ...newState[role.id][permId],
                            canEdit: e.target.checked,
                          };
                        }
                      });
                      setRolePermissionParams(newState);
                    }}
                    disabled={!allAllowed}
                  />
                  {role.name} (Редак.)
                </th>
                <th>
                  <input
                    type="checkbox"
                    checked={allCanCheck}
                    onChange={(e) => {
                      const newState = { ...rolePermissionParams };
                      Object.keys(newState[role.id] || {}).forEach((permId) => {
                        // Обновляем canCheck только для параметров, где доступ разрешён
                        if (newState[role.id][permId].allowed) {
                          newState[role.id][permId] = {
                            ...newState[role.id][permId],
                            canCheck: e.target.checked,
                          };
                        }
                      });
                      setRolePermissionParams(newState);
                    }}
                    disabled={!allAllowed}
                  />
                  {role.name} (Админ.)
                </th>
              </React.Fragment>
            );
          })}
          <th>Удалить</th>
        </tr>
      </thead>
      <tbody>
        {[...dataParams]
          .sort((a, b) => a.param.localeCompare(b.param))
          .map((param) => (
            <tr key={param.id}
            style={{ cursor: "pointer" }}
            >
              <td className="sticky">{param.param}</td>
              <td className="sticky-second">
                <input
                  className="permissions_value"
                  type="text"
                  value={param.label || ""}
                  onChange={(e) => handleLabelChange(param.id, e.target.value)}
                  onBlur={() => handleLabelBlur(param.id)}
                />
              </td>
              {roles.map((role) => {
                // Получаем объект разрешения для конкретного параметра и роли.
                // Если записи нет, используем значение по умолчанию.
                const permission =
                  rolePermissionParams[role.id]?.[param.id] || {
                    allowed: false,
                    canEdit: false,
                    canCheck: false,
                  };

                  // console.log("permission = ", permission)

                return (
                  <React.Fragment key={`${role.id}-${param.id}`}>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!permission.allowed}
                        onChange={(e) =>
                          handleCheckboxChange(role.id, param.id, "allowed", e)
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!permission.canEdit}
                        onChange={(e) =>
                          handleCheckboxChange(role.id, param.id, "canEdit", e)
                        }
                        disabled={!permission.allowed}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!permission.canCheck}
                        onChange={(e) =>
                          handleCheckboxChange(role.id, param.id, "canCheck", e)
                        }
                        disabled={!permission.allowed}
                      />
                    </td>
                  </React.Fragment>
                );
              })}
              <td>
                <button onClick={() => handleDeleteParam(param.id)}>❌</button>
              </td>
            </tr>
          ))}
      </tbody>
    </table>

    <button onClick={handleSavePermissionParams}>Сохранить</button>
  </div>
);


// return (
//   <div>
//     <h1>Управление доступом к параметрам</h1>
//     <div style={{ marginBottom: "20px" }}>
//       <input
//         type="text"
//         placeholder="Имя параметра (param)"
//         value={newParam.param}
//         onChange={(e) => setNewParam({ ...newParam, param: e.target.value })}
//       />
//       <input
//         type="text"
//         placeholder="Обозначение (label)"
//         value={newParam.label}
//         onChange={(e) => setNewParam({ ...newParam, label: e.target.value })}
//       />
//       <button onClick={handleAddParam}>Добавить параметр</button>
//     </div>

//     <table
//       border="1"
//       style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}
//     >
//       <thead>
//         <tr>
//           <th>Параметр</th>
//           <th>Обозначение</th>
//           {roles.map((role) => {
//             // Получаем права для конкретной роли (если нет – пустой объект)
//             const perms = rolePermissionParams[role.id] || {};

//             // Общий чекбокс для "Доступ" считается отмеченным, если у всех параметров allowed === true
//             const allAllowed =
//               Object.keys(perms).length > 0 &&
//               Object.values(perms).every((item) => item.allowed === true);

//             // Общий чекбокс для "Редактирование" считается отмеченным,
//             // если для всех параметров, у которых allowed === true, canEdit === true.
//             const allCanEdit =
//               Object.keys(perms).length > 0 &&
//               Object.values(perms)
//                 .filter((item) => item.allowed)
//                 .every((item) => item.canEdit === true);

//             return (
//               <React.Fragment key={role.id}>
//                 <th>
//                   <input
//                     type="checkbox"
//                     checked={allAllowed}
//                     onChange={(e) => {
//                       const newState = { ...rolePermissionParams };
//                       // Обновляем для каждого разрешения для этой роли
//                       Object.keys(newState[role.id] || {}).forEach((permId) => {
//                         newState[role.id][permId] = {
//                           ...newState[role.id][permId],
//                           allowed: e.target.checked,
//                           // Если снимаем доступ, то можно сразу сбросить canEdit
//                           canEdit: e.target.checked
//                             ? newState[role.id][permId].canEdit
//                             : false,
//                         };
//                       });
//                       setRolePermissionParams(newState);
//                     }}
//                   />
//                   {role.name} (Дост.)
//                 </th>
//                 <th>
//                   <input
//                     type="checkbox"
//                     checked={allCanEdit}
//                     onChange={(e) => {
//                       const newState = { ...rolePermissionParams };
//                       Object.keys(newState[role.id] || {}).forEach((permId) => {
//                         // Обновляем canEdit только для параметров, где доступ разрешён
//                         if (newState[role.id][permId].allowed) {
//                           newState[role.id][permId] = {
//                             ...newState[role.id][permId],
//                             canEdit: e.target.checked,
//                           };
//                         }
//                       });
//                       setRolePermissionParams(newState);
//                     }}
//                     disabled={!allAllowed} // Если доступ не включён, то и редактирование отключается
//                   />
//                   {role.name} (Ред.)
//                 </th>
//               </React.Fragment>
//             );
//           })}
//           <th>Действия</th>
//         </tr>
//       </thead>
//       <tbody>
//         {[...dataParams]
//           .sort((a, b) => a.param.localeCompare(b.param))
//           .map((param) => (
//             <tr key={param.id}>
//               <td className="permissions_path">{param.param}</td>
//               <td>
//                 <input
//                   className="permissions_value"
//                   type="text"
//                   value={param.label || ""}
//                   onChange={(e) => handleLabelChange(param.id, e.target.value)}
//                   onBlur={() => handleLabelBlur(param.id)}
//                 />
//               </td>
//               {roles.map((role) => {
//                 // Получаем объект разрешения для конкретного параметра и роли.
//                 // Если записи нет, используем значение по умолчанию.
//                 const permission = rolePermissionParams[role.id]?.[param.id] || {
//                   allowed: false,
//                   canEdit: false,
//                 };

//                 return (
//                   <React.Fragment key={`${role.id}-${param.id}`}>
//                     <td>
//                       <input
//                         type="checkbox"
//                         checked={permission.allowed}
//                         onChange={(e) =>
//                           handleCheckboxChange(role.id, param.id, "allowed", e)
//                         }
//                       />
//                     </td>
//                     <td>
//                       <input
//                         type="checkbox"
//                         checked={permission.canEdit}
//                         onChange={(e) =>
//                           handleCheckboxChange(role.id, param.id, "canEdit", e)
//                         }
//                         disabled={!permission.allowed}
//                       />
//                     </td>
//                   </React.Fragment>
//                 );
//               })}
//               <td>
//                 <button onClick={() => handleDeleteParam(param.id)}>❌</button>
//               </td>
//             </tr>
//           ))}
//       </tbody>
//     </table>


//     <button onClick={handleSavePermissionParams}>Сохранить</button>
//   </div>
// );

}

















// "use client";

// import { useEffect, useState, useRef, useContext } from "react";
// import { AuthContext } from "../../../context/AuthContext";

// export default function RolesPage() {
//   const [roles, setRoles] = useState([]);
//   const [dataParams, setDataParams] = useState([]);
//   const [rolePermissionParams, setRolePermissionParams] = useState({});
//   const isFetched = useRef(false);
//   const [newParam, setNewParam] = useState({ param: "", label: "" });
//   const { user } = useContext(AuthContext);

//   let currentRoleId;
//   if (user) {
//     currentRoleId = user.roleId; // Получаем роль юзера
//   }

//   // Логируем изменения rolePermissionParams
//   useEffect(() => {
//     console.log("Обновлённый rolePermissionParams:", rolePermissionParams);
//   }, [rolePermissionParams]);

//   // Загрузка параметров (dataParams)
//   useEffect(() => {
//     if (isFetched.current) return;
//     isFetched.current = true;

//     const fetchParams = async () => {
//       try {
//         const [mainModelData, configData] = await Promise.all([
//           fetch(`${process.env.NEXT_PUBLIC_API_URL}/mainModel`).then((res) => res.json()),
//           fetch(`${process.env.NEXT_PUBLIC_API_URL}/config`).then((res) => res.json()),
//         ]);

//         const combinedData = mainModelData.concat(configData);

//         // Формируем параметры для отправки
//         const transformedData = combinedData.map(({ paramName, label }) => ({
//           paramName,
//           label,
//         }));

//         // Загружаем уже существующие записи из permissionParams
//         const existingRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/permissionParams`);
//         let existingData = await existingRes.json();

//         // Находим новые параметры, которых ещё нет в базе (сравниваем по paramName)
//         const newParams = transformedData.filter(
//           (newParam) =>
//             !existingData.some(
//               (existingParam) => existingParam.paramName === newParam.paramName
//             )
//         );

//         if (newParams.length > 0) {
//           await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/permissionParams`, {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({ params: newParams }),
//           });

//           // Повторный запрос, чтобы получить новые id
//           const updatedRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/permissionParams`);
//           existingData = await updatedRes.json();
//         }

//         setDataParams(existingData);
//       } catch (error) {
//         console.error("Ошибка при загрузке моделей:", error);
//       }
//     };

//     fetchParams();
//   }, []);

//   // Загрузка ролей
//   useEffect(() => {
//     async function fetchRoles() {
//       try {
//         const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/roles`);
//         const data = await res.json();
//         setRoles(data);
//       } catch (error) {
//         console.error("Ошибка загрузки ролей:", error);
//       }
//     }
//     fetchRoles();
//   }, []);

//   // Загрузка прав доступа для каждой роли
//   useEffect(() => {
//     async function fetchPermissionParams() {
//       const permissionParamsMap = {};
//       for (const role of roles) {
//         try {
//           const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/roles/${role.id}/permissionParams`);
//           const data = await res.json();

//           // console.log(`Роль ${role.id} - полученные права:`, data);
//           // Формируем объект, где для каждого permissionParamId хранится его allowed
//           permissionParamsMap[role.id] = data.reduce((acc, { permissionParamId, allowed }) => {
//             acc[permissionParamId] = allowed;
//             return acc;
//           }, {});
//         } catch (error) {
//           console.error(`Ошибка загрузки прав для роли ${role.id}:`, error);
//         }
//       }
//       // console.log("Загруженные права для всех ролей:", permissionParamsMap);
//       setRolePermissionParams(permissionParamsMap);
//     }
//     if (roles.length > 0) {
//       fetchPermissionParams();
//     }
//   }, [roles]);

//   // Обработчик изменения чекбокса с логированием
//   const handleCheckboxChange = (roleId, permissionParamId, event) => {
//     const newAllowed = event.target.checked;
//     // console.log(
//     //   `handleCheckboxChange: roleId=${roleId}, permissionParamId=${permissionParamId}, новое значение: ${newAllowed}`
//     // );
//     setRolePermissionParams((prev) => {
//       const updated = { ...prev };
//       if (!updated[roleId]) {
//         updated[roleId] = {};
//       }
//       updated[roleId][permissionParamId] = newAllowed;
//       // console.log(
//       //   `После изменения: для роли ${roleId}, permissionParam ${permissionParamId} установлено ${newAllowed}`
//       // );
//       return updated;
//     });
//   };

//   // Обработчик сохранения прав
//   const handleSavePermissionParams = async () => {
//     for (const role of roles) {
//       const permissions = rolePermissionParams[role.id] || {};
//       const payload = dataParams.map((param) => ({
//         roleId: role.id,
//         permissionParamId: param.id,
//         allowed: permissions[param.id] !== undefined ? permissions[param.id] : false,
//       }));

//       // console.log("payload to send", payload);

//       try {
//         const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/roles/${role.id}/permissionParams`, {
//           method: "POST",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify({ permissionParams: payload }),
//         });
//         const result = await res.json();
//         // console.log("Ответ от сервера:", result);

//       } catch (error) {
//         console.error(`Ошибка сохранения прав для роли ${role.id}:`, error);
//       }
//     }
//     // console.log("Права обновлены!");
//   };

//   // Обработчики изменения label и добавления нового параметра (оставляем без изменений)
//   const handleLabelChange = (paramId, value) => {
//     setDataParams((prev) =>
//       prev.map((param) => (param.id === paramId ? { ...param, label: value } : param))
//     );
//   };

//   const handleLabelBlur = async (paramId) => {
//     const param = dataParams.find((p) => p.id === paramId);
//     if (!param) return;
//     try {
//       await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/permissionParams/${paramId}`, {
//         method: "PUT",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ label: param.label }),
//       });
//     } catch (error) {
//       console.error(`Ошибка обновления label для параметра ${paramId}:`, error);
//     }
//   };

//   const handleAddParam = async () => {
//     if (!newParam.param.trim() || !newParam.label.trim()) return;
//     const tempId = Date.now();
//     setDataParams((prev) => [
//       ...prev,
//       { id: tempId, param: newParam.param, label: newParam.label },
//     ]);

//     try {
//       const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/permissionParams`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ params: [{ paramName: newParam.param, label: newParam.label }] }),
//       });
//       if (!response.ok) throw new Error("Ошибка добавления параметра");

//       const updatedRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/permissionParams`);
//       const updatedData = await updatedRes.json();
//       const newAddedParam = updatedData.find(
//         (item) => item.param === newParam.param && item.label === newParam.label
//       );
//       const newParamId = newAddedParam?.id || tempId;
//       // Обновляем роль текущего пользователя, используя объект, а не Set:
//       setRolePermissionParams((prev) => ({
//         ...prev,
//         [currentRoleId]: {
//           ...(prev[currentRoleId] || {}),
//           [newParamId]: true,
//         },
//       }));
//     } catch (error) {
//       console.error("Ошибка при добавлении параметра:", error);
//     } finally {
//       setNewParam({ param: "", label: "" });
//     }
//   };

//   const handleDeleteParam = async (paramId) => {

//     // console.log("paramId = ", paramId)
//     try {
//       // Удаляем из локального состояния
//       const updatedParams = dataParams.filter((p) => p.id !== paramId);
//       setDataParams(updatedParams);
  
//       const updatedRolePermissionParams = { ...rolePermissionParams };
//       Object.keys(updatedRolePermissionParams).forEach((roleId) => {
//         delete updatedRolePermissionParams[roleId][paramId];
//       });
//       setRolePermissionParams(updatedRolePermissionParams);

//       const isConfirmed = window.confirm("Вы уверены, что хотите удалить этот параметр?");
//       if (!isConfirmed) return; // Отмена удаления
  
//       // Отправляем запрос на сервер
//       await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/permissionParams/${paramId}`, {
//         method: "DELETE",
//       });
  
//       // console.log(`Параметр ${paramId} удалён`);
//     } catch (error) {
//       console.error("Ошибка при удалении параметра:", error);
//     }
//   };
  

// // console.log("dataParams = ", dataParams)

//   return (
//     <div>
//       <h1>Управление доступом к параметрам</h1>
//       <div style={{ marginBottom: "20px" }}>
//         <input
//           type="text"
//           placeholder="Имя параметра (param)"
//           value={newParam.param}
//           onChange={(e) => setNewParam({ ...newParam, param: e.target.value })}
//         />
//         <input
//           type="text"
//           placeholder="Обозначение (label)"
//           value={newParam.label}
//           onChange={(e) => setNewParam({ ...newParam, label: e.target.value })}
//         />
//         <button onClick={handleAddParam}>Добавить параметр</button>
//       </div>
//       <table border="1">
//         <thead>
//           <tr>
//             <th>Параметр</th>
//             <th>Обозначение</th>
//                 {roles.map((role) => {
//                   const allChecked = Object.values(rolePermissionParams[role.id] || {}).every(Boolean); // Проверяем, все ли true
//                   return (
//                     <th key={role.id}>
//                       <input
//                         type="checkbox"
//                         checked={allChecked}
//                         onChange={(e) => {
//                           const newState = { ...rolePermissionParams };
//                           Object.keys(newState[role.id] || {}).forEach((permId) => {
//                             newState[role.id][permId] = e.target.checked;
//                           });
//                           setRolePermissionParams(newState);
//                         }}
//                       />
//                       {role.name}
//                     </th>
//                   );
//                 })}
//           </tr>
//         </thead>
//         <tbody>
//           {[...dataParams]
//             .sort((a, b) => a.param.localeCompare(b.param))
//             .map((param) => (
//               <tr key={param.id}>
//                 <td className="permissions_path">{param.param}</td>
//                 <td>
//                   <input
//                     className="permissions_value"
//                     type="text"
//                     value={param.label || ""}
//                     onChange={(e) => handleLabelChange(param.id, e.target.value)}
//                     onBlur={() => handleLabelBlur(param.id)}
//                   />
//                 </td>
//                 {roles.map((role) => (
//                   <td key={role.id}>
//                     <input
//                       type="checkbox"
//                       checked={rolePermissionParams[role.id]?.[param.id] || false}
//                       onChange={(e) => handleCheckboxChange(role.id, param.id, e)}
//                     />
//                   </td>
//                 ))}
//                 <td>
//                   <button onClick={() => handleDeleteParam(param.id)}>❌</button>
//                 </td>
//               </tr>
//             ))}
//         </tbody>
//       </table>
//       <button onClick={handleSavePermissionParams}>Сохранить</button>
//     </div>
//   );
// }





"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";

export default function RolesPage() {
  const [roles, setRoles] = useState([]);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleAccessMonths, setNewRoleAccessMonths] = useState(12);
  const getAuthHeaders = (extra = {}) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    };
  };

  const fetchRoles = useCallback(async () => {
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
  }, []);  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRoles();
  }, [fetchRoles]);

  const handleEditRole = useCallback(async (id, name, accessMonths) => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/roles/${id}`, {
        method: "PUT",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ name, accessMonths }),
      });
      fetchRoles();
    } catch (error) {
      console.error("Ошибка обновления роли:", error);
    }
  }, [fetchRoles]);

  const handleDeleteRole = useCallback(async (id) => {
    const confirmed = window.confirm("Удалить роль? Это действие нельзя отменить.");
    if (!confirmed) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/roles/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        let message = "Не удалось удалить роль";
        try {
          const data = await res.json();
          message = data?.error || message;
          if (res.status === 409 && Number(data?.usersCount || 0) > 0) {
            message = `Удаление невозможно: у роли есть пользователи (${data.usersCount})`;
          }
        } catch {}
        toast(message);
        return;
      }
      fetchRoles();
    } catch (error) {
      console.error("Ошибка удаления роли:", error);
      toast("Ошибка удаления роли");
    }
  }, [fetchRoles]);

  const handleCreateRole = useCallback(async () => {
    if (!newRoleName.trim()) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/roles`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ name: newRoleName, accessMonths: newRoleAccessMonths }),
      });
      setNewRoleName("");
      setNewRoleAccessMonths(12);
      fetchRoles();
    } catch (error) {
      console.error("Ошибка создания роли:", error);
    }
  }, [newRoleName, newRoleAccessMonths, fetchRoles]);

  return (
    <div>
      <h1>Управление ролями</h1>
      <h2>Добавить роль</h2>
      <input
        type="text"
        value={newRoleName}
        onChange={(e) => setNewRoleName(e.target.value)}
        placeholder="Название роли"
      />
      <input
        type="number"
        value={newRoleAccessMonths}
        onChange={(e) => setNewRoleAccessMonths(Number(e.target.value))}
        placeholder="Доступные месяцы"
      />
      <button onClick={handleCreateRole}>Добавить</button>
      <p></p>
      <table border="1">
        <thead>
          <tr>
            <th>ID</th>
            <th>Название</th>
            <th>Месяцы доступа</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.id}>
              <td>{role.id}</td>
              <td>
                <input
                  type="text"
                  value={role.name}
                  onChange={(e) => handleEditRole(role.id, e.target.value, role.accessMonths)}
                />
              </td>
              <td>
                <input
                  type="number"
                  value={role.accessMonths || 12}
                  onChange={(e) => handleEditRole(role.id, role.name, Number(e.target.value))}
                />
              </td>
              <td>
                <button onClick={() => handleDeleteRole(role.id)}>Удалить</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}



"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import {AuthContext} from "../../../context/AuthContext";
import { useRouter } from "next/navigation";
import { toast } from 'react-toastify';
import styles from "./users.module.css";

export default function UsersPage() {
  const { token, logout } = useContext(AuthContext);
  const router = useRouter();
  const usersTabDomain = (
    String(process.env.STATIC_BASE_URL || process.env.NEXT_PUBLIC_STATIC_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
  ) || "orderspace.ru";
  const defaultDomain = usersTabDomain.toLowerCase();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({ id: null, name: "", password: "", roleId: "", phone: "", machineId: "", domain: defaultDomain, system: false, autoCreatePersonalChats: true }); // Добавляем поле для телефона
  const [showPassword, setShowPassword] = useState(false); // Состояние для управления видимостью пароля
  const [savedMachineIds, setSavedMachineIds] = useState({});
  const [usersTabOpen, setUsersTabOpen] = useState(false);
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [remoteUsersTabOpen, setRemoteUsersTabOpen] = useState(false);
  const [remoteUsersDomain, setRemoteUsersDomain] = useState("");
  const [managedDomains, setManagedDomains] = useState([]);
  const [remoteUsersByDomain, setRemoteUsersByDomain] = useState({});
  const [remoteOpenByDomain, setRemoteOpenByDomain] = useState({});
  const [remoteCountsByDomain, setRemoteCountsByDomain] = useState({});
  const [appliedDomain, setAppliedDomain] = useState("");
  const [usersAccessMode, setUsersAccessMode] = useState("full");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTargetDomain, setBulkTargetDomain] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [bulkRoleId, setBulkRoleId] = useState("");
  const [bulkRoles, setBulkRoles] = useState([]);
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkResults, setBulkResults] = useState([]);
  const isUsersReadOnly = usersAccessMode !== "full";

  const extractDomain = useCallback((value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const hostname = new URL(withProto).hostname || "";
      return hostname.replace(/^www\./i, "");
    } catch {
      return raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];
    }
  }, []);

  const usersTabDomainLabel = extractDomain(
    process.env.STATIC_BASE_URL ||
    process.env.NEXT_PUBLIC_STATIC_BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    ""
  ) || "users";

  const normalizePhoneLast10 = useCallback((value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length < 10) return '';
    return digits.slice(-10);
  }, []);

  const normalizeMachineIdField = useCallback((value) =>
    String(value || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .join(','), []);
  const normalizeDomainValue = useCallback((value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      return new URL(withProto).hostname.replace(/^www\./i, "").toLowerCase();
    } catch {
      return raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].split(":")[0].toLowerCase();
    }
  }, []);

  const visibleManagedDomains = managedDomains.filter((row, index, rows) => {
    const domain = normalizeDomainValue(row?.domain);
    if (!domain || domain === defaultDomain) return false;
    return rows.findIndex((candidate) => normalizeDomainValue(candidate?.domain) === domain) === index;
  });

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const getAuthHeaders = useCallback((contentType = false) => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const effectiveToken = token || stored;
    const base = {};
    if (contentType) base["Content-Type"] = "application/json";
    if (effectiveToken) base.Authorization = `Bearer ${effectiveToken}`;
    return base;
  }, [token]);

  // Авторизация
  useEffect(() => {
    if (!token) {
      router.push("/login"); // Если нет токена, редиректим на логин
      return;
    }
  }, [token, logout, router]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/users`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUsers([]);
        setSavedMachineIds({});
        toast.error(data?.error || "Ошибка при загрузке пользователей");
        return;
      }
      const rows = Array.isArray(data) ? data : [];
      setUsers(rows);
      const map = Object.fromEntries(rows.map((u) => [u.id, normalizeMachineIdField(u.machineId)]));
      setSavedMachineIds(map);
    } catch (error) {
      console.error("Ошибка при загрузке пользователей:", error);
    }
  }, [getAuthHeaders, normalizeMachineIdField]);

  const fetchUsersAccessMode = useCallback(async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/users/access-mode`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUsersAccessMode("deny");
        return;
      }
      setUsersAccessMode(String(data?.mode || "full"));
    } catch {
      setUsersAccessMode("deny");
    }
  }, [getAuthHeaders]);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/roles`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setRoles(data);
    } catch (error) {
      console.error("Ошибка при загрузке ролей:", error);
    }
  }, [getAuthHeaders]);

  const fetchManagedDomains = useCallback(async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/managed-domains`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) return;
      setManagedDomains(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Ошибка при загрузке managed domains:", error);
    }
  }, [getAuthHeaders]);

  const upsertManagedDomain = useCallback(async (domainRaw) => {
    const domain = normalizeDomainValue(domainRaw);
    if (!domain || domain === defaultDomain) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/managed-domains`, {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({ domain }),
      });
      fetchManagedDomains();
    } catch (error) {
      console.error("Ошибка при сохранении managed domain:", error);
    }
  }, [defaultDomain, fetchManagedDomains, getAuthHeaders, normalizeDomainValue]);

  const applyDomainSelection = useCallback(() => {
    const normalized = normalizeDomainValue(form.domain);
    if (!normalized) {
      setAppliedDomain("");
      setRoles([]);
      setRemoteUsers([]);
      setRemoteUsersDomain("");
      return;
    }
    setAppliedDomain(normalized);
  }, [form.domain, normalizeDomainValue]);

  const fetchRemoteUsers = useCallback(async (domainRaw) => {
    const domain = normalizeDomainValue(domainRaw);
    if (!domain) {
      setRemoteUsers([]);
      setRemoteUsersDomain("");
      return;
    }
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/remote/users?domain=${encodeURIComponent(domain)}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Не удалось загрузить пользователей домена");
        return;
      }
      const rows = Array.isArray(data) ? data : [];
      setRemoteUsers(rows);
      setRemoteUsersDomain(domain);
      setRemoteUsersByDomain((prev) => ({ ...prev, [domain]: rows }));
      setRemoteCountsByDomain((prev) => ({ ...prev, [domain]: rows.length }));
    } catch (error) {
      console.error("Ошибка при загрузке пользователей домена:", error);
    }
  }, [getAuthHeaders, normalizeDomainValue]);

  const fetchRemoteUsersCount = useCallback(async (domainRaw) => {
    const domain = normalizeDomainValue(domainRaw);
    if (!domain) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/remote/users?domain=${encodeURIComponent(domain)}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) return;
      const rows = Array.isArray(data) ? data : [];
      setRemoteCountsByDomain((prev) => ({ ...prev, [domain]: rows.length }));
    } catch {}
  }, [getAuthHeaders, normalizeDomainValue]);

  useEffect(() => {
    if (!token) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUsers();
    fetchRoles();
    fetchManagedDomains();
    fetchUsersAccessMode();
  }, [token, fetchUsers, fetchRoles, fetchManagedDomains, fetchUsersAccessMode]);

  useEffect(() => {
    if (!token || form.id) return;
    const domain = appliedDomain;
    if (!domain) {
      const timer = setTimeout(() => {
        fetchRoles();
      }, 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/remote/roles?domain=${encodeURIComponent(domain)}`, {
          headers: getAuthHeaders(),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data?.error || "Не удалось загрузить роли домена");
          return;
        }
        setRoles(Array.isArray(data) ? data : []);
        setForm((prev) => ({ ...prev, roleId: "" }));
      } catch (error) {
        console.error("Ошибка загрузки ролей удаленного домена:", error);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [token, appliedDomain, form.id, fetchRoles, getAuthHeaders]);

  useEffect(() => {
    if (!token || form.id) return;
    const domain = appliedDomain;
    if (!domain) {
      const timer = setTimeout(() => {
        setRemoteUsers([]);
        setRemoteUsersDomain("");
      }, 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      upsertManagedDomain(domain);
      fetchRemoteUsers(domain);
    }, 400);
    return () => clearTimeout(timer);
  }, [token, appliedDomain, form.id, fetchRemoteUsers, upsertManagedDomain]);

  useEffect(() => {
    if (!token || !managedDomains.length) return;
    let cancelled = false;
    (async () => {
      const requestedDomains = new Set();
      for (const row of managedDomains) {
        if (cancelled) return;
        const domain = normalizeDomainValue(row?.domain);
        if (!domain || domain === defaultDomain || requestedDomains.has(domain)) continue;
        requestedDomains.add(domain);
        if (remoteCountsByDomain[domain] != null) continue;
        await fetchRemoteUsersCount(domain);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, managedDomains, remoteCountsByDomain, defaultDomain, fetchRemoteUsersCount, normalizeDomainValue]);
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const normalizedNewPhone = normalizePhoneLast10(form.phone);
    if (!normalizedNewPhone) {
      toast.error("Введите корректный номер (минимум 10 цифр)");
      return;
    }

    const currentId = form.id ? Number(form.id) : null;
    const duplicateByPhone = users.find((u) => {
      const normalizedExisting = normalizePhoneLast10(u?.phone);
      if (!normalizedExisting) return false;
      if (normalizedExisting !== normalizedNewPhone) return false;
      if (currentId != null && Number(u?.id) === currentId) return false;
      return true;
    });

    if (duplicateByPhone) {
      toast.error("Пользователь с таким телефоном уже существует");
      return;
    }

    try {
      const method = form.id ? "PUT" : "POST";
      const normalizedDomain = appliedDomain || normalizeDomainValue(form.domain);
      const isRemoteTarget = Boolean(normalizedDomain);
      const shouldCreateRemote = !form.id && isRemoteTarget;
      const isUpdateRemote = Boolean(form.id) && isRemoteTarget;
      const url = isUpdateRemote
        ? `${process.env.NEXT_PUBLIC_API_URL}/admin/remote/users/${form.id}`
        : shouldCreateRemote
          ? `${process.env.NEXT_PUBLIC_API_URL}/admin/remote/users`
          : (form.id
            ? `${process.env.NEXT_PUBLIC_API_URL}/admin/users/${form.id}`
            : `${process.env.NEXT_PUBLIC_API_URL}/admin/users`);
  
      const response = await fetch(url, {
        method: method,
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          ...form,
          domain: normalizedDomain || undefined,
          machineId: normalizeMachineIdField(form.machineId),
        }),
      });

      // console.log("Отправляем данные на сервер:", form);
  
      if (!response.ok) {
        // Получаем сообщение об ошибке от сервера
        const errorData = await response.json();
        toast.error(errorData.error || "Ошибка при сохранении пользователя");
        return;
      }
      if (isRemoteTarget) {
        await upsertManagedDomain(normalizedDomain);
        await fetchRemoteUsers(normalizedDomain);
      }
  
      setForm({ id: null, name: "", password: "", roleId: "", phone: "", machineId: "", domain: defaultDomain, system: false, autoCreatePersonalChats: true }); // Сбрасываем форму после успешного сохранения
      setAppliedDomain("");
      fetchUsers();
      fetchManagedDomains();
      toast.success("Пользователь успешно сохранён");
    } catch (error) {
      console.error("Ошибка при сохранении пользователя:", error);
      toast.error("Ошибка при сохранении пользователя");
    }
  };

  const handleEdit = (user) => {
    setForm({ ...user, password: "", domain: defaultDomain, system: user?.system === true, autoCreatePersonalChats: user?.autoCreatePersonalChats !== false }); // Сбрасываем пароль при редактировании 
  };

  const handleEditRemote = async (user, domain) => {
    const normalizedDomain = normalizeDomainValue(domain);
    if (!normalizedDomain) return;
    setForm({
      ...user,
      password: "",
      domain: normalizedDomain,
      system: user?.system === true,
      autoCreatePersonalChats: user?.autoCreatePersonalChats !== false,
    });
    setAppliedDomain(normalizedDomain);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/remote/roles?domain=${encodeURIComponent(normalizedDomain)}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setRoles(Array.isArray(data) ? data : []);
      }
    } catch {}
  };

  const handleDelete = async (id) => {
    if (!confirm("Вы уверены?")) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/users/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      fetchUsers();
    } catch (error) {
      console.error("Ошибка при удалении пользователя:", error);
    }
  };

  const handleMachineIdChange = (userId, value) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, machineId: value } : u))
    );
  };

  const saveMachineId = async (userId, machineIdValue) => {
    const normalized = normalizeMachineIdField(machineIdValue);
    const prevSaved = normalizeMachineIdField(savedMachineIds[userId]);
    if (normalized === prevSaved) {
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/users/${userId}`, {
        method: "PUT",
        headers: getAuthHeaders(true),
        body: JSON.stringify({ machineId: normalized }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        toast.error(errorData.error || "Не удалось сохранить machineId");
        return;
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, machineId: normalized } : u))
      );
      setSavedMachineIds((prev) => ({ ...prev, [userId]: normalized }));
      toast.success("machineId сохранён");
    } catch (error) {
      console.error("Ошибка при сохранении machineId:", error);
      toast.error("Ошибка при сохранении machineId");
    }
  };


  const handleToggleChatPermission = async (userId, newValue) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/users/${userId}/toggle-chat`, {
        method: 'PUT',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ canChat: newValue }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        toast.error(errorData.error || 'Не удалось изменить разрешение на чат');
        return;
      }

      toast.success('Разрешение на чат обновлено');
      fetchUsers(); // обновим таблицу
    } catch (err) {
      console.error('Ошибка при обновлении активности:', err);
      toast.error('Ошибка при обновлении активности');
    }
  };

  const handleToggleMaxPermission = async (userId, newValue) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/users/${userId}/toggle-max`, {
        method: 'PUT',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ canMax: newValue }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        toast.error(errorData.error || 'Не удалось изменить доступ к MAX');
        return;
      }

      toast.success('Доступ к MAX обновлён');
      fetchUsers();
    } catch (err) {
      console.error('Ошибка при обновлении доступа к MAX:', err);
      toast.error('Ошибка при обновлении доступа к MAX');
    }
  };

  const handleToggleTelegramPermission = async (userId, newValue) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/users/${userId}/toggle-telegram`, {
        method: 'PUT',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ canTelegram: newValue }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        toast.error(errorData.error || 'Не удалось изменить доступ к Telegram');
        return;
      }
      toast.success('Доступ к Telegram обновлён');
      fetchUsers();
    } catch (err) {
      console.error('Ошибка при обновлении доступа к Telegram:', err);
      toast.error('Ошибка при обновлении доступа к Telegram');
    }
  };




  const handleToggleActive = async (userId, newValue) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/users/${userId}/toggle-active`, {
        method: 'PUT',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ isActive: newValue }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        toast.error(errorData.error || 'Не удалось изменить активность');
        return;
      }

      toast.success('Статус активности обновлён');
      fetchUsers(); // обновим таблицу
    } catch (err) {
      console.error('Ошибка при обновлении активности:', err);
      toast.error('Ошибка при обновлении активности');
    }
  };  

  const updateRemoteUserRow = useCallback((domain, userId, patch) => {
    const normalizedDomain = normalizeDomainValue(domain);
    if (!normalizedDomain) return;
    setRemoteUsersByDomain((prev) => {
      const rows = Array.isArray(prev[normalizedDomain]) ? prev[normalizedDomain] : [];
      return {
        ...prev,
        [normalizedDomain]: rows.map((u) => (Number(u.id) === Number(userId) ? { ...u, ...patch } : u)),
      };
    });
  }, [normalizeDomainValue]);

  const handleRemoteToggle = useCallback(async (domain, userId, path, payload, successMsg) => {
    const normalizedDomain = normalizeDomainValue(domain);
    if (!normalizedDomain) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/remote/users/${userId}/${path}`, {
        method: "PUT",
        headers: getAuthHeaders(true),
        body: JSON.stringify({ ...payload, domain: normalizedDomain }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Не удалось обновить удаленного пользователя");
        return;
      }
      toast.success(successMsg);
      await fetchRemoteUsers(normalizedDomain);
    } catch (error) {
      console.error("Ошибка remote toggle:", error);
      toast.error("Ошибка обновления удаленного пользователя");
    }
  }, [fetchRemoteUsers, getAuthHeaders, normalizeDomainValue]);

  const handleRemoteMachineIdSave = useCallback(async (domain, userId, machineIdValue) => {
    const normalizedDomain = normalizeDomainValue(domain);
    if (!normalizedDomain) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/remote/users/${userId}`, {
        method: "PUT",
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          domain: normalizedDomain,
          machineId: normalizeMachineIdField(machineIdValue),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Не удалось сохранить machineId удаленного пользователя");
        return;
      }
      updateRemoteUserRow(normalizedDomain, userId, { machineId: normalizeMachineIdField(machineIdValue) });
      toast.success("machineId удаленного пользователя сохранён");
    } catch (error) {
      console.error("Ошибка сохранения remote machineId:", error);
      toast.error("Ошибка сохранения machineId");
    }
  }, [getAuthHeaders, normalizeDomainValue, normalizeMachineIdField, updateRemoteUserRow]);

  const handleDeleteRemoteUser = useCallback(async (domain, userId) => {
    const normalizedDomain = normalizeDomainValue(domain);
    if (!normalizedDomain) return;
    if (!confirm("Удалить удаленного пользователя?")) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/remote/users/${userId}?domain=${encodeURIComponent(normalizedDomain)}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Не удалось удалить удаленного пользователя");
        return;
      }
      toast.success("Удаленный пользователь удален");
      await fetchRemoteUsers(normalizedDomain);
    } catch (error) {
      console.error("Ошибка удаления remote user:", error);
      toast.error("Ошибка удаления удаленного пользователя");
    }
  }, [fetchRemoteUsers, getAuthHeaders, normalizeDomainValue]);

  const handleToggleRemoteDomain = async (domainRaw) => {
    const domain = normalizeDomainValue(domainRaw);
    if (!domain) return;
    setForm((prev) => ({ ...prev, domain }));
    setAppliedDomain(domain);
    setRemoteOpenByDomain((prev) => {
      const nextOpen = !Boolean(prev[domain]);
      return { ...prev, [domain]: nextOpen };
    });
    if (!remoteUsersByDomain[domain]) {
      await fetchRemoteUsers(domain);
    }
  };

  const handleRemoveManagedDomain = async (id) => {
    if (!confirm("Удалить домен из списка вкладок?")) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/managed-domains/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error || "Не удалось удалить домен");
        return;
      }
      fetchManagedDomains();
      toast.success("Домен удален");
    } catch (error) {
      console.error("Ошибка удаления managed domain:", error);
      toast.error("Ошибка удаления домена");
    }
  };


  const openBulkCreate = async (domainRaw = "") => {
    const domain = normalizeDomainValue(domainRaw);
    setBulkTargetDomain(domain);
    setBulkText("");
    setBulkRoleId("");
    setBulkResults([]);
    setBulkRoles([]);
    setBulkOpen(true);

    try {
      const url = domain
        ? `${process.env.NEXT_PUBLIC_API_URL}/admin/remote/roles?domain=${encodeURIComponent(domain)}`
        : `${process.env.NEXT_PUBLIC_API_URL}/admin/roles`;
      const res = await fetch(url, { headers: getAuthHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Не удалось загрузить роли");
        return;
      }
      setBulkRoles(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Ошибка загрузки ролей для массового создания:", error);
      toast.error("Не удалось загрузить роли");
    }
  };

  const parseBulkUsers = useCallback((value) => {
    const rows = [];
    const errors = [];
    const seenNames = new Set();

    String(value || "")
      .split(/\r?\n/)
      .forEach((sourceLine, index) => {
        const line = sourceLine.trim();
        if (!line) return;

        let columns = sourceLine.split("\t");
        if (columns.length < 3) columns = sourceLine.split(";");
        columns = columns.map((item) => String(item || "").trim());

        const [name, password, phone] = columns;
        const lineNumber = index + 1;
        const isHeader =
          lineNumber === 1 &&
          String(name || "").toLowerCase() === "логин" &&
          String(password || "").toLowerCase() === "пароль";
        if (isHeader) return;

        if (!name || !password || !phone) {
          errors.push({ line: lineNumber, message: "Нужно три колонки: логин, пароль, телефон" });
          return;
        }
        if (!normalizePhoneLast10(phone)) {
          errors.push({ line: lineNumber, name, message: "Некорректный телефон" });
          return;
        }
        const normalizedName = name.toLowerCase();
        if (seenNames.has(normalizedName)) {
          errors.push({ line: lineNumber, name, message: "Логин повторяется во вставленных данных" });
          return;
        }
        seenNames.add(normalizedName);
        rows.push({ line: lineNumber, name, password, phone });
      });

    return { rows, errors };
  }, [normalizePhoneLast10]);

  const handleBulkCreate = async () => {
    if (!bulkRoleId) {
      toast.error("Выберите роль");
      return;
    }

    const parsed = parseBulkUsers(bulkText);
    if (!parsed.rows.length) {
      setBulkResults(parsed.errors);
      toast.error("Нет корректных строк для создания");
      return;
    }

    setBulkCreating(true);
    setBulkResults(parsed.errors);
    const results = [...parsed.errors];
    let createdCount = 0;

    try {
      for (const row of parsed.rows) {
        const isRemote = Boolean(bulkTargetDomain);
        const url = isRemote
          ? `${process.env.NEXT_PUBLIC_API_URL}/admin/remote/users`
          : `${process.env.NEXT_PUBLIC_API_URL}/admin/users`;
        const payload = {
          name: row.name,
          password: row.password,
          phone: row.phone,
          roleId: Number(bulkRoleId),
          domain: isRemote ? bulkTargetDomain : undefined,
          viewAll: true,
          isActive: true,
          canChat: true,
          canMax: true,
          canTelegram: true,
          autoCreatePersonalChats: true,
          system: false,
          machineId: null,
        };

        try {
          const res = await fetch(url, {
            method: "POST",
            headers: getAuthHeaders(true),
            body: JSON.stringify(payload),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            results.push({ line: row.line, name: row.name, message: data?.error || "Ошибка создания" });
          } else {
            createdCount += 1;
          }
        } catch (error) {
          results.push({ line: row.line, name: row.name, message: error?.message || "Ошибка соединения" });
        }
        setBulkResults([...results]);
      }

      if (bulkTargetDomain) {
        await upsertManagedDomain(bulkTargetDomain);
        await fetchRemoteUsers(bulkTargetDomain);
      } else {
        await fetchUsers();
      }
      await fetchManagedDomains();

      if (results.length === 0) {
        toast.success(`Создано пользователей: ${createdCount}`);
        setBulkOpen(false);
      } else {
        toast.warning(`Создано: ${createdCount}. Ошибок: ${results.length}`);
      }
    } finally {
      setBulkCreating(false);
    }
  };


  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box", overflowX: "hidden" }}>
      <h1>Управление пользователями</h1>
      {isUsersReadOnly && (
        <div style={{ marginTop: 8, marginBottom: 10, padding: "8px 10px", borderRadius: 8, background: "#fff7ed", border: "1px solid #fdba74", color: "#9a3412" }}>
          Режим просмотра: действия создания/редактирования/удаления отключены на этом домене.
        </div>
      )}

      {/* Форма для создания/редактирования пользователей */}
      <form
        autoComplete="off"
        onSubmit={isUsersReadOnly ? (e) => e.preventDefault() : handleSubmit}
        style={{
          marginTop: 12,
          marginBottom: 18,
          padding: 16,
          borderRadius: 12,
          border: "1px solid #d0d7de",
          background: "linear-gradient(180deg, #f8fbff 0%, #f3f7fb 100%)",
          boxShadow: "0 6px 20px rgba(16,24,40,0.06)",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: "#1f2937" }}>
          Создание и редактирование пользователя
        </div>
        
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
            alignItems: "center",
          }}
        >

          <input type="name" name="name" placeholder="Логин" value={form.name} onChange={handleChange} disabled={isUsersReadOnly} required autoComplete="username" style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid #c7d2e0" }} />

          <div style={{ position: "relative", width: "100%", minWidth: 0 }}>
            <input
              type={showPassword  ? "text" : "password"}
              name="password"
              placeholder="Пароль"
              value={form.password}
              onChange={handleChange}
              disabled={isUsersReadOnly}
              required
              autoComplete="new-password"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "9px 42px 9px 10px",
                borderRadius: 8,
                border: "1px solid #c7d2e0",
              }}
            />
            <button 
              type="button" 
              onClick={togglePasswordVisibility}
              disabled={isUsersReadOnly}
              style={{
                position: "absolute",
                right: 0,
                top: "20%",
                transform: "translateY(-50%)",
                cursor: "pointer",
                border: "none",
                background: "transparent",
                width: 30,
                height: 30,
                padding: 0,
                color: "#0f172a",
              }}
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
              title={showPassword ? "Скрыть пароль" : "Показать пароль"}
            >
              {showPassword ? "👁️" : "🙈"}
            </button>
          </div>

          <input type="text" name="phone" placeholder="Телефон" value={form.phone || ""} onChange={handleChange} disabled={isUsersReadOnly} required autoComplete="off" style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid #c7d2e0" }} />

          <input type="text" name="machineId" placeholder="Machine ID" value={form.machineId || ""} onChange={handleChange} disabled={isUsersReadOnly} autoComplete="off" style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid #c7d2e0" }} />
          <div style={{ display: "flex", gap: 8, minWidth: 0 }}>
            <input
              type="text"
              name="domain"
              placeholder="Домен"
              value={form.domain || ""}
              onChange={handleChange}
              disabled={isUsersReadOnly}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyDomainSelection();
                }
              }}
              autoComplete="off"
              style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid #c7d2e0", minWidth: 0, flex: 1 }}
            />
          {/*  <button
              type="button"
              onClick={applyDomainSelection}
              disabled={isUsersReadOnly}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #93c5fd",
                background: "#eff6ff",
                color: "#1e3a8a",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Применить
            </button>
          */}  
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minHeight: 34,
              padding: "0px 10px",
              borderRadius: 8,
              border: "1px solid #c7d2e0",
              background: "#fff",
              color: "#0f172a",
            }}
          >
            <input
              type="checkbox"
              checked={form.autoCreatePersonalChats !== false}
              disabled={isUsersReadOnly}
              onChange={(e) => setForm((prev) => ({ ...prev, autoCreatePersonalChats: e.target.checked }))}
            />
            Авто-чаты
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minHeight: 34,
              padding: "0px 10px",
              borderRadius: 8,
              border: "1px solid #c7d2e0",
              background: "#fff",
              color: "#0f172a",
            }}
          >
            <input
              type="checkbox"
              checked={form.system === true}
              disabled={isUsersReadOnly}
              onChange={(e) => setForm((prev) => ({ ...prev, system: e.target.checked, autoCreatePersonalChats: e.target.checked ? false : prev.autoCreatePersonalChats }))}
            />
            Системный
          </label>
        
        <select name="roleId" value={form.roleId} onChange={handleChange} disabled={isUsersReadOnly} required style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid #c7d2e0" }}>
          <option value="">Выберите роль</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isUsersReadOnly}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #1d4ed8",
            background: "#2563eb",
            color: "#fff",
            fontWeight: 600,
            marginTop: 0,
          }}
        >
          {form.id ? "Обновить" : "Создать"}
        </button>
        </div>
      </form>

      {/* Таблица пользователей */}
      <div style={{ marginTop: 16, width: "100%", maxWidth: "100%", minWidth: 0 }}>
        <button
          type="button"
          onClick={() => {
            setUsersTabOpen((prev) => !prev);
            setForm((prev) => ({ ...prev, domain: defaultDomain }));
            setAppliedDomain("");
          }}
          style={{
            width: "100%",
            textAlign: "left",
            padding: "10px 12px",
            border: "1px solid #d0d7de",
            borderRadius: 8,
            background: "#f6f8fa",
            color: "#0f172a",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
            {usersTabOpen ? "▼" : "▶"} {usersTabDomainLabel} ({users.length})
        </button>

        {usersTabOpen && (
          <div
            style={{
              marginTop: 10,
              width: "100%",
              maxWidth: "100%",
              minWidth: 0,
              overflowX: "hidden",
              boxSizing: "border-box",
            }}
          >
            <button
              type="button"
              onClick={() => openBulkCreate("")}
              disabled={isUsersReadOnly}
              style={{ margin: "0 0 10px 0", padding: "8px 12px", borderRadius: 8, background: "#15803d", color: "#fff", fontWeight: 600 }}
            >
              Создать многих
            </button>
            <table className={styles.primaryUsersTable}>
              <colgroup>
                <col style={{ width: "4%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "6%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "12%" }} />
              </colgroup>
        <thead>
          <tr>
            <th>ID</th>
            <th>Логин</th>
            <th>Роль</th>
            <th>Телефон</th>
            <th>Machine ID</th>
            <th>Активен</th>
            <th>Разрешение на чат</th>
            <th>Доступ к MAX</th>
            <th>Доступ к Telegram</th>
            <th>Авто-чаты</th>
            <th>Системный</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
        
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.id}</td>
              <td>{user.name}</td>
              <td>{roles.find((role) => role.id === user.roleId)?.name || "—"}</td>
              <td>{user.phone || "—"}</td>
              <td>
                <input
                  type="text"
                  value={user.machineId || ""}
                  onChange={(e) => handleMachineIdChange(user.id, e.target.value)}
                  onBlur={(e) => saveMachineId(user.id, e.target.value)}
                  disabled={isUsersReadOnly}
                  placeholder="machineId"
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={user.isActive}
                  disabled={isUsersReadOnly}
                  onChange={() => handleToggleActive(user.id, !user.isActive)}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={user.canChat}
                  disabled={isUsersReadOnly}
                  onChange={() => handleToggleChatPermission(user.id, !user.canChat)}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={user.canMax !== false}
                  disabled={isUsersReadOnly}
                  onChange={() => handleToggleMaxPermission(user.id, user.canMax === false)}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={user.canTelegram !== false}
                  disabled={isUsersReadOnly}
                  onChange={() => handleToggleTelegramPermission(user.id, user.canTelegram === false)}
                />
              </td>
              <td>{user.autoCreatePersonalChats === false ? "Нет" : "Да"}</td>
              <td>{user.system === true ? "Да" : "Нет"}</td>
              <td>
                <button onClick={() => handleEdit(user)} disabled={isUsersReadOnly}>Редактировать</button>
                <button onClick={() => handleDelete(user.id)} disabled={isUsersReadOnly}>Удалить</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
          </div>
        )}
      </div>

      {visibleManagedDomains.map((domainRow) => {
        const domain = normalizeDomainValue(domainRow?.domain);
        if (!domain) return null;
        const open = Boolean(remoteOpenByDomain[domain]);
        const rows = remoteUsersByDomain[domain] || [];
        const count = remoteCountsByDomain[domain] ?? rows.length;
        return (
          <div style={{ marginTop: 12 }} key={`managed-domain-${domainRow.id}`}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                onClick={() => handleToggleRemoteDomain(domain)}
                style={{
                  flex: 1,
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  border: "1px solid #d0d7de",
                  borderRadius: 8,
                  background: "#eef6ff",
                  color: "#0f172a",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {open ? "▼" : "▶"} {domain} ({count})
              </button>
              <button
                type="button"
                onClick={() => handleRemoveManagedDomain(domainRow.id)}
                disabled={isUsersReadOnly}
                style={{
                  border: "1px solid #fecaca",
                  background: "#fff5f5",
                  color: "#b91c1c",
                  borderRadius: 8,
                  padding: "8px 10px",
                  cursor: "pointer",
                }}
                title="Удалить домен из списка"
              >
                ✕
              </button>
            </div>

            {open && (
              <div style={{ marginTop: 10, overflowX: "auto" }}>
                <button
                  type="button"
                  onClick={() => openBulkCreate(domain)}
                  disabled={isUsersReadOnly}
                  style={{ margin: "0 0 10px 0", padding: "8px 12px", borderRadius: 8, background: "#15803d", color: "#fff", fontWeight: 600 }}
                >
                  Создать многих
                </button>
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Логин</th>
                      <th>Роль</th>
                      <th>Телефон</th>
                      <th>Machine ID</th>
                      <th>Активен</th>
                      <th>Разрешение на чат</th>
                      <th>Доступ к MAX</th>
                      <th>Доступ к Telegram</th>
                      <th>Авто-чаты</th>
                      <th>Системный</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((user) => (
                      <tr key={`remote-${domain}-${user.id}`}>
                        <td>{user.id}</td>
                        <td>{user.name}</td>
                        <td>{roles.find((role) => role.id === user.roleId)?.name || user.roleId || "—"}</td>
                        <td>{user.phone || "—"}</td>
                        <td>
                          <input
                            type="text"
                            value={user.machineId || ""}
                            onChange={(e) => updateRemoteUserRow(domain, user.id, { machineId: e.target.value })}
                            onBlur={(e) => handleRemoteMachineIdSave(domain, user.id, e.target.value)}
                            disabled={isUsersReadOnly}
                            placeholder="machineId"
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={Boolean(user.isActive)}
                            disabled={isUsersReadOnly}
                            onChange={() => handleRemoteToggle(domain, user.id, "toggle-active", { isActive: !user.isActive }, "Активность обновлена")}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={Boolean(user.canChat)}
                            disabled={isUsersReadOnly}
                            onChange={() => handleRemoteToggle(domain, user.id, "toggle-chat", { canChat: !user.canChat }, "Разрешение на чат обновлено")}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={user.canMax !== false}
                            disabled={isUsersReadOnly}
                            onChange={() => handleRemoteToggle(domain, user.id, "toggle-max", { canMax: user.canMax === false }, "Доступ к MAX обновлён")}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={user.canTelegram !== false}
                            disabled={isUsersReadOnly}
                            onChange={() => handleRemoteToggle(domain, user.id, "toggle-telegram", { canTelegram: user.canTelegram === false }, "Доступ к Telegram обновлён")}
                          />
                        </td>
                        <td>{user.autoCreatePersonalChats === false ? "Нет" : "Да"}</td>
                        <td>{user.system === true ? "Да" : "Нет"}</td>
                        <td>
                          <button onClick={() => handleEditRemote(user, domain)} disabled={isUsersReadOnly}>Редактировать</button>
                          <button onClick={() => handleDeleteRemoteUser(domain, user.id)} disabled={isUsersReadOnly}>Удалить</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
      {bulkOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !bulkCreating) setBulkOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(15, 23, 42, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div style={{ width: "min(720px, 100%)", maxHeight: "90vh", overflowY: "auto", background: "#fff", borderRadius: 8, padding: 18, boxShadow: "0 20px 50px rgba(15, 23, 42, 0.25)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Массовое создание пользователей</div>
                <div style={{ marginTop: 3, fontSize: 13, color: "#475569" }}>
                  Сервер: {bulkTargetDomain || usersTabDomainLabel}
                </div>
              </div>
              <button type="button" onClick={() => setBulkOpen(false)} disabled={bulkCreating} aria-label="Закрыть" title="Закрыть" style={{ margin: 0, padding: 4, width: 32, height: 32, borderRadius: 6, background: "transparent", color: "#334155", fontSize: 22 }}>
                ×
              </button>
            </div>

            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={{ display: "block", marginBottom: 6, fontWeight: 600, color: "#334155" }}>Роль для всех пользователей</span>
              <select value={bulkRoleId} onChange={(e) => setBulkRoleId(e.target.value)} disabled={bulkCreating} style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff" }}>
                <option value="">Выберите роль</option>
                {bulkRoles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
            </label>

            <label style={{ display: "block" }}>
              <span style={{ display: "block", marginBottom: 6, fontWeight: 600, color: "#334155" }}>Логин, пароль и телефон</span>
              <textarea
                value={bulkText}
                onChange={(e) => {
                  setBulkText(e.target.value);
                  setBulkResults([]);
                }}
                disabled={bulkCreating}
                rows={12}
                placeholder={"Логин\tПароль\tТелефон\nivan\tSecret123\t+79991234567"}
                style={{ width: "100%", boxSizing: "border-box", resize: "vertical", padding: 10, borderRadius: 8, border: "1px solid #cbd5e1", fontFamily: "monospace", fontSize: 13 }}
              />
            </label>

            <div style={{ marginTop: 8, fontSize: 13, color: "#64748b" }}>
              Можно вставить строки из Excel. Разделитель — табуляция; также поддерживается точка с запятой.
            </div>

            {bulkResults.length > 0 && (
              <div style={{ marginTop: 12, maxHeight: 150, overflowY: "auto", padding: 10, borderRadius: 8, border: "1px solid #fecaca", background: "#fff7f7", color: "#991b1b", fontSize: 13 }}>
                {bulkResults.map((item, index) => (
                  <div key={`${item.line}-${item.name || "row"}-${index}`}>
                    Строка {item.line}{item.name ? ` (${item.name})` : ""}: {item.message}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => setBulkOpen(false)} disabled={bulkCreating} style={{ margin: 0, padding: "8px 14px", borderRadius: 8, background: "#e2e8f0", color: "#334155" }}>
                Отмена
              </button>
              <button type="button" onClick={handleBulkCreate} disabled={bulkCreating || !bulkText.trim() || !bulkRoleId} style={{ margin: 0, padding: "8px 14px", borderRadius: 8, background: "#15803d", color: "#fff", fontWeight: 600, opacity: bulkCreating || !bulkText.trim() || !bulkRoleId ? 0.6 : 1 }}>
                {bulkCreating ? "Создание..." : "Создать пользователей"}
              </button>
            </div>
          </div>
        </div>
      )}
      <button onClick={logout}>Выйти</button>
    </div>
  );
}

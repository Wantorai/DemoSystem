"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AuthContext } from "../../../context/AuthContext";
import { toast } from "react-toastify";

const HIDDEN_PERMISSION_RESOURCES = new Set(["admin/users", "/admin/users"]);
const PARENT_HOSTS = new Set(["orderspace.ru", "backup.orderspace.ru", "test.orderspace.ru"]);

function normalizeDomainValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withProto).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].split(":")[0].toLowerCase();
  }
}

function shouldHidePermissionResource(resource, targetDomain) {
  const normalized = String(resource || "").trim().toLowerCase();
  if (!HIDDEN_PERMISSION_RESOURCES.has(normalized)) return false;
  return !PARENT_HOSTS.has(normalizeDomainValue(targetDomain));
}

function mapRolePermissionsByRole(roles, rolePermissionsByRole = {}) {
  const permissionsMap = {};
  for (const role of roles || []) {
    const roleId = Number(role?.id);
    const rows = Array.isArray(rolePermissionsByRole[String(roleId)]) ? rolePermissionsByRole[String(roleId)] : [];
    const set = new Set();
    rows.forEach(({ permissionId, allowed }) => {
      if (allowed) set.add(Number(permissionId));
    });
    permissionsMap[roleId] = set;
  }
  return permissionsMap;
}

export default function PermissionsPage() {
  const { token } = useContext(AuthContext);

  const localDomain = useMemo(() => {
    if (typeof window !== "undefined") {
      const host = normalizeDomainValue(window.location?.hostname || "");
      if (host) return host;
    }
    return normalizeDomainValue(
      process.env.NEXT_PUBLIC_STATIC_BASE_URL ||
      process.env.STATIC_BASE_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "orderspace.ru"
    ) || "orderspace.ru";
  }, []);

  const isParentEnvironment = useMemo(() => PARENT_HOSTS.has(localDomain), [localDomain]);
  const [selectedDomain, setSelectedDomain] = useState(localDomain);
  const [managedDomains, setManagedDomains] = useState([]);
  const [dataByDomain, setDataByDomain] = useState({});
  const domainStateRef = useRef({});

  const getAuthHeaders = useCallback((withJson = false) => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const effectiveToken = token || stored;
    const headers = {};
    if (withJson) headers["Content-Type"] = "application/json";
    if (effectiveToken) headers.Authorization = `Bearer ${effectiveToken}`;
    return headers;
  }, [token]);

  const setDomainState = useCallback((domain, patch) => {
    const key = normalizeDomainValue(domain);
    setDataByDomain((prev) => {
      const next = {
        ...prev,
        [key]: {
          ...(prev[key] || {}),
          ...patch,
        },
      };
      domainStateRef.current = next;
      return next;
    });
  }, []);

  const loadLocalDomainData = useCallback(async () => {
    const pagesRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/permissions/sync-permissions`, {
      method: "POST",
      headers: getAuthHeaders(true),
    });
    const rolesRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/roles`, {
      headers: getAuthHeaders(),
    });
    const permissionsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/permissions`, {
      headers: getAuthHeaders(),
    });
    const proRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/permissions/pro-access`, {
      headers: getAuthHeaders(),
    });

    const pagesJson = await pagesRes.json().catch(() => ({}));
    const rolesJson = await rolesRes.json().catch(() => ([]));
    const permissionsJson = await permissionsRes.json().catch(() => ([]));
    const proJson = await proRes.json().catch(() => ([]));
    if (!pagesRes.ok) throw new Error(pagesJson?.error || "Ошибка загрузки страниц");
    if (!rolesRes.ok) throw new Error("Ошибка загрузки ролей");
    if (!permissionsRes.ok) throw new Error("Ошибка загрузки permissions");
    if (!proRes.ok) throw new Error("Ошибка загрузки PRO-доступов");

    const roles = Array.isArray(rolesJson) ? rolesJson : [];
    const permissions = Array.isArray(permissionsJson) ? permissionsJson : [];
    const pagesRaw = Array.isArray(pagesJson?.pages) ? pagesJson.pages : [];
    const pages = pagesRaw.filter((page) => !shouldHidePermissionResource(page?.resource, localDomain));

    const rolePermissionsByRole = {};
    await Promise.all(
      roles.map(async (role) => {
        const roleId = Number(role?.id);
        if (!Number.isFinite(roleId) || roleId <= 0) return;
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/roles/${roleId}/permissions`, {
          headers: getAuthHeaders(),
        });
        const data = await res.json().catch(() => ([]));
        rolePermissionsByRole[String(roleId)] = Array.isArray(data) ? data : [];
      })
    );

    const rolePermissions = mapRolePermissionsByRole(roles, rolePermissionsByRole);
    const pageLabels = {};
    const proAccessMap = {};
    pages.forEach((page) => {
      pageLabels[page.id] = page.label || "";
      const proRow = Array.isArray(proJson)
        ? proJson.find((row) => Number(row?.permissionId) === Number(page.id))
        : null;
      proAccessMap[page.id] = proRow?.proEnabled !== false;
    });

    return { roles, pages, permissions, rolePermissions, pageLabels, proAccessMap };
  }, [getAuthHeaders, localDomain]);

  const loadRemoteDomainData = useCallback(async (domain) => {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/admin/remote/permissions/bundle?domain=${encodeURIComponent(domain)}`,
      { headers: getAuthHeaders() }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "Ошибка загрузки удаленных прав");

    const roles = Array.isArray(json?.roles) ? json.roles : [];
    const permissions = Array.isArray(json?.permissions) ? json.permissions : [];
    const pagesRaw = Array.isArray(json?.pages) ? json.pages : [];
    const pages = pagesRaw.filter((page) => !shouldHidePermissionResource(page?.resource, domain));
    const rolePermissions = mapRolePermissionsByRole(roles, json?.rolePermissionsByRole || {});
    const pageLabels = {};
    const proAccessMap = {};
    pages.forEach((page) => {
      pageLabels[page.id] = page.label || "";
      const proRows = Array.isArray(json?.proAccess) ? json.proAccess : [];
      const proRow = proRows.find((row) => Number(row?.permissionId) === Number(page.id));
      proAccessMap[page.id] = proRow?.proEnabled !== false;
    });

    return { roles, pages, permissions, rolePermissions, pageLabels, proAccessMap };
  }, [getAuthHeaders]);

  const ensureDomainData = useCallback(async (domain, force = false) => {
    const normalized = normalizeDomainValue(domain);
    if (!normalized) return;
    if (!force) {
      const current = domainStateRef.current[normalized];
      if (current?.loaded || current?.loading) return;
    }

    setDomainState(normalized, { loading: true, error: null });
    try {
      const payload = normalized === localDomain
        ? await loadLocalDomainData()
        : await loadRemoteDomainData(normalized);
      setDomainState(normalized, { ...payload, loading: false, loaded: true, error: null });
    } catch (e) {
      setDomainState(normalized, {
        loading: false,
        loaded: true,
        error: String(e?.message || e || "Ошибка загрузки"),
      });
    }
  }, [localDomain, loadLocalDomainData, loadRemoteDomainData, setDomainState]);

  useEffect(() => {
    if (!token) return;
    ensureDomainData(localDomain, true);
  }, [token, localDomain, ensureDomainData]);

  useEffect(() => {
    if (!token || !isParentEnvironment) return;
    (async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/managed-domains`, {
          headers: getAuthHeaders(),
        });
        const data = await res.json().catch(() => ([]));
        if (!res.ok) return;
        const rows = Array.isArray(data) ? data : [];
        setManagedDomains(rows);
      } catch {}
    })();
  }, [token, isParentEnvironment, getAuthHeaders]);

  const visibleDomains = useMemo(() => {
    const base = [{ id: "local", domain: localDomain }];
    if (!isParentEnvironment) return base;
    const extra = (managedDomains || [])
      .map((r) => ({ id: r.id, domain: normalizeDomainValue(r?.domain) }))
      .filter((r) => r.domain && r.domain !== localDomain);
    return [...base, ...extra];
  }, [isParentEnvironment, localDomain, managedDomains]);

  const domainData = dataByDomain[selectedDomain] || {};
  const roles = domainData.roles || [];
  const pages = domainData.pages || [];
  const permissions = domainData.permissions || [];
  const rolePermissions = domainData.rolePermissions || {};
  const pageLabels = domainData.pageLabels || {};
  const proAccessMap = domainData.proAccessMap || {};
  const canEditPro = isParentEnvironment && selectedDomain !== localDomain;
  const isSuperAdminRole = (role) => String(role?.name || "").trim().toLowerCase() === "супер админ";
  const editableRoles = roles.filter((role) => !isSuperAdminRole(role));

  const patchRolePermissions = (roleId, updater) => {
    setDataByDomain((prev) => {
      const curr = prev[selectedDomain] || {};
      const currentSet = curr.rolePermissions?.[roleId] || new Set();
      const nextSet = new Set(currentSet);
      updater(nextSet);
      return {
        ...prev,
        [selectedDomain]: {
          ...curr,
          rolePermissions: {
            ...(curr.rolePermissions || {}),
            [roleId]: nextSet,
          },
        },
      };
    });
  };

  const persistRolePermissions = async (domain, roleId, allowedSet) => {
    const permissionsForRole = permissions.map((p) => p.id);
    const payload = permissionsForRole.map((permissionId) => ({
      roleId,
      permissionId,
      allowed: allowedSet.has(permissionId),
    }));

    const url = domain === localDomain
      ? `${process.env.NEXT_PUBLIC_API_URL}/admin/roles/${roleId}/permissions`
      : `${process.env.NEXT_PUBLIC_API_URL}/admin/remote/roles/${roleId}/permissions`;
    const body = domain === localDomain
      ? { permissions: payload }
      : { domain, permissions: payload };
    const res = await fetch(url, {
      method: "POST",
      headers: getAuthHeaders(true),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json?.error || "Ошибка сохранения прав роли");
    }
  };

  const persistProAccess = async (domain, permissionId, proEnabled) => {
    const normalized = normalizeDomainValue(domain);
    if (!normalized) throw new Error("Некорректный домен");
    const items = [{
      permissionId: Number(permissionId),
      proEnabled: Boolean(proEnabled),
    }];
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/remote/permissions/pro-access`, {
      method: "PUT",
      headers: getAuthHeaders(true),
      body: JSON.stringify({ domain: normalized, items }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json?.error || "Ошибка сохранения PRO");
    }
  };

  const handleCheckboxChange = async (roleId, permissionId) => {
    const currentSet = rolePermissions[roleId] || new Set();
    const nextSet = new Set(currentSet);
    if (nextSet.has(Number(permissionId))) nextSet.delete(Number(permissionId));
    else nextSet.add(Number(permissionId));

    patchRolePermissions(roleId, (set) => {
      set.clear();
      nextSet.forEach((id) => set.add(id));
    });
    try {
      await persistRolePermissions(selectedDomain, roleId, nextSet);
      toast.success("Сохранено");
    } catch (e) {
      toast.error(String(e?.message || e || "Ошибка сохранения"));
    }
  };

  const handleHeaderCheckboxChange = async (roleId, isChecked) => {
    const nextSet = new Set();
    if (isChecked) pages.forEach((page) => nextSet.add(Number(page.id)));
    patchRolePermissions(roleId, (set) => {
      set.clear();
      nextSet.forEach((id) => set.add(id));
    });
    try {
      await persistRolePermissions(selectedDomain, roleId, nextSet);
      toast.success("Сохранено");
    } catch (e) {
      toast.error(String(e?.message || e || "Ошибка сохранения"));
    }
  };

  const handleLabelChange = (pageId, value) => {
    setDataByDomain((prev) => {
      const curr = prev[selectedDomain] || {};
      return {
        ...prev,
        [selectedDomain]: {
          ...curr,
          pageLabels: {
            ...(curr.pageLabels || {}),
            [pageId]: value,
          },
        },
      };
    });
  };

  const handleLabelBlur = async (pageId) => {
    const page = pages.find((p) => p.id === pageId);
    if (!page) return;
    const label = (dataByDomain[selectedDomain]?.pageLabels || {})[pageId] || "";

    const url = selectedDomain === localDomain
      ? `${process.env.NEXT_PUBLIC_API_URL}/admin/permissions/${pageId}`
      : `${process.env.NEXT_PUBLIC_API_URL}/admin/remote/permissions/${pageId}`;
    const body = selectedDomain === localDomain
      ? { resource: page.resource, label }
      : { domain: selectedDomain, resource: page.resource, label };

    await fetch(url, {
      method: "PUT",
      headers: getAuthHeaders(true),
      body: JSON.stringify(body),
    });
  };

  const handleProToggle = async (pageId) => {
    if (!canEditPro) return;
    const currentValue = Boolean(proAccessMap[pageId]);
    const nextValue = !currentValue;
    let nextProMap = {};
    setDataByDomain((prev) => {
      const curr = prev[selectedDomain] || {};
      nextProMap = {
        ...(curr.proAccessMap || {}),
        [pageId]: nextValue,
      };
      const next = {
        ...prev,
        [selectedDomain]: {
          ...curr,
          proAccessMap: nextProMap,
        },
      };
      domainStateRef.current = next;
      return next;
    });
    try {
      await persistProAccess(selectedDomain, Number(pageId), nextValue);
      await ensureDomainData(selectedDomain, true);
      toast.success("Сохранено");
    } catch (e) {
      setDataByDomain((prev) => {
        const curr = prev[selectedDomain] || {};
        const rollback = {
          ...(curr.proAccessMap || {}),
          [pageId]: currentValue,
        };
        const next = {
          ...prev,
          [selectedDomain]: {
            ...curr,
            proAccessMap: rollback,
          },
        };
        domainStateRef.current = next;
        return next;
      });
      toast.error(String(e?.message || e || "Ошибка сохранения PRO"));
    }
  };

  return (
    <div style={{ overflow: "auto", maxHeight: "90vh" }}>
      <h1>Управление доступом к страницам</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {visibleDomains.map((row) => {
          const domain = normalizeDomainValue(row.domain);
          const active = domain === selectedDomain;
          return (
            <button
              key={`perm-tab-${row.id}-${domain}`}
              onClick={() => {
                setSelectedDomain(domain);
                ensureDomainData(domain);
              }}
              style={{
                border: "1px solid #d0d7de",
                borderRadius: 8,
                padding: "8px 12px",
                background: active ? "#1d4ed8" : "#f8fafc",
                color: active ? "#fff" : "#0f172a",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {domain}
            </button>
          );
        })}
      </div>

      {domainData.loading ? <div>Загрузка...</div> : null}
      {domainData.error ? <div style={{ color: "red", marginBottom: 10 }}>{domainData.error}</div> : null}

      <table className="tasks" border="1" style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
        <thead style={{ position: "sticky", top: 0, backgroundColor: "white", zIndex: 100 }}>
          <tr>
            <th>PRO</th>
            <th className="sticky">Страница</th>
            <th className="sticky">Путь</th>
            {editableRoles.map((role) => {
              const allSelected = pages?.length > 0 && pages.every((page) => rolePermissions[role.id]?.has(Number(page.id)));
              return (
                <th key={role.id}>
                  {role.name}
                  <br />
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => handleHeaderCheckboxChange(role.id, e.target.checked)}
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {[...pages]
            .sort((a, b) => {
              const labelA = (pageLabels[a.id] || a.resource || "").toLowerCase();
              const labelB = (pageLabels[b.id] || b.resource || "").toLowerCase();
              return labelA.localeCompare(labelB);
            })
            .map((page) => (
              <tr key={page.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={proAccessMap[page.id] !== false}
                    disabled={!canEditPro}
                    onChange={() => handleProToggle(Number(page.id))}
                  />
                </td>
                <td className="sticky">
                  <input
                    className="permissions_value"
                    type="text"
                    value={pageLabels[page.id] || ""}
                    onChange={(e) => handleLabelChange(page.id, e.target.value)}
                    onBlur={() => handleLabelBlur(page.id)}
                  />
                </td>
                <td className="sticky-second">{page.resource}</td>
                {editableRoles.map((role) => (
                  <td key={role.id}>
                    <input
                      type="checkbox"
                      checked={rolePermissions[role.id]?.has(Number(page.id)) || false}
                      onChange={() => handleCheckboxChange(role.id, Number(page.id))}
                    />
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

const db = require("../models");
const Permission = db.sequelize.models.Permission;
const fs = require("fs");
const path = require("path");
const RolePermission = db.sequelize.models.RolePermission;
const DomainPageAccess = db.sequelize.models.DomainPageAccess;

const parseIdSet = (raw, fallback = "") =>
  new Set(
    String(raw || fallback)
      .split(",")
      .map((x) => Number(String(x || "").trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
  );

const SUPER_ADMIN_ROLE_IDS = parseIdSet(process.env.SUPER_ADMIN_ROLE_IDS, "1");
const SUPER_ADMIN_USER_IDS = parseIdSet(process.env.SUPER_ADMIN_USER_IDS, "");

const isRequestSuperAdmin = (req) => {
  const uid = Number(req.user?.id || 0);
  const rid = Number(req.user?.roleId || 0);
  return SUPER_ADMIN_USER_IDS.has(uid) || SUPER_ADMIN_ROLE_IDS.has(rid);
};

const filterAdminUsersResource = (items, req) => items;
const PROTECTED_FROM_PRO_BLOCK_RESOURCES = new Set([
  "admin/permissions",
  "/admin/permissions",
]);
const isTrustedParentHost = (req) => {
  const allowedHosts = new Set(
    String(process.env.ADMIN_USERS_ALLOWED_HOSTS || "orderspace.ru,backup.orderspace.ru,test.orderspace.ru")
      .split(",")
      .map((v) => String(v || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const extractHost = (value) =>
    String(value || "")
      .split(",")[0]
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, "");
  if (req.adminUsersProxyOriginHost && allowedHosts.has(extractHost(req.adminUsersProxyOriginHost))) return true;
  const candidates = [
    req.headers?.host,
    req.headers?.["x-forwarded-host"],
    req.headers?.origin,
    req.headers?.referer,
  ];
  return candidates.some((v) => allowedHosts.has(extractHost(v)));
};

const getBlockedPermissionIdSet = async (req) => {
  if (isRequestSuperAdmin(req)) return new Set();
  if (isTrustedParentHost(req)) return new Set();
  const permissions = await Permission.findAll({
    attributes: ["id", "resource"],
  });
  const accessRows = await DomainPageAccess.findAll({
    attributes: ["permissionId", "proEnabled"],
  });

  const byId = new Map(
    permissions.map((p) => [Number(p.id), String(p.resource || "").trim().toLowerCase()])
  );
  const accessById = new Map(
    accessRows.map((r) => [Number(r.permissionId), Boolean(r.proEnabled)])
  );
  const byResource = new Map();
  for (const p of permissions) {
    const pid = Number(p.id);
    const resource = String(p.resource || "").trim().toLowerCase();
    if (!resource) continue;
    const enabled = accessById.has(pid) ? accessById.get(pid) : true;
    const prev = byResource.get(resource);
    // Effective rule by resource: if any duplicate is enabled -> enabled
    byResource.set(resource, prev === true ? true : Boolean(enabled));
  }

  const exemptPermissions = await Permission.findAll({
    where: {
      resource: Array.from(PROTECTED_FROM_PRO_BLOCK_RESOURCES),
    },
    attributes: ["id"],
  });
  const exemptIds = new Set(
    exemptPermissions.map((p) => Number(p.id)).filter((n) => Number.isFinite(n) && n > 0)
  );
  return new Set(
    permissions
      .map((p) => Number(p.id))
      .filter((id) => Number.isFinite(id) && id > 0)
      .filter((id) => !exemptIds.has(id))
      .filter((id) => {
        const resource = byId.get(id);
        if (!resource) return false;
        const effectiveEnabled = byResource.has(resource) ? byResource.get(resource) : true;
        return effectiveEnabled === false;
      })
  );
};


// Маршрут для получения разрешений для роли
const getAllRolePermissions = async (req, res) => {
  // console.log("Получен запрос на получение разрешений для роли:", req.params);
  try {
    const { roleId } = req.params;
    const blockedIds = await getBlockedPermissionIdSet(req);
    const permissions = await RolePermission.findAll({
      where: { roleId, allowed: true }, // Получаем только разрешенные
    });
    const filtered = blockedIds.size
      ? permissions.filter((row) => !blockedIds.has(Number(row.permissionId)))
      : permissions;

    // console.log("Отдаем RolePermission ??? = ", permissions)

    res.json(filtered);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка получения разрешений' });
  }
};




// Получаем список разрешений с базы
const getAllPermissionsFromPostgres = async (req, res) => {
  try {
    const blockedIds = await getBlockedPermissionIdSet(req);
    const permissions = await Permission.findAll(); // Получаем все разрешения
    const filtered = blockedIds.size
      ? permissions.filter((row) => !blockedIds.has(Number(row.id)))
      : permissions;
    // console.log("Отдаем права permissions = ", permissions)
    res.json(filterAdminUsersResource(filtered, req));
  } catch (error) {
    res.status(500).json({ message: 'Ошибка получения страниц' });
  }
};




// Получить все права
const getAllPermissions = async (req, res) => {
  try {
    const blockedIds = await getBlockedPermissionIdSet(req);
    const permissions = await Permission.findAll();
    const filtered = blockedIds.size
      ? permissions.filter((row) => !blockedIds.has(Number(row.id)))
      : permissions;
    res.json(filterAdminUsersResource(filtered, req));
  } catch (error) {
    console.error("Ошибка получения прав:", error);
    res.status(500).json({ message: "Ошибка получения прав" });
  }
};

// Создать новые права
const createPermission = async (req, res) => {
  try {
    const { pages } = req.body;

    if (!Array.isArray(pages)) {
      return res.status(400).json({ error: "Неверный формат данных" });
    }

    for (const { resource } of pages) {
      await Permission.findOrCreate({
        where: { resource },
        defaults: { label: "" } // label заполняется вручную позже
      });
    }

    res.json({ message: "Список страниц обновлён" });
  } catch (error) {
    console.error("Ошибка при обновлении списка страниц:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
};



// Эндпоинт для синхронизации страниц из структуры проекта
const syncPermission = async (req, res) => {
  try {
    const appDir = path.join(__dirname, "../../crm-fronend/src/app");
    const pages = getPages(appDir);

    for (const resource of pages) {
      const [perm] = await Permission.findOrCreate({
        where: { resource },
        defaults: { resource, label: "" },
      });
      await DomainPageAccess.findOrCreate({
        where: { permissionId: Number(perm.id) },
        defaults: { permissionId: Number(perm.id), proEnabled: true },
      });
    }

    const blockedIds = await getBlockedPermissionIdSet(req);
    const permissions = await Permission.findAll({ attributes: ["id", "resource", "label"] });
    const filtered = blockedIds.size
      ? permissions.filter((row) => !blockedIds.has(Number(row.id)))
      : permissions;
    res.json({ message: "Список страниц обновлён", pages: filterAdminUsersResource(filtered, req) });
  } catch (error) {
    console.error("Ошибка при синхронизации прав:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
};

// Рекурсивная функция для получения списка страниц
function getPages(dir, basePath = "") {
  // console.log("Запущена функция getPages с путем = ", dir)
  let pages = [];

  if (!fs.existsSync(dir)) {
    console.warn("Директория не найдена:", dir);
    return pages;
  }
  

  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      pages = pages.concat(getPages(fullPath, path.join(basePath, file)));
    } else if (file === "page.js") {
      // Добавляем найденную страницу. Если basePath пустой, возвращаем "/"
      pages.push(basePath || "/");
    }
  }

  return pages;
}






// Обновить право
const updatePermission = async (req, res) => {
  try {
    const { id } = req.params;
    const { resource, label } = req.body;

    const permission = await Permission.findByPk(id);
    if (!permission) {
      return res.status(404).json({ message: "Право не найдено" });
    }

    permission.resource = resource;
    if (label !== undefined) {
      permission.label = label; // Обновляем label только если он передан
    }
    await permission.save();

    res.json(permission);
  } catch (error) {
    console.error("Ошибка обновления права:", error);
    res.status(500).json({ message: "Ошибка обновления права" });
  }
};

// Удалить право
const deletePermission = async (req, res) => {
  try {
    const { id } = req.params;
    const permission = await Permission.findByPk(id);

    if (!permission) {
      return res.status(404).json({ message: "Право не найдено" });
    }

    await permission.destroy();
    res.json({ message: "Право удалено" });
  } catch (error) {
    console.error("Ошибка удаления права:", error);
    res.status(500).json({ message: "Ошибка удаления права" });
  }
};

const getProAccessByPermission = async (req, res) => {
  try {
    const permissions = await Permission.findAll({ attributes: ["id", "resource", "label"] });
    for (const p of permissions) {
      await DomainPageAccess.findOrCreate({
        where: { permissionId: Number(p.id) },
        defaults: { permissionId: Number(p.id), proEnabled: true },
      });
    }
    const accessRows = await DomainPageAccess.findAll({ attributes: ["permissionId", "proEnabled"] });
    const accessMap = new Map(
      accessRows.map((r) => [Number(r.permissionId), Boolean(r.proEnabled)])
    );
    const items = permissions.map((p) => ({
      permissionId: Number(p.id),
      resource: p.resource,
      label: p.label || "",
      proEnabled: accessMap.get(Number(p.id)) ?? true,
    }));
    res.json(items);
  } catch (error) {
    console.error("Ошибка получения PRO-доступа:", error);
    res.status(500).json({ error: "Ошибка получения PRO-доступа" });
  }
};

const updateProAccessByPermission = async (req, res) => {
  try {
    if (!isRequestSuperAdmin(req)) {
      return res.status(403).json({ error: "Только супер админ может изменять PRO-доступ" });
    }
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    for (const item of items) {
      const permissionId = Number(item?.permissionId);
      if (!Number.isFinite(permissionId) || permissionId <= 0) continue;
      const proEnabled = Boolean(item?.proEnabled);
      await DomainPageAccess.upsert({ permissionId, proEnabled });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error("Ошибка обновления PRO-доступа:", error);
    return res.status(500).json({ error: "Ошибка обновления PRO-доступа" });
  }
};

module.exports = {
  getAllPermissions,
  createPermission,
  updatePermission,
  deletePermission,
  syncPermission,
  getAllRolePermissions,
  getAllPermissionsFromPostgres,
  getProAccessByPermission,
  updateProAccessByPermission,
};

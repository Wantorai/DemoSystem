const db = require("../models");
const Role = db.sequelize.models.Role;
const User = db.sequelize.models.User;
const Permission = db.sequelize.models.Permission;
const RolePermission = db.sequelize.models.RolePermission;
const PermissionParam = db.sequelize.models.PermissionParam;
const RolePermissionParam = db.sequelize.models.RolePermissionParam;
const parseIdSet = (raw, fallback = "") =>
  new Set(
    String(raw || fallback)
      .split(",")
      .map((x) => Number(String(x || "").trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
  );

const SUPER_ADMIN_ROLE_IDS = parseIdSet(process.env.SUPER_ADMIN_ROLE_IDS, "1");
const SUPER_ADMIN_USER_IDS = parseIdSet(process.env.SUPER_ADMIN_USER_IDS, "");
const ADMIN_USERS_RESOURCES = ["/admin/users", "admin/users"];
const ADMIN_USERS_ALLOWED_HOSTS = new Set(
  String(process.env.ADMIN_USERS_ALLOWED_HOSTS || "orderspace.ru,backup.orderspace.ru,test.orderspace.ru")
    .split(",")
    .map((v) => String(v || "").trim().toLowerCase())
    .filter(Boolean)
);

const isRequestSuperAdmin = (req) => {
  const uid = Number(req.user?.id || 0);
  const rid = Number(req.user?.roleId || 0);
  return SUPER_ADMIN_USER_IDS.has(uid) || SUPER_ADMIN_ROLE_IDS.has(rid);
};

const extractHostName = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    const withProto = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
    return new URL(withProto).hostname.toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//, "").split("/")[0].split(":")[0].toLowerCase();
  }
};

const isRequestFromAllowedHost = (req) => {
  if (req.adminUsersProxyOriginHost && ADMIN_USERS_ALLOWED_HOSTS.has(extractHostName(req.adminUsersProxyOriginHost))) return true;
  const candidates = [
    req.get?.("x-forwarded-host"),
    req.get?.("host"),
    req.get?.("origin"),
    req.get?.("referer"),
    req.headers?.host,
  ].filter(Boolean);
  return candidates.some((v) => ADMIN_USERS_ALLOWED_HOSTS.has(extractHostName(v)));
};

function isProtectedSuperAdminRole(role) {
  const roleName = String(role?.name || "").trim().toLowerCase();
  return roleName === "супер админ" || roleName === "super admin";
}

const normalizeRoleName = (value) => String(value || "").trim().toLowerCase();
const isSuperAdminRoleName = (value) => {
  const roleName = normalizeRoleName(value);
  return roleName === "супер админ" || roleName === "super admin";
};
const isProtectedSuperAdminRoleById = (roleId) => SUPER_ADMIN_ROLE_IDS.has(Number(roleId || 0));

// Получить все роли
const getAllRoles = async (req, res) => {
  try {
    const roles = await Role.findAll({
      include: [
        {
          model: Permission,
          through: { attributes: ['allowed'] }
        },
        {
          model: PermissionParam,
          through: { attributes: ['allowed'] }
        }
      ]
    });
    res.json(roles);
  } catch (error) {
      res.status(500).json({ error: 'Ошибка при получении данных' });
  }
};


// Получить роль по ID
const getRoleById = async (req, res) => {
  try {
    const { id } = req.params;
    const role = await Role.findByPk(id, {
      include: [
        {
          model: Permission,
          through: { attributes: ['allowed'] }
        },
        {
          model: PermissionParam,
          through: { attributes: ['allowed'] }
        }
      ]
    });

    if (!role) {
      return res.status(404).json({ error: "Роль не найдена" });
    }
    

    res.json(role);
  } catch (error) {
    res.status(500).json({ error: "Ошибка при получении роли" });
  }
};



// Создать новую роль
const createRole = async (req, res) => {
  try {
    const { name, accessMonths = 2 } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Название роли обязательно" });
    }
    if (isSuperAdminRoleName(name) && !isRequestSuperAdmin(req)) {
      return res.status(403).json({ error: "Только супер админ может создавать роль Супер админ" });
    }
    const role = await Role.create({ name, accessMonths });
    res.status(201).json(role);
  } catch (error) {
    res.status(500).json({ error: "Ошибка при создании роли" });
  }
};

// Обновить роль
const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, accessMonths } = req.body;
    const role = await Role.findByPk(id);
    if (!role) {
      return res.status(404).json({ error: "Роль не найдена" });
    }
    if ((isProtectedSuperAdminRoleById(role.id) || isProtectedSuperAdminRole(role)) && !isRequestSuperAdmin(req)) {
      return res.status(403).json({ error: "Только супер админ может изменять роль Супер админ" });
    }
    if (name !== undefined && isSuperAdminRoleName(name) && !isRequestSuperAdmin(req)) {
      return res.status(403).json({ error: "Только супер админ может назначать имя Супер админ" });
    }
    role.name = name;
    if (accessMonths !== undefined) role.accessMonths = accessMonths;
    await role.save();
    res.json(role);
  } catch (error) {
    res.status(500).json({ error: "Ошибка при обновлении роли" });
  }
};

// Удалить роль
const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;
    const role = await Role.findByPk(id);
    if (!role) {
      return res.status(404).json({ error: "Роль не найдена" });
    }
    if (isProtectedSuperAdminRoleById(role.id) || isProtectedSuperAdminRole(role)) {
      return res.status(403).json({ error: "Роль Супер админ нельзя удалять" });
    }
    const usersWithRoleCount = await User.count({ where: { roleId: role.id } });
    if (usersWithRoleCount > 0) {
      return res.status(409).json({
        error: "Нельзя удалить роль: к ней привязаны пользователи. Сначала удалите или переназначьте их.",
        usersCount: usersWithRoleCount,
      });
    }
    await role.destroy();
    res.json({ message: "Роль удалена" });
  } catch (error) {
    res.status(500).json({ error: "Ошибка при удалении роли" });
  }
};





// Получить все доступные страницы (permissions)
const getAllPermissions  = async (req, res) => {
  try {
    const permissions = await Permission.findAll();
    res.json(permissions);
  } catch (error) {
    res.status(500).json({ error: "Ошибка при получении списка страниц" });
  }
};



// Получить права конкретной роли
const getRolePermissions = async (req, res) => {
  try {
    const { roleId } = req.params;

    const rolePermissions = await RolePermission.findAll({
      where: { roleId },
      include: [{ model: Permission, attributes: ["id", "resource"] }]
    });

    res.json(rolePermissions.map(rp => ({
      permissionId: rp.permissionId,
      resource: rp.resource,
      allowed: rp.allowed
    })));
  } catch (error) {
    console.error("Ошибка при получении прав роли:", error);
    res.status(500).json({ error: "Ошибка при получении прав роли" });
  }
};


// Обновить права доступа роли
const updateRolePermissions = async (req, res) => {
  try {
    const { roleId } = req.params;
    const { permissions } = req.body; // Ожидаем массив объектов [{ permissionId: 1, allowed: true }, ...]

    const role = await Role.findByPk(roleId, { attributes: ["id", "name"] });
    if (!role) {
      return res.status(404).json({ error: "Роль не найдена" });
    }
    if (isProtectedSuperAdminRole(role)) {
      return res.status(403).json({ error: "Права роли Супер админ нельзя изменять через этот endpoint" });
    }

    // console.log("Полученные данные:", permissions); // Отладка

    if (!permissions || !Array.isArray(permissions)) {
      return res.status(400).json({ error: "Неверный формат данных" });
    }

    // Удаляем старые права роли
    await RolePermission.destroy({ where: { roleId } });

    // Добавляем новые
    let payload = permissions;
    if (!isRequestSuperAdmin(req) && !isRequestFromAllowedHost(req)) {
      const protectedPermissions = await Permission.findAll({
        where: { resource: ADMIN_USERS_RESOURCES },
        attributes: ["id"],
      });
      const protectedIds = new Set(protectedPermissions.map((p) => Number(p.id)).filter((n) => Number.isFinite(n)));
      payload = permissions.map((perm) => (
        protectedIds.has(Number(perm.permissionId))
          ? { ...perm, allowed: false }
          : perm
      ));
    }

    const newPermissions = payload.map((perm) => ({
      roleId,
      permissionId: perm.permissionId,
      allowed: perm.allowed,
    }));

    await RolePermission.bulkCreate(newPermissions);

    res.json({ message: "Права обновлены" });
  } catch (error) {
    res.status(500).json({ error: "Ошибка при обновлении прав" });
  }
};



// Получить все доступные параметрами (permissions)
const getAllPermissionParams  = async (req, res) => {
  try {
    const permissionParams = await PermissionParam.findAll();
    res.json(permissionParams);
  } catch (error) {
    res.status(500).json({ error: "Ошибка при получении списка параметров" });
  }
};



// Получить права конкретной роли
const getRolePermissionParams = async (req, res) => {
  try {
    const { roleId } = req.params;

    const rolePermissionParams = await RolePermissionParam.findAll({
      where: { roleId },
      include: [{ model: PermissionParam, attributes: ["id", "param"] }]
    });

    res.json(rolePermissionParams.map(rp => ({
      permissionParamId: rp.permissionParamId,
      param: rp.param,
      allowed: rp.allowed,
      canEdit: rp.canEdit,
      canCheck: rp.canCheck
    })));
  } catch (error) {
    console.error("Ошибка при получении прав роли для параметров:", error);
    res.status(500).json({ error: "Ошибка при получении прав роли для параметров" });
  }
};




const updateRolePermissionParams = async (req, res) => {
  try {
    const { roleId } = req.params;
    const { permissionParams } = req.body; // [{ permissionId: 1, allowed: true }, ...]

    const role = await Role.findByPk(roleId, { attributes: ["id", "name"] });
    if (!role) {
      return res.status(404).json({ error: "Роль не найдена" });
    }
    if (isProtectedSuperAdminRole(role)) {
      return res.status(403).json({ error: "Права роли Супер админ нельзя изменять через этот endpoint" });
    }

    if (!permissionParams || !Array.isArray(permissionParams)) {
      return res.status(400).json({ error: "Неверный формат данных" });
    }

    // console.log("Полученные данные:", permissionParams);

    // Получаем все возможные permissionParamId из БД (чтобы добавить и false)
    const allPermissionParams = await PermissionParam.findAll({
      attributes: ["id"], // Предполагаем, что у PermissionParam есть id
    });

    // Преобразуем в Set для удобства проверки существующих permissionParamId
    // const existingIds = new Set(permissionParams.map((p) => p.permissionParamId));

    // Создаем полные данные, включая те, которые не пришли (false)
    const completePermissionParams = allPermissionParams.map(({ id }) => {
      const updatedPermission = permissionParams.find(p => p.permissionParamId === id);
      return {
        roleId,
        permissionParamId: id,
        allowed: updatedPermission ? updatedPermission.allowed : false, // Если в переданных данных есть, используем их, иначе false
        canEdit: updatedPermission ? updatedPermission.canEdit : false, // Если в переданных данных есть, используем их, иначе false
        canCheck: updatedPermission ? updatedPermission.canCheck : false, // Если в переданных данных есть, используем их, иначе false
      };
    });

    // console.log("Обновленные права:", completePermissionParams);

    // // Перебираем completePermissionParams и обновляем или добавляем только те записи, которые изменены
    // for (const permission of completePermissionParams) {
    //   const existingRecord = await RolePermissionParam.findOne({
    //     where: { roleId, permissionParamId: permission.permissionParamId },
    //   });

    //   if (existingRecord) {
    //     // Если запись существует, проверяем, отличается ли значение
    //     if (existingRecord.allowed !== permission.allowed) {
    //       // Обновляем запись только если значение отличается
    //       await existingRecord.update({ allowed: permission.allowed });
    //     }
    //   } else {
    //     // Если записи нет, создаем новую
    //     await RolePermissionParam.create(permission);
    //   }
    // }


    for (const permission of completePermissionParams) {
    // Гарантируем, что при disabled все сброшено
    if (!permission.allowed) {
      permission.canEdit = false;
      permission.canCheck = false;
    }

    // // Если и canEdit и canCheck установлены — убираем конфликт
    // if (permission.canEdit && permission.canCheck) {
    //   // Приоритет у canEdit
    //   permission.canCheck = false;
    // }

    const existingRecord = await RolePermissionParam.findOne({
      where: { roleId, permissionParamId: permission.permissionParamId },
    });

    // console.log("Проверяем existingRecord:", existingRecord);

    if (existingRecord) {
      const shouldUpdateAllowed = existingRecord.allowed !== permission.allowed;
      const shouldUpdateCanEdit = existingRecord.canEdit !== permission.canEdit;
      const shouldUpdateCanCheck = existingRecord.canCheck !== permission.canCheck;

      if (shouldUpdateAllowed || shouldUpdateCanEdit || shouldUpdateCanCheck) {
        await existingRecord.update({
          allowed: permission.allowed,
          canEdit: permission.allowed ? permission.canEdit : false,
          canCheck: permission.allowed ? permission.canCheck : false,
        });
      }
    } else {
      // Убедимся, что при создании новой записи они не конфликтуют
      const newRecord = {
        roleId,
        permissionParamId: permission.permissionParamId,
        allowed: permission.allowed,
        canEdit: permission.canEdit,
        canCheck: permission.canCheck,
      };

      if (newRecord.allowed && newRecord.canEdit && newRecord.canCheck) {
        // Приоритет у canEdit
        newRecord.canCheck = false;
      }

      await RolePermissionParam.create(newRecord);
    }
  }


    // for (const permission of completePermissionParams) {
    //   // На случай, если мы создаём новую запись,
    //   // если allowed === false, то устанавливаем canEdit = false
    //   if (!permission.allowed) {
    //     permission.canEdit = false;
    //   }
      
    //   const existingRecord = await RolePermissionParam.findOne({
    //     where: { roleId, permissionParamId: permission.permissionParamId },
    //   });
    
    //   if (existingRecord) {
    //     // Если запись существует, проверяем, отличаются ли allowed или (при allowed=true) canEdit.
    //     if (existingRecord.allowed !== permission.allowed) {
    //       // Обновляем allowed. Если новое allowed === false, то сбрасываем canEdit.
    //       await existingRecord.update({ 
    //         allowed: permission.allowed, 
    //         canEdit: permission.allowed ? permission.canEdit : false 
    //       });
    //     } else if (permission.allowed && existingRecord.canEdit !== permission.canEdit) {
    //       // Если allowed остается true, но изменилось canEdit — обновляем его.
    //       await existingRecord.update({ canEdit: permission.canEdit });
    //     }
    //   } else {
    //     // Если записи нет, создаем новую.
    //     await RolePermissionParam.create(permission);
    //   }
    // }
    

    res.json({ message: "Права обновлены" });
  } catch (error) {
    console.error("Ошибка при обновлении прав:", error);
    res.status(500).json({ error: "Ошибка при обновлении прав" });
  }
};




module.exports = {
  getAllRoles,
  getAllPermissions,
  getRolePermissions,
  updateRolePermissions,
  createRole,
  updateRole,
  deleteRole,
  getRoleById,
  getAllPermissionParams,
  getRolePermissionParams,
  updateRolePermissionParams
};



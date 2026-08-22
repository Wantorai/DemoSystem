const db = require("../models");
const PermissionParam = db.sequelize.models.PermissionParam;
const RolePermissionParam = db.sequelize.models.RolePermissionParam;


// Маршрут для получения разрешений для роли
const getAllRolePermissionParams = async (req, res) => {
  console.log("Получен запрос на получение параметров для роли:", req.params);
  try {
    const { roleId } = req.params;


    // Проверка на наличие и корректность roleId
    if (!roleId || roleId === 'undefined') {
      return res.status(400).json({ message: 'roleId is required' });
    }

    const roleIdInt = parseInt(roleId, 10);
    if (isNaN(roleIdInt)) {
      return res.status(400).json({ message: 'roleId must be a number' });
    }


    const permissions = await RolePermissionParam.findAll({
      where: { roleId: roleIdInt, allowed: true },
      attributes: ['roleId', 'permissionParamId', 'allowed', 'canEdit', 'canCheck'], // 👈 Явно указать поля!
      include: [
        {
          model: PermissionParam,
          attributes: ["id", "param", "label"],
        },
      ],
    });

    // console.log("Отдаем RolePermissionParam = ", permissions)

    const result = permissions.map((perm) => ({
      roleId: perm.roleId,
      permissionParamId: perm.permissionParamId,
      param: perm.PermissionParam.param, // Добавляем param
      label: perm.PermissionParam.label, // Добавляем label
      allowed: perm.allowed,
      canEdit: perm.canEdit || false,
      canCheck: perm.canCheck || false,
    }));

    //console.log("Отдаем права result = ", result)


    res.json(result);
  } catch (error) {
    console.error("Ошибка в getAllRolePermissionParams:", error);
    res.status(500).json({ message: 'Ошибка получения доступных параметров:', error: error.toString() });
  }
  
};




// Получаем список разрешений с базы
const getAllPermissionParamsFromPostgres = async (req, res) => {
  try {
    const permissionParams = await PermissionParam.findAll(); // Получаем все разрешения
    // console.log("Отдаем права permissionParams = ", permissionParams)
    res.json(permissionParams);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка получения параметров' });
  }
};




// Получить все права
const getAllPermissionParams = async (req, res) => {
  try {
    const permissionParams = await PermissionParam.findAll();
    res.json(permissionParams);
  } catch (error) {
    console.error("Ошибка получения прав:", error);
    res.status(500).json({ message: "Ошибка получения прав" });
  }
};

// Создать новые права
const createPermissionParam = async (req, res) => {
  try {
    const { params } = req.body;

    if (!Array.isArray(params)) {
      return res.status(400).json({ error: "Неверный формат данных" });
    }

    for (const { paramName, label } of params) {
        await PermissionParam.findOrCreate({
          where: { param: paramName },
          defaults: { label }, // Записываем label, если paramName новый
        });
      }

    res.json({ message: "Список параметров обновлён" });
  } catch (error) {
    console.error("Ошибка при обновлении списка параметров:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
};



// // Эндпоинт для синхронизации параметров из структуры проекта
// const syncPermissionParam = async (req, res) => {
//   try {
//     const params = await PermissionParam.findAll({ attributes: ["id", "param", "label"] });

//     for (const param of params) {
//       const exists = await PermissionParam.findOne({ where: { param } });

//       if (!exists) {
//         await PermissionParam.create({ param, label}); // label заполняется позже
//       }
//     }

//     const permissionParams = await PermissionParam.findAll({ attributes: ["id", "param", "label"] });
//     res.json({ message: "Список параметров обновлён", params: permissionParams });
//   } catch (error) {
//     console.error("Ошибка при синхронизации прав:", error);
//     res.status(500).json({ error: "Ошибка сервера" });
//   }
// };




// Обновить право
const updatePermissionParam = async (req, res) => {

  try {
    const { id } = req.params;
    const { label } = req.body;

    const permissionParam = await PermissionParam.findByPk(id);
    if (!permissionParam) {
      return res.status(404).json({ message: "Право не найдено" });
    }

    if (label !== undefined) {
        permissionParam.label = label; // Обновляем label только если он передан
    }
    await permissionParam.save();

    res.json(permissionParam);
  } catch (error) {
    console.error("Ошибка обновления права:", error);
    res.status(500).json({ message: "Ошибка обновления права" });
  }
};

// Удалить право
const deletePermissionParam = async (req, res) => {
  // console.log("Получен запрос на удаление параметра:", req.params);
  try {
    const { paramId } = req.params;

    await RolePermissionParam.destroy({ where: { permissionParamId: paramId } });
    await PermissionParam.destroy({ where: { id: paramId } });

    res.json({ message: "Параметр удалён" });
  } catch (error) {
    console.error("Ошибка при удалении параметра:", error);
    res.status(500).json({ error: "Ошибка при удалении" });
  }
};


// Получить одно право по ID
const getPermissionParamById = async (req, res) => {
  try {
    const { id } = req.params;
    const permissionParam = await PermissionParam.findByPk(id);

    if (!permissionParam) {
      return res.status(404).json({ message: "Параметр не найден" });
    }

    res.json(permissionParam);
  } catch (error) {
    console.error("Ошибка при получении параметра:", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};



module.exports = {
    getAllPermissionParams,
    createPermissionParam,
    updatePermissionParam,
    deletePermissionParam,
    //syncPermissionParam,
    getAllRolePermissionParams,
    getAllPermissionParamsFromPostgres,
    getPermissionParamById
};

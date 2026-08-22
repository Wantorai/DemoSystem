const db = require('../models');
const ConfigLink = db.sequelize.models.ConfigLink;
const RolePermission = db.sequelize.models.RolePermission;
const Permission = db.sequelize.models.Permission;

// const getConfigLinks = async (req, res,) => {
//   try {
//     const links = await ConfigLink.findAll();
//     // console.log("links = ", links)
//     return res.json(links);
//   } catch (error) {
//     return res.status(500).json({ error: error.message });
//   }
// }


async function getConfigLinks(req, res) {
  const roleId = req.query.roleId;

  if (!roleId) {
    return res.status(400).json({ message: 'Роль не указана' });
  }

  try {
    // Получаем разрешённые permissionId
    const rolePermissions = await RolePermission.findAll({
      where: { roleId, allowed: true },
    });

    if (!rolePermissions.length) {
      return res.json([]); // Нет разрешений — пустой список ссылок
    }

    const allowedPermissionIds = rolePermissions.map(p => p.permissionId);

    // Получаем разрешённые permissions
    const permissions = await Permission.findAll({
      where: { id: allowedPermissionIds },
    });

    // Получаем все configLinks
    const configLinks = await ConfigLink.findAll();

    // Функция нормализации путей
    const normalize = (str) => str.replace(/^\/+/, '').replace(/\\/g, '/');

    // Сопоставляем configLink.path и permission.resource
    const matchedLinks = configLinks.filter(link => {
      const linkPath = normalize(link.path);
      return permissions.some(p => normalize(p.resource) === linkPath);
    });

    return res.json(matchedLinks);
  } catch (err) {
    console.error('Ошибка в getConfigLinks:', err);
    return res.status(500).json({ message: 'Ошибка сервера' });
  }
}

const createConfigLinks = async (req, res) => {
  try {
    const { path, label } = req.body;  // Используем req.body для получения данных
    const link = await ConfigLink.create({ path, label });
    return res.json(link);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

const updateConfigLinks = async (req, res) => {
  try {
    const { id, label, style } = req.body;  // Используем req.body для получения данных
    const link = await ConfigLink.findByPk(id);
    if (!link) return res.status(404).json({ error: 'Ссылка не найдена' });

    link.label = label;
    link.style = style;
    await link.save();
    return res.json(link);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}


// Получение конфигурации по ID
const getConfigLinksByID = async (req, res) => {
  const { id } = req.params; // Получаем id из параметров запроса

  try {
    // Ищем запись в базе данных по id
    const configLink = await ConfigLink.findByPk(id); 

    if (!configLink) {
      return res.status(404).json({ message: 'Конфигурация не найдена' }); // Если конфигурация не найдена, отправляем 404
    }

    // Если конфигурация найдена, возвращаем ее
    res.json(configLink);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Ошибка сервера' }); // Если произошла ошибка на сервере
  }
};


module.exports = {
  getConfigLinks,
  createConfigLinks,
  updateConfigLinks,
  getConfigLinksByID
};

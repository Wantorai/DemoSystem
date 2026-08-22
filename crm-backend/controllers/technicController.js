const db = require('../models');
const Technic = db.sequelize.models.Technic;
const User = db.sequelize.models.User;
const Role = db.sequelize.models.Role;
const OrderLog = db.sequelize.models.OrderLog;
const { Op } = require('sequelize');

// Получение всех техников
const allTechnics = async (req, res) => {
    try {
      if (String(req.query.specReadyUsers || '') === 'true') {
        const specLogs = await OrderLog.findAll({
          where: {
            action: { [Op.iLike]: '%Спец%' },
            user: { [Op.ne]: '' },
          },
          attributes: ['user'],
          group: ['user'],
          order: [['user', 'ASC']],
        });
        const specLogAuthors = specLogs
          .map((log) => String(log.user || '').trim())
          .filter(Boolean);

        const roles = await Role.findAll({
          where: { name: { [Op.in]: ['Технолог', 'Конструктор'] } },
          attributes: ['id', 'name'],
        });
        const roleById = new Map(roles.map((role) => [Number(role.id), role.name]));
        const roleIds = roles.map((role) => role.id);

        const users = roleIds.length
          ? await User.findAll({
              where: {
                roleId: { [Op.in]: roleIds },
                isActive: true,
              },
              attributes: ['id', 'name', 'roleId'],
              order: [['name', 'ASC']],
            })
          : [];
        const usersByExactName = new Map(
          users.map((user) => [String(user.name || '').trim().toLowerCase(), user])
        );
        const technics = await Technic.findAll({
          attributes: ['id', 'name'],
          order: [['name', 'ASC']],
        });

        const optionsByName = new Map();
        specLogAuthors.forEach((author) => {
          const authorKey = author.toLowerCase();
          const exactUser = usersByExactName.get(authorKey);
          const prefixUser = exactUser || users.find((user) => {
            const userName = String(user.name || '').trim().toLowerCase();
            return userName && (authorKey.startsWith(`${userName} `) || authorKey === userName);
          });
          optionsByName.set(authorKey, {
            id: `name:${author}`,
            name: author,
            roleId: prefixUser?.roleId || null,
            roleName: prefixUser ? roleById.get(Number(prefixUser.roleId)) || '' : 'История',
            filterKind: 'user',
          });
        });

        users.forEach((user) => {
          const name = String(user.name || '').trim();
          if (!name) return;
          const key = name.toLowerCase();
          if (optionsByName.has(key)) return;
          optionsByName.set(key, {
            id: `name:${name}`,
            name,
            roleId: user.roleId,
            roleName: roleById.get(Number(user.roleId)) || '',
            filterKind: 'user',
          });
        });

        technics.forEach((technic) => {
          const name = String(technic.name || '').trim();
          if (!name) return;
          const key = name.toLowerCase();
          if (optionsByName.has(key)) return;
          optionsByName.set(key, {
            id: `name:${name}`,
            name,
            roleId: null,
            roleName: 'Технолог',
            filterKind: 'technic',
          });
        });

        return res.json(
          Array.from(optionsByName.values())
            .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'))
        );
      }

      const technics = await Technic.findAll({
        attributes: ['id', 'name', 'phone', 'userId', 'viewAll', 'viewAllCRM', 'color'], // Указываем только нужные атрибуты
      });
      if (String(req.query.includeConstructors || '') !== 'true') {
        return res.json(technics);
      }

      const constructorRole = await Role.findOne({
        where: { name: 'Конструктор' },
        attributes: ['id', 'name'],
      });
      if (!constructorRole) {
        return res.json(technics);
      }

      const technicUserIds = new Set(
        technics
          .map((technic) => Number(technic.userId))
          .filter((id) => Number.isFinite(id))
      );
      const constructors = await User.findAll({
        where: {
          roleId: constructorRole.id,
          isActive: true,
        },
        attributes: ['id', 'name', 'roleId'],
        order: [['name', 'ASC']],
      });
      const constructorOptions = constructors
        .filter((user) => !technicUserIds.has(Number(user.id)))
        .map((user) => ({
          id: `user:${user.id}`,
          name: user.name,
          roleId: user.roleId,
          filterKind: 'user',
        }));

      res.json([
        ...technics.map((technic) => ({
          ...technic.toJSON(),
          filterKind: 'technic',
        })),
        ...constructorOptions,
      ]);
    } catch (error) {
      console.error('Ошибка при получении техников:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };


  // Получение техника по ID
const getTechnicById = async (req, res) => {
    try {
      const { id } = req.params;
      const technic = await Technic.findByPk(id);
      if (!technic) {
        return res.status(404).json({ error: 'Техник не найден' });
      }
      res.json(technic);
    } catch (error) {
      console.error('Ошибка при получении техника:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };

  

  // Обновление информации о технике
const updateTechnic = async (req, res) => {
    const { id } = req.params;
    const { phone, viewAll, viewAllCRM, color } = req.body; // Получаем только нужные данные для обновления
  
    try {
      const technic = await Technic.findByPk(id);
      if (!technic) {
        return res.status(404).json({ error: 'Техник не найден' });
      }
  
      technic.phone = phone || technic.phone; // Обновляем телефон, если он был передан
      technic.viewAll = viewAll !== undefined ? viewAll : technic.viewAll; // Обновляем viewAll, если он был передан
      technic.viewAllCRM = viewAllCRM !== undefined ? viewAllCRM : technic.viewAllCRM; // Обновляем viewAllCRM, если он был передан
      technic.color = color || technic.color

      await technic.save(); // Сохраняем изменения
      res.status(200).json(technic); // Отправляем обновленные данные
    } catch (error) {
      console.error('Ошибка при обновлении техника:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };
  

module.exports = { updateTechnic, allTechnics, getTechnicById };

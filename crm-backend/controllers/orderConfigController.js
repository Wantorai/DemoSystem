const db = require('../models');
const OrderConfig = db.sequelize.models.OrderConfig;
const Addon = db.sequelize.models.Addon;
const Config = db.sequelize.models.Config;
const Order = db.sequelize.models.Order;
const OrderLog = db.sequelize.models.OrderLog;
const Technic = db.sequelize.models.Technic;
const User = db.sequelize.models.User;
const { Op, literal } = require('sequelize');

const resolveSpecReadyUserNames = async (filterValue, explicitName = '') => {
  const names = new Set();
  const directName = String(explicitName || '').trim();
  if (directName) names.add(directName);

  const raw = String(filterValue || '').trim();
  if (!raw) return Array.from(names);

  if (raw.startsWith('name:')) {
    const name = raw.slice(5).trim();
    if (name) names.add(name);
    return Array.from(names);
  }

  if (raw.startsWith('user:')) {
    const userId = Number(raw.slice(5));
    if (!Number.isFinite(userId)) return Array.from(names);
    const user = await User.findByPk(userId, { attributes: ['name'] });
    if (user?.name) names.add(user.name);
    return Array.from(names);
  }

  const technicId = Number(raw);
  if (!Number.isFinite(technicId)) return Array.from(names);
  const technic = await Technic.findByPk(technicId, { attributes: ['name', 'userId'] });
  if (!technic) return Array.from(names);

  if (technic.name) names.add(technic.name);
  if (technic.userId) {
    const user = await User.findByPk(technic.userId, { attributes: ['name'] });
    if (user?.name) names.add(user.name);
  }
  return Array.from(names);
};

const isSpecReadyCheckedLog = (action) => {
  const text = String(action || '');
  const lowerText = text.toLowerCase();
  return (
    lowerText.includes('спец') &&
    text.includes('активность') &&
    /\[false\][\s\S]*→[\s\S]*\[true\]/.test(text)
  );
};

const getSpecReadyUserFromData = (data) => {
  const value = data?.param19;
  if (!value) return '';

  if (Array.isArray(value)) {
    const checkedEntry = [...value].reverse().find((entry) => entry?.checked && entry?.user);
    return String(checkedEntry?.user || '').trim();
  }

  if (typeof value === 'object') {
    return String(value.user || '').trim();
  }

  return '';
};

const normalizeSpecReadyUserName = (value) => String(value || '').trim().toLowerCase();

const matchesSpecReadyUser = (readyUser, allowedSet) => {
  const normalizedReadyUser = normalizeSpecReadyUserName(readyUser);
  if (!normalizedReadyUser) return false;
  if (allowedSet.has(normalizedReadyUser)) return true;
  return Array.from(allowedSet).some((allowedName) => (
    allowedName &&
    (
      normalizedReadyUser.startsWith(`${allowedName} `) ||
      allowedName.startsWith(`${normalizedReadyUser} `)
    )
  ));
};

const buildSpecReadyUserByOrderId = async (orderConfigs) => {
  const directReadyUserByOrderId = new Map();
  const fallbackReadyUserByOrderId = new Map();
  orderConfigs.forEach((config) => {
    const readyUser = getSpecReadyUserFromData(config?.data);
    const orderId = Number(config?.order_id);
    if (readyUser && Number.isFinite(orderId)) {
      directReadyUserByOrderId.set(orderId, readyUser);
    }
  });

  const orderIds = [
    ...new Set(
      orderConfigs
        .map((config) => Number(config.order_id))
        .filter((id) => Number.isFinite(id) && !directReadyUserByOrderId.has(id))
    ),
  ];

  const readyUserByOrderId = new Map(directReadyUserByOrderId);
  if (orderIds.length) {
    const logs = await OrderLog.findAll({
      where: {
        order_id: { [Op.in]: orderIds },
        action: { [Op.iLike]: '%Спец%' },
      },
      order: [['timestamp', 'DESC']],
      attributes: ['order_id', 'action', 'user', 'timestamp'],
    });

    logs.forEach((log) => {
      const orderId = Number(log.order_id);
      if (!Number.isFinite(orderId) || readyUserByOrderId.has(orderId)) return;
      if (!isSpecReadyCheckedLog(log.action)) return;
      readyUserByOrderId.set(orderId, String(log.user || '').trim());
    });
  }

  const fallbackTechnicIds = [
    ...new Set(
      orderConfigs
        .filter((config) => !readyUserByOrderId.has(Number(config.order_id)))
        .map((config) => Number(config?.order?.data?.param7))
        .filter((id) => Number.isFinite(id))
    ),
  ];

  if (fallbackTechnicIds.length) {
    const technics = await Technic.findAll({
      where: { id: { [Op.in]: fallbackTechnicIds } },
      attributes: ['id', 'name'],
    });
    const technicNameById = new Map(
      technics.map((technic) => [Number(technic.id), technic.name])
    );

    orderConfigs.forEach((config) => {
      const orderId = Number(config.order_id);
      if (!Number.isFinite(orderId) || readyUserByOrderId.has(orderId)) return;
      const technicId = Number(config?.order?.data?.param7);
      const technicName = technicNameById.get(technicId);
      if (!technicName) return;
      readyUserByOrderId.set(orderId, technicName);
      fallbackReadyUserByOrderId.set(orderId, technicName);
    });
  }

  return { readyUserByOrderId, directReadyUserByOrderId, fallbackReadyUserByOrderId };
};

const buildSpecReadyDebugSummary = (orderConfigs, readyUserByOrderId, debugMonth = '') => {
  const selectedMonth = String(debugMonth || '').trim();
  const checkedByMonthAuthorCounts = {};
  const checkedWithoutReadyUserExamples = [];
  let checkedCount = 0;

  orderConfigs.forEach((config) => {
    const spec = config?.data?.param19;
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return;
    if (spec.checked !== true && spec.checked !== 'true') return;
    const date = String(spec.date || '').trim();
    if (!date) return;

    checkedCount += 1;
    const month = date.slice(0, 7);
    const readyUser = readyUserByOrderId.get(Number(config.order_id)) || '';
    const authorKey = readyUser || 'Автор не найден';
    checkedByMonthAuthorCounts[month] = checkedByMonthAuthorCounts[month] || {};
    checkedByMonthAuthorCounts[month][authorKey] = (checkedByMonthAuthorCounts[month][authorKey] || 0) + 1;

    const includeAsExample = !selectedMonth || month === selectedMonth;
    if (!readyUser && includeAsExample && checkedWithoutReadyUserExamples.length < 50) {
      checkedWithoutReadyUserExamples.push({
        order_id: config.order_id,
        param19: spec,
      });
    }
  });

  return {
    checkedCount,
    checkedByMonthAuthorCounts,
    checkedWithoutReadyUserExamples,
  };
};


const getAllOrderConfigs = async (req, res) => {
  try {
    const { order_id, addonId, technologistId, specReadyUserFilter, specReadyUserName, specReadyDebug, specReadyDebugMonth } = req.query; // Получаем параметры из запроса

    let whereClause = {}; // Условие для фильтрации
    const orderInclude = {
      model: Order,
      as: 'order',
      attributes: ['id', 'data'],
    };

    // Добавляем фильтрацию по order_id, если он указан
    if (order_id) {
      whereClause.order_id = order_id;
    }

    // Добавляем фильтрацию по addonId, если он указан
    if (addonId) {
      whereClause.addon_id = addonId;
    }

    if (technologistId && !specReadyUserFilter) {
      orderInclude.required = true;
      orderInclude.where = literal(`"order"."data"->>'param7' = ${db.sequelize.escape(String(technologistId))}`);
    }

    // Получаем объекты конфигурации с учетом фильтров
    let orderConfigs = await OrderConfig.findAll({ 
      where: whereClause,
      include: [
        {
          model: Addon, // Модель, связанная через addon_id
          as: 'addon',  // Алиас, если настроен в ассоциации
        },
        orderInclude,
      ], 
    });

    if (specReadyUserFilter) {
      const allowedUsers = await resolveSpecReadyUserNames(specReadyUserFilter, specReadyUserName);
      if (!allowedUsers.length) {
        if (specReadyDebug) {
          return res.status(200).json({
            debug: true,
            reason: 'allowedUsers empty',
            specReadyUserFilter,
            specReadyUserName,
            beforeCount: orderConfigs.length,
            afterCount: 0,
            allowedUsers,
          });
        }
        return res.status(200).json([]);
      }

      const { readyUserByOrderId, directReadyUserByOrderId, fallbackReadyUserByOrderId } = await buildSpecReadyUserByOrderId(orderConfigs);

      const allowedSet = new Set(allowedUsers.map(normalizeSpecReadyUserName));
      const beforeFilterCount = orderConfigs.length;
      const authorsCount = {};
      const matchedExamples = [];
      const missedExamples = [];
      orderConfigs = orderConfigs.filter((config) => {
        const readyUser = readyUserByOrderId.get(Number(config.order_id));
        if (readyUser) {
          authorsCount[readyUser] = (authorsCount[readyUser] || 0) + 1;
        }
        const matched = matchesSpecReadyUser(readyUser, allowedSet);
        const example = {
          order_id: config.order_id,
          readyUser: readyUser || '',
          param19: config?.data?.param19 ?? null,
        };
        if (matched && matchedExamples.length < 10) matchedExamples.push(example);
        if (!matched && missedExamples.length < 10) missedExamples.push(example);
        return matched;
      });

      if (specReadyDebug) {
        const debugSummary = buildSpecReadyDebugSummary(orderConfigs, readyUserByOrderId, specReadyDebugMonth);
        const afterCheckedDateCounts = {};
        let afterCheckedCount = 0;
        const afterCheckedExamples = [];
        orderConfigs.forEach((config) => {
          const spec = config?.data?.param19;
          if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return;
          if (spec.checked !== true && spec.checked !== 'true') return;
          const date = String(spec.date || '').trim();
          if (!date) return;
          afterCheckedCount += 1;
          afterCheckedDateCounts[date] = (afterCheckedDateCounts[date] || 0) + 1;
          if (afterCheckedExamples.length < 10) {
            afterCheckedExamples.push({
              order_id: config.order_id,
              readyUser: readyUserByOrderId.get(Number(config.order_id)) || '',
              param19: spec,
            });
          }
        });

        return res.status(200).json({
          debug: true,
          specReadyUserFilter,
          specReadyUserName,
          allowedUsers,
          allowedNormalized: Array.from(allowedSet),
          beforeCount: beforeFilterCount,
          afterCount: orderConfigs.length,
          directReadyUsersCount: directReadyUserByOrderId.size,
          fallbackReadyUsersCount: fallbackReadyUserByOrderId.size,
          readyUsersCount: readyUserByOrderId.size,
          afterCheckedCount,
          afterCheckedDateCounts,
          afterCheckedExamples,
          checkedByMonthAuthorCounts: debugSummary.checkedByMonthAuthorCounts,
          checkedWithoutReadyUserExamples: debugSummary.checkedWithoutReadyUserExamples,
          authorsCount,
          matchedExamples,
          missedExamples,
        });
      }
    }

    if (specReadyDebug) {
      const { readyUserByOrderId, directReadyUserByOrderId, fallbackReadyUserByOrderId } = await buildSpecReadyUserByOrderId(orderConfigs);
      const summary = buildSpecReadyDebugSummary(orderConfigs, readyUserByOrderId, specReadyDebugMonth);
      return res.status(200).json({
        debug: true,
        specReadyUserFilter: specReadyUserFilter || '',
        specReadyUserName: specReadyUserName || '',
        beforeCount: orderConfigs.length,
        directReadyUsersCount: directReadyUserByOrderId.size,
        fallbackReadyUsersCount: fallbackReadyUserByOrderId.size,
        readyUsersCount: readyUserByOrderId.size,
        ...summary,
      });
    }

    res.status(200).json(orderConfigs);
  } catch (error) {
    console.error("Error fetching orderConfigs:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


// Для обновления параметров если готовоность уже создана
const getDefaultForType = (type) => {
  if (!type) return '';
  if (type.includes('text_date') || type.includes('text_date_admin')) {
    return { text: '', date: '' };
  }
  if (type.startsWith('check')) {
    // для чеков часто удобно хранить { checked: false, date: '' }
    return { checked: false, date: '' };
  }
  if (type === 'number') return 0; // или '' по твоему желанию
  if (type === 'list') return ''; // или null
  if (type === 'date') return '';
  if (type === 'string') return '';
  return ''; // fallback
};






// Получить объект конфигурации по ID
const getOrderConfigById = async (req, res) => {
//  console.log("Вызвана функция getOrderConfigById из orderConfigController");

  const { id } = req.params; // Получаем ID из URL
  try {
    const orderConfig = await OrderConfig.findOne({
      where: { id }, // Используем параметр id для поиска записи
      attributes: ['id', 'addon_id', 'data', 'order_id'], // Указываем, какие поля нам нужны
      include: [
        {
          model: Addon, // Модель, связанная через addon_id
          as: 'addon',  // Алиас, если настроен в ассоциации
        },
      ], 
    });

    if (!orderConfig) {
      return res.status(404).json({ error: 'Бэкенд: объект конфигурации не найден' }); // Если не найдено
    }


    // Загрузка всех addonConfigs для данного addon_id
    const addonConfigs = await Config.findAll({
      where: { configId: orderConfig.addon_id }, // или column name в модели
      attributes: ['paramName', 'type', 'sorting'],
      raw: true,
    });

    // Построим defaults map: { paramName: defaultValue }
    const defaults = {};
    addonConfigs.forEach(cfg => {
      defaults[cfg.paramName] = getDefaultForType(cfg.type);
    });

    // Сливаем: дефолты <- существующие значения (существующие перезапишут дефолты)
    const mergedData = { ...defaults, ...(orderConfig.data || {}) };

    // Возвращаем копию объекта с подмешанными полями (без записи в БД)
    const result = {
      ...orderConfig.toJSON ? orderConfig.toJSON() : orderConfig,
      data: mergedData,
    };


    return res.json(result); // Если найдено, отправляем данные
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};





// Создать новый объект конфигурации
const createOrderConfig = async (req, res) => {
  try {
      const { data, order_id, config_id, addon_id } = req.body; // Получаем данные и ID заказа

      // Проверяем, что order_id и data присутствуют
      if (!order_id || !data) {
        return res.status(400).send("Недостающие поля: order_id или data");
      }

      const orderConfig = await OrderConfig.create({
        order_id: req.body.order_id,
        addon_id: req.body.addon_id,
        config_id: req.body.config_id || null,
        data: req.body.data || null, // Если пусто, явно ставим null
      });

      res.status(201).json(orderConfig);
  } catch (error) {
      console.error('Ошибка при создании объекты конфигурации:', error);
      res.status(500).json({ error: 'Ошибка при создании объекты конфигурации' });
  }
};


// Обновить объект конфигурации
const updateOrderConfig = async (req, res) => {
    try {
      const { id } = req.params;
      const updatedData = req.body;
  
      // // Обновляем объект конфигурации
      // const [updated] = await OrderConfig.update(updatedData, { where: { id } });
  
      // if (!updated) {
      //   return res.status(404).json({ message: "OrderConfig not found" });
      // }

      // 1) Находим существующую запись
      const cfg = await OrderConfig.findByPk(id);
      if (!cfg) return res.status(404).json({ message: "OrderConfig not found" });

      // console.log("updatedData =", updatedData)
      // console.log("updatedData.data =", updatedData.data)

      // 2) Если пришёл кусок `data`, то мёржим его
      if (updatedData.data) {
        cfg.data = {
          ...cfg.data,
          ...updatedData.data
        };
      }



      // 3) Сохраняем
      await cfg.save();
      res.status(200).json(cfg);

      // const updatedOrderConfig = await OrderConfig.findByPk(id);
      // res.status(200).json(updatedOrderConfig);
    } catch (error) {
      console.error("Error updating orderConfig:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  };
  

// Удалить объект конфигурации
const deleteOrderConfig = async (req, res) => {
    const { id } = req.params;

    try {
        const orderConfig = await OrderConfig.findByPk(id);
        if (!orderConfig) {
            return res.status(404).json({ error: 'OrderConfig not found' });
        }

        await orderConfig.destroy(); // Удаляем объект конфигурации из базы данных
        res.status(200).json({ message: 'OrderConfig deleted successfully' });
    } catch (error) {
        console.error('Error deleting orderConfig:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};



module.exports = { 
    getAllOrderConfigs, 
    getOrderConfigById, 
    createOrderConfig, 
    updateOrderConfig, 
    deleteOrderConfig  
};

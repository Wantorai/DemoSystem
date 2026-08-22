// controllers/configController.js

const db = require("../models");
const Config = db.sequelize.models.Config;
const Configs = db.sequelize.models.Configs;



// Инициализация конфигурации
const initConfig = async (req, res) => {
  const { addonId } = req.params;

  if (!addonId) {
    return res.status(400).json({ error: "Не указан addonId." });
  }

  try {
    // Получаем или создаем конфигурацию
    const [config, created] = await Configs.findOrCreate({
      where: { addonId },
      defaults: { addonId },
    });

    return res.status(200).json({ configId: config.id });
  } catch (error) {
    console.error("Ошибка при инициализации конфигурации:", error);
    return res.status(500).json({ error: "Ошибка при инициализации конфигурации." });
  }
};




// // Логика для сохранения параметров конфига
// const saveConfig = async (req, res) => {
//   const { addonId } = req.params;
//   const { params } = req.body;

//     // Преобразуем addonId в число
//     const parsedAddonId = parseInt(addonId, 10);

//     console.log("Полученный addonId:", parsedAddonId);
//     console.log("Полученные параметры:", params);

//   if (!parsedAddonId || !Array.isArray(params) || params.length === 0) {
//     return res.status(400).json({ error: "Не указаны необходимые данные." });
//   }

//   try {

//     // Фильтруем только валидные параметры
//     const validParams = params.filter(
//       (param) => param.paramName && param.label && param.type
//     );

//     // console.log("Валидные параметры:", validParams);

//     if (validParams.length === 0) {
//       return res
//         .status(400)
//         .json({ error: "Нет валидных параметров для сохранения." });
//     }


//     // Создание или обновление конфигурации
//     const [config] = await Configs.findOrCreate({
//       where: { addonId: parsedAddonId },
//       defaults: { addonId: parsedAddonId },
//     });

//     // console.log("Созданная/найденная конфигурация:", config);

//     // Разделяем параметры на два массива: новые и существующие
//     const existingParams = validParams.filter((param) => param.id);

//     // console.log("Существующие параметры:", existingParams);

//     const newParams = validParams.filter((param) => !param.id);

//     // console.log("Новые параметры:", newParams);

//     // Обновляем существующие параметры
//     for (const param of existingParams) {
//       await Config.update(
//         { ...param },
//         { where: { id: param.id, configId: config.id } }
//       );
//     }

//     // Добавляем новые параметры
//     const paramsToCreate = newParams.map((param) => ({
//       ...param,
//       configId: config.id,
//     }));
//     await Config.bulkCreate(paramsToCreate);

//     return res.status(200).json({ message: "Конфигурация успешно сохранена.", params: validParams });
//   } catch (error) {
//     console.error("Ошибка при сохранении конфигурации:", error);
//     return res.status(500).json({ error: "Ошибка при сохранении конфигурации." });
//   }
// };



const saveConfig = async (req, res) => {
  const { addonId } = req.params;
  const { params } = req.body;

  // console.log('addonId:', addonId);
  // console.log('params:', params);

  const parsedAddonId = parseInt(addonId, 10);

  // if (!parsedAddonId || !Array.isArray(params) || params.length === 0) {
  //   return res.status(400).json({ error: "Не указаны необходимые данные." });
  // }

  try {
    // Получаем или создаем конфигурацию
    const [config] = await Configs.findOrCreate({
      where: { addonId: parsedAddonId },
      defaults: { addonId: parsedAddonId },
    });

    // Загружаем существующие параметры из БД
    const existingParams = await Config.findAll({ where: { configId: config.id } });

    // Создаём Map для быстрого поиска по paramName
    const existingParamsMap = new Map(existingParams.map(param => [param.paramName, param]));

    // Разделяем параметры
    const paramsToUpdate = [];
    const paramsToCreate = [];

    for (const param of params) {
      if (existingParamsMap.has(param.paramName)) {
        // Если параметр уже есть, обновляем его
        paramsToUpdate.push({ ...param, id: existingParamsMap.get(param.paramName).id });
      } else {
        // Если нет, добавляем в новые
        paramsToCreate.push({ ...param, configId: config.id });
      }
    }

    // Обновляем существующие параметры
    for (const param of paramsToUpdate) {
      await Config.update(param, { where: { id: param.id, configId: config.id } });
    }

    // Создаем новые параметры
    if (paramsToCreate.length > 0) {
      await Config.bulkCreate(paramsToCreate);
    }

    // Возвращаем обновленные параметры
    const updatedParams = await Config.findAll({ where: { configId: config.id } });

    return res.status(200).json({ message: "Конфигурация успешно сохранена.", params: updatedParams });
  } catch (error) {
    console.error("Ошибка при сохранении конфигурации:", error);
    return res.status(500).json({ error: "Ошибка при сохранении конфигурации." });
  }
};




const getConfigParamByAddonId = async (req, res) => {

//  console.log("Вызвана функция getConfigParamByAddonId из configController");

  const { addonId } = req.params;

  try {
    // Ищем конфигурацию и связанные параметры
    const config = await Configs.findOne({
      where: { addonId },
      include: [
        {
          model: Config, // Указываем связанную модель
          as: "params", // Alias из ассоциации
        },
      ],
    });

    if (!config) {
      return res.status(404).json({ message: "Конфигурация не найдена." });
    }

    // Возвращаем конфигурацию и связанные параметры
    //console.log('Полученная конфигурация:', config);
    // return res.status(200).json(config.Configs); // Только связанные параметры
    // return res.status(200).json(config ? config.params : {});
    return res.status(200).json({ params: config.params });

  } catch (error) {
    console.error("Ошибка при получении конфигурации:", error);
    return res.status(500).json({ error: "Ошибка сервера." });
  }
};






// Получить всe конфигурации
const getAllConfigs = async (req, res) => {

  try {
    const configs = await Config.findAll();
    res.json(configs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ошибка получения параметров конфигурации" });
  }
};



// Создать новый параметр
const createConfig = async (req, res) => {

  const { paramName, label, type, source, width, newLabel, active} = req.body;

  try {
    const newConfig = await Config.create({
      paramName,
      label,
      type,
      source,
      width, 
      newLabel, 
      active
    });
    res.status(201).json(newConfig);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ошибка создания параметра конфигурации" });
  }
};



// Обновить параметр
const updateConfig = async (req, res) => {
  const { id } = req.params;
  const { paramName, label, type, source, width, newLabel, active } = req.body;

  // console.log("Обновление параметра конфигурации:", { id, paramName, label, type, source });

  try {
    const config = await Config.findByPk(id);

    if (!config) {
      return res.status(404).json({ error: "Параметр конфигурации не найден" });
    }

    await config.update({ paramName, label, type, source, width, newLabel, active });
    res.json(config);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ошибка обновления параметра конфигурации" });
  }
};



// Удалить параметр
const deleteConfig = async (req, res) => {
  const { id } = req.params;

  try {
    const config = await Config.findByPk(id);

    if (!config) {
      return res.status(404).json({ error: "Параметр конфигурации не найден" });
    }

    await config.destroy();
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ошибка удаления параметра конфигурации" });
  }
};




// Обновить порядок параметров
const updateOrder = async (req, res) => {
  const { id } = req.params;
  const { data } = req.body; // Массив объектов { id, order }

  try {
    await Promise.all(
      data.map(async ({ id, sorting }) => {
        const config = await Config.findOne({ where: { id } });
        if (config) {
          await config.update({ sorting });
        }
      })
    );
    res.json({ message: "Порядок параметров успешно обновлен" });
  } catch (error) {
    console.error("Ошибка при обновлении порядка:", error);
    res.status(500).json({ error: "Не удалось обновить порядок" });
  }
};


// Обновить параметры конфигурации аддона
const updateAddonConfigParams = async (req, res) => {
  try {
    const addonId = parseInt(req.params.addonId, 10);
    const { params } = req.body;

    if (!addonId || !Array.isArray(params)) {
      return res.status(400).json({ message: 'Некорректные данные' });
    }

    // Получаем или создаём Configs
    const [config] = await Configs.findOrCreate({
      where: { addonId },
      defaults: { addonId },
    });

    const configId = config.id;

    // console.log('configId:', configId);

    const existingParams = await Config.findAll({ where: { configId } });
    const existingIds = new Set(existingParams.map(p => p.id));

    const incomingIds = new Set(params.map(p => p.id).filter(Boolean));

    // Обновляем и создаём
    for (const param of params) {
      const { id, paramName, label, type, source, sorting, width, newLabel, active } = param;

      if (id && existingIds.has(id)) {
        await Config.update(
          { paramName, label, type, source, sorting, width, newLabel, active },
          { where: { id, configId } }
        );
      } else {
        await Config.create({
          paramName,
          label,
          type,
          source,
          sorting,
          configId,
          width, 
          newLabel, 
          active
        });
      }
    }

    // Удаляем отсутствующие
    await Config.destroy({
      where: {
        configId,
        id: [...existingIds].filter(id => !incomingIds.has(id)),
      },
    });

    const updated = await Config.findAll({ where: { configId } });

    res.json({ message: 'Обновлено', params: updated });
  } catch (error) {
    console.error('Ошибка при обновлении параметров:', error);
    res.status(500).json({ message: 'Ошибка при обновлении параметров' });
  }
};


module.exports = {
  getAllConfigs,
  createConfig,
  updateConfig,
  deleteConfig,
  updateOrder,
  saveConfig,
  initConfig,
  getConfigParamByAddonId,
  updateAddonConfigParams
};

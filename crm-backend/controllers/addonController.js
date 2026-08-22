// controllers/addonController.js
const db = require('../models');
const Addon = db.sequelize.models.Addon;
// const Config = db.sequelize.models.Config;



// Получить все надстройки
const getAllAddons = async (req, res) => {
  try {
    const addons = await Addon.findAll({
      // include: [
      //   { model: Config, as: 'config' }, // Присоединяем конфигурацию
      // ],
    });
    res.json(addons);
  } catch (error) {
    console.error('Ошибка получения надстроек:', error);
    res.status(500).json({ message: 'Ошибка получения надстроек' });
  }
};





// Создать надстройку
const createAddon = async (req, res) => {
  try {
    const { name, description, configId, defaultLoad } = req.body;

    const newAddon = await Addon.create({
      name,
      description,
      configId: configId || null, // Если configId не указан, сохраняем как null
      defaultLoad: defaultLoad !== undefined ? defaultLoad : false, // Если defaultLoad не указан, сохраняем как false
    });

    res.status(201).json(newAddon);
  } catch (error) {
    console.error('Ошибка создания надстройки:', error);
    res.status(500).json({ message: 'Ошибка создания надстройки' });
  }
};



// Получить надстройку по ID
const getAddonById = async (req, res) => {
  try {
    const { id  } = req.params;

    const addon = await Addon.findByPk(id , {
      // include: [{ model: Config, as: 'config' }],
    });

    if (!addon) {
      return res.status(404).json({ message: 'Надстройка не найдена' });
    }

    return res.status(200).json(addon);
  } catch (error) {
    console.error('Ошибка получения надстройки:', error);
    res.status(500).json({ message: 'Ошибка получения надстройки' });
  }
};




// Обновить надстройку
const updateAddon = async (req, res) => {

  // console.log('Запускаем обновление updateAddon');
  // console.log("Запрос на обновление. req.params:", req.params);
  // console.log("Запрос на обновление. req.body:", req.body);

  try {
    const { id: addonId } = req.params; // ID надстройки

    const { name, description, configId, defaultLoad  } = req.body;

    const addon = await Addon.findByPk(addonId);

    if (!addon) {
      return res.status(404).json({ message: 'Надстройка не найдена' });
    }

    // console.log('defaultLoad перед обновлением:', typeof defaultLoad, defaultLoad);

    // Обновляем данные
    addon.name = name || addon.name;
    addon.description = description || addon.description;
    addon.configId = configId || addon.configId;
    addon.defaultLoad = defaultLoad !== undefined ? defaultLoad : addon.defaultLoad; // Обновляем defaultLoad

    await addon.save();
    // console.log('Надстройка обновлена:', addon);
    res.json(addon);
  } catch (saveError) {
    console.error('Ошибка при сохранении обновленной надстройки:', saveError);
    res.status(500).json({ message: 'Ошибка при сохранении обновленной надстройки' });
  }
};

// Удалить надстройку
const deleteAddon = async (req, res) => {
  try {
    const { id } = req.params;

    const addon = await Addon.findByPk(id);

    if (!addon) {
      return res.status(404).json({ message: 'Надстройка не найдена' });
    }

    await addon.destroy();
    res.json({ message: 'Надстройка успешно удалена' });
  } catch (error) {
    console.error('Ошибка удаления надстройки:', error);
    res.status(500).json({ message: 'Ошибка удаления надстройки' });
  }
};

module.exports = {
  getAllAddons,
  createAddon,
  getAddonById,
  updateAddon,
  deleteAddon,
};

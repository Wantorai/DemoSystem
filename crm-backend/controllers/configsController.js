// controllers/configsController.js

const db = require("../models");
const Configs = db.sequelize.models.Configs;
const Config = db.sequelize.models.Config;


// Получить всe конфигурации
const getConfigByAddonId = async (req, res) => {

//  console.log("Вызвана функция из configsController");

  const { addonId } = req.params;

//  console.log("addonId = ", addonId);

  try {
    const config = await Configs.findOne({
      where: { addonId },
      include: [
        {
          model: Config, // Модель параметров
          as: "params", // Убедись, что это имя ассоциации
        },
      ],
    });

    if (!config) {
      return res.status(404).json({ message: "Конфигурация не найдена." });
    }

    return res.status(200).json(config); // Возвращаем конфигурацию с параметрами
  } catch (error) {
    console.error("Ошибка при получении конфигурации:", error);
    return res.status(500).json({ error: "Ошибка сервера." });
  }
};




// Создать сохраненную конфигурацию
const createConfigData = async (req, res) => {
  
  const { addonId } = req.params;
  const { data } = req.body;

  try {
    const newConfig = await Configs.create({
      data,
      addonId,
    });
    res.status(201).json(newConfig);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ошибка создания сохраненной конфигурации" });
  }
};



// Обновить сохраненную конфигурацию
const updateConfigData = async (req, res) => {
  const { id } = req.params;
  const { data } = req.body;

  try {
    const config = await Configs.findByPk(id);

    if (!config) {
      return res.status(404).json({ error: "Сохраненная конфигурация не найдена" });
    }

    await config.update({ data });
    res.json(config);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ошибка обновления сохраненной конфигурации" });
  }
};



// Удалить сохраненную конфигурацию
const deleteConfigData = async (req, res) => {
  const { id } = req.params;

  try {
    const config = await Configs.findByPk(id);

    if (!config) {
      return res.status(404).json({ error: "Сохраненная конфигурация не найдена" });
    }

    await config.destroy();
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ошибка удаления сохраненной конфигурации" });
  }
};



// Получить конфигурацию по ID
const getConfigById = async (req, res) => {
  const { id  } = req.params;
  try {
    const config = await Configs.findByPk(id, {
      // where: { addonId }, // Ищем конфигурацию по addonId
    });

    if (!config) return res.status(404).json({ error: "Config not found." });

    res.json(config);
  } catch (error) {
    console.error('Ошибка при получении конфигурации:', error);
    res.status(500).json({ error: "Failed to fetch config." });
  }
};




module.exports = {
  getConfigByAddonId,
  createConfigData,
  updateConfigData,
  deleteConfigData,
  getConfigById,
};

// controllers/configEventController.js

const db = require('../models');
const EventConfig = db.sequelize.models.EventConfig;



const createConfigEvent = async (req, res) => {
  try {
    const { config } = req.body;
    if (!config) {
      return res.status(400).json({ success: false, message: "Нет данных для сохранения" });
    }

    await EventConfig.create({ config });

    res.json({ success: true });
  } catch (error) {
    console.error("Ошибка сохранения конфига:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getConfigEvent = async (req, res) => {
  try {
    const configEvents = await EventConfig.findAll(); // Получаем все записи
    res.json(configEvents); // Возвращаем массив
} catch (error) {
    console.error("Ошибка загрузки конфигурации событий:", error);
    res.status(500).json({ success: false, error: error.message });
}
};


// Пример функции сохранения конфигурации
const saveConfigEvent = async (req, res) => {
  try {
    const { config } = req.body;

    if (!config) {
      return res.status(400).json({ success: false, message: "Нет данных для сохранения" });
    }

    // Ищем единственную запись в таблице (если она есть)
    let eventConfig = await EventConfig.findOne();
    // console.log("eventConfig найден и = ", eventConfig)

    if (eventConfig) {
      // Обновляем существующую запись
      await EventConfig.update(
        { config }, 
        { where: { id: eventConfig.id } } // Указываем, что обновлять именно эту запись
      );
      eventConfig = await EventConfig.findOne(); // Получаем обновленную запись
    } else {
      // Если записи нет, создаем новую
      eventConfig = await EventConfig.create({ config });
    }

    res.json(eventConfig);
  } catch (error) {
    console.error("Ошибка сохранения конфигурации:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};





module.exports = {
    getConfigEvent,
    createConfigEvent,
    saveConfigEvent
};

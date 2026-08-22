const db = require('../models');
const SimpleEvent = db.sequelize.models.SimpleEvent;


// Получение всех событий
const getSimpleEvents = async (req, res) => {
    try {
      const events = await SimpleEvent.findAll();
      res.json(events);
    } catch (error) {
      res.status(500).json({ error: "Ошибка получения событий" });
    }
  };
  
  // Создание события
  const createSimpleEvents = async (req, res) => {
    try {
      const event = await SimpleEvent.create(req.body);
      res.status(201).json(event);
    } catch (error) {
      res.status(500).json({ error: "Ошибка создания события" });
    }
  };
  
  // Удаление события
  const destroySimpleEvents = async (req, res) => {
    try {
      const { id } = req.params;
      await SimpleEvent.destroy({ where: { id } });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Ошибка удаления события" });
    }
  };

  const updateSimpleEvents = async (req, res) => {
    // console.log("Получен запрос на обновление:", req.params, req.body);

    try {
      const { id } = req.params; // Получаем ID события из URL
      const updateData = req.body; // Данные для обновления

      // console.log("приходит на обновление = ", updateData)
  
      // Находим событие по первичному ключу
      const event = await SimpleEvent.findByPk(id);
      if (!event) {
        return res.status(404).json({ error: "Событие не найдено" });
      }
  
      await event.update(updateData); // Обновляем только переданные поля

      // console.log("Обновленное событие:", event);
  
      res.json(event);

    } catch (error) {
      console.error("Ошибка обновления события:", error);
      res.status(500).json({ error: "Ошибка обновления события" });
    }
  };




  const getSimpleEventById = async (req, res) => {
    try {
      const { id } = req.params;
      const event = await SimpleEvent.findByPk(id);
      
      if (!event) {
        return res.status(404).json({ error: "Событие не найдено" });
      }
  
      res.json(event);
    } catch (error) {
      console.error("Ошибка получения события:", error);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  };
  


module.exports = { getSimpleEvents, createSimpleEvents, destroySimpleEvents, updateSimpleEvents, getSimpleEventById };
const db = require('../models');
const Manager = db.sequelize.models.Manager;

// Получение всех менеджеров
const allManagers = async (req, res) => {
    try {
      const managers = await Manager.findAll({
        attributes: ['id', 'name', 'phone', 'userId', 'viewAll'], // Указываем только нужные атрибуты
      });
      res.json(managers);
    } catch (error) {
      console.error('Ошибка при получении менеджеров:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };


  // Получение менеджера по ID
const getManagerById = async (req, res) => {
    try {
      const { id } = req.params;
      const manager = await Manager.findByPk(id);
      if (!manager) {
        return res.status(404).json({ error: 'Техник не найден' });
      }
      res.json(manager);
    } catch (error) {
      console.error('Ошибка при получении менеджера:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };

  

  // Обновление информации о менеджере
const updateManager = async (req, res) => {
    const { id } = req.params;
    const { phone, viewAll } = req.body; // Получаем только нужные данные для обновления
  
    try {
      const manager = await Manager.findByPk(id);
      if (!manager) {
        return res.status(404).json({ error: 'Техник не найден' });
      }
  
      manager.phone = phone || manager.phone; // Обновляем телефон, если он был передан
      manager.viewAll = viewAll !== undefined ? viewAll : manager.viewAll; // Обновляем viewAll, если он был передан
  
      await manager.save(); // Сохраняем изменения
      res.status(200).json(manager); // Отправляем обновленные данные
    } catch (error) {
      console.error('Ошибка при обновлении менеджера:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };
  

module.exports = { updateManager, allManagers, getManagerById };

// routes/holidayConfigsRoutes.js


const express = require('express');
const router = express.Router();
const { HolidayConfig } = require('../models');
const { Op } = require("sequelize");

// Получить все конфигурации
router.get('/', async (req, res) => {
  try {
    const configs = await HolidayConfig.findAll();
    res.json(configs);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка получения конфигураций' });
  }
});

// Создать новую конфигурацию
router.post('/', async (req, res) => {
  try {
    const { date, isHoliday, label } = req.body;
    const newConfig = await HolidayConfig.create({ date, isHoliday, label });
    res.status(201).json(newConfig);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка создания конфигурации' });
  }
});

// Обновить конфигурацию
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, isHoliday, label } = req.body;
    const config = await HolidayConfig.findByPk(id);
    if (!config) return res.status(404).json({ error: 'Конфигурация не найдена' });
    config.date = date;
    config.isHoliday = isHoliday;
    config.label = label;
    await config.save();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка обновления конфигурации' });
  }
});



// Удалить конфигурацию дня
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const config = await HolidayConfig.findByPk(id);
    if (!config) return res.status(404).json({ error: 'Конфигурация не найдена' });
    await config.destroy();
    res.json({ message: 'Конфигурация удалена' });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка удаления конфигурации' });
  }
});



// Удалить конфигурацию года
router.delete('/clear/:year', async (req, res) => {
  try {
    const { year } = req.params;
    if (!year || isNaN(year)) {
      return res.status(400).json({ error: "Неверный формат года" });
    }

    const startDate = new Date(`${year}-01-01`);
    const endDate = new Date(`${year}-12-31`);

    const deletedCount = await HolidayConfig.destroy({
      where: {
        date: { [Op.between]: [startDate, endDate] }
      }
    });

    res.json({ message: `Удалено ${deletedCount} выходных за ${year} год` });
  } catch (error) {
    console.error("Ошибка удаления выходных за год:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});







module.exports = router;


  
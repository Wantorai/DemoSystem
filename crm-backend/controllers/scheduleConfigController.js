const db = require('../models');
const ScheduleConfig = db.sequelize.models.ScheduleConfig;


// Получить конфигурацию графика
const getScheduleConfig = async (req, res) => {
    try {
        const config = await ScheduleConfig.findOne();
        res.json(config ? config.schedule_config : {});
    } catch (error) {
        res.status(500).json({ error: 'Ошибка при получении настроек' });
    }
};
  
  // Обновить конфигурацию графика
const setScheduleConfig = async (req, res) => {
    try {
        const { schedule_config } = req.body;
        let config = await ScheduleConfig.findOne();
        if (config) {
            config.schedule_config = schedule_config;
            await config.save();
        } else {
            config = await ScheduleConfig.create({ schedule_config });
        }
        res.json({ success: true, config });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка при сохранении настроек' });
    }
};


module.exports = { getScheduleConfig, setScheduleConfig };
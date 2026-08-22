const db = require('../models');
const StatusColor = db.sequelize.models.StatusColor;


// Получить все цвета
const getColors = async (req, res) => {
    const colors = await StatusColor.findAll();
    res.json(colors);
  };
  
  // Обновить или создать цвет
const setColor = async (req, res) => {
    const { status, color } = req.body;
  
    if (!status || !color) {
      return res.status(400).json({ message: 'Status и color обязательны' });
    }
  
    const [record, created] = await StatusColor.upsert({ status, color });
  
    res.json({ record, created });
  };


module.exports = { getColors, setColor };
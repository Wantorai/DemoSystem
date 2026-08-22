const db = require('../models');
const ColumnWidth = db.sequelize.models.ColumnWidth;



const getColumnWidths = async (req, res) => {
    try {
      const widths = await ColumnWidth.findAll();
      res.json(widths);
    } catch (error) {
      res.status(500).json({ message: 'Ошибка при получении данных', error });
    }
  };

  

// Обновление (или создание) настроек для нескольких колонок
const updateColumnWidth = async (req, res) => {
  let columnsData;
  
  // Если пришёл одиночный объект, оборачиваем его в массив
  if (req.body && req.body.columnName) {
    columnsData = [{
      columnName: req.body.columnName,
      width: Number(req.body.width),
      sortOrder: Number(req.body.sortOrder),
    }];
  }
  // Если пришёл объект без columnName, предполагаем, что это словарь
  else if (req.body && !Array.isArray(req.body)) {
    columnsData = Object.entries(req.body).map(([columnName, config]) => ({
      columnName,
      width: Number(config.width),
      sortOrder: Number(config.sortOrder),
    }));
  }
  // Если пришёл массив, оставляем его как есть (приводя значения к числам)
  else if (Array.isArray(req.body)) {
    columnsData = req.body.map(col => ({
      columnName: col.columnName,
      width: Number(col.width),
      sortOrder: Number(col.sortOrder),
    }));
  } else {
    return res.status(400).json({ message: 'Неверный формат данных' });
  }
  
  try {
    for (const col of columnsData) {
      await ColumnWidth.upsert({
        columnName: col.columnName,
        width: col.width,
        sortOrder: col.sortOrder,
      });
    }
    res.json({ message: 'Настройки колонок обновлены' });
  } catch (error) {
    res.status(500).json({ message: 'Ошибка при обновлении настроек колонок', error });
  }
};

  
  // const updateColumnWidth = async (req, res) => {
  //   const { columnName, width } = req.body;
  
  //   try {
  //     const [updated] = await ColumnWidth.upsert({ columnName, width });
  //     res.json({ message: 'Ширина колонки обновлена' });
  //   } catch (error) {
  //     res.status(500).json({ message: 'Ошибка при обновлении ширины', error });
  //   }
  // };





module.exports = {
    getColumnWidths,
    updateColumnWidth,
  };
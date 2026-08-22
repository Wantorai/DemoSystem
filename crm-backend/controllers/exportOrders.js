// controllers/exportOrders.js


const xlsx = require('node-xlsx');
const db = require('../models');
const MainModel = db.sequelize.models.MainModel;



const exportOrders = async (req, res) => {
  
  try {
    const { orders, headers: paramNames } = req.body;

    // console.log('Полученные данные для экспорта:', { orders, paramNames });

    if (!Array.isArray(orders) || !Array.isArray(paramNames)) {
      return res.status(400).json({ error: 'Missing orders or headers' });
    }

    // 1. Отфильтровать: пропускаем все, что начинается на "addon"
    const filteredParams = paramNames;

    // 2. Загрузить лейблы из БД для тех, что остались
    const configs = await MainModel.findAll({
      where: { paramName: filteredParams }
    });
    const labelMap = configs.reduce((acc, cfg) => {
      acc[cfg.paramName] = cfg.label;
      return acc;
    }, {});

    // 3. Собрать заголовки: хардкод для order_number
    const headerLabels = filteredParams.map(pn => {
      if (pn === 'order_number') return 'Номер заказа';
      return labelMap[pn] || pn; 
    });

    // 4. Собрать данные строк в том же порядке
    const data = [
      headerLabels,
      ...orders.map(order =>
        filteredParams.map(pn => {
          let val = order[pn] != null ? order[pn] : '';
          // здесь можно повторить любую конвертацию, если нужно
          return typeof val === 'object' ? JSON.stringify(val) : val;
        })
      )
    ];

    // 5. Генерим XLSX
    const buffer = xlsx.build([{ name: 'Orders', data }]);

    // 6. Отдаём файл
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="orders.xlsx"'
    );
    return res.send(buffer);

  } catch (err) {
    console.error('Ошибка экспорта Excel:', err);
    return res.status(500).json({ error: 'Export failed' });
  }
};

module.exports = exportOrders;



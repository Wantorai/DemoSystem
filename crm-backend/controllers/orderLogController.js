const db = require('../models');
const OrderLog = db.sequelize.models.OrderLog;



const createOrderLog = async (req, res) => {
  try {
    const { order_id, action, user, timestamp } = req.body;
    if (order_id) {
        const log = await OrderLog.create({ order_id, action, user, timestamp });
        res.status(201).json(log);
    } else {
      //console.log('order_id в createOrderLog не существует')
    }

  } catch (err) {
    console.error("Ошибка при создании orderLog:", err);
    res.status(500).json({ error: 'Ошибка при создании лога заказа' });
  }
};



const getOrderLogById = async (req, res) => {
  try {
    const { orderId } = req.params;
    const logs = await OrderLog.findAll({
      where: { order_id: orderId },
      order: [['timestamp', 'DESC']],
    });
    res.json(logs);
  } catch (err) {
    console.error('Ошибка при получении логов:', err);
    res.status(500).json({ error: 'Ошибка сервера при получении логов' });
  }
};



module.exports = { 
createOrderLog, getOrderLogById
};
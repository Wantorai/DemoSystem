const db = require('../models');
const Order = db.sequelize.models.Order;

/**
 * Создание (или добавление) комментариев к заказу.
 * Ожидается, что в теле запроса придёт orderId и комментарии:
 * {
 *   orderId: 123,
 *   comment1: "Комментарий 1",
 *   comment2: "Комментарий 2"
 * }
 */
const createOrderComments = async (req, res) => {
  try {
    const { orderId, comment1, comment2 } = req.body;
    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }
    order.comment1 = comment1;
    order.comment2 = comment2;
    await order.save();
    res.status(201).json(order);
  } catch (error) {
    console.error("Ошибка при создании комментариев заказа:", error);
    res.status(500).json({ error: 'Ошибка при создании комментариев заказа' });
  }
};

/**
 * Обновление комментариев для одного заказа.
 * id заказа передаётся через параметры URL,
 * а новые значения комментариев — в теле запроса:
 * {
 *   comment1: "Новый комментарий 1",
 *   comment2: "Новый комментарий 2"
 * }
 */
const updateOrderComments = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment1, comment2 } = req.body;
    const order = await Order.findByPk(id);
    if (!order) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }
    order.comment1 = comment1;
    order.comment2 = comment2;
    await order.save();
    res.json(order);
  } catch (error) {
    console.error("Ошибка при обновлении комментариев заказа:", error);
    res.status(500).json({ error: 'Ошибка при обновлении комментариев заказа' });
  }
};


/**
 * Удаление комментариев у заказа.
 * Фактически очищаем поля comment1 и comment2, устанавливая их в null.
 */
const destroyOrderComments = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findByPk(id);
    if (!order) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }
    order.comment1 = null;
    order.comment2 = null;
    await order.save();
    res.json({ message: 'Комментарии заказа удалены' });
  } catch (error) {
    console.error("Ошибка при удалении комментариев заказа:", error);
    res.status(500).json({ error: 'Ошибка при удалении комментариев заказа' });
  }
};


// Получаем комментарии к заказу
const getOrderComments = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findByPk(id, {
      attributes: ['id', 'comment1', 'comment2']
    });
    if (!order) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }
    res.json(order);
  } catch (error) {
    console.error("Ошибка при получении комментариев заказа:", error);
    res.status(500).json({ error: 'Ошибка при получении комментариев заказа' });
  }
};

module.exports = {
  createOrderComments,
  updateOrderComments,
  destroyOrderComments,
  getOrderComments
};

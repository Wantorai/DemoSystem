const db = require('../models');
const OrderStatus = db.sequelize.models.OrderStatus;


// Получить все статусы
const getAllStatuses = async (req, res) => {
  try {
    const statuses = await OrderStatus.findAll();
    res.json(statuses);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch statuses" });
  }
};

// Создать новый статус
const createStatus = async (req, res) => {
  try {
    const { name, key, defaultValue } = req.body;
    // Получаем максимальный sortOrder
    const maxSortOrderStatus = await OrderStatus.findOne({
      order: [['sortOrder', 'DESC']]
    });
    const sortOrder = maxSortOrderStatus ? maxSortOrderStatus.sortOrder + 1 : 1;
    
    const newStatus = await OrderStatus.create({ name, key, defaultValue, sortOrder });
    res.json(newStatus);
  } catch (error) {
    console.error("Ошибка при создании статуса:", error);
    res.status(500).json({ error: "Failed to create status" });
  }
};


// Удалить статус
const deleteStatus = async (req, res) => {
  try {
    const { id } = req.params;
    await OrderStatus.destroy({ where: { id } });
    res.status(200).send("Status deleted");
  } catch (error) {
    res.status(500).json({ error: "Failed to delete status" });
  }
};


// Обновить статус
const updateStatus = async (req, res) => {
  try {
      const { id } = req.params;
      const { key, name, defaultValue } = req.body; // Добавили sortOrder
      const status = await OrderStatus.findByPk(id);
      if (!status) {
          return res.status(404).json({ error: "Status not found" });
      }
      await status.update({ key, name, defaultValue });
      res.json(status);
  } catch (error) {
      console.error("Ошибка при обновлении статуса в updateStatus:", error);
      res.status(500).json({ error: "Failed to update status" });
  }
};



// Новый контроллер для пакетного обновления порядка статусов
const updateStatusesOrder = async (req, res) => {
  try {
    const { statuses } = req.body;
    for (const status of statuses) {
      // console.log("Обновляем статус id:", status.id, "новый sortOrder:", status.sortOrder);
      await OrderStatus.update(
        { sortOrder: Number(status.sortOrder) },
        { where: { id: status.id } }
      );
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Ошибка при обновлении порядка статусов:", error);
    res.status(500).json({ error: "Failed to update status order" });
  }
};






module.exports = { 
    getAllStatuses, 
    createStatus, 
    deleteStatus,
    updateStatus,
    updateStatusesOrder
};

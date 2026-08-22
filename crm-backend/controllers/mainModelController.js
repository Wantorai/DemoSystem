const db = require('../models');
const MainModel = db.sequelize.models.MainModel;

// Создание нового параметра
const createParamMainModel = async (req, res) => {
  try {
      const { paramName, label, type, source, width } = req.body;

      // Находим максимальный order в MainModel
      const lastParam = await MainModel.findOne({
          order: [['order', 'DESC']] // Сортируем по order по убыванию, берем первый
      });

      const newOrder = lastParam ? lastParam.order + 1 : 1; // Если есть параметры, берем макс +1, иначе 1

      // Создаем новый параметр с установленным order
      const model = await MainModel.create({ paramName, label, type, source, order: newOrder, width });

      res.status(201).json(model);
  } catch (error) {
      console.error('Ошибка при создании данных:', error);
      res.status(500).json({ error: 'Ошибка при создании данных' });
  }
};


// Обновление информации о параметре
const updateParamMainModel = async (req, res) => {
    try {
        const { id } = req.params;
        const { paramName, label, type, source, width} = req.body;
        const model = await MainModel.findByPk(id);
        if (model) {
          model.paramName = paramName;
          model.type = type; // Обновляем тип
          model.label = label;
          model.source = source;
          model.width = width;
          await model.save();
          res.json(model);
        } else {
          res.status(404).json({ error: 'Модель не найдена' });
        }
      } catch (error) {
        res.status(500).json({ error: 'Ошибка при обновлении данных' });
      }
};



// Обновление информации о параметре
const updateOrderParamMainModel = async (req, res) => {
  try {

      // console.log("Полученные данные для обновления:", req.body);

      const { data } = req.body; // Ожидаем массив объектов с `id` и `order`
      if (!Array.isArray(data)) {
          return res.status(400).json({ error: 'Некорректные данные' });
      }

      // Обновляем порядок для каждого параметра
      for (const item of data) {
          await MainModel.update({ order: item.order }, { where: { id: item.id } });
      }

      res.json({ message: 'Порядок успешно обновлен' });
  } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Ошибка при обновлении порядка' });
  }
};




// Удаление параметра
const destroyParamMainModel = async (req, res) => {
    try {
        const { id } = req.params;
        const model = await MainModel.findByPk(id);
        if (model) {
          await model.destroy();
          res.json({ message: 'Модель удалена' });
        } else {
          res.status(404).json({ error: 'Модель не найдена' });
        }
      } catch (error) {
        res.status(500).json({ error: 'Ошибка при удалении данных' });
      }
};

// Получить все параметры
const allParamsMainModel = async (req, res) => {
    try {
        const models = await MainModel.findAll({
          order: [['order', 'ASC']],
        });
        res.json(models);
      } catch (error) {
        res.status(500).json({ error: 'Ошибка при получении данных' });
      }
};



module.exports = { allParamsMainModel, createParamMainModel, updateParamMainModel, destroyParamMainModel, updateOrderParamMainModel };

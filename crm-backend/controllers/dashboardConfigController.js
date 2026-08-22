// controllers/dashboardConfigController.js

const db = require('../models');
const DashboardConfig = db.sequelize.models.DashboardConfig;
const Order = db.sequelize.models.Order;
const OrderConfig = db.sequelize.models.OrderConfig;
const Record = db.sequelize.models.Record;
const MainModel = db.sequelize.models.MainModel;
const Config = db.sequelize.models.Config;
const CRMConfig = db.sequelize.models.CRMConfig;
const { DataTypes } = require('sequelize');

const ALLOWED = {
    orders: {
    model: Order,
    meta: MainModel,
    metaNameKey: 'paramName',      
    metaLabelKey: 'label',    
  },
  orderConfigs: {
    model: OrderConfig,
    meta: Config,
    metaNameKey: 'paramName',     
    metaLabelKey: 'label', 
  },
  crm: {
    model: Record,
    meta: CRMConfig,
    metaNameKey: 'field',
    metaLabelKey: 'label',
  },
};


// Рекурсивная функция для JSONB‑путей (без массивных индексов и Date)
function collectPaths(obj, prefix = '') {
  let paths = [];

  if (Array.isArray(obj)) {
    // Обходим каждый элемент как «тот же уровень»
    obj.forEach(item => {
      paths = paths.concat(collectPaths(item, prefix));
    });
    return paths;
  }

  if (obj === null || typeof obj !== 'object' || obj instanceof Date) {
    // Примитив или Date: путь заканчивается здесь
    return prefix ? [prefix] : [];
  }

  // Обычный объект — углубляемся
  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    paths = paths.concat(collectPaths(val, path));
  }
  return paths;
}


  const getFields = async (req, res) => {
  const { endpoint } = req.params;
  const entry = ALLOWED[endpoint];
  if (!entry) {
    return res.status(400).json({ error: `Endpoint "${endpoint}" не поддерживается` });
  }

  const { model: Model, meta: MetaModel, metaNameKey, metaLabelKey } = entry;

  try {
    // 1) Определяем имя JSONB‑поля в модели (если есть)
    const jsonFieldEntry = Object.entries(Model.rawAttributes)
      .find(([, attr]) =>
        attr.type instanceof DataTypes.JSON ||
        attr.type instanceof DataTypes.JSONB
      );
    const jsonField = jsonFieldEntry ? jsonFieldEntry[0] : null;

    // 2) Вынимаем до 500 строк, чтобы собрать пути
    const items = await Model.findAll({
      limit: 500,
      attributes: Object.keys(Model.rawAttributes),
      raw: true,
    });

    // 3) Собираем все пути
    const pathsSet = new Set();
    for (const item of items) {
      for (const [col, val] of Object.entries(item)) {
        if (col === jsonField && val && typeof val === 'object') {
          // рекурсивно пробегаем JSONB
          collectPaths(val, col).forEach(p => pathsSet.add(p));
        } else {
          // простая колонка (в т.ч. DATEONLY, строка и т.п.)
          pathsSet.add(col);
        }
      }
    }
    const allPaths = Array.from(pathsSet);

    // 4) Подгружаем метаданные для подписи лейблов
    const metas = await MetaModel.findAll({
      attributes: [metaNameKey, metaLabelKey],
      raw: true,
    });
    const metaMap = Object.fromEntries(
      metas.map(m => [m[metaNameKey], m[metaLabelKey]])
    );

    // 5) Собираем итоговый массив { path, label }
    const result = allPaths.map(path => {
      // извлекаем «ключ» поля: если 'data.param17', берём 'param17', иначе сам path
      const parts = path.split('.');
      const key = parts.length > 1 ? parts[1] : parts[0];
      const label = metaMap[key] || key;
      return { path, label };
    });

    res.json(result);
  } catch (err) {
    console.error('getFields error:', err);
    res.status(500).json({ error: 'Не удалось собрать поля' });
  }
  }


  const listReports = async (req, res) => {
    try {
      const configs = await DashboardConfig.findAll({ order: [['createdAt','ASC']] });
      res.json(configs);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch configs' });
    }
  };

  const getReports = async (req, res) => {
    try {
      const cfg = await DashboardConfig.findByPk(req.params.id);
      if (!cfg) return res.status(404).json({ error: 'Not found' });
      res.json(cfg);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch config' });
    }
  };

  // const createReports = async (req, res) => {
  //   // console.log('POST /dashboard-configs body =', req.body);
  //   try {
  //     const { key, label, endpoint, dateField, valueFields, refNumber, color, order, refNumberWeek } = req.body;
  //     const cfg = await DashboardConfig.create({ key, label, endpoint, dateField, valueFields, refNumber, color, order, refNumberWeek });
  //     res.status(201).json(cfg);
  //   } catch (err) {
  //     res.status(400).json({ error: err.message });
  //   }
  // };

  // const updateReports = async (req, res) => {
  //   try {
  //     const { label, endpoint, dateField, valueFields, refNumber, color, order, refNumberWeek } = req.body;
  //     const cfg = await DashboardConfig.findByPk(req.params.id);
  //     if (!cfg) return res.status(404).json({ error: 'Not found' });
  //     await cfg.update({ label, endpoint, dateField, valueFields, refNumber, color, order, refNumberWeek });
  //     res.json(cfg);
  //   } catch (err) {
  //     res.status(400).json({ error: err.message });
  //   }
  // };



  const DEFAULT_COLOR = '#3182ce';

  const createReports = async (req, res) => {
    try {
      const {
        key, label, endpoint, dateField, valueFields,
        refNumber, color, order, refNumberWeek, series
      } = req.body;

      const safeColor = (color === undefined || color === null) ? DEFAULT_COLOR : color;

      // Если пришёл series — используем его, иначе строим из старого формата
      const finalSeries = Array.isArray(series) && series.length
        ? series.map((s, idx) => ({
            id: s.id || `s_${Date.now()}_${idx}`,
            label: s.label || `Серия ${idx + 1}`,
            dateField: s.dateField || dateField || '',
            valueFields: Array.isArray(s.valueFields) ? s.valueFields : []
          }))
        : [{
            id: `s_migr_${Date.now()}`,
            label: label || 'Серия',
            dateField: dateField || '',
            valueFields: Array.isArray(valueFields) ? valueFields : []
          }];

      const cfg = await DashboardConfig.create({
        key, label, endpoint,
        // оставляем top-level dateField/valueFields для обратной совместимости
        dateField: finalSeries[0].dateField || dateField || '',
        valueFields: (Array.isArray(valueFields) && valueFields.length) ? valueFields : (finalSeries[0].valueFields || []),
        refNumber, color: safeColor, order, refNumberWeek,
        series: finalSeries
      });

      res.status(201).json(cfg);
    } catch (err) {
      console.error('createReports error', err);
      res.status(400).json({ error: err.message });
    }
  };

  const updateReports = async (req, res) => {
    try {
      const id = req.params.id;
      const {
        key, label, endpoint, dateField, valueFields,
        refNumber, color, order, refNumberWeek, series
      } = req.body;

      const safeColor = (color === undefined || color === null) ? DEFAULT_COLOR : color;

      const finalSeries = Array.isArray(series) && series.length
        ? series.map((s, idx) => ({
            id: s.id || `s_${Date.now()}_${idx}`,
            label: s.label || `Серия ${idx + 1}`,
            dateField: s.dateField || dateField || '',
            valueFields: Array.isArray(s.valueFields) ? s.valueFields : []
          }))
        : [{
            id: `s_migr_${Date.now()}`,
            label: label || 'Серия',
            dateField: dateField || '',
            valueFields: Array.isArray(valueFields) ? valueFields : []
          }];

      const cfg = await DashboardConfig.findByPk(id);
      if (!cfg) return res.status(404).json({ error: 'Not found' });

      await cfg.update({
        key, label, endpoint,
        dateField: finalSeries[0].dateField || dateField || '',
        valueFields: (Array.isArray(valueFields) && valueFields.length) ? valueFields : (finalSeries[0].valueFields || []),
        refNumber, color: safeColor, order, refNumberWeek,
        series: finalSeries
      });

      res.json(cfg);
    } catch (err) {
      console.error('updateReports error', err);
      res.status(400).json({ error: err.message });
    }
  };



  const removeReports = async (req, res) => {
    try {
      const cfg = await DashboardConfig.findByPk(req.params.id);
      if (!cfg) return res.status(404).json({ error: 'Not found' });
      await cfg.destroy();
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete' });
    }
  };



module.exports = {getFields, listReports, getReports, createReports, updateReports, removeReports};


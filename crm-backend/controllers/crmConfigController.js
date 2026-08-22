const db = require('../models');
const { Sequelize } = require('../config/database');
const CRMConfig = db.sequelize.models.CRMConfig;
const Record = db.sequelize.models.Record;


// const getAllConfigs = async (req, res) => {
//   try {
//     const configs = await CRMConfig.findAll({ order: [['order', 'ASC']] });

//     // Получаем описание полей из модели Record
//     const recordAttributes = Record.getAttributes();

//     //console.log('recordAttributes:', recordAttributes);

//     // Уже существующие поля в конфигурации
//     const existingFields = configs.map(config => config.field);

//     // Фильтруем поля, которых ещё нет в конфиге
//     const newFields = Object.keys(recordAttributes).filter(field => !existingFields.includes(field));

//     if (newFields.length > 0) {
//       const newConfigs = newFields.map((field, index) => {
//         // const attr = recordAttributes[field];
//         // const type = attr?.type?.key || 'STRING';
//         //console.log('new field:', field, 'type:', recordAttributes[field]?.type?.key);

//         return {
//           field,
//           label: field,
//           width: '80px',
//           order: configs.length + index,
//           active: true,
//           activeInside: true,
//           type: recordAttributes[field]?.type?.key || null, // ← определяем тип
//         };
//       });

//       // console.log('newConfigs:', newConfigs);

//       // Добавляем новые поля в БД
//       await CRMConfig.bulkCreate(newConfigs);

//       // Обновлённая конфигурация
//       const updatedConfigs = await CRMConfig.findAll({ order: [['order', 'ASC']] });
//       return res.json(updatedConfigs);
//     }

//     // console.log('configs:', configs);

//     res.json(configs);

//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: 'Ошибка получения конфигурации' });
//   }
// };


const getAllConfigs = async (req, res) => {
  try {
    // 1) Загружаем все существующие конфиги
    let configs = await CRMConfig.findAll({ order: [['order', 'ASC']] });

    // 2) Получаем список атрибутов модели Record
    const recordAttributes = Record.getAttributes(); 

    // 3) Вычисляем, какие поля из Record ещё не завезены в CRMConfig
    const existingFields = configs.map(c => c.field);
    const newFields = Object.keys(recordAttributes).filter(
      field => !existingFields.includes(field)
    );

    if (newFields.length > 0) {
      // 4) Формируем для них конфиги с дефолтным value = ''
      const toCreate = newFields.map((field, idx) => ({
        field,
        label: field,
        width: '80px',
        order: configs.length + idx,
        active: true,
        activeInside: true,
        type: recordAttributes[field]?.type?.key || null,
        value: ''   // <— вот здесь обязательно заполняем default value
      }));

      // 5) Создаём их в базе
      await CRMConfig.bulkCreate(toCreate);

      // 6) Перезакачиваем уже обновлённый список
      configs = await CRMConfig.findAll({ order: [['order', 'ASC']] });
    }

    // 7) И возвращаем клиенту, включая поле value
    res.json(configs);
  } catch (error) {
    console.error('Ошибка получения конфигурации:', error);
    res.status(500).json({ error: 'Ошибка получения конфигурации' });
  }
};



const updateConfig = async (req, res) => {

  try {
    // 1) Сразу залогируем тело запроса:
    // console.log('🛠 POST /crm-config body:', JSON.stringify(req.body, null, 2));

    let { configs } = req.body;

    // 2) Проверка: configs должен быть массивом
    if (!Array.isArray(configs)) {
      console.error('❌ configs is not an array:', configs);
      return res.status(400).json({ error: 'configs должен быть массивом' });
    }

    // 3) Логируем длину до фильтрации
    // console.log('🔍 configs.length before filter =', configs.length);

    // 4) Очищаем от неверных записей
    const validConfigs = configs.filter(item => {
      const ok = item && typeof item.field === 'string' && item.field.trim() !== ''
                  && typeof item.label === 'string' && item.label.trim() !== '';
      if (!ok) console.warn('⚠️ drop invalid config item:', item);
      return ok;
    });

    // // 5) Логируем после фильтрации
    // console.log('✅ validConfigs.length after filter =', validConfigs.length);
    // console.log('📦 validConfigs =', JSON.stringify(validConfigs, null, 2));

    if (validConfigs.length === 0) {
      return res.status(400).json({ error: 'Нет валидных записей для сохранения' });
    }


    // 7) Сохраняем через upsert (Sequelize ≥6.4 поддерживает upsert для каждого объекта)
    await Promise.all(validConfigs.map(async (cfg) => {
      // Найдём текущую конфигурацию из БД, если есть
      const existing = await CRMConfig.findOne({ where: { id: cfg.id } });
    
      // Если есть старая — дополняем недостающие поля
      const merged = existing ? { ...existing.toJSON(), ...cfg } : cfg;
    
      // Сохраняем
      return CRMConfig.upsert(merged);
    }));

    // 8) Отдаём пользователю итог
    const updated = await CRMConfig.findAll({ order: [['order', 'ASC']] });
    return res.json(updated);

  } catch (error) {
    console.error('🔥 Error in saveConfigs:', error);
    return res.status(500).json({ error: 'Сервер упал при сохранении', details: error.message });
  }

};

const deleteCRMConfigField = async (req, res) => {
  try {
    const { field } = req.params;

    const deleted = await CRMConfig.destroy({ where: { field } });

    if (deleted) {
      return res.status(200).json({ message: 'Поле удалено' });
    } else {
      return res.status(404).json({ error: 'Поле не найдено' });
    }
  } catch (error) {
    console.error('Ошибка удаления поля конфигурации:', error);
    res.status(500).json({ error: 'Ошибка сервера при удалении' });
  }
};




const createConfig = async (req, res) => {
  try {
    const {
      field,
      label,
      width = '100px',
      order = 0,
      active = true,
      activeInside = true,
      type = null,
      value,               // новое обязательное поле — значение по умолчанию
    } = req.body;

    // Валидация
    if (!field || !label || value === undefined) {
      return res
        .status(400)
        .json({ error: 'Поле field, label и value обязательны' });
    }

    // Проверяем дубли по unique constraint
    const exists = await CRMConfig.findOne({ where: { field } });
    if (exists) {
      return res
        .status(409)
        .json({ error: `Параметр с field="${field}" уже существует` });
    }

    // 1) Создаём новую конфигурацию
    const config = await CRMConfig.create({
      field,
      label,
      width,
      order,
      active,
      activeInside,
      type,
      value,              // сохраняем значение в таблице конфигов
    });

    // 2) Для всех уже существующих записей «запихиваем» это поле в JSONB newParams
    //    Используем Postgres-конкатенацию JSONB: newParams || '{"key":"val"}'
    const defaultPair = { [field]: value };
    const jsonb = JSON.stringify(defaultPair);

    await Record.update(
      {
        newParams: Sequelize.literal(
          `COALESCE("newParams", '{}'::jsonb) || '${jsonb}'::jsonb`
        ),
      },
      { where: {} }
    );

    return res.status(201).json(config);
  } catch (error) {
    console.error('Ошибка создания CRMConfig:', error);
    return res
      .status(500)
      .json({ error: 'Не удалось создать параметр' });
  }
};







// const createConfig = async (req, res) => {
//   try {
//     const {
//       field,
//       label,
//       width = '100px',
//       order = 0,
//       active = true,
//       activeInside = true,
//       type = null
//     } = req.body;

//     // Валидация
//     if (!field || !label) {
//       return res.status(400).json({ error: 'Поле field и label обязательны' });
//     }

//     // Проверяем дубли по unique constraint
//     const exists = await CRMConfig.findOne({ where: { field } });
//     if (exists) {
//       return res.status(409).json({ error: `Параметр с field="${field}" уже существует` });
//     }

//     // Создаем новую запись
//     const config = await CRMConfig.create({
//       field, label, width, order, active, activeInside, type
//     });


//     return res.status(201).json(config);
//   } catch (error) {
//     console.error('Ошибка создания CRMConfig:', error);
//     return res.status(500).json({ error: 'Не удалось создать параметр' });
//   }
// }




module.exports = {getAllConfigs, updateConfig, deleteCRMConfigField, createConfig};
const db = require('../models');
const Record = db.sequelize.models.Record;
const Technic = db.sequelize.models.Technic;
const CRMConfig = db.sequelize.models.CRMConfig;
const StatusColorCRM = db.sequelize.models.StatusColorCRM;
const Tele2Api = require('../Tele2Api');
const { scheduleReminderJob } = require('../reminderScheduler');
const { Op } = require('sequelize');
const { processConsultProjectReadyReminders } = require('../workers/consultProjectReadyReminderWorker');

function ensureConsultFlag(newParams) {
  const next = { ...(newParams || {}) };
  const raw = next.iamConsult;
  const isEmpty = raw == null || String(raw).trim() === '';
  if (isEmpty) {
    next.iamConsult = '1';
  }
  return next;
}

function normalizeStatusText(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function isOrderOfferedStatusById(statusId) {
  if (!statusId) return false;
  const st = await StatusColorCRM.findByPk(statusId, { raw: true });
  if (!st) return false;
  if (String(st.key || '') === 'orderOffered') return true;
  const label = normalizeStatusText(st.label);
  return label.includes('заказ') && label.includes('принят');
}

function ensureOrderOfferedMetric(newParams) {
  const next = { ...(newParams || {}) };
  // В отчёте считаем сумму этого поля, поэтому фиксируем "1".
  next.OrderOffered = '1';
  return next;
}


const getAllRecords = async (req, res) => {
  try {
    const { technologistId } = req.query;

    // Заводим пустой where
    const whereClause = {};

    if (technologistId) {
      // 1) Ищем технолога по ID
      const technic = await Technic.findByPk(technologistId, {
        attributes: ['name']
      });

      // 2) Если не нашли — вернём пустой массив
      if (!technic) {
        return res.status(200).json([]);
      }

      // 3) Фильтруем записи по технику: поле Record.technicName === technic.name
      whereClause.technicName = technic.name;
    }

    // 4) Запрашиваем уже отфильтрованные (или все) записи
    const records = await Record.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      include: [{ model: db.StatusColorCRM, as: 'status' }],
    });

    res.json(records);

  } catch (error) {
    console.error('Ошибка получения записей:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};



const getRecordById = async (req, res) => {
  try {
    const record = await Record.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Запись не найдена' });
    // console.log("record = ", record)
    res.json(record);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка загрузки записи' });
  }
};


// Маршрут для приложения
const createRecord = async (req, res) => {

    // Отделяем clientPhone, а всё остальное в newData
    const { clientPhone, email, ...newData } = req.body;

    // if the client sent an empty string (''), turn it into null
    newData.email = email && email.trim() !== '' ? email : null;

    if (!clientPhone) {
      return res.status(400).json({ error: 'clientPhone обязателен' });
    }

    // console.log("newData = ", newData)

    try {
    // Собираем дефолтные параметры
    const configs = await CRMConfig.findAll({
      where: { active: true, value: { [Op.ne]: '' } },
    });
    const defaultNewParams = configs.reduce((acc, cfg) => {
      acc[cfg.field] = cfg.value;
      return acc;
    }, {});
    const normalizedDefaults = ensureConsultFlag(defaultNewParams);

    // Каждое новое обращение создаем отдельной консультацией, даже если телефон уже встречался.
    // Старые активные и архивные консультации остаются историей клиента и не перезаписываются.
    const record = await Record.create({
      clientPhone,
      ...newData,
      newParams: normalizedDefaults,
    });

    const statusIdNum = Number(record.statusId || newData.statusId || 0);
    if (await isOrderOfferedStatusById(statusIdNum)) {
      const current = String(record?.newParams?.OrderOffered || '').trim();
      if (current !== '1') {
        await record.update({ newParams: ensureOrderOfferedMetric(record.newParams) });
      }
    }

    res.status(201).json(record);

    // Планируем напоминание, если есть поле reminderCallDate
    if (record.reminderCallDate) {
      scheduleReminderJob(record);
    }
  } catch (err) {
    console.error('❌ Ошибка в upsertCrmRecord:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}




const updateRecordById = async (req, res) => {
  try {
    // console.log('Request body:', req.body);

    const record = await Record.findByPk(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }

    const payload = { ...(req.body || {}) };
    payload.newParams = ensureConsultFlag({ ...(record.newParams || {}), ...(payload.newParams || {}) });

    const oldDate = record.reminderCallDate;
    const prevStatusId = Number(record.statusId || 0);
    await record.update(payload);

    const nextStatusId = Number(record.statusId || 0);
    const statusChanged = prevStatusId !== nextStatusId;

    const toTele2Phone = (input) => {
      const digits = String(input || '').replace(/\D/g, '');
      if (!digits) return '';
      if (digits.length === 10) return `7${digits}`;
      if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
      return digits;
    };

    const hasRecordedCallsForPhone = async (phone) => {
      if (!phone) return false;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMinutes(endDate.getMinutes() - 1000000); // ~2 years

      const tele2 = new Tele2Api(null, null);
      await tele2.init();

      const [fromRes, toRes] = await Promise.allSettled([
        tele2.getCallRecords(startDate.toISOString(), endDate.toISOString(), {
          is_recorded: true,
          size: 1000,
          caller: phone,
          callType: 'OUTGOING',
        }),
        tele2.getCallRecords(startDate.toISOString(), endDate.toISOString(), {
          is_recorded: true,
          size: 1000,
          callee: phone,
          callType: 'SINGLE_CHANNEL',
        }),
      ]);

      const fromCalls = fromRes.status === 'fulfilled' && Array.isArray(fromRes.value) ? fromRes.value : [];
      const toCalls = toRes.status === 'fulfilled' && Array.isArray(toRes.value) ? toRes.value : [];

      // Если оба запроса упали — не меняем флаг, чтобы не получить ложные "нет звонков".
      if (fromRes.status === 'rejected' && toRes.status === 'rejected') {
        return null;
      }

      return [...fromCalls, ...toCalls].length > 0;
    };

    // Фиксируем флаг в БД только в момент входа в статус "Заказ принят".
    const isOrderOfferedNow = await isOrderOfferedStatusById(nextStatusId);

    if (statusChanged && isOrderOfferedNow) {
      const tele2Phone = toTele2Phone(record.clientPhone || record?.newParams?.param2 || '');
      if (!tele2Phone) {
        record.noCallsAtOrderAccepted = true;
        await record.save();
      } else {
        const hasCalls = await hasRecordedCallsForPhone(tele2Phone);
        if (hasCalls === null) {
          // Tele2 недоступен — сохраняем как было.
        } else {
          record.noCallsAtOrderAccepted = !hasCalls;
          await record.save();
        }
      }
    }

    // Метрика для дашборда: если консультация когда-либо получила статус "Заказ принят",
    // фиксируем newParams.OrderOffered = 1 и дальше не сбрасываем.
    if (isOrderOfferedNow) {
      const current = String(record?.newParams?.OrderOffered || '').trim();
      if (current !== '1') {
        const nextParams = ensureOrderOfferedMetric(record.newParams);
        await record.update({ newParams: nextParams });
      }
    }

    // Если дата изменилась — сбрасываем флаг
    if (req.body.reminderCallDate && req.body.reminderCallDate !== oldDate) {
      record.reminderSent = false;
      await record.save();
    }

    // (пере)планируем напоминание по только‑что сохранённому record
    scheduleReminderJob(record);

    res.json(record);
  } catch (error) {
    console.error('Ошибка при обновлении:', error);
    res.status(500).json({ error: 'Ошибка при обновлении записи' });
  }
};





// Удалить консультацию
const DeleteRecordById = async (req, res) => {
  try {
    const record = await Record.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Запись не найдена' });

    await record.destroy(req.body);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка при удалении записи' });
  }
};

const runProjectReadyReminderNow = async (req, res) => {
  try {
    const recordId = Number(req.body?.recordId || req.query?.recordId || 0);
    const forceRaw = req.body?.force ?? req.query?.force ?? false;
    const force = String(forceRaw).toLowerCase() === 'true' || forceRaw === true;
    const limit = Number(req.body?.limit || req.query?.limit || 100);

    const result = await processConsultProjectReadyReminders({
      limit,
      recordId: recordId > 0 ? recordId : undefined,
      force,
    });

    return res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error('Ошибка ручного запуска project-ready reminder:', error);
    return res.status(500).json({
      ok: false,
      error: 'Ошибка запуска напоминаний project-ready',
    });
  }
};





module.exports = {
  getAllRecords,
  getRecordById,
  updateRecordById,
  DeleteRecordById,
  createRecord,
  runProjectReadyReminderNow,
};

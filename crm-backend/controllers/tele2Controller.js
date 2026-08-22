const Tele2Api = require('../Tele2Api');


// Метод для получения статистики звонков за период.
const getStatistics = async (req, res) => {
  try {
    const { startDate, endDate, phone } = req.query;

    const tele2 = new Tele2Api(null, null);
    await tele2.init();

    const stats = await tele2.getCallStatistics(
      new Date(startDate),
      new Date(endDate),
      phone
    );

    res.json(stats);
  } catch (error) {
    console.error('Ошибка в getStatistics:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};


// Удобный метод для получения статистики звонков за последние три дня.
const getLastThreeDaysStats = async (req, res) => {
  try {
    const tele2 = new Tele2Api(null, null);
    await tele2.init();

    const stats = await tele2.getStatisticsLastThreeDays();
    res.json(stats);
  } catch (error) {
    console.error('Ошибка в getLastThreeDaysStats:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};



// Получить текущие звонки
const getCurrentCalls = async (req, res) => {
  try {
    const tele2 = new Tele2Api(null, null);
    await tele2.init();
    const calls = await tele2.getCurrentCalls();
    res.json(calls);
  } catch (error) {
    console.error('Ошибка в getCurrentCalls:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Получить записи разговоров
const getCallRecords = async (req, res) => {

  const { start, end, ...options } = req.query;

  if (!start || !end) {
    return res.status(400).json({ success: false, error: 'start и end обязательны' });
  }

  // console.log('req.query =', req.query)

  try {
    const tele2 = new Tele2Api(null, null);
    await tele2.init();
    const records = await tele2.getCallRecords(start, end, options);
    res.json(records);
  } catch (error) {
    console.error('Ошибка в getCallRecords:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Получить список сотрудников
const getEmployeeIds = async (req, res) => {
  try {
    const tele2 = new Tele2Api(null, null);
    await tele2.init();
    const employees = await tele2.getEmployeeIds();
    res.json(employees);
  } catch (error) {
    console.error('Ошибка в getEmployeeIds:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Совершить исходящий звонок
const callOutgoing = async (req, res) => {
  const { destination, source } = req.body;

  if (!destination || !source) {
    return res.status(400).json({ success: false, error: 'Нужны destination и source' });
  }

  try {
    const tele2 = new Tele2Api(null, null);
    await tele2.init();
    const result = await tele2.callOutgoing(destination, source);
    res.json(result);
  } catch (error) {
    console.error('Ошибка в callOutgoing:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Скачать файл записи разговора
const downloadRecording = async (req, res) => {
  const { filename } = req.query;

  if (!filename) {
    return res.status(400).json({ success: false, error: 'Нужен параметр filename' });
  }

  try {
    const tele2 = new Tele2Api(null, null);
    await tele2.init();
    const fileBuffer = await tele2.fetchRecordingFile(filename);

    if (!fileBuffer) {
      return res.status(404).json({ success: false, error: 'Файл не найден или ошибка при получении' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(fileBuffer);
  } catch (error) {
    console.error('Ошибка в downloadRecording:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};
// Для CRM: получить все звонки по номеру (без Telegram-бота)
const getCallsByPhoneCRM = async (req, res) => {
  const { phone } = req.query;
  const rawPhone = String(phone || '');
  const normalizedPhone = rawPhone.trim().replace(/\D/g, '');
  const requestedPeriodIndex = Number.parseInt(String(req.query?.periodIndex ?? '0'), 10);
  const periodIndex =
    Number.isFinite(requestedPeriodIndex) && requestedPeriodIndex >= 0
      ? Math.min(requestedPeriodIndex, 19)
      : 0;
  if (!normalizedPhone) return res.status(400).json({ error: 'phone is required' });

  try {
    const { start, end } = getSixMonthWindow(periodIndex);
    const tele2 = new Tele2Api(null, null);
    await tele2.init();

    const [callRecordsFromResult, callRecordsToResult] = await Promise.allSettled([
      tele2.getCallRecords(start, end, {
        is_recorded: true,
        size: 1000,
        caller: normalizedPhone,
        callType: 'OUTGOING',
      }),
      tele2.getCallRecords(start, end, {
        is_recorded: true,
        size: 1000,
        callee: normalizedPhone,
        callType: 'SINGLE_CHANNEL',
      }),
    ]);

    const callRecordsFrom =
      callRecordsFromResult.status === 'fulfilled' && Array.isArray(callRecordsFromResult.value)
        ? callRecordsFromResult.value
        : [];
    const callRecordsTo =
      callRecordsToResult.status === 'fulfilled' && Array.isArray(callRecordsToResult.value)
        ? callRecordsToResult.value
        : [];

    const fromFailed = callRecordsFromResult.status === 'rejected';
    const toFailed = callRecordsToResult.status === 'rejected';
    const fromStatus = fromFailed ? callRecordsFromResult.reason?.response?.status : null;
    const toStatus = toFailed ? callRecordsToResult.reason?.response?.status : null;

    if (callRecordsFromResult.status === 'rejected' || callRecordsToResult.status === 'rejected') {
      const fromBody =
        callRecordsFromResult.status === 'rejected'
          ? String(
              callRecordsFromResult.reason?.response?.data?.message ||
              callRecordsFromResult.reason?.response?.data?.error ||
              callRecordsFromResult.reason?.response?.data ||
              callRecordsFromResult.reason?.message ||
              'unknown',
            ).slice(0, 1000)
          : null;
      const toBody =
        callRecordsToResult.status === 'rejected'
          ? String(
              callRecordsToResult.reason?.response?.data?.message ||
              callRecordsToResult.reason?.response?.data?.error ||
              callRecordsToResult.reason?.response?.data ||
              callRecordsToResult.reason?.message ||
              'unknown',
            ).slice(0, 1000)
          : null;
      console.warn('[Tele2][getCallsByPhoneCRM] partial-failure', {
        phone: rawPhone,
        normalizedPhone,
        periodIndex,
        start,
        end,
        fromStatus,
        toStatus,
        fromOk: callRecordsFrom.length,
        toOk: callRecordsTo.length,
        fromBody,
        toBody,
      });
    }

    if (fromFailed && toFailed) {
      return res.status(502).json({
        error: 'tele2_source_error',
        message: 'Оба запроса к источнику звонков завершились ошибкой',
        phone: normalizedPhone,
      });
    }

    const uniq = new Map();
    for (const rec of [...callRecordsFrom, ...callRecordsTo]) {
      if (rec?.uuid && !uniq.has(rec.uuid)) uniq.set(rec.uuid, rec);
    }

    res.setHeader('X-Calls-Period-Index', String(periodIndex));
    res.setHeader('X-Calls-Period-Start', start);
    res.setHeader('X-Calls-Period-End', end);
    return res.json(Array.from(uniq.values()));
  } catch (err) {
    const status = err?.response?.status || null;
    const message = err?.message || 'Unknown error';
    const responseBody = String(
      err?.response?.data?.message || err?.response?.data?.error || err?.response?.data || '',
    ).slice(0, 1000);
    console.error('[Tele2][getCallsByPhoneCRM] fail', { phone: rawPhone, normalizedPhone, status, message, responseBody });
    return res.status(502).json({
      error: 'tele2_source_error',
      message: 'Ошибка источника звонков',
    });
  }
};

function shiftUtcMonths(date, months) {
  const shifted = new Date(date);
  const originalDay = shifted.getUTCDate();
  shifted.setUTCDate(1);
  shifted.setUTCMonth(shifted.getUTCMonth() + months);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0),
  ).getUTCDate();
  shifted.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return shifted;
}

function getSixMonthWindow(periodIndex = 0) {
  const now = new Date();
  const endDate = shiftUtcMonths(now, -(periodIndex * 6));
  const startDate = shiftUtcMonths(now, -((periodIndex + 1) * 6));
  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}

// Для CRM: получить запись разговора для inline-проигрывания
const getRecordMpegCRM = async (req, res) => {
  try {
    const { filename } = req.params;
    const tele2 = new Tele2Api(null, null);
    await tele2.init();

    const audioBuffer = await tele2.fetchRecordingFile(filename);
    if (!audioBuffer) return res.status(404).send('Файл не найден');

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `inline; filename="${filename}.mp3"`);
    return res.send(audioBuffer);
  } catch (err) {
    console.error('Ошибка при получении записи:', err);
    return res.status(500).send('Ошибка при получении записи');
  }
};

module.exports = {
  getStatistics,
  getLastThreeDaysStats,
  getCurrentCalls,
  getCallRecords,
  getEmployeeIds,
  callOutgoing,
  downloadRecording,
  getCallsByPhoneCRM,
  getRecordMpegCRM,
};

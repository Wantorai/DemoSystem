const express = require('express');
const router = express.Router();
const { getStatistics, getLastThreeDaysStats, getCurrentCalls, getCallRecords, getEmployeeIds, callOutgoing, downloadRecording } = require('../controllers/tele2Controller');



// 📊 Статистика
router.get('/statistics', getStatistics);
router.get('/statistics/last-three-days', getLastThreeDaysStats);

// 📞 Мониторинг звонков
router.get('/current-calls', getCurrentCalls);

// 📁 Записи звонков
router.get('/call-records', getCallRecords);

// 👥 Сотрудники
router.get('/employees', getEmployeeIds);

// ☎️ Исходящий звонок
router.post('/call-outgoing', callOutgoing);

// 🎧 Загрузка записи
router.get('/download-recording', downloadRecording);


module.exports = router;

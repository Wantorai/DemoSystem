const express = require('express');
const router = express.Router();
const {
  getAllRecords,
  getRecordById,
  updateRecordById,
  DeleteRecordById,
  createRecord,
  runProjectReadyReminderNow,
} = require('../controllers/crmController');

// Получить все заявки
router.get('/crm', getAllRecords);

// Получить заявку по ID
router.get('/crm/:id', getRecordById);

// Обновить заявку по ID
router.put('/crm/:id', updateRecordById);

// Создать заявку
router.post('/crm', createRecord);

// Ручной прогон напоминаний "проект не готов"
router.post('/crm/project-ready-reminders/run', runProjectReadyReminderNow);

// Удалить заявку по ID
router.delete('/crm/:id', DeleteRecordById);

module.exports = router;

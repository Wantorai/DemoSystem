const express = require('express');
const router = express.Router();
const { restoreBackup, restoreTemplate, getBackups, createBackup, createTemplateBackup, getTemplates } = require('../api/restoreBackup');



router.post('/admin', createBackup); // Создать обычный бэкап
router.post('/admin/templates', createTemplateBackup); // Создать шаблонный бэкап
router.put('/admin', restoreBackup);                 // Восстановить бэкап
router.put('/admin/templates', restoreTemplate);     // Восстановить шаблон
router.get('/admin', getBackups); // Получить список бэкапов
router.get('/admin/templates', getTemplates); // Получить список шаблонов

module.exports = router;

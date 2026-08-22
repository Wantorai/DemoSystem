const express = require('express');
const router = express.Router();
const { createInfoSource, updateInfoSource, deleteInfoSource, allInfoSources, getInfoSourceById } = require('../controllers/infoSourceController');

// Получить тип оплаты по ID
router.get('/infoSources/:id', getInfoSourceById);

// POST /api/infoSources - Создать 
router.post('/infoSources', createInfoSource);

// PUT /api/infoSources/:id - Обновить
router.put('/infoSources/:id', updateInfoSource);

// DELETE /api/infoSources/:id - Удалить
router.delete('/infoSources/:id', deleteInfoSource);

// GET api/infoSources - Получение списка всех
router.get('/infoSources', allInfoSources);

module.exports = router;

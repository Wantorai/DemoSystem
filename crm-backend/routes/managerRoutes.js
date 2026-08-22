const express = require('express');
const router = express.Router();
const { updateManager, allManagers, getManagerById } = require('../controllers/managerController');

// Получить менеджера по ID
router.get('/managers/:id', getManagerById);


// PUT /api/managers/:id - Обновить менеджера
router.put('/managers/:id', updateManager);


// GET api/managers - Получение списка всех менеджеров
router.get('/managers', allManagers);

module.exports = router;

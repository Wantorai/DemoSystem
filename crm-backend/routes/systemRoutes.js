const express = require('express');
const router = express.Router();
const { getSystemVersions, runUpdate, getUpdateLogs, getSystemInfo, getOrderErrors } = require('../controllers/systemController');

// Получить текущие и доступные версии
router.get('/version', getSystemVersions);

// Обновление компонентов
router.post('/update/:target', runUpdate);

// Получить историю обновлений
router.get('/logs', getUpdateLogs);


// Получить инфо о системе
router.get('/system-info', getSystemInfo);


// Получить ошибки заказов которые в хидере
router.get('/order-errors', getOrderErrors);


module.exports = router;

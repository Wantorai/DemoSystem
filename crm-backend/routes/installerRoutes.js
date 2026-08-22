const express = require('express');
const router = express.Router();
const { updateInstaller, allInstallers, getInstallerById } = require('../controllers/installerController');

// Получить установщика по ID
router.get('/installers/:id', getInstallerById);

// PUT /api/installers/:id - Обновить установщика
router.put('/installers/:id', updateInstaller);

// GET api/installers - Получение списка всех установщиков
router.get('/installers', allInstallers);

module.exports = router;

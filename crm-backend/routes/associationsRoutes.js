// routes/associationsRoutes.js
const express = require('express');
const router = express.Router();
const { getAllAddons, createAddon, getAddonById, updateAddon, deleteAddon } = require('../controllers/addonController'); // Импортируем контроллер для надстроек


router.get('/addons', getAllAddons); // Получить все надстройки
router.post('/addons', createAddon);  // Создать надстройку
router.get('/addons/:id', getAddonById);  // Получить надстройку по ID
router.put('/addons/:id', updateAddon);  // Обновить надстройку
router.delete('/addons/:id', deleteAddon);  // Удалить надстройку


// Экспортируем маршруты
module.exports = router;

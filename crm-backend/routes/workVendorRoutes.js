const express = require('express');
const router = express.Router();
const { createWorkVendor, updateWorkVendor, deleteWorkVendor, allWorkVendors, getWorkVendorById } = require('../controllers/workVendorController');

// Получить поставщика по ID
router.get('/workVendors/:id', getWorkVendorById);

// POST /api/workVendors - Создать поставщика
router.post('/workVendors', createWorkVendor);

// PUT /api/workVendors/:id - Обновить поставщика
router.put('/workVendors/:id', updateWorkVendor);

// DELETE /api/workVendors/:id - Удалить поставщика
router.delete('/workVendors/:id', deleteWorkVendor);

// GET api/workVendors - Получение списка всех поставщиков
router.get('/workVendors', allWorkVendors);

module.exports = router;

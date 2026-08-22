const express = require('express');
const router = express.Router();
const { createFurnVendor, updateFurnVendor, deleteFurnVendor, allFurnVendors, getFurnVendorById } = require('../controllers/furnVendorController');

// Получить поставщика по ID
router.get('/furnVendors/:id', getFurnVendorById);

// POST /api/furnVendors - Создать поставщика
router.post('/furnVendors', createFurnVendor);

// PUT /api/furnVendors/:id - Обновить поставщика
router.put('/furnVendors/:id', updateFurnVendor);

// DELETE /api/furnVendors/:id - Удалить поставщика
router.delete('/furnVendors/:id', deleteFurnVendor);

// GET api/furnVendors - Получение списка всех поставщиков
router.get('/furnVendors', allFurnVendors);

module.exports = router;

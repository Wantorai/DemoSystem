const express = require('express');
const router = express.Router();
const { createFasadVendor, updateFasadVendor, deleteFasadVendor, allFasadVendors, getFasadVendorById } = require('../controllers/fasadVendorController');

// Получить поставщика по ID
router.get('/fasadVendors/:id', getFasadVendorById);

// POST /api/fasadVendors - Создать поставщика
router.post('/fasadVendors', createFasadVendor);

// PUT /api/fasadVendors/:id - Обновить поставщика
router.put('/fasadVendors/:id', updateFasadVendor);

// DELETE /api/fasadVendors/:id - Удалить поставщика
router.delete('/fasadVendors/:id', deleteFasadVendor);

// GET api/fasadVendors - Получение списка всех поставщиков
router.get('/fasadVendors', allFasadVendors);

module.exports = router;

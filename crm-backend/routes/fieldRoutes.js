const express = require('express');
const router = express.Router();
const { createField, updateField, deleteField, allFields, getFieldById } = require('../controllers/fieldController');

// Получить поле по ID
router.get('/fields/:id', getFieldById);

// POST /api/fields - Создать поле
router.post('/fields', createField);

// PUT /api/fields/:id - Обновить поле
router.put('/fields/:id', updateField);

// DELETE /api/fields/:id - Удалить поле
router.delete('/fields/:id', deleteField);

// GET api/fields - Получение списка всех полей
router.get('/fields', allFields);

module.exports = router;

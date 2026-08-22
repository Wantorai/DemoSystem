const express = require('express');
const router = express.Router();
const { createPaylist, updatePaylist, deletePaylist, allPaylists, getPaylistById } = require('../controllers/paylistController');

// Получить тип оплаты по ID
router.get('/paylists/:id', getPaylistById);

// POST /api/paylists - Создать тип оплаты
router.post('/paylists', createPaylist);

// PUT /api/paylists/:id - Обновить тип оплаты
router.put('/paylists/:id', updatePaylist);

// DELETE /api/paylists/:id - Удалить тип оплаты
router.delete('/paylists/:id', deletePaylist);

// GET api/paylists - Получение списка всех типов оплат
router.get('/paylists', allPaylists);

module.exports = router;

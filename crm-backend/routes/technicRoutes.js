const express = require('express');
const router = express.Router();
const { updateTechnic, allTechnics, getTechnicById } = require('../controllers/technicController');

// Получить техника по ID
router.get('/technics/:id', getTechnicById);


// PUT /api/technics/:id - Обновить техника
router.put('/technics/:id', updateTechnic);


// GET api/technics - Получение списка всех техников
router.get('/technics', allTechnics);

module.exports = router;

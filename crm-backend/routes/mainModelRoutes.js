// routes/mainModelRoutes.js


const express = require('express');
const router = express.Router();
const { allParamsMainModel, createParamMainModel, updateParamMainModel, destroyParamMainModel, updateOrderParamMainModel } = require('../controllers/mainModelController');

// // Получить все параметры
router.get('/mainModel', allParamsMainModel);

// Создать параметр
router.post('/mainModel', createParamMainModel);

// Обновить параметр
router.put('/mainModel/:id', updateParamMainModel);

// Удалить параметр
router.delete('/mainModel/:id', destroyParamMainModel);

// Обновление порядка расположения
router.patch('/mainModel', updateOrderParamMainModel);


module.exports = router;


  
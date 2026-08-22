// routes/orderConfigRoutes.js


const express = require('express');
const router = express.Router();

const { 
    getAllOrderConfigs, 
    getOrderConfigById, 
    createOrderConfig, 
    updateOrderConfig, 
    deleteOrderConfig 
} = require('../controllers/orderConfigController');

// Получить все объекты конфигурации
router.get('/orderConfigs', getAllOrderConfigs);

// Получить объекты конфигурации по ID
router.get('/orderConfigs/:id', getOrderConfigById);

// Создать новый объекты конфигурации
router.post('/orderConfigs', createOrderConfig);

// Обновить объекты конфигурации
router.put('/orderConfigs/:id', updateOrderConfig);

// Удалить объекты конфигурации
router.delete('/orderConfigs/:id', deleteOrderConfig);

module.exports = router;


  
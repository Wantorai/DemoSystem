// routes/orderLogs.js


const express = require('express');
const router = express.Router();

const { 
    createOrderLog, getOrderLogById, 
} = require('../controllers/orderLogController');


// Создать новый лог заказа
router.post('/orderLogs', createOrderLog);

// Создать новый лог заказа
router.get('/orderLogs/order/:orderId', getOrderLogById);




module.exports = router;
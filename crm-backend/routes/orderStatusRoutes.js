// routes/orderStatusRoutes.js


const express = require('express');
const router = express.Router();

const { 
    getAllStatuses, 
    createStatus, 
    deleteStatus,
    updateStatus,
    updateStatusesOrder

} = require('../controllers/orderStatusController');

// Получить все статусы
router.get('/statuses', getAllStatuses);

// // Получить статус по ID
// router.get('/statuses/:id', getOrderById);

// Создать новый статус
router.post('/statuses', createStatus);

// Меняем порядок очередности
router.put('/statuses/order-update', updateStatusesOrder);

// Обновить статус
router.put('/statuses/:id', updateStatus);



// Удалить статус
router.delete('/statuses/:id', deleteStatus);





module.exports = router;


  
// routes/orderRoutes.js


const express = require('express');
const router = express.Router();

const { 
    getAllOrders, 
    getOrderById, 
    createOrder, 
    updateOrder, 
    deleteOrder,
    // getOrderNumber,
    createComments,
    archiveLinkedConsultByOrder,
    updateOrderDateIfBusy, 
    getAllOrdersForOrders, getAllOrdersForCrm
} = require('../controllers/orderController');

// Получить все заказы
router.get('/orders', getAllOrders);

// Получить все заказы для страницы заказов
router.get('/ordersfororders', getAllOrdersForOrders);

// Получить заказ по ID
router.get('/orders/:id', getOrderById);

// Создать новый заказ
router.post('/orders', createOrder);

// Обновить заказ
router.put('/orders/:id', updateOrder);

// Удалить заказ
router.delete('/orders/:id', deleteOrder);

// Маршрут для получения нового номера заказа
// router.get('/generate-order-number', getOrderNumber)

// Создать комментарии
router.post('/orders/:id/comments', createComments);

// Архивировать связанную консультацию по номеру телефона заказа
router.post('/orders/:id/archive-linked-consult', archiveLinkedConsultByOrder);

// Меняем дату установки если необходимо
router.patch('/ordersByInstaller', updateOrderDateIfBusy);


// Получить все заказы для страницы заказов
router.get('/ordersforcrm', getAllOrdersForCrm);


module.exports = router;


  

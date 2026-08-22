// routes/commentsRoutes.js


const express = require('express');
const router = express.Router();
const { getOrderComments, createOrderComments, updateOrderComments, destroyOrderComments } = require('../controllers/commentsController');


// Получить комментарии конкретного заказа по его id
router.get('/orders/:id/comments', getOrderComments);

// Добавить комментарии к заказу (или создать, если ещё не добавлены)
router.post('/orders/:id/comments', createOrderComments);

// Обновить комментарии конкретного заказа
router.put('/orders/:id/comments', updateOrderComments);

// "Удалить" комментарии заказа (например, очистить поля comment1 и comment2)
router.delete('/orders/:id/comments', destroyOrderComments);


module.exports = router;
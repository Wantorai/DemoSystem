// routes/deleteMessages.js
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/authMiddleware');

const controllers = require('../controllers/deleteMessagesController');

router.delete('/rooms/:roomId/messages/:messageId', requireAuth, controllers.deleteRoomMessage);
router.delete('/boss/chats/:chatId/messages/:messageId', requireAuth, controllers.deleteBossMessage);

module.exports = router;




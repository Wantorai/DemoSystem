// routes/roomMessagesRoutes.js
const express = require('express');
const router = express.Router();
const { getMessages, createMessage, forwardMessages, getMessagesForWeb, updateRoomMessage, toggleRoomMessageReaction, searchWebMessages } = require('../controllers/roomMessageController');
const authMiddleware = require('../middleware/authMiddleware');

// GET /admin/rooms/:roomId/messages
router.get('/admin/rooms/:roomId/messages', authMiddleware, getMessages);

// POST /admin/rooms/:roomId/messages
router.post('/admin/rooms/:roomId/messages', authMiddleware, createMessage);

// POST /admin/rooms/:roomId/messages/forward
router.post('/admin/rooms/:roomId/messages/forward', authMiddleware, forwardMessages);

// GET /web/messages/search
router.get('/web/messages/search', authMiddleware, searchWebMessages);

// GET /web/rooms/:roomId/messages
router.get('/web/rooms/:roomId/messages', authMiddleware, getMessagesForWeb);

// PUT /admin/rooms/:roomId/messages/:messageId
router.put('/admin/rooms/:roomId/messages/:messageId', authMiddleware, updateRoomMessage);

// POST /admin/rooms/:roomId/messages/:messageId/reaction
router.post('/admin/rooms/:roomId/messages/:messageId/reaction', authMiddleware, toggleRoomMessageReaction);

module.exports = router;
